/** Jobs, company profile, skill picker and job-linked assessments. Mounted under /api/hire. */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { assessments, assessmentInvites, hireCompanyProfiles, jobApplications, jobPostings, organizations, skills, DEFAULT_PIPELINE } from '../../db/schema';
import { type AppEnv, requireAuth, rolesIn } from '../../lib/context';
import { body, idParam, query, patchSchema } from '../../lib/validate';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { checkLimit } from '../admin/plans';
import { assertCanManageAssessment, inviteToAssessment, attemptSummaries } from '../assessments/service';
import { computeSkillDna } from '../learning/skilldna';
import { skillFactors } from './matching';
import { ADMIN_ROLES, MANAGE_ROLES, hasAny, hireOrg, loadJob, stageLabel, stagesError, type Job } from './service';

export const jobRoutes = new Hono<AppEnv>();

const escLike = (s: string) => `%${s.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

// ---------- Company profile ----------

const companyInput = z.object({
  about: z.string().trim().max(5000).nullable().optional(),
  values: z.array(z.string().trim().min(1).max(160)).max(12).optional(),
  benefits: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
  locations: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  hiringProcess: z.string().trim().max(3000).nullable().optional(),
});

async function companyView(orgId: string) {
  const [o] = await db
    .select({ id: organizations.id, name: organizations.name, description: organizations.description, website: organizations.website, branding: organizations.branding, isSample: organizations.isSample, kind: organizations.kind })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!o) throw notFound('Company');
  const [p] = await db.select().from(hireCompanyProfiles).where(eq(hireCompanyProfiles.orgId, orgId));
  return {
    org: o,
    profile: { about: p?.about ?? null, values: p?.values ?? [], benefits: p?.benefits ?? [], locations: p?.locations ?? [], hiringProcess: p?.hiringProcess ?? null, updatedAt: p?.updatedAt ?? null },
  };
}

jobRoutes.get('/company', async (c) => {
  const { orgId, roles, isAdmin } = hireOrg(c);
  return c.json({ ...(await companyView(orgId)), roles, canEdit: isAdmin, canEditOrg: roles.includes('org_admin') });
});

jobRoutes.put('/company', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = hireOrg(c, ADMIN_ROLES);
  const input = await body(c, companyInput);
  const values = {
    ...(input.about !== undefined ? { about: input.about } : {}),
    ...(input.values ? { values: input.values } : {}),
    ...(input.benefits ? { benefits: input.benefits } : {}),
    ...(input.locations ? { locations: input.locations } : {}),
    ...(input.hiringProcess !== undefined ? { hiringProcess: input.hiringProcess } : {}),
    updatedBy: auth.user.id,
    updatedAt: new Date(),
  };
  await db.insert(hireCompanyProfiles).values({ orgId, ...values }).onConflictDoUpdate({ target: hireCompanyProfiles.orgId, set: values });
  await audit(c, { action: 'hire.company_profile.updated', orgId, targetType: 'organization', targetId: orgId, meta: { fields: Object.keys(input) } });
  return c.json(await companyView(orgId));
});

/** Public hiring profile of a company (what candidates see next to postings). Any signed-in user. */
jobRoutes.get('/companies/:orgId', async (c) => {
  requireAuth(c);
  const orgId = idParam(c, 'orgId');
  const v = await companyView(orgId);
  if (v.org.kind !== 'company') throw notFound('Company');
  return c.json({ company: { id: v.org.id, name: v.org.name, description: v.org.description, website: v.org.website, isSample: v.org.isSample, ...v.profile } });
});

// ---------- Skill picker ----------

jobRoutes.get('/skills', async (c) => {
  hireOrg(c);
  const q = query(c, z.object({ q: z.string().trim().max(80).optional() }));
  const rows = await db
    .select({ slug: skills.slug, name: skills.name, category: skills.category, level: skills.level })
    .from(skills)
    .where(q.q ? or(ilike(skills.name, escLike(q.q)), ilike(skills.slug, escLike(q.q))) : undefined)
    .orderBy(asc(skills.name))
    .limit(30);
  return c.json({ items: rows });
});

// ---------- Jobs ----------

const skillReq = z.object({
  slug: z.string().trim().min(1).max(80),
  name: z.string().trim().max(120).optional(),
  minLevel: z.number().int().min(1).max(4).nullable().optional(),
  required: z.boolean(),
});
const eligibilityInput = z.object({
  minExperienceYears: z.number().min(0).max(40).optional(),
  graduationYears: z.array(z.number().int().min(1980).max(2100)).max(10).optional(),
  degrees: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
  workAuthorization: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
});
const jobFields = z.object({
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(160),
  team: z.string().trim().max(120).nullable(),
  location: z.string().trim().min(2, 'Add a location (city, region or "Remote").').max(160),
  workplace: z.enum(['onsite', 'hybrid', 'remote']),
  employmentType: z.enum(['full_time', 'internship', 'contract', 'part_time']),
  description: z.string().trim().max(20000),
  responsibilities: z.array(z.string().trim().min(1).max(500)).max(30),
  requiredSkills: z.array(skillReq).max(30),
  eligibility: eligibilityInput,
  salaryText: z.string().trim().max(200).nullable(),
  stages: z.array(z.string().trim()).max(12),
  openings: z.number().int().min(1).max(1000),
  closesAt: z.string().datetime({ offset: true }).nullable(),
  campusOnly: z.boolean(),
});
const createInput = jobFields.partial().required({ title: true, location: true });
const patchInput = patchSchema(jobFields);

async function normalizeSkills(list: z.infer<typeof skillReq>[] | undefined) {
  if (!list) return undefined;
  const slugs = [...new Set(list.map((s) => s.slug))];
  if (slugs.length !== list.length) throw badRequest('Each skill can be listed once.', { fields: { requiredSkills: 'Remove duplicate skills.' } });
  const rows = slugs.length ? await db.select({ slug: skills.slug, name: skills.name }).from(skills).where(inArray(skills.slug, slugs)) : [];
  const names = new Map(rows.map((r) => [r.slug, r.name]));
  const unknown = slugs.filter((s) => !names.has(s));
  if (unknown.length) throw badRequest(`Unknown skill: ${unknown.join(', ')}. Pick skills from the list.`, { fields: { requiredSkills: 'Pick skills from the skill list.' } });
  return list.map((s) => ({ slug: s.slug, name: names.get(s.slug)!, required: s.required, ...(s.minLevel ? { minLevel: s.minLevel } : {}) }));
}

function checkStages(stages: string[] | undefined) {
  if (!stages) return;
  const err = stagesError(stages);
  if (err) throw badRequest(err, { fields: { stages: err } });
}

/** Publish checklist: every item explains why it blocks publishing. */
export async function publishChecklist(job: Job) {
  const limit = await checkLimit('org', job.orgId, 'job_postings.active');
  const items = [
    { key: 'title', label: 'Job title', ok: job.title.trim().length >= 3, reason: 'Add a clear title.' },
    { key: 'location', label: 'Location', ok: job.location.trim().length >= 2, reason: 'Add a location or "Remote".' },
    { key: 'description', label: 'Description of at least 40 characters', ok: job.description.trim().length >= 40, reason: 'Describe the role so candidates can judge fit.' },
    { key: 'skills', label: 'At least one required skill', ok: job.requiredSkills.some((s) => s.required), reason: 'Matching uses only the skills you list. Mark at least one as required.' },
    { key: 'stages', label: 'Valid pipeline stages', ok: !stagesError(job.stages), reason: stagesError(job.stages) ?? '' },
    { key: 'closesAt', label: 'Closing date in the future (if set)', ok: !job.closesAt || job.closesAt.getTime() > Date.now(), reason: 'Move the closing date to the future or clear it.' },
    {
      key: 'plan',
      label: 'Plan allows another active posting',
      ok: job.status === 'published' || limit.allowed,
      reason: limit.explanation,
    },
  ];
  return { ready: items.every((i) => i.ok), items, limit };
}

async function stageCounts(postingIds: string[]) {
  if (!postingIds.length) return new Map<string, Record<string, number>>();
  const rows = await db
    .select({ postingId: jobApplications.postingId, stage: jobApplications.stage, n: sql<number>`count(*)::int` })
    .from(jobApplications)
    .where(inArray(jobApplications.postingId, postingIds))
    .groupBy(jobApplications.postingId, jobApplications.stage);
  const out = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const m = out.get(r.postingId) ?? {};
    m[r.stage] = Number(r.n);
    out.set(r.postingId, m);
  }
  return out;
}

function jobView(j: Job, counts: Record<string, number> = {}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const closed = (counts.rejected ?? 0) + (counts.withdrawn ?? 0) + (counts.hired ?? 0);
  return {
    ...j,
    stageLabels: Object.fromEntries([...j.stages, 'rejected', 'withdrawn'].map((s) => [s, stageLabel(s)])),
    counts,
    applicants: total,
    active: total - closed,
    acceptingApplications: j.status === 'published' && (!j.closesAt || j.closesAt.getTime() > Date.now()),
  };
}

jobRoutes.get('/jobs', async (c) => {
  const { orgId, canManage } = hireOrg(c);
  const q = query(c, z.object({ status: z.enum(['draft', 'published', 'closed', 'archived', 'open']).optional(), q: z.string().trim().max(120).optional() }));
  const rows = await db
    .select()
    .from(jobPostings)
    .where(
      and(
        eq(jobPostings.orgId, orgId),
        q.status === 'open' ? inArray(jobPostings.status, ['draft', 'published', 'closed']) : q.status ? eq(jobPostings.status, q.status) : undefined,
        q.q ? or(ilike(jobPostings.title, escLike(q.q)), ilike(jobPostings.team, escLike(q.q))) : undefined,
      ),
    )
    .orderBy(sql`case ${jobPostings.status} when 'published' then 0 when 'draft' then 1 when 'closed' then 2 else 3 end`, desc(jobPostings.updatedAt))
    .limit(200);
  const counts = await stageCounts(rows.map((r) => r.id));
  return c.json({ items: rows.map((j) => jobView(j, counts.get(j.id))), total: rows.length, canManage });
});

jobRoutes.post('/jobs', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = hireOrg(c, MANAGE_ROLES);
  const input = await body(c, createInput);
  checkStages(input.stages);
  const requiredSkills = (await normalizeSkills(input.requiredSkills)) ?? [];
  const [row] = await db
    .insert(jobPostings)
    .values({
      orgId,
      createdBy: auth.user.id,
      title: input.title,
      team: input.team ?? null,
      location: input.location,
      workplace: input.workplace ?? 'onsite',
      employmentType: input.employmentType ?? 'full_time',
      description: input.description ?? '',
      responsibilities: input.responsibilities ?? [],
      requiredSkills,
      eligibility: input.eligibility ?? {},
      salaryText: input.salaryText ?? null,
      stages: input.stages ?? [...DEFAULT_PIPELINE],
      openings: input.openings ?? 1,
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
      campusOnly: input.campusOnly ?? false,
      status: 'draft',
    })
    .returning();
  await audit(c, { action: 'hire.job.created', orgId, targetType: 'job_posting', targetId: row.id, meta: { title: row.title } });
  return c.json({ job: jobView(row) }, 201);
});

jobRoutes.get('/jobs/:id', async (c) => {
  const auth = requireAuth(c);
  const job = await loadJob(c, idParam(c));
  const canManage = hasAny(rolesIn(auth, job.orgId), MANAGE_ROLES);
  const [counts, checklist, linked] = await Promise.all([stageCounts([job.id]), publishChecklist(job), linkedAssessments(job)]);
  return c.json({ job: jobView(job, counts.get(job.id)), checklist, assessments: linked, canManage });
});

jobRoutes.patch('/jobs/:id', async (c) => {
  const job = await loadJob(c, idParam(c), 'manage');
  if (job.status === 'archived') throw conflict('Archived jobs cannot be edited. Duplicate it to start a new posting.');
  const input = await body(c, patchInput);
  checkStages(input.stages);
  if (input.stages) {
    const inUse = await db
      .select({ stage: jobApplications.stage, n: sql<number>`count(*)::int` })
      .from(jobApplications)
      .where(eq(jobApplications.postingId, job.id))
      .groupBy(jobApplications.stage);
    const orphaned = inUse.filter((r) => !input.stages!.includes(r.stage) && r.stage !== 'rejected' && r.stage !== 'withdrawn');
    if (orphaned.length)
      throw conflict(`Applications are still in ${orphaned.map((o) => `${stageLabel(o.stage)} (${o.n})`).join(', ')}. Move them before removing that stage.`, {
        fields: { stages: 'A removed stage still has applications.' },
      });
  }
  const requiredSkills = await normalizeSkills(input.requiredSkills);
  const { closesAt, requiredSkills: _rs, ...rest } = input;
  const [row] = await db
    .update(jobPostings)
    .set({ ...rest, ...(requiredSkills ? { requiredSkills } : {}), ...(closesAt !== undefined ? { closesAt: closesAt ? new Date(closesAt) : null } : {}), updatedAt: new Date() })
    .where(eq(jobPostings.id, job.id))
    .returning();
  await audit(c, { action: 'hire.job.updated', orgId: job.orgId, targetType: 'job_posting', targetId: job.id, meta: { fields: Object.keys(input) } });
  const counts = await stageCounts([job.id]);
  return c.json({ job: jobView(row, counts.get(job.id)), checklist: await publishChecklist(row) });
});

jobRoutes.post('/jobs/:id/publish', async (c) => {
  const job = await loadJob(c, idParam(c), 'manage');
  if (job.status === 'published') throw conflict('This job is already published.');
  if (job.status === 'archived') throw conflict('Archived jobs cannot be published. Duplicate it instead.');
  const checklist = await publishChecklist(job);
  const blocking = checklist.items.filter((i) => !i.ok && i.key !== 'plan');
  if (blocking.length) throw badRequest(`Before publishing: ${blocking.map((b) => b.reason).join(' ')}`, { checklist: checklist.items });
  if (!checklist.limit.allowed) throw conflict(`Your plan's limit on active job postings is reached. ${checklist.limit.explanation} Close another posting or change plan.`, { limit: checklist.limit });
  const [row] = await db.update(jobPostings).set({ status: 'published', publishedAt: job.publishedAt ?? new Date(), updatedAt: new Date() }).where(eq(jobPostings.id, job.id)).returning();
  await audit(c, { action: 'hire.job.published', orgId: job.orgId, targetType: 'job_posting', targetId: job.id, meta: { from: job.status } });
  return c.json({ job: jobView(row) });
});

