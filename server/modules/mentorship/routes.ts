import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, gte, inArray, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  users,
  profiles,
  mentorProfiles,
  mentorships,
  mentorSessions,
  mentorFeedback,
  messages,
  goals,
  projects,
  projectMilestones,
  attempts,
  assessments,
  applications,
  skills,
  userBlocks,
  mentorshipAssignments,
  mentorshipNotes,
} from '../../db/schema';
import { type AppEnv, requireAuth, requirePlatformAdmin } from '../../lib/context';
import { body, query, idParam, pageQuery, patchSchema } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { recordActivity, XP } from '../../lib/activity';
import { rateLimit } from '../../lib/ratelimit';
import { computeSkillDna, addEvidence } from '../learning/skilldna';
import { evaluateAchievements, goalProgressFor } from '../motivation/service';
import { jitsiLink, JITSI_NOTE, loadAsParty, mentorAccess, type Sharing } from './service';

/** Mounted at /api/mentorship. */
export const mentorshipRoutes = new Hono<AppEnv>();

const NOT_SHARED = { shared: false as const };

const linkSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith('/app/') || /^https:\/\/[^\s]+$/.test(v), 'Use an in-app link (/app/...) or an https:// URL.');

const sharingSchema = z.object({ skillDna: z.boolean(), projects: z.boolean(), assessments: z.boolean(), applications: z.boolean() });

async function publicUser(id: string) {
  const [u] = await db
    .select({ id: users.id, name: users.name, avatarColor: users.avatarColor, isSample: users.isSample, headline: profiles.headline })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, id));
  return u ?? null;
}

async function isBlockedEitherWay(a: string, b: string) {
  const [row] = await db
    .select({ x: userBlocks.blockerId })
    .from(userBlocks)
    .where(or(and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)), and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a))))
    .limit(1);
  return !!row;
}

function requireActive(m: typeof mentorships.$inferSelect) {
  if (m.status !== 'active') throw badRequest('This mentorship is not active.');
}

function sessionForRole<T extends typeof mentorSessions.$inferSelect>(s: T, role: 'mentor' | 'mentee') {
  if (role === 'mentor') return s;
  // Mentor private notes never leave the server for the mentee.
  const { mentorPrivateNotes: _hidden, ...rest } = s;
  return rest;
}

// ---------- Mentor profile ----------

const profileInput = z.object({
  headline: z.string().trim().min(5).max(160),
  bio: z.string().trim().min(20, 'Write a few sentences about how you help mentees.').max(3000),
  expertise: z.array(z.string().trim().min(2).max(40)).min(1, 'Add at least one area of expertise.').max(15),
  yearsExperience: z.number().int().min(0).max(60).nullable().optional(),
  availability: z
    .array(z.object({ day: z.number().int().min(0).max(6), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }))
    .max(21)
    .refine((a) => a.every((s) => s.start < s.end), 'Each slot must end after it starts.'),
  maxMentees: z.number().int().min(1).max(30),
  acceptingRequests: z.boolean(),
});

mentorshipRoutes.get('/profile', async (c) => {
  const auth = requireAuth(c);
  const access = await mentorAccess(auth);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mentorships)
    .where(and(eq(mentorships.mentorId, auth.user.id), eq(mentorships.status, 'active')));
  return c.json({ profile: access.profile, workspaceUnlocked: access.active, orgMentor: access.orgMentor ? { orgId: access.orgMentor.orgId, orgName: access.orgMentor.orgName } : null, activeMentees: n });
});

mentorshipRoutes.put('/profile', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, profileInput);
  const access = await mentorAccess(auth);
  const expertise = [...new Set(input.expertise.map((e) => e.toLowerCase()))];
  let status = access.profile?.status ?? 'pending';
  // Org mentors (e.g. alumni programs) are active immediately; others wait for platform admin approval.
  if (access.orgMentor && status !== 'active') status = 'active';
  if (status === 'rejected') status = 'pending'; // updating a rejected profile resubmits it
  const values = {
    headline: input.headline,
    bio: input.bio,
    expertise,
    yearsExperience: input.yearsExperience ?? null,
    availability: input.availability,
    maxMentees: input.maxMentees,
    acceptingRequests: input.acceptingRequests,
    status,
    orgId: access.profile?.orgId ?? access.orgMentor?.orgId ?? null,
  };
  const [row] = await db
    .insert(mentorProfiles)
    .values({ userId: auth.user.id, ...values })
    .onConflictDoUpdate({ target: mentorProfiles.userId, set: values })
    .returning();
  if (!access.profile) await audit(c, { action: 'mentor.profile.created', targetType: 'user', targetId: auth.user.id, meta: { status } });
  return c.json({ profile: row }, access.profile ? 200 : 201);
});

mentorshipRoutes.get('/profiles/pending', async (c) => {
  requirePlatformAdmin(c);
  const rows = await db
    .select({ p: mentorProfiles, name: users.name, email: users.email })
    .from(mentorProfiles)
    .innerJoin(users, eq(users.id, mentorProfiles.userId))
    .where(eq(mentorProfiles.status, 'pending'))
    .orderBy(asc(mentorProfiles.createdAt));
  return c.json({ items: rows.map((r) => ({ ...r.p, name: r.name, email: r.email })), total: rows.length });
});

async function reviewProfile(c: Parameters<typeof requireAuth>[0], decision: 'active' | 'rejected') {
  requirePlatformAdmin(c);
  const userId = idParam(c, 'userId');
  const [row] = await db.update(mentorProfiles).set({ status: decision }).where(eq(mentorProfiles.userId, userId)).returning();
  if (!row) throw notFound('Mentor profile');
  await audit(c, { action: decision === 'active' ? 'mentor.profile.approved' : 'mentor.profile.rejected', targetType: 'user', targetId: userId });
  await notify(userId, {
    type: 'mentor.profile.reviewed',
    category: 'mentorship',
    title: decision === 'active' ? 'Your mentor profile is approved' : 'Your mentor profile was not approved',
    body: decision === 'active' ? 'Learners can now find you and send mentorship requests.' : 'You can update your profile and submit it again.',
    link: '/app/mentor/profile',
  });
  return c.json({ profile: row });
}

