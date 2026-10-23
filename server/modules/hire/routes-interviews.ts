/** Interviews (scheduling, calendar, structured feedback) and offers. Mounted under /api/hire. */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { interviewFeedback, interviews, jobApplications, jobPostings, memberships, offers, users } from '../../db/schema';
import { type AppEnv, requireAuth, requireOrgRole, rolesIn } from '../../lib/context';
import { body, idParam, query, patchSchema } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { formatInTz } from './time';
import {
  INTERVIEWER_CAPABLE,
  JITSI_NOTE,
  MANAGE_ROLES,
  VIEW_ROLES,
  expireOffers,
  hasAny,
  hireOrg,
  jitsiUrl,
  loadApplication,
  userNames,
} from './service';

export const interviewRoutes = new Hono<AppEnv>();

const KINDS = ['technical', 'behavioral', 'system_design', 'hr', 'panel'] as const;
const KIND_LABEL: Record<string, string> = { technical: 'Technical', behavioral: 'Behavioral', system_design: 'System design', hr: 'HR', panel: 'Panel' };

async function assertInterviewers(orgId: string, ids: string[]) {
  if (!ids.length) throw badRequest('Choose at least one interviewer.', { fields: { interviewerIds: 'Choose at least one interviewer.' } });
  const rows = await db.select({ userId: memberships.userId, roles: memberships.roles }).from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.status, 'active'), inArray(memberships.userId, ids)));
  const ok = new Set(rows.filter((r) => hasAny(r.roles, INTERVIEWER_CAPABLE)).map((r) => r.userId));
  const bad = ids.filter((id) => !ok.has(id));
  if (bad.length) throw badRequest('Interviewers must be members of this company with the Interviewer or Recruiter role.', { fields: { interviewerIds: 'Pick interviewers from your team.' } });
}

/** Team members who can interview (for pickers). */
interviewRoutes.get('/interviewers', async (c) => {
  const { orgId } = hireOrg(c, MANAGE_ROLES);
  const rows = await db
    .select({ userId: users.id, name: users.name, roles: memberships.roles, title: memberships.title })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, 'active')))
    .orderBy(asc(users.name));
  return c.json({ items: rows.filter((r) => hasAny(r.roles, INTERVIEWER_CAPABLE)) });
});

async function loadInterview(c: Parameters<typeof requireAuth>[0], id: string) {
  const auth = requireAuth(c);
  const [iv] = await db.select().from(interviews).where(eq(interviews.id, id));
  if (!iv) throw notFound('Interview');
  const held = rolesIn(auth, iv.orgId);
  const canManage = hasAny(held, MANAGE_ROLES);
  const assigned = iv.interviewerIds.includes(auth.user.id);
  if (!canManage && !(assigned && hasAny(held, VIEW_ROLES))) throw notFound('Interview');
  return { iv, canManage, assigned };
}

function ivView(i: typeof interviews.$inferSelect, extra: { candidateName?: string; jobTitle?: string; postingId?: string; names: Map<string, string> }) {
  return {
    id: i.id,
    applicationId: i.applicationId,
    candidateId: i.candidateId,
    candidateName: extra.candidateName ?? 'Candidate',
    jobTitle: extra.jobTitle ?? null,
    postingId: extra.postingId ?? null,
    title: i.title,
    kind: i.kind,
    kindLabel: KIND_LABEL[i.kind] ?? i.kind,
    scheduledAt: i.scheduledAt,
    durationMinutes: i.durationMinutes,
    meetingUrl: i.meetingUrl,
    meetingProvider: i.meetingProvider,
    meetingNote: i.meetingProvider === 'jitsi' ? JITSI_NOTE : null,
    interviewers: i.interviewerIds.map((id) => ({ id, name: extra.names.get(id) ?? 'Former member' })),
    status: i.status,
  };
}

