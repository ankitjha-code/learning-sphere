import { and, asc, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { assessments, assessmentItems, assessmentInvites, attempts, attemptAnswers, questions, questionVersions, users } from '../../db/schema';
import type { AnswerKey, QuestionContent } from '../../db/schema/assessment';
import { gradeObjective, OBJECTIVE_TYPES, round, shuffle } from '../../lib/grading';
import { runCode, runSql, type ExecLanguage, type ExecTest } from '../../exec';
import { conflict, badRequest } from '../../lib/errors';
import { enqueue } from '../../jobs/queue';
import { notify } from '../../lib/notify';
import { recordActivity, XP } from '../../lib/activity';
import { addEvidence } from '../learning/skilldna';
import { type Assessment, type Question, settingsOf, isPersonal } from './access';
import { questionPublishProblems, type ExtSettings } from './schemas';

export type Attempt = typeof attempts.$inferSelect;
export type AttemptItem = Attempt['items'][number];
export type Answer = typeof attemptAnswers.$inferSelect;
type Invite = typeof assessmentInvites.$inferSelect;

/** Saves arriving this long after the deadline are still accepted (network latency). */
export const SAVE_GRACE_MS = 5_000;
/** Background auto-submit runs this long after a deadline. */
const AUTOSUBMIT_BUFFER_MS = 30_000;

export const MANUAL_ONLY_TYPES = ['short_text', 'long_text', 'file', 'oral'];

// ---------- Question versions ----------

export type ResolvedQuestion = Question & { content: QuestionContent; answerKey: AnswerKey; versionUsed: number };

/** Loads questions at the exact versions frozen into an attempt or assessment. */
export async function resolveQuestions(refs: { questionId: string; questionVersion: number }[]): Promise<Map<string, ResolvedQuestion>> {
  const ids = [...new Set(refs.map((r) => r.questionId))];
  if (!ids.length) return new Map();
  const qs = await db.select().from(questions).where(inArray(questions.id, ids));
  const stale = refs.filter((r) => qs.find((q) => q.id === r.questionId)?.version !== r.questionVersion);
  const versions = stale.length
    ? await db.select().from(questionVersions).where(inArray(questionVersions.questionId, [...new Set(stale.map((s) => s.questionId))]))
    : [];
  const out = new Map<string, ResolvedQuestion>();
  for (const r of refs) {
    const q = qs.find((x) => x.id === r.questionId);
    if (!q) continue;
    if (q.version === r.questionVersion) {
      out.set(r.questionId, { ...q, versionUsed: q.version });
      continue;
    }
    const v = versions.find((x) => x.questionId === q.id && x.version === r.questionVersion);
    out.set(r.questionId, v ? { ...q, content: v.content, answerKey: v.answerKey, points: v.points, versionUsed: v.version } : { ...q, versionUsed: q.version });
  }
  return out;
}

// ---------- Blueprint & publish checklist ----------

type BlueprintRow = NonNullable<ExtSettings['blueprint']>[number];

/** Questions a blueprint row may draw from: same-org active questions plus the public bank. */
export function blueprintWhere(a: Pick<Assessment, 'orgId'>, row: BlueprintRow, exclude: string[] = []) {
  return and(
    eq(questions.status, 'active'),
    a.orgId ? or(eq(questions.orgId, a.orgId), and(isNull(questions.orgId), eq(questions.visibility, 'public'))) : and(isNull(questions.orgId), eq(questions.visibility, 'public')),
    row.topic ? sql`${row.topic} = ANY(${questions.topics})` : undefined,
    row.difficulty ? eq(questions.difficulty, row.difficulty) : undefined,
    row.type ? eq(questions.type, row.type) : undefined,
    exclude.length ? notInArray(questions.id, exclude) : undefined,
  );
}

export type Checklist = { ready: boolean; problems: string[]; warnings: string[]; itemCount: number; blueprintCount: number; totalPoints: number };

export async function publishChecklist(a: Assessment): Promise<Checklist> {
  const s = settingsOf(a);
  const problems: string[] = [];
  const warnings: string[] = [];
  const items = await db
    .select({ item: assessmentItems, q: questions })
    .from(assessmentItems)
    .innerJoin(questions, eq(questions.id, assessmentItems.questionId))
    .where(eq(assessmentItems.assessmentId, a.id));
  const blueprint = s.blueprint ?? [];
  const blueprintCount = blueprint.reduce((n, r) => n + r.count, 0);
  if (!items.length && !blueprintCount) problems.push('Add at least one question or a blueprint rule.');
  for (const { q } of items) problems.push(...questionPublishProblems(q));
  const fixedIds = items.map((i) => i.q.id);
  let totalPoints = items.reduce((n, i) => n + i.item.points, 0);
  for (const [i, row] of blueprint.entries()) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(questions).where(blueprintWhere(a, row, fixedIds));
    if (n < row.count) problems.push(`Blueprint rule ${i + 1} needs ${row.count} questions but only ${n} match.`);
    totalPoints += row.points !== undefined ? row.points * row.count : 0;
  }
  if (items.some(({ q }) => MANUAL_ONLY_TYPES.includes(q.type)) && s.resultRelease === 'immediate')
    warnings.push('Written, file and oral answers need a reviewer, so those results release after grading.');
  if (items.some(({ q }) => q.type === 'coding' || q.type === 'sql')) warnings.push('Coding and SQL answers are graded by running them. If no sandbox is available they go to manual review.');
  if ((a.mode === 'recruitment' || a.mode === 'placement' || a.mode === 'classroom') && a.orgId && !a.cohortId) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(assessmentInvites).where(eq(assessmentInvites.assessmentId, a.id));
    if (!n) warnings.push(a.mode === 'classroom' ? 'Nobody can take it yet: choose a cohort or invite students.' : 'Nobody can take it yet: invite candidates after publishing.');
  }
  if (s.availableUntil && new Date(s.availableUntil).getTime() < Date.now()) problems.push('The availability window has already ended.');
  if (s.resultRelease === 'after_close' && !s.availableUntil) warnings.push('Results release when you close the assessment (no end date is set).');
  return { ready: problems.length === 0, problems, warnings, itemCount: items.length, blueprintCount, totalPoints };
}

