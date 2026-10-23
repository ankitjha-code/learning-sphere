import { Hono } from 'hono';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { and, asc, desc, eq, gt, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db, dbHandle } from '../../db/client';
import {
  users,
  organizations,
  sessions,
  backgroundJobs,
  files,
  aiUsage,
  reports,
  incidents,
  dataRequests,
  activityEvents,
} from '../../db/schema';
import { type AppEnv, requireAuth, requirePlatformAdmin, requirePlatformStaff } from '../../lib/context';
import { body, idParam, query, patchSchema } from '../../lib/validate';
import { badRequest, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { emailProvider } from '../../lib/email';
import { config } from '../../lib/config';
import { enqueue, workerStatus } from '../../jobs/queue';
import { runtimes } from '../../exec/index';
import { aiStatus } from '../../ai/service';
import { ensureScheduled } from '../files/recurring';
import { csvResponse, offsetOf, pageParams, toCsv } from './common';
import {
  FEATURE_FLAGS,
  FEATURE_KEYS,
  getFeatureFlags,
  writeSetting,
  readSetting,
  getRetention,
  retentionSchema,
  RETENTION_DEFAULTS,
  AUDIT_MIN_RETENTION_DAYS,
  SESSION_PRUNE_DAYS,
  getUserStorageQuotaBytes,
  DEFAULT_USER_QUOTA_BYTES,
  isSignupOpen,
  type FeatureFlag,
} from './settings';
import {
  BILLING_MODE,
  BILLING_NOTICE,
  PLAN_IDS,
  PLAN_ENTITLEMENTS,
  LIMIT_LABELS,
  DEFAULT_PLANS,
  getPlans,
  planSchema,
  planLimitsSchema,
  getEntitlements,
  checkLimit,
  orgUsage,
} from './plans';
import { RETENTION_JOB, RETENTION_PERIOD_MS } from './jobs';
import { adminUserRoutes } from './users';
import { adminOrgRoutes } from './orgs';
import { adminJobRoutes } from './job-routes';
import { adminModerationRoutes } from './moderation';
import { adminAuditRoutes, orgAuditRoutes } from './audit-routes';
import { adminIncidentRoutes, statusBanner } from './incidents';

/**
 * Mounted at /api/admin. Platform administration.
 * Roles: platform_admin can do everything here; support can read users, jobs, health,
 * audit, incidents and the overview; org admins only reach /org-audit for their own org.
 * Every mutation is audited.
 */
export const adminRoutes = new Hono<AppEnv>();

const DAY = 86400_000;
const startedAt = Date.now();

function appVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return process.env.npm_package_version ?? 'unknown';
  }
}

// ---------- Available to any signed-in user ----------

/** Only flag booleans; nothing else about platform configuration. */
adminRoutes.get('/features/public', async (c) => {
  requireAuth(c);
  return c.json({ features: await getFeatureFlags() });
});

adminRoutes.get('/status-banner', async (c) => {
  return c.json({ incidents: await statusBanner(c) });
});

/** The caller's plan, limits and current usage in their active organization (or personal plan). */
adminRoutes.get('/my-plan', async (c) => {
  const auth = requireAuth(c);
  const orgId = auth.session.activeOrgId;
  const ent = await getEntitlements(orgId, auth.user.id);
  const userLimits = await Promise.all([
    checkLimit('user', auth.user.id, 'ai.requests.day', { orgId }),
    checkLimit('user', auth.user.id, 'storage.bytes', { orgId }),
  ]);
  return c.json({ entitlements: ent, usage: userLimits, limitLabels: LIMIT_LABELS, entitlementLabels: PLAN_ENTITLEMENTS });
});

// ---------- Sub-areas ----------

adminRoutes.route('/users', adminUserRoutes);
adminRoutes.route('/orgs', adminOrgRoutes);
adminRoutes.route('/jobs', adminJobRoutes);
adminRoutes.route('/reports', adminModerationRoutes);
adminRoutes.route('/audit', adminAuditRoutes);
adminRoutes.route('/org-audit', orgAuditRoutes);
adminRoutes.route('/incidents', adminIncidentRoutes);

// ---------- Overview ----------

type Metric = { key: string; label: string; value: number | string; definition: string };

