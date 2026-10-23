/**
 * Job-market insights.
 *
 * Data sources (all real, or clearly labelled sample data):
 * - external_jobs: postings cached from public feeds (Jobicy, Himalayas, Remotive), each with source + fetchedAt.
 * - job_postings: jobs published by employers on this platform ("On this platform"); sample orgs count as sample.
 * - market_sample_postings: demo postings, source 'sample', never mixed with real data.
 *
 * A snapshot run aggregates postings into market_snapshots (one row per posted day and source).
 * Rows are additive and deduplicated by posting key, so history survives after feeds drop postings.
 * Insights read only the snapshots. Every figure is a count of real postings; nothing is estimated.
 */
import crypto from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, lte, max, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { externalJobs, jobFeedRuns, jobPostings, marketSamplePostings, marketSnapshotRuns, marketSnapshots, organizations, questions, skills, topics, tracks } from '../../db/schema';
import { extractSkills, skillName, KNOWN_SKILL_SLUGS } from '../career/extract';
import { ADAPTERS, FEED_IDS, enabledFeeds, feedStatus, syncFeed, type FeedId, type FetchFn, type SyncResult } from '../jobs/feeds';
import { postingSkills } from '../jobs/service';
import type { SkillDnaEntry } from '../learning/skilldna';

// ---------------------------------------------------------------------------------------------
// Sources, roles, constants
// ---------------------------------------------------------------------------------------------

export type MarketSource = FeedId | 'platform' | 'sample';
export type SourceKind = 'public_feed' | 'platform' | 'sample';

export const SOURCE_META: Record<MarketSource, { label: string; kind: SourceKind; homepage: string | null }> = {
  jobicy: { label: ADAPTERS.jobicy.label, kind: 'public_feed', homepage: ADAPTERS.jobicy.homepage },
  himalayas: { label: ADAPTERS.himalayas.label, kind: 'public_feed', homepage: ADAPTERS.himalayas.homepage },
  remotive: { label: ADAPTERS.remotive.label, kind: 'public_feed', homepage: ADAPTERS.remotive.homepage },
  platform: { label: 'On this platform', kind: 'platform', homepage: null },
  sample: { label: 'Sample postings (demo data)', kind: 'sample', homepage: null },
};

const REAL_SOURCES: MarketSource[] = [...FEED_IDS, 'platform'];
/** Public feeds that list remote jobs only. */
const REMOTE_ONLY_BOARDS = new Set<string>(FEED_IDS);

/** Minimum postings in each period before a skill trend is shown. */
export const MIN_POSTINGS_FOR_TREND = 30;
/** Two-proportion z threshold (about 95%) and a minimum absolute change before calling a trend up or down. */
const Z_THRESHOLD = 1.96;
const MIN_CHANGE = 0.02;
/** A successful fetch older than this makes the data "historical". */
const FRESH_MS = 36 * 3600_000;
const DAY_MS = 86400_000;

export type RoleBucket = 'intern' | 'full_stack' | 'frontend' | 'backend' | 'mobile' | 'ml_ai' | 'data' | 'devops' | 'qa' | 'security' | 'software_general' | 'other';

export const ROLE_LABEL: Record<RoleBucket, string> = {
  intern: 'Internship or trainee',
  full_stack: 'Full-stack',
  frontend: 'Frontend',
  backend: 'Backend',
  mobile: 'Mobile',
  ml_ai: 'ML and AI',
  data: 'Data',
  devops: 'DevOps and cloud',
  qa: 'QA and testing',
  security: 'Security',
  software_general: 'Software engineering (general)',
  other: 'Other or non-engineering',
};

/** First matching rule wins. Explicit role words come before technology hints. */
const ROLE_RULES: [RoleBucket, RegExp][] = [
  ['intern', /\b(intern|interns|internship|trainee|apprentice|apprenticeship)\b/i],
  ['full_stack', /\bfull[\s-]?stack\b/i],
  ['frontend', /\b(front[\s-]?end|ui engineer|ui developer|web developer)\b/i],
  ['backend', /\bback[\s-]?end\b/i],
  ['mobile', /\b(mobile|ios|android|flutter|react native)\b/i],
  ['ml_ai', /\b(machine learning|ml|mlops|ai|artificial intelligence|deep learning|llm|llms|nlp|computer vision)\b/i],
  ['data', /\b(data|analytics|analyst|bi|etl|business intelligence)\b/i],
  ['devops', /\b(devops|devsecops|sre|site reliability|platform engineer|infrastructure|cloud engineer|cloud architect|kubernetes)\b/i],
  ['qa', /\b(qa|quality assurance|sdet|test engineer|tester|test automation)\b/i],
  ['security', /\b(security|appsec|penetration|cyber)\b/i],
  ['backend', /\b(api|python|java|golang|node|node\.js|ruby|rails|php|laravel|django|scala|elixir|rust|server[\s-]side)\b|\.net\b|c#/i],
  ['other', /\b(sales|account executive|account manager|customer|support|solutions|marketing|recruit\w*|designer|writer|manager of people)\b/i],
  ['software_general', /\b(software|developer|programmer|coder|engineer|engineering)\b/i],
];

export function classifyRole(title: string): RoleBucket {
  for (const [bucket, re] of ROLE_RULES) if (re.test(title)) return bucket;
  return 'other';
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const dayToDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const addDays = (day: string, n: number) => isoDay(new Date(dayToDate(day).getTime() + n * DAY_MS));
const postingKey = (source: string, id: string) => crypto.createHash('sha1').update(`${source}:${id}`).digest('hex').slice(0, 16);
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

type Counts = Record<string, number>;
const inc = (o: Counts, k: string, by = 1) => {
  o[k] = (o[k] ?? 0) + by;
};
const addAll = (target: Counts, src: Counts | undefined) => {
  for (const [k, v] of Object.entries(src ?? {})) inc(target, k, v);
};
const minD = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a < b ? a : b);
const maxD = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);
const asDate = (v: Date | string | null | undefined) => (v ? new Date(v) : null);

