import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  resources,
  resourceVersions,
  resourceReviews,
  readingHistory,
  bookmarks,
  reports,
  users,
  tracks,
  topics,
  enrollments,
  topicProgress,
  questions,
  skills,
  organizations,
} from '../../db/schema';
import { type AppEnv, type AuthContext, type Ctx, isPlatformAdmin, requireActiveOrg, requireAuth, requirePlatformAdmin, rolesIn } from '../../lib/context';
import { body, idParam, query, patchSchema } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { rateLimit } from '../../lib/ratelimit';
import { OBJECTIVE_TYPES } from '../../lib/grading';
import { assertTrackEditor } from '../learning/routes';
import { resolveSkillSlugs, skillMap } from '../library/service';
import type { OrgRole } from '@shared/roles';
import { ref } from '../../lib/sql';

/** Mounted at /api/create. */
export const createRoutes = new Hono<AppEnv>();

export const EDITOR_ROLES: OrgRole[] = ['creator', 'faculty', 'faculty_admin', 'org_admin'];
const KINDS = ['article', 'video', 'docs', 'cheatsheet', 'course', 'exercise', 'interview', 'link'] as const;
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
const escapeLike = (s: string) => s.replace(/[%_\\]/g, (m) => '\\' + m);

const isEditorIn = (auth: AuthContext, orgId: string | null | undefined) => !!orgId && rolesIn(auth, orgId).some((r) => EDITOR_ROLES.includes(r));
const activeEditorOrg = (auth: AuthContext) => (isEditorIn(auth, auth.session.activeOrgId) ? auth.session.activeOrgId : null);

// ======================================================================
// Resources
// ======================================================================

const httpUrl = z
  .string()
  .trim()
  .url('Enter a full URL starting with https://')
  .max(1000)
  .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) links are allowed.');

const resourceFields = {
  kind: z.enum(KINDS),
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(200),
  summary: z.string().trim().max(600).default(''),
  body: z.string().max(200_000).nullable().optional(),
  url: httpUrl.nullable().optional(),
  sourceName: z.string().trim().max(200).nullable().optional(),
  license: z.string().trim().max(200).nullable().optional(),
  topics: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(12).default([]),
  languages: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).default([]),
  roles: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  difficulty: z.enum(DIFFICULTIES).default('beginner'),
  skillSlugs: z.array(z.string().trim().max(80)).max(10).default([]),
  downloadable: z.boolean().default(false),
};

const createResourceInput = z.object({ scope: z.enum(['org', 'public']), ...resourceFields });
const updateResourceInput = patchSchema(z.object(resourceFields))
  .extend({ changeNote: z.string().trim().max(300).optional() });

/** Content rules: authored markdown, or an external link with mandatory attribution. */
function checkContent(v: { body?: string | null; url?: string | null; sourceName?: string | null }) {
  const hasBody = !!v.body?.trim();
  const hasUrl = !!v.url?.trim();
  if (!hasBody && !hasUrl) throw badRequest('Add a markdown body or an external link.', { fields: { body: 'Add content or a link', url: 'Add content or a link' } });
  if (hasUrl && !v.sourceName?.trim()) throw badRequest('External links need source attribution.', { fields: { sourceName: 'Name the source (for example the publisher or site)' } });
}

function canEditResource(auth: AuthContext, r: { orgId: string | null; authorId: string | null }) {
  if (r.orgId) return isEditorIn(auth, r.orgId);
  return r.authorId === auth.user.id || isPlatformAdmin(auth);
}

async function loadEditableResource(c: Ctx, id: string) {
  const auth = requireAuth(c);
  const [r] = await db.select().from(resources).where(eq(resources.id, id));
  // Other orgs' drafts and other people's submissions are indistinguishable from missing.
  if (!r || !canEditResource(auth, r)) throw notFound('Resource');
  return { auth, r };
}

async function resourceStats(ids: string[]) {
  if (!ids.length) return new Map<string, { completions: number; readers: number; bookmarks: number; openReports: number }>();
  const [hist, bms, reps] = await Promise.all([
    db
      .select({ id: readingHistory.resourceId, readers: sql<number>`count(*)::int`, completions: sql<number>`count(*) filter (where ${readingHistory.completed})::int` })
      .from(readingHistory)
      .where(inArray(readingHistory.resourceId, ids))
      .groupBy(readingHistory.resourceId),
    db
      .select({ id: bookmarks.targetId, n: sql<number>`count(*)::int` })
      .from(bookmarks)
      .where(and(eq(bookmarks.targetType, 'resource'), inArray(bookmarks.targetId, ids)))
      .groupBy(bookmarks.targetId),
    db
      .select({ id: reports.targetId, n: sql<number>`count(*)::int` })
      .from(reports)
      .where(and(eq(reports.targetType, 'resource'), eq(reports.status, 'open'), inArray(reports.targetId, ids)))
      .groupBy(reports.targetId),
  ]);
  return new Map(
    ids.map((id) => [
      id,
      {
        completions: hist.find((h) => h.id === id)?.completions ?? 0,
        readers: hist.find((h) => h.id === id)?.readers ?? 0,
        bookmarks: bms.find((b) => b.id === id)?.n ?? 0,
        openReports: reps.find((r) => r.id === id)?.n ?? 0,
      },
    ]),
  );
}

