/**
 * Teach module logic shared by the faculty routes, the student routes, jobs and analytics.
 * Every loader filters by the record's own orgId and returns 404 to people outside that org.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  assignments,
  assignmentTeams,
  cohortMembers,
  cohorts,
  courseCohorts,
  courseInstructors,
  courses,
  evaluations,
  files,
  submissions,
  users,
  skillEvidence,
  type RubricCriterion,
} from '../../db/schema';
import type { AuthContext, Ctx } from '../../lib/context';
import { requireAuth, rolesIn } from '../../lib/context';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { notify } from '../../lib/notify';
import { audit } from '../../lib/audit';
import { addEvidence } from '../learning/skilldna';
import type { OrgRole } from '@shared/roles';

export const STAFF_ROLES: OrgRole[] = ['faculty', 'faculty_admin', 'org_admin'];
export const ADMIN_ROLES: OrgRole[] = ['faculty_admin', 'org_admin'];
export const DAY_MS = 86400_000;

export type Assignment = typeof assignments.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Evaluation = typeof evaluations.$inferSelect;
export type Cohort = typeof cohorts.$inferSelect;
export type LatePolicy = Assignment['latePolicy'];

export function isStaff(auth: AuthContext, orgId: string | null | undefined) {
  return rolesIn(auth, orgId).some((r) => STAFF_ROLES.includes(r));
}
export function isAdmin(auth: AuthContext, orgId: string | null | undefined) {
  return rolesIn(auth, orgId).some((r) => ADMIN_ROLES.includes(r));
}

// ---------- Who teaches what ----------

/** Cohort ids in `orgId` the caller teaches (owner, instructor/TA member, or instructor/owner of a linked course). Admins: 'all'. */
export async function taughtCohortIds(auth: AuthContext, orgId: string): Promise<string[] | 'all'> {
  if (!isStaff(auth, orgId)) return [];
  if (isAdmin(auth, orgId)) return 'all';
  const uid = auth.user.id;
  const [owned, member, viaCourse, viaCourseOwner] = await Promise.all([
    db.select({ id: cohorts.id }).from(cohorts).where(and(eq(cohorts.orgId, orgId), eq(cohorts.ownerId, uid))),
    db
      .select({ id: cohorts.id })
      .from(cohortMembers)
      .innerJoin(cohorts, eq(cohorts.id, cohortMembers.cohortId))
      .where(and(eq(cohorts.orgId, orgId), eq(cohortMembers.userId, uid), inArray(cohortMembers.role, ['instructor', 'ta']))),
    db
      .select({ id: courseCohorts.cohortId })
      .from(courseInstructors)
      .innerJoin(courses, eq(courses.id, courseInstructors.courseId))
      .innerJoin(courseCohorts, eq(courseCohorts.courseId, courses.id))
      .where(and(eq(courses.orgId, orgId), eq(courseInstructors.userId, uid))),
    db
      .select({ id: courseCohorts.cohortId })
      .from(courses)
      .innerJoin(courseCohorts, eq(courseCohorts.courseId, courses.id))
      .where(and(eq(courses.orgId, orgId), eq(courses.ownerId, uid))),
  ]);
  return [...new Set([...owned, ...member, ...viaCourse, ...viaCourseOwner].map((r) => r.id))];
}

export async function teachesCohort(auth: AuthContext, cohort: { id: string; orgId: string }) {
  const ids = await taughtCohortIds(auth, cohort.orgId);
  return ids === 'all' || ids.includes(cohort.id);
}

/** Staff of another org (or non-staff) get 404; same-org faculty who do not teach the cohort get 403. */
export async function loadCohortForStaff(c: Ctx, id: string, opts: { mustTeach?: boolean } = { mustTeach: true }) {
  const auth = requireAuth(c);
  const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, id));
  if (!cohort || !isStaff(auth, cohort.orgId)) throw notFound('Cohort');
  if (opts.mustTeach !== false && !(await teachesCohort(auth, cohort))) throw forbidden('You do not teach this cohort. Ask a faculty admin to add you as an instructor.');
  return cohort;
}