adminRoutes.get('/overview', async (c) => {
  requirePlatformStaff(c);
  ensureScheduled(RETENTION_JOB, RETENTION_PERIOD_MS);
  const now = Date.now();
  const d7 = new Date(now - 7 * DAY);
  const d30 = new Date(now - 30 * DAY);
  const h24 = new Date(now - DAY);

  const [u] = await db
    .select({
      total: sql<number>`count(*) filter (where ${users.status} <> 'deleted')::int`,
      active7: sql<number>`count(*) filter (where ${users.lastActiveAt} >= ${d7})::int`,
      active30: sql<number>`count(*) filter (where ${users.lastActiveAt} >= ${d30})::int`,
      suspended: sql<number>`count(*) filter (where ${users.status} = 'suspended')::int`,
      sample: sql<number>`count(*) filter (where ${users.isSample})::int`,
    })
    .from(users);
  const orgsByKind = await db
    .select({ kind: organizations.kind, total: sql<number>`count(*)::int`, suspended: sql<number>`count(*) filter (where ${organizations.status} = 'suspended')::int` })
    .from(organizations)
    .groupBy(organizations.kind)
    .orderBy(asc(organizations.kind));
  const signups = await db
    .select({ week: sql<string>`to_char(date_trunc('week', ${users.createdAt}), 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.createdAt, new Date(now - 8 * 7 * DAY)))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  const [{ activeSessions }] = await db
    .select({ activeSessions: sql<number>`count(*)::int` })
    .from(sessions)
    .where(and(isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  const [jobs] = await db
    .select({
      queued: sql<number>`count(*) filter (where ${backgroundJobs.status} = 'queued')::int`,
      running: sql<number>`count(*) filter (where ${backgroundJobs.status} = 'running')::int`,
      retrying: sql<number>`count(*) filter (where ${backgroundJobs.status} = 'retrying')::int`,
      failed24h: sql<number>`count(*) filter (where ${backgroundJobs.status} = 'failed' and ${backgroundJobs.updatedAt} >= ${h24})::int`,
      failedTotal: sql<number>`count(*) filter (where ${backgroundJobs.status} = 'failed')::int`,
    })
    .from(backgroundJobs);
  const failedWorkflows = await db
    .select({ id: backgroundJobs.id, type: backgroundJobs.type, lastError: sql<string | null>`left(${backgroundJobs.lastError}, 200)`, attempts: backgroundJobs.attempts, updatedAt: backgroundJobs.updatedAt })
    .from(backgroundJobs)
    .where(eq(backgroundJobs.status, 'failed'))
    .orderBy(desc(backgroundJobs.updatedAt))
    .limit(8);
  const storage = await db
    .select({ purpose: files.purpose, bytes: sql<string>`coalesce(sum(${files.size}), 0)::bigint`, count: sql<number>`count(*)::int` })
    .from(files)
    .where(eq(files.status, 'ready'))
    .groupBy(files.purpose)
    .orderBy(asc(files.purpose));
  const storageTotal = storage.reduce((a, s) => a + Number(s.bytes), 0);
  const [ai] = await db
    .select({
      requests: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${aiUsage.status} <> 'ok')::int`,
      users: sql<number>`count(distinct ${aiUsage.userId})::int`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, d7));
  const aiByStatus = await db
    .select({ status: aiUsage.status, n: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, d7))
    .groupBy(aiUsage.status);
  const [{ openReports }] = await db.select({ openReports: sql<number>`count(*)::int` }).from(reports).where(eq(reports.status, 'open'));
  const openIncidents = await db
    .select({ id: incidents.id, title: incidents.title, severity: incidents.severity, status: incidents.status, createdAt: incidents.createdAt })
    .from(incidents)
    .where(ne(incidents.status, 'resolved'))
    .orderBy(desc(incidents.createdAt))
    .limit(5);
  const [{ pendingDataRequests }] = await db
    .select({ pendingDataRequests: sql<number>`count(*)::int` })
    .from(dataRequests)
    .where(inArray(dataRequests.status, ['pending', 'processing']));
  const adoption = await db
    .select({ area: sql<string>`split_part(${activityEvents.kind}, '.', 1)`, users: sql<number>`count(distinct ${activityEvents.userId})::int`, events: sql<number>`count(*)::int` })
    .from(activityEvents)
    .where(gte(activityEvents.createdAt, d30))
    .groupBy(sql`1`)
    .orderBy(desc(sql`2`))
    .limit(12);
  const email = emailProvider();

  const metrics: Metric[] = [
    { key: 'users.total', label: 'Users', value: u.total, definition: 'Accounts that are not deleted, including suspended and sample accounts.' },
    { key: 'users.active7', label: 'Active in 7 days', value: u.active7, definition: 'Users whose last recorded activity (sign-in or authenticated request, updated at most hourly) is within the last 7 days.' },
    { key: 'users.active30', label: 'Active in 30 days', value: u.active30, definition: 'Same as above, within the last 30 days.' },
    { key: 'sessions.active', label: 'Active sessions', value: activeSessions, definition: 'Sign-in sessions that are not revoked and not expired. One person can have several.' },
    { key: 'jobs.failed24h', label: 'Failed jobs (24 h)', value: jobs.failed24h, definition: 'Background jobs that used all their attempts and stopped in the last 24 hours. They need a retry or investigation.' },
    { key: 'jobs.backlog', label: 'Queued or retrying', value: jobs.queued + jobs.retrying, definition: 'Jobs waiting to run, including ones waiting for a backoff delay after a failed attempt.' },
    { key: 'ai.requests7', label: 'AI requests (7 days)', value: ai.requests, definition: 'Rows in AI usage accounting in the last 7 days, successful or not.' },
    { key: 'ai.errors7', label: 'AI failures (7 days)', value: ai.errors, definition: 'AI requests in the last 7 days whose status was not ok (error, timeout, rate limited, quota exceeded or unavailable).' },
    { key: 'storage.bytes', label: 'Storage used', value: storageTotal, definition: 'Sum of file sizes for files in ready state (uploads and generated exports). Deleted or expired files are excluded.' },
    { key: 'reports.open', label: 'Open reports', value: openReports, definition: 'Moderation reports nobody has resolved yet.' },
    { key: 'incidents.open', label: 'Open incidents', value: openIncidents.length, definition: 'Incident records not yet marked resolved (open or monitoring).' },
    { key: 'privacy.pending', label: 'Pending data requests', value: pendingDataRequests, definition: 'User data export or deletion requests that are pending or being processed.' },
  ];

  return c.json({
    generatedAt: new Date().toISOString(),
    metrics,
    users: u,
    orgsByKind,
    signupsPerWeek: signups,
    jobs,
    failedWorkflows,
    storage: storage.map((s) => ({ purpose: s.purpose, bytes: Number(s.bytes), count: s.count })),
    ai: { ...ai, byStatus: aiByStatus },
    openIncidents,
    featureAdoption: adoption,
    email: { configured: email.configured, provider: email.provider, note: email.note },
    notes: [
      'All numbers are counted from stored records at the time of the request. Nothing is sampled or estimated.',
      'These figures describe what happened, not why. Two numbers moving together does not show that one caused the other.',
      'Sample (demo) accounts are included. Filter Users by "sample" to see how many.',
    ],
  });
});

