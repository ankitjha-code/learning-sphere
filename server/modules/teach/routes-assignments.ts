/** Teach: assignment authoring, publishing, teams and grade/completion reports (faculty side). */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { assignments, assignmentTeams, cohortMembers, cohorts, courses, rubrics, skills, submissions, users } from '../../db/schema';
import { type AppEnv, type Ctx, requireActiveOrg, requireAuth } from '../../lib/context';
import { body, idParam, query, patchSchema } from '../../lib/validate';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import {
  STAFF_ROLES,
  cohortStudentIds,
  currentEvaluations,
  latePenalty,
  latePolicyText,
  loadAssignmentForStaff,
  loadCohortForStaff,
  releasedEvaluations,
  rubricMax,
  taughtCohortIds,
  toCsv,
  workStatus,
  type Assignment,
  type Submission,
} from './service';
import { cohortAnalytics } from './analytics';

export const assignmentRoutes = new Hono<AppEnv>();

const isoDate = z.string().datetime({ offset: true, message: 'Enter a valid date and time.' });

const latePolicySchema = z.object({
  allowLate: z.boolean(),
  penaltyPercentPerDay: z.number().min(0).max(100).optional(),
  hardCutoffDays: z.number().int().min(0).max(60).nullable().optional(),
});

const assignmentFields = {
  courseId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(200),
  objectives: z.array(z.string().trim().min(1).max(300)).max(12),
  instructions: z.string().max(50000),
  availableFrom: isoDate.nullable().optional(),
  dueAt: isoDate,
  maxPoints: z.number().min(1).max(1000),
  rubricId: z.string().uuid().nullable().optional(),
  submissionTypes: z.array(z.enum(['text', 'file', 'link'])).min(1, 'Allow at least one way to submit.'),
  acceptedFileTypes: z.array(z.string().trim().toLowerCase().regex(/^\.?[a-z0-9]{1,10}$/, 'Use extensions like pdf or zip.')).max(20),
  collaboration: z.enum(['individual', 'team', 'discuss_only']),
  latePolicy: latePolicySchema,
  allowResubmission: z.boolean(),
  maxResubmissions: z.number().int().min(0).max(10),
  skillIds: z.array(z.string().uuid()).max(10),
  releasePolicy: z.enum(['manual', 'on_grade']),
};

const createSchema = z.object({
  cohortId: z.string().uuid(),
  ...assignmentFields,
  objectives: assignmentFields.objectives.default([]),
  instructions: assignmentFields.instructions.default(''),
  maxPoints: assignmentFields.maxPoints.default(100),
  submissionTypes: assignmentFields.submissionTypes.default(['text']),
  acceptedFileTypes: assignmentFields.acceptedFileTypes.default([]),
  collaboration: assignmentFields.collaboration.default('individual'),
  latePolicy: latePolicySchema.default({ allowLate: true, penaltyPercentPerDay: 10, hardCutoffDays: 3 }),
  allowResubmission: assignmentFields.allowResubmission.default(false),
  maxResubmissions: assignmentFields.maxResubmissions.default(0),
  skillIds: assignmentFields.skillIds.default([]),
  releasePolicy: assignmentFields.releasePolicy.default('manual'),
});
const assignmentPatch = patchSchema(z.object(assignmentFields));

/** Fields that cannot change after publishing, because grades and submissions depend on them. */
const LOCKED_AFTER_PUBLISH = ['rubricId', 'collaboration', 'maxPoints'] as const;

async function checkRefs(orgId: string, v: { courseId?: string | null; rubricId?: string | null; skillIds?: string[] }) {
  if (v.courseId) {
    const [x] = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.id, v.courseId), eq(courses.orgId, orgId)));
    if (!x) throw badRequest('Choose a course from this organization.', { fields: { courseId: 'Unknown course' } });
  }
  if (v.rubricId) {
    const [x] = await db.select({ id: rubrics.id }).from(rubrics).where(and(eq(rubrics.id, v.rubricId), eq(rubrics.orgId, orgId)));
    if (!x) throw badRequest('Choose a rubric from this organization.', { fields: { rubricId: 'Unknown rubric' } });
  }
  if (v.skillIds?.length) {
    const rows = await db.select({ id: skills.id }).from(skills).where(inArray(skills.id, v.skillIds));
    if (rows.length !== new Set(v.skillIds).size) throw badRequest('One of the skills is unknown.', { fields: { skillIds: 'Unknown skill' } });
  }
}

