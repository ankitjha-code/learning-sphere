import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { setupTestApp, registerUser } from './helpers';
import { seedReference } from '../server/db/seed/reference';
import { db } from '../server/db/client';
import { organizations, memberships, resources, reports, notes, users, notifications, questions, auditLogs, skills, topics, files } from '../server/db/schema';
import { LIBRARY_RESOURCES } from '../server/db/seed/content/resources';
import { seedLibraryResources } from '../server/db/seed/resources-seed';
import { resetRateLimits } from '../server/lib/ratelimit';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
  // drizzle-kit's schema generator (used by the test helper) adds an enumerable
  // Array.prototype.random, which pdf.js rejects. Production never loads drizzle-kit.
  delete (Array.prototype as unknown as Record<string, unknown>).random;
  await seedReference();
}, 180_000);
afterAll(async () => ctx.close());
// Many accounts register from one test "IP"; the register limiter is not under test here.
beforeEach(() => resetRateLimits());

async function makeOrg(slug: string) {
  const [o] = await db.insert(organizations).values({ name: slug.toUpperCase(), slug, kind: 'college' }).returning();
  return o.id;
}
async function join(orgId: string, userId: string, roles: string[]) {
  await db.insert(memberships).values({ orgId, userId, roles });
}
async function makePlatformAdmin(userId: string) {
  await db.update(users).set({ platformRole: 'platform_admin' }).where(eq(users.id, userId));
}
async function upload(cookie: string, path: string, filename: string, data: Buffer, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(data)]), filename);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await ctx.app.request(path, { method: 'POST', headers: { origin: 'http://localhost:5317', cookie }, body: form });
  return { status: res.status, body: (await res.json()) as any };
}
function minimalPdf(text: string) {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

describe('curated library seed', () => {
  it('seeds the public library idempotently with attribution', async () => {
    const rows = await db.select().from(resources).where(and(isNull(resources.orgId), isNull(resources.authorId)));
    expect(rows.length).toBe(LIBRARY_RESOURCES.length);
    expect(rows.length).toBeGreaterThanOrEqual(40);
    expect(rows.every((r) => r.sourceName && (r.url?.startsWith('https://') || r.body))).toBe(true);
    const again = await seedLibraryResources();
    expect(again.created).toBe(0);
    const after = await db.select().from(resources).where(and(isNull(resources.orgId), isNull(resources.authorId)));
    expect(after.length).toBe(rows.length);
  });
});

describe('library: browse, visibility, ratings, bookmarks, reports', () => {
  let orgA: string;
  let orgResourceId: string;
  let draftId: string;
  beforeAll(async () => {
    orgA = await makeOrg('lib-org-a');
    const [r] = await db
      .insert(resources)
      .values({ orgId: orgA, kind: 'article', title: 'Northbridge lab safety guide', summary: 'Internal guide for lab sessions.', body: '# Lab rules\nWear goggles.', sourceName: 'Org A', topics: ['labs'], status: 'published' })
      .returning();
    orgResourceId = r.id;
    const [d] = await db.insert(resources).values({ kind: 'article', title: 'Unpublished public draft', summary: 'x', body: 'draft', status: 'draft' }).returning();
    draftId = d.id;
  });

  it('shows org resources only to members and never drafts', async () => {
    const member = await registerUser(ctx.app, 'Org Member', 'member@lib.test');
    const outsider = await registerUser(ctx.app, 'Outsider', 'outsider@lib.test');
    await join(orgA, member.userId, ['student']);

    const m = await member.get('/api/library/resources?scope=org');
    expect(m.status).toBe(200);
    expect(m.body.items.map((i: any) => i.id)).toContain(orgResourceId);
    expect(m.body.items[0].orgName).toBe('LIB-ORG-A');
    const o = await outsider.get('/api/library/resources?q=lab%20safety');
    expect(o.body.items.map((i: any) => i.id)).not.toContain(orgResourceId);
    expect((await outsider.get(`/api/library/resources/${orgResourceId}`)).status).toBe(404);
    expect((await member.get(`/api/library/resources/${draftId}`)).status).toBe(404);
    expect((await outsider.get('/api/library/resources?scope=org')).body.total).toBe(0);
  });

  it('searches, filters and sorts', async () => {
    const u = await registerUser(ctx.app, 'Searcher', 'search@lib.test');
    const sql = await u.get('/api/library/resources?q=sql');
    expect(sql.body.total).toBeGreaterThan(0);
    const cheat = await u.get('/api/library/resources?kind=cheatsheet');
    expect(cheat.body.items.every((i: any) => i.kind === 'cheatsheet')).toBe(true);
    expect(cheat.body.items.length).toBeGreaterThanOrEqual(6);
    const bySkill = await u.get('/api/library/resources?skill=git');
    expect(bySkill.body.items.every((i: any) => i.skills.some((s: any) => s.slug === 'git'))).toBe(true);
    const facets = await u.get('/api/library/facets');
    expect(facets.body.kinds.length).toBeGreaterThan(2);
    expect(facets.body.skills[0]).toHaveProperty('label');
    expect((await u.get('/api/library/resources?kind=podcast')).status).toBe(400);
  });

  it('records views and history, and computes ratings exactly', async () => {
    const a = await registerUser(ctx.app, 'Rater A', 'ratera@lib.test');
    const b = await registerUser(ctx.app, 'Rater B', 'raterb@lib.test');
    const [target] = await db.select().from(resources).where(eq(resources.kind, 'cheatsheet')).limit(1);
    const d = await a.get(`/api/library/resources/${target.id}`);
    expect(d.status).toBe(200);
    expect(d.body.resource.body).toBeTruthy();
    expect(d.body.resource.viewCount).toBe(target.viewCount + 1);

    expect((await a.post(`/api/library/resources/${target.id}/rate`, { rating: 5 })).body.ratingAvg).toBe(5);
    const r2 = await b.post(`/api/library/resources/${target.id}/rate`, { rating: 3 });
    expect(r2.body).toMatchObject({ ratingAvg: 4, ratingCount: 2 });
    const r3 = await a.post(`/api/library/resources/${target.id}/rate`, { rating: 1 });
    expect(r3.body).toMatchObject({ ratingAvg: 2, ratingCount: 2, myRating: 1 });
    const [row] = await db.select().from(resources).where(eq(resources.id, target.id));
    expect(row.ratingSum).toBe(4);
    expect(row.ratingCount).toBe(2);
    expect((await a.post(`/api/library/resources/${target.id}/rate`, { rating: 6 })).status).toBe(400);

    const hist = await a.get('/api/library/history');
    expect(hist.body.items[0].resource.id).toBe(target.id);
    await a.post(`/api/library/resources/${target.id}/complete`, { completed: true });
    expect((await a.get('/api/library/history?completed=true')).body.total).toBe(1);
    expect((await b.get('/api/library/history?completed=true')).body.total).toBe(0);

    const dl = await ctx.app.request(`/api/library/resources/${target.id}/download`, { headers: { cookie: a.cookie } });
    expect(dl.status).toBe(200);
    expect(dl.headers.get('content-disposition')).toMatch(/attachment/);
    const related = await a.get(`/api/library/resources/${target.id}/related`);
    expect(related.status).toBe(200);
    expect(related.body.items.every((i: any) => i.id !== target.id)).toBe(true);
    const pre = await a.get(`/api/library/resources/${target.id}/prerequisites`);
    expect(pre.status).toBe(200);
  });

  it('bookmarks into collections, privately per user', async () => {
    const a = await registerUser(ctx.app, 'Collector', 'collector@lib.test');
    const b = await registerUser(ctx.app, 'Other Collector', 'collector2@lib.test');
    const list = await a.get('/api/library/resources?pageSize=3');
    const [r1, r2, r3] = list.body.items;
    await a.put(`/api/library/resources/${r1.id}/bookmark`, { collection: 'Interview prep' });
    await a.put(`/api/library/resources/${r2.id}/bookmark`, { collection: 'Interview prep' });
    const bm3 = await a.put(`/api/library/resources/${r3.id}/bookmark`, {});
    expect(bm3.body.bookmark.collection).toBeNull();
    const cols = await a.get('/api/library/collections');
    expect(cols.body.collections).toEqual(expect.arrayContaining([{ name: 'Interview prep', count: 2 }, { name: null, count: 1 }]));
    expect((await a.get('/api/library/bookmarks?collection=Interview%20prep')).body.items).toHaveLength(2);
    // Move between collections and unbookmark.
    expect((await a.patch(`/api/library/bookmarks/${bm3.body.bookmark.id}`, { collection: 'Later' })).status).toBe(200);
    expect((await b.patch(`/api/library/bookmarks/${bm3.body.bookmark.id}`, { collection: 'Mine' })).status).toBe(404);
    await a.del(`/api/library/resources/${r1.id}/bookmark`);
    expect((await a.get('/api/library/collections')).body.collections).toEqual(expect.arrayContaining([{ name: 'Interview prep', count: 1 }, { name: 'Later', count: 1 }]));
    expect((await b.get('/api/library/collections')).body.collections).toHaveLength(0);
    const card = (await a.get(`/api/library/resources/${r2.id}`)).body.resource;
    expect(card.bookmark.collection).toBe('Interview prep');
  });

  it('files correction reports without duplicates', async () => {
    const u = await registerUser(ctx.app, 'Reporter', 'reporter@lib.test');
    const [target] = await db.select().from(resources).where(and(isNull(resources.orgId), eq(resources.status, 'published'))).limit(1);
    expect((await u.post(`/api/library/resources/${target.id}/report`, { reason: 'outdated', details: 'short' })).status).toBe(400);
    const r = await u.post(`/api/library/resources/${target.id}/report`, { reason: 'outdated', details: 'The install steps changed in the latest version.' });
    expect(r.status).toBe(201);
    const again = await u.post(`/api/library/resources/${target.id}/report`, { reason: 'broken_link', details: 'Link now redirects to a different page.' });
    expect(again.body.updated).toBe(true);
    const rows = await db.select().from(reports).where(and(eq(reports.targetType, 'resource'), eq(reports.targetId, target.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toMatch(/broken_link/);
    expect((await u.post(`/api/library/resources/${draftId}/report`, { reason: 'other', details: 'Reporting a hidden draft.' })).status).toBe(404);
  });

  it('stores knowledge-base documents as private notes tagged knowledge', async () => {
    const u = await registerUser(ctx.app, 'Knower', 'knower@lib.test');
    const other = await registerUser(ctx.app, 'Not Knower', 'notknower@lib.test');
    const md = await upload(u.cookie, '/api/library/knowledge', 'graphs.md', Buffer.from('# Graphs\nBFS uses a queue.'));
    expect(md.body.error).toBeUndefined();
    expect(md.status).toBe(201);
    const pdf = await upload(u.cookie, '/api/library/knowledge', 'search.pdf', minimalPdf('Binary search halves the range'));
    expect(pdf.body.error).toBeUndefined();
    expect(pdf.status).toBe(201);
    expect(pdf.body.document.pages).toBe(1);
    const [note] = await db.select().from(notes).where(eq(notes.id, pdf.body.document.id));
    expect(note.tags).toEqual(['knowledge']);
    expect(note.linkType).toBe('file');
    expect(note.linkId).toBe(pdf.body.document.fileId);
    expect(note.body).toContain('Binary search halves the range');
    expect((await upload(u.cookie, '/api/library/knowledge', 'pic.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).status).toBe(400);

    const list = await u.get('/api/library/knowledge');
    expect(list.body.items).toHaveLength(2);
    expect((await other.get('/api/library/knowledge')).body.items).toHaveLength(0);
    // Knowledge docs stay out of the regular notes list.
    expect((await u.get('/api/workspace/notes')).body.items).toHaveLength(0);
    expect((await other.del(`/api/library/knowledge/${md.body.document.id}`)).status).toBe(404);
    expect((await u.del(`/api/library/knowledge/${md.body.document.id}`)).status).toBe(200);
    const [f] = await db.select().from(files).where(eq(files.id, md.body.document.fileId));
    expect(f.status).toBe('deleted');
  });
});

describe('create: org isolation, review workflow, versions, learning paths', () => {
  let orgA: string;
  let orgB: string;
  beforeAll(async () => {
    orgA = await makeOrg('create-org-a');
    orgB = await makeOrg('create-org-b');
  });

  it('keeps org drafts invisible to other orgs and publishes to members', async () => {
    const creatorA = await registerUser(ctx.app, 'Creator A', 'creator-a@create.test');
    const creatorB = await registerUser(ctx.app, 'Creator B', 'creator-b@create.test');
    const studentA = await registerUser(ctx.app, 'Student A', 'student-a@create.test');
    await join(orgA, creatorA.userId, ['creator']);
    await join(orgB, creatorB.userId, ['creator']);
    await join(orgA, studentA.userId, ['student']);
    await creatorA.post('/api/auth/switch', { orgId: orgA });
    await creatorB.post('/api/auth/switch', { orgId: orgB });

    // Validation: links need attribution; content is required.
    const noSource = await creatorA.post('/api/create/resources', { scope: 'org', kind: 'link', title: 'Some link', url: 'https://example.org/x' });
    expect(noSource.status).toBe(400);
    expect(noSource.body.error.details.fields.sourceName).toBeTruthy();
    expect((await creatorA.post('/api/create/resources', { scope: 'org', kind: 'article', title: 'Empty' })).status).toBe(400);
    expect((await studentA.post('/api/create/resources', { scope: 'org', kind: 'article', title: 'Student try', body: 'x' })).status).toBe(403);

    const created = await creatorA.post('/api/create/resources', { scope: 'org', kind: 'article', title: 'Recursion workbook', summary: 'Practice set', body: '# Recursion\nBase case first.', skillSlugs: ['recursion'], topics: ['recursion'] });
    expect(created.status).toBe(201);
    const id = created.body.resource.id;
    expect((await creatorB.get(`/api/create/resources/${id}`)).status).toBe(404);
    expect((await creatorB.patch(`/api/create/resources/${id}`, { title: 'Hijacked' })).status).toBe(404);
    expect((await creatorB.post(`/api/create/resources/${id}/publish`)).status).toBe(404);
    expect((await creatorB.get('/api/create/resources?scope=org')).body.items.map((i: any) => i.id)).not.toContain(id);
    expect((await studentA.get(`/api/library/resources/${id}`)).status).toBe(404);

    // Editing content snapshots the previous version and bumps the version number.
    const edit = await creatorA.patch(`/api/create/resources/${id}`, { body: '# Recursion\nBase case first, then shrink the input.' });
    expect(edit.body.versionBumped).toBe(true);
    expect(edit.body.resource.version).toBe(2);
    const meta = await creatorA.patch(`/api/create/resources/${id}`, { difficulty: 'intermediate' });
    expect(meta.body.versionBumped).toBe(false);
    const detail = await creatorA.get(`/api/create/resources/${id}`);
    expect(detail.body.versions).toHaveLength(1);
    expect(detail.body.versions[0].version).toBe(1);
    const v1 = await creatorA.get(`/api/create/resources/${id}/versions/${detail.body.versions[0].id}`);
    expect(v1.body.version.body).toBe('# Recursion\nBase case first.');

    expect((await creatorA.post(`/api/create/resources/${id}/publish`)).body.status).toBe('published');
    expect((await studentA.get(`/api/library/resources/${id}`)).status).toBe(200);
    await studentA.post(`/api/library/resources/${id}/complete`, { completed: true });
    const analytics = await creatorA.get(`/api/create/resources/${id}/analytics`);
    expect(analytics.body.analytics).toMatchObject({ views: 1, completions: 1 });
    expect((await creatorA.post(`/api/create/resources/${id}/archive`)).body.status).toBe('archived');
    expect((await studentA.get(`/api/library/resources/${id}`)).status).toBe(404);
  });

  it('routes community submissions through platform admin review', async () => {
    const author = await registerUser(ctx.app, 'Community Author', 'author@create.test');
    const admin = await registerUser(ctx.app, 'Platform Admin', 'admin@create.test');
    const learner = await registerUser(ctx.app, 'Learner', 'learner@create.test');
    await makePlatformAdmin(admin.userId);

    const c = await author.post('/api/create/resources', { scope: 'public', kind: 'link', title: 'Great SQL tutorial', summary: 'Free interactive lessons', url: 'https://sqlbolt.com/', sourceName: 'SQLBolt' });
    expect(c.status).toBe(201);
    const id = c.body.resource.id;
    expect((await author.post(`/api/create/resources/${id}/publish`)).status).toBe(403);
    expect((await author.post(`/api/create/resources/${id}/submit`, {})).body.status).toBe('in_review');
    expect((await learner.get(`/api/library/resources/${id}`)).status).toBe(404);
    expect((await author.patch(`/api/create/resources/${id}`, { title: 'Sneaky edit' })).status).toBe(409);

    expect((await learner.get('/api/create/review-queue')).status).toBe(403);
    const queue = await admin.get('/api/create/review-queue');
    expect(queue.body.items.map((i: any) => i.id)).toContain(id);
    expect((await admin.post(`/api/create/review/${id}`, { decision: 'reject' })).status).toBe(400);
    expect((await admin.post(`/api/create/review/${id}`, { decision: 'reject', note: 'Add a summary of what the lessons cover.' })).body.status).toBe('rejected');
    const notes1 = await db.select().from(notifications).where(eq(notifications.userId, author.userId));
    expect(notes1.some((n) => n.title.startsWith('Changes requested') && n.body?.includes('Add a summary'))).toBe(true);

    await author.patch(`/api/create/resources/${id}`, { summary: 'Free interactive SQL lessons from SELECT to joins.' });
    await author.post(`/api/create/resources/${id}/submit`, { note: 'Added summary' });
    expect((await admin.post(`/api/create/review/${id}`, { decision: 'approve', note: 'Thanks' })).body.status).toBe('published');
    expect((await learner.get(`/api/library/resources/${id}`)).status).toBe(200);
    const detail = await author.get(`/api/create/resources/${id}`);
    expect(detail.body.reviews.map((r: any) => r.decision)).toEqual(expect.arrayContaining(['submitted', 'rejected', 'approved']));
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.targetId, id));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['resource.review_rejected', 'resource.review_approved']));

    // A community edit after publication goes back to review.
    const edit = await author.patch(`/api/create/resources/${id}`, { title: 'Great SQL tutorial (updated)' });
    expect(edit.body.backToReview).toBe(true);
    expect((await learner.get(`/api/library/resources/${id}`)).status).toBe(404);
  });

  it('authors org learning paths with topics, quizzes, reorder and versioned publishing', async () => {
    const faculty = await registerUser(ctx.app, 'Faculty A', 'faculty-a@create.test');
    const facultyB = await registerUser(ctx.app, 'Faculty B', 'faculty-b@create.test');
    const studentA = await registerUser(ctx.app, 'Path Student', 'path-student@create.test');
    await join(orgA, faculty.userId, ['faculty']);
    await join(orgB, facultyB.userId, ['faculty']);
    await join(orgA, studentA.userId, ['student']);
    await faculty.post('/api/auth/switch', { orgId: orgA });
    await facultyB.post('/api/auth/switch', { orgId: orgB });

    const p = await faculty.post('/api/create/paths', { title: 'Data Structures Lab', summary: 'Weekly lab path for CS201.', level: 'intermediate', roles: ['Software Engineer'] });
    expect(p.status).toBe(201);
    const pathId = p.body.path.id;
    expect((await facultyB.get(`/api/create/paths/${pathId}`)).status).toBe(404);
    expect((await facultyB.post(`/api/create/paths/${pathId}/topics`, { title: 'Injected' })).status).toBe(404);
    expect((await facultyB.get('/api/create/paths')).body.items).toHaveLength(0);
    expect((await faculty.post(`/api/create/paths/${pathId}/publish`)).status).toBe(400);

    const t1 = await faculty.post(`/api/create/paths/${pathId}/topics`, { title: 'Stacks', body: '# Stacks\nLIFO.', objectives: ['Explain LIFO'], skillSlug: 'stacks-queues' });
    const t2 = await faculty.post(`/api/create/paths/${pathId}/topics`, { title: 'Queues', body: '# Queues' });
    expect(t1.status).toBe(201);
    expect(t2.body.topic.sortOrder).toBe(2);
    expect((await faculty.post(`/api/create/paths/${pathId}/topics`, { title: 'Bad skill', skillSlug: 'not-a-skill' })).status).toBe(400);
    expect((await faculty.post(`/api/create/paths/${pathId}/reorder`, { topicIds: [t2.body.topic.id] })).status).toBe(400);
    await faculty.post(`/api/create/paths/${pathId}/reorder`, { topicIds: [t2.body.topic.id, t1.body.topic.id] });
    const ordered = await db.select().from(topics).where(eq(topics.trackId, pathId));
    expect(ordered.find((t) => t.id === t2.body.topic.id)!.sortOrder).toBe(1);

    // Quiz: public objective questions are attachable; another org's questions are not.
    const qs = await faculty.get('/api/create/questions?scope=public&pageSize=3');
    expect(qs.body.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(qs.body)).not.toContain('answerKey');
    const [orgBQuestion] = await db
      .insert(questions)
      .values({ orgId: orgB, type: 'single', title: 'Org B private', content: { prompt: 'x', options: [{ id: 'a', text: 'A' }] }, answerKey: { correct: ['a'] } })
      .returning();
    expect((await faculty.put(`/api/create/paths/${pathId}/topics/${t1.body.topic.id}/quiz`, { questionIds: [orgBQuestion.id] })).status).toBe(400);
    const quiz = await faculty.put(`/api/create/paths/${pathId}/topics/${t1.body.topic.id}/quiz`, { questionIds: qs.body.items.map((q: any) => q.id) });
    expect(quiz.body.topic.quizQuestionIds).toHaveLength(qs.body.items.length);

    const pub = await faculty.post(`/api/create/paths/${pathId}/publish`);
    expect(pub.body.path).toMatchObject({ status: 'published', version: 1 });
    const slug = pub.body.path.slug;
    expect((await studentA.get(`/api/learning/tracks/${slug}`)).status).toBe(200);
    expect((await facultyB.get(`/api/learning/tracks/${slug}`)).status).toBe(404);
    await faculty.post(`/api/create/paths/${pathId}/unpublish`);
    const pub2 = await faculty.post(`/api/create/paths/${pathId}/publish`);
    expect(pub2.body.path.version).toBe(2);

    await studentA.post(`/api/learning/tracks/${slug}/enroll`, { mode: 'guided' });
    const an = await faculty.get(`/api/create/paths/${pathId}/analytics`);
    expect(an.body.enrollments.total).toBe(1);
    expect(an.body.topics).toHaveLength(2);
    expect((await facultyB.get(`/api/create/paths/${pathId}/analytics`)).status).toBe(404);
    // Skill linked.
    const [sk] = await db.select().from(skills).where(eq(skills.slug, 'stacks-queues'));
    expect(ordered.find((t) => t.id === t1.body.topic.id)!.skillId).toBe(sk.id);
  });
});