mentorshipRoutes.post('/profiles/:userId/approve', (c) => reviewProfile(c, 'active'));
mentorshipRoutes.post('/profiles/:userId/reject', (c) => reviewProfile(c, 'rejected'));

// ---------- Discovery ----------

mentorshipRoutes.get('/mentors', async (c) => {
  const auth = requireAuth(c);
  const q = query(
    c,
    pageQuery.extend({
      expertise: z.string().trim().max(40).optional(),
      day: z.coerce.number().int().min(0).max(6).optional(),
      accepting: z.enum(['true', 'false']).optional(),
    }),
  );
  const conds = [eq(mentorProfiles.status, 'active'), ne(mentorProfiles.userId, auth.user.id)];
  if (q.expertise) conds.push(sql`${q.expertise.toLowerCase()} = any(${mentorProfiles.expertise})`);
  if (q.accepting === 'true') conds.push(eq(mentorProfiles.acceptingRequests, true));
  if (q.day !== undefined) conds.push(sql`exists (select 1 from jsonb_array_elements(${mentorProfiles.availability}) s where (s->>'day')::int = ${q.day})`);
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(or(sql`${users.name} ilike ${like}`, sql`${mentorProfiles.headline} ilike ${like}`, sql`array_to_string(${mentorProfiles.expertise}, ',') ilike ${like}`)!);
  }
  const where = and(...conds);
  const activeCount = sql<number>`(select count(*)::int from mentorships m where m.mentor_id = "mentor_profiles"."user_id" and m.status = 'active')`;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        userId: mentorProfiles.userId,
        name: users.name,
        avatarColor: users.avatarColor,
        isSample: users.isSample,
        headline: mentorProfiles.headline,
        expertise: mentorProfiles.expertise,
        yearsExperience: mentorProfiles.yearsExperience,
        availability: mentorProfiles.availability,
        acceptingRequests: mentorProfiles.acceptingRequests,
        maxMentees: mentorProfiles.maxMentees,
        activeMentees: activeCount,
      })
      .from(mentorProfiles)
      .innerJoin(users, eq(users.id, mentorProfiles.userId))
      .where(where)
      .orderBy(desc(mentorProfiles.acceptingRequests), asc(users.name))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(mentorProfiles).innerJoin(users, eq(users.id, mentorProfiles.userId)).where(where),
  ]);
  const expertiseRows = await db.select({ e: sql<string>`unnest(${mentorProfiles.expertise})` }).from(mentorProfiles).where(eq(mentorProfiles.status, 'active'));
  return c.json({
    items: rows.map((r) => ({ ...r, hasCapacity: r.activeMentees < r.maxMentees })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    expertiseOptions: [...new Set(expertiseRows.map((r) => r.e))].sort(),
  });
});

mentorshipRoutes.get('/mentors/:userId', async (c) => {
  const auth = requireAuth(c);
  const userId = idParam(c, 'userId');
  const [row] = await db
    .select({ p: mentorProfiles, name: users.name, avatarColor: users.avatarColor, isSample: users.isSample })
    .from(mentorProfiles)
    .innerJoin(users, eq(users.id, mentorProfiles.userId))
    .where(and(eq(mentorProfiles.userId, userId), or(eq(mentorProfiles.status, 'active'), eq(mentorProfiles.userId, auth.user.id))));
  if (!row) throw notFound('Mentor');
  const [[{ activeMentees }], ratings, mine] = await Promise.all([
    db.select({ activeMentees: sql<number>`count(*)::int` }).from(mentorships).where(and(eq(mentorships.mentorId, userId), eq(mentorships.status, 'active'))),
    db
      .select({ avg: sql<number | null>`avg(${mentorFeedback.rating})::float`, n: sql<number>`count(${mentorFeedback.rating})::int` })
      .from(mentorFeedback)
      .innerJoin(mentorships, eq(mentorships.id, mentorFeedback.mentorshipId))
      .where(and(eq(mentorships.mentorId, userId), eq(mentorFeedback.kind, 'mentee_rating'))),
    db
      .select({ id: mentorships.id, status: mentorships.status })
      .from(mentorships)
      .where(and(eq(mentorships.mentorId, userId), eq(mentorships.menteeId, auth.user.id), inArray(mentorships.status, ['requested', 'active'])))
      .limit(1),
  ]);
  const { orgId: _org, status, ...p } = row.p;
  return c.json({
    mentor: { ...p, status, name: row.name, avatarColor: row.avatarColor, isSample: row.isSample, activeMentees, hasCapacity: activeMentees < p.maxMentees },
    rating: ratings[0]?.n ? { average: Math.round((ratings[0].avg ?? 0) * 10) / 10, count: ratings[0].n } : null,
    myMentorship: mine[0] ?? null,
    isSelf: userId === auth.user.id,
  });
});

// ---------- Requests ----------

mentorshipRoutes.post('/requests', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({
      mentorId: z.string().uuid(),
      message: z.string().trim().min(20, 'Tell the mentor a little about yourself and what you want help with.').max(2000),
      goalsSummary: z.string().trim().max(1000).optional(),
      sharing: sharingSchema,
    }),
  );
  rateLimit(`mentorship:request:${auth.user.id}`, 10, 86400_000);
  if (input.mentorId === auth.user.id) throw badRequest('You cannot request mentorship from yourself.');
  const [p] = await db.select().from(mentorProfiles).where(and(eq(mentorProfiles.userId, input.mentorId), eq(mentorProfiles.status, 'active')));
  if (!p) throw notFound('Mentor');
  if (!p.acceptingRequests || (await isBlockedEitherWay(auth.user.id, input.mentorId))) throw badRequest('This mentor is not accepting requests right now.');
  const [existing] = await db
    .select({ id: mentorships.id })
    .from(mentorships)
    .where(and(eq(mentorships.mentorId, input.mentorId), eq(mentorships.menteeId, auth.user.id), inArray(mentorships.status, ['requested', 'active'])));
  if (existing) throw conflict('You already have an open request or active mentorship with this mentor.', { mentorshipId: existing.id });
  const [m] = await db
    .insert(mentorships)
    .values({ mentorId: input.mentorId, menteeId: auth.user.id, orgId: p.orgId, status: 'requested', requestMessage: input.message, goalsSummary: input.goalsSummary ?? null, sharing: input.sharing })
    .returning();
  await audit(c, { action: 'mentorship.consent.granted', targetType: 'mentorship', targetId: m.id, meta: { sharing: input.sharing, mentorId: input.mentorId } });
  await notify(input.mentorId, {
    type: 'mentorship.requested',
    category: 'mentorship',
    title: `${auth.user.name} requested mentorship`,
    body: input.message.slice(0, 200),
    link: '/app/mentor',
  });
  return c.json({ mentorship: m }, 201);
});

