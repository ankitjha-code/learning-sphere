import { pgTable, uuid, text, timestamp, jsonb, boolean, integer, real, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cols, users, organizations } from './core';

const { id, createdAt, updatedAt } = cols;

// ---------- Profile & personal plan ----------

export const profiles = pgTable('profiles', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  headline: text(),
  bio: text(),
  location: text(),
  stage: text(), // school_graduate | college_student | graduate | professional | career_switcher
  education: jsonb()
    .$type<{ institution: string; degree?: string; field?: string; startYear?: number; endYear?: number; grade?: string }[]>()
    .notNull()
    .default([]),
  experience: jsonb()
    .$type<{ company: string; title: string; start?: string; end?: string; summary?: string }[]>()
    .notNull()
    .default([]),
  interests: text().array().notNull().default(sql`'{}'::text[]`),
  targetRoles: text().array().notNull().default(sql`'{}'::text[]`),
  targetDate: timestamp({ withTimezone: true }),
  weeklyHours: integer(),
  learningStyle: text(), // guided | independent | project_first | intensive | interview
  preferredLanguages: text().array().notNull().default(sql`'{}'::text[]`),
  links: jsonb().$type<{ label: string; url: string }[]>().notNull().default([]),
  onboardingCompletedAt: timestamp({ withTimezone: true }),
  updatedAt: updatedAt(),
});

export const goals = pgTable(
  'goals',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    kind: text().notNull().default('milestone'), // career | milestone | weekly | daily
    status: text().notNull().default('active'), // active | done | dropped
    targetDate: timestamp({ withTimezone: true }),
    metric: jsonb().$type<{ type: 'minutes' | 'topics' | 'problems' | 'custom'; target: number }>(),
    trackId: uuid(),
    skillId: uuid(),
    source: text().notNull().default('user'), // user | plan_generator | mentor
    createdBy: uuid(),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('goals_user_idx').on(t.userId)],
);

// ---------- Skill graph & Skill DNA ----------

export const skills = pgTable(
  'skills',
  {
    id: id(),
    slug: text().notNull(),
    name: text().notNull(),
    category: text().notNull(), // e.g. programming, dsa, databases, system-design, ai-ml, career
    description: text(),
    level: integer().notNull().default(1), // 1 foundational .. 4 advanced
  },
  (t) => [uniqueIndex('skills_slug_uq').on(t.slug)],
);

export const skillPrereqs = pgTable(
  'skill_prereqs',
  {
    skillId: uuid()
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    prereqId: uuid()
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.skillId, t.prereqId] })],
);

/**
 * Every signal about a user's ability. Skill DNA is computed from these rows.
 * source: self | assessment | practice | project | review | course | mentor
 * verified = true only when the evidence was produced by deterministic grading
 * or confirmed by an authorized human reviewer (never by AI alone).
 */
export const skillEvidence = pgTable(
  'skill_evidence',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skillId: uuid()
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    source: text().notNull(),
    sourceType: text(), // attempt | submission | project | review | topic
    sourceId: text(),
    score: real().notNull(), // 0..1 performance on this evidence
    weight: real().notNull().default(1),
    verified: boolean().notNull().default(false),
    verifiedBy: uuid(),
    orgId: uuid(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index('evidence_user_skill_idx').on(t.userId, t.skillId),
    uniqueIndex('evidence_source_uq').on(t.userId, t.skillId, t.sourceType, t.sourceId),
  ],
);

// ---------- Learning paths ----------

export const tracks = pgTable(
  'tracks',
  {
    id: id(),
    slug: text().notNull(),
    title: text().notNull(),
    category: text().notNull(),
    summary: text().notNull(),
    description: text(),
    level: text().notNull().default('beginner'), // beginner | intermediate | advanced
    estimatedHours: integer(),
    roles: text().array().notNull().default(sql`'{}'::text[]`), // target roles this track serves
    orgId: uuid().references(() => organizations.id, { onDelete: 'cascade' }), // null = global
    authorId: uuid(),
    status: text().notNull().default('published'), // draft | in_review | published | archived
    contentStatus: text().notNull().default('complete'), // complete | outline (honest coverage label)
    version: integer().notNull().default(1),
    lastReviewedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('tracks_slug_uq').on(t.slug)],
);

