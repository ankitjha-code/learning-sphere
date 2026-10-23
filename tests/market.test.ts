import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { setupTestApp, registerUser as register } from './helpers';
import { resetRateLimits } from '../server/lib/ratelimit';
import { db } from '../server/db/client';
import { externalJobs, jobFeedRuns, jobPostings, marketSamplePostings, marketSnapshotRuns, marketSnapshots, memberships, organizations, skills, users, backgroundJobs } from '../server/db/schema';
import { classifyRole, compareShares, detectSkills, isoDay, runSnapshot } from '../server/modules/market/service';
import { addEvidence } from '../server/modules/learning/skilldna';
import { enqueue, drainJobs } from '../server/jobs/queue';
import { SKILLS } from '../server/db/seed/content/skills';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
const registerUser: typeof register = (app, name, email, password) => {
  resetRateLimits();
  return register(app, name, email, password);
};
type C = Awaited<ReturnType<typeof register>>;
let admin: C;
let alice: C;
let orgId: string;

const DAY = 86400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
let seq = 0;

function ext(source: string, title: string, description: string, ageDays: number, extra: Partial<typeof externalJobs.$inferInsert> = {}) {
  seq++;
  return {
    source,
    externalId: `t-${seq}`,
    title,
    company: extra.company ?? `Company ${seq % 3}`,
    location: 'Anywhere',
    url: `https://example.test/jobs/${seq}`,
    tags: [],
    description,
    publishedAt: daysAgo(ageDays),
    fetchedAt: daysAgo(Math.max(0, ageDays - 1)),
    expiresAt: new Date(Date.now() + 20 * DAY),
    ...extra,
  };
}

const PHASE_A = () => [
  ...Array.from({ length: 4 }, () => ext('jobicy', 'Backend Developer', 'Requirements:\n- Python\n- PostgreSQL', 2, { company: 'Acme Remote' })),
  ...Array.from({ length: 2 }, () => ext('jobicy', 'Frontend Engineer', 'Requirements:\n- React\n- TypeScript', 2)),
  ...Array.from({ length: 2 }, () => ext('jobicy', 'Data Analyst', 'Requirements:\n- SQL\n- Docker', 2)),
  ext('jobicy', 'Account Executive', 'Sell our product to new customers.', 2),
  ext('jobicy', 'Machine Learning Engineer', 'Requirements:\n- PyTorch', 2),
];

beforeAll(async () => {
  ctx = await setupTestApp();
  admin = await registerUser(ctx.app, 'Ada Admin', 'ada.market@example.test');
  alice = await registerUser(ctx.app, 'Alice Learner', 'alice.market@example.test');
  await db.update(users).set({ platformRole: 'platform_admin' }).where(eq(users.id, admin.userId));
  const wanted = ['python', 'docker', 'go', 'react', 'sql-basics', 'typescript', 'database-design'];
  await db.insert(skills).values(SKILLS.filter((s) => wanted.includes(s.slug)).map((s) => ({ slug: s.slug, name: s.name, category: s.category, level: s.level })));
  const [org] = await db.insert(organizations).values({ name: 'Real Hiring Co', slug: 'real-hiring-co', kind: 'company' }).returning();
  orgId = org.id;
  await db.insert(memberships).values({ orgId, userId: admin.userId, roles: ['recruiter_admin'] });
});
afterAll(async () => ctx.close());

