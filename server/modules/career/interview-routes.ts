import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { interviewPractice, mockInterviews, questions } from '../../db/schema';
import type { MockQuestion } from '../../db/schema/career-ext';
import { type AppEnv, requireAuth } from '../../lib/context';
import { body, idParam, query } from '../../lib/validate';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { rateLimit } from '../../lib/ratelimit';
import { computeSkillDna } from '../learning/skilldna';
import { INTERVIEW_KINDS, KIND_LABEL, QUESTION_BANK, deterministicFeedback, type InterviewKind } from './interview';
import { runAi, aiUnavailable, parseJsonLoose } from './service';
import { newId } from './resume';

export const interviewRoutes = new Hono<AppEnv>();

const kindSchema = z.enum(INTERVIEW_KINDS);

/** CodeLab problems for SQL / DSA practice (real, runnable problems in the platform). */
async function codeLabQuestions(kind: 'sql' | 'dsa', limit = 30) {
  const rows = await db
    .select({ id: questions.id, slug: questions.slug, title: questions.title, difficulty: questions.difficulty, type: questions.type, topics: questions.topics })
    .from(questions)
    .where(and(eq(questions.isPractice, true), eq(questions.status, 'active')))
    .limit(300);
  return rows
    .filter((q) => (kind === 'sql' ? q.type === 'sql' : q.type !== 'sql'))
    .slice(0, limit)
    .map((q) => ({
      id: `codelab-${q.slug ?? q.id}`,
      kind,
      prompt: q.title,
      difficulty: q.difficulty,
      link: `/app/practice/${q.slug ?? q.id}`,
      guidance: kind === 'sql' ? 'Solve it in CodeLab where your query runs against real data, then explain your approach out loud: tables involved, joins, filters, and edge cases such as NULLs and ties.' : 'Solve it in CodeLab where tests run your code, then explain your approach: brute force first, the better idea, time and space complexity, and edge cases.',
    }));
}

interviewRoutes.get('/questions', async (c) => {
  requireAuth(c);
  const { kind, role } = query(c, z.object({ kind: kindSchema.optional(), role: z.string().max(40).optional() }));
  const bank = QUESTION_BANK.filter((q) => (!kind || q.kind === kind) && (!role || !q.role || q.role === role));
  const codelab = !kind || kind === 'sql' || kind === 'dsa' ? [...(!kind || kind === 'sql' ? await codeLabQuestions('sql', kind ? 30 : 6) : []), ...(!kind || kind === 'dsa' ? await codeLabQuestions('dsa', kind ? 30 : 6) : [])] : [];
  return c.json({ kinds: INTERVIEW_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })), questions: bank, codelab });
});

/** Deterministic feedback without saving (live preview). */
interviewRoutes.post('/feedback-preview', async (c) => {
  requireAuth(c);
  const input = await body(c, z.object({ kind: kindSchema, answer: z.string().max(20_000) }));
  return c.json(deterministicFeedback(input.kind, input.answer));
});

interviewRoutes.get('/practice', async (c) => {
  const auth = requireAuth(c);
  const { kind } = query(c, z.object({ kind: kindSchema.optional() }));
  const rows = await db
    .select()
    .from(interviewPractice)
    .where(and(eq(interviewPractice.userId, auth.user.id), kind ? eq(interviewPractice.kind, kind) : undefined))
    .orderBy(desc(interviewPractice.createdAt))
    .limit(200);
  return c.json({ items: rows, total: rows.length });
});

interviewRoutes.post('/practice', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ kind: kindSchema, question: z.string().trim().min(3).max(1000), answer: z.string().trim().min(1, 'Write or paste your answer.').max(20_000), selfRating: z.number().int().min(1).max(5).optional() }));
  const { feedback, stats } = deterministicFeedback(input.kind, input.answer);
  const [row] = await db.insert(interviewPractice).values({ userId: auth.user.id, kind: input.kind, question: input.question, answer: input.answer, selfRating: input.selfRating ?? null, feedback }).returning();
  const model = QUESTION_BANK.find((q) => q.prompt === input.question);
  return c.json({ practice: row, stats, modelAnswer: model?.modelAnswer ?? null }, 201);
});