// ---------- Data requests (admin view; user self-service lives in the privacy module) ----------

adminRoutes.get('/data-requests', async (c) => {
  requirePlatformStaff(c);
  const q = query(c, z.object({ ...pageParams, kind: z.enum(['export', 'deletion']).optional(), status: z.string().trim().max(30).optional() }));
  const where = and(q.kind ? eq(dataRequests.kind, q.kind) : undefined, q.status ? eq(dataRequests.status, q.status) : undefined);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(dataRequests).where(where);
  const items = await db
    .select({
      id: dataRequests.id,
      userId: dataRequests.userId,
      userName: users.name,
      userEmail: users.email,
      kind: dataRequests.kind,
      status: dataRequests.status,
      scheduledFor: dataRequests.scheduledFor,
      completedAt: dataRequests.completedAt,
      createdAt: dataRequests.createdAt,
    })
    .from(dataRequests)
    .innerJoin(users, eq(users.id, dataRequests.userId))
    .where(where)
    .orderBy(desc(dataRequests.createdAt))
    .limit(q.pageSize)
    .offset(offsetOf(q));
  return c.json({ items, total, page: q.page, pageSize: q.pageSize });
});

// ---------- System health ----------

type HealthStatus = 'ok' | 'degraded' | 'down' | 'not_configured';

