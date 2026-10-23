import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { users, memberships, organizations, sessions, passwordResets, dataRequests, auditLogs } from '../../db/schema';
import { type AppEnv, requirePlatformAdmin, requirePlatformStaff } from '../../lib/context';
import { body, idParam, query } from '../../lib/validate';
import { conflict, notFound, unavailable } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { randomToken, sha256 } from '../../lib/crypto';
import { config } from '../../lib/config';
import { rateLimit } from '../../lib/ratelimit';
import { emailProvider } from '../../lib/email';
import { enqueue, workerStatus } from '../../jobs/queue';
import { ORG_ROLES, PLATFORM_ROLES } from '@shared/roles';
import { likePattern, offsetOf, pageParams } from './common';

/** Mounted at /api/admin/users. Support staff can read; only platform admins can change anything. */
export const adminUserRoutes = new Hono<AppEnv>();

const RESET_LINK_TTL_MS = 3600_000;
export const PRIVACY_EXPORT_JOB = 'privacy.export';

async function loadUser(id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) throw notFound('User');
  return u;
}

async function activePlatformAdminCount() {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.platformRole, 'platform_admin'), eq(users.status, 'active')));
  return r.n;
}

async function revokeAllSessions(userId: string) {
  const res = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return res.length;
}

adminUserRoutes.get('/', async (c) => {
  requirePlatformStaff(c);
  const q = query(
    c,
    z.object({
      ...pageParams,
      q: z.string().trim().max(200).optional(),
      role: z.enum([...PLATFORM_ROLES, ...ORG_ROLES, 'none']).optional(),
      status: z.enum(['active', 'suspended', 'pending_deletion', 'deleted']).optional(),
      orgId: z.string().uuid().optional(),
      sample: z.enum(['true', 'false']).optional(),
    }),
  );
  const where = and(
    q.q ? or(sql`${users.name} ilike ${likePattern(q.q)}`, sql`${users.email} ilike ${likePattern(q.q)}`) : undefined,
    q.status ? eq(users.status, q.status) : undefined,
    q.sample ? eq(users.isSample, q.sample === 'true') : undefined,
    q.role === 'none' ? isNull(users.platformRole) : undefined,
    q.role && (PLATFORM_ROLES as readonly string[]).includes(q.role) ? eq(users.platformRole, q.role) : undefined,
    q.role && (ORG_ROLES as readonly string[]).includes(q.role)
      ? sql`exists (select 1 from memberships m where m.user_id = "users"."id" and ${q.role} = any(m.roles) and m.status = 'active')`
      : undefined,
    q.orgId ? sql`exists (select 1 from memberships m where m.user_id = "users"."id" and m.org_id = ${q.orgId})` : undefined,
  );
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(users).where(where);
  const items = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      platformRole: users.platformRole,
      status: users.status,
      isSample: users.isSample,
      avatarColor: users.avatarColor,
      lastActiveAt: users.lastActiveAt,
      createdAt: users.createdAt,
      orgCount: sql<number>`(select count(*)::int from memberships m where m.user_id = "users"."id" and m.status = 'active')`,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt), asc(users.email))
    .limit(q.pageSize)
    .offset(offsetOf(q));
  return c.json({ items, total, page: q.page, pageSize: q.pageSize });
});

