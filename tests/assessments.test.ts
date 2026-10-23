import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';

// Deterministic stand-ins for the sandbox and the AI provider (the real ones are built in parallel).
const h = vi.hoisted(() => ({ exec: 'partial' as 'partial' | 'unavailable', ai: 'not_configured' as 'not_configured' | 'proposal' }));
vi.mock('../server/exec/index.ts', () => ({
  runCode: async (p: { tests: { name: string; hidden?: boolean }[] }) => {
    if (h.exec === 'unavailable') return { provider: 'none', status: 'unavailable', passed: 0, total: 0, message: 'No sandbox for this language.', results: [], durationMs: 0 };
    // Passes visible tests and the first hidden test; fails the rest.
    let hiddenSeen = 0;
    const results = p.tests.map((t) => {
      const passed = !t.hidden || hiddenSeen++ === 0;
      return { name: t.name, hidden: !!t.hidden, passed, status: passed ? 'passed' : 'wrong_answer', timeMs: 1 };
    });
    const passed = results.filter((r) => r.passed).length;
    return { provider: 'quickjs', status: passed === results.length ? 'accepted' : 'wrong_answer', passed, total: results.length, results, durationMs: 3 };
  },
  runSql: async (p: { query: string }) => {
    if (h.exec === 'unavailable') return { provider: 'none', status: 'unavailable', passed: 0, total: 0, message: 'No SQL sandbox.', results: [], durationMs: 0 };
    const ok = p.query.includes('GOOD');
    return { provider: 'pglite', status: ok ? 'accepted' : 'wrong_answer', passed: ok ? 1 : 0, total: 1, results: [], durationMs: 2, columns: ['n'], rows: [[1]] };
  },
  runtimes: async () => [],
}));
vi.mock('../server/ai/engine.ts', () => ({
  aiComplete: async () =>
    h.ai === 'proposal'
      ? { ok: true, text: '{"score": 2, "rationale": "Covers measurement and narrowing down, misses deploy history."}', provider: 'test', model: 'stub', usage: { inputTokens: 1, outputTokens: 1, estimated: true } }
      : { ok: false, reason: 'not_configured', message: 'No AI provider is configured on this server.' },
  aiStatus: async () => ({ configured: false, providers: [] }),
}));

import { setupTestApp, registerUser } from './helpers';
import { db } from '../server/db/client';
import { organizations, memberships, cohorts, cohortMembers, users, attempts, attemptAnswers, skillEvidence, notifications, auditLogs, skills, assessments } from '../server/db/schema';
import { drainJobs } from '../server/jobs/queue';
import { gradeAttempt, releaseAttempt, recomputeAttempt } from '../server/modules/assessments/engine';
import { attemptSummaries } from '../server/modules/assessments/service';

type C = Awaited<ReturnType<typeof registerUser>>;
let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let orgA: string, orgB: string, orgC: string, cohortId: string, skillId: string;
let facA: C, facB: C, student1: C, student2: C, outsider: C, recruiter: C, interviewer: C, candidate: C, admin: C;

async function org(name: string, kind: string) {
  const [o] = await db.insert(organizations).values({ name, slug: name.toLowerCase().replace(/\s+/g, '-'), kind }).returning();
  return o.id;
}
async function member(orgId: string, c: C, roles: string[], activate = true) {
  await db.insert(memberships).values({ orgId, userId: c.userId, roles });
  if (activate) expect((await c.post('/api/auth/switch', { orgId })).status).toBe(200);
}

