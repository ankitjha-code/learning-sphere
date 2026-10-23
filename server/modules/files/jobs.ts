import { and, eq, lt, isNotNull } from 'drizzle-orm';
import { db } from '../../db/client';
import { files } from '../../db/schema';
import { registerJob } from '../../jobs/queue';
import { scheduleNext } from './recurring';

/** Hourly: expired files (e.g. 7-day data exports) lose their bytes. Safe to run repeatedly. */
registerJob('files.cleanup', async () => {
  const res = await db
    .update(files)
    .set({ status: 'deleted', data: null })
    .where(and(eq(files.status, 'ready'), isNotNull(files.expiresAt), lt(files.expiresAt, new Date())))
    .returning({ id: files.id });
  await scheduleNext('files.cleanup', 3600_000);
  return { expired: res.length };
});
