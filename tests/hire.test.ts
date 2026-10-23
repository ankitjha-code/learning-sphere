import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupTestApp, registerUser as register } from './helpers';
import { resetRateLimits } from '../server/lib/ratelimit';
import { db } from '../server/db/client';
import {
  organizations,
  memberships,
  skills,
  resumes,
  attempts,
  assessmentInvites,
  hiringDecisions,
  auditLogs,
  applications,
  applicationEvents,
  notifications,
  jobApplications,
} from '../server/db/schema';
import { addEvidence } from '../server/modules/learning/skilldna';

type C = Awaited<ReturnType<typeof register>>;
let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let helix: string, orbit: string;
let recruiter: C, interviewer: C, interviewer2: C, orbitRec: C, candidate: C, candidate2: C, outsider: C, discoverable: C;
const skillId: Record<string, string> = {};
let jobId: string, app1: string, app2: string, assessmentId: string, interviewId: string, offerId: string;

const registerUser = (name: string, email: string) => {
  resetRateLimits();
  return register(ctx.app, name, email);
};
async function org(name: string) {
  const [o] = await db.insert(organizations).values({ name, slug: name.toLowerCase().replace(/\s+/g, '-'), kind: 'company' }).returning();
  return o.id;
}
async function member(orgId: string, c: C, roles: string[]) {
  await db.insert(memberships).values({ orgId, userId: c.userId, roles });
  expect((await c.post('/api/auth/switch', { orgId })).status).toBe(200);
}

const PROTECTED = ['dob', 'dateOfBirth', 'birthDate', 'age', 'gender', 'sex', 'photo', 'photoUrl', 'avatarUrl', 'religion', 'caste', 'maritalStatus', 'nationality', 'email', 'phone'];
function protectedKeys(v: unknown, path = ''): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => protectedKeys(x, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => [...(PROTECTED.includes(k) ? [`${path}.${k}`] : []), ...protectedKeys(x, `${path}.${k}`)]);
  return [];
}

const JOB = {
  title: 'Backend Engineer (Python)',
  team: 'Platform',
  location: 'Bengaluru',
  workplace: 'hybrid',
  employmentType: 'full_time',
  description: 'Short.',
  responsibilities: ['Build APIs', 'Write SQL'],
  requiredSkills: [
    { slug: 'python', required: true },
    { slug: 'sql-basics', required: true },
    { slug: 'http-rest', required: false },
  ],
  eligibility: { minExperienceYears: 0, graduationYears: [2025, 2026], workAuthorization: 'Eligible to work in India' },
  salaryText: 'INR 12-18 LPA',
};

beforeAll(async () => {
  ctx = await setupTestApp();
  for (const [slug, name] of [
    ['python', 'Python'],
    ['sql-basics', 'SQL basics'],
    ['http-rest', 'HTTP and REST'],
  ]) {
    const [s] = await db.insert(skills).values({ slug, name, category: 'programming', level: 1 }).returning();
    skillId[slug] = s.id;
  }
  helix = await org('Helix Test');
  orbit = await org('Orbit Test');
  recruiter = await registerUser('Rita Recruiter', 'rita@helix.test');
  interviewer = await registerUser('Ivan Interviewer', 'ivan@helix.test');
  interviewer2 = await registerUser('Ines Interviewer', 'ines@helix.test');
  orbitRec = await registerUser('Otto Orbit', 'otto@orbit.test');
  candidate = await registerUser('Cara Candidate', 'cara@example.test');
  candidate2 = await registerUser('Cole Candidate', 'cole@example.test');
  outsider = await registerUser('Olive Outsider', 'olive@example.test');
  discoverable = await registerUser('Dana Discoverable', 'dana@example.test');
  await member(helix, recruiter, ['recruiter_admin', 'recruiter']);
  await member(helix, interviewer, ['interviewer']);
  await member(helix, interviewer2, ['interviewer']);
  await member(orbit, orbitRec, ['recruiter_admin', 'recruiter']);
  // Candidate evidence: Python verified by a graded assessment, SQL only self-rated, HTTP none.
  await addEvidence({ userId: candidate.userId, skillId: skillId.python, source: 'assessment', sourceId: 'a1', score: 0.9, verified: true });
  await addEvidence({ userId: candidate.userId, skillId: skillId['sql-basics'], source: 'self', score: 0.75 });
  await addEvidence({ userId: discoverable.userId, skillId: skillId.python, source: 'project', sourceId: 'p1', score: 0.8 });
  await addEvidence({ userId: outsider.userId, skillId: skillId.python, source: 'assessment', sourceId: 'a2', score: 0.95, verified: true });
});
afterAll(async () => ctx.close());

