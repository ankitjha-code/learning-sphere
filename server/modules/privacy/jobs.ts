import { and, eq, inArray, lte } from 'drizzle-orm';
import { db } from '../../db/client';
import { dataRequests, users } from '../../db/schema';
import { enqueue, registerJob } from '../../jobs/queue';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { sendEmail, emailProvider } from '../../lib/email';
import { storeFile } from '../files/service';
import { scheduleNext } from '../files/recurring';
import { EXPORT_TTL_DAYS, buildArchive, eraseUser, RETENTION_RULES } from './service';

/** Builds the personal-data archive. Idempotent: a finished request is never rebuilt. */
registerJob('privacy.export', async (payload) => {
  const requestId = String(payload.requestId);
  const [req] = await db.select().from(dataRequests).where(eq(dataRequests.id, requestId));
  if (!req || req.kind !== 'export') return { skipped: 'missing' };
  if (req.status === 'ready' || req.status === 'completed') return { skipped: 'already done', fileId: req.fileId };
  const [u] = await db.select({ status: users.status }).from(users).where(eq(users.id, req.userId));
  if (!u || u.status === 'deleted') {
    await db.update(dataRequests).set({ status: 'cancelled', completedAt: new Date() }).where(eq(dataRequests.id, req.id));
    return { skipped: 'account deleted' };
  }
  await db.update(dataRequests).set({ status: 'processing' }).where(eq(dataRequests.id, req.id));
  const archive = await buildArchive(req.userId);
  const data = Buffer.from(JSON.stringify(archive, null, 2), 'utf8');
  const stamp = new Date().toISOString().slice(0, 10);
  const file = await storeFile({
    ownerId: req.userId,
    purpose: 'export',
    filename: `learnsphere-data-export-${stamp}.json`,
    mime: 'application/json',
    data,
    expiresAt: new Date(Date.now() + EXPORT_TTL_DAYS * 86400_000),
  });
  const counts = Object.fromEntries(
    Object.entries(archive)
      .filter(([, v]) => v && typeof v === 'object')
      .map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([kk, vv]) => [kk, Array.isArray(vv) ? vv.length : vv ? 1 : 0]))]),
  );
  await db.update(dataRequests).set({ status: 'ready', fileId: file.id, completedAt: new Date(), summary: { bytes: data.length, sections: counts } }).where(eq(dataRequests.id, req.id));
  await audit(null, { action: 'privacy.export_ready', actorId: req.userId, targetType: 'user', targetId: req.userId, meta: { requestId: req.id, fileId: file.id, bytes: data.length } });
  await notify(req.userId, {
    type: 'privacy.export_ready',
    category: 'security',
    title: 'Your data export is ready',
    body: `Download it from Settings, Privacy within ${EXPORT_TTL_DAYS} days. Only you can download it.`,
    link: '/app/settings/privacy',
  });
  return { fileId: file.id, bytes: data.length };
});

/**
 * Performs a scheduled account deletion. Safe to retry: completed or cancelled
 * requests are skipped, and every erasure step is idempotent.
 */
registerJob('privacy.delete', async (payload) => {
  const requestId = String(payload.requestId);
  const [req] = await db.select().from(dataRequests).where(eq(dataRequests.id, requestId));
  if (!req || req.kind !== 'deletion') return { skipped: 'missing' };
  if (req.status === 'completed' || req.status === 'cancelled') return { skipped: req.status };
  if (req.scheduledFor && new Date(req.scheduledFor).getTime() > Date.now() + 1000) return { skipped: 'not due yet' };
  const [u] = await db.select().from(users).where(eq(users.id, req.userId));
  if (!u) return { skipped: 'missing user' };
  if (u.status !== 'pending_deletion' && u.status !== 'deleted') {
    // The user cancelled (status restored) but the request was not marked: treat as cancelled.
    await db.update(dataRequests).set({ status: 'cancelled', completedAt: new Date() }).where(eq(dataRequests.id, req.id));
    return { skipped: 'user active' };
  }
  const email = u.status === 'pending_deletion' ? u.email : null;
  const name = u.name;
  await db.update(dataRequests).set({ status: 'processing' }).where(eq(dataRequests.id, req.id));
  const items = await eraseUser(u.id);
  const summary = {
    completedAt: new Date().toISOString(),
    reason: (req.summary as { reason?: string } | null)?.reason ?? null,
    deleted: items.filter((i) => i.action === 'deleted'),
    anonymized: items.filter((i) => i.action === 'anonymized'),
    retained: items.filter((i) => i.action === 'retained'),
    rules: RETENTION_RULES.map((r) => ({ key: r.key, label: r.label, outcome: r.outcome })),
  };
  await db.update(dataRequests).set({ status: 'completed', completedAt: new Date(), summary }).where(eq(dataRequests.id, req.id));
  await audit(null, { action: 'privacy.deletion_completed', actorId: null, targetType: 'user', targetId: u.id, meta: { requestId: req.id, deleted: summary.deleted.length, anonymized: summary.anonymized.length, retained: summary.retained.length } });
  // Final confirmation goes straight to the address on file (the in-app inbox no longer exists).
  if (email && emailProvider().configured) {
    const lines = [
      `Hi ${name},`,
      '',
      'Your LearnSphere Nexus account has been deleted.',
      '',
      'Deleted: ' + summary.deleted.filter((i) => i.count > 0).map((i) => i.label).join(', '),
      'Kept without your identity: ' + [...summary.anonymized, ...summary.retained].filter((i) => i.count > 0).map((i) => `${i.label} (${i.reason ?? 'record-keeping obligation'})`).join('; '),
      '',
      'This is the last message we will send to this address.',
    ];
    await sendEmail({ to: email, subject: 'Your LearnSphere Nexus account was deleted', text: lines.join('\n') }).catch(() => undefined);
  }
  return { deleted: summary.deleted.length, anonymized: summary.anonymized.length, retained: summary.retained.length };
});

/** Hourly sweep: runs due deletions whose job was lost or ran early. */
registerJob('privacy.sweep', async () => {
  const due = await db
    .select({ id: dataRequests.id })
    .from(dataRequests)
    .where(and(eq(dataRequests.kind, 'deletion'), inArray(dataRequests.status, ['pending', 'processing']), lte(dataRequests.scheduledFor, new Date())));
  for (const r of due) {
    // A separate key from the scheduled job so a job that already ran early does not block it.
    await enqueue('privacy.delete', { requestId: r.id }, { idempotencyKey: `privacy.delete:${r.id}:sweep`, maxAttempts: 5 });
  }
  await scheduleNext('privacy.sweep', 3600_000);
  return { queued: due.length };
});
