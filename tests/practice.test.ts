import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupTestApp, registerUser, client } from './helpers';
import { seedReference } from '../server/db/seed/reference';
import { db } from '../server/db/client';
import { activityEvents, auditLogs, users } from '../server/db/schema';
import { basicProblems } from '../server/db/seed/content/problems/basics';
import { sqlProblems } from '../server/db/seed/content/problems/sql';
import { shutdownExecPool } from '../server/exec/pool';
import { configureExec, resetExecConfig } from '../server/exec/runner';
import { resetRateLimits } from '../server/lib/ratelimit';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
  await seedReference();
});
afterAll(async () => {
  await shutdownExecPool();
  await ctx.close();
});
afterEach(() => resetExecConfig());
// Registration is rate limited per IP; each test starts with fresh limits.
beforeEach(() => resetRateLimits());

const SUM = basicProblems.find((p) => p.slug === 'sum-two-numbers')!;
const SUM_JS = SUM.solutions!.javascript!;
const WRONG_JS = "const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split('\\n').map(Number);\nconsole.log(a > 0 ? a + b : a - b);\n";
const SQL = sqlProblems.find((p) => p.slug === 'sql-top-four-salaries')!;

describe('CodeLab problem list', () => {
  it('requires sign-in', async () => {
    const anon = client(ctx.app);
    expect((await anon.get('/api/practice/problems')).status).toBe(401);
    expect((await anon.post('/api/practice/problems/sum-two-numbers/run', { language: 'javascript', code: SUM_JS })).status).toBe(401);
  });

  it('lists, filters and paginates problems with counts and collections', async () => {
    const c = await registerUser(ctx.app, 'List Viewer', 'list@example.test');
    const all = await c.get('/api/practice/problems?pageSize=10');
    expect(all.status).toBe(200);
    expect(all.body.items).toHaveLength(10);
    expect(all.body.total).toBeGreaterThan(10);
    expect(all.body.counts.total).toBe(all.body.total);
    expect(all.body.items[0]).toMatchObject({ solved: false, attempted: false });
    expect(JSON.stringify(all.body)).not.toContain('hiddenTests');

    const sql = await c.get('/api/practice/problems?type=sql&pageSize=100');
    expect(sql.body.items.length).toBeGreaterThan(0);
    expect(sql.body.items.every((p: any) => p.type === 'sql')).toBe(true);

    const easy = await c.get('/api/practice/problems?difficulty=easy&q=sum');
    expect(easy.body.items.some((p: any) => p.slug === 'sum-two-numbers')).toBe(true);
    expect(easy.body.items.every((p: any) => p.difficulty === 'easy')).toBe(true);

    const bySkill = await c.get('/api/practice/problems?skill=programming-basics');
    expect(bySkill.body.items.some((p: any) => p.slug === 'sum-two-numbers')).toBe(true);

    const page2 = await c.get('/api/practice/problems?pageSize=10&page=2');
    expect(page2.body.items[0].id).not.toBe(all.body.items[0].id);

    const cols = await c.get('/api/practice/collections');
    expect(cols.status).toBe(200);
    const ids = cols.body.collections.map((x: any) => x.id);
    expect(ids).toContain('interview-essentials');
    expect(ids).toContain('sql-basics');
    const inSet = await c.get('/api/practice/problems?collection=sql-basics&pageSize=100');
    expect(inSet.body.items.length).toBe(cols.body.collections.find((x: any) => x.id === 'sql-basics').count);

    expect((await c.get('/api/practice/problems?difficulty=impossible')).status).toBe(400);
    expect((await c.get('/api/practice/problems?collection=nope')).status).toBe(400);
  });

  it('serves a problem without answer keys and reports runtimes', async () => {
    const c = await registerUser(ctx.app, 'Detail Viewer', 'detail@example.test');
    const r = await c.get('/api/practice/problems/sum-two-numbers');
    expect(r.status).toBe(200);
    expect(r.body.problem.content.visibleTests).toHaveLength(2);
    const raw = JSON.stringify(r.body);
    for (const t of SUM.hiddenTests!) expect(raw).not.toContain(JSON.stringify(t.input).slice(1, -1));
    expect(raw).not.toContain('modelAnswer');
    expect(r.body.state).toMatchObject({ solved: false, hintsRevealed: 0, solutionAvailable: false });
    const sql = await c.get(`/api/practice/problems/${SQL.slug}`);
    expect(sql.body.problem.content.schemaSql).toContain('CREATE TABLE');
    expect(JSON.stringify(sql.body)).not.toContain('INSERT INTO');
    expect((await c.get('/api/practice/problems/does-not-exist')).status).toBe(404);

    const rt = await c.get('/api/practice/runtimes');
    expect(rt.body.runtimes.find((x: any) => x.language === 'javascript')).toMatchObject({ available: true, provider: 'quickjs' });
    expect(rt.body.runtimes.find((x: any) => x.language === 'sql')).toMatchObject({ available: true, provider: 'pglite' });
  });
});