function resourceSummary(r: typeof resources.$inferSelect, stats?: { completions: number; readers: number; bookmarks: number; openReports: number }) {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    summary: r.summary,
    status: r.status,
    scope: r.orgId ? ('org' as const) : ('public' as const),
    orgId: r.orgId,
    authorId: r.authorId,
    version: r.version,
    difficulty: r.difficulty,
    url: r.url,
    sourceName: r.sourceName,
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
    lastReviewedAt: r.lastReviewedAt,
    analytics: {
      views: r.viewCount,
      ratingCount: r.ratingCount,
      ratingAvg: r.ratingCount ? Math.round((r.ratingSum / r.ratingCount) * 10) / 10 : null,
      completions: stats?.completions ?? 0,
      readers: stats?.readers ?? 0,
      bookmarks: stats?.bookmarks ?? 0,
      openReports: stats?.openReports ?? 0,
    },
  };
}

/** Resources the caller may manage: own public submissions, the active org's library, and (platform admins) the whole public library. */
function manageableWhere(auth: AuthContext, scope: 'all' | 'org' | 'public' | 'mine') {
  const orgId = activeEditorOrg(auth);
  const mine = and(isNull(resources.orgId), eq(resources.authorId, auth.user.id));
  const org = orgId ? eq(resources.orgId, orgId) : sql`false`;
  const publicAll = isPlatformAdmin(auth) ? isNull(resources.orgId) : mine;
  if (scope === 'mine') return or(eq(resources.authorId, auth.user.id));
  if (scope === 'org') return org;
  if (scope === 'public') return publicAll;
  return or(org, publicAll, eq(resources.authorId, auth.user.id) as never);
}

createRoutes.get('/overview', async (c) => {
  const auth = requireAuth(c);
  const orgId = activeEditorOrg(auth);
  const where = and(manageableWhere(auth, 'all'), isPlatformAdmin(auth) ? or(eq(resources.authorId, auth.user.id), orgId ? eq(resources.orgId, orgId) : sql`false`) : undefined);
  const byStatus = await db.select({ status: resources.status, n: sql<number>`count(*)::int` }).from(resources).where(where).groupBy(resources.status);
  const mineRows = await db.select().from(resources).where(where).orderBy(desc(resources.updatedAt)).limit(200);
  const stats = await resourceStats(mineRows.map((r) => r.id));
  const totals = mineRows.reduce(
    (acc, r) => {
      const s = stats.get(r.id)!;
      acc.views += r.viewCount;
      acc.ratings += r.ratingCount;
      acc.completions += s.completions;
      acc.bookmarks += s.bookmarks;
      return acc;
    },
    { views: 0, ratings: 0, completions: 0, bookmarks: 0 },
  );
  const [paths] = orgId
    ? await db.select({ n: sql<number>`count(*)::int`, published: sql<number>`count(*) filter (where ${tracks.status} = 'published')::int` }).from(tracks).where(eq(tracks.orgId, orgId))
    : [{ n: 0, published: 0 }];
  const [queue] = isPlatformAdmin(auth)
    ? await db.select({ n: sql<number>`count(*)::int` }).from(resources).where(and(isNull(resources.orgId), eq(resources.status, 'in_review')))
    : [{ n: 0 }];
  const org = orgId ? auth.memberships.find((m) => m.orgId === orgId) : null;
  return c.json({
    counts: Object.fromEntries(byStatus.map((s) => [s.status, s.n])),
    totals,
    drafts: mineRows.filter((r) => r.status === 'draft' || r.status === 'rejected').slice(0, 6).map((r) => resourceSummary(r, stats.get(r.id))),
    inReview: mineRows.filter((r) => r.status === 'in_review').slice(0, 6).map((r) => resourceSummary(r, stats.get(r.id))),
    top: [...mineRows].filter((r) => r.status === 'published').sort((a, b) => b.viewCount - a.viewCount).slice(0, 5).map((r) => resourceSummary(r, stats.get(r.id))),
    paths: { total: paths?.n ?? 0, published: paths?.published ?? 0 },
    activeOrg: org ? { id: org.orgId, name: org.orgName } : null,
    canAuthorOrg: !!orgId,
    isPlatformAdmin: isPlatformAdmin(auth),
    reviewQueue: queue?.n ?? 0,
  });
});

