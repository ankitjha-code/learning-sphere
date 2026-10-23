import { pgTable, uuid, text, timestamp, integer, real, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { cols, users } from './core';

const { id, createdAt, updatedAt } = cols;

/** CodeLab autosaved drafts: one per user, problem and language. */
export const practiceDrafts = pgTable(
  'practice_drafts',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: uuid().notNull(),
    language: text().notNull(),
    code: text().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('practice_drafts_uq').on(t.userId, t.questionId, t.language)],
);

/**
 * Per-user CodeLab progress on a practice problem. `solvedAt` is set on the first
 * accepted submission (real execution only). `gaveUpAt` records that the solution
 * was revealed before solving; a later acceptance still counts and is noted.
 */
export const practiceProgress = pgTable(
  'practice_progress',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: uuid().notNull(),
    runs: integer().notNull().default(0),
    submissions: integer().notNull().default(0),
    bestScore: real().notNull().default(0), // passed / total of the best submission
    lastLanguage: text(),
    solvedAt: timestamp({ withTimezone: true }),
    solvedRunId: uuid(),
    gaveUpAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('practice_progress_uq').on(t.userId, t.questionId), index('practice_progress_user_idx').on(t.userId, t.solvedAt)],
);