jobRoutes.post('/jobs/:id/close', async (c) => {
  const job = await loadJob(c, idParam(c), 'manage');
  if (job.status !== 'published') throw conflict('Only a published job can be closed.');
  const [row] = await db.update(jobPostings).set({ status: 'closed', updatedAt: new Date() }).where(eq(jobPostings.id, job.id)).returning();
  await audit(c, { action: 'hire.job.closed', orgId: job.orgId, targetType: 'job_posting', targetId: job.id });
  return c.json({ job: jobView(row), note: 'New applications are no longer accepted. Existing candidates stay in the pipeline.' });
});

jobRoutes.post('/jobs/:id/archive', async (c) => {
  const job = await loadJob(c, idParam(c), 'manage');
  if (job.status === 'archived') throw conflict('This job is already archived.');
  if (job.status === 'published') throw conflict('Close the job before archiving it.');
  const [row] = await db.update(jobPostings).set({ status: 'archived', updatedAt: new Date() }).where(eq(jobPostings.id, job.id)).returning();
  await audit(c, { action: 'hire.job.archived', orgId: job.orgId, targetType: 'job_posting', targetId: job.id });
  return c.json({ job: jobView(row) });
});

jobRoutes.post('/jobs/:id/duplicate', async (c) => {
  const auth = requireAuth(c);
  const job = await loadJob(c, idParam(c), 'manage');
  const { id: _id, createdAt: _c, updatedAt: _u, publishedAt: _p, status: _s, createdBy: _cb, ...rest } = job;
  const [row] = await db
    .insert(jobPostings)
    .values({ ...rest, title: `Copy of ${job.title}`.slice(0, 160), status: 'draft', createdBy: auth.user.id, closesAt: null, assessmentId: null })
    .returning();
  await audit(c, { action: 'hire.job.duplicated', orgId: job.orgId, targetType: 'job_posting', targetId: row.id, meta: { from: job.id } });
  return c.json({ job: jobView(row) }, 201);
});

