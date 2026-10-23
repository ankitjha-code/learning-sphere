import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, sql, or, isNull, gte } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  skills,
  skillPrereqs,
  skillEvidence,
  tracks,
  topics,
  enrollments,
  topicProgress,
  questions,
  goals,
  users,
  activityEvents,
} from '../../db/schema';
import { type AppEnv, requireAuth, rolesIn } from '../../lib/context';
import { body, query, idParam, patchSchema } from '../../lib/validate';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { gradeObjective, publicQuestion, OBJECTIVE_TYPES, round } from '../../lib/grading';
import { recordActivity, XP } from '../../lib/activity';
import { computeStreak, totalXp, minutesSince, startOfWeek } from '../../lib/streak';
import { computeSkillDna, addEvidence } from './skilldna';
import { nextReview } from './srs';
import { recommendationsFor } from './recommend';
import { enrollmentTimeline, suggestTracks } from './planner';
import { issueTrackCertificateIfComplete } from '../portfolio/service';
import { ref } from '../../lib/sql';

export const learningRoutes = new Hono<AppEnv>();

const SOURCE_LABEL: Record<string, string> = {
  self: 'Self-rated',
  assessment: 'Graded assessment',
  practice: 'CodeLab (tested)',
  project: 'Project',
  review: 'Reviewer confirmed',
  course: 'Topic quiz',
  mentor: 'Mentor assessment',
};

/** Tracks visible to a user: global ones plus their organizations' published tracks. */
function visibleTracks(orgIds: string[]) {
  return and(eq(tracks.status, 'published'), orgIds.length ? or(isNull(tracks.orgId), inArray(tracks.orgId, orgIds)) : isNull(tracks.orgId));
}

// ---------- Skill DNA ----------

learningRoutes.get('/skills', async (c) => {
  const auth = requireAuth(c);
  const dna = await computeSkillDna(auth.user.id);
  const counts = dna.reduce<Record<string, number>>((acc, d) => ((acc[d.state] = (acc[d.state] ?? 0) + 1), acc), {});
  return c.json({ skills: dna, counts });
});

learningRoutes.get('/skills/:slug', async (c) => {
  const auth = requireAuth(c);
  const [s] = await db.select().from(skills).where(eq(skills.slug, c.req.param('slug')));
  if (!s) throw notFound('Skill');
  const dna = (await computeSkillDna(auth.user.id)).find((d) => d.skillId === s.id)!;
  const evidence = await db.select().from(skillEvidence).where(and(eq(skillEvidence.userId, auth.user.id), eq(skillEvidence.skillId, s.id))).orderBy(desc(skillEvidence.createdAt));
  const prereqRows = await db.select({ id: skills.id, slug: skills.slug, name: skills.name }).from(skillPrereqs).innerJoin(skills, eq(skills.id, skillPrereqs.prereqId)).where(eq(skillPrereqs.skillId, s.id));
  const unlocks = await db.select({ id: skills.id, slug: skills.slug, name: skills.name }).from(skillPrereqs).innerJoin(skills, eq(skills.id, skillPrereqs.skillId)).where(eq(skillPrereqs.prereqId, s.id));
  const relatedTopics = await db
    .select({ title: topics.title, slug: topics.slug, trackSlug: tracks.slug, trackTitle: tracks.title })
    .from(topics)
    .innerJoin(tracks, eq(tracks.id, topics.trackId))
    .where(and(eq(topics.skillId, s.id), eq(tracks.status, 'published')))
    .limit(10);
  const practice = await db
    .select({ id: questions.id, slug: questions.slug, title: questions.title, difficulty: questions.difficulty, type: questions.type })
    .from(questions)
    .where(and(eq(questions.isPractice, true), eq(questions.status, 'active'), sql`${s.id} = ANY(${questions.skillIds})`))
    .limit(10);
  return c.json({
    skill: s,
    dna,
    prereqs: prereqRows,
    unlocks,
    relatedTopics,
    practice,
    evidence: evidence.map((e) => ({
      id: e.id,
      source: e.source,
      sourceLabel: SOURCE_LABEL[e.source] ?? e.source,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      score: e.score,
      verified: e.verified,
      note: e.note,
      createdAt: e.createdAt,
    })),
  });
});

