/**
 * Teach: peer assessment.
 * Faculty: /assignments/:id/peer (settings, dashboard, open, allocate late, release, apply) and /peer-reviews/:id/* actions.
 * Students: /my/peer-reviews (reviews to write) and /my/assignments/:id/peer, /my/peer-feedback/:id/* (feedback received).
 * Students never receive names or ids of the people they review or who reviewed them.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../../db/client';
import { assignments, assignmentTeams, cohortMembers, evaluations, submissions, teachPeerReviews, teachPeerSettings } from '../../db/schema';
import { type AppEnv, type Ctx, requireAuth, rolesIn } from '../../lib/context';
import { body, idParam, patchSchema } from '../../lib/validate';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { recordActivity, XP } from '../../lib/activity';
import { registerFileAccess } from '../files/service';
import {
  cohortStudentIds,
  currentEvaluation,
  currentEvaluations,
  fileMeta,
  isCohortStudent,
  isStaff,
  latestSubmitted,
  loadAssignmentForStaff,
  loadAssignmentForStudent,
  submissionRecipients,
  userNames,
  type Assignment,
} from './service';
import {
  PEER_DEFAULTS,
  PEER_REASON,
  blendScore,
  canPeerReadSubmissionFile,
  enqueuePeerAllocation,
  loadPeerSettings,
  notifyFeedbackReleased,
  ownerKeysFor,
  peerFlags,
  peerMedians,
  peerRubric,
  peerWindow,
  pendingAllocationJob,
  scorePeerPicks,
  type PeerReview,
  type PeerSettings,
} from './peer';

export const peerRoutes = new Hono<AppEnv>();

// Allocated reviewers may download the files of the submissions they review, during the window only.
registerFileAccess('submission', (auth, file) => canPeerReadSubmissionFile(auth, file.id));

const isoDate = z.string().datetime({ offset: true, message: 'Enter a valid date and time.' });
const settingsFields = z.object({
  enabled: z.boolean(),
  reviewsPerSubmission: z.number().int().min(1, 'At least 1 review.').max(5, 'At most 5 reviews.'),
  openMode: z.enum(['manual', 'auto']),
  autoOpenHoursAfterDue: z.number().int().min(0).max(24 * 30).nullable(),
  closesAt: isoDate.nullable(),
  minCommentLength: z.number().int().min(20, 'Use at least 20 characters.').max(2000),
  peerWeightPercent: z.number().min(0).max(50, 'The peer component can be at most 50%.'),
  outlierThresholdPercent: z.number().min(5).max(100),
});
const settingsPatch = patchSchema(settingsFields);

const pickSchema = z.object({ criterionId: z.string().min(1).max(40), levelLabel: z.string().max(60).default(''), comment: z.string().trim().max(2000).optional() });
const reviewInput = z.object({ rubricScores: z.array(pickSchema).max(20).default([]), comment: z.string().max(10000).default('') });

function publicSettings(s: PeerSettings | null) {
  return {
    exists: !!s,
    enabled: s?.enabled ?? PEER_DEFAULTS.enabled,
    reviewsPerSubmission: s?.reviewsPerSubmission ?? PEER_DEFAULTS.reviewsPerSubmission,
    openMode: (s?.openMode ?? PEER_DEFAULTS.openMode) as 'manual' | 'auto',
    autoOpenHoursAfterDue: s ? s.autoOpenHoursAfterDue : PEER_DEFAULTS.autoOpenHoursAfterDue,
    closesAt: s?.closesAt ?? null,
    minCommentLength: s?.minCommentLength ?? PEER_DEFAULTS.minCommentLength,
    peerWeightPercent: s?.peerWeightPercent ?? PEER_DEFAULTS.peerWeightPercent,
    outlierThresholdPercent: s?.outlierThresholdPercent ?? PEER_DEFAULTS.outlierThresholdPercent,
    state: s?.state ?? 'not_open',
    openedAt: s?.openedAt ?? null,
    allocatedAt: s?.allocatedAt ?? null,
    allocationNote: s?.allocationNote ?? null,
    releasedAt: s?.releasedAt ?? null,
    releasedAutomatically: !!s?.releasedAt && !s.releasedBy,
  };
}

function rubricFor(a: Assignment) {
  return peerRubric(a);
}

async function activeReviewsFor(assignmentId: string) {
  return db
    .select()
    .from(teachPeerReviews)
    .where(and(eq(teachPeerReviews.assignmentId, assignmentId), ne(teachPeerReviews.status, 'reassigned')))
    .orderBy(asc(teachPeerReviews.createdAt), asc(teachPeerReviews.id));
}

function letter(i: number) {
  return i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`;
}

// =====================================================================================
// Faculty
// =====================================================================================

async function ownerNames(a: Assignment, keys: string[]) {
  const teamRows = a.collaboration === 'team' && keys.length ? await db.select().from(assignmentTeams).where(and(eq(assignmentTeams.assignmentId, a.id), inArray(assignmentTeams.id, keys))) : [];
  const names = await userNames(keys.filter((k) => !teamRows.some((t) => t.id === k)));
  return (key: string) => teamRows.find((t) => t.id === key)?.name ?? names.get(key)?.name ?? 'Unknown';
}

peerRoutes.get('/assignments/:id/peer', async (c) => {
  const { assignment: a } = await loadAssignmentForStaff(c, idParam(c));
  const s = await loadPeerSettings(a.id);
  const w = peerWindow(s, a);
  const criteria = rubricFor(a) ?? [];
  const reviews = s ? await activeReviewsFor(a.id) : [];
  const latest = await latestSubmitted([a.id], a.orgId);
  const evals = await currentEvaluations(latest.map((x) => x.id));
  const reviewedSubs = [...new Set(reviews.map((r) => r.submissionId))];
  const subTexts = reviewedSubs.length ? await db.select({ id: submissions.id, text: submissions.text }).from(submissions).where(inArray(submissions.id, reviewedSubs)) : [];
  const flags = peerFlags(reviews, { minCommentLength: s?.minCommentLength ?? PEER_DEFAULTS.minCommentLength, outlierThresholdPercent: s?.outlierThresholdPercent ?? PEER_DEFAULTS.outlierThresholdPercent }, a.maxPoints, new Map(subTexts.map((x) => [x.id, x.text])));
  const ownerKeyOf = (sub: { teamId: string | null; userId: string }) => sub.teamId ?? sub.userId;
  const students = await cohortStudentIds(a.cohortId);
  const names = await userNames([...students, ...reviews.map((r) => r.reviewerId), ...reviews.map((r) => r.excludedBy ?? '')]);
  const nameOfOwner = await ownerNames(a, [...new Set([...latest.map(ownerKeyOf), ...reviews.map((r) => r.ownerKey)])]);
  const allocatedOwners = new Set(reviews.map((r) => r.ownerKey));
  const allocatedReviewers = new Set(reviews.map((r) => r.reviewerId));
  const teams = a.collaboration === 'team' ? await db.select().from(assignmentTeams).where(eq(assignmentTeams.assignmentId, a.id)) : [];

  const reviewerIds = [...new Set(reviews.map((r) => r.reviewerId))];
  const reviewers = reviewerIds
    .map((uid) => {
      const mine = reviews.filter((r) => r.reviewerId === uid);
      return { userId: uid, name: names.get(uid)?.name ?? 'Unknown', assigned: mine.length, submitted: mine.filter((r) => r.status === 'submitted').length, drafts: mine.filter((r) => r.status === 'draft').length };
    })
    .sort((x, y) => x.submitted / Math.max(1, x.assigned) - y.submitted / Math.max(1, y.assigned) || x.name.localeCompare(y.name));

  const subRows = latest
    .map((sub) => {
      const key = ownerKeyOf(sub);
      const mine = reviews.filter((r) => r.ownerKey === key);
      const med = peerMedians(mine, criteria);
      const e = evals.get(sub.id) ?? null;
      return {
        ownerKey: key,
        submissionId: sub.id,
        name: nameOfOwner(key),
        isTeam: !!sub.teamId,
        assigned: mine.length,
        received: med.count,
        medianByCriterion: med.byCriterion,
        medianScore: med.total,
        allocated: allocatedOwners.has(key),
        instructor: e ? { evaluationId: e.id, rawScore: e.rawScore, finalScore: e.finalScore, released: e.released, peerApplied: e.reason === PEER_REASON } : null,
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));

  const reviewRows = reviews.map((r) => ({
    id: r.id,
    reviewer: { id: r.reviewerId, name: names.get(r.reviewerId)?.name ?? 'Unknown' },
    reviewee: { ownerKey: r.ownerKey, name: nameOfOwner(r.ownerKey) },
    status: r.status,
    score: r.score,
    comment: r.comment,
    rubricScores: r.rubricScores,
    savedAt: r.savedAt,
    submittedAt: r.submittedAt,
    reopenedAt: r.reopenedAt,
    lateAllocation: r.lateAllocation,
    excluded: r.excludedAt ? { at: r.excludedAt, reason: r.excludedReason, byName: names.get(r.excludedBy ?? '')?.name ?? 'Instructor' } : null,
    helpfulness: r.helpfulness,
    studentFlag: r.flaggedAt ? { at: r.flaggedAt, reason: r.flagReason } : null,
    flags: flags.get(r.id) ?? [],
  }));

  // Late submitters: owners or reviewers with work submitted but no allocation yet.
  const pool = new Set(students);
  const unallocated = s?.allocatedAt
    ? latest
        .filter((sub) => {
          const key = ownerKeyOf(sub);
          const members = sub.teamId ? (teams.find((t) => t.id === sub.teamId)?.memberIds ?? []) : [sub.userId];
          return members.some((m) => pool.has(m)) && (!allocatedOwners.has(key) || members.some((m) => pool.has(m) && !allocatedReviewers.has(m)));
        })
        .map((sub) => ({ ownerKey: ownerKeyOf(sub), name: nameOfOwner(ownerKeyOf(sub)), submittedAt: sub.submittedAt }))
    : [];

  const canEnable = !a.rubricId && !a.rubricSnapshot?.length ? { ok: false, reason: 'Attach a rubric on the Details tab first. Peers score with the assignment rubric.' } : { ok: true, reason: null };
  const openBlock = !s?.enabled
    ? 'Turn on peer review and save the settings first.'
    : a.status === 'draft'
      ? 'Publish the assignment first.'
      : !a.rubricSnapshot?.length
        ? 'The published assignment has no rubric snapshot.'
        : s.state === 'open'
          ? 'The review window is already open.'
          : s.closesAt && new Date(s.closesAt).getTime() <= Date.now()
            ? 'The closing time has passed. Move it later first.'
            : null;

  return c.json({
    assignment: { id: a.id, title: a.title, status: a.status, dueAt: a.dueAt, maxPoints: a.maxPoints, collaboration: a.collaboration },
    settings: publicSettings(s),
    window: w,
    rubric: criteria,
    canEnable,
    openBlock,
    allocation: { pending: s ? await pendingAllocationJob(a.id) : false, unallocated },
    reviewers,
    submissions: subRows,
    reviews: reviewRows,
    students: students.map((uid) => ({ userId: uid, name: names.get(uid)?.name ?? 'Unknown' })).sort((x, y) => x.name.localeCompare(y.name)),
    teams: teams.map((t) => ({ id: t.id, name: t.name, memberIds: t.memberIds })),
    counts: {
      reviews: reviewRows.length,
      submitted: reviewRows.filter((r) => r.status === 'submitted').length,
      flagged: reviewRows.filter((r) => r.flags.length > 0).length,
      excluded: reviewRows.filter((r) => r.excluded).length,
      submissions: latest.length,
    },
  });
});

peerRoutes.patch('/assignments/:id/peer', async (c) => {
  const auth = requireAuth(c);
  const { assignment: a } = await loadAssignmentForStaff(c, idParam(c));
  const input = await body(c, settingsPatch);
  const s = await loadPeerSettings(a.id);
  const cur = publicSettings(s);
  const next = {
    enabled: input.enabled ?? cur.enabled,
    reviewsPerSubmission: input.reviewsPerSubmission ?? cur.reviewsPerSubmission,
    openMode: input.openMode ?? cur.openMode,
    autoOpenHoursAfterDue: input.autoOpenHoursAfterDue !== undefined ? input.autoOpenHoursAfterDue : cur.autoOpenHoursAfterDue,
    closesAt: input.closesAt !== undefined ? (input.closesAt ? new Date(input.closesAt) : null) : cur.closesAt ? new Date(cur.closesAt) : null,
    minCommentLength: input.minCommentLength ?? cur.minCommentLength,
    peerWeightPercent: input.peerWeightPercent ?? cur.peerWeightPercent,
    outlierThresholdPercent: input.outlierThresholdPercent ?? cur.outlierThresholdPercent,
  };
  const isOpen = s?.state === 'open';
  if (isOpen) {
    if (!next.enabled) throw conflict('The review window is open, so peer review cannot be turned off. Release or exclude reviews instead.');
    if (s!.allocatedAt && next.reviewsPerSubmission !== s!.reviewsPerSubmission) throw conflict('Reviews per submission cannot change after reviews were allocated.');
    if (next.openMode !== s!.openMode || next.autoOpenHoursAfterDue !== s!.autoOpenHoursAfterDue) throw conflict('The opening rule cannot change after the window opened.');
  }
  if (next.enabled) {
    if (!a.rubricId && !a.rubricSnapshot?.length) throw badRequest('Attach a rubric first. Peers score with the assignment rubric.', { fields: { enabled: 'Needs a rubric' } });
    if (!next.closesAt) throw badRequest('Choose when the review window closes.', { fields: { closesAt: 'Required' } });
    if (next.openMode === 'auto' && (next.autoOpenHoursAfterDue === null || next.autoOpenHoursAfterDue === undefined))
      throw badRequest('Choose how many hours after the due date the window opens.', { fields: { autoOpenHoursAfterDue: 'Required' } });
    const earliest = new Date(a.dueAt).getTime() + (next.openMode === 'auto' ? (next.autoOpenHoursAfterDue ?? 0) * 3600_000 : 0);
    if (!isOpen && next.closesAt.getTime() <= earliest) throw badRequest(next.openMode === 'auto' ? 'The window must close after it opens.' : 'The window must close after the assignment due date.', { fields: { closesAt: 'Too early' } });
  }
  const values = { ...next, autoOpenHoursAfterDue: next.openMode === 'auto' ? next.autoOpenHoursAfterDue : (next.autoOpenHoursAfterDue ?? null), updatedAt: new Date() };
  const [row] = await db
    .insert(teachPeerSettings)
    .values({ assignmentId: a.id, orgId: a.orgId, ...values })
    .onConflictDoUpdate({ target: teachPeerSettings.assignmentId, set: values })
    .returning();
  await audit(c, { action: 'teach.peer.settings', orgId: a.orgId, targetType: 'assignment', targetId: a.id, actorId: auth.user.id, meta: { changed: Object.keys(input), enabled: row.enabled, peerWeightPercent: row.peerWeightPercent, reviewsPerSubmission: row.reviewsPerSubmission } });
  return c.json({ settings: publicSettings(row) });
});

peerRoutes.post('/assignments/:id/peer/open', async (c) => {
  const auth = requireAuth(c);
  const { assignment: a } = await loadAssignmentForStaff(c, idParam(c));
  const s = await loadPeerSettings(a.id);
  if (!s?.enabled) throw conflict('Turn on peer review and save the settings first.');
  if (a.status === 'draft') throw conflict('Publish the assignment before opening peer review.');
  if (!a.rubricSnapshot?.length) throw conflict('The published assignment has no rubric, so peers have nothing to score with.');
  if (s.state === 'open') throw conflict('The review window is already open.');
  if (!s.closesAt || new Date(s.closesAt).getTime() <= Date.now()) throw conflict('The closing time has passed. Move it later first.');
  const now = new Date();
  const [row] = await db
    .update(teachPeerSettings)
    .set({ state: 'open', openedAt: now, openedBy: auth.user.id, allocationSeed: s.allocationSeed ?? a.id, updatedAt: now })
    .where(and(eq(teachPeerSettings.assignmentId, a.id), eq(teachPeerSettings.state, 'not_open')))
    .returning();
  if (!row) throw conflict('The review window is already open.');
  const { job } = await enqueuePeerAllocation(a, 'initial', auth.user.id);
  await audit(c, { action: 'teach.peer.open', orgId: a.orgId, targetType: 'assignment', targetId: a.id, meta: { jobId: job?.id ?? null, beforeDue: now.getTime() < new Date(a.dueAt).getTime() } });
  return c.json({ settings: publicSettings(row), queued: true });
});

peerRoutes.post('/assignments/:id/peer/allocate-late', async (c) => {
  const auth = requireAuth(c);
  const { assignment: a } = await loadAssignmentForStaff(c, idParam(c));
  const s = await loadPeerSettings(a.id);
  const w = peerWindow(s, a);
  if (w.phase !== 'open') throw conflict('Late submissions can only be allocated while the review window is open.');
  if (!s!.allocatedAt) throw conflict('The first allocation has not finished yet. Try again in a moment.');
  const { job } = await enqueuePeerAllocation(a, 'late', auth.user.id);
  await audit(c, { action: 'teach.peer.allocate_late', orgId: a.orgId, targetType: 'assignment', targetId: a.id, meta: { jobId: job?.id ?? null } });
  return c.json({ queued: true });
});

peerRoutes.post('/assignments/:id/peer/release', async (c) => {
  const auth = requireAuth(c);
  const { assignment: a } = await loadAssignmentForStaff(c, idParam(c));
  const s = await loadPeerSettings(a.id);
  if (!s?.enabled || s.state !== 'open') throw conflict('Open the review window before releasing peer feedback.');
  if (s.releasedAt) throw conflict('Peer feedback is already released.');
  const now = new Date();
  const [row] = await db
    .update(teachPeerSettings)
    .set({ releasedAt: now, releasedBy: auth.user.id, updatedAt: now })
    .where(and(eq(teachPeerSettings.assignmentId, a.id), eq(teachPeerSettings.state, 'open')))
    .returning();
  const notified = await notifyFeedbackReleased(a);
  await audit(c, { action: 'teach.peer.release', orgId: a.orgId, targetType: 'assignment', targetId: a.id, meta: { notified } });
  return c.json({ settings: publicSettings(row), notified });
});

/**
 * Records a NEW evaluation per submission: final = instructor score x (1 - w) + peer median x w.
 * Requires an existing instructor evaluation; the previous row is superseded, never changed otherwise.
 */