function validateDates(v: { availableFrom?: string | null; dueAt?: string }) {
  if (v.availableFrom && v.dueAt && new Date(v.availableFrom).getTime() >= new Date(v.dueAt).getTime())
    throw badRequest('The due date must be after the date the assignment opens.', { fields: { dueAt: 'Must be after the open date' } });
}

/** Publish checklist. Blocking items disable publishing and explain why. */
export async function publishChecklist(a: Assignment) {
  const students = await cohortStudentIds(a.cohortId);
  const items: { key: string; label: string; ok: boolean; blocking: boolean; detail?: string }[] = [];
  items.push({ key: 'title', label: 'Title', ok: a.title.trim().length >= 3, blocking: true });
  items.push({ key: 'instructions', label: 'Instructions written', ok: a.instructions.trim().length >= 20, blocking: true, detail: 'Write at least a few sentences so students know what to do.' });
  items.push({ key: 'dueAt', label: 'Due date in the future', ok: new Date(a.dueAt).getTime() > Date.now(), blocking: true });
  items.push({ key: 'students', label: 'Cohort has students', ok: students.length > 0, blocking: true, detail: 'Add students to the cohort first.' });
  if (a.rubricId) {
    const [r] = await db.select().from(rubrics).where(eq(rubrics.id, a.rubricId));
    items.push({ key: 'rubric', label: 'Rubric has points', ok: !!r && rubricMax(r.criteria) > 0, blocking: true });
  } else {
    items.push({ key: 'rubric', label: 'Rubric attached (recommended)', ok: false, blocking: false, detail: 'Without a rubric you grade with a single score.' });
  }
  if (a.submissionTypes.includes('file')) items.push({ key: 'fileTypes', label: 'Accepted file types listed (recommended)', ok: a.acceptedFileTypes.length > 0, blocking: false, detail: 'Any supported file type will be accepted.' });
  items.push({ key: 'objectives', label: 'Learning objectives (recommended)', ok: a.objectives.length > 0, blocking: false });
  if (a.collaboration === 'team') {
    const teams = await db.select().from(assignmentTeams).where(eq(assignmentTeams.assignmentId, a.id));
    const inTeam = new Set(teams.flatMap((t) => t.memberIds));
    const missing = students.filter((s) => !inTeam.has(s)).length;
    items.push({ key: 'teams', label: 'Every student is in a team', ok: teams.length > 0 && missing === 0, blocking: true, detail: missing ? `${missing} student${missing === 1 ? ' is' : 's are'} not in a team.` : 'Create teams first.' });
  }
  return { items, canPublish: items.every((i) => i.ok || !i.blocking) };
}

