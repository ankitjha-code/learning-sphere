/** Teach: student endpoints. Students only see published assignments of cohorts they belong to. */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  announcements,
  assignments,
  assignmentTeams,
  cohorts,
  courseCohorts,
  courses,
  evaluations,
  integrityReports,
  regradeRequests,
  skills,
  submissionComments,
  submissions,
  users,
} from '../../db/schema';
import { type AppEnv, type Ctx, requireAuth } from '../../lib/context';
import { body, idParam } from '../../lib/validate';
import { badRequest, conflict } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { recordActivity, XP } from '../../lib/activity';
import { sha256, shortCode } from '../../lib/crypto';
import { enqueue } from '../../jobs/queue';
import {
  fileMeta,
  gradersFor,
  latePenalty,
  latePolicyText,
  loadAssignmentForStudent,
  loadOwnSubmission,
  ownerVersions,
  releasedEvaluations,
  resubmissionRule,
  studentCohortIds,
  studentEvaluation,
  submissionRecipients,
  submissionWindow,
  teamFor,
  userNames,
  validateSubmissionFiles,
  workStatus,
  type Assignment,
  type Submission,
} from './service';

export const studentRoutes = new Hono<AppEnv>();

function studentOrgIds(c: Ctx) {
  const auth = requireAuth(c);
  return auth.session.activeOrgId ? [auth.session.activeOrgId] : auth.memberships.map((m) => m.orgId);
}

const linkSchema = z.object({
  label: z.string().trim().max(120).default(''),
  url: z
    .string()
    .trim()
    .url('Enter a full link starting with https://')
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), 'Only http and https links are accepted.'),
});
const contentSchema = z.object({
  text: z.string().max(200_000).optional(),
  links: z.array(linkSchema).max(20).optional(),
  fileIds: z.array(z.string().uuid()).max(10).optional(),
});

function publicSubmission(s: Submission) {
  return {
    id: s.id,
    version: s.version,
    status: s.status,
    text: s.text,
    links: s.links,
    fileIds: s.fileIds,
    submittedAt: s.submittedAt,
    isLate: s.isLate,
    receiptCode: s.receiptCode,
    contentHash: s.contentHash,
    savedAt: s.savedAt,
    userId: s.userId,
    teamId: s.teamId,
  };
}

function publicAssignment(a: Assignment) {
  return {
    id: a.id,
    orgId: a.orgId,
    cohortId: a.cohortId,
    courseId: a.courseId,
    title: a.title,
    objectives: a.objectives,
    instructions: a.instructions,
    availableFrom: a.availableFrom,
    dueAt: a.dueAt,
    maxPoints: a.maxPoints,
    rubric: a.rubricSnapshot,
    submissionTypes: a.submissionTypes,
    acceptedFileTypes: a.acceptedFileTypes,
    collaboration: a.collaboration,
    latePolicy: a.latePolicy,
    allowResubmission: a.allowResubmission,
    maxResubmissions: a.maxResubmissions,
    status: a.status,
    releasePolicy: a.releasePolicy,
  };
}

// ---------- List ----------

