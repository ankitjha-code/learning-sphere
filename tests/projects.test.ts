import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { resetRateLimits } from '../server/lib/ratelimit';
import { setupTestApp, registerUser } from './helpers';
import { seedReference } from '../server/db/seed/reference';
import { db } from '../server/db/client';
import { organizations, memberships, projectTemplates, skillEvidence, activityEvents, certificates } from '../server/db/schema';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
  await seedReference();
});
afterAll(async () => ctx.close());
// Many accounts are registered from one test IP; the signup limiter is not what these tests cover.
beforeEach(() => resetRateLimits());

async function start(c: Awaited<ReturnType<typeof registerUser>>, slug = 'library-rest-api', mode = 'guided') {
  const r = await c.post(`/api/projects/templates/${slug}/start`, { mode });
  expect(r.status).toBe(201);
  return r.body.project.id as string;
}

async function xpFor(userId: string, kind: string) {
  const rows = await db.select().from(activityEvents).where(and(eq(activityEvents.userId, userId), eq(activityEvents.kind, kind)));
  return rows.reduce((s, r) => s + r.xp, 0);
}

describe('ProjectForge templates', () => {
  it('lists and filters templates', async () => {
    const c = await registerUser(ctx.app, 'Tia Browse', 'tia@example.test');
    const all = await c.get('/api/projects/templates');
    expect(all.status).toBe(200);
    expect(all.body.items.length).toBeGreaterThanOrEqual(20);
    const caps = await c.get('/api/projects/templates?capstone=true');
    expect(caps.body.items.length).toBeGreaterThan(0);
    expect(caps.body.items.every((t: any) => t.isCapstone)).toBe(true);
    const api = await c.get('/api/projects/templates?category=api');
    expect(api.body.items.some((t: any) => t.slug === 'library-rest-api')).toBe(true);
    const detail = await c.get('/api/projects/templates/library-rest-api');
    expect(detail.body.template.requirements.length).toBeGreaterThan(0);
    expect((await c.get('/api/projects/templates/nope')).status).toBe(404);
  });

  it('starting from a template copies requirements, milestones (with due dates) and tasks', async () => {
    const c = await registerUser(ctx.app, 'Sam Starter', 'sam@example.test');
    const id = await start(c);
    const [t] = await db.select().from(projectTemplates).where(eq(projectTemplates.slug, 'library-rest-api'));
    const r = await c.get(`/api/projects/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.project.requirements.length).toBe(t.requirements.length);
    expect(r.body.project.requirements[0].acceptance.length).toBeGreaterThan(0);
    expect(r.body.project.requirements.every((x: any) => x.done === false)).toBe(true);
    expect(r.body.milestones.length).toBe(t.milestones.length);
    expect(r.body.milestones.every((m: any) => m.dueAt)).toBe(true);
    const taskCount = t.milestones.reduce((s, m) => s + m.tasks.length, 0);
    expect(r.body.tasks.length).toBe(taskCount);
    expect(r.body.guide.mode).toBe('guided');
    expect(r.body.skills.length).toBeGreaterThan(0);
    expect(r.body.progress.percent).toBe(0);
    expect(r.body.access.isOwner).toBe(true);

    // Independent mode hides template hints: no tasks, no acceptance criteria, no guide.
    const ind = await start(c, 'cli-todo-app', 'independent');
    const ri = await c.get(`/api/projects/${ind}`);
    expect(ri.body.tasks.length).toBe(0);
    expect(ri.body.project.requirements.every((x: any) => x.acceptance.length === 0)).toBe(true);
    expect(ri.body.guide).toBeNull();

    const list = await c.get('/api/projects');
    expect(list.body.items.length).toBe(2);
    expect(list.body.total).toBe(2);
  });

  it('creates blank projects and validates input', async () => {
    const c = await registerUser(ctx.app, 'Bea Blank', 'bea@example.test');
    const bad = await c.post('/api/projects', { title: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields.title).toBeTruthy();
    const ok = await c.post('/api/projects', { title: 'My own idea', category: 'devtools', skillSlugs: ['git'] });
    expect(ok.status).toBe(201);
    expect(ok.body.project.mode).toBe('independent');
    expect(ok.body.project.skillIds.length).toBe(1);
  });
});

describe('ProjectForge access control and teamwork', () => {
  it('non-members get 404; members can update tasks but cannot delete the project', async () => {
    const owner = await registerUser(ctx.app, 'Olive Owner', 'olive@example.test');
    const member = await registerUser(ctx.app, 'Max Member', 'max@example.test');
    const stranger = await registerUser(ctx.app, 'Sid Stranger', 'sid@example.test');
    const id = await start(owner);

    expect((await stranger.get(`/api/projects/${id}`)).status).toBe(404);
    expect((await stranger.patch(`/api/projects/${id}`, { title: 'Hacked title' })).status).toBe(404);
    expect((await stranger.post(`/api/projects/${id}/ai/readme`, {})).status).toBe(404);

    // Invite an unknown email fails clearly.
    const unknown = await owner.post(`/api/projects/${id}/members`, { email: 'nobody@example.test', role: 'member' });
    expect(unknown.status).toBe(400);
    // Only the owner invites.
    expect((await stranger.post(`/api/projects/${id}/members`, { email: 'max@example.test' })).status).toBe(404);

    const inv = await owner.post(`/api/projects/${id}/members`, { email: 'max@example.test', role: 'member' });
    expect(inv.status).toBe(201);
    // Pending invite does not grant access yet.
    expect((await member.get(`/api/projects/${id}`)).status).toBe(404);
    const invites = await member.get('/api/projects/invites');
    expect(invites.body.items.length).toBe(1);
    expect((await member.post(`/api/projects/invites/${invites.body.items[0].id}/accept`)).status).toBe(200);

    const detail = await member.get(`/api/projects/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.access.canEdit).toBe(true);
    expect(detail.body.access.isOwner).toBe(false);
    const task = detail.body.tasks[0];
    const upd = await member.patch(`/api/projects/${id}/tasks/${task.id}`, { status: 'done', assigneeId: member.userId });
    expect(upd.status).toBe(200);
    expect(upd.body.task.status).toBe('done');
    // Assignee must be on the team.
    expect((await member.patch(`/api/projects/${id}/tasks/${task.id}`, { assigneeId: stranger.userId })).status).toBe(400);
    const bug = await member.post(`/api/projects/${id}/tasks`, { title: 'Loan endpoint returns 500 on missing id', kind: 'bug', priority: 'high' });
    expect(bug.status).toBe(201);

    expect((await member.del(`/api/projects/${id}`)).status).toBe(403);
    expect((await member.patch(`/api/projects/${id}/sharing`, { visibility: 'public' })).status).toBe(403);
    expect((await member.patch(`/api/projects/${id}`, { mode: 'independent' })).status).toBe(403);
    // Members cannot review (only mentors/reviewers/faculty).
    expect((await member.post(`/api/projects/${id}/reviews`, { kind: 'approval', body: 'Looks good to me, approving.' })).status).toBe(403);

    // Progress reflects done work.
    const after = await owner.get(`/api/projects/${id}`);
    expect(after.body.progress.percent).toBeGreaterThan(0);
    expect(after.body.progress.parts.find((p: any) => p.key === 'tasks').done).toBe(1);

    expect((await owner.del(`/api/projects/${id}`)).status).toBe(200);
    expect((await owner.get(`/api/projects/${id}`)).status).toBe(404);
  });

  it('milestone completion grants XP once and notifies the team', async () => {
    const c = await registerUser(ctx.app, 'Mia Milestone', 'mia@example.test');
    const id = await start(c);
    const d = await c.get(`/api/projects/${id}`);
    const mid = d.body.milestones[0].id;
    const first = await c.post(`/api/projects/${id}/milestones/${mid}/complete`);
    expect(first.body.xpAwarded).toBe(true);
    await c.post(`/api/projects/${id}/milestones/${mid}/reopen`);
    const again = await c.post(`/api/projects/${id}/milestones/${mid}/complete`);
    expect(again.body.xpAwarded).toBe(false);
    expect(await xpFor(c.userId, 'project.milestone')).toBe(40);
  });
});

