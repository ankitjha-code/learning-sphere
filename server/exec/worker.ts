/**
 * Execution worker thread. One worker handles exactly one job and is then
 * terminated by the host (server/exec/pool.ts), so nothing leaks between runs and a
 * runaway job can always be killed from the main thread.
 *
 * Protocol: workerData = { kind: 'js' | 'sql' }. The worker preloads its engine,
 * posts { type: 'ready' }, then waits for { type: 'job', job } and replies
 * { type: 'result', result } or { type: 'failed', message }.
 *
 * Dev: spawned as .ts with execArgv ['--import', 'tsx'].
 * Production: bundled to dist/server/exec/worker.js by scripts/build-server.mjs.
 */
import { parentPort, workerData } from 'node:worker_threads';

const kind = (workerData as { kind?: 'js' | 'sql' } | null)?.kind ?? 'js';
const port = parentPort;

type Engine = { run: (job: never) => Promise<unknown> };

async function loadEngine(): Promise<Engine> {
  if (kind === 'sql') {
    const m = await import('./sql-judge');
    await m.preloadPglite().catch(() => {});
    return { run: m.runSqlJob as Engine['run'] };
  }
  const m = await import('./quickjs-sandbox');
  await m.preloadQuickJS().catch(() => {});
  return { run: m.runJsJob as Engine['run'] };
}

if (port) {
  const engine = loadEngine();
  void engine.then(
    () => port.postMessage({ type: 'ready' }),
    (e) => port.postMessage({ type: 'failed', message: `Sandbox failed to start: ${(e as Error)?.message ?? e}` }),
  );

  port.on('message', async (msg: { type: string; job: unknown }) => {
    if (msg?.type !== 'job') return;
    try {
      const result = await (await engine).run(msg.job as never);
      port.postMessage({ type: 'result', result });
    } catch (e) {
      port.postMessage({ type: 'failed', message: (e as Error)?.message ?? String(e) });
    }
  });
}
