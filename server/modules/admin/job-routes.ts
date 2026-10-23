import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { backgroundJobs, users, organizations, auditLogs } from '../../db/schema';
import { type AppEnv, requirePlatformAdmin, requirePlatformStaff } from '../../lib/context';
import { body, idParam, query } from '../../lib/validate';
import { conflict, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { retryJob, cancelJob, workerStatus } from '../../jobs/queue';
import { isoDate, offsetOf, pageParams } from './common';
import { redact, recoverStaleJobsCounted, bulkRetryByType } from './jobs';

/**
 * Mounted at /api/admin/jobs. Journey 9 operational recovery:
 * failed work is visible with its error, and authorized staff can retry it safely.
 * Handlers are idempotent, so a retry never duplicates results.
 */
export const adminJobRoutes = new Hono<AppEnv>();

const STATUSES = ['queued', 'running', 'retrying', 'succeeded', 'failed', 'cancelled'] as const;
const RETRYABLE = ['failed', 'cancelled'];
const CANCELLABLE = ['queued', 'retrying'];

function worker() {
  const w = workerStatus();
  return { running: w.running, lastTickAt: w.lastTickAt, handlerCount: w.handlers.length };
}

adminJobRoutes.get('/', async (c) => {
  requirePlatformStaff(c);
  const q = query(
    c,
    z.object({
      ...pageParams,
      type: z.string().trim().max(100).optional(),
      status: z.enum(STATUSES).optional(),
      from: isoDate,
      to: isoDate,
    }),
  );
  const where = and(
    q.type ? eq(backgroundJobs.type, q.type) : undefined,
    q.status ? eq(backgroundJobs.status, q.status) : undefined,
    q.from ? gte(backgroundJobs.createdAt, q.from) : undefined,
    q.to ? lte(backgroundJobs.createdAt, q.to) : undefined,
  );
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(backgroundJobs).where(where);
  const items = await db
    .select({
      id: backgroundJobs.id,
      type: backgroundJobs.type,
      status: backgroundJobs.status,
      attempts: backgroundJobs.attempts,
      maxAttempts: backgroundJobs.maxAttempts,
      lastError: sql<string | null>`left(${backgroundJobs.lastError}, 240)`,
      runAt: backgroundJobs.runAt,
      lockedAt: backgroundJobs.lockedAt,
      orgId: backgroundJobs.orgId,
      createdAt: backgroundJobs.createdAt,
      updatedAt: backgroundJobs.updatedAt,
    })
    .from(backgroundJobs)
    .where(where)
    .orderBy(desc(backgroundJobs.updatedAt))
    .limit(q.pageSize)
    .offset(offsetOf(q));
  const counts = await db
    .select({ status: backgroundJobs.status, n: sql<number>`count(*)::int` })
    .from(backgroundJobs)
    .groupBy(backgroundJobs.status);
  const types = await db
    .select({ type: backgroundJobs.type, total: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where ${backgroundJobs.status} = 'failed')::int` })
    .from(backgroundJobs)
    .groupBy(backgroundJobs.type)
    .orderBy(asc(backgroundJobs.type));
  const [{ stale }] = await db
    .select({ stale: sql<number>`count(*)::int` })
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.status, 'running'), sql`${backgroundJobs.lockedAt} < now() - interval '5 minutes'`));
  const handlers = new Set(workerStatus().handlers);
  return c.json({
    items: items.map((i) => ({ ...i, handlerRegistered: handlers.has(i.type) })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    counts: Object.fromEntries(STATUSES.map((s) => [s, counts.find((x) => x.status === s)?.n ?? 0])),
    types,
    staleRunning: stale,
    worker: worker(),
  });
});

adminJobRoutes.get('/:id', async (c) => {
  const auth = requirePlatformStaff(c);
  const id = idParam(c);
  const [row] = await db
    .select({ j: backgroundJobs, createdByName: users.name, orgName: organizations.name })
    .from(backgroundJobs)
    .leftJoin(users, eq(users.id, backgroundJobs.createdBy))
    .leftJoin(organizations, eq(organizations.id, backgroundJobs.orgId))
    .where(eq(backgroundJobs.id, id));
  if (!row) throw notFound('Job');
  const j = row.j;
  const history = await db
    .select({ id: auditLogs.id, action: auditLogs.action, actorId: auditLogs.actorId, createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(and(eq(auditLogs.targetType, 'job'), eq(auditLogs.targetId, id)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(20);
  const isAdmin = auth.user.platformRole === 'platform_admin';
  const handlerRegistered = workerStatus().handlers.includes(j.type);
  return c.json({
    job: {
      id: j.id,
      type: j.type,
      status: j.status,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      runAt: j.runAt,
      lockedAt: j.lockedAt,
      lastError: j.lastError,
      payload: redact(j.payload),
      result: j.result ? redact(j.result) : null,
      idempotencyKey: j.idempotencyKey,
      orgId: j.orgId,
      orgName: row.orgName,
      createdBy: j.createdBy,
      createdByName: row.createdByName,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      handlerRegistered,
    },
    history,
    can: {
      retry: isAdmin && RETRYABLE.includes(j.status),
      cancel: isAdmin && CANCELLABLE.includes(j.status),
    },
    reasons: {
      retry: !isAdmin ? 'Support staff have read-only access.' : !RETRYABLE.includes(j.status) ? `Only failed or cancelled jobs can be retried (this one is ${j.status}).` : !handlerRegistered ? 'No handler is registered for this job type, so a retry will fail again.' : null,
      cancel: !isAdmin ? 'Support staff have read-only access.' : !CANCELLABLE.includes(j.status) ? `Only queued or retrying jobs can be cancelled (this one is ${j.status}).` : null,
    },
  });
});

adminJobRoutes.post('/bulk-retry', async (c) => {
  requirePlatformAdmin(c);
  const input = await body(c, z.object({ type: z.string().trim().min(1).max(100) }));
  const retried = await bulkRetryByType(input.type);
  await audit(c, { action: 'admin.jobs_bulk_retried', targetType: 'job_type', targetId: input.type, meta: { count: retried.length, jobIds: retried.slice(0, 50) } });
  return c.json({ ok: true, retried: retried.length });
});

adminJobRoutes.post('/recover-stale', async (c) => {
  requirePlatformAdmin(c);
  const input = await body(c, z.object({ olderThanMinutes: z.number().int().min(1).max(1440).default(5) }));
  const recovered = await recoverStaleJobsCounted(input.olderThanMinutes * 60_000);
  await audit(c, { action: 'admin.jobs_stale_recovered', targetType: 'job', meta: { count: recovered.length, olderThanMinutes: input.olderThanMinutes, jobIds: recovered.slice(0, 50).map((r) => r.id) } });
  return c.json({ ok: true, recovered: recovered.length, jobs: recovered });
});

adminJobRoutes.post('/:id/retry', async (c) => {
  requirePlatformAdmin(c);
  const id = idParam(c);
  const [j] = await db.select({ status: backgroundJobs.status, type: backgroundJobs.type }).from(backgroundJobs).where(eq(backgroundJobs.id, id));
  if (!j) throw notFound('Job');
  if (!RETRYABLE.includes(j.status)) throw conflict(`Only failed or cancelled jobs can be retried. This job is ${j.status}.`);
  const job = await retryJob(id);
  if (!job) throw conflict('The job changed state before it could be retried. Refresh and try again.');
  await audit(c, { action: 'admin.job_retried', targetType: 'job', targetId: id, meta: { type: j.type, previousStatus: j.status } });
  return c.json({ ok: true, job: { id: job.id, status: job.status } });
});

adminJobRoutes.post('/:id/cancel', async (c) => {
  requirePlatformAdmin(c);
  const id = idParam(c);
  const [j] = await db.select({ status: backgroundJobs.status, type: backgroundJobs.type }).from(backgroundJobs).where(eq(backgroundJobs.id, id));
  if (!j) throw notFound('Job');
  if (!CANCELLABLE.includes(j.status)) throw conflict(`Only queued or retrying jobs can be cancelled. This job is ${j.status}.`);
  const job = await cancelJob(id);
  if (!job) throw conflict('The job changed state before it could be cancelled. Refresh and try again.');
  await audit(c, { action: 'admin.job_cancelled', targetType: 'job', targetId: id, meta: { type: j.type, previousStatus: j.status } });
  return c.json({ ok: true, job: { id: job.id, status: job.status } });
});