assignmentRoutes.get('/assignments', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = requireActiveOrg(c, STAFF_ROLES);
  const q = query(c, z.object({ cohortId: z.string().uuid().optional(), status: z.enum(['draft', 'published', 'closed']).optional(), q: z.string().trim().max(100).optional() }));
  const taught = await taughtCohortIds(auth, orgId);
  const rows = await db
    .select({ a: assignments, cohortName: cohorts.name })
    .from(assignments)
    .innerJoin(cohorts, eq(cohorts.id, assignments.cohortId))
    .where(
      and(
        eq(assignments.orgId, orgId),
        taught === 'all' ? undefined : taught.length ? inArray(assignments.cohortId, taught) : sql`false`,
        q.cohortId ? eq(assignments.cohortId, q.cohortId) : undefined,
        q.status ? eq(assignments.status, q.status) : undefined,
        q.q ? sql`${assignments.title} ilike ${'%' + q.q.replace(/[%_\\]/g, (m) => '\\' + m) + '%'}` : undefined,
      ),
    )
    .orderBy(desc(assignments.dueAt));
  const ids = rows.map((r) => r.a.id);
  const subs = ids.length
    ? await db
        .select({ assignmentId: submissions.assignmentId, id: submissions.id, owner: sql<string>`coalesce(${submissions.teamId}, ${submissions.userId})`, isLate: submissions.isLate, version: submissions.version })
        .from(submissions)
        .where(and(inArray(submissions.assignmentId, ids), eq(submissions.orgId, orgId), sql`${submissions.status} <> 'draft'`))
    : [];
  const latest = new Map<string, (typeof subs)[number]>();
  for (const s of subs.sort((x, y) => x.version - y.version)) latest.set(`${s.assignmentId}:${s.owner}`, s);
  const evals = await currentEvaluations([...latest.values()].map((s) => s.id));
  const cohortIds = [...new Set(rows.map((r) => r.a.cohortId))];
  const counts = cohortIds.length
    ? await db
        .select({ cohortId: cohortMembers.cohortId, n: sql<number>`count(*)::int` })
        .from(cohortMembers)
        .where(and(inArray(cohortMembers.cohortId, cohortIds), eq(cohortMembers.role, 'student')))
        .groupBy(cohortMembers.cohortId)
    : [];
  return c.json({
    items: rows.map(({ a, cohortName }) => {
      const mine = [...latest.values()].filter((s) => s.assignmentId === a.id);
      return {
        id: a.id,
        title: a.title,
        status: a.status,
        dueAt: a.dueAt,
        availableFrom: a.availableFrom,
        cohortId: a.cohortId,
        cohortName,
        collaboration: a.collaboration,
        maxPoints: a.maxPoints,
        students: counts.find((x) => x.cohortId === a.cohortId)?.n ?? 0,
        submitted: mine.length,
        late: mine.filter((s) => s.isLate).length,
        ungraded: mine.filter((s) => !evals.get(s.id)).length,
      };
    }),
    total: rows.length,
  });
});

assignmentRoutes.post('/assignments', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = requireActiveOrg(c, STAFF_ROLES);
  const input = await body(c, createSchema);
  const cohort = await loadCohortForStaff(c, input.cohortId).catch((e) => {
    if (e?.status === 404) throw badRequest('Choose a cohort you teach.', { fields: { cohortId: 'Unknown cohort' } });
    throw e;
  });
  if (cohort.orgId !== orgId) throw badRequest('Choose a cohort from the active organization.', { fields: { cohortId: 'Unknown cohort' } });
  validateDates(input);
  await checkRefs(orgId, input);
  const [row] = await db
    .insert(assignments)
    .values({
      orgId,
      cohortId: cohort.id,
      courseId: input.courseId ?? null,
      authorId: auth.user.id,
      title: input.title,
      objectives: input.objectives,
      instructions: input.instructions,
      availableFrom: input.availableFrom ? new Date(input.availableFrom) : null,
      dueAt: new Date(input.dueAt),
      maxPoints: input.maxPoints,
      rubricId: input.rubricId ?? null,
      submissionTypes: input.submissionTypes,
      acceptedFileTypes: input.acceptedFileTypes.map((x) => x.replace(/^\./, '')),
      collaboration: input.collaboration,
      latePolicy: { allowLate: input.latePolicy.allowLate, penaltyPercentPerDay: input.latePolicy.penaltyPercentPerDay ?? 0, ...(input.latePolicy.hardCutoffDays !== null && input.latePolicy.hardCutoffDays !== undefined ? { hardCutoffDays: input.latePolicy.hardCutoffDays } : {}) },
      allowResubmission: input.allowResubmission,
      maxResubmissions: input.allowResubmission ? input.maxResubmissions : 0,
      skillIds: input.skillIds,
      releasePolicy: input.releasePolicy,
    })
    .returning();
  await audit(c, { action: 'teach.assignment.create', orgId, targetType: 'assignment', targetId: row.id });
  return c.json({ assignment: row }, 201);
});

