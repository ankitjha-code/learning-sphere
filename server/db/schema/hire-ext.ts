// Extra tables owned by the hire feature (TalentBridge). Core recruiting tables live in people.ts.
import { pgTable, uuid, text, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cols, users, organizations } from './core';

const { id, createdAt, updatedAt } = cols;

/** Hiring-specific company profile shown on postings (name, website and branding stay on organizations). */
export const hireCompanyProfiles = pgTable('hire_company_profiles', {
  orgId: uuid()
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  about: text(),
  values: text().array().notNull().default(sql`'{}'::text[]`),
  benefits: text().array().notNull().default(sql`'{}'::text[]`),
  locations: text().array().notNull().default(sql`'{}'::text[]`),
  hiringProcess: text(),
  updatedBy: uuid(),
  updatedAt: updatedAt(),
});

/**
 * Candidate-controlled recruiter visibility. Default (no row) = not discoverable.
 * Only an explicit opt-in makes a person appear in employer candidate search
 * (applicants and campus-drive invitees remain visible to the employers involved).
 */
export const hireCandidatePreferences = pgTable('hire_candidate_preferences', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  discoverableByRecruiters: boolean().notNull().default(false),
  updatedAt: updatedAt(),
});

/** A recruiter invited a person to apply to a posting (outreach record, audited). */
export const hireApplyInvitations = pgTable(
  'hire_apply_invitations',
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    postingId: uuid().notNull(),
    candidateId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    invitedBy: uuid().notNull(),
    message: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('hire_apply_invitations_uq').on(t.postingId, t.candidateId), index('hire_apply_invitations_org_idx').on(t.orgId)],
);
