/** Overview, recruitment funnel analytics and CSV exports. Mounted under /api/hire. No demographic analytics. */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { assessmentInvites, attempts, hiringDecisions, interviewFeedback, interviews, jobApplications, jobPostings, offers, users, DEFAULT_PIPELINE } from '../../db/schema';
import { type AppEnv, requireAuth } from '../../lib/context';
import { query } from '../../lib/validate';
import { badRequest } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { computeSkillDna } from '../learning/skilldna';
import { skillFactors } from './matching';
import { ADMIN_ROLES, MANAGE_ROLES, assignedApplicationIds, hireOrg, loadJob, stageLabel, toCsv, unreadCounts, userNames, type Job } from './service';

export const insightRoutes = new Hono<AppEnv>();

const DAY = 86400_000;

export const ANALYTICS_DEFINITIONS = {
  applications: 'Applications received on the platform for the job(s), including withdrawn and rejected ones.',
  stageReached: 'An application "reached" a stage if it was ever moved to that stage or any later stage of the same job (from the hiring decision log and its current stage).',
  stageConversion: 'Reached this stage / reached the previous stage.',
  applicationConversion: 'Hired / all applications.',
  assessmentCompletion: 'Assessment invitations linked to applications with a submitted attempt / all such invitations.',
  interviewThroughput: 'Interviews per calendar week (Monday start, UTC): scheduled = not cancelled; completed = marked completed.',
  daysInStage: 'Average time between entering a stage and leaving it, from hiring decision timestamps. Applications still in a stage are not counted for that stage.',
  offerAcceptance: 'Accepted offers / offers that received an answer (accepted + declined). Expired and rescinded offers are shown separately.',
  sources: 'How applications arrived: direct, invited by a recruiter, campus drive or referral.',
  fairness: 'No demographic analytics are computed. Personal characteristics are never collected for ranking or reporting.',
};

function weekStart(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(x.getTime() - day * DAY);
}