describe('market: pure helpers', () => {
  it('buckets roles from titles with the first matching rule', () => {
    expect(classifyRole('Senior Backend Engineer')).toBe('backend');
    expect(classifyRole('Frontend Developer (React)')).toBe('frontend');
    expect(classifyRole('Full Stack Engineer')).toBe('full_stack');
    expect(classifyRole('Data Analyst')).toBe('data');
    expect(classifyRole('Machine Learning Engineer')).toBe('ml_ai');
    expect(classifyRole('Senior DevOps Engineer - LATAM')).toBe('devops');
    expect(classifyRole('iOS Developer')).toBe('mobile');
    expect(classifyRole('QA Automation Engineer')).toBe('qa');
    expect(classifyRole('Software Engineering Intern')).toBe('intern');
    expect(classifyRole('Golang Developer')).toBe('backend');
    expect(classifyRole('Software Engineer')).toBe('software_general');
    expect(classifyRole('Account Executive')).toBe('other');
    expect(classifyRole('Senior Counsel')).toBe('other');
  });

  it('ignores vague words like "security" or "cloud" alone but keeps specific mentions', () => {
    expect(detectSkills('We take security seriously and run in the cloud.')).toEqual([]);
    expect(detectSkills('Requirements:\n- Python\n- AWS')).toEqual(expect.arrayContaining(['python', 'cloud-basics']));
  });

  it('calls a trend up or down only when the change is large and unlikely to be noise', () => {
    expect(compareShares({ count: 30, total: 42 }, { count: 0, total: 40 }).direction).toBe('up');
    expect(compareShares({ count: 5, total: 42 }, { count: 40, total: 40 }).direction).toBe('down');
    expect(compareShares({ count: 2, total: 42 }, { count: 0, total: 40 }).direction).toBe('steady');
    expect(compareShares({ count: 10, total: 40 }, { count: 10, total: 40 })).toMatchObject({ direction: 'steady', changePoints: 0 });
  });
});

describe('market: empty and sample states', () => {
  it('requires sign-in', async () => {
    const anon = (await import('./helpers')).client(ctx.app);
    expect((await anon.get('/api/market/overview')).status).toBe(401);
  });

  it('returns an honest empty state (no zeros dressed up as data) when nothing was ever fetched', async () => {
    const r = await alice.get('/api/market/overview?days=30');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('empty');
    expect(r.body.dataset).toBe('none');
    expect(r.body.summary).toBeNull();
    expect(r.body.skills).toEqual([]);
    expect(r.body.roles).toEqual([]);
    expect(r.body.emptyReason.code).toBe('never_synced');
    expect(r.body.basedOn).toMatchObject({ postings: 0, sources: [] });
    expect(r.body.basedOn.generatedAt).toBeTruthy();
    expect(r.body.caveats.length).toBeGreaterThan(0);
    const me = await alice.get('/api/market/me');
    expect(me.body.status).toBe('empty');
    expect(me.body.items).toEqual([]);
  });

  it('validates the window', async () => {
    expect((await alice.get('/api/market/overview?days=7')).status).toBe(400);
    expect((await alice.get('/api/market/overview?scope=everything')).status).toBe(400);
  });

  it('falls back to clearly labelled sample data only when no real postings exist', async () => {
    await db.insert(marketSamplePostings).values([
      { externalId: 's1', title: 'Backend Developer (sample)', company: 'Sample Co (sample)', description: 'Requirements:\n- Python', postedAt: daysAgo(1) },
      { externalId: 's2', title: 'Frontend Developer (sample)', company: 'Sample Co (sample)', description: 'Requirements:\n- React', postedAt: daysAgo(1) },
      { externalId: 's3', title: 'Data Analyst (sample)', company: 'Sample Co (sample)', description: 'Requirements:\n- SQL', postedAt: daysAgo(1) },
    ]);
    const [row] = await db.select({ source: marketSamplePostings.source }).from(marketSamplePostings).limit(1);
    expect(row.source).toBe('sample');
    const r = await alice.get('/api/market/overview?days=30');
    expect(r.body.status).toBe('ok');
    expect(r.body.dataset).toBe('sample');
    expect(r.body.basedOn.sources.map((s: { source: string }) => s.source)).toEqual(['sample']);
    expect(r.body.basedOn.postings).toBe(3);
    expect(r.body.caveats[0]).toMatch(/^Sample data/);
    expect(r.body.freshness.status).toBe('sample');
  });
});

