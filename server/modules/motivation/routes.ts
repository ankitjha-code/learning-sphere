import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  users,
  memberships,
  activityEvents,
  achievements,
  challenges,
  challengeParticipants,
  accountabilityPartners,
  journalEntries,
  goals,
} from '../../db/schema';
import { type AppEnv, type AuthContext, requireAuth, isPlatformAdmin, rolesIn } from '../../lib/context';
import { body, query, idParam, emailSchema, pageQuery } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { notify } from '../../lib/notify';
import { rateLimit } from '../../lib/ratelimit';
import { computeStreak, totalXp, startOfWeek } from '../../lib/streak';
import { ACHIEVEMENTS, evaluateAchievements, levelFor, activityHistory, dayKey, weekdayOf, goalProgressFor } from './service';
import { ensureReminderSchedule } from './jobs';

/** Mounted at /api/motivation. */
export const motivationRoutes = new Hono<AppEnv>();

type Prefs = { showOnLeaderboard?: boolean; studyReminders?: boolean; restDays?: number[] };
const prefsOf = (auth: AuthContext) => auth.user.preferences as Prefs;

// ---------- Summary ----------

motivationRoutes.get('/summary', async (c) => {
  const auth = requireAuth(c);
  const uid = auth.user.id;
  const prefs = prefsOf(auth);
  const tz = auth.user.timezone;
  const restDays = prefs.restDays ?? [];
  await evaluateAchievements(uid, tz, restDays);
  void ensureReminderSchedule().catch(() => {});
  const [streak, xp, history, [{ weekXp }]] = await Promise.all([
    computeStreak(uid, tz, restDays),
    totalXp(uid),
    activityHistory(uid, tz),
    db
      .select({ weekXp: sql<number>`coalesce(sum(${activityEvents.xp}), 0)::int` })
      .from(activityEvents)
      .where(and(eq(activityEvents.userId, uid), gte(activityEvents.createdAt, startOfWeek()))),
  ]);
  // Heatmap: last 16 weeks (112 days), rest days marked so they read as neutral, never as missed.
  const days: { date: string; xp: number; minutes: number; active: boolean; rest: boolean }[] = [];
  const now = new Date();
  for (let i = 111; i >= 0; i--) {
    const key = dayKey(new Date(now.getTime() - i * 86400_000), tz);
    const e = history.byDay.get(key);
    days.push({ date: key, xp: e?.xp ?? 0, minutes: e?.minutes ?? 0, active: !!e && (e.xp > 0 || e.minutes > 0), rest: restDays.includes(weekdayOf(key)) });
  }
  let bestWeek: { weekOf: string; xp: number } | null = null;
  for (const [wk, v] of history.byWeek) if (v > 0 && (!bestWeek || v > bestWeek.xp)) bestWeek = { weekOf: wk, xp: v };
  let mostProblems: { date: string; count: number } | null = null;
  for (const [d, v] of history.byDay) if (v.problems > 0 && (!mostProblems || v.problems > mostProblems.count)) mostProblems = { date: d, count: v.problems };
  return c.json({
    streak: { current: streak.current, longest: streak.longest, activeToday: streak.activeToday, restDays },
    xp,
    weekXp,
    level: levelFor(xp),
    records: { bestWeek, longestStreak: streak.longest, mostProblemsInDay: mostProblems },
    heatmap: days,
    preferences: { showOnLeaderboard: !!prefs.showOnLeaderboard, studyReminders: !!prefs.studyReminders, restDays },
    xpPolicy: 'XP is earned only for substantive work and each action counts once. Missing a day never removes XP, and rest days you choose never break a streak.',
  });
});

// ---------- Achievements ----------

