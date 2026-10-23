import { Hono } from 'hono';
import { z } from 'zod';
import { and, count, desc, eq, gt, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { externalJobs, hiringDecisions, jobApplications, jobPostings, organizations, savedJobs, applications } from '../../db/schema';
import { type AppEnv, requireAuth, requirePlatformAdmin } from '../../lib/context';
import { body, idParam, query } from '../../lib/validate';
import { notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { rateLimit } from '../../lib/ratelimit';
import { clientIp } from '../../lib/context';
import { computeSkillDna } from '../learning/skilldna';
import { applyToPosting, postingMatch, visibleWhere, withdrawPlatformApplication } from './service';
import { ATTRIBUTION, FEED_IDS, feedStatus, syncFeed, type FeedId, backgroundSyncEnabled } from './feeds';
import { ensureFeedSyncScheduled } from './jobs';

/** Mounted at /api/jobs. */
export const jobsRoutes = new Hono<AppEnv>();

jobsRoutes.use('*', async (_c, next) => {
  ensureFeedSyncScheduled();
  await next();
});

const escLike = (s: string) => `%${s.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

// ---------- External feed (cached) ----------

const externalQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(120).optional(),
  source: z.enum(FEED_IDS as [FeedId, ...FeedId[]]).optional(),
  location: z.string().trim().max(80).optional(),
});

function externalWhere(q: z.infer<typeof externalQuery>) {
  return and(
    or(isNull(externalJobs.expiresAt), gt(externalJobs.expiresAt, new Date())),
    q.source ? eq(externalJobs.source, q.source) : undefined,
    q.q ? or(ilike(externalJobs.title, escLike(q.q)), ilike(externalJobs.company, escLike(q.q)), sql`array_to_string(${externalJobs.tags}, ' ') ILIKE ${escLike(q.q)}`) : undefined,
    q.location ? ilike(externalJobs.location, escLike(q.location)) : undefined,
  );
}

function withAttribution<T extends { source: string; fetchedAt: Date | string }>(j: T) {
  const a = ATTRIBUTION[j.source as FeedId] ?? { label: j.source, homepage: '', applyLabel: 'Apply on original site' };
  return { ...j, attribution: { source: j.source, label: a.label, homepage: a.homepage, applyLabel: a.applyLabel, text: `Listed on ${a.label}, fetched ${new Date(j.fetchedAt).toISOString()}` } };
}

async function listExternal(q: z.infer<typeof externalQuery>, withDescription = false) {
  const where = externalWhere(q);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: externalJobs.id,
        source: externalJobs.source,
        title: externalJobs.title,
        company: externalJobs.company,
        location: externalJobs.location,
        url: externalJobs.url,
        tags: externalJobs.tags,
        publishedAt: externalJobs.publishedAt,
        fetchedAt: externalJobs.fetchedAt,
        expiresAt: externalJobs.expiresAt,
        ...(withDescription ? { description: externalJobs.description } : {}),
      })
      .from(externalJobs)
      .where(where)
      .orderBy(desc(externalJobs.publishedAt), desc(externalJobs.fetchedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ n: count() }).from(externalJobs).where(where),
  ]);
  return { items: rows.map(withAttribution), total: n, page: q.page, pageSize: q.pageSize };
}

/** Public, no account needed (Remotive terms: listings must not be behind signup). External jobs only. */
jobsRoutes.get('/feed/public', async (c) => {
  rateLimit(`jobs-public:${clientIp(c)}`, 120, 60_000);
  const q = query(c, externalQuery);
  const [list, sources] = await Promise.all([listExternal(q), feedStatus()]);
  return c.json({
    ...list,
    sources: sources.map((s) => ({ source: s.source, label: s.label, homepage: s.homepage, enabled: s.enabled, lastSuccessAt: s.lastSuccessAt, lastStatus: s.lastStatus, lastError: s.lastError ? 'The last sync failed. Showing the most recent successful results.' : null, cachedJobs: s.cachedJobs })),
    backgroundSync: backgroundSyncEnabled(),
    notice: 'These listings come from public job APIs (Jobicy, Himalayas, Remotive). We link to the original posting; apply on the source site.',
  });
});

jobsRoutes.get('/feeds/status', async (c) => {
  requireAuth(c);
  return c.json({ sources: await feedStatus() });
});

jobsRoutes.post('/feeds/sync-now', async (c) => {
  requirePlatformAdmin(c);
  const { source } = await body(c, z.object({ source: z.enum(FEED_IDS as [FeedId, ...FeedId[]]).optional() }));
  const results = [];
  for (const s of source ? [source] : FEED_IDS) results.push(await syncFeed(s, { trigger: 'admin' }));
  await audit(c, { action: 'jobs.feeds.sync_now', targetType: 'job_feed', meta: { results: results.map((r) => ({ source: r.source, status: r.status, fetched: r.fetched })) } });
  return c.json({ results, sources: await feedStatus() });
});

jobsRoutes.get('/external', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, externalQuery);
  const [list, sources, saved] = await Promise.all([listExternal(q), feedStatus(), db.select({ refId: savedJobs.refId }).from(savedJobs).where(and(eq(savedJobs.userId, auth.user.id), eq(savedJobs.kind, 'external')))]);
  const savedSet = new Set(saved.map((s) => s.refId));
  return c.json({ ...list, items: list.items.map((i) => ({ ...i, saved: savedSet.has(i.id) })), sources, backgroundSync: backgroundSyncEnabled() });
});

jobsRoutes.get('/external/:id', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const [j] = await db.select().from(externalJobs).where(and(eq(externalJobs.id, id), or(isNull(externalJobs.expiresAt), gt(externalJobs.expiresAt, new Date()))));
  if (!j) throw notFound('Job');
  const [saved] = await db.select({ id: savedJobs.id }).from(savedJobs).where(and(eq(savedJobs.userId, auth.user.id), eq(savedJobs.kind, 'external'), eq(savedJobs.refId, j.id)));
  const [tracked] = await db.select({ id: applications.id, status: applications.status }).from(applications).where(and(eq(applications.userId, auth.user.id), eq(applications.sourceUrl, j.url)));
  return c.json({ job: withAttribution(j), saved: !!saved, tracked: tracked ?? null });
});

// ---------- Saved jobs ----------

jobsRoutes.get('/saved', async (c) => {
  const auth = requireAuth(c);
  const rows = await db.select().from(savedJobs).where(eq(savedJobs.userId, auth.user.id)).orderBy(desc(savedJobs.createdAt));
  const extIds = rows.filter((r) => r.kind === 'external').map((r) => r.refId);
  const postIds = rows.filter((r) => r.kind === 'platform').map((r) => r.refId);
  const [ext, posts] = await Promise.all([
    extIds.length ? db.select().from(externalJobs).where(inArray(externalJobs.id, extIds)) : [],
    postIds.length ? db.select({ id: jobPostings.id, title: jobPostings.title, location: jobPostings.location, status: jobPostings.status, orgName: organizations.name }).from(jobPostings).innerJoin(organizations, eq(organizations.id, jobPostings.orgId)).where(inArray(jobPostings.id, postIds)) : [],
  ]);
  const items = rows.map((r) => {
    if (r.kind === 'external') {
      const j = ext.find((x) => x.id === r.refId);
      return { id: r.id, kind: r.kind, refId: r.refId, savedAt: r.createdAt, available: !!j, title: j?.title ?? 'Listing no longer available', company: j?.company ?? '', location: j?.location ?? null, link: `/app/jobs/external/${r.refId}`, source: j?.source ?? null };
    }
    const p = posts.find((x) => x.id === r.refId);
    return { id: r.id, kind: r.kind, refId: r.refId, savedAt: r.createdAt, available: p?.status === 'published', title: p?.title ?? 'Posting no longer available', company: p?.orgName ?? '', location: p?.location ?? null, link: `/app/jobs/${r.refId}`, source: 'platform' };
  });
  return c.json({ items, total: items.length });
});

jobsRoutes.post('/saved', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ kind: z.enum(['platform', 'external']), refId: z.string().uuid(), note: z.string().trim().max(500).optional() }));
  if (input.kind === 'external') {
    const [j] = await db.select({ id: externalJobs.id }).from(externalJobs).where(eq(externalJobs.id, input.refId));
    if (!j) throw notFound('Job');
  } else {
    const [p] = await db.select({ id: jobPostings.id }).from(jobPostings).where(and(eq(jobPostings.id, input.refId), await visibleWhere(auth)));
    if (!p) throw notFound('Job');
  }
  const [row] = await db.insert(savedJobs).values({ userId: auth.user.id, ...input }).onConflictDoNothing().returning();
  return c.json({ saved: true, id: row?.id ?? null }, row ? 201 : 200);
});

jobsRoutes.delete('/saved/:kind/:refId', async (c) => {
  const auth = requireAuth(c);
  const kind = z.enum(['platform', 'external']).parse(c.req.param('kind'));
  const refId = idParam(c, 'refId');
  await db.delete(savedJobs).where(and(eq(savedJobs.userId, auth.user.id), eq(savedJobs.kind, kind), eq(savedJobs.refId, refId)));
  return c.json({ saved: false });
});

// ---------- Candidate's platform applications ----------

jobsRoutes.get('/my/applications', async (c) => {
  const auth = requireAuth(c);
  const rows = await db
    .select({ app: jobApplications, title: jobPostings.title, location: jobPostings.location, postingStatus: jobPostings.status, orgName: organizations.name })
    .from(jobApplications)
    .innerJoin(jobPostings, eq(jobPostings.id, jobApplications.postingId))
    .innerJoin(organizations, eq(organizations.id, jobApplications.orgId))
    .where(eq(jobApplications.candidateId, auth.user.id))
    .orderBy(desc(jobApplications.appliedAt));
  const ids = rows.map((r) => r.app.id);
  const decisions = ids.length
    ? await db.select({ applicationId: hiringDecisions.applicationId, toStage: hiringDecisions.toStage, reason: hiringDecisions.reason, createdAt: hiringDecisions.createdAt }).from(hiringDecisions).where(and(inArray(hiringDecisions.applicationId, ids), eq(hiringDecisions.visibleToCandidate, true)))
    : [];
  const personal = ids.length ? await db.select({ id: applications.id, jobApplicationId: applications.jobApplicationId }).from(applications).where(and(eq(applications.userId, auth.user.id), inArray(applications.jobApplicationId, ids))) : [];
  return c.json({
    items: rows.map((r) => ({
      id: r.app.id,
      postingId: r.app.postingId,
      title: r.title,
      company: r.orgName,
      location: r.location,
      stage: r.app.stage,
      status: r.app.status,
      appliedAt: r.app.appliedAt,
      portfolioShared: r.app.portfolioShared,
      postingStatus: r.postingStatus,
      trackerId: personal.find((p) => p.jobApplicationId === r.app.id)?.id ?? null,
      updates: decisions.filter((d) => d.applicationId === r.app.id),
    })),
    total: rows.length,
  });
});

jobsRoutes.post('/applications/:id/withdraw', async (c) => {
  const auth = requireAuth(c);
  const { reason } = await body(c, z.object({ reason: z.string().trim().max(500).optional() }));
  const updated = await withdrawPlatformApplication(c, auth.user.id, idParam(c), reason);
  return c.json({ application: { id: updated.id, status: updated.status } });
});

// ---------- Platform postings ----------

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(120).optional(),
  location: z.string().trim().max(80).optional(),
  workplace: z.enum(['onsite', 'hybrid', 'remote']).optional(),
  type: z.enum(['full_time', 'internship', 'contract', 'part_time']).optional(),
  skills: z.string().trim().max(400).optional(), // comma-separated slugs
});

jobsRoutes.get('/', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, listQuery);
  const skillSlugs = q.skills ? q.skills.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10) : [];
  const where = and(
    await visibleWhere(auth),
    q.q ? or(ilike(jobPostings.title, escLike(q.q)), ilike(jobPostings.description, escLike(q.q)), ilike(organizations.name, escLike(q.q))) : undefined,
    q.location ? ilike(jobPostings.location, escLike(q.location)) : undefined,
    q.workplace ? eq(jobPostings.workplace, q.workplace) : undefined,
    q.type ? eq(jobPostings.employmentType, q.type) : undefined,
    skillSlugs.length ? or(...skillSlugs.map((s) => sql`${jobPostings.requiredSkills} @> ${JSON.stringify([{ slug: s }])}::jsonb`)) : undefined,
  );
  const [rows, [{ n }], dna, saved, applied] = await Promise.all([
    db
      .select({ p: jobPostings, orgName: organizations.name, orgIsSample: organizations.isSample })
      .from(jobPostings)
      .innerJoin(organizations, eq(organizations.id, jobPostings.orgId))
      .where(where)
      .orderBy(desc(jobPostings.publishedAt), desc(jobPostings.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ n: count() }).from(jobPostings).innerJoin(organizations, eq(organizations.id, jobPostings.orgId)).where(where),
    computeSkillDna(auth.user.id),
    db.select({ refId: savedJobs.refId }).from(savedJobs).where(and(eq(savedJobs.userId, auth.user.id), eq(savedJobs.kind, 'platform'))),
    db.select({ postingId: jobApplications.postingId, status: jobApplications.status }).from(jobApplications).where(eq(jobApplications.candidateId, auth.user.id)),
  ]);
  const savedSet = new Set(saved.map((s) => s.refId));
  return c.json({
    items: rows.map(({ p, orgName, orgIsSample }) => ({
      id: p.id,
      title: p.title,
      team: p.team,
      company: orgName,
      isSample: orgIsSample,
      location: p.location,
      workplace: p.workplace,
      employmentType: p.employmentType,
      salaryText: p.salaryText,
      campusOnly: p.campusOnly,
      publishedAt: p.publishedAt,
      closesAt: p.closesAt,
      match: postingMatch(p, dna),
      saved: savedSet.has(p.id),
      applied: applied.find((a) => a.postingId === p.id)?.status ?? null,
    })),
    total: n,
    page: q.page,
    pageSize: q.pageSize,
  });
});

jobsRoutes.get('/:id', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const [mine] = await db.select().from(jobApplications).where(and(eq(jobApplications.postingId, id), eq(jobApplications.candidateId, auth.user.id)));
  const [row] = await db
    .select({ p: jobPostings, orgName: organizations.name, orgIsSample: organizations.isSample, orgWebsite: organizations.website })
    .from(jobPostings)
    .innerJoin(organizations, eq(organizations.id, jobPostings.orgId))
    .where(and(eq(jobPostings.id, id), mine ? sql`${jobPostings.status} <> 'draft'` : await visibleWhere(auth)));
  if (!row) throw notFound('Job');
  const dna = await computeSkillDna(auth.user.id);
  const [saved] = await db.select({ id: savedJobs.id }).from(savedJobs).where(and(eq(savedJobs.userId, auth.user.id), eq(savedJobs.kind, 'platform'), eq(savedJobs.refId, id)));
  const p = row.p;
  const open = p.status === 'published' && (!p.closesAt || new Date(p.closesAt).getTime() > Date.now());
  return c.json({
    job: {
      id: p.id,
      title: p.title,
      team: p.team,
      company: row.orgName,
      companyWebsite: row.orgWebsite,
      isSample: row.orgIsSample,
      location: p.location,
      workplace: p.workplace,
      employmentType: p.employmentType,
      description: p.description,
      responsibilities: p.responsibilities,
      requiredSkills: p.requiredSkills,
      eligibility: p.eligibility,
      salaryText: p.salaryText,
      openings: p.openings,
      status: p.status,
      publishedAt: p.publishedAt,
      closesAt: p.closesAt,
      campusOnly: p.campusOnly,
      open,
    },
    match: postingMatch(p, dna),
    saved: !!saved,
    myApplication: mine ? { id: mine.id, stage: mine.stage, status: mine.status, appliedAt: mine.appliedAt, portfolioShared: mine.portfolioShared } : null,
  });
});

jobsRoutes.post('/:id/apply', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  rateLimit(`jobs-apply:${auth.user.id}`, 30, 3600_000);
  const input = await body(c, z.object({ resumeId: z.string().uuid().nullable().optional(), coverNote: z.string().trim().max(4000).nullable().optional(), sharePortfolio: z.boolean().default(false) }));
  const dna = await computeSkillDna(auth.user.id);
  const result = await applyToPosting(c, auth, id, input, dna);
  return c.json(result, 201);
});