async function computeAnalytics(orgId: string, postingId?: string) {
  const jobs = await db.select().from(jobPostings).where(and(eq(jobPostings.orgId, orgId), postingId ? eq(jobPostings.id, postingId) : undefined));
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const apps = jobs.length
    ? await db
        .select({ id: jobApplications.id, postingId: jobApplications.postingId, stage: jobApplications.stage, status: jobApplications.status, source: jobApplications.source, appliedAt: jobApplications.appliedAt, candidateId: jobApplications.candidateId })
        .from(jobApplications)
        .where(inArray(jobApplications.postingId, jobs.map((j) => j.id)))
    : [];
  const appIds = apps.map((a) => a.id);
  const [decisions, invites, ivs, offerRows] = appIds.length
    ? await Promise.all([
        db.select().from(hiringDecisions).where(inArray(hiringDecisions.applicationId, appIds)).orderBy(asc(hiringDecisions.createdAt)),
        db.select({ assessmentId: assessmentInvites.assessmentId, userId: assessmentInvites.userId, applicationId: assessmentInvites.applicationId }).from(assessmentInvites).where(inArray(assessmentInvites.applicationId, appIds)),
        db.select({ id: interviews.id, scheduledAt: interviews.scheduledAt, status: interviews.status }).from(interviews).where(and(eq(interviews.orgId, orgId), inArray(interviews.applicationId, appIds))),
        db.select({ status: offers.status }).from(offers).where(inArray(offers.applicationId, appIds)),
      ])
    : [[], [], [], []];

  // Stage funnel.
  const stageOrder = postingId && jobs[0] ? jobs[0].stages : [...new Set([...DEFAULT_PIPELINE, ...jobs.flatMap((j) => j.stages)])];
  const reached = new Map<string, number>(stageOrder.map((s) => [s, 0]));
  const decisionsByApp = new Map<string, typeof decisions>();
  for (const d of decisions) decisionsByApp.set(d.applicationId, [...(decisionsByApp.get(d.applicationId) ?? []), d]);
  for (const a of apps) {
    const job = jobById.get(a.postingId)!;
    const visited = new Set(['applied', a.stage, ...(decisionsByApp.get(a.id) ?? []).map((d) => d.toStage)]);
    const maxIdx = Math.max(...[...visited].map((s) => job.stages.indexOf(s)));
    for (const [i, s] of job.stages.entries()) if (i <= maxIdx) reached.set(s, (reached.get(s) ?? 0) + 1);
  }
  const funnel = stageOrder.map((s, i) => {
    const n = reached.get(s) ?? 0;
    const prev = i > 0 ? (reached.get(stageOrder[i - 1]) ?? 0) : null;
    return { stage: s, label: stageLabel(s), reached: n, conversionFromPrevious: prev === null ? null : prev ? n / prev : null };
  });

  // Days in stage.
  const durations = new Map<string, number[]>();
  for (const a of apps) {
    const timeline = [{ stage: 'applied', at: a.appliedAt }, ...(decisionsByApp.get(a.id) ?? []).map((d) => ({ stage: d.toStage, at: d.createdAt }))];
    for (let i = 0; i + 1 < timeline.length; i++) {
      const s = timeline[i].stage;
      if (s === 'rejected' || s === 'withdrawn') continue;
      const days = (timeline[i + 1].at.getTime() - timeline[i].at.getTime()) / DAY;
      durations.set(s, [...(durations.get(s) ?? []), Math.max(0, days)]);
    }
  }
  const daysInStage = stageOrder
    .filter((s) => s !== 'hired')
    .map((s) => {
      const list = durations.get(s) ?? [];
      return { stage: s, label: stageLabel(s), averageDays: list.length ? Math.round((list.reduce((x, y) => x + y, 0) / list.length) * 10) / 10 : null, samples: list.length };
    });

  // Assessment completion.
  let completed = 0;
  if (invites.length) {
    const byAssessment = new Map<string, string[]>();
    for (const i of invites) byAssessment.set(i.assessmentId, [...(byAssessment.get(i.assessmentId) ?? []), i.userId]);
    for (const [aid, uids] of byAssessment) {
      const rows = await db
        .select({ userId: attempts.userId })
        .from(attempts)
        .where(and(eq(attempts.assessmentId, aid), inArray(attempts.userId, uids), sql`${attempts.status} <> 'in_progress'`))
        .groupBy(attempts.userId);
      completed += rows.length;
    }
  }

  // Interview throughput (last 8 weeks + next week).
  const start = weekStart(new Date(Date.now() - 7 * 7 * DAY));
  const weeks = Array.from({ length: 9 }, (_, i) => new Date(start.getTime() + i * 7 * DAY));
  const throughput = weeks.map((w) => {
    const end = w.getTime() + 7 * DAY;
    const inWeek = ivs.filter((iv) => iv.scheduledAt.getTime() >= w.getTime() && iv.scheduledAt.getTime() < end);
    return { weekStart: w.toISOString().slice(0, 10), scheduled: inWeek.filter((i) => i.status !== 'cancelled').length, completed: inWeek.filter((i) => i.status === 'completed').length };
  });

  const offerCount = (s: string) => offerRows.filter((o) => o.status === s).length;
  const accepted = offerCount('accepted');
  const declined = offerCount('declined');
  const hired = apps.filter((a) => a.status === 'hired').length;
  const sources = Object.entries(apps.reduce<Record<string, number>>((m, a) => ({ ...m, [a.source]: (m[a.source] ?? 0) + 1 }), {})).map(([source, count]) => ({ source, count }));
  const perJob = jobs
    .map((j) => {
      const ja = apps.filter((a) => a.postingId === j.id);
      return {
        postingId: j.id,
        title: j.title,
        status: j.status,
        applications: ja.length,
        active: ja.filter((a) => a.status === 'active').length,
        inInterview: ja.filter((a) => a.stage === 'interview').length,
        offers: ja.filter((a) => a.stage === 'offer').length,
        hired: ja.filter((a) => a.status === 'hired').length,
        rejected: ja.filter((a) => a.status === 'rejected').length,
      };
    })
    .sort((a, b) => b.applications - a.applications);

  return {
    scope: postingId ? { kind: 'job', postingId, title: jobs[0]?.title ?? null } : { kind: 'organization' },
    totals: {
      applications: apps.length,
      active: apps.filter((a) => a.status === 'active').length,
      hired,
      rejected: apps.filter((a) => a.status === 'rejected').length,
      withdrawn: apps.filter((a) => a.status === 'withdrawn' || a.status === 'declined').length,
      applicationConversion: apps.length ? hired / apps.length : null,
    },
    funnel,
    assessment: { invited: invites.length, completed, completionRate: invites.length ? completed / invites.length : null },
    interviews: { throughput, total: ivs.filter((i) => i.status !== 'cancelled').length, completed: ivs.filter((i) => i.status === 'completed').length },
    daysInStage,
    offers: { extended: offerRows.filter((o) => o.status !== 'draft').length, accepted, declined, expired: offerCount('expired'), rescinded: offerCount('rescinded'), acceptanceRate: accepted + declined ? accepted / (accepted + declined) : null },
    sources,
    perJob,
    definitions: ANALYTICS_DEFINITIONS,
  };
}

