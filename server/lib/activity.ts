import { db } from '../db/client';
import { activityEvents } from '../db/schema';

/**
 * Records substantive learning activity. XP is only granted for meaningful
 * actions (completing a topic with evidence, passing tests, finishing a project
 * milestone), never for page views. dedupeKey prevents double counting.
 */
export const XP = {
  topicCompleted: 20,
  quizPassed: 15,
  problemSolved: 25,
  assessmentSubmitted: 30,
  assignmentSubmitted: 20,
  projectMilestone: 40,
  projectCompleted: 100,
  revisionDone: 10,
  helpfulAnswer: 10,
  mentorSession: 15,
} as const;

export async function recordActivity(
  userId: string,
  e: { kind: string; label: string; link?: string; xp?: number; minutes?: number; skillIds?: string[]; dedupeKey?: string; orgId?: string | null },
) {
  const [row] = await db
    .insert(activityEvents)
    .values({
      userId,
      orgId: e.orgId ?? null,
      kind: e.kind,
      label: e.label,
      link: e.link,
      xp: e.xp ?? 0,
      minutes: e.minutes ?? 0,
      skillIds: e.skillIds,
      dedupeKey: e.dedupeKey ?? null,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}