const Q = {
  single: { type: 'single', title: 'Pick B', content: { prompt: 'Pick **B**', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }] }, answerKey: { correct: ['b'], explanation: 'B is right.' }, points: 2 },
  multi: { type: 'multi', title: 'Pick evens', content: { prompt: 'Even numbers?', options: [{ id: '1', text: '1' }, { id: '2', text: '2' }, { id: '4', text: '4' }, { id: '6', text: '6' }] }, answerKey: { correct: ['2', '4', '6'] }, points: 3 },
  true_false: { type: 'true_false', title: 'Sky blue', content: { prompt: 'The sky is blue.', options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }] }, answerKey: { correct: ['true'] }, points: 1 },
  matching: { type: 'matching', title: 'Capitals', content: { prompt: 'Match', pairs: { left: [{ id: 'fr', text: 'France' }, { id: 'jp', text: 'Japan' }], right: [{ id: 'p', text: 'Paris' }, { id: 't', text: 'Tokyo' }] } }, answerKey: { matches: { fr: 'p', jp: 't' } }, points: 2 },
  fill_blank: { type: 'fill_blank', title: 'Keyword', content: { prompt: 'SELECT ____ city', blanks: 1 }, answerKey: { accepted: [['DISTINCT']] }, points: 1 },
  short_text: { type: 'short_text', title: 'Explain', content: { prompt: 'Explain debugging.' }, answerKey: { modelAnswer: 'Measure first.', rubric: [{ criterion: 'Measures', points: 3 }] }, points: 3 },
  long_text: { type: 'long_text', title: 'Essay', content: { prompt: 'Write an essay.', wordLimit: 500 }, answerKey: {}, points: 5 },
  coding: { type: 'coding', title: 'Reverse', content: { prompt: 'Reverse words', languages: ['python'], visibleTests: [{ name: 'v1', input: 'a b', expected: 'b a' }] }, answerKey: { hiddenTests: [{ name: 'h1', input: 'x', expected: 'x' }, { name: 'h2', input: 'p q', expected: 'q p' }, { name: 'h3', input: '1 2 3', expected: '3 2 1' }] }, points: 8 },
  sql: { type: 'sql', title: 'Count', content: { prompt: 'Count rows', schemaSql: 'create table t(id int);' }, answerKey: { solutionSql: 'select count(*) as n from t', seedSql: 'insert into t values (1);' }, points: 4 },
  file: { type: 'file', title: 'Upload', content: { prompt: 'Upload a diagram', acceptedFileTypes: ['pdf'] }, answerKey: {}, points: 2 },
  oral: { type: 'oral', title: 'Talk', content: { prompt: 'Explain aloud' }, answerKey: {}, points: 2 },
} as const;

const qid: Record<string, string> = {};
let classroomId: string;
let attempt1: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  const [s] = await db.insert(skills).values({ slug: 'test-skill', name: 'Test skill', category: 'programming', level: 1 }).returning();
  skillId = s.id;
  orgA = await org('College A', 'college');
  orgB = await org('College B', 'college');
  orgC = await org('Company C', 'company');
  facA = await registerUser(ctx.app, 'Fac A', 'faca@example.test');
  facB = await registerUser(ctx.app, 'Fac B', 'facb@example.test');
  student1 = await registerUser(ctx.app, 'Stu One', 'stu1@example.test');
  student2 = await registerUser(ctx.app, 'Stu Two', 'stu2@example.test');
  outsider = await registerUser(ctx.app, 'Out Sider', 'out@example.test');
  recruiter = await registerUser(ctx.app, 'Rec Ruiter', 'rec@example.test');
  interviewer = await registerUser(ctx.app, 'Inter Viewer', 'int@example.test');
  candidate = await registerUser(ctx.app, 'Can Didate', 'cand@example.test');
  admin = await registerUser(ctx.app, 'Plat Admin', 'admin@example.test');
  await db.update(users).set({ platformRole: 'platform_admin' }).where(eq(users.id, admin.userId));
  await member(orgA, facA, ['faculty']);
  await member(orgB, facB, ['faculty']);
  await member(orgA, student1, ['student']);
  await member(orgA, student2, ['student']);
  await member(orgC, recruiter, ['recruiter']);
  await member(orgC, interviewer, ['interviewer']);
  const [co] = await db.insert(cohorts).values({ orgId: orgA, name: 'CS-A' }).returning();
  cohortId = co.id;
  await db.insert(cohortMembers).values({ cohortId, userId: student1.userId });
});
afterAll(async () => ctx.close());