interviewRoutes.get('/practice/:id', async (c) => {
  const auth = requireAuth(c);
  const [row] = await db.select().from(interviewPractice).where(and(eq(interviewPractice.id, idParam(c)), eq(interviewPractice.userId, auth.user.id)));
  if (!row) throw notFound('Practice answer');
  const model = QUESTION_BANK.find((q) => q.prompt === row.question);
  return c.json({ practice: row, stats: deterministicFeedback(row.kind, row.answer).stats, modelAnswer: model?.modelAnswer ?? null, guidance: model?.guidance ?? null });
});

interviewRoutes.delete('/practice/:id', async (c) => {
  const auth = requireAuth(c);
  const res = await db.delete(interviewPractice).where(and(eq(interviewPractice.id, idParam(c)), eq(interviewPractice.userId, auth.user.id))).returning({ id: interviewPractice.id });
  if (!res.length) throw notFound('Practice answer');
  return c.json({ ok: true });
});

/** Optional AI feedback, labeled. Never stored as verified evidence. */
interviewRoutes.post('/practice/:id/ai-feedback', async (c) => {
  const auth = requireAuth(c);
  const [row] = await db.select().from(interviewPractice).where(and(eq(interviewPractice.id, idParam(c)), eq(interviewPractice.userId, auth.user.id)));
  if (!row) throw notFound('Practice answer');
  rateLimit(`career-ai:${auth.user.id}`, 30, 3600_000);
  const assistant = row.kind === 'behavioral' || row.kind === 'communication' ? 'behavioral_interview' : 'tech_interview';
  const ai = await runAi({
    userId: auth.user.id,
    assistant,
    feature: 'interview_feedback',
    json: true,
    messages: [
      { role: 'system', content: 'You are an interview coach. Give structured, kind, specific feedback on the answer. Do not invent facts about the candidate. Return JSON {"strengths":[...],"improvements":[...],"summary":"..."}.' },
      { role: 'user', content: `Question (${row.kind}): ${row.question}\n\nAnswer:\n${row.answer}` },
    ],
  });
  if (!ai.ok) return c.json(aiUnavailable(ai));
  const parsed = parseJsonLoose(ai.text) as { strengths?: unknown; improvements?: unknown; summary?: unknown } | null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8).map((x) => x.slice(0, 400)) : []);
  return c.json({
    ok: true,
    aiAssisted: true,
    feedback: { strengths: list(parsed?.strengths), improvements: list(parsed?.improvements), summary: typeof parsed?.summary === 'string' ? parsed.summary.slice(0, 800) : ai.text.slice(0, 800) },
    label: 'AI feedback: a second opinion, not a grade.',
  });
});

const INTERVIEW_SKILLS: Record<string, InterviewKind> = {
  'behavioral-interviews': 'behavioral',
  communication: 'communication',
  'technical-interviews': 'dsa',
  'system-design-basics': 'system_design',
  'sql-basics': 'sql',
  'sql-joins': 'sql',
  'sql-aggregation': 'sql',
  arrays: 'dsa',
  hashing: 'dsa',
  complexity: 'dsa',
  'http-rest': 'technical',
  'database-design': 'project',
};

