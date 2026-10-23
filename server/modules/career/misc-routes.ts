import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { applications, journalEntries, jobTargets, offerPriorities, offerRatings, resumes, interviewPractice } from '../../db/schema';
import { type AppEnv, requireAuth } from '../../lib/context';
import { body, idParam, query, patchSchema } from '../../lib/validate';
import { badRequest, notFound } from '../../lib/errors';
import { computeSkillDna } from '../learning/skilldna';
import { DEFAULT_WEIGHTS, PRIORITY_KEYS, PRIORITY_LABEL, compareOpportunities, evaluateJdAgainstPriorities, COMPARE_FORMULA } from './offers';
import { scoreSkills } from './analysis';
import { APP_STATUSES, type AppStatus } from './service';

// ---------- Offers & decisions ----------

export const offerRoutes = new Hono<AppEnv>();

async function weightsFor(userId: string) {
  const [p] = await db.select().from(offerPriorities).where(eq(offerPriorities.userId, userId));
  return { ...DEFAULT_WEIGHTS, ...(p?.weights ?? {}) };
}

offerRoutes.get('/priorities', async (c) => {
  const auth = requireAuth(c);
  return c.json({ weights: await weightsFor(auth.user.id), keys: PRIORITY_KEYS.map((k) => ({ key: k, label: PRIORITY_LABEL[k] })), formula: COMPARE_FORMULA });
});

offerRoutes.put('/priorities', async (c) => {
  const auth = requireAuth(c);
  const { weights } = await body(c, z.object({ weights: z.object(Object.fromEntries(PRIORITY_KEYS.map((k) => [k, z.number().int().min(0).max(5)])) as Record<(typeof PRIORITY_KEYS)[number], z.ZodNumber>) }));
  await db
    .insert(offerPriorities)
    .values({ userId: auth.user.id, weights })
    .onConflictDoUpdate({ target: offerPriorities.userId, set: { weights, updatedAt: new Date() } });
  return c.json({ weights });
});

/** Offers to compare: tracked applications in offer/accepted status or with offer details. */
offerRoutes.get('/compare', async (c) => {
  const auth = requireAuth(c);
  const { ids } = query(c, z.object({ ids: z.string().max(400).optional() }));
  const idList = ids ? ids.split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x)) : [];
  let rows = await db.select().from(applications).where(and(eq(applications.userId, auth.user.id), idList.length ? inArray(applications.id, idList) : undefined));
  if (!idList.length) rows = rows.filter((r) => r.status === 'offer' || r.status === 'accepted' || !!r.offer);
  const ratings = rows.length ? await db.select().from(offerRatings).where(and(eq(offerRatings.userId, auth.user.id), inArray(offerRatings.applicationId, rows.map((r) => r.id)))) : [];
  const weights = await weightsFor(auth.user.id);
  const items = compareOpportunities(
    rows.map((r) => ({ id: r.id, company: r.company, role: r.role, status: r.status, offer: r.offer, salaryText: r.salaryText, location: r.location, ratings: ratings.find((x) => x.applicationId === r.id)?.ratings ?? {} })),
    weights,
  );
  return c.json({ items, weights, formula: COMPARE_FORMULA, keys: PRIORITY_KEYS.map((k) => ({ key: k, label: PRIORITY_LABEL[k] })) });
});

offerRoutes.put('/ratings/:applicationId', async (c) => {
  const auth = requireAuth(c);
  const applicationId = idParam(c, 'applicationId');
  const [a] = await db.select({ id: applications.id }).from(applications).where(and(eq(applications.id, applicationId), eq(applications.userId, auth.user.id)));
  if (!a) throw notFound('Application');
  const { ratings } = await body(c, z.object({ ratings: z.partialRecord(z.enum(PRIORITY_KEYS), z.number().int().min(1).max(5).nullable()) }));
  const clean = Object.fromEntries(Object.entries(ratings).filter(([, v]) => v !== null)) as Record<string, number>;
  await db
    .insert(offerRatings)
    .values({ userId: auth.user.id, applicationId, ratings: clean })
    .onConflictDoUpdate({ target: [offerRatings.userId, offerRatings.applicationId], set: { ratings: clean, updatedAt: new Date() } });
  return c.json({ ratings: clean });
});

/** Evaluate a JD against your priorities: quotes what the JD says, flags what it does not. */
offerRoutes.post('/evaluate-jd', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ targetId: z.string().uuid().optional(), description: z.string().max(30_000).optional() }));
  let description = input.description ?? '';
  if (input.targetId) {
    const [t] = await db.select().from(jobTargets).where(and(eq(jobTargets.id, input.targetId), eq(jobTargets.userId, auth.user.id)));
    if (!t) throw notFound('Job target');
    description = t.description;
  }
  if (description.trim().length < 40) throw badRequest('Paste a job description or choose a saved job target.', { fields: { description: 'Paste the job description.' } });
  return c.json(evaluateJdAgainstPriorities(description, await weightsFor(auth.user.id)));
});

// ---------- Growth journal (private) ----------

export const journalRoutes = new Hono<AppEnv>();
const journalKind = z.enum(['reflection', 'career', 'weekly_review']);

journalRoutes.get('/', async (c) => {
  const auth = requireAuth(c);
  const { kind } = query(c, z.object({ kind: journalKind.optional() }));
  const rows = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, auth.user.id), kind ? eq(journalEntries.kind, kind) : undefined))
    .orderBy(desc(journalEntries.createdAt))
    .limit(200);
  return c.json({ items: rows, total: rows.length });
});

