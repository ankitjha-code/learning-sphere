import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { departments, driveCandidates, driveStageEvents, memberships, placementDrives, programs, recordCorrections, studentRecords, users } from '../../db/schema';
import { type AppEnv, requireAuth } from '../../lib/context';
import { body, idParam, query, patchSchema } from '../../lib/validate';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { computeSkillDna } from '../learning/skilldna';
import { assertCampusAccess, GAPS_SQL, getCampusSettings, parseCsv, RECORD_FIELD_LABELS, recordGaps, requireCampus, type RecordRow } from './service';
import { ref } from '../../lib/sql';

/** Student academic records, CSV import, verification and correction review (staff side). */
export const studentRoutes = new Hono<AppEnv>();

const like = (q: string) => `%${q.replace(/[%_\\]/g, '\\$&')}%`;
const ACADEMIC_FIELDS = ['rollNumber', 'programId', 'graduationYear', 'cgpa', 'activeBacklogs', 'attendancePercent', 'status'] as const;
const RECORD_STATUSES = ['enrolled', 'graduated', 'withdrawn', 'on_leave'] as const;

async function loadRecord(c: Parameters<typeof requireAuth>[0], id: string) {
  const [r] = await db.select().from(studentRecords).where(eq(studentRecords.id, id));
  if (!r) throw notFound('Student record');
  assertCampusAccess(c, r.orgId, 'Student record');
  return r;
}

async function programInOrg(orgId: string, programId: string | null | undefined) {
  if (!programId) return null;
  const [p] = await db.select().from(programs).where(and(eq(programs.id, programId), eq(programs.orgId, orgId)));
  if (!p) throw badRequest('Choose a program from this institution.', { fields: { programId: 'Unknown program.' } });
  return p;
}

// ---------- List & detail ----------

studentRoutes.get('/students', async (c) => {
  const { orgId } = requireCampus(c);
  const q = query(
    c,
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
      q: z.string().trim().max(200).optional(),
      programId: z.string().uuid().optional(),
      departmentId: z.string().uuid().optional(),
      graduationYear: z.coerce.number().int().min(1990).max(2100).optional(),
      status: z.enum(RECORD_STATUSES).optional(),
      verified: z.enum(['yes', 'no']).optional(),
      gaps: z.enum(['yes', 'no']).optional(),
    }),
  );
  const where = and(
    eq(studentRecords.orgId, orgId),
    q.q ? sql`(${users.name} ilike ${like(q.q)} or ${users.email} ilike ${like(q.q)} or ${studentRecords.rollNumber} ilike ${like(q.q)})` : undefined,
    q.programId ? eq(studentRecords.programId, q.programId) : undefined,
    q.departmentId ? eq(studentRecords.departmentId, q.departmentId) : undefined,
    q.graduationYear ? eq(studentRecords.graduationYear, q.graduationYear) : undefined,
    q.status ? eq(studentRecords.status, q.status) : undefined,
    q.verified === 'yes' ? isNotNull(studentRecords.verifiedAt) : q.verified === 'no' ? isNull(studentRecords.verifiedAt) : undefined,
    q.gaps === 'yes' ? GAPS_SQL : q.gaps === 'no' ? sql`not ${GAPS_SQL}` : undefined,
  );
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(studentRecords).innerJoin(users, eq(users.id, studentRecords.userId)).where(where);
  const rows = await db
    .select({
      r: studentRecords,
      name: users.name,
      email: users.email,
      programName: programs.name,
      programCode: programs.code,
      openCorrections: sql<number>`(select count(*)::int from record_corrections rc where rc.record_id = ${ref(studentRecords.id)} and rc.status = 'open')`,
    })
    .from(studentRecords)
    .innerJoin(users, eq(users.id, studentRecords.userId))
    .leftJoin(programs, eq(programs.id, studentRecords.programId))
    .where(where)
    .orderBy(asc(users.name))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  // Student members with no record at all (the largest data gap).
  const [{ missing }] = await db
    .select({ missing: sql<number>`count(*)::int` })
    .from(memberships)
    .where(
      and(
        eq(memberships.orgId, orgId),
        eq(memberships.status, 'active'),
        sql`'student' = any(${memberships.roles})`,
        sql`not exists (select 1 from student_records r where r.org_id = ${orgId} and r.user_id = ${memberships.userId})`,
      ),
    );
  return c.json({
    items: rows.map(({ r, ...rest }) => ({ ...r, ...rest, openCorrections: Number(rest.openCorrections), gaps: recordGaps(r) })),
    total: Number(total),
    page: q.page,
    pageSize: q.pageSize,
    studentsWithoutRecord: Number(missing),
    fieldLabels: RECORD_FIELD_LABELS,
  });
});

