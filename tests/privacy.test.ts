import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupTestApp, registerUser, client } from './helpers';
import { db } from '../server/db/client';
import {
  users,
  notes,
  tasks,
  dataRequests,
  backgroundJobs,
  sessions,
  organizations,
  assessments,
  attempts,
  attemptAnswers,
  auditLogs,
  questions,
  files,
  profiles,
  mentorships,
  mentorSessions,
} from '../server/db/schema';
import { drainJobs, enqueue } from '../server/jobs/queue';
import { eraseUser } from '../server/modules/privacy/service';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => ctx.close());

async function downloadJson(cookie: string, url: string) {
  const res = await ctx.app.request(url, { headers: { cookie } });
  return { status: res.status, json: res.status === 200 ? JSON.parse(await res.text()) : null };
}

describe('privacy: export', () => {
  it('builds an archive of my data only, idempotently, downloadable only by me', async () => {
    const a = await registerUser(ctx.app, 'Ada Export', 'ada@privacy.test');
    const b = await registerUser(ctx.app, 'Bob Other', 'bob@privacy.test');
    await a.post('/api/workspace/notes', { title: 'Ada secret plan', body: 'Learn graphs' });
    await b.post('/api/workspace/notes', { title: 'Bob private diary', body: 'Not for Ada' });
    const mentor = b;
    const [ship] = await db.insert(mentorships).values({ mentorId: mentor.userId, menteeId: a.userId, status: 'active' }).returning();
    await db.insert(mentorSessions).values({ mentorshipId: ship.id, scheduledAt: new Date(), sharedNotes: 'Shared plan', mentorPrivateNotes: 'Mentor-only observation' });
    const [q] = await db.insert(questions).values({ type: 'single', title: 'Pick one', content: { prompt: 'p', options: [{ id: 'a', text: 'A' }] }, answerKey: { correct: ['a'], explanation: 'SECRET-KEY-EXPLANATION' }, visibility: 'public' }).returning();
    const [asmt] = await db.insert(assessments).values({ ownerId: b.userId, title: 'Practice check', mode: 'practice', settings: { resultRelease: 'immediate' }, status: 'published' }).returning();
    const [att] = await db.insert(attempts).values({ assessmentId: asmt.id, userId: a.userId, attemptNo: 1, items: [], status: 'graded', score: 1, maxScore: 1 }).returning();
    await db.insert(attemptAnswers).values({ attemptId: att.id, questionId: q.id, answer: { choice: 'a' }, maxPoints: 1, finalScore: 1 });

    const r1 = await a.post('/api/privacy/export');
    expect(r1.status).toBe(202);
    const r2 = await a.post('/api/privacy/export');
    expect(r2.body.created).toBe(false);
    expect(r2.body.request.id).toBe(r1.body.request.id);

    await drainJobs();
    const summary = await a.get('/api/privacy/summary');
    const req = summary.body.requests.find((r: any) => r.id === r1.body.request.id);
    expect(req.status).toBe('ready');
    expect(req.file.url).toMatch(/^\/api\/files\//);
    expect(new Date(req.file.expiresAt).getTime()).toBeGreaterThan(Date.now() + 6 * 86400_000);

    const dl = await downloadJson(a.cookie, req.file.url);
    expect(dl.status).toBe(200);
    const raw = JSON.stringify(dl.json);
    expect(dl.json.format).toBe('learnsphere.personal-data');
    expect(dl.json.account.email).toBe('ada@privacy.test');
    expect(raw).toContain('Ada secret plan');
    expect(raw).not.toContain('Bob private diary');
    expect(raw).not.toContain('SECRET-KEY-EXPLANATION');
    expect(raw).not.toContain('Mentor-only observation');
    expect(raw).toContain('Shared plan');
    expect(raw).not.toContain('passwordHash');
    expect(dl.json.assessments.attempts[0].answers[0].questionTitle).toBe('Pick one');

    // Bob cannot fetch Ada's archive; the request is audited and Ada was notified.
    expect((await downloadJson(b.cookie, req.file.url)).status).toBe(404);
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.targetId, a.userId));
    expect(audits.map((x) => x.action)).toEqual(expect.arrayContaining(['privacy.export_requested', 'privacy.export_ready']));
    const notif = await a.get('/api/notifications');
    expect(notif.body.items.some((n: any) => n.type === 'privacy.export_ready')).toBe(true);
    expect(summary.body.retention.rules.length).toBeGreaterThan(5);
    expect(summary.body.categories.find((c: any) => c.key === 'notes').count).toBe(1);
  });
});

