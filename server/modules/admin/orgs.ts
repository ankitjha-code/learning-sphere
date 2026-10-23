import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { organizations, memberships, users, orgInvites } from '../../db/schema';
import { type AppEnv, requirePlatformAdmin } from '../../lib/context';
import { body, idParam, query, emailSchema, parse, patchSchema } from '../../lib/validate';
import { conflict, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { randomToken, sha256 } from '../../lib/crypto';
import { config } from '../../lib/config';
import { ORG_KINDS } from '@shared/roles';
import { likePattern, offsetOf, pageParams } from './common';
import { orgPolicySchema, readOrgPolicies, ORG_POLICY_DESCRIPTIONS, ORG_POLICY_DEFAULTS } from './settings';
import { PLAN_IDS, getPlan, orgUsage, BILLING_NOTICE, BILLING_MODE } from './plans';
import { billingMode } from '../billing/providers';
import { assignPlanManually } from '../billing/service';

/** Mounted at /api/admin/orgs. Platform admins only. No impersonation: members are listed read-only. */
export const adminOrgRoutes = new Hono<AppEnv>();

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Use at least 3 characters.')
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens.');

async function loadOrg(id: string) {
  const [o] = await db.select().from(organizations).where(eq(organizations.id, id));
  if (!o) throw notFound('Organization');
  return o;
}

async function orgAdminIds(orgId: string) {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, 'active'), sql`'org_admin' = any(${memberships.roles})`));
  return rows.map((r) => r.userId);
}

adminOrgRoutes.get('/', async (c) => {
  requirePlatformAdmin(c);
  const q = query(
    c,
    z.object({
      ...pageParams,
      q: z.string().trim().max(200).optional(),
      kind: z.enum(ORG_KINDS).optional(),
      status: z.enum(['active', 'suspended']).optional(),
      planId: z.enum(PLAN_IDS).optional(),
    }),
  );
  const where = and(
    q.q ? or(sql`${organizations.name} ilike ${likePattern(q.q)}`, sql`${organizations.slug} ilike ${likePattern(q.q)}`) : undefined,
    q.kind ? eq(organizations.kind, q.kind) : undefined,
    q.status ? eq(organizations.status, q.status) : undefined,
    q.planId ? eq(organizations.planId, q.planId) : undefined,
  );
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(organizations).where(where);
  const items = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      kind: organizations.kind,
      planId: organizations.planId,
      status: organizations.status,
      isSample: organizations.isSample,
      createdAt: organizations.createdAt,
      memberCount: sql<number>`(select count(*)::int from memberships m where m.org_id = "organizations"."id" and m.status = 'active')`,
    })
    .from(organizations)
    .where(where)
    .orderBy(asc(organizations.name))
    .limit(q.pageSize)
    .offset(offsetOf(q));
  return c.json({ items, total, page: q.page, pageSize: q.pageSize });
});

