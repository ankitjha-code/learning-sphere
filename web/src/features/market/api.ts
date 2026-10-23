// Types mirroring /api/market responses.

export type Dataset = 'live' | 'sample' | 'none';
export type Scope = 'all' | 'public' | 'platform';
export type SourceKind = 'public_feed' | 'platform' | 'sample';

export type BasedOn = {
  dataset: Dataset;
  postings: number;
  sources: { source: string; label: string; kind: SourceKind; homepage: string | null; postings: number }[];
  dateRange: { postedFrom: string | null; postedTo: string | null; fetchedFrom: string | null; fetchedTo: string | null };
  window: { days: number; from: string; to: string };
  generatedAt: string;
};

export type Freshness = { status: 'current' | 'historical' | 'none' | 'sample'; lastSuccessfulFetchAt: string | null; message: string };
export type EmptyReason = { code: 'feeds_disabled' | 'never_synced' | 'no_recent_postings'; message: string } | null;
export type Trend = { direction: 'up' | 'down' | 'steady'; changePoints: number; significant: boolean };

export type SkillShare = { slug: string; name: string; postings: number; share: number; previous: { postings: number; share: number } | null; trend: Trend | null };
export type Week = { weekStart: string; weekEnd: string; postings: number; partial: boolean; bySource: Record<string, number> };

export type Overview = {
  status: 'ok' | 'empty';
  dataset: Dataset;
  scope: Scope;
  window: { days: number; from: string; to: string; previous: { from: string; to: string } };
  emptyReason: EmptyReason;
  basedOn: BasedOn;
  freshness: Freshness;
  summary: { postings: number; remotePostings: number; remoteShare: number; skillsDetected: number } | null;
  skills: SkillShare[];
  trend: { available: boolean; reason: string | null; minPostingsPerPeriod: number; currentPostings: number; previousPostings: number };
  roles: { role: string; label: string; postings: number; share: number }[];
  companies: { name: string; postings: number; share: number }[];
  weekly: Week[];
  caveats: string[];
};

export type LearningLinks = { topics: { title: string; trackTitle: string; link: string }[]; practice: { title: string; difficulty: string; link: string }[] };

export type SkillDetail = {
  status: 'ok' | 'empty';
  dataset: Dataset;
  window: { days: number; from: string; to: string };
  skill: { slug: string; name: string };
  summary: { postings: number; mentions: number; share: number } | null;
  weekly: (Week & { mentions: number; share: number | null; enoughData: boolean })[];
  roles: { role: string; label: string; postings: number; shareOfSkillPostings: number; roleTotal: number; shareOfRole: number }[];
  cooccurring: { slug: string; name: string; postings: number; shareOfSkillPostings: number }[];
  learning: LearningLinks;
  emptyReason: EmptyReason;
  basedOn: BasedOn;
  freshness: Freshness;
  caveats: string[];
};

export type MeStatus = 'verified' | 'demonstrated' | 'learning' | 'self_reported' | 'none';
export type MeVsMarket = {
  status: 'ok' | 'empty';
  dataset: Dataset;
  items: { slug: string; name: string; marketShare: number; marketPostings: number; status: MeStatus; revisionDue: boolean; evidenceCount: number; lastEvidenceAt: string | null; learning: LearningLinks }[];
  counts: Record<MeStatus, number>;
  emptyReason: EmptyReason;
  basedOn: BasedOn;
  caveats: string[];
};

export type SourcesReport = {
  window: { days: number; from: string; to: string };
  sources: {
    source: string;
    label: string;
    kind: SourceKind;
    homepage: string | null;
    attribution: string;
    terms: string;
    enabled: boolean;
    backgroundSync?: boolean;
    lastSuccessAt?: string | null;
    lastAttemptAt?: string | null;
    lastStatus?: string | null;
    lastError?: string | null;
    nextAllowedAt?: string | null;
    postingsInWindow: number;
    cachedPostings: number | null;
  }[];
  snapshots: { lastRunAt: string | null; lastRunTrigger: string | null; postingsAllTime: number; method: string };
  basedOn: BasedOn;
  freshness: Freshness;
  caveats: string[];
};

export type SyncResult = { source: string; status: 'ok' | 'error' | 'skipped_rate_limit' | 'disabled'; fetched: number; message?: string };
export type SnapshotResult = { runDay: string; postingsScanned: number; newPostings: number; rowsWritten: number };

export const STATUS_LABEL: Record<MeStatus, string> = {
  verified: 'Verified',
  demonstrated: 'Demonstrated',
  learning: 'Learning',
  self_reported: 'Self-rated only',
  none: 'No evidence yet',
};

export const pctText = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayYearFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "21 Oct to 23 Oct 2026" (or a single day). */
export function rangeText(from: string | null, to: string | null) {
  if (!from || !to) return null;
  const a = new Date(from);
  const b = new Date(to);
  if (a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)) return dayYearFmt.format(b);
  return `${a.getUTCFullYear() === b.getUTCFullYear() ? dayFmt.format(a) : dayYearFmt.format(a)} to ${dayYearFmt.format(b)}`;
}

export const shortDay = (iso: string) => dayFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

export function listText(items: string[]) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
