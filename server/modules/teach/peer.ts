/**
 * Peer assessment: settings, window state, allocation, flags, the peer component and background work.
 *
 * Rules:
 * - Reviews are anonymous to students in both directions; only instructors see names.
 * - Peers never set grades. The instructor's evaluation stays authoritative; "Apply peer component"
 *   records a NEW evaluation row (the previous one is superseded, never overwritten).
 * - Peer opinions are not verification: no Skill DNA evidence is created from peer reviews.
 */
import { and, asc, eq, gt, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  assignments,
  assignmentTeams,
  backgroundJobs,
  submissions,
  teachPeerReviews,
  teachPeerSettings,
  type PeerAllocationNote,
  type RubricCriterion,
} from '../../db/schema';
import type { AuthContext } from '../../lib/context';
import { rolesIn } from '../../lib/context';
import { badRequest } from '../../lib/errors';
import { notify } from '../../lib/notify';
import { enqueue } from '../../jobs/queue';
import { registerPrivacyHandler } from '../privacy/registry';
import { cohortStudentIds, latestSubmitted, round2, rubricMax, submissionRecipients, type Assignment, type Submission } from './service';

export type PeerSettings = typeof teachPeerSettings.$inferSelect;
export type PeerReview = typeof teachPeerReviews.$inferSelect;
export type PeerPhase = 'disabled' | 'not_open' | 'open' | 'closed';

export const PEER_REASON = 'Peer component applied';
export const PEER_TICK_MS = 10 * 60_000;
const HOUR_MS = 3600_000;
const DAY_MS = 86400_000;

export const PEER_DEFAULTS = {
  enabled: false,
  reviewsPerSubmission: 2,
  openMode: 'manual' as 'manual' | 'auto',
  autoOpenHoursAfterDue: 24 as number | null,
  closesAt: null as Date | null,
  minCommentLength: 80,
  peerWeightPercent: 0,
  outlierThresholdPercent: 25,
};

export async function loadPeerSettings(assignmentId: string) {
  const [row] = await db.select().from(teachPeerSettings).where(eq(teachPeerSettings.assignmentId, assignmentId));
  return row ?? null;
}

/** The rubric peers score with: the published snapshot (draft assignments have none yet). */
export function peerRubric(a: Assignment): RubricCriterion[] | null {
  return a.rubricSnapshot?.length ? a.rubricSnapshot : null;
}

/** Window state. "closed" is derived from closesAt, so it never depends on a background job having run. */
export function peerWindow(s: PeerSettings | null, a: Pick<Assignment, 'dueAt'>, now = new Date()) {
  const closesAt = s?.closesAt ? new Date(s.closesAt) : null;
  let opensAt: Date | null = null;
  if (s?.state === 'open' && s.openedAt) opensAt = new Date(s.openedAt);
  else if (s?.openMode === 'auto' && s.autoOpenHoursAfterDue !== null && s.autoOpenHoursAfterDue !== undefined) opensAt = new Date(new Date(a.dueAt).getTime() + s.autoOpenHoursAfterDue * HOUR_MS);
  let phase: PeerPhase;
  if (!s?.enabled) phase = 'disabled';
  else if (s.state !== 'open') phase = 'not_open';
  else if (closesAt && now.getTime() >= closesAt.getTime()) phase = 'closed';
  else phase = 'open';
  const feedbackVisible = !!s?.enabled && s.state === 'open' && (!!s.releasedAt || phase === 'closed');
  return { phase, opensAt, closesAt, openMode: s?.openMode ?? 'manual', releasedAt: s?.releasedAt ?? null, feedbackVisible };
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : round2((s[mid - 1] + s[mid]) / 2);
}

// ---------- Deterministic seeded shuffle ----------