/** Student members of the org who have no academic record yet. */
studentRoutes.get('/students/missing', async (c) => {
  const { orgId } = requireCampus(c);
  const rows = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.orgId, orgId),
        eq(memberships.status, 'active'),
        sql`'student' = any(${memberships.roles})`,
        sql`not exists (select 1 from student_records r where r.org_id = ${orgId} and r.user_id = ${memberships.userId})`,
      ),
    )
    .orderBy(asc(users.name))
    .limit(500);
  return c.json({ items: rows });
});

studentRoutes.get('/students/:id', async (c) => {
  const r = await loadRecord(c, idParam(c));
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, r.userId));
  const [program] = r.programId ? await db.select().from(programs).where(eq(programs.id, r.programId)) : [];
  const [department] = r.departmentId ? await db.select().from(departments).where(eq(departments.id, r.departmentId)) : [];
  const corrections = await db.select().from(recordCorrections).where(eq(recordCorrections.recordId, r.id)).orderBy(desc(recordCorrections.createdAt));
  const history = await db
    .select({ candidateId: driveCandidates.id, driveId: placementDrives.id, driveTitle: placementDrives.title, companyName: placementDrives.companyName, stage: driveCandidates.stage, offerCtcText: driveCandidates.offerCtcText, updatedAt: driveCandidates.updatedAt, driveStatus: placementDrives.status })
    .from(driveCandidates)
    .innerJoin(placementDrives, eq(placementDrives.id, driveCandidates.driveId))
    .where(and(eq(placementDrives.orgId, r.orgId), eq(driveCandidates.userId, r.userId)))
    .orderBy(desc(driveCandidates.updatedAt));
  const events = history.length
    ? await db.select().from(driveStageEvents).where(inArray(driveStageEvents.candidateId, history.map((h) => h.candidateId))).orderBy(asc(driveStageEvents.createdAt))
    : [];
  // Skill DNA readiness: skills with any evidence, labelled by evidence strength.
  const dna = await computeSkillDna(r.userId);
  const skills = dna
    .filter((s) => s.evidenceCount > 0)
    .map((s) => ({ slug: s.slug, name: s.name, category: s.category, state: s.state, verified: s.verified, evidenceCount: s.evidenceCount, mastery: s.mastery, lastEvidenceAt: s.lastEvidenceAt, sources: Object.keys(s.bySource) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return c.json({
    record: { ...r, gaps: recordGaps(r) },
    student: u,
    program: program ?? null,
    department: department ?? null,
    corrections,
    placementHistory: history.map((h) => ({ ...h, events: events.filter((e) => e.candidateId === h.candidateId).map((e) => ({ fromStage: e.fromStage, toStage: e.toStage, note: e.note, actorKind: e.actorKind, createdAt: e.createdAt })) })),
    skills,
    fieldLabels: RECORD_FIELD_LABELS,
  });
});

// ---------- Create & edit ----------

const recordFields = z.object({
  rollNumber: z.string().trim().min(1, 'Enter a roll number.').max(40),
  programId: z.string().uuid().nullable().optional(),
  graduationYear: z.number().int().min(1990).max(2100).nullable().optional(),
  cgpa: z.number().min(0).max(10).nullable().optional(),
  activeBacklogs: z.number().int().min(0).max(100).nullable().optional(),
  attendancePercent: z.number().min(0).max(100).nullable().optional(),
  status: z.enum(RECORD_STATUSES).optional(),
  placementOptIn: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

async function assertRollFree(orgId: string, rollNumber: string, exceptId?: string) {
  const [dup] = await db.select({ id: studentRecords.id }).from(studentRecords).where(and(eq(studentRecords.orgId, orgId), sql`lower(${studentRecords.rollNumber}) = lower(${rollNumber})`));
  if (dup && dup.id !== exceptId) throw conflict('Another student already has this roll number.', { fields: { rollNumber: 'Roll numbers must be unique.' } });
}

studentRoutes.post('/students', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = requireCampus(c);
  const input = await body(c, recordFields.extend({ userId: z.string().uuid(), verify: z.boolean().optional() }));
  const [m] = await db.select().from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, input.userId), eq(memberships.status, 'active')));
  // Records are only created for existing student members; never for unknown people.
  if (!m || !m.roles.includes('student')) throw badRequest('That person is not a student member of this institution. Invite them from People & roles first.', { fields: { userId: 'Not a student member.' } });
  const [existing] = await db.select({ id: studentRecords.id }).from(studentRecords).where(and(eq(studentRecords.orgId, orgId), eq(studentRecords.userId, input.userId)));
  if (existing) throw conflict('This student already has a record.', { recordId: existing.id });
  await assertRollFree(orgId, input.rollNumber);
  const program = await programInOrg(orgId, input.programId);
  const settings = await getCampusSettings(orgId);
  const [row] = await db
    .insert(studentRecords)
    .values({
      orgId,
      userId: input.userId,
      rollNumber: input.rollNumber,
      programId: program?.id ?? null,
      departmentId: program?.departmentId ?? null,
      graduationYear: input.graduationYear ?? null,
      cgpa: input.cgpa ?? null,
      activeBacklogs: input.activeBacklogs ?? null,
      attendancePercent: input.attendancePercent ?? null,
      status: input.status ?? 'enrolled',
      placementOptIn: input.placementOptIn ?? settings.placementOptInDefault,
      notes: input.notes ?? null,
      verifiedAt: input.verify ? new Date() : null,
      verifiedBy: input.verify ? auth.user.id : null,
    })
    .returning();
  await audit(c, { action: 'campus.record_created', orgId, targetType: 'student_record', targetId: row.id, meta: { userId: row.userId, verified: !!input.verify } });
  return c.json({ record: row }, 201);
});