interviewRoutes.get('/interviews', async (c) => {
  const auth = requireAuth(c);
  const { orgId, canManage } = hireOrg(c);
  const q = query(
    c,
    z.object({
      from: z.string().datetime({ offset: true }).optional(),
      to: z.string().datetime({ offset: true }).optional(),
      status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
      mine: z.enum(['true', 'false']).optional(),
    }),
  );
  const onlyMine = !canManage || q.mine === 'true';
  const rows = await db
    .select({ iv: interviews, candidateName: users.name, jobTitle: jobPostings.title, postingId: jobPostings.id })
    .from(interviews)
    .innerJoin(users, eq(users.id, interviews.candidateId))
    .leftJoin(jobApplications, eq(jobApplications.id, interviews.applicationId))
    .leftJoin(jobPostings, eq(jobPostings.id, jobApplications.postingId))
    .where(
      and(
        eq(interviews.orgId, orgId),
        onlyMine ? sql`${auth.user.id}::uuid = ANY(${interviews.interviewerIds})` : undefined,
        q.from ? gte(interviews.scheduledAt, new Date(q.from)) : undefined,
        q.to ? lte(interviews.scheduledAt, new Date(q.to)) : undefined,
        q.status ? eq(interviews.status, q.status) : undefined,
      ),
    )
    .orderBy(asc(interviews.scheduledAt))
    .limit(500);
  const names = await userNames(rows.flatMap((r) => r.iv.interviewerIds));
  const fb = rows.length ? await db.select({ interviewId: interviewFeedback.interviewId, interviewerId: interviewFeedback.interviewerId }).from(interviewFeedback).where(inArray(interviewFeedback.interviewId, rows.map((r) => r.iv.id))) : [];
  return c.json({
    items: rows.map((r) => ({
      ...ivView(r.iv, { candidateName: r.candidateName, jobTitle: r.jobTitle ?? undefined, postingId: r.postingId ?? undefined, names }),
      feedbackCount: fb.filter((f) => f.interviewId === r.iv.id).length,
      myFeedbackSubmitted: fb.some((f) => f.interviewId === r.iv.id && f.interviewerId === auth.user.id),
      iAmInterviewer: r.iv.interviewerIds.includes(auth.user.id),
    })),
    canManage,
  });
});

const scheduleInput = z.object({
  applicationId: z.string().uuid(),
  title: z.string().trim().min(3).max(160).optional(),
  kind: z.enum(KINDS).default('technical'),
  scheduledAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(480).default(45),
  interviewerIds: z.array(z.string().uuid()).min(1, 'Choose at least one interviewer.').max(8),
  meeting: z.discriminatedUnion('provider', [z.object({ provider: z.literal('jitsi') }), z.object({ provider: z.literal('custom'), url: z.string().url('Enter a full https:// meeting link.').max(500) }), z.object({ provider: z.literal('none') })]).default({ provider: 'jitsi' }),
});

async function notifyInterviewParties(iv: typeof interviews.$inferSelect, jobTitle: string, n: { title: string; body: string }, actorId: string) {
  await notify(iv.candidateId, { type: 'hire.interview', category: 'career', title: n.title, body: n.body, link: iv.applicationId ? `/app/jobs/applications/${iv.applicationId}` : undefined });
  for (const uid of iv.interviewerIds) {
    if (uid === actorId) continue;
    await notify(uid, { type: 'hire.interview', category: 'career', orgId: iv.orgId, title: `${n.title} (${jobTitle})`, body: n.body, link: `/app/hire/interviews/${iv.id}` });
  }
}

interviewRoutes.post('/interviews', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, scheduleInput);
  const { app, job } = await loadApplication(c, input.applicationId, 'manage');
  if (app.status !== 'active') throw conflict('Interviews can only be scheduled for active applications.');
  const at = new Date(input.scheduledAt);
  if (at.getTime() < Date.now() - 5 * 60_000) throw badRequest('Pick a time in the future.', { fields: { scheduledAt: 'Pick a time in the future.' } });
  const ids = [...new Set(input.interviewerIds)];
  await assertInterviewers(app.orgId, ids);
  const meetingUrl = input.meeting.provider === 'jitsi' ? jitsiUrl() : input.meeting.provider === 'custom' ? input.meeting.url : null;
  const [iv] = await db
    .insert(interviews)
    .values({
      orgId: app.orgId,
      applicationId: app.id,
      candidateId: app.candidateId,
      title: input.title ?? `${KIND_LABEL[input.kind]} interview: ${job.title}`,
      kind: input.kind,
      scheduledAt: at,
      durationMinutes: input.durationMinutes,
      meetingUrl,
      meetingProvider: input.meeting.provider === 'none' ? null : input.meeting.provider,
      interviewerIds: ids,
      createdBy: auth.user.id,
    })
    .returning();
  await audit(c, { action: 'hire.interview.scheduled', orgId: app.orgId, targetType: 'interview', targetId: iv.id, meta: { applicationId: app.id, scheduledAt: iv.scheduledAt, interviewerIds: ids } });
  const [cand] = await db.select({ tz: users.timezone }).from(users).where(eq(users.id, app.candidateId));
  await notifyInterviewParties(iv, job.title, { title: `Interview scheduled: ${job.title}`, body: `${KIND_LABEL[iv.kind]} interview on ${formatInTz(iv.scheduledAt, cand?.tz)} for ${iv.durationMinutes} minutes.${meetingUrl ? ' The meeting link is on the application page.' : ''}` }, auth.user.id);
  const names = await userNames(ids);
  return c.json({ interview: ivView(iv, { names, jobTitle: job.title, postingId: job.id }) }, 201);
});