/** Freezes the current question versions into every item, then publishes. */
export async function publishAssessment(a: Assessment) {
  const items = await db.select({ id: assessmentItems.id, v: questions.version }).from(assessmentItems).innerJoin(questions, eq(questions.id, assessmentItems.questionId)).where(eq(assessmentItems.assessmentId, a.id));
  for (const it of items) await db.update(assessmentItems).set({ questionVersion: it.v }).where(eq(assessmentItems.id, it.id));
  const [row] = await db
    .update(assessments)
    .set({ status: 'published', publishedAt: new Date(), version: a.status === 'draft' ? a.version : a.version + 1, updatedAt: new Date() })
    .where(eq(assessments.id, a.id))
    .returning();
  const s = settingsOf(row);
  if (s.resultRelease === 'after_close' && s.availableUntil) {
    await enqueue('assessments.release_after_close', { assessmentId: a.id }, { idempotencyKey: `assessments.release_after_close:${a.id}:${s.availableUntil}`, runAt: new Date(new Date(s.availableUntil).getTime() + 60_000), orgId: a.orgId });
  }
  return row;
}

// ---------- Taking ----------

export function windowState(a: Assessment, invite: Invite | null): { open: boolean; reason?: string; closesAt: string | null } {
  const s = settingsOf(a);
  const now = Date.now();
  const until = invite?.dueAt ? invite.dueAt.toISOString() : (s.availableUntil ?? null);
  if (a.status !== 'published') return { open: false, reason: a.status === 'closed' ? 'This assessment is closed.' : 'This assessment is not open.', closesAt: until };
  if (s.availableFrom && new Date(s.availableFrom).getTime() > now) return { open: false, reason: `Opens ${new Date(s.availableFrom).toISOString()}.`, closesAt: until };
  if (until && new Date(until).getTime() <= now) return { open: false, reason: 'The availability window has ended.', closesAt: until };
  return { open: true, closesAt: until };
}