peerRoutes.post('/assignments/:id/peer/apply', async (c) => {
  const auth = requireAuth(c);
  const { assignment: a } = await loadAssignmentForStaff(c, idParam(c));
  const input = await body(c, z.object({ submissionIds: z.array(z.string().uuid()).max(500).optional() }));
  const s = await loadPeerSettings(a.id);
  const w = peerWindow(s, a);
  if (!s?.enabled || s.state !== 'open') throw conflict('Peer review has not run for this assignment.');
  if (!w.feedbackVisible) throw conflict('Close the review window or release peer feedback before applying the peer component.');
  if (s.peerWeightPercent <= 0) throw badRequest('The peer weight is 0%, so peer feedback is advisory only. Set a weight above 0 to apply it.');
  const criteria = rubricFor(a) ?? [];
  const reviews = await activeReviewsFor(a.id);
  let latest = await latestSubmitted([a.id], a.orgId);
  if (input.submissionIds?.length) latest = latest.filter((x) => input.submissionIds!.includes(x.id));
  const applied: { submissionId: string; evaluationId: string; previousFinalScore: number; peerMedian: number; finalScore: number }[] = [];
  const skipped: { submissionId: string; reason: string }[] = [];
  for (const sub of latest) {
    const key = sub.teamId ?? sub.userId;
    const cur = await currentEvaluation(sub.id);
    if (!cur) {
      skipped.push({ submissionId: sub.id, reason: 'No instructor evaluation yet. Grade it first.' });
      continue;
    }
    if (cur.reason === PEER_REASON) {
      skipped.push({ submissionId: sub.id, reason: 'Peer component already applied to the current evaluation.' });
      continue;
    }
    const med = peerMedians(reviews.filter((r) => r.ownerKey === key), criteria);
    if (med.total === null) {
      skipped.push({ submissionId: sub.id, reason: 'No submitted peer reviews to use.' });
      continue;
    }
    const blended = blendScore(cur, med.total, s.peerWeightPercent);
    const now = new Date();
    const [row] = await db
      .insert(evaluations)
      .values({
        submissionId: sub.id,
        graderId: auth.user.id,
        rubricScores: cur.rubricScores,
        rawScore: blended.rawScore,
        latePenalty: blended.latePenalty,
        finalScore: blended.finalScore,
        feedback: cur.feedback,
        privateComment: cur.privateComment,
        released: cur.released,
        releasedAt: cur.released ? now : null,
        reason: PEER_REASON,
      })
      .returning();
    await db.update(evaluations).set({ supersededBy: row.id }).where(eq(evaluations.id, cur.id));
    await audit(c, {
      action: 'teach.peer.apply',
      orgId: a.orgId,
      targetType: 'evaluation',
      targetId: row.id,
      meta: { submissionId: sub.id, supersedes: cur.id, instructorRawScore: cur.rawScore, previousFinalScore: cur.finalScore, peerMedian: med.total, peerReviews: med.count, weightPercent: s.peerWeightPercent, rawScore: blended.rawScore, finalScore: blended.finalScore },
    });
    // Students already saw a grade: tell them it changed. No Skill DNA evidence is created from peer input.
    if (cur.released) {
      for (const uid of await submissionRecipients(sub)) {
        await notify(uid, {
          type: 'assignment.graded',
          category: 'assignments',
          orgId: a.orgId,
          title: `Grade updated: ${a.title}`,
          body: `Your instructor applied the ${s.peerWeightPercent}% peer component. New score ${blended.finalScore} / ${a.maxPoints}.`,
          link: `/app/assignments/${a.id}`,
        });
      }
    }
    applied.push({ submissionId: sub.id, evaluationId: row.id, previousFinalScore: cur.finalScore, peerMedian: med.total, finalScore: blended.finalScore });
  }
  return c.json({ applied, skipped });
});

