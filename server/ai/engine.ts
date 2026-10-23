/**
 * AI engine: implements the contract in service.ts.
 *
 * Request path: global switch → per-feature switch → configured providers →
 * quota → providers in priority order (skipping ones whose circuit is open) with a
 * per-request timeout → failover on 429 / 5xx / timeout / network / auth errors →
 * usage accounting (ai_usage + usage_counters).
 *
 * Prompt contents are never written to server logs or to ai_usage.
 */
import { and, asc, eq } from 'drizzle-orm';
import { db, dbHandle } from '../db/client';
import { aiProviders, aiUsage } from '../db/schema';
import { config } from '../lib/config';
import { decryptSecret } from '../lib/crypto';
import type { AiChatMessage, AiCompleteOptions, AiFailureReason, AiResult } from './service';
import {
  PRESETS,
  ProviderError,
  chatCompletion,
  envProviderDefs,
  isPresetId,
  openChatStream,
  presetAllowed,
  type ProviderTarget,
  type ProviderUsage,
} from './providers';
import { checkQuota, chargeRequest } from './quotas';
import { getAiSettings, type AiSettings } from './settings';
import { getAssistant, BASE_INSTRUCTIONS } from './assistants';
import { prepareMessages, redactMessages } from './safety';

type ProviderRow = typeof aiProviders.$inferSelect;

// ---------- Environment providers (registered on first use per database) ----------

const synced = new WeakSet<object>();

/** Registers providers implied by environment variables. Idempotent; never stores keys. */
export async function ensureEnvProviders() {
  const handle = dbHandle();
  if (synced.has(handle)) return;
  config(); // loads .env into process.env in development
  const defs = envProviderDefs();
  if (defs.length) {
    const existing = await db.select().from(aiProviders).where(eq(aiProviders.keySource, 'env'));
    const ollamaRows = await db.select().from(aiProviders).where(and(eq(aiProviders.preset, 'ollama'), eq(aiProviders.keySource, 'none')));
    for (const d of defs) {
      const row = d.keySource === 'none' ? ollamaRows[0] : existing.find((r) => r.preset === d.preset);
      if (!row) {
        await db.insert(aiProviders).values({
          preset: d.preset,
          label: d.label,
          baseUrl: d.baseUrl,
          model: d.model,
          keySource: d.keySource,
          envVar: d.envVar,
          priority: d.priority,
          enabled: true,
          dataNotice: PRESETS[d.preset].dataNotice,
        });
      } else if (row.baseUrl !== d.baseUrl || row.envVar !== d.envVar) {
        await db.update(aiProviders).set({ baseUrl: d.baseUrl, envVar: d.envVar, updatedAt: new Date() }).where(eq(aiProviders.id, row.id));
      }
    }
  }
  synced.add(handle);
}

// ---------- Circuit breaker (per process) ----------

const FAILURE_THRESHOLD = 3;
const OPEN_SECONDS = 60;
const breaker = new Map<string, { failures: number; openUntil: number; lastError?: string }>();

function circuitOpenFor(id: string): number {
  const b = breaker.get(id);
  if (!b || b.openUntil <= Date.now()) return 0;
  return Math.ceil((b.openUntil - Date.now()) / 1000);
}

function recordSuccess(id: string) {
  breaker.delete(id);
}

function recordFailure(id: string, err: ProviderError) {
  const b = breaker.get(id) ?? { failures: 0, openUntil: 0 };
  b.failures += 1;
  b.lastError = err.message;
  if (err.kind === 'rate_limited') {
    b.openUntil = Date.now() + Math.min(3600, err.retryAfterSeconds ?? OPEN_SECONDS) * 1000;
  } else if (b.failures >= FAILURE_THRESHOLD) {
    b.openUntil = Date.now() + OPEN_SECONDS * 1000;
  }
  breaker.set(id, b);
}

/** Test hook: clears in-memory provider health. */
export function resetAiRuntimeState() {
  breaker.clear();
}

export function providerHealth(id: string) {
  const b = breaker.get(id);
  return { circuitOpenSeconds: circuitOpenFor(id), consecutiveFailures: b?.failures ?? 0, lastError: b?.lastError ?? null };
}

