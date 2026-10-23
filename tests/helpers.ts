import { createRequire } from 'node:module';
import { openDb, setDb } from '../server/db/client';
import * as schema from '../server/db/schema';
import { createApp } from '../server/app';
import { resetRateLimits } from '../server/lib/ratelimit';
import { registerAllJobs } from '../server/jobs/register';

process.env.NODE_ENV = 'test';

let schemaSql: string[] | null = null;

/** SQL for the current TypeScript schema (so tests never depend on generated migration files). */
async function currentSchemaSql() {
  if (schemaSql) return schemaSql;
  const require = createRequire(import.meta.url);
  const { generateDrizzleJson, generateMigration } = require('drizzle-kit/api');
  const empty = generateDrizzleJson({}, undefined, undefined, 'snake_case');
  const cur = generateDrizzleJson(schema, empty.id, undefined, 'snake_case');
  schemaSql = (await generateMigration(empty, cur)) as string[];
  // drizzle-kit adds an enumerable Array.prototype.random; remove it so it can't leak into code under test.
  delete (Array.prototype as unknown as Record<string, unknown>).random;
  return schemaSql;
}

export async function setupTestApp() {
  const h = await openDb({ memory: true });
  const db = h.db as unknown as { execute: (q: string) => Promise<unknown> };
  for (const stmt of await currentSchemaSql()) await db.execute(stmt);
  setDb(h);
  registerAllJobs();
  resetRateLimits();
  const app = createApp();
  return { app, close: () => h.close() };
}

type App = ReturnType<typeof createApp>;

/** A tiny browser-like client: keeps the session cookie between requests. */
export function client(app: App) {
  let cookie = '';
  async function request(method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = { origin: 'http://localhost:5317' };
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) {
      const m = set.match(/ls_session=([^;]*)/);
      if (m) cookie = m[1] ? `ls_session=${m[1]}` : '';
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json };
  }
  return {
    get: (p: string) => request('GET', p),
    post: (p: string, b?: unknown) => request('POST', p, b ?? {}),
    put: (p: string, b?: unknown) => request('PUT', p, b ?? {}),
    patch: (p: string, b?: unknown) => request('PATCH', p, b ?? {}),
    del: (p: string) => request('DELETE', p),
    get cookie() {
      return cookie;
    },
    set cookie(v: string) {
      cookie = v;
    },
  };
}

export async function registerUser(app: App, name: string, email: string, password = 'correct-horse-42') {
  const c = client(app);
  const r = await c.post('/api/auth/register', { name, email, password });
  if (r.status !== 201) throw new Error(`register failed: ${JSON.stringify(r.body)}`);
  return Object.assign(c, { userId: r.body.userId as string });
}