createRoutes.get('/resources', async (c) => {
  const auth = requireAuth(c);
  const q = query(
    c,
    z.object({
      scope: z.enum(['all', 'org', 'public', 'mine']).default('all'),
      status: z.enum(['draft', 'in_review', 'published', 'archived', 'rejected']).optional(),
      q: z.string().trim().max(200).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }),
  );
  const where = and(
    manageableWhere(auth, q.scope),
    q.status ? eq(resources.status, q.status) : undefined,
    q.q ? sql`${resources.title} ilike ${'%' + escapeLike(q.q) + '%'}` : undefined,
  );
  const rows = await db
    .select()
    .from(resources)
    .where(where)
    .orderBy(desc(resources.updatedAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(resources).where(where);
  const stats = await resourceStats(rows.map((r) => r.id));
  return c.json({ items: rows.map((r) => resourceSummary(r, stats.get(r.id))), total, canAuthorOrg: !!activeEditorOrg(auth) });
});

createRoutes.post('/resources', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`create-resource:${auth.user.id}`, 60, 3600_000);
  const input = await body(c, createResourceInput);
  checkContent(input);
  let orgId: string | null = null;
  if (input.scope === 'org') orgId = requireActiveOrg(c, EDITOR_ROLES).orgId;
  const { ids, missing } = await resolveSkillSlugs(input.skillSlugs);
  if (missing.length) throw badRequest(`Unknown skills: ${missing.join(', ')}`, { fields: { skillSlugs: 'Unknown skill' } });
  const { scope: _scope, skillSlugs: _s, ...fields } = input;
  const [row] = await db
    .insert(resources)
    .values({
      ...fields,
      body: fields.body?.trim() ? fields.body : null,
      url: fields.url?.trim() ? fields.url : null,
      orgId,
      authorId: auth.user.id,
      skillIds: ids,
      status: 'draft',
      version: 1,
    })
    .returning();
  await audit(c, { action: 'resource.created', orgId, targetType: 'resource', targetId: row.id, meta: { scope: input.scope } });
  return c.json({ resource: resourceSummary(row) }, 201);
});

createRoutes.get('/resources/:id', async (c) => {
  const { auth, r } = await loadEditableResource(c, idParam(c));
  const [versions, reviews, stats, sk] = await Promise.all([
    db
      .select({ id: resourceVersions.id, version: resourceVersions.version, title: resourceVersions.title, createdAt: resourceVersions.createdAt, editedBy: users.name })
      .from(resourceVersions)
      .leftJoin(users, eq(users.id, resourceVersions.editedBy))
      .where(eq(resourceVersions.resourceId, r.id))
      .orderBy(desc(resourceVersions.version)),
    db
      .select({ id: resourceReviews.id, decision: resourceReviews.decision, note: resourceReviews.note, createdAt: resourceReviews.createdAt, reviewer: users.name })
      .from(resourceReviews)
      .leftJoin(users, eq(users.id, resourceReviews.reviewerId))
      .where(eq(resourceReviews.resourceId, r.id))
      .orderBy(desc(resourceReviews.createdAt)),
    resourceStats([r.id]),
    skillMap(r.skillIds),
  ]);
  return c.json({
    resource: {
      ...resourceSummary(r, stats.get(r.id)),
      body: r.body,
      license: r.license,
      topics: r.topics,
      languages: r.languages,
      roles: r.roles,
      downloadable: r.downloadable,
      skillSlugs: r.skillIds.map((id) => sk.get(id)?.slug).filter(Boolean),
    },
    versions,
    reviews,
    permissions: {
      canPublishDirectly: r.orgId ? true : isPlatformAdmin(auth),
      mustSubmitForReview: !r.orgId && !isPlatformAdmin(auth),
    },
  });
});

createRoutes.get('/resources/:id/versions/:versionId', async (c) => {
  const { r } = await loadEditableResource(c, idParam(c));
  const [v] = await db
    .select()
    .from(resourceVersions)
    .where(and(eq(resourceVersions.id, idParam(c, 'versionId')), eq(resourceVersions.resourceId, r.id)));
  if (!v) throw notFound('Version');
  return c.json({ version: v });
});

