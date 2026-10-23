import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, inArray, ne, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import { users, dataRequests, sessions, backgroundJobs, files } from '../../db/schema';
import { type AppEnv, requireAuth } from '../../lib/context';
import { body } from '../../lib/validate';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { rateLimit } from '../../lib/ratelimit';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { verifyPassword } from '../../lib/crypto';
import { enqueue, cancelJob } from '../../jobs/queue';
import { storageUsed, userQuotaBytes } from '../files/service';
import { ensureScheduled } from '../files/recurring';
import { DELETE_CONFIRM_TEXT, EXPORT_TTL_DAYS, RETENTION_RULES, RETENTION_SUMMARY, dataCategories, deletionGraceDays } from './service';

/** Mounted at /api/privacy. */
export const privacyRoutes = new Hono<AppEnv>();

privacyRoutes.use('*', async (_c, next) => {
  ensureScheduled('privacy.sweep', 3600_000);
  await next();
});

async function requestRows(userId: string) {
  const rows = await db
    .select({ r: dataRequests, fileStatus: files.status, fileSize: files.size, fileExpiresAt: files.expiresAt })
    .from(dataRequests)
    .leftJoin(files, eq(files.id, dataRequests.fileId))
    .where(eq(dataRequests.userId, userId))
    .orderBy(desc(dataRequests.createdAt))
    .limit(20);
  return rows.map(({ r, fileStatus, fileSize, fileExpiresAt }) => {
    const downloadable = r.kind === 'export' && r.status === 'ready' && fileStatus === 'ready' && (!fileExpiresAt || new Date(fileExpiresAt).getTime() > Date.now());
    return {
      id: r.id,
      kind: r.kind,
      status: r.kind === 'export' && r.status === 'ready' && !downloadable ? 'expired' : r.status,
      createdAt: r.createdAt,
      scheduledFor: r.scheduledFor,
      completedAt: r.completedAt,
      summary: r.summary,
      file: downloadable ? { id: r.fileId, size: fileSize, expiresAt: fileExpiresAt, url: `/api/files/${r.fileId}` } : null,
    };
  });
}

privacyRoutes.get('/summary', async (c) => {
  const auth = requireAuth(c);
  const [u] = await db.select({ status: users.status, deletionRequestedAt: users.deletionRequestedAt, preferences: users.preferences }).from(users).where(eq(users.id, auth.user.id));
  const [categories, requests, graceDays, used, quota] = await Promise.all([dataCategories(auth.user.id), requestRows(auth.user.id), deletionGraceDays(), storageUsed(auth.user.id), userQuotaBytes()]);
  const pendingDeletion = requests.find((r) => r.kind === 'deletion' && r.status === 'pending') ?? null;
  return c.json({
    status: u.status,
    deletionRequestedAt: u.deletionRequestedAt,
    pendingDeletion,
    graceDays,
    confirmText: DELETE_CONFIRM_TEXT,
    exportTtlDays: EXPORT_TTL_DAYS,
    visibility: { publicProfile: !!u.preferences.publicProfile, showOnLeaderboard: u.preferences.showOnLeaderboard === true },
    storage: { used, quota },
    categories,
    retention: { rules: RETENTION_RULES, ...RETENTION_SUMMARY },
    requests,
  });
});

privacyRoutes.get('/requests', async (c) => {
  const auth = requireAuth(c);
  return c.json({ items: await requestRows(auth.user.id) });
});

/** Starts (or returns the in-flight) export of all the user's data. */
privacyRoutes.post('/export', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`privacy-export:${auth.user.id}`, 5, 86400_000);
  const [inflight] = await db
    .select()
    .from(dataRequests)
    .where(and(eq(dataRequests.userId, auth.user.id), eq(dataRequests.kind, 'export'), inArray(dataRequests.status, ['pending', 'processing'])));
  if (inflight) return c.json({ request: { id: inflight.id, status: inflight.status, createdAt: inflight.createdAt }, created: false });
  const [req] = await db.insert(dataRequests).values({ userId: auth.user.id, kind: 'export', status: 'pending' }).returning();
  await enqueue('privacy.export', { requestId: req.id }, { idempotencyKey: `privacy.export:${req.id}`, createdBy: auth.user.id, maxAttempts: 3 });
  await audit(c, { action: 'privacy.export_requested', targetType: 'user', targetId: auth.user.id, meta: { requestId: req.id } });
  return c.json({ request: { id: req.id, status: req.status, createdAt: req.createdAt }, created: true }, 202);
});