describe('ProjectForge completion and evidence', () => {
  it('owner self-completion records unverified project evidence and XP once', async () => {
    const c = await registerUser(ctx.app, 'Sol Self', 'sol@example.test');
    const id = await start(c);
    const r = await c.post(`/api/projects/${id}/complete`);
    expect(r.status).toBe(200);
    expect(r.body.project.status).toBe('completed');
    const ev = await db.select().from(skillEvidence).where(and(eq(skillEvidence.userId, c.userId), eq(skillEvidence.sourceId, id)));
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.every((e) => e.source === 'project' && e.verified === false && e.score === 0.6 && e.verifiedBy === null)).toBe(true);
    const again = await c.post(`/api/projects/${id}/complete`);
    expect(again.body.alreadyCompleted).toBe(true);
    expect(await xpFor(c.userId, 'project.completed')).toBe(100);
    // Owners can never review their own project.
    expect((await c.post(`/api/projects/${id}/reviews`, { kind: 'approval', body: 'I approve my own work here.' })).status).toBe(403);
  });

  it('reviewer approval records verified evidence with verifiedBy, XP once, and supersedes self-claims', async () => {
    const owner = await registerUser(ctx.app, 'Ria Reviewed', 'ria@example.test');
    const reviewer = await registerUser(ctx.app, 'Raj Reviewer', 'raj@example.test');
    const id = await start(owner);
    await owner.post(`/api/projects/${id}/members`, { email: 'raj@example.test', role: 'reviewer' });
    const inv = await reviewer.get('/api/projects/invites');
    await reviewer.post(`/api/projects/invites/${inv.body.items[0].id}/accept`);

    // Owner self-completes first (unverified), then asks for review.
    await owner.post(`/api/projects/${id}/complete`);
    const rr = await owner.post(`/api/projects/${id}/review-request`, { note: 'Please review' });
    expect(rr.status).toBe(200);
    expect(rr.body.notified).toBe(1);

    const detail = await reviewer.get(`/api/projects/${id}`);
    expect(detail.body.access.canReview).toBe(true);
    const skillIds = detail.body.skills.slice(0, 2).map((s: any) => s.id);

    const fb = await reviewer.post(`/api/projects/${id}/reviews`, { kind: 'code_review', body: 'Error handling middleware is consistent. Add an index on loans.due_at.' });
    expect(fb.status).toBe(201);
    const bad = await reviewer.post(`/api/projects/${id}/reviews`, { kind: 'approval', body: 'Approving this project now.', confirmedSkillIds: ['00000000-0000-4000-8000-000000000000'] });
    expect(bad.status).toBe(400);

    const ap = await reviewer.post(`/api/projects/${id}/reviews`, {
      kind: 'approval',
      body: 'All acceptance criteria demonstrated in the walkthrough.',
      rubricScores: [
        { criterion: 'Correctness', points: 9, max: 10 },
        { criterion: 'Testing', points: 7, max: 10 },
      ],
      confirmedSkillIds: skillIds,
    });
    expect(ap.status).toBe(201);
    expect(ap.body.evidenceCount).toBe(2);

    const ev = await db.select().from(skillEvidence).where(and(eq(skillEvidence.userId, owner.userId), eq(skillEvidence.sourceId, id)));
    expect(ev.length).toBe(2); // unverified self-claims replaced by reviewer evidence
    for (const e of ev) {
      expect(e.source).toBe('review');
      expect(e.sourceType).toBe('project');
      expect(e.verified).toBe(true);
      expect(e.verifiedBy).toBe(reviewer.userId);
      expect(e.score).toBeCloseTo(0.8);
    }
    const p = await owner.get(`/api/projects/${id}`);
    expect(p.body.project.status).toBe('completed');
    expect(p.body.project.approvedBy).toBe(reviewer.userId);
    expect(await xpFor(owner.userId, 'project.completed')).toBe(100);

    // Second approval is rejected.
    expect((await reviewer.post(`/api/projects/${id}/reviews`, { kind: 'approval', body: 'Approve again please.' })).status).toBe(409);
  });

  it('approved capstones issue a platform completion certificate', async () => {
    const owner = await registerUser(ctx.app, 'Cal Capstone', 'cal@example.test');
    const mentor = await registerUser(ctx.app, 'Meg Mentor', 'meg@example.test');
    const id = await start(owner, 'capstone-ai-study-platform', 'partial');
    await owner.post(`/api/projects/${id}/members`, { email: 'meg@example.test', role: 'mentor' });
    const inv = await mentor.get('/api/projects/invites');
    await mentor.post(`/api/projects/invites/${inv.body.items[0].id}/accept`);
    await mentor.post(`/api/projects/${id}/reviews`, { kind: 'approval', body: 'Capstone meets every requirement.', confirmedSkillIds: [] });
    const certs = await db.select().from(certificates).where(eq(certificates.userId, owner.userId));
    expect(certs.length).toBe(1);
    expect(certs[0].kind).toBe('platform_completion');
    expect(certs[0].issuer).toMatch(/not an accredited qualification/);
    expect(certs[0].verificationCode).toMatch(/^LSN-/);
  });
});

