/**
 * Docker sandbox for compiled/interpreted languages (Python, C, C++, Java, Go, Rust).
 *
 * One container per submission: source and every test input arrive on stdin, the
 * program is compiled once and each test runs with its own `timeout`. The container
 * has no network, a read-only root filesystem, a small /tmp tmpfs, memory/CPU/pids
 * limits, an unprivileged user, no capabilities and no privilege escalation.
 *
 * Inputs stay in shell variables (never written to disk), so one test cannot read
 * another test's input. Results are framed with a per-run random nonce and base64,
 * so program output cannot be confused with the driver's own markers.
 *
 * Images are never pulled during a learner's run: a language is available only when
 * its image is already present. Admins pull images via the 'exec.pull_image' job.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import type { ExecLanguage } from './index';
import { DOCKER_RECIPES, type DockerRecipe } from './languages';
import type { RawTestOutcome } from './quickjs-sandbox';
import { OUTPUT_CAP_BYTES } from './compare';

const STDERR_CAP = 16 * 1024;

type CmdResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

function runCmd(args: string[], opts: { input?: string; timeoutMs: number; maxBytes?: number; onLine?: (line: string) => void }): Promise<CmdResult> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ code: null, stdout: '', stderr: (e as Error).message, timedOut: false });
      return;
    }
    const max = opts.maxBytes ?? 4 * 1024 * 1024;
    let out = '';
    let err = '';
    let timedOut = false;
    let partial = '';
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      const s = d.toString('utf8');
      if (out.length < max) out += s.slice(0, max - out.length);
      if (opts.onLine) {
        partial += s;
        const lines = partial.split(/\r?\n|\r/);
        partial = lines.pop() ?? '';
        for (const l of lines) if (l.trim()) opts.onLine(l);
      }
    });
    child.stderr.on('data', (d: Buffer) => {
      if (err.length < 64 * 1024) err += d.toString('utf8');
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: null, stdout: out, stderr: err + e.message, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: out, stderr: err, timedOut });
    });
    child.stdin.on('error', () => {});
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

// ---------- availability ----------

let reachCache: { at: number; ok: boolean; error?: string } | null = null;

export async function dockerReachable(force = false): Promise<{ ok: boolean; error?: string }> {
  if (!force && reachCache && Date.now() - reachCache.at < (reachCache.ok ? 60_000 : 20_000)) return reachCache;
  const r = await runCmd(['info', '--format', '{{.ServerVersion}}'], { timeoutMs: 6000 });
  const ok = r.code === 0 && !!r.stdout.trim();
  const error = ok ? undefined : r.timedOut ? 'docker info timed out' : (r.stderr.trim().split('\n').pop() ?? 'docker is not installed') || 'docker is not installed';
  reachCache = { at: Date.now(), ok, error };
  return reachCache;
}

const imageCache = new Map<string, { at: number; present: boolean }>();

export async function imagePresent(image: string, force = false): Promise<boolean> {
  const c = imageCache.get(image);
  if (!force && c && Date.now() - c.at < 30_000) return c.present;
  const r = await runCmd(['image', 'inspect', '--format', '{{.Id}}', image], { timeoutMs: 8000 });
  const present = r.code === 0;
  imageCache.set(image, { at: Date.now(), present });
  return present;
}

// ---------- image pulls (admin only, never during a learner's run) ----------

export type PullStatus = { image: string; status: 'idle' | 'pulling' | 'succeeded' | 'failed'; startedAt?: string; finishedAt?: string; message?: string; lastLines: string[] };

const pulls = new Map<string, PullStatus>();

export function pullStatus(image: string): PullStatus {
  return pulls.get(image) ?? { image, status: 'idle', lastLines: [] };
}

export async function pullImage(image: string): Promise<PullStatus> {
  const existing = pulls.get(image);
  if (existing?.status === 'pulling') return existing;
  const st: PullStatus = { image, status: 'pulling', startedAt: new Date().toISOString(), lastLines: [] };
  pulls.set(image, st);
  const r = await runCmd(['pull', image], {
    timeoutMs: 30 * 60_000,
    onLine: (l) => {
      st.lastLines.push(l.slice(0, 200));
      if (st.lastLines.length > 12) st.lastLines.shift();
    },
  });
  st.finishedAt = new Date().toISOString();
  if (r.code === 0) {
    st.status = 'succeeded';
    st.message = `Pulled ${image}.`;
  } else {
    st.status = 'failed';
    st.message = r.timedOut ? 'The pull timed out after 30 minutes.' : (r.stderr.trim().split('\n').pop() ?? 'docker pull failed');
  }
  imageCache.delete(image);
  return st;
}

// ---------- running code ----------

/** POSIX sh driver (works with busybox and dash). Reads the framed payload from stdin. */
const DRIVER = String.raw`
set -u
umask 077
IFS= read -r NONCE
IFS= read -r SRC
IFS= read -r N
i=0
while [ "$i" -lt "$N" ]; do
  IFS= read -r line || line=""
  eval "IN_$i=\$line"
  i=$((i+1))
done
exec 0</dev/null
mkdir -p /tmp/src /tmp/run || exit 70
cd /tmp/src || exit 70
printf '%s' "$SRC" | base64 -d > "$LS_FILE"
SRC=""
now() { read -r up rest < /proc/uptime; echo "${'$'}{up%.*}${'$'}{up#*.}0"; }
if [ -n "$LS_COMPILE" ]; then
  timeout -s KILL "$LS_CT" sh -c "$LS_COMPILE" > /tmp/run/c.out 2>&1
  cec=$?
  echo "@@$NONCE COMPILE $cec"
  head -c 65536 /tmp/run/c.out | base64 | tr -d '\n'; echo
  if [ "$cec" -ne 0 ]; then echo "@@$NONCE END"; exit 0; fi
fi
i=0
while [ "$i" -lt "$N" ]; do
  eval "line=\$IN_$i"
  rm -f /tmp/run/o /tmp/run/e
  t0=$(now)
  printf '%s' "$line" | base64 -d | timeout -s KILL "$LS_TL" sh -c "exec $LS_RUN" > /tmp/run/o 2> /tmp/run/e
  ec=$?
  t1=$(now)
  osz=$(wc -c < /tmp/run/o | tr -d ' ')
  echo "@@$NONCE TEST $i $ec $((t1 - t0)) $osz"
  head -c 65536 /tmp/run/o | base64 | tr -d '\n'; echo
  head -c 16384 /tmp/run/e | base64 | tr -d '\n'; echo
  i=$((i+1))
done
echo "@@$NONCE END"
`;