describe('question bank', () => {
  it('creates every question type with per-type validation and never shows keys to students', async () => {
    for (const [k, q] of Object.entries(Q)) {
      const r = await facA.post('/api/assessments/questions', { ...q, skillIds: [skillId], topics: ['t1'] });
      expect(r.status, `${k}: ${JSON.stringify(r.body)}`).toBe(201);
      expect(r.body.question.answerKey).toBeTruthy();
      qid[k] = r.body.question.id;
    }
    const bad = await facA.post('/api/assessments/questions', { ...Q.single, answerKey: { correct: ['zzz'] } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields['answerKey.correct']).toBeTruthy();
    const badMatch = await facA.post('/api/assessments/questions', { ...Q.matching, answerKey: { matches: { fr: 'p' } } });
    expect(badMatch.status).toBe(400);

    expect((await student1.post('/api/assessments/questions', Q.single)).status).toBe(403);
    expect((await student1.get(`/api/assessments/questions/${qid.single}`)).status).toBe(403);
    const list = await facA.get('/api/assessments/questions?type=coding');
    expect(list.body.total).toBe(1);
  });

  it('versions edits and retires used questions instead of deleting', async () => {
    const r = await facA.patch(`/api/assessments/questions/${qid.true_false}`, { content: { ...Q.true_false.content, prompt: 'The clear daytime sky is blue.' } });
    expect(r.status).toBe(200);
    expect(r.body.question.version).toBe(2);
    const v = await facA.get(`/api/assessments/questions/${qid.true_false}/versions`);
    expect(v.body.versions).toHaveLength(1);
    expect(v.body.versions[0].content.prompt).toBe('The sky is blue.');
    const extra = await facA.post('/api/assessments/questions', { ...Q.oral, title: 'Throwaway' });
    const del = await facA.del(`/api/assessments/questions/${extra.body.question.id}`);
    expect(del.body.deleted).toBe(true);
  });
});

describe('classroom assessment lifecycle', () => {
  it('validates before publishing and freezes questions after', async () => {
    const r = await facA.post('/api/assessments', { title: 'Midterm', mode: 'classroom', cohortId, settings: { resultRelease: 'immediate', allowRegradeRequests: true, passingScore: 50, showAnswersAfterRelease: true } });
    expect(r.status).toBe(201);
    classroomId = r.body.assessment.id;
    const empty = await facA.post(`/api/assessments/${classroomId}/publish`);
    expect(empty.status).toBe(400);
    expect(empty.body.error.details.problems.join(' ')).toMatch(/at least one question/);

    // A coding question without tests blocks publishing.
    const noTests = await facA.post('/api/assessments/questions', { ...Q.coding, title: 'No tests', content: { ...Q.coding.content, visibleTests: [] }, answerKey: {} });
    await facA.put(`/api/assessments/${classroomId}/items`, { items: [{ questionId: noTests.body.question.id }] });
    const blocked = await facA.post(`/api/assessments/${classroomId}/publish`);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.message).toMatch(/no tests/);

    const items = ['single', 'multi', 'true_false', 'matching', 'fill_blank', 'short_text', 'coding', 'sql'].map((k) => ({ questionId: qid[k] }));
    expect((await facA.put(`/api/assessments/${classroomId}/items`, { items })).status).toBe(200);
    const pub = await facA.post(`/api/assessments/${classroomId}/publish`);
    expect(pub.status).toBe(200);
    expect((await facA.put(`/api/assessments/${classroomId}/items`, { items: [] })).status).toBe(409);
  });

  it('lets cohort members take it, autosaves, hides answer keys and submits idempotently', async () => {
    h.exec = 'partial';
    expect((await student2.post(`/api/assessments/${classroomId}/attempts`)).status).toBe(404);
    const avail = await student1.get('/api/assessments/available');
    expect(avail.body.items.some((i: any) => i.id === classroomId)).toBe(true);

    const start = await student1.post(`/api/assessments/${classroomId}/attempts`);
    expect(start.status).toBe(201);
    attempt1 = start.body.attempt.id;
    const again = await student1.post(`/api/assessments/${classroomId}/attempts`);
    expect(again.status).toBe(200);
    expect(again.body.attempt.id).toBe(attempt1);

    const view = await student1.get(`/api/assessments/attempts/${attempt1}`);
    expect(view.status).toBe(200);
    const raw = JSON.stringify(view.body);
    for (const leak of ['answerKey', 'hiddenTests', 'solutionSql', 'seedSql', 'modelAnswer', 'rubric', '"correct"', 'B is right']) expect(raw).not.toContain(leak);
    expect(view.body.items).toHaveLength(8);

    // Other users cannot see this attempt.
    expect((await student2.get(`/api/assessments/attempts/${attempt1}`)).status).toBe(404);

    const save = (q: string, answer: unknown) => student1.put(`/api/assessments/attempts/${attempt1}/answers/${qid[q]}`, { answer });
    expect((await save('single', { choice: 'b' })).status).toBe(200);
    await save('multi', { choices: ['2', '4'] }); // 2 of 3 correct, none wrong → 2 points
    await save('true_false', { choice: 'false' }); // wrong
    await save('matching', { matches: { fr: 'p', jp: 'p' } }); // half
    await save('fill_blank', { blanks: ['distinct'] }); // case-insensitive
    await save('short_text', { text: 'I would measure first, then narrow it down.' });
    await save('coding', { code: 'print(1)', language: 'python' });
    await save('sql', { query: 'select GOOD' });
    expect((await student1.put(`/api/assessments/attempts/${attempt1}/answers/${qid.oral}`, { answer: { text: 'x' } })).status).toBe(404);

    const sub = await student1.post(`/api/assessments/attempts/${attempt1}/submit`, { submitKey: 'k1' });
    expect(sub.status).toBe(200);
    expect(sub.body.alreadySubmitted).toBe(false);
    const sub2 = await student1.post(`/api/assessments/attempts/${attempt1}/submit`, { submitKey: 'k1' });
    expect(sub2.body.alreadySubmitted).toBe(true);
    expect((await save('single', { choice: 'a' })).status).toBe(409);

    await drainJobs();
    const answers = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attempt1));
    const by = (k: string) => answers.find((a) => a.questionId === qid[k])!;
    expect(by('single').finalScore).toBe(2);
    expect(by('multi').finalScore).toBe(2);
    expect(by('true_false').finalScore).toBe(0);
    expect(by('matching').finalScore).toBe(1);
    expect(by('fill_blank').finalScore).toBe(1);
    expect(by('coding').finalScore).toBe(4); // 2 of 4 tests → 8 × 0.5
    expect(by('coding').gradingMethod).toBe('execution');
    expect(by('sql').finalScore).toBe(4);
    expect(by('short_text').finalScore).toBeNull();
    const [at] = await db.select().from(attempts).where(eq(attempts.id, attempt1));
    expect(at.status).toBe('needs_review');
    const res = await student1.get(`/api/assessments/attempts/${attempt1}/result`);
    expect(res.body.released).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('finalScore');
  });

  it('routes coding answers to manual review when execution is unavailable', async () => {
    h.exec = 'unavailable';
    const a = await facA.post('/api/assessments', { title: 'Code quiz', mode: 'classroom', cohortId, settings: { resultRelease: 'immediate' } });
    await facA.put(`/api/assessments/${a.body.assessment.id}/items`, { items: [{ questionId: qid.coding }] });
    await facA.post(`/api/assessments/${a.body.assessment.id}/publish`);
    const st = await student1.post(`/api/assessments/${a.body.assessment.id}/attempts`);
    await student1.put(`/api/assessments/attempts/${st.body.attempt.id}/answers/${qid.coding}`, { answer: { code: 'print(1)', language: 'python' } });
    await student1.post(`/api/assessments/attempts/${st.body.attempt.id}/submit`, {});
    await drainJobs();
    const [ans] = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, st.body.attempt.id));
    expect(ans.finalScore).toBeNull();
    expect(ans.gradingMethod).toBe('pending');
    expect(String(ans.gradingDetail?.reason)).toMatch(/could not run/);
    h.exec = 'partial';
  });

  it('grades manually, releases immediately and records verified evidence', async () => {
    const queue = await facA.get(`/api/assessments/${classroomId}/grading-queue`);
    expect(queue.status).toBe(200);
    expect(queue.body.items).toHaveLength(1);
    const item = queue.body.items[0];
    expect(item.question.guidance.modelAnswer).toBe('Measure first.');

    // Students cannot grade.
    expect((await student1.patch(`/api/assessments/answers/${item.answerId}`, { manualScore: 3 })).status).toBe(403);
    const tooHigh = await facA.patch(`/api/assessments/answers/${item.answerId}`, { manualScore: 99 });
    expect(tooHigh.status).toBe(400);

    const g = await facA.patch(`/api/assessments/answers/${item.answerId}`, { manualScore: 2, feedback: 'Good start.' });
    expect(g.status).toBe(200);
    expect(g.body.attemptStatus).toBe('released');

    const [at] = await db.select().from(attempts).where(eq(attempts.id, attempt1));
    expect(at.status).toBe('released');
    expect(at.score).toBe(16);
    expect(at.maxScore).toBe(24);

    const ev = await db.select().from(skillEvidence).where(and(eq(skillEvidence.userId, student1.userId), eq(skillEvidence.sourceId, attempt1)));
    expect(ev).toHaveLength(1);
    expect(ev[0].verified).toBe(true);
    expect(ev[0].source).toBe('assessment');
    expect(ev[0].score).toBeCloseTo(16 / 24, 3);

    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, student1.userId), eq(notifications.type, 'assessment.result_released')));
    expect(notes).toHaveLength(1);

    const res = await student1.get(`/api/assessments/attempts/${attempt1}/result`);
    expect(res.body.released).toBe(true);
    expect(res.body.percent).toBeCloseTo(66.7, 1);
    expect(res.body.passed).toBe(true);
    const single = res.body.items.find((i: any) => i.question.id === qid.single);
    expect(single.correctAnswer).toEqual(['b']);
    expect(single.explanation).toBe('B is right.');
    const raw = JSON.stringify(res.body);
    for (const leak of ['answerKey', 'hiddenTests', 'solutionSql', 'seedSql', 'modelAnswer', 'rubric', 'aiProposal']) expect(raw).not.toContain(leak);

    // Overriding an existing score needs a reason, and is audited.
    const noReason = await facA.patch(`/api/assessments/answers/${item.answerId}`, { manualScore: 3 });
    expect(noReason.status).toBe(400);
    const withReason = await facA.patch(`/api/assessments/answers/${item.answerId}`, { manualScore: 3, reason: 'Moderation: rubric applied consistently' });
    expect(withReason.status).toBe(200);
    const [after] = await db.select().from(attempts).where(eq(attempts.id, attempt1));
    expect(after.score).toBe(17);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'assessment.answer_scored'));
    expect(logs.some((l) => (l.meta as any).reason === 'Moderation: rubric applied consistently')).toBe(true);
  });

  it('AI proposals degrade gracefully and never change scores', async () => {
    const [ans] = await db.select().from(attemptAnswers).where(and(eq(attemptAnswers.attemptId, attempt1), eq(attemptAnswers.questionId, qid.short_text)));
    h.ai = 'not_configured';
    const r = await facA.post(`/api/assessments/answers/${ans.id}/ai-proposal`);
    expect(r.status).toBe(200);
    expect(r.body.proposal).toBeNull();
    expect(r.body.ai).toMatchObject({ ok: false, reason: 'not_configured' });
    expect((await facA.post(`/api/assessments/answers/${ans.id}/accept-proposal`, {})).status).toBe(409);

    h.ai = 'proposal';
    const p = await facA.post(`/api/assessments/answers/${ans.id}/ai-proposal`);
    expect(p.body.proposal.score).toBe(2);
    const [still] = await db.select().from(attemptAnswers).where(eq(attemptAnswers.id, ans.id));
    expect(still.finalScore).toBe(3); // unchanged by the proposal
    expect(still.aiProposal?.score).toBe(2);
    const acc = await facA.post(`/api/assessments/answers/${ans.id}/accept-proposal`, { reason: 'Agree with the AI rationale after reading' });
    expect(acc.status).toBe(200);
    expect(acc.body.answer.finalScore).toBe(2);
    expect(acc.body.answer.gradedBy).toBe(facA.userId);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'assessment.answer_scored'));
    expect(logs.some((l) => (l.meta as any).aiAssisted === true)).toBe(true);
    h.ai = 'not_configured';
  });

  it('handles regrade requests both ways', async () => {
    const res = await student1.get(`/api/assessments/attempts/${attempt1}/result`);
    const tf = res.body.items.find((i: any) => i.question.id === qid.true_false);
    const req = await student1.post(`/api/assessments/answers/${tf.answerId}/regrade`, { reason: 'The prompt changed after I answered it.' });
    expect(req.status).toBe(201);
    expect((await student1.post(`/api/assessments/answers/${tf.answerId}/regrade`, { reason: 'Again please, same reason here.' })).status).toBe(409);
    expect((await student2.post(`/api/assessments/answers/${tf.answerId}/regrade`, { reason: 'Not my answer but trying.' })).status).toBe(404);
    const facNotes = await db.select().from(notifications).where(and(eq(notifications.userId, facA.userId), eq(notifications.type, 'assessment.regrade_requested')));
    expect(facNotes).toHaveLength(1);

    const list = await facA.get(`/api/assessments/${classroomId}/regrades`);
    expect(list.body.items).toHaveLength(1);
    const noScore = await facA.patch(`/api/assessments/regrades/${req.body.regrade.id}`, { status: 'adjusted', note: 'Fair point.' });
    expect(noScore.status).toBe(400);
    const ok = await facA.patch(`/api/assessments/regrades/${req.body.regrade.id}`, { status: 'adjusted', newScore: 1, note: 'Fair point, the prompt was ambiguous.' });
    expect(ok.status).toBe(200);
    expect(ok.body.regrade.status).toBe('adjusted');
    const [at] = await db.select().from(attempts).where(eq(attempts.id, attempt1));
    expect(at.score).toBe(17); // 16 + (2 - 2 AI-accepted) ... recomputed: short_text 2, tf 1
    const stuNotes = await db.select().from(notifications).where(and(eq(notifications.userId, student1.userId), eq(notifications.type, 'assessment.regrade_resolved')));
    expect(stuNotes).toHaveLength(1);
    expect((await facA.patch(`/api/assessments/regrades/${req.body.regrade.id}`, { status: 'rejected', note: 'Changed my mind.' })).status).toBe(409);
  });

  it('re-running the grading job never duplicates results', async () => {
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(attemptAnswers).where(eq(attemptAnswers.attemptId, attempt1));
    await db.update(attempts).set({ status: 'submitted' }).where(eq(attempts.id, attempt1)); // simulate a retried job
    await gradeAttempt(attempt1);
    await gradeAttempt(attempt1);
    await recomputeAttempt(attempt1);
    await releaseAttempt(attempt1);
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(attemptAnswers).where(eq(attemptAnswers.attemptId, attempt1));
    expect(after[0].n).toBe(before[0].n);
    const ev = await db.select().from(skillEvidence).where(and(eq(skillEvidence.userId, student1.userId), eq(skillEvidence.sourceId, attempt1)));
    expect(ev).toHaveLength(1);
    const [at] = await db.select().from(attempts).where(eq(attempts.id, attempt1));
    expect(at.score).toBe(17); // human scores preserved
    const summaries = await attemptSummaries(classroomId);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].userId).toBe(student1.userId);
  });

  it('reports results and exports CSV to managers only', async () => {
    const r = await facA.get(`/api/assessments/${classroomId}/results`);
    expect(r.status).toBe(200);
    expect(r.body.summary.submitted).toBe(1);
    expect(r.body.histogram).toHaveLength(10);
    expect(r.body.perQuestion.length).toBe(8);
    expect(r.body.candidates[0].name).toBe('Stu One');
    const csv = await facA.get(`/api/assessments/${classroomId}/results.csv`);
    expect(csv.status).toBe(200);
    expect(String(csv.body)).toContain('"Stu One"');
    expect((await student1.get(`/api/assessments/${classroomId}/results`)).status).toBe(403);
  });
});

