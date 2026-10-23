// Background job handlers for this module register here via registerJob(type, handler).
import { registerJob } from '../../jobs/queue';
import { scheduleNext } from '../files/recurring';
import { runBillingRenewals } from './service';

/** Renewal reminders, grace periods and downgrades. Idempotent; runs every 6 hours. */
export const RENEWALS_JOB = 'billing.renewals';
export const RENEWALS_PERIOD_MS = 6 * 3600_000;

registerJob(RENEWALS_JOB, async (payload) => {
  const summary = await runBillingRenewals();
  if (!payload.manual) await scheduleNext(RENEWALS_JOB, RENEWALS_PERIOD_MS);
  return summary;
});
