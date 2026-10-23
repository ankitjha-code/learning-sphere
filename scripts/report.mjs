// One command to produce reports/test-report/index.html:
//   1. production build (skipped with --no-build)
//   2. automated server checks (Vitest, JSON)
//   3. required journeys + accessibility scans (Playwright, JSON)
//   4. walkthrough scenarios with screenshots (Playwright report project)
//   5. page gallery
//   6. assemble the HTML
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve('reports/.data');
const args = new Set(process.argv.slice(2));
const run = (cmd, a, env = {}) => {
  console.log(`\n> ${cmd} ${a.join(' ')}`);
  const r = spawnSync(cmd, a, { stdio: 'inherit', env: { ...process.env, ...env } });
  return r.status ?? 1;
};

if (!args.has('--keep-data')) fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });

if (!args.has('--no-build')) run('pnpm', ['build']);
if (!args.has('--no-api')) run('npx', ['vitest', 'run', '--reporter=default', '--reporter=json', `--outputFile.json=${path.join(DATA, 'vitest.json')}`]);
if (!args.has('--no-e2e')) run('npx', ['playwright', 'test', '-c', 'playwright.config.ts', '--reporter=list,json'], { PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(DATA, 'e2e.json'), E2E_LIVE_AI: 'false' });
// Each scenario file runs on its own fresh server and database (how each file was validated).
if (!args.has('--no-scenarios')) {
  const files = fs.readdirSync('e2e/report').filter((f) => f.endsWith('.spec.ts')).sort();
  for (const f of files) run('npx', ['playwright', 'test', '-c', 'playwright.report.config.ts', `e2e/report/${f}`]);
}

if (!args.has('--no-gallery')) {
  const port = '4429';
  const server = spawn('node', ['scripts/e2e-server.mjs'], { stdio: 'ignore', env: { ...process.env, E2E_PORT: port, CODE_EXEC_DOCKER: 'auto' } });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${base}/api/system/health`);
      if (r.ok) break;
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  run('node', ['scripts/report-gallery.mjs'], { BASE_URL: base });
  server.kill('SIGTERM');
}

// Environment facts for the report (no secrets).
const env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const has = (k) => new RegExp(`^${k}=.+`, 'm').test(env) || !!process.env[k];
const model = /^GEMINI_MODEL=(.+)$/m.exec(env)?.[1]?.trim() ?? 'gemini-3.5-flash-lite';
let docker = false;
try {
  docker = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
} catch {
  docker = false;
}
fs.writeFileSync(
  path.join(DATA, 'meta.json'),
  JSON.stringify(
    {
      environment: 'production build of the app on a fresh, temporary database with demo data, opened in Chromium at 1440 x 900',
      ai: has('GEMINI_API_KEY') ? `live Google Gemini free tier (model ${model}) used in the AI scenarios; the regular journey tests run without AI on purpose` : 'no AI provider configured, so AI features show their honest "not configured" state',
      exec: docker ? 'JavaScript, TypeScript and SQL in built-in sandboxes; Python through the local Docker sandbox' : 'JavaScript, TypeScript and SQL in built-in sandboxes (Docker not available, so other languages are shown as unavailable)',
    },
    null,
    2,
  ),
);

run('node', ['scripts/build-report.mjs']);
