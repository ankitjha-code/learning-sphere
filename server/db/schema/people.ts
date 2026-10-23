// TalentBridge (recruiting), mentorship, community and motivation.
import { pgTable, uuid, text, timestamp, jsonb, boolean, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cols, users, organizations } from './core';

const { id, createdAt, updatedAt } = cols;
const userRef = () =>
  uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });
const orgRef = () =>
  uuid()
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });

// ---------- TalentBridge ----------

export const DEFAULT_PIPELINE = ['applied', 'eligibility_review', 'shortlisted', 'assessment', 'interview', 'offer', 'hired'] as const;

export const jobPostings = pgTable(
  'job_postings',
  {
    id: id(),
    orgId: orgRef(),
    createdBy: uuid().notNull(),
    title: text().notNull(),
    team: text(),
    location: text().notNull(),
    workplace: text().notNull().default('onsite'), // onsite | hybrid | remote
    employmentType: text().notNull().default('full_time'), // full_time | internship | contract | part_time
    description: text().notNull(),
    responsibilities: text().array().notNull().default(sql`'{}'::text[]`),
    requiredSkills: jsonb().$type<{ slug: string; name: string; minLevel?: number; required: boolean }[]>().notNull().default([]),
    eligibility: jsonb()
      .$type<{ minExperienceYears?: number; graduationYears?: number[]; degrees?: string[]; workAuthorization?: string; notes?: string }>()
      .notNull()
      .default({}),
    salaryText: text(),
    stages: text().array().notNull().default(sql`'{applied,eligibility_review,shortlisted,assessment,interview,offer,hired}'::text[]`),
    assessmentId: uuid(),
    openings: integer().notNull().default(1),
    status: text().notNull().default('draft'), // draft | published | closed | archived
    publishedAt: timestamp({ withTimezone: true }),
    closesAt: timestamp({ withTimezone: true }),
    campusOnly: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('job_postings_org_idx').on(t.orgId, t.status)],
);

export const jobApplications = pgTable(
  'job_applications',
  {
    id: id(),
    postingId: uuid()
      .notNull()
      .references(() => jobPostings.id, { onDelete: 'cascade' }),
    orgId: uuid().notNull(),
    candidateId: userRef(),
    stage: text().notNull().default('applied'),
    status: text().notNull().default('active'), // active | rejected | withdrawn | hired
    source: text().notNull().default('direct'), // direct | invited | campus_drive | referral
    resumeSnapshot: jsonb().$type<Record<string, unknown>>(),
    coverNote: text(),
    portfolioShared: boolean().notNull().default(true),
    matchSnapshot: jsonb().$type<{ score: number; factors: { label: string; met: boolean; evidence?: string }[] }>(),
    appliedAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('job_applications_uq').on(t.postingId, t.candidateId), index('job_applications_org_idx').on(t.orgId, t.stage)],
);

export const hiringDecisions = pgTable('hiring_decisions', {
  id: id(),
  applicationId: uuid()
    .notNull()
    .references(() => jobApplications.id, { onDelete: 'cascade' }),
  orgId: uuid().notNull(),
  decidedBy: uuid().notNull(),
  fromStage: text().notNull(),
  toStage: text().notNull(),
  reason: text().notNull(),
  visibleToCandidate: boolean().notNull().default(false),
  createdAt: createdAt(),
});

export const interviews = pgTable(
  'interviews',
  {
    id: id(),
    orgId: orgRef(),
    applicationId: uuid(), // job application
    driveCandidateId: uuid(), // or a campus drive candidate
    candidateId: userRef(),
    title: text().notNull(),
    kind: text().notNull().default('technical'), // technical | behavioral | system_design | hr | panel
    scheduledAt: timestamp({ withTimezone: true }).notNull(),
    durationMinutes: integer().notNull().default(45),
    meetingUrl: text(),
    meetingProvider: text(), // jitsi | custom
    interviewerIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    status: text().notNull().default('scheduled'), // scheduled | completed | cancelled | no_show
    createdBy: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('interviews_org_idx').on(t.orgId, t.scheduledAt)],
);