studentRoutes.get('/my/assignments', async (c) => {
  const auth = requireAuth(c);
  const uid = auth.user.id;
  const orgIds = studentOrgIds(c);
  const cohortIds = await studentCohortIds(uid, orgIds);
  if (!cohortIds.length) return c.json({ items: [], upcoming: [], announcements: [], cohorts: [] });
  const asg = await db
    .select()
    .from(assignments)
    .where(and(inArray(assignments.cohortId, cohortIds), inArray(assignments.orgId, orgIds), inArray(assignments.status, ['published', 'closed'])))
    .orderBy(asc(assignments.dueAt));
  const ids = asg.map((a) => a.id);
  const myTeams = ids.length ? await db.select().from(assignmentTeams).where(and(inArray(assignmentTeams.assignmentId, ids), sql`${uid}::uuid = ANY(${assignmentTeams.memberIds})`)) : [];
  const teamIds = myTeams.map((t) => t.id);
  const mine = ids.length
    ? await db
        .select()
        .from(submissions)
        .where(and(inArray(submissions.assignmentId, ids), or(and(eq(submissions.userId, uid), isNull(submissions.teamId)), teamIds.length ? inArray(submissions.teamId, teamIds) : sql`false`)))
        .orderBy(asc(submissions.version))
    : [];
  const released = await releasedEvaluations(mine.map((s) => s.id));
  const cohortRows = await db.select({ id: cohorts.id, name: cohorts.name }).from(cohorts).where(inArray(cohorts.id, cohortIds));
  const courseRows = asg.some((a) => a.courseId) ? await db.select({ id: courses.id, code: courses.code, title: courses.title }).from(courses).where(inArray(courses.id, asg.map((a) => a.courseId).filter(Boolean) as string[])) : [];
  const now = new Date();

  const items = asg.map((a) => {
    const team = myTeams.find((t) => t.assignmentId === a.id) ?? null;
    const versions = mine.filter((s) => s.assignmentId === a.id && (a.collaboration === 'team' && team ? s.teamId === team.id : !s.teamId));
    const submittedV = versions.filter((v) => v.status !== 'draft');
    const latest = submittedV[submittedV.length - 1] ?? null;
    const rel = latest ? (released.get(latest.id) ?? null) : null;
    const status = workStatus(versions, rel);
    const win = submissionWindow(a, now);
    return {
      id: a.id,
      title: a.title,
      cohort: cohortRows.find((x) => x.id === a.cohortId) ?? null,
      course: courseRows.find((x) => x.id === a.courseId) ?? null,
      dueAt: a.dueAt,
      availableFrom: a.availableFrom,
      maxPoints: a.maxPoints,
      collaboration: a.collaboration,
      latePolicy: a.latePolicy,
      latePolicyText: latePolicyText(a.latePolicy),
      assignmentStatus: a.status,
      status,
      hasDraft: versions.some((v) => v.status === 'draft'),
      submittedAt: latest?.submittedAt ?? null,
      isLate: latest?.isLate ?? false,
      overdue: !latest && now.getTime() > new Date(a.dueAt).getTime(),
      finalScore: rel ? rel.finalScore : null,
      window: { open: win.open, reason: win.reason, cutoffAt: win.cutoffAt },
    };
  });

  const linkedCourses = await db.select({ courseId: courseCohorts.courseId }).from(courseCohorts).where(inArray(courseCohorts.cohortId, cohortIds));
  const ann = await db
    .select({ a: announcements, code: courses.code })
    .from(announcements)
    .leftJoin(courses, eq(courses.id, announcements.courseId))
    .where(
      and(
        inArray(announcements.orgId, orgIds),
        or(inArray(announcements.cohortId, cohortIds), linkedCourses.length ? and(isNull(announcements.cohortId), inArray(announcements.courseId, linkedCourses.map((l) => l.courseId))) : sql`false`),
      ),
    )
    .orderBy(desc(announcements.createdAt))
    .limit(10);
  const names = await userNames(ann.map((x) => x.a.authorId));

  return c.json({
    items,
    upcoming: items.filter((i) => ['not_started', 'draft'].includes(i.status) && i.window.open && new Date(i.dueAt).getTime() - now.getTime() < 7 * 86400_000),
    announcements: ann.map((x) => ({ id: x.a.id, title: x.a.title, body: x.a.body, createdAt: x.a.createdAt, courseCode: x.code, authorName: names.get(x.a.authorId)?.name ?? '' })),
    cohorts: cohortRows,
  });
});

// ---------- Detail ----------