export function effectiveTimeLimitMinutes(a: Assessment, invite: Invite | null) {
  const base = settingsOf(a).timeLimitMinutes;
  if (!base) return null;
  const extra = invite?.accommodations?.extraTimePercent ?? 0;
  return round(base * (1 + extra / 100), 2);
}

async function drawItems(a: Assessment): Promise<AttemptItem[]> {
  const s = settingsOf(a);
  const fixed = await db.select().from(assessmentItems).where(eq(assessmentItems.assessmentId, a.id)).orderBy(asc(assessmentItems.sortOrder));
  const items: AttemptItem[] = fixed.map((i) => ({ itemId: i.id, questionId: i.questionId, questionVersion: i.questionVersion, points: i.points }));
  const taken = items.map((i) => i.questionId);
  for (const [ri, row] of (s.blueprint ?? []).entries()) {
    const pool = await db.select({ id: questions.id, version: questions.version, points: questions.points }).from(questions).where(blueprintWhere(a, row, taken));
    if (pool.length < row.count) throw conflict(`Not enough questions in the bank for blueprint rule ${ri + 1}. Ask the author to adjust it.`);
    for (const q of shuffle(pool).slice(0, row.count)) {
      items.push({ itemId: `bp:${ri}:${q.id}`, questionId: q.id, questionVersion: q.version, points: row.points ?? q.points });
      taken.push(q.id);
    }
  }
  const ordered = s.shuffleQuestions ? shuffle(items) : items;
  if (s.shuffleOptions) {
    const resolved = await resolveQuestions(ordered);
    for (const it of ordered) {
      const opts = resolved.get(it.questionId)?.content.options;
      if (opts && opts.length > 1) it.optionOrder = shuffle(opts.map((o) => o.id));
    }
  }
  return ordered;
}

/** Auto-submits an in-progress attempt whose deadline has passed. Returns the fresh row. */
export async function expireIfDue(at: Attempt): Promise<Attempt> {
  if (at.status !== 'in_progress' || !at.deadlineAt) return at;
  if (Date.now() <= at.deadlineAt.getTime() + SAVE_GRACE_MS) return at;
  return (await submitAttempt(at, { auto: true })).attempt;
}

export async function startAttempt(userId: string, a: Assessment, invite: Invite | null): Promise<{ attempt: Attempt; created: boolean }> {
  const existing = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.assessmentId, a.id), eq(attempts.userId, userId), eq(attempts.status, 'in_progress')));
  for (const at of existing) {
    const fresh = await expireIfDue(at);
    if (fresh.status === 'in_progress') return { attempt: fresh, created: false };
  }
  const w = windowState(a, invite);
  if (!w.open) throw conflict(w.reason ?? 'This assessment is not open.', { code: 'window_closed' });
  const s = settingsOf(a);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(attempts).where(and(eq(attempts.assessmentId, a.id), eq(attempts.userId, userId)));
  if (s.maxAttempts && n >= s.maxAttempts) throw conflict(`You have used all ${s.maxAttempts} attempt${s.maxAttempts === 1 ? '' : 's'}.`, { code: 'no_attempts_left' });

  const items = await drawItems(a);
  const now = Date.now();
  const limit = effectiveTimeLimitMinutes(a, invite);
  let deadline: number | null = limit ? now + limit * 60_000 : null;
  if (w.closesAt) deadline = Math.min(deadline ?? Infinity, new Date(w.closesAt).getTime());
  const [row] = await db
    .insert(attempts)
    .values({ assessmentId: a.id, userId, orgId: a.orgId, attemptNo: n + 1, status: 'in_progress', items, deadlineAt: deadline ? new Date(deadline) : null })
    .returning();

  // Two concurrent starts: keep the earliest in-progress attempt, discard the other.
  const racing = await db
    .select({ id: attempts.id, startedAt: attempts.startedAt })
    .from(attempts)
    .where(and(eq(attempts.assessmentId, a.id), eq(attempts.userId, userId), eq(attempts.status, 'in_progress')))
    .orderBy(asc(attempts.startedAt), asc(attempts.id));
  if (racing.length > 1 && racing[0].id !== row.id) {
    await db.delete(attempts).where(eq(attempts.id, row.id));
    const [winner] = await db.select().from(attempts).where(eq(attempts.id, racing[0].id));
    return { attempt: winner, created: false };
  }

  if (invite && invite.status === 'invited') await db.update(assessmentInvites).set({ status: 'started' }).where(eq(assessmentInvites.id, invite.id));
  if (row.deadlineAt) await scheduleAutosubmit(row.id, row.deadlineAt, a.orgId);
  return { attempt: row, created: true };
}

