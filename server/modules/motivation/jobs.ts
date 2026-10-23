import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { users, activityEvents, studyReminderLog } from '../../db/schema';
import { enqueue, registerJob } from '../../jobs/queue';
import { notify } from '../../lib/notify';
import { dayKey, localHour, weekdayOf } from './service';

/** Reminders go out in the learner's evening (local time), never at night. */
const REMINDER_FROM_HOUR = 17;
const REMINDER_UNTIL_HOUR = 21;

const COPY = [
  { title: 'A good moment for a short study session', body: 'Even 15 minutes keeps things fresh. If today is not the day, that is completely fine too.' },
  { title: 'Your next lesson is ready when you are', body: 'Pick up where you left off, or review one topic. No pressure.' },
  { title: 'A small step today?', body: 'One problem or one topic is plenty. Rest is part of learning as well.' },
];

function hourKey(d: Date) {
  return d.toISOString().slice(0, 13); // YYYY-MM-DDTHH (UTC)
}

let scheduledFor: string | null = null;

/** Makes sure the hourly reminder job exists for the current hour (idempotent, cheap). */
export async function ensureReminderSchedule(now = new Date()) {
  const key = hourKey(now);
  if (scheduledFor === key) return;
  await enqueue('motivation.reminders', {}, { idempotencyKey: `motivation.reminders:${key}`, maxAttempts: 2 });
  scheduledFor = key;
}

/**
 * Sends gentle study reminders to users who turned them on, have not studied today
 * (in their timezone), and are not on a chosen rest day. At most one per user per day:
 * the (userId, day) primary key on study_reminder_log is the guarantee.
 */
export async function runStudyReminders(opts: { now?: Date; ignoreLocalHour?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const candidates = await db
    .select({ id: users.id, timezone: users.timezone, preferences: users.preferences })
    .from(users)
    .where(and(eq(users.status, 'active'), sql`(${users.preferences}->>'studyReminders') = 'true'`));
  let sent = 0;
  let skippedRest = 0;
  let skippedStudied = 0;
  for (const u of candidates) {
    const tz = u.timezone || 'UTC';
    const hour = localHour(now, tz);
    if (!opts.ignoreLocalHour && (hour < REMINDER_FROM_HOUR || hour > REMINDER_UNTIL_HOUR)) continue;
    const day = dayKey(now, tz);
    if ((u.preferences.restDays ?? []).includes(weekdayOf(day))) {
      skippedRest++;
      continue;
    }
    const recent = await db
      .select({ createdAt: activityEvents.createdAt })
      .from(activityEvents)
      .where(and(eq(activityEvents.userId, u.id), gte(activityEvents.createdAt, new Date(now.getTime() - 36 * 3600_000)), sql`(${activityEvents.xp} > 0 OR ${activityEvents.minutes} > 0)`));
    if (recent.some((r) => dayKey(new Date(r.createdAt), tz) === day)) {
      skippedStudied++;
      continue;
    }
    const [logged] = await db.insert(studyReminderLog).values({ userId: u.id, day }).onConflictDoNothing().returning();
    if (!logged) continue; // already reminded today
    const copy = COPY[weekdayOf(day) % COPY.length];
    await notify(u.id, {
      type: 'motivation.reminder',
      category: 'learning',
      title: copy.title,
      body: `${copy.body} You can turn reminders off or set rest days in Goals.`,
      link: '/app/goals',
      email: false,
    });
    sent++;
  }
  return { sent, skippedRest, skippedStudied, candidates: candidates.length };
}

registerJob('motivation.reminders', async (payload) => {
  const result = await runStudyReminders({ ignoreLocalHour: payload.ignoreLocalHour === true, now: typeof payload.now === 'string' ? new Date(payload.now) : undefined });
  // Self-scheduling: queue the next hourly run (idempotent per hour).
  if (payload.reschedule !== false) {
    const next = new Date(Date.now() + 3600_000);
    next.setUTCMinutes(0, 0, 0);
    await enqueue('motivation.reminders', {}, { idempotencyKey: `motivation.reminders:${hourKey(next)}`, runAt: next, maxAttempts: 2 });
  }
  return result;
});
