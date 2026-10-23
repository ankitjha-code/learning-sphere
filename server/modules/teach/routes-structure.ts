/** Teach: lookups, overview, cohorts, courses, announcements, rubrics. */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  academicTerms,
  announcements,
  assignments,
  cohortMembers,
  cohorts,
  courseCohorts,
  courseInstructors,
  courses,
  memberships,
  programs,
  regradeRequests,
  rubrics,
  skills,
  submissions,
  teachRubricVersions,
  tracks,
  users,
} from '../../db/schema';
import { type AppEnv, type Ctx, requireActiveOrg, requireAuth } from '../../lib/context';
import { body, idParam, query, patchSchema } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import {
  STAFF_ROLES,
  currentEvaluations,
  isAdmin,
  isStaff,
  latestSubmitted,
  loadCohortForStaff,
  taughtCohortIds,
  userNames,
  validateCriteria,
} from './service';
import { cohortAnalytics } from './analytics';

export const structureRoutes = new Hono<AppEnv>();

const staffOrg = (c: Ctx) => requireActiveOrg(c, STAFF_ROLES);

// ---------- Lookups for pickers ----------

structureRoutes.get('/lookups', async (c) => {
  const { orgId } = staffOrg(c);
  const [skillRows, trackRows, termRows, programRows] = await Promise.all([
    db.select({ id: skills.id, slug: skills.slug, name: skills.name, category: skills.category }).from(skills).orderBy(asc(skills.category), asc(skills.name)),
    db
      .select({ id: tracks.id, slug: tracks.slug, title: tracks.title, orgId: tracks.orgId, status: tracks.status })
      .from(tracks)
      .where(or(and(isNull(tracks.orgId), eq(tracks.status, 'published')), eq(tracks.orgId, orgId)))
      .orderBy(asc(tracks.title)),
    db.select({ id: academicTerms.id, name: academicTerms.name, isCurrent: academicTerms.isCurrent }).from(academicTerms).where(eq(academicTerms.orgId, orgId)).orderBy(desc(academicTerms.startsOn)),
    db.select({ id: programs.id, name: programs.name, code: programs.code }).from(programs).where(eq(programs.orgId, orgId)).orderBy(asc(programs.name)),
  ]);
  return c.json({
    skills: skillRows,
    tracks: trackRows.map((t) => ({ id: t.id, slug: t.slug, title: t.title, scope: t.orgId ? 'org' : 'global', status: t.status })),
    terms: termRows,
    programs: programRows,
  });
});

// ---------- Overview ----------