studentRoutes.get('/my/assignments/:id', async (c) => {
  const auth = requireAuth(c);
  const a = await loadAssignmentForStudent(c, idParam(c));
  const team = a.collaboration === 'team' ? await teamFor(a.id, auth.user.id) : null;
  const versions = await ownerVersions(a, auth.user.id, team?.id ?? null);
  const draft = versions.filter((v) => v.status === 'draft').pop() ?? null;
  const submittedV = versions.filter((v) => v.status !== 'draft');
  const latest = submittedV[submittedV.length - 1] ?? null;
  const releasedMap = await releasedEvaluations(submittedV.map((v) => v.id));
  const rel = latest ? (releasedMap.get(latest.id) ?? null) : null;
  const history = latest
    ? (await db.select().from(evaluations).where(and(eq(evaluations.submissionId, latest.id), eq(evaluations.released, true))).orderBy(asc(evaluations.createdAt))).map(studentEvaluation)
    : [];
  const comments = latest
    ? await db
        .select()
        .from(submissionComments)
        .where(and(inArray(submissionComments.submissionId, submittedV.map((v) => v.id)), eq(submissionComments.visibility, 'shared')))
        .orderBy(asc(submissionComments.createdAt))
    : [];
  const regrades = submittedV.length
    ? await db
        .select()
        .from(regradeRequests)
        .where(and(eq(regradeRequests.subjectType, 'assignment_submission'), inArray(regradeRequests.subjectId, submittedV.map((v) => v.id)), eq(regradeRequests.requesterId, auth.user.id)))
        .orderBy(desc(regradeRequests.createdAt))
    : [];
  // Students only learn about integrity reports once a decision has been made.
  const integrity = submittedV.length
    ? await db
        .select({ id: integrityReports.id, status: integrityReports.status, outcomeNote: integrityReports.outcomeNote, submissionId: integrityReports.submissionId })
        .from(integrityReports)
        .where(and(eq(integrityReports.orgId, a.orgId), inArray(integrityReports.submissionId, submittedV.map((v) => v.id)), inArray(integrityReports.status, ['cleared', 'confirmed'])))
    : [];
  const names = await userNames([...comments.map((x) => x.authorId), ...(team?.memberIds ?? []), ...versions.map((v) => v.userId)]);
  const [cohort] = await db.select({ id: cohorts.id, name: cohorts.name }).from(cohorts).where(eq(cohorts.id, a.cohortId));
  const [course] = a.courseId ? await db.select({ id: courses.id, code: courses.code, title: courses.title }).from(courses).where(eq(courses.id, a.courseId)) : [];
  const skillRows = a.skillIds.length ? await db.select({ id: skills.id, name: skills.name, slug: skills.slug }).from(skills).where(inArray(skills.id, a.skillIds)) : [];
  const win = submissionWindow(a);
  const resub = resubmissionRule(a, versions);
  const needsTeam = a.collaboration === 'team' && !team;

  return c.json({
    assignment: publicAssignment(a),
    cohort: cohort ?? null,
    course: course ?? null,
    skills: skillRows,
    latePolicyText: latePolicyText(a.latePolicy),
    team: team ? { id: team.id, name: team.name, members: team.memberIds.map((m) => ({ id: m, name: names.get(m)?.name ?? 'Member' })) } : null,
    needsTeam,
    status: workStatus(versions, rel),
    window: win,
    resubmission: resub,
    canEdit: win.open && !needsTeam && (!latest || resub.allowed),
    draft: draft ? { ...publicSubmission(draft), files: await fileMeta(draft.fileIds) } : null,
    current: latest ? { ...publicSubmission(latest), files: await fileMeta(latest.fileIds), submittedByName: names.get(latest.userId)?.name ?? '' } : null,
    versions: versions.map((v) => ({ id: v.id, version: v.version, status: v.status, submittedAt: v.submittedAt, isLate: v.isLate, receiptCode: v.receiptCode, contentHash: v.contentHash, savedAt: v.savedAt, text: v.text, links: v.links, fileCount: v.fileIds.length, submittedByName: names.get(v.userId)?.name ?? '' })),
    feedback: rel ? { evaluation: studentEvaluation(rel), history, latePenaltyDays: latePenalty(a.latePolicy, a.dueAt, latest!.submittedAt).daysLate } : null,
    comments: comments.map((x) => ({ id: x.id, body: x.body, createdAt: x.createdAt, authorName: names.get(x.authorId)?.name ?? 'Unknown', mine: x.authorId === auth.user.id, submissionId: x.submissionId })),
    regrades: regrades.map((r) => ({ id: r.id, status: r.status, reason: r.reason, previousScore: r.previousScore, newScore: r.newScore, resolutionNote: r.resolutionNote, createdAt: r.createdAt, resolvedAt: r.resolvedAt, submissionId: r.subjectId })),
    integrity,
    guideLink: `/app/ai?assistant=assignment_guide&context=assignment:${a.id}`,
  });
});

// ---------- Draft autosave ----------

async function saveDraft(c: Ctx, a: Assignment, input: z.infer<typeof contentSchema>) {
  const auth = requireAuth(c);
  const win = submissionWindow(a);
  if (!win.open) throw conflict(win.reason ?? 'Submissions are closed.');
  const team = a.collaboration === 'team' ? await teamFor(a.id, auth.user.id) : null;
  if (a.collaboration === 'team' && !team) throw conflict('You are not in a team for this assignment yet. Ask your instructor to add you to one.');
  const owners = team ? team.memberIds : [auth.user.id];
  if (input.fileIds) await validateSubmissionFiles(input.fileIds, owners, a.acceptedFileTypes);
  const versions = await ownerVersions(a, auth.user.id, team?.id ?? null);
  const latest = versions[versions.length - 1];
  const now = new Date();
  if (latest?.status === 'draft') {
    const [row] = await db
      .update(submissions)
      .set({
        text: input.text !== undefined ? input.text : latest.text,
        links: input.links !== undefined ? input.links.map((l) => ({ label: l.label || l.url, url: l.url })) : latest.links,
        fileIds: input.fileIds !== undefined ? input.fileIds : latest.fileIds,
        savedAt: now,
        userId: auth.user.id,
      })
      .where(and(eq(submissions.id, latest.id), eq(submissions.status, 'draft')))
      .returning();
    if (row) return row;
  }
  if (latest) {
    const rule = resubmissionRule(a, versions);
    if (!rule.allowed) throw conflict(rule.reason ?? 'Resubmission is not allowed.');
  }
  const [row] = await db
    .insert(submissions)
    .values({
      assignmentId: a.id,
      orgId: a.orgId,
      userId: auth.user.id,
      teamId: team?.id ?? null,
      version: (latest?.version ?? 0) + 1,
      status: 'draft',
      text: input.text ?? (latest?.text || null),
      links: input.links ? input.links.map((l) => ({ label: l.label || l.url, url: l.url })) : (latest?.links ?? []),
      fileIds: input.fileIds ?? latest?.fileIds ?? [],
      savedAt: now,
    })
    .returning();
  return row;
}

