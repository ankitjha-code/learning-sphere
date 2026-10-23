/**
 * Host side of the in-process sandboxes. Each job runs in its own worker thread,
 * which is terminated afterwards (or when its deadline passes), so a runaway job
 * can never block the API process. One pre-started ("warm") worker per kind keeps
 * latency low; it only preloads the engine and never sees user code before its job.
 */
import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export type WorkerKind = 'js' | 'sql';

export type WorkerOutcome<T> = { ok: true; result: T } | { ok: false; reason: 'timeout' | 'memory' | 'crashed'; message: string };

const MAX_CONCURRENT = Math.max(2, Math.min(4, (os.availableParallelism?.() ?? os.cpus().length) - 1));
const WARM_PER_KIND = 1;
const STARTUP_TIMEOUT_MS = 30_000;

let cachedSpec: { url: URL; execArgv: string[] } | null = null;

/** Finds the worker file: worker.ts next to this file in development, dist/server/exec/worker.js in production. */
function workerSpec() {
  if (cachedSpec) return cachedSpec;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    { file: path.join(here, 'worker.ts'), ts: true },
    { file: path.join(here, 'worker.js'), ts: false },
    { file: path.join(here, 'exec', 'worker.js'), ts: false }, // bundled: dist/server/index.js -> dist/server/exec/worker.js
    { file: path.resolve('dist/server/exec/worker.js'), ts: false },
    { file: path.resolve('server/exec/worker.ts'), ts: true },
  ];
  const found = candidates.find((c) => fs.existsSync(c.file));
  if (!found) throw new Error('Execution worker file not found (expected server/exec/worker.ts or dist/server/exec/worker.js).');
  cachedSpec = { url: pathToFileURL(found.file), execArgv: found.ts ? ['--import', 'tsx'] : [] };
  return cachedSpec;
}

type Slot = { worker: Worker; ready: Promise<boolean>; dead: boolean; exitError: Error | null };

function spawn(kind: WorkerKind): Slot {
  const spec = workerSpec();
  const worker = new Worker(spec.url, {
    workerData: { kind },
    execArgv: spec.execArgv,
    resourceLimits: { maxOldGenerationSizeMb: kind === 'sql' ? 256 : 192, maxYoungGenerationSizeMb: 32 },
    stdout: true, // guest code cannot reach these, but keep stray engine logs out of the API logs
    stderr: true,
    env: {}, // the worker never needs the server's secrets
  });
  worker.unref();
  worker.stdout?.resume();
  worker.stderr?.resume();
  const slot: Slot = { worker, ready: Promise.resolve(false), dead: false, exitError: null };
  slot.ready = new Promise<boolean>((resolve) => {
    const onMsg = (m: { type?: string }) => {
      if (m?.type === 'ready') {
        worker.off('message', onMsg);
        resolve(true);
      }
    };
    worker.on('message', onMsg);
    worker.once('error', (e: unknown) => {
      slot.exitError = e instanceof Error ? e : new Error(String(e));
      slot.dead = true;
      resolve(false);
    });
    worker.once('exit', () => {
      slot.dead = true;
      resolve(false);
    });
  });
  return slot;
}

const warm = new Map<WorkerKind, Slot[]>();

function takeWarm(kind: WorkerKind): Slot | null {
  const list = warm.get(kind) ?? [];
  while (list.length) {
    const s = list.shift()!;
    if (!s.dead) return s;
  }
  return null;
}

function refill(kind: WorkerKind) {
  if (shuttingDown) return;
  const list = warm.get(kind) ?? [];
  warm.set(kind, list);
  while (list.filter((s) => !s.dead).length < WARM_PER_KIND) list.push(spawn(kind));
}

// ---------- concurrency gate ----------

const active = new Map<WorkerKind, number>();
const waiting = new Map<WorkerKind, (() => void)[]>();

async function acquire(kind: WorkerKind) {
  if ((active.get(kind) ?? 0) < MAX_CONCURRENT) {
    active.set(kind, (active.get(kind) ?? 0) + 1);
    return;
  }
  await new Promise<void>((resolve) => (waiting.get(kind) ?? waiting.set(kind, []).get(kind)!).push(resolve));
}

function release(kind: WorkerKind) {
  const next = waiting.get(kind)?.shift();
  if (next) next();
  else active.set(kind, Math.max(0, (active.get(kind) ?? 1) - 1));
}

let shuttingDown = false;

/**
 * Runs one job in a fresh worker. `timeoutMs` is the wall-clock budget for the job
 * itself (worker startup is not counted). The worker is always terminated afterwards.
 */
export async function runInWorker<T>(kind: WorkerKind, job: unknown, timeoutMs: number): Promise<WorkerOutcome<T>> {
  shuttingDown = false;
  await acquire(kind);
  let slot: Slot | null = null;
  try {
    slot = takeWarm(kind);
    if (!slot || slot.dead) slot = spawn(kind);
    let ready = await withTimeout(slot.ready, STARTUP_TIMEOUT_MS);
    if (!ready) {
      // A warm worker may have died while idle; try once more with a fresh one.
      void slot.worker.terminate();
      slot = spawn(kind);
      ready = await withTimeout(slot.ready, STARTUP_TIMEOUT_MS);
      if (!ready) return { ok: false, reason: 'crashed', message: `The sandbox could not start${slot.exitError ? `: ${slot.exitError.message}` : '.'}` };
    }
    refill(kind);
    const s = slot;
    return await new Promise<WorkerOutcome<T>>((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout', message: 'Time limit exceeded.' }), timeoutMs);
      s.worker.on('message', (m: { type?: string; result?: T; message?: string }) => {
        if (m?.type === 'result') {
          clearTimeout(timer);
          resolve({ ok: true, result: m.result as T });
        } else if (m?.type === 'failed') {
          clearTimeout(timer);
          resolve({ ok: false, reason: 'crashed', message: m.message ?? 'The sandbox failed.' });
        }
      });
      s.worker.once('error', (e: Error & { code?: string }) => {
        clearTimeout(timer);
        if (e.code === 'ERR_WORKER_OUT_OF_MEMORY') resolve({ ok: false, reason: 'memory', message: 'Memory limit exceeded.' });
        else resolve({ ok: false, reason: 'crashed', message: e.message });
      });
      s.worker.once('exit', () => {
        clearTimeout(timer);
        resolve({ ok: false, reason: 'crashed', message: 'The sandbox stopped unexpectedly.' });
      });
      s.worker.postMessage({ type: 'job', job });
    });
  } finally {
    if (slot) void slot.worker.terminate().catch(() => {});
    release(kind);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | false> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(false);
      },
    );
  });
}

/** Terminates idle warm workers (graceful shutdown and tests). */
export async function shutdownExecPool() {
  shuttingDown = true;
  const all = [...warm.values()].flat();
  warm.clear();
  await Promise.all(all.map((s) => s.worker.terminate().catch(() => 0)));
}
