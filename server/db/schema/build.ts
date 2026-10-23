// ProjectForge, portfolio and Career Launch Studio.
import { pgTable, uuid, text, timestamp, jsonb, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cols, users } from './core';

const { id, createdAt, updatedAt } = cols;
const userRef = () =>
  uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

// ---------- ProjectForge ----------

export const projectTemplates = pgTable('project_templates', {
  id: id(),
  slug: text().notNull().unique(),
  title: text().notNull(),
  category: text().notNull(), // beginner | fullstack | api | automation | data | ml | ai | mobile | devtools | open_source | enterprise
  difficulty: text().notNull(),
  summary: text().notNull(),
  problem: text().notNull(),
  intendedUsers: text().notNull(),
  objectives: text().array().notNull(),
  requirements: jsonb().$type<{ id: string; text: string; acceptance: string[]; optional?: boolean }[]>().notNull(),
  milestones: jsonb().$type<{ title: string; tasks: string[]; weekOffset: number }[]>().notNull(),
  skillSlugs: text().array().notNull().default(sql`'{}'::text[]`),
  trackSlugs: text().array().notNull().default(sql`'{}'::text[]`),
  estimatedHours: integer().notNull(),
  isCapstone: boolean().notNull().default(false),
});

export type ProjectDocs = {
  architecture?: string;
  dataModel?: string;
  api?: string;
  testPlan?: string;
  deployment?: string;
  retrospective?: string;
  readme?: string;
};

export const projects = pgTable(
  'projects',
  {
    id: id(),
    ownerId: userRef(),
    orgId: uuid(), // set when the project is a course/cohort capstone
    templateId: uuid(),
    title: text().notNull(),
    slug: text().notNull(),
    category: text().notNull(),
    mode: text().notNull().default('guided'), // guided | partial | independent
    problem: text().notNull().default(''),
    intendedUsers: text().notNull().default(''),
    objectives: text().array().notNull().default(sql`'{}'::text[]`),
    requirements: jsonb()
      .$type<{ id: string; text: string; acceptance: string[]; done: boolean; optional?: boolean }[]>()
      .notNull()
      .default([]),
    docs: jsonb().$type<ProjectDocs>().notNull().default({}),
    repoUrl: text(),
    demoUrl: text(),
    screenshots: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    skillIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    status: text().notNull().default('planning'), // planning | building | review | completed | archived
    visibility: text().notNull().default('private'), // private | unlisted | public
    reviewRubricId: uuid(),
    reviewerId: uuid(),
    approvedAt: timestamp({ withTimezone: true }),
    approvedBy: uuid(),
    startedAt: createdAt(),
    dueAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [index('projects_owner_idx').on(t.ownerId), uniqueIndex('projects_owner_slug_uq').on(t.ownerId, t.slug)],
);

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: userRef(),
    role: text().notNull().default('member'), // owner | member | mentor | reviewer
    addedAt: createdAt(),
  },
  (t) => [uniqueIndex('project_members_uq').on(t.projectId, t.userId)],
);

export const projectMilestones = pgTable('project_milestones', {
  id: id(),
  projectId: uuid()
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text().notNull(),
  dueAt: timestamp({ withTimezone: true }),
  status: text().notNull().default('open'), // open | done
  sortOrder: integer().notNull(),
  completedAt: timestamp({ withTimezone: true }),
});

export const projectTasks = pgTable(
  'project_tasks',
  {
    id: id(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    milestoneId: uuid(),
    title: text().notNull(),
    description: text(),
    kind: text().notNull().default('task'), // task | bug | issue
    status: text().notNull().default('todo'), // todo | doing | review | done
    priority: text().notNull().default('medium'), // low | medium | high
    assigneeId: uuid(),
    sortOrder: integer().notNull().default(0),
    createdBy: uuid().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('project_tasks_idx').on(t.projectId, t.status)],
);

export const projectReviews = pgTable('project_reviews', {
  id: id(),
  projectId: uuid()
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  reviewerId: uuid().notNull(),
  kind: text().notNull().default('feedback'), // feedback | code_review | approval | changes_requested
  rubricScores: jsonb().$type<{ criterion: string; points: number; max: number; comment?: string }[]>(),
  body: text().notNull(),
  confirmedSkillIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
  createdAt: createdAt(),
});

// ---------- Portfolio ----------

export const portfolios = pgTable('portfolios', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  slug: text().notNull().unique(),
  visibility: text().notNull().default('private'), // private | unlisted | public
  shareToken: text(), // for unlisted links; rotate to revoke
  headline: text(),
  about: text(),
  sections: jsonb()
    .$type<{ key: 'projects' | 'skills' | 'assessments' | 'writing' | 'achievements' | 'experience' | 'education'; visible: boolean }[]>()
    .notNull()
    .default([]),
  featuredProjectIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
  hiddenEvidenceIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
  writing: jsonb().$type<{ title: string; url: string; summary?: string }[]>().notNull().default([]),
  version: integer().notNull().default(1),
  updatedAt: updatedAt(),
});

export const portfolioVersions = pgTable('portfolio_versions', {
  id: id(),
  userId: uuid().notNull(),
  version: integer().notNull(),
  snapshot: jsonb().$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
});

export const achievements = pgTable(
  'achievements',
  {
    id: id(),
    userId: userRef(),
    key: text().notNull(), // first_lesson, streak_7, project_completed ...
    title: text().notNull(),
    description: text(),
    verified: boolean().notNull().default(true), // earned from platform activity
    awardedAt: createdAt(),
  },
  (t) => [uniqueIndex('achievements_uq').on(t.userId, t.key)],
);

