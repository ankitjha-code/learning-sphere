import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { activityEvents } from '../db/schema';

function dayKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * Streak of active days ending today (or yesterday, so the streak is not "lost"
 * before the learner had a chance to study today). Chosen rest days never break
 * a streak, and they do not count towards it either.
 */
export async function computeStreak(userId: string, tz = 'UTC', restDays: number[] = []) {
  const since = new Date(Date.now() - 400 * 86400_000);
  const rows = await db
    .select({ createdAt: activityEvents.createdAt, xp: activityEvents.xp, minutes: activityEvents.minutes })
    .from(activityEvents)
    .where(and(eq(activityEvents.userId, userId), gte(activityEvents.createdAt, since), sql`(${activityEvents.xp} > 0 OR ${activityEvents.minutes} > 0)`));
  const active = new Set(rows.map((r) => dayKey(new Date(r.createdAt), tz)));
  let current = 0;
  let longest = 0;
  let run = 0;
  const today = new Date();
  // current streak
  for (let i = 0; i < 400; i++) {
    const d = new Date(today.getTime() - i * 86400_000);
    const key = dayKey(d, tz);
    const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
    if (active.has(key)) current++;
    else if (restDays.includes(weekday)) continue;
    else if (i === 0) continue; // today not done yet
    else break;
  }
  // longest streak over the window
  for (let i = 399; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400_000);
    const key = dayKey(d, tz);
    const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
    if (active.has(key)) {
      run++;
      longest = Math.max(longest, run);
    } else if (!restDays.includes(weekday)) run = 0;
  }
  return { current, longest, activeToday: active.has(dayKey(today, tz)), activeDays: [...active].sort().slice(-120) };
}

export async function totalXp(userId: string) {
  const [{ xp }] = await db.select({ xp: sql<number>`coalesce(sum(${activityEvents.xp}), 0)::int` }).from(activityEvents).where(eq(activityEvents.userId, userId));
  return xp;
}

export async function minutesSince(userId: string, since: Date) {
  const [{ m }] = await db
    .select({ m: sql<number>`coalesce(sum(${activityEvents.minutes}), 0)::int` })
    .from(activityEvents)
    .where(and(eq(activityEvents.userId, userId), gte(activityEvents.createdAt, since)));
  return m;
}

export function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCHours(0, 0, 0, 0);
  return new Date(x.getTime() - day * 86400_000);
}