describe('ProjectForge org capstones', () => {
  it('faculty assign capstones in their org; other orgs cannot see them', async () => {
    const faculty = await registerUser(ctx.app, 'Fay Faculty', 'fay@example.test');
    const student = await registerUser(ctx.app, 'Stu Student', 'stu@example.test');
    const otherFaculty = await registerUser(ctx.app, 'Oz Other', 'oz@example.test');
    const [org] = await db.insert(organizations).values({ name: 'Test College', slug: 'test-college', kind: 'college' }).returning();
    const [org2] = await db.insert(organizations).values({ name: 'Other College', slug: 'other-college', kind: 'college' }).returning();
    await db.insert(memberships).values([
      { orgId: org.id, userId: faculty.userId, roles: ['faculty'] },
      { orgId: org.id, userId: student.userId, roles: ['student'] },
      { orgId: org2.id, userId: otherFaculty.userId, roles: ['faculty'] },
    ]);
    await faculty.post('/api/auth/switch', { orgId: org.id });
    await otherFaculty.post('/api/auth/switch', { orgId: org2.id });

    const r = await faculty.post('/api/projects/capstones', { templateSlug: 'capstone-ml-prediction-service', studentIds: [student.userId], reviewerId: faculty.userId });
    expect(r.status).toBe(201);
    const pid = r.body.projectIds[0];
    const notStudent = await faculty.post('/api/projects/capstones', { templateSlug: 'capstone-ml-prediction-service', studentIds: [otherFaculty.userId] });
    expect(notStudent.status).toBe(400);

    const mine = await student.get(`/api/projects/${pid}`);
    expect(mine.status).toBe(200);
    expect(mine.body.project.orgId).toBe(org.id);
    expect((await student.del(`/api/projects/${pid}`)).status).toBe(403);

    const fac = await faculty.get(`/api/projects/${pid}`);
    expect(fac.status).toBe(200);
    expect(fac.body.access.canReview).toBe(true);
    expect((await faculty.get('/api/projects/capstones')).body.items.length).toBe(1);

    expect((await otherFaculty.get(`/api/projects/${pid}`)).status).toBe(404);
    expect((await otherFaculty.get('/api/projects/capstones')).body.items.length).toBe(0);
    expect((await student.post('/api/projects/capstones', { templateSlug: 'cli-todo-app', studentIds: [student.userId] })).status).toBe(403);
  });
});