insightRoutes.get('/analytics', async (c) => {
  const { orgId } = hireOrg(c, MANAGE_ROLES);
  const q = query(c, z.object({ postingId: z.string().uuid().optional() }));
  if (q.postingId) await loadJob(c, q.postingId);
  return c.json(await computeAnalytics(orgId, q.postingId));
});

insightRoutes.get('/overview', async (c) => {
  const auth = requireAuth(c);
  const { orgId, canManage } = hireOrg(c);
  const q = query(c, z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() }));
  const dayStart = q.from ? new Date(q.from) : new Date(new Date().setUTCHours(0, 0, 0, 0));
  const dayEnd = q.to ? new Date(q.to) : new Date(dayStart.getTime() + DAY);
  const assigned = canManage ? null : await assignedApplicationIds(orgId, auth.user.id);

  const [openJobs, today, pending] = await Promise.all([
    db.select().from(jobPostings).where(and(eq(jobPostings.orgId, orgId), eq(jobPostings.status, 'published'))).orderBy(asc(jobPostings.title)),
    db
      .select({ iv: interviews, candidateName: users.name })
      .from(interviews)
      .innerJoin(users, eq(users.id, interviews.candidateId))
      .where(and(eq(interviews.orgId, orgId), gte(interviews.scheduledAt, dayStart), lte(interviews.scheduledAt, dayEnd), sql`${interviews.status} <> 'cancelled'`, canManage ? undefined : sql`${auth.user.id}::uuid = ANY(${interviews.interviewerIds})`))
      .orderBy(asc(interviews.scheduledAt)),
    db
      .select({ id: interviews.id, title: interviews.title, scheduledAt: interviews.scheduledAt, candidateName: users.name })
      .from(interviews)
      .innerJoin(users, eq(users.id, interviews.candidateId))
      .where(
        and(
          eq(interviews.orgId, orgId),
          sql`${auth.user.id}::uuid = ANY(${interviews.interviewerIds})`,
          sql`${interviews.status} <> 'cancelled'`,
          lte(interviews.scheduledAt, new Date()),
          sql`NOT EXISTS (select 1 from interview_feedback f where f.interview_id = ${interviews.id} and f.interviewer_id = ${auth.user.id}::uuid)`,
        ),
      )
      .orderBy(asc(interviews.scheduledAt)),
  ]);
  const counts = openJobs.length
    ? await db
        .select({ postingId: jobApplications.postingId, stage: jobApplications.stage, n: sql<number>`count(*)::int` })
        .from(jobApplications)
        .where(inArray(jobApplications.postingId, openJobs.map((j) => j.id)))
        .groupBy(jobApplications.postingId, jobApplications.stage)
    : [];
  let awaiting: { id: string; candidateName: string; jobTitle: string; stage: string; stageLabel: string; waitingDays: number }[] = [];
  let unreadTotal = 0;
  let extendedOffers = 0;
  let interviewsMissingFeedback = 0;
  if (canManage) {
    const rows = await db
      .select({ id: jobApplications.id, stage: jobApplications.stage, updatedAt: jobApplications.updatedAt, candidateName: users.name, jobTitle: jobPostings.title })
      .from(jobApplications)
      .innerJoin(users, eq(users.id, jobApplications.candidateId))
      .innerJoin(jobPostings, eq(jobPostings.id, jobApplications.postingId))
      .where(and(eq(jobApplications.orgId, orgId), eq(jobApplications.status, 'active'), inArray(jobApplications.stage, ['applied', 'eligibility_review'])))
      .orderBy(asc(jobApplications.updatedAt))
      .limit(10);
    awaiting = rows.map((r) => ({ id: r.id, candidateName: r.candidateName, jobTitle: r.jobTitle, stage: r.stage, stageLabel: stageLabel(r.stage), waitingDays: Math.floor((Date.now() - r.updatedAt.getTime()) / DAY) }));
    const activeIds = await db.select({ id: jobApplications.id }).from(jobApplications).where(and(eq(jobApplications.orgId, orgId), eq(jobApplications.status, 'active')));
    unreadTotal = [...(await unreadCounts(activeIds.map((a) => a.id), auth.user.id)).values()].reduce((a, b) => a + b, 0);
    [{ n: extendedOffers }] = await db.select({ n: sql<number>`count(*)::int` }).from(offers).where(and(eq(offers.orgId, orgId), eq(offers.status, 'extended')));
    [{ n: interviewsMissingFeedback }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(interviews)
      .where(and(eq(interviews.orgId, orgId), sql`${interviews.status} <> 'cancelled'`, lte(interviews.scheduledAt, new Date()), sql`NOT EXISTS (select 1 from interview_feedback f where f.interview_id = ${interviews.id})`));
  }
  const names = await userNames(today.flatMap((t) => t.iv.interviewerIds));
  return c.json({
    canManage,
    assignedCandidates: assigned?.length ?? null,
    openJobs: openJobs.map((j) => {
      const m = Object.fromEntries(counts.filter((x) => x.postingId === j.id).map((x) => [x.stage, Number(x.n)]));
      return { id: j.id, title: j.title, location: j.location, closesAt: j.closesAt, stages: j.stages.map((s) => ({ key: s, label: stageLabel(s), count: m[s] ?? 0 })), total: Object.values(m).reduce((a, b) => a + b, 0) };
    }),
    awaiting,
    todaysInterviews: today.map((t) => ({ id: t.iv.id, title: t.iv.title, candidateName: t.candidateName, scheduledAt: t.iv.scheduledAt, durationMinutes: t.iv.durationMinutes, meetingUrl: t.iv.meetingUrl, interviewers: t.iv.interviewerIds.map((id) => names.get(id) ?? 'Former member'), applicationId: t.iv.applicationId })),
    pendingFeedback: pending,
    counters: { unreadMessages: unreadTotal, extendedOffers: Number(extendedOffers), interviewsMissingFeedback: Number(interviewsMissingFeedback) },
  });
});

