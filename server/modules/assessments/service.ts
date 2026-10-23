/**
 * Assessment engine contract used by other modules (teach, hire, campus, learning).
 * Implemented by the assessments module. Signatures are stable; bodies may evolve.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { assessments, assessmentInvites, attempts } from '../../db/schema';
import type { Ctx } from '../../lib/context';
import { notFound } from '../../lib/errors';
import { notify } from '../../lib/notify';
import { loadManaged } from './access';

export type AttemptSummary = {
  userId: string;
  attemptId: string;
  status: string; // in_progress | submitted | grading | needs_review | graded | released
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  submittedAt: string | null;
  releasedAt: string | null;
};

/** Invite users to an assessment (idempotent per user). Sends in-app notifications. */
export async function inviteToAssessment(p: {
  assessmentId: string;
  userIds: string[];
  invitedBy: string;
  applicationId?: string | null;
  dueAt?: Date | null;
  accommodations?: { extraTimePercent?: number; note?: string };
}): Promise<{ invited: number; alreadyInvited: number }> {
  const [a] = await db.select().from(assessments).where(eq(assessments.id, p.assessmentId));
  if (!a) throw notFound('Assessment');
  const ids = [...new Set(p.userIds)];
  if (!ids.length) return { invited: 0, alreadyInvited: 0 };
  const existing = await db
    .select()
    .from(assessmentInvites)
    .where(and(eq(assessmentInvites.assessmentId, a.id), inArray(assessmentInvites.userId, ids)));
  let invited = 0;
  let alreadyInvited = 0;
  for (const userId of ids) {
    const prev = existing.find((e) => e.userId === userId);
    if (prev && prev.status !== 'revoked') {
      alreadyInvited++;
      continue;
    }
    if (prev) {
      await db
        .update(assessmentInvites)
        .set({ status: 'invited', invitedBy: p.invitedBy, dueAt: p.dueAt ?? null, accommodations: p.accommodations ?? prev.accommodations, applicationId: p.applicationId ?? prev.applicationId })
        .where(eq(assessmentInvites.id, prev.id));
    } else {
      const [row] = await db
        .insert(assessmentInvites)
        .values({ assessmentId: a.id, userId, invitedBy: p.invitedBy, applicationId: p.applicationId ?? null, dueAt: p.dueAt ?? null, accommodations: p.accommodations ?? {} })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        alreadyInvited++;
        continue;
      }
    }
    invited++;
    await notify(userId, {
      type: 'assessment.invited',
      category: 'assessments',
      title: `You're invited to take ${a.title}`,
      body: p.dueAt ? `Complete it by ${p.dueAt.toUTCString()}.` : 'Open it to see the rules and start when you are ready.',
      link: `/app/assessments/${a.id}`,
      orgId: a.orgId,
    });
  }
  return { invited, alreadyInvited };
}

/** Best attempt per user for an assessment (optionally restricted to some users). */
export async function attemptSummaries(assessmentId: string, userIds?: string[]): Promise<AttemptSummary[]> {
  if (userIds && !userIds.length) return [];
  const rows = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.assessmentId, assessmentId), userIds ? inArray(attempts.userId, userIds) : undefined))
    .orderBy(desc(attempts.startedAt));
  return bestAttempts(rows).map((r) => ({
    userId: r.userId,
    attemptId: r.id,
    status: r.status,
    score: r.score,
    maxScore: r.maxScore,
    percent: r.score !== null && r.maxScore ? Math.round((r.score / r.maxScore) * 1000) / 10 : null,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    releasedAt: r.releasedAt?.toISOString() ?? null,
  }));
}

const STATUS_RANK: Record<string, number> = { released: 5, graded: 4, needs_review: 3, grading: 2, submitted: 2, in_progress: 1 };

/** Per user: the highest-scoring scored attempt, else the most advanced/latest one. */
export function bestAttempts<T extends { userId: string; status: string; score: number | null; maxScore: number | null; startedAt: Date }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  const ratio = (r: T) => (r.score !== null && r.maxScore ? r.score / r.maxScore : -1);
  for (const r of rows) {
    const cur = best.get(r.userId);
    if (!cur) {
      best.set(r.userId, r);
      continue;
    }
    const better =
      ratio(r) > ratio(cur) ||
      (ratio(r) === ratio(cur) && (STATUS_RANK[r.status] ?? 0) > (STATUS_RANK[cur.status] ?? 0)) ||
      (ratio(r) === ratio(cur) && (STATUS_RANK[r.status] ?? 0) === (STATUS_RANK[cur.status] ?? 0) && r.startedAt > cur.startedAt);
    if (better) best.set(r.userId, r);
  }
  return [...best.values()];
}

/** Throws 403/404 unless the caller may manage (edit, grade, view results of) the assessment. */
export async function assertCanManageAssessment(c: Ctx, assessmentId: string): Promise<{ orgId: string | null; ownerId: string }> {
  const a = await loadManaged(c, assessmentId, 'edit');
  return { orgId: a.orgId, ownerId: a.ownerId };
}