jobRoutes.delete('/jobs/:id', async (c) => {
  const job = await loadJob(c, idParam(c), 'manage');
  if (job.status !== 'draft') throw conflict('Only drafts can be deleted. Close and archive published jobs instead.');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(jobApplications).where(eq(jobApplications.postingId, job.id));
  if (n > 0) throw conflict('This draft has applications and cannot be deleted.');
  await db.delete(jobPostings).where(eq(jobPostings.id, job.id));
  await audit(c, { action: 'hire.job.deleted', orgId: job.orgId, targetType: 'job_posting', targetId: job.id, meta: { title: job.title } });
  return c.json({ ok: true });
});

// ---------- Shortlist suggestions (human confirms) ----------

jobRoutes.post('/jobs/:id/suggest-shortlist', async (c) => {
  const job = await loadJob(c, idParam(c), 'manage');
  const input = await body(c, z.object({ minScore: z.number().int().min(0).max(100).default(60), requireAllRequired: z.boolean().default(false), fromStages: z.array(z.string()).max(12).optional() }));
  const apps = await db
    .select({ id: jobApplications.id, candidateId: jobApplications.candidateId, stage: jobApplications.stage })
    .from(jobApplications)
    .where(and(eq(jobApplications.postingId, job.id), eq(jobApplications.status, 'active'), input.fromStages?.length ? inArray(jobApplications.stage, input.fromStages) : undefined));
  const suggestions = [];
  for (const a of apps) {
    const { score, factors } = skillFactors(job.requiredSkills, await computeSkillDna(a.candidateId));
    const allRequired = factors.filter((f) => f.required).every((f) => f.outcome === 'met');
    if ((score ?? 0) >= input.minScore && (!input.requireAllRequired || allRequired))
      suggestions.push({ applicationId: a.id, stage: a.stage, score, factors: factors.map((f) => ({ name: f.name, required: f.required, outcome: f.outcome, evidence: f.evidence })) });
  }
  suggestions.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return c.json({
    suggestions,
    note: 'Suggestions only. Nothing has changed: review each candidate and confirm any move yourself. Candidates below the threshold are not rejected.',
  });
});

