import { and, arrayContains, eq, inArray, isNotNull, isNull, ne, or, sql, getTableColumns, getTableName, is, type SQL } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../../db/client';
import * as schema from '../../db/schema';
import {
  users,
  profiles,
  goals,
  notes,
  tasks,
  savedLinks,
  bookmarks,
  resourceRatings,
  readingHistory,
  resources,
  enrollments,
  topicProgress,
  skillEvidence,
  activityEvents,
  attempts,
  attemptAnswers,
  assessmentInvites,
  assessments,
  questions,
  codeRuns,
  hintReveals,
  regradeRequests,
  aiConversations,
  aiMessages,
  aiUsage,
  applications,
  applicationEvents,
  resumes,
  careerDocuments,
  jobTargets,
  interviewPractice,
  journalEntries,
  offerPriorities,
  projects,
  projectMilestones,
  projectTasks,
  projectMembers,
  portfolios,
  portfolioVersions,
  achievements,
  certificates,
  mentorProfiles,
  mentorships,
  mentorSessions,
  mentorFeedback,
  messages,
  threads,
  posts,
  votes,
  spaceMembers,
  studyGroups,
  challengeParticipants,
  accountabilityPartners,
  notifications,
  files,
  memberships,
  organizations,
  cohortMembers,
  courseInstructors,
  submissions,
  evaluations,
  submissionComments,
  jobApplications,
  hiringDecisions,
  interviews,
  interviewFeedback,
  studentRecords,
  driveCandidates,
  attendanceMarks,
  recordCorrections,
  sessions,
  passwordResets,
  auditLogs,
  dataRequests,
  usageCounters,
  reports,
} from '../../db/schema';
import { getSetting } from '../files/service';
import { recomputeRating } from '../library/service';
import { privacyHandlers, type ErasureResult } from './registry';

export const EXPORT_FORMAT = 'learnsphere.personal-data';
export const EXPORT_TTL_DAYS = 7;
export const DELETE_CONFIRM_TEXT = 'delete my account';

export async function deletionGraceDays() {
  const v = Number(await getSetting<number>('privacy.deletionGraceDays', 7));
  return Number.isFinite(v) ? Math.min(90, Math.max(0, Math.round(v))) : 7;
}

/** What happens to each kind of data when an account is deleted, and why. Shown in Settings → Privacy. */
export const RETENTION_RULES = [
  { key: 'personal', label: 'Personal content', outcome: 'deleted', detail: 'Profile, preferences, notes, tasks, saved links, bookmarks, learning progress, AI conversations, resumes, documents, applications you track, personal projects, portfolio, uploaded files, notifications and sessions are permanently deleted.' },
  { key: 'assessments', label: 'Assessment attempts and scores', outcome: 'anonymized', detail: 'Organizations that ran an assessment must keep result records for academic and hiring integrity. Attempts and scores stay, linked to "Deleted user" instead of your name and email.' },
  { key: 'assignments', label: 'Assignment submissions and grades', outcome: 'anonymized', detail: 'Institutions are obliged to keep academic records. Submissions, evaluations and their files stay with the institution under an anonymous label.' },
  { key: 'hiring', label: 'Employer hiring records', outcome: 'anonymized', detail: 'Employers keep application stages, interview feedback and hiring decisions for record-keeping. The resume snapshot and cover note you shared are removed.' },
  { key: 'institution', label: 'Student, attendance and placement records', outcome: 'retained', detail: 'Records your institution maintains (roll number, attendance, placement drive stages) remain under the institution\'s control and policy, without your name or email.' },
  { key: 'community', label: 'Community posts and messages', outcome: 'anonymized', detail: 'Messages you sent are deleted. Post and thread text is replaced with a removal notice so other people\'s replies still make sense; your votes are deleted.' },
  { key: 'mentorship', label: 'Mentorship history', outcome: 'anonymized', detail: 'The other person keeps their side of the relationship (shared session notes and their private notes). Your request messages, feedback and private notes are removed.' },
  { key: 'audit', label: 'Security audit log', outcome: 'anonymized', detail: 'Audit entries are kept for security accountability with your name and email removed.' },
  { key: 'requests', label: 'Privacy requests', outcome: 'retained', detail: 'The record of your export and deletion requests is kept as proof that the request was completed.' },
  { key: 'aggregates', label: 'Aggregate statistics', outcome: 'anonymized', detail: 'Totals such as resource view counts keep no link to you. Your ratings are deleted and averages recalculated.' },
] as const;

export const RETENTION_SUMMARY = {
  graceNote: 'Deletion runs after a grace period. During it you can sign in and cancel; other devices are signed out immediately.',
  exportNote: `Data exports are kept for ${EXPORT_TTL_DAYS} days and can only be downloaded by you.`,
};

