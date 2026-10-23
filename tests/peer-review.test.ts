import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { setupTestApp, registerUser } from './helpers';
import { db } from '../server/db/client';
import { activityEvents, assignments, auditLogs, submissions, evaluations, memberships, notifications, organizations, skillEvidence, teachPeerReviews, teachPeerSettings } from '../server/db/schema';
import { drainJobs } from '../server/jobs/queue';
import { allocatePeerReviews, blendScore, peerReviewCalendarItems, planInitialAllocation, planLateAllocation, runPeerTick } from '../server/modules/teach/peer';
import { privacyHandlers } from '../server/modules/privacy/registry';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
type Client = Awaited<ReturnType<typeof registerUser>>;

let orgId: string;
let faculty: Client;
let students: Client[] = []; // s1..s6 in the cohort
let stranger: Client; // same org, not in the cohort
let otherFaculty: Client; // another org
let otherStudent: Client; // another org
let cohortId: string;
let rubricId: string;

const LEVELS = [
  { label: 'Excellent', points: 4 },
  { label: 'Proficient', points: 3 },
  { label: 'Developing', points: 2 },
  { label: 'Beginning', points: 1 },
];
const INSTRUCTIONS = 'Explain how a hash map resolves collisions and give the running time of lookups.';
const GOOD = 'Your explanation of chaining is clear and the example helps. One improvement: state the worst case when every key collides.';
const GOOD2 = 'The answer covers open addressing well. Adding a short note on load factor and when to resize the table would make it complete.';

async function join(userId: string, roles: string[], org = orgId) {
  await db.insert(memberships).values({ orgId: org, userId, roles });
}

function picks(level: string) {
  return [
    { criterionId: 'clarity', levelLabel: level },
    { criterionId: 'accuracy', levelLabel: level },
  ];
}