export const interviewFeedback = pgTable(
  'interview_feedback',
  {
    id: id(),
    interviewId: uuid()
      .notNull()
      .references(() => interviews.id, { onDelete: 'cascade' }),
    interviewerId: uuid().notNull(),
    recommendation: text().notNull(), // strong_yes | yes | no | strong_no
    scores: jsonb().$type<{ competency: string; rating: number; note?: string }[]>().notNull().default([]),
    summary: text().notNull(),
    submittedAt: createdAt(),
  },
  (t) => [uniqueIndex('interview_feedback_uq').on(t.interviewId, t.interviewerId)],
);

export const offers = pgTable('offers', {
  id: id(),
  orgId: orgRef(),
  applicationId: uuid()
    .notNull()
    .references(() => jobApplications.id, { onDelete: 'cascade' }),
  title: text().notNull(),
  compensationText: text().notNull(),
  startDate: timestamp({ withTimezone: true }),
  expiresAt: timestamp({ withTimezone: true }),
  status: text().notNull().default('draft'), // draft | extended | accepted | declined | rescinded | expired
  notes: text(),
  createdBy: uuid().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const messages = pgTable(
  'messages',
  {
    id: id(),
    threadKey: text().notNull(), // e.g. app:<jobApplicationId> | mentorship:<id> | dm:<a>:<b>
    orgId: uuid(),
    senderId: uuid().notNull(),
    body: text().notNull(),
    createdAt: createdAt(),
    readBy: uuid().array().notNull().default(sql`'{}'::uuid[]`),
  },
  (t) => [index('messages_thread_idx').on(t.threadKey, t.createdAt)],
);

// ---------- Mentorship ----------

export const mentorProfiles = pgTable('mentor_profiles', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  headline: text().notNull(),
  bio: text().notNull(),
  expertise: text().array().notNull(),
  yearsExperience: integer(),
  availability: jsonb().$type<{ day: number; start: string; end: string }[]>().notNull().default([]),
  maxMentees: integer().notNull().default(5),
  acceptingRequests: boolean().notNull().default(true),
  status: text().notNull().default('active'), // pending | active | paused
  orgId: uuid(), // mentor offered through an org (e.g. alumni program)
  createdAt: createdAt(),
});

export const mentorships = pgTable(
  'mentorships',
  {
    id: id(),
    mentorId: userRef(),
    menteeId: userRef(),
    orgId: uuid(),
    status: text().notNull().default('requested'), // requested | active | declined | ended
    requestMessage: text(),
    goalsSummary: text(),
    sharing: jsonb()
      .$type<{ skillDna: boolean; projects: boolean; assessments: boolean; applications: boolean }>()
      .notNull()
      .default({ skillDna: true, projects: true, assessments: false, applications: false }),
    startedAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('mentorships_mentor_idx').on(t.mentorId), index('mentorships_mentee_idx').on(t.menteeId)],
);

export const mentorSessions = pgTable('mentor_sessions', {
  id: id(),
  mentorshipId: uuid()
    .notNull()
    .references(() => mentorships.id, { onDelete: 'cascade' }),
  scheduledAt: timestamp({ withTimezone: true }).notNull(),
  durationMinutes: integer().notNull().default(30),
  agenda: text(),
  meetingUrl: text(),
  status: text().notNull().default('scheduled'), // requested | scheduled | completed | cancelled
  sharedNotes: text(), // visible to both
  mentorPrivateNotes: text(), // mentor only
  followUps: jsonb().$type<{ id: string; text: string; done: boolean }[]>().notNull().default([]),
  createdAt: createdAt(),
});

export const mentorFeedback = pgTable('mentor_feedback', {
  id: id(),
  mentorshipId: uuid()
    .notNull()
    .references(() => mentorships.id, { onDelete: 'cascade' }),
  authorId: uuid().notNull(),
  kind: text().notNull(), // progress_review | mentee_rating
  body: text().notNull(),
  rating: integer(),
  createdAt: createdAt(),
});

// ---------- Community ----------

export const communitySpaces = pgTable('community_spaces', {
  id: id(),
  orgId: uuid(), // null = public space
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text().notNull(),
  kind: text().notNull().default('topic'), // topic | study_group | doubt_room | showcase | events
  visibility: text().notNull().default('public'), // public | members
  createdBy: uuid(),
  createdAt: createdAt(),
});

export const spaceMembers = pgTable(
  'space_members',
  {
    spaceId: uuid()
      .notNull()
      .references(() => communitySpaces.id, { onDelete: 'cascade' }),
    userId: userRef(),
    role: text().notNull().default('member'), // member | moderator
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] })],
);