privacyRoutes.post('/delete', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`privacy-delete:${auth.user.id}`, 10, 3600_000);
  const input = await body(
    c,
    z.object({
      password: z.string().min(1, 'Enter your password.').max(200),
      confirm: z.string().trim().max(100),
      reason: z.string().trim().max(1000).optional(),
    }),
  );
  if (input.confirm.toLowerCase() !== DELETE_CONFIRM_TEXT) throw badRequest(`Type "${DELETE_CONFIRM_TEXT}" to confirm.`, { fields: { confirm: `Type "${DELETE_CONFIRM_TEXT}"` } });
  const [u] = await db.select().from(users).where(eq(users.id, auth.user.id));
  if (!(await verifyPassword(input.password, u.passwordHash))) throw badRequest('Password is incorrect.', { fields: { password: 'Incorrect password' } });
  if (u.status === 'pending_deletion') throw conflict('Deletion is already scheduled. You can cancel it below.');

  const graceDays = await deletionGraceDays();
  const scheduledFor = new Date(Date.now() + graceDays * 86400_000);
  const [req] = await db.insert(dataRequests).values({ userId: u.id, kind: 'deletion', status: 'pending', scheduledFor, summary: input.reason ? { reason: input.reason } : null }).returning();
  await db.update(users).set({ status: 'pending_deletion', deletionRequestedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, u.id));
  // Other devices are signed out now; this session stays so the user can cancel.
  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, u.id), ne(sessions.id, auth.session.id), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  await enqueue('privacy.delete', { requestId: req.id }, { idempotencyKey: `privacy.delete:${req.id}`, runAt: scheduledFor, createdBy: u.id, maxAttempts: 5 });
  await audit(c, { action: 'privacy.deletion_requested', targetType: 'user', targetId: u.id, meta: { requestId: req.id, scheduledFor: scheduledFor.toISOString(), sessionsRevoked: revoked.length } });
  await notify(u.id, {
    type: 'privacy.deletion_scheduled',
    category: 'security',
    title: 'Account deletion scheduled',
    body: `Your account and personal data will be deleted on ${scheduledFor.toUTCString()}. Sign in and cancel from Settings, Privacy before then if this was a mistake.`,
    link: '/app/settings/privacy',
  });
  return c.json({ request: { id: req.id, status: req.status, scheduledFor }, sessionsRevoked: revoked.length, graceDays }, 202);
});

privacyRoutes.post('/delete/cancel', async (c) => {
  const auth = requireAuth(c);
  const [req] = await db
    .select()
    .from(dataRequests)
    .where(and(eq(dataRequests.userId, auth.user.id), eq(dataRequests.kind, 'deletion'), eq(dataRequests.status, 'pending')));
  if (!req) throw notFound('Pending deletion request');
  await db.update(dataRequests).set({ status: 'cancelled', completedAt: new Date() }).where(eq(dataRequests.id, req.id));
  await db.update(users).set({ status: 'active', deletionRequestedAt: null, updatedAt: new Date() }).where(eq(users.id, auth.user.id));
  const [job] = await db.select({ id: backgroundJobs.id }).from(backgroundJobs).where(eq(backgroundJobs.idempotencyKey, `privacy.delete:${req.id}`));
  if (job) await cancelJob(job.id);
  await audit(c, { action: 'privacy.deletion_cancelled', targetType: 'user', targetId: auth.user.id, meta: { requestId: req.id } });
  await notify(auth.user.id, { type: 'privacy.deletion_cancelled', category: 'security', title: 'Account deletion cancelled', body: 'Your account stays active. Nothing was deleted.', link: '/app/settings/privacy' });
  return c.json({ ok: true });
});
