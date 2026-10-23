import { and, eq, isNotNull, lt, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { auditLogs, backgroundJobs, files, sessions, aiConversations } from '../../db/schema';
import { registerJob, retryJob } from '../../jobs/queue';
import { scheduleNext } from '../files/recurring';
import { getRetention, AUDIT_MIN_RETENTION_DAYS, SESSION_PRUNE_DAYS } from './settings';

export const RETENTION_JOB = 'admin.retention';
export const RETENTION_PERIOD_MS = 86400_000;
export const DEMO_FAILING_JOB = 'demo.failing_example';

const DAY = 86400_000;

/**
 * Daily retention sweep. Idempotent: every step is "delete/expire what is older than X",
 * so running it twice in a row changes nothing the second time.
 */
export async function runRetentionSweep() {
  const r = await getRetention();
  const now = Date.now();

  // 1. Export files: past their own expiry, or older than the export retention window.
  const exportCutoff = new Date(now - r.exportFileRetentionDays * DAY);
  const expiredExports = await db
    .update(files)
    .set({ status: 'deleted', data: null })
    .where(
      and(
        eq(files.purpose, 'export'),
        eq(files.status, 'ready'),
        or(and(isNotNull(files.expiresAt), lt(files.expiresAt, new Date(now))), lt(files.createdAt, exportCutoff)),
      ),
    )
    .returning({ id: files.id });

  // 2. Audit logs older than the retention window, never younger than the 90-day floor.
  const auditDays = Math.max(AUDIT_MIN_RETENTION_DAYS, r.auditLogRetentionDays);
  const prunedAudit = await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, new Date(now - auditDays * DAY)))
    .returning({ id: auditLogs.id });

  // 3. Sessions revoked or expired more than 30 days ago.
  const sessionCutoff = new Date(now - SESSION_PRUNE_DAYS * DAY);
  const prunedSessions = await db
    .delete(sessions)
    .where(or(and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, sessionCutoff)), lt(sessions.expiresAt, sessionCutoff)))
    .returning({ id: sessions.id });

  // 4. Optional: AI conversations untouched for longer than the configured window.
  let prunedConversations = 0;
  if (r.aiConversationRetentionDays) {
    const res = await db
      .delete(aiConversations)
      .where(lt(aiConversations.updatedAt, new Date(now - r.aiConversationRetentionDays * DAY)))
      .returning({ id: aiConversations.id });
    prunedConversations = res.length;
  }

  return {
    ranAt: new Date(now).toISOString(),
    expiredExportFiles: expiredExports.length,
    prunedAuditLogs: prunedAudit.length,
    auditRetentionDaysApplied: auditDays,
    prunedSessions: prunedSessions.length,
    prunedAiConversations: prunedConversations,
    aiConversationRetention: r.aiConversationRetentionDays ? `${r.aiConversationRetentionDays} days` : 'off',
  };
}

registerJob(RETENTION_JOB, async (payload) => {
  const summary = await runRetentionSweep();
  if (!payload.manual) await scheduleNext(RETENTION_JOB, RETENTION_PERIOD_MS);
  return summary;
});

/**
 * DEMONSTRATION ONLY. The demo seed inserts one failed job of this type so the
 * Background jobs page shows the recovery path. The handler does nothing harmful:
 * it just reports success, so an admin retry succeeds once.
 */
registerJob(DEMO_FAILING_JOB, async (payload) => {
  return { demonstration: true, note: 'Demonstration handler: the retry succeeded. No real work was performed.', echoed: payload.label ?? null };
});

// ---------- Helpers for the admin routes ----------

const SECRET_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|private[-_]?key|otp/i;

/** Deep copy of a job payload/result with secret-looking fields replaced. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) return value.slice(0, 2000) + '... [truncated]';
  return value;
}

/**
 * Same semantics as queue.recoverStaleJobs (running jobs whose lock is older than
 * the threshold go back to `retrying`), but returns which jobs were recovered so the
 * admin action can report and audit them.
 */
export async function recoverStaleJobsCounted(olderThanMs: number) {
  const rows = await db
    .update(backgroundJobs)
    .set({ status: 'retrying', lockedAt: null, runAt: new Date(), lastError: 'Recovered by an administrator after worker interruption', updatedAt: new Date() })
    .where(and(eq(backgroundJobs.status, 'running'), lt(backgroundJobs.lockedAt, new Date(Date.now() - olderThanMs))))
    .returning({ id: backgroundJobs.id, type: backgroundJobs.type });
  return rows;
}

/** Retry every failed job of a type (bounded), one by one through the queue's retryJob. */
export async function bulkRetryByType(type: string, limit = 200) {
  const ids = await db
    .select({ id: backgroundJobs.id })
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.type, type), eq(backgroundJobs.status, 'failed')))
    .limit(limit);
  const retried: string[] = [];
  for (const { id } of ids) if (await retryJob(id)) retried.push(id);
  return retried;
}
