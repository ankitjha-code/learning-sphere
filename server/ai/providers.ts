/**
 * Provider presets and the single OpenAI-compatible chat client used for every provider.
 *
 * All supported providers speak the OpenAI chat-completions dialect, so one client
 * handles them; presets only differ in base URL, auth header, model names, quirks
 * and the data notice shown to admins and users.
 *
 * The `mock` preset exists ONLY when NODE_ENV === 'test'. `assertPresetAllowed`
 * refuses it everywhere else and the engine never selects it outside tests, so the
 * product can never show fabricated AI output.
 */
import type { AiChatMessage } from './service';

export type PresetId = 'gemini' | 'groq' | 'openrouter' | 'cloudflare' | 'mistral' | 'azure_openai' | 'ollama' | 'custom' | 'mock';

export type ProviderPreset = {
  id: PresetId;
  label: string;
  baseUrl: string; // may contain a <placeholder> the admin must fill in
  baseUrlHelp?: string;
  authStyle: 'bearer' | 'api-key' | 'none';
  keyOptional?: boolean;
  models: { id: string; note?: string }[];
  defaultModel: string;
  modelHelp?: string;
  freeTier: string;
  dataNotice: string | null;
  /** Provider terms allow training on / human review of prompts: triggers redaction by default. */
  trainingUse: boolean;
  docsUrl: string;
  signupUrl: string;
  envVars: string[];
  supportsJsonMode: boolean;
  streamUsage: boolean;
  maxTokensParam: 'max_tokens' | 'max_completion_tokens';
  testOnly?: boolean;
};

