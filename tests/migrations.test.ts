import { describe, it, expect } from 'vitest';
import { openDb } from '../server/db/client';
import { setupTestApp } from './helpers';

type Col = { table_name: string; column_name: string; data_type: string; is_nullable: string };

async function columns(h: { db: unknown }) {
  const db = h.db as { execute: (q: string) => Promise<{ rows: Col[] }> };
  const r = await db.execute(
    "select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name not like '__drizzle%' order by table_name, column_name",
  );
  return r.rows.map((c) => `${c.table_name}.${c.column_name}:${c.data_type}:${c.is_nullable}`);
}

describe('migrations', () => {
  it('produce exactly the schema defined in TypeScript (run `pnpm db:generate` if this fails)', async () => {
    const migrated = await openDb({ memory: true });
    await migrated.migrate();
    const fromMigrations = await columns(migrated);
    await migrated.close();

    const fresh = await setupTestApp();
    const { dbHandle } = await import('../server/db/client');
    const fromSchema = await columns(dbHandle());
    await fresh.close();

    const missing = fromSchema.filter((c) => !fromMigrations.includes(c));
    const extra = fromMigrations.filter((c) => !fromSchema.includes(c));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });
});
