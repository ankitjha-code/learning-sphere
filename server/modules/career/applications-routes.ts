import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { applications, applicationEvents, externalJobs, resumes, careerDocuments, offerRatings, offerPriorities } from '../../db/schema';
import { type AppEnv, requireAuth } from '../../lib/context';
import { body, idParam, query, patchSchema } from '../../lib/validate';
import { badRequest, notFound } from '../../lib/errors';
import { isoDate } from './schemas';
import { APP_STATUSES, TRANSITIONS, SOURCES, logEvent, scheduleReminder, type AppStatus } from './service';
import { compareOpportunities, COMPARE_FORMULA, DEFAULT_WEIGHTS } from './offers';
import { newId } from './resume';
import { withdrawPlatformApplication } from '../jobs/service';

export const applicationRoutes = new Hono<AppEnv>();

const contactSchema = z.object({ name: z.string().trim().min(1).max(120), role: z.string().trim().max(120).optional(), email: z.string().trim().max(254).optional(), note: z.string().trim().max(500).optional() });
const offerSchema = z.object({
  baseSalary: z.number().nonnegative().max(1e10).optional(),
  currency: z.string().trim().max(8).optional(),
  bonus: z.number().nonnegative().max(1e10).optional(),
  equity: z.string().trim().max(200).optional(),
  location: z.string().trim().max(160).optional(),
  remote: z.string().trim().max(60).optional(),
  startDate: z.string().trim().max(30).optional(),
  deadline: z.string().trim().max(30).optional(),
  benefits: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const baseFields = {
  company: z.string().trim().min(1, 'Add the company.').max(160),
  role: z.string().trim().min(1, 'Add the role.').max(160),
  source: z.enum(SOURCES).default('manual'),
  sourceUrl: z.string().trim().max(500).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  appliedAt: isoDate.nullable().optional(),
  deadline: isoDate.nullable().optional(),
  resumeId: z.string().uuid().nullable().optional(),
  coverLetterId: z.string().uuid().nullable().optional(),
  salaryText: z.string().trim().max(200).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  contacts: z.array(contactSchema).max(20).optional(),
  offer: offerSchema.nullable().optional(),
  nextActionAt: isoDate.nullable().optional(),
};

async function loadOwn(id: string, userId: string) {
  const [a] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId)));
  if (!a) throw notFound('Application');
  return a;
}

async function assertLinks(userId: string, resumeId?: string | null, coverLetterId?: string | null) {
  if (resumeId) {
    const [r] = await db.select({ id: resumes.id }).from(resumes).where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)));
    if (!r) throw badRequest('That resume was not found.', { fields: { resumeId: 'Choose one of your resumes.' } });
  }
  if (coverLetterId) {
    const [d] = await db.select({ id: careerDocuments.id }).from(careerDocuments).where(and(eq(careerDocuments.id, coverLetterId), eq(careerDocuments.userId, userId)));
    if (!d) throw badRequest('That document was not found.', { fields: { coverLetterId: 'Choose one of your documents.' } });
  }
}

