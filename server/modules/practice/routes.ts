import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, count } from 'drizzle-orm';
import { db } from '../../db/client';
import { questions, skills, codeRuns, hintReveals, practiceDrafts, practiceProgress, backgroundJobs } from '../../db/schema';
import { type AppEnv, requireAuth, requirePlatformAdmin } from '../../lib/context';
import { body, query, pageQuery } from '../../lib/validate';
import { badRequest, forbidden, notFound, conflict } from '../../lib/errors';
import { rateLimit } from '../../lib/ratelimit';
import { publicQuestion } from '../../lib/grading';
import { audit } from '../../lib/audit';
import { enqueue } from '../../jobs/queue';
import { aiComplete } from '../../ai/service';
import { runtimes, runtimeAdminStatus, dockerImageFor, MAX_CODE_BYTES } from '../../exec/runner';
import { ALL_PROBLEMS } from '../../db/seed/content/problems';
import { COLLECTIONS, inCollection } from './collections';
import { executeAndRecord, findProblem, languagesOf, practiceVisibility, saveDraft, splitStoredResults, statedComplexity, type QuestionRow } from './service';

/** Mounted at /api/practice. CodeLab: practice problems, sandboxed runs, submissions, hints. */
export const practiceRoutes = new Hono<AppEnv>();

const orgIdsOf = (auth: ReturnType<typeof requireAuth>) => auth.memberships.map((m) => m.orgId);
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
const codeSchema = z.string().max(MAX_CODE_BYTES, 'Code is larger than 64 KB.');
const languageSchema = z.enum(['python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'go', 'rust', 'sql']);

async function loadProblem(c: Parameters<typeof requireAuth>[0], param = 'id') {
  const auth = requireAuth(c);
  const key = c.req.param(param) ?? '';
  if (!key || key.length > 200) throw notFound('Problem');
  const q = await findProblem(key, orgIdsOf(auth));
  if (!q) throw notFound('Problem');
  return { auth, q };
}

function checkLanguage(q: QuestionRow, language: string) {
  if (!languagesOf(q).includes(language)) throw badRequest(`This problem does not accept ${language}.`, { fields: { language: 'Pick one of the languages listed for this problem.' } });
}

async function skillMap() {
  const rows = await db.select({ id: skills.id, slug: skills.slug, name: skills.name }).from(skills);
  return new Map(rows.map((r) => [r.id, r]));
}

async function progressFor(userId: string, questionId: string) {
  const [p] = await db.select().from(practiceProgress).where(and(eq(practiceProgress.userId, userId), eq(practiceProgress.questionId, questionId)));
  return p ?? null;
}

async function hintsRevealed(userId: string, questionId: string) {
  const [r] = await db
    .select({ n: sql<number>`coalesce(max(${hintReveals.level}), 0)::int` })
    .from(hintReveals)
    .where(and(eq(hintReveals.userId, userId), eq(hintReveals.questionId, questionId)));
  return r?.n ?? 0;
}

// ---------- Problem list & collections ----------

const DIFFICULTY_ORDER = sql`case ${questions.difficulty} when 'easy' then 1 when 'medium' then 2 when 'hard' then 3 else 4 end`;

/** Lightweight rows used to compute collection membership. */
async function membershipRows(orgIds: string[], userId: string) {
  const sm = await skillMap();
  const rows = await db
    .select({ id: questions.id, type: questions.type, difficulty: questions.difficulty, topics: questions.topics, skillIds: questions.skillIds, solvedAt: practiceProgress.solvedAt })
    .from(questions)
    .leftJoin(practiceProgress, and(eq(practiceProgress.questionId, questions.id), eq(practiceProgress.userId, userId)))
    .where(practiceVisibility(orgIds));
  return rows.map((r) => ({ ...r, skillSlugs: r.skillIds.map((id) => sm.get(id)?.slug).filter(Boolean) as string[] }));
}

practiceRoutes.get('/problems', async (c) => {
  const auth = requireAuth(c);
  const uid = auth.user.id;
  const orgIds = orgIdsOf(auth);
  const f = query(
    c,
    pageQuery.extend({
      difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
      type: z.enum(['coding', 'sql']).optional(),
      topic: z.string().trim().max(60).optional(),
      skill: z.string().trim().max(80).optional(),
      status: z.enum(['solved', 'attempted', 'new']).optional(),
      collection: z.string().trim().max(60).optional(),
    }),
  );

  let collectionIds: string[] | null = null;
  if (f.collection) {
    const def = COLLECTIONS.find((d) => d.id === f.collection);
    if (!def) throw badRequest('Unknown collection.', { fields: { collection: 'Pick a collection from the list.' } });
    collectionIds = (await membershipRows(orgIds, uid)).filter((r) => inCollection(def, r)).map((r) => r.id);
  }
  let skillId: string | null = null;
  if (f.skill) {
    const [s] = await db.select({ id: skills.id }).from(skills).where(eq(skills.slug, f.skill));
    if (!s) return c.json({ items: [], total: 0, page: f.page, pageSize: f.pageSize, counts: await countsFor(orgIds, uid) });
    skillId = s.id;
  }

  const where = and(
    practiceVisibility(orgIds),
    f.difficulty ? eq(questions.difficulty, f.difficulty) : undefined,
    f.type ? eq(questions.type, f.type) : undefined,
    f.topic ? sql`${f.topic} = any(${questions.topics})` : undefined,
    skillId ? sql`${skillId}::uuid = any(${questions.skillIds})` : undefined,
    f.q ? sql`(${questions.title} ilike ${'%' + escapeLike(f.q) + '%'} or array_to_string(${questions.topics}, ' ') ilike ${'%' + escapeLike(f.q) + '%'})` : undefined,
    f.status === 'solved' ? isNotNull(practiceProgress.solvedAt) : undefined,
    f.status === 'attempted' ? and(isNotNull(practiceProgress.id), isNull(practiceProgress.solvedAt)) : undefined,
    f.status === 'new' ? isNull(practiceProgress.id) : undefined,
    collectionIds ? (collectionIds.length ? inArray(questions.id, collectionIds) : sql`false`) : undefined,
  );
  const join = and(eq(practiceProgress.questionId, questions.id), eq(practiceProgress.userId, uid));

  const [{ total }] = await db.select({ total: count() }).from(questions).leftJoin(practiceProgress, join).where(where);
  const rows = await db
    .select({
      id: questions.id,
      slug: questions.slug,
      title: questions.title,
      type: questions.type,
      difficulty: questions.difficulty,
      topics: questions.topics,
      skillIds: questions.skillIds,
      points: questions.points,
      solvedAt: practiceProgress.solvedAt,
      progressId: practiceProgress.id,
      bestScore: practiceProgress.bestScore,
    })
    .from(questions)
    .leftJoin(practiceProgress, join)
    .where(where)
    .orderBy(DIFFICULTY_ORDER, asc(questions.title))
    .limit(f.pageSize)
    .offset((f.page - 1) * f.pageSize);
  const sm = await skillMap();
  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      type: r.type,
      difficulty: r.difficulty,
      topics: r.topics,
      points: r.points,
      skills: r.skillIds.map((id) => sm.get(id)).filter(Boolean),
      solved: !!r.solvedAt,
      attempted: !!r.progressId && !r.solvedAt,
      bestScore: r.progressId ? r.bestScore : null,
    })),
    total,
    page: f.page,
    pageSize: f.pageSize,
    counts: await countsFor(orgIds, uid),
  });
});