function changedAcademicFields(cur: RecordRow, next: Partial<RecordRow>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of ACADEMIC_FIELDS) {
    if (next[f] !== undefined && next[f] !== cur[f]) changes[f] = { from: cur[f], to: next[f] };
  }
  return changes;
}

studentRoutes.patch('/students/:id', async (c) => {
  const auth = requireAuth(c);
  const cur = await loadRecord(c, idParam(c));
  const input = await body(c, patchSchema(recordFields).extend({ verify: z.boolean().optional() }));
  if (input.rollNumber) await assertRollFree(cur.orgId, input.rollNumber, cur.id);
  const program = input.programId !== undefined ? await programInOrg(cur.orgId, input.programId) : undefined;
  const { verify, ...fields } = input;
  const next: Partial<RecordRow> = { ...fields, ...(program !== undefined ? { programId: program?.id ?? null, departmentId: program?.departmentId ?? null } : {}) };
  const changes = changedAcademicFields(cur, next);
  // Changing verified academic data needs re-verification unless the editor verifies it now.
  const verification =
    verify === true ? { verifiedAt: new Date(), verifiedBy: auth.user.id } : verify === false || (Object.keys(changes).length && cur.verifiedAt) ? { verifiedAt: null, verifiedBy: null } : {};
  const [row] = await db
    .update(studentRecords)
    .set({ ...next, ...verification, updatedAt: new Date() })
    .where(eq(studentRecords.id, cur.id))
    .returning();
  await audit(c, { action: 'campus.record_updated', orgId: cur.orgId, targetType: 'student_record', targetId: cur.id, meta: { changes, verify: verify ?? null, verificationCleared: 'verifiedAt' in verification && verification.verifiedAt === null && !!cur.verifiedAt } });
  return c.json({ record: { ...row, gaps: recordGaps(row) } });
});