export async function loadAssignmentForStaff(c: Ctx, id: string) {
  const auth = requireAuth(c);
  const [assignment] = await db.select().from(assignments).where(eq(assignments.id, id));
  if (!assignment || !isStaff(auth, assignment.orgId)) throw notFound('Assignment');
  const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, assignment.cohortId));
  if (!cohort || !(await teachesCohort(auth, cohort))) throw forbidden('You do not teach the cohort this assignment belongs to.');
  return { assignment, cohort };
}

export async function loadSubmissionForStaff(c: Ctx, id: string) {
  const auth = requireAuth(c);
  const [submission] = await db.select().from(submissions).where(eq(submissions.id, id));
  if (!submission || !isStaff(auth, submission.orgId)) throw notFound('Submission');
  const { assignment, cohort } = await loadAssignmentForStaff(c, submission.assignmentId).catch((e) => {
    if (e?.status === 404) throw notFound('Submission');
    throw e;
  });
  if (assignment.orgId !== submission.orgId) throw notFound('Submission');
  return { submission, assignment, cohort };
}

// ---------- Student membership ----------

export async function studentCohortIds(userId: string, orgIds: string[]) {
  if (!orgIds.length) return [];
  const rows = await db
    .select({ id: cohorts.id })
    .from(cohortMembers)
    .innerJoin(cohorts, eq(cohorts.id, cohortMembers.cohortId))
    .where(and(eq(cohortMembers.userId, userId), eq(cohortMembers.role, 'student'), inArray(cohorts.orgId, orgIds)));
  return rows.map((r) => r.id);
}

export async function isCohortStudent(userId: string, cohortId: string) {
  const [row] = await db
    .select({ userId: cohortMembers.userId })
    .from(cohortMembers)
    .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.userId, userId), eq(cohortMembers.role, 'student')));
  return !!row;
}

export async function cohortStudentIds(cohortId: string) {
  const rows = await db
    .select({ userId: cohortMembers.userId })
    .from(cohortMembers)
    .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.role, 'student')));
  return rows.map((r) => r.userId);
}

/** A published (or closed) assignment visible to a student of its cohort; everything else is 404. */
export async function loadAssignmentForStudent(c: Ctx, id: string) {
  const auth = requireAuth(c);
  const [assignment] = await db.select().from(assignments).where(eq(assignments.id, id));
  if (!assignment || assignment.status === 'draft' || !rolesIn(auth, assignment.orgId).length) throw notFound('Assignment');
  if (!(await isCohortStudent(auth.user.id, assignment.cohortId))) throw notFound('Assignment');
  return assignment;
}

export async function teamFor(assignmentId: string, userId: string) {
  const [team] = await db
    .select()
    .from(assignmentTeams)
    .where(and(eq(assignmentTeams.assignmentId, assignmentId), sql`${userId}::uuid = ANY(${assignmentTeams.memberIds})`));
  return team ?? null;
}

/** All versions (drafts included) of the caller's (or their team's) work on an assignment, oldest first. */
export async function ownerVersions(assignment: Assignment, userId: string, teamId: string | null) {
  const owner = assignment.collaboration === 'team' && teamId ? eq(submissions.teamId, teamId) : and(eq(submissions.userId, userId), isNull(submissions.teamId));
  return db
    .select()
    .from(submissions)
    .where(and(eq(submissions.assignmentId, assignment.id), eq(submissions.orgId, assignment.orgId), owner))
    .orderBy(asc(submissions.version));
}

