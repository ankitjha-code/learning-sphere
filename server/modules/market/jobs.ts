// Background job handlers for job-market insights: one snapshot per day (idempotent per day).
import { registerJob } from '../../jobs/queue';
import { ensureScheduled, scheduleNext } from '../files/recurring';
import { runSnapshot } from './service';

export const SNAPSHOT_JOB = 'market.snapshot';
export const SNAPSHOT_PERIOD_MS = 86400_000;

/** Starts the daily chain lazily from the market routes, so the server entry point stays untouched. */
export function ensureSnapshotScheduled() {
  ensureScheduled(SNAPSHOT_JOB, SNAPSHOT_PERIOD_MS);
}

registerJob(SNAPSHOT_JOB, async () => {
  const result = await runSnapshot({ trigger: 'schedule' });
  await scheduleNext(SNAPSHOT_JOB, SNAPSHOT_PERIOD_MS);
  return result;
});