async function countsFor(orgIds: string[], uid: string) {
  const rows = await db
    .select({ difficulty: questions.difficulty, total: count(), solved: count(practiceProgress.solvedAt), attempted: count(practiceProgress.id) })
    .from(questions)
    .leftJoin(practiceProgress, and(eq(practiceProgress.questionId, questions.id), eq(practiceProgress.userId, uid)))
    .where(practiceVisibility(orgIds))
    .groupBy(questions.difficulty);
  const byDifficulty: Record<string, { total: number; solved: number }> = {};
  let total = 0;
  let solved = 0;
  let attempted = 0;
  for (const r of rows) {
    byDifficulty[r.difficulty] = { total: r.total, solved: r.solved };
    total += r.total;
    solved += r.solved;
    attempted += r.attempted - r.solved;
  }
  return { total, solved, attempted, byDifficulty };
}

practiceRoutes.get('/collections', async (c) => {
  const auth = requireAuth(c);
  const rows = await membershipRows(orgIdsOf(auth), auth.user.id);
  const collections = COLLECTIONS.map((d) => {
    const members = rows.filter((r) => inCollection(d, r));
    return { id: d.id, title: d.title, description: d.description, type: d.type ?? null, count: members.length, solved: members.filter((m) => m.solvedAt).length };
  }).filter((d) => d.count > 0);
  return c.json({ collections });
});

practiceRoutes.get('/runtimes', async (c) => {
  requireAuth(c);
  return c.json({ runtimes: await runtimes() });
});