const entryInput = z.object({ kind: journalKind.default('reflection'), title: z.string().trim().max(160).nullable().optional(), body: z.string().trim().min(1, 'Write something first.').max(20_000), mood: z.number().int().min(1).max(5).nullable().optional() });

journalRoutes.post('/', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, entryInput);
  const [row] = await db.insert(journalEntries).values({ ...input, userId: auth.user.id }).returning();
  return c.json({ entry: row }, 201);
});

journalRoutes.put('/:id', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, patchSchema(entryInput));
  const [row] = await db.update(journalEntries).set(input).where(and(eq(journalEntries.id, idParam(c)), eq(journalEntries.userId, auth.user.id))).returning();
  if (!row) throw notFound('Journal entry');
  return c.json({ entry: row });
});

journalRoutes.delete('/:id', async (c) => {
  const auth = requireAuth(c);
  const res = await db.delete(journalEntries).where(and(eq(journalEntries.id, idParam(c)), eq(journalEntries.userId, auth.user.id))).returning({ id: journalEntries.id });
  if (!res.length) throw notFound('Journal entry');
  return c.json({ ok: true });
});

// ---------- Career home overview ----------

export const overviewRoutes = new Hono<AppEnv>();

overviewRoutes.get('/', async (c) => {
  const auth = requireAuth(c);
  const uid = auth.user.id;
  const [targets, apps, resumeRows, practiceCount, dna] = await Promise.all([
    db.select().from(jobTargets).where(eq(jobTargets.userId, uid)).orderBy(desc(jobTargets.createdAt)).limit(5),
    db.select().from(applications).where(eq(applications.userId, uid)),
    db.select({ id: resumes.id, title: resumes.title, isPrimary: resumes.isPrimary, targetRole: resumes.targetRole }).from(resumes).where(eq(resumes.userId, uid)),
    db.select({ id: interviewPractice.id }).from(interviewPractice).where(eq(interviewPractice.userId, uid)).limit(1),
    computeSkillDna(uid),
  ]);
  const byStatus = Object.fromEntries(APP_STATUSES.map((s) => [s, 0])) as Record<AppStatus, number>;
  for (const a of apps) byStatus[a.status as AppStatus]++;
  const now = Date.now();
  const horizon = now + 14 * 86400_000;
  const upcoming: { date: string; kind: string; title: string; applicationId: string }[] = [];
  for (const a of apps) {
    if (['rejected', 'withdrawn'].includes(a.status)) continue;
    const add = (d: Date | string | null | undefined, kind: string, title: string) => {
      if (!d) return;
      const t = new Date(d).getTime();
      if (!Number.isNaN(t) && t >= now - 86400_000 && t <= horizon) upcoming.push({ date: new Date(t).toISOString(), kind, title, applicationId: a.id });
    };
    add(a.deadline, 'deadline', `Deadline: ${a.role} at ${a.company}`);
    add(a.nextActionAt, 'follow_up', `Follow up: ${a.company}`);
    for (const r of a.rounds) if (r.status === 'scheduled') add(r.at, 'interview', `${r.name}: ${a.company}`);
    add(a.offer?.deadline, 'offer_deadline', `Offer decision: ${a.company}`);
  }
  upcoming.sort((x, y) => x.date.localeCompare(y.date));
  const readiness = targets.map((t) => {
    const { score, rows } = scoreSkills(t.extractedSkills, dna);
    return { id: t.id, title: t.title, company: t.company, score, gaps: rows.filter((r) => r.required && (r.status === 'none' || r.status === 'self_reported')).map((r) => r.name).slice(0, 4) };
  });
  const actions: { title: string; reason: string; link: string }[] = [];
  if (!resumeRows.length) actions.push({ title: 'Create your first resume', reason: 'Start from your profile so you only add what is true.', link: '/app/career/resumes?new=1' });
  if (!targets.length) actions.push({ title: 'Save a job description you are aiming for', reason: 'The gap analysis compares it with your Skill DNA.', link: '/app/career/targets?new=1' });
  for (const t of readiness) {
    if (t.gaps.length) actions.push({ title: `Close gaps for ${t.title}`, reason: `Little or no evidence yet for ${t.gaps.join(', ')}.`, link: `/app/career/targets/${t.id}` });
    if (!resumeRows.some((r) => r.targetRole?.toLowerCase() === t.title.toLowerCase())) actions.push({ title: `Tailor a resume for ${t.title}`, reason: 'A tailored copy puts your most relevant real experience first.', link: `/app/career/targets/${t.id}` });
  }
  for (const a of apps) {
    if (a.status === 'applied' && a.appliedAt && now - new Date(a.appliedAt).getTime() > 10 * 86400_000 && !a.nextActionAt)
      actions.push({ title: `Follow up with ${a.company}`, reason: 'Applied over ten days ago with no recorded response.', link: `/app/career/applications?open=${a.id}` });
  }
  if (!practiceCount.length) actions.push({ title: 'Practise a behavioral answer', reason: 'Get structured STAR feedback in a few minutes.', link: '/app/career/interview?kind=behavioral' });
  return c.json({
    readiness,
    applications: { total: apps.length, byStatus, active: apps.filter((a) => ['applied', 'assessment', 'interview', 'offer'].includes(a.status)).length },
    upcoming: upcoming.slice(0, 10),
    actions: actions.slice(0, 8),
    resumes: { total: resumeRows.length, primaryId: resumeRows.find((r) => r.isPrimary)?.id ?? null },
  });
});
