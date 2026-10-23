// Background job handlers for this module register here via registerJob(type, handler).
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { assessments, attempts } from '../../db/schema';
import { registerJob } from '../../jobs/queue';
import { expireIfDue, gradeAttempt, releaseAll, shouldReleaseNow } from './engine';

/** Grades one submitted attempt. Idempotent: re-running never duplicates answers, evidence or notifications. */
registerJob('assessments.grade', async (payload) => {
  const attemptId = String(payload.attemptId);
  return gradeAttempt(attemptId);
});

/** Submits an attempt whose deadline passed while the candidate was away. */
registerJob('assessments.autosubmit', async (payload) => {
  const attemptId = String(payload.attemptId);
  const [at] = await db.select().from(attempts).where(and(eq(attempts.id, attemptId), eq(attempts.status, 'in_progress')));
  if (!at) return { skipped: true };
  if (at.deadlineAt && at.deadlineAt.getTime() > Date.now()) {
    // Deadline moved later (extra time granted); a job for the new deadline was enqueued then.
    return { skipped: true, reason: 'deadline moved' };
  }
  const fresh = await expireIfDue(at);
  return { status: fresh.status, autoSubmitted: fresh.autoSubmitted };
});

/** Releases graded attempts once an after_close assessment's window ends. */
registerJob('assessments.release_after_close', async (payload) => {
  const [a] = await db.select().from(assessments).where(eq(assessments.id, String(payload.assessmentId)));
  if (!a || !shouldReleaseNow(a)) return { skipped: true };
  return { released: await releaseAll(a.id) };
});
