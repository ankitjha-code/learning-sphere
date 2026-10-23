import { Hono } from 'hono';
import { z } from 'zod';
import { and, arrayContains, asc, desc, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client';
import { resources, bookmarks, readingHistory, resourceRatings, reports, skills, skillPrereqs, notes, files } from '../../db/schema';
import { type AppEnv, requireAuth } from '../../lib/context';
import { body, idParam, query } from '../../lib/validate';
import { badRequest, notFound } from '../../lib/errors';
import { rateLimit } from '../../lib/ratelimit';
import { recordActivity } from '../../lib/activity';
import { readMultipart, fileBuffer } from '../files/routes';
import { softDeleteFile, storeFile, validateUpload } from '../files/service';
import { extractText } from './extract';
import { pgArray, recomputeRating, toCards, visibleResources } from './service';

/** Mounted at /api/library. */
export const libraryRoutes = new Hono<AppEnv>();

const KINDS = ['article', 'video', 'docs', 'cheatsheet', 'course', 'exercise', 'interview', 'link'] as const;
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export const KNOWLEDGE_TAG = 'knowledge';

const escapeLike = (s: string) => s.replace(/[%_\\]/g, (m) => '\\' + m);
const ftsDoc = sql`to_tsvector('english', ${resources.title} || ' ' || ${resources.summary} || ' ' || coalesce(${resources.body}, ''))`;

const orgIdsOf = (auth: ReturnType<typeof requireAuth>) => auth.memberships.map((m) => m.orgId);

async function loadVisible(id: string, orgIds: string[]) {
  const [r] = await db.select().from(resources).where(and(eq(resources.id, id), visibleResources(orgIds)));
  if (!r) throw notFound('Resource');
  return r;
}

// ---------- Browse ----------

libraryRoutes.get('/resources', async (c) => {
  const auth = requireAuth(c);
  const q = query(
    c,
    z.object({
      q: z.string().trim().max(200).optional(),
      kind: z.enum(KINDS).optional(),
      topic: z.string().trim().max(60).optional(),
      difficulty: z.enum(DIFFICULTIES).optional(),
      language: z.string().trim().max(30).optional(),
      role: z.string().trim().max(80).optional(),
      skill: z.string().trim().max(80).optional(),
      scope: z.enum(['all', 'org', 'public']).default('all'),
      sort: z.enum(['relevance', 'newest', 'top_rated']).default('relevance'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(24),
    }),
  );
  const orgIds = orgIdsOf(auth);
  let skillId: string | null = null;
  if (q.skill) {
    const [s] = await db.select({ id: skills.id }).from(skills).where(eq(skills.slug, q.skill));
    if (!s) return c.json({ items: [], total: 0, page: q.page, pageSize: q.pageSize });
    skillId = s.id;
  }
  const text = q.q && q.q.length >= 2 ? q.q : null;
  const textWhere = text
    ? sql`(${ftsDoc} @@ plainto_tsquery('english', ${text}) or ${resources.title} ilike ${'%' + escapeLike(text) + '%'} or array_to_string(${resources.topics}, ' ') ilike ${'%' + escapeLike(text) + '%'})`
    : undefined;
  const where = and(
    visibleResources(orgIds),
    q.scope === 'org' ? (orgIds.length ? inArray(resources.orgId, orgIds) : sql`false`) : q.scope === 'public' ? isNull(resources.orgId) : undefined,
    q.kind ? eq(resources.kind, q.kind) : undefined,
    q.difficulty ? eq(resources.difficulty, q.difficulty) : undefined,
    q.topic ? arrayContains(resources.topics, [q.topic.toLowerCase()]) : undefined,
    q.language ? arrayContains(resources.languages, [q.language.toLowerCase()]) : undefined,
    q.role ? arrayContains(resources.roles, [q.role]) : undefined,
    skillId ? arrayContains(resources.skillIds, [skillId]) : undefined,
    textWhere,
  );
  const ratingAvg = sql`case when ${resources.ratingCount} = 0 then 0 else ${resources.ratingSum}::float / ${resources.ratingCount} end`;
  let order: SQL[];
  if (q.sort === 'newest') order = [desc(resources.createdAt), asc(resources.title)];
  else if (q.sort === 'top_rated') order = [desc(ratingAvg), desc(resources.ratingCount), asc(resources.title)];
  else if (text) order = [desc(sql`ts_rank(${ftsDoc}, plainto_tsquery('english', ${text})) + case when ${resources.title} ilike ${'%' + escapeLike(text) + '%'} then 1 else 0 end`), asc(resources.title)];
  else order = [desc(resources.viewCount), asc(resources.title)];
  const rows = await db
    .select()
    .from(resources)
    .where(where)
    .orderBy(...order)
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(resources).where(where);
  return c.json({ items: await toCards(rows, auth.user.id), total, page: q.page, pageSize: q.pageSize });
});

/** Filter options drawn from what the viewer can actually see. */
libraryRoutes.get('/facets', async (c) => {
  const auth = requireAuth(c);
  const where = visibleResources(orgIdsOf(auth));
  const rows = await db
    .select({ topics: resources.topics, languages: resources.languages, roles: resources.roles, kind: resources.kind, skillIds: resources.skillIds, orgId: resources.orgId })
    .from(resources)
    .where(where);
  const count = (vals: string[]) => {
    const m = new Map<string, number>();
    for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, n]) => ({ value, count: n }));
  };
  const skillCounts = count(rows.flatMap((r) => r.skillIds));
  const sk = skillCounts.length
    ? await db.select({ id: skills.id, slug: skills.slug, name: skills.name }).from(skills).where(inArray(skills.id, skillCounts.map((s) => s.value)))
    : [];
  return c.json({
    kinds: count(rows.map((r) => r.kind)),
    topics: count(rows.flatMap((r) => r.topics)).slice(0, 60),
    languages: count(rows.flatMap((r) => r.languages)),
    roles: count(rows.flatMap((r) => r.roles)),
    skills: skillCounts
      .map((s) => ({ ...sk.find((x) => x.id === s.value), count: s.count }))
      .filter((s) => s.slug)
      .map((s) => ({ value: s.slug!, label: s.name!, count: s.count })),
    orgResources: rows.filter((r) => r.orgId).length,
  });
});