// ---------- Provider resolution ----------

export function isTestEnv() {
  return process.env.NODE_ENV === 'test';
}

/** Why a configured row cannot be used right now (null = usable). */
export function rowProblem(row: ProviderRow): string | null {
  if (!isPresetId(row.preset)) return `Unknown preset "${row.preset}".`;
  if (!presetAllowed(row.preset)) return 'This preset is only available in automated tests.';
  if (row.keySource === 'env') {
    if (row.envVar && !process.env[row.envVar]) return `Environment variable ${row.envVar} is not set.`;
  } else if (row.keySource === 'db') {
    if (!row.apiKeyEnc && !PRESETS[row.preset].keyOptional) return 'No API key saved.';
    if (row.apiKeyEnc) {
      try {
        decryptSecret(row.apiKeyEnc);
      } catch {
        return 'The saved key cannot be decrypted (was APP_SECRET changed?). Enter the key again.';
      }
    }
  }
  if (/<[^>]+>/.test(row.baseUrl)) return 'The base URL still contains a placeholder.';
  return null;
}

export function toTarget(row: ProviderRow): ProviderTarget {
  let apiKey: string | null = null;
  if (row.keySource === 'env' && row.envVar) apiKey = process.env[row.envVar] ?? null;
  else if (row.keySource === 'db' && row.apiKeyEnc) apiKey = decryptSecret(row.apiKeyEnc);
  return { id: row.id, preset: row.preset as ProviderTarget['preset'], label: row.label, baseUrl: row.baseUrl, model: row.model, apiKey, timeoutMs: row.timeoutMs };
}

export async function listProviderRows() {
  await ensureEnvProviders();
  return db.select().from(aiProviders).orderBy(asc(aiProviders.priority), asc(aiProviders.createdAt));
}

async function usableProviders(onlyId?: string): Promise<ProviderRow[]> {
  const rows = await listProviderRows();
  return rows.filter((r) => r.enabled && !rowProblem(r) && (!onlyId || r.id === onlyId));
}

function shouldRedact(row: ProviderRow, settings: AiSettings) {
  if (settings.redaction === 'off') return false;
  if (settings.redaction === 'always') return true;
  return isPresetId(row.preset) && PRESETS[row.preset].trainingUse;
}

// ---------- Usage accounting ----------

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

async function recordUsage(entry: {
  opts: Pick<AiCompleteOptions, 'userId' | 'orgId' | 'assistant' | 'feature'>;
  row?: ProviderRow | null;
  status: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimated?: boolean;
  latencyMs?: number | null;
  error?: string | null;
}) {
  try {
    await db.insert(aiUsage).values({
      userId: entry.opts.userId,
      orgId: entry.opts.orgId ?? null,
      assistant: entry.opts.assistant,
      feature: entry.opts.feature,
      providerId: entry.row?.id ?? null,
      provider: entry.row?.preset ?? null,
      model: entry.row?.model ?? null,
      status: entry.status,
      inputTokens: entry.inputTokens ?? null,
      outputTokens: entry.outputTokens ?? null,
      tokensEstimated: entry.estimated ?? false,
      latencyMs: entry.latencyMs ?? null,
      // Error text is the provider's status message only; never prompt content.
      error: entry.error ? entry.error.slice(0, 500) : null,
    });
  } catch (e) {
    console.warn('[ai] usage write failed', (e as Error).message);
  }
}

function usageFor(messages: AiChatMessage[], text: string, u?: ProviderUsage) {
  if (u) return { inputTokens: u.inputTokens, outputTokens: u.outputTokens, estimated: false };
  return { inputTokens: estimateTokens(messages.map((m) => m.content).join('\n')), outputTokens: estimateTokens(text), estimated: true };
}

// ---------- Preflight ----------

export type Failure = { ok: false; reason: AiFailureReason; message: string; retryAfterSeconds?: number };

type Prepared = { settings: AiSettings; providers: ProviderRow[]; messages: AiChatMessage[] };

export type InternalOptions = { providerId?: string; skipQuota?: boolean };