/** Creates and publishes an assignment, lets the given students submit, then moves the due date into the past. */
async function setupAssignment(opts: { submitters: Client[]; overrides?: Record<string, unknown>; files?: Map<Client, string> } = { submitters: [] }) {
  const r = await faculty.post('/api/teach/assignments', {
    cohortId,
    title: `Hash maps ${Math.random().toString(36).slice(2, 7)}`,
    instructions: INSTRUCTIONS,
    dueAt: new Date(Date.now() + 5 * 86400_000).toISOString(),
    rubricId,
    maxPoints: 100,
    ...opts.overrides,
  });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  const id = r.body.assignment.id as string;
  const p = await faculty.post(`/api/teach/assignments/${id}/publish`);
  if (p.status !== 200) throw new Error(JSON.stringify(p.body));
  for (const s of opts.submitters) {
    const fileId = opts.files?.get(s);
    const sub = await s.post(`/api/teach/my/assignments/${id}/submit`, { confirm: true, text: `Answer: chaining keeps a list per bucket (variant ${Math.random().toString(36).slice(2, 8)}).`, ...(fileId ? { fileIds: [fileId] } : {}) });
    if (sub.status !== 201) throw new Error(JSON.stringify(sub.body));
  }
  // Move the deadline into the past; submissions are back-dated so they stay on time.
  await db.update(submissions).set({ submittedAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(submissions.assignmentId, id));
  await db.update(assignments).set({ dueAt: new Date(Date.now() - 3600_000), availableFrom: new Date(Date.now() - 7 * 86400_000) }).where(eq(assignments.id, id));
  return id;
}

async function enablePeer(id: string, extra: Record<string, unknown> = {}) {
  const r = await faculty.patch(`/api/teach/assignments/${id}/peer`, {
    enabled: true,
    reviewsPerSubmission: 2,
    openMode: 'manual',
    closesAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
    minCommentLength: 80,
    peerWeightPercent: 20,
    ...extra,
  });
  if (r.status !== 200) throw new Error(JSON.stringify(r.body));
  return r.body.settings;
}

async function openPeer(id: string) {
  const r = await faculty.post(`/api/teach/assignments/${id}/peer/open`);
  if (r.status !== 200) throw new Error(JSON.stringify(r.body));
  await drainJobs();
}

async function reviewsOf(id: string) {
  return db.select().from(teachPeerReviews).where(eq(teachPeerReviews.assignmentId, id));
}

const byUser = (uid: string) => students.find((s) => s.userId === uid)!;

beforeAll(async () => {
  ctx = await setupTestApp();
  const [o] = await db.insert(organizations).values({ name: 'Peer College', slug: 'peer-college', kind: 'college' }).returning();
  orgId = o.id;
  const [o2] = await db.insert(organizations).values({ name: 'Other College', slug: 'other-college', kind: 'college' }).returning();
  faculty = await registerUser(ctx.app, 'Fiona Faculty', 'fiona.peer@example.test');
  await join(faculty.userId, ['faculty']);
  const names = ['Ada Lovelace', 'Ben Okafor', 'Chen Wei', 'Dina Haddad', 'Eli Moreau', 'Femi Adeyemi'];
  for (const [i, n] of names.entries()) {
    const s = await registerUser(ctx.app, n, `s${i + 1}.peer@example.test`);
    await join(s.userId, ['student']);
    await s.post('/api/auth/switch', { orgId });
    students.push(s);
  }
  stranger = await registerUser(ctx.app, 'Sam Stranger', 'stranger.peer@example.test');
  await join(stranger.userId, ['student']);
  otherFaculty = await registerUser(ctx.app, 'Olga Other', 'olga.peer@example.test');
  await join(otherFaculty.userId, ['faculty'], o2.id);
  otherStudent = await registerUser(ctx.app, 'Omar Other', 'omar.peer@example.test');
  await join(otherStudent.userId, ['student'], o2.id);
  await otherFaculty.post('/api/auth/switch', { orgId: o2.id });
  await faculty.post('/api/auth/switch', { orgId });
  const co = await faculty.post('/api/teach/cohorts', { name: 'Section P' });
  cohortId = co.body.cohort.id;
  await faculty.post(`/api/teach/cohorts/${cohortId}/members`, { userIds: students.map((s) => s.userId) });
  const rub = await faculty.post('/api/teach/rubrics', {
    title: 'Peer rubric',
    criteria: [
      { id: 'clarity', title: 'Clarity', levels: LEVELS },
      { id: 'accuracy', title: 'Accuracy', levels: LEVELS },
    ],
  });
  if (rub.status !== 201) throw new Error(JSON.stringify(rub.body));
  rubricId = rub.body.rubric.id;
});
afterAll(async () => ctx.close());

describe('allocation planning (pure)', () => {
  it('gives every submitter exactly N reviews, never themselves, deterministically', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => `00000000-0000-0000-0000-00000000000${x}`);
    const reviewees = ids.map((k) => ({ ownerKey: k, members: [k] }));
    for (const n of [1, 2, 3, 5]) {
      const pairs = planInitialAllocation(reviewees, ids, n, 'seed-1');
      for (const k of ids) {
        expect(pairs.filter((p) => p.ownerKey === k).length).toBe(n);
        expect(pairs.filter((p) => p.reviewerId === k).length).toBe(n);
      }
      expect(pairs.some((p) => p.ownerKey === p.reviewerId)).toBe(false);
      expect(new Set(pairs.map((p) => `${p.ownerKey}:${p.reviewerId}`)).size).toBe(pairs.length);
      expect(planInitialAllocation([...reviewees].reverse(), [...ids].reverse(), n, 'seed-1')).toEqual(pairs);
    }
    expect(planInitialAllocation(reviewees, ids, 2, 'seed-2')).not.toEqual(planInitialAllocation(reviewees, ids, 2, 'seed-1'));
  });

  it('never assigns a team member to their own team and balances load', () => {
    const teams = [
      { ownerKey: 't1', members: ['u1', 'u2'] },
      { ownerKey: 't2', members: ['u3', 'u4'] },
      { ownerKey: 't3', members: ['u5', 'u6'] },
      { ownerKey: 't4', members: ['u7', 'u8'] },
    ];
    const reviewers = teams.flatMap((t) => t.members);
    const pairs = planInitialAllocation(teams, reviewers, 2, 'teams');
    for (const t of teams) {
      const got = pairs.filter((p) => p.ownerKey === t.ownerKey);
      expect(got.length).toBe(2);
      expect(got.some((p) => t.members.includes(p.reviewerId))).toBe(false);
    }
    const loads = reviewers.map((r) => pairs.filter((p) => p.reviewerId === r).length);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
  });

  it('handles small cohorts by assigning as many as possible', () => {
    const two = [{ ownerKey: 'x', members: ['x'] }, { ownerKey: 'y', members: ['y'] }];
    const pairs = planInitialAllocation(two, ['x', 'y'], 3, 's');
    expect(pairs).toEqual(expect.arrayContaining([{ reviewerId: 'x', ownerKey: 'y' }, { reviewerId: 'y', ownerKey: 'x' }]));
    expect(pairs.length).toBe(2);
    expect(planInitialAllocation([{ ownerKey: 'x', members: ['x'] }], ['x'], 2, 's')).toEqual([]);
  });

  it('adds late submitters without touching existing pairs', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const existing = planInitialAllocation(ids.map((k) => ({ ownerKey: k, members: [k] })), ids, 2, 's');
    const all = [...ids, 'e'];
    const added = planLateAllocation(all.map((k) => ({ ownerKey: k, members: [k] })), all, 2, 's', existing, ['e'], ['e']);
    expect(added.filter((p) => p.reviewerId === 'e').length).toBe(2);
    expect(added.filter((p) => p.ownerKey === 'e').length).toBe(2);
    expect(added.some((p) => p.ownerKey === p.reviewerId)).toBe(false);
  });

  it('blends the peer component with the documented formula', () => {
    expect(blendScore({ rawScore: 80, latePenalty: 0 }, 60, 25)).toEqual({ rawScore: 75, latePenalty: 0, finalScore: 75 });
    expect(blendScore({ rawScore: 80, latePenalty: 8 }, 60, 25)).toEqual({ rawScore: 75, latePenalty: 7.5, finalScore: 67.5 });
  });
});