learningRoutes.post('/skills/self-rate', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ slug: z.string().max(80), level: z.number().int().min(0).max(4) }));
  const [s] = await db.select().from(skills).where(eq(skills.slug, input.slug));
  if (!s) throw notFound('Skill');
  if (input.level === 0) {
    await db.delete(skillEvidence).where(and(eq(skillEvidence.userId, auth.user.id), eq(skillEvidence.skillId, s.id), eq(skillEvidence.source, 'self')));
  } else {
    await addEvidence({ userId: auth.user.id, skillId: s.id, source: 'self', sourceType: 'self', sourceId: 'self', score: input.level / 4, note: 'Self-rated' });
  }
  return c.json({ ok: true });
});

learningRoutes.get('/graph', async (c) => {
  requireAuth(c);
  const [nodes, edges] = await Promise.all([db.select().from(skills).orderBy(asc(skills.category), asc(skills.level)), db.select().from(skillPrereqs)]);
  return c.json({ nodes, edges });
});

// ---------- Tracks ----------

learningRoutes.get('/suggest', async (c) => {
  requireAuth(c);
  const { roles } = query(c, z.object({ roles: z.string().max(500).default('') }));
  const list = await suggestTracks(roles.split(',').map((r) => r.trim()).filter(Boolean), 6);
  return c.json({ tracks: list.map((t) => ({ slug: t.slug, title: t.title, summary: t.summary, level: t.level, estimatedHours: t.estimatedHours, contentStatus: t.contentStatus, category: t.category })) });
});

learningRoutes.get('/tracks', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, z.object({ category: z.string().max(40).optional(), level: z.string().max(20).optional(), q: z.string().max(100).optional() }));
  const orgIds = auth.memberships.map((m) => m.orgId);
  const rows = await db
    .select({
      t: tracks,
      topicCount: sql<number>`(select count(*)::int from topics where topics.track_id = ${ref(tracks.id)})`,
      completed: sql<number>`(select count(*)::int from topic_progress tp join topics tt on tt.id = tp.topic_id where tt.track_id = ${ref(tracks.id)} and tp.user_id = ${auth.user.id} and tp.status = 'completed')`,
    })
    .from(tracks)
    .where(
      and(
        visibleTracks(orgIds),
        q.category ? eq(tracks.category, q.category) : undefined,
        q.level ? eq(tracks.level, q.level) : undefined,
        q.q ? sql`(${tracks.title} ilike ${'%' + q.q + '%'} or ${tracks.summary} ilike ${'%' + q.q + '%'} or array_to_string(${tracks.roles}, ',') ilike ${'%' + q.q + '%'})` : undefined,
      ),
    )
    .orderBy(asc(tracks.category), asc(tracks.title));
  const mine = await db.select().from(enrollments).where(eq(enrollments.userId, auth.user.id));
  const categories = [...new Set(rows.map((r) => r.t.category))];
  return c.json({
    categories,
    tracks: rows.map((r) => ({
      ...r.t,
      topicCount: r.topicCount,
      completedTopics: r.completed,
      enrollment: mine.find((e) => e.trackId === r.t.id) ?? null,
    })),
  });
});

async function loadTrack(slug: string, orgIds: string[]) {
  const [t] = await db.select().from(tracks).where(and(eq(tracks.slug, slug), visibleTracks(orgIds)));
  if (!t) throw notFound('Learning path');
  return t;
}