libraryRoutes.get('/resources/:id', async (c) => {
  const auth = requireAuth(c);
  const r = await loadVisible(idParam(c), orgIdsOf(auth));
  await db.update(resources).set({ viewCount: sql`${resources.viewCount} + 1` }).where(eq(resources.id, r.id));
  await db
    .insert(readingHistory)
    .values({ userId: auth.user.id, resourceId: r.id, lastOpenedAt: new Date() })
    .onConflictDoUpdate({ target: [readingHistory.userId, readingHistory.resourceId], set: { lastOpenedAt: new Date() } });
  const [card] = await toCards([{ ...r, viewCount: r.viewCount + 1 }], auth.user.id, { includeBody: true });
  return c.json({ resource: card });
});

libraryRoutes.get('/resources/:id/related', async (c) => {
  const auth = requireAuth(c);
  const orgIds = orgIdsOf(auth);
  const r = await loadVisible(idParam(c), orgIds);
  if (!r.topics.length && !r.skillIds.length) return c.json({ items: [] });
  const topicArr = pgArray(r.topics, 'text');
  const skillArr = pgArray(r.skillIds, 'uuid');
  const overlap = sql<number>`(cardinality(array(select unnest(${resources.topics}) intersect select unnest(${topicArr}))) + 2 * cardinality(array(select unnest(${resources.skillIds}) intersect select unnest(${skillArr}))))`;
  const rows = await db
    .select({ r: resources, score: overlap })
    .from(resources)
    .where(and(visibleResources(orgIds), ne(resources.id, r.id), sql`(${resources.topics} && ${topicArr} or ${resources.skillIds} && ${skillArr})`))
    .orderBy(desc(overlap), desc(resources.ratingCount), asc(resources.title))
    .limit(6);
  return c.json({ items: await toCards(rows.map((x) => x.r), auth.user.id) });
});