export const PRESETS: Record<PresetId, ProviderPreset> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini (AI Studio free tier)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    authStyle: 'bearer',
    models: [
      { id: 'gemini-3.5-flash-lite', note: 'High volume, recommended default' },
      { id: 'gemini-3.8-flash', note: 'Higher quality, much lower daily limit' },
      { id: 'gemini-3.6-flash' },
      { id: 'gemini-3.1-flash-lite' },
    ],
    defaultModel: 'gemini-3.5-flash-lite',
    freeTier: 'Free API key from AI Studio, no card. Limits are shown per project in AI Studio and reset at midnight Pacific.',
    dataNotice:
      'Gemini free tier: Google may use prompts and responses to improve its products and human reviewers may read them. Apps that serve users in the EEA must use a paid tier. Do not share personal or confidential information.',
    trainingUse: true,
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    signupUrl: 'https://aistudio.google.com/apikey',
    envVars: ['GEMINI_API_KEY', 'GEMINI_MODEL'],
    supportsJsonMode: true,
    streamUsage: false,
    maxTokensParam: 'max_tokens',
  },
  groq: {
    id: 'groq',
    label: 'Groq (free plan)',
    baseUrl: 'https://api.groq.com/openai/v1',
    authStyle: 'bearer',
    models: [
      { id: 'openai/gpt-oss-120b', note: '30 requests/min, 1,000/day on the free plan' },
      { id: 'openai/gpt-oss-20b' },
      { id: 'llama-3.3-70b-versatile' },
      { id: 'llama-3.1-8b-instant' },
    ],
    defaultModel: 'openai/gpt-oss-120b',
    freeTier: 'Free plan with per-organization rate limits (gpt-oss-120b: 30 RPM, 1K RPD, 8K TPM).',
    dataNotice: 'Groq free plan: strict per-organization rate limits; preview models can be removed without notice.',
    trainingUse: false,
    docsUrl: 'https://console.groq.com/docs/rate-limits',
    signupUrl: 'https://console.groq.com/keys',
    envVars: ['GROQ_API_KEY', 'GROQ_MODEL'],
    supportsJsonMode: true,
    streamUsage: true,
    maxTokensParam: 'max_tokens',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (free models)',
    baseUrl: 'https://openrouter.ai/api/v1',
    authStyle: 'bearer',
    models: [{ id: 'openrouter/free', note: 'Routes to an available free model' }, { id: 'google/gemma-4-31b-it:free' }],
    defaultModel: 'openrouter/free',
    modelHelp: 'Any model id ending in :free works. The free list changes often.',
    freeTier: '20 requests/min and 50 requests/day on :free models without buying credits.',
    dataNotice: 'OpenRouter free models: 50 requests/day. Some upstream providers of free models log prompts or use them for training.',
    trainingUse: true,
    docsUrl: 'https://openrouter.ai/docs/api-reference/limits',
    signupUrl: 'https://openrouter.ai/keys',
    envVars: ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL'],
    supportsJsonMode: true,
    streamUsage: true,
    maxTokensParam: 'max_tokens',
  },
  cloudflare: {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/<account-id>/ai/v1',
    baseUrlHelp: 'Replace <account-id> with your Cloudflare account ID (Dashboard, right sidebar).',
    authStyle: 'bearer',
    models: [{ id: '@cf/meta/llama-3.1-8b-instruct', note: 'Small model, fits the free allocation' }],
    defaultModel: '@cf/meta/llama-3.1-8b-instruct',
    freeTier: '10,000 Neurons/day, resets 00:00 UTC. Requests fail after that, with no charge.',
    dataNotice: 'Cloudflare Workers AI free allocation: 10,000 Neurons per day. Small models only, so answers may be less accurate.',
    trainingUse: false,
    docsUrl: 'https://developers.cloudflare.com/workers-ai/platform/pricing',
    signupUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    envVars: ['CF_ACCOUNT_ID', 'CF_API_TOKEN', 'CF_AI_MODEL'],
    supportsJsonMode: false,
    streamUsage: false,
    maxTokensParam: 'max_tokens',
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral (Experiment free plan)',
    baseUrl: 'https://api.mistral.ai/v1',
    authStyle: 'bearer',
    models: [{ id: 'mistral-small-latest' }],
    defaultModel: 'mistral-small-latest',
    freeTier: 'Free Experiment plan with low rate limits (about 1 request/second). Phone verification required.',
    dataNotice: 'Mistral Experiment plan: requests may be used to train models unless you opt out in the Mistral console.',
    trainingUse: true,
    docsUrl: 'https://docs.mistral.ai',
    signupUrl: 'https://console.mistral.ai/api-keys',
    envVars: ['MISTRAL_API_KEY', 'MISTRAL_MODEL'],
    supportsJsonMode: true,
    streamUsage: false,
    maxTokensParam: 'max_tokens',
  },
  azure_openai: {
    id: 'azure_openai',
    label: 'Azure OpenAI (Azure for Students credit)',
    baseUrl: 'https://<resource>.openai.azure.com/openai/v1/',
    baseUrlHelp: 'Replace <resource> with your Azure OpenAI resource name.',
    authStyle: 'api-key',
    models: [{ id: 'gpt-4.1-mini', note: 'Use your deployment name' }, { id: 'gpt-5-mini', note: 'Use your deployment name' }],
    defaultModel: 'gpt-4.1-mini',
    modelHelp: 'Enter the deployment name you created in Azure AI Foundry, not the base model name.',
    freeTier: 'Not a free tier: billed per token from the $100 Azure for Students credit. The subscription stops when credit runs out (no surprise bill).',
    dataNotice: 'Azure OpenAI is paid from your Azure for Students credit. Microsoft does not use prompts to train models.',
    trainingUse: false,
    docsUrl: 'https://learn.microsoft.com/azure/foundry/openai/quotas-limits',
    signupUrl: 'https://azure.microsoft.com/en-us/free/students',
    envVars: ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_DEPLOYMENT'],
    supportsJsonMode: true,
    streamUsage: true,
    maxTokensParam: 'max_completion_tokens',
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local, optional)',
    baseUrl: 'http://localhost:11434/v1',
    authStyle: 'none',
    keyOptional: true,
    models: [{ id: 'llama3.2' }, { id: 'qwen2.5-coder' }],
    defaultModel: 'llama3.2',
    modelHelp: 'Pull the model first: ollama pull llama3.2',
    freeTier: 'Free and runs on your own hardware. Quality and speed depend on the machine.',
    dataNotice: 'Runs on a machine you control. Prompts do not leave that machine.',
    trainingUse: false,
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
    signupUrl: 'https://ollama.com/download',
    envVars: ['OLLAMA_BASE_URL', 'OLLAMA_MODEL'],
    supportsJsonMode: true,
    streamUsage: false,
    maxTokensParam: 'max_tokens',
  },
  custom: {
    id: 'custom',
    label: 'Other OpenAI-compatible endpoint',
    baseUrl: 'https://',
    baseUrlHelp: 'The base URL that ends right before /chat/completions.',
    authStyle: 'bearer',
    keyOptional: true,
    models: [],
    defaultModel: '',
    freeTier: 'Depends on the provider.',
    dataNotice: null,
    trainingUse: false,
    docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
    signupUrl: '',
    envVars: [],
    supportsJsonMode: false,
    streamUsage: false,
    maxTokensParam: 'max_tokens',
  },
  mock: {
    id: 'mock',
    label: 'Test-only mock provider',
    baseUrl: 'mock://local',
    authStyle: 'none',
    keyOptional: true,
    models: [{ id: 'echo' }, { id: 'echo-nousage' }, { id: 'fail-500' }, { id: 'fail-429' }, { id: 'timeout' }, { id: 'midstream-fail' }],
    defaultModel: 'echo',
    freeTier: 'Automated tests only.',
    dataNotice: null,
    trainingUse: false,
    docsUrl: '',
    signupUrl: '',
    envVars: [],
    supportsJsonMode: true,
    streamUsage: true,
    maxTokensParam: 'max_tokens',
    testOnly: true,
  },
};