describe('peer review lifecycle', () => {
  let aid: string;
  let s1: Client, s2: Client, s3: Client, s4: Client, s5: Client, s6: Client;

  beforeAll(async () => {
    [s1, s2, s3, s4, s5, s6] = students;
    aid = await setupAssignment({ submitters: [s1, s2, s3, s4] });
  });

  it('validates settings and requires a rubric and a closing time', async () => {
    expect((await faculty.patch(`/api/teach/assignments/${aid}/peer`, { reviewsPerSubmission: 6 })).status).toBe(400);
    expect((await faculty.patch(`/api/teach/assignments/${aid}/peer`, { peerWeightPercent: 60 })).status).toBe(400);
    const noClose = await faculty.patch(`/api/teach/assignments/${aid}/peer`, { enabled: true });
    expect(noClose.status).toBe(400);
    expect(noClose.body.error.details.fields.closesAt).toBeTruthy();
    const early = await faculty.patch(`/api/teach/assignments/${aid}/peer`, { enabled: true, closesAt: new Date(Date.now() - 2 * 3600_000).toISOString() });
    expect(early.status).toBe(400);

    const noRubric = await faculty.post('/api/teach/assignments', { cohortId, title: 'No rubric here', instructions: INSTRUCTIONS, dueAt: new Date(Date.now() + 86400_000).toISOString() });
    const nr = await faculty.patch(`/api/teach/assignments/${noRubric.body.assignment.id}/peer`, { enabled: true, closesAt: new Date(Date.now() + 3 * 86400_000).toISOString() });
    expect(nr.status).toBe(400);
    expect(nr.body.error.message).toMatch(/rubric/);

    // A partial PATCH keeps earlier values (patchSchema drops defaults).
    await enablePeer(aid, { reviewsPerSubmission: 3, outlierThresholdPercent: 40 });
    const partial = await faculty.patch(`/api/teach/assignments/${aid}/peer`, { minCommentLength: 80 });
    expect(partial.body.settings.reviewsPerSubmission).toBe(3);
    expect(partial.body.settings.peerWeightPercent).toBe(20);
    expect(partial.body.settings.outlierThresholdPercent).toBe(40);
  });

  it('hides peer review from people outside the cohort and other organizations', async () => {
    expect((await otherFaculty.get(`/api/teach/assignments/${aid}/peer`)).status).toBe(404);
    expect((await otherFaculty.patch(`/api/teach/assignments/${aid}/peer`, { minCommentLength: 50 })).status).toBe(404);
    expect((await otherFaculty.post(`/api/teach/assignments/${aid}/peer/open`)).status).toBe(404);
    expect((await otherStudent.get(`/api/teach/my/assignments/${aid}/peer`)).status).toBe(404);
    expect((await stranger.get(`/api/teach/my/assignments/${aid}/peer`)).status).toBe(404);
    expect((await s1.patch(`/api/teach/assignments/${aid}/peer`, { minCommentLength: 50 })).status).toBe(404);
  });

  it('allocates exactly N reviews per submitter in a background job, idempotently', async () => {
    await openPeer(aid);
    const rows = await reviewsOf(aid);
    const owners = [s1, s2, s3, s4].map((s) => s.userId);
    expect(rows.length).toBe(12);
    for (const uid of owners) {
      expect(rows.filter((r) => r.ownerKey === uid).length).toBe(3);
      expect(rows.filter((r) => r.reviewerId === uid).length).toBe(3);
    }
    expect(rows.some((r) => r.ownerKey === r.reviewerId)).toBe(false);
    expect(rows.some((r) => r.reviewerId === s5.userId || r.reviewerId === s6.userId)).toBe(false);

    const again = await allocatePeerReviews(aid, 'initial');
    expect(again).toMatchObject({ skipped: true });
    expect((await faculty.post(`/api/teach/assignments/${aid}/peer/open`)).status).toBe(409);
    await drainJobs();
    expect((await reviewsOf(aid)).length).toBe(12);

    const n = await db.select().from(notifications).where(and(eq(notifications.userId, s1.userId), eq(notifications.type, 'assignment.peer_assigned')));
    expect(n.length).toBe(1);
    const dash = await faculty.get(`/api/teach/assignments/${aid}/peer`);
    expect(dash.status).toBe(200);
    expect(dash.body.reviewers.length).toBe(4);
    expect(dash.body.settings.allocationNote.message).toBeNull();
    // Settings that allocation depends on are now locked.
    expect((await faculty.patch(`/api/teach/assignments/${aid}/peer`, { reviewsPerSubmission: 2 })).status).toBe(409);
    expect((await faculty.patch(`/api/teach/assignments/${aid}/peer`, { enabled: false })).status).toBe(409);
  });

  it('never shows reviewers who they review (no names or ids in payloads)', async () => {
    const list = await s1.get('/api/teach/my/peer-reviews');
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBe(3);
    expect(list.body.items.map((i: any) => i.label)).toEqual(['Submission A', 'Submission B', 'Submission C']);
    const others = [s2, s3, s4];
    const names = ['Ben Okafor', 'Chen Wei', 'Dina Haddad'];
    for (const item of list.body.items) {
      const d = await s1.get(`/api/teach/my/peer-reviews/${item.id}`);
      expect(d.status).toBe(200);
      expect(d.body.work.text).toMatch(/chaining/);
      const json = JSON.stringify(d.body);
      for (const o of others) expect(json).not.toContain(o.userId);
      for (const n of names) expect(json).not.toContain(n);
      expect(json).not.toContain('peer@example.test');
      expect(json).not.toContain('receipt');
    }
    const listJson = JSON.stringify(list.body);
    for (const o of others) expect(listJson).not.toContain(o.userId);
    // Another student's review is not reachable.
    const [foreign] = (await reviewsOf(aid)).filter((r) => r.reviewerId === s2.userId);
    expect((await s1.get(`/api/teach/my/peer-reviews/${foreign.id}`)).status).toBe(404);
    expect((await otherStudent.get(`/api/teach/my/peer-reviews/${foreign.id}`)).status).toBe(404);
  });

  it('requires a full rubric and a long enough comment, then locks on submit', async () => {
    const mine = (await reviewsOf(aid)).filter((r) => r.reviewerId === s1.userId);
    const r0 = mine[0];
    const draft = await s1.put(`/api/teach/my/peer-reviews/${r0.id}`, { rubricScores: [{ criterionId: 'clarity', levelLabel: 'Excellent' }], comment: 'Started' });
    expect(draft.status).toBe(200);
    expect(draft.body.review.status).toBe('draft');
    const bad = await s1.put(`/api/teach/my/peer-reviews/${r0.id}`, { rubricScores: [{ criterionId: 'clarity', levelLabel: 'Amazing' }] });
    expect(bad.status).toBe(400);
    const short = await s1.post(`/api/teach/my/peer-reviews/${r0.id}/submit`, { confirm: true, rubricScores: picks('Excellent'), comment: 'Nice work.' });
    expect(short.status).toBe(400);
    expect(short.body.error.details.fields.comment).toBeTruthy();
    const partial = await s1.post(`/api/teach/my/peer-reviews/${r0.id}/submit`, { confirm: true, rubricScores: [{ criterionId: 'clarity', levelLabel: 'Excellent' }], comment: GOOD });
    expect(partial.status).toBe(400);
    const ok = await s1.post(`/api/teach/my/peer-reviews/${r0.id}/submit`, { confirm: true, rubricScores: picks('Excellent'), comment: GOOD });
    expect(ok.status).toBe(200);
    expect(ok.body.review.score).toBe(100);
    expect((await s1.put(`/api/teach/my/peer-reviews/${r0.id}`, { comment: 'changed my mind' })).status).toBe(409);
    expect((await s1.post(`/api/teach/my/peer-reviews/${r0.id}/submit`, { confirm: true, rubricScores: picks('Beginning'), comment: GOOD })).status).toBe(409);
    const xp = await db.select().from(activityEvents).where(and(eq(activityEvents.userId, s1.userId), eq(activityEvents.kind, 'peer_review_completed')));
    expect(xp.length).toBe(1);

    // The instructor reopens it; the student can revise and resubmit without earning XP twice.
    expect((await faculty.post(`/api/teach/peer-reviews/${r0.id}/reopen`)).status).toBe(200);
    expect((await s1.put(`/api/teach/my/peer-reviews/${r0.id}`, { rubricScores: picks('Excellent'), comment: GOOD })).status).toBe(200);
    expect((await s1.post(`/api/teach/my/peer-reviews/${r0.id}/submit`, { confirm: true, rubricScores: picks('Excellent'), comment: GOOD })).status).toBe(200);
    expect((await db.select().from(activityEvents).where(and(eq(activityEvents.userId, s1.userId), eq(activityEvents.kind, 'peer_review_completed')))).length).toBe(1);
    const audits = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'teach.peer.reopen'), eq(auditLogs.targetId, r0.id)));
    expect(audits.length).toBe(1);
    // Peer reviews never create Skill DNA evidence.
    expect((await db.select().from(skillEvidence).where(eq(skillEvidence.userId, s1.userId))).length).toBe(0);
  });

  it('flags outliers, copied comments, short comments and student flags; hides feedback until release', async () => {
    const rows = await reviewsOf(aid);
    // Everyone reviews s4 except s4: s1 and s2 rate it Excellent, s3 rates it Beginning (an outlier).
    const forS4 = rows.filter((r) => r.ownerKey === s4.userId);
    for (const r of forS4) {
      const c = byUser(r.reviewerId);
      const low = c === s3;
      const res = await c.post(`/api/teach/my/peer-reviews/${r.id}/submit`, { confirm: true, rubricScores: picks(low ? 'Beginning' : 'Excellent'), comment: low ? GOOD2 : GOOD });
      expect([200, 409]).toContain(res.status); // s1 may have submitted this one already in the previous test
    }
    // s2 reuses its comment on another review (copied).
    const s2Other = rows.find((r) => r.reviewerId === s2.userId && r.ownerKey === s1.userId)!;
    expect((await s2.post(`/api/teach/my/peer-reviews/${s2Other.id}/submit`, { confirm: true, rubricScores: picks('Proficient'), comment: GOOD })).status).toBe(200);

    // Before release: the reviewee sees no feedback and cannot rate.
    const hidden = await s4.get(`/api/teach/my/assignments/${aid}/peer`);
    expect(hidden.status).toBe(200);
    expect(hidden.body.feedback.visible).toBe(false);
    expect(hidden.body.feedback.reviews).toBeUndefined();
    const s3Review = forS4.find((r) => r.reviewerId === s3.userId)!;
    expect((await s4.post(`/api/teach/my/peer-feedback/${s3Review.id}/rate`, { helpfulness: 4 })).status).toBe(404);

    // Raise the minimum so existing comments count as short.
    await faculty.patch(`/api/teach/assignments/${aid}/peer`, { minCommentLength: 125 });
    const dash = await faculty.get(`/api/teach/assignments/${aid}/peer`);
    const byId = new Map(dash.body.reviews.map((r: any) => [r.id, r]));
    const kinds = (id: string) => (byId.get(id) as any).flags.map((f: any) => f.kind);
    expect(kinds(s3Review.id)).toContain('outlier');
    const s1onS4 = forS4.find((r) => r.reviewerId === s1.userId)!;
    expect(kinds(s1onS4.id)).not.toContain('outlier');
    expect(kinds(s2Other.id)).toContain('copied');
    expect(kinds(s1onS4.id)).toContain('short');
    expect(kinds(s3Review.id)).not.toContain('short'); // GOOD2 is longer than 125 characters
    // Instructors see names.
    expect((byId.get(s3Review.id) as any).reviewer.name).toBe('Chen Wei');
    expect((byId.get(s3Review.id) as any).reviewee.name).toBe('Dina Haddad');
    const row = dash.body.submissions.find((x: any) => x.ownerKey === s4.userId);
    expect(row.received).toBe(3);
    expect(row.medianScore).toBe(100);
    expect(row.medianByCriterion.clarity).toBe(4);

    // Release: feedback becomes visible, anonymously.
    const rel = await faculty.post(`/api/teach/assignments/${aid}/peer/release`);
    expect(rel.status).toBe(200);
    expect((await faculty.post(`/api/teach/assignments/${aid}/peer/release`)).status).toBe(409);
    const seen = await s4.get(`/api/teach/my/assignments/${aid}/peer`);
    expect(seen.body.feedback.visible).toBe(true);
    expect(seen.body.feedback.reviews.length).toBe(3);
    expect(seen.body.feedback.reviews.map((r: any) => r.label)).toEqual(['Reviewer 1', 'Reviewer 2', 'Reviewer 3']);
    const json = JSON.stringify(seen.body);
    for (const c of [s1, s2, s3]) expect(json).not.toContain(c.userId);
    for (const n of ['Ada Lovelace', 'Ben Okafor', 'Chen Wei']) expect(json).not.toContain(n);
    const released = await db.select().from(notifications).where(and(eq(notifications.userId, s4.userId), eq(notifications.type, 'assignment.peer_feedback')));
    expect(released.length).toBe(1);

    expect((await s4.post(`/api/teach/my/peer-feedback/${s3Review.id}/rate`, { helpfulness: 6 })).status).toBe(400);
    expect((await s4.post(`/api/teach/my/peer-feedback/${s3Review.id}/rate`, { helpfulness: 2 })).status).toBe(200);
    expect((await s1.post(`/api/teach/my/peer-feedback/${s3Review.id}/rate`, { helpfulness: 5 })).status).toBe(404); // not the reviewee
    expect((await s4.post(`/api/teach/my/peer-feedback/${s3Review.id}/flag`, { reason: 'This review ignores my answer completely.' })).status).toBe(200);
    expect((await s4.post(`/api/teach/my/peer-feedback/${s3Review.id}/flag`, { reason: 'Again please' })).status).toBe(409);
    const dash2 = await faculty.get(`/api/teach/assignments/${aid}/peer`);
    const flagged = dash2.body.reviews.find((r: any) => r.id === s3Review.id);
    expect(flagged.flags.map((f: any) => f.kind)).toContain('student_flag');
    expect(flagged.helpfulness).toBe(2);
  });

  it('excludes and reassigns reviews with an audit trail', async () => {
    const rows = await reviewsOf(aid);
    const s3onS4 = rows.find((r) => r.ownerKey === s4.userId && r.reviewerId === s3.userId)!;
    expect((await faculty.post(`/api/teach/peer-reviews/${s3onS4.id}/exclude`, { reason: 'no' })).status).toBe(400);
    expect((await otherFaculty.post(`/api/teach/peer-reviews/${s3onS4.id}/exclude`, { reason: 'Not my org at all' })).status).toBe(404);
    expect((await s4.post(`/api/teach/peer-reviews/${s3onS4.id}/exclude`, { reason: 'I do not like it' })).status).toBe(404);
    const ex = await faculty.post(`/api/teach/peer-reviews/${s3onS4.id}/exclude`, { reason: 'Does not engage with the submission.' });
    expect(ex.status).toBe(200);
    const exAudit = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'teach.peer.exclude'), eq(auditLogs.targetId, s3onS4.id)));
    expect(exAudit.length).toBe(1);
    expect((exAudit[0].meta as any).reason).toBe('Does not engage with the submission.');
    // Excluded reviews disappear for the reviewee.
    const seen = await s4.get(`/api/teach/my/assignments/${aid}/peer`);
    expect(seen.body.feedback.reviews.length).toBe(2);

    // Reassign an unsubmitted review to s6 (in the cohort, did not submit).
    const pending = (await reviewsOf(aid)).find((r) => r.status !== 'submitted' && r.reviewerId === s3.userId)!;
    expect((await faculty.post(`/api/teach/peer-reviews/${pending.id}/reassign`, { reviewerId: pending.ownerKey })).status).toBe(400);
    expect((await faculty.post(`/api/teach/peer-reviews/${pending.id}/reassign`, { reviewerId: stranger.userId })).status).toBe(400);
    const re = await faculty.post(`/api/teach/peer-reviews/${pending.id}/reassign`, { reviewerId: s6.userId, reason: 'Reviewer is on medical leave' });
    expect(re.status).toBe(200);
    const [old] = await db.select().from(teachPeerReviews).where(eq(teachPeerReviews.id, pending.id));
    expect(old.status).toBe('reassigned');
    expect(old.replacedBy).toBe(re.body.review.id);
    expect((await s3.get(`/api/teach/my/peer-reviews/${pending.id}`)).status).toBe(404);
    const s6list = await s6.get('/api/teach/my/peer-reviews');
    expect(s6list.body.items.map((i: any) => i.id)).toContain(re.body.review.id);
    const reAudit = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'teach.peer.reassign'), eq(auditLogs.targetId, pending.id)));
    expect(reAudit.length).toBe(1);
    expect((reAudit[0].meta as any).toReviewerId).toBe(s6.userId);
    // Submitted reviews cannot be reassigned.
    expect((await faculty.post(`/api/teach/peer-reviews/${s3onS4.id}/reassign`, { reviewerId: s6.userId })).status).toBe(409);
  });

  it('allocates late submissions on request without changing existing allocations', async () => {
    const before = (await reviewsOf(aid)).length;
    const sub = await s5.post(`/api/teach/my/assignments/${aid}/submit`, { confirm: true, text: 'Late answer: open addressing probes the next slot.' });
    expect(sub.status).toBe(201);
    const dash = await faculty.get(`/api/teach/assignments/${aid}/peer`);
    expect(dash.body.allocation.unallocated.map((u: any) => u.ownerKey)).toContain(s5.userId);
    expect((await faculty.post(`/api/teach/assignments/${aid}/peer/allocate-late`)).status).toBe(200);
    await drainJobs();
    const rows = await reviewsOf(aid);
    const active = rows.filter((r) => r.status !== 'reassigned');
    expect(active.filter((r) => r.reviewerId === s5.userId).length).toBe(3);
    expect(active.filter((r) => r.ownerKey === s5.userId).length).toBe(3);
    expect(rows.length).toBe(before + 6);
    expect(active.some((r) => r.ownerKey === r.reviewerId)).toBe(false);
    // Running it again adds nothing.
    await faculty.post(`/api/teach/assignments/${aid}/peer/allocate-late`);
    await drainJobs();
    expect((await reviewsOf(aid)).length).toBe(before + 6);
  });

  it('applies the peer component as a new evaluation and never overwrites', async () => {
    const q = await faculty.get(`/api/teach/grading/queue?assignmentId=${aid}`);
    const s4Sub = q.body.items.find((i: any) => i.student.id === s4.userId).submissionId;
    const ev = await faculty.post(`/api/teach/submissions/${s4Sub}/evaluations`, { rubricScores: picks('Proficient'), feedback: 'Solid answer.', release: true });
    expect(ev.status).toBe(201);
    const instructorEval = ev.body.evaluation;
    expect(instructorEval.finalScore).toBe(75);

    const res = await faculty.post(`/api/teach/assignments/${aid}/peer/apply`, {});
    expect(res.status).toBe(200);
    const applied = res.body.applied.find((x: any) => x.submissionId === s4Sub);
    // s4 kept two included reviews (both Excellent = 100) after one was excluded. Weight 20%.
    expect(applied.peerMedian).toBe(100);
    expect(applied.finalScore).toBe(80); // 75 x 0.8 + 100 x 0.2
    expect(res.body.skipped.some((x: any) => /No instructor evaluation/.test(x.reason))).toBe(true);

    const rows = await db.select().from(evaluations).where(eq(evaluations.submissionId, s4Sub));
    expect(rows.length).toBe(2);
    const old = rows.find((r) => r.id === instructorEval.id)!;
    const fresh = rows.find((r) => r.id !== instructorEval.id)!;
    expect(old.finalScore).toBe(75);
    expect(old.rawScore).toBe(75);
    expect(old.supersededBy).toBe(fresh.id);
    expect(fresh.reason).toBe('Peer component applied');
    expect(fresh.finalScore).toBe(80);
    expect(fresh.released).toBe(true);
    expect(fresh.rubricScores).toEqual(old.rubricScores);
    const auditRows = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'teach.peer.apply'), eq(auditLogs.targetId, fresh.id)));
    expect(auditRows.length).toBe(1);

    const again = await faculty.post(`/api/teach/assignments/${aid}/peer/apply`, {});
    expect(again.body.applied.find((x: any) => x.submissionId === s4Sub)).toBeUndefined();
    expect((await db.select().from(evaluations).where(eq(evaluations.submissionId, s4Sub))).length).toBe(2);

    const student = await s4.get(`/api/teach/my/assignments/${aid}`);
    expect(student.body.feedback.evaluation.finalScore).toBe(80);
    expect((await otherFaculty.post(`/api/teach/assignments/${aid}/peer/apply`, {})).status).toBe(404);
  });
});

