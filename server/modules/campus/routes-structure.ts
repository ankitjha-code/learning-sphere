import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  academicTerms,
  cohorts,
  cohortMembers,
  courses,
  departments,
  employerRelationships,
  organizations,
  programs,
  skills,
  studentRecords,
} from '../../db/schema';
import type { AppEnv } from '../../lib/context';
import { body, idParam, query, patchSchema } from '../../lib/validate';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { getOrgPolicies, ORG_POLICY_DESCRIPTIONS } from '../admin/settings';
import { assertCompanyOrg, CAMPUS_SETTINGS_DEFAULTS, readCampusSettings, requireCampus, unknownSkillSlugs } from './service';
import { eligibilityInput } from './schemas';
import { ref } from '../../lib/sql';

/** Institution structure, campus settings and employer relationships. */
export const structureRoutes = new Hono<AppEnv>();

const code = z
  .string()
  .trim()
  .min(1, 'Enter a code.')
  .max(20)
  .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, dots, dashes or underscores.');
const name = z.string().trim().min(2, 'Use at least 2 characters.').max(160);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-07-01.');
const year = z.number().int().min(1990).max(2100);

// ---------- Overview of structure ----------

structureRoutes.get('/structure', async (c) => {
  const { orgId } = requireCampus(c);
  const [deps, progs, terms, batches] = await Promise.all([
    db
      .select({
        id: departments.id,
        name: departments.name,
        code: departments.code,
        headUserId: departments.headUserId,
        programs: sql<number>`(select count(*)::int from programs p where p.department_id = ${ref(departments.id)})`,
        students: sql<number>`(select count(*)::int from student_records r where r.department_id = ${ref(departments.id)})`,
      })
      .from(departments)
      .where(eq(departments.orgId, orgId))
      .orderBy(asc(departments.name)),
    db
      .select({
        id: programs.id,
        name: programs.name,
        code: programs.code,
        departmentId: programs.departmentId,
        durationYears: programs.durationYears,
        students: sql<number>`(select count(*)::int from student_records r where r.program_id = ${ref(programs.id)})`,
      })
      .from(programs)
      .where(eq(programs.orgId, orgId))
      .orderBy(asc(programs.name)),
    db.select().from(academicTerms).where(eq(academicTerms.orgId, orgId)).orderBy(desc(academicTerms.startsOn)),
    db
      .select({
        id: cohorts.id,
        name: cohorts.name,
        programId: cohorts.programId,
        termId: cohorts.termId,
        graduationYear: cohorts.graduationYear,
        members: sql<number>`(select count(*)::int from cohort_members m where m.cohort_id = ${ref(cohorts.id)} and m.role = 'student')`,
      })
      .from(cohorts)
      .where(and(eq(cohorts.orgId, orgId), eq(cohorts.kind, 'batch')))
      .orderBy(desc(cohorts.graduationYear), asc(cohorts.name)),
  ]);
  return c.json({
    departments: deps.map((d) => ({ ...d, programs: Number(d.programs), students: Number(d.students) })),
    programs: progs.map((p) => ({ ...p, students: Number(p.students) })),
    terms,
    batches: batches.map((b) => ({ ...b, members: Number(b.members) })),
  });
});

// ---------- Departments ----------

const departmentInput = z.object({ name, code, headUserId: z.string().uuid().nullable().optional() });

async function assertUniqueCode(table: typeof departments | typeof programs, orgId: string, value: string, exceptId?: string) {
  const [dup] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.orgId, orgId), sql`lower(${table.code}) = lower(${value})`, exceptId ? ne(table.id, exceptId) : undefined));
  if (dup) throw badRequest('That code is already used.', { fields: { code: 'Choose a unique code.' } });
}

structureRoutes.post('/departments', async (c) => {
  const { orgId } = requireCampus(c);
  const input = await body(c, departmentInput);
  await assertUniqueCode(departments, orgId, input.code);
  const [row] = await db.insert(departments).values({ orgId, name: input.name, code: input.code, headUserId: input.headUserId ?? null }).returning();
  await audit(c, { action: 'campus.department_created', orgId, targetType: 'department', targetId: row.id, meta: { code: row.code } });
  return c.json({ department: row }, 201);
});