function hashSeed(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same input set + same seed = same order (input is sorted first, so database order does not matter). */
export function seededShuffle<T extends string>(items: T[], seed: string): T[] {
  const out = [...items].sort();
  const rand = mulberry32(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------- Allocation planning (pure) ----------

export type Reviewee = { ownerKey: string; members: string[] };
export type Pair = { ownerKey: string; reviewerId: string };

/**
 * Plans the initial allocation.
 * - Individual work: a seeded circular shift. Reviewer i reviews owners i+1..i+N in the shuffled order, so
 *   every submission gets exactly N reviews and every reviewer writes exactly N (when there are at least N+1 submitters).
 * - Team work: round-robin greedy. Each round gives every team one more reviewer, choosing the eligible reviewer
 *   with the lowest load (ties broken by the seeded order). Members never review their own team.
 */
export function planInitialAllocation(reviewees: Reviewee[], reviewers: string[], n: number, seed: string): Pair[] {
  const individual = reviewees.every((r) => r.members.length === 1 && r.members[0] === r.ownerKey);
  if (individual) {
    const eligible = new Set(reviewers);
    const order = seededShuffle(reviewees.map((r) => r.ownerKey).filter((k) => eligible.has(k)), seed);
    const k = Math.min(n, order.length - 1);
    const pairs: Pair[] = [];
    for (let i = 0; i < order.length; i++) for (let s = 1; s <= k; s++) pairs.push({ reviewerId: order[i], ownerKey: order[(i + s) % order.length] });
    return pairs;
  }
  return planGreedy(reviewees, reviewers, n, seed, []);
}

/** Greedy top-up used for teams and late submissions. Existing pairs count toward loads and are never duplicated. */
export function planGreedy(reviewees: Reviewee[], reviewers: string[], n: number, seed: string, existing: Pair[]): Pair[] {
  const rank = new Map(seededShuffle(reviewers, seed).map((r, i) => [r, i]));
  const order = seededShuffle(reviewees.map((r) => r.ownerKey), `${seed}:reviewees`);
  const byKey = new Map(reviewees.map((r) => [r.ownerKey, r]));
  const load = new Map<string, number>(reviewers.map((r) => [r, 0]));
  const received = new Map<string, number>(reviewees.map((r) => [r.ownerKey, 0]));
  const taken = new Set<string>();
  for (const p of existing) {
    load.set(p.reviewerId, (load.get(p.reviewerId) ?? 0) + 1);
    received.set(p.ownerKey, (received.get(p.ownerKey) ?? 0) + 1);
    taken.add(`${p.ownerKey}:${p.reviewerId}`);
  }
  const out: Pair[] = [];
  for (let round = 0; round < n; round++) {
    for (const key of order) {
      if ((received.get(key) ?? 0) >= n) continue;
      const members = new Set(byKey.get(key)!.members);
      let best: string | null = null;
      for (const r of reviewers) {
        if (members.has(r) || taken.has(`${key}:${r}`)) continue;
        if (best === null || load.get(r)! < load.get(best)! || (load.get(r) === load.get(best) && rank.get(r)! < rank.get(best)!)) best = r;
      }
      if (!best) continue;
      out.push({ ownerKey: key, reviewerId: best });
      taken.add(`${key}:${best}`);
      load.set(best, load.get(best)! + 1);
      received.set(key, (received.get(key) ?? 0) + 1);
    }
  }
  return out;
}

/** Late submitters: first give each new reviewer N reviews of the least-reviewed work, then top up new reviewees. */
export function planLateAllocation(reviewees: Reviewee[], reviewers: string[], n: number, seed: string, existing: Pair[], newReviewers: string[], newOwnerKeys: string[]): Pair[] {
  const byKey = new Map(reviewees.map((r) => [r.ownerKey, r]));
  const rank = new Map(seededShuffle(reviewees.map((r) => r.ownerKey), `${seed}:late`).map((k, i) => [k, i]));
  const received = new Map<string, number>(reviewees.map((r) => [r.ownerKey, 0]));
  const taken = new Set<string>();
  for (const p of existing) {
    received.set(p.ownerKey, (received.get(p.ownerKey) ?? 0) + 1);
    taken.add(`${p.ownerKey}:${p.reviewerId}`);
  }
  const added: Pair[] = [];
  for (const r of seededShuffle(newReviewers, `${seed}:late-reviewers`)) {
    for (let k = 0; k < n; k++) {
      let best: string | null = null;
      for (const e of reviewees) {
        if (e.members.includes(r) || taken.has(`${e.ownerKey}:${r}`)) continue;
        if (best === null || received.get(e.ownerKey)! < received.get(best)! || (received.get(e.ownerKey) === received.get(best) && rank.get(e.ownerKey)! < rank.get(best)!)) best = e.ownerKey;
      }
      if (!best) break;
      added.push({ ownerKey: best, reviewerId: r });
      taken.add(`${best}:${r}`);
      received.set(best, received.get(best)! + 1);
    }
  }
  const topUp = planGreedy(
    newOwnerKeys.map((k) => byKey.get(k)!).filter(Boolean),
    reviewers,
    n,
    `${seed}:late-topup`,
    [...existing, ...added],
  );
  return [...added, ...topUp];
}

// ---------- Allocation (database) ----------

/** Who can be reviewed (latest submitted version per owner) and who reviews (current cohort students among them). */
async function allocationPool(a: Assignment) {
  const latest = await latestSubmitted([a.id], a.orgId);
  const students = new Set(await cohortStudentIds(a.cohortId));
  const teamIds = latest.map((s) => s.teamId).filter(Boolean) as string[];
  const teams = teamIds.length ? await db.select().from(assignmentTeams).where(inArray(assignmentTeams.id, teamIds)) : [];
  const reviewees: (Reviewee & { submission: Submission })[] = [];
  for (const s of latest) {
    if (s.teamId) {
      const team = teams.find((t) => t.id === s.teamId);
      const members = (team?.memberIds ?? [s.userId]).filter((m) => students.has(m));
      if (!members.length) continue;
      reviewees.push({ ownerKey: s.teamId, members, submission: s });
    } else {
      if (!students.has(s.userId)) continue;
      reviewees.push({ ownerKey: s.userId, members: [s.userId], submission: s });
    }
  }
  const reviewers = [...new Set(reviewees.flatMap((r) => r.members))];
  return { reviewees, reviewers };
}

async function activeReviews(assignmentId: string) {
  return db
    .select()
    .from(teachPeerReviews)
    .where(and(eq(teachPeerReviews.assignmentId, assignmentId), ne(teachPeerReviews.status, 'reassigned')));
}

function allocationNoteFor(reviewees: Reviewee[], reviewers: string[], n: number, pairs: Pair[], late?: number): PeerAllocationNote {
  const received = new Map<string, number>();
  for (const p of pairs) received.set(p.ownerKey, (received.get(p.ownerKey) ?? 0) + 1);
  const shortfalls = reviewees.map((r) => ({ ownerKey: r.ownerKey, received: received.get(r.ownerKey) ?? 0 })).filter((x) => x.received < n);
  let message: string | null = null;
  if (reviewees.length < 2) message = 'At least two submissions are needed before anyone can be assigned a review. Use "Allocate late submissions" once more students submit.';
  else if (reviewees.length < n + 1 && reviewees.every((r) => r.members.length === 1)) {
    const k = reviewees.length - 1;
    message = `Only ${reviewees.length} students submitted, so each submission can receive at most ${k} review${k === 1 ? '' : 's'} instead of ${n}. Nobody reviews their own work.`;
  } else if (shortfalls.length) message = `${shortfalls.length} submission${shortfalls.length === 1 ? '' : 's'} received fewer than ${n} reviews because there are not enough eligible reviewers outside the team.`;
  return { submitters: reviewees.length, reviewers: reviewers.length, target: n, shortfalls, message, ...(late !== undefined ? { lateAdded: late } : {}) };
}

/**
 * Runs the allocation for an assignment. Idempotent:
 * - "initial" does nothing once an allocation exists (allocatedAt is set);
 * - "late" only adds owners and reviewers who have no allocation yet.
 */
export async function allocatePeerReviews(assignmentId: string, mode: 'initial' | 'late' = 'initial') {
  const [a] = await db.select().from(assignments).where(eq(assignments.id, assignmentId));
  const s = a ? await loadPeerSettings(a.id) : null;
  if (!a || !s || !s.enabled || s.state !== 'open') return { skipped: true, reason: 'Peer review is not open for this assignment.' };
  if (mode === 'initial' && s.allocatedAt) return { skipped: true, reason: 'Already allocated.' };
  const n = s.reviewsPerSubmission;
  const seed = s.allocationSeed ?? a.id;
  const { reviewees, reviewers } = await allocationPool(a);
  const existing = await activeReviews(a.id);
  const existingPairs = existing.map((r) => ({ ownerKey: r.ownerKey, reviewerId: r.reviewerId }));
  let pairs: Pair[];
  if (mode === 'initial' && !existing.length) pairs = planInitialAllocation(reviewees, reviewers, n, seed);
  else {
    const allocatedOwners = new Set(existing.map((r) => r.ownerKey));
    const allocatedReviewers = new Set(existing.map((r) => r.reviewerId));
    const newOwnerKeys = reviewees.map((r) => r.ownerKey).filter((k) => !allocatedOwners.has(k));
    const newReviewers = reviewers.filter((r) => !allocatedReviewers.has(r));
    pairs = planLateAllocation(reviewees, reviewers, n, seed, existingPairs, newReviewers, newOwnerKeys);
  }
  const byKey = new Map(reviewees.map((r) => [r.ownerKey, r]));
  let created = 0;
  const notifyCounts = new Map<string, number>();
  for (const p of pairs) {
    const sub = byKey.get(p.ownerKey)!.submission;
    const [row] = await db
      .insert(teachPeerReviews)
      .values({ orgId: a.orgId, assignmentId: a.id, submissionId: sub.id, ownerKey: p.ownerKey, reviewerId: p.reviewerId, lateAllocation: mode === 'late' })
      .onConflictDoNothing()
      .returning({ id: teachPeerReviews.id });
    if (!row) continue;
    created++;
    notifyCounts.set(p.reviewerId, (notifyCounts.get(p.reviewerId) ?? 0) + 1);
  }
  const allPairs = [...existingPairs, ...pairs];
  const note = allocationNoteFor(reviewees, reviewers, n, allPairs, mode === 'late' ? created : undefined);
  await db
    .update(teachPeerSettings)
    .set({ allocatedAt: s.allocatedAt ?? new Date(), allocationSeed: seed, allocationNote: note, updatedAt: new Date() })
    .where(eq(teachPeerSettings.assignmentId, a.id));
  const closes = s.closesAt ? ` Reviews are due ${new Date(s.closesAt).toUTCString()}.` : '';
  for (const [uid, count] of notifyCounts) {
    await notify(uid, {
      type: 'assignment.peer_assigned',
      category: 'assignments',
      orgId: a.orgId,
      title: `Peer review${count === 1 ? '' : 's'} to do: ${a.title}`,
      body: `You have ${count} anonymous peer review${count === 1 ? '' : 's'} to write.${closes}`,
      link: `/app/assignments/${a.id}`,
    });
  }
  return { created, total: allPairs.length, note };
}

export async function enqueuePeerAllocation(a: Assignment, mode: 'initial' | 'late', actorId: string | null) {
  return enqueue('teach.peer_allocate', { assignmentId: a.id, mode }, { idempotencyKey: mode === 'initial' ? `teach.peer_allocate:${a.id}:initial` : `teach.peer_allocate:${a.id}:late:${Date.now()}`, orgId: a.orgId, createdBy: actorId });
}

export async function pendingAllocationJob(assignmentId: string) {
  const [row] = await db
    .select({ id: backgroundJobs.id })
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.type, 'teach.peer_allocate'), inArray(backgroundJobs.status, ['queued', 'running', 'retrying']), sql`${backgroundJobs.payload}->>'assignmentId' = ${assignmentId}`))
    .limit(1);
  return !!row;
}