studentRoutes.post('/students/:id/verify', async (c) => {
  const auth = requireAuth(c);
  const cur = await loadRecord(c, idParam(c));
  const [row] = await db.update(studentRecords).set({ verifiedAt: new Date(), verifiedBy: auth.user.id, updatedAt: new Date() }).where(eq(studentRecords.id, cur.id)).returning();
  await audit(c, { action: 'campus.record_verified', orgId: cur.orgId, targetType: 'student_record', targetId: cur.id, meta: { userId: cur.userId, gaps: recordGaps(cur) } });
  return c.json({ record: row });
});

studentRoutes.post('/students/verify', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = requireCampus(c);
  const { recordIds } = await body(c, z.object({ recordIds: z.array(z.string().uuid()).min(1).max(500) }));
  const rows = await db
    .update(studentRecords)
    .set({ verifiedAt: new Date(), verifiedBy: auth.user.id, updatedAt: new Date() })
    .where(and(eq(studentRecords.orgId, orgId), inArray(studentRecords.id, recordIds), isNull(studentRecords.verifiedAt)))
    .returning({ id: studentRecords.id });
  await audit(c, { action: 'campus.records_verified', orgId, meta: { count: rows.length, recordIds: rows.map((r) => r.id) } });
  return c.json({ verified: rows.length });
});

// ---------- CSV import (preview, then confirm) ----------

const HEADER_ALIASES: Record<string, string> = {
  email: 'email',
  emailaddress: 'email',
  rollnumber: 'rollNumber',
  rollno: 'rollNumber',
  roll: 'rollNumber',
  programcode: 'programCode',
  program: 'programCode',
  graduationyear: 'graduationYear',
  gradyear: 'graduationYear',
  cgpa: 'cgpa',
  gpa: 'cgpa',
  activebacklogs: 'activeBacklogs',
  backlogs: 'activeBacklogs',
};

type ImportRow = {
  line: number;
  email: string;
  rollNumber: string;
  programCode: string;
  graduationYear: number | null;
  cgpa: number | null;
  activeBacklogs: number | null;
  status: 'create' | 'update' | 'exists' | 'duplicate' | 'not_member' | 'not_student' | 'invalid';
  messages: string[];
  userId?: string;
  name?: string;
  recordId?: string;
  programId?: string | null;
  departmentId?: string | null;
};

const MAX_IMPORT_ROWS = 2000;