describe('market: insights from real postings', () => {
  it('computes skill shares, remote share and role mix across feed and platform postings, labelled separately', async () => {
    await db.insert(externalJobs).values(PHASE_A());
    const base = { orgId, createdBy: admin.userId, location: 'Pune', description: 'Build services.' };
    await db.insert(jobPostings).values([
      { ...base, title: 'Junior Backend Developer (Python)', workplace: 'remote', status: 'published', publishedAt: daysAgo(3), requiredSkills: [{ slug: 'python', name: 'Python', required: true }] },
      { ...base, title: 'QA Engineer', workplace: 'onsite', status: 'published', publishedAt: daysAgo(3), requiredSkills: [{ slug: 'sql-basics', name: 'SQL basics', required: true }] },
      { ...base, title: 'Draft Role', status: 'draft', requiredSkills: [{ slug: 'python', name: 'Python', required: true }] },
      { ...base, title: 'Campus Role', status: 'published', campusOnly: true, publishedAt: daysAgo(3), requiredSkills: [{ slug: 'python', name: 'Python', required: true }] },
    ]);
    await runSnapshot({ trigger: 'admin' });
    const r = await alice.get('/api/market/overview?days=30');
    expect(r.status).toBe(200);
    expect(r.body.dataset).toBe('live');
    expect(r.body.summary.postings).toBe(12);
    expect(r.body.summary.remoteShare).toBeCloseTo(11 / 12, 3);
    const python = r.body.skills.find((s: { slug: string }) => s.slug === 'python');
    expect(python.postings).toBe(5);
    expect(python.share).toBeCloseTo(5 / 12, 3);
    expect(r.body.skills[0].slug).toBe('sql-basics'); // 4 backend (PostgreSQL) + 2 data (SQL) + 1 platform QA = 7
    expect(r.body.skills[0].postings).toBe(7);
    const roles = Object.fromEntries(r.body.roles.map((x: { role: string; postings: number }) => [x.role, x.postings]));
    expect(roles).toEqual({ backend: 5, frontend: 2, data: 2, other: 1, ml_ai: 1, qa: 1 });
    expect(r.body.companies[0]).toMatchObject({ name: 'Acme Remote', postings: 4 });
    const sources = Object.fromEntries(r.body.basedOn.sources.map((s: { source: string; postings: number; label: string }) => [s.source, s]));
    expect(sources.jobicy.postings).toBe(10);
    expect(sources.platform).toMatchObject({ postings: 2, label: 'On this platform', kind: 'platform' });
    expect(sources.sample).toBeUndefined(); // sample data is never mixed with real data
    expect(r.body.weekly.reduce((n: number, w: { postings: number }) => n + w.postings, 0)).toBe(12);
    expect(r.body.caveats.join(' ')).toMatch(/not the whole job market/);
    expect(r.body.caveats.join(' ')).toMatch(/not salaries/);

    const platform = await alice.get('/api/market/overview?days=30&scope=platform');
    expect(platform.body.summary).toMatchObject({ postings: 2, remotePostings: 1, remoteShare: 0.5 });
    const pub = await alice.get('/api/market/overview?days=30&scope=public');
    expect(pub.body.summary.postings).toBe(10);
  });

  it('hides trends when either period has too few postings', async () => {
    const r = await alice.get('/api/market/overview?days=30');
    expect(r.body.trend.available).toBe(false);
    expect(r.body.trend.reason).toMatch(/Not enough data to show a trend/);
    expect(r.body.skills.every((s: { trend: unknown }) => s.trend === null)).toBe(true);
  });

  it('shows significant up/down trends once both periods have enough postings', async () => {
    await db.insert(externalJobs).values([
      ...Array.from({ length: 40 }, () => ext('jobicy', 'Backend Developer', 'Requirements:\n- Python', 40)),
      ...Array.from({ length: 30 }, () => ext('himalayas', 'Golang Developer', 'Requirements:\n- Golang', 1)),
    ]);
    await runSnapshot({ trigger: 'admin' });
    const r = await alice.get('/api/market/overview?days=30');
    expect(r.body.trend.available).toBe(true);
    expect(r.body.trend).toMatchObject({ currentPostings: 42, previousPostings: 40 });
    const by = Object.fromEntries(r.body.skills.map((s: { slug: string; trend: { direction: string } }) => [s.slug, s.trend.direction]));
    expect(by.go).toBe('up');
    expect(by.python).toBe('down');
    expect(by.react).toBe('steady');
  });

  it('is idempotent per day: re-running counts nothing twice', async () => {
    const before = await db.select({ n: sql<number>`sum(${marketSnapshots.postingCount})::int` }).from(marketSnapshots);
    const again = await runSnapshot({ trigger: 'admin' });
    expect(again.newPostings).toBe(0);
    const after = await db.select({ n: sql<number>`sum(${marketSnapshots.postingCount})::int` }).from(marketSnapshots);
    expect(after[0].n).toBe(before[0].n);
    const runs = await db.select().from(marketSnapshotRuns).where(eq(marketSnapshotRuns.runDay, isoDay(new Date())));
    expect(runs).toHaveLength(1);
    expect(runs[0].runs).toBeGreaterThanOrEqual(2);
    expect(runs[0].sources).toEqual(expect.arrayContaining(['jobicy', 'himalayas', 'platform', 'sample']));
  });

  it('runs as the daily market.snapshot background job', async () => {
    await enqueue('market.snapshot', {}, { idempotencyKey: 'market.snapshot:test' });
    await drainJobs();
    const [job] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.idempotencyKey, 'market.snapshot:test'));
    expect(job.status).toBe('succeeded');
    const next = await db.select().from(backgroundJobs).where(eq(backgroundJobs.type, 'market.snapshot'));
    expect(next.length).toBeGreaterThanOrEqual(2); // the handler scheduled the next day
  });

  it('keeps history after the feeds drop old postings', async () => {
    await db.delete(externalJobs);
    await runSnapshot({ trigger: 'admin' });
    const r = await alice.get('/api/market/overview?days=30');
    expect(r.body.summary.postings).toBe(42);
    expect(r.body.trend.previousPostings).toBe(40);
  });

  it('describes one skill: share over time, roles and co-occurring skills', async () => {
    const r = await alice.get('/api/market/skills/sql-basics?days=30');
    expect(r.status).toBe(200);
    expect(r.body.skill).toEqual({ slug: 'sql-basics', name: 'SQL basics' });
    expect(r.body.summary).toMatchObject({ postings: 42, mentions: 7 });
    const roles = Object.fromEntries(r.body.roles.map((x: { role: string; postings: number }) => [x.role, x.postings]));
    expect(roles).toEqual({ backend: 4, data: 2, qa: 1 });
    const co = r.body.cooccurring.map((x: { slug: string }) => x.slug);
    expect(co).toEqual(expect.arrayContaining(['python', 'docker', 'database-design']));
    expect(r.body.weekly.reduce((n: number, w: { mentions: number }) => n + w.mentions, 0)).toBe(7);
    expect(r.body.caveats.join(' ')).toMatch(/does not mean one skill causes/);
    expect(r.body.basedOn.postings).toBe(42);
    expect((await alice.get('/api/market/skills/not-a-skill')).status).toBe(404);
    expect((await alice.get('/api/market/skills/..%2Fetc')).status).toBe(404);
  });

  it('compares the user\'s Skill DNA states with the top skills', async () => {
    const ids = Object.fromEntries((await db.select().from(skills)).map((s) => [s.slug, s.id]));
    await addEvidence({ userId: alice.userId, skillId: ids.python, source: 'assessment', sourceId: 'a1', score: 0.9, verified: true });
    await addEvidence({ userId: alice.userId, skillId: ids.docker, source: 'practice', sourceId: 'p1', score: 0.8 });
    await addEvidence({ userId: alice.userId, skillId: ids['sql-basics'], source: 'practice', sourceId: 'p2', score: 0.3 });
    await addEvidence({ userId: alice.userId, skillId: ids.go, source: 'self', score: 0.75 });
    const r = await alice.get('/api/market/me?days=30');
    expect(r.status).toBe(200);
    const st = Object.fromEntries(r.body.items.map((i: { slug: string; status: string }) => [i.slug, i.status]));
    expect(st).toMatchObject({ python: 'verified', docker: 'demonstrated', 'sql-basics': 'learning', go: 'self_reported', react: 'none' });
    expect(r.body.counts.verified).toBe(1);
    expect(r.body.items[0]).toHaveProperty('learning.topics');
    expect(r.body.basedOn.postings).toBe(42);
    expect(r.body.caveats.join(' ')).toMatch(/Skill DNA/);
    // Another user's DNA does not leak in.
    const bob = await registerUser(ctx.app, 'Bob Other', 'bob.market@example.test');
    const b = await bob.get('/api/market/me?days=30');
    expect(b.body.items.every((i: { status: string }) => i.status === 'none')).toBe(true);
  });

  it('lists sources with last fetch, attribution, links and window counts', async () => {
    const r = await alice.get('/api/market/sources?days=30');
    expect(r.status).toBe(200);
    const by = Object.fromEntries(r.body.sources.map((s: { source: string }) => [s.source, s]));
    expect(by.jobicy).toMatchObject({ homepage: 'https://jobicy.com', postingsInWindow: 2 + 4 + 2 + 2 });
    expect(by.jobicy.attribution).toMatch(/Jobicy/);
    expect(by.himalayas.postingsInWindow).toBe(30);
    expect(by.remotive.postingsInWindow).toBe(0);
    expect(by.platform).toMatchObject({ label: 'On this platform', postingsInWindow: 2 });
    expect(r.body.basedOn).toHaveProperty('generatedAt');
    expect(Array.isArray(r.body.caveats)).toBe(true);
  });
});

