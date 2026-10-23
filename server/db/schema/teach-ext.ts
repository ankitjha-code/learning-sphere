// Extra tables owned by the teach feature. Add new tables here (do not edit other schema files).
import { pgTable, uuid, text, timestamp, jsonb, integer, real, index, uniqueIndex, date, boolean } from 'drizzle-orm/pg-core';
import { cols } from './core';
import type { RubricCriterion } from './academic';

const { id, createdAt } = cols;

/** Every saved version of a rubric (rubrics.version is the current one). Assignments keep their own snapshot at publish. */
export const teachRubricVersions = pgTable(
  'teach_rubric_versions',
  {
    id: id(),
    rubricId: uuid().notNull(),
    version: integer().notNull(),
    title: text().notNull(),
    criteria: jsonb().$type<RubricCriterion[]>().notNull(),
    editedBy: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('teach_rubric_versions_uq').on(t.rubricId, t.version)],
);

/**
 * Similarity indicators for one submission against other students' latest submissions of the
 * same assignment (the only comparison corpus). One row per submission, upserted by the job.
 */
export const teachSimilarity = pgTable(
  'teach_similarity',
  {
    submissionId: uuid().primaryKey(),
    orgId: uuid().notNull(),
    assignmentId: uuid().notNull(),
    method: text().notNull(), // e.g. word-5-gram-jaccard
    comparedCount: integer().notNull().default(0),
    maxScore: real(), // null = not enough text to compare
    matches: jsonb().$type<{ otherSubmissionId: string; otherUserId: string; score: number }[]>().notNull().default([]),
    note: text(),
    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('teach_similarity_assignment_idx').on(t.assignmentId)],
);

/** AI grading suggestions. Never applied automatically: a human grader reviews and decides. */
export const teachAiProposals = pgTable(
  'teach_ai_proposals',
  {
    id: id(),
    orgId: uuid().notNull(),
    submissionId: uuid().notNull(),
    requestedBy: uuid().notNull(),
    criterionScores: jsonb().$type<{ criterionId: string; levelLabel: string; points: number; comment?: string }[]>().notNull().default([]),
    rationale: text().notNull(),
    provider: text(),
    model: text(),
    createdAt: createdAt(),
  },
  (t) => [index('teach_ai_proposals_submission_idx').on(t.submissionId)],
);

/** One deadline reminder per assignment per student (idempotency for the reminder job). */
export const teachDeadlineReminders = pgTable(
  'teach_deadline_reminders',
  {
    assignmentId: uuid().notNull(),
    userId: uuid().notNull(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('teach_deadline_reminders_uq').on(t.assignmentId, t.userId)],
);

/** Learning interventions logged by faculty for students in their cohorts. */
export const teachInterventions = pgTable(
  'teach_interventions',
  {
    id: id(),
    orgId: uuid().notNull(),
    cohortId: uuid().notNull(),
    studentId: uuid().notNull(),
    facultyId: uuid().notNull(),
    kind: text().notNull(), // message | revision_resource | note
    reason: text(), // the at-risk reason(s) that prompted it, as shown to the faculty member
    message: text(),
    goalId: uuid(), // set when a revision resource created a learning goal
    followUpOn: date(),
    status: text().notNull().default('open'), // open | done
    outcomeNote: text(),
    createdAt: createdAt(),
  },
  (t) => [index('teach_interventions_cohort_idx').on(t.cohortId, t.createdAt)],
);

// ---------- Peer assessment ----------

export type PeerAllocationNote = {
  submitters: number;
  reviewers: number;
  target: number;
  shortfalls: { ownerKey: string; received: number }[];
  message: string | null;
  lateAdded?: number;
};

/**
 * Peer review settings and window state for one assignment (row exists once an instructor saves settings).
 * Reviews are always anonymous to students; instructors see every name. The instructor's evaluation stays
 * authoritative: the peer component only blends in when the instructor applies it.
 */
export const teachPeerSettings = pgTable('teach_peer_settings', {
  assignmentId: uuid().primaryKey(),
  orgId: uuid().notNull(),
  enabled: boolean().notNull().default(false),
  reviewsPerSubmission: integer().notNull().default(2), // 1-5
  openMode: text().notNull().default('manual'), // manual | auto
  autoOpenHoursAfterDue: integer(), // used when openMode = auto
  closesAt: timestamp({ withTimezone: true }),
  minCommentLength: integer().notNull().default(80),
  peerWeightPercent: real().notNull().default(0), // 0-50; 0 = advisory feedback only
  outlierThresholdPercent: real().notNull().default(25), // percent of max points away from the median of the other reviews
  state: text().notNull().default('not_open'), // not_open | open
  openedAt: timestamp({ withTimezone: true }),
  openedBy: uuid(),
  allocatedAt: timestamp({ withTimezone: true }),
  allocationSeed: text(),
  allocationNote: jsonb().$type<PeerAllocationNote>(),
  releasedAt: timestamp({ withTimezone: true }),
  releasedBy: uuid(), // null with releasedAt set = released automatically when the window closed
  createdAt: createdAt(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * One peer review: an allocation of a reviewer to another student's (or team's) submission, plus the review itself.
 * ownerKey is the reviewee's team id (team assignments) or user id, so a reviewee is reviewed once per reviewer.
 */
export const teachPeerReviews = pgTable(
  'teach_peer_reviews',
  {
    id: id(),
    orgId: uuid().notNull(),
    assignmentId: uuid().notNull(),
    submissionId: uuid().notNull(), // the reviewee's latest submitted version at allocation time
    ownerKey: uuid().notNull(),
    reviewerId: uuid().notNull(),
    status: text().notNull().default('assigned'), // assigned | draft | submitted | reassigned
    rubricScores: jsonb().$type<{ criterionId: string; levelLabel: string; points: number; comment?: string }[]>().notNull().default([]),
    comment: text(),
    score: real(), // rubric total scaled to the assignment's maximum points (set on submit)
    savedAt: timestamp({ withTimezone: true }),
    submittedAt: timestamp({ withTimezone: true }),
    reopenedAt: timestamp({ withTimezone: true }),
    excludedAt: timestamp({ withTimezone: true }),
    excludedBy: uuid(),
    excludedReason: text(),
    helpfulness: integer(), // 1-5, set by the reviewee
    flaggedAt: timestamp({ withTimezone: true }),
    flagReason: text(),
    remindedAt: timestamp({ withTimezone: true }),
    lateAllocation: boolean().notNull().default(false),
    replacedBy: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    index('teach_peer_reviews_assignment_idx').on(t.assignmentId),
    index('teach_peer_reviews_reviewer_idx').on(t.reviewerId),
    uniqueIndex('teach_peer_reviews_uq').on(t.assignmentId, t.ownerKey, t.reviewerId),
  ],
);
