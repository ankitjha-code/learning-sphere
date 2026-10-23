/**
 * JavaScript / TypeScript sandbox on QuickJS compiled to WebAssembly.
 * Runs inside a worker thread (server/exec/worker.ts). The guest has no access to
 * Node: no process, no real require, no filesystem, no network. It gets:
 *  - console.log/info/debug (stdout) and console.warn/error (stderr), captured and capped
 *  - require('fs').readFileSync(0 | '/dev/stdin') returning the test input
 * Limits per test: memory (setMemoryLimit), CPU time (interrupt handler deadline),
 * output (64 KB). Each test gets a brand new WASM module, runtime and context.
 */
import { newQuickJSWASMModule, RELEASE_SYNC, type QuickJSWASMModule } from 'quickjs-emscripten';
import { transform } from 'sucrase';
import { OUTPUT_CAP_BYTES } from './compare';

export type RawTestOutcome = {
  status: 'ok' | 'runtime_error' | 'time_limit' | 'memory_limit' | 'output_limit';
  stdout: string;
  stderr: string;
  timeMs: number | null;
  error?: string;
};

export type JsJob = { language: 'javascript' | 'typescript'; code: string; inputs: string[]; timeLimitMs: number; memoryLimitMb: number };
export type JsJobResult = { compileError?: string; results: RawTestOutcome[] };

const PRELUDE = String.raw`
(function () {
  var stdin = globalThis.__ls_stdin;
  var write = globalThis.__ls_write;
  delete globalThis.__ls_stdin;
  delete globalThis.__ls_write;
  function q(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"; }
  function inspect(v, depth, seen) {
    if (v === null) return 'null';
    var t = typeof v;
    if (t === 'undefined') return 'undefined';
    if (t === 'string') return depth === 0 ? v : q(v);
    if (t === 'number') return Object.is(v, -0) ? '-0' : String(v);
    if (t === 'bigint') return String(v) + 'n';
    if (t === 'boolean') return String(v);
    if (t === 'symbol') return String(v);
    if (t === 'function') return '[Function: ' + (v.name || '(anonymous)') + ']';
    if (seen.indexOf(v) >= 0) return '[Circular]';
    if (v instanceof Error) return (v.stack ? v.name + ': ' + v.message + '\n' + v.stack : v.name + ': ' + v.message).replace(/\n$/, '');
    if (depth > 3) return Array.isArray(v) ? '[Array]' : '[Object]';
    var next = seen.concat([v]);
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      var shown = v.slice(0, 100).map(function (x) { return inspect(x, depth + 1, next); });
      if (v.length > 100) shown.push('... ' + (v.length - 100) + ' more items');
      return '[ ' + shown.join(', ') + ' ]';
    }
    if (v instanceof Map) {
      var mp = [];
      v.forEach(function (val, key) { mp.push(inspect(key, depth + 1, next) + ' => ' + inspect(val, depth + 1, next)); });
      return 'Map(' + v.size + ') {' + (mp.length ? ' ' + mp.join(', ') + ' ' : '') + '}';
    }
    if (v instanceof Set) {
      var st = [];
      v.forEach(function (val) { st.push(inspect(val, depth + 1, next)); });
      return 'Set(' + v.size + ') {' + (st.length ? ' ' + st.join(', ') + ' ' : '') + '}';
    }
    var keys = Object.keys(v);
    if (!keys.length) return '{}';
    return '{ ' + keys.map(function (k) {
      var key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : q(k);
      return key + ': ' + inspect(v[k], depth + 1, next);
    }).join(', ') + ' }';
  }
  function fmt(args) {
    var out = [];
    for (var i = 0; i < args.length; i++) out.push(typeof args[i] === 'string' ? args[i] : inspect(args[i], 0, []));
    return out.join(' ');
  }
  var con = {
    log: function () { write(1, fmt(arguments) + '\n'); },
    info: function () { write(1, fmt(arguments) + '\n'); },
    debug: function () { write(1, fmt(arguments) + '\n'); },
    warn: function () { write(2, fmt(arguments) + '\n'); },
    error: function () { write(2, fmt(arguments) + '\n'); },
    trace: function () { write(2, fmt(arguments) + '\n'); },
  };
  Object.defineProperty(globalThis, 'console', { value: con, writable: true, configurable: true });
  var fsShim = Object.freeze({
    readFileSync: function (fd) {
      if (fd === 0 || fd === '0' || fd === '/dev/stdin') return stdin;
      var e = new Error("ENOENT: file system access is not available in this sandbox (only stdin can be read with readFileSync(0))");
      e.code = 'ENOENT';
      throw e;
    },
  });
  globalThis.require = function require(name) {
    if (name === 'fs' || name === 'node:fs') return fsShim;
    throw new Error("Cannot find module '" + name + "'. This sandbox only provides require('fs').readFileSync(0) for reading input.");
  };
  globalThis.module = { exports: {} };
  globalThis.exports = globalThis.module.exports;
})();
`;