learningRoutes.get('/tracks/:slug', async (c) => {
  const auth = requireAuth(c);
  const t = await loadTrack(c.req.param('slug'), auth.memberships.map((m) => m.orgId));
  const rows = await db
    .select({ topic: topics, progress: topicProgress, skillName: skills.name, skillSlug: skills.slug })
    .from(topics)
    .leftJoin(topicProgress, and(eq(topicProgress.topicId, topics.id), eq(topicProgress.userId, auth.user.id)))
    .leftJoin(skills, eq(skills.id, topics.skillId))
    .where(eq(topics.trackId, t.id))
    .orderBy(asc(topics.sortOrder));
  const [enrollment] = await db.select().from(enrollments).where(and(eq(enrollments.userId, auth.user.id), eq(enrollments.trackId, t.id)));
  const timeline = enrollment ? await enrollmentTimeline(auth.user.id, t.id, enrollment.weeklyMinutes ?? 300, enrollment.skippedTopicIds) : null;
  const now = Date.now();
  return c.json({
    track: t,
    enrollment: enrollment ?? null,
    timeline,
    topics: rows.map((r) => ({
      id: r.topic.id,
      slug: r.topic.slug,
      title: r.topic.title,
      module: r.topic.module,
      sortOrder: r.topic.sortOrder,
      objectives: r.topic.objectives,
      estimatedMinutes: r.topic.estimatedMinutes,
      isMilestone: r.topic.isMilestone,
      hasQuiz: !!r.topic.quizQuestionIds?.length,
      hasContent: r.topic.body.trim().length > 0,
      skill: r.skillSlug ? { slug: r.skillSlug, name: r.skillName } : null,
      skipped: enrollment?.skippedTopicIds.includes(r.topic.id) ?? false,
      status: r.progress?.status ?? 'not_started',
      mastery: r.progress?.mastery ?? 0,
      reviewDue: !!r.progress?.nextReviewAt && new Date(r.progress.nextReviewAt).getTime() <= now && r.progress.status === 'completed',
      nextReviewAt: r.progress?.nextReviewAt ?? null,
    })),
  });
});

const enrollInput = z.object({
  mode: z.enum(['guided', 'independent', 'intensive', 'interview', 'project_first']).default('guided'),
  weeklyMinutes: z.number().int().min(30).max(4000).optional(),
  targetDate: z.string().datetime().nullable().optional(),
});

learningRoutes.post('/tracks/:slug/enroll', async (c) => {
  const auth = requireAuth(c);
  const t = await loadTrack(c.req.param('slug'), auth.memberships.map((m) => m.orgId));
  const input = await body(c, enrollInput);
  const [row] = await db
    .insert(enrollments)
    .values({ userId: auth.user.id, trackId: t.id, mode: input.mode, weeklyMinutes: input.weeklyMinutes ?? 300, targetDate: input.targetDate ? new Date(input.targetDate) : null })
    .onConflictDoUpdate({ target: [enrollments.userId, enrollments.trackId], set: { status: 'active', mode: input.mode } })
    .returning();
  return c.json({ enrollment: row }, 201);
});

learningRoutes.patch('/enrollments/:id', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const input = await body(
    c,
    patchSchema(enrollInput).extend({
      status: z.enum(['active', 'paused', 'completed']).optional(),
      skipTopicId: z.string().uuid().optional(),
      unskipTopicId: z.string().uuid().optional(),
    }),
  );
  const [e] = await db.select().from(enrollments).where(and(eq(enrollments.id, id), eq(enrollments.userId, auth.user.id)));
  if (!e) throw notFound('Enrollment');
  let skipped = e.skippedTopicIds;
  if (input.skipTopicId) skipped = [...new Set([...skipped, input.skipTopicId])];
  if (input.unskipTopicId) skipped = skipped.filter((x) => x !== input.unskipTopicId);
  const [row] = await db
    .update(enrollments)
    .set({
      ...(input.mode ? { mode: input.mode } : {}),
      ...(input.weeklyMinutes ? { weeklyMinutes: input.weeklyMinutes } : {}),
      ...(input.targetDate !== undefined ? { targetDate: input.targetDate ? new Date(input.targetDate) : null } : {}),
      ...(input.status ? { status: input.status, completedAt: input.status === 'completed' ? new Date() : null } : {}),
      skippedTopicIds: skipped,
    })
    .where(eq(enrollments.id, id))
    .returning();
  return c.json({ enrollment: row });
});

// ---------- Topics ----------