// ---------- Scoring and flags ----------

/** Validates rubric picks. Drafts may be partial; submitted reviews must score every criterion. */
export function scorePeerPicks(criteria: RubricCriterion[], picks: { criterionId: string; levelLabel: string; comment?: string }[], maxPoints: number, complete: boolean) {
  const out: { criterionId: string; levelLabel: string; points: number; comment?: string }[] = [];
  for (const crit of criteria) {
    const pick = picks.find((p) => p.criterionId === crit.id);
    if (!pick || !pick.levelLabel) {
      if (complete) throw badRequest(`Choose a level for "${crit.title}".`, { fields: { [`rubric.${crit.id}`]: 'Choose a level' } });
      if (pick?.comment) out.push({ criterionId: crit.id, levelLabel: '', points: 0, comment: pick.comment });
      continue;
    }
    const level = crit.levels.find((l) => l.label === pick.levelLabel);
    if (!level) throw badRequest(`"${pick.levelLabel}" is not a level of "${crit.title}".`);
    out.push({ criterionId: crit.id, levelLabel: level.label, points: level.points, ...(pick.comment ? { comment: pick.comment } : {}) });
  }
  for (const p of picks) if (!criteria.some((c) => c.id === p.criterionId)) throw badRequest('One of the scores refers to a criterion that is not in the rubric.');
  const scored = out.filter((x) => x.levelLabel);
  const max = rubricMax(criteria);
  const score = complete && max > 0 ? round2((scored.reduce((s, x) => s + x.points, 0) / max) * maxPoints) : null;
  return { rubricScores: out, score };
}