const MODULE_SYNTAX = /^\s*(import\s[\s\S]*?from\s|import\s*['"]|export\s)/m;

/** TypeScript → JavaScript (types stripped) and ES module syntax → require(). */
export function transpile(language: 'javascript' | 'typescript', code: string): { code: string } | { error: string } {
  const usesModules = MODULE_SYNTAX.test(code);
  if (language === 'javascript' && !usesModules) return { code };
  try {
    const transforms: ('typescript' | 'imports')[] = language === 'typescript' ? ['typescript'] : [];
    if (usesModules) transforms.push('imports');
    return { code: transform(code, { transforms, disableESTransforms: true, production: true }).code };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

let warmModule: QuickJSWASMModule | null = null;

/** Called while the worker is idle so the first test does not pay for WASM compilation. */
export async function preloadQuickJS() {
  warmModule = await newQuickJSWASMModule(RELEASE_SYNC);
}

async function freshModule() {
  if (warmModule) {
    const m = warmModule;
    warmModule = null;
    return m;
  }
  return newQuickJSWASMModule(RELEASE_SYNC);
}

function describeError(dumped: unknown): { name: string; text: string } {
  if (dumped && typeof dumped === 'object') {
    const e = dumped as { name?: string; message?: string; stack?: string };
    const name = e.name ?? 'Error';
    const msg = `${name}: ${e.message ?? ''}`;
    if (!e.stack) return { name, text: msg };
    const lines = String(e.stack).trimEnd().split('\n');
    const stack = lines.length > 12 ? [...lines.slice(0, 12), `    ... ${lines.length - 12} more frames`].join('\n') : lines.join('\n');
    return { name, text: `${msg}\n${stack}` };
  }
  return { name: 'Error', text: `Uncaught ${String(dumped)}` };
}

export async function runOneJs(code: string, input: string, timeLimitMs: number, memoryLimitMb: number): Promise<RawTestOutcome> {
  const QuickJS = await freshModule();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(Math.max(8, memoryLimitMb) * 1024 * 1024);
  runtime.setMaxStackSize(1024 * 1024);
  let outBytes = 0;
  let outputExceeded = false;
  let timedOut = false;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const start = performance.now();
  const deadline = Date.now() + timeLimitMs;
  runtime.setInterruptHandler(() => {
    if (outputExceeded) return true;
    if (Date.now() > deadline) {
      timedOut = true;
      return true;
    }
    return false;
  });
  const vm = runtime.newContext();
  let status: RawTestOutcome['status'] = 'ok';
  let error: string | undefined;
  try {
    const writeFn = vm.newFunction('__ls_write', (streamH, textH) => {
      const stream = vm.getNumber(streamH);
      const text = vm.getString(textH);
      if (outputExceeded) return;
      const remaining = OUTPUT_CAP_BYTES - outBytes;
      if (text.length > remaining) {
        (stream === 2 ? stderr : stdout).push(text.slice(0, Math.max(0, remaining)));
        outBytes = OUTPUT_CAP_BYTES;
        outputExceeded = true;
        return;
      }
      outBytes += text.length;
      (stream === 2 ? stderr : stdout).push(text);
    });
    vm.setProp(vm.global, '__ls_write', writeFn);
    writeFn.dispose();
    const stdinH = vm.newString(input);
    vm.setProp(vm.global, '__ls_stdin', stdinH);
    stdinH.dispose();
    const pre = vm.evalCode(PRELUDE, 'prelude.js');
    if (pre.error) {
      pre.error.dispose();
      throw new Error('Sandbox prelude failed');
    } else pre.value.dispose();

    const res = vm.evalCode(code, 'main.js');
    let uncaught: unknown = null;
    if (res.error) {
      uncaught = vm.dump(res.error);
      res.error.dispose();
    } else {
      res.value.dispose();
      // Let promise jobs (async code) finish within the same deadline.
      for (let i = 0; i < 10_000 && runtime.hasPendingJob(); i++) {
        const jobs = runtime.executePendingJobs(1000);
        if (jobs.error) {
          uncaught = vm.dump(jobs.error);
          jobs.error.dispose();
          break;
        }
      }
    }
    if (uncaught !== null) {
      const { name, text } = describeError(uncaught);
      if (outputExceeded) {
        status = 'output_limit';
        error = 'Output limit exceeded (64 KB).';
      } else if (timedOut || /interrupted/i.test(text)) {
        status = 'time_limit';
        error = `Time limit exceeded (${timeLimitMs} ms).`;
      } else if (/out of memory/i.test(text) || (name === 'InternalError' && /memory/i.test(text))) {
        status = 'memory_limit';
        error = `Memory limit exceeded (${memoryLimitMb} MB).`;
      } else {
        status = 'runtime_error';
        error = text.split('\n')[0];
        stderr.push(text + '\n');
      }
    } else if (outputExceeded) {
      status = 'output_limit';
      error = 'Output limit exceeded (64 KB).';
    }
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/memory|OOM|out of bounds/i.test(msg)) {
      status = 'memory_limit';
      error = `Memory limit exceeded (${memoryLimitMb} MB).`;
    } else {
      status = 'runtime_error';
      error = msg;
    }
  } finally {
    try {
      vm.dispose();
      runtime.dispose();
    } catch {
      /* a runtime that ran out of memory may not dispose cleanly; the whole worker is discarded afterwards */
    }
  }
  return { status, stdout: stdout.join(''), stderr: stderr.join(''), timeMs: Math.round(performance.now() - start), error };
}

export async function runJsJob(job: JsJob): Promise<JsJobResult> {
  const t = transpile(job.language, job.code);
  if ('error' in t) return { compileError: t.error, results: [] };
  const results: RawTestOutcome[] = [];
  for (const input of job.inputs) results.push(await runOneJs(t.code, input, job.timeLimitMs, job.memoryLimitMb));
  return { results };
}
