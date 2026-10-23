import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { resetRateLimits } from '../server/lib/ratelimit';
import { setupTestApp, registerUser, client } from './helpers';
import { seedReference } from '../server/db/seed/reference';
import { db } from '../server/db/client';
import { certificates, enrollments, topicProgress, topics, tracks } from '../server/db/schema';
import { issueTrackCertificateIfComplete } from '../server/modules/portfolio/service';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
  await seedReference();
});
afterAll(async () => ctx.close());
// Many accounts are registered from one test IP; the signup limiter is not what these tests cover.
beforeEach(() => resetRateLimits());

describe('portfolio privacy and sharing', () => {
  it('creates a private portfolio by default; the public endpoint 404s for private portfolios', async () => {
    const c = await registerUser(ctx.app, 'Pat Private', 'pat@example.test');
    const anon = client(ctx.app);
    const me = await c.get('/api/portfolio');
    expect(me.status).toBe(200);
    expect(me.body.portfolio.visibility).toBe('private');
    expect(me.body.portfolio.slug).toBe('pat-private');
    expect(me.body.portfolio.sections.length).toBe(7);
    expect((await anon.get('/api/portfolio/public/pat-private')).status).toBe(404);
    expect((await anon.get('/api/portfolio/public/does-not-exist')).status).toBe(404);
    // Anonymous users cannot read the owner endpoints.
    expect((await anon.get('/api/portfolio')).status).toBe(401);
  });

  it('unlisted portfolios require the token, and rotating the token revokes the old link', async () => {
    const c = await registerUser(ctx.app, 'Uma Unlisted', 'uma@example.test');
    const anon = client(ctx.app);
    const pub = await c.post('/api/portfolio/publish', { visibility: 'unlisted' });
    expect(pub.status).toBe(200);
    const slug = pub.body.portfolio.slug;
    const token = pub.body.portfolio.shareToken;
    expect(token).toBeTruthy();
    expect(pub.body.portfolio.sharePath).toBe(`/p/${slug}?token=${token}`);

    expect((await anon.get(`/api/portfolio/public/${slug}`)).status).toBe(404);
    expect((await anon.get(`/api/portfolio/public/${slug}?token=wrong`)).status).toBe(404);
    const ok = await anon.get(`/api/portfolio/public/${slug}?token=${token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.owner.name).toBe('Uma Unlisted');

    const rot = await c.post('/api/portfolio/share-token/rotate');
    expect(rot.body.shareToken).not.toBe(token);
    expect((await anon.get(`/api/portfolio/public/${slug}?token=${token}`)).status).toBe(404);
    expect((await anon.get(`/api/portfolio/public/${slug}?token=${rot.body.shareToken}`)).status).toBe(200);

    await c.post('/api/portfolio/unpublish');
    expect((await anon.get(`/api/portfolio/public/${slug}?token=${rot.body.shareToken}`)).status).toBe(404);
  });

  it('updates content with validation, keeps slugs unique, versions on publish and restores', async () => {
    const a = await registerUser(ctx.app, 'Ann Author', 'ann@example.test');
    const b = await registerUser(ctx.app, 'Ben Builder', 'ben@example.test');
    await b.get('/api/portfolio');
    const taken = await a.patch('/api/portfolio', { slug: 'ben-builder' });
    expect(taken.status).toBe(409);
    expect((await a.patch('/api/portfolio', { slug: 'Bad Slug!' })).status).toBe(400);
    expect((await a.patch('/api/portfolio', { slug: 'admin' })).status).toBe(400);

    const v1 = await a.patch('/api/portfolio', { headline: 'Backend developer in training', writing: [{ title: 'How I test APIs', url: 'https://example.test/post' }] });
    expect(v1.status).toBe(200);
    const p1 = await a.post('/api/portfolio/publish', { visibility: 'public' });
    expect(p1.body.version).toBe(2);
    await a.patch('/api/portfolio', { headline: 'Changed headline' });
    await a.post('/api/portfolio/publish', { visibility: 'public' });
    const versions = await a.get('/api/portfolio/versions');
    expect(versions.body.items.length).toBe(2);
    const restored = await a.post(`/api/portfolio/versions/${p1.body.version}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.portfolio.headline).toBe('Backend developer in training');

    // Hidden sections and evidence are not exposed publicly.
    const sections = restored.body.portfolio.sections.map((s: any) => ({ key: s.key, visible: s.key !== 'writing' }));
    await a.patch('/api/portfolio', { sections });
    const anon = client(ctx.app);
    const pub = await anon.get(`/api/portfolio/public/${restored.body.portfolio.slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.writing).toEqual([]);
    expect(pub.body.sections.some((s: any) => s.key === 'writing')).toBe(false);

    // Another user's versions are not reachable.
    expect((await b.post(`/api/portfolio/versions/${p1.body.version}/restore`)).status).toBe(404);
    // Cannot feature someone else's project.
    const proj = await b.post('/api/projects', { title: 'Ben secret project' });
    expect((await a.patch('/api/portfolio', { featuredProjectIds: [proj.body.project.id] })).status).toBe(400);
  });
});

describe('portfolio evidence and certificates', () => {
  it('separates reviewer-verified projects from self-completed ones and feeds the resume endpoint', async () => {
    const owner = await registerUser(ctx.app, 'Eve Evidence', 'eve@example.test');
    const reviewer = await registerUser(ctx.app, 'Rex Review', 'rex@example.test');
    const p1 = (await owner.post('/api/projects/templates/habit-tracker-with-auth/start', { mode: 'guided' })).body.project.id;
    const p2 = (await owner.post('/api/projects/templates/cli-todo-app/start', { mode: 'guided' })).body.project.id;
    await owner.post(`/api/projects/${p1}/members`, { email: 'rex@example.test', role: 'reviewer' });
    const inv = await reviewer.get('/api/projects/invites');
    await reviewer.post(`/api/projects/invites/${inv.body.items[0].id}/accept`);
    const d = await reviewer.get(`/api/projects/${p1}`);
    await reviewer.post(`/api/projects/${p1}/reviews`, { kind: 'approval', body: 'Auth flow and tests verified in review.', confirmedSkillIds: d.body.skills.map((s: any) => s.id) });
    await owner.post(`/api/projects/${p2}/complete`);

    const me = await owner.get('/api/portfolio');
    const projs = me.body.evidence.projects;
    expect(projs.find((p: any) => p.id === p1).verification).toBe('verified_by_reviewer');
    expect(projs.find((p: any) => p.id === p1).reviewerName).toBe('Rex Review');
    expect(projs.find((p: any) => p.id === p2).verification).toBe('self_completed');
    const verified = me.body.evidence.skills.filter((s: any) => s.provenance === 'verified');
    expect(verified.length).toBeGreaterThan(0);
    expect(verified[0].lastVerifiedAt).toBeTruthy();

    // Private projects are not shown publicly unless featured.
    await owner.post('/api/portfolio/publish', { visibility: 'public' });
    const anon = client(ctx.app);
    let pub = await anon.get(`/api/portfolio/public/${me.body.portfolio.slug}`);
    expect(pub.body.projects.length).toBe(0);
    await owner.patch('/api/portfolio', { featuredProjectIds: [p1] });
    pub = await anon.get(`/api/portfolio/public/${me.body.portfolio.slug}`);
    expect(pub.body.projects.map((p: any) => p.id)).toEqual([p1]);
    expect(pub.body.projects[0].publicPath).toBeNull(); // project itself is private: card only, no link
    // Hidden evidence is removed from the public view.
    await owner.patch('/api/portfolio', { hiddenEvidenceIds: [verified[0].skillId] });
    pub = await anon.get(`/api/portfolio/public/${me.body.portfolio.slug}`);
    expect(pub.body.skills.some((s: any) => s.skillId === verified[0].skillId)).toBe(false);

    const res = await owner.get('/api/portfolio/evidence-for-resume');
    expect(res.status).toBe(200);
    expect(res.body.projects.find((p: any) => p.projectId === p1).verification).toBe('verified_by_reviewer');
    expect(res.body.verifiedSkills.length).toBeGreaterThan(0);

    const md = await owner.get('/api/portfolio/summary.md');
    expect(md.status).toBe(200);
    expect(typeof md.body).toBe('string');
    expect(md.body).toContain('# Eve Evidence');
    expect(md.body).toContain('Completion approved by reviewer');
  });

  it('external certificates are self-reported; platform certificates verify with facts only', async () => {
    const c = await registerUser(ctx.app, 'Cy Certs', 'cy@example.test');
    const anon = client(ctx.app);
    const bad = await c.post('/api/portfolio/certificates', { title: '', issuer: 'X', issuedAt: '2025-01-01' });
    expect(bad.status).toBe(400);
    const ext = await c.post('/api/portfolio/certificates', { title: 'Cloud Practitioner', issuer: 'Some Vendor', issuedAt: '2025-01-15', credentialUrl: 'https://example.test/cred' });
    expect(ext.status).toBe(201);
    expect(ext.body.certificate.kind).toBe('external_self_reported');
    expect(ext.body.certificate.verificationCode).toBeNull();

    // Complete every topic of a track → platform completion record.
    const [t] = await db.select().from(tracks).where(eq(tracks.slug, 'programming-foundations-python'));
    const ts = await db.select().from(topics).where(eq(topics.trackId, t.id));
    await db.insert(enrollments).values({ userId: c.userId, trackId: t.id });
    expect(await issueTrackCertificateIfComplete(c.userId, t.id)).toBeNull();
    await db.insert(topicProgress).values(ts.map((x) => ({ userId: c.userId, topicId: x.id, status: 'completed', completedAt: new Date(), mastery: 1 })));
    const me = await c.get('/api/portfolio'); // lazily syncs track certificates
    const platform = me.body.evidence.certificates.find((x: any) => x.kind === 'platform_completion');
    expect(platform).toBeTruthy();
    expect(platform.label).toMatch(/not an accredited qualification/);
    expect(me.body.evidence.certificates.find((x: any) => x.kind === 'external_self_reported').label).toMatch(/Self-reported/);
    // Idempotent.
    await c.get('/api/portfolio');
    expect((await db.select().from(certificates).where(eq(certificates.userId, c.userId))).length).toBe(2);

    const v = await anon.get(`/api/portfolio/verify/${platform.verificationCode}`);
    expect(v.status).toBe(200);
    expect(v.body.valid).toBe(true);
    expect(Object.keys(v.body.certificate).sort()).toEqual(['basis', 'holderName', 'issuedAt', 'issuer', 'statement', 'title', 'verificationCode']);
    expect(v.body.certificate.holderName).toBe('Cy Certs');
    expect(JSON.stringify(v.body)).not.toContain(c.userId);
    expect(JSON.stringify(v.body)).not.toContain('cy@example.test');
    expect((await anon.get('/api/portfolio/verify/LSN-AAAA-BBBB-CCCC')).status).toBe(404);
    expect((await anon.get('/api/portfolio/verify/garbage')).status).toBe(404);

    // Platform records cannot be deleted (only hidden); external ones can, by their owner only.
    const other = await registerUser(ctx.app, 'Oli Other', 'oli@example.test');
    expect((await other.del(`/api/portfolio/certificates/${ext.body.certificate.id}`)).status).toBe(404);
    expect((await c.del(`/api/portfolio/certificates/${platform.id}`)).status).toBe(404);
    expect((await c.del(`/api/portfolio/certificates/${ext.body.certificate.id}`)).status).toBe(200);
  });
});
