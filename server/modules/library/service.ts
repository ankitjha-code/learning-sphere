import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { resources, skills, organizations, bookmarks, readingHistory, resourceRatings } from '../../db/schema';

/** Published resources a user may see: the public library plus their organizations' resources. */
export function visibleResources(orgIds: string[]) {
  return and(
    eq(resources.status, 'published'),
    orgIds.length ? or(isNull(resources.orgId), inArray(resources.orgId, orgIds)) : isNull(resources.orgId),
  );
}

export type ResourceRow = typeof resources.$inferSelect;

export async function skillMap(ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, { id: string; slug: string; name: string }>();
  const rows = await db.select({ id: skills.id, slug: skills.slug, name: skills.name }).from(skills).where(inArray(skills.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function resolveSkillSlugs(slugs: string[]): Promise<{ ids: string[]; missing: string[] }> {
  if (!slugs.length) return { ids: [], missing: [] };
  const rows = await db.select({ id: skills.id, slug: skills.slug }).from(skills).where(inArray(skills.slug, slugs));
  return { ids: rows.map((r) => r.id), missing: slugs.filter((s) => !rows.some((r) => r.slug === s)) };
}

/** Shapes resources for cards, adding the viewer's bookmark / completion / rating state in batch. */
export async function toCards(rows: ResourceRow[], userId: string, opts: { includeBody?: boolean } = {}) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [sk, orgs, bms, hist, mine] = await Promise.all([
    skillMap(rows.flatMap((r) => r.skillIds)),
    (async () => {
      const orgIds = [...new Set(rows.map((r) => r.orgId).filter(Boolean))] as string[];
      if (!orgIds.length) return new Map<string, string>();
      const o = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.id, orgIds));
      return new Map(o.map((x) => [x.id, x.name]));
    })(),
    db
      .select({ id: bookmarks.id, targetId: bookmarks.targetId, collection: bookmarks.collection })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.targetType, 'resource'), inArray(bookmarks.targetId, ids))),
    db.select().from(readingHistory).where(and(eq(readingHistory.userId, userId), inArray(readingHistory.resourceId, ids))),
    db.select().from(resourceRatings).where(and(eq(resourceRatings.userId, userId), inArray(resourceRatings.resourceId, ids))),
  ]);
  return rows.map((r) => {
    const bm = bms.find((b) => b.targetId === r.id);
    const h = hist.find((x) => x.resourceId === r.id);
    return {
      id: r.id,
      kind: r.kind,
      title: r.title,
      summary: r.summary,
      url: r.url,
      sourceName: r.sourceName,
      license: r.license,
      topics: r.topics,
      languages: r.languages,
      roles: r.roles,
      difficulty: r.difficulty,
      skills: r.skillIds.map((id) => sk.get(id)).filter(Boolean).map((s) => ({ slug: s!.slug, name: s!.name })),
      orgId: r.orgId,
      orgName: r.orgId ? (orgs.get(r.orgId) ?? null) : null,
      status: r.status,
      version: r.version,
      downloadable: r.downloadable && !!r.body,
      hasBody: !!r.body,
      body: opts.includeBody ? r.body : undefined,
      ratingAvg: r.ratingCount ? Math.round((r.ratingSum / r.ratingCount) * 10) / 10 : null,
      ratingCount: r.ratingCount,
      viewCount: r.viewCount,
      lastReviewedAt: r.lastReviewedAt,
      isSample: r.isSample,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      bookmark: bm ? { id: bm.id, collection: bm.collection } : null,
      completed: h?.completed ?? false,
      lastOpenedAt: h?.lastOpenedAt ?? null,
      myRating: mine.find((m) => m.resourceId === r.id)?.rating ?? null,
    };
  });
}

/** Recomputes rating aggregates from the ratings table (idempotent, no drift). */
export async function recomputeRating(resourceId: string) {
  await db
    .update(resources)
    .set({
      ratingSum: sql`(select coalesce(sum(${resourceRatings.rating}), 0)::int from ${resourceRatings} where ${resourceRatings.resourceId} = ${resourceId})`,
      ratingCount: sql`(select count(*)::int from ${resourceRatings} where ${resourceRatings.resourceId} = ${resourceId})`,
    })
    .where(eq(resources.id, resourceId));
}

/** A Postgres array literal built from bound parameters (drizzle expands bare JS arrays into lists). */
export function pgArray(values: string[], type: 'text' | 'uuid') {
  if (!values.length) return sql.raw(`'{}'::${type}[]`);
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::${sql.raw(type)}[]`;
}