studentRoutes.put('/my/assignments/:id/draft', async (c) => {
  const a = await loadAssignmentForStudent(c, idParam(c));
  const input = await body(c, contentSchema);
  const row = await saveDraft(c, a, input);
  return c.json({ draft: { ...publicSubmission(row), files: await fileMeta(row.fileIds) } });
});

studentRoutes.delete('/my/assignments/:id/draft', async (c) => {
  const auth = requireAuth(c);
  const a = await loadAssignmentForStudent(c, idParam(c));
  const team = a.collaboration === 'team' ? await teamFor(a.id, auth.user.id) : null;
  const versions = await ownerVersions(a, auth.user.id, team?.id ?? null);
  const latest = versions[versions.length - 1];
  if (!latest || latest.status !== 'draft') throw conflict('There is no draft to discard.');
  await db.delete(submissions).where(and(eq(submissions.id, latest.id), eq(submissions.status, 'draft')));
  return c.json({ ok: true });
});

// ---------- Submit ----------

function contentHash(s: { text: string | null; links: { label: string; url: string }[]; fileIds: string[] }) {
  return sha256(JSON.stringify({ text: (s.text ?? '').replace(/\r\n/g, '\n'), links: s.links.map((l) => l.url), fileIds: [...s.fileIds].sort() }));
}

studentRoutes.post('/my/assignments/:id/submit', async (c) => {
  const auth = requireAuth(c);
  const a = await loadAssignmentForStudent(c, idParam(c));
  const input = await body(c, contentSchema.extend({ confirm: z.literal(true, { error: 'Confirm that you want to submit.' }) }));
  const win = submissionWindow(a);
  if (!win.open) throw conflict(win.reason ?? 'Submissions are closed.');

  const hasContentInput = input.text !== undefined || input.links !== undefined || input.fileIds !== undefined;
  const team = a.collaboration === 'team' ? await teamFor(a.id, auth.user.id) : null;
  let draft: Submission | undefined;
  if (hasContentInput) draft = await saveDraft(c, a, input);
  else {
    const versions = await ownerVersions(a, auth.user.id, team?.id ?? null);
    const latest = versions[versions.length - 1];
    if (latest?.status === 'draft') draft = latest;
  }
  if (!draft) throw badRequest('There is nothing to submit yet. Add your work first.');

  // Content rules.
  const text = (draft.text ?? '').trim();
  if (text && !a.submissionTypes.includes('text')) throw badRequest('This assignment does not accept a text answer.');
  if (draft.links.length && !a.submissionTypes.includes('link')) throw badRequest('This assignment does not accept links.');
  if (draft.fileIds.length && !a.submissionTypes.includes('file')) throw badRequest('This assignment does not accept files.');
  if (!text && !draft.links.length && !draft.fileIds.length) throw badRequest('Your submission is empty. Add your work before submitting.');
  await validateSubmissionFiles(draft.fileIds, team ? team.memberIds : [auth.user.id], a.acceptedFileTypes);

  const now = new Date();
  const isLate = now.getTime() > new Date(a.dueAt).getTime();
  const pen = latePenalty(a.latePolicy, a.dueAt, now);
  const [row] = await db
    .update(submissions)
    .set({ status: 'submitted', submittedAt: now, isLate, receiptCode: shortCode(10), contentHash: contentHash(draft), userId: auth.user.id, savedAt: now })
    .where(and(eq(submissions.id, draft.id), eq(submissions.status, 'draft')))
    .returning();
  if (!row) throw conflict('This draft was already submitted.');

  const recipients = await submissionRecipients(row);
  for (const uid of recipients) {
    await recordActivity(uid, { kind: 'assignment_submitted', label: `Submitted ${a.title}`, link: `/app/assignments/${a.id}`, xp: XP.assignmentSubmitted, skillIds: a.skillIds, dedupeKey: `assignment.submitted:${a.id}:${uid}`, orgId: a.orgId });
    await notify(uid, {
      type: 'assignment.submitted',
      category: 'assignments',
      orgId: a.orgId,
      title: `Submission received: ${a.title}`,
      body: `Receipt ${row.receiptCode}, version ${row.version}${isLate ? `, ${pen.daysLate} day${pen.daysLate === 1 ? '' : 's'} late` : ''}.`,
      link: `/app/assignments/${a.id}`,
      email: false,
    });
  }
  await enqueue('teach.similarity', { submissionId: row.id }, { idempotencyKey: `teach.similarity:${row.id}`, orgId: a.orgId });

  return c.json(
    {
      submission: publicSubmission(row),
      receipt: { code: row.receiptCode, version: row.version, submittedAt: row.submittedAt, contentHash: row.contentHash, isLate, daysLate: pen.daysLate, latePenaltyPercent: pen.percent },
    },
    201,
  );
});