adminOrgRoutes.post('/', async (c) => {
  const auth = requirePlatformAdmin(c);
  const input = await body(
    c,
    z.object({
      name: z.string().trim().min(2, 'Enter the organization name.').max(120),
      slug: slugSchema,
      kind: z.enum(ORG_KINDS),
      planId: z.enum(PLAN_IDS).default('free'),
      description: z.string().trim().max(2000).optional(),
      adminEmail: emailSchema.optional(),
    }),
  );
  const [taken] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, input.slug));
  if (taken) throw conflict('That slug is already used by another organization.', { fields: { slug: 'Already taken' } });
  const [org] = await db
    .insert(organizations)
    .values({ name: input.name, slug: input.slug, kind: input.kind, planId: input.planId, description: input.description ?? null })
    .returning();

  let firstAdmin: { status: 'added' | 'invited' | 'none'; email?: string; inviteLink?: string } = { status: 'none' };
  if (input.adminEmail) {
    const [existing] = await db.select({ id: users.id, status: users.status }).from(users).where(sql`lower(${users.email}) = ${input.adminEmail}`);
    if (existing && existing.status !== 'deleted') {
      await db.insert(memberships).values({ orgId: org.id, userId: existing.id, roles: ['org_admin'], invitedBy: auth.user.id });
      await notify(existing.id, { type: 'org.roles_changed', category: 'organization', orgId: org.id, title: `You are now an admin of ${org.name}`, body: 'A platform administrator created this organization and made you its first admin.' });
      firstAdmin = { status: 'added', email: input.adminEmail };
    } else {
      const token = randomToken(24);
      await db.insert(orgInvites).values({ orgId: org.id, email: input.adminEmail, roles: ['org_admin'], tokenHash: sha256(token), invitedBy: auth.user.id, expiresAt: new Date(Date.now() + 14 * 86400_000) });
      firstAdmin = { status: 'invited', email: input.adminEmail, inviteLink: `${config().APP_URL}/invite/${token}` };
    }
  }
  await audit(c, { action: 'admin.org_created', orgId: org.id, targetType: 'organization', targetId: org.id, meta: { name: org.name, kind: org.kind, planId: org.planId, firstAdmin: firstAdmin.status } });
  return c.json({ org, firstAdmin }, 201);
});

adminOrgRoutes.get('/:id', async (c) => {
  requirePlatformAdmin(c);
  const id = idParam(c);
  const o = await loadOrg(id);
  const members = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      roles: memberships.roles,
      status: memberships.status,
      userStatus: users.status,
      lastActiveAt: users.lastActiveAt,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, id))
    .orderBy(asc(users.name))
    .limit(300);
  const invites = await db
    .select({ id: orgInvites.id, email: orgInvites.email, roles: orgInvites.roles, expiresAt: orgInvites.expiresAt })
    .from(orgInvites)
    .where(and(eq(orgInvites.orgId, id), isNull(orgInvites.acceptedAt), gt(orgInvites.expiresAt, new Date())))
    .orderBy(desc(orgInvites.createdAt));
  const plan = await getPlan(o.planId);
  return c.json({
    org: o,
    policies: readOrgPolicies(o.settings),
    policyDefaults: ORG_POLICY_DEFAULTS,
    policyDescriptions: ORG_POLICY_DESCRIPTIONS,
    members,
    membersTruncated: members.length >= 300,
    invites,
    plan,
    usage: await orgUsage(id),
    billing: (() => {
      const b = billingMode();
      return b.mode === 'demonstration' ? { mode: BILLING_MODE, notice: BILLING_NOTICE } : b;
    })(),
  });
});

adminOrgRoutes.patch('/:id', async (c) => {
  requirePlatformAdmin(c);
  const id = idParam(c);
  const input = await body(
    c,
    z.object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      website: z.string().trim().url('Enter a full URL starting with https://').max(300).nullable().optional(),
      kind: z.enum(ORG_KINDS).optional(),
      accent: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #0f766e.')
        .nullable()
        .optional(),
    }),
  );
  const o = await loadOrg(id);
  const branding = { ...o.branding };
  if (input.accent !== undefined) {
    if (input.accent === null) delete branding.accent;
    else branding.accent = input.accent;
  }
  const [row] = await db
    .update(organizations)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      branding,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, id))
    .returning();
  await audit(c, { action: 'admin.org_updated', orgId: id, targetType: 'organization', targetId: id, meta: input });
  return c.json({ org: row });
});

adminOrgRoutes.post('/:id/suspend', async (c) => {
  requirePlatformAdmin(c);
  const id = idParam(c);
  const input = await body(c, z.object({ reason: z.string().trim().min(3, 'Give a short reason (kept in the audit log).').max(500) }));
  const o = await loadOrg(id);
  if (o.status === 'suspended') throw conflict('This organization is already suspended.');
  await db.update(organizations).set({ status: 'suspended', updatedAt: new Date() }).where(eq(organizations.id, id));
  await audit(c, { action: 'admin.org_suspended', orgId: id, targetType: 'organization', targetId: id, meta: { reason: input.reason } });
  for (const uid of await orgAdminIds(id)) {
    await notify(uid, { type: 'org.suspended', category: 'organization', title: `${o.name} was suspended`, body: 'Members cannot use this organization until a platform administrator reactivates it.' });
  }
  return c.json({ ok: true });
});