/** Resources teaching the prerequisite skills of this resource's skills (from the skill graph). */
libraryRoutes.get('/resources/:id/prerequisites', async (c) => {
  const auth = requireAuth(c);
  const orgIds = orgIdsOf(auth);
  const r = await loadVisible(idParam(c), orgIds);
  if (!r.skillIds.length) return c.json({ skills: [], items: [] });
  const pre = await db
    .select({ id: skills.id, slug: skills.slug, name: skills.name })
    .from(skillPrereqs)
    .innerJoin(skills, eq(skills.id, skillPrereqs.prereqId))
    .where(inArray(skillPrereqs.skillId, r.skillIds));
  const preIds = [...new Set(pre.map((p) => p.id))].filter((id) => !r.skillIds.includes(id));
  if (!preIds.length) return c.json({ skills: [], items: [] });
  const rows = await db
    .select()
    .from(resources)
    .where(and(visibleResources(orgIds), ne(resources.id, r.id), sql`${resources.skillIds} && ${pgArray(preIds, 'uuid')}`))
    .orderBy(asc(resources.difficulty), desc(resources.ratingCount), asc(resources.title))
    .limit(6);
  const uniqueSkills = preIds.map((id) => pre.find((p) => p.id === id)!).map((s) => ({ slug: s.slug, name: s.name }));
  return c.json({ skills: uniqueSkills, items: await toCards(rows, auth.user.id) });
});

libraryRoutes.post('/resources/:id/rate', async (c) => {
  const auth = requireAuth(c);
  const r = await loadVisible(idParam(c), orgIdsOf(auth));
  const { rating } = await body(c, z.object({ rating: z.number().int().min(1, 'Rate from 1 to 5.').max(5, 'Rate from 1 to 5.') }));
  await db
    .insert(resourceRatings)
    .values({ userId: auth.user.id, resourceId: r.id, rating })
    .onConflictDoUpdate({ target: [resourceRatings.userId, resourceRatings.resourceId], set: { rating, createdAt: new Date() } });
  await recomputeRating(r.id);
  const [u] = await db.select({ ratingSum: resources.ratingSum, ratingCount: resources.ratingCount }).from(resources).where(eq(resources.id, r.id));
  return c.json({ myRating: rating, ratingCount: u.ratingCount, ratingAvg: u.ratingCount ? Math.round((u.ratingSum / u.ratingCount) * 10) / 10 : null });
});

libraryRoutes.delete('/resources/:id/rate', async (c) => {
  const auth = requireAuth(c);
  const r = await loadVisible(idParam(c), orgIdsOf(auth));
  await db.delete(resourceRatings).where(and(eq(resourceRatings.userId, auth.user.id), eq(resourceRatings.resourceId, r.id)));
  await recomputeRating(r.id);
  return c.json({ ok: true });
});

const collectionName = z
  .string()
  .trim()
  .max(60)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

libraryRoutes.put('/resources/:id/bookmark', async (c) => {
  const auth = requireAuth(c);
  const r = await loadVisible(idParam(c), orgIdsOf(auth));
  const { collection } = await body(c, z.object({ collection: collectionName }));
  const [bm] = await db
    .insert(bookmarks)
    .values({ userId: auth.user.id, targetType: 'resource', targetId: r.id, label: r.title, collection })
    .onConflictDoUpdate({ target: [bookmarks.userId, bookmarks.targetType, bookmarks.targetId], set: { collection, label: r.title } })
    .returning();
  return c.json({ bookmark: { id: bm.id, collection: bm.collection } });
});

libraryRoutes.delete('/resources/:id/bookmark', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  await db.delete(bookmarks).where(and(eq(bookmarks.userId, auth.user.id), eq(bookmarks.targetType, 'resource'), eq(bookmarks.targetId, id)));
  return c.json({ ok: true });
});

libraryRoutes.post('/resources/:id/complete', async (c) => {
  const auth = requireAuth(c);
  const r = await loadVisible(idParam(c), orgIdsOf(auth));
  const { completed } = await body(c, z.object({ completed: z.boolean().default(true) }));
  await db
    .insert(readingHistory)
    .values({ userId: auth.user.id, resourceId: r.id, completed, lastOpenedAt: new Date() })
    .onConflictDoUpdate({ target: [readingHistory.userId, readingHistory.resourceId], set: { completed, lastOpenedAt: new Date() } });
  if (completed) {
    // Self-reported reading: logged for history, no XP (it is not verified evidence).
    await recordActivity(auth.user.id, { kind: 'resource.completed', label: `Finished reading: ${r.title}`, link: `/app/library/${r.id}`, xp: 0, dedupeKey: `resource.completed:${r.id}` });
  }
  return c.json({ completed });
});

