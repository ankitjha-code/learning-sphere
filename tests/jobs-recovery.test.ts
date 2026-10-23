import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { setupTestApp, registerUser } from './helpers';
import { db } from '../server/db/client';
import { users, backgroundJobs, activityEvents, auditLogs } from '../server/db/schema';
import { registerJob, enqueue, drainJobs, runJob } from '../server/jobs/queue';

/**
 * Journey 9: a grading task fails, the platform exposes the failure, retries safely,
 * avoids duplicate results and lets an authorized admin recover it.
 * A fake grading handler stands in for the real one: it is idempotent the same way
 * real handlers must be (results keyed on the subject, insert-or-ignore).
 */

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
type C = Awaited<ReturnType<typeof registerUser>>;
let admin: C;
let support: C;
let learner: C;

let outageCalls = 0; // the first N calls fail, simulating a grader outage
let failuresToSimulate = 2;

async function gradeIdempotently(payload: Record<string, unknown>) {
  outageCalls++;
  if (outageCalls <= failuresToSimulate) throw new Error('Simulated grader outage: sandbox unavailable');
  const submissionId = String(payload.submissionId);
  // One result per submission, whatever the number of runs.
  await db
    .insert(activityEvents)
    .values({ userId: String(payload.userId), kind: 'test.graded', label: `Graded ${submissionId}`, dedupeKey: `test-grade:${submissionId}`, xp: 10 })
    .onConflictDoNothing();
  return { submissionId, score: 8 };
}

async function resultRows(submissionId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(activityEvents)
    .where(eq(activityEvents.dedupeKey, `test-grade:${submissionId}`));
  return r.n;
}

async function makeReady(id: string) {
  // Skip the backoff delay instead of waiting in real time.
  await db.update(backgroundJobs).set({ runAt: new Date(Date.now() - 1000) }).where(eq(backgroundJobs.id, id));
}

beforeAll(async () => {
  ctx = await setupTestApp();
  registerJob('test.grading', gradeIdempotently);
  admin = await registerUser(ctx.app, 'Ada Admin', 'ada@example.test');
  support = await registerUser(ctx.app, 'Sam Support', 'sam@example.test');
  learner = await registerUser(ctx.app, 'Lee Learner', 'lee@example.test');
  await db.update(users).set({ platformRole: 'platform_admin' }).where(eq(users.id, admin.userId));
  await db.update(users).set({ platformRole: 'support' }).where(eq(users.id, support.userId));
});
afterAll(async () => ctx.close());

