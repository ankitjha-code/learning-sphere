// Extra tables owned by the campus feature. Add new tables here (do not edit other schema files).
import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { cols } from './core';

const { id, createdAt } = cols;

/**
 * Stage history of a placement drive candidate. Funnel numbers ("reached offer") come from this
 * history, so a candidate who received an offer and later declined it still counts as an offer.
 * `userId` is the candidate (kept for the privacy lifecycle; retained as an institutional record).
 */
export const driveStageEvents = pgTable(
  'drive_stage_events',
  {
    id: id(),
    orgId: uuid().notNull(),
    driveId: uuid().notNull(),
    candidateId: uuid().notNull(),
    userId: uuid().notNull(),
    fromStage: text(),
    toStage: text().notNull(),
    note: text(),
    actorId: uuid(),
    actorKind: text().notNull().default('officer'), // officer | student | system
    createdAt: createdAt(),
  },
  (t) => [index('drive_stage_events_drive_idx').on(t.driveId, t.createdAt), index('drive_stage_events_candidate_idx').on(t.candidateId)],
);

/**
 * Campus-specific details of an interview row (`interviews` with driveCandidateId set and
 * orgId = the college). External company interviewers are names/emails, not platform users.
 */
export const campusInterviewDetails = pgTable('campus_interview_details', {
  interviewId: uuid().primaryKey(),
  orgId: uuid().notNull(),
  driveId: uuid().notNull(),
  interviewers: jsonb().$type<{ name: string; email?: string | null }[]>().notNull().default([]),
  notes: text(),
  outcome: text(), // advance | hold | not_selected | null
  outcomeNote: text(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