describe('ProjectForge sharing, generators and AI', () => {
  it('public, unlisted (token, revocable) and private project pages', async () => {
    const c = await registerUser(ctx.app, 'Pia Public', 'pia@example.test');
    const anon = (await import('./helpers')).client(ctx.app);
    const id = await start(c);
    await c.patch(`/api/projects/${id}/notes`, { privateNotes: 'secret plan' });
    expect((await anon.get(`/api/projects/public/${id}`)).status).toBe(404);

    const un = await c.patch(`/api/projects/${id}/sharing`, { visibility: 'unlisted' });
    expect(un.body.shareToken).toBeTruthy();
    expect((await anon.get(`/api/projects/public/${id}`)).status).toBe(404);
    const withToken = await anon.get(`/api/projects/public/${id}?token=${un.body.shareToken}`);
    expect(withToken.status).toBe(200);
    expect(JSON.stringify(withToken.body)).not.toContain('secret plan');
    expect(withToken.body.tasks).toBeNull();
    const rot = await c.post(`/api/projects/${id}/share-token`);
    expect((await anon.get(`/api/projects/public/${id}?token=${un.body.shareToken}`)).status).toBe(404);
    expect((await anon.get(`/api/projects/public/${id}?token=${rot.body.shareToken}`)).status).toBe(200);

    await c.patch(`/api/projects/${id}/sharing`, { visibility: 'public', showTasksPublic: true });
    const pub = await anon.get(`/api/projects/public/${id}`);
    expect(pub.status).toBe(200);
    expect(Array.isArray(pub.body.tasks)).toBe(true);
    expect(pub.body.verification).toBeNull();
  });

  it('generates a README from project data only and AI endpoints fail gracefully', async () => {
    const c = await registerUser(ctx.app, 'Reid Readme', 'reid@example.test');
    const id = await start(c);
    const d = await c.get(`/api/projects/${id}`);
    const req = d.body.project.requirements[0];
    await c.patch(`/api/projects/${id}/requirements/${req.id}`, { done: true });
    await c.patch(`/api/projects/${id}/docs`, { section: 'architecture', content: 'Hono API with Postgres.' });
    const g = await c.get(`/api/projects/${id}/generate?kind=readme`);
    expect(g.status).toBe(200);
    expect(g.body.markdown).toContain(req.text);
    expect(g.body.markdown).toContain('Hono API with Postgres.');
    expect(g.body.markdown).toContain('Not documented yet');
    const cs = await c.get(`/api/projects/${id}/generate?kind=case_study`);
    expect(cs.body.markdown).toMatch(/^# Case study/);

    const ai1 = await c.post(`/api/projects/${id}/ai/review-requirements`);
    expect(ai1.status).toBe(200);
    expect(ai1.body.ok).toBe(false);
    expect(ai1.body.reason).toBeTruthy();
    const ai2 = await c.post(`/api/projects/${id}/ai/readme`, { kind: 'readme' });
    expect(ai2.status).toBe(200);
    expect(ai2.body.ok).toBe(false);
    expect(ai2.body.fallback).toContain(req.text);
    // Nothing was auto-saved into docs.
    const after = await c.get(`/api/projects/${id}`);
    expect(after.body.project.docs.readme).toBeUndefined();
  });
});

describe('ProjectForge screenshots (files integration)', () => {
  it('attaches uploaded images; team and shared pages can load them, strangers cannot', async () => {
    const owner = await registerUser(ctx.app, 'Shay Shots', 'shay@example.test');
    const stranger = await registerUser(ctx.app, 'Nia Nosy', 'nia@example.test');
    const anon = (await import('./helpers')).client(ctx.app);
    const id = await start(owner, 'cli-todo-app');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'shot.png');
    form.append('purpose', 'project');
    const up = await ctx.app.request('/api/files', { method: 'POST', headers: { origin: 'http://localhost:5317', cookie: owner.cookie }, body: form });
    expect(up.status).toBe(201);
    const fileId = (await up.json()).file.id as string;

    expect((await stranger.post(`/api/projects/${id}/screenshots/files`, { fileId })).status).toBe(404);
    const att = await owner.post(`/api/projects/${id}/screenshots/files`, { fileId, caption: 'Home screen' });
    expect(att.status).toBe(201);
    expect(att.body.screenshotLinks[0].fileId).toBe(fileId);

    const strangerGet = await ctx.app.request(`/api/files/${fileId}`, { headers: { cookie: stranger.cookie } });
    expect(strangerGet.status).toBe(404);
    expect((await anon.get(`/api/projects/public/${id}/files/${fileId}`)).status).toBe(404); // private project

    await owner.patch(`/api/projects/${id}/sharing`, { visibility: 'public' });
    const pub = await anon.get(`/api/projects/public/${id}`);
    expect(pub.body.project.screenshots[0].url).toBe(`/api/projects/public/${id}/files/${fileId}`);
    const img = await ctx.app.request(`/api/projects/public/${id}/files/${fileId}`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');

    // Removing it from the list detaches it.
    const put = await owner.put(`/api/projects/${id}/screenshots`, { links: [] });
    expect(put.status).toBe(200);
    expect((await ctx.app.request(`/api/projects/public/${id}/files/${fileId}`)).status).toBe(404);
  });
});
