export type NormalizedJob = {
  externalId: string;
  title: string;
  company: string;
  location: string | null;
  url: string; // original listing / apply link, never altered
  tags: string[];
  description: string | null; // plain text, trimmed
  publishedAt: Date | null;
  expiresAt: Date | null;
};

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type FeedAdapter = {
  id: 'jobicy' | 'himalayas' | 'remotive';
  label: string;
  homepage: string;
  /** Minimum time between two fetches. */
  minIntervalMs: number;
  /** Maximum fetches in any rolling 24 hours. */
  maxPerDay: number;
  terms: string;
  applyLabel: string;
  endpoint: () => string;
  parse: (json: unknown) => NormalizedJob[];
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: '-', mdash: '-', hellip: '...', bull: '-' };

/** HTML → plain text (we never render feed HTML). Keeps paragraph and list breaks. */
export function htmlToText(html: string | null | undefined, max = 4000): string | null {
  if (!html) return null;
  const text = String(html)
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*\/\s*(p|div|h[1-6]|ul|ol|li|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16) || 32);
      if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10) || 32);
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max).trimEnd()}...` : text;
}

export function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v); // unix seconds or ms
  const d = new Date(String(v).includes('T') || /\d{4}-\d{2}-\d{2} /.test(String(v)) ? String(v).replace(' ', 'T') : String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '');
export const strArr = (v: unknown, max = 12): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [])
    .map((x) => str(x, 60))
    .filter(Boolean)
    .slice(0, max);
export const isHttpUrl = (u: string) => /^https?:\/\/[^\s]+$/i.test(u);
