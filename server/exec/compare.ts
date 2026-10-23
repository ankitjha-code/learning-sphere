/**
 * Output and result-set comparison shared by every sandbox. Kept free of Node/DB
 * imports so it can run inside worker threads as well as the main thread.
 */

/** Line endings normalized, trailing whitespace trimmed per line, trailing blank lines removed. */
export function normalizeOutput(s: string): string {
  const lines = s.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t\f\v]+$/, ''));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

export function outputsMatch(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}

export const OUTPUT_CAP_BYTES = 64 * 1024;

/** Truncates to the output cap (by UTF-16 length, close enough for display) and reports whether it did. */
export function capOutput(s: string, cap = OUTPUT_CAP_BYTES): { text: string; truncated: boolean } {
  if (s.length <= cap) return { text: s, truncated: false };
  return { text: s.slice(0, cap), truncated: true };
}

// ---------- SQL result sets ----------

// Postgres type OIDs that hold numbers (int2, int4, int8, oid, float4, float8, numeric, money).
const NUMERIC_OIDS = new Set([20, 21, 23, 26, 700, 701, 1700, 790]);
const DATE_OID = 1082;

export type SqlField = { name: string; dataTypeID: number };

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Turns one cell into a canonical string (or null) so equivalent values compare equal. */
export function normalizeCell(value: unknown, field?: SqlField): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || (field && NUMERIC_OIDS.has(field.dataTypeID) && typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)))) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(n);
    // Six decimal places absorbs float noise (0.1 + 0.2) and numeric scale differences (120.00 vs 120).
    return String(Number(n.toFixed(6)));
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return 'invalid date';
    const dateOnly = field?.dataTypeID === DATE_OID || (value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0);
    const d = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
    return dateOnly ? d : `${d} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
  }
  if (typeof value === 'string') {
    // Timestamps rendered as text ("2024-01-05T10:00:00.000Z" or "2024-01-05 10:00:00") compare like dates.
    const m = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]00(:?00)?)?$/);
    if (m) return m[2] === '00:00:00' ? m[1] : `${m[1]} ${m[2]}`;
    return value.replace(/\s+$/, '');
  }
  if (value instanceof Uint8Array) return `\\x${Buffer.from(value).toString('hex')}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** A JSON-safe copy of a cell for display (dates as ISO strings, bigints as strings). */
export function displayCell(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'Invalid date' : value.toISOString();
  if (value instanceof Uint8Array) return `\\x${Buffer.from(value).toString('hex')}`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

export type SqlCompare = { equal: boolean; reason?: string };

/**
 * Compares a learner result set with the expected one.
 * - Same number of columns, names compared case-insensitively.
 * - Values normalized (numbers, dates, nulls, trailing spaces).
 * - Row order only matters when `orderMatters` is true; otherwise a multiset compare.
 * The `reason` never includes expected values (only counts and column names, which are shown anyway).
 */
export function compareResultSets(
  learner: { fields: SqlField[]; rows: unknown[][] },
  expected: { fields: SqlField[]; rows: unknown[][] },
  orderMatters: boolean,
): SqlCompare {
  const ln = learner.fields.map((f) => f.name.toLowerCase());
  const en = expected.fields.map((f) => f.name.toLowerCase());
  if (ln.length !== en.length) {
    return { equal: false, reason: `Expected ${en.length} column${en.length === 1 ? '' : 's'} (${expected.fields.map((f) => f.name).join(', ')}) but your query returned ${ln.length}.` };
  }
  for (let i = 0; i < en.length; i++) {
    if (ln[i] !== en[i]) return { equal: false, reason: `Column ${i + 1} should be named "${expected.fields[i].name}" but is "${learner.fields[i].name}". Use AS to rename it.` };
  }
  if (learner.rows.length !== expected.rows.length) {
    return { equal: false, reason: `Expected ${expected.rows.length} row${expected.rows.length === 1 ? '' : 's'} but your query returned ${learner.rows.length}.` };
  }
  const key = (row: unknown[], fields: SqlField[]) => JSON.stringify(row.map((v, i) => normalizeCell(v, fields[i])));
  const lk = learner.rows.map((r) => key(r, learner.fields));
  const ek = expected.rows.map((r) => key(r, expected.fields));
  if (orderMatters) {
    for (let i = 0; i < ek.length; i++) {
      if (lk[i] !== ek[i]) {
        const sameSet = [...lk].sort().join('\n') === [...ek].sort().join('\n');
        return { equal: false, reason: sameSet ? 'The rows are right but the order is not. Check your ORDER BY.' : `Row ${i + 1} does not match the expected result.` };
      }
    }
    return { equal: true };
  }
  const a = [...lk].sort();
  const b = [...ek].sort();
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return { equal: false, reason: 'Some rows do not match the expected result.' };
  return { equal: true };
}