describe('running and submitting code', () => {
  it('runs visible tests and custom input, and autosaves drafts', async () => {
    const c = await registerUser(ctx.app, 'Runner', 'runner@example.test');
    const run = await c.post('/api/practice/problems/sum-two-numbers/run', { language: 'javascript', code: SUM_JS });
    expect(run.status).toBe(200);
    expect(run.body.run).toMatchObject({ kind: 'run', provider: 'quickjs', status: 'accepted', passed: 2, total: 2 });

    const custom = await c.post('/api/practice/problems/sum-two-numbers/run', { language: 'javascript', code: SUM_JS, customInput: '40\n2\n' });
    expect(custom.body.run.custom).toBe(true);
    expect(custom.body.run.results[0].actual).toBe('42\n');
    expect(custom.body.run.results[0]).not.toHaveProperty('expected');

    const draft = await c.put('/api/practice/problems/sum-two-numbers/draft', { language: 'typescript', code: 'const x: number = 1;' });
    expect(draft.status).toBe(200);
    const detail = await c.get('/api/practice/problems/sum-two-numbers');
    expect(detail.body.state.drafts.typescript.code).toBe('const x: number = 1;');
    expect(detail.body.state.attempted).toBe(true);
    expect((await c.put('/api/practice/problems/sum-two-numbers/draft', { language: 'cobol', code: 'x' })).status).toBe(400);
    expect((await c.put('/api/practice/problems/sum-two-numbers/draft', { language: 'sql', code: 'select 1' })).status).toBe(400);

    // Runs never create evidence or XP.
    const skill = await c.get('/api/learning/skills/programming-basics');
    expect(skill.body.evidence.filter((e: any) => e.source === 'practice')).toHaveLength(0);
  });

  it('accepts a correct submission once: verified evidence and XP only on first acceptance', async () => {
    const c = await registerUser(ctx.app, 'Solver', 'solver@example.test');
    const sub = await c.post('/api/practice/problems/sum-two-numbers/submit', { language: 'javascript', code: SUM_JS });
    expect(sub.status).toBe(200);
    expect(sub.body.submission.status).toBe('accepted');
    expect(sub.body.submission.total).toBe(SUM.visibleTests!.length + SUM.hiddenTests!.length);
    expect(sub.body.firstSolve).toBe(true);
    expect(sub.body.xpAwarded).toBe(25);
    expect(sub.body.evidence.skills.map((s: any) => s.slug)).toContain('programming-basics');

    const skill = await c.get('/api/learning/skills/programming-basics');
    const ev = skill.body.evidence.find((e: any) => e.source === 'practice');
    expect(ev).toMatchObject({ verified: true, score: 1, sourceType: 'code_submission' });

    const again = await c.post('/api/practice/problems/sum-two-numbers/submit', { language: 'javascript', code: SUM_JS });
    expect(again.body.firstSolve).toBe(false);
    expect(again.body.xpAwarded).toBe(0);
    const xpRows = await db.select().from(activityEvents).where(and(eq(activityEvents.userId, c.userId), eq(activityEvents.kind, 'problem.solved')));
    expect(xpRows).toHaveLength(1);

    // A later weaker submission never lowers the best evidence.
    const worse = await c.post('/api/practice/problems/sum-two-numbers/submit', { language: 'javascript', code: WRONG_JS });
    expect(worse.body.submission.status).toBe('wrong_answer');
    const after = await c.get('/api/learning/skills/programming-basics');
    expect(after.body.evidence.find((e: any) => e.source === 'practice').score).toBe(1);

    const list = await c.get('/api/practice/problems?status=solved');
    expect(list.body.items.map((p: any) => p.slug)).toContain('sum-two-numbers');
    expect(list.body.counts.solved).toBe(1);
  });

  it('records partial credit for a wrong submission and never leaks hidden test details', async () => {
    const c = await registerUser(ctx.app, 'Partial', 'partial@example.test');
    const sub = await c.post('/api/practice/problems/sum-two-numbers/submit', { language: 'javascript', code: WRONG_JS });
    expect(sub.body.submission.status).toBe('wrong_answer');
    expect(sub.body.firstSolve).toBe(false);
    const hidden = sub.body.submission.results.filter((r: any) => r.hidden);
    expect(hidden.length).toBe(SUM.hiddenTests!.length);
    for (const h of hidden) {
      expect(Object.keys(h).sort()).toEqual(['hidden', 'name', 'passed', 'status', 'timeMs']);
      expect(h.name).toMatch(/^Hidden test \d+$/);
    }
    const raw = JSON.stringify(sub.body);
    for (const t of SUM.hiddenTests!) expect(raw).not.toContain(t.name);
    expect(raw).not.toContain('-15'); // expected output of a hidden test

    const stored = await c.get(`/api/practice/submissions/${sub.body.submission.id}`);
    expect(stored.status).toBe(200);
    expect(stored.body.submission.code).toBe(WRONG_JS);
    const storedRaw = JSON.stringify(stored.body);
    for (const t of SUM.hiddenTests!) expect(storedRaw).not.toContain(t.name);
    expect(storedRaw).not.toContain('_meta');

    const skill = await c.get('/api/learning/skills/programming-basics');
    const ev = skill.body.evidence.find((e: any) => e.source === 'practice');
    expect(ev.verified).toBe(true);
    expect(ev.score).toBeCloseTo(sub.body.submission.passed / sub.body.submission.total);

    const history = await c.get('/api/practice/problems/sum-two-numbers/submissions');
    expect(history.body.total).toBe(1);
    expect(history.body.items[0]).not.toHaveProperty('code');
  });

  it("keeps submissions private: another user gets 404", async () => {
    const owner = await registerUser(ctx.app, 'Owner', 'owner@example.test');
    const other = await registerUser(ctx.app, 'Other', 'other@example.test');
    const sub = await owner.post('/api/practice/problems/sum-two-numbers/submit', { language: 'javascript', code: SUM_JS });
    expect((await other.get(`/api/practice/submissions/${sub.body.submission.id}`)).status).toBe(404);
    expect((await other.get('/api/practice/problems/sum-two-numbers/submissions')).body.total).toBe(0);
    expect((await owner.get(`/api/practice/submissions/${sub.body.submission.id}`)).status).toBe(200);
  });

  it('judges SQL problems on a fresh database and shows only expected column names', async () => {
    const c = await registerUser(ctx.app, 'Query Writer', 'sql@example.test');
    const wrong = await c.post(`/api/practice/problems/${SQL.slug}/run`, { language: 'sql', code: 'SELECT name, salary FROM employees ORDER BY salary DESC LIMIT 4' });
    expect(wrong.status).toBe(200);
    expect(wrong.body.run.provider).toBe('pglite');
    expect(wrong.body.run.expectedColumns).toEqual(['name', 'salary']);
    expect(wrong.body.run.columns).toEqual(['name', 'salary']);
    expect(wrong.body.run).not.toHaveProperty('expectedRows');

    const ok = await c.post(`/api/practice/problems/${SQL.slug}/submit`, { language: 'sql', code: SQL.solutionSql });
    expect(ok.body.submission.status).toBe('accepted');
    expect(ok.body.firstSolve).toBe(true);
    expect((await c.post(`/api/practice/problems/${SQL.slug}/run`, { language: 'javascript', code: 'x' })).status).toBe(400);
  });

  it('reports unavailable languages honestly and records no evidence', async () => {
    configureExec({ docker: 'false', judge0: null });
    const c = await registerUser(ctx.app, 'Pythonista', 'py@example.test');
    const sub = await c.post('/api/practice/problems/sum-two-numbers/submit', { language: 'python', code: SUM.solutions!.python });
    expect(sub.status).toBe(200);
    expect(sub.body.submission).toMatchObject({ status: 'unavailable', provider: 'none', passed: 0 });
    expect(sub.body.evidence).toBeNull();
    expect(sub.body.firstSolve).toBe(false);
    const skill = await c.get('/api/learning/skills/programming-basics');
    expect(skill.body.evidence.filter((e: any) => e.source === 'practice')).toHaveLength(0);
  });
});

