import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { skills, skillPrereqs, skillEvidence, topicProgress, topics, enrollments } from '../../db/schema';

/**
 * Skill DNA: a per-skill summary computed from evidence rows.
 * - Source weights favour stronger evidence (reviewed projects > graded assessments > practice > self-ratings).
 * - Older evidence decays (half-life 120 days) so skills "fade" and trigger revision.
 * - `verified` only when a deterministic grader or an authorized human produced the evidence.
 * AI output never creates verified evidence.
 */
export const SOURCE_WEIGHT: Record<string, number> = {
  review: 1.5,
  project: 1.2,
  assessment: 1.0,
  mentor: 1.0,
  practice: 0.8,
  course: 0.7,
  self: 0.3,
};

const HALF_LIFE_DAYS = 120;

export type SkillState = 'verified' | 'demonstrated' | 'learning' | 'needs_revision' | 'self_declared' | 'not_started';

export type SkillDnaEntry = {
  skillId: string;
  slug: string;
  name: string;
  category: string;
  level: number; // 1..4 difficulty tier of the skill itself
  mastery: number | null; // 0..1 estimate, null when no evidence
  confidence: number; // 0..1, amount + freshness of evidence
  state: SkillState;
  verified: boolean;
  evidenceCount: number;
  bySource: Record<string, { count: number; avg: number }>;
  lastEvidenceAt: string | null;
  lastVerifiedAt: string | null;
  selfRating: number | null;
  prereqIds: string[];
  dueRevisions: number;
  inProgressTopics: number;
};

type EvidenceRow = typeof skillEvidence.$inferSelect;

export function summarize(evidence: EvidenceRow[], now = Date.now()) {
  let wSum = 0;
  let sSum = 0;
  let effective = 0;
  const bySource: Record<string, { count: number; total: number }> = {};
  let lastEvidenceAt: Date | null = null;
  let lastVerifiedAt: Date | null = null;
  let verifiedStrong = false;
  let selfRating: number | null = null;
  let nonSelfCount = 0;
  for (const e of evidence) {
    const ageDays = (now - new Date(e.createdAt).getTime()) / 86400_000;
    const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    const w = (SOURCE_WEIGHT[e.source] ?? 0.5) * e.weight * decay;
    wSum += w;
    sSum += w * e.score;
    effective += w;
    const b = (bySource[e.source] ??= { count: 0, total: 0 });
    b.count++;
    b.total += e.score;
    if (!lastEvidenceAt || new Date(e.createdAt) > lastEvidenceAt) lastEvidenceAt = new Date(e.createdAt);
    if (e.verified) {
      if (!lastVerifiedAt || new Date(e.createdAt) > lastVerifiedAt) lastVerifiedAt = new Date(e.createdAt);
      if (e.score >= 0.7) verifiedStrong = true;
    }
    if (e.source === 'self') selfRating = Math.round(e.score * 4);
    else nonSelfCount++;
  }
  const mastery = wSum > 0 ? sSum / wSum : null;
  const confidence = 1 - Math.exp(-effective / 2.5);
  return {
    mastery,
    confidence,
    bySource: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, { count: v.count, avg: v.total / v.count }])),
    lastEvidenceAt,
    lastVerifiedAt,
    verifiedStrong,
    selfRating,
    nonSelfCount,
  };
}