interviewRoutes.get('/interviews/pending-feedback', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = hireOrg(c);
  const rows = await db
    .select({ iv: interviews, candidateName: users.name })
    .from(interviews)
    .innerJoin(users, eq(users.id, interviews.candidateId))
    .where(
      and(
        eq(interviews.orgId, orgId),
        sql`${auth.user.id}::uuid = ANY(${interviews.interviewerIds})`,
        inArray(interviews.status, ['scheduled', 'completed']),
        lte(interviews.scheduledAt, new Date()),
        sql`NOT EXISTS (select 1 from interview_feedback f where f.interview_id = ${interviews.id} and f.interviewer_id = ${auth.user.id}::uuid)`,
      ),
    )
    .orderBy(asc(interviews.scheduledAt));
  return c.json({ items: rows.map((r) => ({ id: r.iv.id, title: r.iv.title, candidateName: r.candidateName, scheduledAt: r.iv.scheduledAt })) });
});

interviewRoutes.get('/interviews/:id', async (c) => {
  const auth = requireAuth(c);
  const { iv, canManage, assigned } = await loadInterview(c, idParam(c));
  const [cand] = await db.select({ name: users.name }).from(users).where(eq(users.id, iv.candidateId));
  const [job] = iv.applicationId
    ? await db.select({ id: jobPostings.id, title: jobPostings.title }).from(jobApplications).innerJoin(jobPostings, eq(jobPostings.id, jobApplications.postingId)).where(eq(jobApplications.id, iv.applicationId))
    : [];
  const fb = await db.select().from(interviewFeedback).where(eq(interviewFeedback.interviewId, iv.id)).orderBy(interviewFeedback.submittedAt);
  const mine = fb.find((f) => f.interviewerId === auth.user.id) ?? null;
  // Bias reduction: an interviewer sees colleagues' feedback only after submitting their own. Recruiters see all.
  const canSeeAll = canManage || !!mine;
  const names = await userNames([...iv.interviewerIds, ...fb.map((f) => f.interviewerId)]);
  return c.json({
    interview: ivView(iv, { candidateName: cand?.name, jobTitle: job?.title, postingId: job?.id, names }),
    feedback: fb
      .filter((f) => canSeeAll || f.interviewerId === auth.user.id)
      .map((f) => ({ id: f.id, interviewerId: f.interviewerId, interviewerName: names.get(f.interviewerId) ?? 'Former member', recommendation: f.recommendation, scores: f.scores, summary: f.summary, submittedAt: f.submittedAt })),
    hiddenFeedbackCount: canSeeAll ? 0 : fb.filter((f) => f.interviewerId !== auth.user.id).length,
    myFeedback: mine,
    permissions: { canManage, canSubmitFeedback: assigned && !mine && iv.status !== 'cancelled', isInterviewer: assigned },
    competencies: ['Problem solving', 'Technical depth', 'Communication', 'Collaboration', 'Role knowledge'],
    rubric: { 1: 'Little or no evidence', 2: 'Some evidence, with gaps', 3: 'Solid evidence', 4: 'Strong, consistent evidence' },
    biasNote: 'Rate what you observed against the competencies only. Do not consider age, gender, background, accent, appearance or other personal characteristics.',
  });
});