/** The day a posting counts for: its publish date, or its first fetch when the date is missing or in the future. */
export function postingDay(postedAt: Date | null, fetchedAt: Date) {
  const t = postedAt && postedAt.getTime() <= fetchedAt.getTime() + DAY_MS ? postedAt : fetchedAt;
  return isoDay(t);
}

// ---------------------------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------------------------

type RawPosting = {
  source: MarketSource;
  key: string;
  postedAt: Date | null;
  fetchedAt: Date;
  /** Computed lazily, only for postings not counted before. */
  features: () => { remote: boolean; role: RoleBucket; company: string; skills: string[] };
};

/**
 * Everyday words that the career extractor accepts as skill aliases but that are too vague to count
 * as a skill mention in market statistics (for example "security" in a company boilerplate line).
 * A skill counts only if at least one matched phrase is more specific than these.
 */
export const GENERIC_ALIASES = new Set(['security', 'collaborate', 'collaboration', 'cross-functional', 'communicate', 'monitoring', 'logging', 'cloud', 'scalable', 'testing', 'documentation', 'http', 'troubleshooting', 'containers', 'node']);

/** Skill slugs mentioned in a posting, using the deterministic career extractor plus the generic-word filter. */
export function detectSkills(text: string) {
  const found = extractSkills(text).filter((s) => KNOWN_SKILL_SLUGS.has(s.slug) && s.matched.some((m) => !GENERIC_ALIASES.has(m.toLowerCase())));
  return [...new Set(found.map((s) => s.slug))];
}

async function collectPostings(): Promise<RawPosting[]> {
  const [ext, plat, samples] = await Promise.all([
    db
      .select({
        source: externalJobs.source,
        externalId: externalJobs.externalId,
        title: externalJobs.title,
        company: externalJobs.company,
        location: externalJobs.location,
        tags: externalJobs.tags,
        description: externalJobs.description,
        publishedAt: externalJobs.publishedAt,
        fetchedAt: externalJobs.fetchedAt,
      })
      .from(externalJobs),
    db
      .select({ p: jobPostings, orgName: organizations.name, isSample: organizations.isSample })
      .from(jobPostings)
      .innerJoin(organizations, eq(organizations.id, jobPostings.orgId))
      .where(and(eq(jobPostings.status, 'published'), eq(jobPostings.campusOnly, false))),
    db.select().from(marketSamplePostings),
  ]);
  const out: RawPosting[] = [];
  for (const j of ext) {
    if (!(FEED_IDS as string[]).includes(j.source)) continue;
    const source = j.source as FeedId;
    out.push({
      source,
      key: postingKey(source, j.externalId),
      postedAt: asDate(j.publishedAt),
      fetchedAt: new Date(j.fetchedAt),
      features: () => ({
        remote: REMOTE_ONLY_BOARDS.has(source) || /\b(remote|anywhere|worldwide)\b/i.test(`${j.location ?? ''} ${j.title}`),
        role: classifyRole(j.title),
        company: j.company.trim(),
        skills: detectSkills(`${j.title}\n${j.tags.join(', ')}\n${j.description ?? ''}`),
      }),
    });
  }
  for (const { p, orgName, isSample } of plat) {
    const source: MarketSource = isSample ? 'sample' : 'platform';
    out.push({
      source,
      key: postingKey(source, p.id),
      postedAt: asDate(p.publishedAt) ?? new Date(p.createdAt),
      fetchedAt: asDate(p.publishedAt) ?? new Date(p.createdAt),
      features: () => ({
        remote: p.workplace === 'remote',
        role: classifyRole(p.title),
        company: orgName,
        skills: [...new Set([...postingSkills(p).map((s) => s.slug), ...detectSkills(p.title)])].filter((s) => KNOWN_SKILL_SLUGS.has(s)),
      }),
    });
  }
  for (const s of samples) {
    out.push({
      source: 'sample',
      key: postingKey('sample', s.externalId),
      postedAt: new Date(s.postedAt),
      fetchedAt: new Date(s.createdAt),
      features: () => ({
        remote: s.remote,
        role: classifyRole(s.title),
        company: s.company,
        skills: detectSkills(`${s.title}\n${s.tags.join(', ')}\n${s.description ?? ''}`),
      }),
    });
  }
  return out;
}

type SnapshotRow = typeof marketSnapshots.$inferSelect;

export type SnapshotResult = {
  runDay: string;
  postingsScanned: number;
  newPostings: number;
  rowsWritten: number;
  sources: MarketSource[];
  postedFrom: string | null;
  postedTo: string | null;
  fetchedFrom: string | null;
  fetchedTo: string | null;
};

let running: Promise<SnapshotResult> | null = null;