libraryRoutes.post('/resources/:id/report', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`report:${auth.user.id}`, 20, 3600_000);
  const r = await loadVisible(idParam(c), orgIdsOf(auth));
  const input = await body(
    c,
    z.object({
      reason: z.enum(['incorrect', 'outdated', 'broken_link', 'copyright', 'spam', 'other']),
      details: z.string().trim().min(10, 'Describe what needs correcting (at least 10 characters).').max(2000),
    }),
  );
  const [existing] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.reporterId, auth.user.id), eq(reports.targetType, 'resource'), eq(reports.targetId, r.id), eq(reports.status, 'open')));
  if (existing) {
    await db.update(reports).set({ details: `[${input.reason}] ${input.details}` }).where(eq(reports.id, existing.id));
    return c.json({ report: { id: existing.id, status: existing.status }, updated: true });
  }
  // Report reasons map onto the moderation vocabulary; the original reason is kept in details.
  const reason = input.reason === 'spam' || input.reason === 'copyright' || input.reason === 'other' ? input.reason : 'incorrect';
  const [row] = await db
    .insert(reports)
    .values({ orgId: r.orgId, reporterId: auth.user.id, targetType: 'resource', targetId: r.id, reason, details: `[${input.reason}] ${input.details}` })
    .returning();
  return c.json({ report: { id: row.id, status: row.status }, updated: false }, 201);
});

libraryRoutes.get('/resources/:id/download', async (c) => {
  const auth = requireAuth(c);
  const r = await loadVisible(idParam(c), orgIdsOf(auth));
  if (!r.downloadable || !r.body) throw notFound('Downloadable material');
  const name = `${r.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'resource'}.md`;
  const header = `---\ntitle: ${JSON.stringify(r.title)}\nsource: ${JSON.stringify(r.sourceName ?? 'LearnSphere Nexus')}\nlicense: ${JSON.stringify(r.license ?? 'See source')}\nversion: ${r.version}\n---\n\n`;
  c.header('Content-Type', 'text/markdown; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${name}"`);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'private, max-age=0, must-revalidate');
  return c.body(header + r.body);
});

// ---------- Collections, bookmarks, history ----------

libraryRoutes.get('/collections', async (c) => {
  const auth = requireAuth(c);
  const rows = await db
    .select({ collection: bookmarks.collection, count: sql<number>`count(*)::int` })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, auth.user.id), eq(bookmarks.targetType, 'resource')))
    .groupBy(bookmarks.collection)
    .orderBy(asc(bookmarks.collection));
  return c.json({ collections: rows.map((r) => ({ name: r.collection, count: r.count })) });
});

libraryRoutes.get('/bookmarks', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, z.object({ collection: z.string().max(60).optional(), unsorted: z.enum(['true', 'false']).optional() }));
  const orgIds = orgIdsOf(auth);
  const rows = await db
    .select({ b: bookmarks, r: resources })
    .from(bookmarks)
    .innerJoin(resources, sql`${resources.id}::text = ${bookmarks.targetId}`)
    .where(
      and(
        eq(bookmarks.userId, auth.user.id),
        eq(bookmarks.targetType, 'resource'),
        visibleResources(orgIds),
        q.unsorted === 'true' ? isNull(bookmarks.collection) : q.collection ? eq(bookmarks.collection, q.collection) : undefined,
      ),
    )
    .orderBy(desc(bookmarks.createdAt));
  const cards = await toCards(rows.map((x) => x.r), auth.user.id);
  return c.json({ items: rows.map((x, i) => ({ bookmarkId: x.b.id, collection: x.b.collection, savedAt: x.b.createdAt, resource: cards[i] })) });
});

libraryRoutes.patch('/bookmarks/:id', async (c) => {
  const auth = requireAuth(c);
  const { collection } = await body(c, z.object({ collection: collectionName }));
  const res = await db
    .update(bookmarks)
    .set({ collection })
    .where(and(eq(bookmarks.id, idParam(c)), eq(bookmarks.userId, auth.user.id)))
    .returning({ id: bookmarks.id });
  if (!res.length) throw notFound('Bookmark');
  return c.json({ ok: true, collection });
});

