import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, registerUser } from './helpers';
import { db } from '../server/db/client';
import { organizations, cohorts, cohortMembers, assignments, assessments, assessmentInvites, mentorships, mentorSessions, projects, projectMilestones } from '../server/db/schema';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => ctx.close());

async function uploadMany(cookie: string, path: string, items: { name: string; data: string }[]) {
  const form = new FormData();
  for (const it of items) form.append('files', new Blob([it.data]), it.name);
  const res = await ctx.app.request(path, { method: 'POST', headers: { origin: 'http://localhost:5317', cookie }, body: form });
  return { status: res.status, body: (await res.json()) as any };
}

describe('workspace: notes, tasks, links, bookmarks', () => {
  it('creates, filters, updates and deletes notes; other users get 404', async () => {
    const a = await registerUser(ctx.app, 'Nora Notes', 'nora@ws.test');
    const b = await registerUser(ctx.app, 'Ben Other', 'ben@ws.test');
    expect((await a.post('/api/workspace/notes', { title: '', body: 'x' })).status).toBe(400);
    const n1 = await a.post('/api/workspace/notes', { title: 'Big-O recap', body: '# O(n log n)', tags: ['DSA', 'revision'], linkType: 'topic', linkId: 'abc', linkLabel: 'Sorting' });
    expect(n1.status).toBe(201);
    expect(n1.body.note.tags).toEqual(['dsa', 'revision']);
    await a.post('/api/workspace/notes', { title: 'SQL joins', body: 'LEFT JOIN keeps all left rows', tags: ['sql'], pinned: true });

    const all = await a.get('/api/workspace/notes');
    expect(all.body.items).toHaveLength(2);
    expect(all.body.items[0].title).toBe('SQL joins'); // pinned first
    expect(all.body.tags).toEqual(expect.arrayContaining([{ tag: 'dsa', count: 1 }, { tag: 'sql', count: 1 }]));
    expect((await a.get('/api/workspace/notes?tag=dsa')).body.items).toHaveLength(1);
    expect((await a.get('/api/workspace/notes?q=left%20join')).body.items[0].title).toBe('SQL joins');
    expect((await a.get('/api/workspace/notes?linkType=topic&linkId=abc')).body.total).toBe(1);

    const id = n1.body.note.id;
    expect((await b.get(`/api/workspace/notes/${id}`)).status).toBe(404);
    expect((await b.patch(`/api/workspace/notes/${id}`, { title: 'Mine now' })).status).toBe(404);
    expect((await b.del(`/api/workspace/notes/${id}`)).status).toBe(404);
    expect((await b.get('/api/workspace/notes')).body.items).toHaveLength(0);
    const up = await a.patch(`/api/workspace/notes/${id}`, { pinned: true, body: 'updated' });
    expect(up.body.note.pinned).toBe(true);
    expect((await a.del(`/api/workspace/notes/${id}`)).status).toBe(200);
    expect((await a.get(`/api/workspace/notes/${id}`)).status).toBe(404);
  });

  it('manages tasks with due dates and completion', async () => {
    const a = await registerUser(ctx.app, 'Tia Tasks', 'tia@ws.test');
    const b = await registerUser(ctx.app, 'Tom Other', 'tom@ws.test');
    const past = new Date(Date.now() - 86400_000).toISOString();
    const t = await a.post('/api/workspace/tasks', { title: 'Finish resume', dueAt: past, priority: 'high' });
    expect(t.status).toBe(201);
    await a.post('/api/workspace/tasks', { title: 'Read chapter 3' });
    const list = await a.get('/api/workspace/tasks');
    expect(list.body.counts).toMatchObject({ total: 2, open: 2, overdue: 1 });
    expect((await a.get('/api/workspace/tasks?due=overdue')).body.items).toHaveLength(1);
    const done = await a.patch(`/api/workspace/tasks/${t.body.task.id}`, { status: 'done' });
    expect(done.body.task.completedAt).toBeTruthy();
    expect((await b.patch(`/api/workspace/tasks/${t.body.task.id}`, { status: 'todo' })).status).toBe(404);
    expect((await a.post('/api/workspace/tasks', { title: 'x', priority: 'urgent' })).status).toBe(400);
  });

  it('saves only http(s) links and lists bookmarks across types', async () => {
    const a = await registerUser(ctx.app, 'Lia Links', 'lia@ws.test');
    expect((await a.post('/api/workspace/links', { title: 'Bad', url: 'javascript:alert(1)' })).status).toBe(400);
    const l = await a.post('/api/workspace/links', { title: 'MDN', url: 'https://developer.mozilla.org/' });
    expect(l.status).toBe(201);
    expect((await a.get('/api/workspace/links?q=mdn')).body.items).toHaveLength(1);
    await a.post('/api/workspace/bookmarks', { targetType: 'problem', targetId: 'two-sum', label: 'Two Sum' });
    await a.post('/api/workspace/bookmarks', { targetType: 'job', targetId: 'abc', label: 'Backend role', collection: 'Apply' });
    const bms = await a.get('/api/workspace/bookmarks');
    expect(bms.body.items).toHaveLength(2);
    expect(bms.body.items.find((x: any) => x.targetType === 'problem').link).toBe('/app/practice/two-sum');
    expect((await a.get('/api/workspace/bookmarks?type=job')).body.items).toHaveLength(1);
  });
});

