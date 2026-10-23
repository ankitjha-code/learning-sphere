/** Teach: attendance, cohort analytics and learning interventions. */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  attendanceMarks,
  attendanceSessions,
  cohortMembers,
  courses,
  goals,
  skills,
  studentRecords,
  teachInterventions,
  tracks,
  users,
} from '../../db/schema';
import { type AppEnv, type Ctx, requireActiveOrg, requireAuth } from '../../lib/context';
import { body, idParam, query } from '../../lib/validate';
import { badRequest, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { STAFF_ROLES, cohortStudentIds, loadCohortForStaff, taughtCohortIds, userNames } from './service';
import { attendanceByStudent, cohortAnalytics } from './analytics';

export const insightRoutes = new Hono<AppEnv>();

// ---------- Attendance ----------

const STATUSES = ['present', 'absent', 'late', 'excused'] as const;
const markSchema = z.object({ userId: z.string().uuid(), status: z.enum(STATUSES) });
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-22.');

/**
 * Writes each student's org-wide attendance percentage into their student record, only when a record
 * already exists (record creation belongs to the campus module). Unknown stays unknown.
 */
export async function syncRecordAttendance(orgId: string, userIds: string[]) {
  if (!userIds.length) return 0;
  const sessions = await db.select({ id: attendanceSessions.id }).from(attendanceSessions).where(eq(attendanceSessions.orgId, orgId));
  const stats = await attendanceByStudent(sessions.map((s) => s.id));
  let updated = 0;
  for (const uid of userIds) {
    const pct = stats.get(uid)?.percent ?? null;
    if (pct === null) continue;
    const res = await db
      .update(studentRecords)
      .set({ attendancePercent: pct, updatedAt: new Date() })
      .where(and(eq(studentRecords.orgId, orgId), eq(studentRecords.userId, uid)))
      .returning({ id: studentRecords.id });
    updated += res.length;
  }
  return updated;
}

async function loadSession(c: Ctx, id: string) {
  const [s] = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, id));
  if (!s) throw notFound('Attendance session');
  const cohort = await loadCohortForStaff(c, s.cohortId).catch((e) => {
    if (e?.status === 404) throw notFound('Attendance session');
    throw e;
  });
  if (cohort.orgId !== s.orgId) throw notFound('Attendance session');
  return { session: s, cohort };
}

async function writeMarks(sessionId: string, cohortId: string, marks: { userId: string; status: (typeof STATUSES)[number] }[]) {
  const students = new Set(await cohortStudentIds(cohortId));
  const bad = marks.find((m) => !students.has(m.userId));
  if (bad) throw badRequest('Attendance can only be marked for students in this cohort.');
  for (const m of marks) {
    await db
      .insert(attendanceMarks)
      .values({ sessionId, userId: m.userId, status: m.status })
      .onConflictDoUpdate({ target: [attendanceMarks.sessionId, attendanceMarks.userId], set: { status: m.status } });
  }
}

insightRoutes.get('/attendance/sessions', async (c) => {
  const q = query(c, z.object({ cohortId: z.string().uuid() }));
  const cohort = await loadCohortForStaff(c, q.cohortId);
  const sessions = await db
    .select({ s: attendanceSessions, courseCode: courses.code })
    .from(attendanceSessions)
    .leftJoin(courses, eq(courses.id, attendanceSessions.courseId))
    .where(and(eq(attendanceSessions.cohortId, cohort.id), eq(attendanceSessions.orgId, cohort.orgId)))
    .orderBy(desc(attendanceSessions.heldOn), desc(attendanceSessions.createdAt));
  const marks = sessions.length ? await db.select().from(attendanceMarks).where(inArray(attendanceMarks.sessionId, sessions.map((s) => s.s.id))) : [];
  const names = await userNames(sessions.map((s) => s.s.takenBy));
  return c.json({
    items: sessions.map(({ s, courseCode }) => {
      const m = marks.filter((x) => x.sessionId === s.id);
      return {
        ...s,
        courseCode,
        takenByName: names.get(s.takenBy)?.name ?? 'Unknown',
        counts: { present: m.filter((x) => x.status === 'present').length, absent: m.filter((x) => x.status === 'absent').length, late: m.filter((x) => x.status === 'late').length, excused: m.filter((x) => x.status === 'excused').length, marked: m.length },
      };
    }),
    total: sessions.length,
  });
});

insightRoutes.post('/attendance/sessions', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ cohortId: z.string().uuid(), courseId: z.string().uuid().nullable().optional(), heldOn: dateOnly, topic: z.string().trim().max(200).optional(), marks: z.array(markSchema).max(1000).default([]) }));
  const cohort = await loadCohortForStaff(c, input.cohortId);
  if (input.courseId) {
    const [co] = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.id, input.courseId), eq(courses.orgId, cohort.orgId)));
    if (!co) throw badRequest('Choose a course from this organization.');
  }
  const [session] = await db.insert(attendanceSessions).values({ orgId: cohort.orgId, cohortId: cohort.id, courseId: input.courseId ?? null, heldOn: input.heldOn, topic: input.topic || null, takenBy: auth.user.id }).returning();
  await writeMarks(session.id, cohort.id, input.marks);
  const recordsUpdated = await syncRecordAttendance(cohort.orgId, input.marks.map((m) => m.userId));
  return c.json({ session, recordsUpdated }, 201);
});