// ---------- Counting ----------

async function count(table: PgTable, where: SQL | undefined) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
  return row?.n ?? 0;
}

export async function dataCategories(userId: string) {
  const uid = userId;
  const rows = await Promise.all([
    count(profiles, eq(profiles.userId, uid)).then((n) => ({ key: 'profile', label: 'Profile', count: n })),
    count(notes, eq(notes.userId, uid)).then((n) => ({ key: 'notes', label: 'Notes and knowledge documents', count: n })),
    count(tasks, eq(tasks.userId, uid)).then((n) => ({ key: 'tasks', label: 'Tasks', count: n })),
    count(savedLinks, eq(savedLinks.userId, uid)).then((n) => ({ key: 'links', label: 'Saved links', count: n })),
    count(bookmarks, eq(bookmarks.userId, uid)).then((n) => ({ key: 'bookmarks', label: 'Bookmarks', count: n })),
    count(goals, eq(goals.userId, uid)).then((n) => ({ key: 'goals', label: 'Goals', count: n })),
    count(enrollments, eq(enrollments.userId, uid)).then((n) => ({ key: 'enrollments', label: 'Roadmap enrollments', count: n })),
    count(topicProgress, eq(topicProgress.userId, uid)).then((n) => ({ key: 'progress', label: 'Topic progress', count: n })),
    count(skillEvidence, eq(skillEvidence.userId, uid)).then((n) => ({ key: 'evidence', label: 'Skill evidence', count: n })),
    count(activityEvents, eq(activityEvents.userId, uid)).then((n) => ({ key: 'activity', label: 'Activity history', count: n })),
    count(attempts, eq(attempts.userId, uid)).then((n) => ({ key: 'attempts', label: 'Assessment attempts', count: n })),
    count(codeRuns, eq(codeRuns.userId, uid)).then((n) => ({ key: 'code_runs', label: 'Code runs', count: n })),
    count(aiConversations, eq(aiConversations.userId, uid)).then((n) => ({ key: 'ai', label: 'AI conversations', count: n })),
    count(applications, eq(applications.userId, uid)).then((n) => ({ key: 'applications', label: 'Tracked applications', count: n })),
    count(resumes, eq(resumes.userId, uid)).then((n) => ({ key: 'resumes', label: 'Resumes', count: n })),
    count(careerDocuments, eq(careerDocuments.userId, uid)).then((n) => ({ key: 'documents', label: 'Career documents', count: n })),
    count(projects, eq(projects.ownerId, uid)).then((n) => ({ key: 'projects', label: 'Projects you own', count: n })),
    count(portfolios, eq(portfolios.userId, uid)).then((n) => ({ key: 'portfolio', label: 'Portfolio', count: n })),
    count(mentorships, or(eq(mentorships.mentorId, uid), eq(mentorships.menteeId, uid))).then((n) => ({ key: 'mentorships', label: 'Mentorships', count: n })),
    count(posts, eq(posts.authorId, uid)).then(async (n) => ({ key: 'community', label: 'Community threads and replies', count: n + (await count(threads, eq(threads.authorId, uid))) })),
    count(submissions, eq(submissions.userId, uid)).then((n) => ({ key: 'submissions', label: 'Assignment submissions', count: n })),
    count(jobApplications, eq(jobApplications.candidateId, uid)).then((n) => ({ key: 'job_applications', label: 'Applications to employers', count: n })),
    count(notifications, eq(notifications.userId, uid)).then((n) => ({ key: 'notifications', label: 'Notifications', count: n })),
    count(files, and(eq(files.ownerId, uid), eq(files.status, 'ready'))).then((n) => ({ key: 'files', label: 'Uploaded files', count: n })),
  ]);
  return rows;
}

// ---------- Export archive ----------

const SENSITIVE_COLUMN = /hash|secret|token|apikey|api_key|answerkey|answer_key|enc$|password/i;

/** Tables this module handles explicitly; everything else with a userId column is swept generically. */
const HANDLED_TABLES = new Set<string>(
  [
    users, profiles, goals, notes, tasks, savedLinks, bookmarks, resourceRatings, readingHistory, enrollments, topicProgress, skillEvidence, activityEvents,
    attempts, attemptAnswers, assessmentInvites, codeRuns, hintReveals, regradeRequests, aiConversations, aiMessages, aiUsage, applications, applicationEvents,
    resumes, careerDocuments, jobTargets, interviewPractice, journalEntries, offerPriorities, projects, projectMilestones, projectTasks, projectMembers, portfolios,
    portfolioVersions, achievements, certificates, mentorProfiles, mentorships, mentorSessions, mentorFeedback, messages, threads, posts, votes, spaceMembers,
    studyGroups, challengeParticipants, accountabilityPartners, notifications, files, memberships, cohortMembers, courseInstructors, submissions, evaluations, submissionComments,
    jobApplications, hiringDecisions, interviews, interviewFeedback, studentRecords, driveCandidates, attendanceMarks, recordCorrections, sessions, passwordResets,
    auditLogs, dataRequests, usageCounters, reports,
  ].map((t) => getTableName(t as PgTable)),
);