export async function computeSkillDna(userId: string): Promise<SkillDnaEntry[]> {
  const [allSkills, prereqs, evidence, progressRows] = await Promise.all([
    db.select().from(skills),
    db.select().from(skillPrereqs),
    db.select().from(skillEvidence).where(eq(skillEvidence.userId, userId)),
    db
      .select({ skillId: topics.skillId, status: topicProgress.status, nextReviewAt: topicProgress.nextReviewAt })
      .from(topicProgress)
      .innerJoin(topics, eq(topics.id, topicProgress.topicId))
      .where(eq(topicProgress.userId, userId)),
  ]);
  const evBySkill = new Map<string, EvidenceRow[]>();
  for (const e of evidence) (evBySkill.get(e.skillId) ?? evBySkill.set(e.skillId, []).get(e.skillId)!).push(e);
  const now = Date.now();

  return allSkills.map((s) => {
    const ev = evBySkill.get(s.id) ?? [];
    const sum = summarize(ev, now);
    const prog = progressRows.filter((p) => p.skillId === s.id);
    const dueRevisions = prog.filter((p) => p.status === 'needs_revision' || (p.status === 'completed' && p.nextReviewAt && new Date(p.nextReviewAt).getTime() <= now)).length;
    const inProgressTopics = prog.filter((p) => p.status === 'in_progress').length;

    let state: SkillState = 'not_started';
    if (sum.verifiedStrong && (sum.mastery ?? 0) >= 0.7) state = 'verified';
    else if (sum.nonSelfCount > 0 && (sum.mastery ?? 0) >= 0.6) state = 'demonstrated';
    else if (sum.nonSelfCount > 0 || inProgressTopics > 0) state = 'learning';
    else if (sum.selfRating !== null) state = 'self_declared';
    if (dueRevisions > 0 && (state === 'verified' || state === 'demonstrated')) state = 'needs_revision';
    // Evidence older than ~8 months without refresh needs revision too.
    if ((state === 'verified' || state === 'demonstrated') && sum.lastEvidenceAt && now - sum.lastEvidenceAt.getTime() > 240 * 86400_000) state = 'needs_revision';

    return {
      skillId: s.id,
      slug: s.slug,
      name: s.name,
      category: s.category,
      level: s.level,
      mastery: sum.mastery,
      confidence: sum.confidence,
      state,
      verified: sum.verifiedStrong,
      evidenceCount: ev.length,
      bySource: sum.bySource,
      lastEvidenceAt: sum.lastEvidenceAt?.toISOString() ?? null,
      lastVerifiedAt: sum.lastVerifiedAt?.toISOString() ?? null,
      selfRating: sum.selfRating,
      prereqIds: prereqs.filter((p) => p.skillId === s.id).map((p) => p.prereqId),
      dueRevisions,
      inProgressTopics,
    };
  });
}

/** Insert or update one evidence row (idempotent per source). */
export async function addEvidence(e: {
  userId: string;
  skillId: string;
  source: keyof typeof SOURCE_WEIGHT | string;
  sourceType?: string;
  sourceId?: string;
  score: number;
  weight?: number;
  verified?: boolean;
  verifiedBy?: string | null;
  orgId?: string | null;
  note?: string;
}) {
  const score = Math.max(0, Math.min(1, e.score));
  const values = {
    userId: e.userId,
    skillId: e.skillId,
    source: e.source,
    sourceType: e.sourceType ?? e.source,
    sourceId: e.sourceId ?? 'self',
    score,
    weight: e.weight ?? 1,
    verified: e.verified ?? false,
    verifiedBy: e.verifiedBy ?? null,
    orgId: e.orgId ?? null,
    note: e.note,
  };
  await db
    .insert(skillEvidence)
    .values(values)
    .onConflictDoUpdate({
      target: [skillEvidence.userId, skillEvidence.skillId, skillEvidence.sourceType, skillEvidence.sourceId],
      set: { score, weight: values.weight, verified: values.verified, verifiedBy: values.verifiedBy, note: values.note, createdAt: new Date() },
    });
}

/** Helper for modules that know skills by slug. */
export async function skillIdsBySlug(slugs: string[]) {
  if (!slugs.length) return new Map<string, string>();
  const rows = await db.select({ id: skills.id, slug: skills.slug }).from(skills).where(inArray(skills.slug, slugs));
  return new Map(rows.map((r) => [r.slug, r.id]));
}

export async function activeEnrollmentTrackIds(userId: string) {
  const rows = await db
    .select({ trackId: enrollments.trackId })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.status, 'active')));
  return rows.map((r) => r.trackId);
}

