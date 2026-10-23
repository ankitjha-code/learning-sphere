import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

export type Schema = typeof schema;
export type DB = PgDatabase<PgQueryResultHKT, Schema>;

type Handle = { db: DB; kind: 'pglite' | 'postgres'; close: () => Promise<void>; migrate: () => Promise<void> };

let current: Handle | null = null;

function migrationsFolder() {
  // Works from source (server/db) and from the bundle (dist/server) where migrations are copied alongside.
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [path.join(here, 'migrations'), path.join(here, 'db/migrations'), path.resolve('server/db/migrations')]) {
    if (fs.existsSync(path.join(candidate, 'meta/_journal.json'))) return candidate;
  }
  throw new Error('Database migrations folder not found');
}

export async function openDb(opts: { url?: string; pgliteDir?: string; memory?: boolean } = {}): Promise<Handle> {
  if (opts.url) {
    const pool = new pg.Pool({
      connectionString: opts.url,
      max: 10,
      ssl: /sslmode=require|neon\.tech|azure\.com|supabase|aivencloud|prisma\.io/.test(opts.url) ? { rejectUnauthorized: false } : undefined,
    });
    const db = drizzlePg(pool, { schema, casing: 'snake_case' }) as unknown as DB;
    return {
      db,
      kind: 'postgres',
      close: () => pool.end(),
      migrate: () => migratePg(db as never, { migrationsFolder: migrationsFolder() }),
    };
  }
  let client: PGlite;
  if (opts.memory) client = new PGlite();
  else {
    const dir = path.resolve(opts.pgliteDir ?? './data/pglite');
    fs.mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  await client.waitReady;
  const db = drizzlePglite(client, { schema, casing: 'snake_case' }) as unknown as DB;
  return {
    db,
    kind: 'pglite',
    close: () => client.close(),
    migrate: () => migratePglite(db as never, { migrationsFolder: migrationsFolder() }),
  };
}

export function setDb(h: Handle) {
  current = h;
}

export function dbHandle(): Handle {
  if (!current) throw new Error('Database not initialised');
  return current;
}

/** Proxy so modules can `import { db }` and always reach the active connection. */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    const target = dbHandle().db as unknown as Record<string | symbol, unknown>;
    const value = target[prop];
    return typeof value === 'function' ? (value as Function).bind(target) : value;
  },
});

export { schema };