libraryRoutes.get('/history', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30), completed: z.enum(['true', 'false']).optional() }));
  const where = and(
    eq(readingHistory.userId, auth.user.id),
    visibleResources(orgIdsOf(auth)),
    q.completed ? eq(readingHistory.completed, q.completed === 'true') : undefined,
  );
  const rows = await db
    .select({ h: readingHistory, r: resources })
    .from(readingHistory)
    .innerJoin(resources, eq(resources.id, readingHistory.resourceId))
    .where(where)
    .orderBy(desc(readingHistory.lastOpenedAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(readingHistory)
    .innerJoin(resources, eq(resources.id, readingHistory.resourceId))
    .where(where);
  const cards = await toCards(rows.map((x) => x.r), auth.user.id);
  return c.json({ items: rows.map((x, i) => ({ lastOpenedAt: x.h.lastOpenedAt, completed: x.h.completed, resource: cards[i] })), total });
});

libraryRoutes.delete('/history', async (c) => {
  const auth = requireAuth(c);
  const res = await db.delete(readingHistory).where(eq(readingHistory.userId, auth.user.id)).returning({ id: readingHistory.resourceId });
  return c.json({ ok: true, cleared: res.length });
});

// ---------- Personal knowledge base ----------
// Convention (read by the AI study assistant's retrieval): each document is a note
// owned by the user, tagged 'knowledge', with linkType 'file' and linkId = file id.

libraryRoutes.post('/knowledge', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`knowledge:${auth.user.id}`, 30, 3600_000);
  const { files: uploads, fields } = await readMultipart(c);
  if (!uploads.length) throw badRequest('Choose a file to upload.', { fields: { file: 'Required' } });
  const f = uploads[0];
  const data = await fileBuffer(f);
  const v = validateUpload('knowledge', f.name, data);
  let extracted: Awaited<ReturnType<typeof extractText>>;
  try {
    extracted = await extractText(v.kind, data);
  } catch {
    throw badRequest('We could not read this PDF. It may be encrypted or damaged.', { fields: { file: 'Unreadable PDF' } });
  }
  if (!extracted.text.trim()) {
    throw badRequest('No text was found in this file. Scanned PDFs need OCR, which is not available here.', { fields: { file: 'No text found' } });
  }
  const file = await storeFile({ ownerId: auth.user.id, purpose: 'knowledge', filename: v.filename, mime: v.mime, data, enforceQuota: true });
  const title = (fields.title?.trim() || v.filename.replace(/\.[^.]+$/, '')).slice(0, 200);
  const [note] = await db
    .insert(notes)
    .values({ userId: auth.user.id, title, body: extracted.text, tags: [KNOWLEDGE_TAG], linkType: 'file', linkId: file.id, linkLabel: v.filename })
    .returning();
  return c.json({ document: { id: note.id, title: note.title, fileId: file.id, filename: file.filename, size: file.size, chars: extracted.text.length, truncated: extracted.truncated, pages: extracted.pages ?? null, createdAt: note.createdAt } }, 201);
});

libraryRoutes.get('/knowledge', async (c) => {
  const auth = requireAuth(c);
  const rows = await db
    .select({
      id: notes.id,
      title: notes.title,
      fileId: notes.linkId,
      filename: notes.linkLabel,
      chars: sql<number>`length(${notes.body})::int`,
      preview: sql<string>`left(${notes.body}, 240)`,
      createdAt: notes.createdAt,
      size: files.size,
      mime: files.mime,
    })
    .from(notes)
    .leftJoin(files, and(sql`${files.id}::text = ${notes.linkId}`, eq(files.ownerId, auth.user.id)))
    .where(and(eq(notes.userId, auth.user.id), arrayContains(notes.tags, [KNOWLEDGE_TAG])))
    .orderBy(desc(notes.createdAt));
  return c.json({ items: rows });
});

libraryRoutes.delete('/knowledge/:id', async (c) => {
  const auth = requireAuth(c);
  const [note] = await db
    .delete(notes)
    .where(and(eq(notes.id, idParam(c)), eq(notes.userId, auth.user.id), arrayContains(notes.tags, [KNOWLEDGE_TAG])))
    .returning();
  if (!note) throw notFound('Document');
  if (note.linkType === 'file' && note.linkId && z.string().uuid().safeParse(note.linkId).success) await softDeleteFile(note.linkId, auth.user.id);
  return c.json({ ok: true });
});