describe('Journey 4: employer hiring workflow', () => {
  it('creates a job with validated requirements and stages', async () => {
    const badStages = await recruiter.post('/api/hire/jobs', { ...JOB, stages: ['applied', 'interview'] });
    expect(badStages.status).toBe(400);
    expect(badStages.body.error.details.fields.stages).toBeTruthy();
    const badSkill = await recruiter.post('/api/hire/jobs', { ...JOB, requiredSkills: [{ slug: 'cobol-9000', required: true }] });
    expect(badSkill.status).toBe(400);
    const r = await recruiter.post('/api/hire/jobs', JOB);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.job.status).toBe('draft');
    expect(r.body.job.stages).toEqual(['applied', 'eligibility_review', 'shortlisted', 'assessment', 'interview', 'offer', 'hired']);
    expect(r.body.job.requiredSkills[0]).toMatchObject({ slug: 'python', name: 'Python', required: true });
    jobId = r.body.job.id;
  });

  it('publishes only when the checklist passes and the plan allows it', async () => {
    const early = await recruiter.post(`/api/hire/jobs/${jobId}/publish`);
    expect(early.status).toBe(400);
    expect(early.body.error.details.checklist.find((i: { key: string }) => i.key === 'description').ok).toBe(false);
    expect((await recruiter.patch(`/api/hire/jobs/${jobId}`, { description: 'Build and run the Python services that power our learning products, with SQL and REST APIs.' })).status).toBe(200);
    const ok = await recruiter.post(`/api/hire/jobs/${jobId}/publish`);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.job.status).toBe('published');

    // Free plan: one active posting. The second publish is refused with an explanation.
    const second = await recruiter.post('/api/hire/jobs', { ...JOB, title: 'Data Analyst', description: 'Analyse product data with SQL and Python to answer questions for the team.' });
    const blocked = await recruiter.post(`/api/hire/jobs/${second.body.job.id}/publish`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/limit/i);
    await db.update(organizations).set({ planId: 'company' }).where(eq(organizations.id, helix));
    expect((await recruiter.post(`/api/hire/jobs/${second.body.job.id}/publish`)).status).toBe(200);
    expect((await recruiter.post(`/api/hire/jobs/${second.body.job.id}/close`)).status).toBe(200);
    expect((await recruiter.post(`/api/hire/jobs/${second.body.job.id}/archive`)).status).toBe(200);
    expect((await recruiter.patch(`/api/hire/jobs/${second.body.job.id}`, { title: 'Nope' })).status).toBe(409);
    const audits = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'hire.job.published'), eq(auditLogs.orgId, helix)));
    expect(audits.length).toBe(2);
  });

  it('enforces roles and tenant isolation on jobs', async () => {
    expect((await interviewer.get(`/api/hire/jobs/${jobId}`)).status).toBe(200);
    expect((await interviewer.patch(`/api/hire/jobs/${jobId}`, { title: 'Hacked' })).status).toBe(403);
    expect((await interviewer.post('/api/hire/jobs', JOB)).status).toBe(403);
    expect((await orbitRec.get(`/api/hire/jobs/${jobId}`)).status).toBe(404);
    expect((await orbitRec.patch(`/api/hire/jobs/${jobId}`, { title: 'Hacked' })).status).toBe(404);
    expect((await orbitRec.get('/api/hire/jobs')).body.total).toBe(0);
    expect((await candidate.get('/api/hire/jobs')).status).toBe(403);
  });

  it('candidates apply through the job board and the match explains its factors', async () => {
    const [resume] = await db
      .insert(resumes)
      .values({
        userId: candidate.userId,
        title: 'Main',
        data: {
          basics: { name: 'Cara Candidate', email: 'cara@example.test', phone: '+91 99999 00000', headline: 'Backend learner', gender: 'female', dateOfBirth: '2000-01-01' } as never,
          experience: [],
          education: [],
          projects: [{ id: 'p', name: 'API', bullets: ['Flask API'] }],
          skills: [{ group: 'Tech', items: ['Python'] }],
          certifications: [],
          sectionOrder: [],
        },
      })
      .returning();
    const r = await candidate.post(`/api/jobs/${jobId}/apply`, { resumeId: resume.id, coverNote: 'I would love to build APIs.', sharePortfolio: true });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    app1 = r.body.jobApplication.id;
    const r2 = await candidate2.post(`/api/jobs/${jobId}/apply`, { sharePortfolio: false });
    expect(r2.status).toBe(201);
    app2 = r2.body.jobApplication.id;

    const d = await recruiter.get(`/api/hire/applications/${app1}`);
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    const f = Object.fromEntries(d.body.match.factors.map((x: { slug: string }) => [x.slug, x]));
    expect(f.python).toMatchObject({ outcome: 'met', evidence: 'verified' });
    expect(f['sql-basics']).toMatchObject({ outcome: 'partial', evidence: 'self_reported' });
    expect(f['http-rest']).toMatchObject({ outcome: 'unmet', evidence: 'none', required: false });
    expect(d.body.match.formula).toMatch(/required 2/);
    expect(d.body.match.note).toMatch(/Decisions|people make every decision/i);
    expect(d.body.application.resume.data.basics.headline).toBe('Backend learner');
    expect(protectedKeys(d.body)).toEqual([]);
    expect(JSON.stringify(d.body)).not.toContain('cara@example.test');
    expect(d.body.portfolioNote).toMatch(/share/);
  });

  it('moves stages with reasons, writes decisions, audit and the personal tracker', async () => {
    const skip = await recruiter.post(`/api/hire/applications/${app1}/move`, { toStage: 'assessment' });
    expect(skip.status).toBe(400);
    expect(skip.body.error.message).toMatch(/skip/i);
    const ok = await recruiter.post(`/api/hire/applications/${app1}/move`, { toStage: 'assessment', reason: 'Strong verified Python evidence; screen directly.' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.application.stage).toBe('assessment');
    const [personal] = await db.select().from(applications).where(eq(applications.jobApplicationId, app1));
    expect(personal.status).toBe('assessment');
    const events = await db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, personal.id));
    expect(events.some((e) => e.toStatus === 'assessment')).toBe(true);
    expect((await recruiter.post(`/api/hire/applications/${app1}/move`, { toStage: 'withdrawn', reason: 'not allowed here' })).status).toBe(409);

    // Rejection without a reason is refused; with a reason it is recorded and the candidate is told respectfully.
    const noReason = await recruiter.post(`/api/hire/applications/${app2}/move`, { toStage: 'rejected' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.details.fields.reason).toBeTruthy();
    const rej = await recruiter.post(`/api/hire/applications/${app2}/move`, { toStage: 'rejected', reason: 'Role needs SQL evidence we did not see yet.', visibleToCandidate: true });
    expect(rej.status).toBe(200);
    const [n] = await db.select().from(notifications).where(and(eq(notifications.userId, candidate2.userId), eq(notifications.type, 'hire.application_updated')));
    expect(n.body).toMatch(/Thank you for your interest/);
    expect(n.body).toMatch(/SQL evidence/);
    const [p2] = await db.select().from(applications).where(eq(applications.jobApplicationId, app2));
    expect(p2.status).toBe('rejected');
  });

  it('links a recruitment assessment, invites applicants and shows results', async () => {
    const a = await recruiter.post('/api/assessments', { title: 'Backend screen', mode: 'recruitment', jobPostingId: jobId });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    assessmentId = a.body.assessment.id;
    expect((await recruiter.post(`/api/hire/jobs/${jobId}/assessment`, { assessmentId })).status).toBe(200);
    expect((await interviewer.post(`/api/hire/jobs/${jobId}/assessments/${assessmentId}/invite`, { applicationIds: [app1] })).status).toBe(403);
    const inv = await recruiter.post(`/api/hire/jobs/${jobId}/assessments/${assessmentId}/invite`, { applicationIds: [app1] });
    expect(inv.status, JSON.stringify(inv.body)).toBe(200);
    expect(inv.body.invited).toBe(1);
    const [row] = await db.select().from(assessmentInvites).where(eq(assessmentInvites.assessmentId, assessmentId));
    expect(row.applicationId).toBe(app1);
    // A graded and released attempt (as the assessment engine would produce).
    await db.insert(attempts).values({ assessmentId, userId: candidate.userId, orgId: helix, attemptNo: 1, status: 'released', items: [], score: 8, maxScore: 10, submittedAt: new Date(), gradedAt: new Date(), releasedAt: new Date() });
    const d = await recruiter.get(`/api/hire/applications/${app1}`);
    expect(d.body.assessments[0]).toMatchObject({ assessmentId, attemptStatus: 'released', percent: 80 });
    const list = await recruiter.get(`/api/hire/jobs/${jobId}/applications?assessment=completed`);
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([app1]);
  });

  it('suggests a shortlist but only a confirmed human action moves anyone', async () => {
    const s = await recruiter.post(`/api/hire/jobs/${jobId}/suggest-shortlist`, { minScore: 40 });
    expect(s.status).toBe(200);
    expect(s.body.suggestions.map((x: { applicationId: string }) => x.applicationId)).toEqual([app1]);
    expect(s.body.note).toMatch(/Nothing has changed/);
    const [still] = await db.select().from(jobApplications).where(eq(jobApplications.id, app1));
    expect(still.stage).toBe('assessment');
    expect((await recruiter.post('/api/hire/applications/bulk-move', { applicationIds: [app1], toStage: 'interview' })).status).toBe(400);
    const bulk = await recruiter.post('/api/hire/applications/bulk-move', { applicationIds: [app1], toStage: 'interview', confirm: true });
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(200);
    expect(bulk.body.count).toBe(1);
  });

  it('schedules an interview and keeps interviewer feedback blind until submitted', async () => {
    expect((await recruiter.post('/api/hire/interviews', { applicationId: app1, scheduledAt: new Date(Date.now() + 3600_000).toISOString(), interviewerIds: [outsider.userId] })).status).toBe(400);
    const r = await recruiter.post('/api/hire/interviews', { applicationId: app1, kind: 'technical', scheduledAt: new Date(Date.now() + 3600_000).toISOString(), durationMinutes: 60, interviewerIds: [interviewer.userId, interviewer2.userId], meeting: { provider: 'jitsi' } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.interview.meetingUrl).toMatch(/^https:\/\/meet\.jit\.si\/LearnSphere-[A-Za-z0-9]{16}$/);
    expect(r.body.interview.meetingNote).toMatch(/sign in/);
    interviewId = r.body.interview.id;

    // Interviewers see only the candidates they interview.
    expect((await interviewer.get(`/api/hire/applications/${app2}`)).status).toBe(404);
    expect((await interviewer.get(`/api/hire/applications/${app1}`)).status).toBe(200);
    const mine = await interviewer.get('/api/hire/applications');
    expect(mine.body.items.map((i: { id: string }) => i.id)).toEqual([app1]);
    expect((await interviewer.post(`/api/hire/applications/${app1}/move`, { toStage: 'offer' })).status).toBe(403);
    expect((await interviewer.get(`/api/hire/applications/${app1}/messages`)).status).toBe(403);

    const fb = { recommendation: 'yes', scores: [{ competency: 'Problem solving', rating: 3, note: 'Clear approach' }], summary: 'Solid API design discussion and testing habits.' };
    expect((await interviewer.post(`/api/hire/interviews/${interviewId}/feedback`, fb)).status).toBe(201);
    expect((await interviewer.post(`/api/hire/interviews/${interviewId}/feedback`, fb)).status).toBe(409);
    const before = await interviewer2.get(`/api/hire/interviews/${interviewId}`);
    expect(before.body.feedback).toEqual([]);
    expect(before.body.hiddenFeedbackCount).toBe(1);
    expect((await interviewer2.post(`/api/hire/interviews/${interviewId}/feedback`, { ...fb, recommendation: 'strong_yes' })).status).toBe(201);
    const after = await interviewer2.get(`/api/hire/interviews/${interviewId}`);
    expect(after.body.feedback.length).toBe(2);
    const rec = await recruiter.get(`/api/hire/interviews/${interviewId}`);
    expect(rec.body.feedback.length).toBe(2);
    expect((await recruiter.post(`/api/hire/interviews/${interviewId}/feedback`, fb)).status).toBe(403);
  });

  it('extends an offer, the candidate accepts, and the hire is recorded end to end', async () => {
    expect((await recruiter.post('/api/hire/offers', { applicationId: app1, title: 'Backend Engineer', compensationText: 'INR 15 LPA' })).status).toBe(409);
    expect((await recruiter.post(`/api/hire/applications/${app1}/move`, { toStage: 'offer' })).status).toBe(200);
    const o = await recruiter.post('/api/hire/offers', { applicationId: app1, title: 'Backend Engineer', compensationText: 'INR 15 LPA', expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() });
    expect(o.status, JSON.stringify(o.body)).toBe(201);
    offerId = o.body.offer.id;
    expect((await candidate.get('/api/hire/my-offers')).body.items.length).toBe(0); // drafts are not visible
    expect((await recruiter.post(`/api/hire/offers/${offerId}/extend`)).status).toBe(200);
    expect((await candidate.get('/api/hire/my-offers')).body.items[0]).toMatchObject({ id: offerId, status: 'extended' });
    expect((await candidate2.post(`/api/hire/my-offers/${offerId}/respond`, { decision: 'accept' })).status).toBe(404);
    expect((await orbitRec.post(`/api/hire/offers/${offerId}/rescind`, { reason: 'not yours to do' })).status).toBe(404);
    const acc = await candidate.post(`/api/hire/my-offers/${offerId}/respond`, { decision: 'accept', note: 'Excited to join.' });
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    expect(acc.body.application).toMatchObject({ stage: 'hired', status: 'hired' });
    expect((await candidate.post(`/api/hire/my-offers/${offerId}/respond`, { decision: 'decline' })).status).toBe(409);

    const [personal] = await db.select().from(applications).where(eq(applications.jobApplicationId, app1));
    expect(personal.status).toBe('accepted');
    const decisions = await db.select().from(hiringDecisions).where(eq(hiringDecisions.applicationId, app1)).orderBy(hiringDecisions.createdAt);
    expect(decisions.map((d) => `${d.fromStage}>${d.toStage}`)).toEqual(['applied>assessment', 'assessment>interview', 'interview>offer', 'offer>hired']);
    expect(decisions.every((d) => d.reason.length > 0)).toBe(true);
    const stageAudits = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'hire.application.stage_changed'), eq(auditLogs.targetId, app1)));
    expect(stageAudits.length).toBe(3);
    expect((await db.select().from(auditLogs).where(eq(auditLogs.action, 'hire.offer.accepted'))).length).toBe(1);

    const view = await candidate.get(`/api/hire/my-applications/${app1}`);
    expect(view.status).toBe(200);
    expect(view.body.application.stage).toBe('hired');
    expect(view.body.offers[0].status).toBe('accepted');
    expect((await candidate2.get(`/api/hire/my-applications/${app1}`)).status).toBe(404);

    const detail = await recruiter.get(`/api/hire/applications/${app1}`);
    expect(detail.body.decisions.length).toBe(4);
  });

  it('keeps messages between the hiring team and the candidate only', async () => {
    expect((await recruiter.post(`/api/hire/applications/${app1}/messages`, { body: 'Welcome aboard! Paperwork follows.' })).status).toBe(201);
    const cm = await candidate.get(`/api/hire/my-applications/${app1}/messages`);
    expect(cm.body.items.map((m: { body: string }) => m.body)).toEqual(['Welcome aboard! Paperwork follows.']);
    expect((await candidate.post(`/api/hire/my-applications/${app1}/messages`, { body: 'Thank you!' })).status).toBe(201);
    expect((await candidate2.get(`/api/hire/my-applications/${app1}/messages`)).status).toBe(404);
    expect((await candidate2.post(`/api/hire/my-applications/${app1}/messages`, { body: 'hi' })).status).toBe(404);
    expect((await orbitRec.get(`/api/hire/applications/${app1}/messages`)).status).toBe(404);
    expect((await outsider.get(`/api/hire/applications/${app1}/messages`)).status).toBe(404);
    const list = await recruiter.get(`/api/hire/applications?postingId=${jobId}`);
    expect(list.body.items.find((i: { id: string }) => i.id === app1).unread).toBe(1);
    const thread = await recruiter.get(`/api/hire/applications/${app1}/messages`);
    expect(thread.body.items.length).toBe(2);
    const list2 = await recruiter.get(`/api/hire/applications?postingId=${jobId}`);
    expect(list2.body.items.find((i: { id: string }) => i.id === app1).unread).toBe(0);
  });

  it('isolates tenants on applications and exports', async () => {
    expect((await orbitRec.get(`/api/hire/applications/${app1}`)).status).toBe(404);
    expect((await orbitRec.post(`/api/hire/applications/${app1}/move`, { toStage: 'rejected', reason: 'cross tenant attempt' })).status).toBe(404);
    expect((await orbitRec.get(`/api/hire/exports/pipeline.csv?postingId=${jobId}`)).status).toBe(404);
    expect((await orbitRec.get(`/api/hire/jobs/${jobId}/applications`)).status).toBe(404);
    expect((await orbitRec.get(`/api/hire/analytics?postingId=${jobId}`)).status).toBe(404);
    expect((await orbitRec.get('/api/hire/applications')).body.total).toBe(0);
    expect((await orbitRec.get(`/api/hire/interviews/${interviewId}`)).status).toBe(404);
  });

  it('exports permitted reports with audit', async () => {
    const csv = await recruiter.get(`/api/hire/exports/pipeline.csv?postingId=${jobId}`);
    expect(csv.status).toBe(200);
    expect(String(csv.body)).toMatch(/^application_id,candidate,stage/);
    expect(String(csv.body)).toContain('Cara Candidate');
    expect(String(csv.body)).not.toContain('cara@example.test');
    const dec = await recruiter.get('/api/hire/exports/decisions.csv');
    expect(dec.status).toBe(200);
    expect(String(dec.body)).toContain('Role needs SQL evidence');
    expect((await interviewer.get('/api/hire/exports/decisions.csv')).status).toBe(403);
    expect((await interviewer.get(`/api/hire/exports/pipeline.csv?postingId=${jobId}`)).status).toBe(403);
    expect((await db.select().from(auditLogs).where(eq(auditLogs.action, 'hire.export.pipeline'))).length).toBe(1);
  });

  it('reports funnel analytics with definitions', async () => {
    const a = await recruiter.get(`/api/hire/analytics?postingId=${jobId}`);
    expect(a.status).toBe(200);
    const reached = Object.fromEntries(a.body.funnel.map((f: { stage: string; reached: number }) => [f.stage, f.reached]));
    expect(reached.applied).toBe(2);
    expect(reached.hired).toBe(1);
    expect(a.body.totals).toMatchObject({ applications: 2, hired: 1, rejected: 1 });
    expect(a.body.assessment.completionRate).toBe(1);
    expect(a.body.offers.acceptanceRate).toBe(1);
    expect(a.body.definitions.fairness).toMatch(/No demographic/);
    expect((await interviewer.get('/api/hire/analytics')).status).toBe(403);
    const ov = await recruiter.get('/api/hire/overview');
    expect(ov.status).toBe(200);
    expect(ov.body.openJobs[0].stages.length).toBe(7);
  });
});