async function loadReviewForStaff(c: Ctx, id: string) {
  const auth = requireAuth(c);
  const [r] = await db.select().from(teachPeerReviews).where(eq(teachPeerReviews.id, id));
  if (!r || !isStaff(auth, r.orgId)) throw notFound('Peer review');
  const { assignment: a } = await loadAssignmentForStaff(c, r.assignmentId).catch((e) => {
    if (e?.status === 404) throw notFound('Peer review');
    throw e;
  });
  if (a.orgId !== r.orgId) throw notFound('Peer review');
  return { review: r, assignment: a };
}

peerRoutes.post('/peer-reviews/:id/reassign', async (c) => {
  const auth = requireAuth(c);
  const { review: r, assignment: a } = await loadReviewForStaff(c, idParam(c));
  const input = await body(c, z.object({ reviewerId: z.string().uuid(), reason: z.string().trim().max(1000).optional() }));
  if (r.status === 'reassigned') throw conflict('This review was already reassigned.');
  if (r.status === 'submitted') throw conflict('Submitted reviews cannot be reassigned. Exclude it instead if it should not count.');
  if (input.reviewerId === r.reviewerId) throw badRequest('Choose a different reviewer.', { fields: { reviewerId: 'Same reviewer' } });
  if (!(await isCohortStudent(input.reviewerId, a.cohortId))) throw badRequest('Choose a student from this cohort.', { fields: { reviewerId: 'Not in the cohort' } });
  const members = a.collaboration === 'team' ? ((await db.select().from(assignmentTeams).where(eq(assignmentTeams.id, r.ownerKey)))[0]?.memberIds ?? []) : [r.ownerKey];
  if (members.includes(input.reviewerId)) throw badRequest('Students cannot review their own or their team’s work.', { fields: { reviewerId: 'Own work' } });
  const [dupe] = await db
    .select({ id: teachPeerReviews.id })
    .from(teachPeerReviews)
    .where(and(eq(teachPeerReviews.assignmentId, a.id), eq(teachPeerReviews.ownerKey, r.ownerKey), eq(teachPeerReviews.reviewerId, input.reviewerId)));
  if (dupe) throw conflict('That student already has (or had) a review of this submission. Choose someone else.');
  const [created] = await db
    .insert(teachPeerReviews)
    .values({ orgId: a.orgId, assignmentId: a.id, submissionId: r.submissionId, ownerKey: r.ownerKey, reviewerId: input.reviewerId, lateAllocation: r.lateAllocation })
    .returning();
  await db.update(teachPeerReviews).set({ status: 'reassigned', replacedBy: created.id }).where(eq(teachPeerReviews.id, r.id));
  await audit(c, { action: 'teach.peer.reassign', orgId: a.orgId, targetType: 'peer_review', targetId: r.id, actorId: auth.user.id, meta: { fromReviewerId: r.reviewerId, toReviewerId: input.reviewerId, newReviewId: created.id, reason: input.reason ?? null } });
  await notify(input.reviewerId, { type: 'assignment.peer_assigned', category: 'assignments', orgId: a.orgId, title: `Peer review to do: ${a.title}`, body: 'Your instructor assigned you an anonymous peer review.', link: `/app/assignments/${a.id}` });
  return c.json({ review: { id: created.id, status: created.status }, replaced: r.id });
});