export function normalizeText(s: string | null | undefined) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export type PeerFlag = { kind: 'outlier' | 'short' | 'copied' | 'student_flag'; text: string };

/** Flags for the instructor dashboard. Only submitted, non-excluded reviews count toward medians. */
export function peerFlags(reviews: PeerReview[], settings: Pick<PeerSettings, 'minCommentLength' | 'outlierThresholdPercent'>, maxPoints: number, submissionText: Map<string, string | null>) {
  const counted = reviews.filter((r) => r.status === 'submitted' && !r.excludedAt && r.score !== null);
  const commentUse = new Map<string, number>();
  for (const r of reviews) {
    if (r.status !== 'submitted') continue;
    const n = normalizeText(r.comment);
    if (n) commentUse.set(n, (commentUse.get(n) ?? 0) + 1);
  }
  const threshold = (settings.outlierThresholdPercent / 100) * maxPoints;
  const out = new Map<string, PeerFlag[]>();
  for (const r of reviews) {
    const flags: PeerFlag[] = [];
    if (r.status === 'submitted') {
      const comment = (r.comment ?? '').trim();
      if (comment.length < settings.minCommentLength) flags.push({ kind: 'short', text: `Comment is ${comment.length} characters; the minimum is ${settings.minCommentLength}.` });
      const n = normalizeText(r.comment);
      const subText = normalizeText(submissionText.get(r.submissionId));
      if (n && (commentUse.get(n) ?? 0) > 1) flags.push({ kind: 'copied', text: 'The same comment appears in another review of this assignment.' });
      else if (n.length >= 40 && subText.includes(n)) flags.push({ kind: 'copied', text: 'The comment is copied from the submission itself.' });
      if (!r.excludedAt && r.score !== null) {
        const others = counted.filter((o) => o.ownerKey === r.ownerKey && o.id !== r.id).map((o) => o.score!);
        const m = median(others);
        if (m !== null && Math.abs(r.score - m) > threshold) flags.push({ kind: 'outlier', text: `Score ${r.score} is ${round2(Math.abs(r.score - m))} points from the median of the other reviews (${m}).` });
      }
    }
    if (r.flaggedAt) flags.push({ kind: 'student_flag', text: `Flagged by the student who received it${r.flagReason ? `: ${r.flagReason}` : '.'}` });
    out.set(r.id, flags);
  }
  return out;
}