createRoutes.patch('/resources/:id', async (c) => {
  const { auth, r } = await loadEditableResource(c, idParam(c));
  const input = await body(c, updateResourceInput);
  const admin = isPlatformAdmin(auth);
  if (r.status === 'in_review' && !admin) throw conflict('This resource is waiting for review. Withdraw the submission to edit it.');
  const merged = { body: input.body !== undefined ? input.body : r.body, url: input.url !== undefined ? input.url : r.url, sourceName: input.sourceName !== undefined ? input.sourceName : r.sourceName };
  checkContent(merged);
  let skillIds: string[] | undefined;
  if (input.skillSlugs) {
    const { ids, missing } = await resolveSkillSlugs(input.skillSlugs);
    if (missing.length) throw badRequest(`Unknown skills: ${missing.join(', ')}`, { fields: { skillSlugs: 'Unknown skill' } });
    skillIds = ids;
  }
  const { skillSlugs: _s, changeNote, ...fields } = input;
  const contentChanged =
    (fields.title !== undefined && fields.title !== r.title) ||
    (fields.body !== undefined && (fields.body || null) !== r.body) ||
    (fields.url !== undefined && (fields.url || null) !== r.url) ||
    (fields.summary !== undefined && fields.summary !== r.summary);
  if (contentChanged) {
    // Keep the previous content as a version snapshot.
    await db.insert(resourceVersions).values({ resourceId: r.id, version: r.version, title: r.title, body: r.body ?? (r.url ? `External link: ${r.url}` : null), editedBy: auth.user.id });
  }
  // Community edits to a published public resource go back through review.
  const backToReview = contentChanged && !r.orgId && !admin && r.status === 'published';
  const [row] = await db
    .update(resources)
    .set({
      ...fields,
      ...(fields.body !== undefined ? { body: fields.body?.trim() ? fields.body : null } : {}),
      ...(fields.url !== undefined ? { url: fields.url?.trim() ? fields.url : null } : {}),
      ...(skillIds ? { skillIds } : {}),
      ...(contentChanged ? { version: r.version + 1 } : {}),
      ...(backToReview ? { status: 'in_review' } : {}),
      updatedAt: new Date(),
    })
    .where(eq(resources.id, r.id))
    .returning();
  if (backToReview) await db.insert(resourceReviews).values({ resourceId: r.id, reviewerId: auth.user.id, decision: 'submitted', note: changeNote ?? 'Edited after publication', version: String(row.version) });
  return c.json({ resource: resourceSummary(row), versionBumped: contentChanged, backToReview });
});

async function notifyPlatformAdmins(title: string, bodyText: string, link: string) {
  const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.platformRole, 'platform_admin'), eq(users.status, 'active'))).limit(25);
  for (const a of admins) await notify(a.id, { type: 'resource.review_requested', category: 'general', title, body: bodyText, link, email: false });
}

createRoutes.post('/resources/:id/submit', async (c) => {
  const { auth, r } = await loadEditableResource(c, idParam(c));
  if (r.orgId) throw badRequest('Organization resources are published directly by your organization. Use Publish.');
  if (isPlatformAdmin(auth)) throw badRequest('Platform admins publish public resources directly. Use Publish.');
  if (!['draft', 'rejected'].includes(r.status)) throw conflict(`Only drafts can be submitted (this one is ${r.status.replace('_', ' ')}).`);
  rateLimit(`submit-resource:${auth.user.id}`, 10, 86400_000);
  checkContent(r);
  await db.update(resources).set({ status: 'in_review', updatedAt: new Date() }).where(eq(resources.id, r.id));
  const { note } = await body(c, z.object({ note: z.string().trim().max(500).optional() }));
  await db.insert(resourceReviews).values({ resourceId: r.id, reviewerId: auth.user.id, decision: 'submitted', note: note ?? null, version: String(r.version) });
  await audit(c, { action: 'resource.submitted', targetType: 'resource', targetId: r.id });
  await notifyPlatformAdmins('A library submission needs review', `"${r.title}" by ${auth.user.name}`, '/app/create/review');
  return c.json({ ok: true, status: 'in_review' });
});

createRoutes.post('/resources/:id/withdraw', async (c) => {
  const { r } = await loadEditableResource(c, idParam(c));
  if (r.status !== 'in_review') throw conflict('Only submissions waiting for review can be withdrawn.');
  await db.update(resources).set({ status: 'draft', updatedAt: new Date() }).where(eq(resources.id, r.id));
  return c.json({ ok: true, status: 'draft' });
});

createRoutes.post('/resources/:id/publish', async (c) => {
  const { auth, r } = await loadEditableResource(c, idParam(c));
  if (!r.orgId && !isPlatformAdmin(auth)) throw forbidden('Public library resources are published after a platform admin review. Submit it for review instead.');
  if (r.status === 'published') return c.json({ ok: true, status: 'published' });
  checkContent(r);
  await db.update(resources).set({ status: 'published', lastReviewedAt: new Date(), updatedAt: new Date() }).where(eq(resources.id, r.id));
  await audit(c, { action: 'resource.published', orgId: r.orgId, targetType: 'resource', targetId: r.id, meta: { version: r.version } });
  return c.json({ ok: true, status: 'published' });
});