structureRoutes.get('/overview', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = staffOrg(c);
  const taught = await taughtCohortIds(auth, orgId);
  const cohortRows = await db
    .select()
    .from(cohorts)
    .where(and(eq(cohorts.orgId, orgId), taught === 'all' ? undefined : taught.length ? inArray(cohorts.id, taught) : sql`false`))
    .orderBy(asc(cohorts.name));
  const cohortIds = cohortRows.map((x) => x.id);
  const counts = cohortIds.length
    ? await db
        .select({ cohortId: cohortMembers.cohortId, n: sql<number>`count(*)::int` })
        .from(cohortMembers)
        .where(and(inArray(cohortMembers.cohortId, cohortIds), eq(cohortMembers.role, 'student')))
        .groupBy(cohortMembers.cohortId)
    : [];
  const asg = cohortIds.length
    ? await db.select().from(assignments).where(and(eq(assignments.orgId, orgId), inArray(assignments.cohortId, cohortIds))).orderBy(asc(assignments.dueAt))
    : [];
  const subs = await latestSubmitted(asg.map((a) => a.id), orgId);
  const evals = await currentEvaluations(subs.map((s) => s.id));
  const openRegrades = subs.length
    ? await db
        .select({ id: regradeRequests.id })
        .from(regradeRequests)
        .where(and(eq(regradeRequests.subjectType, 'assignment_submission'), eq(regradeRequests.status, 'open'), inArray(regradeRequests.subjectId, subs.map((s) => s.id))))
    : [];
  const now = Date.now();
  const upcoming = asg
    .filter((a) => a.status === 'published' && new Date(a.dueAt).getTime() > now && new Date(a.dueAt).getTime() < now + 14 * 86400_000)
    .slice(0, 8)
    .map((a) => ({
      id: a.id,
      title: a.title,
      dueAt: a.dueAt,
      cohortName: cohortRows.find((x) => x.id === a.cohortId)?.name ?? '',
      submitted: subs.filter((s) => s.assignmentId === a.id).length,
      students: counts.find((n) => n.cohortId === a.cohortId)?.n ?? 0,
    }));

  // At-risk students across the cohorts this person teaches (first 6 cohorts to keep it fast).
  const atRisk: { userId: string; name: string; cohortId: string; cohortName: string; reasons: { code: string; text: string }[] }[] = [];
  for (const co of cohortRows.slice(0, 6)) {
    const a = await cohortAnalytics(co);
    for (const s of a.students.filter((x) => x.atRisk)) atRisk.push({ userId: s.userId, name: s.name, cohortId: co.id, cohortName: co.name, reasons: s.reasons });
  }

  return c.json({
    cohorts: cohortRows.map((x) => ({
      id: x.id,
      name: x.name,
      kind: x.kind,
      students: counts.find((n) => n.cohortId === x.id)?.n ?? 0,
      assignments: asg.filter((a) => a.cohortId === x.id).length,
    })),
    backlog: {
      ungraded: subs.filter((s) => !evals.get(s.id)).length,
      ungradedLate: subs.filter((s) => !evals.get(s.id) && s.isLate).length,
      drafts: [...evals.values()].filter((e) => !e.released).length,
      regradesOpen: openRegrades.length,
    },
    upcoming,
    atRisk: atRisk.slice(0, 12),
    atRiskTotal: atRisk.length,
    draftAssignments: asg.filter((a) => a.status === 'draft').length,
  });
});

// ---------- Cohorts ----------

const cohortInput = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters.').max(120),
  kind: z.enum(['batch', 'section', 'course', 'training']).default('section'),
  programId: z.string().uuid().nullable().optional(),
  termId: z.string().uuid().nullable().optional(),
  graduationYear: z.number().int().min(1990).max(2100).nullable().optional(),
});

async function checkOrgRefs(orgId: string, v: { programId?: string | null; termId?: string | null }) {
  if (v.programId) {
    const [p] = await db.select({ id: programs.id }).from(programs).where(and(eq(programs.id, v.programId), eq(programs.orgId, orgId)));
    if (!p) throw badRequest('Choose a program from this organization.', { fields: { programId: 'Unknown program' } });
  }
  if (v.termId) {
    const [t] = await db.select({ id: academicTerms.id }).from(academicTerms).where(and(eq(academicTerms.id, v.termId), eq(academicTerms.orgId, orgId)));
    if (!t) throw badRequest('Choose a term from this organization.', { fields: { termId: 'Unknown term' } });
  }
}

structureRoutes.get('/cohorts', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = staffOrg(c);
  const q = query(c, z.object({ q: z.string().trim().max(100).optional(), scope: z.enum(['mine', 'all']).default('mine') }));
  const taught = await taughtCohortIds(auth, orgId);
  const admin = isAdmin(auth, orgId);
  const onlyMine = q.scope === 'mine' || !admin;
  const rows = await db
    .select()
    .from(cohorts)
    .where(
      and(
        eq(cohorts.orgId, orgId),
        onlyMine && taught !== 'all' ? (taught.length ? inArray(cohorts.id, taught) : sql`false`) : undefined,
        q.q ? sql`${cohorts.name} ilike ${'%' + q.q.replace(/[%_\\]/g, (m) => '\\' + m) + '%'}` : undefined,
      ),
    )
    .orderBy(asc(cohorts.name));
  const ids = rows.map((r) => r.id);
  const members = ids.length
    ? await db
        .select({ cohortId: cohortMembers.cohortId, role: cohortMembers.role, n: sql<number>`count(*)::int` })
        .from(cohortMembers)
        .where(inArray(cohortMembers.cohortId, ids))
        .groupBy(cohortMembers.cohortId, cohortMembers.role)
    : [];
  const asgCounts = ids.length
    ? await db.select({ cohortId: assignments.cohortId, n: sql<number>`count(*)::int` }).from(assignments).where(and(eq(assignments.orgId, orgId), inArray(assignments.cohortId, ids))).groupBy(assignments.cohortId)
    : [];
  const progs = await db.select({ id: programs.id, name: programs.name }).from(programs).where(eq(programs.orgId, orgId));
  return c.json({
    items: rows.map((r) => ({
      ...r,
      programName: progs.find((p) => p.id === r.programId)?.name ?? null,
      students: members.find((m) => m.cohortId === r.id && m.role === 'student')?.n ?? 0,
      instructors: members.filter((m) => m.cohortId === r.id && m.role !== 'student').reduce((s, m) => s + m.n, 0),
      assignments: asgCounts.find((a) => a.cohortId === r.id)?.n ?? 0,
      teaching: taught === 'all' || taught.includes(r.id),
    })),
    total: rows.length,
    canSeeAll: admin,
  });
});