mentorshipRoutes.get('/mine', async (c) => {
  const auth = requireAuth(c);
  const uid = auth.user.id;
  const rows = await db
    .select()
    .from(mentorships)
    .where(or(eq(mentorships.mentorId, uid), eq(mentorships.menteeId, uid)))
    .orderBy(desc(mentorships.createdAt));
  const ids = [...new Set(rows.flatMap((r) => [r.mentorId, r.menteeId]))];
  const people = ids.length
    ? await db
        .select({ id: users.id, name: users.name, avatarColor: users.avatarColor, isSample: users.isSample, headline: profiles.headline })
        .from(users)
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .where(inArray(users.id, ids))
    : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const shape = (r: (typeof rows)[number]) => ({
    id: r.id,
    status: r.status,
    createdAt: r.createdAt,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    goalsSummary: r.goalsSummary,
    mentor: byId.get(r.mentorId) ?? null,
    mentee: byId.get(r.menteeId) ?? null,
  });
  return c.json({ asMentee: rows.filter((r) => r.menteeId === uid).map(shape), asMentor: rows.filter((r) => r.mentorId === uid).map(shape) });
});

// ---------- Mentor workspace overview ----------

mentorshipRoutes.get('/workspace', async (c) => {
  const auth = requireAuth(c);
  const access = await mentorAccess(auth);
  const uid = auth.user.id;
  const rows = await db.select().from(mentorships).where(and(eq(mentorships.mentorId, uid), inArray(mentorships.status, ['requested', 'active']))).orderBy(desc(mentorships.createdAt));
  const ids = rows.map((r) => r.id);
  const [people, sessions, openAssignments] = await Promise.all([
    rows.length
      ? db
          .select({ id: users.id, name: users.name, avatarColor: users.avatarColor, isSample: users.isSample, headline: profiles.headline })
          .from(users)
          .leftJoin(profiles, eq(profiles.userId, users.id))
          .where(inArray(users.id, rows.map((r) => r.menteeId)))
      : Promise.resolve([]),
    ids.length ? db.select().from(mentorSessions).where(inArray(mentorSessions.mentorshipId, ids)).orderBy(asc(mentorSessions.scheduledAt)) : Promise.resolve([]),
    ids.length
      ? db
          .select({ mentorshipId: mentorshipAssignments.mentorshipId, n: sql<number>`count(*)::int` })
          .from(mentorshipAssignments)
          .where(and(inArray(mentorshipAssignments.mentorshipId, ids), eq(mentorshipAssignments.status, 'assigned')))
          .groupBy(mentorshipAssignments.mentorshipId)
      : Promise.resolve([]),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const now = Date.now();
  const menteeOf = (mid: string) => byId.get(rows.find((r) => r.id === mid)!.menteeId) ?? null;
  const upcoming = sessions.filter((s) => (s.status === 'scheduled' || s.status === 'requested') && new Date(s.scheduledAt).getTime() > now - 3600_000);
  const followUps = sessions.flatMap((s) => s.followUps.filter((f) => !f.done).map((f) => ({ ...f, sessionId: s.id, mentorshipId: s.mentorshipId, sessionAt: s.scheduledAt, mentee: menteeOf(s.mentorshipId) })));
  return c.json({
    profile: access.profile,
    workspaceUnlocked: access.active,
    requests: rows.filter((r) => r.status === 'requested').map((r) => ({ id: r.id, createdAt: r.createdAt, requestMessage: r.requestMessage, goalsSummary: r.goalsSummary, sharing: r.sharing, mentee: byId.get(r.menteeId) ?? null })),
    mentees: rows
      .filter((r) => r.status === 'active')
      .map((r) => ({
        id: r.id,
        startedAt: r.startedAt,
        sharing: r.sharing,
        mentee: byId.get(r.menteeId) ?? null,
        nextSession: upcoming.find((s) => s.mentorshipId === r.id && s.status === 'scheduled')?.scheduledAt ?? null,
        openAssignments: openAssignments.find((a) => a.mentorshipId === r.id)?.n ?? 0,
      })),
    upcomingSessions: upcoming.map((s) => ({ ...s, mentee: menteeOf(s.mentorshipId) })),
    followUps,
  });
});

mentorshipRoutes.get('/sessions', async (c) => {
  const auth = requireAuth(c);
  const { role } = query(c, z.object({ role: z.enum(['mentor', 'mentee', 'all']).default('all') }));
  const uid = auth.user.id;
  const cond = role === 'mentor' ? eq(mentorships.mentorId, uid) : role === 'mentee' ? eq(mentorships.menteeId, uid) : or(eq(mentorships.mentorId, uid), eq(mentorships.menteeId, uid));
  const rows = await db
    .select({ s: mentorSessions, m: mentorships })
    .from(mentorSessions)
    .innerJoin(mentorships, eq(mentorships.id, mentorSessions.mentorshipId))
    .where(cond)
    .orderBy(desc(mentorSessions.scheduledAt))
    .limit(200);
  const ids = [...new Set(rows.flatMap((r) => [r.m.mentorId, r.m.menteeId]))];
  const people = ids.length ? await db.select({ id: users.id, name: users.name, avatarColor: users.avatarColor }).from(users).where(inArray(users.id, ids)) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return c.json({
    items: rows.map((r) => {
      const myRole = r.m.mentorId === uid ? ('mentor' as const) : ('mentee' as const);
      return { ...sessionForRole(r.s, myRole), role: myRole, mentorshipStatus: r.m.status, with: byId.get(myRole === 'mentor' ? r.m.menteeId : r.m.mentorId) ?? null };
    }),
  });
});

// ---------- One mentorship ----------

mentorshipRoutes.get('/:id', async (c) => {
  const auth = requireAuth(c);
  const { m, role, otherId } = await loadAsParty(auth, idParam(c));
  const [other, me, sessionRows, assignmentRows, noteRows, feedbackRows, goalRows] = await Promise.all([
    publicUser(otherId),
    publicUser(auth.user.id),
    db.select().from(mentorSessions).where(eq(mentorSessions.mentorshipId, m.id)).orderBy(desc(mentorSessions.scheduledAt)),
    db.select().from(mentorshipAssignments).where(eq(mentorshipAssignments.mentorshipId, m.id)).orderBy(asc(mentorshipAssignments.status), desc(mentorshipAssignments.createdAt)),
    db
      .select()
      .from(mentorshipNotes)
      .where(
        and(
          eq(mentorshipNotes.mentorshipId, m.id),
          role === 'mentor' ? or(eq(mentorshipNotes.visibility, 'shared'), eq(mentorshipNotes.authorId, auth.user.id)) : eq(mentorshipNotes.visibility, 'shared'),
        ),
      )
      .orderBy(desc(mentorshipNotes.createdAt)),
    db.select().from(mentorFeedback).where(eq(mentorFeedback.mentorshipId, m.id)).orderBy(desc(mentorFeedback.createdAt)),
    db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, m.menteeId), eq(goals.source, 'mentor'), eq(goals.createdBy, m.mentorId)))
      .orderBy(asc(goals.status), desc(goals.createdAt)),
  ]);
  const goalsWithProgress = await Promise.all(goalRows.map(async (g) => ({ ...g, progress: g.status === 'active' ? await goalProgressFor(m.menteeId, g) : null })));
  const [unread] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.threadKey, `mentorship:${m.id}`), ne(messages.senderId, auth.user.id), sql`not (${auth.user.id}::uuid = any(${messages.readBy}))`));
  return c.json({
    mentorship: m,
    role,
    mentor: role === 'mentor' ? me : other,
    mentee: role === 'mentee' ? me : other,
    sessions: sessionRows.map((s) => sessionForRole(s, role)),
    assignments: assignmentRows,
    notes: noteRows,
    feedback: feedbackRows,
    goals: goalsWithProgress,
    unreadMessages: unread?.n ?? 0,
    jitsiNote: JITSI_NOTE,
  });
});