assignmentRoutes.get('/assignments/:id', async (c) => {
  const { assignment: a, cohort } = await loadAssignmentForStaff(c, idParam(c));
  const [course] = a.courseId ? await db.select({ id: courses.id, code: courses.code, title: courses.title }).from(courses).where(eq(courses.id, a.courseId)) : [];
  const [rubric] = a.rubricId ? await db.select().from(rubrics).where(eq(rubrics.id, a.rubricId)) : [];
  const teams = await db.select().from(assignmentTeams).where(eq(assignmentTeams.assignmentId, a.id)).orderBy(asc(assignmentTeams.name));
  const studentRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(and(eq(cohortMembers.cohortId, a.cohortId), eq(cohortMembers.role, 'student')))
    .orderBy(asc(users.name));
  const all = await db.select().from(submissions).where(and(eq(submissions.assignmentId, a.id), eq(submissions.orgId, a.orgId))).orderBy(asc(submissions.version));
  const current = await currentEvaluations(all.map((s) => s.id));
  const released = await releasedEvaluations(all.map((s) => s.id));
  const skillRows = a.skillIds.length ? await db.select({ id: skills.id, name: skills.name, slug: skills.slug }).from(skills).where(inArray(skills.id, a.skillIds)) : [];

  const rows = studentRows.map((st) => {
    const team = teams.find((t) => t.memberIds.includes(st.id)) ?? null;
    const versions = all.filter((s) => (a.collaboration === 'team' && team ? s.teamId === team.id : s.userId === st.id && !s.teamId));
    const submittedVersions = versions.filter((v) => v.status !== 'draft');
    const latest = submittedVersions[submittedVersions.length - 1] ?? null;
    const rel = latest ? (released.get(latest.id) ?? null) : null;
    const cur = latest ? (current.get(latest.id) ?? null) : null;
    return {
      userId: st.id,
      name: st.name,
      email: st.email,
      team: team ? { id: team.id, name: team.name } : null,
      status: workStatus(versions, rel),
      hasDraft: versions.some((v) => v.status === 'draft'),
      submissionId: latest?.id ?? null,
      version: latest?.version ?? null,
      submittedAt: latest?.submittedAt ?? null,
      isLate: latest?.isLate ?? false,
      daysLate: latest ? latePenalty(a.latePolicy, a.dueAt, latest.submittedAt).daysLate : 0,
      evaluation: cur ? { id: cur.id, finalScore: cur.finalScore, released: cur.released } : null,
    };
  });
  return c.json({
    assignment: a,
    cohort: { id: cohort.id, name: cohort.name },
    course: course ?? null,
    rubric: a.rubricSnapshot ? { id: a.rubricId, title: rubric?.title ?? 'Rubric', criteria: a.rubricSnapshot, snapshot: true, version: null } : rubric ? { id: rubric.id, title: rubric.title, criteria: rubric.criteria, snapshot: false, version: rubric.version } : null,
    skills: skillRows,
    teams: teams.map((t) => ({ ...t, members: studentRows.filter((s) => t.memberIds.includes(s.id)).map((s) => ({ id: s.id, name: s.name })) })),
    students: rows,
    counts: {
      students: rows.length,
      notStarted: rows.filter((r) => r.status === 'not_started').length,
      drafts: rows.filter((r) => r.status === 'draft').length,
      submitted: rows.filter((r) => r.submissionId).length,
      late: rows.filter((r) => r.isLate).length,
      graded: rows.filter((r) => r.evaluation).length,
      released: rows.filter((r) => r.evaluation?.released).length,
    },
    checklist: await publishChecklist(a),
    latePolicyText: latePolicyText(a.latePolicy),
    lockedFields: a.status === 'draft' ? [] : LOCKED_AFTER_PUBLISH,
  });
});