describe('deadlines and accommodations', () => {
  it('extends the deadline with extra time and rejects saves after it', async () => {
    const a = await facA.post('/api/assessments', { title: 'Timed quiz', mode: 'classroom', settings: { timeLimitMinutes: 10, resultRelease: 'manual', maxAttempts: 1 } });
    const id = a.body.assessment.id;
    await facA.put(`/api/assessments/${id}/items`, { items: [{ questionId: qid.single }] });
    await facA.post(`/api/assessments/${id}/publish`);
    const inv = await facA.post(`/api/assessments/${id}/invites`, { userIds: [student2.userId], accommodations: { extraTimePercent: 50 } });
    expect(inv.body.invited).toBe(1);
    const ov = await student2.get(`/api/assessments/${id}/overview`);
    expect(ov.body.assessment.effectiveTimeLimitMinutes).toBe(15);
    const st = await student2.post(`/api/assessments/${id}/attempts`);
    const ms = new Date(st.body.attempt.deadlineAt).getTime() - Date.now();
    expect(ms).toBeGreaterThan(14 * 60_000);
    expect(ms).toBeLessThanOrEqual(15 * 60_000);
    const at = st.body.attempt.id;
    expect((await student2.put(`/api/assessments/attempts/${at}/answers/${qid.single}`, { answer: { choice: 'b' } })).status).toBe(200);

    await db.update(attempts).set({ deadlineAt: new Date(Date.now() - 60_000) }).where(eq(attempts.id, at));
    const late = await student2.put(`/api/assessments/attempts/${at}/answers/${qid.single}`, { answer: { choice: 'a' } });
    expect(late.status).toBe(409);
    expect(late.body.error.details.code).toBe('deadline_passed');
    const [row] = await db.select().from(attempts).where(eq(attempts.id, at));
    expect(row.status).not.toBe('in_progress');
    expect(row.autoSubmitted).toBe(true);
    // Max attempts enforced.
    expect((await student2.post(`/api/assessments/${id}/attempts`)).status).toBe(409);
    await drainJobs();
    const [ans] = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, at));
    expect(ans.finalScore).toBe(2); // the answer saved before the deadline counts
  });
});

