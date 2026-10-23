import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupTestApp, registerUser } from './helpers';
import { db } from '../server/db/client';
import {
  assignments,
  auditLogs,
  evaluations,
  memberships,
  notifications,
  organizations,
  skillEvidence,
  skills,
  studentRecords,
  teachSimilarity,
} from '../server/db/schema';
import { drainJobs, enqueue } from '../server/jobs/queue';
import { computeSimilarity } from '../server/modules/teach/similarity';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
type Client = Awaited<ReturnType<typeof registerUser>>;

async function makeOrg(name: string, slug: string) {
  const [o] = await db.insert(organizations).values({ name, slug, kind: 'college' }).returning();
  return o.id;
}
async function join(orgId: string, userId: string, roles: string[]) {
  await db.insert(memberships).values({ orgId, userId, roles });
}
async function notificationsFor(userId: string, type: string) {
  return db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, type)));
}

const LONG_TEXT =
  'My solution uses a hash map to count occurrences of each element in a single pass over the array. Then it walks the map to find the element whose count exceeds half the length. The time complexity is linear in the number of elements and the extra space is linear in the number of distinct values.';

let orgA: string;
let orgB: string;
let faculty: Client;
let s1: Client;
let s2: Client;
let s3: Client;
let facultyB: Client;
let skillId: string;
let cohortId: string;
let otherCohortId: string;
let rubricId: string;
let assignmentId: string;
let submissionId: string;
let s2SubmissionId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  orgA = await makeOrg('Northbridge Test', 'nb-test');
  orgB = await makeOrg('Riverside Test', 'rs-test');
  faculty = await registerUser(ctx.app, 'Farah Faculty', 'farah@example.test');
  s1 = await registerUser(ctx.app, 'Sam Student', 'sam@example.test');
  s2 = await registerUser(ctx.app, 'Sia Student', 'sia@example.test');
  s3 = await registerUser(ctx.app, 'Oli Othercohort', 'oli@example.test');
  facultyB = await registerUser(ctx.app, 'Rita Riverside', 'rita@example.test');
  await join(orgA, faculty.userId, ['faculty']);
  for (const s of [s1, s2, s3]) await join(orgA, s.userId, ['student']);
  await join(orgB, facultyB.userId, ['faculty']);
  await faculty.post('/api/auth/switch', { orgId: orgA });
  await facultyB.post('/api/auth/switch', { orgId: orgB });
  for (const s of [s1, s2, s3]) await s.post('/api/auth/switch', { orgId: orgA });
  const [sk] = await db.insert(skills).values({ slug: 'test-hashing', name: 'Hashing', category: 'dsa' }).returning();
  skillId = sk.id;
});
afterAll(async () => ctx.close());

