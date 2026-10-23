import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, isNull, sql, gt } from 'drizzle-orm';
import { db } from '../../db/client';
import { organizations, memberships, users, orgInvites } from '../../db/schema';
import { type AppEnv, requireAuth, requireOrgRole, requireActiveOrg, rolesIn } from '../../lib/context';
import { body, idParam, emailSchema } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { sendEmail, emailProvider } from '../../lib/email';
import { randomToken, sha256 } from '../../lib/crypto';
import { config } from '../../lib/config';
import { ROLES_BY_ORG_KIND, ROLE_LABELS, ORG_ROLES, type OrgKind, type OrgRole } from '@shared/roles';

/**
 * Organization members, invitations and settings. All routes act on the
 * organization the user explicitly targets and re-check membership roles.
 * Who may manage roles:
 *  - org_admin: any role in their org
 *  - faculty_admin: faculty / student roles
 *  - recruiter_admin: recruiter / interviewer roles
 */
export const orgRoutes = new Hono<AppEnv>();

const MANAGEABLE: Partial<Record<OrgRole, OrgRole[]>> = {
  org_admin: [...ORG_ROLES],
  faculty_admin: ['faculty', 'student', 'mentor'],
  recruiter_admin: ['recruiter', 'interviewer'],
};

function manageableRoles(held: OrgRole[]): OrgRole[] {
  return [...new Set(held.flatMap((r) => MANAGEABLE[r] ?? []))];
}

async function loadOrg(orgId: string) {
  const [o] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!o) throw notFound('Organization');
  return o;
}

/** The active organization with the caller's roles and what they may manage. */
orgRoutes.get('/current', async (c) => {
  const { orgId, roles } = requireActiveOrg(c);
  const o = await loadOrg(orgId);
  return c.json({
    org: { id: o.id, name: o.name, slug: o.slug, kind: o.kind, description: o.description, website: o.website, branding: o.branding, isSample: o.isSample, planId: o.planId },
    roles,
    canManageRoles: manageableRoles(roles),
    allowedRoles: ROLES_BY_ORG_KIND[o.kind as OrgKind],
  });
});

orgRoutes.patch('/current', async (c) => {
  const { orgId } = requireActiveOrg(c, ['org_admin']);
  const input = await body(
    c,
    z.object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      website: z.string().url().max(300).nullable().optional(),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    }),
  );
  const o = await loadOrg(orgId);
  const [row] = await db
    .update(organizations)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.accent ? { branding: { ...o.branding, accent: input.accent } } : {}),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId))
    .returning();
  await audit(c, { action: 'org.updated', orgId, targetType: 'organization', targetId: orgId, meta: input });
  return c.json({ org: row });
});

orgRoutes.get('/members', async (c) => {
  const { orgId, roles } = requireActiveOrg(c);
  // Students may not browse the member directory; staff roles may.
  if (!roles.some((r) => r !== 'student')) throw forbidden('Only staff roles can view the member directory.');
  const q = c.req.query('q')?.trim();
  const role = c.req.query('role');
  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      roles: memberships.roles,
      status: memberships.status,
      title: memberships.title,
      lastActiveAt: users.lastActiveAt,
      joinedAt: memberships.createdAt,
      avatarColor: users.avatarColor,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.orgId, orgId),
        q ? sql`(${users.name} ilike ${'%' + q + '%'} or ${users.email} ilike ${'%' + q + '%'})` : undefined,
        role ? sql`${role} = ANY(${memberships.roles})` : undefined,
      ),
    )
    .orderBy(asc(users.name))
    .limit(500);
  const invites = manageableRoles(roles).length
    ? await db
        .select({ id: orgInvites.id, email: orgInvites.email, roles: orgInvites.roles, expiresAt: orgInvites.expiresAt, createdAt: orgInvites.createdAt })
        .from(orgInvites)
        .where(and(eq(orgInvites.orgId, orgId), isNull(orgInvites.acceptedAt), gt(orgInvites.expiresAt, new Date())))
        .orderBy(desc(orgInvites.createdAt))
    : [];
  return c.json({ members: rows, invites, canManageRoles: manageableRoles(roles) });
});