/** Peer medians (per criterion and total) from submitted, non-excluded reviews of one owner. */
export function peerMedians(reviews: PeerReview[], criteria: RubricCriterion[]) {
  const counted = reviews.filter((r) => r.status === 'submitted' && !r.excludedAt && r.score !== null);
  const byCriterion: Record<string, number | null> = {};
  for (const c of criteria) byCriterion[c.id] = median(counted.map((r) => r.rubricScores.find((x) => x.criterionId === c.id)).filter((x) => x && x.levelLabel).map((x) => x!.points));
  return { count: counted.length, byCriterion, total: median(counted.map((r) => r.score!)) };
}

/** final = instructor score x (1 - w) + peer median x w; the instructor's late-penalty share is kept. */
export function blendScore(instructor: { rawScore: number; latePenalty: number }, peerMedian: number, weightPercent: number) {
  const w = weightPercent / 100;
  const rawScore = round2(instructor.rawScore * (1 - w) + peerMedian * w);
  const ratio = instructor.rawScore > 0 ? instructor.latePenalty / instructor.rawScore : 0;
  const latePenalty = round2(rawScore * ratio);
  return { rawScore, latePenalty, finalScore: Math.max(0, round2(rawScore - latePenalty)) };
}

// ---------- Access helpers ----------

