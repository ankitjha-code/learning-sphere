import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupTestApp, registerUser as register, client } from './helpers';
import { resetRateLimits } from '../server/lib/ratelimit';
import { db } from '../server/db/client';
import { organizations, memberships, jobPostings, jobApplications, applications, notifications, externalJobs, jobFeedRuns, users, placementDrives } from '../server/db/schema';
import { syncFeed, removeExpired, feedStatus, type FetchFn } from '../server/modules/jobs/feeds';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
/** Registration is rate limited per IP; tests register many users. */
const registerUser: typeof register = (app, name, email, password) => {
  resetRateLimits();
  return register(app, name, email, password);
};
let orgId: string;
let recruiterId: string;
const ids: Record<string, string> = {};

const DAY = 86400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

function mockFetch(payload: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn: FetchFn = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  };
  return Object.assign(fn, { calls });
}

const JOBICY_SAMPLE = {
  apiVersion: '2',
  jobs: [
    { id: 101, url: 'https://jobicy.com/jobs/101-backend-developer', jobTitle: 'Backend Developer', companyName: 'Acme Remote', jobGeo: 'Anywhere', jobIndustry: ['Programming'], jobType: ['full-time'], jobDescription: '<p>Build <b>APIs</b> with Node.js &amp; Postgres.</p><script>alert(1)</script>', pubDate: iso(-2).replace('T', ' ').slice(0, 19) },
    { id: 102, url: 'https://jobicy.com/jobs/102-old', jobTitle: 'Old Job', companyName: 'Past Inc', jobGeo: 'USA', pubDate: iso(-45) },
    { id: 103, url: 'not-a-url', jobTitle: 'Broken', companyName: 'X' },
  ],
};

const HIMALAYAS_SAMPLE = {
  jobs: [
    { guid: 'https://himalayas.app/companies/acme/jobs/frontend', title: 'Frontend Engineer', companyName: 'Acme', locationRestrictions: ['Europe'], categories: ['Engineering'], description: '<p>React</p>', pubDate: Math.floor((Date.now() - DAY) / 1000), expiryDate: Math.floor((Date.now() + 20 * DAY) / 1000), applicationLink: 'https://acme.example/careers/frontend?ref=x' },
    { guid: 'https://himalayas.app/companies/beta/jobs/expired', title: 'Expired Role', companyName: 'Beta', pubDate: Math.floor((Date.now() - 5 * DAY) / 1000), expiryDate: Math.floor((Date.now() - DAY) / 1000), applicationLink: 'https://beta.example/apply' },
  ],
};

const REMOTIVE_SAMPLE = {
  '0-legal-notice': 'Remotive API',
  jobs: [{ id: 555, url: 'https://remotive.com/remote-jobs/software-dev/python-dev-555', title: 'Python Developer', company_name: 'Gamma', candidate_required_location: 'Worldwide', tags: ['python', 'django'], category: 'Software Development', publication_date: iso(-1).slice(0, 19), description: '<ul><li>Python</li></ul>' }],
};

beforeAll(async () => {
  ctx = await setupTestApp();
  const [org] = await db.insert(organizations).values({ name: 'Helix Test Co', slug: 'helix-test', kind: 'company' }).returning();
  orgId = org.id;
  const recruiter = await registerUser(ctx.app, 'Rita Recruiter', 'rita@example.test');
  recruiterId = recruiter.userId;
  await db.insert(memberships).values({ orgId, userId: recruiterId, roles: ['recruiter_admin'] });
  const base = { orgId, createdBy: recruiterId, location: 'Pune', description: 'We build APIs with Python and SQL. Requirements: Python, SQL, REST APIs.', requiredSkills: [{ slug: 'python', name: 'Python', required: true }, { slug: 'sql-basics', name: 'SQL basics', required: true }] };
  const rows = await db
    .insert(jobPostings)
    .values([
      { ...base, title: 'Junior Backend Developer', status: 'published', publishedAt: new Date() },
      { ...base, title: 'Draft Role', status: 'draft' },
      { ...base, title: 'Closed Role', status: 'closed' },
      { ...base, title: 'Expired Window Role', status: 'published', closesAt: new Date(Date.now() - DAY) },
      { ...base, title: 'Campus Only Role', status: 'published', campusOnly: true },
    ])
    .returning();
  for (const r of rows) ids[r.title] = r.id;
});
afterAll(async () => ctx.close());