structureRoutes.post('/cohorts', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = staffOrg(c);
  const input = await body(c, cohortInput);
  await checkOrgRefs(orgId, input);
  const [row] = await db
    .insert(cohorts)
    .values({ orgId, name: input.name, kind: input.kind, programId: input.programId ?? null, termId: input.termId ?? null, graduationYear: input.graduationYear ?? null, ownerId: auth.user.id })
    .returning();
  // The creator teaches it.
  await db.insert(cohortMembers).values({ cohortId: row.id, userId: auth.user.id, role: 'instructor' }).onConflictDoNothing();
  await audit(c, { action: 'teach.cohort.create', orgId, targetType: 'cohort', targetId: row.id });
  return c.json({ cohort: row }, 201);
});

structureRoutes.get('/cohorts/:id', async (c) => {
  const cohort = await loadCohortForStaff(c, idParam(c));
  const memberRows = await db
    .select({ userId: cohortMembers.userId, role: cohortMembers.role, addedAt: cohortMembers.addedAt, name: users.name, email: users.email })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(eq(cohortMembers.cohortId, cohort.id))
    .orderBy(asc(users.name));
  const linkedCourses = await db
    .select({ id: courses.id, code: courses.code, title: courses.title, trackId: courses.trackId })
    .from(courseCohorts)
    .innerJoin(courses, eq(courses.id, courseCohorts.courseId))
    .where(and(eq(courseCohorts.cohortId, cohort.id), eq(courses.orgId, cohort.orgId)));
  const asg = await db
    .select({ id: assignments.id, title: assignments.title, status: assignments.status, dueAt: assignments.dueAt, collaboration: assignments.collaboration })
    .from(assignments)
    .where(and(eq(assignments.cohortId, cohort.id), eq(assignments.orgId, cohort.orgId)))
    .orderBy(desc(assignments.dueAt));
  const analytics = await cohortAnalytics(cohort);
  const [program] = cohort.programId ? await db.select({ id: programs.id, name: programs.name }).from(programs).where(eq(programs.id, cohort.programId)) : [];
  const [term] = cohort.termId ? await db.select({ id: academicTerms.id, name: academicTerms.name }).from(academicTerms).where(eq(academicTerms.id, cohort.termId)) : [];
  return c.json({
    cohort: { ...cohort, programName: program?.name ?? null, termName: term?.name ?? null },
    students: memberRows
      .filter((m) => m.role === 'student')
      .map((m) => {
        const p = analytics.students.find((s) => s.userId === m.userId);
        return { ...m, progress: p ? { submitted: p.submitted, assignments: p.assignments, late: p.late, averagePercent: p.averagePercent, attendancePercent: p.attendancePercent, atRisk: p.atRisk, reasons: p.reasons } : null };
      }),
    staff: memberRows.filter((m) => m.role !== 'student'),
    courses: linkedCourses,
    assignments: asg,
    totals: analytics.totals,
  });
});

