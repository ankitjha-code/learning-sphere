/**
 * Transparent text similarity for assignment submissions.
 *
 * Method: lower-case the text, keep letters and digits, split into words, build the set of
 * overlapping 5-word sequences ("shingles"), and compute the Jaccard index |A ∩ B| / |A ∪ B|.
 * The only comparison corpus is other students' latest submissions of the same assignment.
 * A high score is an indicator for a human to review the two texts side by side. It is not proof
 * of plagiarism: shared starter code, quoted instructions or common phrasing all raise it.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { submissions, teachSimilarity } from '../../db/schema';

export const SIMILARITY_METHOD = 'word-5-gram-jaccard';
export const SHINGLE = 5;
export const MIN_WORDS = 20;
export const SIMILARITY_WORDING = 'Similarity indicator. Not proof of plagiarism; review the texts side by side.';
export const SIMILARITY_METHOD_TEXT =
  'Compares overlapping 5-word sequences in the submitted text (Jaccard index) with other students’ latest submissions of this assignment only. Attached files and links are not compared. Shared starter code, quoted instructions and common phrases also raise the score.';

export function words(text: string | null | undefined) {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function shingles(text: string | null | undefined, n = SHINGLE) {
  const w = words(text);
  const set = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(' '));
  return set;
}

export function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const s of small) if (big.has(s)) inter++;
  return inter / (a.size + b.size - inter);
}

export function sharedPhrases(a: string | null, b: string | null, limit = 12) {
  const A = shingles(a);
  const B = shingles(b);
  const out: string[] = [];
  for (const s of A) {
    if (B.has(s)) out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Upserts one submission's entry into another submission's match list (keeps both sides current). */
async function upsertMatch(targetId: string, match: { otherSubmissionId: string; otherUserId: string; score: number }) {
  const [row] = await db.select().from(teachSimilarity).where(eq(teachSimilarity.submissionId, targetId));
  if (!row) return;
  // An owner's newer version replaces their older one in the list.
  const matches = row.matches.filter((m) => m.otherSubmissionId !== match.otherSubmissionId && m.otherUserId !== match.otherUserId);
  matches.push(match);
  matches.sort((x, y) => y.score - x.score);
  const maxScore = row.maxScore === null ? null : Math.max(0, ...matches.map((m) => m.score));
  await db.update(teachSimilarity).set({ matches, maxScore, comparedCount: matches.length }).where(eq(teachSimilarity.submissionId, targetId));
}

/** Computes (or recomputes) similarity for one submission. Safe to run repeatedly. */
export async function computeSimilarity(submissionId: string) {
  const [s] = await db.select().from(submissions).where(eq(submissions.id, submissionId));
  if (!s || s.status === 'draft') return { skipped: true };

  // Corpus: latest submitted version of every other owner (individual or team) of the same assignment.
  const others = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.assignmentId, s.assignmentId), eq(submissions.orgId, s.orgId), sql`${submissions.status} <> 'draft'`));
  const latestByOwner = new Map<string, typeof s>();
  for (const o of others.sort((x, y) => x.version - y.version)) latestByOwner.set(o.teamId ?? o.userId, o);
  const ownKey = s.teamId ?? s.userId;
  const corpus = [...latestByOwner.entries()].filter(([k]) => k !== ownKey).map(([, v]) => v);

  const mine = shingles(s.text);
  const enough = words(s.text).length >= MIN_WORDS;
  const matches = enough
    ? corpus
        .filter((o) => words(o.text).length >= MIN_WORDS)
        .map((o) => ({ otherSubmissionId: o.id, otherUserId: o.userId, score: round3(jaccard(mine, shingles(o.text))) }))
        .sort((x, y) => y.score - x.score)
    : [];
  const maxScore = enough ? Math.max(0, ...matches.map((m) => m.score)) : null;
  const values = {
    submissionId: s.id,
    orgId: s.orgId,
    assignmentId: s.assignmentId,
    method: SIMILARITY_METHOD,
    comparedCount: matches.length,
    maxScore,
    matches,
    note: enough ? null : `Not enough text to compare (fewer than ${MIN_WORDS} words).`,
    computedAt: new Date(),
  };
  await db
    .insert(teachSimilarity)
    .values(values)
    .onConflictDoUpdate({ target: teachSimilarity.submissionId, set: { comparedCount: values.comparedCount, maxScore, matches, note: values.note, computedAt: values.computedAt, method: SIMILARITY_METHOD } });

  // Keep the other side's indicator current too.
  if (enough) {
    const ids = matches.map((m) => m.otherSubmissionId);
    if (ids.length) {
      const existing = await db.select({ id: teachSimilarity.submissionId }).from(teachSimilarity).where(inArray(teachSimilarity.submissionId, ids));
      for (const e of existing) {
        const m = matches.find((x) => x.otherSubmissionId === e.id)!;
        await upsertMatch(e.id, { otherSubmissionId: s.id, otherUserId: s.userId, score: m.score });
      }
    }
  }
  return { compared: matches.length, maxScore };
}