orgRoutes.post('/invites', async (c) => {
  const auth = requireAuth(c);
  const { orgId, roles } = requireActiveOrg(c);
  const can = manageableRoles(roles);
  if (!can.length) throw forbidden('You cannot invite members to this organization.');
  const input = await body(c, z.object({ emails: z.array(emailSchema).min(1).max(100), roles: z.array(z.enum(ORG_ROLES)).min(1) }));
  const o = await loadOrg(orgId);
  const allowed = ROLES_BY_ORG_KIND[o.kind as OrgKind];
  for (const r of input.roles) {
    if (!allowed.includes(r)) throw badRequest(`${ROLE_LABELS[r]} is not available in a ${o.kind} organization.`);
    if (!can.includes(r)) throw forbidden(`You cannot grant the ${ROLE_LABELS[r]} role.`);
  }
  const provider = emailProvider();
  const results: { email: string; status: 'added' | 'invited' | 'already_member'; inviteLink?: string; emailStatus?: string }[] = [];
  for (const email of [...new Set(input.emails)]) {
    const [existingUser] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
    if (existingUser) {
      const [m] = await db.select().from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, existingUser.id)));
      if (m && input.roles.every((r) => m.roles.includes(r))) {
        results.push({ email, status: 'already_member' });
        continue;
      }
    }
    const token = randomToken(24);
    await db.insert(orgInvites).values({ orgId, email, roles: input.roles, tokenHash: sha256(token), invitedBy: auth.user.id, expiresAt: new Date(Date.now() + 14 * 86400_000) });
    const inviteLink = `${config().APP_URL}/invite/${token}`;
    let emailStatus = 'not_configured';
    if (existingUser) {
      await notify(existingUser.id, {
        type: 'org.invite',
        category: 'organization',
        title: `You're invited to join ${o.name}`,
        body: `${auth.user.name} invited you as ${input.roles.map((r) => ROLE_LABELS[r]).join(', ')}.`,
        link: `/invite/${token}`,
        email: false,
      });
    }
    if (provider.configured) {
      try {
        const r = await sendEmail({
          to: email,
          subject: `Invitation to join ${o.name} on LearnSphere Nexus`,
          text: `${auth.user.name} invited you to join ${o.name} as ${input.roles.map((r) => ROLE_LABELS[r]).join(', ')}.\n\nAccept within 14 days: ${inviteLink}`,
        });
        emailStatus = r.status;
      } catch {
        emailStatus = 'failed';
      }
    }
    // The link is returned to the inviter so invitations work even without email (they can share it directly).
    results.push({ email, status: 'invited', inviteLink, emailStatus });
  }
  await audit(c, { action: 'org.invites_sent', orgId, meta: { count: results.filter((r) => r.status === 'invited').length, roles: input.roles } });
  return c.json({ results, emailConfigured: provider.configured });
});

orgRoutes.delete('/invites/:id', async (c) => {
  const { orgId, roles } = requireActiveOrg(c);
  if (!manageableRoles(roles).length) throw forbidden();
  const id = idParam(c);
  const res = await db.delete(orgInvites).where(and(eq(orgInvites.id, id), eq(orgInvites.orgId, orgId))).returning({ id: orgInvites.id });
  if (!res.length) throw notFound('Invitation');
  await audit(c, { action: 'org.invite_revoked', orgId, targetType: 'invite', targetId: id });
  return c.json({ ok: true });
});