structureRoutes.patch('/cohorts/:id', async (c) => {
  const cohort = await loadCohortForStaff(c, idParam(c));
  const input = await body(c, patchSchema(cohortInput));
  await checkOrgRefs(cohort.orgId, input);
  const [row] = await db.update(cohorts).set(input).where(and(eq(cohorts.id, cohort.id), eq(cohorts.orgId, cohort.orgId))).returning();
  return c.json({ cohort: row });
});

structureRoutes.delete('/cohorts/:id', async (c) => {
  const auth = requireAuth(c);
  const cohort = await loadCohortForStaff(c, idParam(c));
  if (cohort.ownerId !== auth.user.id && !isAdmin(auth, cohort.orgId)) throw forbidden('Only the cohort owner or a faculty admin can delete a cohort.');
  const [used] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(eq(assignments.cohortId, cohort.id));
  if (used.n > 0) throw conflict('This cohort has submitted work. Close its assignments instead of deleting it, so grades and history are kept.');
  await db.delete(cohorts).where(and(eq(cohorts.id, cohort.id), eq(cohorts.orgId, cohort.orgId)));
  await audit(c, { action: 'teach.cohort.delete', orgId: cohort.orgId, targetType: 'cohort', targetId: cohort.id, meta: { name: cohort.name } });
  return c.json({ ok: true });
});

structureRoutes.post('/cohorts/:id/members', async (c) => {
  const cohort = await loadCohortForStaff(c, idParam(c));
  const input = await body(c, z.object({ userIds: z.array(z.string().uuid()).min(1).max(500), role: z.enum(['student', 'instructor', 'ta']).default('student') }));
  const ms = await db
    .select({ userId: memberships.userId, roles: memberships.roles })
    .from(memberships)
    .where(and(eq(memberships.orgId, cohort.orgId), eq(memberships.status, 'active'), inArray(memberships.userId, input.userIds)));
  const added: string[] = [];
  const skipped: { userId: string; reason: string }[] = [];
  for (const uid of input.userIds) {
    const m = ms.find((x) => x.userId === uid);
    if (!m) {
      skipped.push({ userId: uid, reason: 'Not a member of this organization.' });
      continue;
    }
    const ok = input.role === 'student' ? m.roles.includes('student') : m.roles.some((r) => (STAFF_ROLES as string[]).includes(r));
    if (!ok) {
      skipped.push({ userId: uid, reason: input.role === 'student' ? 'Does not have the Student role.' : 'Does not have a faculty role.' });
      continue;
    }
    await db
      .insert(cohortMembers)
      .values({ cohortId: cohort.id, userId: uid, role: input.role })
      .onConflictDoUpdate({ target: [cohortMembers.cohortId, cohortMembers.userId], set: { role: input.role } });
    added.push(uid);
  }
  await audit(c, { action: 'teach.cohort.members_add', orgId: cohort.orgId, targetType: 'cohort', targetId: cohort.id, meta: { added: added.length, role: input.role } });
  return c.json({ added: added.length, skipped });
});

structureRoutes.delete('/cohorts/:id/members/:userId', async (c) => {
  const cohort = await loadCohortForStaff(c, idParam(c));
  const userId = idParam(c, 'userId');
  const res = await db.delete(cohortMembers).where(and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.userId, userId))).returning();
  if (!res.length) throw notFound('Member');
  await audit(c, { action: 'teach.cohort.member_remove', orgId: cohort.orgId, targetType: 'cohort', targetId: cohort.id, meta: { userId } });
  return c.json({ ok: true });
});

// ---------- Courses ----------