describe('windows, files, reminders and small cohorts', () => {
  it('opens automatically, explains small cohorts and reminds once before closing', async () => {
    const [s1, s2] = students;
    const aid = await setupAssignment({ submitters: [s1, s2] });
    await enablePeer(aid, { openMode: 'auto', autoOpenHoursAfterDue: 0, reviewsPerSubmission: 3, closesAt: new Date(Date.now() + 20 * 3600_000).toISOString() });
    const tick = await runPeerTick();
    expect(tick.opened).toBeGreaterThanOrEqual(1);
    await drainJobs();
    const rows = await reviewsOf(aid);
    expect(rows.length).toBe(2);
    expect(rows.map((r) => [r.reviewerId, r.ownerKey]).sort()).toEqual([[s1.userId, s2.userId], [s2.userId, s1.userId]].sort());
    const dash = await faculty.get(`/api/teach/assignments/${aid}/peer`);
    expect(dash.body.settings.allocationNote.message).toMatch(/Only 2 students submitted/);

    const cal = await peerReviewCalendarItems(s1.userId, new Date(), new Date(Date.now() + 2 * 86400_000));
    expect(cal.some((x) => x.link === `/app/assignments/${aid}` && x.title.startsWith('Peer reviews due'))).toBe(true);

    await runPeerTick();
    await runPeerTick();
    const reminders = await db.select().from(notifications).where(and(eq(notifications.userId, s1.userId), eq(notifications.type, 'assignment.peer_reminder')));
    expect(reminders.filter((r) => r.link === `/app/assignments/${aid}`).length).toBe(1);

    // Closing releases feedback automatically (visible even before the tick runs).
    await db.update(teachPeerSettings).set({ closesAt: new Date(Date.now() - 60_000) }).where(eq(teachPeerSettings.assignmentId, aid));
    const after = await s2.get(`/api/teach/my/assignments/${aid}/peer`);
    expect(after.body.window.phase).toBe('closed');
    expect(after.body.feedback.visible).toBe(true);
    const r = rows.find((x) => x.reviewerId === s1.userId)!;
    expect((await s1.put(`/api/teach/my/peer-reviews/${r.id}`, { comment: 'too late' })).status).toBe(409);
    const t2 = await runPeerTick();
    expect(t2.released).toBeGreaterThanOrEqual(1);
  });

  it('lets only allocated reviewers download submission files, and only during the window', async () => {
    const [s1, s2, s3] = students;
    const fd = new FormData();
    fd.append('purpose', 'submission');
    fd.append('file', new File(['my essay as a text file'], 'ada-lovelace-essay.txt', { type: 'text/plain' }));
    const up = await ctx.app.request('/api/files', { method: 'POST', headers: { origin: 'http://localhost:5317', cookie: s1.cookie }, body: fd });
    expect(up.status).toBe(201);
    const fileId = (await up.json()).file.id as string;
    const aid = await setupAssignment({ submitters: [s1, s2, s3], overrides: { submissionTypes: ['text', 'file'] }, files: new Map([[s1, fileId]]) });
    await enablePeer(aid, { reviewsPerSubmission: 1 });

    // Before the window opens nobody but the owner and staff can read it.
    const get = (c: Client) => ctx.app.request(`/api/files/${fileId}`, { headers: { cookie: c.cookie } });
    expect((await get(s2)).status).toBe(404);
    expect((await get(s3)).status).toBe(404);
    await openPeer(aid);
    const rows = await reviewsOf(aid);
    const reviewerOfS1 = byUser(rows.find((r) => r.ownerKey === s1.userId)!.reviewerId);
    const notReviewer = [s2, s3].find((c) => c !== reviewerOfS1)!;
    expect((await get(reviewerOfS1)).status).toBe(200);
    expect((await get(notReviewer)).status).toBe(404);
    expect((await get(stranger)).status).toBe(404);

    // The reviewer sees a generic label, not the original file name.
    const mine = rows.find((r) => r.ownerKey === s1.userId)!;
    const d = await reviewerOfS1.get(`/api/teach/my/peer-reviews/${mine.id}`);
    expect(d.body.work.files[0].label).toBe('Attachment 1.txt');
    expect(JSON.stringify(d.body)).not.toContain('ada-lovelace');

    await db.update(teachPeerSettings).set({ closesAt: new Date(Date.now() - 60_000) }).where(eq(teachPeerSettings.assignmentId, aid));
    expect((await get(reviewerOfS1)).status).toBe(404);
  });

  it('refuses to apply a 0% peer component and keeps drafts out of privacy retention', async () => {
    const [s1, s2, s3] = students;
    const aid = await setupAssignment({ submitters: [s1, s2, s3] });
    await enablePeer(aid, { reviewsPerSubmission: 1, peerWeightPercent: 0 });
    await openPeer(aid);
    expect((await faculty.post(`/api/teach/assignments/${aid}/peer/apply`, {})).status).toBe(409); // not released yet
    await faculty.post(`/api/teach/assignments/${aid}/peer/release`);
    const zero = await faculty.post(`/api/teach/assignments/${aid}/peer/apply`, {});
    expect(zero.status).toBe(400);
    expect(zero.body.error.message).toMatch(/advisory/);

    const mine = (await reviewsOf(aid)).find((r) => r.reviewerId === s3.userId)!;
    await s3.put(`/api/teach/my/peer-reviews/${mine.id}`, { comment: 'draft only' });
    const handler = privacyHandlers().find((h) => h.key === 'teach_peer_reviews')!;
    const exported = (await handler.export!(s3.userId)) as any;
    expect(exported.written.length).toBeGreaterThan(0);
    const result = await handler.erase!(s3.userId);
    expect(result.action).toBe('anonymized');
    const left = await db.select().from(teachPeerReviews).where(and(eq(teachPeerReviews.reviewerId, s3.userId), inArray(teachPeerReviews.status, ['assigned', 'draft'])));
    expect(left.length).toBe(0);
  });
});
