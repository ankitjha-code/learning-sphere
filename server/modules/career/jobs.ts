// Background job handlers for the career module.
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { applications, applicationReminders } from '../../db/schema';
import { registerJob } from '../../jobs/queue';
import { notify } from '../../lib/notify';
import { logEvent } from './service';

/**
 * Follow-up reminder for a tracked application. Fires at most once per (application, dueAt):
 * skipped when the reminder was rescheduled or cleared, and de-duplicated by a unique row.
 */
registerJob('career.reminder', async (payload) => {
  const applicationId = String(payload.applicationId);
  const dueAt = new Date(String(payload.dueAt));
  const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
  if (!app) return { skipped: 'deleted' };
  if (!app.nextActionAt || new Date(app.nextActionAt).getTime() !== dueAt.getTime()) return { skipped: 'rescheduled' };
  if (app.status === 'rejected' || app.status === 'withdrawn' || app.status === 'accepted') return { skipped: 'closed' };
  const [sent] = await db.insert(applicationReminders).values({ applicationId, userId: app.userId, dueAt }).onConflictDoNothing().returning();
  if (!sent) return { skipped: 'already_sent' };
  await notify(app.userId, {
    type: 'career.reminder',
    category: 'career',
    title: `Follow up: ${app.role} at ${app.company}`,
    body: app.notes ? `Your note: ${app.notes.slice(0, 200)}` : 'You set a reminder to take the next step on this application.',
    link: `/app/career/applications?open=${app.id}`,
  });
  await logEvent(app.id, { kind: 'reminder', note: 'Follow-up reminder sent' });
  return { sent: true };
});