// ---------- One problem ----------

practiceRoutes.get('/problems/:id', async (c) => {
  const { auth, q } = await loadProblem(c);
  const uid = auth.user.id;
  const [progress, revealed, drafts, sm] = await Promise.all([
    progressFor(uid, q.id),
    hintsRevealed(uid, q.id),
    db.select().from(practiceDrafts).where(and(eq(practiceDrafts.userId, uid), eq(practiceDrafts.questionId, q.id))),
    skillMap(),
  ]);
  const pub = publicQuestion(q, { revealHints: revealed });
  return c.json({
    problem: { ...pub, slug: q.slug, source: q.source, content: { ...pub.content, languages: languagesOf(q) } },
    skills: q.skillIds.map((id) => sm.get(id)).filter(Boolean),
    state: {
      solved: !!progress?.solvedAt,
      solvedAt: progress?.solvedAt ?? null,
      attempted: !!progress && !progress.solvedAt,
      gaveUp: !!progress?.gaveUpAt,
      bestScore: progress?.bestScore ?? null,
      lastLanguage: progress?.lastLanguage ?? null,
      hintsRevealed: revealed,
      hintCount: q.content.hints?.length ?? 0,
      solutionAvailable: !!(progress?.solvedAt || progress?.gaveUpAt),
      drafts: Object.fromEntries(drafts.map((d) => [d.language, { code: d.code, updatedAt: d.updatedAt }])),
    },
  });
});

practiceRoutes.put('/problems/:id/draft', async (c) => {
  const { auth, q } = await loadProblem(c);
  const input = await body(c, z.object({ language: languageSchema, code: codeSchema }));
  checkLanguage(q, input.language);
  rateLimit(`practice:draft:${auth.user.id}`, 120, 60_000);
  const draft = await saveDraft(auth.user.id, q.id, input.language, input.code);
  return c.json({ draft });
});

practiceRoutes.post('/problems/:id/run', async (c) => {
  const { auth, q } = await loadProblem(c);
  const input = await body(c, z.object({ language: languageSchema, code: codeSchema, customInput: z.string().max(256 * 1024, 'Custom input is larger than 256 KB.').optional() }));
  checkLanguage(q, input.language);
  if (input.customInput !== undefined && q.type === 'sql') throw badRequest('SQL problems do not take custom input.');
  if (q.type !== 'sql' && input.customInput === undefined && !q.content.visibleTests?.length) throw badRequest('This problem has no sample tests. Use custom input or submit.');
  rateLimit(`practice:run:${auth.user.id}`, 30, 60_000);
  const out = await executeAndRecord({ userId: auth.user.id, question: q, language: input.language, code: input.code, kind: 'run', customInput: input.customInput });
  return c.json({ run: out.run });
});

practiceRoutes.post('/problems/:id/submit', async (c) => {
  const { auth, q } = await loadProblem(c);
  const input = await body(c, z.object({ language: languageSchema, code: codeSchema }));
  checkLanguage(q, input.language);
  if (!input.code.trim()) throw badRequest('Write some code before submitting.', { fields: { code: 'Write some code first.' } });
  rateLimit(`practice:submit:${auth.user.id}`, 12, 60_000);
  const out = await executeAndRecord({ userId: auth.user.id, question: q, language: input.language, code: input.code, kind: 'submit' });
  return c.json({ submission: out.run, firstSolve: out.firstSolve, xpAwarded: out.xpAwarded, evidence: out.evidence });
});

practiceRoutes.get('/problems/:id/submissions', async (c) => {
  const { auth, q } = await loadProblem(c);
  const f = query(c, pageQuery.extend({ kind: z.enum(['run', 'submit', 'all']).default('submit') }));
  const where = and(eq(codeRuns.userId, auth.user.id), eq(codeRuns.questionId, q.id), isNull(codeRuns.attemptId), f.kind === 'all' ? undefined : eq(codeRuns.kind, f.kind));
  const [{ total }] = await db.select({ total: count() }).from(codeRuns).where(where);
  const items = await db
    .select({ id: codeRuns.id, kind: codeRuns.kind, language: codeRuns.language, status: codeRuns.status, provider: codeRuns.provider, passed: codeRuns.passed, total: codeRuns.total, durationMs: codeRuns.durationMs, createdAt: codeRuns.createdAt })
    .from(codeRuns)
    .where(where)
    .orderBy(desc(codeRuns.createdAt))
    .limit(f.pageSize)
    .offset((f.page - 1) * f.pageSize);
  return c.json({ items, total, page: f.page, pageSize: f.pageSize });
});