mentorshipRoutes.post('/:id/accept', async (c) => {
  const auth = requireAuth(c);
  const { m, role } = await loadAsParty(auth, idParam(c));
  if (role !== 'mentor') throw forbidden('Only the mentor can accept a request.');
  if (m.status !== 'requested') throw badRequest('This request is no longer pending.');
  const [p] = await db.select().from(mentorProfiles).where(eq(mentorProfiles.userId, auth.user.id));
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mentorships)
    .where(and(eq(mentorships.mentorId, auth.user.id), eq(mentorships.status, 'active')));
  const cap = p?.maxMentees ?? 5;
  if (n >= cap) throw conflict(`You are at your capacity of ${cap} active mentees. End a mentorship or raise your capacity in your mentor profile first.`);
  const [row] = await db.update(mentorships).set({ status: 'active', startedAt: new Date() }).where(eq(mentorships.id, m.id)).returning();
  await audit(c, { action: 'mentorship.accepted', targetType: 'mentorship', targetId: m.id });
  await notify(m.menteeId, { type: 'mentorship.accepted', category: 'mentorship', title: `${auth.user.name} accepted your mentorship request`, body: 'You can now schedule a first session and agree on goals.', link: `/app/mentors/m/${m.id}` });
  return c.json({ mentorship: row });
});

mentorshipRoutes.post('/:id/decline', async (c) => {
  const auth = requireAuth(c);
  const { m, role } = await loadAsParty(auth, idParam(c));
  const { reason } = await body(c, z.object({ reason: z.string().trim().max(500).optional() }));
  if (role !== 'mentor') throw forbidden('Only the mentor can decline a request.');
  if (m.status !== 'requested') throw badRequest('This request is no longer pending.');
  const [row] = await db.update(mentorships).set({ status: 'declined', endedAt: new Date() }).where(eq(mentorships.id, m.id)).returning();
  await notify(m.menteeId, {
    type: 'mentorship.declined',
    category: 'mentorship',
    title: `${auth.user.name} can't take on your request right now`,
    body: reason || 'Mentors have limited time. Other mentors may be a great fit.',
    link: '/app/mentors',
  });
  return c.json({ mentorship: row });
});

mentorshipRoutes.post('/:id/end', async (c) => {
  const auth = requireAuth(c);
  const { m, role, otherId } = await loadAsParty(auth, idParam(c));
  const { reason } = await body(c, z.object({ reason: z.string().trim().max(500).optional() }));
  if (m.status !== 'active' && m.status !== 'requested') throw badRequest('This mentorship has already ended.');
  const status = m.status === 'requested' ? (role === 'mentee' ? 'ended' : 'declined') : 'ended';
  const [row] = await db.update(mentorships).set({ status, endedAt: new Date() }).where(eq(mentorships.id, m.id)).returning();
  // Cancel future sessions; progress access ends with the mentorship.
  await db
    .update(mentorSessions)
    .set({ status: 'cancelled' })
    .where(and(eq(mentorSessions.mentorshipId, m.id), inArray(mentorSessions.status, ['requested', 'scheduled']), gte(mentorSessions.scheduledAt, new Date())));
  await audit(c, { action: 'mentorship.ended', targetType: 'mentorship', targetId: m.id, meta: { by: role, reason: reason ?? null } });
  await notify(otherId, {
    type: 'mentorship.ended',
    category: 'mentorship',
    title: m.status === 'requested' ? `${auth.user.name} withdrew a mentorship request` : `${auth.user.name} ended the mentorship`,
    body: reason || undefined,
    link: role === 'mentor' ? `/app/mentors/m/${m.id}` : `/app/mentor/mentees/${m.id}`,
  });
  return c.json({ mentorship: row });
});