export const certificates = pgTable('certificates', {
  id: id(),
  userId: userRef(),
  kind: text().notNull(), // platform_completion | external_self_reported
  title: text().notNull(),
  issuer: text().notNull(),
  issuedAt: timestamp({ withTimezone: true }).notNull(),
  verificationCode: text().unique(), // platform-issued only
  credentialUrl: text(), // external, self-reported
  trackId: uuid(),
  projectId: uuid(),
  createdAt: createdAt(),
});

// ---------- Career Launch Studio ----------

export type ResumeData = {
  basics: { name: string; email?: string; phone?: string; location?: string; headline?: string; links?: { label: string; url: string }[] };
  summary?: string;
  experience: { id: string; company: string; title: string; start?: string; end?: string; bullets: string[] }[];
  education: { id: string; institution: string; degree?: string; field?: string; start?: string; end?: string; grade?: string }[];
  projects: { id: string; name: string; url?: string; bullets: string[]; projectId?: string }[];
  skills: { group: string; items: string[] }[];
  certifications: { id: string; name: string; issuer?: string; date?: string }[];
  sectionOrder: string[];
};

export const resumes = pgTable('resumes', {
  id: id(),
  userId: userRef(),
  title: text().notNull(),
  template: text().notNull().default('clean'),
  targetRole: text(),
  data: jsonb().$type<ResumeData>().notNull(),
  version: integer().notNull().default(1),
  parentId: uuid(), // tailored copy of
  isPrimary: boolean().notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const careerDocuments = pgTable('career_documents', {
  id: id(),
  userId: userRef(),
  kind: text().notNull(), // cover_letter | answer | outreach | cold_email | follow_up | bio | project_summary
  title: text().notNull(),
  body: text().notNull(),
  applicationId: uuid(),
  jobDescription: text(),
  aiAssisted: boolean().notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A job description the user pasted or saved, analyzed against their Skill DNA. */
export const jobTargets = pgTable('job_targets', {
  id: id(),
  userId: userRef(),
  title: text().notNull(),
  company: text(),
  url: text(),
  description: text().notNull(),
  extractedSkills: jsonb().$type<{ slug: string; name: string; required: boolean }[]>().notNull().default([]),
  analysis: jsonb().$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

export const applications = pgTable(
  'applications',
  {
    id: id(),
    userId: userRef(),
    company: text().notNull(),
    role: text().notNull(),
    source: text().notNull().default('manual'), // manual | platform | feed | referral | campus
    sourceUrl: text(),
    jobPostingId: uuid(), // set when applying to a posting on the platform
    jobApplicationId: uuid(), // employer-side record
    location: text(),
    status: text().notNull().default('saved'), // saved | applied | assessment | interview | offer | accepted | rejected | withdrawn
    appliedAt: timestamp({ withTimezone: true }),
    deadline: timestamp({ withTimezone: true }),
    resumeId: uuid(),
    coverLetterId: uuid(),
    salaryText: text(),
    notes: text(),
    contacts: jsonb().$type<{ name: string; role?: string; email?: string; note?: string }[]>().notNull().default([]),
    rounds: jsonb()
      .$type<{ id: string; name: string; at?: string; status: 'scheduled' | 'done' | 'cancelled'; feedback?: string }[]>()
      .notNull()
      .default([]),
    offer: jsonb().$type<{
      baseSalary?: number;
      currency?: string;
      bonus?: number;
      equity?: string;
      location?: string;
      remote?: string;
      startDate?: string;
      deadline?: string;
      benefits?: string;
      notes?: string;
    }>(),
    outcomeReason: text(),
    nextActionAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('applications_user_idx').on(t.userId, t.status)],
);

export const applicationEvents = pgTable('application_events', {
  id: id(),
  applicationId: uuid()
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  kind: text().notNull(), // status | note | round | reminder
  fromStatus: text(),
  toStatus: text(),
  note: text(),
  createdAt: createdAt(),
});

export const interviewPractice = pgTable('interview_practice', {
  id: id(),
  userId: userRef(),
  kind: text().notNull(), // behavioral | technical | system_design | sql | project | role
  question: text().notNull(),
  answer: text().notNull(),
  selfRating: integer(),
  feedback: jsonb().$type<{ source: 'ai' | 'checklist' | 'mentor'; items: { label: string; met: boolean; note?: string }[]; summary?: string }>(),
  createdAt: createdAt(),
});

export const journalEntries = pgTable('journal_entries', {
  id: id(),
  userId: userRef(),
  kind: text().notNull().default('reflection'), // reflection | career | weekly_review
  title: text(),
  body: text().notNull(),
  mood: integer(),
  createdAt: createdAt(),
});

export const offerPriorities = pgTable('offer_priorities', {
  userId: uuid().primaryKey(),
  weights: jsonb().$type<Record<string, number>>().notNull(), // salary, growth, location, remote, learning, stability
  updatedAt: updatedAt(),
});

export const externalJobs = pgTable(
  'external_jobs',
  {
    id: id(),
    source: text().notNull(), // jobicy | himalayas | remotive
    externalId: text().notNull(),
    title: text().notNull(),
    company: text().notNull(),
    location: text(),
    url: text().notNull(),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    description: text(),
    publishedAt: timestamp({ withTimezone: true }),
    fetchedAt: createdAt(),
    expiresAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex('external_jobs_uq').on(t.source, t.externalId)],
);