/** Presets an admin can pick in the UI (mock is never listed outside tests). */
export function selectablePresets(nodeEnv = process.env.NODE_ENV): ProviderPreset[] {
  return Object.values(PRESETS).filter((p) => !p.testOnly || nodeEnv === 'test');
}

export function isPresetId(v: string): v is PresetId {
  return v in PRESETS;
}

/** The guard behind "mock can never be enabled in development or production". */
export function assertPresetAllowed(preset: string, nodeEnv: string | undefined = process.env.NODE_ENV): asserts preset is PresetId {
  if (!isPresetId(preset)) throw new Error(`Unknown provider preset "${preset}".`);
  if (PRESETS[preset].testOnly && nodeEnv !== 'test') throw new Error('The mock provider is only available in automated tests.');
}

export function presetAllowed(preset: string, nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  try {
    assertPresetAllowed(preset, nodeEnv);
    return true;
  } catch {
    return false;
  }
}

// ---------- Environment-configured providers ----------

export type EnvProviderDef = { preset: PresetId; label: string; baseUrl: string; model: string; envVar: string | null; keySource: 'env' | 'none'; priority: number };

function trimSlash(s: string) {
  return s.replace(/\/+$/, '');
}

/** Providers implied by environment variables. Keys are never copied into the database. */
export function envProviderDefs(env: NodeJS.ProcessEnv = process.env): EnvProviderDef[] {
  const out: EnvProviderDef[] = [];
  if (env.GEMINI_API_KEY)
    out.push({ preset: 'gemini', label: 'Gemini (env)', baseUrl: PRESETS.gemini.baseUrl, model: env.GEMINI_MODEL || PRESETS.gemini.defaultModel, envVar: 'GEMINI_API_KEY', keySource: 'env', priority: 10 });
  if (env.GROQ_API_KEY)
    out.push({ preset: 'groq', label: 'Groq (env)', baseUrl: PRESETS.groq.baseUrl, model: env.GROQ_MODEL || PRESETS.groq.defaultModel, envVar: 'GROQ_API_KEY', keySource: 'env', priority: 20 });
  if (env.OPENROUTER_API_KEY)
    out.push({ preset: 'openrouter', label: 'OpenRouter (env)', baseUrl: PRESETS.openrouter.baseUrl, model: env.OPENROUTER_MODEL || PRESETS.openrouter.defaultModel, envVar: 'OPENROUTER_API_KEY', keySource: 'env', priority: 30 });
  if (env.CF_ACCOUNT_ID && env.CF_API_TOKEN)
    out.push({
      preset: 'cloudflare',
      label: 'Cloudflare Workers AI (env)',
      baseUrl: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID.trim())}/ai/v1`,
      model: env.CF_AI_MODEL || PRESETS.cloudflare.defaultModel,
      envVar: 'CF_API_TOKEN',
      keySource: 'env',
      priority: 40,
    });
  if (env.MISTRAL_API_KEY)
    out.push({ preset: 'mistral', label: 'Mistral (env)', baseUrl: PRESETS.mistral.baseUrl, model: env.MISTRAL_MODEL || PRESETS.mistral.defaultModel, envVar: 'MISTRAL_API_KEY', keySource: 'env', priority: 50 });
  if (env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY && env.AZURE_OPENAI_DEPLOYMENT) {
    const ep = trimSlash(env.AZURE_OPENAI_ENDPOINT.trim());
    out.push({
      preset: 'azure_openai',
      label: 'Azure OpenAI (env)',
      baseUrl: /\/openai\/v1$/.test(ep) ? `${ep}/` : `${ep}/openai/v1/`,
      model: env.AZURE_OPENAI_DEPLOYMENT,
      envVar: 'AZURE_OPENAI_API_KEY',
      keySource: 'env',
      priority: 60,
    });
  }
  if (env.OLLAMA_BASE_URL) {
    const b = trimSlash(env.OLLAMA_BASE_URL.trim());
    out.push({ preset: 'ollama', label: 'Ollama (env)', baseUrl: /\/v1$/.test(b) ? b : `${b}/v1`, model: env.OLLAMA_MODEL || PRESETS.ollama.defaultModel, envVar: null, keySource: 'none', priority: 90 });
  }
  return out;
}

// ---------- OpenAI-compatible client ----------

export type ProviderErrorKind = 'rate_limited' | 'timeout' | 'unavailable' | 'auth' | 'bad_request' | 'network' | 'aborted' | 'error';

export class ProviderError extends Error {
  constructor(
    public kind: ProviderErrorKind,
    message: string,
    public status?: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export type ProviderTarget = {
  id: string;
  preset: PresetId;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  timeoutMs: number;
};

export type ChatRequest = { messages: AiChatMessage[]; maxTokens?: number; temperature?: number; json?: boolean; allowEmpty?: boolean };
export type ProviderUsage = { inputTokens: number; outputTokens: number };

function endpoint(t: ProviderTarget) {
  return `${trimSlash(t.baseUrl)}/chat/completions`;
}

function headers(t: ProviderTarget): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  const p = PRESETS[t.preset];
  if (t.apiKey) {
    if (p.authStyle === 'api-key') h['api-key'] = t.apiKey;
    else h.authorization = `Bearer ${t.apiKey}`;
  }
  if (t.preset === 'openrouter') {
    h['x-title'] = 'LearnSphere Nexus';
  }
  return h;
}

function payload(t: ProviderTarget, req: ChatRequest, stream: boolean) {
  const p = PRESETS[t.preset];
  const body: Record<string, unknown> = { model: t.model, messages: req.messages, stream };
  if (req.maxTokens) body[p.maxTokensParam] = req.maxTokens;
  // Reasoning-style Azure deployments only accept the default temperature.
  const fixedTemperature = t.preset === 'azure_openai' && /^(gpt-5|o\d)/i.test(t.model);
  if (req.temperature !== undefined && !fixedTemperature) body.temperature = req.temperature;
  if (req.json && p.supportsJsonMode) body.response_format = { type: 'json_object' };
  if (stream && p.streamUsage) body.stream_options = { include_usage: true };
  return JSON.stringify(body);
}

function retryAfter(res: Response): number | undefined {
  const h = res.headers.get('retry-after');
  if (!h) return undefined;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(1, Math.ceil(n));
  const d = Date.parse(h);
  return Number.isFinite(d) ? Math.max(1, Math.ceil((d - Date.now()) / 1000)) : undefined;
}

/** Turns a non-2xx response into a ProviderError with the provider's own (truncated) message. */
async function errorFromResponse(res: Response, label: string): Promise<ProviderError> {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      const e = Array.isArray(j) ? j[0]?.error : j?.error;
      detail = (typeof e === 'string' ? e : e?.message) ?? j?.message ?? j?.errors?.[0]?.message ?? text;
    } catch {
      detail = text;
    }
  } catch {
    /* body unreadable */
  }
  detail = String(detail).replace(/\s+/g, ' ').trim().slice(0, 300);
  const s = res.status;
  const msg = `${label} returned HTTP ${s}${detail ? `: ${detail}` : ''}`;
  if (s === 429) return new ProviderError('rate_limited', msg, s, retryAfter(res));
  if (s === 401 || s === 403) return new ProviderError('auth', msg, s);
  if (s === 408 || s === 504) return new ProviderError('timeout', msg, s);
  if (s >= 500) return new ProviderError('unavailable', msg, s, retryAfter(res));
  return new ProviderError('bad_request', msg, s);
}

/** Abort signal that fires on the caller's signal or after `ms`; `timedOut()` tells which. */
function deadline(ms: number, outer?: AbortSignal) {
  const ctrl = new AbortController();
  let timedOut = false;
  let timer: NodeJS.Timeout | null = null;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, ms);
  };
  const onOuter = () => ctrl.abort();
  if (outer) {
    if (outer.aborted) ctrl.abort();
    else outer.addEventListener('abort', onOuter, { once: true });
  }
  arm();
  return {
    signal: ctrl.signal,
    timedOut: () => timedOut,
    reset: arm,
    done: () => {
      if (timer) clearTimeout(timer);
      outer?.removeEventListener('abort', onOuter);
    },
  };
}

function networkError(t: ProviderTarget, err: unknown, timedOut: boolean, outer?: AbortSignal): ProviderError {
  if (timedOut) return new ProviderError('timeout', `${t.label} did not respond within ${Math.round(t.timeoutMs / 1000)} seconds.`);
  if (outer?.aborted) return new ProviderError('aborted', 'Request cancelled.');
  const code = (err as { cause?: { code?: string } })?.cause?.code;
  return new ProviderError('network', `Could not reach ${t.label}${code ? ` (${code})` : ''}.`);
}

function usageOf(u: unknown): ProviderUsage | undefined {
  const x = u as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  if (!x || typeof x.prompt_tokens !== 'number') return undefined;
  return { inputTokens: x.prompt_tokens, outputTokens: x.completion_tokens ?? 0 };
}

function contentOf(m: unknown): string {
  const c = (m as { content?: unknown })?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p === 'string' ? p : (p as { text?: string })?.text ?? '')).join('');
  return '';
}

export async function chatCompletion(t: ProviderTarget, req: ChatRequest, outer?: AbortSignal): Promise<{ text: string; usage?: ProviderUsage }> {
  if (t.preset === 'mock') return mockCompletion(t, req, outer);
  const d = deadline(t.timeoutMs, outer);
  try {
    let res: Response;
    try {
      res = await fetch(endpoint(t), { method: 'POST', headers: headers(t), body: payload(t, req, false), signal: d.signal });
    } catch (err) {
      throw networkError(t, err, d.timedOut(), outer);
    }
    if (!res.ok) throw await errorFromResponse(res, t.label);
    let j: { choices?: { message?: unknown; finish_reason?: string }[]; usage?: unknown };
    try {
      j = await res.json();
    } catch (err) {
      if (d.timedOut() || outer?.aborted) throw networkError(t, err, d.timedOut(), outer);
      throw new ProviderError('error', `${t.label} sent a response that is not valid JSON.`);
    }
    const text = contentOf(j.choices?.[0]?.message);
    if (!text.trim() && !req.allowEmpty) throw new ProviderError('error', `${t.label} returned an empty answer${j.choices?.[0]?.finish_reason ? ` (finish reason: ${j.choices[0].finish_reason})` : ''}.`);
    return { text, usage: usageOf(j.usage) };
  } finally {
    d.done();
  }
}

export type StreamEvent = { delta?: string; usage?: ProviderUsage };

/**
 * Opens a streaming completion. Resolves once the provider accepted the request
 * (HTTP 2xx), so failover can happen before any text is shown. Errors thrown
 * while iterating are mid-stream failures. The timeout is an idle timeout:
 * it restarts on every chunk.
 */
export async function openChatStream(t: ProviderTarget, req: ChatRequest, outer?: AbortSignal): Promise<AsyncGenerator<StreamEvent>> {
  if (t.preset === 'mock') return mockStream(t, req, outer);
  const d = deadline(t.timeoutMs, outer);
  let res: Response;
  try {
    res = await fetch(endpoint(t), { method: 'POST', headers: { ...headers(t), accept: 'text/event-stream' }, body: payload(t, req, true), signal: d.signal });
  } catch (err) {
    d.done();
    throw networkError(t, err, d.timedOut(), outer);
  }
  if (!res.ok || !res.body) {
    d.done();
    throw res.ok ? new ProviderError('error', `${t.label} returned no stream body.`) : await errorFromResponse(res, t.label);
  }
  const body = res.body;
  async function* iterate(): AsyncGenerator<StreamEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (err) {
          throw networkError(t, err, d.timedOut(), outer);
        }
        if (chunk.done) break;
        d.reset();
        buf += decoder.decode(chunk.value, { stream: true });
        let idx: number;
        while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
          const event = buf.slice(0, idx);
          buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '');
          for (const line of event.split(/\r?\n/)) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            let j: { choices?: { delta?: unknown }[]; usage?: unknown; error?: { message?: string } };
            try {
              j = JSON.parse(data);
            } catch {
              continue;
            }
            if (j.error) throw new ProviderError('error', `${t.label} reported an error mid-answer: ${String(j.error.message ?? 'unknown').slice(0, 200)}`);
            const delta = contentOf(j.choices?.[0]?.delta);
            const usage = usageOf(j.usage);
            if (delta || usage) yield { delta: delta || undefined, usage };
          }
        }
      }
    } finally {
      d.done();
      reader.releaseLock();
      if (outer?.aborted) body.cancel().catch(() => {});
    }
  }
  return iterate();
}

// ---------- Test-only mock (NODE_ENV === 'test') ----------

/** Requests the mock received, so tests can assert exactly what would be sent to a provider. */
export const mockCalls: { providerId: string; model: string; messages: AiChatMessage[] }[] = [];

function assertMockAllowed() {
  if (process.env.NODE_ENV !== 'test') throw new ProviderError('error', 'The mock provider is only available in automated tests.');
}

function mockReply(req: ChatRequest) {
  const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  if (req.json) return JSON.stringify({ mock: true, echo: lastUser.slice(0, 80) });
  return `Mock reply. You asked: ${lastUser.slice(0, 120)}`;
}

async function mockBehaviour(t: ProviderTarget, req: ChatRequest, outer?: AbortSignal) {
  assertMockAllowed();
  mockCalls.push({ providerId: t.id, model: t.model, messages: req.messages });
  if (t.model === 'fail-500') throw new ProviderError('unavailable', `${t.label} returned HTTP 500: mock failure`, 500);
  if (t.model === 'fail-429') throw new ProviderError('rate_limited', `${t.label} returned HTTP 429: mock rate limit`, 429, 30);
  if (t.model === 'timeout') {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, t.timeoutMs);
      outer?.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    throw new ProviderError('timeout', `${t.label} did not respond within ${Math.round(t.timeoutMs / 1000)} seconds.`);
  }
}

async function mockCompletion(t: ProviderTarget, req: ChatRequest, outer?: AbortSignal) {
  await mockBehaviour(t, req, outer);
  const text = mockReply(req);
  const usage = t.model === 'echo-nousage' ? undefined : { inputTokens: 42, outputTokens: 7 };
  return { text, usage };
}

async function mockStream(t: ProviderTarget, req: ChatRequest, outer?: AbortSignal): Promise<AsyncGenerator<StreamEvent>> {
  await mockBehaviour(t, req, outer);
  const text = mockReply(req);
  async function* gen(): AsyncGenerator<StreamEvent> {
    const parts = text.match(/.{1,12}/gs) ?? [text];
    for (let i = 0; i < parts.length; i++) {
      if (outer?.aborted) return;
      if (t.model === 'midstream-fail' && i === 2) throw new ProviderError('network', `Connection to ${t.label} dropped mid-answer.`);
      yield { delta: parts[i] };
    }
    if (t.model !== 'echo-nousage') yield { usage: { inputTokens: 42, outputTokens: 7 } };
  }
  return gen();
}