/** Builds the provider message list: shared base rules first, specialist prompt if the caller gave no system message. */
export function composeMessages(opts: AiCompleteOptions): AiChatMessage[] {
  const hasSystem = opts.messages.some((m) => m.role === 'system');
  const a = getAssistant(opts.assistant);
  const lead: AiChatMessage[] = [];
  if (!hasSystem) {
    lead.push({ role: 'system', content: a ? `${BASE_INSTRUCTIONS}\n\nYour role: ${a.name}.\n${a.prompt}` : BASE_INSTRUCTIONS });
  } else if (!opts.messages.find((m) => m.role === 'system')?.content.includes(BASE_INSTRUCTIONS.slice(0, 60))) {
    lead.push({ role: 'system', content: BASE_INSTRUCTIONS });
  }
  if (opts.json) lead.push({ role: 'system', content: 'Respond with a single JSON object only, no prose and no code fences.' });
  return prepareMessages([...lead, ...opts.messages]);
}

async function preflight(opts: AiCompleteOptions, internal: InternalOptions): Promise<Failure | Prepared> {
  const settings = await getAiSettings();
  if (!settings.enabled) return { ok: false, reason: 'disabled', message: 'AI features are turned off on this platform by an administrator. Everything else keeps working.' };
  if (settings.disabledFeatures.includes(opts.feature))
    return { ok: false, reason: 'disabled', message: 'This AI feature is turned off by an administrator. Everything else keeps working.' };
  const providers = await usableProviders(internal.providerId);
  if (!providers.length)
    return {
      ok: false,
      reason: 'not_configured',
      message: internal.providerId ? 'That AI provider is not usable (disabled or missing its key).' : 'No AI provider is configured on this server. A platform admin can add a free provider in Admin → AI providers.',
    };
  if (!internal.skipQuota && opts.feature !== 'eval') {
    const q = await checkQuota(opts.userId, opts.orgId);
    if (!q.ok) {
      await recordUsage({ opts, status: 'quota_exceeded', error: `${q.scope} quota` });
      return { ok: false, reason: 'quota_exceeded', message: q.message, retryAfterSeconds: q.retryAfterSeconds };
    }
  }
  return { settings, providers, messages: composeMessages(opts) };
}

function failureFrom(errors: { row: ProviderRow; err: ProviderError }[], skipped: { row: ProviderRow; seconds: number }[]): Failure {
  if (!errors.length) {
    const wait = Math.min(...skipped.map((s) => s.seconds));
    return {
      ok: false,
      reason: 'unavailable',
      message: `All configured AI providers are cooling down after recent failures. Try again in about ${wait} seconds.`,
      retryAfterSeconds: wait,
    };
  }
  const kinds = new Set(errors.map((e) => e.err.kind));
  const summary = errors.map((e) => `${e.row.label}: ${describe(e.err)}`).join('; ');
  let reason: AiFailureReason = 'error';
  if ([...kinds].every((k) => k === 'rate_limited')) reason = 'rate_limited';
  else if ([...kinds].every((k) => k === 'timeout')) reason = 'timeout';
  else if ([...kinds].every((k) => k === 'unavailable' || k === 'network' || k === 'timeout' || k === 'rate_limited')) reason = 'unavailable';
  const retryAfter = errors.map((e) => e.err.retryAfterSeconds).filter((n): n is number => typeof n === 'number');
  const lead =
    reason === 'rate_limited'
      ? 'The AI providers are rate limiting requests right now (free tiers have low limits).'
      : reason === 'timeout'
        ? 'The AI provider took too long to answer.'
        : errors.length > 1
          ? 'None of the configured AI providers could answer.'
          : 'The AI provider could not answer.';
  return { ok: false, reason, message: `${lead} Details: ${summary}`.slice(0, 600), retryAfterSeconds: retryAfter.length ? Math.min(...retryAfter) : undefined };
}

function describe(err: ProviderError) {
  switch (err.kind) {
    case 'rate_limited':
      return `rate limited${err.retryAfterSeconds ? ` (retry in ${err.retryAfterSeconds}s)` : ''}`;
    case 'timeout':
      return 'timed out';
    case 'auth':
      return 'rejected the API key';
    case 'network':
      return 'unreachable';
    case 'unavailable':
      return `unavailable${err.status ? ` (HTTP ${err.status})` : ''}`;
    default:
      return err.message.replace(/^.*?returned /, '').slice(0, 160);
  }
}

