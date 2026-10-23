import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { attemptAnswers, regradeRequests, skills } from '../../db/schema';
import { attemptState } from '../../db/schema/assessment-ext';
import type { AuthContext } from '../../lib/context';
import { publicQuestion } from '../../lib/grading';
import { type Assessment, type Question, canEditQuestion, settingsOf } from './access';
import { type Attempt, type ResolvedQuestion, resolveQuestions, effectiveTimeLimitMinutes } from './engine';

/** A question as an author sees it. The answer key only goes to people who may edit the question. */
export function authorQuestion(auth: AuthContext, q: Question) {
  const editable = canEditQuestion(auth, q);
  return {
    id: q.id,
    orgId: q.orgId,
    type: q.type,
    title: q.title,
    content: q.content,
    answerKey: editable ? q.answerKey : null,
    keyHidden: !editable,
    difficulty: q.difficulty,
    topics: q.topics,
    skillIds: q.skillIds,
    points: q.points,
    version: q.version,
    status: q.status,
    visibility: q.visibility,
    isPractice: q.isPractice,
    slug: q.slug,
    source: q.source,
    editable,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

/** Correct answer for objective types, shown only after release when the assessment allows it. */
export function correctAnswerOf(q: ResolvedQuestion): unknown {
  switch (q.type) {
    case 'single':
    case 'true_false':
    case 'multi':
      return q.answerKey.correct ?? null;
    case 'fill_blank':
      return q.answerKey.accepted ?? null;
    case 'matching':
      return q.answerKey.matches ?? null;
    default:
      return null;
  }
}

/** Grading detail safe for the candidate (no answer key, no hidden test data). */
function candidateDetail(d: Record<string, unknown> | null | undefined) {
  if (!d) return null;
  const { needsReview, reason, passed, total, results, message, execStatus, provider, language, columns, rows, hits, wrong, of, right, correct, aiAssisted } = d as Record<string, unknown>;
  return { needsReview, reason, passed, total, results, message, execStatus, provider, language, columns, rows, hits, wrong, of, right, correct, aiAssisted };
}

/** What a candidate sees while taking an attempt: public questions only. */
export async function candidateAttemptView(at: Attempt, a: Assessment, invite: { accommodations?: { extraTimePercent?: number; note?: string } } | null) {
  const s = settingsOf(a);
  const resolved = await resolveQuestions(at.items);
  const [answers, [state]] = await Promise.all([
    db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, at.id)),
    db.select().from(attemptState).where(eq(attemptState.attemptId, at.id)),
  ]);
  const byQ = new Map(answers.map((x) => [x.questionId, x]));
  return {
    serverTime: new Date().toISOString(),
    attempt: {
      id: at.id,
      assessmentId: at.assessmentId,
      attemptNo: at.attemptNo,
      status: at.status,
      startedAt: at.startedAt,
      deadlineAt: at.deadlineAt,
      submittedAt: at.submittedAt,
      autoSubmitted: at.autoSubmitted,
    },
    assessment: {
      id: a.id,
      title: a.title,
      mode: a.mode,
      timeLimitMinutes: effectiveTimeLimitMinutes(a, invite as never),
      sections: s.sections ?? [],
      proctoringNote: s.proctoringNote ?? null,
    },
    accommodations: invite?.accommodations ?? {},
    items: at.items.map((it, index) => {
      const q = resolved.get(it.questionId);
      return {
        index,
        itemId: it.itemId,
        points: it.points,
        question: q ? publicQuestion({ ...q, points: it.points }, { optionOrder: it.optionOrder }) : null,
      };
    }),
    answers: Object.fromEntries(at.items.map((it) => [it.questionId, byQ.get(it.questionId)?.answer ?? null])),
    savedAt: Object.fromEntries(at.items.map((it) => [it.questionId, byQ.get(it.questionId)?.savedAt ?? null])),
    state: { flagged: state?.flagged ?? [], currentIndex: state?.currentIndex ?? 0, meta: state?.meta ?? {} },
  };
}

/** Released result for the candidate. */
export async function candidateResultView(at: Attempt, a: Assessment) {
  const s = settingsOf(a);
  const resolved = await resolveQuestions(at.items);
  const answers = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, at.id));
  const byQ = new Map(answers.map((x) => [x.questionId, x]));
  const regrades = answers.length
    ? await db
        .select()
        .from(regradeRequests)
        .where(and(eq(regradeRequests.subjectType, 'attempt_answer'), inArray(regradeRequests.subjectId, answers.map((x) => x.id))))
    : [];
  const percent = at.maxScore ? Math.round(((at.score ?? 0) / at.maxScore) * 1000) / 10 : 0;
  const skillAgg = new Map<string, { score: number; max: number }>();
  for (const it of at.items) {
    const ans = byQ.get(it.questionId);
    const q = resolved.get(it.questionId);
    if (!ans || ans.finalScore === null) continue;
    for (const sid of q?.skillIds.length ? q.skillIds : a.skillIds) {
      const e = skillAgg.get(sid) ?? { score: 0, max: 0 };
      e.score += ans.finalScore;
      e.max += ans.maxPoints;
      skillAgg.set(sid, e);
    }
  }
  const skillRows = skillAgg.size ? await db.select({ id: skills.id, slug: skills.slug, name: skills.name }).from(skills).where(inArray(skills.id, [...skillAgg.keys()])) : [];
  return {
    released: true as const,
    attempt: { id: at.id, attemptNo: at.attemptNo, status: at.status, startedAt: at.startedAt, submittedAt: at.submittedAt, releasedAt: at.releasedAt, autoSubmitted: at.autoSubmitted },
    assessment: {
      id: a.id,
      title: a.title,
      mode: a.mode,
      passingScore: s.passingScore ?? null,
      allowRegradeRequests: !!s.allowRegradeRequests,
      showAnswersAfterRelease: !!s.showAnswersAfterRelease,
    },
    score: at.score,
    maxScore: at.maxScore,
    percent,
    passed: s.passingScore != null ? percent >= s.passingScore : null,
    items: at.items.map((it, index) => {
      const q = resolved.get(it.questionId);
      const ans = byQ.get(it.questionId);
      const rg = ans ? regrades.filter((r) => r.subjectId === ans.id).sort((x, y) => +y.createdAt - +x.createdAt)[0] : undefined;
      return {
        index,
        answerId: ans?.id ?? null,
        question: q ? publicQuestion({ ...q, points: it.points }, { optionOrder: it.optionOrder }) : null,
        answer: ans?.answer ?? null,
        score: ans?.finalScore ?? null,
        maxPoints: it.points,
        correct: ans?.finalScore !== null && ans?.finalScore !== undefined ? ans.finalScore >= it.points : false,
        gradingMethod: ans?.gradingMethod ?? null,
        feedback: ans?.feedback ?? null,
        detail: candidateDetail(ans?.gradingDetail),
        correctAnswer: s.showAnswersAfterRelease && q ? correctAnswerOf(q) : undefined,
        explanation: s.showAnswersAfterRelease && q ? (q.answerKey.explanation ?? null) : undefined,
        regrade: rg ? { id: rg.id, status: rg.status, reason: rg.reason, previousScore: rg.previousScore, newScore: rg.newScore, resolutionNote: rg.resolutionNote, createdAt: rg.createdAt, resolvedAt: rg.resolvedAt } : null,
      };
    }),
    skills: skillRows.map((r) => {
      const e = skillAgg.get(r.id)!;
      return { skillId: r.id, slug: r.slug, name: r.name, ratio: e.max ? Math.round((e.score / e.max) * 1000) / 1000 : 0 };
    }),
  };
}