describe('privacy: deletion lifecycle', () => {
  it('requests, cancels, re-requests, runs the job, anonymizes retained records and blocks sign-in', async () => {
    const email = 'dana@privacy.test';
    const password = 'correct-horse-42';
    const dana = await registerUser(ctx.app, 'Dana Delete', email, password);
    const other = await registerUser(ctx.app, 'Olive Other', 'olive@privacy.test');
    // A second device for Dana.
    const device2 = client(ctx.app);
    expect((await device2.post('/api/auth/login', { email, password })).status).toBe(200);

    await dana.post('/api/workspace/notes', { title: 'Dana note', body: 'private' });
    await dana.post('/api/workspace/tasks', { title: 'Dana task' });
    await other.post('/api/workspace/notes', { title: 'Olive note', body: 'stays' });
    const [org] = await db.insert(organizations).values({ name: 'Exam Org', slug: 'exam-org', kind: 'college' }).returning();
    const [asmt] = await db.insert(assessments).values({ orgId: org.id, ownerId: other.userId, title: 'Final exam', mode: 'classroom', settings: { resultRelease: 'manual' }, status: 'published' }).returning();
    const [att] = await db.insert(attempts).values({ assessmentId: asmt.id, userId: dana.userId, orgId: org.id, attemptNo: 1, items: [], status: 'graded', score: 42, maxScore: 50 }).returning();
    await db.insert(auditLogs).values({ action: 'test.event', actorId: dana.userId, targetType: 'user', targetId: dana.userId, meta: { email, name: 'Dana Delete', detail: 'kept' } });

    // Validation: wrong password and missing confirmation are rejected.
    expect((await dana.post('/api/privacy/delete', { password: 'wrong-password-1', confirm: 'delete my account' })).status).toBe(400);
    expect((await dana.post('/api/privacy/delete', { password, confirm: 'yes' })).status).toBe(400);

    const req1 = await dana.post('/api/privacy/delete', { password, confirm: 'delete my account' });
    expect(req1.status).toBe(202);
    expect(req1.body.sessionsRevoked).toBe(1);
    expect((await device2.get('/api/auth/me')).body.user).toBeNull();
    const [u1] = await db.select().from(users).where(eq(users.id, dana.userId));
    expect(u1.status).toBe('pending_deletion');
    expect((await dana.post('/api/privacy/delete', { password, confirm: 'delete my account' })).status).toBe(409);
    const s1 = await dana.get('/api/privacy/summary');
    expect(s1.body.pendingDeletion.id).toBe(req1.body.request.id);
    expect(new Date(s1.body.pendingDeletion.scheduledFor).getTime()).toBeGreaterThan(Date.now() + 6 * 86400_000);

    // Cancel during grace: account restored, job cancelled.
    expect((await dana.post('/api/privacy/delete/cancel')).status).toBe(200);
    const [u2] = await db.select().from(users).where(eq(users.id, dana.userId));
    expect(u2.status).toBe('active');
    const [job1] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.idempotencyKey, `privacy.delete:${req1.body.request.id}`));
    expect(job1.status).toBe('cancelled');
    expect((await dana.post('/api/privacy/delete/cancel')).status).toBe(404);

    // Request again and fast-forward past the grace period.
    const req2 = await dana.post('/api/privacy/delete', { password, confirm: 'Delete My Account', reason: 'Testing' });
    expect(req2.status).toBe(202);
    const past = new Date(Date.now() - 1000);
    await db.update(dataRequests).set({ scheduledFor: past }).where(eq(dataRequests.id, req2.body.request.id));
    await db.update(backgroundJobs).set({ runAt: past }).where(eq(backgroundJobs.idempotencyKey, `privacy.delete:${req2.body.request.id}`));
    await drainJobs();

    const [u3] = await db.select().from(users).where(eq(users.id, dana.userId));
    expect(u3.status).toBe('deleted');
    expect(u3.email).toBe(`deleted+${dana.userId}@invalid`);
    expect(u3.name).toBe(`Deleted user ${dana.userId.slice(0, 8)}`);
    expect(u3.passwordHash).toBeNull();
    expect(await db.select().from(notes).where(eq(notes.userId, dana.userId))).toHaveLength(0);
    expect(await db.select().from(tasks).where(eq(tasks.userId, dana.userId))).toHaveLength(0);
    expect(await db.select().from(profiles).where(eq(profiles.userId, dana.userId))).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.userId, dana.userId))).toHaveLength(0);
    // Other users are untouched.
    expect(await db.select().from(notes).where(eq(notes.userId, other.userId))).toHaveLength(1);
    // Retained: the attempt and its score remain, linked to the anonymized account.
    const [att2] = await db.select().from(attempts).where(eq(attempts.id, att.id));
    expect(att2.score).toBe(42);
    expect(att2.userId).toBe(dana.userId);
    // Audit log entries are kept without name or email.
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'test.event'), eq(auditLogs.actorId, dana.userId)));
    expect(log.meta).toMatchObject({ detail: 'kept', anonymized: true });
    expect(log.meta).not.toHaveProperty('email');
    expect(log.meta).not.toHaveProperty('name');

    // Summary lists what was deleted vs retained and why.
    const [done] = await db.select().from(dataRequests).where(eq(dataRequests.id, req2.body.request.id));
    expect(done.status).toBe('completed');
    const summary = done.summary as any;
    expect(summary.deleted.find((i: any) => i.key === 'notes').count).toBe(1);
    expect(summary.deleted.find((i: any) => i.key === 'tasks').count).toBe(1);
    const attemptsItem = summary.anonymized.find((i: any) => i.key === 'attempts');
    expect(attemptsItem.count).toBe(1);
    expect(attemptsItem.reason).toMatch(/organization/i);
    expect(summary.retained.length + summary.anonymized.length).toBeGreaterThan(3);
    expect(summary.reason).toBe('Testing');

    // Signing in is no longer possible, with the old email or the session.
    expect((await client(ctx.app).post('/api/auth/login', { email, password })).status).toBe(401);
    expect((await dana.get('/api/auth/me')).body.user).toBeNull();
    expect((await dana.get('/api/privacy/summary')).status).toBe(401);

    // Retry safety: running the job again (or the sweep) is a no-op.
    await enqueue('privacy.delete', { requestId: req2.body.request.id }, { idempotencyKey: 'manual-retry' });
    await enqueue('privacy.sweep', {}, { idempotencyKey: 'manual-sweep' });
    await drainJobs();
    const [retry] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.idempotencyKey, 'manual-retry'));
    expect(retry.status).toBe('succeeded');
    expect(retry.result).toMatchObject({ skipped: 'completed' });
    const [again] = await db.select().from(dataRequests).where(eq(dataRequests.id, req2.body.request.id));
    expect(again.completedAt?.getTime()).toBe(done.completedAt?.getTime());
  });

  it('erasure steps are idempotent when a job is interrupted and retried', async () => {
    const eve = await registerUser(ctx.app, 'Eve Retry', 'eve@privacy.test');
    await eve.post('/api/workspace/notes', { title: 'Eve note' });
    const form = new FormData();
    form.append('file', new Blob(['hello']), 'hello.txt');
    await ctx.app.request('/api/files', { method: 'POST', headers: { origin: 'http://localhost:5317', cookie: eve.cookie }, body: form });
    await db.update(users).set({ status: 'pending_deletion' }).where(eq(users.id, eve.userId));
    const first = await eraseUser(eve.userId);
    const second = await eraseUser(eve.userId);
    expect(first.find((i) => i.key === 'notes')!.count).toBe(1);
    expect(first.find((i) => i.key === 'files')!.count).toBe(1);
    expect(second.find((i) => i.key === 'notes')!.count).toBe(0);
    expect(second.find((i) => i.key === 'files')!.count).toBe(0);
    const [f] = await db.select().from(files).where(eq(files.filename, 'deleted'));
    expect(f.data).toBeNull();
    const [u] = await db.select().from(users).where(eq(users.id, eve.userId));
    expect(u.status).toBe('deleted');
  });
});
