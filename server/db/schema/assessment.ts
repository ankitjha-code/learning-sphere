import { pgTable, uuid, text, timestamp, jsonb, boolean, integer, real, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cols, users, organizations } from './core';

const { id, createdAt, updatedAt } = cols;

/**
 * Question types:
 *  single | multi | true_false | matching | fill_blank | short_text | long_text |
 *  coding | sql | file | oral
 *
 * `content` is safe to show to candidates (prompt, options, starter code, visible tests).
 * `answerKey` is never sent to a candidate: correct options, accepted answers,
 * hidden tests, SQL solution and expected result, rubric guidance.
 */
export type QuestionContent = {
  prompt: string; // markdown
  options?: { id: string; text: string }[];
  pairs?: { left: { id: string; text: string }[]; right: { id: string; text: string }[] };
  blanks?: number;
  // coding
  languages?: string[];
  starterCode?: Record<string, string>;
  visibleTests?: { name: string; input: string; expected: string }[];
  constraints?: string;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  // sql
  schemaSql?: string; // shown to the candidate
  orderMatters?: boolean;
  // file / written
  wordLimit?: number;
  acceptedFileTypes?: string[];
  hints?: string[]; // progressive, revealed one by one
};

export type AnswerKey = {
  correct?: string[]; // option ids
  accepted?: string[][]; // fill_blank: list of accepted strings per blank
  caseSensitive?: boolean;
  matches?: Record<string, string>; // left id -> right id
  hiddenTests?: { name: string; input: string; expected: string; weight?: number }[];
  solutionSql?: string;
  seedSql?: string; // data setup kept hidden so candidates cannot hard-code results
  modelAnswer?: string; // for reviewers
  rubric?: { criterion: string; points: number; guidance?: string }[];
  explanation?: string; // shown after results are released
};

export const questions = pgTable(
  'questions',
  {
    id: id(),
    orgId: uuid().references(() => organizations.id, { onDelete: 'cascade' }), // null = public bank
    ownerId: uuid(),
    type: text().notNull(),
    title: text().notNull(),
    content: jsonb().$type<QuestionContent>().notNull(),
    answerKey: jsonb().$type<AnswerKey>().notNull().default({}),
    difficulty: text().notNull().default('medium'), // easy | medium | hard
    topics: text().array().notNull().default(sql`'{}'::text[]`),
    skillIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    points: real().notNull().default(1),
    version: integer().notNull().default(1),
    status: text().notNull().default('active'), // draft | active | retired
    visibility: text().notNull().default('org'), // org | public | private
    isPractice: boolean().notNull().default(false), // listed in CodeLab / practice bank
    slug: text(),
    source: text(), // attribution for adapted questions
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('questions_org_idx').on(t.orgId, t.type), uniqueIndex('questions_slug_uq').on(t.slug)],
);

export const questionVersions = pgTable('question_versions', {
  id: id(),
  questionId: uuid()
    .notNull()
    .references(() => questions.id, { onDelete: 'cascade' }),
  version: integer().notNull(),
  content: jsonb().$type<QuestionContent>().notNull(),
  answerKey: jsonb().$type<AnswerKey>().notNull(),
  points: real().notNull(),
  editedBy: uuid(),
  createdAt: createdAt(),
});

export type AssessmentSettings = {
  timeLimitMinutes?: number | null;
  maxAttempts?: number | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  /** Randomized blueprint: draw N questions per topic/difficulty from the bank. */
  blueprint?: { topic?: string; difficulty?: string; type?: string; count: number; points?: number }[];
  resultRelease: 'immediate' | 'after_close' | 'manual';
  showAnswersAfterRelease?: boolean;
  passingScore?: number | null; // percentage
  allowRegradeRequests?: boolean;
  proctoringNote?: string;
};

export const assessments = pgTable(
  'assessments',
  {
    id: id(),
    orgId: uuid().references(() => organizations.id, { onDelete: 'cascade' }),
    ownerId: uuid().notNull(),
    title: text().notNull(),
    description: text(),
    mode: text().notNull(), // practice | diagnostic | classroom | recruitment | placement
    settings: jsonb().$type<AssessmentSettings>().notNull(),
    status: text().notNull().default('draft'), // draft | published | closed | archived
    version: integer().notNull().default(1),
    skillIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    trackId: uuid(),
    cohortId: uuid(),
    jobPostingId: uuid(),
    driveId: uuid(),
    publishedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('assessments_org_idx').on(t.orgId, t.status)],
);