/** One background auto-submit per attempt and deadline (a moved deadline gets its own job). */
export async function scheduleAutosubmit(attemptId: string, deadlineAt: Date, orgId: string | null) {
  await enqueue('assessments.autosubmit', { attemptId }, { idempotencyKey: `assessments.autosubmit:${attemptId}:${deadlineAt.getTime()}`, runAt: new Date(deadlineAt.getTime() + AUTOSUBMIT_BUFFER_MS), orgId });
}

/** Idempotent: a second submit (any key) returns the already-submitted attempt. */
export async function submitAttempt(at: Attempt, opts: { auto?: boolean; submitKey?: string }): Promise<{ attempt: Attempt; alreadySubmitted: boolean }> {
  const [row] = await db
    .update(attempts)
    .set({ status: 'submitted', submittedAt: new Date(), autoSubmitted: !!opts.auto, submitKey: opts.submitKey ?? null })
    .where(and(eq(attempts.id, at.id), eq(attempts.status, 'in_progress')))
    .returning();
  if (!row) {
    const [cur] = await db.select().from(attempts).where(eq(attempts.id, at.id));
    return { attempt: cur, alreadySubmitted: true };
  }
  await db
    .update(assessmentInvites)
    .set({ status: 'completed' })
    .where(and(eq(assessmentInvites.assessmentId, row.assessmentId), eq(assessmentInvites.userId, row.userId), ne(assessmentInvites.status, 'revoked')));
  await enqueue('assessments.grade', { attemptId: row.id }, { idempotencyKey: `assessments.grade:${row.id}`, orgId: row.orgId, maxAttempts: 5 });
  return { attempt: row, alreadySubmitted: false };
}

// ---------- Grading ----------

type GradeOutcome = { autoScore: number | null; finalScore: number | null; method: 'deterministic' | 'execution' | 'manual' | 'pending'; detail: Record<string, unknown> };

const isEmpty = (a: Record<string, unknown> | null | undefined, type: string) => {
  if (!a) return true;
  if (type === 'coding') return !String(a.code ?? '').trim();
  if (type === 'sql') return !String(a.query ?? '').trim();
  if (type === 'file') return !String(a.link ?? a.text ?? '').trim();
  if (MANUAL_ONLY_TYPES.includes(type)) return !String(a.text ?? '').trim();
  return false;
};

