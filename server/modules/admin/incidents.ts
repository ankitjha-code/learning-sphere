import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { incidents, users } from '../../db/schema';
import { type AppEnv, requireAuth, requirePlatformAdmin, requirePlatformStaff } from '../../lib/context';
import { body, idParam, query, patchSchema } from '../../lib/validate';
import { notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { offsetOf, pageParams } from './common';

/** Mounted at /api/admin/incidents. Operational incident records with a timeline. */
export const adminIncidentRoutes = new Hono<AppEnv>();

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export const INCIDENT_STATUSES = ['open', 'monitoring', 'resolved'] as const;

const incidentInput = z.object({
  title: z.string().trim().min(4, 'Give the incident a short descriptive title.').max(160),
  severity: z.enum(SEVERITIES),
  status: z.enum(INCIDENT_STATUSES).default('open'),
  summary: z.string().trim().max(5000).nullable().optional(),
});

async function loadIncident(id: string) {
  const [i] = await db.select().from(incidents).where(eq(incidents.id, id));
  if (!i) throw notFound('Incident');
  return i;
}

adminIncidentRoutes.get('/', async (c) => {
  requirePlatformStaff(c);
  const q = query(c, z.object({ ...pageParams, status: z.enum([...INCIDENT_STATUSES, 'unresolved', 'all']).default('all'), severity: z.enum(SEVERITIES).optional() }));
  const where = and(
    q.status === 'unresolved' ? ne(incidents.status, 'resolved') : q.status !== 'all' ? eq(incidents.status, q.status) : undefined,
    q.severity ? eq(incidents.severity, q.severity) : undefined,
  );
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(incidents).where(where);
  const items = await db
    .select({
      id: incidents.id,
      title: incidents.title,
      severity: incidents.severity,
      status: incidents.status,
      summary: incidents.summary,
      createdAt: incidents.createdAt,
      resolvedAt: incidents.resolvedAt,
      updates: sql<number>`jsonb_array_length(${incidents.timeline})::int`,
    })
    .from(incidents)
    .where(where)
    .orderBy(sql`case when ${incidents.status} = 'resolved' then 1 else 0 end`, desc(incidents.createdAt))
    .limit(q.pageSize)
    .offset(offsetOf(q));
  return c.json({ items, total, page: q.page, pageSize: q.pageSize });
});

adminIncidentRoutes.post('/', async (c) => {
  const auth = requirePlatformAdmin(c);
  const input = await body(c, incidentInput.extend({ firstUpdate: z.string().trim().max(2000).optional() }));
  const now = new Date();
  const [row] = await db
    .insert(incidents)
    .values({
      title: input.title,
      severity: input.severity,
      status: input.status,
      summary: input.summary ?? null,
      createdBy: auth.user.id,
      resolvedAt: input.status === 'resolved' ? now : null,
      timeline: [{ at: now.toISOString(), note: input.firstUpdate || `Incident opened (${input.severity}).`, by: auth.user.name }],
    })
    .returning();
  await audit(c, { action: 'admin.incident_created', targetType: 'incident', targetId: row.id, meta: { title: row.title, severity: row.severity } });
  return c.json({ incident: row }, 201);
});

adminIncidentRoutes.get('/:id', async (c) => {
  requirePlatformStaff(c);
  const i = await loadIncident(idParam(c));
  const [creator] = i.createdBy ? await db.select({ name: users.name }).from(users).where(eq(users.id, i.createdBy)) : [];
  return c.json({ incident: { ...i, createdByName: creator?.name ?? null } });
});

adminIncidentRoutes.patch('/:id', async (c) => {
  const auth = requirePlatformAdmin(c);
  const id = idParam(c);
  const input = await body(c, patchSchema(incidentInput));
  const i = await loadIncident(id);
  const timeline = [...i.timeline];
  const now = new Date();
  if (input.status && input.status !== i.status) timeline.push({ at: now.toISOString(), note: `Status changed from ${i.status} to ${input.status}.`, by: auth.user.name });
  if (input.severity && input.severity !== i.severity) timeline.push({ at: now.toISOString(), note: `Severity changed from ${i.severity} to ${input.severity}.`, by: auth.user.name });
  const [row] = await db
    .update(incidents)
    .set({
      ...(input.title ? { title: input.title } : {}),
      ...(input.severity ? { severity: input.severity } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.status ? { status: input.status, resolvedAt: input.status === 'resolved' ? (i.resolvedAt ?? now) : null } : {}),
      timeline,
    })
    .where(eq(incidents.id, id))
    .returning();
  await audit(c, { action: 'admin.incident_updated', targetType: 'incident', targetId: id, meta: input });
  return c.json({ incident: row });
});

adminIncidentRoutes.post('/:id/timeline', async (c) => {
  const auth = requirePlatformAdmin(c);
  const id = idParam(c);
  const input = await body(c, z.object({ note: z.string().trim().min(2, 'Write an update.').max(2000) }));
  const i = await loadIncident(id);
  const timeline = [...i.timeline, { at: new Date().toISOString(), note: input.note, by: auth.user.name }];
  const [row] = await db.update(incidents).set({ timeline }).where(eq(incidents.id, id)).returning();
  await audit(c, { action: 'admin.incident_update_posted', targetType: 'incident', targetId: id });
  return c.json({ incident: row }, 201);
});

adminIncidentRoutes.delete('/:id', async (c) => {
  requirePlatformAdmin(c);
  const id = idParam(c);
  const i = await loadIncident(id);
  await db.delete(incidents).where(eq(incidents.id, id));
  await audit(c, { action: 'admin.incident_deleted', targetType: 'incident', targetId: id, meta: { title: i.title, severity: i.severity, status: i.status } });
  return c.json({ ok: true });
});

/** For every signed-in user: only title + status (+ severity for styling) of unresolved high/critical incidents. */
export async function statusBanner(c: Parameters<typeof requireAuth>[0]) {
  requireAuth(c);
  const rows = await db
    .select({ title: incidents.title, status: incidents.status, severity: incidents.severity })
    .from(incidents)
    .where(and(ne(incidents.status, 'resolved'), inArray(incidents.severity, ['high', 'critical'])))
    .orderBy(desc(incidents.createdAt))
    .limit(3);
  return rows;
}