/** Owner keys a student is reviewed under for an assignment: themselves and their team. */
export async function ownerKeysFor(assignmentId: string, userId: string) {
  const teams = await db
    .select({ id: assignmentTeams.id })
    .from(assignmentTeams)
    .where(and(eq(assignmentTeams.assignmentId, assignmentId), sql`${userId}::uuid = ANY(${assignmentTeams.memberIds})`));
  return [userId, ...teams.map((t) => t.id)];
}

/**
 * File access for peer reviewers: only a reviewer allocated to a submission containing the file, while the review
 * window is open (or their review was reopened by the instructor), may download it.
 */
export async function canPeerReadSubmissionFile(auth: AuthContext, fileId: string) {
  const rows = await db
    .select({ r: teachPeerReviews, fileIds: submissions.fileIds, subOrg: submissions.orgId })
    .from(teachPeerReviews)
    .innerJoin(submissions, eq(submissions.id, teachPeerReviews.submissionId))
    .where(and(eq(teachPeerReviews.reviewerId, auth.user.id), ne(teachPeerReviews.status, 'reassigned'), sql`${fileId}::uuid = ANY(${submissions.fileIds})`));
  for (const { r, subOrg } of rows) {
    if (r.orgId !== subOrg || !rolesIn(auth, r.orgId).length) continue;
    const [a] = await db.select().from(assignments).where(eq(assignments.id, r.assignmentId));
    if (!a || a.status === 'draft') continue;
    const w = peerWindow(await loadPeerSettings(a.id), a);
    if (w.phase === 'open' || (r.reopenedAt && r.status === 'draft' && w.phase !== 'disabled')) return true;
  }
  return false;
}

// ---------- Notifications for released feedback ----------

export async function notifyFeedbackReleased(a: Assignment) {
  const reviews = (await activeReviews(a.id)).filter((r) => r.status === 'submitted' && !r.excludedAt);
  const owners = [...new Set(reviews.map((r) => r.submissionId))];
  const subs = owners.length ? await db.select().from(submissions).where(inArray(submissions.id, owners)) : [];
  const recipients = new Set<string>();
  for (const s of subs) for (const uid of await submissionRecipients(s)) recipients.add(uid);
  for (const uid of recipients) {
    await notify(uid, {
      type: 'assignment.peer_feedback',
      category: 'assignments',
      orgId: a.orgId,
      title: `Peer feedback available: ${a.title}`,
      body: 'Anonymous feedback from your classmates is ready. You can rate how helpful each review was.',
      link: `/app/assignments/${a.id}`,
    });
  }
  return recipients.size;
}

// ---------- Background tick: auto-open, 24-hour reminders, release at close ----------

