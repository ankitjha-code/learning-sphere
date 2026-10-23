import type { Context } from 'hono';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { db } from '../db/client';
import { sessions, users, memberships, organizations } from '../db/schema';
import { sha256, randomToken } from './crypto';
import { config } from './config';
import { forbidden, unauthorized } from './errors';
import { ROLE_LABELS, type OrgRole, type OrgKind, type PlatformRole } from '@shared/roles';

export const SESSION_COOKIE = 'ls_session';
const SESSION_DAYS = 14;

export type MembershipInfo = { orgId: string; orgName: string; orgSlug: string; orgKind: OrgKind; roles: OrgRole[]; isSample: boolean };

export type AuthContext = {
  user: {
    id: string;
    email: string;
    name: string;
    platformRole: PlatformRole | null;
    status: string;
    timezone: string;
    locale: string;
    preferences: Record<string, unknown>;
    isSample: boolean;
  };
  session: { id: string; activeOrgId: string | null; activeWorkspace: string };
  memberships: MembershipInfo[];
};

export type AppEnv = { Variables: { requestId: string; auth: AuthContext | null } };
export type Ctx = Context<AppEnv>;

export function clientIp(c: Ctx): string {
  if (config().TRUST_PROXY) {
    const fwd = c.req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
  }
  // @hono/node-server exposes the socket via env.incoming
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? 'unknown';
}

export async function createSession(c: Ctx, userId: string, activeOrgId: string | null) {
  const token = randomToken(32);
  const id = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({
    id,
    userId,
    activeOrgId,
    userAgent: c.req.header('user-agent')?.slice(0, 300) ?? null,
    ip: clientIp(c),
    expiresAt,
  });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config().isProd,
    path: '/',
    expires: expiresAt,
  });
  return id;
}

export function clearSessionCookie(c: Ctx) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export async function loadMemberships(userId: string): Promise<MembershipInfo[]> {
  const rows = await db
    .select({
      orgId: memberships.orgId,
      roles: memberships.roles,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      orgKind: organizations.kind,
      isSample: organizations.isSample,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active'), eq(organizations.status, 'active')));
  return rows.map((r) => ({ ...r, orgKind: r.orgKind as OrgKind, roles: r.roles as OrgRole[] }));
}

/** Resolves the session cookie into an AuthContext (or null). Runs on every API request. */
export async function resolveAuth(c: Ctx): Promise<AuthContext | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const id = sha256(token);
  const [row] = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  if (row.u.status !== 'active' && row.u.status !== 'pending_deletion') return null;

  const now = Date.now();
  // Sliding expiry: refresh at most once an hour.
  if (now - new Date(row.s.lastSeenAt).getTime() > 3600_000) {
    const expiresAt = new Date(now + SESSION_DAYS * 86400_000);
    await db.update(sessions).set({ lastSeenAt: new Date(), expiresAt }).where(eq(sessions.id, id));
    await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, row.u.id));
  }

  const ms = await loadMemberships(row.u.id);
  // An active org the user no longer belongs to is ignored (never trusted).
  const activeOrgId = row.s.activeOrgId && ms.some((m) => m.orgId === row.s.activeOrgId) ? row.s.activeOrgId : null;

  return {
    user: {
      id: row.u.id,
      email: row.u.email,
      name: row.u.name,
      platformRole: (row.u.platformRole as PlatformRole) ?? null,
      status: row.u.status,
      timezone: row.u.timezone,
      locale: row.u.locale,
      preferences: row.u.preferences as Record<string, unknown>,
      isSample: row.u.isSample,
    },
    session: { id, activeOrgId, activeWorkspace: row.s.activeWorkspace },
    memberships: ms,
  };
}

// ---------- Authorization helpers (server-side boundary) ----------

export function requireAuth(c: Ctx): AuthContext {
  const auth = c.get('auth');
  if (!auth) throw unauthorized();
  return auth;
}

export function rolesIn(auth: AuthContext, orgId: string | null | undefined): OrgRole[] {
  if (!orgId) return [];
  return auth.memberships.find((m) => m.orgId === orgId)?.roles ?? [];
}

export function isPlatformAdmin(auth: AuthContext) {
  return auth.user.platformRole === 'platform_admin';
}

/** Throws unless the user holds one of `roles` in `orgId`. Returns the roles held. */
export function requireOrgRole(c: Ctx, orgId: string | null | undefined, roles: readonly OrgRole[]): OrgRole[] {
  const auth = requireAuth(c);
  const held = rolesIn(auth, orgId);
  if (!orgId || !roles.some((r) => held.includes(r))) {
    throw forbidden(`This action needs one of these roles in the organization: ${roles.map((r) => ROLE_LABELS[r]).join(', ')}.`, {
      requiredRoles: roles,
    });
  }
  return held;
}

/** The active org from the session, verified against current memberships, optionally requiring roles. */
export function requireActiveOrg(c: Ctx, roles?: readonly OrgRole[]): { orgId: string; roles: OrgRole[]; membership: MembershipInfo } {
  const auth = requireAuth(c);
  const orgId = auth.session.activeOrgId;
  if (!orgId) throw forbidden('Select an organization first (use the workspace switcher).');
  const membership = auth.memberships.find((m) => m.orgId === orgId)!;
  if (roles) requireOrgRole(c, orgId, roles);
  return { orgId, roles: membership.roles, membership };
}

export function requirePlatformAdmin(c: Ctx): AuthContext {
  const auth = requireAuth(c);
  if (!isPlatformAdmin(auth)) throw forbidden('This action needs the Platform admin role.', { requiredRoles: ['platform_admin'] });
  return auth;
}

export function requirePlatformStaff(c: Ctx): AuthContext {
  const auth = requireAuth(c);
  if (auth.user.platformRole !== 'platform_admin' && auth.user.platformRole !== 'support')
    throw forbidden('This action needs the Platform admin or Support role.');
  return auth;
}