/** A submission the caller (or their team) owns, or 404. */
export async function loadOwnSubmission(c: Ctx, id: string) {
  const auth = requireAuth(c);
  const [submission] = await db.select().from(submissions).where(eq(submissions.id, id));
  if (!submission || !rolesIn(auth, submission.orgId).length) throw notFound('Submission');
  let owns = submission.userId === auth.user.id;
  if (!owns && submission.teamId) {
    const [team] = await db.select().from(assignmentTeams).where(eq(assignmentTeams.id, submission.teamId));
    owns = !!team && team.memberIds.includes(auth.user.id);
  }
  if (!owns) throw notFound('Submission');
  const assignment = await loadAssignmentForStudent(c, submission.assignmentId).catch(() => {
    throw notFound('Submission');
  });
  return { submission, assignment };
}

/** People who receive a submission's notifications: the submitter, or every team member. */
export async function submissionRecipients(s: Submission) {
  if (!s.teamId) return [s.userId];
  const [team] = await db.select().from(assignmentTeams).where(eq(assignmentTeams.id, s.teamId));
  return team ? [...new Set([...team.memberIds, s.userId])] : [s.userId];
}

/** Instructors to notify about a student's question: the latest grader, else the assignment author. */
export async function gradersFor(s: Submission, a: Assignment) {
  const [latest] = await db.select({ graderId: evaluations.graderId }).from(evaluations).where(eq(evaluations.submissionId, s.id)).orderBy(desc(evaluations.createdAt)).limit(1);
  return [latest?.graderId ?? a.authorId];
}

// ---------- Deadlines and late policy ----------

export function cutoffAt(a: Pick<Assignment, 'dueAt' | 'latePolicy'>): Date | null {
  if (!a.latePolicy.allowLate) return new Date(a.dueAt);
  if (a.latePolicy.hardCutoffDays === undefined || a.latePolicy.hardCutoffDays === null) return null;
  return new Date(new Date(a.dueAt).getTime() + a.latePolicy.hardCutoffDays * DAY_MS);
}

/** Days late are counted in started 24-hour periods after the due time. */
export function latePenalty(policy: LatePolicy, dueAt: Date | string, submittedAt: Date | string | null) {
  if (!submittedAt) return { daysLate: 0, percent: 0 };
  const ms = new Date(submittedAt).getTime() - new Date(dueAt).getTime();
  if (ms <= 0) return { daysLate: 0, percent: 0 };
  const daysLate = Math.ceil(ms / DAY_MS);
  const percent = Math.min(100, daysLate * (policy.penaltyPercentPerDay ?? 0));
  return { daysLate, percent };
}

export function latePolicyText(policy: LatePolicy) {
  if (!policy.allowLate) return 'Late submissions are not accepted after the due time.';
  const per = policy.penaltyPercentPerDay ?? 0;
  const parts = [per > 0 ? `Late work loses ${per}% of its score for each started day after the due time` : 'Late work is accepted without a penalty'];
  if (policy.hardCutoffDays !== undefined && policy.hardCutoffDays !== null) parts.push(`submissions close ${policy.hardCutoffDays} day${policy.hardCutoffDays === 1 ? '' : 's'} after the due time`);
  const text = parts.join('; ') + '.';
  const example = per > 0 ? ` Example: a submission 30 hours late counts as 2 days late, so a score of 80 becomes ${round2(80 * (1 - Math.min(100, 2 * per) / 100))}.` : '';
  return text + example;
}

export function submissionWindow(a: Assignment, now = new Date()) {
  const cutoff = cutoffAt(a);
  const due = new Date(a.dueAt);
  const isLate = now.getTime() > due.getTime();
  if (a.status === 'draft') return { open: false, reason: 'This assignment is not published yet.', isLate, cutoffAt: cutoff };
  if (a.status === 'closed') return { open: false, reason: 'This assignment is closed.', isLate, cutoffAt: cutoff };
  if (a.availableFrom && now.getTime() < new Date(a.availableFrom).getTime()) return { open: false, reason: 'This assignment is not open for submissions yet.', isLate: false, cutoffAt: cutoff };
  if (isLate && !a.latePolicy.allowLate) return { open: false, reason: 'The deadline has passed and late submissions are not accepted.', isLate, cutoffAt: cutoff };
  if (cutoff && now.getTime() > cutoff.getTime()) return { open: false, reason: 'The late submission window has closed.', isLate, cutoffAt: cutoff };
  const pen = latePenalty(a.latePolicy, a.dueAt, now);
  return { open: true, reason: null as string | null, isLate, cutoffAt: cutoff, penaltyPreviewPercent: pen.percent, daysLate: pen.daysLate };
}