const courseInput = z.object({
  code: z.string().trim().min(2).max(30),
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(160),
  description: z.string().trim().max(5000).nullable().optional(),
  termId: z.string().uuid().nullable().optional(),
  trackId: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

async function checkTrack(orgId: string, trackId: string | null | undefined) {
  if (!trackId) return;
  const [t] = await db.select({ id: tracks.id, orgId: tracks.orgId, status: tracks.status }).from(tracks).where(eq(tracks.id, trackId));
  if (!t || (t.orgId && t.orgId !== orgId) || (!t.orgId && t.status !== 'published')) throw badRequest('Choose a published roadmap or one of your organization’s paths.', { fields: { trackId: 'Unknown roadmap' } });
}

async function loadCourse(c: Ctx, id: string, manage = false) {
  const auth = requireAuth(c);
  const [course] = await db.select().from(courses).where(eq(courses.id, id));
  if (!course || !isStaff(auth, course.orgId)) throw notFound('Course');
  if (manage && !(await canManageCourse(auth, course))) throw forbidden('Only the course owner, its instructors or a faculty admin can change this course.');
  return course;
}

async function canManageCourse(auth: ReturnType<typeof requireAuth>, course: typeof courses.$inferSelect) {
  if (isAdmin(auth, course.orgId) || course.ownerId === auth.user.id) return true;
  const [ci] = await db.select().from(courseInstructors).where(and(eq(courseInstructors.courseId, course.id), eq(courseInstructors.userId, auth.user.id)));
  return !!ci;
}

structureRoutes.get('/courses', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = staffOrg(c);
  const rows = await db.select().from(courses).where(eq(courses.orgId, orgId)).orderBy(asc(courses.code));
  const ids = rows.map((r) => r.id);
  const [links, instr] = ids.length
    ? await Promise.all([
        db.select({ courseId: courseCohorts.courseId, cohortId: courseCohorts.cohortId, name: cohorts.name }).from(courseCohorts).innerJoin(cohorts, eq(cohorts.id, courseCohorts.cohortId)).where(inArray(courseCohorts.courseId, ids)),
        db.select().from(courseInstructors).where(inArray(courseInstructors.courseId, ids)),
      ])
    : [[], []];
  const trackRows = rows.some((r) => r.trackId) ? await db.select({ id: tracks.id, title: tracks.title, slug: tracks.slug }).from(tracks).where(inArray(tracks.id, rows.map((r) => r.trackId).filter(Boolean) as string[])) : [];
  const names = await userNames([...rows.map((r) => r.ownerId), ...instr.map((i) => i.userId)]);
  const admin = isAdmin(auth, orgId);
  return c.json({
    items: rows.map((r) => ({
      ...r,
      track: trackRows.find((t) => t.id === r.trackId) ?? null,
      cohorts: links.filter((l) => l.courseId === r.id).map((l) => ({ id: l.cohortId, name: l.name })),
      instructors: instr.filter((i) => i.courseId === r.id).map((i) => ({ userId: i.userId, role: i.role, name: names.get(i.userId)?.name ?? 'Unknown' })),
      canManage: admin || r.ownerId === auth.user.id || instr.some((i) => i.courseId === r.id && i.userId === auth.user.id),
    })),
    total: rows.length,
  });
});

structureRoutes.post('/courses', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = staffOrg(c);
  const input = await body(c, courseInput);
  await checkTrack(orgId, input.trackId);
  await checkOrgRefs(orgId, { termId: input.termId });
  const [row] = await db
    .insert(courses)
    .values({ orgId, code: input.code, title: input.title, description: input.description ?? null, termId: input.termId ?? null, trackId: input.trackId ?? null, ownerId: auth.user.id })
    .returning();
  await db.insert(courseInstructors).values({ courseId: row.id, userId: auth.user.id, role: 'instructor' }).onConflictDoNothing();
  await audit(c, { action: 'teach.course.create', orgId, targetType: 'course', targetId: row.id });
  return c.json({ course: row }, 201);
});

