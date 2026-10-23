/**
 * Calendar events derived from the workspace agenda, and RFC 5545 (iCalendar) serialization.
 * The same EventSpec feeds the ICS subscription and the Google / Microsoft push sync, so all
 * three show identical titles, times and links.
 */
import type { CalendarItem } from '../workspace/routes';
import { sha256 } from '../../lib/crypto';

export const CALENDAR_TYPES = ['task', 'assignment', 'assessment', 'interview', 'mentor_session', 'milestone'] as const;
export type CalendarType = (typeof CALENDAR_TYPES)[number];

export const TYPE_LABELS: Record<CalendarType, string> = {
  task: 'Task',
  assignment: 'Assignment',
  assessment: 'Assessment',
  interview: 'Interview',
  mentor_session: 'Mentor session',
  milestone: 'Milestone',
};

export const CALENDAR_NAME = 'LearnSphere Nexus';
/** The window shared by the feed and the push sync. */
export const WINDOW_PAST_DAYS = 30;
export const WINDOW_FUTURE_DAYS = 180;

export function syncWindow(now = new Date()) {
  return { from: new Date(now.getTime() - WINDOW_PAST_DAYS * 86400_000), to: new Date(now.getTime() + WINDOW_FUTURE_DAYS * 86400_000) };
}

export type EventSpec = {
  /** Stable key of the source item, for example "task-<uuid>". */
  key: string;
  uid: string;
  type: CalendarType;
  summary: string;
  description: string;
  url: string;
  start: Date;
  end: Date;
  /** Meetings block time; deadlines are shown as free so they do not mark you busy. */
  busy: boolean;
};

const DEADLINE_MINUTES = 30;
const MENTOR_SESSION_MINUTES = 30;
const INTERVIEW_DEFAULT_MINUTES = 45;

export function itemKey(item: Pick<CalendarItem, 'type' | 'id'>) {
  return `${item.type}-${item.id}`;
}

export function toEventSpec(item: CalendarItem, appUrl: string): EventSpec {
  const start = new Date(item.at);
  let minutes = DEADLINE_MINUTES;
  let busy = false;
  if (item.type === 'interview') {
    const m = /(\d+)\s*min/.exec(item.detail ?? '');
    minutes = m ? Math.min(Math.max(Number(m[1]), 5), 600) : INTERVIEW_DEFAULT_MINUTES;
    busy = true;
  } else if (item.type === 'mentor_session') {
    minutes = MENTOR_SESSION_MINUTES;
    busy = true;
  }
  const isDeadline = !busy;
  const base = appUrl.replace(/\/+$/, '');
  const url = /^https?:\/\//.test(item.link) ? item.link : `${base}${item.link.startsWith('/') ? '' : '/'}${item.link}`;
  const prefix = item.done ? 'Done: ' : isDeadline && item.type !== 'task' ? 'Due: ' : '';
  const summary = `${prefix}${item.title}`.slice(0, 250);
  const lines = [item.detail || TYPE_LABELS[item.type]];
  if (item.done) lines.push('Marked as done.');
  lines.push('', `Open in LearnSphere Nexus: ${url}`);
  return {
    key: itemKey(item),
    uid: `${itemKey(item)}@learnsphere`,
    type: item.type,
    summary,
    description: lines.join('\n'),
    url,
    start,
    end: new Date(start.getTime() + minutes * 60_000),
    busy,
  };
}

export function specHash(spec: EventSpec) {
  return sha256(JSON.stringify([spec.summary, spec.description, spec.url, spec.start.toISOString(), spec.end.toISOString(), spec.busy]));
}

// ---------- RFC 5545 serialization ----------

/** Escapes a TEXT value (RFC 5545 section 3.3.11). */
export function escapeText(s: string) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Folds a content line so no physical line exceeds 75 octets (UTF-8 safe), joined with CRLF + space. */
export function foldLine(line: string) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75; // first line 75 octets, continuation lines 74 + the leading space
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never split inside a multi-byte UTF-8 sequence (continuation bytes are 10xxxxxx).
    while (end < bytes.length && end > start && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74;
  }
  return parts.join('\r\n ');
}

/** UTC date-time in basic format, for example 20261023T140000Z. */
export function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildIcs(specs: EventSpec[], opts: { now?: Date } = {}) {
  const now = icsDate(opts.now ?? new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LearnSphere Nexus//Calendar Feed 1.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(CALENDAR_NAME)}`,
    `X-WR-CALDESC:${escapeText('Deadlines, interviews and sessions from LearnSphere Nexus. Read-only: edit items in LearnSphere.')}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const s of specs) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(s.start)}`,
      `DTEND:${icsDate(s.end)}`,
      `SUMMARY:${escapeText(s.summary)}`,
      `DESCRIPTION:${escapeText(s.description)}`,
      `URL:${s.url}`,
      `CATEGORIES:${escapeText(TYPE_LABELS[s.type])}`,
      'STATUS:CONFIRMED',
      `TRANSP:${s.busy ? 'OPAQUE' : 'TRANSPARENT'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
