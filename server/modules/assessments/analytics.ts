import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { assessmentInvites, attempts, attemptAnswers, questions } from '../../db/schema';
import { round } from '../../lib/grading';
import { type Assessment, settingsOf } from './access';
import { bestAttempts } from './service';
import { userNames } from './engine';

const SCORED = ['graded', 'released'];

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Summary tiles, histogram, per-question stats and a per-candidate table. */
export async function assessmentResults(a: Assessment) {
  const s = settingsOf(a);
  const [rows, invites] = await Promise.all([
    db.select().from(attempts).where(eq(attempts.assessmentId, a.id)).orderBy(desc(attempts.startedAt)),
    db.select().from(assessmentInvites).where(eq(assessmentInvites.assessmentId, a.id)),
  ]);
  const best = bestAttempts(rows);
  const percentOf = (r: { score: number | null; maxScore: number | null }) => (r.score !== null && r.maxScore ? (r.score / r.maxScore) * 100 : null);
  const scoredBest = best.filter((r) => SCORED.includes(r.status) && percentOf(r) !== null);
  const percents = scoredBest.map((r) => percentOf(r)!);
  const passCut = s.passingScore ?? null;
  const starters = new Set(rows.map((r) => r.userId));
  const submitters = new Set(rows.filter((r) => r.status !== 'in_progress').map((r) => r.userId));
  const eligible = new Set([...invites.filter((i) => i.status !== 'revoked').map((i) => i.userId), ...starters]);

  const buckets = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}-${i === 9 ? 100 : i * 10 + 9}%`, from: i * 10, to: i === 9 ? 100 : i * 10 + 10, count: 0 }));
  for (const p of percents) buckets[Math.min(9, Math.floor(p / 10))].count++;

  // Per-question stats over all scored attempts.
  const scoredAttempts = rows.filter((r) => SCORED.includes(r.status));
  const answers = scoredAttempts.length ? await db.select().from(attemptAnswers).where(inArray(attemptAnswers.attemptId, scoredAttempts.map((r) => r.id))) : [];
  const qIds = [...new Set(answers.map((x) => x.questionId))];
  const qRows = qIds.length ? await db.select({ id: questions.id, title: questions.title, type: questions.type, difficulty: questions.difficulty }).from(questions).where(inArray(questions.id, qIds)) : [];
  // Discrimination proxy: mean ratio in the top 27% of attempts minus the bottom 27%.
  const ranked = [...scoredAttempts].sort((x, y) => (percentOf(y) ?? 0) - (percentOf(x) ?? 0));
  const k = Math.max(1, Math.round(ranked.length * 0.27));
  const top = new Set(ranked.slice(0, k).map((r) => r.id));
  const bottom = new Set(ranked.slice(-k).map((r) => r.id));
  const perQuestion = qRows.map((q) => {
    const xs = answers.filter((x) => x.questionId === q.id && x.finalScore !== null && x.maxPoints > 0);
    const ratio = (list: typeof xs) => (list.length ? list.reduce((n, x) => n + x.finalScore! / x.maxPoints, 0) / list.length : null);
    const hi = ratio(xs.filter((x) => top.has(x.attemptId)));
    const lo = ratio(xs.filter((x) => bottom.has(x.attemptId)));
    return {
      questionId: q.id,
      title: q.title,
      type: q.type,
      difficulty: q.difficulty,
      attempts: xs.length,
      averageRatio: ratio(xs) === null ? null : round(ratio(xs)!, 3),
      discrimination: ranked.length >= 4 && hi !== null && lo !== null ? round(hi - lo, 3) : null,
      manuallyGraded: xs.filter((x) => x.gradingMethod === 'manual').length,
    };
  });

  const names = await userNames([...eligible]);
  const attemptsByUser = new Map<string, number>();
  for (const r of rows) attemptsByUser.set(r.userId, (attemptsByUser.get(r.userId) ?? 0) + 1);
  const candidates = [...eligible].map((userId) => {
    const b = best.find((r) => r.userId === userId) ?? null;
    const inv = invites.find((i) => i.userId === userId) ?? null;
    const p = b ? percentOf(b) : null;
    return {
      userId,
      name: names.get(userId)?.name ?? 'Unknown user',
      email: names.get(userId)?.email ?? '',
      inviteStatus: inv?.status ?? null,
      accommodations: inv?.accommodations ?? {},
      attempts: attemptsByUser.get(userId) ?? 0,
      bestAttemptId: b?.id ?? null,
      status: b?.status ?? 'not_started',
      score: b?.score ?? null,
      maxScore: b?.maxScore ?? null,
      percent: p === null ? null : round(p, 1),
      passed: p === null || passCut === null || !b || !SCORED.includes(b.status) ? null : p >= passCut,
      submittedAt: b?.submittedAt ?? null,
    };
  });
  candidates.sort((x, y) => (y.percent ?? -1) - (x.percent ?? -1) || x.name.localeCompare(y.name));

  return {
    summary: {
      invited: invites.filter((i) => i.status !== 'revoked').length,
      started: starters.size,
      submitted: submitters.size,
      completionRate: eligible.size ? round(submitters.size / eligible.size, 3) : null,
      needsReview: rows.filter((r) => r.status === 'needs_review').length,
      awaitingRelease: rows.filter((r) => r.status === 'graded').length,
      released: rows.filter((r) => r.status === 'released').length,
      mean: percents.length ? round(percents.reduce((n, x) => n + x, 0) / percents.length, 1) : null,
      median: percents.length ? round(median(percents)!, 1) : null,
      passRate: passCut !== null && percents.length ? round(percents.filter((p) => p >= passCut).length / percents.length, 3) : null,
      passingScore: passCut,
    },
    histogram: buckets,
    perQuestion,
    candidates,
  };
}

/** CSV cell: quoted, and neutralises spreadsheet formula injection. */
function cell(v: unknown) {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function resultsCsv(r: Awaited<ReturnType<typeof assessmentResults>>) {
  const header = ['Name', 'Email', 'Invite status', 'Attempts', 'Best attempt status', 'Score', 'Max score', 'Percent', 'Passed', 'Submitted at'];
  const lines = r.candidates.map((c) =>
    [c.name, c.email, c.inviteStatus ?? '', c.attempts, c.status, c.score, c.maxScore, c.percent, c.passed === null ? '' : c.passed ? 'yes' : 'no', c.submittedAt].map(cell).join(','),
  );
  return [header.map(cell).join(','), ...lines].join('\r\n') + '\r\n';
}
