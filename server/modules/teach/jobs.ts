// Background job handlers for the teach module.
import { and, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { assignments, assignmentTeams, submissions, teachDeadlineReminders } from '../../db/schema';
import { registerJob } from '../../jobs/queue';
import { notify } from '../../lib/notify';
import { computeSimilarity } from './similarity';
import { cohortStudentIds, DAY_MS } from './service';
import { scheduleNext } from '../files/recurring';
import { allocatePeerReviews, runPeerTick, PEER_TICK_MS } from './peer';

export const REMINDER_PERIOD_MS = 3600_000;

/** Idempotent per submission: results are upserted keyed on the submission id. */
registerJob('teach.similarity', async (payload) => {
  const submissionId = String(payload.submissionId ?? '');
  if (!submissionId) return { skipped: true };
  return computeSimilarity(submissionId);
});

/**
 * Notifies students who have not submitted, once per assignment per student, when a published
 * assignment is due within the next 24 hours. The unique (assignment, student) row makes it idempotent.
 */
export async function runDeadlineReminders(now = new Date()) {
  const due = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.status, 'published'), gt(assignments.dueAt, now), lte(assignments.dueAt, new Date(now.getTime() + DAY_MS))));
  let sent = 0;
  for (const a of due) {
    if (a.availableFrom && new Date(a.availableFrom).getTime() > now.getTime()) continue;
    const students = await cohortStudentIds(a.cohortId);
    if (!students.length) continue;
    const submitted = await db
      .select({ userId: submissions.userId, teamId: submissions.teamId })
      .from(submissions)
      .where(and(eq(submissions.assignmentId, a.id), eq(submissions.orgId, a.orgId), sql`${submissions.status} <> 'draft'`));
    const done = new Set(submitted.map((s) => s.userId));
    if (a.collaboration === 'team') {
      const teamIds = submitted.map((s) => s.teamId).filter(Boolean) as string[];
      if (teamIds.length) {
        const teams = await db.select({ memberIds: assignmentTeams.memberIds }).from(assignmentTeams).where(inArray(assignmentTeams.id, teamIds));
        for (const t of teams) for (const m of t.memberIds) done.add(m);
      }
    }
    for (const uid of students) {
      if (done.has(uid)) continue;
      const [inserted] = await db.insert(teachDeadlineReminders).values({ assignmentId: a.id, userId: uid }).onConflictDoNothing().returning();
      if (!inserted) continue;
      await notify(uid, {
        type: 'assignment.due',
        category: 'assignments',
        orgId: a.orgId,
        title: `Due within 24 hours: ${a.title}`,
        body: 'You have not submitted yet. Drafts are saved automatically; remember to submit.',
        link: `/app/assignments/${a.id}`,
      });
      sent++;
    }
  }
  return { assignments: due.length, sent };
}

registerJob('teach.deadline_reminders', async () => {
  const result = await runDeadlineReminders();
  if (!process.env.VITEST) await scheduleNext('teach.deadline_reminders', REMINDER_PERIOD_MS);
  return result;
});

// ---------- Peer assessment ----------

/** Idempotent: the initial allocation runs once; late allocation only adds people without an allocation. */
registerJob('teach.peer_allocate', async (payload) => {
  const assignmentId = String(payload.assignmentId ?? '');
  if (!assignmentId) return { skipped: true };
  const result = await allocatePeerReviews(assignmentId, payload.mode === 'late' ? 'late' : 'initial');
  return result as Record<string, unknown>;
});

/** Opens windows set to open automatically, sends one 24-hour reminder per review, releases feedback at close. */
registerJob('teach.peer_tick', async () => {
  const result = await runPeerTick();
  if (!process.env.VITEST) await scheduleNext('teach.peer_tick', PEER_TICK_MS);
  return result;
});