adminUserRoutes.get('/:id', async (c) => {
  const auth = requirePlatformStaff(c);
  const id = idParam(c);
  const u = await loadUser(id);
  const ms = await db
    .select({
      membershipId: memberships.id,
      orgId: organizations.id,
      orgName: organizations.name,
      orgKind: organizations.kind,
      orgStatus: organizations.status,
      roles: memberships.roles,
      status: memberships.status,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, id))
    .orderBy(asc(organizations.name));
  const [{ activeSessions }] = await db
    .select({ activeSessions: sql<number>`count(*)::int` })
    .from(sessions)
    .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  const requests = await db.select().from(dataRequests).where(eq(dataRequests.userId, id)).orderBy(desc(dataRequests.createdAt)).limit(20);
  const recentAudit = await db
    .select({ id: auditLogs.id, action: auditLogs.action, actorId: auditLogs.actorId, createdAt: auditLogs.createdAt, meta: auditLogs.meta })
    .from(auditLogs)
    .where(and(eq(auditLogs.targetType, 'user'), eq(auditLogs.targetId, id), sql`${auditLogs.action} like 'admin.%'`))
    .orderBy(desc(auditLogs.createdAt))
    .limit(15);
  const isAdmin = auth.user.platformRole === 'platform_admin';
  const self = auth.user.id === id;
  return c.json({
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      platformRole: u.platformRole,
      status: u.status,
      isSample: u.isSample,
      avatarColor: u.avatarColor,
      emailVerifiedAt: u.emailVerifiedAt,
      hasPassword: !!u.passwordHash,
      lastActiveAt: u.lastActiveAt,
      deletionRequestedAt: u.deletionRequestedAt,
      createdAt: u.createdAt,
      timezone: u.timezone,
    },
    memberships: ms,
    activeSessions,
    dataRequests: requests.map((r) => ({ id: r.id, kind: r.kind, status: r.status, createdAt: r.createdAt, scheduledFor: r.scheduledFor, completedAt: r.completedAt })),
    recentAdminActions: recentAudit,
    emailConfigured: emailProvider().configured,
    exportAvailable: workerStatus().handlers.includes(PRIVACY_EXPORT_JOB),
    can: {
      suspend: isAdmin && !self && u.status === 'active',
      unsuspend: isAdmin && u.status === 'suspended',
      revokeSessions: isAdmin && !self,
      changeRole: isAdmin && !self,
      resetLink: isAdmin && !self && u.status !== 'deleted',
      export: isAdmin && u.status !== 'deleted',
    },
    reasons: {
      self: self ? 'You cannot perform admin actions on your own account. Use Settings instead.' : null,
      readOnly: isAdmin ? null : 'Support staff have read-only access. Ask a platform admin to make changes.',
    },
  });
});

adminUserRoutes.post('/:id/suspend', async (c) => {
  const auth = requirePlatformAdmin(c);
  const id = idParam(c);
  const input = await body(c, z.object({ reason: z.string().trim().min(3, 'Give a short reason (kept in the audit log).').max(500) }));
  if (id === auth.user.id) throw conflict('You cannot suspend your own account.');
  const u = await loadUser(id);
  if (u.status === 'suspended') throw conflict('This account is already suspended.');
  if (u.status === 'deleted') throw conflict('This account has been deleted.');
  if (u.platformRole === 'platform_admin' && (await activePlatformAdminCount()) <= 1) throw conflict('This is the last active platform admin.');
  await db.update(users).set({ status: 'suspended', updatedAt: new Date() }).where(eq(users.id, id));
  const revoked = await revokeAllSessions(id);
  await audit(c, { action: 'admin.user_suspended', targetType: 'user', targetId: id, meta: { reason: input.reason, previousStatus: u.status, sessionsRevoked: revoked } });
  return c.json({ ok: true, sessionsRevoked: revoked });
});

adminUserRoutes.post('/:id/unsuspend', async (c) => {
  requirePlatformAdmin(c);
  const id = idParam(c);
  const u = await loadUser(id);
  if (u.status !== 'suspended') throw conflict('This account is not suspended.');
  await db.update(users).set({ status: 'active', updatedAt: new Date() }).where(eq(users.id, id));
  await audit(c, { action: 'admin.user_unsuspended', targetType: 'user', targetId: id });
  await notify(id, { type: 'security.account_restored', category: 'security', title: 'Your account was restored', body: 'A platform administrator lifted the suspension on your account.' });
  return c.json({ ok: true });
});

adminUserRoutes.post('/:id/revoke-sessions', async (c) => {
  const auth = requirePlatformAdmin(c);
  const id = idParam(c);
  if (id === auth.user.id) throw conflict('Use Settings, Security to sign out your own other sessions.');
  await loadUser(id);
  const revoked = await revokeAllSessions(id);
  await audit(c, { action: 'admin.user_sessions_revoked', targetType: 'user', targetId: id, meta: { count: revoked } });
  await notify(id, { type: 'security.sessions_revoked', category: 'security', title: 'You were signed out everywhere', body: 'A platform administrator signed out all of your sessions. Sign in again to continue.', email: false });
  return c.json({ ok: true, revoked });
});

