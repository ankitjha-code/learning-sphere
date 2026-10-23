/** Applications pipeline, candidate profiles, stage decisions, messages and candidate search. Mounted under /api/hire. */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  assessments,
  assessmentInvites,
  hireApplyInvitations,
  hireCandidatePreferences,
  hiringDecisions,
  interviewFeedback,
  interviews,
  jobApplications,
  jobPostings,
  messages,
  offers,
  placementDrives,
  driveCandidates,
  portfolios,
  profiles,
  users,
} from '../../db/schema';
import { type AppEnv, type Ctx, requireAuth, requireOrgRole, rolesIn } from '../../lib/context';
import { body, idParam, query } from '../../lib/validate';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { rateLimit } from '../../lib/ratelimit';
import { attemptSummaries } from '../assessments/service';
import { computeSkillDna, type SkillDnaEntry } from '../learning/skilldna';
import { composePortfolio } from '../portfolio/service';
import { isFeatureEnabled } from '../admin/settings';
import { skillStatus, STATUS_POINTS } from '../career/analysis';
import { matchCandidate, skillFactors, MATCH_NOTE } from './matching';
import {
  MANAGE_ROLES,
  assignedApplicationIds,
  hasAny,
  hireOrg,
  loadApplication,
  loadJob,
  moveApplication,
  moveRules,
  stageLabel,
  stripProtected,
  threadKeyFor,
  threadMessages,
  unreadCounts,
  userNames,
  type Job,
  type JobApp,
} from './service';

export const pipelineRoutes = new Hono<AppEnv>();