// ---------- Job-linked recruitment assessments ----------

async function linkedAssessments(job: Job) {
  const rows = await db
    .select({ id: assessments.id, title: assessments.title, status: assessments.status, mode: assessments.mode, jobPostingId: assessments.jobPostingId })
    .from(assessments)
    .where(and(eq(assessments.orgId, job.orgId), or(eq(assessments.jobPostingId, job.id), job.assessmentId ? eq(assessments.id, job.assessmentId) : sql`false`)));
  if (!rows.length) return [];
  const invites = await db
    .select({ assessmentId: assessmentInvites.assessmentId, n: sql<number>`count(*)::int` })
    .from(assessmentInvites)
    .innerJoin(jobApplications, eq(jobApplications.id, assessmentInvites.applicationId))
    .where(and(inArray(assessmentInvites.assessmentId, rows.map((r) => r.id)), eq(jobApplications.postingId, job.id)))
    .groupBy(assessmentInvites.assessmentId);
  const out = [];
  for (const r of rows) {
    const appUsers = await db.select({ userId: jobApplications.candidateId }).from(jobApplications).where(eq(jobApplications.postingId, job.id));
    const summaries = appUsers.length ? await attemptSummaries(r.id, appUsers.map((u) => u.userId)) : [];
    out.push({
      ...r,
      primary: job.assessmentId === r.id,
      invited: Number(invites.find((i) => i.assessmentId === r.id)?.n ?? 0),
      completed: summaries.filter((s) => s.status !== 'in_progress').length,
      link: `/app/hire/assessments/${r.id}`,
    });
  }
  return out;
}

