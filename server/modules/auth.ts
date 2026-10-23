import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { users, sessions, passwordResets, profiles, orgInvites, memberships, organizations, mentorProfiles } from '../db/schema';
import { hashPassword, verifyPassword, sha256, randomToken } from '../lib/crypto';
import {
  type AppEnv,
  createSession,
  clearSessionCookie,
  requireAuth,
  clientIp,
  loadMemberships,
} from '../lib/context';
import { body, emailSchema, passwordSchema } from '../lib/validate';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors';
import { rateLimit } from '../lib/ratelimit';
import { audit } from '../lib/audit';
import { notify } from '../lib/notify';
import { sendEmail, emailProvider } from '../lib/email';
import { config } from '../lib/config';
import { WORKSPACES, workspacesFor, type Workspace } from '@shared/roles';
import { isSignupOpen } from './admin/settings';

export const authRoutes = new Hono<AppEnv>();

const failedLogins = new Map<string, { count: number; until: number }>();

function avatarColor(seed: string) {
  const palette = ['#6d5efc', '#0ea5a4', '#e0598b', '#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444'];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

authRoutes.post('/register', async (c) => {
  rateLimit(`register:${clientIp(c)}`, 10, 3600_000);
  const input = await body(
    c,
    z.object({
      name: z.string().trim().min(2, 'Enter your name.').max(100),
      email: emailSchema,
      password: passwordSchema,
      inviteToken: z.string().optional(),
    }),
  );
  if (!input.inviteToken && !(await isSignupOpen())) {
    throw forbidden('Self-service sign-up is closed on this server. Ask an organization admin for an invitation.');
  }
  const [existing] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`);
  if (existing) throw conflict('An account with this email already exists. Try signing in instead.', { fields: { email: 'Already registered' } });

  const [user] = await db
    .insert(users)
    .values({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password), avatarColor: avatarColor(input.email) })
    .returning();
  await db.insert(profiles).values({ userId: user.id });

  let activeOrgId: string | null = null;
  if (input.inviteToken) activeOrgId = await acceptInvite(user.id, user.email, input.inviteToken);

  await createSession(c, user.id, activeOrgId);
  await audit(c, { action: 'auth.register', actorId: user.id, targetType: 'user', targetId: user.id });
  return c.json({ ok: true, userId: user.id }, 201);
});

authRoutes.post('/login', async (c) => {
  const ip = clientIp(c);
  rateLimit(`login:${ip}`, 30, 15 * 60_000);
  const input = await body(c, z.object({ email: emailSchema, password: z.string().min(1).max(200) }));

  const lock = failedLogins.get(input.email);
  if (lock && lock.until > Date.now()) {
    throw unauthorized('Too many failed attempts for this account. Wait 15 minutes or reset your password.');
  }

  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${input.email}`);
  const ok = await verifyPassword(input.password, user?.passwordHash);
  if (!user || !ok) {
    const f = failedLogins.get(input.email) ?? { count: 0, until: 0 };
    f.count += 1;
    if (f.count >= 8) {
      f.until = Date.now() + 15 * 60_000;
      f.count = 0;
      if (user) {
        await notify(user.id, {
          type: 'security.lockout',
          category: 'security',
          title: 'Sign-in temporarily locked',
          body: 'There were several failed sign-in attempts on your account. If this was not you, change your password.',
          link: '/app/settings/security',
        });
      }
    }
    failedLogins.set(input.email, f);
    if (user) await audit(c, { action: 'auth.login_failed', actorId: user.id, targetType: 'user', targetId: user.id });
    throw unauthorized('Email or password is incorrect.');
  }
  if (user.status === 'suspended') throw forbidden('This account is suspended. Contact your organization or platform support.');
  if (user.status === 'deleted') throw unauthorized('Email or password is incorrect.');
  failedLogins.delete(input.email);

  const ms = await loadMemberships(user.id);
  await createSession(c, user.id, ms[0]?.orgId ?? null);
  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));
  await audit(c, { action: 'auth.login', actorId: user.id, targetType: 'user', targetId: user.id });
  return c.json({ ok: true });
});