assignmentRoutes.patch('/assignments/:id', async (c) => {
  const { assignment: a } = await loadAssignmentForStaff(c, idParam(c));
  const input = await body(c, assignmentPatch);
  if (a.status !== 'draft') {
    for (const k of LOCKED_AFTER_PUBLISH) {
      if (input[k] !== undefined && input[k] !== a[k]) throw conflict(`"${k}" cannot change after publishing because submissions and grades depend on it.`);
    }
  }
  validateDates({ availableFrom: input.availableFrom ?? (a.availableFrom ? new Date(a.availableFrom).toISOString() : null), dueAt: input.dueAt ?? new Date(a.dueAt).toISOString() });
  await checkRefs(a.orgId, input);
  const set: Partial<typeof assignments.$inferInsert> = { updatedAt: new Date() };
  if (input.courseId !== undefined) set.courseId = input.courseId;
  if (input.title !== undefined) set.title = input.title;
  if (input.objectives !== undefined) set.objectives = input.objectives;
  if (input.instructions !== undefined) set.instructions = input.instructions;
  if (input.availableFrom !== undefined) set.availableFrom = input.availableFrom ? new Date(input.availableFrom) : null;
  if (input.dueAt !== undefined) set.dueAt = new Date(input.dueAt);
  if (input.maxPoints !== undefined) set.maxPoints = input.maxPoints;
  if (input.rubricId !== undefined) set.rubricId = input.rubricId;
  if (input.submissionTypes !== undefined) set.submissionTypes = input.submissionTypes;
  if (input.acceptedFileTypes !== undefined) set.acceptedFileTypes = input.acceptedFileTypes.map((x) => x.replace(/^\./, ''));
  if (input.collaboration !== undefined) set.collaboration = input.collaboration;
  if (input.latePolicy !== undefined)
    set.latePolicy = { allowLate: input.latePolicy.allowLate, penaltyPercentPerDay: input.latePolicy.penaltyPercentPerDay ?? 0, ...(input.latePolicy.hardCutoffDays !== null && input.latePolicy.hardCutoffDays !== undefined ? { hardCutoffDays: input.latePolicy.hardCutoffDays } : {}) };
  if (input.allowResubmission !== undefined) set.allowResubmission = input.allowResubmission;
  if (input.maxResubmissions !== undefined) set.maxResubmissions = input.maxResubmissions;
  if (set.allowResubmission === false) set.maxResubmissions = 0;
  if (input.skillIds !== undefined) set.skillIds = input.skillIds;
  if (input.releasePolicy !== undefined) set.releasePolicy = input.releasePolicy;
  const [row] = await db.update(assignments).set(set).where(and(eq(assignments.id, a.id), eq(assignments.orgId, a.orgId))).returning();

  if (a.status === 'published' && input.dueAt && new Date(input.dueAt).getTime() !== new Date(a.dueAt).getTime()) {
    for (const uid of await cohortStudentIds(a.cohortId)) {
      await notify(uid, { type: 'assignment.deadline_changed', category: 'assignments', orgId: a.orgId, title: `Deadline changed: ${a.title}`, body: `New due date: ${new Date(input.dueAt).toUTCString()}`, link: `/app/assignments/${a.id}` });
    }
    await audit(c, { action: 'teach.assignment.deadline_change', orgId: a.orgId, targetType: 'assignment', targetId: a.id, meta: { from: a.dueAt, to: input.dueAt } });
  }
  return c.json({ assignment: row });
});

assignmentRoutes.delete('/assignments/:id', async (c) => {
  const { assignment: a } = await loadAssignmentForStaff(c, idParam(c));
  if (a.status !== 'draft') throw conflict('Published assignments cannot be deleted. Close it instead so submissions and grades are kept.');
  await db.delete(assignments).where(and(eq(assignments.id, a.id), eq(assignments.orgId, a.orgId)));
  await audit(c, { action: 'teach.assignment.delete', orgId: a.orgId, targetType: 'assignment', targetId: a.id, meta: { title: a.title } });
  return c.json({ ok: true });
});