practiceRoutes.get('/submissions/:runId', async (c) => {
  const auth = requireAuth(c);
  const runId = c.req.param('runId');
  if (!z.string().uuid().safeParse(runId).success) throw notFound('Submission');
  // Owner filter in the query itself: other users get 404, not 403.
  const [r] = await db.select().from(codeRuns).where(and(eq(codeRuns.id, runId), eq(codeRuns.userId, auth.user.id), isNull(codeRuns.attemptId)));
  if (!r) throw notFound('Submission');
  const [q] = r.questionId ? await db.select({ id: questions.id, slug: questions.slug, title: questions.title, type: questions.type }).from(questions).where(eq(questions.id, r.questionId)) : [];
  const { results, meta } = splitStoredResults(r.results);
  return c.json({
    submission: {
      id: r.id,
      kind: r.kind,
      language: r.language,
      code: r.code,
      status: r.status,
      provider: r.provider,
      passed: r.passed,
      total: r.total,
      durationMs: r.durationMs,
      createdAt: r.createdAt,
      results,
      ...meta,
      problem: q ?? null,
    },
  });
});

// ---------- Hints ----------

practiceRoutes.post('/problems/:id/hint', async (c) => {
  const { auth, q } = await loadProblem(c);
  const hints = q.content.hints ?? [];
  const revealed = await hintsRevealed(auth.user.id, q.id);
  if (revealed >= hints.length) throw conflict(hints.length ? 'You have seen every hint for this problem.' : 'This problem has no hints.');
  const level = revealed + 1;
  await db.insert(hintReveals).values({ userId: auth.user.id, questionId: q.id, level }).onConflictDoNothing();
  return c.json({ level, hint: hints[level - 1], hints: hints.slice(0, level), hintCount: hints.length });
});

function problemContext(q: QuestionRow, language: string, code: string) {
  const parts = [`Problem: ${q.title} (${q.difficulty})`, q.content.prompt];
  if (q.content.constraints) parts.push(`Constraints: ${q.content.constraints}`);
  if (q.type === 'sql') {
    parts.push(`Schema (PostgreSQL):\n${q.content.schemaSql ?? ''}`);
    if (q.content.orderMatters) parts.push('Row order matters for this problem.');
  } else {
    const examples = (q.content.visibleTests ?? []).map((t) => `Example "${t.name}"\nInput:\n${t.input}\nExpected output:\n${t.expected}`).join('\n\n');
    if (examples) parts.push(`Visible examples (stdin to stdout):\n${examples}`);
  }
  const trimmed = code.length > 12_000 ? `${code.slice(0, 12_000)}\n... (truncated)` : code;
  parts.push(`The learner's current ${language} code:\n\`\`\`${language}\n${trimmed || '(empty)'}\n\`\`\``);
  return parts.join('\n\n');
}

practiceRoutes.post('/problems/:id/ai-hint', async (c) => {
  const { auth, q } = await loadProblem(c);
  const input = await body(c, z.object({ code: z.string().max(MAX_CODE_BYTES), language: languageSchema.optional() }));
  rateLimit(`practice:ai:${auth.user.id}`, 10, 10 * 60_000);
  const language = input.language ?? (q.type === 'sql' ? 'sql' : 'python');
  // Only learner-visible material goes into the prompt: never hidden tests, seed data or the model answer.
  const r = await aiComplete({
    userId: auth.user.id,
    assistant: 'dsa_coach',
    feature: 'hint',
    maxTokens: 350,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content:
          'You are a patient coding coach in a practice environment. Give a nudge, not the solution. ' +
          'Point to the next idea to think about, or to one concrete bug or misconception you can see in the learner\'s code. ' +
          'Never write a complete or near-complete solution, never give the full algorithm step by step, and never output more than one short line of code. ' +
          'Keep it under 120 words. Use plain language.',
      },
      { role: 'user', content: `${problemContext(q, language, input.code)}\n\nGive me a nudge, not the solution.` },
    ],
  });
  if (!r.ok) return c.json({ ok: false, reason: r.reason, message: r.message, retryAfterSeconds: r.retryAfterSeconds ?? null });
  return c.json({ ok: true, text: r.text, provider: r.provider, model: r.model, label: 'AI generated' });
});