interviewRoutes.patch('/interviews/:id', async (c) => {
  const auth = requireAuth(c);
  const { iv } = await loadInterview(c, idParam(c));
  requireOrgRole(c, iv.orgId, MANAGE_ROLES);
  if (iv.status === 'cancelled') throw conflict('This interview was cancelled. Schedule a new one instead.');
  const input = await body(
    c,
    z.object({
      title: z.string().trim().min(3).max(160).optional(),
      kind: z.enum(KINDS).optional(),
      scheduledAt: z.string().datetime({ offset: true }).optional(),
      durationMinutes: z.number().int().min(15).max(480).optional(),
      interviewerIds: z.array(z.string().uuid()).min(1).max(8).optional(),
      meeting: z.discriminatedUnion('provider', [z.object({ provider: z.literal('jitsi') }), z.object({ provider: z.literal('custom'), url: z.string().url().max(500) }), z.object({ provider: z.literal('none') })]).optional(),
      status: z.enum(['scheduled', 'completed', 'no_show']).optional(),
    }),
  );
  if (input.interviewerIds) await assertInterviewers(iv.orgId, [...new Set(input.interviewerIds)]);
  const meeting = input.meeting ? { meetingUrl: input.meeting.provider === 'jitsi' ? jitsiUrl() : input.meeting.provider === 'custom' ? input.meeting.url : null, meetingProvider: input.meeting.provider === 'none' ? null : input.meeting.provider } : {};
  const [row] = await db
    .update(interviews)
    .set({
      ...(input.title ? { title: input.title } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.scheduledAt ? { scheduledAt: new Date(input.scheduledAt) } : {}),
      ...(input.durationMinutes ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.interviewerIds ? { interviewerIds: [...new Set(input.interviewerIds)] } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...meeting,
    })
    .where(eq(interviews.id, iv.id))
    .returning();
  const rescheduled = !!input.scheduledAt && new Date(input.scheduledAt).getTime() !== iv.scheduledAt.getTime();
  await audit(c, { action: rescheduled ? 'hire.interview.rescheduled' : 'hire.interview.updated', orgId: iv.orgId, targetType: 'interview', targetId: iv.id, meta: { fields: Object.keys(input), from: iv.scheduledAt, to: row.scheduledAt } });
  if (rescheduled || input.meeting || input.interviewerIds) {
    const [cand] = await db.select({ tz: users.timezone }).from(users).where(eq(users.id, iv.candidateId));
    const [job] = row.applicationId ? await db.select({ title: jobPostings.title }).from(jobApplications).innerJoin(jobPostings, eq(jobPostings.id, jobApplications.postingId)).where(eq(jobApplications.id, row.applicationId)) : [];
    await notifyInterviewParties(row, job?.title ?? 'interview', { title: rescheduled ? 'Interview rescheduled' : 'Interview details updated', body: `Now on ${formatInTz(row.scheduledAt, cand?.tz)} for ${row.durationMinutes} minutes.` }, auth.user.id);
  }
  const names = await userNames(row.interviewerIds);
  return c.json({ interview: ivView(row, { names }) });
});

interviewRoutes.post('/interviews/:id/cancel', async (c) => {
  const auth = requireAuth(c);
  const { iv } = await loadInterview(c, idParam(c));
  requireOrgRole(c, iv.orgId, MANAGE_ROLES);
  const { reason } = await body(c, z.object({ reason: z.string().trim().max(500).optional() }));
  if (iv.status === 'cancelled') throw conflict('This interview is already cancelled.');
  const [row] = await db.update(interviews).set({ status: 'cancelled' }).where(eq(interviews.id, iv.id)).returning();
  await audit(c, { action: 'hire.interview.cancelled', orgId: iv.orgId, targetType: 'interview', targetId: iv.id, meta: { reason } });
  await notifyInterviewParties(row, 'interview', { title: 'Interview cancelled', body: `The interview planned for ${formatInTz(iv.scheduledAt, null)} was cancelled.${reason ? ` ${reason}` : ''} The team will be in touch about next steps.` }, auth.user.id);
  return c.json({ interview: { id: row.id, status: row.status } });
});

const feedbackInput = z.object({
  recommendation: z.enum(['strong_yes', 'yes', 'no', 'strong_no']),
  scores: z.array(z.object({ competency: z.string().trim().min(2).max(80), rating: z.number().int().min(1).max(4), note: z.string().trim().max(1000).optional() })).min(1, 'Rate at least one competency.').max(12),
  summary: z.string().trim().min(10, 'Write a short summary (at least 10 characters).').max(5000),
});

interviewRoutes.post('/interviews/:id/feedback', async (c) => {
  const auth = requireAuth(c);
  const { iv, assigned } = await loadInterview(c, idParam(c));
  if (!assigned) throw forbidden('Only interviewers assigned to this interview can submit feedback.');
  if (iv.status === 'cancelled') throw conflict('This interview was cancelled.');
  const input = await body(c, feedbackInput);
  const [row] = await db
    .insert(interviewFeedback)
    .values({ interviewId: iv.id, interviewerId: auth.user.id, recommendation: input.recommendation, scores: input.scores, summary: input.summary })
    .onConflictDoNothing()
    .returning();
  if (!row) throw conflict('You already submitted feedback for this interview.');
  if (iv.status === 'scheduled' && iv.scheduledAt.getTime() <= Date.now() + 60 * 60_000) await db.update(interviews).set({ status: 'completed' }).where(eq(interviews.id, iv.id));
  await audit(c, { action: 'hire.interview.feedback_submitted', orgId: iv.orgId, targetType: 'interview', targetId: iv.id, meta: { recommendation: input.recommendation } });
  const [job] = iv.applicationId ? await db.select({ title: jobPostings.title, createdBy: jobPostings.createdBy }).from(jobApplications).innerJoin(jobPostings, eq(jobPostings.id, jobApplications.postingId)).where(eq(jobApplications.id, iv.applicationId)) : [];
  if (job && job.createdBy !== auth.user.id) await notify(job.createdBy, { type: 'hire.feedback', category: 'career', orgId: iv.orgId, title: `Interview feedback submitted: ${job.title}`, body: `${auth.user.name} submitted feedback.`, link: iv.applicationId ? `/app/hire/candidates/${iv.applicationId}` : undefined });
  return c.json({ feedback: row }, 201);
});

// =====================================================================
// Offers
// =====================================================================

const offerInput = z.object({
  title: z.string().trim().min(3).max(160),
  compensationText: z.string().trim().min(2, 'Describe the compensation.').max(1000),
  startDate: z.string().datetime({ offset: true }).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
});

async function loadOffer(c: Parameters<typeof requireAuth>[0], id: string) {
  const auth = requireAuth(c);
  const [o] = await db.select().from(offers).where(eq(offers.id, id));
  if (!o || !hasAny(rolesIn(auth, o.orgId), VIEW_ROLES)) throw notFound('Offer');
  requireOrgRole(c, o.orgId, MANAGE_ROLES);
  return o;
}

interviewRoutes.get('/offers', async (c) => {
  const { orgId } = hireOrg(c, MANAGE_ROLES);
  await expireOffers(eq(offers.orgId, orgId));
  const status = c.req.query('status');
  const rows = await db
    .select({ o: offers, candidateName: users.name, jobTitle: jobPostings.title, postingId: jobPostings.id, stage: jobApplications.stage })
    .from(offers)
    .innerJoin(jobApplications, eq(jobApplications.id, offers.applicationId))
    .innerJoin(jobPostings, eq(jobPostings.id, jobApplications.postingId))
    .innerJoin(users, eq(users.id, jobApplications.candidateId))
    .where(and(eq(offers.orgId, orgId), status ? eq(offers.status, status) : undefined))
    .orderBy(desc(offers.updatedAt))
    .limit(300);
  return c.json({ items: rows.map((r) => ({ ...r.o, candidateName: r.candidateName, jobTitle: r.jobTitle, postingId: r.postingId, applicationStage: r.stage })) });
});

interviewRoutes.post('/offers', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, offerInput.extend({ applicationId: z.string().uuid() }));
  const { app } = await loadApplication(c, input.applicationId, 'manage');
  if (app.status !== 'active' || app.stage !== 'offer') throw conflict('Move the candidate to the Offer stage before drafting an offer.');
  const [open] = await db.select({ id: offers.id }).from(offers).where(and(eq(offers.applicationId, app.id), inArray(offers.status, ['draft', 'extended'])));
  if (open) throw conflict('This candidate already has an open offer. Edit or rescind it first.');
  const [row] = await db
    .insert(offers)
    .values({
      orgId: app.orgId,
      applicationId: app.id,
      title: input.title,
      compensationText: input.compensationText,
      startDate: input.startDate ? new Date(input.startDate) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      notes: input.notes ?? null,
      createdBy: auth.user.id,
    })
    .returning();
  await audit(c, { action: 'hire.offer.drafted', orgId: app.orgId, targetType: 'offer', targetId: row.id, meta: { applicationId: app.id } });
  return c.json({ offer: row }, 201);
});