applicationRoutes.get('/', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, z.object({ status: z.enum(APP_STATUSES).optional(), q: z.string().trim().max(120).optional(), source: z.enum(SOURCES).optional() }));
  const like = q.q ? `%${q.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const rows = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, auth.user.id), q.status ? eq(applications.status, q.status) : undefined, q.source ? eq(applications.source, q.source) : undefined, like ? or(ilike(applications.company, like), ilike(applications.role, like)) : undefined))
    .orderBy(desc(applications.updatedAt));
  return c.json({ items: rows, total: rows.length, statuses: APP_STATUSES, transitions: TRANSITIONS });
});

applicationRoutes.post('/', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ ...baseFields, company: baseFields.company.optional(), role: baseFields.role.optional(), status: z.enum(['saved', 'applied']).default('saved'), externalJobId: z.string().uuid().optional() }));
  let { company, role, location, sourceUrl, source } = input;
  if (input.externalJobId) {
    const [j] = await db.select().from(externalJobs).where(eq(externalJobs.id, input.externalJobId));
    if (!j) throw notFound('Job');
    company ??= j.company;
    role ??= j.title;
    location ??= j.location;
    sourceUrl ??= j.url;
    source = 'feed';
  }
  if (!company || !role) throw badRequest('Please check the highlighted fields.', { fields: { ...(company ? {} : { company: 'Add the company.' }), ...(role ? {} : { role: 'Add the role.' }) } });
  await assertLinks(auth.user.id, input.resumeId, input.coverLetterId);
  const { externalJobId: _x, ...rest } = input;
  const [row] = await db
    .insert(applications)
    .values({
      ...rest,
      company,
      role,
      location: location ?? null,
      sourceUrl: sourceUrl ?? null,
      source,
      userId: auth.user.id,
      contacts: input.contacts ?? [],
      appliedAt: input.status === 'applied' ? (input.appliedAt ?? new Date()) : (input.appliedAt ?? null),
    })
    .returning();
  await logEvent(row.id, { kind: 'status', fromStatus: null, toStatus: row.status, note: 'Added to tracker' });
  await scheduleReminder(row);
  return c.json({ application: row }, 201);
});

applicationRoutes.get('/calendar', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, z.object({ from: isoDate.optional(), to: isoDate.optional() }));
  const from = q.from ?? new Date(Date.now() - 30 * 86400_000);
  const to = q.to ?? new Date(Date.now() + 90 * 86400_000);
  const rows = await db.select().from(applications).where(eq(applications.userId, auth.user.id));
  const events: { date: string; kind: 'deadline' | 'round' | 'follow_up' | 'offer_deadline' | 'applied'; title: string; applicationId: string; company: string; role: string; status: string }[] = [];
  const within = (d: Date) => d >= from && d <= to;
  for (const a of rows) {
    const base = { applicationId: a.id, company: a.company, role: a.role, status: a.status };
    if (a.deadline && within(new Date(a.deadline))) events.push({ ...base, date: new Date(a.deadline).toISOString(), kind: 'deadline', title: `Deadline: ${a.role} at ${a.company}` });
    if (a.nextActionAt && within(new Date(a.nextActionAt))) events.push({ ...base, date: new Date(a.nextActionAt).toISOString(), kind: 'follow_up', title: `Follow up: ${a.company}` });
    if (a.appliedAt && within(new Date(a.appliedAt))) events.push({ ...base, date: new Date(a.appliedAt).toISOString(), kind: 'applied', title: `Applied: ${a.role} at ${a.company}` });
    for (const r of a.rounds) if (r.at && r.status !== 'cancelled' && within(new Date(r.at))) events.push({ ...base, date: new Date(r.at).toISOString(), kind: 'round', title: `${r.name}: ${a.company}` });
    const od = a.offer?.deadline ? new Date(a.offer.deadline) : null;
    if (od && !Number.isNaN(od.getTime()) && within(od)) events.push({ ...base, date: od.toISOString(), kind: 'offer_deadline', title: `Offer decision due: ${a.company}` });
  }
  events.sort((x, y) => x.date.localeCompare(y.date));
  return c.json({ from: from.toISOString(), to: to.toISOString(), events });
});

/** Analytics with explicit definitions so numbers are never ambiguous. */
applicationRoutes.get('/analytics', async (c) => {
  const auth = requireAuth(c);
  const rows = await db.select().from(applications).where(eq(applications.userId, auth.user.id));
  const ids = rows.map((r) => r.id);
  const events = ids.length ? await db.select().from(applicationEvents).where(and(inArray(applicationEvents.applicationId, ids), eq(applicationEvents.kind, 'status'))).orderBy(asc(applicationEvents.createdAt)) : [];
  const byStatus = Object.fromEntries(APP_STATUSES.map((s) => [s, 0])) as Record<AppStatus, number>;
  for (const r of rows) byStatus[r.status as AppStatus]++;
  const reached = new Map<string, Set<string>>();
  for (const r of rows) reached.set(r.id, new Set([r.status]));
  for (const e of events) if (e.toStatus) reached.get(e.applicationId)?.add(e.toStatus);
  const sent = rows.filter((r) => r.appliedAt || [...reached.get(r.id)!].some((s) => s !== 'saved'));
  const sentReal = sent.filter((r) => [...reached.get(r.id)!].some((s) => ['applied', 'assessment', 'interview', 'offer', 'accepted', 'rejected'].includes(s)));
  const responded = sentReal.filter((r) => [...reached.get(r.id)!].some((s) => ['assessment', 'interview', 'offer', 'accepted', 'rejected'].includes(s)));
  // Time in stage: average days between entering a status and the next status change (open stages count until now).
  const stageDays: Record<string, number[]> = {};
  const evByApp = new Map<string, typeof events>();
  for (const e of events) (evByApp.get(e.applicationId) ?? evByApp.set(e.applicationId, []).get(e.applicationId)!).push(e);
  for (const [, evs] of evByApp) {
    for (let i = 0; i < evs.length; i++) {
      const st = evs[i].toStatus;
      if (!st) continue;
      const start = new Date(evs[i].createdAt).getTime();
      const end = i + 1 < evs.length ? new Date(evs[i + 1].createdAt).getTime() : ['accepted', 'rejected', 'withdrawn'].includes(st) ? null : Date.now();
      if (end === null) continue;
      (stageDays[st] ??= []).push((end - start) / 86400_000);
    }
  }
  const timeInStage = Object.fromEntries(Object.entries(stageDays).map(([k, v]) => [k, { avgDays: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10, samples: v.length }]));
  const bySource = SOURCES.map((src) => {
    const list = sentReal.filter((r) => r.source === src);
    const interviews = list.filter((r) => [...reached.get(r.id)!].some((s) => ['interview', 'offer', 'accepted'].includes(s))).length;
    const offers = list.filter((r) => [...reached.get(r.id)!].some((s) => ['offer', 'accepted'].includes(s))).length;
    return { source: src, sent: list.length, interviews, offers, interviewRate: list.length ? interviews / list.length : null };
  }).filter((s) => s.sent > 0);
  return c.json({
    total: rows.length,
    byStatus,
    sent: sentReal.length,
    responded: responded.length,
    responseRate: sentReal.length ? responded.length / sentReal.length : null,
    timeInStage,
    bySource,
    definitions: {
      sent: 'Applications that reached Applied or any later stage (saved-only jobs are not counted).',
      responseRate: 'Sent applications that got any employer response (moved to Assessment, Interview, Offer, Accepted, or were Rejected) divided by sent applications. Withdrawals without a response do not count as responses.',
      timeInStage: 'Average days between entering a status and the next status change, from your status history. Open stages are counted up to today.',
      bySource: 'For each source: sent applications, how many reached Interview or later, and how many reached Offer or Accepted.',
    },
  });
});

/** Side-by-side comparison of any tracked jobs (offers get a weighted score from your priorities). */
applicationRoutes.post('/compare', async (c) => {
  const auth = requireAuth(c);
  const { ids } = await body(c, z.object({ ids: z.array(z.string().uuid()).min(2, 'Pick at least two.').max(6) }));
  const rows = await db.select().from(applications).where(and(eq(applications.userId, auth.user.id), inArray(applications.id, ids)));
  if (rows.length !== ids.length) throw notFound('Application');
  const [pri] = await db.select().from(offerPriorities).where(eq(offerPriorities.userId, auth.user.id));
  const ratings = await db.select().from(offerRatings).where(and(eq(offerRatings.userId, auth.user.id), inArray(offerRatings.applicationId, ids)));
  const weights = pri?.weights ?? DEFAULT_WEIGHTS;
  const scored = compareOpportunities(
    rows.map((r) => ({ id: r.id, company: r.company, role: r.role, status: r.status, offer: r.offer, salaryText: r.salaryText, location: r.location, ratings: ratings.find((x) => x.applicationId === r.id)?.ratings ?? {} })),
    weights,
  );
  return c.json({
    items: scored.map((s) => {
      const r = rows.find((x) => x.id === s.id)!;
      return { ...s, deadline: r.deadline, source: r.source, rounds: r.rounds.length, appliedAt: r.appliedAt };
    }),
    weights,
    formula: COMPARE_FORMULA,
  });
});

applicationRoutes.get('/:id', async (c) => {
  const auth = requireAuth(c);
  const a = await loadOwn(idParam(c), auth.user.id);
  const events = await db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, a.id)).orderBy(desc(applicationEvents.createdAt));
  return c.json({ application: a, events, allowedTransitions: TRANSITIONS[a.status as AppStatus] ?? [] });
});

applicationRoutes.patch('/:id', async (c) => {
  const auth = requireAuth(c);
  const a = await loadOwn(idParam(c), auth.user.id);
  const input = await body(c, patchSchema(z.object(baseFields)));
  await assertLinks(auth.user.id, input.resumeId, input.coverLetterId);
  const [row] = await db
    .update(applications)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(applications.id, a.id))
    .returning();
  const prevNext = a.nextActionAt ? new Date(a.nextActionAt).getTime() : null;
  const newNext = row.nextActionAt ? new Date(row.nextActionAt).getTime() : null;
  if (newNext && newNext !== prevNext) {
    await scheduleReminder(row);
    await logEvent(row.id, { kind: 'reminder', note: `Follow-up reminder set for ${new Date(newNext).toISOString()}` });
  }
  return c.json({ application: row });
});

applicationRoutes.post('/:id/status', async (c) => {
  const auth = requireAuth(c);
  const a = await loadOwn(idParam(c), auth.user.id);
  const input = await body(c, z.object({ status: z.enum(APP_STATUSES), note: z.string().trim().max(2000).optional(), outcomeReason: z.string().trim().max(500).optional() }));
  const from = a.status as AppStatus;
  if (from === input.status) return c.json({ application: a, unchanged: true });
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(input.status)) {
    throw badRequest(`Cannot move from ${from} to ${input.status}. Allowed next steps: ${allowed.join(', ') || 'none'}.`, { allowed });
  }
  // Withdrawing a platform application also withdraws it with the employer (and notifies them).
  if (input.status === 'withdrawn' && a.jobApplicationId) {
    await withdrawPlatformApplication(c, auth.user.id, a.jobApplicationId, input.outcomeReason ?? input.note, { skipPersonal: true });
  }
  const [row] = await db
    .update(applications)
    .set({
      status: input.status,
      outcomeReason: ['rejected', 'withdrawn'].includes(input.status) ? (input.outcomeReason ?? a.outcomeReason) : a.outcomeReason,
      appliedAt: input.status === 'applied' && !a.appliedAt ? new Date() : a.appliedAt,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, a.id))
    .returning();
  await logEvent(a.id, { kind: 'status', fromStatus: from, toStatus: input.status, note: input.note ?? input.outcomeReason ?? null });
  return c.json({ application: row });
});

applicationRoutes.post('/:id/notes', async (c) => {
  const auth = requireAuth(c);
  const a = await loadOwn(idParam(c), auth.user.id);
  const { note } = await body(c, z.object({ note: z.string().trim().min(1, 'Write a note.').max(4000) }));
  await logEvent(a.id, { kind: 'note', note });
  await db.update(applications).set({ updatedAt: new Date() }).where(eq(applications.id, a.id));
  return c.json({ ok: true }, 201);
});

const roundSchema = z.object({ name: z.string().trim().min(1, 'Name the round.').max(120), at: z.string().datetime({ offset: true }).optional().or(z.literal('')), status: z.enum(['scheduled', 'done', 'cancelled']).default('scheduled'), feedback: z.string().trim().max(4000).optional() });

applicationRoutes.post('/:id/rounds', async (c) => {
  const auth = requireAuth(c);
  const a = await loadOwn(idParam(c), auth.user.id);
  const r = await body(c, roundSchema);
  const round = { id: newId(), name: r.name, at: r.at || undefined, status: r.status, feedback: r.feedback };
  const [row] = await db.update(applications).set({ rounds: [...a.rounds, round], updatedAt: new Date() }).where(eq(applications.id, a.id)).returning();
  await logEvent(a.id, { kind: 'round', note: `Round added: ${r.name}` });
  return c.json({ application: row, round }, 201);
});

applicationRoutes.patch('/:id/rounds/:roundId', async (c) => {
  const auth = requireAuth(c);
  const a = await loadOwn(idParam(c), auth.user.id);
  const roundId = c.req.param('roundId');
  const existing = a.rounds.find((r) => r.id === roundId);
  if (!existing) throw notFound('Round');
  const r = await body(c, patchSchema(roundSchema));
  const updated = { ...existing, ...r, at: r.at === '' ? undefined : (r.at ?? existing.at) };
  const [row] = await db.update(applications).set({ rounds: a.rounds.map((x) => (x.id === roundId ? updated : x)), updatedAt: new Date() }).where(eq(applications.id, a.id)).returning();
  if (r.status && r.status !== existing.status) await logEvent(a.id, { kind: 'round', note: `${existing.name}: ${r.status}` });
  return c.json({ application: row });
});

applicationRoutes.delete('/:id/rounds/:roundId', async (c) => {
  const auth = requireAuth(c);
  const a = await loadOwn(idParam(c), auth.user.id);
  const roundId = c.req.param('roundId');
  if (!a.rounds.some((r) => r.id === roundId)) throw notFound('Round');
  const [row] = await db.update(applications).set({ rounds: a.rounds.filter((x) => x.id !== roundId), updatedAt: new Date() }).where(eq(applications.id, a.id)).returning();
  return c.json({ application: row });
});

applicationRoutes.delete('/:id', async (c) => {
  const auth = requireAuth(c);
  const a = await loadOwn(idParam(c), auth.user.id);
  if (a.jobApplicationId && !['withdrawn', 'rejected', 'accepted'].includes(a.status))
    throw badRequest('This application was sent through the platform. Withdraw it first so the employer knows, then delete it from your tracker.');
  await db.delete(applications).where(eq(applications.id, a.id));
  return c.json({ ok: true });
});
