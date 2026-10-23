// Background job handlers for the campus module.
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { driveCandidates, placementDrives } from '../../db/schema';
import { registerJob } from '../../jobs/queue';
import { notify } from '../../lib/notify';

/**
 * Reminds invited (not yet registered) candidates 24 hours before a drive's registration deadline.
 * Idempotent: skipped when the drive is no longer open or its deadline changed since scheduling
 * (a new job is scheduled for the new deadline), and each run only targets candidates still invited.
 */
registerJob('campus.deadline_reminder', async (payload) => {
  const driveId = String(payload.driveId);
  const [d] = await db.select().from(placementDrives).where(eq(placementDrives.id, driveId));
  if (!d || d.status !== 'open' || !d.registrationDeadline || d.registrationDeadline.toISOString() !== String(payload.deadline)) return { skipped: true };
  if (d.registrationDeadline.getTime() < Date.now()) return { skipped: true, reason: 'deadline passed' };
  const invited = await db.select({ userId: driveCandidates.userId }).from(driveCandidates).where(and(eq(driveCandidates.driveId, d.id), eq(driveCandidates.stage, 'invited')));
  for (const c of invited) {
    await notify(c.userId, {
      type: 'campus.deadline_reminder',
      category: 'career',
      orgId: d.orgId,
      title: `Registration closes soon: ${d.title}`,
      body: `Register or decline by ${d.registrationDeadline.toUTCString()}.`,
      link: '/app/placements',
    });
  }
  return { reminded: invited.length };
});