structureRoutes.get('/courses/:id', async (c) => {
  const auth = requireAuth(c);
  const course = await loadCourse(c, idParam(c));
  const [cohortRows, instr, ann, asg] = await Promise.all([
    db.select({ id: cohorts.id, name: cohorts.name, kind: cohorts.kind }).from(courseCohorts).innerJoin(cohorts, eq(cohorts.id, courseCohorts.cohortId)).where(eq(courseCohorts.courseId, course.id)),
    db.select().from(courseInstructors).where(eq(courseInstructors.courseId, course.id)),
    db.select().from(announcements).where(and(eq(announcements.courseId, course.id), eq(announcements.orgId, course.orgId))).orderBy(desc(announcements.createdAt)).limit(50),
    db
      .select({ id: assignments.id, title: assignments.title, status: assignments.status, dueAt: assignments.dueAt, cohortId: assignments.cohortId })
      .from(assignments)
      .where(and(eq(assignments.courseId, course.id), eq(assignments.orgId, course.orgId)))
      .orderBy(desc(assignments.dueAt)),
  ]);
  const [track] = course.trackId ? await db.select({ id: tracks.id, slug: tracks.slug, title: tracks.title, orgId: tracks.orgId }).from(tracks).where(eq(tracks.id, course.trackId)) : [];
  const names = await userNames([course.ownerId, ...instr.map((i) => i.userId), ...ann.map((a) => a.authorId)]);
  const counts = cohortRows.length
    ? await db
        .select({ cohortId: cohortMembers.cohortId, n: sql<number>`count(*)::int` })
        .from(cohortMembers)
        .where(and(inArray(cohortMembers.cohortId, cohortRows.map((r) => r.id)), eq(cohortMembers.role, 'student')))
        .groupBy(cohortMembers.cohortId)
    : [];
  return c.json({
    course: { ...course, ownerName: names.get(course.ownerId)?.name ?? 'Unknown' },
    track: track ? { id: track.id, slug: track.slug, title: track.title, scope: track.orgId ? 'org' : 'global' } : null,
    cohorts: cohortRows.map((r) => ({ ...r, students: counts.find((x) => x.cohortId === r.id)?.n ?? 0 })),
    instructors: instr.map((i) => ({ userId: i.userId, role: i.role, name: names.get(i.userId)?.name ?? 'Unknown', email: names.get(i.userId)?.email ?? '' })),
    announcements: ann.map((a) => ({ ...a, authorName: names.get(a.authorId)?.name ?? 'Unknown', cohortName: cohortRows.find((x) => x.id === a.cohortId)?.name ?? null })),
    assignments: asg.map((a) => ({ ...a, cohortName: cohortRows.find((x) => x.id === a.cohortId)?.name ?? null })),
    canManage: await canManageCourse(auth, course),
  });
});

structureRoutes.patch('/courses/:id', async (c) => {
  const course = await loadCourse(c, idParam(c), true);
  const input = await body(c, patchSchema(courseInput));
  await checkTrack(course.orgId, input.trackId);
  await checkOrgRefs(course.orgId, { termId: input.termId });
  const [row] = await db.update(courses).set(input).where(and(eq(courses.id, course.id), eq(courses.orgId, course.orgId))).returning();
  return c.json({ course: row });
});

structureRoutes.delete('/courses/:id', async (c) => {
  const course = await loadCourse(c, idParam(c), true);
  await db.delete(courses).where(and(eq(courses.id, course.id), eq(courses.orgId, course.orgId)));
  await audit(c, { action: 'teach.course.delete', orgId: course.orgId, targetType: 'course', targetId: course.id, meta: { code: course.code } });
  return c.json({ ok: true });
});

structureRoutes.put('/courses/:id/cohorts', async (c) => {
  const course = await loadCourse(c, idParam(c), true);
  const input = await body(c, z.object({ cohortIds: z.array(z.string().uuid()).max(100) }));
  const valid = input.cohortIds.length ? await db.select({ id: cohorts.id }).from(cohorts).where(and(eq(cohorts.orgId, course.orgId), inArray(cohorts.id, input.cohortIds))) : [];
  if (valid.length !== new Set(input.cohortIds).size) throw badRequest('Choose cohorts from this organization.');
  await db.delete(courseCohorts).where(eq(courseCohorts.courseId, course.id));
  if (valid.length) await db.insert(courseCohorts).values(valid.map((v) => ({ courseId: course.id, cohortId: v.id }))).onConflictDoNothing();
  return c.json({ ok: true, cohorts: valid.length });
});