motivationRoutes.get('/achievements', async (c) => {
  const auth = requireAuth(c);
  const prefs = prefsOf(auth);
  const newly = await evaluateAchievements(auth.user.id, auth.user.timezone, prefs.restDays ?? []);
  const rows = await db.select().from(achievements).where(eq(achievements.userId, auth.user.id));
  const catalog = ACHIEVEMENTS.map((a) => {
    const got = rows.find((r) => r.key === a.key);
    return { ...a, earned: !!got, awardedAt: got?.awardedAt ?? null, isNew: newly.includes(a.key) };
  });
  // Achievements other modules award (portfolio, career...) are listed too.
  const extra = rows.filter((r) => !ACHIEVEMENTS.some((a) => a.key === r.key)).map((r) => ({ key: r.key, title: r.title, description: r.description ?? '', earned: true, awardedAt: r.awardedAt, isNew: false }));
  return c.json({ items: [...catalog, ...extra], newlyEarned: newly });
});

// ---------- Leaderboards (opt-in only) ----------

motivationRoutes.get('/leaderboard', async (c) => {
  const auth = requireAuth(c);
  const { scope } = query(c, z.object({ scope: z.enum(['global', 'org']).default('global') }));
  const uid = auth.user.id;
  const since = startOfWeek();
  const optedIn = sql`(${users.preferences}->>'showOnLeaderboard') = 'true'`;
  let orgId: string | null = null;
  const conds = [optedIn, eq(users.status, 'active')];
  if (scope === 'org') {
    orgId = auth.session.activeOrgId;
    if (!orgId) return c.json({ scope, org: null, entries: [], me: await myEntry(uid, since, !!prefsOf(auth).showOnLeaderboard), weekStart: since });
    conds.push(sql`${users.id} in (select ${memberships.userId} from ${memberships} where ${memberships.orgId} = ${orgId} and ${memberships.status} = 'active')`);
  }
  const weekXp = sql<number>`coalesce(sum(${activityEvents.xp}), 0)::int`;
  const rows = await db
    .select({ userId: users.id, name: users.name, avatarColor: users.avatarColor, isSample: users.isSample, xp: weekXp })
    .from(users)
    .innerJoin(activityEvents, and(eq(activityEvents.userId, users.id), gte(activityEvents.createdAt, since)))
    .where(and(...conds))
    .groupBy(users.id)
    .having(sql`sum(${activityEvents.xp}) > 0`)
    .orderBy(desc(weekXp), asc(users.name))
    .limit(50);
  const entries = rows.map((r, i) => ({ rank: i + 1, ...r, isMe: r.userId === uid }));
  const me = await myEntry(uid, since, !!prefsOf(auth).showOnLeaderboard);
  const mine = entries.find((e) => e.isMe);
  const org = orgId ? auth.memberships.find((m) => m.orgId === orgId) : null;
  return c.json({ scope, org: org ? { id: org.orgId, name: org.orgName } : null, entries, me: { ...me, rank: mine?.rank ?? null }, weekStart: since });
});

async function myEntry(uid: string, since: Date, optedIn: boolean) {
  const [{ xp }] = await db
    .select({ xp: sql<number>`coalesce(sum(${activityEvents.xp}), 0)::int` })
    .from(activityEvents)
    .where(and(eq(activityEvents.userId, uid), gte(activityEvents.createdAt, since)));
  return { xp, optedIn, rank: null as number | null };
}

// ---------- Challenges ----------

const METRIC_KINDS: Record<string, string[]> = {
  problems_solved: ['problem.solved'],
  topics_completed: ['topic.completed'],
};

async function progressFor(userIds: string[], ch: typeof challenges.$inferSelect) {
  if (!userIds.length) return new Map<string, number>();
  const window = and(inArray(activityEvents.userId, userIds), gte(activityEvents.createdAt, ch.startsAt), lte(activityEvents.createdAt, ch.endsAt));
  const value =
    ch.metric === 'minutes'
      ? sql<number>`coalesce(sum(${activityEvents.minutes}), 0)::int`
      : ch.metric === 'xp'
        ? sql<number>`coalesce(sum(${activityEvents.xp}), 0)::int`
        : sql<number>`count(*)::int`;
  const kinds = METRIC_KINDS[ch.metric];
  const rows = await db
    .select({ userId: activityEvents.userId, value })
    .from(activityEvents)
    .where(kinds ? and(window, inArray(activityEvents.kind, kinds)) : window)
    .groupBy(activityEvents.userId);
  return new Map(rows.map((r) => [r.userId, r.value]));
}