describe('background auto-submit', () => {
  it('submits an abandoned attempt after its deadline and grades it', async () => {
    const a = await facA.post('/api/assessments', { title: 'Abandoned quiz', mode: 'classroom', settings: { timeLimitMinutes: 5, resultRelease: 'immediate' } });
    const id = a.body.assessment.id;
    await facA.put(`/api/assessments/${id}/items`, { items: [{ questionId: qid.single }] });
    await facA.post(`/api/assessments/${id}/publish`);
    await facA.post(`/api/assessments/${id}/invites`, { userIds: [student1.userId] });
    const st = await student1.post(`/api/assessments/${id}/attempts`);
    await student1.put(`/api/assessments/attempts/${st.body.attempt.id}/answers/${qid.single}`, { answer: { choice: 'b' } });
    await db.update(attempts).set({ deadlineAt: new Date(Date.now() - 60_000) }).where(eq(attempts.id, st.body.attempt.id));
    const { enqueue } = await import('../server/jobs/queue');
    await enqueue('assessments.autosubmit', { attemptId: st.body.attempt.id }, { idempotencyKey: `test-autosubmit:${st.body.attempt.id}` });
    await drainJobs();
    const [row] = await db.select().from(attempts).where(eq(attempts.id, st.body.attempt.id));
    expect(row.autoSubmitted).toBe(true);
    expect(row.status).toBe('released');
    expect(row.score).toBe(2);
  });
});