insightRoutes.get('/attendance/sessions/:id', async (c) => {
  const { session, cohort } = await loadSession(c, idParam(c));
  const roster = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.role, 'student')))
    .orderBy(asc(users.name));
  const marks = await db.select().from(attendanceMarks).where(eq(attendanceMarks.sessionId, session.id));
  return c.json({ session, cohort: { id: cohort.id, name: cohort.name }, roster: roster.map((r) => ({ ...r, status: marks.find((m) => m.userId === r.userId)?.status ?? null })) });
});

insightRoutes.put('/attendance/sessions/:id/marks', async (c) => {
  const { session, cohort } = await loadSession(c, idParam(c));
  const input = await body(c, z.object({ marks: z.array(markSchema).min(1).max(1000) }));
  await writeMarks(session.id, cohort.id, input.marks);
  const recordsUpdated = await syncRecordAttendance(cohort.orgId, input.marks.map((m) => m.userId));
  return c.json({ ok: true, marked: input.marks.length, recordsUpdated });
});

insightRoutes.patch('/attendance/sessions/:id', async (c) => {
  const { session } = await loadSession(c, idParam(c));
  const input = await body(c, z.object({ heldOn: dateOnly.optional(), topic: z.string().trim().max(200).nullable().optional() }));
  const [row] = await db.update(attendanceSessions).set({ heldOn: input.heldOn ?? session.heldOn, topic: input.topic === undefined ? session.topic : input.topic }).where(eq(attendanceSessions.id, session.id)).returning();
  return c.json({ session: row });
});

insightRoutes.delete('/attendance/sessions/:id', async (c) => {
  const { session, cohort } = await loadSession(c, idParam(c));
  const marks = await db.select({ userId: attendanceMarks.userId }).from(attendanceMarks).where(eq(attendanceMarks.sessionId, session.id));
  await db.delete(attendanceSessions).where(eq(attendanceSessions.id, session.id));
  await syncRecordAttendance(cohort.orgId, marks.map((m) => m.userId));
  await audit(c, { action: 'teach.attendance.delete_session', orgId: cohort.orgId, targetType: 'attendance_session', targetId: session.id });
  return c.json({ ok: true });
});

insightRoutes.get('/attendance/summary', async (c) => {
  const q = query(c, z.object({ cohortId: z.string().uuid() }));
  const cohort = await loadCohortForStaff(c, q.cohortId);
  const sessions = await db.select({ id: attendanceSessions.id }).from(attendanceSessions).where(and(eq(attendanceSessions.cohortId, cohort.id), eq(attendanceSessions.orgId, cohort.orgId)));
  const stats = await attendanceByStudent(sessions.map((s) => s.id));
  const roster = await db
    .select({ userId: users.id, name: users.name })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.role, 'student')))
    .orderBy(asc(users.name));
  const records = roster.length ? await db.select({ userId: studentRecords.userId }).from(studentRecords).where(and(eq(studentRecords.orgId, cohort.orgId), inArray(studentRecords.userId, roster.map((r) => r.userId)))) : [];
  return c.json({
    sessions: sessions.length,
    students: roster.map((r) => ({ ...r, ...(stats.get(r.userId) ?? { present: 0, late: 0, absent: 0, excused: 0, marked: 0, percent: null }), hasRecord: records.some((x) => x.userId === r.userId) })),
    definition: 'Present and late marks divided by marked sessions, excluding excused absences. Students without marks show no data. The org-wide percentage is copied to a student record only when the record already exists.',
  });
});

// ---------- Analytics ----------

insightRoutes.get('/analytics/cohorts/:id', async (c) => {
  const cohort = await loadCohortForStaff(c, idParam(c));
  return c.json(await cohortAnalytics(cohort));
});

// ---------- Interventions ----------

insightRoutes.get('/interventions', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = requireActiveOrg(c, STAFF_ROLES);
  const q = query(c, z.object({ cohortId: z.string().uuid().optional(), status: z.enum(['open', 'done', 'all']).default('all') }));
  const taught = await taughtCohortIds(auth, orgId);
  if (q.cohortId) await loadCohortForStaff(c, q.cohortId);
  const rows = await db
    .select()
    .from(teachInterventions)
    .where(
      and(
        eq(teachInterventions.orgId, orgId),
        q.cohortId ? eq(teachInterventions.cohortId, q.cohortId) : taught === 'all' ? undefined : inArray(teachInterventions.cohortId, taught.length ? taught : ['00000000-0000-0000-0000-000000000000']),
        q.status === 'all' ? undefined : eq(teachInterventions.status, q.status),
      ),
    )
    .orderBy(desc(teachInterventions.createdAt))
    .limit(200);
  const names = await userNames(rows.flatMap((r) => [r.studentId, r.facultyId]));
  return c.json({ items: rows.map((r) => ({ ...r, studentName: names.get(r.studentId)?.name ?? 'Unknown', facultyName: names.get(r.facultyId)?.name ?? 'Unknown' })), total: rows.length });
});