studentRoutes.get('/my/submissions/:id/receipt', async (c) => {
  const { submission: s, assignment: a } = await loadOwnSubmission(c, idParam(c));
  if (s.status === 'draft') throw badRequest('Drafts do not have a receipt. Submit your work to get one.');
  const pen = latePenalty(a.latePolicy, a.dueAt, s.submittedAt);
  const [by] = await db.select({ name: users.name }).from(users).where(eq(users.id, s.userId));
  return c.json({
    receipt: {
      code: s.receiptCode,
      assignmentId: a.id,
      assignmentTitle: a.title,
      version: s.version,
      submittedAt: s.submittedAt,
      submittedBy: by?.name ?? '',
      dueAt: a.dueAt,
      isLate: s.isLate,
      daysLate: pen.daysLate,
      latePenaltyPercent: pen.percent,
      contentHash: s.contentHash,
      textLength: (s.text ?? '').length,
      links: s.links.length,
      files: await fileMeta(s.fileIds),
    },
  });
});

// ---------- Clarification and regrade ----------

studentRoutes.post('/my/submissions/:id/comments', async (c) => {
  const auth = requireAuth(c);
  const { submission: s, assignment: a } = await loadOwnSubmission(c, idParam(c));
  if (s.status === 'draft') throw badRequest('Submit your work before asking about its feedback.');
  const input = await body(c, z.object({ body: z.string().trim().min(2, 'Write your question.').max(5000) }));
  const [row] = await db.insert(submissionComments).values({ submissionId: s.id, authorId: auth.user.id, body: input.body, visibility: 'shared' }).returning();
  for (const g of await gradersFor(s, a)) {
    if (g === auth.user.id) continue;
    await notify(g, { type: 'assignment.clarification', category: 'assignments', orgId: a.orgId, title: `Question about feedback: ${a.title}`, body: `${auth.user.name}: ${input.body.slice(0, 200)}`, link: `/app/teach/grading/${s.id}` });
  }
  return c.json({ comment: row }, 201);
});

studentRoutes.post('/my/submissions/:id/regrade', async (c) => {
  const auth = requireAuth(c);
  const { submission: s, assignment: a } = await loadOwnSubmission(c, idParam(c));
  const input = await body(c, z.object({ reason: z.string().trim().min(10, 'Explain which part you think was graded incorrectly and why (at least 10 characters).').max(2000) }));
  const released = (await releasedEvaluations([s.id])).get(s.id);
  if (!released) throw conflict('You can request a regrade after feedback is released.');
  const [open] = await db
    .select({ id: regradeRequests.id })
    .from(regradeRequests)
    .where(and(eq(regradeRequests.subjectType, 'assignment_submission'), eq(regradeRequests.subjectId, s.id), eq(regradeRequests.status, 'open')));
  if (open) throw conflict('You already have an open regrade request for this submission.');
  const [row] = await db
    .insert(regradeRequests)
    .values({ orgId: a.orgId, subjectType: 'assignment_submission', subjectId: s.id, requesterId: auth.user.id, reason: input.reason, previousScore: released.finalScore })
    .returning();
  for (const g of await gradersFor(s, a)) {
    await notify(g, { type: 'assignment.regrade_requested', category: 'assignments', orgId: a.orgId, title: `Regrade requested: ${a.title}`, body: `${auth.user.name}: ${input.reason.slice(0, 200)}`, link: `/app/teach/grading/${s.id}` });
  }
  await audit(c, { action: 'teach.regrade.request', orgId: a.orgId, targetType: 'assignment_submission', targetId: s.id, meta: { regradeId: row.id } });
  return c.json({ regrade: row }, 201);
});
