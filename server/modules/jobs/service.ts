/**
 * Candidate-side job board logic: visibility of platform postings, match explanation,
 * applying (creates employer-side job_applications + personal applications rows) and withdrawing.
 */
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { applications, jobApplications, jobPostings, memberships, organizations, placementDrives, resumes, users } from '../../db/schema';
import type { AuthContext, Ctx } from '../../lib/context';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { notify } from '../../lib/notify';
import { audit } from '../../lib/audit';
import type { SkillDnaEntry } from '../learning/skilldna';
import { matchExplanation } from '../career/analysis';
import { extractSkills } from '../career/extract';
import { logEvent } from '../career/service';

const RECRUITER_ROLES = ['recruiter', 'recruiter_admin'];

/** Posting ids that are campus-only but visible to this user through an open drive of one of their orgs. */
async function campusVisibleIds(auth: AuthContext): Promise<string[]> {
  const orgIds = auth.memberships.map((m) => m.orgId);
  if (!orgIds.length) return [];
  const rows = await db
    .select({ id: placementDrives.jobPostingId })
    .from(placementDrives)
    .where(and(inArray(placementDrives.orgId, orgIds), inArray(placementDrives.status, ['open', 'in_progress']), sql`${placementDrives.jobPostingId} IS NOT NULL`));
  return rows.map((r) => r.id!).filter(Boolean);
}

/** SQL condition for postings a candidate may browse and apply to. */
export async function visibleWhere(auth: AuthContext) {
  const campusIds = await campusVisibleIds(auth);
  return and(
    eq(jobPostings.status, 'published'),
    or(isNull(jobPostings.closesAt), gt(jobPostings.closesAt, new Date())),
    campusIds.length ? or(eq(jobPostings.campusOnly, false), inArray(jobPostings.id, campusIds)) : eq(jobPostings.campusOnly, false),
  );
}

export function postingSkills(p: typeof jobPostings.$inferSelect): { slug: string; name: string; required: boolean }[] {
  if (p.requiredSkills?.length) return p.requiredSkills.map((s) => ({ slug: s.slug, name: s.name, required: s.required }));
  return extractSkills(`${p.description}\n${(p.responsibilities ?? []).join('\n')}`).map((s) => ({ slug: s.slug, name: s.name, required: s.required }));
}

export function postingMatch(p: typeof jobPostings.$inferSelect, dna: SkillDnaEntry[]) {
  const skills = postingSkills(p);
  return { ...matchExplanation(skills, dna), skillsSource: p.requiredSkills?.length ? 'posting' : 'extracted_from_description' };
}

async function orgName(orgId: string) {
  const [o] = await db.select({ name: organizations.name, isSample: organizations.isSample }).from(organizations).where(eq(organizations.id, orgId));
  return o ?? { name: 'Employer', isSample: false };
}

export async function recruitersOf(orgId: string, extra: string[] = []) {
  const rows = await db.select({ userId: memberships.userId, roles: memberships.roles }).from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.status, 'active')));
  const ids = rows.filter((r) => (r.roles as string[]).some((x) => RECRUITER_ROLES.includes(x))).map((r) => r.userId);
  return [...new Set([...ids, ...extra])];
}