createRoutes.post('/resources/:id/archive', async (c) => {
  const { r } = await loadEditableResource(c, idParam(c));
  if (r.status !== 'published') throw conflict('Only published resources can be archived.');
  await db.update(resources).set({ status: 'archived', updatedAt: new Date() }).where(eq(resources.id, r.id));
  await audit(c, { action: 'resource.archived', orgId: r.orgId, targetType: 'resource', targetId: r.id });
  return c.json({ ok: true, status: 'archived' });
});

createRoutes.post('/resources/:id/restore', async (c) => {
  const { r } = await loadEditableResource(c, idParam(c));
  if (r.status !== 'archived') throw conflict('Only archived resources can be restored.');
  await db.update(resources).set({ status: 'draft', updatedAt: new Date() }).where(eq(resources.id, r.id));
  return c.json({ ok: true, status: 'draft' });
});

createRoutes.delete('/resources/:id', async (c) => {
  const { r } = await loadEditableResource(c, idParam(c));
  if (!['draft', 'rejected'].includes(r.status)) throw conflict('Only drafts can be deleted. Archive published resources instead.');
  await db.delete(resources).where(eq(resources.id, r.id));
  await audit(c, { action: 'resource.deleted', orgId: r.orgId, targetType: 'resource', targetId: r.id, meta: { title: r.title } });
  return c.json({ ok: true });
});

createRoutes.get('/resources/:id/analytics', async (c) => {
  const { r } = await loadEditableResource(c, idParam(c));
  const stats = await resourceStats([r.id]);
  const dist = await db
    .select({ rating: sql<number>`rating`, n: sql<number>`count(*)::int` })
    .from(sql`resource_ratings`)
    .where(sql`resource_id = ${r.id}`)
    .groupBy(sql`rating`);
  return c.json({ analytics: resourceSummary(r, stats.get(r.id)).analytics, ratingDistribution: [1, 2, 3, 4, 5].map((n) => ({ rating: n, count: dist.find((d) => Number(d.rating) === n)?.n ?? 0 })) });
});

// ---------- Review queue (platform admins) ----------

createRoutes.get('/review-queue', async (c) => {
  requirePlatformAdmin(c);
  const rows = await db
    .select({ r: resources, authorName: users.name, authorEmail: users.email })
    .from(resources)
    .leftJoin(users, eq(users.id, resources.authorId))
    .where(and(isNull(resources.orgId), eq(resources.status, 'in_review')))
    .orderBy(asc(resources.updatedAt));
  const sk = await skillMap(rows.flatMap((x) => x.r.skillIds));
  return c.json({
    items: rows.map((x) => ({
      ...resourceSummary(x.r),
      body: x.r.body,
      license: x.r.license,
      topics: x.r.topics,
      skills: x.r.skillIds.map((id) => sk.get(id)).filter(Boolean).map((s) => ({ slug: s!.slug, name: s!.name })),
      author: { name: x.authorName, email: x.authorEmail },
    })),
  });
});

createRoutes.post('/review/:id', async (c) => {
  const auth = requirePlatformAdmin(c);
  const id = idParam(c);
  const input = await body(
    c,
    z
      .object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(2000).optional() })
      .refine((v) => v.decision === 'approve' || (v.note && v.note.length >= 5), { message: 'Explain what needs to change (at least 5 characters).', path: ['note'] }),
  );
  const [r] = await db.select().from(resources).where(and(eq(resources.id, id), isNull(resources.orgId)));
  if (!r) throw notFound('Resource');
  if (r.status !== 'in_review') throw conflict('This resource is not waiting for review.');
  const status = input.decision === 'approve' ? 'published' : 'rejected';
  await db
    .update(resources)
    .set({ status, ...(status === 'published' ? { lastReviewedAt: new Date() } : {}), updatedAt: new Date() })
    .where(eq(resources.id, r.id));
  await db.insert(resourceReviews).values({ resourceId: r.id, reviewerId: auth.user.id, decision: input.decision === 'approve' ? 'approved' : 'rejected', note: input.note ?? null, version: String(r.version) });
  await audit(c, { action: input.decision === 'approve' ? 'resource.review_approved' : 'resource.review_rejected', targetType: 'resource', targetId: r.id, meta: { note: input.note ?? null, authorId: r.authorId } });
  if (r.authorId) {
    await notify(r.authorId, {
      type: `resource.${status}`,
      category: 'general',
      title: input.decision === 'approve' ? `Published: ${r.title}` : `Changes requested: ${r.title}`,
      body: input.decision === 'approve' ? 'Your resource is now live in the public library.' + (input.note ? ` Reviewer note: ${input.note}` : '') : `Reviewer note: ${input.note}`,
      link: `/app/create/resources/${r.id}`,
    });
  }
  return c.json({ ok: true, status });
});

