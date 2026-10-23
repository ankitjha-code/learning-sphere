import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4317),
  APP_URL: z.string().default('http://localhost:5317'),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default('./data/pglite'),
  APP_SECRET: z.string().optional(),
  TRUST_PROXY: bool,

  // Email: HTTP APIs preferred (work on hosts that block SMTP ports)
  EMAIL_FROM: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: bool,

  // Code execution
  CODE_EXEC_DOCKER: z.string().optional(), // "auto" (default) | "true" | "false"
  JUDGE0_URL: z.string().optional(),
  JUDGE0_KEY: z.string().optional(),
  JUDGE0_RAPIDAPI_HOST: z.string().optional(),

  // Job feeds (public APIs, no key)
  JOB_FEEDS: z.string().default('jobicy,himalayas,remotive'),
  JOB_FEED_SYNC: z.string().optional(), // "false" disables background sync

  WORKER_ENABLED: z.string().optional(),
  SEED_DEMO: z.string().optional(),
});

export type Config = z.infer<typeof schema> & { appSecret: Buffer; isProd: boolean; isTest: boolean };

let cached: Config | null = null;

function loadDotEnv() {
  const file = path.resolve('.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, raw] = m;
    if (process.env[k] !== undefined) continue;
    process.env[k] = raw.replace(/^['"]|['"]$/g, '');
  }
}

/** In production APP_SECRET is required. In development a random secret is generated once and kept in ./data. */
function resolveSecret(env: z.infer<typeof schema>): Buffer {
  if (env.APP_SECRET) return crypto.createHash('sha256').update(env.APP_SECRET).digest();
  if (env.NODE_ENV === 'production') throw new Error('APP_SECRET must be set in production (any long random string).');
  if (env.NODE_ENV === 'test') return crypto.createHash('sha256').update('test-secret').digest();
  const file = path.resolve('data/.app-secret');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8').trim()).digest();
}

export function config(): Config {
  if (cached) return cached;
  if (process.env.NODE_ENV !== 'test') loadDotEnv();
  const env = schema.parse(process.env);
  cached = { ...env, appSecret: resolveSecret(env), isProd: env.NODE_ENV === 'production', isTest: env.NODE_ENV === 'test' };
  return cached;
}

export function resetConfigForTests() {
  cached = null;
}
