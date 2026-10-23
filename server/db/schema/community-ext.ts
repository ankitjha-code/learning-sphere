// Extra tables owned by the mentorship, community and motivation features.
import { pgTable, uuid, text, timestamp, boolean, index, primaryKey } from 'drizzle-orm/pg-core';
import { cols, users } from './core';
import { mentorships, threads } from './people';

const { id, createdAt, updatedAt } = cols;

// ---------- Mentorship ----------

/** Activities a mentor assigns inside an active mentorship (topics, problems, projects, resources, custom). */
export const mentorshipAssignments = pgTable(
  'mentorship_assignments',
  {
    id: id(),
    mentorshipId: uuid()
      .notNull()
      .references(() => mentorships.id, { onDelete: 'cascade' }),
    createdBy: uuid().notNull(),
    kind: text().notNull().default('custom'), // topic | problem | project | resource | custom
    title: text().notNull(),
    link: text(), // in-app path (/app/...) or https URL
    note: text(),
    dueAt: timestamp({ withTimezone: true }),
    status: text().notNull().default('assigned'), // assigned | done | skipped
    completedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('mentorship_assignments_idx').on(t.mentorshipId)],
);

/**
 * Notes inside a mentorship. visibility 'shared' is visible to both parties;
 * 'mentor_private' is only ever returned to the mentor who wrote it.
 */
export const mentorshipNotes = pgTable(
  'mentorship_notes',
  {
    id: id(),
    mentorshipId: uuid()
      .notNull()
      .references(() => mentorships.id, { onDelete: 'cascade' }),
    authorId: uuid().notNull(),
    visibility: text().notNull().default('shared'), // shared | mentor_private
    body: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('mentorship_notes_idx').on(t.mentorshipId)],
);

// ---------- Community ----------

/** Moderation and edit state for threads that the core table does not carry. */
export const threadMeta = pgTable('thread_meta', {
  threadId: uuid()
    .primaryKey()
    .references(() => threads.id, { onDelete: 'cascade' }),
  locked: boolean().notNull().default(false),
  statusBeforeHide: text(),
  editedAt: timestamp({ withTimezone: true }),
});

/** "I'm interested" signups on team formation threads and RSVPs on events. */
export const threadSignups = pgTable(
  'thread_signups',
  {
    threadId: uuid()
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] })],
);

/** Mentors explicitly invited by the author to see and answer a private question. */
export const threadInvites = pgTable(
  'thread_invites',
  {
    threadId: uuid()
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    invitedBy: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] })],
);

/** Per-user community notification and privacy preferences. */
export const communityPrefs = pgTable('community_prefs', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  notifyReplies: boolean().notNull().default(true),
  notifyMentions: boolean().notNull().default(true),
  showReputation: boolean().notNull().default(true),
  allowMentorInvites: boolean().notNull().default(true),
  updatedAt: updatedAt(),
});

// ---------- Motivation ----------

/** One row per user per local day a study reminder was sent (at most one a day). */
export const studyReminderLog = pgTable(
  'study_reminder_log',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: text().notNull(), // YYYY-MM-DD in the user's timezone
    sentAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);