async function analyzeImport(orgId: string, csv: string, updateExisting: boolean) {
  const table = parseCsv(csv);
  if (!table.length) throw badRequest('The file is empty.', { fields: { csv: 'Add a header row and at least one student.' } });
  const header = table[0].map((h) => HEADER_ALIASES[h.toLowerCase().replace(/[^a-z]/g, '')] ?? null);
  for (const required of ['email', 'rollNumber']) {
    if (!header.includes(required)) throw badRequest(`Missing a "${required === 'email' ? 'email' : 'roll number'}" column.`, { fields: { csv: 'Expected columns: email, roll number, program code, graduation year, cgpa, active backlogs.' } });
  }
  const body = table.slice(1);
  if (body.length > MAX_IMPORT_ROWS) throw badRequest(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
  const progs = await db.select().from(programs).where(eq(programs.orgId, orgId));
  const progByCode = new Map(progs.map((p) => [p.code.toLowerCase(), p]));
  const emails = [...new Set(body.map((r) => (r[header.indexOf('email')] ?? '').trim().toLowerCase()).filter(Boolean))];
  const people = emails.length
    ? await db
        .select({ userId: users.id, email: users.email, name: users.name, roles: memberships.roles, status: memberships.status })
        .from(users)
        .leftJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.orgId, orgId)))
        .where(inArray(sql`lower(${users.email})`, emails))
    : [];
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p]));
  const records = await db.select({ id: studentRecords.id, userId: studentRecords.userId, rollNumber: studentRecords.rollNumber }).from(studentRecords).where(eq(studentRecords.orgId, orgId));
  const recByUser = new Map(records.map((r) => [r.userId, r]));
  const recByRoll = new Map(records.map((r) => [r.rollNumber.toLowerCase(), r]));
  const seenEmail = new Set<string>();
  const seenRoll = new Set<string>();

  const num = (raw: string, kind: 'int' | 'float', min: number, max: number, label: string, messages: string[]) => {
    const t = raw.trim();
    if (!t) return null; // empty = unknown, never zero
    const n = Number(t);
    if (!Number.isFinite(n) || (kind === 'int' && !Number.isInteger(n)) || n < min || n > max) {
      messages.push(`${label} "${t}" is not valid (${min} to ${max}).`);
      return null;
    }
    return n;
  };

  const rows: ImportRow[] = body.map((cells, i) => {
    const get = (k: string) => (header.indexOf(k) >= 0 ? (cells[header.indexOf(k)] ?? '') : '');
    const messages: string[] = [];
    const email = get('email').trim().toLowerCase();
    const rollNumber = get('rollNumber').trim();
    const programCode = get('programCode').trim();
    const graduationYear = num(get('graduationYear'), 'int', 1990, 2100, 'Graduation year', messages);
    const cgpa = num(get('cgpa'), 'float', 0, 10, 'CGPA', messages);
    const activeBacklogs = num(get('activeBacklogs'), 'int', 0, 100, 'Active backlogs', messages);
    const row: ImportRow = { line: i + 2, email, rollNumber, programCode, graduationYear, cgpa, activeBacklogs, status: 'create', messages };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) messages.push('Missing or invalid email.');
    if (!rollNumber) messages.push('Missing roll number.');
    else if (rollNumber.length > 40) messages.push('Roll number is too long.');
    if (programCode) {
      const p = progByCode.get(programCode.toLowerCase());
      if (!p) messages.push(`Unknown program code "${programCode}".`);
      else {
        row.programId = p.id;
        row.departmentId = p.departmentId;
      }
    }
    if (messages.length) return { ...row, status: 'invalid' };
    if (seenEmail.has(email) || seenRoll.has(rollNumber.toLowerCase())) return { ...row, status: 'duplicate', messages: ['Appears more than once in this file; only the first row is used.'] };
    seenEmail.add(email);
    seenRoll.add(rollNumber.toLowerCase());
    const person = byEmail.get(email);
    if (!person || !person.status) return { ...row, status: 'not_member', messages: ['Not a member of this institution. Invite them first; no account is created by importing.'] };
    if (person.status !== 'active' || !person.roles?.includes('student')) return { ...row, status: 'not_student', userId: person.userId, name: person.name, messages: ['Member, but not an active student.'] };
    row.userId = person.userId;
    row.name = person.name;
    const rollOwner = recByRoll.get(rollNumber.toLowerCase());
    if (rollOwner && rollOwner.userId !== person.userId) return { ...row, status: 'invalid', messages: ['This roll number belongs to another student.'] };
    const existing = recByUser.get(person.userId);
    if (existing) return { ...row, recordId: existing.id, status: updateExisting ? 'update' : 'exists', messages: [updateExisting ? 'Existing record will be updated with the filled-in values (blank cells keep current data).' : 'Already has a record (choose "update existing" to apply changes).'] };
    return row;
  });
  const summary = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
  return { rows, summary, total: rows.length };
}

const importInput = z.object({ csv: z.string().min(1, 'Choose a CSV file.').max(2_000_000, 'The file is too large (2 MB maximum).'), updateExisting: z.boolean().optional() });

studentRoutes.post('/students/import/preview', async (c) => {
  const { orgId } = requireCampus(c);
  const input = await body(c, importInput);
  return c.json(await analyzeImport(orgId, input.csv, !!input.updateExisting));
});

