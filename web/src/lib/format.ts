const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return formatDate(d);
}

export function formatDate(iso: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  return formatDate(iso, { dateStyle: 'medium', timeStyle: 'short' });
}

export function dueLabel(iso: string | null | undefined): { text: string; tone: 'danger' | 'warning' | 'neutral' } {
  if (!iso) return { text: 'No deadline', tone: 'neutral' };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return { text: `Overdue · ${timeAgo(iso)}`, tone: 'danger' };
  if (ms < 86400_000 * 2) return { text: `Due ${timeAgo(iso)}`, tone: 'warning' };
  return { text: `Due ${formatDate(iso)}`, tone: 'neutral' };
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

export function plural(n: number, word: string, pluralWord?: string) {
  return `${n} ${n === 1 ? word : (pluralWord ?? `${word}s`)}`;
}

/** Converts a datetime-local input value to ISO and back. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
export function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}
