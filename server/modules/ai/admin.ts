/**
 * Platform-admin AI management, mounted at /api/ai/admin.
 * Every mutation is audited. Keys are only ever returned masked.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, count, desc, eq, gte, max, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { aiConversations, aiEvalRuns, aiMessages, aiProviders, aiUsage, reports, users } from '../../db/schema';
import { type AppEnv, requirePlatformAdmin } from '../../lib/context';
import { body, idParam, query } from '../../lib/validate';
import { badRequest, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { decryptSecret, encryptSecret, maskSecret } from '../../lib/crypto';
import { enqueue } from '../../jobs/queue';
import { PRESETS, assertPresetAllowed, selectablePresets, type PresetId } from '../../ai/providers';
import { listProviderRows, providerHealth, rowProblem, testTarget, toTarget } from '../../ai/engine';
import { KNOWN_FEATURES, getAiSettings, updateAiSettings } from '../../ai/settings';
import { EVAL_CASES } from '../../ai/evals';
import { SAFETY_LIMITATIONS } from '../../ai/safety';

export const aiAdminRoutes = new Hono<AppEnv>();

aiAdminRoutes.use('*', async (c, next) => {
  requirePlatformAdmin(c);
  await next();
});

type ProviderRow = typeof aiProviders.$inferSelect;

function maskedKey(row: ProviderRow): string | null {
  try {
    if (row.keySource === 'db' && row.apiKeyEnc) return maskSecret(decryptSecret(row.apiKeyEnc));
    if (row.keySource === 'env' && row.envVar && process.env[row.envVar]) return maskSecret(process.env[row.envVar]!);
  } catch {
    return '•••• (unreadable)';
  }
  return null;
}

export function publicProvider(row: ProviderRow) {
  return {
    id: row.id,
    preset: row.preset,
    label: row.label,
    baseUrl: row.baseUrl,
    model: row.model,
    keySource: row.keySource,
    envVar: row.envVar,
    keyMasked: maskedKey(row),
    priority: row.priority,
    enabled: row.enabled,
    timeoutMs: row.timeoutMs,
    dataNotice: row.dataNotice,
    problem: rowProblem(row),
    health: providerHealth(row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function presetOrThrow(preset: string): PresetId {
  try {
    assertPresetAllowed(preset);
    return preset;
  } catch (e) {
    throw badRequest((e as Error).message, { fields: { preset: (e as Error).message } });
  }
}

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https?:\/\/[^\s]+$/i.test(v), 'Enter an http(s) URL.')
  .refine((v) => !/<[^>]*>/.test(v), 'Replace the <placeholder> in the URL.');

// ---------- Presets & providers ----------

aiAdminRoutes.get('/presets', (c) => c.json({ presets: selectablePresets(), limitations: SAFETY_LIMITATIONS }));

aiAdminRoutes.get('/providers', async (c) => {
  const rows = await listProviderRows();
  return c.json({ items: rows.filter((r) => r.preset !== 'mock' || process.env.NODE_ENV === 'test').map(publicProvider) });
});

aiAdminRoutes.post('/providers', async (c) => {
  const input = await body(
    c,
    z.object({
      preset: z.string().max(40),
      label: z.string().trim().min(1).max(80).optional(),
      baseUrl: httpUrl.optional(),
      model: z.string().trim().min(1, 'Choose or enter a model.').max(200),
      apiKey: z.string().trim().max(1000).optional(),
      priority: z.number().int().min(0).max(100000).optional(),
      enabled: z.boolean().optional(),
      timeoutMs: z.number().int().min(2000).max(120000).optional(),
    }),
  );
  const preset = presetOrThrow(input.preset);
  const p = PRESETS[preset];
  const baseUrl = input.baseUrl ?? p.baseUrl;
  if (preset !== 'mock' && !/^https?:\/\//i.test(baseUrl)) throw badRequest('Enter the base URL.', { fields: { baseUrl: 'Enter an http(s) URL.' } });
  if (/<[^>]*>/.test(baseUrl)) throw badRequest('Replace the placeholder in the base URL.', { fields: { baseUrl: p.baseUrlHelp ?? 'Replace the <placeholder> in the URL.' } });
  if (!input.apiKey && !p.keyOptional) throw badRequest('Enter the API key.', { fields: { apiKey: 'This provider needs an API key.' } });
  const [{ top }] = await db.select({ top: max(aiProviders.priority) }).from(aiProviders);
  const [row] = await db
    .insert(aiProviders)
    .values({
      preset,
      label: input.label ?? p.label,
      baseUrl,
      model: input.model,
      keySource: input.apiKey ? 'db' : 'none',
      apiKeyEnc: input.apiKey ? encryptSecret(input.apiKey) : null,
      priority: input.priority ?? (top ?? 0) + 10,
      enabled: input.enabled ?? true,
      timeoutMs: input.timeoutMs ?? 30000,
      dataNotice: p.dataNotice,
    })
    .returning();
  await audit(c, { action: 'ai.provider.created', targetType: 'ai_provider', targetId: row.id, meta: { preset, model: row.model, label: row.label } });
  return c.json({ provider: publicProvider(row) }, 201);
});

aiAdminRoutes.patch('/providers/:id', async (c) => {
  const id = idParam(c);
  const [row] = await db.select().from(aiProviders).where(eq(aiProviders.id, id));
  if (!row) throw notFound('Provider');
  const input = await body(
    c,
    z.object({
      label: z.string().trim().min(1).max(80).optional(),
      baseUrl: httpUrl.optional(),
      model: z.string().trim().min(1).max(200).optional(),
      apiKey: z.string().trim().min(1).max(1000).optional(),
      clearKey: z.boolean().optional(),
      priority: z.number().int().min(0).max(100000).optional(),
      enabled: z.boolean().optional(),
      timeoutMs: z.number().int().min(2000).max(120000).optional(),
    }),
  );
  const patch: Partial<typeof aiProviders.$inferInsert> = { updatedAt: new Date() };
  if (input.label !== undefined) patch.label = input.label;
  if (input.model !== undefined) patch.model = input.model;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.timeoutMs !== undefined) patch.timeoutMs = input.timeoutMs;
  if (row.keySource === 'env') {
    if (input.baseUrl !== undefined || input.apiKey !== undefined || input.clearKey) throw badRequest(`This provider is configured by environment variables (${row.envVar ?? 'see docs'}). Change them on the server instead.`);
  } else {
    if (input.baseUrl !== undefined) patch.baseUrl = input.baseUrl;
    if (input.apiKey) {
      patch.apiKeyEnc = encryptSecret(input.apiKey);
      patch.keySource = 'db';
    } else if (input.clearKey) {
      patch.apiKeyEnc = null;
      patch.keySource = 'none';
    }
  }
  const [updated] = await db.update(aiProviders).set(patch).where(eq(aiProviders.id, id)).returning();
  await audit(c, {
    action: 'ai.provider.updated',
    targetType: 'ai_provider',
    targetId: id,
    meta: { fields: Object.keys(input).filter((k) => k !== 'apiKey'), keyChanged: !!input.apiKey || !!input.clearKey },
  });
  return c.json({ provider: publicProvider(updated) });
});

aiAdminRoutes.delete('/providers/:id', async (c) => {
  const id = idParam(c);
  const [row] = await db.select().from(aiProviders).where(eq(aiProviders.id, id));
  if (!row) throw notFound('Provider');
  if (row.keySource === 'env') throw badRequest(`This provider comes from environment variables (${row.envVar ?? 'OLLAMA_BASE_URL'}). Disable it here, or remove the variable on the server.`);
  await db.delete(aiProviders).where(eq(aiProviders.id, id));
  await audit(c, { action: 'ai.provider.deleted', targetType: 'ai_provider', targetId: id, meta: { preset: row.preset, label: row.label } });
  return c.json({ ok: true });
});

aiAdminRoutes.post('/providers/reorder', async (c) => {
  const { ids } = await body(c, z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }));
  const rows = await db.select({ id: aiProviders.id }).from(aiProviders);
  const known = new Set(rows.map((r) => r.id));
  if (ids.some((i) => !known.has(i))) throw badRequest('Unknown provider in the new order. Reload and try again.');
  for (let i = 0; i < ids.length; i++) await db.update(aiProviders).set({ priority: (i + 1) * 10, updatedAt: new Date() }).where(eq(aiProviders.id, ids[i]));
  await audit(c, { action: 'ai.provider.reordered', targetType: 'ai_provider', meta: { order: ids } });
  const all = await listProviderRows();
  return c.json({ items: all.map(publicProvider) });
});

aiAdminRoutes.post('/providers/:id/test', async (c) => {
  const id = idParam(c);
  const [row] = await db.select().from(aiProviders).where(eq(aiProviders.id, id));
  if (!row) throw notFound('Provider');
  const problem = rowProblem(row);
  const result = problem ? { ok: false, latencyMs: 0, error: problem } : await testTarget(toTarget(row));
  await audit(c, { action: 'ai.provider.tested', targetType: 'ai_provider', targetId: id, meta: { ok: result.ok, latencyMs: result.latencyMs } });
  return c.json({ result });
});

/** Tests a provider before saving it (or with a new key for an existing one). */
aiAdminRoutes.post('/providers/test', async (c) => {
  const input = await body(
    c,
    z.object({
      preset: z.string().max(40),
      baseUrl: httpUrl.optional(),
      model: z.string().trim().min(1).max(200),
      apiKey: z.string().trim().max(1000).optional(),
      providerId: z.string().uuid().optional(),
      timeoutMs: z.number().int().min(2000).max(120000).optional(),
    }),
  );
  const preset = presetOrThrow(input.preset);
  let apiKey = input.apiKey || null;
  if (!apiKey && input.providerId) {
    const [row] = await db.select().from(aiProviders).where(eq(aiProviders.id, input.providerId));
    if (!row) throw notFound('Provider');
    apiKey = toTarget(row).apiKey;
  }
  const baseUrl = input.baseUrl ?? PRESETS[preset].baseUrl;
  if (/<[^>]*>/.test(baseUrl)) throw badRequest('Replace the placeholder in the base URL.', { fields: { baseUrl: PRESETS[preset].baseUrlHelp ?? 'Replace the <placeholder>.' } });
  const result = await testTarget({ id: 'draft', preset, label: PRESETS[preset].label, baseUrl, model: input.model, apiKey, timeoutMs: input.timeoutMs ?? 20000 });
  await audit(c, { action: 'ai.provider.tested', targetType: 'ai_provider', targetId: input.providerId ?? 'draft', meta: { preset, ok: result.ok } });
  return c.json({ result });
});