const TIME_FACTOR: Partial<Record<ExecLanguage, number>> = { java: 2, go: 1, python: 1.5 };

export type DockerRunResult = { compileError?: string; results: RawTestOutcome[]; error?: string };

export function dockerArgs(recipe: DockerRecipe, name: string, memoryMb: number, tlSec: number) {
  const env: Record<string, string> = {
    HOME: '/tmp',
    LS_FILE: recipe.file,
    LS_COMPILE: recipe.compile ?? '',
    LS_RUN: recipe.run,
    LS_TL: String(tlSec),
    LS_CT: String(recipe.compileTimeoutSec),
    ...recipe.env,
  };
  return [
    'run', '--rm', '-i',
    '--name', name,
    '--network', 'none',
    '--memory', `${memoryMb}m`,
    '--memory-swap', `${memoryMb}m`,
    '--cpus', '1',
    '--pids-limit', '64',
    '--read-only',
    '--tmpfs', '/tmp:rw,exec,size=64m',
    '--user', '65534:65534',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--ulimit', 'nofile=256:256',
    '--log-driver', 'none',
    '-w', '/tmp',
    ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
    '--entrypoint', '/bin/sh',
    recipe.image,
    '-c', DRIVER,
  ];
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s: string | undefined) => (s ? Buffer.from(s.trim(), 'base64').toString('utf8') : '');