export async function runPeerTick(now = new Date()) {
  const rows = await db
    .select({ s: teachPeerSettings, a: assignments })
    .from(teachPeerSettings)
    .innerJoin(assignments, eq(assignments.id, teachPeerSettings.assignmentId))
    .where(and(eq(teachPeerSettings.enabled, true), inArray(assignments.status, ['published', 'closed'])));
  let opened = 0;
  let reminded = 0;
  let released = 0;
  for (const { s, a } of rows) {
    const w = peerWindow(s, a, now);
    if (w.phase === 'not_open' && s.openMode === 'auto' && w.opensAt && w.opensAt.getTime() <= now.getTime() && a.rubricSnapshot?.length && (!s.closesAt || new Date(s.closesAt).getTime() > now.getTime())) {
      const [row] = await db
        .update(teachPeerSettings)
        .set({ state: 'open', openedAt: now, updatedAt: now })
        .where(and(eq(teachPeerSettings.assignmentId, a.id), eq(teachPeerSettings.state, 'not_open')))
        .returning();
      if (row) {
        await enqueuePeerAllocation(a, 'initial', null);
        opened++;
      }
      continue;
    }
    if (w.phase === 'open' && w.closesAt && w.closesAt.getTime() - now.getTime() <= DAY_MS) {
      const due = await db
        .update(teachPeerReviews)
        .set({ remindedAt: now })
        .where(and(eq(teachPeerReviews.assignmentId, a.id), inArray(teachPeerReviews.status, ['assigned', 'draft']), isNull(teachPeerReviews.remindedAt)))
        .returning({ reviewerId: teachPeerReviews.reviewerId });
      const per = new Map<string, number>();
      for (const d of due) per.set(d.reviewerId, (per.get(d.reviewerId) ?? 0) + 1);
      for (const [uid, count] of per) {
        await notify(uid, {
          type: 'assignment.peer_reminder',
          category: 'assignments',
          orgId: a.orgId,
          title: `Peer reviews close within 24 hours: ${a.title}`,
          body: `You have ${count} peer review${count === 1 ? '' : 's'} left to submit. Drafts are not counted.`,
          link: `/app/assignments/${a.id}`,
        });
        reminded++;
      }
    }
    if (w.phase === 'closed' && !s.releasedAt) {
      const [row] = await db
        .update(teachPeerSettings)
        .set({ releasedAt: now, releasedBy: null, updatedAt: now })
        .where(and(eq(teachPeerSettings.assignmentId, a.id), isNull(teachPeerSettings.releasedAt)))
        .returning();
      if (row) {
        await notifyFeedbackReleased(a);
        released++;
      }
    }
  }
  return { checked: rows.length, opened, reminded, released };
}

// ---------- Calendar ----------

/**
 * Peer review deadlines for the personal calendar: one item per assignment where the user has reviews to write
 * and the window has a closing time in range. Shape matches workspace CalendarItem (type 'assignment').
 */
export async function peerReviewCalendarItems(userId: string, from: Date, to: Date) {
  const rows = await db
    .select({ assignmentId: assignments.id, title: assignments.title, closesAt: teachPeerSettings.closesAt, status: teachPeerReviews.status, orgId: assignments.orgId })
    .from(teachPeerReviews)
    .innerJoin(assignments, eq(assignments.id, teachPeerReviews.assignmentId))
    .innerJoin(teachPeerSettings, eq(teachPeerSettings.assignmentId, assignments.id))
    .where(
      and(
        eq(teachPeerReviews.reviewerId, userId),
        ne(teachPeerReviews.status, 'reassigned'),
        eq(teachPeerSettings.enabled, true),
        eq(teachPeerSettings.state, 'open'),
        inArray(assignments.status, ['published', 'closed']),
        gt(teachPeerSettings.closesAt, from),
        lte(teachPeerSettings.closesAt, to),
      ),
    )
    .orderBy(asc(teachPeerSettings.closesAt));
  const byAssignment = new Map<string, { title: string; closesAt: Date; total: number; done: number }>();
  for (const r of rows) {
    const x = byAssignment.get(r.assignmentId) ?? { title: r.title, closesAt: r.closesAt!, total: 0, done: 0 };
    x.total++;
    if (r.status === 'submitted') x.done++;
    byAssignment.set(r.assignmentId, x);
  }
  return [...byAssignment.entries()].map(([id, x]) => ({
    id: `peer-${id}`,
    type: 'assignment' as const,
    title: `Peer reviews due: ${x.title}`,
    at: new Date(x.closesAt).toISOString(),
    link: `/app/assignments/${id}`,
    detail: `${x.done} of ${x.total} peer review${x.total === 1 ? '' : 's'} submitted`,
    done: x.done === x.total,
  }));
}

