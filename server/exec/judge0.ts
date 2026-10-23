/**
 * Judge0 CE adapter: a self-hosted instance (JUDGE0_URL, optional JUDGE0_KEY as
 * X-Auth-Token) or the RapidAPI free plan (JUDGE0_RAPIDAPI_HOST + JUDGE0_KEY).
 * Submissions are sent in batches with base64 bodies; expected outputs are never
 * sent (comparison happens on our server).
 */
import type { ExecLanguage } from './index';
import { JUDGE0_LANGUAGE_IDS } from './languages';
import type { RawTestOutcome } from './quickjs-sandbox';
import { OUTPUT_CAP_BYTES } from './compare';

export type Judge0Settings = { url?: string; key?: string; rapidHost?: string };

export function judge0Endpoint(s: Judge0Settings): { base: string; headers: Record<string, string>; label: string } | null {
  if (s.url) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (s.key) headers['X-Auth-Token'] = s.key;
    return { base: s.url.replace(/\/+$/, ''), headers, label: 'Judge0 (self-hosted)' };
  }
  if (s.rapidHost && s.key) {
    return {
      base: `https://${s.rapidHost.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`,
      headers: { 'content-type': 'application/json', 'X-RapidAPI-Key': s.key, 'X-RapidAPI-Host': s.rapidHost.replace(/^https?:\/\//, '').replace(/\/+$/, '') },
      label: 'Judge0 CE (RapidAPI)',
    };
  }
  return null;
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s: string | null | undefined) => (s ? Buffer.from(s, 'base64').toString('utf8') : '');

type Submission = { token?: string; stdout?: string | null; stderr?: string | null; compile_output?: string | null; message?: string | null; status?: { id: number; description: string }; time?: string | null };

async function call<T>(url: string, init: RequestInit, timeoutMs = 20_000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 429) throw new Error('Judge0 rate limit or daily quota reached. Try again later.');
      if (res.status === 401 || res.status === 403) throw new Error('Judge0 rejected the API key.');
      throw new Error(`Judge0 returned HTTP ${res.status}.`);
    }
    return JSON.parse(text) as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Judge0 did not respond in time.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

const BATCH = 20;

export async function runInJudge0(settings: Judge0Settings, language: ExecLanguage, code: string, inputs: string[], timeLimitMs: number, memoryLimitMb: number): Promise<{ compileError?: string; results: RawTestOutcome[]; error?: string }> {
  const ep = judge0Endpoint(settings);
  const languageId = JUDGE0_LANGUAGE_IDS[language];
  if (!ep) return { results: [], error: 'Judge0 is not configured.' };
  if (!languageId) return { results: [], error: `Judge0 has no mapping for ${language}.` };
  // Stay inside the free-plan limits: CPU time up to 5 s, memory up to 256 MB.
  const cpu = Math.min(5, Math.max(0.5, timeLimitMs / 1000));
  const memKb = Math.min(256_000, Math.max(32_000, (memoryLimitMb || 256) * 1000));
  try {
    const tokens: string[] = [];
    for (let i = 0; i < inputs.length; i += BATCH) {
      const chunk = inputs.slice(i, i + BATCH);
      const created = await call<{ token?: string; error?: string }[] | { error?: string }>(`${ep.base}/submissions/batch?base64_encoded=true`, {
        method: 'POST',
        headers: ep.headers,
        body: JSON.stringify({
          submissions: chunk.map((input) => ({ language_id: languageId, source_code: b64(code), stdin: b64(input), cpu_time_limit: cpu, wall_time_limit: Math.min(15, cpu * 3), memory_limit: memKb })),
        }),
      });
      if (!Array.isArray(created)) throw new Error(created.error ?? 'Judge0 rejected the batch.');
      for (const c of created) {
        if (!c.token) throw new Error(c.error ?? 'Judge0 rejected a submission.');
        tokens.push(c.token);
      }
    }
    const done = new Map<string, Submission>();
    const deadline = Date.now() + 60_000 + inputs.length * cpu * 1000;
    while (done.size < tokens.length) {
      if (Date.now() > deadline) throw new Error('Judge0 did not finish in time.');
      await new Promise((r) => setTimeout(r, 1000));
      const pending = tokens.filter((t) => !done.has(t));
      for (let i = 0; i < pending.length; i += BATCH) {
        const res = await call<{ submissions: Submission[] }>(
          `${ep.base}/submissions/batch?tokens=${pending.slice(i, i + BATCH).join(',')}&base64_encoded=true&fields=token,stdout,stderr,compile_output,message,status,time`,
          { method: 'GET', headers: ep.headers },
        );
        for (const s of res.submissions ?? []) if (s.token && s.status && s.status.id > 2) done.set(s.token, s);
      }
    }
    const results: RawTestOutcome[] = [];
    for (const t of tokens) {
      const s = done.get(t)!;
      const id = s.status?.id ?? 13;
      const stdout = unb64(s.stdout).slice(0, OUTPUT_CAP_BYTES);
      const stderr = unb64(s.stderr).slice(0, 16 * 1024);
      const timeMs = s.time ? Math.round(Number(s.time) * 1000) : null;
      if (id === 6) return { compileError: unb64(s.compile_output) || 'Compilation failed.', results: [] };
      if (id === 3 || id === 4) results.push({ status: 'ok', stdout, stderr, timeMs });
      else if (id === 5) results.push({ status: 'time_limit', stdout, stderr, timeMs, error: 'Time limit exceeded.' });
      else if (id >= 7 && id <= 12) results.push({ status: 'runtime_error', stdout, stderr, timeMs, error: s.status?.description ?? 'Runtime error' });
      else return { results: [], error: `Judge0 could not run the code: ${s.status?.description ?? 'internal error'}${s.message ? ` (${unb64(s.message)})` : ''}` };
    }
    return { results };
  } catch (e) {
    return { results: [], error: (e as Error).message };
  }
}
