// Extra tables owned by the projects / portfolio feature. Add new tables here (do not edit other schema files).
import { pgTable, uuid, text, timestamp, jsonb, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cols, users } from './core';
import { projects } from './build';

const { id, createdAt, updatedAt } = cols;

/**
 * Per-project settings that do not fit the core `projects` row: the revocable
 * share token for unlisted links, what the public page may show, owner-only
 * private notes and the ordered screenshot list (links and uploaded files).
 */
export const projectSettings = pgTable('project_settings', {
  projectId: uuid()
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  shareToken: text(), // unlisted link token; rotate or clear to revoke
  showTasksPublic: boolean().notNull().default(false),
  privateNotes: text(), // never exposed on public pages
  /** Ordered screenshots: external links, or uploaded files (fileId, purpose 'project', also listed in projects.screenshots). */
  screenshotLinks: jsonb().$type<{ url: string; caption?: string; fileId?: string }[]>().notNull().default([]),
  updatedAt: updatedAt(),
});

/** Pending team invitations (an existing user invited by email). Accepting creates a project_members row. */
export const projectInvites = pgTable(
  'project_invites',
  {
    id: id(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text().notNull().default('member'), // member | mentor | reviewer
    invitedBy: uuid().notNull(),
    status: text().notNull().default('pending'), // pending | accepted | declined | revoked
    createdAt: createdAt(),
    respondedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex('project_invites_uq').on(t.projectId, t.userId), index('project_invites_user_idx').on(t.userId, t.status)],
);

/** Portfolio choices that the core `portfolios` row has no column for. */
export const portfolioPrefs = pgTable('portfolio_prefs', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Assessment attempts the user explicitly chose to show (only title + score % are ever exposed). */
  shownAttemptIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
  updatedAt: updatedAt(),
});