adminRoutes.get('/health', async (c) => {
  requirePlatformStaff(c);
  ensureScheduled(RETENTION_JOB, RETENTION_PERIOD_MS);
  let dbStatus: HealthStatus = 'ok';
  let latencyMs: number | null = null;
  let dbError: string | null = null;
  try {
    const t = performance.now();
    await db.execute(sql`select 1`);
    latencyMs = Math.round((performance.now() - t) * 10) / 10;
    if (latencyMs > 500) dbStatus = 'degraded';
  } catch {
    dbStatus = 'down';
    dbError = 'The database did not answer a test query.';
  }

  const w = workerStatus();
  const tickAge = w.lastTickAt ? Date.now() - new Date(w.lastTickAt).getTime() : null;
  const workerHealth: HealthStatus = !w.running ? 'degraded' : tickAge !== null && tickAge > 30_000 ? 'degraded' : 'ok';
  const [queue] = await db
    .select({
      ready: sql<number>`count(*) filter (where ${backgroundJobs.status} in ('queued','retrying') and ${backgroundJobs.runAt} <= now())::int`,
      scheduled: sql<number>`count(*) filter (where ${backgroundJobs.status} in ('queued','retrying') and ${backgroundJobs.runAt} > now())::int`,
      running: sql<number>`count(*) filter (where ${backgroundJobs.status} = 'running')::int`,
      stale: sql<number>`count(*) filter (where ${backgroundJobs.status} = 'running' and ${backgroundJobs.lockedAt} < now() - interval '5 minutes')::int`,
      failed24h: sql<number>`count(*) filter (where ${backgroundJobs.status} = 'failed' and ${backgroundJobs.updatedAt} >= now() - interval '24 hours')::int`,
      oldestReadyAt: sql<string | null>`min(${backgroundJobs.runAt}) filter (where ${backgroundJobs.status} in ('queued','retrying') and ${backgroundJobs.runAt} <= now())`,
    })
    .from(backgroundJobs);
  const oldestAgeSec = queue.oldestReadyAt ? Math.round((Date.now() - new Date(queue.oldestReadyAt).getTime()) / 1000) : 0;
  const queueHealth: HealthStatus = queue.stale > 0 || oldestAgeSec > 600 ? 'degraded' : 'ok';

  const email = emailProvider();
  let execRuntimes: Awaited<ReturnType<typeof runtimes>> = [];
  let execError: string | null = null;
  try {
    execRuntimes = await runtimes();
  } catch {
    execError = 'Could not read code execution runtimes.';
  }
  let ai: { configured: boolean; enabled?: boolean; providers: { label: string; model: string; enabled: boolean; healthy: boolean }[] } = { configured: false, providers: [] };
  let aiError: string | null = null;
  try {
    ai = await aiStatus();
  } catch {
    aiError = 'Could not read AI provider status.';
  }
  const [store] = await db
    .select({ bytes: sql<string>`coalesce(sum(${files.size}), 0)::bigint`, count: sql<number>`count(*)::int` })
    .from(files)
    .where(eq(files.status, 'ready'));
  const flags = await getFeatureFlags();
  const lastRetention = await db
    .select({ id: backgroundJobs.id, status: backgroundJobs.status, updatedAt: backgroundJobs.updatedAt, result: backgroundJobs.result })
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.type, RETENTION_JOB), inArray(backgroundJobs.status, ['succeeded', 'failed'])))
    .orderBy(desc(backgroundJobs.updatedAt))
    .limit(1);

  const services = [
    { key: 'database', label: 'Database', status: dbStatus, detail: dbError ?? `${dbHandle().kind === 'pglite' ? 'Embedded PGlite' : 'PostgreSQL'}, test query took ${latencyMs} ms.` },
    {
      key: 'worker',
      label: 'Background worker',
      status: workerHealth,
      detail: !w.running ? 'The in-process worker is not running in this process (WORKER_ENABLED=false or not started). Jobs will wait until a worker runs.' : tickAge !== null && tickAge > 30_000 ? `Last tick ${Math.round(tickAge / 1000)} s ago; it normally ticks every second.` : 'Running and ticking normally.',
    },
    { key: 'queue', label: 'Job queue', status: queueHealth, detail: `${queue.ready} ready, ${queue.scheduled} scheduled for later, ${queue.running} running, ${queue.stale} stale, ${queue.failed24h} failed in 24 h.` },
    { key: 'email', label: 'Email', status: (email.configured ? 'ok' : 'not_configured') as HealthStatus, detail: email.note },
    {
      key: 'ai',
      label: 'AI providers',
      status: (aiError ? 'degraded' : !flags.ai || ai.enabled === false ? 'not_configured' : ai.configured ? (ai.providers.some((p) => p.enabled && p.healthy) ? 'ok' : 'degraded') : 'not_configured') as HealthStatus,
      detail: aiError ?? (!flags.ai ? 'Turned off by the AI feature flag.' : ai.enabled === false ? 'AI is switched off in AI provider settings.' : ai.configured ? `${ai.providers.filter((p) => p.enabled).length} enabled provider(s).` : 'No AI provider configured. AI features show an unavailable message; everything else works.'),
    },
    {
      key: 'exec',
      label: 'Code execution',
      status: (execError ? 'degraded' : execRuntimes.some((r) => r.available) ? 'ok' : 'not_configured') as HealthStatus,
      detail: execError ?? (execRuntimes.length ? `${execRuntimes.filter((r) => r.available).length} of ${execRuntimes.length} runtimes available.` : 'No runtimes reported.'),
    },
  ];
  const overall: HealthStatus = services.some((s) => s.status === 'down') ? 'down' : services.some((s) => s.status === 'degraded') ? 'degraded' : 'ok';

  return c.json({
    overall,
    checkedAt: new Date().toISOString(),
    services,
    database: { kind: dbHandle().kind, latencyMs, status: dbStatus },
    worker: { running: w.running, lastTickAt: w.lastTickAt, handlers: w.handlers.length, status: workerHealth },
    queue: { ...queue, oldestReadyAgeSeconds: oldestAgeSec },
    email: { configured: email.configured, provider: email.provider, note: email.note },
    ai: { configured: ai.configured, providers: ai.providers.map((p) => ({ label: p.label, model: p.model, enabled: p.enabled, healthy: p.healthy })) },
    exec: execRuntimes,
    storage: { bytes: Number(store.bytes), files: store.count, userQuotaBytes: await getUserStorageQuotaBytes() },
    retention: lastRetention[0] ?? null,
    app: { version: appVersion(), uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), node: process.version, env: config().NODE_ENV },
    legend: {
      ok: 'Working as expected.',
      degraded: 'Working with a problem that needs attention.',
      down: 'Not working.',
      not_configured: 'Optional service that is not set up on this server. Features that need it say so.',
    },
  });
});