insightRoutes.post('/interventions', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({
      cohortId: z.string().uuid(),
      studentIds: z.array(z.string().uuid()).min(1, 'Choose at least one student.').max(100),
      kind: z.enum(['message', 'revision_resource', 'note']),
      message: z.string().trim().max(3000).optional(),
      reason: z.string().trim().max(1000).optional(),
      followUpOn: dateOnly.nullable().optional(),
      resource: z.object({ title: z.string().trim().min(3).max(200), trackId: z.string().uuid().nullable().optional(), skillId: z.string().uuid().nullable().optional(), targetDate: z.string().datetime({ offset: true }).nullable().optional() }).optional(),
    }),
  );
  const cohort = await loadCohortForStaff(c, input.cohortId);
  const students = new Set(await cohortStudentIds(cohort.id));
  if (input.studentIds.some((s) => !students.has(s))) throw badRequest('Interventions can only target students in this cohort.');
  if (input.kind === 'message' && (!input.message || input.message.length < 10)) throw badRequest('Write a message of at least 10 characters.', { fields: { message: 'At least 10 characters' } });
  if (input.kind === 'revision_resource' && !input.resource) throw badRequest('Describe the revision resource.', { fields: { 'resource.title': 'Required' } });
  if (input.resource?.trackId) {
    const [t] = await db.select({ id: tracks.id, orgId: tracks.orgId }).from(tracks).where(eq(tracks.id, input.resource.trackId));
    if (!t || (t.orgId && t.orgId !== cohort.orgId)) throw badRequest('Choose a roadmap available to this organization.');
  }
  if (input.resource?.skillId) {
    const [s] = await db.select({ id: skills.id }).from(skills).where(eq(skills.id, input.resource.skillId));
    if (!s) throw badRequest('Unknown skill.');
  }
  const created = [];
  for (const sid of [...new Set(input.studentIds)]) {
    let goalId: string | null = null;
    if (input.kind === 'revision_resource' && input.resource) {
      const [g] = await db
        .insert(goals)
        .values({
          userId: sid,
          title: input.resource.title,
          kind: 'milestone',
          source: 'mentor',
          createdBy: auth.user.id,
          trackId: input.resource.trackId ?? null,
          skillId: input.resource.skillId ?? null,
          targetDate: input.resource.targetDate ? new Date(input.resource.targetDate) : null,
        })
        .returning();
      goalId = g.id;
      await notify(sid, { type: 'teach.revision_goal', category: 'learning', orgId: cohort.orgId, title: 'Your instructor suggested a revision goal', body: `${input.resource.title}${input.message ? `. ${input.message.slice(0, 200)}` : ''}`, link: '/app/goals' });
    }
    if (input.kind === 'message' && input.message) {
      await notify(sid, { type: 'teach.check_in', category: 'learning', orgId: cohort.orgId, title: `A note from ${auth.user.name}`, body: input.message, link: '/app/assignments' });
    }
    const [row] = await db
      .insert(teachInterventions)
      .values({ orgId: cohort.orgId, cohortId: cohort.id, studentId: sid, facultyId: auth.user.id, kind: input.kind, reason: input.reason ?? null, message: input.message ?? (input.resource?.title || null), goalId, followUpOn: input.followUpOn ?? null })
      .returning();
    created.push(row);
  }
  await audit(c, { action: 'teach.intervention.create', orgId: cohort.orgId, targetType: 'cohort', targetId: cohort.id, meta: { kind: input.kind, students: created.length } });
  return c.json({ items: created, created: created.length }, 201);
});

insightRoutes.patch('/interventions/:id', async (c) => {
  const [row] = await db.select().from(teachInterventions).where(eq(teachInterventions.id, idParam(c)));
  if (!row) throw notFound('Intervention');
  const cohort = await loadCohortForStaff(c, row.cohortId).catch((e) => {
    if (e?.status === 404) throw notFound('Intervention');
    throw e;
  });
  if (cohort.orgId !== row.orgId) throw notFound('Intervention');
  const input = await body(c, z.object({ status: z.enum(['open', 'done']).optional(), outcomeNote: z.string().trim().max(3000).nullable().optional(), followUpOn: dateOnly.nullable().optional() }));
  const [u] = await db
    .update(teachInterventions)
    .set({ status: input.status ?? row.status, outcomeNote: input.outcomeNote === undefined ? row.outcomeNote : input.outcomeNote, followUpOn: input.followUpOn === undefined ? row.followUpOn : input.followUpOn })
    .where(eq(teachInterventions.id, row.id))
    .returning();
  return c.json({ intervention: u });
});