authRoutes.post('/logout', async (c) => {
  const auth = c.get('auth');
  if (auth) await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, auth.session.id));
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get('/me', async (c) => {
  const auth = c.get('auth');
  if (!auth) return c.json({ user: null });
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, auth.user.id));
  const [mentor] = await db
    .select({ status: mentorProfiles.status })
    .from(mentorProfiles)
    .where(eq(mentorProfiles.userId, auth.user.id));
  const active = auth.memberships.find((m) => m.orgId === auth.session.activeOrgId) ?? null;
  const available = workspacesFor({
    orgRoles: active?.roles ?? [],
    platformRole: auth.user.platformRole,
    isMentor: mentor?.status === 'active',
  });
  const workspace = (available.includes(auth.session.activeWorkspace as Workspace) ? auth.session.activeWorkspace : 'learner') as Workspace;
  return c.json({
    user: auth.user,
    onboarded: !!profile?.onboardingCompletedAt,
    memberships: auth.memberships,
    activeOrg: active,
    workspace,
    workspaces: available,
  });
});

/**
 * Switch the active organization and/or workspace. The server recomputes which
 * workspaces the membership allows; switching never grants new permissions.
 */
authRoutes.post('/switch', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ orgId: z.string().uuid().nullable().optional(), workspace: z.enum(WORKSPACES).optional() }));
  let orgId = auth.session.activeOrgId;
  if (input.orgId !== undefined) {
    if (input.orgId !== null && !auth.memberships.some((m) => m.orgId === input.orgId)) {
      throw forbidden('You are not a member of that organization.');
    }
    orgId = input.orgId;
  }
  const roles = auth.memberships.find((m) => m.orgId === orgId)?.roles ?? [];
  const [mentor] = await db.select({ status: mentorProfiles.status }).from(mentorProfiles).where(eq(mentorProfiles.userId, auth.user.id));
  const allowed = workspacesFor({ orgRoles: roles, platformRole: auth.user.platformRole, isMentor: mentor?.status === 'active' });
  let workspace = input.workspace ?? (auth.session.activeWorkspace as Workspace);
  if (!allowed.includes(workspace)) {
    if (input.workspace) throw forbidden(`Your roles in this organization do not include the ${input.workspace} workspace.`);
    workspace = 'learner';
  }
  await db.update(sessions).set({ activeOrgId: orgId, activeWorkspace: workspace }).where(eq(sessions.id, auth.session.id));
  return c.json({ ok: true, orgId, workspace });
});

// ---------- Sessions ----------

authRoutes.get('/sessions', async (c) => {
  const auth = requireAuth(c);
  const rows = await db
    .select({ id: sessions.id, userAgent: sessions.userAgent, ip: sessions.ip, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .where(and(eq(sessions.userId, auth.user.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));
  return c.json({
    sessions: rows.map((r) => ({ ...r, id: r.id.slice(0, 12), current: r.id === auth.session.id })),
  });
});

authRoutes.post('/sessions/revoke', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ id: z.string().min(6).optional(), allOthers: z.boolean().optional() }));
  if (input.allOthers) {
    const res = await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, auth.user.id), ne(sessions.id, auth.session.id), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    await audit(c, { action: 'auth.sessions_revoked', targetType: 'user', targetId: auth.user.id, meta: { count: res.length } });
    return c.json({ ok: true, revoked: res.length });
  }
  if (!input.id) throw badRequest('Choose a session to revoke.');
  const res = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, auth.user.id), sql`${sessions.id} LIKE ${input.id + '%'}`, isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  if (!res.length) throw notFound('Session');
  await audit(c, { action: 'auth.session_revoked', targetType: 'user', targetId: auth.user.id });
  return c.json({ ok: true, revoked: res.length });
});

// ---------- Passwords ----------

authRoutes.post('/password', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`pwchange:${auth.user.id}`, 10, 3600_000);
  const input = await body(c, z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }));
  const [u] = await db.select().from(users).where(eq(users.id, auth.user.id));
  if (!(await verifyPassword(input.currentPassword, u.passwordHash))) {
    throw badRequest('Current password is incorrect.', { fields: { currentPassword: 'Incorrect password' } });
  }
  await db.update(users).set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() }).where(eq(users.id, u.id));
  // Changing a password signs out every other session.
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, u.id), ne(sessions.id, auth.session.id)));
  await audit(c, { action: 'auth.password_changed', targetType: 'user', targetId: u.id });
  await notify(u.id, { type: 'security.password_changed', category: 'security', title: 'Your password was changed', body: 'Other sessions were signed out.' });
  return c.json({ ok: true });
});