export const assessmentItems = pgTable(
  'assessment_items',
  {
    id: id(),
    assessmentId: uuid()
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id),
    questionVersion: integer().notNull(),
    points: real().notNull(),
    sortOrder: integer().notNull(),
    section: text(),
  },
  (t) => [index('items_assessment_idx').on(t.assessmentId)],
);

/** Who may take an assessment (besides public practice/diagnostic ones). */
export const assessmentInvites = pgTable(
  'assessment_invites',
  {
    id: id(),
    assessmentId: uuid()
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    invitedBy: uuid().notNull(),
    applicationId: uuid(),
    accommodations: jsonb().$type<{ extraTimePercent?: number; note?: string }>().notNull().default({}),
    dueAt: timestamp({ withTimezone: true }),
    status: text().notNull().default('invited'), // invited | started | completed | expired | revoked
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('invites_uq').on(t.assessmentId, t.userId)],
);

export const attempts = pgTable(
  'attempts',
  {
    id: id(),
    assessmentId: uuid()
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid(),
    attemptNo: integer().notNull(),
    status: text().notNull().default('in_progress'), // in_progress | submitted | grading | needs_review | graded | released
    items: jsonb()
      .$type<{ itemId: string; questionId: string; questionVersion: number; points: number; optionOrder?: string[] }[]>()
      .notNull(),
    startedAt: createdAt(),
    deadlineAt: timestamp({ withTimezone: true }),
    submittedAt: timestamp({ withTimezone: true }),
    gradedAt: timestamp({ withTimezone: true }),
    releasedAt: timestamp({ withTimezone: true }),
    score: real(),
    maxScore: real(),
    autoSubmitted: boolean().notNull().default(false),
    submitKey: text(), // idempotency key for the submit action
  },
  (t) => [index('attempts_user_idx').on(t.userId, t.assessmentId), index('attempts_assessment_idx').on(t.assessmentId)],
);

export const attemptAnswers = pgTable(
  'attempt_answers',
  {
    id: id(),
    attemptId: uuid()
      .notNull()
      .references(() => attempts.id, { onDelete: 'cascade' }),
    questionId: uuid().notNull(),
    answer: jsonb().$type<Record<string, unknown>>(),
    savedAt: timestamp({ withTimezone: true }),
    autoScore: real(),
    manualScore: real(),
    finalScore: real(),
    maxPoints: real().notNull(),
    gradingMethod: text(), // deterministic | execution | manual | pending
    gradingDetail: jsonb().$type<Record<string, unknown>>(),
    feedback: text(),
    gradedBy: uuid(),
    gradedAt: timestamp({ withTimezone: true }),
    aiProposal: jsonb().$type<{ score: number; rationale: string; model: string; createdAt: string; accepted?: boolean }>(),
  },
  (t) => [uniqueIndex('answers_attempt_q_uq').on(t.attemptId, t.questionId)],
);

export const regradeRequests = pgTable('regrade_requests', {
  id: id(),
  orgId: uuid(),
  subjectType: text().notNull(), // attempt_answer | assignment_submission
  subjectId: uuid().notNull(),
  requesterId: uuid().notNull(),
  reason: text().notNull(),
  status: text().notNull().default('open'), // open | upheld | adjusted | rejected
  previousScore: real(),
  newScore: real(),
  resolvedBy: uuid(),
  resolutionNote: text(),
  createdAt: createdAt(),
  resolvedAt: timestamp({ withTimezone: true }),
});

/** CodeLab runs and submissions (practice problems are questions with isPractice = true). */
export const codeRuns = pgTable(
  'code_runs',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: uuid(),
    attemptId: uuid(),
    kind: text().notNull(), // run (visible tests / custom input) | submit (all tests)
    language: text().notNull(),
    code: text().notNull(),
    status: text().notNull(), // accepted | wrong_answer | runtime_error | compile_error | time_limit | unavailable | error
    provider: text().notNull(), // quickjs | pglite | docker | judge0 | none
    passed: integer().notNull().default(0),
    total: integer().notNull().default(0),
    results: jsonb().$type<Record<string, unknown>[]>().notNull().default([]),
    durationMs: integer(),
    createdAt: createdAt(),
  },
  (t) => [index('code_runs_user_q_idx').on(t.userId, t.questionId, t.createdAt)],
);

export const hintReveals = pgTable(
  'hint_reveals',
  {
    userId: uuid().notNull(),
    questionId: uuid().notNull(),
    level: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('hint_reveals_uq').on(t.userId, t.questionId, t.level)],
);

