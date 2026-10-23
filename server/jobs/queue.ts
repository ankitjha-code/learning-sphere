import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { backgroundJobs } from '../db/schema';

/**
 * Postgres-backed job queue.
 * - enqueue() is idempotent when an idempotencyKey is given (unique index).
 * - Workers claim jobs with FOR UPDATE SKIP LOCKED, so several instances are safe.
 * - Failures retry with exponential backoff until maxAttempts, then become `failed`
 *   and appear in Admin → Background jobs for authorized manual retry.
 * - Handlers must be idempotent (write results with upserts keyed on the subject).
 */

export type JobHandler = (payload: Record<string, unknown>, job: typeof backgroundJobs.$inferSelect) => Promise<Record<string, unknown> | void>;

const handlers = new Map<string, JobHandler>();

export function registerJob(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

export async function enqueue(
  type: string,
  payload: Record<string, unknown>,
  opts: { idempotencyKey?: string; runAt?: Date; maxAttempts?: number; orgId?: string | null; createdBy?: string | null } = {},
) {
  const [row] = await db
    .insert(backgroundJobs)
    .values({
      type,
      payload,
      idempotencyKey: opts.idempotencyKey ?? null,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 3,
      orgId: opts.orgId ?? null,
      createdBy: opts.createdBy ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return { job: row, created: true };
  const [existing] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.idempotencyKey, opts.idempotencyKey!));
  return { job: existing, created: false };
}

async function claim() {
  const res = await db.execute(sql`
    UPDATE background_jobs SET status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
    WHERE id = (
      SELECT id FROM background_jobs
      WHERE status IN ('queued', 'retrying') AND run_at <= now()
      ORDER BY run_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  const rows = (res as unknown as { rows: { id: string }[] }).rows;
  if (!rows?.length) return null;
  const [job] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, rows[0].id));
  return job;
}

export async function runJob(job: typeof backgroundJobs.$inferSelect) {
  const handler = handlers.get(job.type);
  try {
    if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
    const result = await handler(job.payload, job);
    await db
      .update(backgroundJobs)
      .set({ status: 'succeeded', result: result ?? {}, lockedAt: null, lastError: null, updatedAt: new Date() })
      .where(eq(backgroundJobs.id, job.id));
    return 'succeeded' as const;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const exhausted = job.attempts >= job.maxAttempts;
    const backoffMs = Math.min(15 * 60_000, 2 ** job.attempts * 5_000);
    await db
      .update(backgroundJobs)
      .set({
        status: exhausted ? 'failed' : 'retrying',
        lastError: message.slice(0, 2000),
        lockedAt: null,
        runAt: exhausted ? job.runAt : new Date(Date.now() + backoffMs),
        updatedAt: new Date(),
      })
      .where(eq(backgroundJobs.id, job.id));
    if (!process.env.VITEST) console.warn(`[jobs] ${job.type} ${job.id} attempt ${job.attempts} failed: ${message}`);
    return exhausted ? ('failed' as const) : ('retrying' as const);
  }
}

/** Process up to `max` ready jobs. Used by the worker loop and by tests. */
export async function drainJobs(max = 50) {
  let n = 0;
  for (; n < max; n++) {
    const job = await claim();
    if (!job) break;
    await runJob(job);
  }
  return n;
}

/** Jobs stuck in `running` (process crashed mid-job) go back to the queue. */
export async function recoverStaleJobs(olderThanMs = 5 * 60_000) {
  await db
    .update(backgroundJobs)
    .set({ status: 'retrying', lockedAt: null, lastError: 'Recovered after worker interruption', updatedAt: new Date() })
    .where(and(eq(backgroundJobs.status, 'running'), lt(backgroundJobs.lockedAt, new Date(Date.now() - olderThanMs))));
}

export async function retryJob(id: string) {
  const [job] = await db
    .update(backgroundJobs)
    .set({ status: 'queued', runAt: new Date(), maxAttempts: sql`${backgroundJobs.attempts} + 1`, lastError: null, updatedAt: new Date() })
    .where(and(eq(backgroundJobs.id, id), inArray(backgroundJobs.status, ['failed', 'cancelled'])))
    .returning();
  return job ?? null;
}

export async function cancelJob(id: string) {
  const [job] = await db
    .update(backgroundJobs)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(backgroundJobs.id, id), inArray(backgroundJobs.status, ['queued', 'retrying', 'failed'])))
    .returning();
  return job ?? null;
}

let timer: NodeJS.Timeout | null = null;
let busy = false;
let lastTickAt: Date | null = null;

export function startWorker(intervalMs = 1000) {
  if (timer) return;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    lastTickAt = new Date();
    try {
      await recoverStaleJobs();
      await drainJobs(20);
    } catch (e) {
      console.error('[jobs] worker tick failed', e);
    } finally {
      busy = false;
    }
  }, intervalMs);
  timer.unref();
}

export function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function workerStatus() {
  return { running: !!timer, lastTickAt, handlers: [...handlers.keys()] };
}
