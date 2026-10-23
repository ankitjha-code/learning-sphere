// Background job handlers for the job board: scheduled external feed sync.
import { enqueue, registerJob } from '../../jobs/queue';
import { ADAPTERS, FEED_IDS, backgroundSyncEnabled, enabledFeeds, syncFeed, type FeedId } from './feeds';

/**
 * One job per source per rate-limit window (idempotency key = source + window bucket).
 * Remotive windows are 6 hours (at most 4 per day); Jobicy and Himalayas are hourly.
 */
function bucketFor(source: FeedId, at = Date.now()) {
  return Math.floor(at / ADAPTERS[source].minIntervalMs);
}

export async function scheduleFeedSync(source: FeedId, which: 'current' | 'next') {
  const period = ADAPTERS[source].minIntervalMs;
  const bucket = bucketFor(source) + (which === 'next' ? 1 : 0);
  const runAt = which === 'next' ? new Date(bucket * period + 60_000) : new Date();
  return enqueue('jobs.sync_feeds', { source }, { idempotencyKey: `jobs.sync_feeds:${source}:${bucket}`, runAt, maxAttempts: 1 });
}

const started = new Set<string>();

/** Starts the per-source chain lazily from the jobs routes, so the server entry point stays untouched. */
export function ensureFeedSyncScheduled() {
  if (process.env.VITEST || !backgroundSyncEnabled()) return;
  for (const source of enabledFeeds()) {
    if (started.has(source)) continue;
    started.add(source);
    scheduleFeedSync(source, 'current').catch(() => started.delete(source));
  }
}

registerJob('jobs.sync_feeds', async (payload) => {
  const source = String(payload.source) as FeedId;
  if (!FEED_IDS.includes(source)) return { skipped: 'unknown source' };
  if (!backgroundSyncEnabled()) return { skipped: 'JOB_FEED_SYNC=false' };
  const result = await syncFeed(source, { trigger: 'schedule' });
  if (result.status !== 'disabled') await scheduleFeedSync(source, 'next');
  return result;
});
