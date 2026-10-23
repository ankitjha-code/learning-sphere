/**
 * External job feed sync. Fetches server-side, honours each provider's rate limit
 * (recorded in job_feed_runs), normalizes into external_jobs, and removes expired or stale rows.
 * The fetch function is injectable so tests never touch the network.
 */
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../../../db/client';
import { externalJobs, jobFeedRuns } from '../../../db/schema';
import { config } from '../../../lib/config';
import { jobicy } from './jobicy';
import { himalayas } from './himalayas';
import { remotive } from './remotive';
import type { FeedAdapter, FetchFn, NormalizedJob } from './types';

export type { FeedAdapter, FetchFn, NormalizedJob } from './types';
export { htmlToText } from './types';

export const ADAPTERS: Record<FeedAdapter['id'], FeedAdapter> = { jobicy, himalayas, remotive };
export type FeedId = FeedAdapter['id'];
export const FEED_IDS = Object.keys(ADAPTERS) as FeedId[];

export const MAX_AGE_DAYS = 30;
const STALE_DAYS = 7; // not seen in any fetch for a week: assume the listing is gone
const MAX_PER_SOURCE = 300;

export function enabledFeeds(): FeedId[] {
  return config()
    .JOB_FEEDS.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is FeedId => s in ADAPTERS);
}

export function backgroundSyncEnabled() {
  return config().JOB_FEED_SYNC !== 'false';
}

export function userAgent() {
  return `LearnSphereNexus/0.1 (+${config().APP_URL}; job feed sync, contact via site)`;
}

const ATTEMPT_STATUSES = ['ok', 'error', 'running'];

/** When the next fetch is allowed, or null if allowed now. */
export async function nextAllowedAt(adapter: FeedAdapter, now = new Date()): Promise<Date | null> {
  const dayAgo = new Date(now.getTime() - 86400_000);
  const recent = await db
    .select({ startedAt: jobFeedRuns.startedAt })
    .from(jobFeedRuns)
    .where(and(eq(jobFeedRuns.source, adapter.id), inArray(jobFeedRuns.status, ATTEMPT_STATUSES), gte(jobFeedRuns.startedAt, dayAgo)))
    .orderBy(desc(jobFeedRuns.startedAt));
  const candidates: number[] = [];
  if (recent[0]) {
    const t = new Date(recent[0].startedAt).getTime() + adapter.minIntervalMs;
    if (t > now.getTime()) candidates.push(t);
  }
  if (recent.length >= adapter.maxPerDay) {
    const oldestInWindow = new Date(recent[adapter.maxPerDay - 1].startedAt).getTime();
    candidates.push(oldestInWindow + 86400_000);
  }
  const t = candidates.length ? Math.max(...candidates) : 0;
  return t > now.getTime() ? new Date(t) : null;
}

export type SyncResult = { source: FeedId; status: 'ok' | 'error' | 'skipped_rate_limit' | 'disabled'; fetched: number; upserted: number; removed: number; message?: string; nextAllowedAt?: string | null };

export function normalizeForStorage(jobs: NormalizedJob[], now = new Date()) {
  const cutoff = now.getTime() - MAX_AGE_DAYS * 86400_000;
  const seen = new Set<string>();
  return jobs
    .filter((j) => {
      if (seen.has(j.externalId)) return false;
      seen.add(j.externalId);
      if (j.publishedAt && j.publishedAt.getTime() < cutoff) return false;
      if (j.expiresAt && j.expiresAt.getTime() < now.getTime()) return false;
      return true;
    })
    .map((j) => ({
      ...j,
      expiresAt: j.expiresAt ?? new Date((j.publishedAt ?? now).getTime() + MAX_AGE_DAYS * 86400_000),
    }));
}

export async function removeExpired(source: FeedId, now = new Date()) {
  const cutoff = new Date(now.getTime() - MAX_AGE_DAYS * 86400_000);
  const stale = new Date(now.getTime() - STALE_DAYS * 86400_000);
  const removed = await db
    .delete(externalJobs)
    .where(
      and(
        eq(externalJobs.source, source),
        or(
          and(isNotNull(externalJobs.expiresAt), lt(externalJobs.expiresAt, now)),
          and(isNotNull(externalJobs.publishedAt), lt(externalJobs.publishedAt, cutoff)),
          and(isNull(externalJobs.publishedAt), lt(externalJobs.fetchedAt, cutoff)),
          lt(externalJobs.fetchedAt, stale),
        ),
      ),
    )
    .returning({ id: externalJobs.id });
  // Keep the newest MAX_PER_SOURCE rows only.
  const keep = await db.select({ id: externalJobs.id }).from(externalJobs).where(eq(externalJobs.source, source)).orderBy(desc(externalJobs.publishedAt)).limit(MAX_PER_SOURCE);
  let trimmed = 0;
  if (keep.length === MAX_PER_SOURCE) {
    const res = await db
      .delete(externalJobs)
      .where(and(eq(externalJobs.source, source), notInArray(externalJobs.id, keep.map((k) => k.id))))
      .returning({ id: externalJobs.id });
    trimmed = res.length;
  }
  return removed.length + trimmed;
}