/** Whether another submitted version is allowed after `submittedCount` submitted versions. */
export function resubmissionRule(a: Assignment, versions: Submission[]) {
  const submitted = versions.filter((v) => v.status !== 'draft');
  const latest = submitted[submitted.length - 1];
  const used = Math.max(0, submitted.length - 1);
  if (!submitted.length) return { allowed: true, used: 0, max: a.allowResubmission ? a.maxResubmissions : 0, remaining: a.allowResubmission ? a.maxResubmissions : 0, reason: null as string | null };
  if (latest?.status === 'returned') return { allowed: true, used, max: a.maxResubmissions, remaining: Math.max(1, a.maxResubmissions - used), reason: null };
  if (!a.allowResubmission) return { allowed: false, used, max: 0, remaining: 0, reason: 'Resubmission is not allowed for this assignment.' };
  const remaining = Math.max(0, a.maxResubmissions - used);
  if (remaining <= 0) return { allowed: false, used, max: a.maxResubmissions, remaining: 0, reason: `You have used all ${a.maxResubmissions} resubmission${a.maxResubmissions === 1 ? '' : 's'}.` };
  return { allowed: true, used, max: a.maxResubmissions, remaining, reason: null };
}

// ---------- Rubrics and scoring ----------

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function rubricMax(criteria: RubricCriterion[]) {
  return criteria.reduce((s, c) => s + Math.max(0, ...c.levels.map((l) => l.points)), 0);
}

/** Rubric points are scaled to the assignment's maximum points (shown to graders and students). */
export function scoreFromRubric(criteria: RubricCriterion[], picks: { criterionId: string; levelLabel: string; comment?: string }[], maxPoints: number) {
  const rubricScores: { criterionId: string; levelLabel: string; points: number; comment?: string }[] = [];
  for (const crit of criteria) {
    const pick = picks.find((p) => p.criterionId === crit.id);
    if (!pick) throw badRequest(`Choose a level for "${crit.title}".`, { fields: { [`rubric.${crit.id}`]: 'Choose a level' } });
    const level = crit.levels.find((l) => l.label === pick.levelLabel);
    if (!level) throw badRequest(`"${pick.levelLabel}" is not a level of "${crit.title}".`);
    rubricScores.push({ criterionId: crit.id, levelLabel: level.label, points: level.points, ...(pick.comment ? { comment: pick.comment } : {}) });
  }
  const points = rubricScores.reduce((s, r) => s + r.points, 0);
  const max = rubricMax(criteria);
  const rawScore = max > 0 ? round2((points / max) * maxPoints) : 0;
  return { rubricScores, rubricPoints: points, rubricMax: max, rawScore };
}

export function validateCriteria(criteria: RubricCriterion[]) {
  const ids = new Set<string>();
  for (const c of criteria) {
    if (ids.has(c.id)) throw badRequest('Each criterion needs a unique id.');
    ids.add(c.id);
    const labels = new Set(c.levels.map((l) => l.label));
    if (labels.size !== c.levels.length) throw badRequest(`Level names in "${c.title}" must be unique.`);
  }
}

// ---------- Evaluations ----------

export async function currentEvaluation(submissionId: string) {
  const [row] = await db
    .select()
    .from(evaluations)
    .where(and(eq(evaluations.submissionId, submissionId), isNull(evaluations.supersededBy)))
    .orderBy(desc(evaluations.createdAt))
    .limit(1);
  return row ?? null;
}