describe('candidate search respects consent', () => {
  it('finds only applicants, campus invitees and people who opted in', async () => {
    const before = await recruiter.get('/api/hire/candidates/search');
    const ids = before.body.items.map((i: { userId: string }) => i.userId);
    expect(ids).toContain(candidate.userId);
    expect(ids).not.toContain(outsider.userId);
    expect(ids).not.toContain(discoverable.userId);

    expect((await discoverable.get('/api/hire/candidate-preferences')).body.discoverableByRecruiters).toBe(false);
    expect((await discoverable.patch('/api/hire/candidate-preferences', { discoverableByRecruiters: true })).status).toBe(200);
    const after = await recruiter.get('/api/hire/candidates/search?skills=python');
    const byId = Object.fromEntries(after.body.items.map((i: { userId: string }) => [i.userId, i]));
    expect(byId[discoverable.userId]).toBeTruthy();
    expect(byId[discoverable.userId].relation).toMatchObject({ discoverable: true, applied: false });
    expect(byId[candidate.userId].skills[0]).toMatchObject({ slug: 'python', evidence: 'verified' });
    expect(byId[candidate2.userId]).toBeUndefined(); // applied, but no demonstrated Python evidence
    expect(byId[outsider.userId]).toBeUndefined(); // strong evidence but never opted in
    expect(protectedKeys(after.body)).toEqual([]);
    expect(after.body.note).toMatch(/Decisions are made by people|people make every decision/);

    // Orbit sees only opted-in people (no Helix applicants).
    const orbitSearch = await orbitRec.get('/api/hire/candidates/search');
    expect(orbitSearch.body.items.map((i: { userId: string }) => i.userId)).toEqual([discoverable.userId]);
    expect((await orbitRec.post(`/api/hire/candidates/${outsider.userId}/invite`, { postingId: jobId })).status).toBe(404);
    expect((await interviewer.get('/api/hire/candidates/search')).status).toBe(403);

    const inv = await recruiter.post(`/api/hire/candidates/${discoverable.userId}/invite`, { postingId: jobId, message: 'Your project work looks relevant.' });
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    expect((await recruiter.post(`/api/hire/candidates/${discoverable.userId}/invite`, { postingId: jobId })).status).toBe(409);
    const [n] = await db.select().from(notifications).where(and(eq(notifications.userId, discoverable.userId), eq(notifications.type, 'hire.invited_to_apply')));
    expect(n.link).toBe(`/app/jobs/${jobId}`);
    expect((await db.select().from(auditLogs).where(eq(auditLogs.action, 'hire.candidate.invited_to_apply'))).length).toBe(1);
  });
});