describe('workspace: calendar aggregation', () => {
  it('includes my cohort assignments, invites, sessions, milestones and tasks, but not other cohorts', async () => {
    const me = await registerUser(ctx.app, 'Cal Student', 'cal@ws.test');
    const teacher = await registerUser(ctx.app, 'Cal Teacher', 'teacher@ws.test');
    const mentor = await registerUser(ctx.app, 'Cal Mentor', 'mentor@ws.test');
    const [org] = await db.insert(organizations).values({ name: 'Cal College', slug: 'cal-college', kind: 'college' }).returning();
    const [mine, theirs] = await db
      .insert(cohorts)
      .values([
        { orgId: org.id, name: 'Section A' },
        { orgId: org.id, name: 'Section B' },
      ])
      .returning();
    await db.insert(cohortMembers).values({ cohortId: mine.id, userId: me.userId, role: 'student' });
    const due = new Date(Date.now() + 3 * 86400_000);
    await db.insert(assignments).values([
      { orgId: org.id, cohortId: mine.id, authorId: teacher.userId, title: 'Linked list lab', instructions: 'x', dueAt: due, status: 'published' },
      { orgId: org.id, cohortId: theirs.id, authorId: teacher.userId, title: 'Other section lab', instructions: 'x', dueAt: due, status: 'published' },
      { orgId: org.id, cohortId: mine.id, authorId: teacher.userId, title: 'Unreleased draft', instructions: 'x', dueAt: due, status: 'draft' },
    ]);
    const [asmt] = await db.insert(assessments).values({ orgId: org.id, ownerId: teacher.userId, title: 'Midterm quiz', mode: 'classroom', settings: { resultRelease: 'manual' }, status: 'published' }).returning();
    await db.insert(assessmentInvites).values({ assessmentId: asmt.id, userId: me.userId, invitedBy: teacher.userId, dueAt: new Date(Date.now() + 5 * 86400_000) });
    const [ship] = await db.insert(mentorships).values({ mentorId: mentor.userId, menteeId: me.userId, status: 'active' }).returning();
    await db.insert(mentorSessions).values({ mentorshipId: ship.id, scheduledAt: new Date(Date.now() + 2 * 86400_000), agenda: 'Resume review' });
    const [proj] = await db.insert(projects).values({ ownerId: me.userId, title: 'Todo API', slug: 'todo-api', category: 'api' }).returning();
    await db.insert(projectMilestones).values({ projectId: proj.id, title: 'Auth endpoints', dueAt: new Date(Date.now() + 6 * 86400_000), sortOrder: 1 });
    await me.post('/api/workspace/tasks', { title: 'Revise trees', dueAt: new Date(Date.now() + 86400_000).toISOString() });

    const from = new Date().toISOString();
    const to = new Date(Date.now() + 14 * 86400_000).toISOString();
    const cal = await me.get(`/api/workspace/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    expect(cal.status).toBe(200);
    const titles = cal.body.items.map((i: any) => i.title);
    expect(titles).toContain('Linked list lab');
    expect(titles).not.toContain('Other section lab');
    expect(titles).not.toContain('Unreleased draft');
    expect(titles).toContain('Midterm quiz');
    expect(titles).toContain('Auth endpoints');
    expect(titles).toContain('Revise trees');
    expect(titles.some((t: string) => t.includes('Resume review'))).toBe(true);
    const types = new Set(cal.body.items.map((i: any) => i.type));
    expect([...types].sort()).toEqual(['assessment', 'assignment', 'mentor_session', 'milestone', 'task']);
    expect(cal.body.items.every((i: any) => i.link && i.at)).toBe(true);
    // Sorted by time.
    const ats = cal.body.items.map((i: any) => i.at);
    expect([...ats].sort()).toEqual(ats);

    // The mentor sees the session from their side; the teacher (not a cohort member) sees no assignments.
    const mcal = await mentor.get(`/api/workspace/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    expect(mcal.body.items.map((i: any) => i.type)).toEqual(['mentor_session']);
    expect(mcal.body.items[0].link).toBe('/app/mentor/sessions');
    expect((await teacher.get(`/api/workspace/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).body.items).toHaveLength(0);

    const tooLong = new Date(Date.now() + 200 * 86400_000).toISOString();
    expect((await me.get(`/api/workspace/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(tooLong)}`)).status).toBe(400);
  });
});

describe('workspace: export and import', () => {
  it('exports JSON and a markdown bundle, then imports both back', async () => {
    const a = await registerUser(ctx.app, 'Exporter', 'exporter@ws.test');
    await a.post('/api/workspace/notes', { title: 'Heaps', body: 'A min-heap keeps the smallest on top.', tags: ['dsa'] });
    await a.post('/api/workspace/tasks', { title: 'Practice heaps' });
    await a.post('/api/workspace/links', { title: 'Visualgo', url: 'https://visualgo.net/' });

    const json = await a.get('/api/workspace/export?format=json');
    expect(json.status).toBe(200);
    expect(json.body.format).toBe('learnsphere.workspace');
    expect(json.body.notes[0]).not.toHaveProperty('userId');
    expect(json.body.notes).toHaveLength(1);

    const zip = await ctx.app.request('/api/workspace/export?format=markdown', { headers: { cookie: a.cookie } });
    expect(zip.headers.get('content-type')).toBe('application/zip');
    const buf = Buffer.from(await zip.arrayBuffer());
    expect(buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(buf.toString('latin1')).toContain('notes/heaps.md');

    const b = await registerUser(ctx.app, 'Importer', 'importer@ws.test');
    const res = await uploadMany(b.cookie, '/api/workspace/import', [
      { name: 'export.json', data: JSON.stringify(json.body) },
      { name: 'graphs.md', data: '---\ntitle: "Graph notes"\ntags: ["dsa", "graphs"]\npinned: true\n---\n\nBFS uses a queue.' },
      { name: 'plain.md', data: '# Plain heading\nNo front matter.' },
      { name: 'evil.exe', data: 'MZ' },
      { name: 'wrong.json', data: '{"hello": 1}' },
    ]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ notes: 3, tasks: 1, links: 1 });
    expect(res.body.skipped.map((s: any) => s.file)).toEqual(['evil.exe', 'wrong.json']);
    const notesList = await b.get('/api/workspace/notes');
    const graph = notesList.body.items.find((n: any) => n.title === 'Graph notes');
    expect(graph.pinned).toBe(true);
    expect(graph.tags).toEqual(expect.arrayContaining(['dsa', 'graphs', 'imported']));
    expect(notesList.body.items.map((n: any) => n.title)).toContain('Plain heading');
    // The exporter's data is untouched and not shared.
    expect((await a.get('/api/workspace/notes')).body.items).toHaveLength(1);
  });
});