// ---------- Settings: global switch, features, limits, redaction ----------

aiAdminRoutes.get('/settings', async (c) => c.json({ settings: await getAiSettings(), features: KNOWN_FEATURES, limitations: SAFETY_LIMITATIONS }));

aiAdminRoutes.put('/settings', async (c) => {
  const input = await body(
    c,
    z.object({
      enabled: z.boolean().optional(),
      disabledFeatures: z.array(z.string().max(60)).max(50).optional(),
      limits: z.object({ userDailyRequests: z.number().int().min(0).max(100000), orgMonthlyRequests: z.number().int().min(0).max(10000000) }).optional(),
      redaction: z.enum(['notice_providers', 'always', 'off']).optional(),
    }),
  );
  const settings = await updateAiSettings(input, c.get('auth')!.user.id);
  await audit(c, { action: 'ai.settings.updated', targetType: 'system_settings', targetId: 'ai', meta: input });
  return c.json({ settings });
});

// ---------- Usage analytics (counts only, never content) ----------

aiAdminRoutes.get('/usage', async (c) => {
  const { days } = query(c, z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }));
  const since = new Date(Date.now() - days * 86400_000);
  const w = gte(aiUsage.createdAt, since);
  const isOk = sql`${aiUsage.status} = 'ok'`;
  const isErr = sql`${aiUsage.status} not in ('ok', 'quota_exceeded', 'stopped')`;
  const tokens = sql<number>`coalesce(sum(coalesce(${aiUsage.inputTokens}, 0) + coalesce(${aiUsage.outputTokens}, 0)), 0)::int`;
  const agg = {
    requests: sql<number>`count(*) filter (where ${isOk})::int`,
    errors: sql<number>`count(*) filter (where ${isErr})::int`,
    tokens,
    estimatedRows: sql<number>`count(*) filter (where ${aiUsage.tokensEstimated})::int`,
    avgLatencyMs: sql<number | null>`round(avg(${aiUsage.latencyMs}) filter (where ${isOk}))::int`,
  };
  const [totals] = await db
    .select({
      ...agg,
      quotaBlocked: sql<number>`count(*) filter (where ${aiUsage.status} = 'quota_exceeded')::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
      p95LatencyMs: sql<number | null>`(percentile_cont(0.95) within group (order by ${aiUsage.latencyMs}) filter (where ${isOk}))::int`,
    })
    .from(aiUsage)
    .where(w);
  const [byProvider, byAssistant, byFeature, byDay, byStatus, topUsers] = await Promise.all([
    db
      .select({ provider: aiUsage.provider, model: aiUsage.model, ...agg })
      .from(aiUsage)
      .where(and(w, sql`${aiUsage.provider} is not null`))
      .groupBy(aiUsage.provider, aiUsage.model)
      .orderBy(desc(sql`count(*)`)),
    db.select({ assistant: aiUsage.assistant, ...agg }).from(aiUsage).where(w).groupBy(aiUsage.assistant).orderBy(desc(sql`count(*)`)),
    db.select({ feature: aiUsage.feature, ...agg }).from(aiUsage).where(w).groupBy(aiUsage.feature).orderBy(desc(sql`count(*)`)),
    db
      .select({ day: sql<string>`to_char(date_trunc('day', ${aiUsage.createdAt}), 'YYYY-MM-DD')`, ...agg })
      .from(aiUsage)
      .where(w)
      .groupBy(sql`date_trunc('day', ${aiUsage.createdAt})`)
      .orderBy(sql`date_trunc('day', ${aiUsage.createdAt})`),
    db.select({ status: aiUsage.status, n: sql<number>`count(*)::int` }).from(aiUsage).where(w).groupBy(aiUsage.status),
    db
      .select({ userId: aiUsage.userId, name: users.name, email: users.email, requests: agg.requests, tokens })
      .from(aiUsage)
      .leftJoin(users, eq(users.id, aiUsage.userId))
      .where(and(w, sql`${aiUsage.userId} is not null`))
      .groupBy(aiUsage.userId, users.name, users.email)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
  ]);
  return c.json({ days, totals, byProvider, byAssistant, byFeature, byDay, byStatus, topUsers, note: 'Tokens are estimated (characters / 4) when the provider does not report usage; estimated rows are counted separately.' });
});

// ---------- Feedback & reports ----------

aiAdminRoutes.get('/feedback', async (c) => {
  const q = query(c, z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25), value: z.enum(['1', '-1']).optional() }));
  const where = and(sql`${aiMessages.feedback} is not null`, q.value ? eq(aiMessages.feedback, Number(q.value)) : undefined);
  const [items, [{ total }], [summary]] = await Promise.all([
    db
      .select({ messageId: aiMessages.id, value: aiMessages.feedback, note: aiMessages.feedbackNote, assistant: aiConversations.assistant, provider: aiMessages.provider, model: aiMessages.model, createdAt: aiMessages.createdAt })
      .from(aiMessages)
      .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
      .where(where)
      .orderBy(desc(aiMessages.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(aiMessages).where(where),
    db
      .select({ up: sql<number>`count(*) filter (where ${aiMessages.feedback} = 1)::int`, down: sql<number>`count(*) filter (where ${aiMessages.feedback} = -1)::int` })
      .from(aiMessages)
      .where(sql`${aiMessages.feedback} is not null`),
  ]);
  return c.json({ items, total, summary, note: 'Message text is not shown for feedback. Only reported messages can be opened.' });
});

aiAdminRoutes.get('/reports', async (c) => {
  const q = query(c, z.object({ status: z.enum(['open', 'actioned', 'dismissed']).default('open'), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }));
  const where = and(eq(reports.targetType, 'ai_message'), eq(reports.status, q.status));
  const [items, [{ total }]] = await Promise.all([
    db
      .select({ id: reports.id, messageId: reports.targetId, reason: reports.reason, details: reports.details, status: reports.status, resolution: reports.resolution, createdAt: reports.createdAt, reporterName: users.name })
      .from(reports)
      .leftJoin(users, eq(users.id, reports.reporterId))
      .where(where)
      .orderBy(desc(reports.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(reports).where(where),
  ]);
  return c.json({ items, total });
});

/** Opens the text of a reported message. Platform admins only, and every view is audited. */
aiAdminRoutes.get('/reports/:id', async (c) => {
  const id = idParam(c);
  const [r] = await db.select().from(reports).where(and(eq(reports.id, id), eq(reports.targetType, 'ai_message')));
  if (!r) throw notFound('Report');
  const [m] = await db
    .select({ id: aiMessages.id, content: aiMessages.content, provider: aiMessages.provider, model: aiMessages.model, status: aiMessages.status, sources: aiMessages.sources, createdAt: aiMessages.createdAt, assistant: aiConversations.assistant })
    .from(aiMessages)
    .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
    .where(eq(aiMessages.id, r.targetId));
  await audit(c, { action: 'ai.report.viewed', targetType: 'ai_message', targetId: r.targetId, meta: { reportId: r.id } });
  return c.json({ report: { id: r.id, reason: r.reason, details: r.details, status: r.status, resolution: r.resolution, createdAt: r.createdAt }, message: m ?? null });
});

aiAdminRoutes.post('/reports/:id/resolve', async (c) => {
  const id = idParam(c);
  const input = await body(c, z.object({ status: z.enum(['actioned', 'dismissed']), resolution: z.string().trim().max(1000).optional() }));
  const [r] = await db
    .update(reports)
    .set({ status: input.status, resolution: input.resolution ?? null, resolvedBy: c.get('auth')!.user.id, resolvedAt: new Date() })
    .where(and(eq(reports.id, id), eq(reports.targetType, 'ai_message')))
    .returning();
  if (!r) throw notFound('Report');
  await audit(c, { action: 'ai.report.resolved', targetType: 'report', targetId: id, meta: { status: input.status } });
  return c.json({ ok: true });
});

// ---------- Evaluations ----------

aiAdminRoutes.get('/evals/cases', (c) =>
  c.json({
    items: EVAL_CASES.map((e) => ({ id: e.id, assistant: e.assistant, title: e.title, prompt: e.prompt, hasSource: !!e.source, checks: e.checks.map((k) => k.type) })),
    note: 'Checks are deterministic string and pattern checks. "Refuses" is a wording heuristic, not proof of safe behaviour.',
  }),
);

aiAdminRoutes.get('/evals', async (c) => {
  const rows = await db
    .select({ id: aiEvalRuns.id, status: aiEvalRuns.status, passed: aiEvalRuns.passed, total: aiEvalRuns.total, providerId: aiEvalRuns.providerId, createdAt: aiEvalRuns.createdAt, completedAt: aiEvalRuns.completedAt, startedByName: users.name })
    .from(aiEvalRuns)
    .leftJoin(users, eq(users.id, aiEvalRuns.startedBy))
    .orderBy(desc(aiEvalRuns.createdAt))
    .limit(50);
  return c.json({ items: rows });
});

aiAdminRoutes.get('/evals/:id', async (c) => {
  const [run] = await db.select().from(aiEvalRuns).where(eq(aiEvalRuns.id, idParam(c)));
  if (!run) throw notFound('Evaluation run');
  return c.json({ run, cases: EVAL_CASES.map((e) => ({ id: e.id, title: e.title, assistant: e.assistant })) });
});

aiAdminRoutes.post('/evals/run', async (c) => {
  const auth = c.get('auth')!;
  const { providerId } = await body(c, z.object({ providerId: z.string().uuid().optional() }));
  if (providerId) {
    const [p] = await db.select({ id: aiProviders.id }).from(aiProviders).where(eq(aiProviders.id, providerId));
    if (!p) throw notFound('Provider');
  }
  const [run] = await db.insert(aiEvalRuns).values({ startedBy: auth.user.id, providerId: providerId ?? null, status: 'queued', total: EVAL_CASES.length }).returning();
  await enqueue('ai.eval', { runId: run.id }, { idempotencyKey: `ai.eval:${run.id}`, maxAttempts: 1, createdBy: auth.user.id });
  await audit(c, { action: 'ai.eval.started', targetType: 'ai_eval_run', targetId: run.id, meta: { providerId: providerId ?? null } });
  return c.json({ run }, 202);
});