learningRoutes.get('/tracks/:slug/topics/:topic', async (c) => {
  const auth = requireAuth(c);
  const t = await loadTrack(c.req.param('slug'), auth.memberships.map((m) => m.orgId));
  const all = await db.select({ id: topics.id, slug: topics.slug, title: topics.title, sortOrder: topics.sortOrder }).from(topics).where(eq(topics.trackId, t.id)).orderBy(asc(topics.sortOrder));
  const idx = all.findIndex((x) => x.slug === c.req.param('topic'));
  if (idx < 0) throw notFound('Topic');
  const [topic] = await db.select().from(topics).where(eq(topics.id, all[idx].id));
  const [progress] = await db.select().from(topicProgress).where(and(eq(topicProgress.userId, auth.user.id), eq(topicProgress.topicId, topic.id)));
  const order = topic.quizQuestionIds ?? [];
  const quiz = order.length
    ? (await db.select().from(questions).where(inArray(questions.id, order))).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    : [];
  const [skill] = topic.skillId ? await db.select().from(skills).where(eq(skills.id, topic.skillId)) : [];
  return c.json({
    track: { slug: t.slug, title: t.title, contentStatus: t.contentStatus, lastReviewedAt: t.lastReviewedAt },
    topic: {
      id: topic.id,
      slug: topic.slug,
      title: topic.title,
      module: topic.module,
      objectives: topic.objectives,
      body: topic.body,
      estimatedMinutes: topic.estimatedMinutes,
      practice: topic.practice,
      resources: topic.resources,
      completionCriteria: topic.completionCriteria,
      isMilestone: topic.isMilestone,
    },
    skill: skill ? { slug: skill.slug, name: skill.name } : null,
    quiz: quiz.filter((q) => (OBJECTIVE_TYPES as readonly string[]).includes(q.type)).map((q) => publicQuestion(q)),
    progress: progress ?? null,
    prev: idx > 0 ? all[idx - 1] : null,
    next: idx < all.length - 1 ? all[idx + 1] : null,
    position: { index: idx + 1, total: all.length },
  });
});

async function upsertProgress(userId: string, topicId: string, patch: Partial<typeof topicProgress.$inferInsert>) {
  await db
    .insert(topicProgress)
    .values({ userId, topicId, ...patch })
    .onConflictDoUpdate({ target: [topicProgress.userId, topicProgress.topicId], set: patch });
}

learningRoutes.post('/topics/:id/start', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const [topic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, id));
  if (!topic) throw notFound('Topic');
  const [p] = await db.select().from(topicProgress).where(and(eq(topicProgress.userId, auth.user.id), eq(topicProgress.topicId, id)));
  if (!p || p.status === 'not_started') await upsertProgress(auth.user.id, id, { status: 'in_progress', lastActivityAt: new Date() });
  return c.json({ ok: true });
});

/** Study time reported by the client while a topic is open (capped; earns no XP by itself). */
learningRoutes.post('/topics/:id/time', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const { minutes } = await body(c, z.object({ minutes: z.number().int().min(1).max(30) }));
  const [topic] = await db.select({ id: topics.id, title: topics.title, skillId: topics.skillId }).from(topics).where(eq(topics.id, id));
  if (!topic) throw notFound('Topic');
  await db
    .insert(topicProgress)
    .values({ userId: auth.user.id, topicId: id, status: 'in_progress', minutesSpent: minutes, lastActivityAt: new Date() })
    .onConflictDoUpdate({
      target: [topicProgress.userId, topicProgress.topicId],
      set: { minutesSpent: sql`${topicProgress.minutesSpent} + ${minutes}`, lastActivityAt: new Date() },
    });
  await recordActivity(auth.user.id, { kind: 'study.time', label: `Studied ${topic.title}`, minutes, skillIds: topic.skillId ? [topic.skillId] : undefined });
  return c.json({ ok: true });
});