async function gradeOne(q: ResolvedQuestion, answer: Record<string, unknown> | null, points: number): Promise<GradeOutcome> {
  if ((OBJECTIVE_TYPES as readonly string[]).includes(q.type)) {
    const r = gradeObjective(q.type, q.content, q.answerKey, answer, points);
    return { autoScore: r.score, finalScore: r.score, method: 'deterministic', detail: r.detail };
  }
  if (isEmpty(answer, q.type)) return { autoScore: 0, finalScore: 0, method: 'deterministic', detail: { reason: 'No answer was submitted.' } };

  if (q.type === 'coding') {
    const langs = q.content.languages ?? [];
    const language = (typeof answer!.language === 'string' && langs.includes(answer!.language) ? answer!.language : langs[0]) as ExecLanguage;
    const visible = (q.content.visibleTests ?? []).map((t) => ({ ...t, hidden: false }));
    const hidden = (q.answerKey.hiddenTests ?? []).map((t) => ({ ...t, hidden: true }));
    const tests: ExecTest[] = [...visible, ...hidden];
    const r = await runCode({ language, code: String(answer!.code), tests, timeLimitMs: q.content.timeLimitMs, memoryLimitMb: q.content.memoryLimitMb });
    if (r.status === 'unavailable' || r.status === 'error' || r.total === 0) {
      return {
        autoScore: null,
        finalScore: null,
        method: 'pending',
        detail: { needsReview: true, provider: r.provider, execStatus: r.status, reason: `Automatic grading could not run this ${language} answer (${r.message ?? r.status}). A reviewer needs to grade it.` },
      };
    }
    // Weighted partial credit (visible tests weigh 1; hidden tests may carry a weight).
    let wTotal = 0;
    let wPassed = 0;
    r.results.forEach((res, i) => {
      const w = tests[i]?.weight ?? 1;
      wTotal += w;
      if (res.passed) wPassed += w;
    });
    const ratio = wTotal > 0 && r.results.length === tests.length ? wPassed / wTotal : r.passed / (r.total || 1);
    const score = round(points * ratio);
    return {
      autoScore: score,
      finalScore: score,
      method: 'execution',
      detail: {
        provider: r.provider,
        execStatus: r.status,
        language,
        passed: r.passed,
        total: r.total,
        message: r.message,
        compileOutput: r.compileOutput?.slice(0, 4000),
        // Hidden tests keep only pass/fail; visible tests keep their input/output.
        results: r.results.map((t) => (t.hidden ? { name: t.name, hidden: true, passed: t.passed, status: t.status, timeMs: t.timeMs } : t)),
      },
    };
  }

  if (q.type === 'sql') {
    const r = await runSql({
      schemaSql: q.content.schemaSql ?? '',
      seedSql: q.answerKey.seedSql ?? '',
      query: String(answer!.query),
      solutionSql: q.answerKey.solutionSql ?? '',
      orderMatters: !!q.content.orderMatters,
    });
    if (r.status === 'unavailable' || r.status === 'error') {
      return { autoScore: null, finalScore: null, method: 'pending', detail: { needsReview: true, provider: r.provider, execStatus: r.status, reason: `Automatic SQL grading could not run (${r.message ?? r.status}). A reviewer needs to grade it.` } };
    }
    const ok = r.status === 'accepted';
    return {
      autoScore: ok ? points : 0,
      finalScore: ok ? points : 0,
      method: 'execution',
      detail: { provider: r.provider, execStatus: r.status, message: r.message, columns: r.columns, rows: r.rows?.slice(0, 20) },
    };
  }

  return { autoScore: null, finalScore: null, method: 'pending', detail: { needsReview: true, reason: 'Needs review by an instructor or reviewer.' } };
}

/**
 * Grades a submitted attempt. Idempotent and safe to retry: answer rows are
 * upserted on (attemptId, questionId), human scores are never overwritten, and
 * attempts already past grading are skipped.
 */
export async function gradeAttempt(attemptId: string): Promise<{ status: string; skipped?: boolean }> {
  const [at] = await db.select().from(attempts).where(eq(attempts.id, attemptId));
  if (!at) return { status: 'missing', skipped: true };
  if (at.status !== 'submitted' && at.status !== 'grading') return { status: at.status, skipped: true };
  await db.update(attempts).set({ status: 'grading' }).where(eq(attempts.id, at.id));

  const resolved = await resolveQuestions(at.items);
  const existing = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, at.id));
  for (const item of at.items) {
    const q = resolved.get(item.questionId);
    const prev = existing.find((e) => e.questionId === item.questionId);
    if (prev && prev.manualScore !== null) continue; // a human already decided
    if (!q) {
      await upsertAnswer(at.id, item.questionId, item.points, { autoScore: null, finalScore: null, method: 'pending', detail: { needsReview: true, reason: 'The question no longer exists.' } });
      continue;
    }
    const outcome = await gradeOne(q, (prev?.answer as Record<string, unknown> | null) ?? null, item.points);
    await upsertAnswer(at.id, item.questionId, item.points, outcome);
  }
  return recomputeAttempt(at.id, { fromGrader: true });
}

