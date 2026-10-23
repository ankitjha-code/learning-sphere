import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { codeRuns, questions, skills, skillEvidence, practiceProgress, practiceDrafts } from '../../db/schema';
import { runCode, runSql, type SqlRunResult } from '../../exec/runner';
import type { ExecLanguage, ExecResult, ExecTest, ExecTestResult } from '../../exec';
import { addEvidence } from '../learning/skilldna';
import { recordActivity, XP } from '../../lib/activity';

export type QuestionRow = typeof questions.$inferSelect;

export const CODE_LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'go', 'rust'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Practice problems a user may see: the public bank plus practice questions of their organizations. */
export function practiceVisibility(orgIds: string[]) {
  return and(
    eq(questions.isPractice, true),
    eq(questions.status, 'active'),
    orgIds.length ? or(isNull(questions.orgId), inArray(questions.orgId, orgIds)) : isNull(questions.orgId),
  );
}

export async function findProblem(slugOrId: string, orgIds: string[]): Promise<QuestionRow | null> {
  const key = UUID_RE.test(slugOrId) ? eq(questions.id, slugOrId) : eq(questions.slug, slugOrId);
  const [q] = await db.select().from(questions).where(and(key, practiceVisibility(orgIds)));
  return q ?? null;
}

export function languagesOf(q: QuestionRow): string[] {
  if (q.type === 'sql') return ['sql'];
  return q.content.languages?.length ? q.content.languages : [...CODE_LANGUAGES];
}

