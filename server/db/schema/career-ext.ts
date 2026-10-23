// Extra tables owned by the career + job board features. (Core career tables live in build.ts.)
import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { cols, users } from './core';

const { id, createdAt, updatedAt } = cols;
const userRef = () =>
  uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

/** Bookmarks of platform postings or cached external jobs ("saved jobs"). */
export const savedJobs = pgTable(
  'saved_jobs',
  {
    id: id(),
    userId: userRef(),
    kind: text().notNull(), // platform | external
    refId: uuid().notNull(), // job_postings.id or external_jobs.id
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('saved_jobs_uq').on(t.userId, t.kind, t.refId)],
);

/** One row per follow-up reminder actually sent, so a reminder fires once even if the job runs twice. */
export const applicationReminders = pgTable(
  'application_reminders',
  {
    id: id(),
    applicationId: uuid().notNull(),
    userId: uuid().notNull(),
    dueAt: timestamp({ withTimezone: true }).notNull(),
    sentAt: createdAt(),
  },
  (t) => [uniqueIndex('application_reminders_uq').on(t.applicationId, t.dueAt)],
);

/** The user's own 1-5 ratings of an opportunity for criteria that cannot be derived from offer details. */
export const offerRatings = pgTable(
  'offer_ratings',
  {
    id: id(),
    userId: userRef(),
    applicationId: uuid().notNull(),
    ratings: jsonb().$type<Record<string, number>>().notNull().default({}),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('offer_ratings_uq').on(t.userId, t.applicationId)],
);

export type MockQuestion = {
  id: string;
  kind: string;
  prompt: string;
  practiceId?: string;
  durationSec?: number;
  checklistMet?: number;
  checklistTotal?: number;
};

/** A timed mock interview: a sequence of questions answered one after another. */
export const mockInterviews = pgTable(
  'mock_interviews',
  {
    id: id(),
    userId: userRef(),
    kinds: text().array().notNull(),
    minutesPerQuestion: integer().notNull().default(3),
    questions: jsonb().$type<MockQuestion[]>().notNull().default([]),
    status: text().notNull().default('in_progress'), // in_progress | completed | abandoned
    summary: jsonb().$type<Record<string, unknown>>(),
    startedAt: createdAt(),
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('mock_interviews_user_idx').on(t.userId)],
);

/** Every external job feed fetch attempt (or skip), used for rate limiting and the honest status panel. */
export const jobFeedRuns = pgTable(
  'job_feed_runs',
  {
    id: id(),
    source: text().notNull(), // jobicy | himalayas | remotive
    trigger: text().notNull().default('schedule'), // schedule | admin
    status: text().notNull(), // ok | error | skipped_rate_limit | disabled
    fetched: integer().notNull().default(0),
    upserted: integer().notNull().default(0),
    removed: integer().notNull().default(0),
    message: text(),
    startedAt: createdAt(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('job_feed_runs_source_idx').on(t.source, t.startedAt)],
);
