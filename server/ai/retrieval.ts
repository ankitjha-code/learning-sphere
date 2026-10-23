/**
 * Authorization-aware retrieval with Postgres full-text search (to_tsquery + ts_rank; no embeddings needed).
 *
 * Each source applies its own visibility rule in the SQL itself (never search first,
 * filter later):
 * - topics of published tracks that are global or belong to one of the user's orgs
 * - published resources that are public or belong to one of the user's orgs
 * - the user's own notes (personal knowledge base documents are notes tagged 'knowledge')
 */
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { notes, resources, topics, tracks } from '../db/schema';
import { sanitizeUntrusted, untrustedBlock } from './safety';

export type RetrievalScope = { userId: string; orgIds: string[] };

export type RetrievedChunk = {
  kind: 'topic' | 'resource' | 'note';
  id: string;
  title: string;
  url?: string;
  text: string;
  rank: number;
};

export type Source = { n: number; title: string; url?: string; kind: string; id?: string };

const HEADLINE_OPTS = 'MaxWords=70, MinWords=25, MaxFragments=2, StartSel="", StopSel="", FragmentDelimiter=" … "';

function orgScope(col: PgColumn, orgIds: string[]): SQL {
  return orgIds.length ? or(isNull(col), inArray(col, orgIds))! : isNull(col);
}

/** Lower-cased letter/number words (max 16), safe to join into a to_tsquery expression. */
export function queryTerms(question: string): string[] {
  const words = question.toLowerCase().slice(0, 500).match(/[\p{L}\p{N}]{2,40}/gu) ?? [];
  return [...new Set(words)].slice(0, 16);
}

export async function retrieve(question: string, scope: RetrievalScope, k = 5): Promise<RetrievedChunk[]> {
  const terms = queryTerms(question);
  if (!terms.length) return [];
  // OR of the question's terms: natural questions rarely contain only words present in a document,
  // so ts_rank (more matching terms rank higher) does the ordering instead of requiring all terms.
  const tsq = sql`to_tsquery('english', ${terms.join(' | ')})`;

  const topicDoc = sql`to_tsvector('english', ${topics.title} || ' ' || array_to_string(${topics.objectives}, ' ') || ' ' || ${topics.body})`;
  const resourceDoc = sql`to_tsvector('english', ${resources.title} || ' ' || ${resources.summary} || ' ' || coalesce(${resources.body}, ''))`;
  const noteDoc = sql`to_tsvector('english', ${notes.title} || ' ' || ${notes.body} || ' ' || array_to_string(${notes.tags}, ' '))`;

  const [topicRows, resourceRows, noteRows] = await Promise.all([
    db
      .select({
        id: topics.id,
        title: topics.title,
        slug: topics.slug,
        trackSlug: tracks.slug,
        trackTitle: tracks.title,
        rank: sql<number>`ts_rank(${topicDoc}, ${tsq})`,
        text: sql<string>`ts_headline('english', ${topics.body}, ${tsq}, ${HEADLINE_OPTS})`,
      })
      .from(topics)
      .innerJoin(tracks, eq(tracks.id, topics.trackId))
      .where(and(eq(tracks.status, 'published'), orgScope(tracks.orgId, scope.orgIds), sql`${topicDoc} @@ ${tsq}`))
      .orderBy(desc(sql`ts_rank(${topicDoc}, ${tsq})`))
      .limit(k),
    db
      .select({
        id: resources.id,
        title: resources.title,
        url: resources.url,
        rank: sql<number>`ts_rank(${resourceDoc}, ${tsq})`,
        text: sql<string>`ts_headline('english', ${resources.summary} || ' ' || coalesce(${resources.body}, ''), ${tsq}, ${HEADLINE_OPTS})`,
      })
      .from(resources)
      .where(and(eq(resources.status, 'published'), orgScope(resources.orgId, scope.orgIds), sql`${resourceDoc} @@ ${tsq}`))
      .orderBy(desc(sql`ts_rank(${resourceDoc}, ${tsq})`))
      .limit(k),
    db
      .select({
        id: notes.id,
        title: notes.title,
        tags: notes.tags,
        rank: sql<number>`ts_rank(${noteDoc}, ${tsq})`,
        text: sql<string>`ts_headline('english', ${notes.body}, ${tsq}, ${HEADLINE_OPTS})`,
      })
      .from(notes)
      .where(and(eq(notes.userId, scope.userId), sql`${noteDoc} @@ ${tsq}`))
      .orderBy(desc(sql`ts_rank(${noteDoc}, ${tsq})`))
      .limit(k),
  ]);

  const chunks: RetrievedChunk[] = [
    ...topicRows.map((r) => ({ kind: 'topic' as const, id: r.id, title: `${r.title} (${r.trackTitle})`, url: `/app/learn/${r.trackSlug}/${r.slug}`, text: r.text, rank: Number(r.rank) })),
    ...resourceRows.map((r) => ({ kind: 'resource' as const, id: r.id, title: r.title, url: `/app/library/${r.id}`, text: r.text, rank: Number(r.rank) })),
    // Own notes get a small boost: the user asked about their material.
    ...noteRows.map((r) => ({ kind: 'note' as const, id: r.id, title: r.tags.includes('knowledge') ? `${r.title} (your knowledge base)` : `${r.title} (your note)`, url: `/app/workspace?note=${r.id}`, text: r.text, rank: Number(r.rank) * 1.1 })),
  ];
  // OR-matching finds candidates broadly; keep only those reasonably close to the best match so a
  // single shared word ("method", "data") doesn't pull in unrelated pages as citations.
  const sorted = chunks.sort((a, b) => b.rank - a.rank);
  const best = sorted[0]?.rank ?? 0;
  return sorted.filter((c) => c.rank >= best * 0.4).slice(0, k);
}

/** Numbered, fenced, sanitized source blocks for the prompt plus the source list returned with the answer. */
export function formatSources(chunks: RetrievedChunk[]): { block: string | null; sources: Source[] } {
  if (!chunks.length) return { block: null, sources: [] };
  const sources: Source[] = [];
  const blocks = chunks.map((c, i) => {
    const n = i + 1;
    sources.push({ n, title: c.title, url: c.url, kind: c.kind, id: c.id });
    return untrustedBlock('source', { n, title: c.title, kind: c.kind }, sanitizeUntrusted(c.text, 1500));
  });
  return { block: blocks.join('\n\n'), sources };
}