peerRoutes.post('/peer-reviews/:id/exclude', async (c) => {
  const auth = requireAuth(c);
  const { review: r, assignment: a } = await loadReviewForStaff(c, idParam(c));
  const input = await body(c, z.object({ reason: z.string().trim().min(5, 'Explain why (at least 5 characters). The reason is kept in the audit trail.').max(1000) }));
  if (r.status === 'reassigned') throw conflict('This review was reassigned.');
  if (r.excludedAt) throw conflict('This review is already excluded.');
  const [row] = await db.update(teachPeerReviews).set({ excludedAt: new Date(), excludedBy: auth.user.id, excludedReason: input.reason }).where(eq(teachPeerReviews.id, r.id)).returning();
  await audit(c, { action: 'teach.peer.exclude', orgId: a.orgId, targetType: 'peer_review', targetId: r.id, meta: { reason: input.reason, reviewerId: r.reviewerId, ownerKey: r.ownerKey, score: r.score } });
  return c.json({ review: { id: row.id, excludedAt: row.excludedAt, excludedReason: row.excludedReason } });
});

peerRoutes.post('/peer-reviews/:id/include', async (c) => {
  const { review: r, assignment: a } = await loadReviewForStaff(c, idParam(c));
  if (!r.excludedAt) throw conflict('This review is not excluded.');
  await db.update(teachPeerReviews).set({ excludedAt: null, excludedBy: null, excludedReason: null }).where(eq(teachPeerReviews.id, r.id));
  await audit(c, { action: 'teach.peer.include', orgId: a.orgId, targetType: 'peer_review', targetId: r.id, meta: { previousReason: r.excludedReason } });
  return c.json({ ok: true });
});