const escLike = (s: string) => `%${s.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

// ---------- Assessment status per application ----------

type AssessmentState = { assessmentId: string; title: string; inviteStatus: string; invitedAt: Date; dueAt: Date | null; attemptStatus: string | null; percent: number | null; submittedAt: string | null; resultsLink: string };

async function assessmentStates(apps: Pick<JobApp, 'id' | 'candidateId'>[]): Promise<Map<string, AssessmentState[]>> {
  const out = new Map<string, AssessmentState[]>();
  if (!apps.length) return out;
  const inv = await db
    .select({ inv: assessmentInvites, title: assessments.title })
    .from(assessmentInvites)
    .innerJoin(assessments, eq(assessments.id, assessmentInvites.assessmentId))
    .where(inArray(assessmentInvites.applicationId, apps.map((a) => a.id)));
  const byAssessment = new Map<string, string[]>();
  for (const r of inv) byAssessment.set(r.inv.assessmentId, [...(byAssessment.get(r.inv.assessmentId) ?? []), r.inv.userId]);
  const summaries = new Map<string, Awaited<ReturnType<typeof attemptSummaries>>[number]>();
  for (const [aid, uids] of byAssessment) for (const s of await attemptSummaries(aid, uids)) summaries.set(`${aid}:${s.userId}`, s);
  for (const r of inv) {
    const s = summaries.get(`${r.inv.assessmentId}:${r.inv.userId}`);
    const scored = s && (s.status === 'graded' || s.status === 'released');
    const list = out.get(r.inv.applicationId!) ?? [];
    list.push({
      assessmentId: r.inv.assessmentId,
      title: r.title,
      inviteStatus: r.inv.status,
      invitedAt: r.inv.createdAt,
      dueAt: r.inv.dueAt,
      attemptStatus: s?.status ?? null,
      percent: scored ? s!.percent : null,
      submittedAt: s?.submittedAt ?? null,
      resultsLink: `/app/hire/assessments/${r.inv.assessmentId}`,
    });
    out.set(r.inv.applicationId!, list);
  }
  return out;
}

function assessmentSummary(list: AssessmentState[] | undefined): 'not_invited' | 'invited' | 'in_progress' | 'completed' {
  if (!list?.length) return 'not_invited';
  if (list.some((a) => a.attemptStatus && a.attemptStatus !== 'in_progress')) return 'completed';
  if (list.some((a) => a.attemptStatus === 'in_progress')) return 'in_progress';
  return 'invited';
}

// ---------- Lists ----------

const listQuery = z.object({
  postingId: z.string().uuid().optional(),
  stage: z.string().trim().max(40).optional(),
  status: z.enum(['active', 'rejected', 'withdrawn', 'hired', 'declined']).optional(),
  source: z.enum(['direct', 'invited', 'campus_drive', 'referral']).optional(),
  skill: z.string().trim().max(80).optional(), // slug that must be met
  assessment: z.enum(['not_invited', 'invited', 'in_progress', 'completed']).optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(['recent', 'match']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

async function listApplications(c: Ctx, orgId: string, canManage: boolean, q: z.infer<typeof listQuery>) {
  const auth = requireAuth(c);
  const assigned = canManage ? null : await assignedApplicationIds(orgId, auth.user.id);
  if (assigned && !assigned.length) return { items: [], total: 0 };
  const rows = await db
    .select({ app: jobApplications, job: jobPostings, name: users.name, headline: profiles.headline })
    .from(jobApplications)
    .innerJoin(jobPostings, eq(jobPostings.id, jobApplications.postingId))
    .innerJoin(users, eq(users.id, jobApplications.candidateId))
    .leftJoin(profiles, eq(profiles.userId, jobApplications.candidateId))
    .where(
      and(
        eq(jobApplications.orgId, orgId),
        assigned ? inArray(jobApplications.id, assigned) : undefined,
        q.postingId ? eq(jobApplications.postingId, q.postingId) : undefined,
        q.stage ? eq(jobApplications.stage, q.stage) : undefined,
        q.status ? eq(jobApplications.status, q.status) : undefined,
        q.source ? eq(jobApplications.source, q.source) : undefined,
        q.q ? or(ilike(users.name, escLike(q.q)), ilike(jobPostings.title, escLike(q.q))) : undefined,
      ),
    )
    .orderBy(desc(jobApplications.updatedAt))
    .limit(500);
  const dnaCache = new Map<string, SkillDnaEntry[]>();
  const states = await assessmentStates(rows.map((r) => r.app));
  const unread = canManage ? await unreadCounts(rows.map((r) => r.app.id), auth.user.id) : new Map<string, number>();
  let items = [];
  for (const r of rows) {
    let dna = dnaCache.get(r.app.candidateId);
    if (!dna) dnaCache.set(r.app.candidateId, (dna = await computeSkillDna(r.app.candidateId)));
    const { score, factors } = skillFactors(r.job.requiredSkills, dna);
    const st = states.get(r.app.id);
    items.push({
      id: r.app.id,
      postingId: r.job.id,
      jobTitle: r.job.title,
      candidate: { id: r.app.candidateId, name: r.name, headline: r.headline ?? null },
      stage: r.app.stage,
      stageLabel: stageLabel(r.app.stage),
      status: r.app.status,
      source: r.app.source,
      appliedAt: r.app.appliedAt,
      updatedAt: r.app.updatedAt,
      portfolioShared: r.app.portfolioShared,
      match: { score, met: factors.filter((f) => f.outcome === 'met').length, partial: factors.filter((f) => f.outcome === 'partial').length, total: factors.length, metSlugs: factors.filter((f) => f.outcome === 'met').map((f) => f.slug) },
      assessment: { summary: assessmentSummary(st), items: st ?? [] },
      unread: unread.get(r.app.id) ?? 0,
    });
  }
  if (q.skill) items = items.filter((i) => i.match.metSlugs.includes(q.skill!));
  if (q.assessment) items = items.filter((i) => i.assessment.summary === q.assessment);
  if (q.sort === 'match') items.sort((a, b) => (b.match.score ?? 0) - (a.match.score ?? 0));
  const total = items.length;
  return { items: items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total };
}

pipelineRoutes.get('/applications', async (c) => {
  const { orgId, canManage } = hireOrg(c);
  const q = query(c, listQuery);
  const res = await listApplications(c, orgId, canManage, q);
  return c.json({ ...res, page: q.page, pageSize: q.pageSize, canManage, note: MATCH_NOTE });
});

/** Pipeline for one job (board columns = the job's stages + closing stages). */
pipelineRoutes.get('/jobs/:id/applications', async (c) => {
  const auth = requireAuth(c);
  const job = await loadJob(c, idParam(c));
  const canManage = hasAny(rolesIn(auth, job.orgId), MANAGE_ROLES);
  const q = query(c, listQuery);
  const res = await listApplications(c, job.orgId, canManage, { ...q, postingId: job.id, pageSize: 100 });
  const columns = [...job.stages, 'rejected', 'withdrawn'].map((s) => ({ key: s, label: stageLabel(s), closing: s === 'rejected' || s === 'withdrawn' }));
  return c.json({ ...res, columns, canManage, note: MATCH_NOTE });
});

// ---------- Candidate profile (application detail) ----------

async function sharedPortfolio(candidateId: string) {
  const [p] = await db.select({ slug: portfolios.slug, visibility: portfolios.visibility }).from(portfolios).where(eq(portfolios.userId, candidateId));
  if (!p) return null;
  const v = await composePortfolio(candidateId, 'public');
  const publicUrl = p.visibility === 'public' && (await isFeatureEnabled('publicPortfolios')) ? `/p/${p.slug}` : null;
  return stripProtected({
    headline: v.portfolio.headline,
    about: v.portfolio.about,
    publicUrl,
    projects: v.projects.map((x) => ({ id: x.id, title: x.title, summary: x.summary, skills: x.skills, verification: x.verification, repoUrl: x.repoUrl, demoUrl: x.demoUrl, completedAt: x.completedAt, reviewerName: x.reviewerName })),
    skills: v.skills.slice(0, 20).map((s) => ({ slug: s.slug, name: s.name, provenance: s.provenance, label: s.label, lastEvidenceAt: s.lastEvidenceAt })),
    assessments: v.assessments.map((a) => ({ title: a.title, scorePercent: a.scorePercent, at: a.at })),
    certificates: v.certificates.map((x) => ({ title: x.title, issuer: x.issuer, label: x.label, issuedAt: x.issuedAt })),
    links: v.owner.links,
  });
}

async function feedbackFor(interviewIds: string[], viewerId: string, canManage: boolean) {
  if (!interviewIds.length) return new Map<string, { visible: unknown[]; hiddenCount: number; mine: boolean }>();
  const rows = await db.select().from(interviewFeedback).where(inArray(interviewFeedback.interviewId, interviewIds));
  const names = await userNames(rows.map((r) => r.interviewerId));
  const out = new Map<string, { visible: unknown[]; hiddenCount: number; mine: boolean }>();
  for (const iid of interviewIds) {
    const list = rows.filter((r) => r.interviewId === iid);
    const mine = list.some((r) => r.interviewerId === viewerId);
    const canSeeAll = canManage || mine;
    const visible = list
      .filter((r) => canSeeAll || r.interviewerId === viewerId)
      .map((r) => ({ id: r.id, interviewerId: r.interviewerId, interviewerName: names.get(r.interviewerId) ?? 'Former member', recommendation: r.recommendation, scores: r.scores, summary: r.summary, submittedAt: r.submittedAt }));
    out.set(iid, { visible, hiddenCount: list.length - visible.length, mine });
  }
  return out;
}

pipelineRoutes.get('/applications/:id', async (c) => {
  const auth = requireAuth(c);
  const { app, job, canManage } = await loadApplication(c, idParam(c));
  const [cand] = await db
    .select({ id: users.id, name: users.name, headline: profiles.headline, location: profiles.location })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, app.candidateId));
  const [match, states, ivRows, decisionRows, offerRows, unread] = await Promise.all([
    matchCandidate(job, app.candidateId),
    assessmentStates([app]),
    db.select().from(interviews).where(eq(interviews.applicationId, app.id)).orderBy(interviews.scheduledAt),
    canManage ? db.select().from(hiringDecisions).where(eq(hiringDecisions.applicationId, app.id)).orderBy(hiringDecisions.createdAt) : Promise.resolve([]),
    canManage ? db.select().from(offers).where(eq(offers.applicationId, app.id)).orderBy(desc(offers.createdAt)) : Promise.resolve([]),
    canManage ? unreadCounts([app.id], auth.user.id) : Promise.resolve(new Map<string, number>()),
  ]);
  const fb = await feedbackFor(ivRows.map((i) => i.id), auth.user.id, canManage);
  const names = await userNames([...ivRows.flatMap((i) => i.interviewerIds), ...decisionRows.map((d) => d.decidedBy)]);
  const portfolio = app.portfolioShared ? await sharedPortfolio(app.candidateId) : null;
  const nextStages = [...job.stages, 'rejected']
    .filter((s) => s !== app.stage)
    .map((s) => {
      const r = moveRules(job, app, s);
      return { key: s, label: stageLabel(s), needsReason: r.needsReason, why: r.why, blocked: r.error };
    });
  return c.json(
    stripProtected({
      application: {
        id: app.id,
        stage: app.stage,
        stageLabel: stageLabel(app.stage),
        status: app.status,
        source: app.source,
        appliedAt: app.appliedAt,
        updatedAt: app.updatedAt,
        coverNote: app.coverNote,
        portfolioShared: app.portfolioShared,
        resume: app.resumeSnapshot ?? null,
        matchAtApply: app.matchSnapshot ?? null,
      },
      candidate: { id: cand?.id ?? app.candidateId, name: cand?.name ?? 'Candidate', headline: cand?.headline ?? null, location: cand?.location ?? null },
      job: { id: job.id, title: job.title, status: job.status, stages: job.stages, stageLabels: Object.fromEntries([...job.stages, 'rejected', 'withdrawn'].map((s) => [s, stageLabel(s)])), requiredSkills: job.requiredSkills },
      match,
      portfolio,
      portfolioNote: app.portfolioShared
        ? portfolio
          ? 'Shown because the candidate chose to share their portfolio with this application. Only sections they made visible appear.'
          : 'The candidate agreed to share their portfolio but has not created one yet.'
        : 'The candidate did not share their portfolio with this application.',
      assessments: states.get(app.id) ?? [],
      interviews: ivRows.map((i) => ({
        id: i.id,
        title: i.title,
        kind: i.kind,
        scheduledAt: i.scheduledAt,
        durationMinutes: i.durationMinutes,
        status: i.status,
        meetingUrl: i.meetingUrl,
        interviewers: i.interviewerIds.map((uid) => ({ id: uid, name: names.get(uid) ?? 'Former member' })),
        feedback: fb.get(i.id)?.visible ?? [],
        hiddenFeedbackCount: fb.get(i.id)?.hiddenCount ?? 0,
        iAmInterviewer: i.interviewerIds.includes(auth.user.id),
        mySubmitted: fb.get(i.id)?.mine ?? false,
      })),
      offers: offerRows.map((o) => ({ id: o.id, title: o.title, compensationText: o.compensationText, startDate: o.startDate, expiresAt: o.expiresAt, status: o.status, createdAt: o.createdAt })),
      decisions: decisionRows.map((d) => ({ id: d.id, fromStage: d.fromStage, toStage: d.toStage, fromLabel: stageLabel(d.fromStage), toLabel: stageLabel(d.toStage), reason: d.reason, visibleToCandidate: d.visibleToCandidate, decidedBy: names.get(d.decidedBy) ?? (d.decidedBy === app.candidateId ? 'Candidate' : 'Former member'), createdAt: d.createdAt })),
      unreadMessages: unread.get(app.id) ?? 0,
      permissions: { canManage, canMessage: canManage, canMove: canManage && app.status !== 'withdrawn' && app.status !== 'declined' },
      nextStages: canManage ? nextStages : [],
    }),
  );
});

// ---------- Stage moves ----------

const moveInput = z.object({ toStage: z.string().trim().min(2).max(40), reason: z.string().trim().max(2000).nullable().optional(), visibleToCandidate: z.boolean().optional() });

pipelineRoutes.post('/applications/:id/move', async (c) => {
  const { app, job } = await loadApplication(c, idParam(c), 'manage');
  const input = await body(c, moveInput);
  const updated = await moveApplication(c, job, app, input);
  return c.json({ application: { id: updated.id, stage: updated.stage, status: updated.status } });
});

pipelineRoutes.post('/applications/bulk-move', async (c) => {
  const input = await body(
    c,
    moveInput.extend({
      applicationIds: z.array(z.string().uuid()).min(1).max(100),
      confirm: z.literal(true, { message: 'Confirm the bulk move.' }),
    }),
  );
  const loaded: { app: JobApp; job: Job }[] = [];
  for (const id of new Set(input.applicationIds)) loaded.push(await loadApplication(c, id, 'manage'));
  // Validate everything first so a bulk move is all-or-nothing on rules.
  const problems: { applicationId: string; error: string }[] = [];
  let needsReason = false;
  for (const { app, job } of loaded) {
    const r = moveRules(job, app, input.toStage);
    if (r.error) problems.push({ applicationId: app.id, error: r.error });
    if (r.needsReason) needsReason = true;
  }
  if (problems.length) throw conflict(`${problems.length} of ${loaded.length} applications cannot be moved to ${stageLabel(input.toStage)}.`, { problems });
  if (needsReason && (input.reason?.trim().length ?? 0) < 5) throw badRequest('This move needs a reason (rejection, skipped stage, moving back or reopening).', { fields: { reason: 'Write a short reason (at least 5 characters).' } });
  const moved = [];
  for (const { app, job } of loaded) {
    const u = await moveApplication(c, job, app, input, { bulk: true });
    moved.push({ id: u.id, stage: u.stage, status: u.status });
  }
  return c.json({ moved, count: moved.length });
});

// ---------- Messages (recruiter side) ----------

pipelineRoutes.get('/applications/:id/messages', async (c) => {
  const auth = requireAuth(c);
  const { app } = await loadApplication(c, idParam(c));
  requireOrgRole(c, app.orgId, MANAGE_ROLES);
  return c.json({ items: await threadMessages(app.id, auth.user.id) });
});

pipelineRoutes.post('/applications/:id/messages', async (c) => {
  const auth = requireAuth(c);
  const { app, job } = await loadApplication(c, idParam(c));
  requireOrgRole(c, app.orgId, MANAGE_ROLES);
  rateLimit(`hire-msg:${auth.user.id}`, 60, 3600_000);
  const { body: text } = await body(c, z.object({ body: z.string().trim().min(1, 'Write a message.').max(4000) }));
  const [m] = await db.insert(messages).values({ threadKey: threadKeyFor(app.id), orgId: app.orgId, senderId: auth.user.id, body: text, readBy: [auth.user.id] }).returning();
  await notify(app.candidateId, { type: 'hire.message', category: 'career', title: `New message about ${job.title}`, body: text.slice(0, 200), link: `/app/jobs/applications/${app.id}` });
  await audit(c, { action: 'hire.message.sent', orgId: app.orgId, targetType: 'job_application', targetId: app.id });
  return c.json({ message: { id: m.id, body: m.body, createdAt: m.createdAt, mine: true, senderName: auth.user.name } }, 201);
});

// ---------- Candidate search (authorized pool only) ----------

/** People an org may find: opted-in candidates, its applicants, and campus-drive invitees for its postings. */
async function searchPool(orgId: string) {
  const [optIn, applicants, drive] = await Promise.all([
    db.select({ id: hireCandidatePreferences.userId }).from(hireCandidatePreferences).where(eq(hireCandidatePreferences.discoverableByRecruiters, true)),
    db.select({ id: jobApplications.candidateId }).from(jobApplications).where(eq(jobApplications.orgId, orgId)),
    db
      .select({ id: driveCandidates.userId })
      .from(driveCandidates)
      .innerJoin(placementDrives, eq(placementDrives.id, driveCandidates.driveId))
      .leftJoin(jobPostings, eq(jobPostings.id, placementDrives.jobPostingId))
      .where(or(eq(placementDrives.companyOrgId, orgId), eq(jobPostings.orgId, orgId))),
  ]);
  return { optIn: new Set(optIn.map((r) => r.id)), applicants: new Set(applicants.map((r) => r.id)), drive: new Set(drive.map((r) => r.id)) };
}

const searchQuery = z.object({
  skills: z.string().trim().max(400).optional(), // comma-separated slugs
  minEvidence: z.enum(['demonstrated', 'any']).default('demonstrated'),
  graduationYear: z.coerce.number().int().min(1980).max(2100).optional(),
  location: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

pipelineRoutes.get('/candidates/search', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = hireOrg(c, MANAGE_ROLES);
  const q = query(c, searchQuery);
  const slugs = q.skills ? [...new Set(q.skills.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 10) : [];
  const pool = await searchPool(orgId);
  const ids = [...new Set([...pool.optIn, ...pool.applicants, ...pool.drive])].filter((id) => id !== auth.user.id);
  if (!ids.length) return c.json({ items: [], total: 0, page: q.page, pageSize: q.pageSize, note: MATCH_NOTE });
  const people = await db
    .select({ id: users.id, name: users.name, headline: profiles.headline, location: profiles.location, education: profiles.education, portfolioSlug: portfolios.slug, portfolioVisibility: portfolios.visibility })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(portfolios, eq(portfolios.userId, users.id))
    .where(and(inArray(users.id, ids.slice(0, 1000)), eq(users.status, 'active'), q.location ? ilike(profiles.location, escLike(q.location)) : undefined))
    .limit(300);
  const publicPortfolios = await isFeatureEnabled('publicPortfolios');
  const results = [];
  for (const p of people) {
    const gradYears = (p.education ?? []).map((e) => e.endYear).filter((y): y is number => typeof y === 'number');
    if (q.graduationYear && !gradYears.includes(q.graduationYear)) continue;
    const dna = await computeSkillDna(p.id);
    const bySlug = new Map(dna.map((d) => [d.slug, d]));
    const evidence = slugs.map((s) => {
      const st = skillStatus(bySlug.get(s));
      return { slug: s, name: bySlug.get(s)?.name ?? s, evidence: st.status, detail: st.evidence, points: STATUS_POINTS[st.status] };
    });
    const ok = evidence.every((e) => (q.minEvidence === 'demonstrated' ? e.evidence === 'verified' || e.evidence === 'demonstrated' : e.evidence !== 'none'));
    if (!ok) continue;
    const strongest = dna
      .filter((d) => d.state === 'verified' || d.state === 'demonstrated' || d.state === 'needs_revision')
      .sort((a, b) => Number(b.verified) - Number(a.verified) || (b.mastery ?? 0) - (a.mastery ?? 0))
      .slice(0, 6)
      .map((d) => ({ slug: d.slug, name: d.name, evidence: skillStatus(d).status }));
    results.push({
      userId: p.id,
      name: p.name,
      headline: p.headline ?? null,
      location: p.location ?? null,
      graduationYears: gradYears,
      skills: evidence,
      strongestSkills: strongest,
      score: slugs.length ? Math.round((evidence.reduce((s, e) => s + e.points, 0) / slugs.length) * 100) : null,
      portfolioUrl: publicPortfolios && p.portfolioVisibility === 'public' && p.portfolioSlug ? `/p/${p.portfolioSlug}` : null,
      relation: { applied: pool.applicants.has(p.id), discoverable: pool.optIn.has(p.id), campusDrive: pool.drive.has(p.id) },
    });
  }
  // Ordering uses only evidence for the requested skills; ties keep a stable, attribute-free order (user id).
  results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.userId.localeCompare(b.userId));
  const total = results.length;
  return c.json({ items: results.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total, page: q.page, pageSize: q.pageSize, note: MATCH_NOTE });
});

pipelineRoutes.post('/candidates/:userId/invite', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = hireOrg(c, MANAGE_ROLES);
  const userId = idParam(c, 'userId');
  rateLimit(`hire-invite:${auth.user.id}`, 100, 3600_000);
  const input = await body(c, z.object({ postingId: z.string().uuid(), message: z.string().trim().max(1000).nullable().optional() }));
  const pool = await searchPool(orgId);
  if (!pool.optIn.has(userId) && !pool.applicants.has(userId) && !pool.drive.has(userId)) throw notFound('Candidate');
  const [job] = await db.select().from(jobPostings).where(and(eq(jobPostings.id, input.postingId), eq(jobPostings.orgId, orgId)));
  if (!job) throw notFound('Job');
  if (job.status !== 'published') throw conflict('Publish the job before inviting candidates to apply.');
  const [already] = await db.select({ id: jobApplications.id }).from(jobApplications).where(and(eq(jobApplications.postingId, job.id), eq(jobApplications.candidateId, userId)));
  if (already) throw conflict('This person has already applied to this job.');
  const [row] = await db.insert(hireApplyInvitations).values({ orgId, postingId: job.id, candidateId: userId, invitedBy: auth.user.id, message: input.message ?? null }).onConflictDoNothing().returning();
  if (!row) throw conflict('This person was already invited to apply to this job.');
  await notify(userId, {
    type: 'hire.invited_to_apply',
    category: 'career',
    title: `You're invited to apply: ${job.title}`,
    body: input.message ? input.message.slice(0, 300) : 'A recruiter thinks your skills fit this role. Applying is entirely your choice.',
    link: `/app/jobs/${job.id}`,
  });
  await audit(c, { action: 'hire.candidate.invited_to_apply', orgId, targetType: 'user', targetId: userId, meta: { postingId: job.id } });
  return c.json({ invitation: { id: row.id, postingId: job.id, createdAt: row.createdAt } }, 201);
});