learningRoutes.post('/topics/:id/quiz', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const input = await body(c, z.object({ answers: z.record(z.string(), z.unknown()), review: z.boolean().optional() }));
  const [topic] = await db.select().from(topics).where(eq(topics.id, id));
  if (!topic) throw notFound('Topic');
  if (!topic.quizQuestionIds?.length) throw badRequest('This topic has no quiz.');
  const qs = await db.select().from(questions).where(inArray(questions.id, topic.quizQuestionIds));
  let score = 0;
  let max = 0;
  const results = qs.map((q) => {
    const g = gradeObjective(q.type, q.content, q.answerKey, input.answers[q.id], q.points);
    score += g.score ?? 0;
    max += q.points;
    return { questionId: q.id, score: g.score, max: q.points, correct: (g.score ?? 0) >= q.points, correctAnswer: q.answerKey.correct ?? q.answerKey.accepted ?? null, explanation: q.answerKey.explanation ?? null };
  });
  const ratio = max ? score / max : 0;
  const [p] = await db.select().from(topicProgress).where(and(eq(topicProgress.userId, auth.user.id), eq(topicProgress.topicId, id)));
  const wasCompleted = p?.status === 'completed';
  const now = new Date();
  const reviewDue = !!p && (p.status === 'needs_revision' || (wasCompleted && !!p.nextReviewAt && new Date(p.nextReviewAt) <= now));
  const passed = ratio >= 0.7;

  // Passing a quiz again before it is due is practice only: no schedule change, no XP.
  // Failing it is real evidence of forgetting, so the topic goes back into revision.
  const practiceOnly = wasCompleted && !reviewDue && passed;
  const srs = nextReview({ reviewCount: p?.reviewCount ?? 0, easeFactor: p?.easeFactor ?? 2.5, intervalDays: p?.intervalDays ?? 0 }, ratio);
  const status = practiceOnly ? 'completed' : passed ? 'completed' : wasCompleted || reviewDue ? 'needs_revision' : 'in_progress';
  if (!practiceOnly) {
    await upsertProgress(auth.user.id, id, {
      status,
      mastery: round(p ? Math.max(ratio, p.mastery * 0.5 + ratio * 0.5) : ratio),
      reviewCount: srs.reviewCount,
      easeFactor: srs.easeFactor,
      intervalDays: srs.intervalDays,
      nextReviewAt: srs.nextReviewAt,
      lastActivityAt: now,
      completedAt: passed && !wasCompleted ? now : (p?.completedAt ?? null),
    });
  } else {
    await upsertProgress(auth.user.id, id, { lastActivityAt: now });
  }

  // Quiz evidence: deterministic but low-stakes and repeatable, so it is not "verified".
  if (topic.skillId) {
    await addEvidence({ userId: auth.user.id, skillId: topic.skillId, source: 'course', sourceType: 'topic_quiz', sourceId: topic.id, score: ratio, verified: false, note: `Quiz on "${topic.title}": ${Math.round(ratio * 100)}%` });
  }
  if (passed && !wasCompleted) {
    await recordActivity(auth.user.id, { kind: 'topic.completed', label: `Completed ${topic.title}`, xp: XP.topicCompleted, skillIds: topic.skillId ? [topic.skillId] : undefined, dedupeKey: `topic:${topic.id}` });
    await issueTrackCertificateIfComplete(auth.user.id, topic.trackId);
  } else if (reviewDue) {
    const day = now.toISOString().slice(0, 10);
    await recordActivity(auth.user.id, { kind: 'revision.done', label: `Reviewed ${topic.title}`, xp: passed ? XP.revisionDone : 0, dedupeKey: `review:${topic.id}:${day}` });
  }
  const [after] = await db.select().from(topicProgress).where(and(eq(topicProgress.userId, auth.user.id), eq(topicProgress.topicId, id)));
  return c.json({ score: round(score), max, ratio: round(ratio), passed, status: after?.status ?? status, practiceOnly, nextReviewAt: after?.nextReviewAt ?? srs.nextReviewAt, intervalDays: after?.intervalDays ?? srs.intervalDays, results });
});