peerRoutes.post('/peer-reviews/:id/reopen', async (c) => {
  const { review: r, assignment: a } = await loadReviewForStaff(c, idParam(c));
  if (r.status !== 'submitted') throw conflict('Only submitted reviews can be reopened.');
  const now = new Date();
  await db.update(teachPeerReviews).set({ status: 'draft', reopenedAt: now }).where(and(eq(teachPeerReviews.id, r.id), eq(teachPeerReviews.status, 'submitted')));
  await audit(c, { action: 'teach.peer.reopen', orgId: a.orgId, targetType: 'peer_review', targetId: r.id, meta: { reviewerId: r.reviewerId, previousScore: r.score } });
  await notify(r.reviewerId, { type: 'assignment.peer_reopened', category: 'assignments', orgId: a.orgId, title: `Peer review reopened: ${a.title}`, body: 'Your instructor reopened one of your peer reviews so you can revise and resubmit it.', link: `/app/assignments/peer-reviews/${r.id}` });
  return c.json({ ok: true });
});

// =====================================================================================
// Students: reviews to write
// =====================================================================================

function editState(r: PeerReview, w: ReturnType<typeof peerWindow>) {
  if (r.status === 'submitted') return { canEdit: false, reason: 'You submitted this review. It is locked unless your instructor reopens it.' };
  if (r.reopenedAt && r.status === 'draft' && w.phase !== 'disabled') return { canEdit: true, reason: null };
  if (w.phase === 'closed') return { canEdit: false, reason: 'The review window has closed.' };
  if (w.phase !== 'open') return { canEdit: false, reason: 'The review window is not open.' };
  return { canEdit: true, reason: null };
}