adminOrgRoutes.post('/:id/reactivate', async (c) => {
  requirePlatformAdmin(c);
  const id = idParam(c);
  const o = await loadOrg(id);
  if (o.status === 'active') throw conflict('This organization is already active.');
  await db.update(organizations).set({ status: 'active', updatedAt: new Date() }).where(eq(organizations.id, id));
  await audit(c, { action: 'admin.org_reactivated', orgId: id, targetType: 'organization', targetId: id });
  for (const uid of await orgAdminIds(id)) {
    await notify(uid, { type: 'org.reactivated', category: 'organization', orgId: id, title: `${o.name} is active again` });
  }
  return c.json({ ok: true });
});

/**
 * Demonstration mode (no payment provider configured): no payment, no invoice. The change is immediate and audited.
 * With a payment provider configured, org admins buy plans in Plan & billing; a change made here is a
 * complimentary assignment recorded as a "manual" subscription (no payment, no automatic refund of a paid period).
 */
adminOrgRoutes.put('/:id/plan', async (c) => {
  const auth = requirePlatformAdmin(c);
  const id = idParam(c);
  const input = await body(c, z.object({ planId: z.enum(PLAN_IDS) }));
  const o = await loadOrg(id);
  const billing = billingMode();
  const demo = billing.mode === 'demonstration';
  const notice = demo
    ? BILLING_NOTICE
    : 'Complimentary assignment by a platform administrator: no payment was taken. Any running paid period ends now and is not refunded automatically (refunds are made in the payment provider dashboard).';
  if (o.planId === input.planId) return c.json({ ok: true, unchanged: true, notice });
  const ended = demo ? null : await assignPlanManually(id, input.planId, auth.user.id);
  await db.update(organizations).set({ planId: input.planId, updatedAt: new Date() }).where(eq(organizations.id, id));
  await audit(c, {
    action: 'admin.org_plan_changed',
    orgId: id,
    targetType: 'organization',
    targetId: id,
    meta: { from: o.planId, to: input.planId, mode: demo ? BILLING_MODE : 'complimentary', ...(ended?.endedSubscription ? { endedSubscription: ended.endedSubscription } : {}) },
  });
  const plan = await getPlan(input.planId);
  for (const uid of await orgAdminIds(id)) {
    await notify(uid, {
      type: 'org.plan_changed',
      category: 'organization',
      orgId: id,
      title: `${o.name} is now on the ${plan.name} plan`,
      body: demo ? 'Demonstration mode: no payment was taken.' : 'Assigned by a platform administrator. No payment was taken.',
    });
  }
  return c.json({ ok: true, planId: input.planId, notice, mode: demo ? BILLING_MODE : billing.mode, usage: await orgUsage(id) });
});

adminOrgRoutes.put('/:id/policies', async (c) => {
  requirePlatformAdmin(c);
  const id = idParam(c);
  const input = await body(c, patchSchema(orgPolicySchema));
  const o = await loadOrg(id);
  const before = readOrgPolicies(o.settings);
  const next = parse(orgPolicySchema, { ...before, ...input });
  await db
    .update(organizations)
    .set({ settings: { ...(o.settings ?? {}), policies: next }, updatedAt: new Date() })
    .where(eq(organizations.id, id));
  const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => before[k as keyof typeof before] !== v));
  await audit(c, { action: 'admin.org_policies_updated', orgId: id, targetType: 'organization', targetId: id, meta: { changed } });
  return c.json({ policies: next });
});