function visibleChallenges(auth: AuthContext) {
  const ids = auth.memberships.map((m) => m.orgId);
  return ids.length ? or(isNull(challenges.orgId), inArray(challenges.orgId, ids)) : isNull(challenges.orgId);
}

motivationRoutes.get('/challenges', async (c) => {
  const auth = requireAuth(c);
  const { status } = query(c, z.object({ status: z.enum(['current', 'upcoming', 'past', 'all']).default('all') }));
  const now = new Date();
  const conds = [visibleChallenges(auth)!];
  if (status === 'current') conds.push(and(lte(challenges.startsAt, now), gte(challenges.endsAt, now))!);
  if (status === 'upcoming') conds.push(gte(challenges.startsAt, now));
  if (status === 'past') conds.push(lte(challenges.endsAt, now));
  const rows = await db.select().from(challenges).where(and(...conds)).orderBy(desc(challenges.startsAt)).limit(100);
  const ids = rows.map((r) => r.id);
  const parts = ids.length ? await db.select().from(challengeParticipants).where(inArray(challengeParticipants.challengeId, ids)) : [];
  const orgNames = new Map(auth.memberships.map((m) => [m.orgId, m.orgName]));
  const items = await Promise.all(
    rows.map(async (ch) => {
      const mine = parts.find((p) => p.challengeId === ch.id && p.userId === auth.user.id);
      const myProgress = mine ? ((await progressFor([auth.user.id], ch)).get(auth.user.id) ?? 0) : null;
      return {
        ...ch,
        orgName: ch.orgId ? (orgNames.get(ch.orgId) ?? null) : null,
        participants: parts.filter((p) => p.challengeId === ch.id).length,
        joined: !!mine,
        teamName: mine?.teamName ?? null,
        myProgress,
        state: now < new Date(ch.startsAt) ? 'upcoming' : now > new Date(ch.endsAt) ? 'past' : 'current',
      };
    }),
  );
  return c.json({ items });
});

motivationRoutes.get('/challenges/:id', async (c) => {
  const auth = requireAuth(c);
  const [ch] = await db.select().from(challenges).where(and(eq(challenges.id, idParam(c)), visibleChallenges(auth)));
  if (!ch) throw notFound('Challenge');
  const parts = await db
    .select({ userId: challengeParticipants.userId, teamName: challengeParticipants.teamName, name: users.name, avatarColor: users.avatarColor, isSample: users.isSample, optedIn: sql<boolean>`(${users.preferences}->>'showOnLeaderboard') = 'true'` })
    .from(challengeParticipants)
    .innerJoin(users, eq(users.id, challengeParticipants.userId))
    .where(eq(challengeParticipants.challengeId, ch.id));
  const progress = await progressFor(parts.map((p) => p.userId), ch);
  const teams = new Map<string, { teamName: string; members: number; value: number }>();
  for (const p of parts) {
    if (!p.teamName) continue;
    const t = teams.get(p.teamName) ?? { teamName: p.teamName, members: 0, value: 0 };
    t.members++;
    t.value += progress.get(p.userId) ?? 0;
    teams.set(p.teamName, t);
  }
  const me = parts.find((p) => p.userId === auth.user.id);
  return c.json({
    challenge: ch,
    joined: !!me,
    teamName: me?.teamName ?? null,
    myProgress: me ? (progress.get(auth.user.id) ?? 0) : null,
    participants: parts.length,
    // Individual standings only list people who opted into leaderboards (and you).
    standings: parts
      .filter((p) => p.optedIn || p.userId === auth.user.id)
      .map((p) => ({ userId: p.userId, name: p.name, avatarColor: p.avatarColor, isSample: p.isSample, teamName: p.teamName, value: progress.get(p.userId) ?? 0, isMe: p.userId === auth.user.id }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 50),
    teams: [...teams.values()].sort((a, b) => b.value - a.value),
  });
});

motivationRoutes.post('/challenges', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({
      title: z.string().trim().min(4).max(120),
      description: z.string().trim().min(10).max(2000),
      kind: z.enum(['individual', 'team', 'season']).default('individual'),
      metric: z.enum(['problems_solved', 'topics_completed', 'minutes', 'xp']),
      target: z.number().int().min(1).max(100000),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      orgId: z.string().uuid().nullable().optional(),
    }),
  );
  if (input.orgId) {
    if (!rolesIn(auth, input.orgId).some((r) => ['org_admin', 'faculty', 'faculty_admin'].includes(r))) throw forbidden('You need an admin or faculty role in that organization.');
  } else if (!isPlatformAdmin(auth)) throw forbidden('Only platform admins create platform-wide challenges.');
  if (new Date(input.endsAt) <= new Date(input.startsAt)) throw badRequest('The end must be after the start.', { fields: { endsAt: 'The end must be after the start.' } });
  if (new Date(input.endsAt).getTime() - new Date(input.startsAt).getTime() > 120 * 86400_000) throw badRequest('Keep challenges under 4 months so they stay healthy and focused.');
  const [ch] = await db
    .insert(challenges)
    .values({ ...input, orgId: input.orgId ?? null, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), createdBy: auth.user.id })
    .returning();
  return c.json({ challenge: ch }, 201);
});

