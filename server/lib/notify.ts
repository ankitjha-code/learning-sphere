import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { notifications, notificationDeliveries, users } from '../db/schema';
import { enqueue, registerJob } from '../jobs/queue';
import { emailProvider, sendEmail } from './email';
import { config } from './config';
import { isFeatureEnabled } from '../modules/admin/settings';

/** Categories users can tune in Settings → Notifications. */
export const NOTIFICATION_CATEGORIES = {
  learning: { label: 'Learning & revision reminders', emailDefault: false },
  assignments: { label: 'Assignments, deadlines and grades', emailDefault: true },
  assessments: { label: 'Assessment invitations and results', emailDefault: true },
  career: { label: 'Applications, interviews and offers', emailDefault: true },
  mentorship: { label: 'Mentor requests and sessions', emailDefault: true },
  projects: { label: 'Project reviews and team activity', emailDefault: false },
  community: { label: 'Replies and mentions', emailDefault: false },
  organization: { label: 'Organization announcements', emailDefault: true },
  security: { label: 'Account security alerts', emailDefault: true },
  general: { label: 'Other updates', emailDefault: false },
} as const;
export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;

export async function notify(
  userId: string,
  n: { type: string; category?: NotificationCategory; title: string; body?: string; link?: string; orgId?: string | null; email?: boolean },
) {
  const category = n.category ?? 'general';
  const [user] = await db.select({ email: users.email, prefs: users.preferences, status: users.status }).from(users).where(eq(users.id, userId));
  if (!user || user.status === 'deleted') return null;
  const pref = user.prefs?.notifications?.[category] ?? { inApp: true, email: NOTIFICATION_CATEGORIES[category].emailDefault };

  // Security alerts are always shown in-app.
  const showInApp = pref.inApp !== false || category === 'security';
  const [row] = await db
    .insert(notifications)
    .values({ userId, orgId: n.orgId ?? null, type: n.type, category, title: n.title, body: n.body, link: n.link, readAt: showInApp ? null : new Date() })
    .returning();

  const wantsEmail = n.email !== false && (pref.email || category === 'security') && (category === 'security' || (await isFeatureEnabled('emailNotifications')));
  if (wantsEmail) {
    const provider = emailProvider();
    if (!provider.configured) {
      await db.insert(notificationDeliveries).values({ notificationId: row.id, channel: 'email', status: 'not_configured' });
    } else {
      const [d] = await db.insert(notificationDeliveries).values({ notificationId: row.id, channel: 'email', status: 'queued', provider: provider.provider }).returning();
      await enqueue('email.send', { deliveryId: d.id }, { idempotencyKey: `email:${d.id}`, maxAttempts: 4 });
    }
  }
  return row;
}

registerJob('email.send', async (payload) => {
  const deliveryId = String(payload.deliveryId);
  const [d] = await db.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, deliveryId));
  if (!d || d.status === 'accepted' || d.status === 'captured_locally') return { skipped: true }; // idempotent
  const [n] = await db.select().from(notifications).where(eq(notifications.id, d.notificationId));
  const [u] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, n.userId));
  try {
    const link = n.link ? `${config().APP_URL}${n.link}` : config().APP_URL;
    const result = await sendEmail({
      to: u.email,
      subject: n.title,
      text: `Hi ${u.name},\n\n${n.body ?? n.title}\n\nOpen: ${link}\n\nYou can change email preferences in Settings → Notifications.\n— LearnSphere Nexus`,
    });
    await db
      .update(notificationDeliveries)
      .set({
        status: result.status,
        provider: result.provider,
        providerMessageId: 'messageId' in result ? (result.messageId ?? null) : null,
        attempts: d.attempts + 1,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(notificationDeliveries.id, d.id));
    return { status: result.status };
  } catch (err) {
    await db
      .update(notificationDeliveries)
      .set({ status: d.attempts + 1 >= 4 ? 'failed' : 'retrying', attempts: d.attempts + 1, lastError: String((err as Error).message).slice(0, 500), updatedAt: new Date() })
      .where(eq(notificationDeliveries.id, d.id));
    throw err; // let the queue retry with backoff
  }
});