interviewRoutes.patch('/offers/:id', async (c) => {
  const o = await loadOffer(c, idParam(c));
  if (o.status !== 'draft' && o.status !== 'extended') throw conflict(`This offer is ${o.status} and can no longer be edited.`);
  const input = await body(c, patchSchema(offerInput));
  if (o.status === 'extended' && Object.keys(input).some((k) => k !== 'expiresAt' && k !== 'notes')) throw conflict('An extended offer can only have its expiry or internal notes changed. Rescind it and draft a new one to change terms.');
  const [row] = await db
    .update(offers)
    .set({
      ...(input.title ? { title: input.title } : {}),
      ...(input.compensationText ? { compensationText: input.compensationText } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(input.startDate) : null } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedAt: new Date(),
    })
    .where(eq(offers.id, o.id))
    .returning();
  await audit(c, { action: 'hire.offer.updated', orgId: o.orgId, targetType: 'offer', targetId: o.id, meta: { fields: Object.keys(input) } });
  return c.json({ offer: row });
});

interviewRoutes.post('/offers/:id/extend', async (c) => {
  const o = await loadOffer(c, idParam(c));
  if (o.status !== 'draft') throw conflict('Only a draft offer can be extended.');
  if (o.expiresAt && o.expiresAt.getTime() <= Date.now()) throw badRequest('The expiry date has passed. Set a future expiry first.', { fields: { expiresAt: 'Set a future date.' } });
  const [app] = await db.select().from(jobApplications).where(eq(jobApplications.id, o.applicationId));
  if (!app || app.status !== 'active') throw conflict('The application is no longer active.');
  const [row] = await db.update(offers).set({ status: 'extended', updatedAt: new Date() }).where(eq(offers.id, o.id)).returning();
  await audit(c, { action: 'hire.offer.extended', orgId: o.orgId, targetType: 'offer', targetId: o.id, meta: { applicationId: o.applicationId, expiresAt: o.expiresAt } });
  await notify(app.candidateId, {
    type: 'hire.offer_extended',
    category: 'career',
    title: `You received an offer: ${o.title}`,
    body: `Review the details and respond${o.expiresAt ? ` by ${o.expiresAt.toUTCString()}` : ''}.`,
    link: `/app/jobs/applications/${app.id}`,
  });
  return c.json({ offer: row });
});