async function upsertAnswer(attemptId: string, questionId: string, maxPoints: number, o: GradeOutcome) {
  const set = { autoScore: o.autoScore, finalScore: o.finalScore, gradingMethod: o.method, gradingDetail: o.detail, maxPoints, gradedAt: o.finalScore !== null ? new Date() : null };
  await db
    .insert(attemptAnswers)
    .values({ attemptId, questionId, answer: null, ...set })
    .onConflictDoUpdate({ target: [attemptAnswers.attemptId, attemptAnswers.questionId], set });
}

/** Recomputes the attempt score/status from its answers and releases per policy. */
export async function recomputeAttempt(attemptId: string, opts: { fromGrader?: boolean } = {}): Promise<{ status: string }> {
  const [at] = await db.select().from(attempts).where(eq(attempts.id, attemptId));
  if (!at || at.status === 'in_progress') return { status: at?.status ?? 'missing' };
  // Until the grading job has run, only the grader may move the attempt forward.
  if ((at.status === 'submitted' || at.status === 'grading') && !opts.fromGrader) return { status: at.status };
  const answers = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attemptId));
  const byQ = new Map(answers.map((a) => [a.questionId, a]));
  const maxScore = round(at.items.reduce((n, i) => n + i.points, 0));
  const allScored = at.items.every((i) => byQ.get(i.questionId)?.finalScore !== null && byQ.get(i.questionId)?.finalScore !== undefined);
  const score = allScored ? round(at.items.reduce((n, i) => n + (byQ.get(i.questionId)?.finalScore ?? 0), 0)) : null;

  if (at.status === 'released') {
    if (allScored && score !== at.score) {
      await db.update(attempts).set({ score, maxScore }).where(eq(attempts.id, at.id));
      await recordEvidence({ ...at, score, maxScore });
    }
    return { status: 'released' };
  }
  if (!allScored) {
    await db.update(attempts).set({ status: 'needs_review', maxScore, score: null }).where(eq(attempts.id, at.id));
    return { status: 'needs_review' };
  }
  await db.update(attempts).set({ status: 'graded', score, maxScore, gradedAt: new Date() }).where(eq(attempts.id, at.id));
  const [a] = await db.select().from(assessments).where(eq(assessments.id, at.assessmentId));
  if (a && shouldReleaseNow(a)) {
    await releaseAttempt(at.id);
    return { status: 'released' };
  }
  return { status: 'graded' };
}

export function shouldReleaseNow(a: Assessment) {
  const s = settingsOf(a);
  if (s.resultRelease === 'immediate') return true;
  if (s.resultRelease === 'after_close') return a.status === 'closed' || a.status === 'archived' || (!!s.availableUntil && new Date(s.availableUntil).getTime() <= Date.now());
  return false;
}

/** Releases one graded attempt: notifies the candidate and records Skill DNA evidence (once). */
export async function releaseAttempt(attemptId: string): Promise<boolean> {
  const [row] = await db
    .update(attempts)
    .set({ status: 'released', releasedAt: new Date() })
    .where(and(eq(attempts.id, attemptId), eq(attempts.status, 'graded')))
    .returning();
  if (!row) return false;
  const [a] = await db.select().from(assessments).where(eq(assessments.id, row.assessmentId));
  const percent = row.maxScore ? Math.round(((row.score ?? 0) / row.maxScore) * 100) : 0;
  await recordEvidence(row);
  const s = settingsOf(a);
  const passed = s.passingScore != null ? percent >= s.passingScore : percent >= 50;
  if (passed) {
    await recordActivity(row.userId, {
      kind: 'assessment_passed',
      label: `Scored ${percent}% on ${a.title}`,
      link: `/app/assessments/attempts/${row.id}/result`,
      xp: XP.assessmentSubmitted,
      skillIds: a.skillIds,
      dedupeKey: `assessment:${row.id}`,
      orgId: a.orgId,
    });
  }
  await notify(row.userId, {
    type: 'assessment.result_released',
    category: 'assessments',
    title: `Results released: ${a.title}`,
    body: `You scored ${percent}%${s.passingScore != null ? (passed ? ' and passed' : `; the passing score is ${s.passingScore}%`) : ''}.`,
    link: `/app/assessments/attempts/${row.id}/result`,
    orgId: a.orgId,
    email: !isPersonal(a),
  });
  return true;
}