// ======================================================================
// Learning paths (org tracks)
// ======================================================================

async function loadEditableTrack(c: Ctx, id: string) {
  const auth = requireAuth(c);
  const [t] = await db.select().from(tracks).where(eq(tracks.id, id));
  // Org tracks only; another org's paths look exactly like missing ones.
  if (!t || !t.orgId || !isEditorIn(auth, t.orgId)) throw notFound('Learning path');
  assertTrackEditor(c, t.orgId);
  return { auth, t };
}

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60) || 'item'
  );
}

const pathInput = z.object({
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(160),
  summary: z.string().trim().min(10, 'Write a one-sentence summary (at least 10 characters).').max(400),
  description: z.string().trim().max(10_000).nullable().optional(),
  category: z.string().trim().min(2).max(40).default('custom'),
  level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  estimatedHours: z.number().int().min(1).max(1000).nullable().optional(),
  roles: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
});

createRoutes.get('/paths', async (c) => {
  const { orgId } = requireActiveOrg(c, EDITOR_ROLES);
  const rows = await db
    .select({
      t: tracks,
      topicCount: sql<number>`(select count(*)::int from topics where topics.track_id = ${ref(tracks.id)})`,
      enrollments: sql<number>`(select count(*)::int from enrollments where enrollments.track_id = ${ref(tracks.id)})`,
    })
    .from(tracks)
    .where(eq(tracks.orgId, orgId))
    .orderBy(desc(tracks.updatedAt));
  return c.json({ items: rows.map((r) => ({ ...r.t, topicCount: r.topicCount, enrollments: r.enrollments })) });
});

createRoutes.post('/paths', async (c) => {
  const auth = requireAuth(c);
  const { orgId, membership } = requireActiveOrg(c, EDITOR_ROLES);
  const input = await body(c, pathInput);
  const slug = `${slugify(membership.orgSlug).slice(0, 24)}-${slugify(input.title)}-${Math.random().toString(36).slice(2, 7)}`;
  const [row] = await db
    .insert(tracks)
    .values({ ...input, slug, orgId, authorId: auth.user.id, status: 'draft', contentStatus: 'outline', version: 1, lastReviewedAt: null })
    .returning();
  await audit(c, { action: 'track.created', orgId, targetType: 'track', targetId: row.id });
  return c.json({ path: row }, 201);
});

createRoutes.get('/paths/:id', async (c) => {
  const { t } = await loadEditableTrack(c, idParam(c));
  const rows = await db.select().from(topics).where(eq(topics.trackId, t.id)).orderBy(asc(topics.sortOrder));
  const sk = await skillMap(rows.map((r) => r.skillId).filter(Boolean) as string[]);
  const qIds = [...new Set(rows.flatMap((r) => r.quizQuestionIds ?? []))];
  const qs = qIds.length ? await db.select({ id: questions.id, title: questions.title, type: questions.type, difficulty: questions.difficulty }).from(questions).where(inArray(questions.id, qIds)) : [];
  return c.json({
    path: t,
    topics: rows.map((r) => ({
      ...r,
      skill: r.skillId && sk.get(r.skillId) ? { slug: sk.get(r.skillId)!.slug, name: sk.get(r.skillId)!.name } : null,
      quiz: (r.quizQuestionIds ?? []).map((id) => qs.find((q) => q.id === id)).filter(Boolean),
    })),
  });
});

createRoutes.patch('/paths/:id', async (c) => {
  const { t } = await loadEditableTrack(c, idParam(c));
  const input = await body(c, patchSchema(pathInput).extend({ contentStatus: z.enum(['complete', 'outline']).optional() }));
  const [row] = await db.update(tracks).set({ ...input, updatedAt: new Date() }).where(eq(tracks.id, t.id)).returning();
  return c.json({ path: row });
});

const topicResource = z.object({ title: z.string().trim().min(1).max(200), url: httpUrl, source: z.string().trim().min(1, 'Name the source.').max(120), kind: z.string().trim().max(30).default('article') });
const topicPractice = z.object({ title: z.string().trim().min(1).max(200), kind: z.enum(['problem', 'quiz', 'exercise', 'sql']), ref: z.string().trim().max(200).optional(), prompt: z.string().trim().max(2000).optional() });
const topicInput = z.object({
  title: z.string().trim().min(2, 'Use at least 2 characters.').max(200),
  module: z.string().trim().min(1).max(80).default('Core'),
  body: z.string().max(100_000).default(''),
  objectives: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
  estimatedMinutes: z.number().int().min(5).max(600).default(20),
  resources: z.array(topicResource).max(20).default([]),
  practice: z.array(topicPractice).max(20).default([]),
  completionCriteria: z.string().trim().max(500).nullable().optional(),
  skillSlug: z.string().trim().max(80).nullable().optional(),
  isMilestone: z.boolean().default(false),
});