describe('tenant isolation and access', () => {
  it('keeps org B managers out of org A records', async () => {
    const [ans] = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attempt1));
    expect((await facB.get(`/api/assessments/${classroomId}`)).status).toBe(404);
    expect((await facB.patch(`/api/assessments/${classroomId}`, { title: 'Hacked' })).status).toBe(404);
    expect((await facB.get(`/api/assessments/${classroomId}/results`)).status).toBe(404);
    expect((await facB.get(`/api/assessments/${classroomId}/results.csv`)).status).toBe(404);
    expect((await facB.get(`/api/assessments/${classroomId}/grading-queue`)).status).toBe(404);
    expect((await facB.post(`/api/assessments/${classroomId}/publish`)).status).toBe(404);
    expect((await facB.get(`/api/assessments/questions/${qid.single}`)).status).toBe(404);
    expect((await facB.patch(`/api/assessments/questions/${qid.single}`, { title: 'x' })).status).toBe(404);
    expect((await facB.get(`/api/assessments/attempts/${attempt1}/review`)).status).toBe(404);
    expect((await facB.patch(`/api/assessments/answers/${ans.id}`, { manualScore: 0, reason: 'nope' })).status).toBe(404);
    expect((await facB.post(`/api/assessments/answers/${ans.id}/ai-proposal`)).status).toBe(404);
    const list = await facB.get('/api/assessments/manage');
    expect(list.body.items.some((i: any) => i.id === classroomId)).toBe(false);
    const qs = await facB.get('/api/assessments/questions');
    expect(qs.body.total).toBe(0);
    // A student of org A is a member but not a manager: 403.
    expect((await student1.get(`/api/assessments/${classroomId}`)).status).toBe(403);
    // Cannot target another org's cohort.
    expect((await facB.post('/api/assessments', { title: 'Steal cohort', mode: 'classroom', cohortId })).status).toBe(400);
  });

  it('only invited users can take a recruitment assessment; interviewers view only', async () => {
    const a = await recruiter.post('/api/assessments', { title: 'Backend screen', mode: 'recruitment', settings: { resultRelease: 'manual' } });
    expect(a.status).toBe(201);
    const id = a.body.assessment.id;
    const q = await recruiter.post('/api/assessments/questions', Q.single);
    await recruiter.put(`/api/assessments/${id}/items`, { items: [{ questionId: q.body.question.id }] });
    expect((await recruiter.post(`/api/assessments/${id}/publish`)).status).toBe(200);
    // Faculty cannot create recruitment assessments.
    expect((await facA.post('/api/assessments', { title: 'Nope', mode: 'recruitment' })).status).toBe(403);

    expect((await outsider.post(`/api/assessments/${id}/attempts`)).status).toBe(404);
    expect((await outsider.get(`/api/assessments/${id}/overview`)).status).toBe(404);
    const inv = await recruiter.post(`/api/assessments/${id}/invites`, { emails: ['cand@example.test', 'nobody@example.test'] });
    expect(inv.body.invited).toBe(1);
    expect(inv.body.unknownEmails).toEqual(['nobody@example.test']);
    const st = await candidate.post(`/api/assessments/${id}/attempts`);
    expect(st.status).toBe(201);
    const invNote = await db.select().from(notifications).where(and(eq(notifications.userId, candidate.userId), eq(notifications.type, 'assessment.invited')));
    expect(invNote).toHaveLength(1);

    expect((await interviewer.get(`/api/assessments/${id}/results`)).status).toBe(200);
    expect((await interviewer.patch(`/api/assessments/${id}`, { title: 'x' })).status).toBe(403);
    expect((await interviewer.get(`/api/assessments/${id}/grading-queue`)).status).toBe(403);
  });
  it('refuses to link an assessment to another organization\'s job posting or placement drive', async () => {
    const { jobPostings, placementDrives } = await import('../server/db/schema');
    const [foreignJob] = await db.insert(jobPostings).values({ orgId: orgA, createdBy: facA.userId, title: 'Foreign job', location: 'X', description: 'x' }).returning();
    const [foreignDrive] = await db.insert(placementDrives).values({ orgId: orgB, companyName: 'X', title: 'Drive', roleTitle: 'SDE', createdBy: facB.userId }).returning();
    const viaJob = await recruiter.post('/api/assessments', { title: 'Steal', mode: 'recruitment', jobPostingId: foreignJob.id });
    expect(viaJob.status).toBe(400);
    expect(viaJob.body.error.details.fields.jobPostingId).toBeTruthy();
    const viaDrive = await recruiter.post('/api/assessments', { title: 'Steal', mode: 'recruitment', driveId: foreignDrive.id });
    expect(viaDrive.status).toBe(400);
    const ok = await recruiter.post('/api/assessments', { title: 'Mine', mode: 'recruitment' });
    const patched = await recruiter.patch(`/api/assessments/${ok.body.assessment.id}`, { jobPostingId: foreignJob.id });
    expect(patched.status).toBe(400);
  });
});