async function myReviewLabels(assignmentId: string, reviewerId: string) {
  const rows = await db
    .select({ id: teachPeerReviews.id })
    .from(teachPeerReviews)
    .where(and(eq(teachPeerReviews.assignmentId, assignmentId), eq(teachPeerReviews.reviewerId, reviewerId), ne(teachPeerReviews.status, 'reassigned')))
    .orderBy(asc(teachPeerReviews.createdAt), asc(teachPeerReviews.id));
  return new Map(rows.map((r, i) => [r.id, `Submission ${letter(i)}`]));
}

/** A review the caller was allocated (not reassigned away), in an assignment of a cohort they study in; else 404. */
async function loadMyReview(c: Ctx, id: string) {
  const auth = requireAuth(c);
  const [r] = await db.select().from(teachPeerReviews).where(and(eq(teachPeerReviews.id, id), eq(teachPeerReviews.reviewerId, auth.user.id)));
  if (!r || r.status === 'reassigned' || !rolesIn(auth, r.orgId).length) throw notFound('Peer review');
  const a = await loadAssignmentForStudent(c, r.assignmentId).catch(() => {
    throw notFound('Peer review');
  });
  if (a.orgId !== r.orgId) throw notFound('Peer review');
  const s = await loadPeerSettings(a.id);
  if (!s?.enabled) throw notFound('Peer review');
  return { review: r, assignment: a, settings: s, window: peerWindow(s, a) };
}

peerRoutes.get('/my/peer-reviews', async (c) => {
  const auth = requireAuth(c);
  const orgIds = auth.session.activeOrgId ? [auth.session.activeOrgId] : auth.memberships.map((m) => m.orgId);
  if (!orgIds.length) return c.json({ items: [] });
  const rows = await db
    .select({ r: teachPeerReviews, a: assignments, s: teachPeerSettings })
    .from(teachPeerReviews)
    .innerJoin(assignments, eq(assignments.id, teachPeerReviews.assignmentId))
    .innerJoin(teachPeerSettings, eq(teachPeerSettings.assignmentId, assignments.id))
    .innerJoin(cohortMembers, and(eq(cohortMembers.cohortId, assignments.cohortId), eq(cohortMembers.userId, auth.user.id), eq(cohortMembers.role, 'student')))
    .where(
      and(
        eq(teachPeerReviews.reviewerId, auth.user.id),
        ne(teachPeerReviews.status, 'reassigned'),
        inArray(teachPeerReviews.orgId, orgIds),
        inArray(assignments.status, ['published', 'closed']),
        eq(teachPeerSettings.enabled, true),
      ),
    )
    .orderBy(asc(teachPeerSettings.closesAt), asc(teachPeerReviews.createdAt), asc(teachPeerReviews.id));
  const counters = new Map<string, number>();
  const items = rows.map(({ r, a, s }) => {
    const i = counters.get(a.id) ?? 0;
    counters.set(a.id, i + 1);
    const w = peerWindow(s, a);
    const st = editState(r, w);
    return { id: r.id, assignmentId: a.id, assignmentTitle: a.title, label: `Submission ${letter(i)}`, status: r.status, closesAt: w.closesAt, phase: w.phase, canEdit: st.canEdit, lockedReason: st.reason, submittedAt: r.submittedAt, reopened: !!r.reopenedAt };
  });
  return c.json({ items, todo: items.filter((i) => i.status !== 'submitted' && i.canEdit).length });
});