interviewRoutes.post('/offers/:id/rescind', async (c) => {
  const o = await loadOffer(c, idParam(c));
  const { reason } = await body(c, z.object({ reason: z.string().trim().min(5, 'Write a short reason (at least 5 characters).').max(1000) }));
  if (o.status !== 'draft' && o.status !== 'extended') throw conflict(`This offer is ${o.status}.`);
  const [row] = await db.update(offers).set({ status: 'rescinded', notes: [o.notes, `Rescinded: ${reason}`].filter(Boolean).join('\n'), updatedAt: new Date() }).where(eq(offers.id, o.id)).returning();
  await audit(c, { action: 'hire.offer.rescinded', orgId: o.orgId, targetType: 'offer', targetId: o.id, meta: { reason, wasExtended: o.status === 'extended' } });
  if (o.status === 'extended') {
    const [app] = await db.select({ candidateId: jobApplications.candidateId, id: jobApplications.id }).from(jobApplications).where(eq(jobApplications.id, o.applicationId));
    if (app) await notify(app.candidateId, { type: 'hire.offer_rescinded', category: 'career', title: `Offer withdrawn: ${o.title}`, body: 'The employer withdrew this offer. Contact them through the application messages if you have questions.', link: `/app/jobs/applications/${app.id}` });
  }
  return c.json({ offer: row });
});