// ---------- CSV exports (permission-checked + audited) ----------

function csvResponse(c: Parameters<typeof requireAuth>[0], filename: string, csv: string) {
  c.header('content-type', 'text/csv; charset=utf-8');
  c.header('content-disposition', `attachment; filename="${filename}"`);
  c.header('cache-control', 'no-store');
  return c.body(csv);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'job';

insightRoutes.get('/exports/pipeline.csv', async (c) => {
  const q = query(c, z.object({ postingId: z.string().uuid({ message: 'Choose a job to export.' }).optional() }));
  if (!q.postingId) throw badRequest('Choose a job to export.', { fields: { postingId: 'Choose a job.' } });
  const job: Job = await loadJob(c, q.postingId, 'manage');
  const rows = await db
    .select({ app: jobApplications, name: users.name })
    .from(jobApplications)
    .innerJoin(users, eq(users.id, jobApplications.candidateId))
    .where(eq(jobApplications.postingId, job.id))
    .orderBy(asc(jobApplications.appliedAt));
  const ids = rows.map((r) => r.app.id);
  const [ivs, fb] = ids.length
    ? await Promise.all([
        db.select({ id: interviews.id, applicationId: interviews.applicationId }).from(interviews).where(inArray(interviews.applicationId, ids)),
        db.select({ interviewId: interviewFeedback.interviewId, recommendation: interviewFeedback.recommendation }).from(interviewFeedback).innerJoin(interviews, eq(interviews.id, interviewFeedback.interviewId)).where(inArray(interviews.applicationId, ids)),
      ])
    : [[], []];
  const out: unknown[][] = [];
  for (const r of rows) {
    const { score, factors } = skillFactors(job.requiredSkills, await computeSkillDna(r.app.candidateId));
    const myIv = ivs.filter((i) => i.applicationId === r.app.id).map((i) => i.id);
    out.push([
      r.app.id,
      r.name,
      stageLabel(r.app.stage),
      r.app.status,
      r.app.source,
      r.app.appliedAt,
      r.app.updatedAt,
      score,
      `${factors.filter((f) => f.required && f.outcome === 'met').length}/${factors.filter((f) => f.required).length}`,
      factors.map((f) => `${f.name}: ${f.evidence}`).join('; '),
      myIv.length,
      fb.filter((f) => myIv.includes(f.interviewId)).map((f) => f.recommendation).join('; '),
    ]);
  }
  await audit(c, { action: 'hire.export.pipeline', orgId: job.orgId, targetType: 'job_posting', targetId: job.id, meta: { rows: out.length } });
  return csvResponse(
    c,
    `pipeline-${slug(job.title)}.csv`,
    toCsv(['application_id', 'candidate', 'stage', 'status', 'source', 'applied_at', 'updated_at', 'match_score', 'required_skills_met', 'skill_evidence', 'interviews', 'interview_recommendations'], out),
  );
});

insightRoutes.get('/exports/decisions.csv', async (c) => {
  const { orgId } = hireOrg(c, ADMIN_ROLES);
  const q = query(c, z.object({ postingId: z.string().uuid().optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() }));
  if (q.postingId) await loadJob(c, q.postingId, 'manage');
  const rows = await db
    .select({ d: hiringDecisions, jobTitle: jobPostings.title, candidateName: users.name, candidateId: jobApplications.candidateId })
    .from(hiringDecisions)
    .innerJoin(jobApplications, eq(jobApplications.id, hiringDecisions.applicationId))
    .innerJoin(jobPostings, eq(jobPostings.id, jobApplications.postingId))
    .innerJoin(users, eq(users.id, jobApplications.candidateId))
    .where(
      and(
        eq(hiringDecisions.orgId, orgId),
        q.postingId ? eq(jobApplications.postingId, q.postingId) : undefined,
        q.from ? gte(hiringDecisions.createdAt, new Date(q.from)) : undefined,
        q.to ? lte(hiringDecisions.createdAt, new Date(q.to)) : undefined,
      ),
    )
    .orderBy(asc(hiringDecisions.createdAt))
    .limit(20000);
  const names = await userNames(rows.map((r) => r.d.decidedBy));
  const out = rows.map((r) => [r.d.createdAt, r.jobTitle, r.candidateName, r.d.applicationId, stageLabel(r.d.fromStage), stageLabel(r.d.toStage), r.d.reason, r.d.visibleToCandidate ? 'yes' : 'no', r.d.decidedBy === r.candidateId ? 'Candidate' : (names.get(r.d.decidedBy) ?? 'Former member')]);
  await audit(c, { action: 'hire.export.decisions', orgId, meta: { rows: out.length, postingId: q.postingId ?? null } });
  return csvResponse(c, 'hiring-decisions.csv', toCsv(['decided_at', 'job', 'candidate', 'application_id', 'from_stage', 'to_stage', 'reason', 'visible_to_candidate', 'decided_by'], out));
});
