import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../client';
import { skills, skillPrereqs, tracks, topics, questions, questionVersions, projectTemplates } from '../schema';
import type { QuestionContent, AnswerKey } from '../schema/assessment';
import { SKILLS } from './content/skills';
import { ALL_TRACKS } from './content/tracks';
import { ALL_PROBLEMS } from './content/problems';
import { PROJECT_TEMPLATES } from './content/projects';
import type { SeedQuestion, SeedProblem } from './content/types';

/** Date the built-in library content was last reviewed (shown to learners). */
export const CONTENT_REVIEWED_AT = new Date('2026-10-22T00:00:00Z');
export const CODING_LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'go', 'rust'];
const POINTS = { easy: 10, medium: 20, hard: 30 } as const;

async function upsertQuestion(slug: string, data: { type: string; title: string; content: QuestionContent; answerKey: AnswerKey; difficulty: string; topics: string[]; skillIds: string[]; points: number; isPractice: boolean; source?: string }) {
  const [existing] = await db.select().from(questions).where(eq(questions.slug, slug));
  if (!existing) {
    const [row] = await db
      .insert(questions)
      .values({ slug, orgId: null, ownerId: null, visibility: 'public', status: 'active', ...data })
      .returning({ id: questions.id });
    return row.id;
  }
  const changed = JSON.stringify(existing.content) !== JSON.stringify(data.content) || JSON.stringify(existing.answerKey) !== JSON.stringify(data.answerKey) || existing.points !== data.points;
  if (changed) {
    await db.insert(questionVersions).values({ questionId: existing.id, version: existing.version, content: existing.content, answerKey: existing.answerKey, points: existing.points });
  }
  await db
    .update(questions)
    .set({ ...data, version: changed ? existing.version + 1 : existing.version, updatedAt: new Date() })
    .where(eq(questions.id, existing.id));
  return existing.id;
}

function quizToQuestion(q: SeedQuestion) {
  const content: QuestionContent = { prompt: q.prompt, options: q.options, pairs: q.pairs, blanks: q.type === 'fill_blank' ? (q.accepted?.length ?? 1) : undefined };
  const answerKey: AnswerKey = { correct: q.correct, accepted: q.accepted, matches: q.matches, explanation: q.explanation };
  return { content, answerKey };
}

export function problemToQuestion(p: SeedProblem) {
  const content: QuestionContent =
    p.type === 'sql'
      ? { prompt: p.prompt, schemaSql: p.schemaSql, orderMatters: p.orderMatters ?? false, languages: ['sql'], hints: p.hints, constraints: p.constraints }
      : {
          prompt: p.prompt,
          constraints: p.constraints,
          languages: CODING_LANGUAGES,
          starterCode: p.starterCode as Record<string, string>,
          visibleTests: p.visibleTests,
          timeLimitMs: p.timeLimitMs ?? 2000,
          memoryLimitMb: 256,
          hints: p.hints,
        };
  const answerKey: AnswerKey =
    p.type === 'sql'
      ? { seedSql: p.seedSql, solutionSql: p.solutionSql, explanation: p.explanation }
      : { hiddenTests: p.hiddenTests, modelAnswer: p.solutions?.python, explanation: p.explanation };
  return { content, answerKey };
}