export async function runInDocker(language: ExecLanguage, code: string, inputs: string[], timeLimitMs: number, memoryLimitMb: number): Promise<DockerRunResult> {
  const recipe = DOCKER_RECIPES[language];
  if (!recipe) return { results: [], error: `No Docker recipe for ${language}.` };
  const effectiveMs = Math.round(timeLimitMs * (TIME_FACTOR[language] ?? 1));
  const tlSec = Math.max(1, Math.ceil(effectiveMs / 1000));
  const memoryMb = Math.max(64, Math.min(512, memoryLimitMb || 256));
  const nonce = crypto.randomBytes(12).toString('hex');
  const name = `ls-exec-${crypto.randomBytes(6).toString('hex')}`;
  const payload = [nonce, b64(code), String(inputs.length), ...inputs.map(b64)].join('\n') + '\n';
  const budgetMs = 20_000 + recipe.compileTimeoutSec * 1000 + inputs.length * (tlSec * 1000 + 1500);
  const r = await runCmd(dockerArgs(recipe, name, memoryMb, tlSec), { input: payload, timeoutMs: budgetMs, maxBytes: 32 * 1024 * 1024 });
  if (r.timedOut) {
    await runCmd(['rm', '-f', name], { timeoutMs: 15_000 });
  }

  const lines = r.stdout.split('\n');
  const marker = `@@${nonce} `;
  const results: RawTestOutcome[] = [];
  let compileError: string | undefined;
  let ended = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith(marker)) continue;
    const parts = line.slice(marker.length).trim().split(' ');
    if (parts[0] === 'END') {
      ended = true;
      break;
    }
    if (parts[0] === 'COMPILE') {
      const cec = Number(parts[1]);
      const text = unb64(lines[i + 1]);
      i += 1;
      if (cec !== 0) compileError = (cec === 137 ? `Compilation timed out or ran out of memory.\n${text}` : text).trim() || `Compiler exited with code ${cec}.`;
      continue;
    }
    if (parts[0] === 'TEST') {
      const ec = Number(parts[2]);
      const ms = Number(parts[3]);
      const osz = Number(parts[4]);
      const stdout = unb64(lines[i + 1]);
      const stderr = unb64(lines[i + 2]).slice(0, STDERR_CAP);
      i += 2;
      let status: RawTestOutcome['status'] = 'ok';
      let error: string | undefined;
      const killed = ec === 137 || ec === 124 || ec === 143;
      if (killed && ms >= tlSec * 1000 - 100) {
        status = 'time_limit';
        error = `Time limit exceeded (${effectiveMs} ms).`;
      } else if (ec === 137) {
        status = 'memory_limit';
        error = `Killed, most likely for exceeding the memory limit (${memoryMb} MB).`;
      } else if (ec !== 0) {
        status = 'runtime_error';
        error = `Exited with code ${ec}.`;
      } else if (ms > tlSec * 1000) {
        // Wall time includes interpreter/JVM startup, so only the hard limit counts here.
        status = 'time_limit';
        error = `Time limit exceeded (${effectiveMs} ms).`;
      } else if (osz > OUTPUT_CAP_BYTES) {
        status = 'output_limit';
        error = 'Output limit exceeded (64 KB).';
      }
      results.push({ status, stdout, stderr, timeMs: ms, error });
    }
  }
  if (compileError) return { compileError, results: [] };
  if (!ended && results.length < inputs.length) {
    if (r.timedOut) {
      while (results.length < inputs.length) results.push({ status: 'time_limit', stdout: '', stderr: '', timeMs: null, error: 'The sandbox exceeded its total time budget.' });
      return { results };
    }
    const reason = r.stderr.trim().split('\n').slice(-3).join(' ').slice(0, 500);
    return { results, error: reason ? `The Docker sandbox failed: ${reason}` : 'The Docker sandbox stopped before finishing.' };
  }
  return { results };
}