orgRoutes.patch('/members/:membershipId', async (c) => {
  const auth = requireAuth(c);
  const { orgId, roles } = requireActiveOrg(c);
  const can = manageableRoles(roles);
  if (!can.length) throw forbidden('You cannot change member roles in this organization.');
  const id = idParam(c, 'membershipId');
  const input = await body(c, z.object({ roles: z.array(z.enum(ORG_ROLES)).optional(), status: z.enum(['active', 'suspended']).optional(), title: z.string().max(120).nullable().optional() }));
  const [m] = await db.select().from(memberships).where(and(eq(memberships.id, id), eq(memberships.orgId, orgId)));
  if (!m) throw notFound('Member');
  const o = await loadOrg(orgId);
  let newRoles = m.roles as OrgRole[];
  if (input.roles) {
    const added = input.roles.filter((r) => !m.roles.includes(r));
    const removed = (m.roles as OrgRole[]).filter((r) => !input.roles!.includes(r));
    for (const r of [...added, ...removed]) if (!can.includes(r)) throw forbidden(`You cannot change the ${ROLE_LABELS[r]} role.`);
    for (const r of added) if (!ROLES_BY_ORG_KIND[o.kind as OrgKind].includes(r)) throw badRequest(`${ROLE_LABELS[r]} is not available in this organization.`);
    newRoles = input.roles;
  }
  if (m.userId === auth.user.id && (input.status === 'suspended' || (m.roles.includes('org_admin') && !newRoles.includes('org_admin')))) {
    const [{ admins }] = await db.select({ admins: sql<number>`count(*)::int` }).from(memberships).where(and(eq(memberships.orgId, orgId), sql`'org_admin' = ANY(${memberships.roles})`, eq(memberships.status, 'active')));
    if (admins <= 1) throw conflict('You are the only organization admin. Make someone else an admin first.');
  }
  const [row] = await db
    .update(memberships)
    .set({ roles: newRoles, ...(input.status ? { status: input.status } : {}), ...(input.title !== undefined ? { title: input.title } : {}), updatedAt: new Date() })
    .where(eq(memberships.id, id))
    .returning();
  await audit(c, { action: 'org.member_updated', orgId, targetType: 'user', targetId: m.userId, meta: { from: m.roles, to: newRoles, status: input.status } });
  if (input.roles) await notify(m.userId, { type: 'org.roles_changed', category: 'organization', orgId, title: `Your roles in ${o.name} changed`, body: newRoles.length ? `Now: ${newRoles.map((r) => ROLE_LABELS[r]).join(', ')}` : 'You no longer have roles in this organization.' });
  return c.json({ member: row });
});

orgRoutes.delete('/members/:membershipId', async (c) => {
  const auth = requireAuth(c);
  const { orgId, roles } = requireActiveOrg(c, ['org_admin']);
  const id = idParam(c, 'membershipId');
  const [m] = await db.select().from(memberships).where(and(eq(memberships.id, id), eq(memberships.orgId, orgId)));
  if (!m) throw notFound('Member');
  if (m.userId === auth.user.id) throw conflict('You cannot remove yourself. Ask another admin.');
  await db.delete(memberships).where(eq(memberships.id, id));
  await audit(c, { action: 'org.member_removed', orgId, targetType: 'user', targetId: m.userId, meta: { roles: m.roles, by: roles } });
  return c.json({ ok: true });
});

/** Lightweight directory lookup used by pickers (e.g. choose students for a cohort). Staff only. */
orgRoutes.get('/people', async (c) => {
  const { orgId, roles } = requireActiveOrg(c);
  if (!roles.some((r) => r !== 'student')) throw forbidden();
  const role = c.req.query('role');
  const q = c.req.query('q')?.trim();
  const rows = await db
    .select({ userId: users.id, name: users.name, email: users.email, roles: memberships.roles })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, 'active'), role ? sql`${role} = ANY(${memberships.roles})` : undefined, q ? sql`(${users.name} ilike ${'%' + q + '%'} or ${users.email} ilike ${'%' + q + '%'})` : undefined))
    .orderBy(asc(users.name))
    .limit(200);
  return c.json({ people: rows });
});

export function assertSameOrgMember(auth: ReturnType<typeof requireAuth>, orgId: string) {
  if (!rolesIn(auth, orgId).length) throw forbidden('That record belongs to another organization.');
}

export { requireOrgRole };