/** For topics without a quiz: completion needs a written reflection (self-reported, not verified). */
learningRoutes.post('/topics/:id/complete', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const { reflection } = await body(c, z.object({ reflection: z.string().trim().min(40, 'Write at least a few sentences about what you learned.').max(4000) }));
  const [topic] = await db.select().from(topics).where(eq(topics.id, id));
  if (!topic) throw notFound('Topic');
  if (topic.quizQuestionIds?.length) throw badRequest('Pass the topic quiz to complete this topic.');
  const srs = nextReview({ reviewCount: 0, easeFactor: 2.5, intervalDays: 0 }, 0.7);
  await upsertProgress(auth.user.id, id, { status: 'completed', mastery: 0.5, completedAt: new Date(), lastActivityAt: new Date(), reviewCount: srs.reviewCount, intervalDays: srs.intervalDays, nextReviewAt: srs.nextReviewAt });
  if (topic.skillId) await addEvidence({ userId: auth.user.id, skillId: topic.skillId, source: 'course', sourceType: 'topic_reflection', sourceId: topic.id, score: 0.5, weight: 0.5, note: `Reflection on "${topic.title}"` });
  await recordActivity(auth.user.id, { kind: 'topic.completed', label: `Completed ${topic.title}`, xp: XP.topicCompleted, skillIds: topic.skillId ? [topic.skillId] : undefined, dedupeKey: `topic:${topic.id}` });
  await issueTrackCertificateIfComplete(auth.user.id, topic.trackId);
  return c.json({ ok: true, reflectionSaved: reflection.length });
});

// ---------- Recommendations & revision ----------

learningRoutes.get('/recommendations', async (c) => {
  const auth = requireAuth(c);
  const dismissed = ((auth.user.preferences as { dismissedRecs?: string[] }).dismissedRecs ?? []) as string[];
  return c.json({ recommendations: await recommendationsFor(auth.user.id, dismissed) });
});

learningRoutes.post('/recommendations/dismiss', async (c) => {
  const auth = requireAuth(c);
  const { id, restoreAll } = await body(c, z.object({ id: z.string().max(120).optional(), restoreAll: z.boolean().optional() }));
  const [u] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, auth.user.id));
  const prev = ((u.preferences as { dismissedRecs?: string[] }).dismissedRecs ?? []) as string[];
  const dismissedRecs = restoreAll ? [] : id ? [...new Set([...prev, id])].slice(-200) : prev;
  await db.update(users).set({ preferences: { ...u.preferences, dismissedRecs } as typeof u.preferences }).where(eq(users.id, auth.user.id));
  return c.json({ ok: true });
});

learningRoutes.get('/revision', async (c) => {
  const auth = requireAuth(c);
  const rows = await db
    .select({ topicId: topics.id, title: topics.title, slug: topics.slug, trackSlug: tracks.slug, trackTitle: tracks.title, status: topicProgress.status, nextReviewAt: topicProgress.nextReviewAt, mastery: topicProgress.mastery, intervalDays: topicProgress.intervalDays })
    .from(topicProgress)
    .innerJoin(topics, eq(topics.id, topicProgress.topicId))
    .innerJoin(tracks, eq(tracks.id, topics.trackId))
    .where(and(eq(topicProgress.userId, auth.user.id), inArray(topicProgress.status, ['completed', 'needs_revision'])))
    .orderBy(asc(topicProgress.nextReviewAt));
  const now = Date.now();
  return c.json({
    due: rows.filter((r) => r.status === 'needs_revision' || (r.nextReviewAt && new Date(r.nextReviewAt).getTime() <= now)),
    upcoming: rows.filter((r) => r.status === 'completed' && r.nextReviewAt && new Date(r.nextReviewAt).getTime() > now).slice(0, 20),
  });
});

// ---------- Goals ----------

const goalInput = z.object({
  title: z.string().trim().min(2).max(200),
  kind: z.enum(['career', 'milestone', 'weekly', 'daily']).default('milestone'),
  targetDate: z.string().datetime().nullable().optional(),
  metric: z.object({ type: z.enum(['minutes', 'topics', 'problems', 'custom']), target: z.number().int().min(1).max(100000) }).nullable().optional(),
});