/** Personalized revision plan from Skill DNA and practice history. */
interviewRoutes.get('/revision-plan', async (c) => {
  const auth = requireAuth(c);
  const [dna, history, mocks] = await Promise.all([
    computeSkillDna(auth.user.id),
    db.select({ kind: interviewPractice.kind, feedback: interviewPractice.feedback, createdAt: interviewPractice.createdAt }).from(interviewPractice).where(eq(interviewPractice.userId, auth.user.id)).orderBy(desc(interviewPractice.createdAt)).limit(200),
    db.select({ id: mockInterviews.id }).from(mockInterviews).where(and(eq(mockInterviews.userId, auth.user.id), eq(mockInterviews.status, 'completed'))).limit(1),
  ]);
  const perKind = INTERVIEW_KINDS.map((k) => {
    const h = history.filter((x) => x.kind === k);
    const ratios = h.map((x) => {
      const items = x.feedback?.items ?? [];
      return items.length ? items.filter((i) => i.met).length / items.length : 0;
    });
    const avg = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
    const missed = new Map<string, number>();
    for (const x of h.slice(0, 5)) for (const i of x.feedback?.items ?? []) if (!i.met) missed.set(i.label, (missed.get(i.label) ?? 0) + 1);
    return { kind: k, label: KIND_LABEL[k], attempts: h.length, avgChecklist: avg, commonMisses: [...missed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l]) => l) };
  });
  const weakSkills = dna
    .filter((d) => d.slug in INTERVIEW_SKILLS && d.state !== 'verified' && d.state !== 'demonstrated')
    .map((d) => ({ slug: d.slug, name: d.name, state: d.state, kind: INTERVIEW_SKILLS[d.slug] }));
  const items: { day: number; kind: InterviewKind; title: string; reason: string; link: string }[] = [];
  const priority = [...perKind].sort((a, b) => (a.attempts === 0 ? -1 : 0) - (b.attempts === 0 ? -1 : 0) || (a.avgChecklist ?? 0) - (b.avgChecklist ?? 0));
  let day = 1;
  for (const k of priority) {
    if (k.kind === 'role' || k.kind === 'communication') continue;
    const reason = k.attempts === 0 ? 'Not practised yet.' : k.avgChecklist !== null && k.avgChecklist < 0.7 ? `Checklist average ${Math.round(k.avgChecklist * 100)}%${k.commonMisses.length ? `; often missed: ${k.commonMisses.join(', ')}` : ''}.` : null;
    if (!reason) continue;
    items.push({ day, kind: k.kind, title: `Practise one ${k.label.toLowerCase()} question`, reason, link: `/app/career/interview?kind=${k.kind}` });
    day += 1;
  }
  for (const s of weakSkills) {
    items.push({ day, kind: s.kind, title: `Strengthen ${s.name}`, reason: `Skill DNA shows ${s.state.replace('_', ' ')} for this skill.`, link: `/app/skills/${s.slug}` });
    day += 1;
  }
  if (!mocks.length) items.push({ day, kind: 'behavioral', title: 'Run a timed mock interview', reason: 'Practising under time pressure shows where answers run long.', link: '/app/career/interview?tab=mock' });
  return c.json({ perKind, weakSkills, items: items.slice(0, 14), basis: 'Built from your practice history (deterministic checklist results) and Skill DNA states for interview-related skills.' });
});

// ---------- Mock interviews ----------

interviewRoutes.get('/mock', async (c) => {
  const auth = requireAuth(c);
  const rows = await db.select().from(mockInterviews).where(eq(mockInterviews.userId, auth.user.id)).orderBy(desc(mockInterviews.startedAt)).limit(50);
  return c.json({ items: rows, total: rows.length });
});

interviewRoutes.post('/mock', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ kinds: z.array(kindSchema).min(1, 'Pick at least one kind.').max(8), count: z.number().int().min(2).max(8).default(4), minutesPerQuestion: z.number().int().min(1).max(15).default(3) }));
  const practiced = new Set((await db.select({ q: interviewPractice.question }).from(interviewPractice).where(eq(interviewPractice.userId, auth.user.id))).map((r) => r.q));
  const pool: { kind: string; prompt: string }[] = QUESTION_BANK.filter((q) => input.kinds.includes(q.kind)).map((q) => ({ kind: q.kind, prompt: q.prompt }));
  for (const k of ['sql', 'dsa'] as const) if (input.kinds.includes(k)) pool.push(...(await codeLabQuestions(k, 10)).map((q) => ({ kind: k, prompt: `Explain how you would solve: ${q.prompt}` })));
  if (pool.length < 2) throw badRequest('Not enough questions for those kinds. Add another kind.');
  // Unpractised first, then interleave kinds; deterministic order with a light shuffle by day.
  const seed = new Date().getUTCDate();
  const sorted = [...pool].sort((a, b) => Number(practiced.has(a.prompt)) - Number(practiced.has(b.prompt)) || ((a.prompt.length * seed) % 7) - ((b.prompt.length * seed) % 7));
  const picked: typeof pool = [];
  const byKind = new Map<string, typeof pool>();
  for (const q of sorted) (byKind.get(q.kind) ?? byKind.set(q.kind, []).get(q.kind)!).push(q);
  while (picked.length < Math.min(input.count, pool.length)) {
    for (const [, list] of byKind) if (list.length && picked.length < input.count) picked.push(list.shift()!);
  }
  const qs: MockQuestion[] = picked.map((q) => ({ id: newId(), kind: q.kind, prompt: q.prompt }));
  const [row] = await db.insert(mockInterviews).values({ userId: auth.user.id, kinds: input.kinds, minutesPerQuestion: input.minutesPerQuestion, questions: qs }).returning();
  return c.json({ mock: row }, 201);
});