peerRoutes.get('/my/peer-reviews/:id', async (c) => {
  const auth = requireAuth(c);
  const { review: r, assignment: a, settings: s, window: w } = await loadMyReview(c, idParam(c));
  const [sub] = await db.select({ text: submissions.text, links: submissions.links, fileIds: submissions.fileIds }).from(submissions).where(eq(submissions.id, r.submissionId));
  const labels = await myReviewLabels(a.id, auth.user.id);
  const st = editState(r, w);
  // Reviewers can read the work only while they are allowed to review it.
  const showWork = st.canEdit || (r.status === 'submitted' && w.phase === 'open');
  const files = showWork && sub ? await fileMeta(sub.fileIds) : [];
  return c.json({
    review: {
      id: r.id,
      label: labels.get(r.id) ?? 'Submission',
      status: r.status,
      rubricScores: r.rubricScores,
      comment: r.comment ?? '',
      score: r.score,
      savedAt: r.savedAt,
      submittedAt: r.submittedAt,
      reopened: !!r.reopenedAt,
    },
    assignment: { id: a.id, title: a.title, instructions: a.instructions, objectives: a.objectives, maxPoints: a.maxPoints, rubric: rubricFor(a) ?? [] },
    settings: { minCommentLength: s.minCommentLength, reviewsPerSubmission: s.reviewsPerSubmission },
    window: { phase: w.phase, closesAt: w.closesAt },
    canEdit: st.canEdit,
    lockedReason: st.reason,
    work: showWork && sub
      ? {
          text: sub.text,
          links: sub.links.map((l) => ({ label: l.label, url: l.url })),
          // Generic labels: original file names can contain the author's name.
          files: files.map((f, i) => ({ id: f.id, label: `Attachment ${i + 1}${f.filename.includes('.') ? `.${f.filename.split('.').pop()!.toLowerCase()}` : ''}`, mime: f.mime, size: f.size, url: f.url })),
        }
      : null,
    others: [...labels.entries()].filter(([id]) => id !== r.id).map(([id, label]) => ({ id, label })),
  });
});

peerRoutes.put('/my/peer-reviews/:id', async (c) => {
  const { review: r, assignment: a, window: w } = await loadMyReview(c, idParam(c));
  const st = editState(r, w);
  if (!st.canEdit) throw conflict(st.reason ?? 'This review cannot be edited.');
  const input = await body(c, reviewInput);
  const { rubricScores } = scorePeerPicks(rubricFor(a) ?? [], input.rubricScores, a.maxPoints, false);
  const now = new Date();
  const [row] = await db
    .update(teachPeerReviews)
    .set({ rubricScores, comment: input.comment, status: 'draft', savedAt: now })
    .where(and(eq(teachPeerReviews.id, r.id), inArray(teachPeerReviews.status, ['assigned', 'draft'])))
    .returning();
  if (!row) throw conflict('This review was already submitted.');
  return c.json({ review: { id: row.id, status: row.status, savedAt: row.savedAt } });
});

peerRoutes.post('/my/peer-reviews/:id/submit', async (c) => {
  const auth = requireAuth(c);
  const { review: r, assignment: a, settings: s, window: w } = await loadMyReview(c, idParam(c));
  const st = editState(r, w);
  if (!st.canEdit) throw conflict(st.reason ?? 'This review cannot be submitted.');
  const input = await body(c, reviewInput.extend({ confirm: z.literal(true, { error: 'Confirm that you want to submit. Submitted reviews are locked.' }) }));
  const comment = input.comment.trim();
  if (comment.length < s.minCommentLength)
    throw badRequest(`Write at least ${s.minCommentLength} characters of feedback (you have ${comment.length}). Say what works and one concrete improvement.`, { fields: { comment: `At least ${s.minCommentLength} characters` } });
  const { rubricScores, score } = scorePeerPicks(rubricFor(a) ?? [], input.rubricScores, a.maxPoints, true);
  const now = new Date();
  const [row] = await db
    .update(teachPeerReviews)
    .set({ rubricScores, comment, score, status: 'submitted', submittedAt: now, savedAt: now })
    .where(and(eq(teachPeerReviews.id, r.id), inArray(teachPeerReviews.status, ['assigned', 'draft'])))
    .returning();
  if (!row) throw conflict('This review was already submitted.');
  // Participation is activity, not evidence: XP once per review, no Skill DNA evidence.
  await recordActivity(auth.user.id, { kind: 'peer_review_completed', label: `Peer review for ${a.title}`, link: `/app/assignments/${a.id}`, xp: XP.helpfulAnswer, dedupeKey: `peer.review:${r.id}`, orgId: a.orgId });
  return c.json({ review: { id: row.id, status: row.status, submittedAt: row.submittedAt, score: row.score } });
});

