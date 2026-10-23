// Starts the production build on a fresh, temporary embedded database with demo data for E2E tests.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const port = process.env.E2E_PORT ?? '4417';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-e2e-db-'));
// AI keys from .env are ignored unless the run opts in (the regular E2E suite must not depend on a live provider).
const liveAi = process.env.E2E_LIVE_AI === 'true';
const noAi = liveAi ? {} : Object.fromEntries(['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'CF_API_TOKEN', 'MISTRAL_API_KEY', 'AZURE_OPENAI_API_KEY', 'OLLAMA_BASE_URL'].map((k) => [k, '']));
const child = spawn('node', ['dist/server/index.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...noAi,
    NODE_ENV: 'production',
    PORT: port,
    APP_URL: `http://127.0.0.1:${port}`,
    APP_SECRET: 'e2e-only-secret-not-for-production',
    PGLITE_DIR: dir,
    SEED_DEMO: 'true',
    JOB_FEED_SYNC: 'false',
    CODE_EXEC_DOCKER: process.env.CODE_EXEC_DOCKER ?? 'false',
  },
});
const stop = () => {
  child.kill('SIGTERM');
  fs.rmSync(dir, { recursive: true, force: true });
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => {
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