export async function seedReference() {
  // Skills and prerequisites
  for (const s of SKILLS) {
    await db
      .insert(skills)
      .values({ slug: s.slug, name: s.name, category: s.category, level: s.level, description: s.description })
      .onConflictDoUpdate({ target: skills.slug, set: { name: s.name, category: s.category, level: s.level, description: s.description } });
  }
  const skillRows = await db.select({ id: skills.id, slug: skills.slug }).from(skills);
  const skillId = new Map(skillRows.map((r) => [r.slug, r.id]));
  await db.delete(skillPrereqs);
  const prereqValues = SKILLS.flatMap((s) => (s.prereqs ?? []).map((p) => ({ skillId: skillId.get(s.slug)!, prereqId: skillId.get(p)! }))).filter((v) => v.skillId && v.prereqId);
  if (prereqValues.length) await db.insert(skillPrereqs).values(prereqValues).onConflictDoNothing();

  // Practice problems (CodeLab) are questions with isPractice = true.
  for (const p of ALL_PROBLEMS) {
    const { content, answerKey } = problemToQuestion(p);
    await upsertQuestion(p.slug, {
      type: p.type,
      title: p.title,
      content,
      answerKey,
      difficulty: p.difficulty,
      topics: p.topics,
      skillIds: p.skills.map((s) => skillId.get(s)).filter(Boolean) as string[],
      points: POINTS[p.difficulty],
      isPractice: true,
      source: p.source,
    });
  }

  // Tracks, topics and topic quizzes
  for (const t of ALL_TRACKS) {
    const trackValues = {
      title: t.title,
      category: t.category,
      summary: t.summary,
      description: t.description,
      level: t.level,
      estimatedHours: t.estimatedHours,
      roles: t.roles,
      contentStatus: t.contentStatus,
      status: 'published',
      lastReviewedAt: CONTENT_REVIEWED_AT,
      updatedAt: new Date(),
    };
    const [existingTrack] = await db.select({ id: tracks.id }).from(tracks).where(and(eq(tracks.slug, t.slug), isNull(tracks.orgId)));
    const trackId = existingTrack
      ? (await db.update(tracks).set(trackValues).where(eq(tracks.id, existingTrack.id)).returning({ id: tracks.id }))[0].id
      : (await db.insert(tracks).values({ slug: t.slug, ...trackValues }).returning({ id: tracks.id }))[0].id;

    for (const [i, topic] of t.topics.entries()) {
      const quizIds: string[] = [];
      for (const q of topic.quiz ?? []) {
        const { content, answerKey } = quizToQuestion(q);
        quizIds.push(
          await upsertQuestion(`quiz:${t.slug}:${topic.slug}:${q.key}`, {
            type: q.type,
            title: q.title,
            content,
            answerKey,
            difficulty: q.difficulty ?? 'easy',
            topics: [topic.slug],
            skillIds: [skillId.get(topic.skill)].filter(Boolean) as string[],
            points: 1,
            isPractice: false,
          }),
        );
      }
      const values = {
        skillId: skillId.get(topic.skill) ?? null,
        title: topic.title,
        module: topic.module,
        sortOrder: i + 1,
        objectives: topic.objectives,
        body: topic.body,
        estimatedMinutes: topic.minutes,
        practice: topic.practice,
        resources: topic.resources,
        quizQuestionIds: quizIds.length ? quizIds : null,
        completionCriteria: topic.completionCriteria ?? (quizIds.length ? 'Score 70% or more on the topic quiz.' : 'Write a short reflection on what you learned.'),
        isMilestone: !!topic.milestone,
      };
      await db
        .insert(topics)
        .values({ trackId, slug: topic.slug, ...values })
        .onConflictDoUpdate({ target: [topics.trackId, topics.slug], set: values });
    }
  }

  // Project templates
  for (const p of PROJECT_TEMPLATES) {
    const values = {
      title: p.title,
      category: p.category,
      difficulty: p.difficulty,
      summary: p.summary,
      problem: p.problem,
      intendedUsers: p.intendedUsers,
      objectives: p.objectives,
      requirements: p.requirements,
      milestones: p.milestones,
      skillSlugs: p.skillSlugs,
      trackSlugs: p.trackSlugs,
      estimatedHours: p.estimatedHours,
      isCapstone: !!p.isCapstone,
    };
    await db.insert(projectTemplates).values({ slug: p.slug, ...values }).onConflictDoUpdate({ target: projectTemplates.slug, set: values });
  }

  await (await import('./resources-seed')).seedLibraryResources();
  await (await import('./diagnostics')).seedDiagnostics();
  return { skills: SKILLS.length, tracks: ALL_TRACKS.length, problems: ALL_PROBLEMS.length, templates: PROJECT_TEMPLATES.length };
}

export async function questionIdsBySlug(slugs: string[]) {
  if (!slugs.length) return new Map<string, string>();
  const rows = await db.select({ id: questions.id, slug: questions.slug }).from(questions).where(inArray(questions.slug, slugs));
  return new Map(rows.map((r) => [r.slug!, r.id]));
}