describe('job board: platform postings', () => {
  it('lists only published, open, non-campus postings with an advisory match explanation', async () => {
    const c = await registerUser(ctx.app, 'Cara Candidate', 'cara@example.test');
    const r = await c.get('/api/jobs');
    expect(r.status).toBe(200);
    const titles = r.body.items.map((i: any) => i.title);
    expect(titles).toEqual(['Junior Backend Developer']);
    const m = r.body.items[0].match;
    expect(m.factors.length).toBe(2);
    expect(m.note).toMatch(/Advisory/);
    expect(m.missing).toContain('Python');
    expect((await c.get(`/api/jobs/${ids['Draft Role']}`)).status).toBe(404);
    expect((await c.get(`/api/jobs/${ids['Campus Only Role']}`)).status).toBe(404);
    expect((await client(ctx.app).get('/api/jobs')).status).toBe(401);
  });

  it('shows campus-only postings to members of an org with an open drive for them', async () => {
    const [college] = await db.insert(organizations).values({ name: 'Test College', slug: 'test-college', kind: 'college' }).returning();
    const s = await registerUser(ctx.app, 'Sam Student', 'sam@example.test');
    await db.insert(memberships).values({ orgId: college.id, userId: s.userId, roles: ['student'] });
    await db.insert(placementDrives).values({ orgId: college.id, companyName: 'Helix Test Co', jobPostingId: ids['Campus Only Role'], title: 'Drive', roleTitle: 'Engineer', status: 'open', createdBy: s.userId });
    const r = await s.get('/api/jobs');
    expect(r.body.items.map((i: any) => i.title)).toContain('Campus Only Role');
  });

  it('applies once: creates the employer record and a linked personal tracker row, and notifies recruiters', async () => {
    const c = await registerUser(ctx.app, 'Ada Applicant', 'ada@example.test');
    const resume = await c.post('/api/career/resumes', { title: 'Main', start: 'blank' });
    const other = await registerUser(ctx.app, 'Other Person', 'other-person@example.test');
    const otherResume = await other.post('/api/career/resumes', { title: 'Theirs', start: 'blank' });

    const bad = await c.post(`/api/jobs/${ids['Junior Backend Developer']}/apply`, { resumeId: otherResume.body.resume.id, sharePortfolio: true });
    expect(bad.status).toBe(400);

    const r = await c.post(`/api/jobs/${ids['Junior Backend Developer']}/apply`, { resumeId: resume.body.resume.id, coverNote: 'Keen to learn.', sharePortfolio: true });
    expect(r.status).toBe(201);
    const [ja] = await db.select().from(jobApplications).where(eq(jobApplications.id, r.body.jobApplication.id));
    expect(ja.stage).toBe('applied');
    expect(ja.status).toBe('active');
    expect(ja.candidateId).toBe(c.userId);
    expect(ja.portfolioShared).toBe(true);
    expect((ja.resumeSnapshot as any).resumeId).toBe(resume.body.resume.id);
    expect(ja.matchSnapshot!.factors.length).toBe(2);
    const [personal] = await db.select().from(applications).where(eq(applications.jobApplicationId, ja.id));
    expect(personal.source).toBe('platform');
    expect(personal.jobPostingId).toBe(ids['Junior Backend Developer']);
    expect(personal.status).toBe('applied');
    expect(personal.userId).toBe(c.userId);
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, recruiterId), eq(notifications.type, 'hire.application_received')));
    expect(notes.length).toBe(1);

    const again = await c.post(`/api/jobs/${ids['Junior Backend Developer']}/apply`, { sharePortfolio: false });
    expect(again.status).toBe(409);

    const mine = await c.get('/api/jobs/my/applications');
    expect(mine.body.items[0].trackerId).toBe(personal.id);
    const detail = await c.get(`/api/jobs/${ids['Junior Backend Developer']}`);
    expect(detail.body.myApplication.status).toBe('active');
  });

  it('refuses draft, closed and expired postings', async () => {
    const c = await registerUser(ctx.app, 'Late Larry', 'larry@example.test');
    expect((await c.post(`/api/jobs/${ids['Draft Role']}/apply`, { sharePortfolio: false })).status).toBe(404);
    expect((await c.post(`/api/jobs/${ids['Closed Role']}/apply`, { sharePortfolio: false })).status).toBe(409);
    expect((await c.post(`/api/jobs/${ids['Expired Window Role']}/apply`, { sharePortfolio: false })).status).toBe(409);
    expect((await c.post(`/api/jobs/${ids['Campus Only Role']}/apply`, { sharePortfolio: false })).status).toBe(404);
  });

  it('withdraws: updates both records, notifies the employer, and only the candidate can do it', async () => {
    const c = await registerUser(ctx.app, 'Wendy Withdraw', 'wendy@example.test');
    const r = await c.post(`/api/jobs/${ids['Junior Backend Developer']}/apply`, { sharePortfolio: false });
    const jaId = r.body.jobApplication.id;
    const stranger = await registerUser(ctx.app, 'Stranger', 'stranger@example.test');
    expect((await stranger.post(`/api/jobs/applications/${jaId}/withdraw`, {})).status).toBe(404);

    const w = await c.post(`/api/jobs/applications/${jaId}/withdraw`, { reason: 'Accepted another offer' });
    expect(w.status).toBe(200);
    expect(w.body.application.status).toBe('withdrawn');
    const [personal] = await db.select().from(applications).where(eq(applications.jobApplicationId, jaId));
    expect(personal.status).toBe('withdrawn');
    expect(personal.outcomeReason).toBe('Accepted another offer');
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, recruiterId), eq(notifications.type, 'hire.application_withdrawn')));
    expect(notes.length).toBe(1);
    expect((await c.post(`/api/jobs/applications/${jaId}/withdraw`, {})).status).toBe(409);
  });

  it('withdrawing from the personal tracker also withdraws with the employer', async () => {
    const c = await registerUser(ctx.app, 'Tina Tracker', 'tina@example.test');
    const r = await c.post(`/api/jobs/${ids['Junior Backend Developer']}/apply`, { sharePortfolio: false });
    const s = await c.post(`/api/career/applications/${r.body.application.id}/status`, { status: 'withdrawn', outcomeReason: 'Role not a fit' });
    expect(s.status).toBe(200);
    const [ja] = await db.select().from(jobApplications).where(eq(jobApplications.id, r.body.jobApplication.id));
    expect(ja.status).toBe('withdrawn');
  });
});