motivationRoutes.post('/challenges/:id/join', async (c) => {
  const auth = requireAuth(c);
  const [ch] = await db.select().from(challenges).where(and(eq(challenges.id, idParam(c)), visibleChallenges(auth)));
  if (!ch) throw notFound('Challenge');
  if (new Date(ch.endsAt) < new Date()) throw badRequest('This challenge has ended.');
  const { teamName } = await body(c, z.object({ teamName: z.string().trim().min(2).max(40).nullable().optional() }));
  if (ch.kind === 'team' && !teamName) throw badRequest('Team challenges need a team name. Join an existing team or start one.', { fields: { teamName: 'Enter a team name.' } });
  await db
    .insert(challengeParticipants)
    .values({ challengeId: ch.id, userId: auth.user.id, teamName: ch.kind === 'team' ? teamName! : null })
    .onConflictDoUpdate({ target: [challengeParticipants.challengeId, challengeParticipants.userId], set: { teamName: ch.kind === 'team' ? teamName! : null } });
  return c.json({ ok: true });
});

motivationRoutes.post('/challenges/:id/leave', async (c) => {
  const auth = requireAuth(c);
  await db.delete(challengeParticipants).where(and(eq(challengeParticipants.challengeId, idParam(c)), eq(challengeParticipants.userId, auth.user.id)));
  return c.json({ ok: true });
});

// ---------- Accountability partners ----------

async function partnerRow(auth: AuthContext, id: string) {
  const uid = auth.user.id;
  const [row] = await db
    .select()
    .from(accountabilityPartners)
    .where(and(eq(accountabilityPartners.id, id), or(eq(accountabilityPartners.userId, uid), eq(accountabilityPartners.partnerId, uid))));
  if (!row) throw notFound('Partner');
  return row;
}

motivationRoutes.get('/partners', async (c) => {
  const auth = requireAuth(c);
  const uid = auth.user.id;
  const rows = await db
    .select()
    .from(accountabilityPartners)
    .where(and(or(eq(accountabilityPartners.userId, uid), eq(accountabilityPartners.partnerId, uid)), inArray(accountabilityPartners.status, ['pending', 'active'])))
    .orderBy(desc(accountabilityPartners.createdAt));
  const otherIds = rows.map((r) => (r.userId === uid ? r.partnerId : r.userId));
  const people = otherIds.length ? await db.select({ id: users.id, name: users.name, avatarColor: users.avatarColor, isSample: users.isSample }).from(users).where(inArray(users.id, otherIds)) : [];
  return c.json({
    items: rows.map((r) => {
      const otherId = r.userId === uid ? r.partnerId : r.userId;
      return { id: r.id, status: r.status, direction: r.userId === uid ? 'outgoing' : 'incoming', createdAt: r.createdAt, partner: people.find((p) => p.id === otherId) ?? null };
    }),
  });
});