/** Records an institution must keep: never deleted by the generic sweep. */
const RETAIN_PATTERN = /grade|evaluation|submission|attempt|attendance|record|decision|audit|feedback|offer|interview|placement|drive|certificate|invoice|consent/i;
/** Personal helpers that merely mention those words (mock interviews, offer ratings, reminders) are still deleted. */
const PERSONAL_PATTERN = /mock|practice|pref|draft|reminder|saved|rating|signup|journal|note/i;

function genericUserTables() {
  const covered = new Set(privacyHandlers().flatMap((h) => h.tables ?? []));
  const out: { name: string; table: PgTable; userCol: ReturnType<typeof getTableColumns>[string]; safeCols: Record<string, ReturnType<typeof getTableColumns>[string]> }[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const name = getTableName(value);
    if (HANDLED_TABLES.has(name) || covered.has(name)) continue;
    const cols = getTableColumns(value) as Record<string, ReturnType<typeof getTableColumns>[string]>;
    if (!cols.userId) continue;
    const safeCols = Object.fromEntries(Object.entries(cols).filter(([k, c]) => !SENSITIVE_COLUMN.test(k) && c.getSQLType() !== 'bytea'));
    out.push({ name, table: value, userCol: cols.userId, safeCols });
  }
  return out;
}

/** Builds the user's personal-data archive. Only their own records; never answer keys or other people's private notes. */
export async function buildArchive(userId: string) {
  const uid = userId;
  const [u] = await db.select().from(users).where(eq(users.id, uid));
  if (!u) throw new Error('User not found');

  const myAttempts = await db
    .select({
      id: attempts.id,
      assessmentId: attempts.assessmentId,
      assessmentTitle: assessments.title,
      attemptNo: attempts.attemptNo,
      status: attempts.status,
      startedAt: attempts.startedAt,
      submittedAt: attempts.submittedAt,
      releasedAt: attempts.releasedAt,
      score: attempts.score,
      maxScore: attempts.maxScore,
    })
    .from(attempts)
    .leftJoin(assessments, eq(assessments.id, attempts.assessmentId))
    .where(eq(attempts.userId, uid));
  const answers = myAttempts.length
    ? await db
        .select({
          attemptId: attemptAnswers.attemptId,
          questionId: attemptAnswers.questionId,
          questionTitle: questions.title,
          answer: attemptAnswers.answer,
          savedAt: attemptAnswers.savedAt,
          finalScore: attemptAnswers.finalScore,
          maxPoints: attemptAnswers.maxPoints,
          feedback: attemptAnswers.feedback,
        })
        .from(attemptAnswers)
        .leftJoin(questions, eq(questions.id, attemptAnswers.questionId))
        .where(inArray(attemptAnswers.attemptId, myAttempts.map((a) => a.id)))
    : [];

  const convs = await db.select().from(aiConversations).where(eq(aiConversations.userId, uid));
  const msgs = convs.length
    ? await db
        .select({ conversationId: aiMessages.conversationId, role: aiMessages.role, content: aiMessages.content, sources: aiMessages.sources, provider: aiMessages.provider, model: aiMessages.model, createdAt: aiMessages.createdAt })
        .from(aiMessages)
        .where(inArray(aiMessages.conversationId, convs.map((c) => c.id)))
    : [];

  const apps = await db.select().from(applications).where(eq(applications.userId, uid));
  const appEvents = apps.length ? await db.select().from(applicationEvents).where(inArray(applicationEvents.applicationId, apps.map((a) => a.id))) : [];

  const myProjects = await db.select().from(projects).where(eq(projects.ownerId, uid));
  const pIds = myProjects.map((p) => p.id);
  const [milestones, ptasks] = pIds.length
    ? await Promise.all([db.select().from(projectMilestones).where(inArray(projectMilestones.projectId, pIds)), db.select().from(projectTasks).where(inArray(projectTasks.projectId, pIds))])
    : [[], []];

  const ships = await db.select().from(mentorships).where(or(eq(mentorships.mentorId, uid), eq(mentorships.menteeId, uid)));
  const shipIds = ships.map((m) => m.id);
  const [sess, fb] = shipIds.length
    ? await Promise.all([db.select().from(mentorSessions).where(inArray(mentorSessions.mentorshipId, shipIds)), db.select().from(mentorFeedback).where(inArray(mentorFeedback.mentorshipId, shipIds))])
    : [[], []];

  const mySubs = await db.select().from(submissions).where(eq(submissions.userId, uid));
  const evals = mySubs.length
    ? await db
        .select({ submissionId: evaluations.submissionId, finalScore: evaluations.finalScore, rawScore: evaluations.rawScore, latePenalty: evaluations.latePenalty, feedback: evaluations.feedback, rubricScores: evaluations.rubricScores, releasedAt: evaluations.releasedAt })
        .from(evaluations)
        .where(and(inArray(evaluations.submissionId, mySubs.map((s) => s.id)), eq(evaluations.released, true), isNull(evaluations.supersededBy)))
    : [];
  const sharedComments = mySubs.length
    ? await db.select({ submissionId: submissionComments.submissionId, body: submissionComments.body, createdAt: submissionComments.createdAt }).from(submissionComments).where(and(inArray(submissionComments.submissionId, mySubs.map((s) => s.id)), eq(submissionComments.visibility, 'shared')))
    : [];

  const jobApps = await db
    .select({ id: jobApplications.id, postingId: jobApplications.postingId, orgId: jobApplications.orgId, stage: jobApplications.stage, status: jobApplications.status, source: jobApplications.source, coverNote: jobApplications.coverNote, appliedAt: jobApplications.appliedAt })
    .from(jobApplications)
    .where(eq(jobApplications.candidateId, uid));
  const decisions = jobApps.length
    ? await db
        .select({ applicationId: hiringDecisions.applicationId, toStage: hiringDecisions.toStage, reason: hiringDecisions.reason, createdAt: hiringDecisions.createdAt })
        .from(hiringDecisions)
        .where(and(inArray(hiringDecisions.applicationId, jobApps.map((a) => a.id)), eq(hiringDecisions.visibleToCandidate, true)))
    : [];

  const generic: Record<string, unknown[]> = {};
  for (const g of genericUserTables()) {
    try {
      generic[g.name] = await db.select(g.safeCols).from(g.table).where(eq(g.userCol, uid)).limit(5000);
    } catch {
      generic[g.name] = [];
    }
  }
  const registered: Record<string, unknown> = {};
  for (const h of privacyHandlers()) {
    if (!h.export) continue;
    try {
      registered[h.key] = await h.export(uid);
    } catch {
      registered[h.key] = { error: 'This section could not be exported.' };
    }
  }

  const strip = <T extends Record<string, unknown>>(rows: T[], ...keys: string[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k))));

  return {
    format: EXPORT_FORMAT,
    version: 1,
    generatedAt: new Date().toISOString(),
    notice: 'This archive contains data linked to your account. Answer keys, other people\'s private notes and internal reviewer comments are not included.',
    account: { id: u.id, email: u.email, name: u.name, status: u.status, timezone: u.timezone, locale: u.locale, createdAt: u.createdAt, lastActiveAt: u.lastActiveAt },
    preferences: u.preferences,
    profile: (await db.select().from(profiles).where(eq(profiles.userId, uid)))[0] ?? null,
    organizations: await db
      .select({ orgId: memberships.orgId, organization: organizations.name, roles: memberships.roles, status: memberships.status, joinedAt: memberships.createdAt })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, uid)),
    sessions: await db.select({ userAgent: sessions.userAgent, ip: sessions.ip, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, revokedAt: sessions.revokedAt }).from(sessions).where(eq(sessions.userId, uid)),
    workspace: {
      notes: strip(await db.select().from(notes).where(eq(notes.userId, uid)), 'userId'),
      tasks: strip(await db.select().from(tasks).where(eq(tasks.userId, uid)), 'userId'),
      savedLinks: strip(await db.select().from(savedLinks).where(eq(savedLinks.userId, uid)), 'userId'),
      bookmarks: strip(await db.select().from(bookmarks).where(eq(bookmarks.userId, uid)), 'userId'),
    },
    learning: {
      goals: strip(await db.select().from(goals).where(eq(goals.userId, uid)), 'userId'),
      enrollments: strip(await db.select().from(enrollments).where(eq(enrollments.userId, uid)), 'userId'),
      topicProgress: strip(await db.select().from(topicProgress).where(eq(topicProgress.userId, uid)), 'userId'),
      skillEvidence: strip(await db.select().from(skillEvidence).where(eq(skillEvidence.userId, uid)), 'userId'),
      resourceRatings: strip(await db.select().from(resourceRatings).where(eq(resourceRatings.userId, uid)), 'userId'),
      readingHistory: strip(await db.select().from(readingHistory).where(eq(readingHistory.userId, uid)), 'userId'),
    },
    activity: strip(await db.select().from(activityEvents).where(eq(activityEvents.userId, uid)), 'userId', 'dedupeKey'),
    assessments: {
      invitations: await db.select({ assessmentId: assessmentInvites.assessmentId, dueAt: assessmentInvites.dueAt, status: assessmentInvites.status, createdAt: assessmentInvites.createdAt }).from(assessmentInvites).where(eq(assessmentInvites.userId, uid)),
      attempts: myAttempts.map((a) => ({
        ...a,
        // Scores appear only once results were released to you.
        score: a.releasedAt ? a.score : null,
        maxScore: a.maxScore,
        answers: answers
          .filter((x) => x.attemptId === a.id)
          .map(({ attemptId: _a, finalScore, feedback, ...rest }) => ({ ...rest, finalScore: a.releasedAt ? finalScore : null, feedback: a.releasedAt ? feedback : null })),
      })),
      regradeRequests: await db.select().from(regradeRequests).where(eq(regradeRequests.requesterId, uid)),
    },
    codeRuns: strip(await db.select().from(codeRuns).where(eq(codeRuns.userId, uid)), 'userId'),
    ai: { conversations: convs.map((c) => ({ id: c.id, assistant: c.assistant, title: c.title, context: c.context, createdAt: c.createdAt, messages: msgs.filter((m) => m.conversationId === c.id).map(({ conversationId: _c, ...m }) => m) })) },
    career: {
      applications: apps.map((a) => ({ ...a, userId: undefined, events: appEvents.filter((e) => e.applicationId === a.id) })),
      resumes: strip(await db.select().from(resumes).where(eq(resumes.userId, uid)), 'userId'),
      documents: strip(await db.select().from(careerDocuments).where(eq(careerDocuments.userId, uid)), 'userId'),
      jobTargets: strip(await db.select().from(jobTargets).where(eq(jobTargets.userId, uid)), 'userId'),
      interviewPractice: strip(await db.select().from(interviewPractice).where(eq(interviewPractice.userId, uid)), 'userId'),
      journal: strip(await db.select().from(journalEntries).where(eq(journalEntries.userId, uid)), 'userId'),
      offerPriorities: (await db.select().from(offerPriorities).where(eq(offerPriorities.userId, uid)))[0] ?? null,
      employerApplications: jobApps.map((a) => ({ ...a, decisionsSharedWithYou: decisions.filter((d) => d.applicationId === a.id) })),
    },
    projects: myProjects.map((p) => ({ ...p, milestones: milestones.filter((m) => m.projectId === p.id), tasks: ptasks.filter((t) => t.projectId === p.id) })),
    portfolio: {
      portfolio: (await db.select().from(portfolios).where(eq(portfolios.userId, uid)).then((r) => strip(r, 'shareToken')))[0] ?? null,
      versions: strip(await db.select().from(portfolioVersions).where(eq(portfolioVersions.userId, uid)), 'userId'),
      achievements: strip(await db.select().from(achievements).where(eq(achievements.userId, uid)), 'userId'),
      certificates: strip(await db.select().from(certificates).where(eq(certificates.userId, uid)), 'userId'),
    },
    mentorship: {
      mentorProfile: (await db.select().from(mentorProfiles).where(eq(mentorProfiles.userId, uid)))[0] ?? null,
      relationships: ships.map((m) => {
        const iAmMentor = m.mentorId === uid;
        return {
          id: m.id,
          role: iAmMentor ? 'mentor' : 'mentee',
          status: m.status,
          requestMessage: m.requestMessage,
          goalsSummary: m.goalsSummary,
          sharing: m.sharing,
          startedAt: m.startedAt,
          endedAt: m.endedAt,
          sessions: sess
            .filter((s) => s.mentorshipId === m.id)
            // The mentor's private notes belong to the mentor only.
            .map(({ mentorPrivateNotes, ...s }) => (iAmMentor ? { ...s, mentorPrivateNotes } : s)),
          feedbackYouWrote: fb.filter((f) => f.mentorshipId === m.id && f.authorId === uid),
        };
      }),
    },
    community: {
      threads: await db.select({ id: threads.id, spaceId: threads.spaceId, title: threads.title, body: threads.body, kind: threads.kind, tags: threads.tags, createdAt: threads.createdAt }).from(threads).where(eq(threads.authorId, uid)),
      posts: await db.select({ id: posts.id, threadId: posts.threadId, body: posts.body, createdAt: posts.createdAt, editedAt: posts.editedAt }).from(posts).where(eq(posts.authorId, uid)),
      messagesSent: await db.select({ threadKey: messages.threadKey, body: messages.body, createdAt: messages.createdAt }).from(messages).where(eq(messages.senderId, uid)),
    },
    academic: {
      submissions: mySubs.map((s) => ({ ...s, userId: undefined, evaluations: evals.filter((e) => e.submissionId === s.id), comments: sharedComments.filter((c) => c.submissionId === s.id) })),
    },
    notifications: strip(await db.select().from(notifications).where(eq(notifications.userId, uid)), 'userId'),
    files: await db
      .select({ id: files.id, purpose: files.purpose, filename: files.filename, mime: files.mime, size: files.size, sha256: files.sha256, status: files.status, createdAt: files.createdAt })
      .from(files)
      .where(and(eq(files.ownerId, uid), ne(files.purpose, 'export'))),
    otherModules: { ...generic, ...registered },
    privacyRequests: await db.select({ kind: dataRequests.kind, status: dataRequests.status, createdAt: dataRequests.createdAt, completedAt: dataRequests.completedAt }).from(dataRequests).where(eq(dataRequests.userId, uid)),
  };
}

