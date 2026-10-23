import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client';
import { auditLogs, users, organizations } from '../../db/schema';
import { type AppEnv, requirePlatformStaff, requireActiveOrg } from '../../lib/context';
import { query } from '../../lib/validate';
import { forbidden } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { csvResponse, isoDate, likePattern, offsetOf, pageParams, toCsv } from './common';
import { getEntitlements } from './plans';

/**
 * Audit log viewers.
 *  - /api/admin/audit        platform staff, every organization
 *  - /api/admin/org-audit    org admins, their active organization only (IP addresses hidden)
 */
export const adminAuditRoutes = new Hono<AppEnv>();
export const orgAuditRoutes = new Hono<AppEnv>();

const EXPORT_CAP = 10_000;

const filterSchema = z.object({
  ...pageParams,
  orgId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  actor: z.string().trim().max(200).optional(),
  action: z.string().trim().max(100).optional(),
  targetType: z.string().trim().max(60).optional(),
  targetId: z.string().trim().max(100).optional(),
  from: isoDate,
  to: isoDate,
});
type Filters = z.infer<typeof filterSchema>;

function whereFor(f: Filters, forcedOrgId?: string): SQL | undefined {
  // Action filter is a prefix match ("admin." matches every admin action). Escape LIKE wildcards.
  const prefix = f.action ? f.action.replace(/[%_\\]/g, (m) => '\\' + m) + '%' : null;
  return and(
    forcedOrgId ? eq(auditLogs.orgId, forcedOrgId) : f.orgId ? eq(auditLogs.orgId, f.orgId) : undefined,
    f.actorId ? eq(auditLogs.actorId, f.actorId) : undefined,
    f.actor ? sql`exists (select 1 from users au where au.id = "audit_logs"."actor_id" and (au.name ilike ${likePattern(f.actor)} or au.email ilike ${likePattern(f.actor)}))` : undefined,
    prefix ? sql`${auditLogs.action} like ${prefix}` : undefined,
    f.targetType ? eq(auditLogs.targetType, f.targetType) : undefined,
    f.targetId ? eq(auditLogs.targetId, f.targetId) : undefined,
    f.from ? gte(auditLogs.createdAt, f.from) : undefined,
    f.to ? lte(auditLogs.createdAt, f.to) : undefined,
  );
}

async function fetchRows(where: SQL | undefined, limit: number, offset: number) {
  return db
    .select({
      id: auditLogs.id,
      createdAt: auditLogs.createdAt,
      action: auditLogs.action,
      actorId: auditLogs.actorId,
      actorName: users.name,
      actorEmail: users.email,
      actorRole: auditLogs.actorRole,
      orgId: auditLogs.orgId,
      orgName: organizations.name,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      meta: auditLogs.meta,
      ip: auditLogs.ip,
      requestId: auditLogs.requestId,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .leftJoin(organizations, eq(organizations.id, auditLogs.orgId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);
}

const CSV_HEADERS = ['time_utc', 'action', 'actor_name', 'actor_email', 'actor_platform_role', 'organization', 'target_type', 'target_id', 'details_json', 'ip', 'request_id'];
type Row = Awaited<ReturnType<typeof fetchRows>>[number];
const csvRow = (r: Row, withIp: boolean) => [r.createdAt, r.action, r.actorName, r.actorEmail, r.actorRole, r.orgName, r.targetType, r.targetId, r.meta, withIp ? r.ip : '', r.requestId];

adminAuditRoutes.get('/', async (c) => {
  requirePlatformStaff(c);
  const f = query(c, filterSchema);
  const where = whereFor(f);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where);
  const items = await fetchRows(where, f.pageSize, offsetOf(f));
  return c.json({ items, total, page: f.page, pageSize: f.pageSize });
});

adminAuditRoutes.get('/export.csv', async (c) => {
  requirePlatformStaff(c);
  const f = query(c, filterSchema);
  const rows = await fetchRows(whereFor(f), EXPORT_CAP, 0);
  await audit(c, { action: 'admin.audit_exported', targetType: 'audit_log', meta: { rows: rows.length, filters: { ...f, page: undefined, pageSize: undefined } } });
  const csv = toCsv(CSV_HEADERS, rows.map((r) => csvRow(r, true)), [
    `LearnSphere Nexus audit log export, generated ${new Date().toISOString()}`,
    `Rows: ${rows.length}${rows.length === EXPORT_CAP ? ` (capped at ${EXPORT_CAP}; narrow the date range for more)` : ''}`,
    'Each row is one recorded sensitive action. Times are UTC. details_json holds action-specific context.',
  ]);
  return csvResponse(c, `audit-log-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});

orgAuditRoutes.get('/', async (c) => {
  const { orgId } = requireActiveOrg(c, ['org_admin']);
  const f = query(c, filterSchema);
  const where = whereFor(f, orgId);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where);
  const items = (await fetchRows(where, f.pageSize, offsetOf(f))).map((r) => ({ ...r, ip: null }));
  const auth = c.get('auth')!;
  const ent = await getEntitlements(orgId, auth.user.id);
  return c.json({
    items,
    total,
    page: f.page,
    pageSize: f.pageSize,
    orgName: auth.memberships.find((m) => m.orgId === orgId)?.orgName ?? null,
    canExport: ent.entitlements.auditExport,
    exportReason: ent.entitlements.auditExport ? null : `The ${ent.plan.name} plan does not include audit log export.`,
  });
});

orgAuditRoutes.get('/export.csv', async (c) => {
  const { orgId } = requireActiveOrg(c, ['org_admin']);
  const auth = c.get('auth')!;
  const ent = await getEntitlements(orgId, auth.user.id);
  if (!ent.entitlements.auditExport) throw forbidden(`The ${ent.plan.name} plan does not include audit log export. ${ent.notice}`, { entitlement: 'auditExport' });
  const f = query(c, filterSchema);
  const rows = await fetchRows(whereFor(f, orgId), EXPORT_CAP, 0);
  await audit(c, { action: 'org.audit_exported', orgId, targetType: 'audit_log', meta: { rows: rows.length } });
  const csv = toCsv(CSV_HEADERS, rows.map((r) => csvRow(r, false)), [
    `Organization audit log export, generated ${new Date().toISOString()}`,
    `Rows: ${rows.length}. Times are UTC. IP addresses are omitted for organization exports.`,
  ]);
  return csvResponse(c, `org-audit-log-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});