motivationRoutes.post('/partners', async (c) => {
  const auth = requireAuth(c);
  const { email } = await body(c, z.object({ email: emailSchema }));
  rateLimit(`motivation:partner:${auth.user.id}`, 10, 3600_000);
  const [other] = await db.select({ id: users.id, name: users.name }).from(users).where(and(sql`lower(${users.email}) = ${email}`, eq(users.status, 'active')));
  if (!other) throw notFound('Account with that email');
  if (other.id === auth.user.id) throw badRequest('Invite someone other than yourself.');
  const [existing] = await db
    .select()
    .from(accountabilityPartners)
    .where(
      or(
        and(eq(accountabilityPartners.userId, auth.user.id), eq(accountabilityPartners.partnerId, other.id)),
        and(eq(accountabilityPartners.userId, other.id), eq(accountabilityPartners.partnerId, auth.user.id)),
      ),
    );
  if (existing && existing.status !== 'ended') throw conflict('You already have an invite or partnership with this person.');
  let row;
  if (existing) {
    [row] = await db.update(accountabilityPartners).set({ userId: auth.user.id, partnerId: other.id, status: 'pending', createdAt: new Date() }).where(eq(accountabilityPartners.id, existing.id)).returning();
  } else {
    [row] = await db.insert(accountabilityPartners).values({ userId: auth.user.id, partnerId: other.id, status: 'pending' }).returning();
  }
  await notify(other.id, {
    type: 'motivation.partner.invite',
    category: 'learning',
    title: `${auth.user.name} invited you to be accountability partners`,
    body: 'Partners see each other’s weekly goal progress and streak only. Nothing else is shared.',
    link: '/app/goals?tab=partners',
  });
  return c.json({ partner: { id: row.id, status: row.status } }, 201);
});

motivationRoutes.post('/partners/:id/accept', async (c) => {
  const auth = requireAuth(c);
  const row = await partnerRow(auth, idParam(c));
  if (row.partnerId !== auth.user.id) throw forbidden('Only the invited person can accept.');
  if (row.status !== 'pending') throw badRequest('This invite is no longer pending.');
  await db.update(accountabilityPartners).set({ status: 'active' }).where(eq(accountabilityPartners.id, row.id));
  await notify(row.userId, { type: 'motivation.partner.accepted', category: 'learning', title: `${auth.user.name} is now your accountability partner`, link: '/app/goals?tab=partners' });
  return c.json({ ok: true });
});

motivationRoutes.post('/partners/:id/end', async (c) => {
  const auth = requireAuth(c);
  const row = await partnerRow(auth, idParam(c));
  await db.update(accountabilityPartners).set({ status: 'ended' }).where(eq(accountabilityPartners.id, row.id));
  return c.json({ ok: true });
});

/** What a partner may see: weekly goal progress and streak. Nothing else. */
motivationRoutes.get('/partners/:id/progress', async (c) => {
  const auth = requireAuth(c);
  const row = await partnerRow(auth, idParam(c));
  if (row.status !== 'active') throw forbidden('Progress is shared once the partnership is accepted.');
  const otherId = row.userId === auth.user.id ? row.partnerId : row.userId;
  const [other] = await db.select({ name: users.name, timezone: users.timezone, preferences: users.preferences }).from(users).where(eq(users.id, otherId));
  if (!other) throw notFound('Partner');
  const streak = await computeStreak(otherId, other.timezone, other.preferences.restDays ?? []);
  const weekly = await db.select().from(goals).where(and(eq(goals.userId, otherId), eq(goals.kind, 'weekly'), eq(goals.status, 'active')));
  const weeklyGoals = await Promise.all(
    weekly.map(async (g) => {
      const p = await goalProgressFor(otherId, g);
      return { title: g.title, value: p?.value ?? null, target: p?.target ?? null, met: p ? p.value >= p.target : null };
    }),
  );
  return c.json({ partner: { name: other.name }, streak: { current: streak.current, activeToday: streak.activeToday }, weeklyGoals });
});

// ---------- Reflection journal (private) ----------