structureRoutes.post('/courses/:id/instructors', async (c) => {
  const course = await loadCourse(c, idParam(c), true);
  const input = await body(c, z.object({ userId: z.string().uuid(), role: z.enum(['instructor', 'ta']).default('instructor') }));
  const [m] = await db.select({ roles: memberships.roles }).from(memberships).where(and(eq(memberships.orgId, course.orgId), eq(memberships.userId, input.userId), eq(memberships.status, 'active')));
  if (!m || !m.roles.some((r) => (STAFF_ROLES as string[]).includes(r))) throw badRequest('Instructors need a faculty role in this organization.');
  await db
    .insert(courseInstructors)
    .values({ courseId: course.id, userId: input.userId, role: input.role })
    .onConflictDoUpdate({ target: [courseInstructors.courseId, courseInstructors.userId], set: { role: input.role } });
  await audit(c, { action: 'teach.course.instructor_add', orgId: course.orgId, targetType: 'course', targetId: course.id, meta: input });
  return c.json({ ok: true });
});

structureRoutes.delete('/courses/:id/instructors/:userId', async (c) => {
  const course = await loadCourse(c, idParam(c), true);
  const userId = idParam(c, 'userId');
  await db.delete(courseInstructors).where(and(eq(courseInstructors.courseId, course.id), eq(courseInstructors.userId, userId)));
  return c.json({ ok: true });
});

structureRoutes.get('/courses/:id/announcements', async (c) => {
  const course = await loadCourse(c, idParam(c));
  const rows = await db.select().from(announcements).where(and(eq(announcements.courseId, course.id), eq(announcements.orgId, course.orgId))).orderBy(desc(announcements.createdAt)).limit(100);
  return c.json({ items: rows });
});

structureRoutes.post('/courses/:id/announcements', async (c) => {
  const auth = requireAuth(c);
  const course = await loadCourse(c, idParam(c), true);
  const input = await body(c, z.object({ title: z.string().trim().min(3).max(160), body: z.string().trim().min(1).max(10000), cohortId: z.string().uuid().nullable().optional() }));
  const linked = await db.select({ cohortId: courseCohorts.cohortId }).from(courseCohorts).where(eq(courseCohorts.courseId, course.id));
  const targetCohorts = input.cohortId ? [input.cohortId] : linked.map((l) => l.cohortId);
  if (input.cohortId && !linked.some((l) => l.cohortId === input.cohortId)) throw badRequest('That cohort is not linked to this course.');
  if (!targetCohorts.length) throw badRequest('Link at least one cohort to this course before posting an announcement.');
  const [row] = await db.insert(announcements).values({ orgId: course.orgId, courseId: course.id, cohortId: input.cohortId ?? null, authorId: auth.user.id, title: input.title, body: input.body }).returning();
  const recipients = await db
    .selectDistinct({ userId: cohortMembers.userId })
    .from(cohortMembers)
    .where(and(inArray(cohortMembers.cohortId, targetCohorts), sql`${cohortMembers.userId} <> ${auth.user.id}`));
  for (const r of recipients) {
    await notify(r.userId, { type: 'course.announcement', category: 'organization', orgId: course.orgId, title: `${course.code}: ${input.title}`, body: input.body.slice(0, 280), link: '/app/assignments' });
  }
  return c.json({ announcement: row, notified: recipients.length }, 201);
});

// ---------- Rubrics ----------

export const criteriaSchema = z
  .array(
    z.object({
      id: z.string().trim().min(1).max(40),
      title: z.string().trim().min(1, 'Name the criterion.').max(120),
      description: z.string().trim().max(1000).optional(),
      levels: z
        .array(z.object({ label: z.string().trim().min(1).max(60), points: z.number().min(0).max(1000), description: z.string().trim().max(500).optional() }))
        .min(2, 'Each criterion needs at least 2 levels.')
        .max(8),
    }),
  )
  .min(1, 'Add at least one criterion.')
  .max(20);

const rubricInput = z.object({ title: z.string().trim().min(3, 'Use at least 3 characters.').max(160), criteria: criteriaSchema });

async function loadRubric(c: Ctx, id: string, manage = false) {
  const auth = requireAuth(c);
  const [r] = await db.select().from(rubrics).where(eq(rubrics.id, id));
  if (!r || !r.orgId || !isStaff(auth, r.orgId)) throw notFound('Rubric');
  if (manage && r.ownerId !== auth.user.id && !isAdmin(auth, r.orgId)) throw forbidden('Only the rubric owner or a faculty admin can change it. Duplicate it to make your own version.');
  return r;
}