/** Fetch one source if its rate limit allows. Never throws for provider errors (they are recorded). */
export async function syncFeed(source: FeedId, opts: { fetchFn?: FetchFn; trigger?: 'schedule' | 'admin'; now?: Date } = {}): Promise<SyncResult> {
  const adapter = ADAPTERS[source];
  const now = opts.now ?? new Date();
  const trigger = opts.trigger ?? 'schedule';
  if (!enabledFeeds().includes(source)) return { source, status: 'disabled', fetched: 0, upserted: 0, removed: 0, message: `${adapter.label} is disabled on this server (JOB_FEEDS).` };
  const next = await nextAllowedAt(adapter, now);
  if (next) {
    const message = `${adapter.label} rate limit: next fetch allowed at ${next.toISOString()}.`;
    if (trigger === 'admin') await db.insert(jobFeedRuns).values({ source, trigger, status: 'skipped_rate_limit', message, startedAt: now, finishedAt: now });
    return { source, status: 'skipped_rate_limit', fetched: 0, upserted: 0, removed: 0, message, nextAllowedAt: next.toISOString() };
  }
  const [run] = await db.insert(jobFeedRuns).values({ source, trigger, status: 'running', startedAt: now }).returning();
  const fetchFn: FetchFn = opts.fetchFn ?? ((url, init) => globalThis.fetch(url, init));
  try {
    const res = await fetchFn(adapter.endpoint(), { headers: { 'user-agent': userAgent(), accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`${adapter.label} responded with HTTP ${res.status}`);
    const json = await res.json();
    const parsed = normalizeForStorage(adapter.parse(json), now);
    let upserted = 0;
    for (const j of parsed) {
      await db
        .insert(externalJobs)
        .values({ source, externalId: j.externalId, title: j.title, company: j.company, location: j.location, url: j.url, tags: j.tags, description: j.description, publishedAt: j.publishedAt, expiresAt: j.expiresAt, fetchedAt: now })
        .onConflictDoUpdate({
          target: [externalJobs.source, externalJobs.externalId],
          set: { title: j.title, company: j.company, location: j.location, url: j.url, tags: j.tags, description: j.description, publishedAt: j.publishedAt, expiresAt: j.expiresAt, fetchedAt: now },
        });
      upserted++;
    }
    const removed = await removeExpired(source, now);
    await db.update(jobFeedRuns).set({ status: 'ok', fetched: parsed.length, upserted, removed, finishedAt: new Date() }).where(eq(jobFeedRuns.id, run.id));
    return { source, status: 'ok', fetched: parsed.length, upserted, removed };
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    // Still clean up expired rows so we never show listings past their expiry.
    const removed = await removeExpired(source, now).catch(() => 0);
    await db.update(jobFeedRuns).set({ status: 'error', message, removed, finishedAt: new Date() }).where(eq(jobFeedRuns.id, run.id));
    return { source, status: 'error', fetched: 0, upserted: 0, removed, message };
  }
}

export async function feedStatus() {
  const enabled = enabledFeeds();
  const out = [];
  for (const id of FEED_IDS) {
    const a = ADAPTERS[id];
    const [last] = await db.select().from(jobFeedRuns).where(and(eq(jobFeedRuns.source, id), inArray(jobFeedRuns.status, ['ok', 'error']))).orderBy(desc(jobFeedRuns.startedAt)).limit(1);
    const [lastOk] = await db.select({ at: jobFeedRuns.finishedAt, fetched: jobFeedRuns.fetched }).from(jobFeedRuns).where(and(eq(jobFeedRuns.source, id), eq(jobFeedRuns.status, 'ok'))).orderBy(desc(jobFeedRuns.startedAt)).limit(1);
    const [{ n }] = await db.select({ n: count() }).from(externalJobs).where(and(eq(externalJobs.source, id), or(isNull(externalJobs.expiresAt), sql`${externalJobs.expiresAt} > now()`)));
    const next = enabled.includes(id) ? await nextAllowedAt(a) : null;
    out.push({
      source: id,
      label: a.label,
      homepage: a.homepage,
      terms: a.terms,
      enabled: enabled.includes(id),
      backgroundSync: backgroundSyncEnabled(),
      limits: { minIntervalMinutes: Math.round(a.minIntervalMs / 60_000), maxPerDay: a.maxPerDay },
      lastAttemptAt: last?.startedAt ?? null,
      lastStatus: last?.status ?? null,
      lastError: last?.status === 'error' ? last.message : null,
      lastSuccessAt: lastOk?.at ?? null,
      cachedJobs: n,
      nextAllowedAt: next?.toISOString() ?? null,
    });
  }
  return out;
}

export const ATTRIBUTION = Object.fromEntries(FEED_IDS.map((id) => [id, { label: ADAPTERS[id].label, homepage: ADAPTERS[id].homepage, applyLabel: ADAPTERS[id].applyLabel }])) as Record<FeedId, { label: string; homepage: string; applyLabel: string }>;