describe('market: admin operations', () => {
  it('forbids fetch and recompute for non-admins', async () => {
    expect((await alice.post('/api/market/admin/fetch')).status).toBe(403);
    expect((await alice.post('/api/market/admin/recompute')).status).toBe(403);
  });

  it('lets a platform admin recompute and fetch, while feed rate limits still apply', async () => {
    const rc = await admin.post('/api/market/admin/recompute');
    expect(rc.status).toBe(200);
    expect(rc.body.snapshot.newPostings).toBe(0);
    // Every source fetched just now: the existing rate limits must stop any network call.
    const now = new Date();
    await db.insert(jobFeedRuns).values(['jobicy', 'himalayas', 'remotive'].map((source) => ({ source, status: 'ok', startedAt: now, finishedAt: now })));
    const f = await admin.post('/api/market/admin/fetch');
    expect(f.status).toBe(200);
    expect(f.body.results.map((x: { status: string }) => x.status)).toEqual(['skipped_rate_limit', 'skipped_rate_limit', 'skipped_rate_limit']);
    const ov = await alice.get('/api/market/overview?days=30');
    expect(ov.body.freshness.status).toBe('current');
  });
});

describe('market: freshness', () => {
  it('recomputes on read after a feed run writes new postings', async () => {
    const before = (await alice.get('/api/market/overview?days=30')).body.summary.postings;
    const t = new Date(Date.now() - 60_000); // fetch started a minute ago, finished now
    await db.insert(externalJobs).values(ext('remotive', 'Python Developer', 'Requirements:\n- Python', 1, { fetchedAt: t }));
    await db.insert(jobFeedRuns).values({ source: 'remotive', status: 'ok', startedAt: t, finishedAt: new Date(Date.now() + 1000) });
    const after = await alice.get('/api/market/overview?days=30');
    expect(after.body.summary.postings).toBe(before + 1);
  });
});
