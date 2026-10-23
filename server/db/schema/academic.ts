import { pgTable, uuid, text, timestamp, jsonb, boolean, integer, real, index, uniqueIndex, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cols, users, organizations } from './core';

const { id, createdAt, updatedAt } = cols;

const orgRef = () =>
  uuid()
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });

// ---------- Institution structure ----------

export const departments = pgTable('departments', {
  id: id(),
  orgId: orgRef(),
  name: text().notNull(),
  code: text().notNull(),
  headUserId: uuid(),
  createdAt: createdAt(),
});

export const programs = pgTable('programs', {
  id: id(),
  orgId: orgRef(),
  departmentId: uuid().references(() => departments.id, { onDelete: 'set null' }),
  name: text().notNull(), // e.g. B.Tech Computer Science
  code: text().notNull(),
  durationYears: integer().notNull().default(4),
  createdAt: createdAt(),
});

export const academicTerms = pgTable('academic_terms', {
  id: id(),
  orgId: orgRef(),
  name: text().notNull(), // e.g. 2026-27 Odd Semester
  startsOn: date().notNull(),
  endsOn: date().notNull(),
  isCurrent: boolean().notNull().default(false),
});

/** A cohort is any teachable group: a batch, a section, a course roster or a training cohort. */
export const cohorts = pgTable(
  'cohorts',
  {
    id: id(),
    orgId: orgRef(),
    programId: uuid().references(() => programs.id, { onDelete: 'set null' }),
    termId: uuid(),
    name: text().notNull(),
    kind: text().notNull().default('section'), // batch | section | course | training
    graduationYear: integer(),
    ownerId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [index('cohorts_org_idx').on(t.orgId)],
);

export const cohortMembers = pgTable(
  'cohort_members',
  {
    cohortId: uuid()
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text().notNull().default('student'), // student | instructor | ta
    addedAt: createdAt(),
  },
  (t) => [uniqueIndex('cohort_members_uq').on(t.cohortId, t.userId)],
);

export const studentRecords = pgTable(
  'student_records',
  {
    id: id(),
    orgId: orgRef(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rollNumber: text().notNull(),
    programId: uuid(),
    departmentId: uuid(),
    graduationYear: integer(),
    cgpa: real(), // null = unknown (never inferred)
    activeBacklogs: integer(), // null = unknown
    attendancePercent: real(),
    status: text().notNull().default('enrolled'), // enrolled | graduated | withdrawn | on_leave
    verifiedAt: timestamp({ withTimezone: true }),
    verifiedBy: uuid(),
    placementOptIn: boolean().notNull().default(true),
    notes: text(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('student_records_org_user_uq').on(t.orgId, t.userId), uniqueIndex('student_records_roll_uq').on(t.orgId, t.rollNumber)],
);

export const recordCorrections = pgTable('record_corrections', {
  id: id(),
  orgId: orgRef(),
  recordId: uuid()
    .notNull()
    .references(() => studentRecords.id, { onDelete: 'cascade' }),
  requestedBy: uuid().notNull(),
  field: text().notNull(),
  currentValue: text(),
  proposedValue: text().notNull(),
  reason: text().notNull(),
  status: text().notNull().default('open'), // open | approved | rejected
  reviewedBy: uuid(),
  reviewNote: text(),
  createdAt: createdAt(),
  reviewedAt: timestamp({ withTimezone: true }),
});

// ---------- Courses (org-authored learning delivered to cohorts) ----------

export const courses = pgTable('courses', {
  id: id(),
  orgId: orgRef(),
  code: text().notNull(),
  title: text().notNull(),
  description: text(),
  trackId: uuid(), // optional link to a learning path
  termId: uuid(),
  ownerId: uuid().notNull(),
  status: text().notNull().default('active'),
  createdAt: createdAt(),
});

export const courseCohorts = pgTable(
  'course_cohorts',
  {
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    cohortId: uuid()
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('course_cohorts_uq').on(t.courseId, t.cohortId)],
);

export const courseInstructors = pgTable(
  'course_instructors',
  {
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    userId: uuid().notNull(),
    role: text().notNull().default('instructor'), // instructor | ta
  },
  (t) => [uniqueIndex('course_instructors_uq').on(t.courseId, t.userId)],
);

export const announcements = pgTable('announcements', {
  id: id(),
  orgId: orgRef(),
  cohortId: uuid(),
  courseId: uuid(),
  authorId: uuid().notNull(),
  title: text().notNull(),
  body: text().notNull(),
  createdAt: createdAt(),
});

export const attendanceSessions = pgTable('attendance_sessions', {
  id: id(),
  orgId: orgRef(),
  cohortId: uuid()
    .notNull()
    .references(() => cohorts.id, { onDelete: 'cascade' }),
  courseId: uuid(),
  heldOn: date().notNull(),
  topic: text(),
  takenBy: uuid().notNull(),
  createdAt: createdAt(),
});

export const attendanceMarks = pgTable(
  'attendance_marks',
  {
    sessionId: uuid()
      .notNull()
      .references(() => attendanceSessions.id, { onDelete: 'cascade' }),
    userId: uuid().notNull(),
    status: text().notNull(), // present | absent | late | excused
  },
  (t) => [uniqueIndex('attendance_marks_uq').on(t.sessionId, t.userId)],
);

// ---------- Assignments ----------

export type RubricCriterion = {
  id: string;
  title: string;
  description?: string;
  levels: { label: string; points: number; description?: string }[];
};

export const rubrics = pgTable('rubrics', {
  id: id(),
  orgId: uuid(), // null = personal (mentor/project) rubric
  ownerId: uuid().notNull(),
  title: text().notNull(),
  criteria: jsonb().$type<RubricCriterion[]>().notNull(),
  version: integer().notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const assignments = pgTable(
  'assignments',
  {
    id: id(),
    orgId: orgRef(),
    courseId: uuid(),
    cohortId: uuid()
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    authorId: uuid().notNull(),
    title: text().notNull(),
    objectives: text().array().notNull().default(sql`'{}'::text[]`),
    instructions: text().notNull(),
    dueAt: timestamp({ withTimezone: true }).notNull(),
    availableFrom: timestamp({ withTimezone: true }),
    maxPoints: real().notNull().default(100),
    rubricId: uuid(),
    rubricSnapshot: jsonb().$type<RubricCriterion[]>(),
    submissionTypes: text().array().notNull().default(sql`'{text}'::text[]`), // text | file | link
    acceptedFileTypes: text().array().notNull().default(sql`'{}'::text[]`),
    collaboration: text().notNull().default('individual'), // individual | team | discuss_only
    latePolicy: jsonb()
      .$type<{ allowLate: boolean; penaltyPercentPerDay?: number; hardCutoffDays?: number }>()
      .notNull()
      .default({ allowLate: true, penaltyPercentPerDay: 10, hardCutoffDays: 3 }),
    allowResubmission: boolean().notNull().default(false),
    maxResubmissions: integer().notNull().default(0),
    skillIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    status: text().notNull().default('draft'), // draft | published | closed
    releasePolicy: text().notNull().default('manual'), // manual | on_grade
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('assignments_cohort_idx').on(t.cohortId, t.dueAt)],
);

export const assignmentTeams = pgTable('assignment_teams', {
  id: id(),
  assignmentId: uuid()
    .notNull()
    .references(() => assignments.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  memberIds: uuid().array().notNull(),
});

export const submissions = pgTable(
  'assignment_submissions',
  {
    id: id(),
    assignmentId: uuid()
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    orgId: uuid().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    teamId: uuid(),
    version: integer().notNull().default(1),
    status: text().notNull().default('draft'), // draft | submitted | returned | graded
    text: text(),
    links: jsonb().$type<{ label: string; url: string }[]>().notNull().default([]),
    fileIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    submittedAt: timestamp({ withTimezone: true }),
    isLate: boolean().notNull().default(false),
    receiptCode: text(),
    contentHash: text(),
    savedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('submissions_assignment_idx').on(t.assignmentId), index('submissions_user_idx').on(t.userId)],
);

export const evaluations = pgTable(
  'evaluations',
  {
    id: id(),
    submissionId: uuid()
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    graderId: uuid().notNull(),
    rubricScores: jsonb().$type<{ criterionId: string; levelLabel: string; points: number; comment?: string }[]>().notNull().default([]),
    rawScore: real().notNull(),
    latePenalty: real().notNull().default(0),
    finalScore: real().notNull(),
    feedback: text(),
    privateComment: text(), // instructor-only
    released: boolean().notNull().default(false),
    releasedAt: timestamp({ withTimezone: true }),
    supersededBy: uuid(), // re-evaluations keep history
    reason: text(), // why this (re)evaluation happened
    aiProposal: jsonb().$type<{ score: number; rationale: string; model: string }>(),
    createdAt: createdAt(),
  },
  (t) => [index('evaluations_submission_idx').on(t.submissionId)],
);

export const submissionComments = pgTable('submission_comments', {
  id: id(),
  submissionId: uuid()
    .notNull()
    .references(() => submissions.id, { onDelete: 'cascade' }),
  authorId: uuid().notNull(),
  body: text().notNull(),
  visibility: text().notNull().default('shared'), // shared | instructors
  createdAt: createdAt(),
});

export const integrityReports = pgTable('integrity_reports', {
  id: id(),
  orgId: orgRef(),
  submissionId: uuid().notNull(),
  reportedBy: uuid().notNull(),
  similarity: jsonb().$type<{ otherSubmissionId: string; score: number; method: string }[]>(),
  note: text().notNull(),
  status: text().notNull().default('open'), // open | cleared | confirmed
  outcomeNote: text(),
  createdAt: createdAt(),
});

// ---------- Placement ----------

export type EligibilityRules = {
  programIds?: string[];
  graduationYears?: number[];
  minCgpa?: number | null;
  maxActiveBacklogs?: number | null;
  minAttendance?: number | null;
  requiredSkillSlugs?: string[];
  requireVerifiedRecord?: boolean;
};

export const employerRelationships = pgTable('employer_relationships', {
  id: id(),
  orgId: orgRef(), // college
  companyOrgId: uuid(), // if the employer is on the platform
  companyName: text().notNull(),
  contactName: text(),
  contactEmail: text(),
  status: text().notNull().default('active'), // prospect | active | paused
  notes: text(),
  createdAt: createdAt(),
});

export const placementDrives = pgTable(
  'placement_drives',
  {
    id: id(),
    orgId: orgRef(), // college running the drive
    companyOrgId: uuid(),
    companyName: text().notNull(),
    jobPostingId: uuid(),
    title: text().notNull(),
    description: text(),
    roleTitle: text().notNull(),
    ctcText: text(),
    location: text(),
    eligibility: jsonb().$type<EligibilityRules>().notNull().default({}),
    registrationDeadline: timestamp({ withTimezone: true }),
    assessmentId: uuid(),
    stages: text().array().notNull().default(sql`'{registered,assessment,interview,offer}'::text[]`),
    status: text().notNull().default('draft'), // draft | open | in_progress | completed | cancelled
    createdBy: uuid().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('drives_org_idx').on(t.orgId, t.status)],
);

export const driveCandidates = pgTable(
  'drive_candidates',
  {
    id: id(),
    driveId: uuid()
      .notNull()
      .references(() => placementDrives.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stage: text().notNull().default('invited'), // invited | registered | assessment | interview | offer | placed | rejected | withdrawn | declined
    eligibilitySnapshot: jsonb().$type<{ eligible: boolean; reasons: string[]; unknown: string[] }>(),
    interviewAt: timestamp({ withTimezone: true }),
    offerCtcText: text(),
    notes: text(),
    updatedBy: uuid(),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('drive_candidates_uq').on(t.driveId, t.userId)],
);