mentorshipRoutes.patch('/:id/sharing', async (c) => {
  const auth = requireAuth(c);
  const { m, role } = await loadAsParty(auth, idParam(c));
  if (role !== 'mentee') throw forbidden('Only the mentee controls what is shared.');
  const input = await body(c, patchSchema(sharingSchema));
  const before = m.sharing as Sharing;
  const after: Sharing = { ...before, ...input };
  const [row] = await db.update(mentorships).set({ sharing: after }).where(eq(mentorships.id, m.id)).returning();
  await audit(c, { action: 'mentorship.consent.updated', targetType: 'mentorship', targetId: m.id, meta: { before, after } });
  return c.json({ mentorship: row });
});

/** Progress review: computed server-side and limited to what the mentee chose to share. */
mentorshipRoutes.get('/:id/progress', async (c) => {
  const auth = requireAuth(c);
  const { m, role } = await loadAsParty(auth, idParam(c));
  if (role !== 'mentor') throw forbidden('Progress review is for the mentor. Your own progress is on your dashboard.');
  if (m.status !== 'active') throw forbidden('Progress access ended with the mentorship.');
  const sharing = m.sharing as Sharing;
  const mid = m.menteeId;

  const skillDna = sharing.skillDna
    ? {
        shared: true as const,
        skills: (await computeSkillDna(mid))
          .filter((s) => s.state !== 'not_started')
          .map((s) => ({ slug: s.slug, name: s.name, category: s.category, state: s.state, mastery: s.mastery, confidence: s.confidence, verified: s.verified, evidenceCount: s.evidenceCount, lastEvidenceAt: s.lastEvidenceAt })),
      }
    : NOT_SHARED;

  const projectsData = sharing.projects
    ? {
        shared: true as const,
        projects: await db
          .select({
            id: projects.id,
            title: projects.title,
            category: projects.category,
            status: projects.status,
            visibility: projects.visibility,
            repoUrl: projects.repoUrl,
            demoUrl: projects.demoUrl,
            startedAt: projects.startedAt,
            completedAt: projects.completedAt,
            milestonesDone: sql<number>`(select count(*)::int from ${projectMilestones} pm where pm.project_id = "projects"."id" and pm.status = 'done')`,
            milestonesTotal: sql<number>`(select count(*)::int from ${projectMilestones} pm where pm.project_id = "projects"."id")`,
          })
          .from(projects)
          .where(and(eq(projects.ownerId, mid), ne(projects.status, 'archived')))
          .orderBy(desc(projects.updatedAt)),
      }
    : NOT_SHARED;

  const assessmentsData = sharing.assessments
    ? {
        shared: true as const,
        attempts: await db
          .select({ id: attempts.id, title: assessments.title, mode: assessments.mode, status: attempts.status, score: attempts.score, maxScore: attempts.maxScore, submittedAt: attempts.submittedAt })
          .from(attempts)
          .innerJoin(assessments, eq(assessments.id, attempts.assessmentId))
          .where(
            and(
              eq(attempts.userId, mid),
              // Only results the learner can already see; never employer screening results.
              inArray(assessments.mode, ['practice', 'diagnostic', 'classroom']),
              or(eq(attempts.status, 'released'), and(inArray(assessments.mode, ['practice', 'diagnostic']), eq(attempts.status, 'graded'))),
            ),
          )
          .orderBy(desc(attempts.submittedAt))
          .limit(50),
      }
    : NOT_SHARED;

  const applicationsData = sharing.applications
    ? {
        shared: true as const,
        applications: await db
          .select({ id: applications.id, company: applications.company, role: applications.role, status: applications.status, appliedAt: applications.appliedAt, nextActionAt: applications.nextActionAt, updatedAt: applications.updatedAt })
          .from(applications)
          .where(eq(applications.userId, mid))
          .orderBy(desc(applications.updatedAt))
          .limit(100),
      }
    : NOT_SHARED;

  return c.json({ sharing, skillDna, projects: projectsData, assessments: assessmentsData, applications: applicationsData });
});

// ---------- Goals set by the mentor (stored in the learner's goals) ----------

const goalInput = z.object({
  title: z.string().trim().min(2).max(200),
  kind: z.enum(['milestone', 'weekly', 'daily', 'career']).default('milestone'),
  targetDate: z.string().datetime().nullable().optional(),
  metric: z.object({ type: z.enum(['minutes', 'topics', 'problems', 'custom']), target: z.number().int().min(1).max(100000) }).nullable().optional(),
});

mentorshipRoutes.post('/:id/goals', async (c) => {
  const auth = requireAuth(c);
  const { m, role } = await loadAsParty(auth, idParam(c));
  if (role !== 'mentor') throw forbidden('Only the mentor can set mentorship goals. Add your own goals in Goals.');
  requireActive(m);
  const input = await body(c, goalInput);
  const [g] = await db
    .insert(goals)
    .values({ userId: m.menteeId, title: input.title, kind: input.kind, targetDate: input.targetDate ? new Date(input.targetDate) : null, metric: input.metric ?? null, source: 'mentor', createdBy: auth.user.id })
    .returning();
  await notify(m.menteeId, { type: 'mentorship.goal', category: 'mentorship', title: `${auth.user.name} added a goal: ${input.title}`, link: `/app/mentors/m/${m.id}` });
  return c.json({ goal: g }, 201);
});

mentorshipRoutes.patch('/:id/goals/:goalId', async (c) => {
  const auth = requireAuth(c);
  const { m, role } = await loadAsParty(auth, idParam(c));
  const goalId = idParam(c, 'goalId');
  if (role !== 'mentor') throw forbidden('Mentees update their goals from Goals.');
  requireActive(m);
  const input = await body(
    c,
    z.object({
      title: z.string().trim().min(2).max(200).optional(),
      kind: z.enum(['milestone', 'weekly', 'daily', 'career']).optional(),
      targetDate: z.string().datetime().nullable().optional(),
      metric: goalInput.shape.metric,
      status: z.enum(['active', 'done', 'dropped']).optional(),
    }),
  );
  const [g] = await db
    .update(goals)
    .set({
      ...(input.title ? { title: input.title } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.targetDate !== undefined ? { targetDate: input.targetDate ? new Date(input.targetDate) : null } : {}),
      ...(input.metric !== undefined ? { metric: input.metric } : {}),
      ...(input.status ? { status: input.status, completedAt: input.status === 'done' ? new Date() : null } : {}),
    })
    .where(and(eq(goals.id, goalId), eq(goals.userId, m.menteeId), eq(goals.source, 'mentor'), eq(goals.createdBy, auth.user.id)))
    .returning();
  if (!g) throw notFound('Goal');
  return c.json({ goal: g });
});