describe('hints, AI nudges and solutions', () => {
  it('reveals stored hints one at a time', async () => {
    const c = await registerUser(ctx.app, 'Hint Seeker', 'hints@example.test');
    const h1 = await c.post('/api/practice/problems/sum-two-numbers/hint');
    expect(h1.body).toMatchObject({ level: 1, hint: SUM.hints[0], hintCount: SUM.hints.length });
    const h2 = await c.post('/api/practice/problems/sum-two-numbers/hint');
    expect(h2.body.level).toBe(2);
    expect(h2.body.hints).toEqual(SUM.hints.slice(0, 2));
    const detail = await c.get('/api/practice/problems/sum-two-numbers');
    expect(detail.body.problem.content.hints).toEqual(SUM.hints.slice(0, 2));
    expect(detail.body.state.hintsRevealed).toBe(2);
    for (let i = 2; i < SUM.hints.length; i++) await c.post('/api/practice/problems/sum-two-numbers/hint');
    expect((await c.post('/api/practice/problems/sum-two-numbers/hint')).status).toBe(409);
  });

  it('returns not_configured for AI hints without failing', async () => {
    const c = await registerUser(ctx.app, 'AI Asker', 'ai@example.test');
    const r = await c.post('/api/practice/problems/sum-two-numbers/ai-hint', { code: 'print(1)', language: 'python' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: false, reason: 'not_configured' });
    expect(r.body.message).toBeTruthy();
    const est = await c.post('/api/practice/problems/sum-two-numbers/ai-complexity', { code: 'print(1)', language: 'python' });
    expect(est.body.ok).toBe(false);
  });

  it('gates the solution until solved or given up, and notes it in later evidence', async () => {
    const c = await registerUser(ctx.app, 'Giver Upper', 'giveup@example.test');
    expect((await c.get('/api/practice/problems/even-or-odd/solution')).status).toBe(403);
    const gu = await c.post('/api/practice/problems/even-or-odd/give-up');
    expect(gu.status).toBe(200);
    const sol = await c.get('/api/practice/problems/even-or-odd/solution');
    expect(sol.status).toBe(200);
    expect(sol.body.unlockedBy).toBe('gave_up');
    expect(sol.body.solution.reference.map((r: any) => r.language)).toContain('python');
    expect(sol.body.solution.explanation).toBeTruthy();

    const even = basicProblems.find((p) => p.slug === 'even-or-odd')!;
    const sub = await c.post('/api/practice/problems/even-or-odd/submit', { language: 'javascript', code: even.solutions!.javascript });
    expect(sub.body.firstSolve).toBe(true);
    const skill = await c.get('/api/learning/skills/control-flow');
    expect(skill.body.evidence.find((e: any) => e.source === 'practice').note).toMatch(/after viewing the reference solution/);

    const solver = await registerUser(ctx.app, 'Real Solver', 'realsolver@example.test');
    await solver.post('/api/practice/problems/even-or-odd/submit', { language: 'javascript', code: even.solutions!.javascript });
    expect((await solver.get('/api/practice/problems/even-or-odd/solution')).body.unlockedBy).toBe('solved');
  });
});