export const topics = pgTable(
  'topics',
  {
    id: id(),
    trackId: uuid()
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    skillId: uuid().references(() => skills.id),
    slug: text().notNull(),
    title: text().notNull(),
    module: text().notNull().default('Core'),
    sortOrder: integer().notNull(),
    objectives: text().array().notNull().default(sql`'{}'::text[]`),
    body: text().notNull().default(''), // markdown explanation + examples
    estimatedMinutes: integer().notNull().default(20),
    practice: jsonb()
      .$type<{ title: string; kind: 'problem' | 'quiz' | 'exercise' | 'sql'; ref?: string; prompt?: string }[]>()
      .notNull()
      .default([]),
    resources: jsonb().$type<{ title: string; url: string; source: string; kind: string }[]>().notNull().default([]),
    quizQuestionIds: uuid().array(),
    completionCriteria: text(),
    isMilestone: boolean().notNull().default(false),
  },
  (t) => [uniqueIndex('topics_track_slug_uq').on(t.trackId, t.slug), index('topics_track_idx').on(t.trackId, t.sortOrder)],
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    trackId: uuid()
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    mode: text().notNull().default('guided'), // guided | independent | intensive | interview | project_first
    status: text().notNull().default('active'), // active | paused | completed
    weeklyMinutes: integer(),
    targetDate: timestamp({ withTimezone: true }),
    skippedTopicIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    startedAt: createdAt(),
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex('enrollments_uq').on(t.userId, t.trackId)],
);

/** Per-topic mastery with SM-2 style spaced repetition scheduling. */
export const topicProgress = pgTable(
  'topic_progress',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    status: text().notNull().default('not_started'), // not_started | in_progress | completed | needs_revision
    mastery: real().notNull().default(0), // 0..1, from quiz/practice evidence only
    reviewCount: integer().notNull().default(0),
    easeFactor: real().notNull().default(2.5),
    intervalDays: integer().notNull().default(0),
    nextReviewAt: timestamp({ withTimezone: true }),
    lastActivityAt: timestamp({ withTimezone: true }),
    minutesSpent: integer().notNull().default(0),
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.topicId] }), index('progress_review_idx').on(t.userId, t.nextReviewAt)],
);

// ---------- Knowledge hub ----------

export const resources = pgTable(
  'resources',
  {
    id: id(),
    orgId: uuid().references(() => organizations.id, { onDelete: 'cascade' }), // null = public library
    authorId: uuid(),
    kind: text().notNull(), // article | video | docs | cheatsheet | course | exercise | interview | link
    title: text().notNull(),
    summary: text().notNull().default(''),
    body: text(), // markdown when authored here
    url: text(), // external link
    sourceName: text(), // attribution
    license: text(),
    topics: text().array().notNull().default(sql`'{}'::text[]`),
    languages: text().array().notNull().default(sql`'{}'::text[]`),
    roles: text().array().notNull().default(sql`'{}'::text[]`),
    difficulty: text().notNull().default('beginner'),
    skillIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    status: text().notNull().default('published'), // draft | in_review | published | archived | rejected
    version: integer().notNull().default(1),
    downloadable: boolean().notNull().default(false),
    lastReviewedAt: timestamp({ withTimezone: true }),
    ratingSum: integer().notNull().default(0),
    ratingCount: integer().notNull().default(0),
    viewCount: integer().notNull().default(0),
    isSample: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('resources_org_idx').on(t.orgId, t.status),
    index('resources_fts_idx').using(
      'gin',
      sql`to_tsvector('english', ${t.title} || ' ' || ${t.summary} || ' ' || coalesce(${t.body}, ''))`,
    ),
  ],
);

export const resourceVersions = pgTable('resource_versions', {
  id: id(),
  resourceId: uuid()
    .notNull()
    .references(() => resources.id, { onDelete: 'cascade' }),
  version: integer().notNull(),
  title: text().notNull(),
  body: text(),
  editedBy: uuid(),
  createdAt: createdAt(),
});

export const bookmarks = pgTable(
  'bookmarks',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text().notNull(), // resource | topic | track | problem | job | project | thread
    targetId: text().notNull(),
    label: text().notNull(),
    collection: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('bookmarks_uq').on(t.userId, t.targetType, t.targetId)],
);

export const resourceRatings = pgTable(
  'resource_ratings',
  {
    userId: uuid().notNull(),
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    rating: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.resourceId] })],
);

export const readingHistory = pgTable(
  'reading_history',
  {
    userId: uuid().notNull(),
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    completed: boolean().notNull().default(false),
    lastOpenedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.resourceId] })],
);