function asProviderError(e: unknown): ProviderError {
  return e instanceof ProviderError ? e : new ProviderError('error', 'Unexpected error while calling the provider.');
}

// ---------- Non-streaming ----------

export async function aiComplete(opts: AiCompleteOptions): Promise<AiResult> {
  return completeWith(opts, {});
}

export async function completeWith(opts: AiCompleteOptions, internal: InternalOptions): Promise<AiResult> {
  const pre = await preflight(opts, internal);
  if ('ok' in pre) return pre;
  const errors: { row: ProviderRow; err: ProviderError }[] = [];
  const skipped: { row: ProviderRow; seconds: number }[] = [];
  for (const row of pre.providers) {
    const open = circuitOpenFor(row.id);
    if (open > 0 && !internal.providerId) {
      skipped.push({ row, seconds: open });
      continue;
    }
    const target = { ...toTarget(row), timeoutMs: opts.timeoutMs ?? row.timeoutMs };
    const messages = shouldRedact(row, pre.settings) ? redactMessages(pre.messages) : pre.messages;
    const started = Date.now();
    try {
      const r = await chatCompletion(target, { messages, maxTokens: opts.maxTokens ?? 1200, temperature: opts.temperature ?? getAssistant(opts.assistant)?.temperature ?? 0.4, json: opts.json });
      const latencyMs = Date.now() - started;
      recordSuccess(row.id);
      const usage = usageFor(messages, r.text, r.usage);
      await recordUsage({ opts, row, status: 'ok', inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, estimated: usage.estimated, latencyMs });
      if (opts.feature !== 'eval') await chargeRequest(opts.userId, opts.orgId, usage.inputTokens + usage.outputTokens);
      return { ok: true, text: r.text, provider: row.preset, model: row.model, usage };
    } catch (e) {
      const err = asProviderError(e);
      recordFailure(row.id, err);
      errors.push({ row, err });
      await recordUsage({ opts, row, status: statusOf(err), latencyMs: Date.now() - started, error: err.message });
    }
  }
  return failureFrom(errors, skipped);
}

function statusOf(err: ProviderError) {
  return err.kind === 'rate_limited' ? 'rate_limited' : err.kind === 'timeout' ? 'timeout' : err.kind === 'unavailable' || err.kind === 'network' ? 'unavailable' : 'error';
}

// ---------- Streaming ----------

export type AiStreamFinal = {
  status: 'ok' | 'interrupted' | 'stopped';
  text: string;
  usage: { inputTokens: number; outputTokens: number; estimated: boolean };
  error?: string;
};

export type AiStreamStart =
  | Failure
  | {
      ok: true;
      provider: string;
      model: string;
      providerId: string;
      /** Text deltas. Never throws: a mid-stream failure ends the iteration and is reported by final(). */
      deltas: AsyncIterable<string>;
      /** Available after `deltas` finished. */
      final: () => AiStreamFinal;
    };

/**
 * Streaming completion. Failover happens only while opening the stream (before any
 * text). If the provider fails mid-answer the stream stops and final().status is
 * 'interrupted'; we never switch providers in the middle of an answer.
 */