adminUserRoutes.patch('/:id/platform-role', async (c) => {
  const auth = requirePlatformAdmin(c);
  const id = idParam(c);
  const input = await body(c, z.object({ platformRole: z.enum(PLATFORM_ROLES).nullable() }));
  if (id === auth.user.id) throw conflict('You cannot change your own platform role. Ask another platform admin.');
  const u = await loadUser(id);
  if (u.platformRole === input.platformRole) return c.json({ ok: true, unchanged: true });
  if (u.platformRole === 'platform_admin' && input.platformRole !== 'platform_admin' && u.status === 'active' && (await activePlatformAdminCount()) <= 1) {
    throw conflict('This is the last active platform admin. Make someone else a platform admin first.');
  }
  await db.update(users).set({ platformRole: input.platformRole, updatedAt: new Date() }).where(eq(users.id, id));
  await audit(c, { action: 'admin.platform_role_changed', targetType: 'user', targetId: id, meta: { from: u.platformRole, to: input.platformRole } });
  await notify(id, {
    type: 'security.platform_role_changed',
    category: 'security',
    title: 'Your platform role changed',
    body: input.platformRole ? `You now have the ${input.platformRole === 'platform_admin' ? 'Platform admin' : 'Support'} role.` : 'You no longer have a platform staff role.',
  });
  return c.json({ ok: true });
});

/**
 * Support workflow for servers without email: the admin gets a one-hour, single-use
 * reset link to pass to the person through a trusted channel. The token is shown once
 * and only its hash is stored. Earlier unused admin-created links are invalidated.
 */
adminUserRoutes.post('/:id/reset-link', async (c) => {
  const auth = requirePlatformAdmin(c);
  rateLimit(`admin-reset:${auth.user.id}`, 20, 3600_000);
  const id = idParam(c);
  if (id === auth.user.id) throw conflict('Use Settings, Security to change your own password.');
  const u = await loadUser(id);
  if (u.status === 'deleted') throw conflict('This account has been deleted.');
  await db
    .update(passwordResets)
    .set({ expiresAt: new Date() })
    .where(and(eq(passwordResets.userId, id), eq(passwordResets.createdBy, 'admin'), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())));
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + RESET_LINK_TTL_MS);
  const [row] = await db.insert(passwordResets).values({ userId: id, tokenHash: sha256(token), createdBy: 'admin', expiresAt }).returning({ id: passwordResets.id });
  await audit(c, { action: 'admin.password_reset_link_created', targetType: 'user', targetId: id, meta: { resetId: row.id, expiresAt: expiresAt.toISOString() } });
  await notify(id, {
    type: 'security.admin_reset_link',
    category: 'security',
    title: 'An administrator created a password reset link for you',
    body: 'If you did not ask platform support for this, contact them. The link works once and expires in 1 hour.',
    email: false,
  });
  return c.json({
    link: `${config().APP_URL}/reset-password?token=${token}`,
    expiresAt,
    notice: 'This link is shown only once. Share it with the person through a channel you trust. It works once and expires in 1 hour.',
    suspended: u.status === 'suspended',
  });
});

/**
 * Admin-assisted data export: creates a data request and queues the privacy module's
 * export job with the same payload shape it uses ({ requestId }). The archive is
 * delivered to the user (only they can download it), never to the admin.
 */
adminUserRoutes.post('/:id/export', async (c) => {
  requirePlatformAdmin(c);
  const id = idParam(c);
  const u = await loadUser(id);
  if (u.status === 'deleted') throw conflict('This account has been deleted.');
  if (!workerStatus().handlers.includes(PRIVACY_EXPORT_JOB)) {
    throw unavailable('export_unavailable', 'Data export processing is not available on this server yet, so no request was created.');
  }
  const [pending] = await db
    .select({ id: dataRequests.id })
    .from(dataRequests)
    .where(and(eq(dataRequests.userId, id), eq(dataRequests.kind, 'export'), sql`${dataRequests.status} in ('pending','processing')`));
  if (pending) throw conflict('An export for this user is already in progress.');
  const [req] = await db.insert(dataRequests).values({ userId: id, kind: 'export', status: 'pending', summary: { requestedBy: 'admin' } }).returning();
  const { job } = await enqueue(PRIVACY_EXPORT_JOB, { requestId: req.id }, { idempotencyKey: `privacy.export:${req.id}`, createdBy: c.get('auth')?.user.id ?? null, maxAttempts: 3 });
  await audit(c, { action: 'admin.user_export_requested', targetType: 'user', targetId: id, meta: { requestId: req.id, jobId: job.id } });
  await notify(id, { type: 'privacy.export_requested', category: 'security', title: 'A copy of your data is being prepared', body: 'Platform support started a data export for your account. You will be notified when it is ready.', link: '/app/settings/privacy' });
  return c.json({ request: { id: req.id, status: req.status }, jobId: job.id }, 201);
});