export async function applyToPosting(
  c: Ctx,
  auth: AuthContext,
  postingId: string,
  input: { resumeId?: string | null; coverNote?: string | null; sharePortfolio: boolean },
  dna: SkillDnaEntry[],
) {
  const [posting] = await db.select().from(jobPostings).where(eq(jobPostings.id, postingId));
  if (!posting || posting.status === 'draft' || posting.status === 'archived') throw notFound('Job');
  if (posting.status !== 'published' || (posting.closesAt && new Date(posting.closesAt).getTime() <= Date.now())) throw conflict('This job is no longer accepting applications.');
  const [visible] = await db.select({ id: jobPostings.id }).from(jobPostings).where(and(eq(jobPostings.id, postingId), await visibleWhere(auth)));
  if (!visible) throw notFound('Job');
  const [existing] = await db.select({ id: jobApplications.id }).from(jobApplications).where(and(eq(jobApplications.postingId, postingId), eq(jobApplications.candidateId, auth.user.id)));
  if (existing) throw conflict('You have already applied to this job.', { applicationId: existing.id });

  let resumeSnapshot: Record<string, unknown> | null = null;
  if (input.resumeId) {
    const [r] = await db.select().from(resumes).where(and(eq(resumes.id, input.resumeId), eq(resumes.userId, auth.user.id)));
    if (!r) throw badRequest('That resume was not found.', { fields: { resumeId: 'Choose one of your resumes.' } });
    resumeSnapshot = { resumeId: r.id, title: r.title, template: r.template, version: r.version, data: r.data, capturedAt: new Date().toISOString() };
  }
  const match = postingMatch(posting, dna);
  const matchSnapshot = { score: match.score, factors: match.factors.map((f) => ({ label: f.label, met: f.met, evidence: f.evidence })) };
  const org = await orgName(posting.orgId);
  const campus = posting.campusOnly;

  const result = await db.transaction(async (tx) => {
    const [ja] = await tx
      .insert(jobApplications)
      .values({
        postingId,
        orgId: posting.orgId,
        candidateId: auth.user.id,
        stage: 'applied',
        status: 'active',
        source: campus ? 'campus_drive' : 'direct',
        resumeSnapshot,
        coverNote: input.coverNote ?? null,
        portfolioShared: input.sharePortfolio,
        matchSnapshot,
      })
      .onConflictDoNothing()
      .returning();
    if (!ja) throw conflict('You have already applied to this job.');
    const [personal] = await tx
      .insert(applications)
      .values({
        userId: auth.user.id,
        company: org.name,
        role: posting.title,
        source: 'platform',
        jobPostingId: postingId,
        jobApplicationId: ja.id,
        location: posting.location,
        status: 'applied',
        appliedAt: new Date(),
        resumeId: input.resumeId ?? null,
        salaryText: posting.salaryText,
        deadline: posting.closesAt,
        notes: input.coverNote ? `Cover note sent: ${input.coverNote}` : null,
      })
      .returning();
    return { ja, personal };
  });
  await logEvent(result.personal.id, { kind: 'status', fromStatus: null, toStatus: 'applied', note: 'Applied on LearnSphere Nexus' });

  for (const uid of await recruitersOf(posting.orgId, [posting.createdBy])) {
    await notify(uid, {
      type: 'hire.application_received',
      category: 'career',
      orgId: posting.orgId,
      title: `New application: ${posting.title}`,
      body: `${auth.user.name} applied${input.sharePortfolio ? ' and shared their portfolio' : ''}.`,
      link: `/app/hire/candidates?application=${result.ja.id}`,
    });
  }
  return { jobApplication: result.ja, application: result.personal };
}

/**
 * Candidate withdraws an employer-side application. Updates the personal tracker row unless
 * the caller already does it, and notifies the employer's recruiters.
 */
export async function withdrawPlatformApplication(c: Ctx, userId: string, jobApplicationId: string, reason: string | null | undefined, opts: { skipPersonal?: boolean } = {}) {
  const [ja] = await db.select().from(jobApplications).where(and(eq(jobApplications.id, jobApplicationId), eq(jobApplications.candidateId, userId)));
  if (!ja) throw notFound('Application');
  if (ja.status !== 'active') {
    if (opts.skipPersonal) return ja; // already closed on the employer side; personal record can still change
    throw conflict(`This application is already ${ja.status}.`);
  }
  const [updated] = await db.update(jobApplications).set({ status: 'withdrawn', updatedAt: new Date() }).where(eq(jobApplications.id, ja.id)).returning();
  if (!opts.skipPersonal) {
    const [personal] = await db.select().from(applications).where(and(eq(applications.jobApplicationId, ja.id), eq(applications.userId, userId)));
    if (personal && personal.status !== 'withdrawn') {
      await db.update(applications).set({ status: 'withdrawn', outcomeReason: reason ?? personal.outcomeReason, updatedAt: new Date() }).where(eq(applications.id, personal.id));
      await logEvent(personal.id, { kind: 'status', fromStatus: personal.status, toStatus: 'withdrawn', note: reason ?? 'Withdrawn by you' });
    }
  }
  const [posting] = await db.select({ title: jobPostings.title, createdBy: jobPostings.createdBy }).from(jobPostings).where(eq(jobPostings.id, ja.postingId));
  const [candidate] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  for (const uid of await recruitersOf(ja.orgId, posting ? [posting.createdBy] : [])) {
    await notify(uid, {
      type: 'hire.application_withdrawn',
      category: 'career',
      orgId: ja.orgId,
      title: `Application withdrawn: ${posting?.title ?? 'job'}`,
      body: `${candidate?.name ?? 'A candidate'} withdrew their application${reason ? `: ${reason.slice(0, 200)}` : '.'}`,
      link: `/app/hire/candidates?application=${ja.id}`,
    });
  }
  await audit(c, { action: 'job.application.withdraw', orgId: ja.orgId, targetType: 'job_application', targetId: ja.id });
  return updated;
}