practiceRoutes.post('/problems/:id/ai-complexity', async (c) => {
  const { auth, q } = await loadProblem(c);
  const input = await body(c, z.object({ code: z.string().min(1, 'Write some code first.').max(MAX_CODE_BYTES), language: languageSchema }));
  rateLimit(`practice:ai:${auth.user.id}`, 10, 10 * 60_000);
  const r = await aiComplete({
    userId: auth.user.id,
    assistant: 'dsa_coach',
    feature: 'complexity_estimate',
    maxTokens: 250,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          'Estimate the time and space complexity of the learner\'s code in Big-O, each with one sentence of reasoning, using the input size names from the problem. ' +
          'Say clearly that this is an estimate from reading the code, not a measurement. Do not write a solution or suggest a full algorithm.',
      },
      { role: 'user', content: problemContext(q, input.language, input.code) },
    ],
  });
  if (!r.ok) return c.json({ ok: false, reason: r.reason, message: r.message, retryAfterSeconds: r.retryAfterSeconds ?? null });
  return c.json({ ok: true, text: r.text, provider: r.provider, model: r.model, label: 'AI estimate, not measured' });
});

// ---------- Solution (gated) ----------

practiceRoutes.post('/problems/:id/give-up', async (c) => {
  const { auth, q } = await loadProblem(c);
  await db
    .insert(practiceProgress)
    .values({ userId: auth.user.id, questionId: q.id, gaveUpAt: new Date() })
    .onConflictDoUpdate({ target: [practiceProgress.userId, practiceProgress.questionId], set: { gaveUpAt: sql`coalesce(${practiceProgress.gaveUpAt}, now())`, updatedAt: new Date() } });
  const p = await progressFor(auth.user.id, q.id);
  return c.json({ gaveUpAt: p?.gaveUpAt ?? null, solved: !!p?.solvedAt });
});

practiceRoutes.get('/problems/:id/solution', async (c) => {
  const { auth, q } = await loadProblem(c);
  const p = await progressFor(auth.user.id, q.id);
  if (!p?.solvedAt && !p?.gaveUpAt) throw forbidden('Solve the problem, or choose to give up, to see the reference solution.');
  const library = q.slug ? ALL_PROBLEMS.find((x) => x.slug === q.slug) : undefined;
  const reference: { language: string; code: string }[] = [];
  if (q.type === 'sql') {
    if (q.answerKey.solutionSql) reference.push({ language: 'sql', code: q.answerKey.solutionSql });
  } else {
    const py = library?.solutions?.python ?? q.answerKey.modelAnswer;
    if (py) reference.push({ language: 'python', code: py });
    if (library?.solutions?.javascript) reference.push({ language: 'javascript', code: library.solutions.javascript });
  }
  return c.json({
    unlockedBy: p.solvedAt ? 'solved' : 'gave_up',
    solution: {
      explanation: q.answerKey.explanation ?? null,
      statedComplexity: statedComplexity(q.answerKey.explanation),
      reference,
    },
  });
});

// ---------- Admin: runtimes ----------

practiceRoutes.get('/admin/runtimes', async (c) => {
  requirePlatformAdmin(c);
  const status = await runtimeAdminStatus();
  const jobs = await db
    .select({ id: backgroundJobs.id, status: backgroundJobs.status, payload: backgroundJobs.payload, result: backgroundJobs.result, lastError: backgroundJobs.lastError, createdAt: backgroundJobs.createdAt, updatedAt: backgroundJobs.updatedAt })
    .from(backgroundJobs)
    .where(eq(backgroundJobs.type, 'exec.pull_image'))
    .orderBy(desc(backgroundJobs.createdAt))
    .limit(20);
  return c.json({ ...status, jobs });
});

practiceRoutes.post('/admin/runtimes/:language/pull', async (c) => {
  const auth = requirePlatformAdmin(c);
  const language = c.req.param('language');
  const image = dockerImageFor(language);
  if (!image) throw badRequest(`${language} does not use a Docker image.`);
  const [pending] = await db
    .select()
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.type, 'exec.pull_image'), inArray(backgroundJobs.status, ['queued', 'running', 'retrying']), sql`${backgroundJobs.payload}->>'image' = ${image}`));
  if (pending) return c.json({ job: pending, created: false }, 202);
  const { job, created } = await enqueue('exec.pull_image', { language, image }, { idempotencyKey: `exec.pull_image:${image}:${Math.floor(Date.now() / 60_000)}`, maxAttempts: 2, createdBy: auth.user.id });
  await audit(c, { action: 'exec.runtime_pull_requested', targetType: 'runtime', targetId: language, meta: { image, jobId: job.id } });
  return c.json({ job, created }, 202);
});