/**
 * One evidence row per skill per attempt (upsert on source id). Verified only
 * when every contributing score came from deterministic grading, real execution
 * or a human reviewer; AI proposals never score anything on their own.
 */
async function recordEvidence(at: Attempt) {
  const [a] = await db.select().from(assessments).where(eq(assessments.id, at.assessmentId));
  const answers = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, at.id));
  const resolved = await resolveQuestions(at.items);
  const agg = new Map<string, { score: number; max: number; verified: boolean; reviewer: string | null }>();
  for (const ans of answers) {
    if (ans.finalScore === null) continue;
    const q = resolved.get(ans.questionId);
    const skillIds = q?.skillIds.length ? q.skillIds : (a?.skillIds ?? []);
    const trusted = ans.gradingMethod === 'deterministic' || ans.gradingMethod === 'execution' || (ans.gradingMethod === 'manual' && !!ans.gradedBy);
    for (const sid of skillIds) {
      const e = agg.get(sid) ?? { score: 0, max: 0, verified: true, reviewer: null };
      e.score += ans.finalScore;
      e.max += ans.maxPoints;
      e.verified &&= trusted;
      if (ans.gradingMethod === 'manual' && ans.gradedBy) e.reviewer = ans.gradedBy;
      agg.set(sid, e);
    }
  }
  for (const [skillId, e] of agg) {
    if (e.max <= 0) continue;
    await addEvidence({
      userId: at.userId,
      skillId,
      source: 'assessment',
      sourceType: 'attempt',
      sourceId: at.id,
      score: e.score / e.max,
      verified: e.verified,
      verifiedBy: e.verified ? e.reviewer : null,
      orgId: a?.orgId ?? null,
      note: `${a?.mode === 'diagnostic' ? 'Diagnostic' : 'Assessment'}: ${a?.title ?? ''}`.slice(0, 300),
    });
  }
}

/** Releases every graded attempt of an assessment. Returns how many were released. */
export async function releaseAll(assessmentId: string, attemptIds?: string[]) {
  const rows = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.assessmentId, assessmentId), eq(attempts.status, 'graded'), attemptIds?.length ? inArray(attempts.id, attemptIds) : undefined));
  let n = 0;
  for (const r of rows) if (await releaseAttempt(r.id)) n++;
  return n;
}

// ---------- Manual scoring ----------

export async function applyManualScore(p: { answer: Answer; score: number; feedback?: string | null; graderId: string }) {
  if (p.score < 0 || p.score > p.answer.maxPoints) throw badRequest(`Score must be between 0 and ${p.answer.maxPoints}.`, { fields: { manualScore: `Between 0 and ${p.answer.maxPoints}.` } });
  const [row] = await db
    .update(attemptAnswers)
    .set({
      manualScore: p.score,
      finalScore: p.score,
      gradingMethod: 'manual',
      gradedBy: p.graderId,
      gradedAt: new Date(),
      ...(p.feedback !== undefined ? { feedback: p.feedback } : {}),
    })
    .where(eq(attemptAnswers.id, p.answer.id))
    .returning();
  const result = await recomputeAttempt(row.attemptId);
  return { answer: row, attemptStatus: result.status };
}

// ---------- Candidate view helpers ----------

export async function userNames(ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; email: string }>();
  const rows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, { name: r.name, email: r.email }]));
}