assignmentRoutes.post('/assignments/:id/duplicate', async (c) => {
  const auth = requireAuth(c);
  const { assignment: a } = await loadAssignmentForStaff(c, idParam(c));
  const input = await body(c, z.object({ cohortId: z.string().uuid().optional() }));
  let cohortId = a.cohortId;
  if (input.cohortId) {
    const target = await loadCohortForStaff(c, input.cohortId);
    if (target.orgId !== a.orgId) throw notFound('Cohort');
    cohortId = target.id;
  }
  const { id: _id, createdAt: _c, updatedAt: _u, rubricSnapshot: _r, status: _s, ...rest } = a;
  const [row] = await db.insert(assignments).values({ ...rest, cohortId, authorId: auth.user.id, title: `${a.title} (copy)`.slice(0, 200), status: 'draft' }).returning();
  return c.json({ assignment: row }, 201);
});

assignmentRoutes.post('/assignments/:id/publish', async (c) => {
  const { assignment: a, cohort } = await loadAssignmentForStaff(c, idParam(c));
  if (a.status !== 'draft') throw conflict('This assignment is already published.');
  const check = await publishChecklist(a);
  if (!check.canPublish) throw badRequest('Complete the publish checklist first.', { checklist: check.items.filter((i) => i.blocking && !i.ok) });
  let snapshot = null;
  if (a.rubricId) {
    const [r] = await db.select().from(rubrics).where(and(eq(rubrics.id, a.rubricId), eq(rubrics.orgId, a.orgId)));
    snapshot = r?.criteria ?? null;
  }
  const [row] = await db
    .update(assignments)
    .set({ status: 'published', rubricSnapshot: snapshot, availableFrom: a.availableFrom ?? new Date(), updatedAt: new Date() })
    .where(and(eq(assignments.id, a.id), eq(assignments.orgId, a.orgId), eq(assignments.status, 'draft')))
    .returning();
  if (!row) throw conflict('This assignment was published by someone else a moment ago.');
  const students = await cohortStudentIds(a.cohortId);
  const opens = row.availableFrom && new Date(row.availableFrom).getTime() > Date.now() ? ` Opens ${new Date(row.availableFrom).toUTCString()}.` : '';
  for (const uid of students) {
    await notify(uid, { type: 'assignment.published', category: 'assignments', orgId: a.orgId, title: `New assignment: ${a.title}`, body: `${cohort.name}. Due ${new Date(a.dueAt).toUTCString()}.${opens}`, link: `/app/assignments/${a.id}` });
  }
  await audit(c, { action: 'teach.assignment.publish', orgId: a.orgId, targetType: 'assignment', targetId: a.id, meta: { notified: students.length } });
  return c.json({ assignment: row, notified: students.length });
});

assignmentRoutes.post('/assignments/:id/close', async (c) => {
  const { assignment: a } = await loadAssignmentForStaff(c, idParam(c));
  if (a.status !== 'published') throw conflict('Only published assignments can be closed.');
  const [row] = await db.update(assignments).set({ status: 'closed', updatedAt: new Date() }).where(and(eq(assignments.id, a.id), eq(assignments.orgId, a.orgId))).returning();
  await audit(c, { action: 'teach.assignment.close', orgId: a.orgId, targetType: 'assignment', targetId: a.id });
  return c.json({ assignment: row });
});

assignmentRoutes.post('/assignments/:id/reopen', async (c) => {
  const { assignment: a } = await loadAssignmentForStaff(c, idParam(c));
  if (a.status !== 'closed') throw conflict('Only closed assignments can be reopened.');
  const [row] = await db.update(assignments).set({ status: 'published', updatedAt: new Date() }).where(and(eq(assignments.id, a.id), eq(assignments.orgId, a.orgId))).returning();
  await audit(c, { action: 'teach.assignment.reopen', orgId: a.orgId, targetType: 'assignment', targetId: a.id });
  return c.json({ assignment: row });
});

// ---------- Teams ----------