// ---------- Feature flags ----------

adminRoutes.get('/features', async (c) => {
  requirePlatformAdmin(c);
  const flags = await getFeatureFlags();
  return c.json({
    features: FEATURE_KEYS.map((k) => ({ key: k, label: FEATURE_FLAGS[k].label, description: FEATURE_FLAGS[k].description, default: FEATURE_FLAGS[k].default, enabled: flags[k] })),
  });
});

adminRoutes.put('/features', async (c) => {
  const auth = requirePlatformAdmin(c);
  const input = await body(c, z.object({ flags: z.object(Object.fromEntries(FEATURE_KEYS.map((k) => [k, z.boolean().optional()])) as Record<FeatureFlag, z.ZodOptional<z.ZodBoolean>>).strict() }));
  const before = await getFeatureFlags();
  const next = { ...before };
  for (const k of FEATURE_KEYS) if (typeof input.flags[k] === 'boolean') next[k] = input.flags[k]!;
  await writeSetting('features', next, auth.user.id);
  const changed = Object.fromEntries(FEATURE_KEYS.filter((k) => before[k] !== next[k]).map((k) => [k, next[k]]));
  await audit(c, { action: 'admin.features_updated', targetType: 'system_settings', targetId: 'features', meta: { changed } });
  return c.json({ features: next });
});

// ---------- Plans & usage (demonstration mode) ----------