// ---------- Privacy ----------

registerPrivacyHandler({
  key: 'teach_peer_reviews',
  label: 'Peer reviews you wrote and peer feedback you rated or flagged',
  tables: ['teach_peer_reviews', 'teach_peer_settings'],
  retention: 'Submitted peer reviews are academic records kept by your institution under an anonymous label; unsubmitted drafts are deleted.',
  count: async (userId) => (await db.select({ id: teachPeerReviews.id }).from(teachPeerReviews).where(eq(teachPeerReviews.reviewerId, userId))).length,
  export: async (userId) => {
    const written = await db
      .select({ assignment: assignments.title, status: teachPeerReviews.status, rubricScores: teachPeerReviews.rubricScores, comment: teachPeerReviews.comment, score: teachPeerReviews.score, submittedAt: teachPeerReviews.submittedAt })
      .from(teachPeerReviews)
      .innerJoin(assignments, eq(assignments.id, teachPeerReviews.assignmentId))
      .where(and(eq(teachPeerReviews.reviewerId, userId), ne(teachPeerReviews.status, 'reassigned')));
    // Feedback received stays anonymous: reviewer identities are never part of the archive.
    const teams = await db.select({ id: assignmentTeams.id }).from(assignmentTeams).where(sql`${userId}::uuid = ANY(${assignmentTeams.memberIds})`);
    const keys = [userId, ...teams.map((t) => t.id)];
    const received = await db
      .select({ assignment: assignments.title, rubricScores: teachPeerReviews.rubricScores, comment: teachPeerReviews.comment, score: teachPeerReviews.score, helpfulness: teachPeerReviews.helpfulness, flagReason: teachPeerReviews.flagReason, released: teachPeerSettings.releasedAt })
      .from(teachPeerReviews)
      .innerJoin(assignments, eq(assignments.id, teachPeerReviews.assignmentId))
      .innerJoin(teachPeerSettings, eq(teachPeerSettings.assignmentId, teachPeerReviews.assignmentId))
      .where(and(inArray(teachPeerReviews.ownerKey, keys), eq(teachPeerReviews.status, 'submitted'), isNull(teachPeerReviews.excludedAt)));
    return { written, received: received.filter((r) => r.released).map(({ released: _r, ...r }) => r) };
  },
  erase: async (userId) => {
    const drafts = await db
      .delete(teachPeerReviews)
      .where(and(eq(teachPeerReviews.reviewerId, userId), inArray(teachPeerReviews.status, ['assigned', 'draft'])))
      .returning({ id: teachPeerReviews.id });
    const flags = await db
      .update(teachPeerReviews)
      .set({ flagReason: '[removed: account deleted]' })
      .where(and(eq(teachPeerReviews.ownerKey, userId), sql`${teachPeerReviews.flagReason} is not null`))
      .returning({ id: teachPeerReviews.id });
    const kept = await db.select({ id: teachPeerReviews.id }).from(teachPeerReviews).where(eq(teachPeerReviews.reviewerId, userId));
    return { action: 'anonymized', count: drafts.length + flags.length + kept.length, reason: 'Submitted peer reviews stay with your institution as academic records under an anonymous label; unsubmitted drafts were deleted.' };
  },
});
