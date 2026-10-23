import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { activityEvents, achievements, goals, projects, projectMilestones } from '../../db/schema';
import { computeStreak, minutesSince, startOfWeek } from '../../lib/streak';

/** Day key (YYYY-MM-DD) in a timezone; falls back to UTC for unknown zones. */
export function dayKey(d: Date, tz: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function localHour(d: Date, tz: string) {
  try {
    const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(d);
    return Number(h);
  } catch {
    return d.getUTCHours();
  }
}

export function weekdayOf(key: string) {
  return new Date(`${key}T12:00:00Z`).getUTCDay();
}

// ---------- Levels ----------

/** level = floor(sqrt(xp / 50)). Level 1 at 50 XP, 2 at 200, 3 at 450, 4 at 800 ... */
export function levelFor(xp: number) {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 50));
  const currentLevelAt = 50 * level * level;
  const nextLevelAt = 50 * (level + 1) * (level + 1);
  return {
    level,
    currentLevelAt,
    nextLevelAt,
    toNext: nextLevelAt - xp,
    explanation:
      'Level is the square root of (total XP / 50), rounded down, so each level needs a little more work than the last. XP only comes from substantive, deduplicated work: completing topics with evidence, solving problems, project milestones, accepted answers and completed mentor sessions. Opening pages or repeating the same action never adds XP.',
  };
}

// ---------- Achievements ----------

export type AchievementDef = { key: string; title: string; description: string };

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_topic', title: 'First topic', description: 'Completed your first topic.' },
  { key: 'topics_5', title: 'Five topics', description: 'Completed 5 topics.' },
  { key: 'topics_25', title: 'Twenty-five topics', description: 'Completed 25 topics.' },
  { key: 'first_problem', title: 'First problem solved', description: 'Passed every test on a CodeLab problem.' },
  { key: 'problems_10', title: 'Ten problems', description: 'Solved 10 CodeLab problems.' },
  { key: 'first_milestone', title: 'First project milestone', description: 'Finished a project milestone.' },
  { key: 'project_completed', title: 'Project completed', description: 'Completed a project end to end.' },
  { key: 'streak_7', title: 'Seven-day streak', description: 'Studied on 7 days in a row (rest days do not break it).' },
  { key: 'helpful_answer', title: 'Helpful answer', description: 'One of your community answers was accepted.' },
  { key: 'mentor_session', title: 'Mentor session', description: 'Completed a session with a mentor.' },
];

async function kindCounts(userId: string) {
  const rows = await db
    .select({ kind: activityEvents.kind, n: sql<number>`count(*)::int` })
    .from(activityEvents)
    .where(eq(activityEvents.userId, userId))
    .groupBy(activityEvents.kind);
  return Object.fromEntries(rows.map((r) => [r.kind, r.n])) as Record<string, number>;
}

/**
 * Evaluates every achievement rule for a user and inserts newly earned ones.
 * Idempotent (unique userId+key). Returns the keys awarded by this call.
 */
export async function evaluateAchievements(userId: string, tz = 'UTC', restDays: number[] = []) {
  const [counts, streak, milestoneRows, completedRows, existing] = await Promise.all([
    kindCounts(userId),
    computeStreak(userId, tz, restDays),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(projectMilestones)
      .innerJoin(projects, eq(projects.id, projectMilestones.projectId))
      .where(and(eq(projects.ownerId, userId), eq(projectMilestones.status, 'done'))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(projects)
      .where(and(eq(projects.ownerId, userId), eq(projects.status, 'completed'))),
    db.select({ key: achievements.key }).from(achievements).where(eq(achievements.userId, userId)),
  ]);
  const c = (k: string) => counts[k] ?? 0;
  const topicsDone = c('topic.completed');
  const problems = c('problem.solved');
  const earned: Record<string, boolean> = {
    first_topic: topicsDone >= 1,
    topics_5: topicsDone >= 5,
    topics_25: topicsDone >= 25,
    first_problem: problems >= 1,
    problems_10: problems >= 10,
    first_milestone: c('project.milestone') >= 1 || (milestoneRows[0]?.n ?? 0) >= 1,
    project_completed: c('project.completed') >= 1 || (completedRows[0]?.n ?? 0) >= 1,
    streak_7: streak.longest >= 7 || streak.current >= 7,
    helpful_answer: c('community.answer_accepted') >= 1,
    mentor_session: c('mentor.session') >= 1,
  };
  const have = new Set(existing.map((e) => e.key));
  const toAdd = ACHIEVEMENTS.filter((a) => earned[a.key] && !have.has(a.key));
  if (toAdd.length) {
    await db
      .insert(achievements)
      .values(toAdd.map((a) => ({ userId, key: a.key, title: a.title, description: a.description, verified: true })))
      .onConflictDoNothing();
  }
  return toAdd.map((a) => a.key);
}

// ---------- Goal progress (weekly/daily goals) ----------

export async function goalProgressFor(userId: string, g: typeof goals.$inferSelect) {
  if (!g.metric) return null;
  const since = g.kind === 'daily' ? new Date(new Date().setUTCHours(0, 0, 0, 0)) : startOfWeek();
  if (g.metric.type === 'minutes') return { value: await minutesSince(userId, since), target: g.metric.target };
  const kinds = g.metric.type === 'topics' ? ['topic.completed', 'problem.solved'] : g.metric.type === 'problems' ? ['problem.solved'] : [];
  if (!kinds.length) return null;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(activityEvents)
    .where(and(eq(activityEvents.userId, userId), inArray(activityEvents.kind, kinds), gte(activityEvents.createdAt, since)));
  return { value: n, target: g.metric.target };
}

// ---------- Activity history (for heatmap and personal records) ----------

export async function activityHistory(userId: string, tz: string, days = 400) {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select({ createdAt: activityEvents.createdAt, xp: activityEvents.xp, minutes: activityEvents.minutes, kind: activityEvents.kind })
    .from(activityEvents)
    .where(and(eq(activityEvents.userId, userId), gte(activityEvents.createdAt, since)));
  const byDay = new Map<string, { xp: number; minutes: number; problems: number }>();
  const byWeek = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.createdAt);
    const k = dayKey(d, tz);
    const e = byDay.get(k) ?? { xp: 0, minutes: 0, problems: 0 };
    e.xp += r.xp;
    e.minutes += r.minutes;
    if (r.kind === 'problem.solved') e.problems++;
    byDay.set(k, e);
    const wk = startOfWeek(d).toISOString().slice(0, 10);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + r.xp);
  }
  return { byDay, byWeek };
}

export function weeklyXpSince() {
  return startOfWeek();
}