export async function aiStream(opts: AiCompleteOptions & { signal?: AbortSignal }, internal: InternalOptions = {}): Promise<AiStreamStart> {
  const pre = await preflight(opts, internal);
  if ('ok' in pre) return pre;
  const errors: { row: ProviderRow; err: ProviderError }[] = [];
  const skipped: { row: ProviderRow; seconds: number }[] = [];
  for (const row of pre.providers) {
    const open = circuitOpenFor(row.id);
    if (open > 0) {
      skipped.push({ row, seconds: open });
      continue;
    }
    const target = { ...toTarget(row), timeoutMs: opts.timeoutMs ?? row.timeoutMs };
    const messages = shouldRedact(row, pre.settings) ? redactMessages(pre.messages) : pre.messages;
    const started = Date.now();
    let gen: AsyncGenerator<{ delta?: string; usage?: ProviderUsage }>;
    try {
      gen = await openChatStream(target, { messages, maxTokens: opts.maxTokens ?? 1500, temperature: opts.temperature ?? getAssistant(opts.assistant)?.temperature ?? 0.4, json: opts.json }, opts.signal);
    } catch (e) {
      const err = asProviderError(e);
      if (err.kind === 'aborted') return { ok: false, reason: 'error', message: 'Request cancelled.' };
      recordFailure(row.id, err);
      errors.push({ row, err });
      await recordUsage({ opts, row, status: statusOf(err), latencyMs: Date.now() - started, error: err.message });
      continue;
    }
    let result: AiStreamFinal | null = null;
    const deltas = (async function* () {
      let text = '';
      let usage: ProviderUsage | undefined;
      let status: AiStreamFinal['status'] = 'ok';
      let error: string | undefined;
      try {
        for await (const ev of gen) {
          if (ev.usage) usage = ev.usage;
          if (ev.delta) {
            text += ev.delta;
            yield ev.delta;
          }
        }
        if (opts.signal?.aborted) status = 'stopped';
        else if (!text.trim()) {
          status = 'interrupted';
          error = `${row.label} returned an empty answer.`;
        }
      } catch (e) {
        const err = asProviderError(e);
        if (err.kind === 'aborted' || opts.signal?.aborted) status = 'stopped';
        else {
          status = 'interrupted';
          error = err.message;
          recordFailure(row.id, err);
        }
      }
      const u = usageFor(messages, text, usage);
      result = { status, text, usage: u, error };
      if (status === 'ok') recordSuccess(row.id);
      await recordUsage({
        opts,
        row,
        status: status === 'ok' ? 'ok' : status === 'stopped' ? 'stopped' : 'error',
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        estimated: u.estimated,
        latencyMs: Date.now() - started,
        error: error ?? null,
      });
      // The provider did the work whenever text came back, so it counts toward the quota.
      if (text.length > 0 && opts.feature !== 'eval') await chargeRequest(opts.userId, opts.orgId, u.inputTokens + u.outputTokens);
    })();
    return {
      ok: true,
      provider: row.preset,
      model: row.model,
      providerId: row.id,
      deltas,
      final: () => result ?? { status: 'interrupted', text: '', usage: { inputTokens: 0, outputTokens: 0, estimated: true }, error: 'Stream not finished.' },
    };
  }
  return failureFrom(errors, skipped);
}

// ---------- Status & connection test ----------

export async function aiStatus(): Promise<{
  configured: boolean;
  enabled: boolean;
  providers: { id: string; label: string; model: string; enabled: boolean; healthy: boolean; preset: string; dataNotice: string | null; problem: string | null }[];
}> {
  const [rows, settings] = await Promise.all([listProviderRows(), getAiSettings()]);
  const visible = rows.filter((r) => presetAllowed(r.preset));
  const providers = visible.map((r) => {
    const problem = rowProblem(r);
    return {
      id: r.id,
      label: r.label,
      model: r.model,
      enabled: r.enabled,
      healthy: r.enabled && !problem && circuitOpenFor(r.id) === 0,
      preset: r.preset,
      dataNotice: r.dataNotice ?? (isPresetId(r.preset) ? PRESETS[r.preset].dataNotice : null),
      problem,
    };
  });
  return { configured: providers.some((p) => p.enabled && !p.problem), enabled: settings.enabled, providers };
}

/** Sends a tiny real request. Reports latency or the provider's own error. */
export async function testTarget(target: ProviderTarget): Promise<{ ok: boolean; latencyMs: number; sample?: string; error?: string; kind?: string }> {
  const started = Date.now();
  try {
    const r = await chatCompletion({ ...target, timeoutMs: Math.min(target.timeoutMs, 20000) }, { messages: [{ role: 'user', content: 'Reply with the single word: OK' }], maxTokens: 200, temperature: 0, allowEmpty: true });
    return { ok: true, latencyMs: Date.now() - started, sample: r.text.trim() ? r.text.trim().slice(0, 60) : '(connected; the model returned no visible text)' };
  } catch (e) {
    const err = asProviderError(e);
    return { ok: false, latencyMs: Date.now() - started, error: err.message, kind: err.kind };
  }
}