/** What students may see of an evaluation. The private instructor comment never leaves the server for students. */
export function studentEvaluation(e: Evaluation) {
  return {
    id: e.id,
    rubricScores: e.rubricScores,
    rawScore: e.rawScore,
    latePenalty: e.latePenalty,
    finalScore: e.finalScore,
    feedback: e.feedback,
    releasedAt: e.releasedAt,
    reason: e.reason,
    createdAt: e.createdAt,
  };
}

/**
 * Releases an evaluation: the student is notified, the submission is marked graded (or returned for
 * revision), and Skill DNA evidence is recorded as verified because a human instructor graded it.
 */
export async function releaseEvaluation(c: Ctx | null, e: Evaluation, opts: { returnForRevision?: boolean; actorId: string } ) {
  const [s] = await db.select().from(submissions).where(eq(submissions.id, e.submissionId));
  const [a] = await db.select().from(assignments).where(eq(assignments.id, s.assignmentId));
  const now = new Date();
  const [released] = await db.update(evaluations).set({ released: true, releasedAt: e.releasedAt ?? now }).where(eq(evaluations.id, e.id)).returning();
  await db
    .update(submissions)
    .set({ status: opts.returnForRevision ? 'returned' : 'graded' })
    .where(eq(submissions.id, s.id));

  const recipients = await submissionRecipients(s);
  const ratio = a.maxPoints > 0 ? Math.max(0, Math.min(1, e.finalScore / a.maxPoints)) : 0;
  if (a.skillIds.length) {
    // One piece of evidence per assignment per student: older versions' evidence is replaced.
    const olderIds = (await db.select({ id: submissions.id }).from(submissions).where(and(eq(submissions.assignmentId, a.id), eq(submissions.orgId, a.orgId)))).map((r) => r.id).filter((id) => id !== s.id);
    for (const uid of recipients) {
      if (olderIds.length) {
        await db
          .delete(skillEvidence)
          .where(and(eq(skillEvidence.userId, uid), eq(skillEvidence.sourceType, 'assignment_submission'), inArray(skillEvidence.sourceId, olderIds)));
      }
      for (const skillId of a.skillIds) {
        await addEvidence({
          userId: uid,
          skillId,
          source: 'assessment',
          sourceType: 'assignment_submission',
          sourceId: s.id,
          score: ratio,
          verified: true,
          verifiedBy: e.graderId,
          orgId: a.orgId,
          note: `Graded assignment: ${a.title}`,
        });
      }
    }
  }
  for (const uid of recipients) {
    await notify(uid, {
      type: 'assignment.graded',
      category: 'assignments',
      orgId: a.orgId,
      title: opts.returnForRevision ? `Feedback and revision request: ${a.title}` : `Feedback released: ${a.title}`,
      body: `Score ${round2(e.finalScore)} / ${a.maxPoints}.${opts.returnForRevision ? ' Your instructor returned it so you can revise and resubmit.' : ''}`,
      link: `/app/assignments/${a.id}`,
    });
  }
  await audit(c, { action: 'teach.evaluation.release', orgId: a.orgId, targetType: 'evaluation', targetId: e.id, actorId: opts.actorId, meta: { submissionId: s.id, finalScore: e.finalScore, returnForRevision: !!opts.returnForRevision } });
  return released;
}

// ---------- Files ----------

/** Validates file ids for a submission: ready 'submission' uploads by the student (or teammates) with an accepted type. */
export async function validateSubmissionFiles(fileIds: string[], ownerIds: string[], accepted: string[]) {
  if (!fileIds.length) return [];
  const rows = await db
    .select({ id: files.id, ownerId: files.ownerId, filename: files.filename, purpose: files.purpose, status: files.status, size: files.size, mime: files.mime })
    .from(files)
    .where(inArray(files.id, fileIds));
  for (const id of fileIds) {
    const f = rows.find((r) => r.id === id);
    if (!f || f.status !== 'ready' || !f.ownerId || !ownerIds.includes(f.ownerId)) throw badRequest('One of the attached files is not available. Upload it again.');
    if (f.purpose !== 'submission') throw badRequest(`"${f.filename}" was not uploaded as a submission file.`);
    if (accepted.length) {
      const ext = f.filename.split('.').pop()?.toLowerCase() ?? '';
      if (!accepted.map((x) => x.replace(/^\./, '').toLowerCase()).includes(ext)) throw badRequest(`"${f.filename}" is not an accepted file type (${accepted.join(', ')}).`);
    }
  }
  return rows;
}