describe('grading job failure and admin recovery', () => {
  it('fails twice, shows as failed, and an admin retry succeeds exactly once', async () => {
    outageCalls = 0;
    failuresToSimulate = 2;
    const { job } = await enqueue('test.grading', { submissionId: 'sub-1', userId: learner.userId, apiKey: 'sk-should-not-leak' }, { idempotencyKey: 'grade:sub-1', maxAttempts: 2 });

    await drainJobs();
    let [row] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, job.id));
    expect(row.status).toBe('retrying');
    expect(row.lastError).toMatch(/Simulated grader outage/);

    await makeReady(job.id);
    await drainJobs();
    [row] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, job.id));
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(2);
    expect(await resultRows('sub-1')).toBe(0);

    // Visible to staff, with the error and a redacted payload.
    const list = await support.get('/api/admin/jobs?status=failed&type=test.grading');
    expect(list.status).toBe(200);
    expect(list.body.items.map((j: { id: string }) => j.id)).toContain(job.id);
    expect(list.body.counts.failed).toBeGreaterThanOrEqual(1);
    const detail = await support.get(`/api/admin/jobs/${job.id}`);
    expect(detail.body.job.lastError).toMatch(/Simulated grader outage/);
    expect(detail.body.job.payload.apiKey).toBe('[redacted]');
    expect(detail.body.job.payload.submissionId).toBe('sub-1');
    expect(JSON.stringify(detail.body)).not.toContain('sk-should-not-leak');
    expect(detail.body.can.retry).toBe(false); // support is read-only
    expect((await support.post(`/api/admin/jobs/${job.id}/retry`)).status).toBe(403);
    expect((await learner.get('/api/admin/jobs')).status).toBe(403);

    const adminDetail = await admin.get(`/api/admin/jobs/${job.id}`);
    expect(adminDetail.body.can.retry).toBe(true);
    const retry = await admin.post(`/api/admin/jobs/${job.id}/retry`);
    expect(retry.status).toBe(200);
    expect(retry.body.job.status).toBe('queued');
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'admin.job_retried'), eq(auditLogs.targetId, job.id)));
    expect(log.actorId).toBe(admin.userId);

    await drainJobs();
    [row] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, job.id));
    expect(row.status).toBe('succeeded');
    expect(row.result).toMatchObject({ submissionId: 'sub-1', score: 8 });
    expect(await resultRows('sub-1')).toBe(1);

    // Retrying a succeeded job is refused; re-running the handler does not duplicate results.
    expect((await admin.post(`/api/admin/jobs/${job.id}/retry`)).status).toBe(409);
    await runJob(row);
    await runJob(row);
    expect(await resultRows('sub-1')).toBe(1);

    // Enqueuing the same work again is deduplicated by the idempotency key.
    const again = await enqueue('test.grading', { submissionId: 'sub-1', userId: learner.userId }, { idempotencyKey: 'grade:sub-1' });
    expect(again.created).toBe(false);
    expect(again.job.id).toBe(job.id);
  });

  it('cancels queued work and refuses to cancel finished work', async () => {
    const { job } = await enqueue('test.grading', { submissionId: 'sub-2', userId: learner.userId }, { runAt: new Date(Date.now() + 3600_000) });
    const c1 = await admin.post(`/api/admin/jobs/${job.id}/cancel`);
    expect(c1.status).toBe(200);
    expect(c1.body.job.status).toBe('cancelled');
    expect((await admin.post(`/api/admin/jobs/${job.id}/cancel`)).status).toBe(409);
    // A cancelled job can be retried.
    outageCalls = 100;
    expect((await admin.post(`/api/admin/jobs/${job.id}/retry`)).status).toBe(200);
    await drainJobs();
    const [row] = await db.select({ status: backgroundJobs.status }).from(backgroundJobs).where(eq(backgroundJobs.id, job.id));
    expect(row.status).toBe('succeeded');
    expect(await resultRows('sub-2')).toBe(1);
  });

  it('bulk-retries failed jobs of one type', async () => {
    const ids: string[] = [];
    for (const s of ['sub-3', 'sub-4']) {
      const [j] = await db
        .insert(backgroundJobs)
        .values({ type: 'test.grading', payload: { submissionId: s, userId: learner.userId }, status: 'failed', attempts: 3, maxAttempts: 3, lastError: 'boom' })
        .returning();
      ids.push(j.id);
    }
    const r = await admin.post('/api/admin/jobs/bulk-retry', { type: 'test.grading' });
    expect(r.body.retried).toBe(2);
    outageCalls = 100;
    await drainJobs();
    expect(await resultRows('sub-3')).toBe(1);
    expect(await resultRows('sub-4')).toBe(1);
  });

  it('recovers stale running jobs and leaves fresh ones alone', async () => {
    const [stale] = await db
      .insert(backgroundJobs)
      .values({ type: 'test.grading', payload: { submissionId: 'sub-5', userId: learner.userId }, status: 'running', attempts: 1, lockedAt: new Date(Date.now() - 10 * 60_000) })
      .returning();
    const [fresh] = await db
      .insert(backgroundJobs)
      .values({ type: 'test.grading', payload: { submissionId: 'sub-6', userId: learner.userId }, status: 'running', attempts: 1, lockedAt: new Date(Date.now() - 30_000) })
      .returning();
    const list = await admin.get('/api/admin/jobs');
    expect(list.body.staleRunning).toBe(1);
    const r = await admin.post('/api/admin/jobs/recover-stale', { olderThanMinutes: 5 });
    expect(r.status).toBe(200);
    expect(r.body.recovered).toBe(1);
    const [s] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, stale.id));
    const [f] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, fresh.id));
    expect(s.status).toBe('retrying');
    expect(f.status).toBe('running');
    outageCalls = 100;
    await drainJobs();
    expect(await resultRows('sub-5')).toBe(1);
    expect((await support.post('/api/admin/jobs/recover-stale', {})).status).toBe(403);
  });

  it('recovers the seeded demonstration job through the same path', async () => {
    const [demo] = await db
      .insert(backgroundJobs)
      .values({ type: 'demo.failing_example', payload: { label: 'Demonstration job' }, status: 'failed', attempts: 3, maxAttempts: 3, lastError: 'Demonstration failure' })
      .returning();
    expect((await admin.post(`/api/admin/jobs/${demo.id}/retry`)).status).toBe(200);
    await drainJobs();
    const [row] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, demo.id));
    expect(row.status).toBe('succeeded');
    expect(row.result).toMatchObject({ demonstration: true });
  });

  it('validates job filters and ids', async () => {
    expect((await admin.get('/api/admin/jobs?status=exploded')).status).toBe(400);
    expect((await admin.get('/api/admin/jobs/not-a-uuid')).status).toBe(400);
    expect((await admin.get('/api/admin/jobs/00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });
});