adminRoutes.get('/plans', async (c) => {
  requirePlatformAdmin(c);
  const plans = await getPlans();
  const counts = await db.select({ planId: organizations.planId, n: sql<number>`count(*)::int` }).from(organizations).groupBy(organizations.planId);
  return c.json({
    mode: BILLING_MODE,
    notice: BILLING_NOTICE,
    plans: plans.map((p) => ({ ...p, orgCount: counts.find((x) => x.planId === p.id)?.n ?? 0 })),
    defaults: DEFAULT_PLANS,
    limitLabels: LIMIT_LABELS,
    entitlementLabels: PLAN_ENTITLEMENTS,
  });
});

adminRoutes.put('/plans/:planId', async (c) => {
  const auth = requirePlatformAdmin(c);
  const planId = c.req.param('planId');
  if (!(PLAN_IDS as readonly string[]).includes(planId)) throw notFound('Plan');
  const input = await body(
    c,
    z.object({
      name: planSchema.shape.name.optional(),
      description: planSchema.shape.description.optional(),
      limits: patchSchema(planLimitsSchema).optional(),
      entitlements: patchSchema(planSchema.shape.entitlements).optional(),
    }),
  );
  const plans = await getPlans();
  const current = plans.find((p) => p.id === planId)!;
  const next = planSchema.safeParse({ ...current, ...input, id: planId, limits: { ...current.limits, ...(input.limits ?? {}) }, entitlements: { ...current.entitlements, ...(input.entitlements ?? {}) } });
  if (!next.success) throw badRequest('Please check the plan values.');
  const stored = await readSetting<Record<string, unknown>>('plans', {});
  await writeSetting('plans', { ...(stored ?? {}), [planId]: next.data }, auth.user.id);
  await audit(c, { action: 'admin.plan_updated', targetType: 'plan', targetId: planId, meta: { before: current, after: next.data, mode: BILLING_MODE } });
  return c.json({ plan: next.data, notice: BILLING_NOTICE });
});

adminRoutes.post('/plans/:planId/reset', async (c) => {
  const auth = requirePlatformAdmin(c);
  const planId = c.req.param('planId');
  if (!(PLAN_IDS as readonly string[]).includes(planId)) throw notFound('Plan');
  const stored = { ...((await readSetting<Record<string, unknown>>('plans', {})) ?? {}) };
  delete stored[planId];
  await writeSetting('plans', stored, auth.user.id);
  await audit(c, { action: 'admin.plan_reset', targetType: 'plan', targetId: planId });
  return c.json({ plan: DEFAULT_PLANS.find((p) => p.id === planId) });
});

adminRoutes.get('/usage/orgs/:id', async (c) => {
  requirePlatformAdmin(c);
  const id = idParam(c);
  const [o] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, id));
  if (!o) throw notFound('Organization');
  return c.json({ usage: await orgUsage(id), notice: BILLING_NOTICE });
});

adminRoutes.get('/usage/users/:id', async (c) => {
  requirePlatformStaff(c);
  const id = idParam(c);
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
  if (!u) throw notFound('User');
  return c.json({ usage: await Promise.all([checkLimit('user', id, 'ai.requests.day'), checkLimit('user', id, 'storage.bytes')]) });
});

// ---------- Platform settings ----------