structureRoutes.patch('/departments/:id', async (c) => {
  const { orgId } = requireCampus(c);
  const id = idParam(c);
  const input = await body(c, patchSchema(departmentInput));
  const [cur] = await db.select().from(departments).where(and(eq(departments.id, id), eq(departments.orgId, orgId)));
  if (!cur) throw notFound('Department');
  if (input.code) await assertUniqueCode(departments, orgId, input.code, id);
  const [row] = await db.update(departments).set(input).where(eq(departments.id, id)).returning();
  await audit(c, { action: 'campus.department_updated', orgId, targetType: 'department', targetId: id, meta: input });
  return c.json({ department: row });
});

structureRoutes.delete('/departments/:id', async (c) => {
  const { orgId } = requireCampus(c);
  const id = idParam(c);
  const [cur] = await db.select().from(departments).where(and(eq(departments.id, id), eq(departments.orgId, orgId)));
  if (!cur) throw notFound('Department');
  const [{ n: progCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(programs).where(eq(programs.departmentId, id));
  const [{ n: recCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(studentRecords).where(eq(studentRecords.departmentId, id));
  if (Number(progCount) || Number(recCount)) throw conflict(`This department still has ${progCount} programs and ${recCount} student records. Move them first.`);
  await db.delete(departments).where(eq(departments.id, id));
  await audit(c, { action: 'campus.department_deleted', orgId, targetType: 'department', targetId: id, meta: { code: cur.code } });
  return c.json({ ok: true });
});

// ---------- Programs ----------

const programInput = z.object({ name, code, departmentId: z.string().uuid().nullable().optional(), durationYears: z.number().int().min(1).max(8).optional() });

async function assertDepartment(orgId: string, departmentId: string | null | undefined) {
  if (!departmentId) return;
  const [d] = await db.select({ id: departments.id }).from(departments).where(and(eq(departments.id, departmentId), eq(departments.orgId, orgId)));
  if (!d) throw badRequest('Choose a department from this institution.', { fields: { departmentId: 'Unknown department.' } });
}

structureRoutes.post('/programs', async (c) => {
  const { orgId } = requireCampus(c);
  const input = await body(c, programInput);
  await assertDepartment(orgId, input.departmentId);
  await assertUniqueCode(programs, orgId, input.code);
  const [row] = await db.insert(programs).values({ orgId, name: input.name, code: input.code, departmentId: input.departmentId ?? null, durationYears: input.durationYears ?? 4 }).returning();
  await audit(c, { action: 'campus.program_created', orgId, targetType: 'program', targetId: row.id, meta: { code: row.code } });
  return c.json({ program: row }, 201);
});

structureRoutes.patch('/programs/:id', async (c) => {
  const { orgId } = requireCampus(c);
  const id = idParam(c);
  const input = await body(c, patchSchema(programInput));
  const [cur] = await db.select().from(programs).where(and(eq(programs.id, id), eq(programs.orgId, orgId)));
  if (!cur) throw notFound('Program');
  await assertDepartment(orgId, input.departmentId);
  if (input.code) await assertUniqueCode(programs, orgId, input.code, id);
  const [row] = await db.update(programs).set(input).where(eq(programs.id, id)).returning();
  // Records follow their program's department.
  if (input.departmentId !== undefined) await db.update(studentRecords).set({ departmentId: input.departmentId }).where(and(eq(studentRecords.orgId, orgId), eq(studentRecords.programId, id)));
  await audit(c, { action: 'campus.program_updated', orgId, targetType: 'program', targetId: id, meta: input });
  return c.json({ program: row });
});

structureRoutes.delete('/programs/:id', async (c) => {
  const { orgId } = requireCampus(c);
  const id = idParam(c);
  const [cur] = await db.select().from(programs).where(and(eq(programs.id, id), eq(programs.orgId, orgId)));
  if (!cur) throw notFound('Program');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(studentRecords).where(eq(studentRecords.programId, id));
  if (Number(n)) throw conflict(`${n} student records use this program. Change them first.`);
  await db.delete(programs).where(eq(programs.id, id));
  await audit(c, { action: 'campus.program_deleted', orgId, targetType: 'program', targetId: id, meta: { code: cur.code } });
  return c.json({ ok: true });
});

// ---------- Academic terms ----------

const termInput = z
  .object({ name, startsOn: dateOnly, endsOn: dateOnly, isCurrent: z.boolean().optional() })
  .refine((v) => v.endsOn > v.startsOn, { message: 'The end date must be after the start date.', path: ['endsOn'] });

async function makeOnlyCurrent(orgId: string, termId: string) {
  await db.update(academicTerms).set({ isCurrent: false }).where(and(eq(academicTerms.orgId, orgId), ne(academicTerms.id, termId)));
  await db.update(academicTerms).set({ isCurrent: true }).where(eq(academicTerms.id, termId));
}

structureRoutes.post('/terms', async (c) => {
  const { orgId } = requireCampus(c);
  const input = await body(c, termInput);
  const [row] = await db.insert(academicTerms).values({ orgId, name: input.name, startsOn: input.startsOn, endsOn: input.endsOn, isCurrent: false }).returning();
  if (input.isCurrent) await makeOnlyCurrent(orgId, row.id);
  await audit(c, { action: 'campus.term_created', orgId, targetType: 'term', targetId: row.id });
  return c.json({ term: { ...row, isCurrent: !!input.isCurrent } }, 201);
});

structureRoutes.patch('/terms/:id', async (c) => {
  const { orgId } = requireCampus(c);
  const id = idParam(c);
  const input = await body(c, z.object({ name: name.optional(), startsOn: dateOnly.optional(), endsOn: dateOnly.optional(), isCurrent: z.boolean().optional() }));
  const [cur] = await db.select().from(academicTerms).where(and(eq(academicTerms.id, id), eq(academicTerms.orgId, orgId)));
  if (!cur) throw notFound('Term');
  const startsOn = input.startsOn ?? cur.startsOn;
  const endsOn = input.endsOn ?? cur.endsOn;
  if (endsOn <= startsOn) throw badRequest('Please check the highlighted fields.', { fields: { endsOn: 'The end date must be after the start date.' } });
  const { isCurrent, ...rest } = input;
  await db.update(academicTerms).set(rest).where(eq(academicTerms.id, id));
  if (isCurrent === true) await makeOnlyCurrent(orgId, id);
  if (isCurrent === false) await db.update(academicTerms).set({ isCurrent: false }).where(eq(academicTerms.id, id));
  const [row] = await db.select().from(academicTerms).where(eq(academicTerms.id, id));
  await audit(c, { action: 'campus.term_updated', orgId, targetType: 'term', targetId: id, meta: input });
  return c.json({ term: row });
});

structureRoutes.delete('/terms/:id', async (c) => {
  const { orgId } = requireCampus(c);
  const id = idParam(c);
  const [cur] = await db.select().from(academicTerms).where(and(eq(academicTerms.id, id), eq(academicTerms.orgId, orgId)));
  if (!cur) throw notFound('Term');
  const [{ n: co }] = await db.select({ n: sql<number>`count(*)::int` }).from(cohorts).where(eq(cohorts.termId, id));
  const [{ n: cs }] = await db.select({ n: sql<number>`count(*)::int` }).from(courses).where(eq(courses.termId, id));
  if (Number(co) || Number(cs)) throw conflict(`This term is used by ${co} cohorts and ${cs} courses.`);
  await db.delete(academicTerms).where(eq(academicTerms.id, id));
  await audit(c, { action: 'campus.term_deleted', orgId, targetType: 'term', targetId: id });
  return c.json({ ok: true });
});

// ---------- Batches (cohorts of kind 'batch'; membership is managed in Teach) ----------

const batchInput = z.object({ name, programId: z.string().uuid().nullable().optional(), termId: z.string().uuid().nullable().optional(), graduationYear: year });

async function assertProgramTerm(orgId: string, programId?: string | null, termId?: string | null) {
  if (programId) {
    const [p] = await db.select({ id: programs.id }).from(programs).where(and(eq(programs.id, programId), eq(programs.orgId, orgId)));
    if (!p) throw badRequest('Choose a program from this institution.', { fields: { programId: 'Unknown program.' } });
  }
  if (termId) {
    const [t] = await db.select({ id: academicTerms.id }).from(academicTerms).where(and(eq(academicTerms.id, termId), eq(academicTerms.orgId, orgId)));
    if (!t) throw badRequest('Choose a term from this institution.', { fields: { termId: 'Unknown term.' } });
  }
}

structureRoutes.post('/batches', async (c) => {
  const { orgId } = requireCampus(c);
  const input = await body(c, batchInput);
  await assertProgramTerm(orgId, input.programId, input.termId);
  const [row] = await db
    .insert(cohorts)
    .values({ orgId, name: input.name, kind: 'batch', programId: input.programId ?? null, termId: input.termId ?? null, graduationYear: input.graduationYear })
    .returning();
  await audit(c, { action: 'campus.batch_created', orgId, targetType: 'cohort', targetId: row.id });
  return c.json({ batch: row }, 201);
});

structureRoutes.patch('/batches/:id', async (c) => {
  const { orgId } = requireCampus(c);
  const id = idParam(c);
  const input = await body(c, patchSchema(batchInput));
  const [cur] = await db.select().from(cohorts).where(and(eq(cohorts.id, id), eq(cohorts.orgId, orgId), eq(cohorts.kind, 'batch')));
  if (!cur) throw notFound('Batch');
  await assertProgramTerm(orgId, input.programId, input.termId);
  const [row] = await db.update(cohorts).set(input).where(eq(cohorts.id, id)).returning();
  await audit(c, { action: 'campus.batch_updated', orgId, targetType: 'cohort', targetId: id, meta: input });
  return c.json({ batch: row });
});

structureRoutes.delete('/batches/:id', async (c) => {
  const { orgId } = requireCampus(c);
  const id = idParam(c);
  const [cur] = await db.select().from(cohorts).where(and(eq(cohorts.id, id), eq(cohorts.orgId, orgId), eq(cohorts.kind, 'batch')));
  if (!cur) throw notFound('Batch');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(cohortMembers).where(eq(cohortMembers.cohortId, id));
  if (Number(n)) throw conflict(`This batch has ${n} members. Remove them in Teach first.`);
  await db.delete(cohorts).where(eq(cohorts.id, id));
  await audit(c, { action: 'campus.batch_deleted', orgId, targetType: 'cohort', targetId: id });
  return c.json({ ok: true });
});

/** Skill catalog for eligibility rule builders (slug, name, category). */
structureRoutes.get('/skills', async (c) => {
  requireCampus(c);
  const rows = await db.select({ slug: skills.slug, name: skills.name, category: skills.category }).from(skills).orderBy(asc(skills.category), asc(skills.name));
  return c.json({ items: rows });
});

// ---------- Campus settings & policies ----------

structureRoutes.get('/settings', async (c) => {
  const { orgId, roles } = requireCampus(c);
  const [o] = await db.select({ settings: organizations.settings, branding: organizations.branding, name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
  return c.json({
    settings: readCampusSettings(o?.settings),
    defaults: CAMPUS_SETTINGS_DEFAULTS,
    policies: await getOrgPolicies(orgId),
    policyDescriptions: ORG_POLICY_DESCRIPTIONS,
    branding: o?.branding ?? {},
    canEditBranding: roles.includes('org_admin'),
  });
});

structureRoutes.put('/settings', async (c) => {
  const { orgId } = requireCampus(c);
  const input = await body(c, z.object({ placementOptInDefault: z.boolean(), eligibilityDefaults: eligibilityInput }));
  const missing = await unknownSkillSlugs(input.eligibilityDefaults.requiredSkillSlugs ?? []);
  if (missing.length) throw badRequest(`Unknown skills: ${missing.join(', ')}.`, { fields: { 'eligibilityDefaults.requiredSkillSlugs': 'Choose skills from the Skill DNA catalog.' } });
  const [o] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId));
  const next = { ...(o?.settings ?? {}), campus: input };
  await db.update(organizations).set({ settings: next, updatedAt: new Date() }).where(eq(organizations.id, orgId));
  await audit(c, { action: 'campus.settings_updated', orgId, targetType: 'organization', targetId: orgId, meta: input });
  return c.json({ settings: readCampusSettings(next) });
});

// ---------- Employer relationships ----------

const employerInput = z.object({
  companyName: z.string().trim().min(2).max(160),
  companyOrgId: z.string().uuid().nullable().optional(),
  contactName: z.string().trim().max(120).nullable().optional(),
  contactEmail: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254).nullable().optional().or(z.literal('').transform(() => null)),
  status: z.enum(['prospect', 'active', 'paused']).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

structureRoutes.get('/employers', async (c) => {
  const { orgId } = requireCampus(c);
  const q = query(c, z.object({ q: z.string().trim().max(100).optional(), status: z.enum(['prospect', 'active', 'paused']).optional() }));
  const rows = await db
    .select({
      e: employerRelationships,
      drives: sql<number>`(select count(*)::int from placement_drives d where d.org_id = ${orgId} and lower(d.company_name) = lower(${ref(employerRelationships.companyName)}))`,
    })
    .from(employerRelationships)
    .where(and(eq(employerRelationships.orgId, orgId), q.status ? eq(employerRelationships.status, q.status) : undefined, q.q ? sql`${employerRelationships.companyName} ilike ${'%' + q.q.replace(/[%_\\]/g, '\\$&') + '%'}` : undefined))
    .orderBy(asc(employerRelationships.companyName));
  return c.json({ items: rows.map((r) => ({ ...r.e, drives: Number(r.drives) })), total: rows.length });
});

/** Company organizations on the platform, searched by name (for linking a relationship or a drive). */
structureRoutes.get('/companies', async (c) => {
  requireCampus(c);
  const { q } = query(c, z.object({ q: z.string().trim().min(1).max(100) }));
  const rows = await db
    .select({ id: organizations.id, name: organizations.name, website: organizations.website })
    .from(organizations)
    .where(and(eq(organizations.kind, 'company'), eq(organizations.status, 'active'), sql`${organizations.name} ilike ${'%' + q.replace(/[%_\\]/g, '\\$&') + '%'}`))
    .orderBy(asc(organizations.name))
    .limit(20);
  return c.json({ items: rows });
});

structureRoutes.post('/employers', async (c) => {
  const { orgId } = requireCampus(c);
  const input = await body(c, employerInput);
  await assertCompanyOrg(input.companyOrgId);
  const [row] = await db
    .insert(employerRelationships)
    .values({ orgId, companyName: input.companyName, companyOrgId: input.companyOrgId ?? null, contactName: input.contactName ?? null, contactEmail: input.contactEmail ?? null, status: input.status ?? 'active', notes: input.notes ?? null })
    .returning();
  await audit(c, { action: 'campus.employer_created', orgId, targetType: 'employer_relationship', targetId: row.id });
  return c.json({ employer: row }, 201);
});

structureRoutes.patch('/employers/:id', async (c) => {
  const { orgId } = requireCampus(c);
  const id = idParam(c);
  const input = await body(c, patchSchema(employerInput));
  const [cur] = await db.select().from(employerRelationships).where(and(eq(employerRelationships.id, id), eq(employerRelationships.orgId, orgId)));
  if (!cur) throw notFound('Employer');
  await assertCompanyOrg(input.companyOrgId);
  const [row] = await db.update(employerRelationships).set(input).where(eq(employerRelationships.id, id)).returning();
  await audit(c, { action: 'campus.employer_updated', orgId, targetType: 'employer_relationship', targetId: id, meta: { status: input.status } });
  return c.json({ employer: row });
});

/** Drives reference companies by name, so deleting a relationship never touches drive history. */
structureRoutes.delete('/employers/:id', async (c) => {
  const { orgId } = requireCampus(c);
  const id = idParam(c);
  const res = await db.delete(employerRelationships).where(and(eq(employerRelationships.id, id), eq(employerRelationships.orgId, orgId))).returning({ id: employerRelationships.id, name: employerRelationships.companyName });
  if (!res.length) throw notFound('Employer');
  await audit(c, { action: 'campus.employer_deleted', orgId, targetType: 'employer_relationship', targetId: id, meta: { companyName: res[0].name } });
  return c.json({ ok: true });
});