studentRoutes.post('/students/import/confirm', async (c) => {
  const { orgId } = requireCampus(c);
  const input = await body(c, importInput);
  const { rows, summary } = await analyzeImport(orgId, input.csv, !!input.updateExisting);
  const settings = await getCampusSettings(orgId);
  let created = 0;
  let updated = 0;
  for (const r of rows) {
    if (r.status === 'create' && r.userId) {
      await db.insert(studentRecords).values({
        orgId,
        userId: r.userId,
        rollNumber: r.rollNumber,
        programId: r.programId ?? null,
        departmentId: r.departmentId ?? null,
        graduationYear: r.graduationYear,
        cgpa: r.cgpa,
        activeBacklogs: r.activeBacklogs,
        placementOptIn: settings.placementOptInDefault,
      });
      created++;
    } else if (r.status === 'update' && r.recordId) {
      const set: Partial<RecordRow> = { rollNumber: r.rollNumber };
      if (r.programId) Object.assign(set, { programId: r.programId, departmentId: r.departmentId ?? null });
      if (r.graduationYear !== null) set.graduationYear = r.graduationYear;
      if (r.cgpa !== null) set.cgpa = r.cgpa;
      if (r.activeBacklogs !== null) set.activeBacklogs = r.activeBacklogs;
      // Imported values are unverified until someone verifies them.
      await db.update(studentRecords).set({ ...set, verifiedAt: null, verifiedBy: null, updatedAt: new Date() }).where(eq(studentRecords.id, r.recordId));
      updated++;
    }
  }
  await audit(c, { action: 'campus.records_imported', orgId, targetType: 'student_record', meta: { created, updated, summary } });
  return c.json({ created, updated, summary, rows: rows.filter((r) => r.status !== 'create' && r.status !== 'update') });
});

// ---------- Corrections (staff review) ----------

export const CORRECTION_FIELDS = ['rollNumber', 'program', 'graduationYear', 'cgpa', 'activeBacklogs', 'attendancePercent'] as const;
export const CORRECTION_LABELS: Record<(typeof CORRECTION_FIELDS)[number], string> = {
  rollNumber: 'Roll number',
  program: 'Program',
  graduationYear: 'Graduation year',
  cgpa: 'CGPA',
  activeBacklogs: 'Active backlogs',
  attendancePercent: 'Attendance',
};

/** Parses a proposed text value into a record update (throws a field error when it cannot). */
export async function parseCorrectionValue(orgId: string, field: string, raw: string): Promise<Partial<RecordRow>> {
  const t = raw.trim();
  const bad = (msg: string) => badRequest(msg, { fields: { value: msg } });
  switch (field) {
    case 'rollNumber':
      if (!t || t.length > 40) throw bad('Enter a roll number up to 40 characters.');
      await assertRollFree(orgId, t);
      return { rollNumber: t };
    case 'program': {
      const [p] = await db.select().from(programs).where(and(eq(programs.orgId, orgId), sql`(lower(${programs.code}) = lower(${t}) or lower(${programs.name}) = lower(${t}) or ${programs.id}::text = ${t})`));
      if (!p) throw bad(`No program matches "${t}". Enter a program code from Structure.`);
      return { programId: p.id, departmentId: p.departmentId };
    }
    case 'graduationYear': {
      const n = Number(t);
      if (!Number.isInteger(n) || n < 1990 || n > 2100) throw bad('Enter a year between 1990 and 2100.');
      return { graduationYear: n };
    }
    case 'cgpa': {
      const n = Number(t);
      if (!t || !Number.isFinite(n) || n < 0 || n > 10) throw bad('Enter a CGPA between 0 and 10.');
      return { cgpa: n };
    }
    case 'activeBacklogs': {
      const n = Number(t);
      if (!t || !Number.isInteger(n) || n < 0 || n > 100) throw bad('Enter a whole number of backlogs.');
      return { activeBacklogs: n };
    }
    case 'attendancePercent': {
      const n = Number(t.replace(/%$/, ''));
      if (!t || !Number.isFinite(n) || n < 0 || n > 100) throw bad('Enter a percentage between 0 and 100.');
      return { attendancePercent: n };
    }
    default:
      throw bad('This field cannot be corrected here.');
  }
}