export async function fileMeta(ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select({ id: files.id, filename: files.filename, mime: files.mime, size: files.size, status: files.status }).from(files).where(inArray(files.id, ids));
  return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean).map((f) => ({ ...f!, url: `/api/files/${f!.id}` }));
}

/** Download access for submission files: the submitter, teammates, and staff who teach the assignment's cohort. */
export async function canReadSubmissionFile(auth: AuthContext, fileId: string) {
  const rows = await db
    .select({ s: submissions, a: { id: assignments.id, cohortId: assignments.cohortId, orgId: assignments.orgId } })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(sql`${fileId}::uuid = ANY(${submissions.fileIds})`);
  for (const { s, a } of rows) {
    if (s.orgId !== a.orgId || !rolesIn(auth, a.orgId).length) continue;
    if (s.userId === auth.user.id) return true;
    if (s.teamId) {
      const [team] = await db.select().from(assignmentTeams).where(eq(assignmentTeams.id, s.teamId));
      if (team?.memberIds.includes(auth.user.id)) return true;
    }
    if (isStaff(auth, a.orgId) && (await teachesCohort(auth, { id: a.cohortId, orgId: a.orgId }))) return true;
  }
  return false;
}

// ---------- Misc ----------

export async function userNames(ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map<string, { id: string; name: string; email: string }>();
  const rows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, uniq));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Latest submitted (non-draft) version per owner (team or individual) for a set of assignments. */
export async function latestSubmitted(assignmentIds: string[], orgId: string) {
  if (!assignmentIds.length) return [];
  const rows = await db
    .select()
    .from(submissions)
    .where(and(inArray(submissions.assignmentId, assignmentIds), eq(submissions.orgId, orgId), sql`${submissions.status} <> 'draft'`))
    .orderBy(asc(submissions.version));
  const byOwner = new Map<string, Submission>();
  for (const r of rows) byOwner.set(`${r.assignmentId}:${r.teamId ?? r.userId}`, r);
  return [...byOwner.values()];
}

export async function currentEvaluations(submissionIds: string[]) {
  if (!submissionIds.length) return new Map<string, Evaluation>();
  const rows = await db
    .select()
    .from(evaluations)
    .where(and(inArray(evaluations.submissionId, submissionIds), isNull(evaluations.supersededBy)))
    .orderBy(asc(evaluations.createdAt));
  return new Map(rows.map((r) => [r.submissionId, r]));
}

/** Latest released evaluation per submission (what the student sees). */
export async function releasedEvaluations(submissionIds: string[]) {
  if (!submissionIds.length) return new Map<string, Evaluation>();
  const rows = await db
    .select()
    .from(evaluations)
    .where(and(inArray(evaluations.submissionId, submissionIds), eq(evaluations.released, true)))
    .orderBy(asc(evaluations.createdAt));
  return new Map(rows.map((r) => [r.submissionId, r]));
}

export function csvEscape(v: unknown) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]) {
  return [header.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n') + '\n';
}

export type WorkStatus = 'not_started' | 'draft' | 'submitted' | 'late' | 'graded' | 'returned';

/** Status of one student's (or team's) work, from the student's point of view. */
export function workStatus(versions: Submission[], released: Evaluation | null | undefined): WorkStatus {
  const submitted = versions.filter((v) => v.status !== 'draft');
  const latest = submitted[submitted.length - 1];
  if (!latest) return versions.length ? 'draft' : 'not_started';
  if (latest.status === 'returned' && released) return 'returned';
  if (released && released.submissionId === latest.id) return 'graded';
  return latest.isLate ? 'late' : 'submitted';
}