async function loadMock(id: string, userId: string) {
  const [m] = await db.select().from(mockInterviews).where(and(eq(mockInterviews.id, id), eq(mockInterviews.userId, userId)));
  if (!m) throw notFound('Mock interview');
  return m;
}

interviewRoutes.get('/mock/:id', async (c) => {
  const auth = requireAuth(c);
  const m = await loadMock(idParam(c), auth.user.id);
  const ids = m.questions.map((q) => q.practiceId).filter((x): x is string => !!x);
  const answers = ids.length ? await db.select().from(interviewPractice).where(and(eq(interviewPractice.userId, auth.user.id), inArray(interviewPractice.id, ids))) : [];
  return c.json({ mock: m, answers });
});

interviewRoutes.post('/mock/:id/answer', async (c) => {
  const auth = requireAuth(c);
  const m = await loadMock(idParam(c), auth.user.id);
  if (m.status !== 'in_progress') throw conflict('This mock interview is finished.');
  const input = await body(c, z.object({ questionId: z.string().max(40), answer: z.string().max(20_000).default(''), durationSec: z.number().int().min(0).max(3600) }));
  const q = m.questions.find((x) => x.id === input.questionId);
  if (!q) throw notFound('Question');
  let practiceId = q.practiceId;
  const text = input.answer.trim() || '(no answer recorded)';
  const { feedback } = deterministicFeedback(q.kind, input.answer);
  if (practiceId) {
    await db.update(interviewPractice).set({ answer: text, feedback }).where(and(eq(interviewPractice.id, practiceId), eq(interviewPractice.userId, auth.user.id)));
  } else {
    const [p] = await db.insert(interviewPractice).values({ userId: auth.user.id, kind: q.kind, question: q.prompt, answer: text, feedback }).returning({ id: interviewPractice.id });
    practiceId = p.id;
  }
  const updatedQs = m.questions.map((x) => (x.id === q.id ? { ...x, practiceId, durationSec: input.durationSec, checklistMet: feedback.items.filter((i) => i.met).length, checklistTotal: feedback.items.length } : x));
  const [row] = await db.update(mockInterviews).set({ questions: updatedQs }).where(eq(mockInterviews.id, m.id)).returning();
  return c.json({ mock: row, feedback });
});

interviewRoutes.post('/mock/:id/complete', async (c) => {
  const auth = requireAuth(c);
  const m = await loadMock(idParam(c), auth.user.id);
  const answered = m.questions.filter((q) => q.practiceId);
  const ids = answered.map((q) => q.practiceId!) as string[];
  const answers = ids.length ? await db.select().from(interviewPractice).where(inArray(interviewPractice.id, ids)) : [];
  const misses = new Map<string, number>();
  for (const a of answers) for (const i of a.feedback?.items ?? []) if (!i.met) misses.set(i.label, (misses.get(i.label) ?? 0) + 1);
  const limit = m.minutesPerQuestion * 60;
  const summary = {
    answered: answered.length,
    total: m.questions.length,
    avgChecklist: answered.length ? answered.reduce((a, q) => a + (q.checklistMet ?? 0) / Math.max(1, q.checklistTotal ?? 1), 0) / answered.length : null,
    overTime: answered.filter((q) => (q.durationSec ?? 0) > limit).length,
    totalSeconds: answered.reduce((a, q) => a + (q.durationSec ?? 0), 0),
    weakest: [...misses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label, n]) => ({ label, count: n })),
    note: 'Summary from the deterministic checklist. It measures structure and delivery cues, not correctness.',
  };
  const [row] = await db.update(mockInterviews).set({ status: 'completed', summary, completedAt: new Date() }).where(eq(mockInterviews.id, m.id)).returning();
  return c.json({ mock: row });
});

interviewRoutes.delete('/mock/:id', async (c) => {
  const auth = requireAuth(c);
  const m = await loadMock(idParam(c), auth.user.id);
  await db.delete(mockInterviews).where(eq(mockInterviews.id, m.id));
  return c.json({ ok: true });
});
