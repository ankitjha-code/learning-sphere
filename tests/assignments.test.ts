import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupTestApp, registerUser } from './helpers';
import { db } from '../server/db/client';
import { activityEvents, assignments, memberships, notifications, organizations, submissions } from '../server/db/schema';
import { runDeadlineReminders } from '../server/modules/teach/jobs';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
type Client = Awaited<ReturnType<typeof registerUser>>;

let orgId: string;
let faculty: Client;
let s1: Client;
let s2: Client;
let s3: Client;
let cohortId: string;

async function join(userId: string, roles: string[]) {
  await db.insert(memberships).values({ orgId, userId, roles });
}

const INSTRUCTIONS = 'Write a short explanation of how a stack differs from a queue, with one example of each.';

/** Creates and publishes an assignment, optionally moving its dates afterwards (publishing needs a future due date). */
async function publishedAssignment(overrides: Record<string, unknown> = {}, dates?: { dueAt: Date; availableFrom?: Date }) {
  const r = await faculty.post('/api/teach/assignments', {
    cohortId,
    title: `Stacks and queues ${Math.random().toString(36).slice(2, 7)}`,
    instructions: INSTRUCTIONS,
    dueAt: new Date(Date.now() + 5 * 86400_000).toISOString(),
    ...overrides,
  });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  const id = r.body.assignment.id as string;
  if (overrides.collaboration === 'team') return id; // caller creates teams, then publishes
  const p = await faculty.post(`/api/teach/assignments/${id}/publish`);
  if (p.status !== 200) throw new Error(JSON.stringify(p.body));
  if (dates) await db.update(assignments).set({ dueAt: dates.dueAt, availableFrom: dates.availableFrom ?? new Date(dates.dueAt.getTime() - 7 * 86400_000) }).where(eq(assignments.id, id));
  return id;
}

beforeAll(async () => {
  ctx = await setupTestApp();
  const [o] = await db.insert(organizations).values({ name: 'Test College', slug: 'test-college', kind: 'college' }).returning();
  orgId = o.id;
  faculty = await registerUser(ctx.app, 'Fiona Faculty', 'fiona@example.test');
  s1 = await registerUser(ctx.app, 'Ada Student', 'ada@example.test');
  s2 = await registerUser(ctx.app, 'Ben Student', 'ben@example.test');
  s3 = await registerUser(ctx.app, 'Cy Student', 'cy@example.test');
  await join(faculty.userId, ['faculty']);
  for (const s of [s1, s2, s3]) await join(s.userId, ['student']);
  await faculty.post('/api/auth/switch', { orgId });
  const co = await faculty.post('/api/teach/cohorts', { name: 'Section C' });
  cohortId = co.body.cohort.id;
  await faculty.post(`/api/teach/cohorts/${cohortId}/members`, { userIds: [s1.userId, s2.userId, s3.userId] });
});
afterAll(async () => ctx.close());

