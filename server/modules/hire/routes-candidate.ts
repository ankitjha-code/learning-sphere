/**
 * Candidate-side endpoints of TalentBridge: discoverability opt-in, the candidate's view of a
 * platform application (stage, interviews, offers), messages with recruiters and offer responses.
 * Every query filters by the signed-in user, so other people get 404.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { assessmentInvites, assessments, hireCandidatePreferences, hiringDecisions, interviews, jobApplications, jobPostings, messages, offers, organizations } from '../../db/schema';
import { type AppEnv, type Ctx, requireAuth } from '../../lib/context';
import { body, idParam } from '../../lib/validate';
import { conflict, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { rateLimit } from '../../lib/ratelimit';
import { JITSI_NOTE, expireOffers, notifyRecruiters, stageLabel, syncPersonalTracker, threadKeyFor, threadMessages, unreadCounts, userNames } from './service';

export const candidateRoutes = new Hono<AppEnv>();

// ---------- Discoverability ----------

const DISCOVERABILITY_EXPLAINER =
  'When on, recruiters on LearnSphere Nexus can find you in candidate search by your skills and their evidence, headline, location and graduation year. They never see your email or phone, and contact happens through platform messages. Employers you applied to, and companies in campus drives you were invited to, can see your application either way.';

candidateRoutes.get('/candidate-preferences', async (c) => {
  const auth = requireAuth(c);
  const [p] = await db.select().from(hireCandidatePreferences).where(eq(hireCandidatePreferences.userId, auth.user.id));
  return c.json({ discoverableByRecruiters: p?.discoverableByRecruiters ?? false, updatedAt: p?.updatedAt ?? null, explainer: DISCOVERABILITY_EXPLAINER });
});

candidateRoutes.patch('/candidate-preferences', async (c) => {
  const auth = requireAuth(c);
  const { discoverableByRecruiters } = await body(c, z.object({ discoverableByRecruiters: z.boolean() }));
  await db
    .insert(hireCandidatePreferences)
    .values({ userId: auth.user.id, discoverableByRecruiters })
    .onConflictDoUpdate({ target: hireCandidatePreferences.userId, set: { discoverableByRecruiters, updatedAt: new Date() } });
  await audit(c, { action: 'hire.discoverability.changed', targetType: 'user', targetId: auth.user.id, meta: { discoverableByRecruiters } });
  return c.json({ discoverableByRecruiters, explainer: DISCOVERABILITY_EXPLAINER });
});

// ---------- Candidate's application view ----------

async function ownApplication(c: Ctx, id: string) {
  const auth = requireAuth(c);
  const [row] = await db
    .select({ app: jobApplications, job: jobPostings, orgName: organizations.name, orgIsSample: organizations.isSample })
    .from(jobApplications)
    .innerJoin(jobPostings, eq(jobPostings.id, jobApplications.postingId))
    .innerJoin(organizations, eq(organizations.id, jobApplications.orgId))
    .where(and(eq(jobApplications.id, id), eq(jobApplications.candidateId, auth.user.id)));
  if (!row) throw notFound('Application');
  return row;
}

candidateRoutes.get('/my-applications/:jobApplicationId', async (c) => {
  const auth = requireAuth(c);
  const { app, job, orgName, orgIsSample } = await ownApplication(c, idParam(c, 'jobApplicationId'));
  await expireOffers(eq(offers.applicationId, app.id));
  const [decisions, ivs, offerRows, invites, unread] = await Promise.all([
    db
      .select({ toStage: hiringDecisions.toStage, reason: hiringDecisions.reason, createdAt: hiringDecisions.createdAt })
      .from(hiringDecisions)
      .where(and(eq(hiringDecisions.applicationId, app.id), eq(hiringDecisions.visibleToCandidate, true)))
      .orderBy(asc(hiringDecisions.createdAt)),
    db.select().from(interviews).where(and(eq(interviews.applicationId, app.id), eq(interviews.candidateId, auth.user.id))).orderBy(asc(interviews.scheduledAt)),
    db.select().from(offers).where(and(eq(offers.applicationId, app.id), inArray(offers.status, ['extended', 'accepted', 'declined', 'rescinded', 'expired']))).orderBy(desc(offers.createdAt)),
    db
      .select({ assessmentId: assessmentInvites.assessmentId, status: assessmentInvites.status, dueAt: assessmentInvites.dueAt, title: assessments.title })
      .from(assessmentInvites)
      .innerJoin(assessments, eq(assessments.id, assessmentInvites.assessmentId))
      .where(and(eq(assessmentInvites.applicationId, app.id), eq(assessmentInvites.userId, auth.user.id))),
    unreadCounts([app.id], auth.user.id),
  ]);
  const names = await userNames(ivs.flatMap((i) => i.interviewerIds));
  const closed = app.status !== 'active';
  return c.json({
    application: {
      id: app.id,
      stage: app.stage,
      stageLabel: stageLabel(app.stage),
      status: app.status,
      appliedAt: app.appliedAt,
      updatedAt: app.updatedAt,
      portfolioShared: app.portfolioShared,
      coverNote: app.coverNote,
    },
    job: { id: job.id, title: job.title, company: orgName, isSample: orgIsSample, location: job.location, status: job.status },
    // The candidate sees the public stage path, never internal notes.
    stages: job.stages.map((s) => ({ key: s, label: stageLabel(s), current: s === app.stage, passed: job.stages.indexOf(s) < job.stages.indexOf(app.stage) })),
    updates: decisions.map((d) => ({ stage: stageLabel(d.toStage), note: d.reason, at: d.createdAt })),
    interviews: ivs
      .filter((i) => i.status !== 'cancelled' || i.scheduledAt.getTime() > Date.now() - 7 * 86400_000)
      .map((i) => ({ id: i.id, title: i.title, kind: i.kind, scheduledAt: i.scheduledAt, durationMinutes: i.durationMinutes, status: i.status, meetingUrl: i.status === 'scheduled' ? i.meetingUrl : null, meetingNote: i.meetingProvider === 'jitsi' ? JITSI_NOTE : null, interviewers: i.interviewerIds.map((id) => names.get(id) ?? 'Interviewer') })),
    offers: offerRows.map((o) => ({ id: o.id, title: o.title, compensationText: o.compensationText, startDate: o.startDate, expiresAt: o.expiresAt, status: o.status, canRespond: o.status === 'extended' && !closed })),
    assessments: invites.map((i) => ({ ...i, link: `/app/assessments/${i.assessmentId}` })),
    unreadMessages: unread.get(app.id) ?? 0,
    canMessage: true,
    closedNote: closed ? (app.status === 'withdrawn' ? 'You withdrew this application.' : app.status === 'declined' ? 'You declined the offer for this role.' : app.status === 'hired' ? 'You accepted this offer.' : 'This application is closed.') : null,
  });
});

candidateRoutes.get('/my-applications/:jobApplicationId/messages', async (c) => {
  const auth = requireAuth(c);
  const { app } = await ownApplication(c, idParam(c, 'jobApplicationId'));
  return c.json({ items: await threadMessages(app.id, auth.user.id) });
});

candidateRoutes.post('/my-applications/:jobApplicationId/messages', async (c) => {
  const auth = requireAuth(c);
  const { app, job } = await ownApplication(c, idParam(c, 'jobApplicationId'));
  rateLimit(`hire-msg:${auth.user.id}`, 60, 3600_000);
  const { body: text } = await body(c, z.object({ body: z.string().trim().min(1, 'Write a message.').max(4000) }));
  const [m] = await db.insert(messages).values({ threadKey: threadKeyFor(app.id), orgId: app.orgId, senderId: auth.user.id, body: text, readBy: [auth.user.id] }).returning();
  await notifyRecruiters(app.orgId, { type: 'hire.message', title: `Message from ${auth.user.name}: ${job.title}`, body: text.slice(0, 200), link: `/app/hire/candidates/${app.id}?tab=messages` });
  return c.json({ message: { id: m.id, body: m.body, createdAt: m.createdAt, mine: true, senderName: auth.user.name } }, 201);
});

// ---------- Offers (candidate) ----------

candidateRoutes.get('/my-offers', async (c) => {
  const auth = requireAuth(c);
  const mine = db.select({ id: jobApplications.id }).from(jobApplications).where(eq(jobApplications.candidateId, auth.user.id));
  await expireOffers(inArray(offers.applicationId, mine));
  const rows = await db
    .select({ o: offers, company: organizations.name, jobTitle: jobPostings.title })
    .from(offers)
    .innerJoin(jobApplications, eq(jobApplications.id, offers.applicationId))
    .innerJoin(jobPostings, eq(jobPostings.id, jobApplications.postingId))
    .innerJoin(organizations, eq(organizations.id, offers.orgId))
    .where(and(eq(jobApplications.candidateId, auth.user.id), inArray(offers.status, ['extended', 'accepted', 'declined', 'rescinded', 'expired'])))
    .orderBy(desc(offers.updatedAt));
  return c.json({
    items: rows.map((r) => ({ id: r.o.id, applicationId: r.o.applicationId, title: r.o.title, company: r.company, jobTitle: r.jobTitle, compensationText: r.o.compensationText, startDate: r.o.startDate, expiresAt: r.o.expiresAt, status: r.o.status })),
  });
});

candidateRoutes.post('/my-offers/:id/respond', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const input = await body(c, z.object({ decision: z.enum(['accept', 'decline']), note: z.string().trim().max(1000).optional() }));
  const [row] = await db
    .select({ o: offers, app: jobApplications, jobTitle: jobPostings.title })
    .from(offers)
    .innerJoin(jobApplications, eq(jobApplications.id, offers.applicationId))
    .innerJoin(jobPostings, eq(jobPostings.id, jobApplications.postingId))
    .where(and(eq(offers.id, id), eq(jobApplications.candidateId, auth.user.id)));
  if (!row || row.o.status === 'draft') throw notFound('Offer');
  const { o, app } = row;
  if (o.status === 'extended' && o.expiresAt && o.expiresAt.getTime() <= Date.now()) {
    await db.update(offers).set({ status: 'expired', updatedAt: new Date() }).where(eq(offers.id, o.id));
    throw conflict('This offer has expired. Message the employer if you are still interested.');
  }
  if (o.status !== 'extended') throw conflict(`This offer is ${o.status} and can no longer be answered.`);
  if (app.status !== 'active') throw conflict('This application is closed.');
  const accept = input.decision === 'accept';
  const toStage = accept ? 'hired' : 'withdrawn';
  const reason = accept ? `Candidate accepted the offer.${input.note ? ` ${input.note}` : ''}` : `Candidate declined the offer.${input.note ? ` ${input.note}` : ''}`;
  await db.transaction(async (tx) => {
    const [u] = await tx
      .update(offers)
      .set({ status: accept ? 'accepted' : 'declined', updatedAt: new Date() })
      .where(and(eq(offers.id, o.id), eq(offers.status, 'extended')))
      .returning();
    if (!u) throw conflict('This offer changed in the meantime. Reload and try again.');
    await tx.update(jobApplications).set({ stage: toStage, status: accept ? 'hired' : 'declined', updatedAt: new Date() }).where(eq(jobApplications.id, app.id));
    await tx.insert(hiringDecisions).values({ applicationId: app.id, orgId: app.orgId, decidedBy: auth.user.id, fromStage: app.stage, toStage, reason, visibleToCandidate: true });
  });
  await audit(c, { action: accept ? 'hire.offer.accepted' : 'hire.offer.declined', orgId: app.orgId, targetType: 'offer', targetId: o.id, meta: { applicationId: app.id } });
  await syncPersonalTracker(app.id, auth.user.id, toStage, null, accept ? 'You accepted the offer' : 'You declined the offer');
  await notifyRecruiters(app.orgId, {
    type: accept ? 'hire.offer_accepted' : 'hire.offer_declined',
    title: `${auth.user.name} ${accept ? 'accepted' : 'declined'} the offer: ${row.jobTitle}`,
    body: input.note?.slice(0, 200),
    link: `/app/hire/candidates/${app.id}`,
  });
  return c.json({ offer: { id: o.id, status: accept ? 'accepted' : 'declined' }, application: { id: app.id, stage: toStage, status: accept ? 'hired' : 'declined' } });
});
