// Extra tables owned by the assessment feature. Add new tables here (do not edit other schema files).
import { pgTable, uuid, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { attempts } from './assessment';

/**
 * Candidate-side navigation state for an in-progress attempt, so a reload (or a
 * different device) restores flagged questions and the current position.
 * Answers themselves live in attempt_answers.
 */
export const attemptState = pgTable('attempt_state', {
  attemptId: uuid()
    .primaryKey()
    .references(() => attempts.id, { onDelete: 'cascade' }),
  flagged: uuid().array().notNull().default(sql`'{}'::uuid[]`),
  currentIndex: integer().notNull().default(0),
  /** Coding/SQL editor language choice per question id (the code itself is the saved answer). */
  meta: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
