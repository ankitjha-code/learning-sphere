import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { tracks, enrollments, goals, profiles, topics, topicProgress } from '../../db/schema';
import { addEvidence, skillIdsBySlug } from './skilldna';

const STYLE_TO_MODE: Record<string, string> = {
  guided: 'guided',
  independent: 'independent',
  project_first: 'project_first',
  intensive: 'intensive',
  interview: 'interview',
};

/** Pick tracks for stated target roles. Explicit choices win; otherwise match track.roles. */
export async function suggestTracks(targetRoles: string[], limit = 3) {
  const all = await db.select().from(tracks).where(and(eq(tracks.status, 'published'), sql`${tracks.orgId} is null`));
  const roles = targetRoles.map((r) => r.toLowerCase());
  const scored = all
    .map((t) => {
      const tr = t.roles.map((r) => r.toLowerCase());
      const hits = roles.filter((r) => tr.some((x) => x.includes(r) || r.includes(x))).length;
      return { t, score: hits * 10 + (t.contentStatus === 'complete' ? 3 : 0) + (t.level === 'beginner' ? 1 : 0) };
    })
    .filter((x) => x.score >= 10)
    .sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, limit).map((x) => x.t);
  if (!picked.length) {
    const fallback = all.find((t) => t.slug === 'programming-foundations-python') ?? all[0];
    if (fallback) picked.push(fallback);
  }
  return picked;
}

export async function generateInitialPlan(userId: string, opts: { selfRatedSkills: { slug: string; level: number }[]; trackSlugs?: string[] }) {
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  const targetRoles = profile?.targetRoles ?? [];

  // 1) Self-ratings become self-declared evidence (low weight, never verified).
  const ids = await skillIdsBySlug(opts.selfRatedSkills.map((s) => s.slug));
  for (const s of opts.selfRatedSkills) {
    const skillId = ids.get(s.slug);
    if (skillId) await addEvidence({ userId, skillId, source: 'self', sourceType: 'self', sourceId: 'onboarding', score: s.level / 4, note: 'Self-rated during onboarding' });
  }

  // 2) Enroll in chosen or suggested tracks.
  let chosen = opts.trackSlugs?.length
    ? await db.select().from(tracks).where(inArray(tracks.slug, opts.trackSlugs))
    : await suggestTracks(targetRoles);
  chosen = chosen.slice(0, 3);
  const mode = STYLE_TO_MODE[profile?.learningStyle ?? 'guided'] ?? 'guided';
  const weeklyMinutes = (profile?.weeklyHours ?? 6) * 60;
  for (const t of chosen) {
    await db
      .insert(enrollments)
      .values({ userId, trackId: t.id, mode, weeklyMinutes: Math.round(weeklyMinutes / chosen.length), targetDate: profile?.targetDate ?? null })
      .onConflictDoNothing();
  }

  // 3) Topics for skills the learner rated "advanced" (4) are suggested as skippable, not auto-skipped.
  const strongSkillIds = opts.selfRatedSkills.filter((s) => s.level >= 4).map((s) => ids.get(s.slug)).filter(Boolean) as string[];

  // 4) Goals: one career goal, one milestone per track, a weekly time goal, a daily habit.
  const existing = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.userId, userId), eq(goals.source, 'plan_generator')));
  if (!existing.length) {
    let order = 0;
    const role = targetRoles[0];
    if (role) {
      await db.insert(goals).values({
        userId,
        title: `Become job-ready for ${role}`,
        kind: 'career',
        targetDate: profile?.targetDate ?? null,
        source: 'plan_generator',
        sortOrder: order++,
      });
    }
    for (const t of chosen) {
      const milestones = await db
        .select({ id: topics.id, title: topics.title })
        .from(topics)
        .where(and(eq(topics.trackId, t.id), eq(topics.isMilestone, true)))
        .orderBy(asc(topics.sortOrder));
      await db.insert(goals).values({
        userId,
        title: `Complete ${t.title}`,
        kind: 'milestone',
        trackId: t.id,
        source: 'plan_generator',
        sortOrder: order++,
        targetDate: projectedFinish(t.estimatedHours ?? 20, weeklyMinutes / chosen.length),
      });
      for (const m of milestones.slice(0, 3)) {
        await db.insert(goals).values({ userId, title: `Milestone: ${m.title}`, kind: 'milestone', trackId: t.id, source: 'plan_generator', sortOrder: order++ });
      }
    }
    await db.insert(goals).values({ userId, title: `Study ${Math.round(weeklyMinutes / 60)} hours this week`, kind: 'weekly', metric: { type: 'minutes', target: weeklyMinutes }, source: 'plan_generator', sortOrder: order++ });
    await db.insert(goals).values({ userId, title: 'Finish one topic or solve one problem a day', kind: 'daily', metric: { type: 'topics', target: 1 }, source: 'plan_generator', sortOrder: order++ });
  }

  const skippable = strongSkillIds.length
    ? await db
        .select({ id: topics.id, title: topics.title, trackId: topics.trackId })
        .from(topics)
        .where(and(inArray(topics.trackId, chosen.map((t) => t.id)), inArray(topics.skillId, strongSkillIds)))
    : [];

  return {
    tracks: chosen.map((t) => ({ slug: t.slug, title: t.title, reason: targetRoles.length ? `Matches your target role${targetRoles.length > 1 ? 's' : ''}: ${targetRoles.join(', ')}` : 'A strong starting point for most goals' })),
    weeklyMinutes,
    mode,
    skippableTopics: skippable.map((s) => ({ id: s.id, title: s.title, reason: 'You rated this skill as advanced. Pass its quiz to skip it with evidence.' })),
  };
}

export function projectedFinish(estimatedHours: number, weeklyMinutes: number, from = new Date()) {
  const weeks = Math.ceil((estimatedHours * 60) / Math.max(30, weeklyMinutes));
  return new Date(from.getTime() + weeks * 7 * 86400_000);
}

/** Remaining minutes and projected completion per enrollment. */
export async function enrollmentTimeline(userId: string, trackId: string, weeklyMinutes: number, skipped: string[]) {
  const rows = await db
    .select({ id: topics.id, title: topics.title, minutes: topics.estimatedMinutes, isMilestone: topics.isMilestone, sortOrder: topics.sortOrder, status: topicProgress.status })
    .from(topics)
    .leftJoin(topicProgress, and(eq(topicProgress.topicId, topics.id), eq(topicProgress.userId, userId)))
    .where(eq(topics.trackId, trackId))
    .orderBy(asc(topics.sortOrder));
  const perWeek = Math.max(30, weeklyMinutes);
  let cumulative = 0;
  const now = Date.now();
  const milestones: { topicId: string; title: string; projectedAt: string; done: boolean }[] = [];
  let remaining = 0;
  for (const r of rows) {
    const done = r.status === 'completed' || skipped.includes(r.id);
    if (!done) {
      cumulative += r.minutes;
      remaining += r.minutes;
    }
    if (r.isMilestone) {
      milestones.push({ topicId: r.id, title: r.title, done, projectedAt: new Date(now + (cumulative / perWeek) * 7 * 86400_000).toISOString() });
    }
  }
  return { remainingMinutes: remaining, projectedCompletion: new Date(now + (remaining / perWeek) * 7 * 86400_000).toISOString(), milestones };
}