describe('Journey 2: rubric → assignment → submit → grade → release → feedback → clarification → regrade', () => {
  it('sets up a cohort with students and rejects non-students as students', async () => {
    const r = await faculty.post('/api/teach/cohorts', { name: 'CSE 2027 Section A', kind: 'section', graduationYear: 2027 });
    expect(r.status).toBe(201);
    cohortId = r.body.cohort.id;
    const add = await faculty.post(`/api/teach/cohorts/${cohortId}/members`, { userIds: [s1.userId, s2.userId, facultyB.userId], role: 'student' });
    expect(add.status).toBe(200);
    expect(add.body.added).toBe(2);
    expect(add.body.skipped[0].reason).toMatch(/Not a member/);

    const other = await faculty.post('/api/teach/cohorts', { name: 'CSE 2027 Section B' });
    otherCohortId = other.body.cohort.id;
    await faculty.post(`/api/teach/cohorts/${otherCohortId}/members`, { userIds: [s3.userId] });

    const detail = await faculty.get(`/api/teach/cohorts/${cohortId}`);
    expect(detail.body.students.map((s: any) => s.userId).sort()).toEqual([s1.userId, s2.userId].sort());
  });

  it('validates input', async () => {
    const bad = await faculty.post('/api/teach/rubrics', { title: 'x', criteria: [] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields.title).toBeTruthy();
  });

  it('creates a versioned rubric and an assignment, and publishes after the checklist passes', async () => {
    const rub = await faculty.post('/api/teach/rubrics', {
      title: 'Programming rubric',
      criteria: [
        { id: 'correct', title: 'Correctness', levels: [{ label: 'Excellent', points: 4 }, { label: 'Good', points: 3 }, { label: 'Fair', points: 2 }, { label: 'Poor', points: 0 }] },
        { id: 'comm', title: 'Communication', levels: [{ label: 'Clear', points: 4 }, { label: 'Unclear', points: 1 }] },
      ],
    });
    expect(rub.status).toBe(201);
    rubricId = rub.body.rubric.id;
    const edited = await faculty.patch(`/api/teach/rubrics/${rubricId}`, { title: 'Programming assignment rubric' });
    expect(edited.body.rubric.version).toBe(2);
    const versions = await faculty.get(`/api/teach/rubrics/${rubricId}`);
    expect(versions.body.versions.length).toBe(2);

    const due = new Date(Date.now() + 3 * 86400_000).toISOString();
    const a = await faculty.post('/api/teach/assignments', {
      cohortId,
      title: 'Majority element',
      instructions: '',
      dueAt: due,
      rubricId,
      skillIds: [skillId],
      latePolicy: { allowLate: true, penaltyPercentPerDay: 10, hardCutoffDays: 3 },
      allowResubmission: true,
      maxResubmissions: 1,
    });
    expect(a.status).toBe(201);
    assignmentId = a.body.assignment.id;

    // Checklist blocks publishing without instructions.
    const blocked = await faculty.post(`/api/teach/assignments/${assignmentId}/publish`);
    expect(blocked.status).toBe(400);
    await faculty.patch(`/api/teach/assignments/${assignmentId}`, { instructions: 'Find the element that appears more than n/2 times. Explain the complexity of your approach.', objectives: ['Use hashing'] });
    const pub = await faculty.post(`/api/teach/assignments/${assignmentId}/publish`);
    expect(pub.status).toBe(200);
    expect(pub.body.notified).toBe(2);
    expect(pub.body.assignment.rubricSnapshot.length).toBe(2);
    expect((await notificationsFor(s1.userId, 'assignment.published')).length).toBe(1);

    // Rubric fields lock after publishing.
    const locked = await faculty.patch(`/api/teach/assignments/${assignmentId}`, { maxPoints: 50 });
    expect(locked.status).toBe(409);
  });

  it('lets a student autosave a draft and submit late with the penalty preview', async () => {
    const list = await s1.get('/api/teach/my/assignments');
    expect(list.status).toBe(200);
    expect(list.body.items.find((i: any) => i.id === assignmentId).status).toBe('not_started');

    const draft = await s1.put(`/api/teach/my/assignments/${assignmentId}/draft`, { text: LONG_TEXT });
    expect(draft.status).toBe(200);
    expect(draft.body.draft.savedAt).toBeTruthy();
    const again = await s1.put(`/api/teach/my/assignments/${assignmentId}/draft`, { text: LONG_TEXT + ' Edge cases are handled.' });
    expect(again.body.draft.id).toBe(draft.body.draft.id);
    const detail = await s1.get(`/api/teach/my/assignments/${assignmentId}`);
    expect(detail.body.status).toBe('draft');
    expect(detail.body.guideLink).toBe(`/app/ai?assistant=assignment_guide&context=assignment:${assignmentId}`);

    // Move the deadline 30 hours into the past: 2 started days late at 10% per day.
    await db
      .update(assignments)
      .set({ dueAt: new Date(Date.now() - 30 * 3600_000), availableFrom: new Date(Date.now() - 5 * 86400_000) })
      .where(eq(assignments.id, assignmentId));

    const noConfirm = await s1.post(`/api/teach/my/assignments/${assignmentId}/submit`, {});
    expect(noConfirm.status).toBe(400);
    const sub = await s1.post(`/api/teach/my/assignments/${assignmentId}/submit`, { confirm: true });
    expect(sub.status).toBe(201);
    expect(sub.body.receipt.isLate).toBe(true);
    expect(sub.body.receipt.daysLate).toBe(2);
    expect(sub.body.receipt.latePenaltyPercent).toBe(20);
    expect(sub.body.receipt.code).toMatch(/^[A-Z2-9]{10}$/);
    expect(sub.body.receipt.contentHash).toMatch(/^[a-f0-9]{64}$/);
    submissionId = sub.body.submission.id;

    const receipt = await s1.get(`/api/teach/my/submissions/${submissionId}/receipt`);
    expect(receipt.body.receipt.code).toBe(sub.body.receipt.code);
    const peek = await s2.get(`/api/teach/my/submissions/${submissionId}/receipt`);
    expect(peek.status).toBe(404);
  });

  it('grades with the rubric, applies the late penalty, and keeps the private comment private', async () => {
    const queue = await faculty.get('/api/teach/grading/queue?status=ungraded');
    expect(queue.body.items.some((i: any) => i.submissionId === submissionId)).toBe(true);
    expect(queue.body.counts.ungraded).toBeGreaterThanOrEqual(1);

    const ev = await faculty.post(`/api/teach/submissions/${submissionId}/evaluations`, {
      rubricScores: [
        { criterionId: 'correct', levelLabel: 'Good' },
        { criterionId: 'comm', levelLabel: 'Clear' },
      ],
      feedback: 'Solid approach. Mention the Boyer-Moore alternative.',
      privateComment: 'secret-instructor-note',
    });
    expect(ev.status).toBe(201);
    // 7 of 8 rubric points scaled to 100 = 87.5; 2 days late at 10%/day = 20% → 17.5 off → 70.
    expect(ev.body.evaluation.rawScore).toBe(87.5);
    expect(ev.body.evaluation.latePenalty).toBe(17.5);
    expect(ev.body.evaluation.finalScore).toBe(70);
    expect(ev.body.evaluation.released).toBe(false);

    const before = await s1.get(`/api/teach/my/assignments/${assignmentId}`);
    expect(before.body.feedback).toBeNull();

    const rel = await faculty.post(`/api/teach/evaluations/${ev.body.evaluation.id}/release`);
    expect(rel.status).toBe(200);
    expect((await notificationsFor(s1.userId, 'assignment.graded')).length).toBe(1);

    const after = await s1.get(`/api/teach/my/assignments/${assignmentId}`);
    expect(after.body.status).toBe('graded');
    expect(after.body.feedback.evaluation.finalScore).toBe(70);
    expect(after.body.feedback.evaluation.rubricScores.length).toBe(2);
    const raw = JSON.stringify(after.body);
    expect(raw).not.toContain('secret-instructor-note');
    expect(raw).not.toContain('privateComment');

    const [evidence] = await db.select().from(skillEvidence).where(and(eq(skillEvidence.userId, s1.userId), eq(skillEvidence.skillId, skillId)));
    expect(evidence.verified).toBe(true);
    expect(evidence.verifiedBy).toBe(faculty.userId);
    expect(evidence.sourceType).toBe('assignment_submission');
    expect(evidence.source).toBe('assessment');
    expect(evidence.score).toBeCloseTo(0.7);
  });

  it('notifies the grader about a clarification question and records a regrade request once', async () => {
    const q = await s1.post(`/api/teach/my/submissions/${submissionId}/comments`, { body: 'Could you explain what was missing in correctness?' });
    expect(q.status).toBe(201);
    expect((await notificationsFor(faculty.userId, 'assignment.clarification')).length).toBe(1);

    const r = await s1.post(`/api/teach/my/submissions/${submissionId}/regrade`, { reason: 'My solution handles all the edge cases listed in the instructions.' });
    expect(r.status).toBe(201);
    expect(r.body.regrade.previousScore).toBe(70);
    const dup = await s1.post(`/api/teach/my/submissions/${submissionId}/regrade`, { reason: 'Asking again about the same grade please.' });
    expect(dup.status).toBe(409);
  });

  it('records an authorized re-evaluation as a new evaluation row with a reason and an audit entry', async () => {
    const noReason = await faculty.post(`/api/teach/submissions/${submissionId}/evaluations`, {
      rubricScores: [
        { criterionId: 'correct', levelLabel: 'Excellent' },
        { criterionId: 'comm', levelLabel: 'Clear' },
      ],
    });
    expect(noReason.status).toBe(400);

    const list = await faculty.get('/api/teach/regrades?status=open');
    const regrade = list.body.items.find((x: any) => x.subjectId === submissionId);
    expect(regrade).toBeTruthy();
    const res = await faculty.post(`/api/teach/regrades/${regrade.id}/resolve`, {
      decision: 'adjusted',
      note: 'Edge cases were indeed handled; correctness raised to Excellent.',
      evaluation: { rubricScores: [{ criterionId: 'correct', levelLabel: 'Excellent' }, { criterionId: 'comm', levelLabel: 'Clear' }], feedback: 'Updated after regrade.' },
    });
    expect(res.status).toBe(200);
    expect(res.body.regrade.status).toBe('adjusted');
    expect(res.body.regrade.newScore).toBe(80);

    const rows = await db.select().from(evaluations).where(eq(evaluations.submissionId, submissionId));
    expect(rows.length).toBe(2);
    const oldRow = rows.find((r) => r.id !== res.body.evaluationId)!;
    const newRow = rows.find((r) => r.id === res.body.evaluationId)!;
    expect(oldRow.supersededBy).toBe(newRow.id);
    expect(oldRow.finalScore).toBe(70); // never overwritten
    expect(newRow.reason).toMatch(/Regrade request/);
    expect(newRow.released).toBe(true);

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgA));
    expect(logs.some((l) => l.action === 'teach.regrade.resolve')).toBe(true);
    expect(logs.some((l) => l.action === 'teach.evaluation.reevaluate' && l.targetId === newRow.id)).toBe(true);
    expect((await notificationsFor(s1.userId, 'assignment.regrade_resolved')).length).toBe(1);

    const [evidence] = await db.select().from(skillEvidence).where(and(eq(skillEvidence.userId, s1.userId), eq(skillEvidence.skillId, skillId)));
    expect(evidence.score).toBeCloseTo(0.8);
    expect(evidence.verifiedBy).toBe(faculty.userId);

    const student = await s1.get(`/api/teach/my/assignments/${assignmentId}`);
    expect(student.body.feedback.evaluation.finalScore).toBe(80);
    expect(student.body.regrades[0].status).toBe('adjusted');
  });
});