async function goalProgress(userId: string, g: typeof goals.$inferSelect) {
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

learningRoutes.get('/goals', async (c) => {
  const auth = requireAuth(c);
  const rows = await db.select().from(goals).where(eq(goals.userId, auth.user.id)).orderBy(asc(goals.sortOrder), asc(goals.createdAt));
  const withProgress = await Promise.all(rows.map(async (g) => ({ ...g, progress: await goalProgress(auth.user.id, g) })));
  return c.json({ goals: withProgress });
});

learningRoutes.post('/goals', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, goalInput);
  const [row] = await db
    .insert(goals)
    .values({ userId: auth.user.id, title: input.title, kind: input.kind, targetDate: input.targetDate ? new Date(input.targetDate) : null, metric: input.metric ?? null, createdBy: auth.user.id })
    .returning();
  return c.json({ goal: row }, 201);
});

learningRoutes.patch('/goals/:id', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const input = await body(c, patchSchema(goalInput).extend({ status: z.enum(['active', 'done', 'dropped']).optional() }));
  const [row] = await db
    .update(goals)
    .set({
      ...(input.title ? { title: input.title } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.targetDate !== undefined ? { targetDate: input.targetDate ? new Date(input.targetDate) : null } : {}),
      ...(input.metric !== undefined ? { metric: input.metric } : {}),
      ...(input.status ? { status: input.status, completedAt: input.status === 'done' ? new Date() : null } : {}),
    })
    .where(and(eq(goals.id, id), eq(goals.userId, auth.user.id)))
    .returning();
  if (!row) throw notFound('Goal');
  return c.json({ goal: row });
});

learningRoutes.delete('/goals/:id', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const res = await db.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, auth.user.id))).returning({ id: goals.id });
  if (!res.length) throw notFound('Goal');
  return c.json({ ok: true });
});

// ---------- Dashboard summary ----------

learningRoutes.get('/dashboard', async (c) => {
  const auth = requireAuth(c);
  const uid = auth.user.id;
  const prefs = auth.user.preferences as { restDays?: number[] };
  const [streak, xp, weekMinutes, dna, enrolled, recent] = await Promise.all([
    computeStreak(uid, auth.user.timezone, prefs.restDays ?? []),
    totalXp(uid),
    minutesSince(uid, startOfWeek()),
    computeSkillDna(uid),
    db
      .select({
        e: enrollments,
        t: tracks,
        total: sql<number>`(select count(*)::int from topics where topics.track_id = ${ref(tracks.id)})`,
        done: sql<number>`(select count(*)::int from topic_progress tp join topics tt on tt.id = tp.topic_id where tt.track_id = ${ref(tracks.id)} and tp.user_id = ${uid} and tp.status = 'completed')`,
      })
      .from(enrollments)
      .innerJoin(tracks, eq(tracks.id, enrollments.trackId))
      .where(and(eq(enrollments.userId, uid), eq(enrollments.status, 'active'))),
    db.select().from(activityEvents).where(eq(activityEvents.userId, uid)).orderBy(desc(activityEvents.createdAt)).limit(8),
  ]);
  const due = dna.reduce((n, d) => n + d.dueRevisions, 0);
  return c.json({
    streak,
    xp,
    weekMinutes,
    dueRevisions: due,
    skillCounts: {
      verified: dna.filter((d) => d.state === 'verified').length,
      demonstrated: dna.filter((d) => d.state === 'demonstrated').length,
      learning: dna.filter((d) => d.state === 'learning').length,
      needsRevision: dna.filter((d) => d.state === 'needs_revision').length,
      selfDeclared: dna.filter((d) => d.state === 'self_declared').length,
    },
    enrollments: enrolled.map((r) => ({ id: r.e.id, mode: r.e.mode, weeklyMinutes: r.e.weeklyMinutes, track: { slug: r.t.slug, title: r.t.title, category: r.t.category }, total: r.total, done: r.done })),
    recent,
  });
});

export function assertTrackEditor(c: Parameters<typeof requireAuth>[0], orgId: string | null) {
  const auth = requireAuth(c);
  if (!orgId) {
    if (auth.user.platformRole !== 'platform_admin') throw forbidden('Only platform admins can edit global learning paths.');
    return;
  }
  const roles = rolesIn(auth, orgId);
  if (!roles.some((r) => ['creator', 'faculty', 'faculty_admin', 'org_admin'].includes(r))) throw forbidden('You need a creator or faculty role in this organization.');
}