const journalInput = z.object({
  kind: z.enum(['reflection', 'weekly_review', 'career']).default('reflection'),
  title: z.string().trim().max(160).nullable().optional(),
  body: z.string().trim().min(1, 'Write something first.').max(20000),
  mood: z.number().int().min(1).max(5).nullable().optional(),
});

motivationRoutes.get('/journal', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, pageQuery.extend({ kind: z.enum(['reflection', 'weekly_review', 'career']).optional() }));
  const conds = [eq(journalEntries.userId, auth.user.id)];
  if (q.kind) conds.push(eq(journalEntries.kind, q.kind));
  const where = and(...conds);
  const [items, [{ total }]] = await Promise.all([
    db.select().from(journalEntries).where(where).orderBy(desc(journalEntries.createdAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(journalEntries).where(where),
  ]);
  return c.json({ items, total, page: q.page, pageSize: q.pageSize });
});

motivationRoutes.post('/journal', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, journalInput);
  const [row] = await db.insert(journalEntries).values({ userId: auth.user.id, kind: input.kind, title: input.title ?? null, body: input.body, mood: input.mood ?? null }).returning();
  return c.json({ entry: row }, 201);
});

motivationRoutes.patch('/journal/:id', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({
      kind: z.enum(['reflection', 'weekly_review', 'career']).optional(),
      title: z.string().trim().max(160).nullable().optional(),
      body: z.string().trim().min(1).max(20000).optional(),
      mood: z.number().int().min(1).max(5).nullable().optional(),
    }),
  );
  const [row] = await db
    .update(journalEntries)
    .set({
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body ? { body: input.body } : {}),
      ...(input.mood !== undefined ? { mood: input.mood } : {}),
    })
    .where(and(eq(journalEntries.id, idParam(c)), eq(journalEntries.userId, auth.user.id)))
    .returning();
  if (!row) throw notFound('Journal entry');
  return c.json({ entry: row });
});

motivationRoutes.delete('/journal/:id', async (c) => {
  const auth = requireAuth(c);
  const res = await db
    .delete(journalEntries)
    .where(and(eq(journalEntries.id, idParam(c)), eq(journalEntries.userId, auth.user.id)))
    .returning({ id: journalEntries.id });
  if (!res.length) throw notFound('Journal entry');
  return c.json({ ok: true });
});

// ---------- Goal-completion analytics ----------

motivationRoutes.get('/analytics', async (c) => {
  const auth = requireAuth(c);
  const rows = await db.select().from(goals).where(eq(goals.userId, auth.user.id));
  const months: { month: string; created: number; done: number; dropped: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ month: d.toISOString().slice(0, 7), created: 0, done: 0, dropped: 0 });
  }
  const bucket = (d: Date | string | null) => (d ? months.find((m) => m.month === new Date(d).toISOString().slice(0, 7)) : undefined);
  const durations: number[] = [];
  for (const g of rows) {
    const created = bucket(g.createdAt);
    if (created) created.created++;
    if (g.status === 'done' && g.completedAt) {
      const b = bucket(g.completedAt);
      if (b) b.done++;
      durations.push((new Date(g.completedAt).getTime() - new Date(g.createdAt).getTime()) / 86400_000);
    }
    // Dropped goals have no timestamp of their own; they are counted in the month they were created.
    if (g.status === 'dropped' && created) created.dropped++;
  }
  const done = rows.filter((g) => g.status === 'done').length;
  const dropped = rows.filter((g) => g.status === 'dropped').length;
  const bySource = ['user', 'mentor', 'plan_generator'].map((s) => ({ source: s, total: rows.filter((g) => g.source === s).length, done: rows.filter((g) => g.source === s && g.status === 'done').length }));
  return c.json({
    months,
    totals: { total: rows.length, active: rows.filter((g) => g.status === 'active').length, done, dropped },
    completionRate: done + dropped ? done / (done + dropped) : null,
    averageDaysToComplete: durations.length ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : null,
    bySource,
    note: 'Dropping a goal is a healthy choice when priorities change. It is shown here only so you can plan realistic goals.',
  });
});