authRoutes.post('/password-reset/request', async (c) => {
  rateLimit(`pwreset:${clientIp(c)}`, 5, 3600_000);
  const input = await body(c, z.object({ email: emailSchema }));
  const provider = emailProvider();
  const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${input.email}`);
  if (u && u.status === 'active') {
    const token = randomToken(32);
    await db.insert(passwordResets).values({ userId: u.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) });
    const link = `${config().APP_URL}/reset-password?token=${token}`;
    if (provider.configured) {
      await sendEmail({
        to: u.email,
        subject: 'Reset your LearnSphere Nexus password',
        text: `Use this link within 1 hour to choose a new password:\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
      }).catch((e) => console.warn('[auth] reset email failed', e.message));
    } else if (!config().isProd) {
      console.info(`[auth] Email not configured. Development reset link for ${u.email}: ${link}`);
    }
    await audit(c, { action: 'auth.password_reset_requested', actorId: u.id, targetType: 'user', targetId: u.id });
  }
  // Same response either way so accounts cannot be enumerated.
  return c.json({
    ok: true,
    emailConfigured: provider.configured,
    message: provider.configured
      ? 'If an account exists for that email, a reset link is on its way.'
      : 'Email is not configured on this server, so no message was sent. Ask an administrator to generate a reset link for you.',
  });
});

authRoutes.post('/password-reset/confirm', async (c) => {
  rateLimit(`pwresetconfirm:${clientIp(c)}`, 20, 3600_000);
  const input = await body(c, z.object({ token: z.string().min(20), password: passwordSchema }));
  const [r] = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.tokenHash, sha256(input.token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())));
  if (!r) throw badRequest('This reset link is invalid or has expired. Request a new one.');
  await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, r.id));
  await db.update(users).set({ passwordHash: await hashPassword(input.password), updatedAt: new Date() }).where(eq(users.id, r.userId));
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, r.userId));
  failedLogins.clear();
  await audit(c, { action: 'auth.password_reset', actorId: r.userId, targetType: 'user', targetId: r.userId, meta: { via: r.createdBy } });
  await notify(r.userId, { type: 'security.password_reset', category: 'security', title: 'Your password was reset', body: 'All sessions were signed out.' });
  return c.json({ ok: true });
});

// ---------- Invites ----------

export async function acceptInvite(userId: string, email: string, token: string): Promise<string | null> {
  const [inv] = await db
    .select()
    .from(orgInvites)
    .where(and(eq(orgInvites.tokenHash, sha256(token)), isNull(orgInvites.acceptedAt), gt(orgInvites.expiresAt, new Date())));
  if (!inv) throw badRequest('This invitation is invalid or has expired.');
  if (inv.email.toLowerCase() !== email.toLowerCase()) throw forbidden('This invitation was sent to a different email address.');
  const [existing] = await db.select().from(memberships).where(and(eq(memberships.orgId, inv.orgId), eq(memberships.userId, userId)));
  if (existing) {
    const roles = Array.from(new Set([...existing.roles, ...inv.roles]));
    await db.update(memberships).set({ roles, status: 'active', updatedAt: new Date() }).where(eq(memberships.id, existing.id));
  } else {
    await db.insert(memberships).values({ orgId: inv.orgId, userId, roles: inv.roles, invitedBy: inv.invitedBy });
  }
  await db.update(orgInvites).set({ acceptedAt: new Date() }).where(eq(orgInvites.id, inv.id));
  await audit(null, { action: 'org.invite_accepted', orgId: inv.orgId, actorId: userId, targetType: 'invite', targetId: inv.id, meta: { roles: inv.roles } });
  return inv.orgId;
}

authRoutes.get('/invites/:token', async (c) => {
  const [inv] = await db
    .select({ email: orgInvites.email, roles: orgInvites.roles, orgName: organizations.name, expiresAt: orgInvites.expiresAt, acceptedAt: orgInvites.acceptedAt })
    .from(orgInvites)
    .innerJoin(organizations, eq(organizations.id, orgInvites.orgId))
    .where(eq(orgInvites.tokenHash, sha256(c.req.param('token'))));
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw notFound('Invitation');
  return c.json({ invite: { email: inv.email, roles: inv.roles, orgName: inv.orgName } });
});

authRoutes.post('/invites/:token/accept', async (c) => {
  const auth = requireAuth(c);
  const orgId = await acceptInvite(auth.user.id, auth.user.email, c.req.param('token'));
  await db.update(sessions).set({ activeOrgId: orgId }).where(eq(sessions.id, auth.session.id));
  return c.json({ ok: true, orgId });
});