// ---------- Erasure ----------

export type SummaryItem = ErasureResult & { key: string; label: string };

const ONE = { one: sql<number>`1` };

async function del(table: PgTable, where: SQL | undefined) {
  return (await db.delete(table).where(where).returning(ONE)).length;
}

/**
 * Deletes personal content and anonymizes records others are obliged to keep.
 * Every step is idempotent, so a retried job continues safely where it stopped.
 */
export async function eraseUser(userId: string): Promise<SummaryItem[]> {
  const uid = userId;
  const short = uid.slice(0, 8);
  const items: SummaryItem[] = [];
  const step = async (key: string, label: string, action: ErasureResult['action'], fn: () => Promise<number>, reason?: string) => {
    items.push({ key, label, action, count: await fn(), ...(reason ? { reason } : {}) });
  };

  // Personal content: deleted.
  await step('notes', 'Notes and knowledge documents', 'deleted', () => del(notes, eq(notes.userId, uid)));
  await step('tasks', 'Tasks', 'deleted', () => del(tasks, eq(tasks.userId, uid)));
  await step('links', 'Saved links', 'deleted', () => del(savedLinks, eq(savedLinks.userId, uid)));
  await step('bookmarks', 'Bookmarks', 'deleted', () => del(bookmarks, eq(bookmarks.userId, uid)));
  await step('ratings', 'Resource ratings (averages recalculated)', 'deleted', async () => {
    const rated = await db.delete(resourceRatings).where(eq(resourceRatings.userId, uid)).returning({ id: resourceRatings.resourceId });
    for (const r of rated) await recomputeRating(r.id);
    return rated.length;
  });
  await step('reading', 'Reading history', 'deleted', () => del(readingHistory, eq(readingHistory.userId, uid)));
  await step('goals', 'Goals', 'deleted', () => del(goals, eq(goals.userId, uid)));
  await step('enrollments', 'Roadmap enrollments', 'deleted', () => del(enrollments, eq(enrollments.userId, uid)));
  await step('progress', 'Topic progress', 'deleted', () => del(topicProgress, eq(topicProgress.userId, uid)));
  await step('evidence', 'Skill evidence', 'deleted', () => del(skillEvidence, eq(skillEvidence.userId, uid)));
  await step('activity', 'Activity history and XP', 'deleted', () => del(activityEvents, eq(activityEvents.userId, uid)));
  await step('hints', 'Hint reveals', 'deleted', () => del(hintReveals, eq(hintReveals.userId, uid)));
  await step('code_runs', 'Practice code runs', 'deleted', () => del(codeRuns, and(eq(codeRuns.userId, uid), isNull(codeRuns.attemptId))));
  await step('ai', 'AI conversations', 'deleted', () => del(aiConversations, eq(aiConversations.userId, uid)));
  await step('ai_usage', 'AI usage accounting', 'anonymized', async () => (await db.update(aiUsage).set({ userId: null }).where(eq(aiUsage.userId, uid)).returning(ONE)).length, 'Usage totals are kept for capacity planning without your identity.');
  await step('applications', 'Tracked applications', 'deleted', () => del(applications, eq(applications.userId, uid)));
  await step('resumes', 'Resumes', 'deleted', () => del(resumes, eq(resumes.userId, uid)));
  await step('documents', 'Career documents', 'deleted', () => del(careerDocuments, eq(careerDocuments.userId, uid)));
  await step('job_targets', 'Job targets', 'deleted', () => del(jobTargets, eq(jobTargets.userId, uid)));
  await step('interview_practice', 'Interview practice', 'deleted', () => del(interviewPractice, eq(interviewPractice.userId, uid)));
  await step('journal', 'Growth journal', 'deleted', () => del(journalEntries, eq(journalEntries.userId, uid)));
  await step('offer_priorities', 'Offer priorities', 'deleted', () => del(offerPriorities, eq(offerPriorities.userId, uid)));
  await step('projects', 'Personal projects', 'deleted', () => del(projects, and(eq(projects.ownerId, uid), isNull(projects.orgId))));
  await step('project_memberships', 'Memberships in other people\'s projects', 'deleted', () => del(projectMembers, eq(projectMembers.userId, uid)));
  await step('portfolio', 'Portfolio and versions', 'deleted', async () => (await del(portfolios, eq(portfolios.userId, uid))) + (await del(portfolioVersions, eq(portfolioVersions.userId, uid))));
  await step('achievements', 'Achievements and certificates', 'deleted', async () => (await del(achievements, eq(achievements.userId, uid))) + (await del(certificates, eq(certificates.userId, uid))));
  await step('mentor_profile', 'Mentor profile', 'deleted', () => del(mentorProfiles, eq(mentorProfiles.userId, uid)));
  await step('resource_drafts', 'Unpublished library submissions', 'deleted', () => del(resources, and(isNull(resources.orgId), eq(resources.authorId, uid), ne(resources.status, 'published'), ne(resources.status, 'archived'))));
  await step('resource_published', 'Published public library contributions', 'anonymized', async () => (await db.update(resources).set({ authorId: null }).where(and(isNull(resources.orgId), eq(resources.authorId, uid))).returning(ONE)).length, 'Published resources stay available to learners without attribution.');
  await step('messages', 'Messages you sent', 'deleted', () => del(messages, eq(messages.senderId, uid)));
  await step('votes', 'Community votes', 'deleted', () => del(votes, eq(votes.userId, uid)));
  await step('community_memberships', 'Space, challenge and partner memberships', 'deleted', async () => (await del(spaceMembers, eq(spaceMembers.userId, uid))) + (await del(challengeParticipants, eq(challengeParticipants.userId, uid))) + (await del(accountabilityPartners, or(eq(accountabilityPartners.userId, uid), eq(accountabilityPartners.partnerId, uid)))));
  await step('study_groups', 'Study group memberships', 'deleted', async () => (await db.update(studyGroups).set({ memberIds: sql`array_remove(${studyGroups.memberIds}, ${uid}::uuid)` }).where(arrayContains(studyGroups.memberIds, [uid])).returning(ONE)).length);
  await step('notifications', 'Notifications', 'deleted', () => del(notifications, eq(notifications.userId, uid)));
  await step('files', 'Uploaded files', 'deleted', async () => (await db.update(files).set({ status: 'deleted', data: null, filename: 'deleted' }).where(and(eq(files.ownerId, uid), ne(files.purpose, 'submission'), ne(files.status, 'deleted'))).returning(ONE)).length);
  await step('profile', 'Profile', 'deleted', () => del(profiles, eq(profiles.userId, uid)));
  await step('memberships', 'Organization memberships', 'deleted', () => del(memberships, eq(memberships.userId, uid)));
  await step('sessions', 'Sessions and password reset links', 'deleted', async () => (await del(sessions, eq(sessions.userId, uid))) + (await del(passwordResets, eq(passwordResets.userId, uid))));
  await step('usage', 'Personal usage counters', 'deleted', () => del(usageCounters, and(eq(usageCounters.scope, 'user'), eq(usageCounters.scopeId, uid))));

  // Shared records: the other side keeps theirs, yours is removed.
  const PLACEHOLDER = '[Removed: the author deleted their account.]';
  await step('community_posts', 'Community threads and replies', 'anonymized', async () => {
    const p = await db.update(posts).set({ body: PLACEHOLDER }).where(and(eq(posts.authorId, uid), ne(posts.body, PLACEHOLDER))).returning(ONE);
    const t = await db.update(threads).set({ body: PLACEHOLDER }).where(and(eq(threads.authorId, uid), ne(threads.body, PLACEHOLDER))).returning(ONE);
    return p.length + t.length;
  }, 'Text replaced with a removal notice so other people\'s replies keep their context.');
  await step('mentorships', 'Mentorship history', 'anonymized', async () => {
    const asMentee = await db.update(mentorships).set({ requestMessage: null, goalsSummary: null }).where(eq(mentorships.menteeId, uid)).returning({ id: mentorships.id });
    const asMentor = await db.select({ id: mentorships.id }).from(mentorships).where(eq(mentorships.mentorId, uid));
    const all = [...asMentee, ...asMentor].map((m) => m.id);
    if (all.length) {
      await db.update(mentorships).set({ status: 'ended', endedAt: sql`coalesce(${mentorships.endedAt}, now())` }).where(and(inArray(mentorships.id, all), inArray(mentorships.status, ['requested', 'active'])));
      if (asMentor.length) await db.update(mentorSessions).set({ mentorPrivateNotes: null }).where(inArray(mentorSessions.mentorshipId, asMentor.map((m) => m.id)));
    }
    await del(mentorFeedback, eq(mentorFeedback.authorId, uid));
    return all.length;
  }, 'The other person keeps shared session notes and their own private notes.');

  // Records institutions and employers must keep: anonymized via the user row, scores kept.
  await step('attempts', 'Assessment attempts and scores', 'anonymized', () => count(attempts, eq(attempts.userId, uid)), 'Kept for the organization that ran the assessment; scores unchanged, identity removed.');
  await step('assessment_runs', 'Code runs inside assessment attempts', 'retained', () => count(codeRuns, and(eq(codeRuns.userId, uid), isNotNull(codeRuns.attemptId))), 'Part of the graded attempt record.');
  await step('submissions', 'Assignment submissions, files and grades', 'anonymized', async () => {
    const n = await count(submissions, eq(submissions.userId, uid));
    await db.update(files).set({ filename: sql`'submission-' || left(${files.id}::text, 8)` }).where(and(eq(files.ownerId, uid), eq(files.purpose, 'submission'), eq(files.status, 'ready')));
    return n;
  }, 'Institutions must keep academic records; grades and evaluations are unchanged.');
  await step('job_applications', 'Employer hiring records', 'anonymized', async () => {
    const res = await db.update(jobApplications).set({ resumeSnapshot: null, coverNote: null }).where(eq(jobApplications.candidateId, uid)).returning(ONE);
    return res.length;
  }, 'Stages, interview feedback and hiring decisions are kept by the employer; your resume snapshot and cover note are removed.');
  await step('hiring_decisions', 'Hiring decisions and interviews', 'retained', async () => (await count(interviews, eq(interviews.candidateId, uid))) + (await count(hiringDecisions, inArray(hiringDecisions.applicationId, db.select({ id: jobApplications.id }).from(jobApplications).where(eq(jobApplications.candidateId, uid))))), 'Employer record-keeping obligation; linked to "Deleted user".');
  await step('institution_records', 'Student, attendance, roster, teaching and placement records', 'retained', async () => (await count(studentRecords, eq(studentRecords.userId, uid))) + (await count(attendanceMarks, eq(attendanceMarks.userId, uid))) + (await count(cohortMembers, eq(cohortMembers.userId, uid))) + (await count(courseInstructors, eq(courseInstructors.userId, uid))) + (await count(driveCandidates, eq(driveCandidates.userId, uid))) + (await count(recordCorrections, eq(recordCorrections.requestedBy, uid))), 'Maintained by your institution under its own retention policy.');
  await step('invites_regrades', 'Assessment invitations and regrade requests', 'retained', async () => (await count(assessmentInvites, eq(assessmentInvites.userId, uid))) + (await count(regradeRequests, eq(regradeRequests.requesterId, uid))), 'Part of the assessment record.');
  await step('reports', 'Moderation reports you filed', 'retained', () => count(reports, eq(reports.reporterId, uid)), 'Kept for moderation history; linked to "Deleted user".');
  await step('audit', 'Security audit log', 'anonymized', async () => {
    const res = await db
      .update(auditLogs)
      .set({ meta: sql`(${auditLogs.meta} - 'email' - 'name' - 'userEmail' - 'userName') || '{"anonymized": true}'::jsonb`, ip: null })
      .where(and(or(eq(auditLogs.actorId, uid), eq(auditLogs.targetId, uid)), sql`not (${auditLogs.meta} ? 'anonymized')`))
      .returning(ONE);
    return res.length;
  }, 'Kept for security accountability with name, email and IP removed.');

  // Other modules: registered handlers first, then a generic sweep of extension tables.
  for (const h of privacyHandlers()) {
    if (!h.erase) continue;
    const r = await h.erase(uid);
    items.push({ key: h.key, label: h.label, ...r });
  }
  for (const g of genericUserTables()) {
    if (RETAIN_PATTERN.test(g.name) && !PERSONAL_PATTERN.test(g.name)) {
      items.push({ key: g.name, label: g.name.replace(/_/g, ' '), action: 'retained', count: await count(g.table, eq(g.userCol, uid)), reason: 'Kept as an institutional record pending a module-specific rule.' });
    } else {
      items.push({ key: g.name, label: g.name.replace(/_/g, ' '), action: 'deleted', count: await del(g.table, eq(g.userCol, uid)) });
    }
  }

  // Finally, the account itself: kept only as an anonymous anchor for retained records.
  await db
    .update(users)
    .set({
      name: `Deleted user ${short}`,
      email: `deleted+${uid}@invalid`,
      passwordHash: null,
      status: 'deleted',
      platformRole: null,
      preferences: {},
      avatarColor: null,
      emailVerifiedAt: null,
      timezone: 'UTC',
      locale: 'en',
      lastActiveAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, uid));
  items.push({ key: 'account', label: 'Account (name, email, password)', action: 'anonymized', count: 1, reason: `Replaced with "Deleted user ${short}" so retained records no longer identify you. Sign-in is no longer possible.` });
  return items;
}