mentorshipRoutes.delete('/:id/goals/:goalId', async (c) => {
  const auth = requireAuth(c);
  const { m, role } = await loadAsParty(auth, idParam(c));
  const goalId = idParam(c, 'goalId');
  if (role !== 'mentor') throw forbidden('Only the mentor can remove a mentorship goal.');
  const res = await db
    .delete(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, m.menteeId), eq(goals.source, 'mentor'), eq(goals.createdBy, auth.user.id)))
    .returning({ id: goals.id });
  if (!res.length) throw notFound('Goal');
  return c.json({ ok: true });
});

// ---------- Assigned activities ----------

const assignmentInput = z.object({
  kind: z.enum(['topic', 'problem', 'project', 'resource', 'custom']).default('custom'),
  title: z.string().trim().min(2).max(200),
  link: linkSchema.nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

// No defaults here: a partial update must only contain what the caller sent.
const assignmentPatch = z.object({
  kind: z.enum(['topic', 'problem', 'project', 'resource', 'custom']).optional(),
  title: z.string().trim().min(2).max(200).optional(),
  link: linkSchema.nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  status: z.enum(['assigned', 'done', 'skipped']).optional(),
});

mentorshipRoutes.post('/:id/assignments', async (c) => {
  const auth = requireAuth(c);
  const { m, role } = await loadAsParty(auth, idParam(c));
  if (role !== 'mentor') throw forbidden('Only the mentor can assign activities.');
  requireActive(m);
  const input = await body(c, assignmentInput);
  const [a] = await db
    .insert(mentorshipAssignments)
    .values({ mentorshipId: m.id, createdBy: auth.user.id, kind: input.kind, title: input.title, link: input.link ?? null, note: input.note ?? null, dueAt: input.dueAt ? new Date(input.dueAt) : null })
    .returning();
  await notify(m.menteeId, { type: 'mentorship.assignment', category: 'mentorship', title: `New activity from ${auth.user.name}: ${input.title}`, link: `/app/mentors/m/${m.id}` });
  return c.json({ assignment: a }, 201);
});

mentorshipRoutes.patch('/:id/assignments/:aid', async (c) => {
  const auth = requireAuth(c);
  const { m, role, otherId } = await loadAsParty(auth, idParam(c));
  const aid = idParam(c, 'aid');
  requireActive(m);
  const input = await body(c, assignmentPatch);
  const [a] = await db.select().from(mentorshipAssignments).where(and(eq(mentorshipAssignments.id, aid), eq(mentorshipAssignments.mentorshipId, m.id)));
  if (!a) throw notFound('Activity');
  const patch: Partial<typeof mentorshipAssignments.$inferInsert> = {};
  if (input.status) {
    patch.status = input.status;
    patch.completedAt = input.status === 'done' ? new Date() : null;
  }
  if (role === 'mentor') {
    if (input.title) patch.title = input.title;
    if (input.kind) patch.kind = input.kind;
    if (input.link !== undefined) patch.link = input.link;
    if (input.note !== undefined) patch.note = input.note;
    if (input.dueAt !== undefined) patch.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  } else if (input.title || input.kind || input.link !== undefined || input.note !== undefined || input.dueAt !== undefined) {
    throw forbidden('Mentees can only mark activities done or skipped.');
  }
  if (!Object.keys(patch).length) return c.json({ assignment: a });
  const [row] = await db.update(mentorshipAssignments).set(patch).where(eq(mentorshipAssignments.id, aid)).returning();
  if (role === 'mentee' && input.status === 'done') {
    await notify(otherId, { type: 'mentorship.assignment.done', category: 'mentorship', title: `${auth.user.name} finished: ${a.title}`, link: `/app/mentor/mentees/${m.id}` });
  }
  return c.json({ assignment: row });
});

mentorshipRoutes.delete('/:id/assignments/:aid', async (c) => {
  const auth = requireAuth(c);
  const { m, role } = await loadAsParty(auth, idParam(c));
  if (role !== 'mentor') throw forbidden('Only the mentor can remove an activity.');
  const res = await db
    .delete(mentorshipAssignments)
    .where(and(eq(mentorshipAssignments.id, idParam(c, 'aid')), eq(mentorshipAssignments.mentorshipId, m.id)))
    .returning({ id: mentorshipAssignments.id });
  if (!res.length) throw notFound('Activity');
  return c.json({ ok: true });
});

// ---------- Sessions ----------

const sessionCreate = z.object({
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(180).default(30),
  agenda: z.string().trim().max(2000).nullable().optional(),
  meeting: z.enum(['jitsi', 'custom', 'none']).default('jitsi'),
  meetingUrl: z.string().trim().url().max(500).refine((u) => u.startsWith('https://'), 'Use an https:// link.').nullable().optional(),
});

mentorshipRoutes.post('/:id/sessions', async (c) => {
  const auth = requireAuth(c);
  const { m, role, otherId } = await loadAsParty(auth, idParam(c));
  requireActive(m);
  const input = await body(c, sessionCreate);
  const at = new Date(input.scheduledAt);
  if (at.getTime() < Date.now() - 30 * 86400_000 || at.getTime() > Date.now() + 365 * 86400_000) throw badRequest('Pick a time within the next year.', { fields: { scheduledAt: 'Pick a time within the next year.' } });
  if (input.meeting === 'custom' && !input.meetingUrl) throw badRequest('Add the meeting link.', { fields: { meetingUrl: 'Add the meeting link.' } });
  const meetingUrl = input.meeting === 'jitsi' ? jitsiLink() : input.meeting === 'custom' ? input.meetingUrl! : null;
  const [s] = await db
    .insert(mentorSessions)
    .values({ mentorshipId: m.id, scheduledAt: at, durationMinutes: input.durationMinutes, agenda: input.agenda ?? null, meetingUrl, status: role === 'mentor' ? 'scheduled' : 'requested' })
    .returning();
  await notify(otherId, {
    type: role === 'mentor' ? 'mentorship.session.scheduled' : 'mentorship.session.requested',
    category: 'mentorship',
    title: role === 'mentor' ? `${auth.user.name} scheduled a session` : `${auth.user.name} requested a session`,
    body: at.toUTCString(),
    link: role === 'mentor' ? `/app/mentors/m/${m.id}` : `/app/mentor/mentees/${m.id}`,
  });
  return c.json({ session: sessionForRole(s, role), jitsiNote: input.meeting === 'jitsi' ? JITSI_NOTE : null }, 201);
});

const followUpSchema = z.array(z.object({ id: z.string().min(1).max(40), text: z.string().trim().min(1).max(300), done: z.boolean() })).max(30);

mentorshipRoutes.patch('/:id/sessions/:sid', async (c) => {
  const auth = requireAuth(c);
  const { m, role, otherId } = await loadAsParty(auth, idParam(c));
  const sid = idParam(c, 'sid');
  const input = await body(
    c,
    z.object({
      status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
      scheduledAt: z.string().datetime().optional(),
      durationMinutes: z.number().int().min(15).max(180).optional(),
      agenda: z.string().trim().max(2000).nullable().optional(),
      meetingUrl: z.string().trim().url().max(500).refine((u) => u.startsWith('https://'), 'Use an https:// link.').nullable().optional(),
      regenerateJitsi: z.boolean().optional(),
      sharedNotes: z.string().max(10000).nullable().optional(),
      mentorPrivateNotes: z.string().max(10000).nullable().optional(),
      followUps: followUpSchema.optional(),
    }),
  );
  const [s] = await db.select().from(mentorSessions).where(and(eq(mentorSessions.id, sid), eq(mentorSessions.mentorshipId, m.id)));
  if (!s) throw notFound('Session');
  const patch: Partial<typeof mentorSessions.$inferInsert> = {};
  if (input.sharedNotes !== undefined) patch.sharedNotes = input.sharedNotes;
  if (input.agenda !== undefined) patch.agenda = input.agenda;
  if (role === 'mentor') {
    if (input.mentorPrivateNotes !== undefined) patch.mentorPrivateNotes = input.mentorPrivateNotes;
    if (input.followUps) patch.followUps = input.followUps;
    if (input.scheduledAt) patch.scheduledAt = new Date(input.scheduledAt);
    if (input.durationMinutes) patch.durationMinutes = input.durationMinutes;
    if (input.meetingUrl !== undefined) patch.meetingUrl = input.meetingUrl;
    if (input.regenerateJitsi) patch.meetingUrl = jitsiLink();
    if (input.status) patch.status = input.status;
  } else {
    if (input.mentorPrivateNotes !== undefined) throw forbidden('Private notes belong to the mentor.');
    if (input.scheduledAt || input.durationMinutes || input.meetingUrl !== undefined || input.regenerateJitsi) throw forbidden('Ask your mentor to reschedule, or cancel and request a new time.');
    if (input.status && input.status !== 'cancelled') throw forbidden('Only the mentor can confirm or complete a session.');
    if (input.status) patch.status = input.status;
    // Mentees may tick follow-ups done; they cannot add, edit or remove them.
    if (input.followUps) {
      const done = new Map(input.followUps.map((f) => [f.id, f.done]));
      patch.followUps = s.followUps.map((f) => (done.has(f.id) ? { ...f, done: done.get(f.id)! } : f));
    }
  }
  if (patch.status === 'completed') {
    if (s.status === 'cancelled') throw badRequest('A cancelled session cannot be completed.');
    if (new Date(patch.scheduledAt ?? s.scheduledAt).getTime() > Date.now() + 15 * 60_000) throw badRequest('A session can be marked completed once it has started.');
  }
  if (patch.status && patch.status !== 'completed' && s.status === 'completed') throw badRequest('This session is already completed.');
  if (patch.status || patch.scheduledAt || patch.sharedNotes !== undefined) requireActive(m);
  const [row] = Object.keys(patch).length ? await db.update(mentorSessions).set(patch).where(eq(mentorSessions.id, sid)).returning() : [s];

  if (patch.status === 'completed' && s.status !== 'completed') {
    // XP for both parties, once per session.
    for (const uid of [m.mentorId, m.menteeId]) {
      const ev = await recordActivity(uid, { kind: 'mentor.session', label: 'Completed a mentor session', xp: XP.mentorSession, minutes: s.durationMinutes, dedupeKey: `mentor-session:${s.id}`, link: uid === m.mentorId ? `/app/mentor/mentees/${m.id}` : `/app/mentors/m/${m.id}` });
      if (ev) await evaluateAchievements(uid);
    }
    await notify(m.menteeId, { type: 'mentorship.session.completed', category: 'mentorship', title: 'Session completed', body: 'Shared notes and follow-ups are on your mentorship page.', link: `/app/mentors/m/${m.id}` });
  } else if (patch.status && patch.status !== s.status) {
    await notify(otherId, {
      type: `mentorship.session.${patch.status}`,
      category: 'mentorship',
      title: patch.status === 'cancelled' ? `${auth.user.name} cancelled a session` : `${auth.user.name} confirmed a session`,
      body: new Date(row.scheduledAt).toUTCString(),
      link: role === 'mentor' ? `/app/mentors/m/${m.id}` : `/app/mentor/mentees/${m.id}`,
    });
  } else if (patch.scheduledAt && role === 'mentor') {
    await notify(otherId, { type: 'mentorship.session.rescheduled', category: 'mentorship', title: `${auth.user.name} rescheduled a session`, body: patch.scheduledAt.toUTCString(), link: `/app/mentors/m/${m.id}` });
  }
  return c.json({ session: sessionForRole(row, role) });
});

// ---------- Notes ----------

mentorshipRoutes.post('/:id/notes', async (c) => {
  const auth = requireAuth(c);
  const { m, role } = await loadAsParty(auth, idParam(c));
  const input = await body(c, z.object({ body: z.string().trim().min(1).max(10000), visibility: z.enum(['shared', 'mentor_private']).default('shared') }));
  if (input.visibility === 'mentor_private' && role !== 'mentor') throw forbidden('Only mentors can write private notes.');
  if (m.status !== 'active' && input.visibility === 'shared') throw badRequest('This mentorship is not active.');
  const [n] = await db.insert(mentorshipNotes).values({ mentorshipId: m.id, authorId: auth.user.id, visibility: input.visibility, body: input.body }).returning();
  return c.json({ note: n }, 201);
});

mentorshipRoutes.patch('/:id/notes/:nid', async (c) => {
  const auth = requireAuth(c);
  const { m } = await loadAsParty(auth, idParam(c));
  const input = await body(c, z.object({ body: z.string().trim().min(1).max(10000) }));
  const [n] = await db
    .update(mentorshipNotes)
    .set({ body: input.body, updatedAt: new Date() })
    .where(and(eq(mentorshipNotes.id, idParam(c, 'nid')), eq(mentorshipNotes.mentorshipId, m.id), eq(mentorshipNotes.authorId, auth.user.id)))
    .returning();
  if (!n) throw notFound('Note');
  return c.json({ note: n });
});

mentorshipRoutes.delete('/:id/notes/:nid', async (c) => {
  const auth = requireAuth(c);
  const { m } = await loadAsParty(auth, idParam(c));
  const res = await db
    .delete(mentorshipNotes)
    .where(and(eq(mentorshipNotes.id, idParam(c, 'nid')), eq(mentorshipNotes.mentorshipId, m.id), eq(mentorshipNotes.authorId, auth.user.id)))
    .returning({ id: mentorshipNotes.id });
  if (!res.length) throw notFound('Note');
  return c.json({ ok: true });
});

// ---------- Messages (only the two parties) ----------

mentorshipRoutes.get('/:id/messages', async (c) => {
  const auth = requireAuth(c);
  const { m } = await loadAsParty(auth, idParam(c));
  const key = `mentorship:${m.id}`;
  const rows = await db.select().from(messages).where(eq(messages.threadKey, key)).orderBy(desc(messages.createdAt)).limit(200);
  await db
    .update(messages)
    .set({ readBy: sql`array_append(${messages.readBy}, ${auth.user.id}::uuid)` })
    .where(and(eq(messages.threadKey, key), ne(messages.senderId, auth.user.id), sql`not (${auth.user.id}::uuid = any(${messages.readBy}))`));
  return c.json({ items: rows.reverse().map((r) => ({ id: r.id, senderId: r.senderId, body: r.body, createdAt: r.createdAt, mine: r.senderId === auth.user.id })) });
});

mentorshipRoutes.post('/:id/messages', async (c) => {
  const auth = requireAuth(c);
  const { m, role, otherId } = await loadAsParty(auth, idParam(c));
  requireActive(m);
  const input = await body(c, z.object({ body: z.string().trim().min(1).max(4000) }));
  rateLimit(`mentorship:msg:${auth.user.id}`, 60, 3600_000);
  const [row] = await db.insert(messages).values({ threadKey: `mentorship:${m.id}`, orgId: m.orgId, senderId: auth.user.id, body: input.body, readBy: [auth.user.id] }).returning();
  await notify(otherId, {
    type: 'mentorship.message',
    category: 'mentorship',
    title: `New message from ${auth.user.name}`,
    body: input.body.slice(0, 140),
    link: role === 'mentor' ? `/app/mentors/m/${m.id}` : `/app/mentor/mentees/${m.id}`,
    email: false,
  });
  return c.json({ message: { id: row.id, senderId: row.senderId, body: row.body, createdAt: row.createdAt, mine: true } }, 201);
});

// ---------- Feedback & mentor assessment ----------

mentorshipRoutes.post('/:id/feedback', async (c) => {
  const auth = requireAuth(c);
  const { m, role, otherId } = await loadAsParty(auth, idParam(c));
  if (m.status !== 'active' && m.status !== 'ended') throw badRequest('Feedback opens once the mentorship has started.');
  const input = await body(c, z.object({ body: z.string().trim().min(5).max(5000), rating: z.number().int().min(1).max(5).nullable().optional() }));
  if (role === 'mentee' && !input.rating) throw badRequest('Add a rating from 1 to 5.', { fields: { rating: 'Add a rating from 1 to 5.' } });
  const kind = role === 'mentor' ? 'progress_review' : 'mentee_rating';
  const [f] = await db.insert(mentorFeedback).values({ mentorshipId: m.id, authorId: auth.user.id, kind, body: input.body, rating: input.rating ?? null }).returning();
  await notify(otherId, {
    type: 'mentorship.feedback',
    category: 'mentorship',
    title: role === 'mentor' ? `${auth.user.name} wrote a progress review` : `${auth.user.name} left feedback on your mentoring`,
    link: role === 'mentor' ? `/app/mentors/m/${m.id}` : `/app/mentor/mentees/${m.id}`,
  });
  return c.json({ feedback: f }, 201);
});

/** A mentor's view of a skill. Recorded as unverified evidence: it is an opinion, not a graded artifact. */
mentorshipRoutes.post('/:id/skill-assessment', async (c) => {
  const auth = requireAuth(c);
  const { m, role } = await loadAsParty(auth, idParam(c));
  if (role !== 'mentor') throw forbidden('Only the mentor can record a skill assessment.');
  requireActive(m);
  const input = await body(c, z.object({ skillSlug: z.string().trim().min(1).max(80), level: z.number().int().min(1).max(4), note: z.string().trim().max(1000).optional() }));
  const [skill] = await db.select({ id: skills.id, name: skills.name }).from(skills).where(eq(skills.slug, input.skillSlug));
  if (!skill) throw notFound('Skill');
  await addEvidence({
    userId: m.menteeId,
    skillId: skill.id,
    source: 'mentor',
    sourceType: 'mentor_assessment',
    sourceId: m.id,
    score: input.level / 4,
    weight: 0.8,
    verified: false,
    note: input.note ? `Mentor ${auth.user.name}: ${input.note}` : `Mentor assessment by ${auth.user.name}`,
  });
  await notify(m.menteeId, { type: 'mentorship.skill', category: 'mentorship', title: `${auth.user.name} assessed your ${skill.name}`, body: 'Shown on your Skill DNA as a mentor assessment (not verified).', link: '/app/skills' });
  return c.json({ ok: true, verified: false });
});