/** Sentences of the explanation that state a Big-O complexity (stated by the author, not measured). */
export function statedComplexity(explanation: string | undefined | null): string | null {
  if (!explanation) return null;
  const sentences = explanation.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z`])/);
  const hits = sentences.filter((s) => /O\([^)]*\)/.test(s));
  return hits.length ? hits.join(' ').trim() : null;
}

export type RunKind = 'run' | 'submit';

export type PracticeRunResult = (ExecResult | SqlRunResult) & {
  id: string;
  kind: RunKind;
  language: string;
  custom?: boolean;
  columns?: string[];
  rows?: unknown[][];
  rowCount?: number;
  expectedColumns?: string[];
};

export type SubmissionOutcome = {
  run: PracticeRunResult;
  firstSolve: boolean;
  xpAwarded: number;
  evidence: { added: boolean; score: number; skills: { id: string; slug: string; name: string }[] } | null;
};

/** Extra details kept with a stored run (message, compile output, SQL preview). Stripped from test lists in responses. */
type RunMeta = { _meta: true; message?: string; compileOutput?: string; columns?: string[]; rows?: unknown[][]; rowCount?: number; expectedColumns?: string[]; custom?: boolean };

export function splitStoredResults(stored: Record<string, unknown>[]): { results: ExecTestResult[]; meta: Omit<RunMeta, '_meta'> } {
  const meta = (stored.find((r) => r && (r as { _meta?: boolean })._meta) ?? {}) as Partial<RunMeta>;
  const { _meta, ...rest } = meta;
  void _meta;
  return { results: stored.filter((r) => !(r as { _meta?: boolean })?._meta) as unknown as ExecTestResult[], meta: rest };
}

async function execute(q: QuestionRow, language: string, code: string, mode: { kind: RunKind; customInput?: string }): Promise<ExecResult | SqlRunResult> {
  if (q.type === 'sql') {
    return runSql({
      schemaSql: q.content.schemaSql ?? '',
      seedSql: q.answerKey.seedSql ?? '',
      query: code,
      solutionSql: q.answerKey.solutionSql ?? '',
      orderMatters: !!q.content.orderMatters,
    });
  }
  let tests: ExecTest[];
  if (mode.kind === 'run' && mode.customInput !== undefined) tests = [{ name: 'Custom input', input: mode.customInput, expected: '' }];
  else if (mode.kind === 'run') tests = (q.content.visibleTests ?? []).map((t) => ({ ...t, hidden: false }));
  else
    tests = [
      ...(q.content.visibleTests ?? []).map((t) => ({ ...t, hidden: false })),
      ...(q.answerKey.hiddenTests ?? []).map((t) => ({ name: t.name, input: t.input, expected: t.expected, weight: t.weight, hidden: true })),
    ];
  return runCode({ language: language as ExecLanguage, code, tests, timeLimitMs: q.content.timeLimitMs ?? 2000, memoryLimitMb: q.content.memoryLimitMb ?? 256 });
}

/** Custom input has no expected output: a run that finished is "completed", never "wrong answer". */
function asCustom(r: ExecResult): ExecResult {
  const results = r.results.map((t) => {
    const finished = t.status === 'passed' || t.status === 'wrong_answer';
    const { expected: _e, ...rest } = t;
    void _e;
    return { ...rest, passed: finished, status: finished ? ('passed' as const) : t.status };
  });
  const t = results[0];
  const ok = !!t && t.passed;
  return {
    ...r,
    results,
    passed: ok ? 1 : 0,
    status: ok ? 'accepted' : r.status,
    message: ok ? 'Your program finished. Compare the output with what you expect.' : r.message,
  };
}

/**
 * Runs code for a practice problem and records it. Used by the API and the demo seed.
 * - 'run': visible tests (or custom input); never creates evidence.
 * - 'submit': visible + hidden tests; verified evidence only when a sandbox actually ran the code.
 */
export async function executeAndRecord(p: { userId: string; question: QuestionRow; language: string; code: string; kind: RunKind; customInput?: string; at?: Date }): Promise<SubmissionOutcome> {
  const q = p.question;
  let exec = await execute(q, p.language, p.code, { kind: p.kind, customInput: p.customInput });
  const custom = p.kind === 'run' && p.customInput !== undefined && q.type !== 'sql';
  if (custom) exec = asCustom(exec);
  const sqlExtra = exec as SqlRunResult;
  const meta: RunMeta = {
    _meta: true,
    message: exec.message,
    compileOutput: exec.compileOutput,
    columns: sqlExtra.columns,
    rows: sqlExtra.rows?.slice(0, 50),
    rowCount: sqlExtra.rowCount,
    expectedColumns: sqlExtra.expectedColumns,
    custom: custom || undefined,
  };
  const storedStatus = custom && exec.status === 'accepted' ? 'completed' : exec.status;
  const [row] = await db
    .insert(codeRuns)
    .values({
      userId: p.userId,
      questionId: q.id,
      kind: p.kind,
      language: p.language,
      code: p.code,
      status: storedStatus,
      provider: exec.provider,
      passed: exec.passed,
      total: exec.total,
      results: [...(exec.results as unknown as Record<string, unknown>[]), meta as unknown as Record<string, unknown>],
      durationMs: exec.durationMs,
      ...(p.at ? { createdAt: p.at } : {}),
    })
    .returning({ id: codeRuns.id });

  // Progress row: counts attempts; draft is saved alongside so the editor reopens with this code.
  await db
    .insert(practiceProgress)
    .values({ userId: p.userId, questionId: q.id, runs: p.kind === 'run' ? 1 : 0, submissions: p.kind === 'submit' ? 1 : 0, lastLanguage: p.language })
    .onConflictDoUpdate({
      target: [practiceProgress.userId, practiceProgress.questionId],
      set: {
        runs: p.kind === 'run' ? sql`${practiceProgress.runs} + 1` : practiceProgress.runs,
        submissions: p.kind === 'submit' ? sql`${practiceProgress.submissions} + 1` : practiceProgress.submissions,
        lastLanguage: p.language,
        updatedAt: new Date(),
      },
    });
  await saveDraft(p.userId, q.id, p.language, p.code);

  const run: PracticeRunResult = { ...exec, id: row.id, kind: p.kind, language: p.language, ...(custom ? { custom: true } : {}) };
  if (p.kind !== 'submit') return { run, firstSolve: false, xpAwarded: 0, evidence: null };

  // Nothing ran (no sandbox, or the sandbox itself failed): record no evidence.
  const executed = exec.provider !== 'none' && exec.status !== 'unavailable' && exec.status !== 'error';
  if (!executed || exec.total === 0) return { run, firstSolve: false, xpAwarded: 0, evidence: null };

  const score = exec.passed / exec.total;
  const accepted = exec.status === 'accepted';
  await db
    .update(practiceProgress)
    .set({ bestScore: sql`greatest(${practiceProgress.bestScore}, ${score})` })
    .where(and(eq(practiceProgress.userId, p.userId), eq(practiceProgress.questionId, q.id)));

  let firstSolve = false;
  let gaveUp = false;
  if (accepted) {
    const solved = await db
      .update(practiceProgress)
      .set({ solvedAt: p.at ?? new Date(), solvedRunId: row.id })
      .where(and(eq(practiceProgress.userId, p.userId), eq(practiceProgress.questionId, q.id), isNull(practiceProgress.solvedAt)))
      .returning({ gaveUpAt: practiceProgress.gaveUpAt });
    firstSolve = solved.length > 0;
    gaveUp = !!solved[0]?.gaveUpAt;
  }

  const skillRows = q.skillIds.length ? await db.select({ id: skills.id, slug: skills.slug, name: skills.name }).from(skills).where(inArray(skills.id, q.skillIds)) : [];
  let added = false;
  if (skillRows.length) {
    const existing = await db
      .select({ skillId: skillEvidence.skillId, score: skillEvidence.score })
      .from(skillEvidence)
      .where(and(eq(skillEvidence.userId, p.userId), inArray(skillEvidence.skillId, skillRows.map((s) => s.id)), eq(skillEvidence.sourceType, 'code_submission'), eq(skillEvidence.sourceId, q.id)));
    const prev = new Map(existing.map((e) => [e.skillId, e.score]));
    const testsWord = `${exec.passed}/${exec.total} tests`;
    for (const s of skillRows) {
      const before = prev.get(s.id);
      // Keep the best score: a later, weaker submission never lowers earlier evidence.
      if (before !== undefined && (before > score || (before === score && !accepted))) continue;
      const note = accepted
        ? `Solved "${q.title}" in CodeLab (${p.language}, ${testsWord} passed${exec.provider ? `, ran in ${exec.provider}` : ''})${gaveUp ? '; solved after viewing the reference solution' : ''}`
        : `Attempted "${q.title}" in CodeLab (${p.language}, ${testsWord} passed)`;
      await addEvidence({ userId: p.userId, skillId: s.id, source: 'practice', sourceType: 'code_submission', sourceId: q.id, score, verified: true, note });
      added = true;
    }
  }

  let xpAwarded = 0;
  if (firstSolve) {
    const act = await recordActivity(p.userId, {
      kind: 'problem.solved',
      label: `Solved ${q.title}`,
      link: `/app/practice/${q.slug ?? q.id}`,
      xp: XP.problemSolved,
      skillIds: q.skillIds,
      dedupeKey: `problem:${q.id}`,
    });
    xpAwarded = act ? XP.problemSolved : 0;
  }
  return { run, firstSolve, xpAwarded, evidence: added || firstSolve ? { added, score, skills: skillRows } : null };
}

export async function saveDraft(userId: string, questionId: string, language: string, code: string) {
  const [row] = await db
    .insert(practiceDrafts)
    .values({ userId, questionId, language, code })
    .onConflictDoUpdate({ target: [practiceDrafts.userId, practiceDrafts.questionId, practiceDrafts.language], set: { code, updatedAt: new Date() } })
    .returning({ language: practiceDrafts.language, updatedAt: practiceDrafts.updatedAt });
  return row;
}