jobRoutes.get('/jobs/:id/assessments', async (c) => {
  const job = await loadJob(c, idParam(c));
  return c.json({ items: await linkedAssessments(job) });
});

/** Link (or unlink with null) a recruitment assessment as this job's screen. */
jobRoutes.post('/jobs/:id/assessment', async (c) => {
  const job = await loadJob(c, idParam(c), 'manage');
  const { assessmentId } = await body(c, z.object({ assessmentId: z.string().uuid().nullable() }));
  if (assessmentId) {
    await assertCanManageAssessment(c, assessmentId);
    const [a] = await db.select({ orgId: assessments.orgId, mode: assessments.mode }).from(assessments).where(eq(assessments.id, assessmentId));
    if (!a || a.orgId !== job.orgId) throw notFound('Assessment');
    if (a.mode !== 'recruitment') throw badRequest('Only recruitment assessments can screen job applicants.', { fields: { assessmentId: 'Choose a recruitment assessment.' } });
  }
  await db.update(jobPostings).set({ assessmentId, updatedAt: new Date() }).where(eq(jobPostings.id, job.id));
  await audit(c, { action: assessmentId ? 'hire.job.assessment_linked' : 'hire.job.assessment_unlinked', orgId: job.orgId, targetType: 'job_posting', targetId: job.id, meta: { assessmentId } });
  return c.json({ items: await linkedAssessments({ ...job, assessmentId }) });
});