adminRoutes.get('/settings', async (c) => {
  requirePlatformAdmin(c);
  const [demo] = await db
    .select({ users: sql<number>`count(*) filter (where ${users.isSample})::int` })
    .from(users);
  const [demoOrgs] = await db.select({ n: sql<number>`count(*) filter (where ${organizations.isSample})::int` }).from(organizations);
  const cfg = config();
  const lastRetention = await db
    .select({ id: backgroundJobs.id, status: backgroundJobs.status, updatedAt: backgroundJobs.updatedAt, result: backgroundJobs.result, lastError: backgroundJobs.lastError })
    .from(backgroundJobs)
    .where(eq(backgroundJobs.type, RETENTION_JOB))
    .orderBy(desc(backgroundJobs.updatedAt))
    .limit(3);
  return c.json({
    retention: await getRetention(),
    retentionDefaults: RETENTION_DEFAULTS,
    retentionRules: [
      `Audit logs are never pruned before ${AUDIT_MIN_RETENTION_DAYS} days, whatever the setting.`,
      `Revoked or expired sessions are removed ${SESSION_PRUNE_DAYS} days after they stop working.`,
      'Generated data export files are deleted after the export retention window or their own expiry, whichever comes first.',
      'AI conversation retention is off unless a number of days is set; when set, conversations untouched for longer are deleted.',
      'The retention sweep runs daily as the background job "admin.retention" and is safe to run again.',
    ],
    retentionRuns: lastRetention,
    storage: { userQuotaBytes: await getUserStorageQuotaBytes(), defaultUserQuotaBytes: DEFAULT_USER_QUOTA_BYTES },
    signupOpen: await isSignupOpen(),
    security: {
      sessionLifetimeDays: 14,
      sessionNote: 'Sliding 14-day sessions, refreshed at most hourly. HttpOnly, SameSite=Lax cookies, Secure in production.',
      passwordPolicy: 'At least 10 characters with a letter and a number. Stored as scrypt hashes.',
      lockout: '8 failed sign-ins lock the account for 15 minutes and notify the owner.',
      csrf: 'Non-GET API requests must come from this site (Origin check).',
      secrets: 'Provider keys are encrypted with AES-256-GCM using APP_SECRET. Only masked values are shown.',
    },
    demoData: {
      sampleUsers: demo.users,
      sampleOrgs: demoOrgs.n,
      seedingEnabled: cfg.SEED_DEMO ? cfg.SEED_DEMO === 'true' : !cfg.isProd,
      note: 'Sample data lives only in sample organizations and @demo.learnsphere.test accounts and is labeled in the UI. Set SEED_DEMO=false to start without it.',
    },
  });
});

adminRoutes.put('/settings', async (c) => {
  const auth = requirePlatformAdmin(c);
  const input = await body(
    c,
    z.object({
      retention: patchSchema(retentionSchema).optional(),
      storageUserQuotaMb: z.number().int().min(10).max(100_000).optional(),
      signupOpen: z.boolean().optional(),
    }),
  );
  const changes: Record<string, unknown> = {};
  if (input.retention) {
    const before = await getRetention();
    const next = retentionSchema.safeParse({ ...before, ...input.retention });
    if (!next.success) throw badRequest('Please check the retention values.', { fields: Object.fromEntries(next.error.issues.map((i) => [`retention.${i.path.join('.')}`, i.message])) });
    await writeSetting('retention', next.data, auth.user.id);
    await writeSetting('privacy.deletionGraceDays', next.data.deletionGraceDays, auth.user.id);
    changes.retention = { before, after: next.data };
  }
  if (input.storageUserQuotaMb !== undefined) {
    await writeSetting('storage.userQuotaBytes', input.storageUserQuotaMb * 1024 * 1024, auth.user.id);
    changes.storageUserQuotaMb = input.storageUserQuotaMb;
  }
  if (input.signupOpen !== undefined) {
    await writeSetting('auth.signupOpen', input.signupOpen, auth.user.id);
    changes.signupOpen = input.signupOpen;
  }
  await audit(c, { action: 'admin.settings_updated', targetType: 'system_settings', meta: changes });
  return c.json({ ok: true, retention: await getRetention(), signupOpen: await isSignupOpen(), storage: { userQuotaBytes: await getUserStorageQuotaBytes() } });
});

/** Runs the retention sweep now (as a background job, so it is visible and retryable). */
adminRoutes.post('/retention/run', async (c) => {
  const auth = requirePlatformAdmin(c);
  const minute = Math.floor(Date.now() / 60_000);
  const { job, created } = await enqueue(RETENTION_JOB, { manual: true }, { idempotencyKey: `${RETENTION_JOB}:manual:${minute}`, createdBy: auth.user.id });
  if (created) await audit(c, { action: 'admin.retention_run_requested', targetType: 'job', targetId: job.id });
  return c.json({ job: { id: job.id, status: job.status }, created }, created ? 201 : 200);
});

// ---------- Administrative reports (CSV) ----------

