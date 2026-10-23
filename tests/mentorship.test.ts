import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupTestApp, registerUser } from './helpers';
import { db } from '../server/db/client';
import { applications, activityEvents, auditLogs, users } from '../server/db/schema';
import { resetRateLimits } from '../server/lib/ratelimit';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => ctx.close());

async function user(name: string, email: string) {
  resetRateLimits();
  return registerUser(ctx.app, name, email);
}

async function makeAdmin(userId: string) {
  await db.update(users).set({ platformRole: 'platform_admin' }).where(eq(users.id, userId));
}

const profile = {
  headline: 'Backend engineer, 8 years',
  bio: 'I help early-career engineers with backend fundamentals and interview prep.',
  expertise: ['Backend', 'python', 'databases'],
  yearsExperience: 8,
  availability: [{ day: 2, start: '18:00', end: '20:00' }],
  maxMentees: 2,
  acceptingRequests: true,
};

describe('mentorship: request → accept → goals, sessions, notes, consented progress review', () => {
  let mentor: Awaited<ReturnType<typeof user>>;
  let mentee: Awaited<ReturnType<typeof user>>;
  let outsider: Awaited<ReturnType<typeof user>>;
  let mentorshipId: string;

  beforeAll(async () => {
    mentor = await user('Mara Mentor', 'mara@example.test');
    mentee = await user('Lee Learner', 'lee@example.test');
    outsider = await user('Otto Outsider', 'otto@example.test');
  });

  it('puts a new mentor profile in pending until a platform admin approves it', async () => {
    const r = await mentor.put('/api/mentorship/profile', profile);
    expect(r.status).toBe(201);
    expect(r.body.profile.status).toBe('pending');
    expect(r.body.profile.expertise).toContain('backend');

    // Not discoverable while pending.
    const list = await mentee.get('/api/mentorship/mentors');
    expect(list.body.items.find((m: any) => m.userId === mentor.userId)).toBeUndefined();

    // Non-admins cannot approve.
    expect((await outsider.post(`/api/mentorship/profiles/${mentor.userId}/approve`)).status).toBe(403);

    const admin = await user('Ada Admin', 'ada@example.test');
    await makeAdmin(admin.userId);
    const ok = await admin.post(`/api/mentorship/profiles/${mentor.userId}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body.profile.status).toBe('active');
  });

  it('lists active mentors without exposing email', async () => {
    const r = await mentee.get('/api/mentorship/mentors?expertise=backend');
    expect(r.status).toBe(200);
    const m = r.body.items.find((x: any) => x.userId === mentor.userId);
    expect(m).toBeTruthy();
    expect(JSON.stringify(r.body)).not.toContain('mara@example.test');
    const detail = await mentee.get(`/api/mentorship/mentors/${mentor.userId}`);
    expect(JSON.stringify(detail.body)).not.toContain('mara@example.test');
  });

  it('validates the request and records consent', async () => {
    const bad = await mentee.post('/api/mentorship/requests', { mentorId: mentor.userId, message: 'hi', sharing: { skillDna: true, projects: true, assessments: false, applications: false } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields.message).toBeTruthy();

    const r = await mentee.post('/api/mentorship/requests', {
      mentorId: mentor.userId,
      message: 'I am switching careers into backend and would love guidance on projects.',
      goalsSummary: 'Ship one API project and prepare for interviews',
      sharing: { skillDna: true, projects: true, assessments: false, applications: false },
    });
    expect(r.status).toBe(201);
    mentorshipId = r.body.mentorship.id;
    expect(r.body.mentorship.status).toBe('requested');

    const dup = await mentee.post('/api/mentorship/requests', { mentorId: mentor.userId, message: 'Second request with enough characters to pass.', sharing: { skillDna: true, projects: true, assessments: false, applications: false } });
    expect(dup.status).toBe(409);

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.targetId, mentorshipId));
    expect(logs.some((l) => l.action === 'mentorship.consent.granted')).toBe(true);
  });

  it('only the mentor can accept', async () => {
    expect((await mentee.post(`/api/mentorship/${mentorshipId}/accept`)).status).toBe(403);
    expect((await outsider.post(`/api/mentorship/${mentorshipId}/accept`)).status).toBe(404);
    const r = await mentor.post(`/api/mentorship/${mentorshipId}/accept`);
    expect(r.status).toBe(200);
    expect(r.body.mentorship.status).toBe('active');
  });

  it('mentor sets goals in the learner goals table with source mentor', async () => {
    const r = await mentor.post(`/api/mentorship/${mentorshipId}/goals`, { title: 'Finish the REST API project', kind: 'milestone' });
    expect(r.status).toBe(201);
    expect(r.body.goal.source).toBe('mentor');
    expect(r.body.goal.createdBy).toBe(mentor.userId);
    const mine = await mentee.get('/api/learning/goals');
    expect(mine.body.goals.some((g: any) => g.title === 'Finish the REST API project' && g.source === 'mentor')).toBe(true);
    expect((await mentee.post(`/api/mentorship/${mentorshipId}/goals`, { title: 'Self goal' })).status).toBe(403);
  });

  it('never returns mentor private notes to the mentee', async () => {
    const s = await mentor.post(`/api/mentorship/${mentorshipId}/sessions`, { scheduledAt: new Date(Date.now() - 3600_000).toISOString(), durationMinutes: 30, meeting: 'jitsi', agenda: 'Kickoff' });
    expect(s.status).toBe(201);
    expect(s.body.session.meetingUrl).toMatch(/^https:\/\/meet\.jit\.si\/LearnSphere-[A-Za-z0-9]{16}$/);
    expect(s.body.jitsiNote).toMatch(/moderator/i);
    const sid = s.body.session.id;
    const upd = await mentor.patch(`/api/mentorship/${mentorshipId}/sessions/${sid}`, { sharedNotes: 'Agreed to build a todo API.', mentorPrivateNotes: 'SECRET-PRIVATE-OBSERVATION', followUps: [{ id: 'f1', text: 'Draft the data model', done: false }] });
    expect(upd.status).toBe(200);
    expect(upd.body.session.mentorPrivateNotes).toBe('SECRET-PRIVATE-OBSERVATION');
    const note = await mentor.post(`/api/mentorship/${mentorshipId}/notes`, { body: 'PRIVATE-NOTE-BODY', visibility: 'mentor_private' });
    expect(note.status).toBe(201);
    await mentor.post(`/api/mentorship/${mentorshipId}/notes`, { body: 'Shared reading list', visibility: 'shared' });

    const detail = await mentee.get(`/api/mentorship/${mentorshipId}`);
    expect(detail.status).toBe(200);
    const raw = JSON.stringify(detail.body);
    expect(raw).not.toContain('SECRET-PRIVATE-OBSERVATION');
    expect(raw).not.toContain('PRIVATE-NOTE-BODY');
    expect(raw).not.toContain('mentorPrivateNotes');
    expect(raw).toContain('Agreed to build a todo API.');
    expect(raw).toContain('Shared reading list');

    const sessions = await mentee.get('/api/mentorship/sessions');
    expect(JSON.stringify(sessions.body)).not.toContain('SECRET-PRIVATE-OBSERVATION');

    // Mentee cannot write private notes, nor edit the mentor's.
    expect((await mentee.post(`/api/mentorship/${mentorshipId}/notes`, { body: 'x', visibility: 'mentor_private' })).status).toBe(403);
    expect((await mentee.patch(`/api/mentorship/${mentorshipId}/sessions/${sid}`, { mentorPrivateNotes: 'hack' })).status).toBe(403);

    // Mentor sees both.
    const mentorView = JSON.stringify((await mentor.get(`/api/mentorship/${mentorshipId}`)).body);
    expect(mentorView).toContain('SECRET-PRIVATE-OBSERVATION');
    expect(mentorView).toContain('PRIVATE-NOTE-BODY');
  });

  it('awards session XP to both parties exactly once', async () => {
    const s = await mentor.post(`/api/mentorship/${mentorshipId}/sessions`, { scheduledAt: new Date(Date.now() - 600_000).toISOString(), meeting: 'none' });
    const sid = s.body.session.id;
    expect((await mentee.patch(`/api/mentorship/${mentorshipId}/sessions/${sid}`, { status: 'completed' })).status).toBe(403);
    expect((await mentor.patch(`/api/mentorship/${mentorshipId}/sessions/${sid}`, { status: 'completed' })).status).toBe(200);
    await mentor.patch(`/api/mentorship/${mentorshipId}/sessions/${sid}`, { sharedNotes: 'again' });
    for (const uid of [mentor.userId, mentee.userId]) {
      const ev = await db.select().from(activityEvents).where(eq(activityEvents.userId, uid));
      expect(ev.filter((e) => e.dedupeKey === `mentor-session:${sid}`)).toHaveLength(1);
    }
  });

  it('shows progress only per sharing toggles and revokes access after the mentorship ends', async () => {
    await db.insert(applications).values({ userId: mentee.userId, company: 'Acme Corp', role: 'Junior Backend', status: 'applied' });
    expect((await mentee.get(`/api/mentorship/${mentorshipId}/progress`)).status).toBe(403);
    expect((await outsider.get(`/api/mentorship/${mentorshipId}/progress`)).status).toBe(404);

    const p = await mentor.get(`/api/mentorship/${mentorshipId}/progress`);
    expect(p.status).toBe(200);
    expect(p.body.skillDna.shared).toBe(true);
    expect(p.body.projects.shared).toBe(true);
    expect(p.body.applications).toEqual({ shared: false });
    expect(JSON.stringify(p.body)).not.toContain('Acme Corp');

    // Mentee turns on applications sharing (audited), mentor sees them.
    const t = await mentee.patch(`/api/mentorship/${mentorshipId}/sharing`, { applications: true });
    expect(t.status).toBe(200);
    expect((await mentor.patch(`/api/mentorship/${mentorshipId}/sharing`, { applications: false })).status).toBe(403);
    const p2 = await mentor.get(`/api/mentorship/${mentorshipId}/progress`);
    expect(JSON.stringify(p2.body)).toContain('Acme Corp');
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.targetId, mentorshipId));
    expect(logs.some((l) => l.action === 'mentorship.consent.updated')).toBe(true);

    // Turning it off again hides it immediately.
    await mentee.patch(`/api/mentorship/${mentorshipId}/sharing`, { applications: false });
    expect(JSON.stringify((await mentor.get(`/api/mentorship/${mentorshipId}/progress`)).body)).not.toContain('Acme Corp');
  });

  it('keeps mentorship messages between the two parties (404 for anyone else)', async () => {
    const m = await mentee.post(`/api/mentorship/${mentorshipId}/messages`, { body: 'Thanks for the session!' });
    expect(m.status).toBe(201);
    expect((await mentor.get(`/api/mentorship/${mentorshipId}/messages`)).body.items).toHaveLength(1);
    expect((await outsider.get(`/api/mentorship/${mentorshipId}/messages`)).status).toBe(404);
    expect((await outsider.post(`/api/mentorship/${mentorshipId}/messages`, { body: 'let me in' })).status).toBe(404);
    expect((await outsider.get(`/api/mentorship/${mentorshipId}`)).status).toBe(404);
  });

  it('assigns activities the mentee can complete but not edit', async () => {
    const a = await mentor.post(`/api/mentorship/${mentorshipId}/assignments`, { kind: 'topic', title: 'Read about HTTP methods', link: '/app/learn/web' });
    expect(a.status).toBe(201);
    expect((await mentor.post(`/api/mentorship/${mentorshipId}/assignments`, { title: 'Bad link', link: 'javascript:alert(1)' })).status).toBe(400);
    expect((await mentee.patch(`/api/mentorship/${mentorshipId}/assignments/${a.body.assignment.id}`, { title: 'changed' })).status).toBe(403);
    const done = await mentee.patch(`/api/mentorship/${mentorshipId}/assignments/${a.body.assignment.id}`, { status: 'done' });
    expect(done.body.assignment.status).toBe('done');
  });

  it('records a mentor skill assessment as unverified evidence', async () => {
    // No skills in this database: expect a clean 404 rather than a crash.
    const r = await mentor.post(`/api/mentorship/${mentorshipId}/skill-assessment`, { skillSlug: 'nope', level: 3 });
    expect(r.status).toBe(404);
  });

  it('ends the mentorship and cuts off progress access', async () => {
    const fb = await mentee.post(`/api/mentorship/${mentorshipId}/feedback`, { body: 'Very helpful sessions.' });
    expect(fb.status).toBe(400); // rating required for mentees
    expect((await mentee.post(`/api/mentorship/${mentorshipId}/feedback`, { body: 'Very helpful sessions.', rating: 5 })).status).toBe(201);
    const end = await mentee.post(`/api/mentorship/${mentorshipId}/end`, { reason: 'Reached my goals' });
    expect(end.status).toBe(200);
    expect(end.body.mentorship.status).toBe('ended');
    expect((await mentor.get(`/api/mentorship/${mentorshipId}/progress`)).status).toBe(403);
    expect((await mentor.post(`/api/mentorship/${mentorshipId}/goals`, { title: 'Too late goal' })).status).toBe(400);
    expect((await mentor.post(`/api/mentorship/${mentorshipId}/messages`, { body: 'hello?' })).status).toBe(400);
  });

  it('enforces mentor capacity on accept', async () => {
    // Capacity is 2; mentorship above ended, so fill two new ones and try a third.
    const a = await user('Cap One', 'cap1@example.test');
    const b = await user('Cap Two', 'cap2@example.test');
    const c3 = await user('Cap Three', 'cap3@example.test');
    const ids: string[] = [];
    for (const u of [a, b, c3]) {
      const r = await u.post('/api/mentorship/requests', { mentorId: mentor.userId, message: 'Please mentor me on backend fundamentals and projects.', sharing: { skillDna: false, projects: false, assessments: false, applications: false } });
      ids.push(r.body.mentorship.id);
    }
    expect((await mentor.post(`/api/mentorship/${ids[0]}/accept`)).status).toBe(200);
    expect((await mentor.post(`/api/mentorship/${ids[1]}/accept`)).status).toBe(200);
    expect((await mentor.post(`/api/mentorship/${ids[2]}/accept`)).status).toBe(409);
    const ws = await mentor.get('/api/mentorship/workspace');
    expect(ws.body.mentees).toHaveLength(2);
    expect(ws.body.requests).toHaveLength(1);
  });
});
