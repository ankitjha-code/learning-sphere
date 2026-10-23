import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../client';
import { resources, skills } from '../schema';
import { LIBRARY_RESOURCES } from './content/resources';

/** Date the curated library links and attributions were last checked. */
export const LIBRARY_REVIEWED_AT = new Date('2026-10-22T00:00:00Z');

/**
 * Seeds the curated public library (idempotent). Entries are keyed by title in
 * the public library (orgId null, no author); re-running updates them in place
 * and bumps the version only when content changed.
 */
export async function seedLibraryResources() {
  const slugs = [...new Set(LIBRARY_RESOURCES.flatMap((r) => r.skills))];
  const skillRows = slugs.length ? await db.select({ id: skills.id, slug: skills.slug }).from(skills).where(inArray(skills.slug, slugs)) : [];
  const skillId = new Map(skillRows.map((s) => [s.slug, s.id]));
  let created = 0;
  let updated = 0;
  for (const r of LIBRARY_RESOURCES) {
    const values = {
      kind: r.kind,
      title: r.title,
      summary: r.summary,
      body: r.body ?? null,
      url: r.url ?? null,
      sourceName: r.sourceName,
      license: r.license ?? null,
      topics: r.topics,
      languages: r.languages,
      roles: r.roles,
      difficulty: r.difficulty,
      skillIds: r.skills.map((s) => skillId.get(s)).filter(Boolean) as string[],
      downloadable: !!r.downloadable,
      status: 'published',
      lastReviewedAt: LIBRARY_REVIEWED_AT,
    };
    const [existing] = await db
      .select()
      .from(resources)
      .where(and(isNull(resources.orgId), isNull(resources.authorId), eq(resources.title, r.title)));
    if (!existing) {
      await db.insert(resources).values({ ...values, orgId: null, authorId: null });
      created++;
      continue;
    }
    const changed = existing.body !== values.body || existing.url !== values.url || existing.summary !== values.summary;
    await db
      .update(resources)
      // An admin may have archived a curated entry; re-seeding keeps that decision.
      .set({ ...values, status: existing.status, version: changed ? existing.version + 1 : existing.version, updatedAt: changed ? new Date() : existing.updatedAt })
      .where(eq(resources.id, existing.id));
    updated++;
  }
  return { created, updated, total: LIBRARY_RESOURCES.length };
}
