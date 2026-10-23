/**
 * Execution entry points (see the contract in ./index.ts).
 *
 * Provider selection per language:
 *   javascript, typescript → QuickJS (WebAssembly, in a worker thread)
 *   sql                    → PGlite (WebAssembly, fresh database per run, in a worker thread)
 *   everything else        → Docker (if reachable and the image is present)
 *                            → Judge0 (if configured)
 *                            → 'unavailable' with a reason and setup hint
 * Results are never faked: if nothing can run the code, status is 'unavailable'.
 */
import type { ExecLanguage, ExecResult, ExecTest, ExecTestResult, RuntimeInfo } from './index';
import { config } from '../lib/config';
import { outputsMatch, capOutput } from './compare';
import { ALL_LANGUAGES, DOCKER_RECIPES, LANGUAGE_LABELS } from './languages';
import { runInWorker } from './pool';
import type { JsJob, JsJobResult, RawTestOutcome } from './quickjs-sandbox';
import type { SqlJob, SqlJobResult } from './sql-judge';
import { dockerReachable, imagePresent, pullImage, pullStatus, runInDocker, type PullStatus } from './docker';
import { judge0Endpoint, runInJudge0, type Judge0Settings } from './judge0';

export const MAX_CODE_BYTES = 64 * 1024;
export const MAX_INPUT_BYTES = 256 * 1024;
const STDERR_DISPLAY_CAP = 8 * 1024;

// ---------- configuration (env, with overrides for tests and admin tooling) ----------

type DockerMode = 'auto' | 'true' | 'false';
let overrides: { docker?: DockerMode; judge0?: Judge0Settings | null } = {};

/** Overrides env-based settings (used by tests to simulate a server without Docker or Judge0). */
export function configureExec(o: { docker?: DockerMode; judge0?: Judge0Settings | null }) {
  overrides = { ...overrides, ...o };
}

export function resetExecConfig() {
  overrides = {};
}

function dockerMode(): DockerMode {
  if (overrides.docker) return overrides.docker;
  const v = (process.env.CODE_EXEC_DOCKER ?? config().CODE_EXEC_DOCKER ?? 'auto').toLowerCase().trim();
  return v === 'true' || v === '1' ? 'true' : v === 'false' || v === '0' ? 'false' : 'auto';
}

function judge0Settings(): Judge0Settings {
  if (overrides.judge0 !== undefined) return overrides.judge0 ?? {};
  const c = config();
  return { url: c.JUDGE0_URL, key: c.JUDGE0_KEY, rapidHost: c.JUDGE0_RAPIDAPI_HOST };
}

// ---------- provider selection ----------

type Choice = { provider: ExecResult['provider']; reason?: string; setupHint?: string; image?: string };

const JUDGE0_HINT = 'Or configure Judge0: set JUDGE0_URL to a self-hosted Judge0 CE, or JUDGE0_RAPIDAPI_HOST=judge0-ce.p.rapidapi.com and JUDGE0_KEY for the RapidAPI free plan.';

async function choose(language: ExecLanguage | 'sql'): Promise<Choice> {
  if (language === 'javascript' || language === 'typescript') return { provider: 'quickjs' };
  if (language === 'sql') return { provider: 'pglite' };
  const recipe = DOCKER_RECIPES[language];
  const mode = dockerMode();
  const judge0 = judge0Endpoint(judge0Settings());
  let reason = '';
  let setupHint = '';
  if (recipe && mode !== 'false') {
    const reach = await dockerReachable();
    if (reach.ok) {
      if (await imagePresent(recipe.image)) return { provider: 'docker', image: recipe.image };
      reason = `Docker is running but the ${recipe.image} image is not on this server yet.`;
      setupHint = `A platform admin can pull ${recipe.image} on the CodeLab runtimes page, /app/practice/runtimes (or run "docker pull ${recipe.image}" on the server).`;
    } else if (mode === 'true') {
      return {
        provider: 'none',
        image: recipe.image,
        reason: `CODE_EXEC_DOCKER=true but Docker is not reachable (${reach.error ?? 'unknown error'}).`,
        setupHint: 'Start the Docker daemon and make sure the server user can run "docker info", or set CODE_EXEC_DOCKER=auto to allow other providers.',
      };
    } else {
      reason = 'Docker is not available on this server.';
      setupHint = `Install Docker on the server (or a VM) and pull ${recipe.image}. ${JUDGE0_HINT}`;
    }
  } else if (recipe) {
    reason = 'The Docker sandbox is turned off (CODE_EXEC_DOCKER=false).';
    setupHint = `Set CODE_EXEC_DOCKER=auto on a machine with Docker. ${JUDGE0_HINT}`;
  }
  if (judge0) return { provider: 'judge0' };
  return { provider: 'none', image: recipe?.image, reason: reason || `No sandbox can run ${LANGUAGE_LABELS[language]} on this server.`, setupHint: setupHint || JUDGE0_HINT };
}

