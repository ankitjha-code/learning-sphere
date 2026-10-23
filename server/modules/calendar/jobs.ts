// Background job handlers for the calendar module.
import { registerJob } from '../../jobs/queue';
import { scheduleNext } from '../files/recurring';
import { SWEEP_PERIOD_MS, sweepConnections, syncConnection } from './service';
import './privacy';

/** One connection: push LearnSphere items to the dedicated external calendar. Handles its own retries/backoff. */
registerJob('calendar.sync', async (payload) => {
  const connectionId = String(payload.connectionId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return { skipped: 'bad_payload' };
  return (await syncConnection(connectionId, { force: payload.force === true })) as Record<string, unknown>;
});

/**
 * Every 15 minutes: enqueue a sync for each active connection. Unchanged agendas are detected by
 * fingerprint and cost no provider calls; a full re-push runs every 6 hours.
 */
registerJob('calendar.sweep', async () => {
  const n = await sweepConnections();
  await scheduleNext('calendar.sweep', SWEEP_PERIOD_MS);
  return { enqueued: n };
});
