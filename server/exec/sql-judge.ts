/**
 * SQL judge on a fresh in-memory PGlite (Postgres compiled to WebAssembly).
 * Runs inside a worker thread so a runaway query is stopped by terminating the
 * worker (PGlite runs on one thread, so statement_timeout cannot fire on its own).
 * The database lives in WASM memory only: no host filesystem, no network.
 */
import { PGlite, types } from '@electric-sql/pglite';
import { compareResultSets, displayCell, type SqlField } from './compare';

export type SqlJob = { schemaSql: string; seedSql: string; query: string; solutionSql: string; orderMatters: boolean };

export type SqlJobResult = {
  status: 'accepted' | 'wrong_answer' | 'runtime_error' | 'error';
  message?: string;
  columns?: string[];
  rows?: unknown[][];
  rowCount?: number;
  expectedColumns?: string[];
  timeMs: number;
};

export const SQL_ROW_CAP = 200;

let warm: PGlite | null = null;

export async function preloadPglite() {
  warm = await bootDb();
}

async function bootDb() {
  // Dates and timestamps come back as text so learner and reference values normalize the same way.
  const db = new PGlite({ parsers: { [types.DATE]: (v: string) => v, [types.TIMESTAMP]: (v: string) => v } });
  await db.waitReady;
  return db;
}

type Result = { fields: SqlField[]; rows: unknown[][] };

/** Runs one or more statements and returns the last result that has columns. */
async function lastResult(db: PGlite, sql: string): Promise<Result | null> {
  const results = await db.exec(sql, { rowMode: 'array' });
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];
    if (r.fields.length) return { fields: r.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })), rows: r.rows as unknown[][] };
  }
  return null;
}

function pgMessage(e: unknown) {
  const err = e as { message?: string; position?: string; hint?: string };
  let m = err.message ?? String(e);
  if (err.hint) m += ` (hint: ${err.hint})`;
  return m;
}

export async function runSqlJob(job: SqlJob): Promise<SqlJobResult> {
  const start = performance.now();
  const db = warm ?? (await bootDb());
  warm = null;
  const elapsed = () => Math.round(performance.now() - start);
  try {
    try {
      await db.exec(job.schemaSql);
      if (job.seedSql.trim()) await db.exec(job.seedSql);
    } catch (e) {
      return { status: 'error', message: `The problem's schema could not be loaded: ${pgMessage(e)}`, timeMs: elapsed() };
    }
    // The reference result is computed first, inside a transaction that is rolled back,
    // so the learner's statements cannot influence it and it cannot influence theirs.
    let expected: Result | null;
    try {
      await db.exec('BEGIN');
      expected = await lastResult(db, job.solutionSql);
      await db.exec('ROLLBACK');
    } catch (e) {
      return { status: 'error', message: `The reference solution failed to run: ${pgMessage(e)}`, timeMs: elapsed() };
    }
    if (!expected) return { status: 'error', message: 'The reference solution returns no result set.', timeMs: elapsed() };
    const expectedColumns = expected.fields.map((f) => f.name);

    if (!job.query.trim()) return { status: 'runtime_error', message: 'Write a query first.', expectedColumns, timeMs: elapsed() };
    let learner: Result | null;
    try {
      learner = await lastResult(db, job.query);
    } catch (e) {
      return { status: 'runtime_error', message: pgMessage(e), expectedColumns, timeMs: elapsed() };
    }
    if (!learner) return { status: 'wrong_answer', message: 'Your last statement must return rows (for example a SELECT).', expectedColumns, timeMs: elapsed() };
    const cmp = compareResultSets(learner, expected, job.orderMatters);
    return {
      status: cmp.equal ? 'accepted' : 'wrong_answer',
      message: cmp.equal ? 'Your result matches the expected result.' : cmp.reason,
      columns: learner.fields.map((f) => f.name),
      rows: learner.rows.slice(0, SQL_ROW_CAP).map((r) => r.map(displayCell)),
      rowCount: learner.rows.length,
      expectedColumns,
      timeMs: elapsed(),
    };
  } finally {
    await db.close().catch(() => {});
  }
}