async function assertTeamMembers(a: Assignment, memberIds: string[], exceptTeamId?: string) {
  const students = new Set(await cohortStudentIds(a.cohortId));
  for (const m of memberIds) if (!students.has(m)) throw badRequest('Team members must be students in this cohort.');
  const teams = await db.select().from(assignmentTeams).where(eq(assignmentTeams.assignmentId, a.id));
  for (const t of teams) {
    if (t.id === exceptTeamId) continue;
    const clash = t.memberIds.find((m) => memberIds.includes(m));
    if (clash) throw conflict(`A student is already in team "${t.name}".`);
  }
}

async function teamHasWork(teamId: string) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(submissions).where(eq(submissions.teamId, teamId));
  return row.n > 0;
}

const teamInput = z.object({ name: z.string().trim().min(1).max(80), memberIds: z.array(z.string().uuid()).min(1).max(20) });

assignmentRoutes.post('/assignments/:id/teams', async (c) => {
  const { assignment: a } = await loadAssignmentForStaff(c, idParam(c));
  if (a.collaboration !== 'team') throw badRequest('Switch collaboration to "Team" to create teams.');
  const input = await body(c, teamInput);
  const memberIds = [...new Set(input.memberIds)];
  await assertTeamMembers(a, memberIds);
  const [row] = await db.insert(assignmentTeams).values({ assignmentId: a.id, name: input.name, memberIds }).returning();
  return c.json({ team: row }, 201);
});

assignmentRoutes.post('/assignments/:id/teams/auto', async (c) => {
  const { assignment: a } = await loadAssignmentForStaff(c, idParam(c));
  if (a.collaboration !== 'team') throw badRequest('Switch collaboration to "Team" to create teams.');
  const input = await body(c, z.object({ size: z.number().int().min(2).max(10) }));
  const teams = await db.select().from(assignmentTeams).where(eq(assignmentTeams.assignmentId, a.id));
  const inTeam = new Set(teams.flatMap((t) => t.memberIds));
  const free = (await cohortStudentIds(a.cohortId)).filter((s) => !inTeam.has(s));
  // Shuffle so teams are not alphabetical.
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  const created: (typeof assignmentTeams.$inferSelect)[] = [];
  let n = teams.length + 1;
  for (let i = 0; i < free.length; i += input.size) {
    const group = free.slice(i, i + input.size);
    // A leftover single student joins the previous new team instead of working alone.
    if (group.length === 1 && created.length) {
      const last = created[created.length - 1];
      const [u] = await db.update(assignmentTeams).set({ memberIds: [...last.memberIds, group[0]] }).where(eq(assignmentTeams.id, last.id)).returning();
      created[created.length - 1] = u;
      continue;
    }
    const [row] = await db.insert(assignmentTeams).values({ assignmentId: a.id, name: `Team ${n++}`, memberIds: group }).returning();
    created.push(row);
  }
  return c.json({ created: created.length, teams: created });
});

assignmentRoutes.patch('/teams/:teamId', async (c) => {
  const teamId = idParam(c, 'teamId');
  const [team] = await db.select().from(assignmentTeams).where(eq(assignmentTeams.id, teamId));
  if (!team) throw notFound('Team');
  const { assignment: a } = await loadAssignmentForStaff(c, team.assignmentId).catch((e) => {
    if (e?.status === 404) throw notFound('Team');
    throw e;
  });
  const input = await body(c, patchSchema(teamInput));
  const memberIds = input.memberIds ? [...new Set(input.memberIds)] : undefined;
  if (memberIds) {
    if ((await teamHasWork(team.id)) && team.memberIds.some((m) => !memberIds.includes(m))) throw conflict('This team has submitted work; members can be added but not removed.');
    await assertTeamMembers(a, memberIds, team.id);
  }
  const [row] = await db.update(assignmentTeams).set({ name: input.name ?? team.name, memberIds: memberIds ?? team.memberIds }).where(eq(assignmentTeams.id, team.id)).returning();
  return c.json({ team: row });
});