adminRoutes.get('/exports/users.csv', async (c) => {
  requirePlatformAdmin(c);
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      platformRole: users.platformRole,
      status: users.status,
      isSample: users.isSample,
      createdAt: users.createdAt,
      lastActiveAt: users.lastActiveAt,
      orgs: sql<number>`(select count(*)::int from memberships m where m.user_id = "users"."id" and m.status = 'active')`,
    })
    .from(users)
    .where(ne(users.status, 'deleted'))
    .orderBy(asc(users.createdAt))
    .limit(50_000);
  await audit(c, { action: 'admin.report_exported', targetType: 'report', targetId: 'users', meta: { rows: rows.length } });
  const csv = toCsv(
    ['user_id', 'name', 'email', 'platform_role', 'status', 'sample_account', 'created_at_utc', 'last_active_at_utc', 'active_org_memberships'],
    rows.map((r) => [r.id, r.name, r.email, r.platformRole ?? '', r.status, r.isSample, r.createdAt, r.lastActiveAt, r.orgs]),
    [
      `Users report, generated ${new Date().toISOString()}. Contains personal data: handle according to your privacy policy.`,
      'last_active_at_utc: last sign-in or authenticated request (updated at most hourly). Empty means never recorded.',
      'active_org_memberships: memberships with status active. Deleted accounts are excluded.',
    ],
  );
  return csvResponse(c, `users-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});

adminRoutes.get('/exports/orgs.csv', async (c) => {
  requirePlatformAdmin(c);
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      kind: organizations.kind,
      planId: organizations.planId,
      status: organizations.status,
      isSample: organizations.isSample,
      createdAt: organizations.createdAt,
      members: sql<number>`(select count(*)::int from memberships m where m.org_id = "organizations"."id" and m.status = 'active')`,
    })
    .from(organizations)
    .orderBy(asc(organizations.name));
  await audit(c, { action: 'admin.report_exported', targetType: 'report', targetId: 'orgs', meta: { rows: rows.length } });
  const csv = toCsv(
    ['org_id', 'name', 'slug', 'kind', 'plan', 'status', 'sample_org', 'created_at_utc', 'active_members'],
    rows.map((r) => [r.id, r.name, r.slug, r.kind, r.planId, r.status, r.isSample, r.createdAt, r.members]),
    [`Organizations report, generated ${new Date().toISOString()}.`, 'plan: assigned in demonstration mode; no payments are processed.', 'active_members: memberships with status active.'],
  );
  return csvResponse(c, `organizations-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});

adminRoutes.get('/exports/usage.csv', async (c) => {
  requirePlatformAdmin(c);
  const d30 = new Date(Date.now() - 30 * DAY);
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      planId: organizations.planId,
      members: sql<number>`(select count(*)::int from memberships m where m.org_id = "organizations"."id" and m.status = 'active')`,
      active30: sql<number>`(select count(*)::int from memberships m join users u on u.id = m.user_id where m.org_id = "organizations"."id" and m.status = 'active' and u.last_active_at >= ${d30})`,
      aiRequests30: sql<number>`(select count(*)::int from ai_usage a where a.org_id = "organizations"."id" and a.created_at >= ${d30})`,
      postings: sql<number>`(select count(*)::int from job_postings j where j.org_id = "organizations"."id" and j.status = 'published')`,
      assessmentsMonth: sql<number>`(select count(*)::int from assessments s where s.org_id = "organizations"."id" and s.created_at >= ${monthStart})`,
      storageBytes: sql<string>`(select coalesce(sum(f.size), 0)::bigint from files f where f.org_id = "organizations"."id" and f.status = 'ready')`,
    })
    .from(organizations)
    .orderBy(asc(organizations.name));
  await audit(c, { action: 'admin.report_exported', targetType: 'report', targetId: 'usage', meta: { rows: rows.length } });
  const csv = toCsv(
    ['org_id', 'name', 'plan', 'active_members', 'members_active_30d', 'ai_requests_30d', 'published_job_postings', 'assessments_this_month', 'org_file_storage_bytes'],
    rows.map((r) => [r.id, r.name, r.planId, r.members, r.active30, r.aiRequests30, r.postings, r.assessmentsMonth, Number(r.storageBytes)]),
    [
      `Usage report, generated ${new Date().toISOString()}.`,
      'members_active_30d: active members whose last recorded activity is within 30 days.',
      'ai_requests_30d: AI usage rows attributed to the organization in the last 30 days, successful or not.',
      'assessments_this_month: assessments created since the start of the current UTC month.',
      'org_file_storage_bytes: ready files attributed to the organization. Personal uploads without an organization are not included.',
      'These are counts of records. They do not explain causes.',
    ],
  );
  return csvResponse(c, `usage-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});