jobRoutes.post('/jobs/:id/assessments/:assessmentId/invite', async (c) => {
  const auth = requireAuth(c);
  const job = await loadJob(c, idParam(c), 'manage');
  const assessmentId = idParam(c, 'assessmentId');
  const input = await body(c, z.object({ applicationIds: z.array(z.string().uuid()).min(1).max(200), dueAt: z.string().datetime({ offset: true }).nullable().optional() }));
  await assertCanManageAssessment(c, assessmentId);
  const [a] = await db.select().from(assessments).where(eq(assessments.id, assessmentId));
  if (!a || a.orgId !== job.orgId || (a.jobPostingId !== job.id && job.assessmentId !== a.id)) throw notFound('Assessment');
  const apps = await db
    .select({ id: jobApplications.id, candidateId: jobApplications.candidateId, status: jobApplications.status })
    .from(jobApplications)
    .where(and(eq(jobApplications.postingId, job.id), inArray(jobApplications.id, input.applicationIds)));
  if (apps.length !== new Set(input.applicationIds).size) throw notFound('Application');
  const inactive = apps.filter((x) => x.status !== 'active');
  if (inactive.length) throw conflict('Only active applications can be invited.');
  let invited = 0;
  let alreadyInvited = 0;
  for (const app of apps) {
    const r = await inviteToAssessment({ assessmentId, userIds: [app.candidateId], invitedBy: auth.user.id, applicationId: app.id, dueAt: input.dueAt ? new Date(input.dueAt) : null });
    invited += r.invited;
    alreadyInvited += r.alreadyInvited;
  }
  await audit(c, { action: 'hire.assessment.invited', orgId: job.orgId, targetType: 'assessment', targetId: assessmentId, meta: { postingId: job.id, applicationIds: apps.map((x) => x.id), invited } });
  return c.json({ invited, alreadyInvited, assessmentStatus: a.status, note: a.status === 'published' ? null : 'This assessment is not published yet. Candidates can open it once you publish it.' });
});