describe('personal practice and public library', () => {
  it('lets a learner generate private practice from the public bank', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await admin.post('/api/assessments/questions', { ...Q.single, title: `Public ${i}`, topics: ['loops'], public: true });
      expect(r.status).toBe(201);
    }
    expect((await facA.post('/api/assessments/questions', { ...Q.single, public: true })).status).toBe(403);
    const g = await outsider.post('/api/assessments/practice/generate', { topic: 'loops', count: 3 });
    expect(g.status).toBe(201);
    expect(g.body.assessment.itemCount).toBe(3);
    const id = g.body.assessment.id;
    expect((await student1.get(`/api/assessments/${id}/overview`)).status).toBe(404);
    expect((await student1.post(`/api/assessments/${id}/attempts`)).status).toBe(404);
    const st = await outsider.post(`/api/assessments/${id}/attempts`);
    expect(st.status).toBe(201);
    const view = await outsider.get(`/api/assessments/attempts/${st.body.attempt.id}`);
    for (const it of view.body.items) await outsider.put(`/api/assessments/attempts/${st.body.attempt.id}/answers/${it.question.id}`, { answer: { choice: 'b' } });
    await outsider.post(`/api/assessments/attempts/${st.body.attempt.id}/submit`, {});
    await drainJobs();
    const res = await outsider.get(`/api/assessments/attempts/${st.body.attempt.id}/result`);
    expect(res.body.released).toBe(true);
    expect(res.body.percent).toBe(100);
    const hist = await outsider.get('/api/assessments/my/attempts');
    expect(hist.body.total).toBe(1);
  });

  it('seeds public diagnostics idempotently from the library', async () => {
    const { seedReference } = await import('../server/db/seed/reference');
    const { seedDiagnostics } = await import('../server/db/seed/diagnostics');
    await seedReference();
    await seedDiagnostics();
    const rows = await db.select().from(assessments).where(sql`${assessments.settings}->>'seedKey' is not null`);
    expect(rows.length).toBe(4);
    expect(rows.every((r) => r.status === 'published' && r.orgId === null)).toBe(true);
    const avail = await outsider.get('/api/assessments/available?mode=diagnostic');
    expect(avail.body.items.length).toBe(3);
    expect(avail.body.items.every((i: any) => i.itemCount >= 8)).toBe(true);
    // Platform admins manage public content; faculty cannot.
    expect((await facA.get(`/api/assessments/${rows[0].id}`)).status).toBe(404);
    expect((await admin.get(`/api/assessments/${rows[0].id}`)).status).toBe(200);
  }, 120_000);

  it('demo seed builds a recruitment screen and a diagnostic graded by the real pipeline', async () => {
    const { seed } = await import('../server/db/seed/demo/assessments');
    const { resetRateLimits } = await import('../server/lib/ratelimit');
    resetRateLimits(); // registration is rate limited per IP
    const helix = await org('Helix Demo', 'company');
    const rec = await registerUser(ctx.app, 'Demo Recruiter', 'demo-rec@example.test');
    const stu = await registerUser(ctx.app, 'Demo Student', 'demo-stu@example.test');
    const lea = await registerUser(ctx.app, 'Demo Learner', 'demo-lea@example.test');
    const users = { recruiter: rec.userId, student: stu.userId, learner: lea.userId } as any;
    await seed({ password: 'x', orgs: { helix } as any, users });
    await seed({ password: 'x', orgs: { helix } as any, users }); // idempotent
    const screens = await db.select().from(assessments).where(eq(assessments.orgId, helix));
    expect(screens).toHaveLength(1);
    expect(screens[0].mode).toBe('recruitment');
    const [at] = await db.select().from(attempts).where(eq(attempts.userId, stu.userId));
    expect(at.status).toBe('released');
    expect(at.score).toBeGreaterThan(0);
    const ev = await db.select().from(skillEvidence).where(and(eq(skillEvidence.userId, stu.userId), eq(skillEvidence.sourceId, at.id)));
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.every((e) => e.verified)).toBe(true);
    const inv = await lea.get('/api/assessments/available');
    expect(inv.body.items.some((i: any) => i.source === 'invited' && i.mode === 'recruitment')).toBe(true);
  }, 60_000);
});