describe('admin runtimes', () => {
  it('is limited to platform admins and audits image pulls', async () => {
    const c = await registerUser(ctx.app, 'Not Admin', 'notadmin@example.test');
    expect((await c.get('/api/practice/admin/runtimes')).status).toBe(403);
    expect((await c.post('/api/practice/admin/runtimes/python/pull')).status).toBe(403);

    const admin = await registerUser(ctx.app, 'Platform Admin', 'padmin@example.test');
    await db.update(users).set({ platformRole: 'platform_admin' }).where(eq(users.id, admin.userId));
    const st = await admin.get('/api/practice/admin/runtimes');
    expect(st.status).toBe(200);
    expect(st.body.runtimes.find((r: any) => r.language === 'python').image).toBe('python:3.13-alpine');
    const pull = await admin.post('/api/practice/admin/runtimes/python/pull');
    expect(pull.status).toBe(202);
    expect(pull.body.job.type).toBe('exec.pull_image');
    const again = await admin.post('/api/practice/admin/runtimes/python/pull');
    expect(again.body.job.id).toBe(pull.body.job.id);
    expect((await admin.post('/api/practice/admin/runtimes/sql/pull')).status).toBe(400);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'exec.runtime_pull_requested'));
    expect(logs).toHaveLength(1);
  });
});