export const threads = pgTable(
  'threads',
  {
    id: id(),
    spaceId: uuid()
      .notNull()
      .references(() => communitySpaces.id, { onDelete: 'cascade' }),
    authorId: userRef(),
    kind: text().notNull().default('discussion'), // discussion | question | showcase | event | team_formation
    title: text().notNull(),
    body: text().notNull(),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    isPrivate: boolean().notNull().default(false), // private question: visible to author + moderators/mentors invited
    status: text().notNull().default('open'), // open | answered | locked | hidden
    acceptedPostId: uuid(),
    score: integer().notNull().default(0),
    replyCount: integer().notNull().default(0),
    projectId: uuid(),
    eventAt: timestamp({ withTimezone: true }),
    lastActivityAt: createdAt(),
    createdAt: createdAt(),
  },
  (t) => [index('threads_space_idx').on(t.spaceId, t.lastActivityAt)],
);

export const posts = pgTable(
  'posts',
  {
    id: id(),
    threadId: uuid()
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    authorId: userRef(),
    body: text().notNull(),
    score: integer().notNull().default(0),
    status: text().notNull().default('visible'), // visible | hidden
    createdAt: createdAt(),
    editedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('posts_thread_idx').on(t.threadId, t.createdAt)],
);

export const votes = pgTable(
  'votes',
  {
    userId: uuid().notNull(),
    targetType: text().notNull(), // thread | post
    targetId: uuid().notNull(),
    value: integer().notNull(), // 1 | -1
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetType, t.targetId] })],
);

export const studyGroups = pgTable('study_groups', {
  id: id(),
  spaceId: uuid(),
  name: text().notNull(),
  goal: text().notNull(),
  ownerId: uuid().notNull(),
  memberIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
  maxMembers: integer().notNull().default(8),
  sharedNotes: text().notNull().default(''),
  sharedTasks: jsonb().$type<{ id: string; text: string; done: boolean; assigneeId?: string }[]>().notNull().default([]),
  createdAt: createdAt(),
});

// ---------- Motivation ----------

export const challenges = pgTable('challenges', {
  id: id(),
  orgId: uuid(),
  title: text().notNull(),
  description: text().notNull(),
  kind: text().notNull().default('individual'), // individual | team | season
  metric: text().notNull(), // problems_solved | topics_completed | minutes
  target: integer().notNull(),
  startsAt: timestamp({ withTimezone: true }).notNull(),
  endsAt: timestamp({ withTimezone: true }).notNull(),
  createdBy: uuid(),
});

export const challengeParticipants = pgTable(
  'challenge_participants',
  {
    challengeId: uuid()
      .notNull()
      .references(() => challenges.id, { onDelete: 'cascade' }),
    userId: userRef(),
    teamName: text(),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.challengeId, t.userId] })],
);

export const accountabilityPartners = pgTable(
  'accountability_partners',
  {
    id: id(),
    userId: userRef(),
    partnerId: userRef(),
    status: text().notNull().default('pending'), // pending | active | ended
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('accountability_uq').on(t.userId, t.partnerId)],
);

