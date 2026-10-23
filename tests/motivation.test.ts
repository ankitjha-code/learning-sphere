import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupTestApp, registerUser } from './helpers';
import { db } from '../server/db/client';
import { notifications, users, challenges, achievements } from '../server/db/schema';
import { resetRateLimits } from '../server/lib/ratelimit';
import { recordActivity } from '../server/lib/activity';
import { enqueue, drainJobs } from '../server/jobs/queue';
import { runStudyReminders } from '../server/modules/motivation/jobs';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => ctx.close());

async function user(name: string, email: string) {
  resetRateLimits();
  return registerUser(ctx.app, name, email);
}

async function setPrefs(userId: string, prefs: Record<string, unknown>) {
  const [u] = await db.select({ p: users.preferences }).from(users).where(eq(users.id, userId));
  await db.update(users).set({ preferences: { ...u.p, ...prefs } }).where(eq(users.id, userId));
}

describe('motivation: summary, achievements, leaderboards, partners, reminders', () => {
  let a: Awaited<ReturnType<typeof user>>;
  let b: Awaited<ReturnType<typeof user>>;
  let hidden: Awaited<ReturnType<typeof user>>;

  beforeAll(async () => {
    a = await user('Ava Opted', 'ava@example.test');
    b = await user('Ben Opted', 'ben@example.test');
    hidden = await user('Hal Hidden', 'hal@example.test');
    await recordActivity(a.userId, { kind: 'topic.completed', label: 'Topic 1', xp: 20, dedupeKey: 't1' });
    await recordActivity(a.userId, { kind: 'problem.solved', label: 'Problem 1', xp: 25, dedupeKey: 'p1' });
    await recordActivity(b.userId, { kind: 'topic.completed', label: 'Topic 1', xp: 20, dedupeKey: 't1' });
    await recordActivity(hidden.userId, { kind: 'problem.solved', label: 'Lots', xp: 500, dedupeKey: 'big' });
  });

  it('summarizes streak, XP, level with explanation and records', async () => {
    const r = await a.get('/api/motivation/summary');
    expect(r.status).toBe(200);
    expect(r.body.xp).toBe(45);
    expect(r.body.level.level).toBe(0); // floor(sqrt(45/50))
    expect(r.body.level.nextLevelAt).toBe(50);
    expect(r.body.level.explanation).toMatch(/square root/);
    expect(r.body.streak.current).toBe(1);
    expect(r.body.heatmap).toHaveLength(112);
    expect(r.body.records.mostProblemsInDay.count).toBe(1);
  });

  it('awards achievements idempotently', async () => {
    const r1 = await a.get('/api/motivation/achievements');
    const earned = r1.body.items.filter((x: any) => x.earned).map((x: any) => x.key);
    expect(earned).toEqual(expect.arrayContaining(['first_topic', 'first_problem']));
    expect(earned).not.toContain('topics_5');
    await a.get('/api/motivation/achievements');
    const rows = await db.select().from(achievements).where(eq(achievements.userId, a.userId));
    expect(rows.filter((x) => x.key === 'first_topic')).toHaveLength(1);
  });

  it('leaderboard excludes users who did not opt in, but always shows me privately', async () => {
    await a.patch('/api/me/preferences', { showOnLeaderboard: true });
    await b.patch('/api/me/preferences', { showOnLeaderboard: true });
    const r = await a.get('/api/motivation/leaderboard?scope=global');
    expect(r.status).toBe(200);
    const ids = r.body.entries.map((e: any) => e.userId);
    expect(ids).toContain(a.userId);
    expect(ids).toContain(b.userId);
    expect(ids).not.toContain(hidden.userId);
    expect(r.body.entries[0].userId).toBe(a.userId);
    expect(JSON.stringify(r.body)).not.toContain('Hal Hidden');

    const mine = await hidden.get('/api/motivation/leaderboard');
    expect(mine.body.me.xp).toBe(500);
    expect(mine.body.me.optedIn).toBe(false);
    expect(mine.body.me.rank).toBeNull();
    expect(mine.body.entries.map((e: any) => e.userId)).not.toContain(hidden.userId);
  });

  it('accountability partner sees only weekly goal progress and streak', async () => {
    await b.post('/api/learning/goals', { title: 'Study 120 minutes', kind: 'weekly', metric: { type: 'minutes', target: 120 } });
    await b.post('/api/learning/goals', { title: 'PRIVATE CAREER GOAL', kind: 'career' });
    await b.post('/api/motivation/journal', { body: 'PRIVATE JOURNAL ENTRY', mood: 3 });

    expect((await a.post('/api/motivation/partners', { email: 'nobody@example.test' })).status).toBe(404);
    const inv = await a.post('/api/motivation/partners', { email: 'ben@example.test' });
    expect(inv.status).toBe(201);
    const pid = inv.body.partner.id;
    expect((await a.get(`/api/motivation/partners/${pid}/progress`)).status).toBe(403);
    expect((await a.post(`/api/motivation/partners/${pid}/accept`)).status).toBe(403);
    expect((await hidden.get(`/api/motivation/partners/${pid}/progress`)).status).toBe(404);
    expect((await b.post(`/api/motivation/partners/${pid}/accept`)).status).toBe(200);

    const p = await a.get(`/api/motivation/partners/${pid}/progress`);
    expect(p.status).toBe(200);
    expect(Object.keys(p.body).sort()).toEqual(['partner', 'streak', 'weeklyGoals']);
    expect(Object.keys(p.body.partner)).toEqual(['name']);
    expect(Object.keys(p.body.streak).sort()).toEqual(['activeToday', 'current']);
    expect(p.body.weeklyGoals).toHaveLength(1);
    expect(p.body.weeklyGoals[0].title).toBe('Study 120 minutes');
    const raw = JSON.stringify(p.body);
    expect(raw).not.toContain('PRIVATE CAREER GOAL');
    expect(raw).not.toContain('PRIVATE JOURNAL ENTRY');
    expect(raw).not.toContain('ben@example.test');
    expect(raw).not.toMatch(/"xp"/);
  });

  it('keeps journal entries private to their author', async () => {
    const e = await a.post('/api/motivation/journal', { kind: 'weekly_review', title: 'Week 1', body: 'Learned about loops.', mood: 4 });
    expect(e.status).toBe(201);
    expect((await b.patch(`/api/motivation/journal/${e.body.entry.id}`, { body: 'tamper' })).status).toBe(404);
    expect((await b.del(`/api/motivation/journal/${e.body.entry.id}`)).status).toBe(404);
    const list = await b.get('/api/motivation/journal');
    expect(JSON.stringify(list.body)).not.toContain('Learned about loops.');
    expect((await a.post('/api/motivation/journal', { body: '' })).status).toBe(400);
  });

  it('computes challenge progress from activity in the window', async () => {
    const [ch] = await db
      .insert(challenges)
      .values({ title: 'Sprint', description: 'Solve problems', metric: 'problems_solved', target: 5, kind: 'team', startsAt: new Date(Date.now() - 86400_000), endsAt: new Date(Date.now() + 7 * 86400_000) })
      .returning();
    expect((await a.post(`/api/motivation/challenges/${ch.id}/join`, {})).status).toBe(400); // team name needed
    expect((await a.post(`/api/motivation/challenges/${ch.id}/join`, { teamName: 'Owls' })).status).toBe(200);
    const d = await a.get(`/api/motivation/challenges/${ch.id}`);
    expect(d.body.myProgress).toBe(1);
    expect(d.body.teams[0]).toMatchObject({ teamName: 'Owls', value: 1 });
  });

  it('reports goal-completion analytics', async () => {
    const g = await a.post('/api/learning/goals', { title: 'Finish module', kind: 'milestone' });
    await a.patch(`/api/learning/goals/${g.body.goal.id}`, { status: 'done' });
    const g2 = await a.post('/api/learning/goals', { title: 'Dropped goal', kind: 'milestone' });
    await a.patch(`/api/learning/goals/${g2.body.goal.id}`, { status: 'dropped' });
    const r = await a.get('/api/motivation/analytics');
    expect(r.body.totals.done).toBe(1);
    expect(r.body.totals.dropped).toBe(1);
    expect(r.body.completionRate).toBe(0.5);
    expect(r.body.months).toHaveLength(6);
  });

  it('reminder job sends at most once per day, skips rest days and people who studied', async () => {
    const r1 = await user('Remi Reminder', 'remi@example.test');
    const r2 = await user('Rose Rest', 'rose@example.test');
    const r3 = await user('Stu Studied', 'stu@example.test');
    const off = await user('Olly Off', 'olly@example.test');
    const today = new Date().getUTCDay(); // test users are on UTC
    await setPrefs(r1.userId, { studyReminders: true, restDays: [(today + 1) % 7] });
    await setPrefs(r2.userId, { studyReminders: true, restDays: [today] });
    await setPrefs(r3.userId, { studyReminders: true });
    await setPrefs(off.userId, { studyReminders: false });
    await recordActivity(r3.userId, { kind: 'topic.completed', label: 'Did a topic', xp: 20, dedupeKey: 'today' });

    await enqueue('motivation.reminders', { ignoreLocalHour: true, reschedule: false }, { idempotencyKey: 'test-reminders-1' });
    await drainJobs();
    await enqueue('motivation.reminders', { ignoreLocalHour: true, reschedule: false }, { idempotencyKey: 'test-reminders-2' });
    await drainJobs();
    await runStudyReminders({ ignoreLocalHour: true });

    const count = async (uid: string) => (await db.select().from(notifications).where(and(eq(notifications.userId, uid), eq(notifications.type, 'motivation.reminder')))).length;
    expect(await count(r1.userId)).toBe(1);
    expect(await count(r2.userId)).toBe(0);
    expect(await count(r3.userId)).toBe(0);
    expect(await count(off.userId)).toBe(0);
    const [n] = await db.select().from(notifications).where(and(eq(notifications.userId, r1.userId), eq(notifications.type, 'motivation.reminder')));
    expect(`${n.title} ${n.body}`).not.toMatch(/miss|lose|lost|fail|broke|shame/i);
  });
});