describe('tenant isolation and cohort boundaries', () => {
  it('returns 404 to Riverside faculty for Northbridge records and blocks grading', async () => {
    expect((await facultyB.get(`/api/teach/submissions/${submissionId}`)).status).toBe(404);
    expect((await facultyB.get(`/api/teach/assignments/${assignmentId}`)).status).toBe(404);
    expect((await facultyB.get(`/api/teach/cohorts/${cohortId}`)).status).toBe(404);
    const grade = await facultyB.post(`/api/teach/submissions/${submissionId}/evaluations`, { score: 100, reason: 'Trying to grade another org' });
    expect(grade.status).toBe(404);
    const queue = await facultyB.get('/api/teach/grading/queue');
    expect(queue.body.items.length).toBe(0);
    expect((await facultyB.get(`/api/teach/cohorts/${cohortId}/completion.csv`)).status).toBe(404);
  });

  it('returns 404 to a student of another cohort and to students on faculty endpoints', async () => {
    expect((await s3.get(`/api/teach/my/assignments/${assignmentId}`)).status).toBe(404);
    expect((await s3.put(`/api/teach/my/assignments/${assignmentId}/draft`, { text: 'hi' })).status).toBe(404);
    const list = await s3.get('/api/teach/my/assignments');
    expect(list.body.items.length).toBe(0);
    expect((await s1.get(`/api/teach/submissions/${submissionId}`)).status).toBe(404);
    expect((await s1.get(`/api/teach/assignments/${assignmentId}/grades.csv`)).status).toBe(404);
  });

  it('exports grades as CSV for faculty', async () => {
    const res = await ctx.app.request(`/api/teach/assignments/${assignmentId}/grades.csv`, { headers: { cookie: faculty.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/csv/);
    const text = await res.text();
    expect(text.split('\n')[0]).toMatch(/^Student,Email,Team,Status/);
    expect(text).toContain('Sam Student');
  });
});

describe('similarity indicators', () => {
  it('computes similarity against the same assignment only, idempotently, with careful wording', async () => {
    const sub = await s2.post(`/api/teach/my/assignments/${assignmentId}/submit`, { confirm: true, text: LONG_TEXT + ' I also tested it.' });
    expect(sub.status).toBe(201);
    s2SubmissionId = sub.body.submission.id;
    await drainJobs();
    const [row] = await db.select().from(teachSimilarity).where(eq(teachSimilarity.submissionId, s2SubmissionId));
    expect(row.method).toBe('word-5-gram-jaccard');
    expect(row.maxScore!).toBeGreaterThan(0.6);
    expect(row.matches[0].otherSubmissionId).toBe(submissionId);

    // Re-enqueueing with the same key is a no-op; recomputing yields the same single row.
    const again = await enqueue('teach.similarity', { submissionId: s2SubmissionId }, { idempotencyKey: `teach.similarity:${s2SubmissionId}` });
    expect(again.created).toBe(false);
    await computeSimilarity(s2SubmissionId);
    const rows = await db.select().from(teachSimilarity).where(eq(teachSimilarity.submissionId, s2SubmissionId));
    expect(rows.length).toBe(1);
    expect(rows[0].maxScore).toBe(row.maxScore);

    const view = await faculty.get(`/api/teach/submissions/${s2SubmissionId}`);
    expect(view.body.similarity.wording).toBe('Similarity indicator. Not proof of plagiarism; review the texts side by side.');
    const cmp = await faculty.get(`/api/teach/submissions/${s2SubmissionId}/compare/${submissionId}`);
    expect(cmp.status).toBe(200);
    expect(cmp.body.sharedPhrases.length).toBeGreaterThan(0);
  });

  it('files an integrity report silently and notifies the student only on a decision', async () => {
    const rep = await faculty.post(`/api/teach/submissions/${s2SubmissionId}/integrity-reports`, { note: 'High overlap with another submission; reviewing.' });
    expect(rep.status).toBe(201);
    expect((await notificationsFor(s2.userId, 'assignment.integrity_decision')).length).toBe(0);
    const before = await s2.get(`/api/teach/my/assignments/${assignmentId}`);
    expect(before.body.integrity.length).toBe(0);
    const dec = await faculty.post(`/api/teach/integrity-reports/${rep.body.report.id}/decide`, { status: 'cleared', outcomeNote: 'Both students used the lecture notes wording.' });
    expect(dec.status).toBe(200);
    expect((await notificationsFor(s2.userId, 'assignment.integrity_decision')).length).toBe(1);
  });
});

describe('AI grading suggestions', () => {
  it('returns ok:false gracefully when no AI provider is configured', async () => {
    const r = await faculty.post(`/api/teach/submissions/${s2SubmissionId}/ai-proposal`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(false);
    expect(typeof r.body.message).toBe('string');
    const rows = await db.select().from(evaluations).where(eq(evaluations.submissionId, s2SubmissionId));
    expect(rows.length).toBe(0); // never auto-applied
  });
});

describe('analytics and interventions', () => {
  it('never flags students only because attendance data is missing', async () => {
    const co = await faculty.post('/api/teach/cohorts', { name: 'Analytics cohort' });
    const id = co.body.cohort.id;
    await faculty.post(`/api/teach/cohorts/${id}/members`, { userIds: [s1.userId, s2.userId] });
    const empty = await faculty.get(`/api/teach/analytics/cohorts/${id}`);
    expect(empty.status).toBe(200);
    expect(empty.body.students.every((s: any) => !s.atRisk && s.attendancePercent === null)).toBe(true);
    expect(empty.body.definitions.atRisk).toMatch(/never flagged because data is missing/);

    // A record exists only for s1: attendance is copied there and nowhere else.
    await db.insert(studentRecords).values({ orgId: orgA, userId: s1.userId, rollNumber: 'NB-001' });
    const sess = await faculty.post('/api/teach/attendance/sessions', { cohortId: id, heldOn: '2026-10-01', topic: 'Hashing', marks: [{ userId: s1.userId, status: 'absent' }] });
    expect(sess.status).toBe(201);
    expect(sess.body.recordsUpdated).toBe(1);
    const [rec] = await db.select().from(studentRecords).where(eq(studentRecords.userId, s1.userId));
    expect(rec.attendancePercent).toBe(0);
    expect((await db.select().from(studentRecords).where(eq(studentRecords.userId, s2.userId))).length).toBe(0);

    const after = await faculty.get(`/api/teach/analytics/cohorts/${id}`);
    const a1 = after.body.students.find((s: any) => s.userId === s1.userId);
    const a2 = after.body.students.find((s: any) => s.userId === s2.userId);
    expect(a1.atRisk).toBe(true);
    expect(a1.reasons[0].code).toBe('low_attendance');
    expect(a2.attendancePercent).toBeNull();
    expect(a2.atRisk).toBe(false);

    // Intervention: revision goal for a student in the cohort, logged with a follow-up date.
    const iv = await faculty.post('/api/teach/interventions', { cohortId: id, studentIds: [s1.userId], kind: 'revision_resource', reason: a1.reasons[0].text, followUpOn: '2026-11-01', resource: { title: 'Revise hashing basics' } });
    expect(iv.status).toBe(201);
    expect(iv.body.items[0].goalId).toBeTruthy();
    const goals = await s1.get('/api/learning/goals');
    expect(goals.body.goals.some((g: any) => g.title === 'Revise hashing basics')).toBe(true);
    const outsider = await faculty.post('/api/teach/interventions', { cohortId: id, studentIds: [s3.userId], kind: 'message', message: 'Checking in on your progress this week.' });
    expect(outsider.status).toBe(400);
  });
});
