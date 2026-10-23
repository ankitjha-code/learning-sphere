/** Local copy of NOTIFICATION_CATEGORIES (server/lib/notify.ts), keys and labels only. */
export const NOTIFICATION_CATEGORIES = {
  learning: 'Learning & revision reminders',
  assignments: 'Assignments, deadlines and grades',
  assessments: 'Assessment invitations and results',
  career: 'Applications, interviews and offers',
  mentorship: 'Mentor requests and sessions',
  projects: 'Project reviews and team activity',
  community: 'Replies and mentions',
  organization: 'Organization announcements',
  security: 'Account security alerts',
  general: 'Other updates',
} as const;

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;

export const CATEGORY_KEYS = Object.keys(NOTIFICATION_CATEGORIES) as NotificationCategory[];

/** Short labels for badges. */
export const CATEGORY_SHORT: Record<NotificationCategory, string> = {
  learning: 'Learning',
  assignments: 'Assignments',
  assessments: 'Assessments',
  career: 'Career',
  mentorship: 'Mentorship',
  projects: 'Projects',
  community: 'Community',
  organization: 'Organization',
  security: 'Security',
  general: 'General',
};

export function categoryShort(key: string) {
  return CATEGORY_SHORT[key as NotificationCategory] ?? key;
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/**
 * Honest email delivery labels. "accepted" only means the provider accepted the
 * message, never that it reached the inbox.
 */
export function emailStatus(status: string): { label: string; tone: Tone; hint: string } {
  switch (status) {
    case 'accepted':
      return { label: 'Email accepted by provider', tone: 'success', hint: 'The email provider accepted the message. This does not confirm it was delivered to your inbox.' };
    case 'captured_locally':
      return { label: 'Captured by local dev mailbox', tone: 'info', hint: 'Email is not sent in this environment. The message was captured by the local development mailbox.' };
    case 'failed':
      return { label: 'Email failed', tone: 'danger', hint: 'The email could not be sent after several attempts. The in-app notification is unaffected.' };
    case 'not_configured':
      return { label: 'Email not configured', tone: 'warning', hint: 'No email provider is configured on this server, so no email was sent.' };
    case 'queued':
    case 'retrying':
      return { label: 'Email queued', tone: 'neutral', hint: status === 'retrying' ? 'A previous attempt failed. Sending will be retried.' : 'The email is waiting to be sent.' };
    case 'skipped':
      return { label: 'Email skipped', tone: 'neutral', hint: 'No email was sent for this notification.' };
    default:
      return { label: `Email ${status.replace(/_/g, ' ')}`, tone: 'neutral', hint: 'Email delivery status reported by the server.' };
  }
}