assignmentRoutes.delete('/teams/:teamId', async (c) => {
  const teamId = idParam(c, 'teamId');
  const [team] = await db.select().from(assignmentTeams).where(eq(assignmentTeams.id, teamId));
  if (!team) throw notFound('Team');
  await loadAssignmentForStaff(c, team.assignmentId).catch((e) => {
    if (e?.status === 404) throw notFound('Team');
    throw e;
  });
  if (await teamHasWork(team.id)) throw conflict('This team has submitted work and cannot be deleted.');
  await db.delete(assignmentTeams).where(eq(assignmentTeams.id, team.id));
  return c.json({ ok: true });
});

// ---------- Reports (CSV) ----------

function csvResponse(c: Ctx, filename: string, csv: string) {
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
  return c.body(csv);
}

assignmentRoutes.get('/assignments/:id/grades.csv', async (c) => {
  const { assignment: a } = await loadAssignmentForStaff(c, idParam(c));
  const studentRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(and(eq(cohortMembers.cohortId, a.cohortId), eq(cohortMembers.role, 'student')))
    .orderBy(asc(users.name));
  const teams = await db.select().from(assignmentTeams).where(eq(assignmentTeams.assignmentId, a.id));
  const all = await db.select().from(submissions).where(and(eq(submissions.assignmentId, a.id), eq(submissions.orgId, a.orgId))).orderBy(asc(submissions.version));
  const current = await currentEvaluations(all.map((s) => s.id));
  const released = await releasedEvaluations(all.map((s) => s.id));
  const rows = studentRows.map((st) => {
    const team = teams.find((t) => t.memberIds.includes(st.id));
    const versions: Submission[] = all.filter((s) => (a.collaboration === 'team' && team ? s.teamId === team.id : s.userId === st.id && !s.teamId));
    const sub = versions.filter((v) => v.status !== 'draft');
    const latest = sub[sub.length - 1];
    const e = latest ? current.get(latest.id) : undefined;
    const pen = latest ? latePenalty(a.latePolicy, a.dueAt, latest.submittedAt) : { daysLate: 0 };
    return [
      st.name,
      st.email,
      team?.name ?? '',
      workStatus(versions, latest ? released.get(latest.id) : null),
      latest?.version ?? '',
      latest?.submittedAt ? new Date(latest.submittedAt).toISOString() : '',
      latest ? (latest.isLate ? 'yes' : 'no') : '',
      latest ? pen.daysLate : '',
      e?.rawScore ?? '',
      e?.latePenalty ?? '',
      e?.finalScore ?? '',
      a.maxPoints,
      e ? (e.released ? 'yes' : 'no') : '',
      latest?.receiptCode ?? '',
    ];
  });
  await audit(c, { action: 'teach.export.grades', orgId: a.orgId, targetType: 'assignment', targetId: a.id, meta: { rows: rows.length } });
  const csv = toCsv(['Student', 'Email', 'Team', 'Status', 'Version', 'Submitted at (UTC)', 'Late', 'Days late', 'Raw score', 'Late penalty', 'Final score', 'Max points', 'Released', 'Receipt code'], rows);
  return csvResponse(c, `grades-${a.title}.csv`, csv);
});

assignmentRoutes.get('/cohorts/:id/completion.csv', async (c) => {
  const cohort = await loadCohortForStaff(c, idParam(c));
  const an = await cohortAnalytics(cohort);
  const rows = an.students.map((s) => [
    s.name,
    s.email,
    s.assignments,
    s.submitted,
    s.late,
    s.averagePercent ?? 'No data',
    s.attendancePercent ?? 'No data',
    s.reasons.map((r) => r.text).join(' | '),
  ]);
  await audit(c, { action: 'teach.export.completion', orgId: cohort.orgId, targetType: 'cohort', targetId: cohort.id, meta: { rows: rows.length } });
  return csvResponse(c, `completion-${cohort.name}.csv`, toCsv(['Student', 'Email', 'Assignments', 'Submitted', 'Late', 'Average %', 'Attendance %', 'At-risk reasons'], rows));
});