// ---------- grading ----------

function clamp(n: number | undefined, lo: number, hi: number, dflt: number) {
  if (n === undefined || !Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

function unavailable(message: string, total = 0): ExecResult {
  return { provider: 'none', status: 'unavailable', passed: 0, total, message, results: [], durationMs: 0 };
}

function failure(provider: ExecResult['provider'], status: 'error' | 'time_limit' | 'runtime_error', message: string, tests: ExecTest[], durationMs: number): ExecResult {
  const testStatus: ExecTestResult['status'] = status === 'time_limit' ? 'time_limit' : status === 'runtime_error' ? 'runtime_error' : 'error';
  return {
    provider,
    status,
    passed: 0,
    total: tests.length,
    message,
    durationMs,
    results: tests.map((t, i) => ({ name: t.hidden ? `Hidden test ${hiddenIndex(tests, i)}` : t.name, hidden: !!t.hidden, passed: false, status: testStatus, timeMs: null })),
  };
}

function hiddenIndex(tests: ExecTest[], i: number) {
  let n = 0;
  for (let j = 0; j <= i; j++) if (tests[j].hidden) n++;
  return n;
}

const STATUS_WORDS: Record<ExecTestResult['status'], string> = {
  passed: 'passed',
  wrong_answer: 'wrong answer',
  runtime_error: 'runtime error',
  time_limit: 'time limit exceeded',
  memory_limit: 'memory limit exceeded',
  compile_error: 'compile error',
  error: 'sandbox error',
};

/**
 * Builds the contract result from raw sandbox outcomes. Hidden tests get an
 * anonymous name and only pass/fail, status and time (no input, expected, actual or stderr).
 */
export function gradeOutcomes(provider: ExecResult['provider'], tests: ExecTest[], raw: RawTestOutcome[], durationMs: number, compileError?: string): ExecResult {
  if (compileError !== undefined) {
    return {
      provider,
      status: 'compile_error',
      passed: 0,
      total: tests.length,
      compileOutput: capOutput(compileError, 16 * 1024).text,
      message: 'The code did not compile.',
      durationMs,
      results: tests.map((t, i) => ({ name: t.hidden ? `Hidden test ${hiddenIndex(tests, i)}` : t.name, hidden: !!t.hidden, passed: false, status: 'compile_error', timeMs: null })),
    };
  }
  const results: ExecTestResult[] = tests.map((t, i) => {
    const r = raw[i];
    const hidden = !!t.hidden;
    let status: ExecTestResult['status'];
    if (!r) status = 'error';
    else if (r.status === 'ok') status = outputsMatch(r.stdout, t.expected) ? 'passed' : 'wrong_answer';
    else if (r.status === 'output_limit') status = 'runtime_error';
    else status = r.status;
    const base: ExecTestResult = { name: hidden ? `Hidden test ${hiddenIndex(tests, i)}` : t.name, hidden, passed: status === 'passed', status, timeMs: r?.timeMs ?? null };
    if (hidden) return base;
    const errNote = r?.error && status !== 'passed' && status !== 'wrong_answer' && !r.stderr.includes(r.error) ? `${r.error}\n` : '';
    return {
      ...base,
      input: t.input,
      expected: t.expected,
      actual: r ? capOutput(r.stdout).text : '',
      stderr: capOutput(errNote + (r?.stderr ?? ''), STDERR_DISPLAY_CAP).text || undefined,
    };
  });
  const passed = results.filter((r) => r.passed).length;
  const firstFail = results.find((r) => !r.passed);
  let status: ExecResult['status'] = 'accepted';
  if (firstFail) {
    status =
      firstFail.status === 'wrong_answer'
        ? 'wrong_answer'
        : firstFail.status === 'time_limit'
          ? 'time_limit'
          : firstFail.status === 'error'
            ? 'error'
            : 'runtime_error'; // runtime_error, memory_limit
  }
  const message = firstFail
    ? `Passed ${passed} of ${tests.length} test${tests.length === 1 ? '' : 's'}. First failure: ${firstFail.name} (${STATUS_WORDS[firstFail.status]}).`
    : `All ${tests.length} test${tests.length === 1 ? '' : 's'} passed.`;
  return { provider, status, passed, total: tests.length, message, results, durationMs };
}

// ---------- public API ----------

export async function runCode(p: { language: ExecLanguage; code: string; tests: ExecTest[]; timeLimitMs?: number; memoryLimitMb?: number }): Promise<ExecResult> {
  const started = Date.now();
  if (!ALL_LANGUAGES.includes(p.language)) return unavailable(`Unsupported language: ${String(p.language)}.`);
  if (Buffer.byteLength(p.code, 'utf8') > MAX_CODE_BYTES) return { ...unavailable(''), provider: 'none', status: 'error', message: 'Code is larger than 64 KB.', total: p.tests.length };
  if (!p.tests.length) return { ...unavailable(''), status: 'error', message: 'There are no tests to run.' };
  const timeLimitMs = clamp(p.timeLimitMs, 100, 10_000, 2000);
  const memoryLimitMb = clamp(p.memoryLimitMb, 16, 512, 256);
  const inputs = p.tests.map((t) => t.input ?? '');
  const choice = await choose(p.language);

  if (choice.provider === 'none' || choice.provider === 'pglite') {
    const r = unavailable(`${LANGUAGE_LABELS[p.language]} cannot run on this server: ${choice.reason ?? 'no sandbox available'}${choice.setupHint ? ` ${choice.setupHint}` : ''}`, p.tests.length);
    return r;
  }

  if (choice.provider === 'quickjs') {
    const job: JsJob = { language: p.language as 'javascript' | 'typescript', code: p.code, inputs, timeLimitMs, memoryLimitMb };
    // Each test is bounded by the interrupt handler; the worker budget is a backstop.
    const budget = inputs.length * (timeLimitMs + 400) + 3000;
    const out = await runInWorker<JsJobResult>('js', job, budget);
    const durationMs = Date.now() - started;
    if (!out.ok) {
      if (out.reason === 'timeout') return failure('quickjs', 'time_limit', `Time limit exceeded (${timeLimitMs} ms per test).`, p.tests, durationMs);
      if (out.reason === 'memory') return failure('quickjs', 'runtime_error', `Memory limit exceeded (${memoryLimitMb} MB).`, p.tests, durationMs);
      return failure('quickjs', 'error', `The JavaScript sandbox failed: ${out.message}`, p.tests, durationMs);
    }
    return gradeOutcomes('quickjs', p.tests, out.result.results, durationMs, out.result.compileError);
  }

  if (choice.provider === 'docker') {
    const r = await runInDocker(p.language, p.code, inputs, timeLimitMs, memoryLimitMb);
    const durationMs = Date.now() - started;
    if (r.error && !r.results.length) return failure('docker', 'error', r.error, p.tests, durationMs);
    const graded = gradeOutcomes('docker', p.tests, r.results, durationMs, r.compileError);
    if (r.error) graded.message = `${graded.message} ${r.error}`;
    return graded;
  }

  // Judge0
  const r = await runInJudge0(judge0Settings(), p.language, p.code, inputs, timeLimitMs, memoryLimitMb);
  const durationMs = Date.now() - started;
  if (r.error) return failure('judge0', 'error', r.error, p.tests, durationMs);
  return gradeOutcomes('judge0', p.tests, r.results, durationMs, r.compileError);
}

export type SqlRunResult = ExecResult & { columns?: string[]; rows?: unknown[][]; rowCount?: number; expectedColumns?: string[] };

/**
 * Runs a learner query against schemaSql + seedSql on a fresh database and compares
 * it with solutionSql. Returns the learner's columns and rows (capped at 200) and only
 * the expected column names, never the expected rows.
 */
export async function runSql(p: { schemaSql: string; seedSql: string; query: string; solutionSql: string; orderMatters: boolean; timeLimitMs?: number }): Promise<SqlRunResult> {
  const started = Date.now();
  if (Buffer.byteLength(p.query, 'utf8') > MAX_CODE_BYTES) return { ...unavailable(''), status: 'error', message: 'Query is larger than 64 KB.' };
  const timeLimitMs = clamp(p.timeLimitMs, 500, 20_000, 5000);
  const job: SqlJob = { schemaSql: p.schemaSql, seedSql: p.seedSql, query: p.query, solutionSql: p.solutionSql, orderMatters: p.orderMatters };
  const out = await runInWorker<SqlJobResult>('sql', job, timeLimitMs);
  const durationMs = Date.now() - started;
  const single = (status: ExecTestResult['status'], timeMs: number | null): ExecTestResult[] => [{ name: 'Query result', hidden: false, passed: status === 'passed', status, timeMs }];
  if (!out.ok) {
    if (out.reason === 'timeout') return { provider: 'pglite', status: 'time_limit', passed: 0, total: 1, message: `The query did not finish within ${Math.round(timeLimitMs / 1000)} s.`, results: single('time_limit', null), durationMs };
    if (out.reason === 'memory') return { provider: 'pglite', status: 'runtime_error', passed: 0, total: 1, message: 'The query ran out of memory.', results: single('memory_limit', null), durationMs };
    return { provider: 'pglite', status: 'error', passed: 0, total: 1, message: `The SQL sandbox failed: ${out.message}`, results: single('error', null), durationMs };
  }
  const r = out.result;
  const testStatus: ExecTestResult['status'] = r.status === 'accepted' ? 'passed' : r.status;
  return {
    provider: 'pglite',
    status: r.status,
    passed: r.status === 'accepted' ? 1 : 0,
    total: 1,
    message: r.message,
    results: single(testStatus, r.timeMs),
    durationMs,
    columns: r.columns,
    rows: r.rows,
    rowCount: r.rowCount,
    expectedColumns: r.expectedColumns,
  };
}

/** Availability of every language (including SQL) on this server right now. */
export async function runtimes(): Promise<RuntimeInfo[]> {
  const langs: (ExecLanguage | 'sql')[] = [...ALL_LANGUAGES, 'sql'];
  return Promise.all(
    langs.map(async (language): Promise<RuntimeInfo> => {
      const c = await choose(language);
      return c.provider === 'none'
        ? { language, available: false, provider: 'none', reason: c.reason, setupHint: c.setupHint }
        : { language, available: true, provider: c.provider };
    }),
  );
}

// ---------- admin ----------

export type RuntimeAdminInfo = RuntimeInfo & { label: string; image: string | null; imagePresent: boolean | null; pull: PullStatus | null };

/** Detailed status for Admin > Runtimes (Docker state, images, pull progress, Judge0). */
export async function runtimeAdminStatus(): Promise<{ docker: { mode: DockerMode; reachable: boolean; error?: string }; judge0: { configured: boolean; label: string | null }; runtimes: RuntimeAdminInfo[] }> {
  const mode = dockerMode();
  const reach = mode === 'false' ? { ok: false, error: 'disabled by CODE_EXEC_DOCKER=false' } : await dockerReachable(true);
  const ep = judge0Endpoint(judge0Settings());
  const list = await runtimes();
  const detailed = await Promise.all(
    list.map(async (r): Promise<RuntimeAdminInfo> => {
      const image = r.language === 'sql' ? null : (DOCKER_RECIPES[r.language]?.image ?? null);
      return {
        ...r,
        label: LANGUAGE_LABELS[r.language],
        image,
        imagePresent: image && reach.ok ? await imagePresent(image, true) : null,
        pull: image ? pullStatus(image) : null,
      };
    }),
  );
  return { docker: { mode, reachable: reach.ok, error: reach.error }, judge0: { configured: !!ep, label: ep?.label ?? null }, runtimes: detailed };
}

export function dockerImageFor(language: string): string | null {
  return DOCKER_RECIPES[language as ExecLanguage]?.image ?? null;
}

/** Pulls the Docker image for a language. Only called from the admin job 'exec.pull_image'. */
export async function pullRuntimeImage(language: string): Promise<PullStatus> {
  const image = dockerImageFor(language);
  if (!image) throw new Error(`${language} does not use a Docker image.`);
  if (dockerMode() === 'false') throw new Error('The Docker sandbox is turned off (CODE_EXEC_DOCKER=false).');
  const reach = await dockerReachable(true);
  if (!reach.ok) throw new Error(`Docker is not reachable: ${reach.error ?? 'unknown error'}`);
  return pullImage(image);
}

export function runtimePullStatus(language: string): PullStatus | null {
  const image = dockerImageFor(language);
  return image ? pullStatus(image) : null;
}