describe('student assignment workflow', () => {
  it('keeps every submitted version on resubmission and enforces the resubmission limit', async () => {
    const id = await publishedAssignment({ allowResubmission: true, maxResubmissions: 1 });
    const v1 = await s1.post(`/api/teach/my/assignments/${id}/submit`, { confirm: true, text: 'Version one of my answer.' });
    expect(v1.status).toBe(201);
    expect(v1.body.submission.version).toBe(1);

    const d2 = await s1.put(`/api/teach/my/assignments/${id}/draft`, { text: 'Version two, improved.' });
    expect(d2.status).toBe(200);
    expect(d2.body.draft.version).toBe(2);
    const v2 = await s1.post(`/api/teach/my/assignments/${id}/submit`, { confirm: true });
    expect(v2.status).toBe(201);
    expect(v2.body.submission.version).toBe(2);
    expect(v2.body.receipt.code).not.toBe(v1.body.receipt.code);

    const detail = await s1.get(`/api/teach/my/assignments/${id}`);
    expect(detail.body.versions.map((v: any) => v.version)).toEqual([1, 2]);
    expect(detail.body.versions[0].text).toBe('Version one of my answer.');
    expect(detail.body.resubmission.allowed).toBe(false);

    const third = await s1.put(`/api/teach/my/assignments/${id}/draft`, { text: 'Version three' });
    expect(third.status).toBe(409);

    // XP is granted once per assignment, not per version.
    const xp = await db.select().from(activityEvents).where(and(eq(activityEvents.userId, s1.userId), eq(activityEvents.kind, 'assignment_submitted')));
    expect(xp.length).toBe(1);

    // The grading queue shows only the latest version.
    const queue = await faculty.get(`/api/teach/grading/queue?assignmentId=${id}`);
    expect(queue.body.items.length).toBe(1);
    expect(queue.body.items[0].version).toBe(2);
  });

  it('blocks resubmission when it is not allowed', async () => {
    const id = await publishedAssignment();
    expect((await s1.post(`/api/teach/my/assignments/${id}/submit`, { confirm: true, text: 'Only chance.' })).status).toBe(201);
    const again = await s1.put(`/api/teach/my/assignments/${id}/draft`, { text: 'Another try' });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/not allowed/);
  });

  it('blocks submissions after the hard cutoff and when late work is not accepted', async () => {
    const cut = await publishedAssignment({ latePolicy: { allowLate: true, penaltyPercentPerDay: 5, hardCutoffDays: 1 } }, { dueAt: new Date(Date.now() - 2 * 86400_000) });
    const r = await s1.post(`/api/teach/my/assignments/${cut}/submit`, { confirm: true, text: 'Too late?' });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/late submission window has closed/);
    expect((await s1.put(`/api/teach/my/assignments/${cut}/draft`, { text: 'draft' })).status).toBe(409);

    const strict = await publishedAssignment({ latePolicy: { allowLate: false } }, { dueAt: new Date(Date.now() - 3600_000) });
    const r2 = await s1.post(`/api/teach/my/assignments/${strict}/submit`, { confirm: true, text: 'An hour late' });
    expect(r2.status).toBe(409);
    expect(r2.body.error.message).toMatch(/late submissions are not accepted/);

    // Within the window: accepted, flagged late, penalty preview computed.
    const ok = await publishedAssignment({ latePolicy: { allowLate: true, penaltyPercentPerDay: 15, hardCutoffDays: 5 } }, { dueAt: new Date(Date.now() - 50 * 3600_000) });
    const r3 = await s1.post(`/api/teach/my/assignments/${ok}/submit`, { confirm: true, text: 'Fifty hours late' });
    expect(r3.status).toBe(201);
    expect(r3.body.receipt.daysLate).toBe(3);
    expect(r3.body.receipt.latePenaltyPercent).toBe(45);
    const list = await s1.get('/api/teach/my/assignments');
    expect(list.body.items.find((i: any) => i.id === ok).status).toBe('late');
  });

  it('validates submission content against the allowed submission types', async () => {
    const id = await publishedAssignment({ submissionTypes: ['link'] });
    expect((await s2.post(`/api/teach/my/assignments/${id}/submit`, { confirm: true, text: 'text not allowed' })).status).toBe(400);
    const badLink = await s2.put(`/api/teach/my/assignments/${id}/draft`, { text: '', links: [{ label: 'x', url: 'javascript:alert(1)' }] });
    expect(badLink.status).toBe(400);
    const empty = await s2.post(`/api/teach/my/assignments/${id}/submit`, { confirm: true, text: '', links: [] });
    expect(empty.status).toBe(400);
    const ok = await s2.post(`/api/teach/my/assignments/${id}/submit`, { confirm: true, text: '', links: [{ label: 'Repo', url: 'https://example.com/repo' }] });
    expect(ok.status).toBe(201);
  });

  it('shares one submission across a team and notifies every member', async () => {
    const id = await publishedAssignment({ collaboration: 'team' });
    const blocked = await faculty.post(`/api/teach/assignments/${id}/publish`);
    expect(blocked.status).toBe(400); // students not in teams yet
    const t = await faculty.post(`/api/teach/assignments/${id}/teams`, { name: 'Team A', memberIds: [s1.userId, s2.userId] });
    expect(t.status).toBe(201);
    const clash = await faculty.post(`/api/teach/assignments/${id}/teams`, { name: 'Team B', memberIds: [s2.userId, s3.userId] });
    expect(clash.status).toBe(409);
    await faculty.post(`/api/teach/assignments/${id}/teams`, { name: 'Team B', memberIds: [s3.userId] });
    expect((await faculty.post(`/api/teach/assignments/${id}/publish`)).status).toBe(200);

    await s1.put(`/api/teach/my/assignments/${id}/draft`, { text: 'Team draft by Ada' });
    const seen = await s2.get(`/api/teach/my/assignments/${id}`);
    expect(seen.body.draft.text).toBe('Team draft by Ada');
    expect(seen.body.team.name).toBe('Team A');
    const sub = await s2.post(`/api/teach/my/assignments/${id}/submit`, { confirm: true });
    expect(sub.status).toBe(201);
    const n1 = await db.select().from(notifications).where(and(eq(notifications.userId, s1.userId), eq(notifications.type, 'assignment.submitted')));
    expect(n1.some((n) => n.title.includes('Stacks'))).toBe(true);
    const receipt = await s1.get(`/api/teach/my/submissions/${sub.body.submission.id}/receipt`);
    expect(receipt.status).toBe(200);
    expect((await s3.get(`/api/teach/my/submissions/${sub.body.submission.id}/receipt`)).status).toBe(404);
  });

  it('sends a 24-hour deadline reminder once per student without a submission', async () => {
    const id = await publishedAssignment({}, { dueAt: new Date(Date.now() + 12 * 3600_000) });
    await s3.post(`/api/teach/my/assignments/${id}/submit`, { confirm: true, text: 'Done early' });
    const first = await runDeadlineReminders();
    const second = await runDeadlineReminders();
    expect(second.sent).toBe(0);
    const reminders = await db.select().from(notifications).where(eq(notifications.type, 'assignment.due'));
    const forThis = reminders.filter((r) => r.link === `/app/assignments/${id}`);
    expect(forThis.map((r) => r.userId).sort()).toEqual([s1.userId, s2.userId].sort());
    expect(first.sent).toBeGreaterThanOrEqual(2);
  });

  it('lets students attach uploaded files and lets the instructor (but not classmates) download them', async () => {
    const id = await publishedAssignment({ submissionTypes: ['text', 'file'], acceptedFileTypes: ['txt'] });
    const fd = new FormData();
    fd.append('purpose', 'submission');
    fd.append('file', new File(['my answer as a text file'], 'answer.txt', { type: 'text/plain' }));
    const up = await ctx.app.request('/api/files', { method: 'POST', headers: { origin: 'http://localhost:5317', cookie: s1.cookie }, body: fd });
    expect(up.status).toBe(201);
    const fileId = (await up.json()).file.id as string;

    const sub = await s1.post(`/api/teach/my/assignments/${id}/submit`, { confirm: true, text: 'See attached', fileIds: [fileId] });
    expect(sub.status).toBe(201);
    const facultyGet = await ctx.app.request(`/api/files/${fileId}`, { headers: { cookie: faculty.cookie } });
    expect(facultyGet.status).toBe(200);
    const classmate = await ctx.app.request(`/api/files/${fileId}`, { headers: { cookie: s2.cookie } });
    expect(classmate.status).toBe(404);

    // A classmate cannot attach someone else's file.
    const steal = await s2.put(`/api/teach/my/assignments/${id}/draft`, { text: 'x', fileIds: [fileId] });
    expect(steal.status).toBe(400);
  });

  it('hides draft assignments from students', async () => {
    const r = await faculty.post('/api/teach/assignments', { cohortId, title: 'Unpublished work', instructions: INSTRUCTIONS, dueAt: new Date(Date.now() + 86400_000).toISOString() });
    const id = r.body.assignment.id;
    expect((await s1.get(`/api/teach/my/assignments/${id}`)).status).toBe(404);
    const list = await s1.get('/api/teach/my/assignments');
    expect(list.body.items.some((i: any) => i.id === id)).toBe(false);
    const [row] = await db.select().from(submissions).where(eq(submissions.assignmentId, id));
    expect(row).toBeUndefined();
  });
});