async function skillIdFor(slug: string | null | undefined) {
  if (slug === undefined) return undefined;
  if (!slug) return null;
  const [s] = await db.select({ id: skills.id }).from(skills).where(eq(skills.slug, slug));
  if (!s) throw badRequest('Unknown skill.', { fields: { skillSlug: 'Unknown skill' } });
  return s.id;
}

createRoutes.post('/paths/:id/topics', async (c) => {
  const { t } = await loadEditableTrack(c, idParam(c));
  const input = await body(c, topicInput);
  const { skillSlug, ...rest } = input;
  const skillId = await skillIdFor(skillSlug);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${topics.sortOrder}), 0)::int` }).from(topics).where(eq(topics.trackId, t.id));
  const base = slugify(input.title);
  const existing = await db.select({ slug: topics.slug }).from(topics).where(eq(topics.trackId, t.id));
  let slug = base;
  for (let i = 2; existing.some((e) => e.slug === slug); i++) slug = `${base}-${i}`;
  const [row] = await db
    .insert(topics)
    .values({ ...rest, trackId: t.id, slug, sortOrder: max + 1, skillId: skillId ?? null })
    .returning();
  await db.update(tracks).set({ updatedAt: new Date() }).where(eq(tracks.id, t.id));
  return c.json({ topic: row }, 201);
});

createRoutes.patch('/paths/:id/topics/:topicId', async (c) => {
  const { t } = await loadEditableTrack(c, idParam(c));
  const input = await body(c, patchSchema(topicInput));
  const { skillSlug, ...rest } = input;
  const skillId = await skillIdFor(skillSlug);
  const [row] = await db
    .update(topics)
    .set({ ...rest, ...(skillId !== undefined ? { skillId } : {}) })
    .where(and(eq(topics.id, idParam(c, 'topicId')), eq(topics.trackId, t.id)))
    .returning();
  if (!row) throw notFound('Topic');
  await db.update(tracks).set({ updatedAt: new Date() }).where(eq(tracks.id, t.id));
  return c.json({ topic: row });
});

createRoutes.delete('/paths/:id/topics/:topicId', async (c) => {
  const { t } = await loadEditableTrack(c, idParam(c));
  const [row] = await db
    .delete(topics)
    .where(and(eq(topics.id, idParam(c, 'topicId')), eq(topics.trackId, t.id)))
    .returning({ id: topics.id });
  if (!row) throw notFound('Topic');
  // Close the gap in ordering.
  const rest = await db.select({ id: topics.id }).from(topics).where(eq(topics.trackId, t.id)).orderBy(asc(topics.sortOrder));
  for (const [i, r] of rest.entries()) await db.update(topics).set({ sortOrder: i + 1 }).where(eq(topics.id, r.id));
  return c.json({ ok: true });
});

createRoutes.post('/paths/:id/reorder', async (c) => {
  const { t } = await loadEditableTrack(c, idParam(c));
  const { topicIds } = await body(c, z.object({ topicIds: z.array(z.string().uuid()).min(1).max(500) }));
  const current = await db.select({ id: topics.id }).from(topics).where(eq(topics.trackId, t.id));
  const same = current.length === topicIds.length && new Set(topicIds).size === topicIds.length && current.every((r) => topicIds.includes(r.id));
  if (!same) throw badRequest('The new order must list every topic of this path exactly once.');
  for (const [i, id] of topicIds.entries()) await db.update(topics).set({ sortOrder: i + 1 }).where(and(eq(topics.id, id), eq(topics.trackId, t.id)));
  await db.update(tracks).set({ updatedAt: new Date() }).where(eq(tracks.id, t.id));
  return c.json({ ok: true });
});

/** Objective questions an org may attach: its own bank plus active public questions. */
function attachableQuestions(orgId: string) {
  return and(
    inArray(questions.type, [...OBJECTIVE_TYPES]),
    eq(questions.status, 'active'),
    or(eq(questions.orgId, orgId), and(isNull(questions.orgId), eq(questions.visibility, 'public'))),
  );
}

createRoutes.get('/questions', async (c) => {
  const { orgId } = requireActiveOrg(c, EDITOR_ROLES);
  const q = query(
    c,
    z.object({
      q: z.string().trim().max(100).optional(),
      type: z.enum(OBJECTIVE_TYPES).optional(),
      scope: z.enum(['all', 'org', 'public']).default('all'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(20),
    }),
  );
  const where = and(
    attachableQuestions(orgId),
    q.type ? eq(questions.type, q.type) : undefined,
    q.scope === 'org' ? eq(questions.orgId, orgId) : q.scope === 'public' ? isNull(questions.orgId) : undefined,
    q.q ? sql`(${questions.title} ilike ${'%' + escapeLike(q.q) + '%'} or array_to_string(${questions.topics}, ' ') ilike ${'%' + escapeLike(q.q) + '%'})` : undefined,
  );
  const rows = await db
    .select({ id: questions.id, title: questions.title, type: questions.type, difficulty: questions.difficulty, topics: questions.topics, orgId: questions.orgId, prompt: sql<string>`left(${questions.content}->>'prompt', 200)` })
    .from(questions)
    .where(where)
    .orderBy(asc(questions.title))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(questions).where(where);
  return c.json({ items: rows.map(({ orgId: o, ...r }) => ({ ...r, scope: o ? 'org' : 'public' })), total });
});

createRoutes.put('/paths/:id/topics/:topicId/quiz', async (c) => {
  const { t } = await loadEditableTrack(c, idParam(c));
  const { questionIds } = await body(c, z.object({ questionIds: z.array(z.string().uuid()).max(20) }));
  const unique = [...new Set(questionIds)];
  if (unique.length) {
    const ok = await db.select({ id: questions.id }).from(questions).where(and(inArray(questions.id, unique), attachableQuestions(t.orgId!)));
    if (ok.length !== unique.length) throw badRequest('Some questions are not available to this organization or are not auto-graded types.', { fields: { questionIds: 'Not available' } });
  }
  const [row] = await db
    .update(topics)
    .set({ quizQuestionIds: unique.length ? unique : null, ...(unique.length ? {} : {}) })
    .where(and(eq(topics.id, idParam(c, 'topicId')), eq(topics.trackId, t.id)))
    .returning({ id: topics.id, quizQuestionIds: topics.quizQuestionIds });
  if (!row) throw notFound('Topic');
  return c.json({ topic: row });
});

createRoutes.post('/paths/:id/publish', async (c) => {
  const { t } = await loadEditableTrack(c, idParam(c));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(topics).where(eq(topics.trackId, t.id));
  if (!n) throw badRequest('Add at least one topic before publishing.');
  if (t.status === 'published') return c.json({ path: t });
  // Every publish after the first is a new version learners can see.
  const version = t.lastReviewedAt ? t.version + 1 : t.version;
  const [row] = await db.update(tracks).set({ status: 'published', version, lastReviewedAt: new Date(), updatedAt: new Date() }).where(eq(tracks.id, t.id)).returning();
  await audit(c, { action: 'track.published', orgId: t.orgId, targetType: 'track', targetId: t.id, meta: { version } });
  return c.json({ path: row });
});

createRoutes.post('/paths/:id/unpublish', async (c) => {
  const { t } = await loadEditableTrack(c, idParam(c));
  const [row] = await db.update(tracks).set({ status: 'draft', updatedAt: new Date() }).where(eq(tracks.id, t.id)).returning();
  await audit(c, { action: 'track.unpublished', orgId: t.orgId, targetType: 'track', targetId: t.id });
  return c.json({ path: row });
});

createRoutes.get('/paths/:id/analytics', async (c) => {
  const { t } = await loadEditableTrack(c, idParam(c));
  const [enr] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${enrollments.status} = 'active')::int`,
      completed: sql<number>`count(*) filter (where ${enrollments.status} = 'completed')::int`,
    })
    .from(enrollments)
    .where(eq(enrollments.trackId, t.id));
  const perTopic = await db
    .select({
      id: topics.id,
      title: topics.title,
      sortOrder: topics.sortOrder,
      started: sql<number>`count(${topicProgress.userId}) filter (where ${topicProgress.status} <> 'not_started')::int`,
      completed: sql<number>`count(${topicProgress.userId}) filter (where ${topicProgress.status} = 'completed')::int`,
      avgMastery: sql<number>`coalesce(avg(${topicProgress.mastery}) filter (where ${topicProgress.status} <> 'not_started'), 0)::float`,
    })
    .from(topics)
    .leftJoin(topicProgress, eq(topicProgress.topicId, topics.id))
    .where(eq(topics.trackId, t.id))
    .groupBy(topics.id, topics.title, topics.sortOrder)
    .orderBy(asc(topics.sortOrder));
  return c.json({ enrollments: enr, topics: perTopic });
});

/** Org name lookup for headers (kept tiny; avoids leaking other orgs). */
createRoutes.get('/context', async (c) => {
  const auth = requireAuth(c);
  const orgId = activeEditorOrg(auth);
  const [org] = orgId ? await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, orgId)) : [];
  return c.json({ activeOrg: org ?? null, canAuthorOrg: !!orgId, isPlatformAdmin: isPlatformAdmin(auth) });
});