studentRoutes.get('/corrections', async (c) => {
  const { orgId } = requireCampus(c);
  const { status } = query(c, z.object({ status: z.enum(['open', 'approved', 'rejected', 'all']).default('open') }));
  const rows = await db
    .select({ x: recordCorrections, name: users.name, email: users.email, rollNumber: studentRecords.rollNumber })
    .from(recordCorrections)
    .innerJoin(studentRecords, eq(studentRecords.id, recordCorrections.recordId))
    .innerJoin(users, eq(users.id, studentRecords.userId))
    .where(and(eq(recordCorrections.orgId, orgId), status === 'all' ? undefined : eq(recordCorrections.status, status)))
    .orderBy(desc(recordCorrections.createdAt))
    .limit(200);
  return c.json({ items: rows.map((r) => ({ ...r.x, fieldLabel: CORRECTION_LABELS[r.x.field as keyof typeof CORRECTION_LABELS] ?? r.x.field, student: { name: r.name, email: r.email, rollNumber: r.rollNumber } })), total: rows.length });
});

async function loadCorrection(c: Parameters<typeof requireAuth>[0], id: string) {
  const [x] = await db.select().from(recordCorrections).where(eq(recordCorrections.id, id));
  if (!x) throw notFound('Correction request');
  assertCampusAccess(c, x.orgId, 'Correction request');
  if (x.status !== 'open') throw conflict('This request was already reviewed.');
  return x;
}

studentRoutes.post('/corrections/:id/approve', async (c) => {
  const auth = requireAuth(c);
  const x = await loadCorrection(c, idParam(c));
  const input = await body(c, z.object({ value: z.string().trim().max(200).optional(), note: z.string().trim().max(1000).optional() }));
  const [rec] = await db.select().from(studentRecords).where(eq(studentRecords.id, x.recordId));
  if (!rec) throw notFound('Student record');
  const value = input.value ?? x.proposedValue;
  const update = await parseCorrectionValue(x.orgId, x.field, value);
  if (update.rollNumber) await assertRollFree(x.orgId, update.rollNumber, rec.id);
  // A reviewed correction is an authorized change, so verification status is kept.
  await db.update(studentRecords).set({ ...update, updatedAt: new Date() }).where(eq(studentRecords.id, rec.id));
  const [row] = await db
    .update(recordCorrections)
    .set({ status: 'approved', reviewedBy: auth.user.id, reviewNote: input.note ?? (input.value && input.value !== x.proposedValue ? `Applied value: ${input.value}` : null), reviewedAt: new Date() })
    .where(eq(recordCorrections.id, x.id))
    .returning();
  await audit(c, { action: 'campus.correction_approved', orgId: x.orgId, targetType: 'student_record', targetId: rec.id, meta: { correctionId: x.id, field: x.field, from: x.currentValue, to: value } });
  await notify(x.requestedBy, {
    type: 'campus.correction_reviewed',
    category: 'organization',
    orgId: x.orgId,
    title: `Your ${CORRECTION_LABELS[x.field as keyof typeof CORRECTION_LABELS] ?? x.field} correction was approved`,
    body: input.note ?? `Your record now shows ${value}.`,
    link: '/app/placements/record',
  });
  return c.json({ correction: row });
});

studentRoutes.post('/corrections/:id/reject', async (c) => {
  const auth = requireAuth(c);
  const x = await loadCorrection(c, idParam(c));
  const input = await body(c, z.object({ note: z.string().trim().min(5, 'Explain why, so the student knows what to do next.').max(1000) }));
  const [row] = await db.update(recordCorrections).set({ status: 'rejected', reviewedBy: auth.user.id, reviewNote: input.note, reviewedAt: new Date() }).where(eq(recordCorrections.id, x.id)).returning();
  await audit(c, { action: 'campus.correction_rejected', orgId: x.orgId, targetType: 'student_record', targetId: x.recordId, meta: { correctionId: x.id, field: x.field } });
  await notify(x.requestedBy, {
    type: 'campus.correction_reviewed',
    category: 'organization',
    orgId: x.orgId,
    title: `Your ${CORRECTION_LABELS[x.field as keyof typeof CORRECTION_LABELS] ?? x.field} correction was not approved`,
    body: input.note,
    link: '/app/placements/record',
  });
  return c.json({ correction: row });
});