/**
 * Aggregates every known posting into daily snapshot rows. Idempotent: a posting is counted
 * once (by key), so re-running on the same day changes nothing unless new postings arrived.
 */
export function runSnapshot(opts: { trigger?: 'schedule' | 'admin' | 'lazy' | 'seed'; now?: Date } = {}): Promise<SnapshotResult> {
  if (running) return running;
  running = doSnapshot(opts).finally(() => {
    running = null;
  });
  return running;
}

async function doSnapshot(opts: { trigger?: 'schedule' | 'admin' | 'lazy' | 'seed'; now?: Date }): Promise<SnapshotResult> {
  const now = opts.now ?? new Date();
  const runDay = isoDay(now);
  const startedAt = new Date();
  const postings = await collectPostings();

  let postedFrom: Date | null = null;
  let postedTo: Date | null = null;
  let fetchedFrom: Date | null = null;
  let fetchedTo: Date | null = null;
  for (const p of postings) {
    postedFrom = minD(postedFrom, p.postedAt);
    postedTo = maxD(postedTo, p.postedAt);
    fetchedFrom = minD(fetchedFrom, p.fetchedAt);
    fetchedTo = maxD(fetchedTo, p.fetchedAt);
  }
  const sources = [...new Set(postings.map((p) => p.source))].sort() as MarketSource[];

  const result = await db.transaction(async (tx) => {
    // One writer at a time across processes.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${727401})`);
    const known = new Set<string>();
    if (sources.length) {
      const keyRows = await tx.select({ source: marketSnapshots.source, keys: marketSnapshots.postingKeys }).from(marketSnapshots).where(inArray(marketSnapshots.source, sources));
      for (const r of keyRows) for (const k of r.keys) known.add(`${r.source}:${k}`);
    }
    const fresh = postings.filter((p) => !known.has(`${p.source}:${p.key}`));
    // Deduplicate within this batch too (the same posting can't appear twice per source, but be safe).
    const seen = new Set<string>();
    const groups = new Map<string, RawPosting[]>();
    for (const p of fresh) {
      const id = `${p.source}:${p.key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const g = `${postingDay(p.postedAt, p.fetchedAt)}|${p.source}`;
      (groups.get(g) ?? groups.set(g, []).get(g)!).push(p);
    }
    let rowsWritten = 0;
    for (const [g, list] of groups) {
      const [day, source] = g.split('|');
      const [existing] = await tx.select().from(marketSnapshots).where(and(eq(marketSnapshots.day, day), eq(marketSnapshots.source, source)));
      const row = mergeInto(existing, list);
      if (existing) {
        await tx.update(marketSnapshots).set({ ...row, computedAt: now }).where(eq(marketSnapshots.id, existing.id));
      } else {
        await tx.insert(marketSnapshots).values({ day, source, ...row, computedAt: now });
      }
      rowsWritten++;
    }
    const meta = {
      trigger: opts.trigger ?? 'schedule',
      sources,
      postingsScanned: postings.length,
      newPostings: seen.size,
      rowsWritten,
      postedFrom,
      postedTo,
      fetchedFrom,
      fetchedTo,
      startedAt,
      finishedAt: new Date(),
    };
    await tx
      .insert(marketSnapshotRuns)
      .values({ runDay, ...meta })
      .onConflictDoUpdate({ target: marketSnapshotRuns.runDay, set: { ...meta, runs: sql`${marketSnapshotRuns.runs} + 1`, newPostings: sql`${marketSnapshotRuns.newPostings} + ${seen.size}`, rowsWritten: sql`${marketSnapshotRuns.rowsWritten} + ${rowsWritten}` } });
    return { newPostings: seen.size, rowsWritten };
  });
  return {
    runDay,
    postingsScanned: postings.length,
    ...result,
    sources,
    postedFrom: postedFrom?.toISOString() ?? null,
    postedTo: postedTo?.toISOString() ?? null,
    fetchedFrom: fetchedFrom?.toISOString() ?? null,
    fetchedTo: fetchedTo?.toISOString() ?? null,
  };
}

function mergeInto(existing: SnapshotRow | undefined, list: RawPosting[]) {
  const skillCounts: Counts = { ...(existing?.skillCounts ?? {}) };
  const roleCounts: Counts = { ...(existing?.roleCounts ?? {}) };
  const companyCounts: Counts = { ...(existing?.companyCounts ?? {}) };
  const skillRoles: Record<string, Counts> = structuredClone(existing?.skillRoles ?? {});
  const skillPairs: Record<string, Counts> = structuredClone(existing?.skillPairs ?? {});
  const keys = [...(existing?.postingKeys ?? [])];
  let postingCount = existing?.postingCount ?? 0;
  let remoteCount = existing?.remoteCount ?? 0;
  let postedFrom = asDate(existing?.postedFrom);
  let postedTo = asDate(existing?.postedTo);
  let fetchedFrom = asDate(existing?.fetchedFrom);
  let fetchedTo = asDate(existing?.fetchedTo);
  for (const p of list) {
    const f = p.features();
    postingCount++;
    if (f.remote) remoteCount++;
    inc(roleCounts, f.role);
    if (f.company) inc(companyCounts, f.company);
    for (const s of f.skills) {
      inc(skillCounts, s);
      inc((skillRoles[s] ??= {}), f.role);
      for (const t of f.skills) if (t !== s) inc((skillPairs[s] ??= {}), t);
    }
    keys.push(p.key);
    postedFrom = minD(postedFrom, p.postedAt);
    postedTo = maxD(postedTo, p.postedAt);
    fetchedFrom = minD(fetchedFrom, p.fetchedAt);
    fetchedTo = maxD(fetchedTo, p.fetchedAt);
  }
  return { postingCount, remoteCount, skillCounts, roleCounts, companyCounts, skillRoles, skillPairs, postingKeys: keys, postedFrom, postedTo, fetchedFrom, fetchedTo };
}

/**
 * Runs a snapshot when postings may have changed since today's last run started (a few cheap max() queries).
 * Feed runs record finishedAt after their rows are written, so a snapshot that started later saw them.
 */
export async function ensureFreshSnapshot(now = new Date()) {
  const [[run], [feed], [ext], [plat], [smp]] = await Promise.all([
    db.select({ startedAt: marketSnapshotRuns.startedAt }).from(marketSnapshotRuns).where(eq(marketSnapshotRuns.runDay, isoDay(now))),
    db.select({ t: max(jobFeedRuns.finishedAt) }).from(jobFeedRuns).where(eq(jobFeedRuns.status, 'ok')),
    db.select({ t: max(externalJobs.fetchedAt) }).from(externalJobs),
    db.select({ t: max(jobPostings.updatedAt) }).from(jobPostings).where(eq(jobPostings.status, 'published')),
    db.select({ t: max(marketSamplePostings.createdAt) }).from(marketSamplePostings),
  ]);
  const anyPostings = [ext?.t, plat?.t, smp?.t].some(Boolean);
  if (!anyPostings) return;
  const newest = [feed?.t, ext?.t, plat?.t, smp?.t].map(asDate).reduce(maxD, null);
  const last = asDate(run?.startedAt);
  if (!last || (newest && newest >= last)) await runSnapshot({ trigger: 'lazy', now });
}

// ---------------------------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------------------------

export type Scope = 'all' | 'public' | 'platform';
export type Dataset = 'live' | 'sample' | 'none';

const scopeSources = (scope: Scope): MarketSource[] => (scope === 'public' ? [...FEED_IDS] : scope === 'platform' ? ['platform'] : REAL_SOURCES);

async function loadRows(from: string, to: string, sources: MarketSource[]) {
  if (!sources.length) return [];
  return db
    .select()
    .from(marketSnapshots)
    .where(and(gte(marketSnapshots.day, from), lte(marketSnapshots.day, to), inArray(marketSnapshots.source, sources)))
    .orderBy(asc(marketSnapshots.day));
}

type Agg = ReturnType<typeof aggregate>;

function aggregate(rows: SnapshotRow[]) {
  const a = {
    postings: 0,
    remote: 0,
    skillCounts: {} as Counts,
    roleCounts: {} as Counts,
    companyCounts: {} as Counts,
    skillRoles: {} as Record<string, Counts>,
    skillPairs: {} as Record<string, Counts>,
    bySource: {} as Counts,
    postedFrom: null as Date | null,
    postedTo: null as Date | null,
    fetchedFrom: null as Date | null,
    fetchedTo: null as Date | null,
  };
  for (const r of rows) {
    a.postings += r.postingCount;
    a.remote += r.remoteCount;
    addAll(a.skillCounts, r.skillCounts);
    addAll(a.roleCounts, r.roleCounts);
    addAll(a.companyCounts, r.companyCounts);
    for (const [s, c] of Object.entries(r.skillRoles ?? {})) addAll((a.skillRoles[s] ??= {}), c);
    for (const [s, c] of Object.entries(r.skillPairs ?? {})) addAll((a.skillPairs[s] ??= {}), c);
    inc(a.bySource, r.source, r.postingCount);
    a.postedFrom = minD(a.postedFrom, asDate(r.postedFrom));
    a.postedTo = maxD(a.postedTo, asDate(r.postedTo));
    a.fetchedFrom = minD(a.fetchedFrom, asDate(r.fetchedFrom));
    a.fetchedTo = maxD(a.fetchedTo, asDate(r.fetchedTo));
  }
  return a;
}

/** Two-proportion comparison. Direction only when the change is both large enough and unlikely to be noise. */
export function compareShares(cur: { count: number; total: number }, prev: { count: number; total: number }) {
  const p1 = cur.count / cur.total;
  const p2 = prev.count / prev.total;
  const pooled = (cur.count + prev.count) / (cur.total + prev.total);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / cur.total + 1 / prev.total));
  const z = se > 0 ? (p1 - p2) / se : 0;
  const significant = Math.abs(z) >= Z_THRESHOLD && Math.abs(p1 - p2) >= MIN_CHANGE;
  return { direction: (significant ? (p1 > p2 ? 'up' : 'down') : 'steady') as 'up' | 'down' | 'steady', changePoints: round((p1 - p2) * 100, 1), significant };
}

function weekStart(day: string) {
  const d = dayToDate(day);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

function weeklySeries(rows: SnapshotRow[], from: string, to: string, skill?: string) {
  const weeks = new Map<string, { weekStart: string; postings: number; mentions: number; bySource: Counts }>();
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) weeks.set(w, { weekStart: w, postings: 0, mentions: 0, bySource: {} });
  for (const r of rows) {
    const w = weeks.get(weekStart(r.day));
    if (!w) continue;
    w.postings += r.postingCount;
    inc(w.bySource, r.source, r.postingCount);
    if (skill) w.mentions += r.skillCounts?.[skill] ?? 0;
  }
  return [...weeks.values()].map((w) => ({
    ...w,
    weekEnd: addDays(w.weekStart, 6),
    partial: w.weekStart < from || addDays(w.weekStart, 6) > to,
  }));
}

export function resolveWindow(days: number, now = new Date()) {
  const to = isoDay(now);
  const from = addDays(to, -(days - 1));
  return { days, from, to, previous: { from: addDays(from, -days), to: addDays(from, -1) } };
}

// ---------------------------------------------------------------------------------------------
// Provenance: basedOn, freshness, caveats, empty state
// ---------------------------------------------------------------------------------------------

async function lastSuccessfulFetch() {
  const [r] = await db
    .select({ at: jobFeedRuns.finishedAt, source: jobFeedRuns.source })
    .from(jobFeedRuns)
    .where(eq(jobFeedRuns.status, 'ok'))
    .orderBy(desc(jobFeedRuns.finishedAt))
    .limit(1);
  return r?.at ? new Date(r.at) : null;
}

export async function freshness(dataset: Dataset) {
  if (dataset === 'sample') return { status: 'sample' as const, lastSuccessfulFetchAt: null, message: 'Sample data for demonstration. Not real job postings.' };
  const at = await lastSuccessfulFetch();
  if (!at) return { status: 'none' as const, lastSuccessfulFetchAt: null, message: 'No public feed has been fetched successfully yet.' };
  const current = Date.now() - at.getTime() <= FRESH_MS;
  return {
    status: current ? ('current' as const) : ('historical' as const),
    lastSuccessfulFetchAt: at.toISOString(),
    message: current
      ? `Public feeds last fetched successfully ${at.toISOString().slice(0, 16).replace('T', ' ')} UTC.`
      : `Current postings could not be retrieved recently. The latest successful fetch was on ${at.toISOString().slice(0, 10)}, so these are historical figures.`,
  };
}

function basedOn(agg: Agg, sources: MarketSource[], dataset: Dataset, window: ReturnType<typeof resolveWindow>) {
  return {
    dataset,
    postings: agg.postings,
    sources: sources
      .filter((s) => (agg.bySource[s] ?? 0) > 0)
      .map((s) => ({ source: s, label: SOURCE_META[s].label, kind: SOURCE_META[s].kind, homepage: SOURCE_META[s].homepage, postings: agg.bySource[s] ?? 0 })),
    dateRange: {
      postedFrom: agg.postedFrom?.toISOString() ?? null,
      postedTo: agg.postedTo?.toISOString() ?? null,
      fetchedFrom: agg.fetchedFrom?.toISOString() ?? null,
      fetchedTo: agg.fetchedTo?.toISOString() ?? null,
    },
    window: { days: window.days, from: window.from, to: window.to },
    generatedAt: new Date().toISOString(),
  };
}

function caveats(agg: Agg, dataset: Dataset, fresh: Awaited<ReturnType<typeof freshness>>, extra: string[] = []) {
  if (dataset === 'sample') {
    return [
      'Sample data: these postings were written for demonstration and are not real vacancies. Do not use these figures for decisions.',
      'Shares show how often a skill is mentioned in postings, not salaries or hiring outcomes.',
      ...extra,
    ];
  }
  if (dataset === 'none') return ['There are no postings to analyse yet, so no figures are shown.'];
  const feeds = FEED_IDS.filter((s) => (agg.bySource[s] ?? 0) > 0);
  const platform = agg.bySource.platform ?? 0;
  const out: string[] = [];
  const parts = [feeds.length ? `${feeds.reduce((n, s) => n + (agg.bySource[s] ?? 0), 0)} remote-focused postings from public job boards (${feeds.map((s) => SOURCE_META[s].label).join(', ')})` : null, platform ? `${platform} jobs published on this platform` : null].filter(Boolean);
  out.push(`Based on ${parts.join(' and ')}; not the whole job market.`);
  if (feeds.length) {
    out.push('These boards list remote jobs, mostly in software and mostly in English, so remote roles are over-represented by design.');
    out.push('Each fetch returns only the newest 20 to 50 postings per board, so volumes reflect how often we fetch as well as how many jobs exist.');
  }
  out.push('Shares show how often a skill is mentioned in postings, not salaries, hiring outcomes or how many people are hired.');
  out.push('Skills are detected by matching known skill names and aliases in titles, tags and descriptions. A mention may sit in a "nice to have" list, and unusual wording can be missed.');
  out.push('Trends compare how often skills were mentioned in two periods. They describe a change, not its cause.');
  out.push('No estimates: every figure is a count of real postings.');
  if (fresh.status === 'historical') out.push(fresh.message);
  return [...out, ...extra];
}

async function emptyReason() {
  const enabled = enabledFeeds();
  const [anyOk] = await db.select({ id: jobFeedRuns.id }).from(jobFeedRuns).where(eq(jobFeedRuns.status, 'ok')).limit(1);
  const [anySnap] = await db.select({ id: marketSnapshots.id }).from(marketSnapshots).limit(1);
  if (!enabled.length && !anySnap) return { code: 'feeds_disabled', message: 'External job feeds are turned off on this server and no jobs have been published on this platform yet, so there is nothing to analyse.' };
  if (!anyOk && !anySnap) return { code: 'never_synced', message: 'No job postings have been fetched yet. Insights appear after the first successful feed sync.' };
  return { code: 'no_recent_postings', message: 'No postings fall in this period. Try a longer period or fetch the latest postings.' };
}

/** Real data for the scope if any exists in the window; otherwise sample data (labelled); otherwise none. */
async function pickDataset(scope: Scope, window: ReturnType<typeof resolveWindow>) {
  const real = scopeSources(scope);
  const rows = await loadRows(window.from, window.to, real);
  if (rows.some((r) => r.postingCount > 0)) return { dataset: 'live' as Dataset, sources: real, rows };
  // Fall back to sample data only when no real postings exist at all in the window (any scope).
  const anyReal = scope === 'all' ? false : (await loadRows(window.from, window.to, REAL_SOURCES)).some((r) => r.postingCount > 0);
  if (!anyReal) {
    const sample = await loadRows(window.from, window.to, ['sample']);
    if (sample.some((r) => r.postingCount > 0)) return { dataset: 'sample' as Dataset, sources: ['sample'] as MarketSource[], rows: sample };
  }
  return { dataset: 'none' as Dataset, sources: real, rows: [] as SnapshotRow[] };
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

export async function overview(opts: { days: 30 | 90; scope: Scope; now?: Date }) {
  const window = resolveWindow(opts.days, opts.now);
  const { dataset, sources, rows } = await pickDataset(opts.scope, window);
  const agg = aggregate(rows);
  const fresh = await freshness(dataset);
  if (dataset === 'none') {
    return {
      status: 'empty' as const,
      dataset,
      scope: opts.scope,
      window,
      emptyReason: await emptyReason(),
      basedOn: basedOn(agg, sources, dataset, window),
      freshness: fresh,
      summary: null,
      skills: [],
      trend: { available: false, reason: 'No postings in this period.', minPostingsPerPeriod: MIN_POSTINGS_FOR_TREND, currentPostings: 0, previousPostings: 0 },
      roles: [],
      companies: [],
      weekly: [],
      caveats: caveats(agg, dataset, fresh),
    };
  }
  const prevAgg = aggregate(await loadRows(window.previous.from, window.previous.to, sources));
  const trendAvailable = agg.postings >= MIN_POSTINGS_FOR_TREND && prevAgg.postings >= MIN_POSTINGS_FOR_TREND;
  const trendReason = trendAvailable
    ? null
    : `Not enough data to show a trend: each period needs at least ${MIN_POSTINGS_FOR_TREND} postings (this period ${agg.postings}, previous period ${prevAgg.postings}).`;

  const skillsOut = Object.entries(agg.skillCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 25)
    .map(([slug, count]) => {
      const prevCount = prevAgg.skillCounts[slug] ?? 0;
      return {
        slug,
        name: skillName(slug),
        postings: count,
        share: round(count / agg.postings),
        previous: prevAgg.postings ? { postings: prevCount, share: round(prevCount / prevAgg.postings) } : null,
        trend: trendAvailable ? compareShares({ count, total: agg.postings }, { count: prevCount, total: prevAgg.postings }) : null,
      };
    });

  const roles = Object.entries(agg.roleCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([role, n]) => ({ role, label: ROLE_LABEL[role as RoleBucket] ?? role, postings: n, share: round(n / agg.postings) }));
  const companies = Object.entries(agg.companyCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([name, n]) => ({ name, postings: n, share: round(n / agg.postings) }));
  const extra: string[] = [];
  if (agg.postings < MIN_POSTINGS_FOR_TREND) extra.push(`Only ${agg.postings} postings in this period: small numbers can swing a lot, so read the shares with care.`);
  return {
    status: 'ok' as const,
    dataset,
    scope: opts.scope,
    window,
    emptyReason: null,
    basedOn: basedOn(agg, sources, dataset, window),
    freshness: fresh,
    summary: {
      postings: agg.postings,
      remotePostings: agg.remote,
      remoteShare: round(agg.remote / agg.postings),
      skillsDetected: Object.keys(agg.skillCounts).length,
    },
    skills: skillsOut,
    trend: { available: trendAvailable, reason: trendReason, minPostingsPerPeriod: MIN_POSTINGS_FOR_TREND, currentPostings: agg.postings, previousPostings: prevAgg.postings },
    roles,
    companies,
    weekly: weeklySeries(rows, window.from, window.to).map(({ mentions: _m, ...w }) => w),
    caveats: caveats(agg, dataset, fresh, extra),
  };
}

export async function skillDetail(slug: string, opts: { days: 30 | 90; scope: Scope; now?: Date }) {
  const window = resolveWindow(opts.days, opts.now);
  const { dataset, sources, rows } = await pickDataset(opts.scope, window);
  const agg = aggregate(rows);
  const fresh = await freshness(dataset);
  const mentions = agg.skillCounts[slug] ?? 0;
  const roles = Object.entries(agg.skillRoles[slug] ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([role, n]) => ({ role, label: ROLE_LABEL[role as RoleBucket] ?? role, postings: n, shareOfSkillPostings: mentions ? round(n / mentions) : 0, roleTotal: agg.roleCounts[role] ?? 0, shareOfRole: agg.roleCounts[role] ? round(n / agg.roleCounts[role]) : 0 }));
  const cooccurring = Object.entries(agg.skillPairs[slug] ?? {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([other, n]) => ({ slug: other, name: skillName(other), postings: n, shareOfSkillPostings: mentions ? round(n / mentions) : 0 }));
  const weekly = weeklySeries(rows, window.from, window.to, slug).map((w) => ({ ...w, share: w.postings ? round(w.mentions / w.postings) : null, enoughData: w.postings >= 10 }));
  const links = (await learningLinks([slug]))[slug] ?? { topics: [], practice: [] };
  return {
    status: dataset === 'none' ? ('empty' as const) : ('ok' as const),
    dataset,
    scope: opts.scope,
    window,
    skill: { slug, name: skillName(slug) },
    summary: dataset === 'none' ? null : { postings: agg.postings, mentions, share: agg.postings ? round(mentions / agg.postings) : 0 },
    weekly,
    roles,
    cooccurring,
    learning: links,
    emptyReason: dataset === 'none' ? await emptyReason() : null,
    basedOn: basedOn(agg, sources, dataset, window),
    freshness: fresh,
    caveats: caveats(agg, dataset, fresh, [
      'Co-occurring skills were mentioned in the same postings. That does not mean one skill causes demand for the other.',
      'Weeks with fewer than 10 postings are marked as too small to read.',
    ]),
  };
}

export type MeStatus = 'verified' | 'demonstrated' | 'learning' | 'self_reported' | 'none';

export function dnaStatus(e: SkillDnaEntry | undefined): { status: MeStatus; revisionDue: boolean } {
  if (!e) return { status: 'none', revisionDue: false };
  switch (e.state) {
    case 'verified':
      return { status: 'verified', revisionDue: false };
    case 'demonstrated':
      return { status: 'demonstrated', revisionDue: false };
    case 'needs_revision':
      return { status: e.verified ? 'verified' : 'demonstrated', revisionDue: true };
    case 'learning':
      return { status: 'learning', revisionDue: false };
    case 'self_declared':
      return { status: 'self_reported', revisionDue: false };
    default:
      return { status: 'none', revisionDue: false };
  }
}

export async function meVsMarket(dna: SkillDnaEntry[], opts: { days: 30 | 90; scope: Scope; now?: Date; top?: number }) {
  const ov = await overview(opts);
  const bySlug = new Map(dna.map((d) => [d.slug, d]));
  const top = ov.skills.slice(0, opts.top ?? 15);
  const needLinks = top.filter((s) => dnaStatus(bySlug.get(s.slug)).status !== 'verified').map((s) => s.slug);
  const links = await learningLinks(needLinks);
  const items = top.map((s) => {
    const e = bySlug.get(s.slug);
    const st = dnaStatus(e);
    return {
      slug: s.slug,
      name: s.name,
      marketShare: s.share,
      marketPostings: s.postings,
      status: st.status,
      revisionDue: st.revisionDue,
      evidenceCount: e?.evidenceCount ?? 0,
      lastEvidenceAt: e?.lastEvidenceAt ?? null,
      learning: links[s.slug] ?? { topics: [], practice: [] },
    };
  });
  const counts = { verified: 0, demonstrated: 0, learning: 0, self_reported: 0, none: 0 } as Record<MeStatus, number>;
  for (const i of items) counts[i.status]++;
  return {
    status: ov.status,
    dataset: ov.dataset,
    scope: ov.scope,
    window: ov.window,
    items,
    counts,
    emptyReason: ov.emptyReason,
    basedOn: ov.basedOn,
    freshness: ov.freshness,
    caveats: [
      ...ov.caveats,
      'Your statuses come from your Skill DNA: "verified" needs deterministic grading or an authorized reviewer, and self-ratings alone count as self-reported.',
      'A skill being common in postings does not predict your chances of being hired.',
    ],
  };
}

/** Roadmap topics and CodeLab practice for skills (global, published content only). */
export async function learningLinks(slugs: string[]) {
  const out: Record<string, { topics: { title: string; trackTitle: string; link: string }[]; practice: { title: string; difficulty: string; link: string }[] }> = {};
  if (!slugs.length) return out;
  const skillRows = await db.select({ id: skills.id, slug: skills.slug }).from(skills).where(inArray(skills.slug, slugs));
  if (!skillRows.length) return out;
  const ids = skillRows.map((s) => s.id);
  const [topicRows, practiceRows] = await Promise.all([
    db
      .select({ title: topics.title, slug: topics.slug, skillId: topics.skillId, trackSlug: tracks.slug, trackTitle: tracks.title })
      .from(topics)
      .innerJoin(tracks, eq(tracks.id, topics.trackId))
      .where(and(inArray(topics.skillId, ids), eq(tracks.status, 'published'), sql`${tracks.orgId} IS NULL`))
      .orderBy(topics.sortOrder)
      .limit(200),
    db
      .select({ id: questions.id, slug: questions.slug, title: questions.title, difficulty: questions.difficulty, skillIds: questions.skillIds })
      .from(questions)
      .where(and(eq(questions.isPractice, true), eq(questions.status, 'active'), sql`${questions.orgId} IS NULL`, sql`${questions.skillIds} && ARRAY[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::uuid[]`))
      .limit(200),
  ]);
  for (const s of skillRows) {
    out[s.slug] = {
      topics: topicRows
        .filter((t) => t.skillId === s.id)
        .slice(0, 2)
        .map((t) => ({ title: t.title, trackTitle: t.trackTitle, link: `/app/learn/${t.trackSlug}/${t.slug}` })),
      practice: practiceRows
        .filter((q) => q.skillIds.includes(s.id))
        .slice(0, 2)
        .map((q) => ({ title: q.title, difficulty: q.difficulty, link: `/app/practice/${q.slug ?? q.id}` })),
    };
  }
  return out;
}

export async function sourcesReport(opts: { days: 30 | 90; now?: Date }) {
  const status = await feedStatus();
  const window = resolveWindow(opts.days, opts.now);
  const rows = await loadRows(window.from, window.to, [...REAL_SOURCES, 'sample']);
  const agg = aggregate(rows);
  const [allTime] = await db.select({ n: sql<number>`coalesce(sum(${marketSnapshots.postingCount}), 0)::int` }).from(marketSnapshots);
  const [lastRun] = await db.select().from(marketSnapshotRuns).orderBy(desc(marketSnapshotRuns.finishedAt)).limit(1);
  const feeds = status.map((s) => ({
    source: s.source as MarketSource,
    label: s.label,
    kind: 'public_feed' as SourceKind,
    homepage: s.homepage,
    attribution: `Job data from ${s.label} (${s.homepage.replace(/^https?:\/\//, '')}). Listings link to the original posting.`,
    terms: s.terms,
    enabled: s.enabled,
    backgroundSync: s.backgroundSync,
    lastSuccessAt: s.lastSuccessAt,
    lastAttemptAt: s.lastAttemptAt,
    lastStatus: s.lastStatus,
    lastError: s.lastError ? 'The last fetch failed. Insights use the most recent successful data.' : null,
    nextAllowedAt: s.nextAllowedAt,
    limits: s.limits,
    cachedPostings: s.cachedJobs,
    postingsInWindow: agg.bySource[s.source] ?? 0,
  }));
  const [{ n: platformLive }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobPostings)
    .innerJoin(organizations, eq(organizations.id, jobPostings.orgId))
    .where(and(eq(jobPostings.status, 'published'), eq(jobPostings.campusOnly, false), eq(organizations.isSample, false)));
  const others = [
    {
      source: 'platform' as MarketSource,
      label: SOURCE_META.platform.label,
      kind: 'platform' as SourceKind,
      homepage: null,
      attribution: 'Jobs published by employers on LearnSphere Nexus.',
      terms: 'Published, non campus-only postings are counted.',
      enabled: true,
      postingsInWindow: agg.bySource.platform ?? 0,
      cachedPostings: platformLive,
    },
    ...((agg.bySource.sample ?? 0) > 0
      ? [
          {
            source: 'sample' as MarketSource,
            label: SOURCE_META.sample.label,
            kind: 'sample' as SourceKind,
            homepage: null,
            attribution: 'Sample postings written for demonstration. Not real vacancies.',
            terms: 'Shown only when no real postings exist in the period, and always labelled as sample data.',
            enabled: true,
            postingsInWindow: agg.bySource.sample ?? 0,
            cachedPostings: null,
          },
        ]
      : []),
  ];
  const window_ = { days: window.days, from: window.from, to: window.to };
  const dataset: Dataset = REAL_SOURCES.some((s) => (agg.bySource[s] ?? 0) > 0) ? 'live' : (agg.bySource.sample ?? 0) > 0 ? 'sample' : 'none';
  const fresh = await freshness(dataset);
  return {
    window: window_,
    sources: [...feeds, ...others],
    snapshots: {
      lastRunAt: lastRun?.finishedAt ?? null,
      lastRunTrigger: lastRun?.trigger ?? null,
      postingsAllTime: allTime?.n ?? 0,
      method: 'Daily snapshots count each posting once, on the day it was published, so totals survive after a feed drops old postings.',
    },
    basedOn: {
      dataset,
      postings: agg.postings,
      sources: (Object.keys(agg.bySource) as MarketSource[]).map((s) => ({ source: s, label: SOURCE_META[s]?.label ?? s, kind: SOURCE_META[s]?.kind ?? 'public_feed', homepage: SOURCE_META[s]?.homepage ?? null, postings: agg.bySource[s] })),
      dateRange: { postedFrom: agg.postedFrom?.toISOString() ?? null, postedTo: agg.postedTo?.toISOString() ?? null, fetchedFrom: agg.fetchedFrom?.toISOString() ?? null, fetchedTo: agg.fetchedTo?.toISOString() ?? null },
      window: window_,
      generatedAt: new Date().toISOString(),
    },
    freshness: fresh,
    caveats: [
      'Public feeds are fetched by our server within each provider\'s published rate limits (Remotive at most 4 times a day, Jobicy and Himalayas at most hourly).',
      'Sources that are turned off or failing contribute no new postings; earlier snapshots are kept.',
      ...(fresh.status === 'historical' ? [fresh.message] : []),
    ],
  };
}

/** Admin: fetch every enabled feed now (each one still respects its rate limit), then recompute. */
export async function fetchLatest(opts: { fetchFn?: FetchFn } = {}) {
  const results: SyncResult[] = [];
  for (const s of enabledFeeds()) results.push(await syncFeed(s, { trigger: 'admin', fetchFn: opts.fetchFn }));
  const snapshot = await runSnapshot({ trigger: 'admin' });
  return { results, snapshot, disabled: FEED_IDS.filter((s) => !enabledFeeds().includes(s)) };
}