structureRoutes.get('/rubrics', async (c) => {
  const { orgId } = staffOrg(c);
  const rows = await db.select().from(rubrics).where(eq(rubrics.orgId, orgId)).orderBy(desc(rubrics.updatedAt));
  const used = rows.length
    ? await db.select({ rubricId: assignments.rubricId, n: sql<number>`count(*)::int` }).from(assignments).where(and(eq(assignments.orgId, orgId), inArray(assignments.rubricId, rows.map((r) => r.id)))).groupBy(assignments.rubricId)
    : [];
  const names = await userNames(rows.map((r) => r.ownerId));
  return c.json({ items: rows.map((r) => ({ ...r, ownerName: names.get(r.ownerId)?.name ?? 'Unknown', usedBy: used.find((u) => u.rubricId === r.id)?.n ?? 0 })), total: rows.length });
});

structureRoutes.post('/rubrics', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = staffOrg(c);
  const input = await body(c, rubricInput);
  validateCriteria(input.criteria);
  const [row] = await db.insert(rubrics).values({ orgId, ownerId: auth.user.id, title: input.title, criteria: input.criteria, version: 1 }).returning();
  await db.insert(teachRubricVersions).values({ rubricId: row.id, version: 1, title: row.title, criteria: row.criteria, editedBy: auth.user.id });
  return c.json({ rubric: row }, 201);
});

structureRoutes.get('/rubrics/:id', async (c) => {
  const r = await loadRubric(c, idParam(c));
  const versions = await db.select().from(teachRubricVersions).where(eq(teachRubricVersions.rubricId, r.id)).orderBy(desc(teachRubricVersions.version));
  const used = await db.select({ id: assignments.id, title: assignments.title, status: assignments.status }).from(assignments).where(and(eq(assignments.orgId, r.orgId!), eq(assignments.rubricId, r.id)));
  const names = await userNames([r.ownerId, ...versions.map((v) => v.editedBy)]);
  return c.json({ rubric: { ...r, ownerName: names.get(r.ownerId)?.name ?? 'Unknown' }, versions: versions.map((v) => ({ ...v, editedByName: names.get(v.editedBy)?.name ?? 'Unknown' })), usedBy: used });
});

structureRoutes.patch('/rubrics/:id', async (c) => {
  const auth = requireAuth(c);
  const r = await loadRubric(c, idParam(c), true);
  const input = await body(c, patchSchema(rubricInput));
  if (input.criteria) validateCriteria(input.criteria);
  const version = r.version + 1;
  const [row] = await db
    .update(rubrics)
    .set({ title: input.title ?? r.title, criteria: input.criteria ?? r.criteria, version, updatedAt: new Date() })
    .where(and(eq(rubrics.id, r.id), eq(rubrics.orgId, r.orgId!)))
    .returning();
  await db.insert(teachRubricVersions).values({ rubricId: r.id, version, title: row.title, criteria: row.criteria, editedBy: auth.user.id });
  return c.json({ rubric: row, note: 'Published assignments keep the rubric version they were published with.' });
});

structureRoutes.post('/rubrics/:id/duplicate', async (c) => {
  const auth = requireAuth(c);
  const r = await loadRubric(c, idParam(c));
  const [row] = await db.insert(rubrics).values({ orgId: r.orgId, ownerId: auth.user.id, title: `${r.title} (copy)`.slice(0, 160), criteria: r.criteria, version: 1 }).returning();
  await db.insert(teachRubricVersions).values({ rubricId: row.id, version: 1, title: row.title, criteria: row.criteria, editedBy: auth.user.id });
  return c.json({ rubric: row }, 201);
});

structureRoutes.delete('/rubrics/:id', async (c) => {
  const r = await loadRubric(c, idParam(c), true);
  const [draftUse] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(assignments)
    .where(and(eq(assignments.rubricId, r.id), eq(assignments.status, 'draft')));
  if (draftUse.n > 0) throw conflict('Draft assignments still use this rubric. Choose another rubric for them first.');
  await db.delete(rubrics).where(and(eq(rubrics.id, r.id), eq(rubrics.orgId, r.orgId!)));
  return c.json({ ok: true });
});