describe('external job feeds', () => {
  it('parses Jobicy with attribution, a User-Agent, plain-text descriptions, and drops old or invalid rows', async () => {
    const f = mockFetch(JOBICY_SAMPLE);
    const res = await syncFeed('jobicy', { fetchFn: f });
    expect(res.status).toBe('ok');
    expect(res.upserted).toBe(1);
    expect(f.calls[0].url).toContain('jobicy.com/api/jobs');
    expect(String((f.calls[0].init!.headers as Record<string, string>)['user-agent'])).toMatch(/LearnSphereNexus/);
    const [row] = await db.select().from(externalJobs).where(eq(externalJobs.source, 'jobicy'));
    expect(row.title).toBe('Backend Developer');
    expect(row.url).toBe('https://jobicy.com/jobs/101-backend-developer');
    expect(row.description).toContain('Node.js & Postgres');
    expect(row.description).not.toContain('<');
    expect(row.description).not.toContain('alert');
    expect(row.expiresAt).toBeTruthy();
  });

  it('keeps the Himalayas apply link unaltered and never stores expired jobs', async () => {
    const res = await syncFeed('himalayas', { fetchFn: mockFetch(HIMALAYAS_SAMPLE) });
    expect(res.upserted).toBe(1);
    const rows = await db.select().from(externalJobs).where(eq(externalJobs.source, 'himalayas'));
    expect(rows.map((r) => r.title)).toEqual(['Frontend Engineer']);
    expect(rows[0].url).toBe('https://acme.example/careers/frontend?ref=x');
  });

  it('removes jobs once they expire', async () => {
    await db.insert(externalJobs).values({ source: 'himalayas', externalId: 'manual-expired', title: 'Gone', company: 'Z', url: 'https://himalayas.app/x', expiresAt: new Date(Date.now() - 1000), publishedAt: new Date() });
    const removed = await removeExpired('himalayas');
    expect(removed).toBeGreaterThanOrEqual(1);
    const left = await db.select().from(externalJobs).where(eq(externalJobs.externalId, 'manual-expired'));
    expect(left.length).toBe(0);
  });

  it('respects the Remotive limit (at most 4 fetches per day, 6 hours apart)', async () => {
    const t0 = new Date();
    const f = mockFetch(REMOTIVE_SAMPLE);
    expect((await syncFeed('remotive', { fetchFn: f, now: t0 })).status).toBe('ok');
    const second = await syncFeed('remotive', { fetchFn: f, now: new Date(t0.getTime() + 3600_000), trigger: 'admin' });
    expect(second.status).toBe('skipped_rate_limit');
    expect(f.calls.length).toBe(1);
    // Simulate 4 attempts already made in the last 24h (spread out), then try after the min interval.
    await db.delete(jobFeedRuns).where(eq(jobFeedRuns.source, 'remotive'));
    for (const h of [23, 17, 11, 7]) await db.insert(jobFeedRuns).values({ source: 'remotive', status: 'ok', startedAt: new Date(t0.getTime() - h * 3600_000) });
    const third = await syncFeed('remotive', { fetchFn: f, now: t0 });
    expect(third.status).toBe('skipped_rate_limit');
    expect(f.calls.length).toBe(1);
    // Once the oldest attempt leaves the 24h window, a fetch is allowed again.
    const later = await syncFeed('remotive', { fetchFn: f, now: new Date(t0.getTime() + 2 * 3600_000) });
    expect(later.status).toBe('ok');
    expect(f.calls.length).toBe(2);
  });

  it('records failures honestly in the feed status', async () => {
    await db.delete(jobFeedRuns).where(eq(jobFeedRuns.source, 'jobicy'));
    const res = await syncFeed('jobicy', { fetchFn: mockFetch({ error: 'down' }, 503) });
    expect(res.status).toBe('error');
    const status = await feedStatus();
    const j = status.find((s) => s.source === 'jobicy')!;
    expect(j.lastStatus).toBe('error');
    expect(j.lastError).toMatch(/503/);
    expect(j.cachedJobs).toBeGreaterThanOrEqual(1); // earlier successful results are still served
  });

  it('serves the public feed logged out with attribution and only external jobs', async () => {
    const anon = client(ctx.app);
    const r = await anon.get('/api/jobs/feed/public');
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThanOrEqual(2);
    for (const item of r.body.items) {
      expect(['jobicy', 'himalayas', 'remotive']).toContain(item.source);
      expect(item.attribution.text).toMatch(/^Listed on (Jobicy|Himalayas|Remotive), fetched /);
      expect(item.url).toMatch(/^https:\/\//);
    }
    expect(JSON.stringify(r.body)).not.toContain('Junior Backend Developer');
    expect(r.body.sources.length).toBe(3);
  });

  it('lets signed-in users browse, open and save external jobs', async () => {
    const c = await registerUser(ctx.app, 'Fiona Feed', 'fiona@example.test');
    const list = await c.get('/api/jobs/external?q=python');
    expect(list.body.items.map((i: any) => i.title)).toContain('Python Developer');
    const id = list.body.items[0].id;
    const detail = await c.get(`/api/jobs/external/${id}`);
    expect(detail.body.job.attribution.applyLabel).toMatch(/Apply/);
    expect((await c.post('/api/jobs/saved', { kind: 'external', refId: id })).status).toBe(201);
    const saved = await c.get('/api/jobs/saved');
    expect(saved.body.items[0].refId).toBe(id);
    const track = await c.post('/api/career/applications', { externalJobId: id });
    expect(track.status).toBe(201);
    expect(track.body.application.source).toBe('feed');
    expect(track.body.application.status).toBe('saved');
  });

  it('restricts sync-now to platform admins and still honours rate limits', async () => {
    const c = await registerUser(ctx.app, 'Normal User', 'normal@example.test');
    expect((await c.post('/api/jobs/feeds/sync-now', {})).status).toBe(403);
    const admin = await registerUser(ctx.app, 'Admin User', 'admin-jobs@example.test');
    await db.update(users).set({ platformRole: 'platform_admin' }).where(eq(users.id, admin.userId));
    const spy = vi.fn(async () => new Response(JSON.stringify(REMOTIVE_SAMPLE), { status: 200 }));
    vi.stubGlobal('fetch', spy);
    try {
      const r = await admin.post('/api/jobs/feeds/sync-now', { source: 'remotive' });
      expect(r.status).toBe(200);
      expect(r.body.results[0].status).toBe('skipped_rate_limit');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