// =====================================================================================
// Students: peer section of an assignment and feedback received
// =====================================================================================

peerRoutes.get('/my/assignments/:id/peer', async (c) => {
  const auth = requireAuth(c);
  const a = await loadAssignmentForStudent(c, idParam(c));
  const s = await loadPeerSettings(a.id);
  if (!s?.enabled) return c.json({ enabled: false });
  const w = peerWindow(s, a);
  const mine = await db
    .select()
    .from(teachPeerReviews)
    .where(and(eq(teachPeerReviews.assignmentId, a.id), eq(teachPeerReviews.reviewerId, auth.user.id), ne(teachPeerReviews.status, 'reassigned')))
    .orderBy(asc(teachPeerReviews.createdAt), asc(teachPeerReviews.id));
  const keys = await ownerKeysFor(a.id, auth.user.id);
  const received = (
    await db
      .select()
      .from(teachPeerReviews)
      .where(and(eq(teachPeerReviews.assignmentId, a.id), inArray(teachPeerReviews.ownerKey, keys), eq(teachPeerReviews.status, 'submitted')))
      .orderBy(asc(teachPeerReviews.submittedAt), asc(teachPeerReviews.id))
  ).filter((r) => !r.excludedAt);
  const criteria = rubricFor(a) ?? [];
  const med = peerMedians(received, criteria);
  const closes = w.closesAt ? w.closesAt.toISOString() : null;
  return c.json({
    enabled: true,
    window: { phase: w.phase, opensAt: w.opensAt, closesAt: w.closesAt, openMode: w.openMode },
    settings: { reviewsPerSubmission: s.reviewsPerSubmission, minCommentLength: s.minCommentLength, peerWeightPercent: s.peerWeightPercent },
    toReview: mine.map((r, i) => {
      const st = editState(r, w);
      return { id: r.id, label: `Submission ${letter(i)}`, status: r.status, submittedAt: r.submittedAt, canEdit: st.canEdit, lockedReason: st.reason };
    }),
    feedback: w.feedbackVisible
      ? {
          visible: true,
          releasedAt: s.releasedAt,
          reviews: received.map((r, i) => ({ id: r.id, label: `Reviewer ${i + 1}`, rubricScores: r.rubricScores, comment: r.comment, score: r.score, helpfulness: r.helpfulness, flagged: !!r.flaggedAt })),
          medianByCriterion: med.byCriterion,
          medianScore: med.total,
        }
      : { visible: false, reason: closes ? 'Peer feedback appears when the review window closes or when your instructor releases it.' : 'Peer feedback appears when your instructor releases it.' },
  });
});

async function loadReceivedReview(c: Ctx, id: string) {
  const auth = requireAuth(c);
  const [r] = await db.select().from(teachPeerReviews).where(eq(teachPeerReviews.id, id));
  if (!r || r.status !== 'submitted' || r.excludedAt || !rolesIn(auth, r.orgId).length) throw notFound('Peer review');
  const a = await loadAssignmentForStudent(c, r.assignmentId).catch(() => {
    throw notFound('Peer review');
  });
  if (!(await ownerKeysFor(a.id, auth.user.id)).includes(r.ownerKey)) throw notFound('Peer review');
  const w = peerWindow(await loadPeerSettings(a.id), a);
  if (!w.feedbackVisible) throw notFound('Peer review');
  return { review: r, assignment: a };
}

peerRoutes.post('/my/peer-feedback/:id/rate', async (c) => {
  const { review: r } = await loadReceivedReview(c, idParam(c));
  const input = await body(c, z.object({ helpfulness: z.number().int().min(1, 'Choose 1 to 5.').max(5, 'Choose 1 to 5.') }));
  await db.update(teachPeerReviews).set({ helpfulness: input.helpfulness }).where(eq(teachPeerReviews.id, r.id));
  return c.json({ ok: true, helpfulness: input.helpfulness });
});

peerRoutes.post('/my/peer-feedback/:id/flag', async (c) => {
  const { review: r, assignment: a } = await loadReceivedReview(c, idParam(c));
  const input = await body(c, z.object({ reason: z.string().trim().min(5, 'Say what is wrong with this review (at least 5 characters).').max(1000) }));
  if (r.flaggedAt) throw conflict('You already flagged this review. Your instructor will look at it.');
  await db.update(teachPeerReviews).set({ flaggedAt: new Date(), flagReason: input.reason }).where(eq(teachPeerReviews.id, r.id));
  await notify(a.authorId, { type: 'assignment.peer_flagged', category: 'assignments', orgId: a.orgId, title: `Peer review flagged: ${a.title}`, body: `A student flagged a peer review: ${input.reason.slice(0, 200)}`, link: `/app/teach/assignments/${a.id}?tab=peer` });
  await audit(c, { action: 'teach.peer.flag', orgId: a.orgId, targetType: 'peer_review', targetId: r.id, meta: {} });
  return c.json({ ok: true });
});
