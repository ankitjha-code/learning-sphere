import { z } from 'zod';
import type { Ctx } from '../../lib/context';

export const pageParams = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

export function offsetOf(p: { page: number; pageSize: number }) {
  return (p.page - 1) * p.pageSize;
}

/** Escape user input for ILIKE patterns. */
export function likePattern(q: string) {
  return `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
}

/** Optional ISO date / date-time from a query string. */
export const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date.')
  .transform((v) => new Date(v))
  .optional();

/** RFC 4180 CSV with spreadsheet formula-injection protection. */
export function toCsv(headers: string[], rows: unknown[][], preface: string[] = []): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [...preface.map((p) => `# ${p.replace(/[\r\n]+/g, ' ')}`), headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))];
  return lines.join('\r\n') + '\r\n';
}

export function csvResponse(c: Ctx, filename: string, csv: string) {
  c.header('content-type', 'text/csv; charset=utf-8');
  c.header('content-disposition', `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
  return c.body(csv);
}
