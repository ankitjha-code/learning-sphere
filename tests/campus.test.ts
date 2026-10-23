import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { setupTestApp, registerUser } from './helpers';
import { db } from '../server/db/client';
import { organizations, memberships, skills, users, attempts, auditLogs, notifications, studentRecords, assessmentInvites } from '../server/db/schema';
import { addEvidence } from '../server/modules/learning/skilldna';

type C = Awaited<ReturnType<typeof registerUser>>;
let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let nb: string, rv: string, helix: string;
let officer: C, rOfficer: C, s1: C, s2: C, s3: C, s4: C, s5: C, rStudent: C;
let programId: string, driveId: string, assessmentId: string;
const rec: Record<string, string> = {};
const cand: Record<string, string> = {};

async function org(name: string, kind: string) {
  const [o] = await db.insert(organizations).values({ name, slug: name.toLowerCase().replace(/\s+/g, '-'), kind }).returning();
  return o.id;
}
async function member(orgId: string, c: C, roles: string[], activate = true) {
  await db.insert(memberships).values({ orgId, userId: c.userId, roles });
  if (activate) expect((await c.post('/api/auth/switch', { orgId })).status).toBe(200);
}
async function setPolicy(orgId: string, requireVerifiedRecordForPlacement: boolean) {
  const [o] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId));
  await db.update(organizations).set({ settings: { ...o.settings, policies: { requireVerifiedRecordForPlacement } } }).where(eq(organizations.id, orgId));
}
const userCount = async () => Number((await db.select({ n: sql<number>`count(*)::int` }).from(users))[0].n);

beforeAll(async () => {
  ctx = await setupTestApp();
  const sk = await db
    .insert(skills)
    .values([
      { slug: 'arrays', name: 'Arrays', category: 'dsa', level: 2 },
      { slug: 'python', name: 'Python', category: 'programming', level: 2 },
    ])
    .returning();
  nb = await org('Northbridge', 'college');
  rv = await org('Riverside', 'college');
  helix = await org('Helix Labs', 'company');
  officer = await registerUser(ctx.app, 'Farah Officer', 'officer@nb.test');
  rOfficer = await registerUser(ctx.app, 'River Officer', 'officer@rv.test');
  s1 = await registerUser(ctx.app, 'Asha Eligible', 's1@nb.test');
  s2 = await registerUser(ctx.app, 'Bilal NoCgpa', 's2@nb.test');
  s3 = await registerUser(ctx.app, 'Chen Backlogs', 's3@nb.test');
  s4 = await registerUser(ctx.app, 'Dana NoRecord', 's4@nb.test');
  s5 = await registerUser(ctx.app, 'Esha Unverified', 's5@nb.test');
  rStudent = await registerUser(ctx.app, 'Riya River', 'student@rv.test');
  await member(nb, officer, ['placement_officer']);
  await member(rv, rOfficer, ['placement_officer']);
  for (const s of [s1, s2, s3, s4, s5]) await member(nb, s, ['student']);
  await member(rv, rStudent, ['student']);
  // Deterministically graded evidence for the required skills (verified).
  for (const s of [s1, s2, s3, s5]) for (const k of sk) await addEvidence({ userId: s.userId, skillId: k.id, source: 'assessment', sourceType: 'attempt', sourceId: `seed-${k.slug}`, score: 0.9, verified: true });
});
afterAll(async () => ctx.close());

describe('structure', () => {
  it('creates departments, programs, a current term and a batch with validation and isolation', async () => {
    const dep = await officer.post('/api/campus/departments', { name: 'Computer Science', code: 'CSE' });
    expect(dep.status).toBe(201);
    expect((await officer.post('/api/campus/departments', { name: 'Dup', code: 'cse' })).status).toBe(400);
    const bad = await officer.post('/api/campus/programs', { name: 'B.Tech CSE', code: 'bad code!' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields.code).toBeTruthy();
    const prog = await officer.post('/api/campus/programs', { name: 'B.Tech CSE', code: 'BTCSE', departmentId: dep.body.department.id });
    expect(prog.status).toBe(201);
    programId = prog.body.program.id;
    const t1 = await officer.post('/api/campus/terms', { name: '2026 Odd', startsOn: '2026-07-01', endsOn: '2026-12-15', isCurrent: true });
    const t2 = await officer.post('/api/campus/terms', { name: '2027 Even', startsOn: '2027-01-05', endsOn: '2027-05-30', isCurrent: true });
    expect(t1.status).toBe(201);
    expect(t2.status).toBe(201);
    expect((await officer.post('/api/campus/terms', { name: 'Bad', startsOn: '2027-05-01', endsOn: '2027-01-01' })).status).toBe(400);
    const batch = await officer.post('/api/campus/batches', { name: 'CSE 2027', graduationYear: 2027, programId });
    expect(batch.status).toBe(201);
    const st = await officer.get('/api/campus/structure');
    expect(st.body.terms.filter((t: { isCurrent: boolean }) => t.isCurrent)).toHaveLength(1);
    expect(st.body.batches[0].name).toBe('CSE 2027');
    // Riverside officer cannot touch Northbridge structure.
    expect((await rOfficer.patch(`/api/campus/programs/${programId}`, { name: 'Hijack' })).status).toBe(404);
    expect((await s1.get('/api/campus/structure')).status).toBe(403);
  });
});

describe('student records', () => {
  it('creates and verifies records; unknown values stay null', async () => {
    const mk = async (s: C, body: Record<string, unknown>) => {
      const r = await officer.post('/api/campus/students', { userId: s.userId, programId, graduationYear: 2027, ...body });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.record.id as string;
    };
    rec.s1 = await mk(s1, { rollNumber: 'NB001', cgpa: 8.4, activeBacklogs: 0, verify: true });
    rec.s2 = await mk(s2, { rollNumber: 'NB002', activeBacklogs: 0, verify: true }); // cgpa unknown
    rec.s3 = await mk(s3, { rollNumber: 'NB003', cgpa: 7.9, activeBacklogs: 2, verify: true });
    rec.s5 = await mk(s5, { rollNumber: 'NB005', cgpa: 8.0, activeBacklogs: 0 }); // unverified
    expect((await officer.post('/api/campus/students', { userId: s4.userId, rollNumber: 'NB001' })).status).toBe(409); // roll taken
    expect((await officer.post('/api/campus/students', { userId: rStudent.userId, rollNumber: 'X1' })).status).toBe(400); // not our student
    const list = await officer.get('/api/campus/students?gaps=yes');
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([rec.s2]);
    expect(list.body.items[0].cgpa).toBeNull();
    expect(list.body.items[0].gaps).toContain('cgpa');
    expect(list.body.studentsWithoutRecord).toBe(1); // s4
    const unverified = await officer.get('/api/campus/students?verified=no');
    expect(unverified.body.total).toBe(1);
  });

  it('CSV import previews, reports problems and never creates users', async () => {
    const extra = await registerUser(ctx.app, 'Farid Import', 'import@nb.test');
    await member(nb, extra, ['student'], false);
    const before = await userCount();
    const csv = [
      'Email,Roll Number,Program Code,Graduation Year,CGPA,Active Backlogs',
      'import@nb.test,NB010,BTCSE,2027,,0',
      'stranger@nowhere.test,NB011,BTCSE,2027,8,0',
      'import@nb.test,NB012,BTCSE,2027,8,0',
      's1@nb.test,NB001,BTCSE,2027,8.6,0',
      'officer@nb.test,NB013,BTCSE,2027,8,0',
      'bad@nb.test,NB014,NOPE,20x7,11,0',
    ].join('\n');
    const prev = await officer.post('/api/campus/students/import/preview', { csv });
    expect(prev.status).toBe(200);
    const status = prev.body.rows.map((r: { status: string }) => r.status);
    expect(status).toEqual(['create', 'not_member', 'duplicate', 'exists', 'not_student', 'invalid']);
    expect(prev.body.rows[0].cgpa).toBeNull(); // blank stays unknown, never 0
    const conf = await officer.post('/api/campus/students/import/confirm', { csv });
    expect(conf.body.created).toBe(1);
    expect(conf.body.updated).toBe(0);
    expect(await userCount()).toBe(before);
    const [imported] = await db.select().from(studentRecords).where(eq(studentRecords.rollNumber, 'NB010'));
    expect(imported.cgpa).toBeNull();
    expect(imported.verifiedAt).toBeNull();
    expect((await officer.post('/api/campus/students/import/preview', { csv: 'name,phone\nx,y' })).status).toBe(400);
  });
});

describe('Journey 5: placement drive end to end', () => {
  it('creates and opens a drive', async () => {
    const bad = await officer.post('/api/campus/drives', { title: 'X', companyName: 'Helix Labs', roleTitle: 'SDE Intern' });
    expect(bad.status).toBe(400);
    const unknownSkill = await officer.post('/api/campus/drives', { title: 'Helix SDE', companyName: 'Helix Labs', roleTitle: 'SDE Intern', eligibility: { requiredSkillSlugs: ['nope'] } });
    expect(unknownSkill.status).toBe(400);
    const r = await officer.post('/api/campus/drives', {
      title: 'Helix Labs SDE Intern 2027',
      companyName: 'Helix Labs',
      companyOrgId: helix,
      roleTitle: 'SDE Intern',
      ctcText: '12 LPA',
      eligibility: { programIds: [programId], graduationYears: [2027], minCgpa: 7, maxActiveBacklogs: 0, requiredSkillSlugs: ['arrays', 'python'] },
      registrationDeadline: new Date(Date.now() + 7 * 86400_000).toISOString(),
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    driveId = r.body.drive.id;
    expect((await officer.post(`/api/campus/drives/${driveId}/invite`, {})).status).toBe(409); // draft
    expect((await officer.post(`/api/campus/drives/${driveId}/status`, { status: 'completed' })).status).toBe(409);
    expect((await officer.post(`/api/campus/drives/${driveId}/status`, { status: 'open' })).status).toBe(200);
  });

  it('previews eligibility: eligible / not eligible / needs data, never treating missing data as ineligible', async () => {
    const r = await officer.post(`/api/campus/drives/${driveId}/eligibility/preview`, {});
    expect(r.status).toBe(200);
    const ids = (k: string) => r.body[k].map((i: { userId: string }) => i.userId).sort();
    expect(ids('eligible')).toEqual([s1.userId, s5.userId].sort());
    expect(ids('notEligible')).toEqual([s3.userId]);
    expect(ids('needsData')).toEqual(expect.arrayContaining([s2.userId, s4.userId]));
    const s2r = r.body.needsData.find((i: { userId: string }) => i.userId === s2.userId);
    expect(s2r.eligible).toBe('unknown');
    expect(s2r.unknown).toEqual(['CGPA']);
    expect(s2r.reasons).toEqual([]);
    const s3r = r.body.notEligible[0];
    expect(s3r.reasons.join(' ')).toMatch(/backlog/i);
    const s4r = r.body.needsData.find((i: { userId: string }) => i.userId === s4.userId);
    expect(s4r.unknown).toContain('Student record');
    const skillCheck = r.body.eligible[0].checks.find((ch: { key: string }) => ch.key === 'skill:python');
    expect(skillCheck.status).toBe('met');
    expect(skillCheck.skill.state).toBe('verified');
    expect(r.body.counts).toMatchObject({ eligible: 2, notEligible: 1 });
  });

  it('policy requireVerifiedRecordForPlacement turns unverified records into needs data', async () => {
    await setPolicy(nb, true);
    const r = await officer.post(`/api/campus/drives/${driveId}/eligibility/preview`, {});
    const s5r = r.body.needsData.find((i: { userId: string }) => i.userId === s5.userId);
    expect(s5r).toBeTruthy();
    expect(s5r.unknown).toContain('Verified record');
    expect(s5r.checks.find((ch: { key: string }) => ch.key === 'verified').detail).toMatch(/Record not yet verified/);
    expect(r.body.eligible.map((i: { userId: string }) => i.userId)).toEqual([s1.userId]);
    await setPolicy(nb, false);
  });

  it('invites eligible students only; manual inclusion of needs-data students needs a reason and is audited', async () => {
    const inv = await officer.post(`/api/campus/drives/${driveId}/invite`, {});
    expect(inv.status).toBe(200);
    expect(inv.body.invited).toBe(2);
    expect(inv.body.skipped.notEligible).toBe(1);
    const again = await officer.post(`/api/campus/drives/${driveId}/invite`, {});
    expect(again.body.invited).toBe(0);
    expect(again.body.skipped.alreadyCandidates).toBe(2);

    const noReason = await officer.post(`/api/campus/drives/${driveId}/include`, { userId: s2.userId, reason: '' });
    expect(noReason.status).toBe(400);
    const notEligible = await officer.post(`/api/campus/drives/${driveId}/include`, { userId: s3.userId, reason: 'Wants to try anyway please' });
    expect(notEligible.status).toBe(409);
    const ok = await officer.post(`/api/campus/drives/${driveId}/include`, { userId: s2.userId, reason: 'CGPA sheet pending from exam cell; verified 8.1 on paper.' });
    expect(ok.status).toBe(201);
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'campus.drive_manual_include'), eq(auditLogs.orgId, nb)));
    expect(log.meta).toMatchObject({ userId: s2.userId, unknown: ['CGPA'] });
    const list = await officer.get(`/api/campus/drives/${driveId}/candidates`);
    expect(list.body.total).toBe(3);
    for (const it of list.body.items) cand[it.userId === s1.userId ? 's1' : it.userId === s2.userId ? 's2' : 's5'] = it.id;
    const s2c = list.body.items.find((i: { userId: string }) => i.userId === s2.userId);
    expect(s2c.eligibilitySnapshot.status).toBe('needs_data');
    expect(s2c.eligibilitySnapshot.manualInclusion.reason).toMatch(/CGPA sheet/);
    const [n] = await db.select().from(notifications).where(and(eq(notifications.userId, s1.userId), eq(notifications.type, 'campus.drive_invited')));
    expect(n.category).toBe('career');
  });

  it('students see only drives they are invited to or eligible for, and register before the deadline', async () => {
    const mine = await s1.get('/api/campus/me/drives');
    expect(mine.body.drives).toHaveLength(1);
    expect(mine.body.drives[0].candidate.stage).toBe('invited');
    expect(mine.body.drives[0].actions.canRegister).toBe(true);
    expect(mine.body.drives[0].drive.eligibility).toBeTruthy();
    const s3v = await s3.get('/api/campus/me/drives');
    expect(s3v.body.drives).toHaveLength(0);
    const s4v = await s4.get('/api/campus/me/drives');
    expect(s4v.body.drives).toHaveLength(0);
    expect(s4v.body.needsDataCount).toBe(1);
    expect((await s3.post(`/api/campus/me/drives/${driveId}/register`, {})).status).toBe(409);
    expect((await s4.post(`/api/campus/me/drives/${driveId}/register`, {})).status).toBe(409);
    expect((await rStudent.post(`/api/campus/me/drives/${driveId}/register`, {})).status).toBe(404);

    expect((await s1.post(`/api/campus/me/drives/${driveId}/register`, {})).status).toBe(200);
    expect((await s5.post(`/api/campus/me/drives/${driveId}/register`, {})).status).toBe(200);
    expect((await s1.post(`/api/campus/me/drives/${driveId}/register`, {})).status).toBe(409);
    expect((await s2.post(`/api/campus/me/drives/${driveId}/decline`, { reason: 'Going for higher studies' })).status).toBe(200);
  });

  it('a student cannot see the candidate list or other students’ records', async () => {
    expect((await s1.get(`/api/campus/drives/${driveId}/candidates`)).status).toBe(403);
    expect((await s1.get(`/api/campus/students/${rec.s3}`)).status).toBe(403);
    expect((await s1.get('/api/campus/students')).status).toBe(403);
    expect((await s1.get(`/api/campus/drives/${driveId}/report.csv`)).status).toBe(403);
  });

  it('links a placement assessment, invites registered candidates and pulls completion', async () => {
    const created = await officer.post(`/api/campus/drives/${driveId}/assessment`, { title: 'Helix SDE screening' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    assessmentId = created.body.assessmentId;
    const inv = await officer.post(`/api/campus/drives/${driveId}/assessment/invite`, {});
    expect(inv.status).toBe(200);
    expect(inv.body.invited).toBe(2);
    expect(inv.body.moved).toBe(2);
    expect(inv.body.warning).toMatch(/not published/);
    const invites = await db.select().from(assessmentInvites).where(eq(assessmentInvites.assessmentId, assessmentId));
    expect(invites.map((i) => i.userId).sort()).toEqual([s1.userId, s5.userId].sort());
    // Simulate graded and released attempts (as the engine records them).
    const now = new Date();
    await db.insert(attempts).values([
      { assessmentId, userId: s1.userId, orgId: nb, attemptNo: 1, status: 'released', items: [], score: 8, maxScore: 10, submittedAt: now, gradedAt: now, releasedAt: now },
      { assessmentId, userId: s5.userId, orgId: nb, attemptNo: 1, status: 'released', items: [], score: 4, maxScore: 10, submittedAt: now, gradedAt: now, releasedAt: now },
    ]);
    const list = await officer.get(`/api/campus/drives/${driveId}/candidates?stage=assessment`);
    const s1c = list.body.items.find((i: { userId: string }) => i.userId === s1.userId);
    expect(s1c.assessment).toMatchObject({ status: 'released', percent: 80, final: true });
    const a = await officer.get(`/api/campus/drives/${driveId}/assessment`);
    expect(a.body.stats).toMatchObject({ invited: 2, submitted: 2, finalScores: 2 });
  });

  it('shortlists by threshold only when explicitly applied, never rejecting', async () => {
    const dry = await officer.post(`/api/campus/drives/${driveId}/shortlist`, { threshold: 60 });
    expect(dry.body.applied).toBe(false);
    expect(dry.body.wouldMove.map((w: { candidateId: string }) => w.candidateId)).toEqual([cand.s1]);
    expect(dry.body.below.map((w: { candidateId: string }) => w.candidateId)).toEqual([cand.s5]);
    let list = await officer.get(`/api/campus/drives/${driveId}/candidates`);
    expect(list.body.stageCounts.interview ?? 0).toBe(0);
    const applied = await officer.post(`/api/campus/drives/${driveId}/shortlist`, { threshold: 60, apply: true });
    expect(applied.body.applied).toBe(true);
    list = await officer.get(`/api/campus/drives/${driveId}/candidates`);
    expect(list.body.stageCounts).toMatchObject({ interview: 1, assessment: 1 });
    expect(list.body.stageCounts.rejected ?? 0).toBe(0);
  });

  it('schedules an interview with a Jitsi link and records offer and placement', async () => {
    const past = await officer.post(`/api/campus/drives/${driveId}/interviews`, { candidateId: cand.s1, scheduledAt: new Date(Date.now() - 86400_000).toISOString(), meeting: { provider: 'jitsi' } });
    expect(past.status).toBe(400);
    const iv = await officer.post(`/api/campus/drives/${driveId}/interviews`, {
      candidateId: cand.s1,
      kind: 'technical',
      scheduledAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
      meeting: { provider: 'jitsi' },
      interviewers: [{ name: 'Ravi from Helix', email: 'ravi@helix.example' }],
    });
    expect(iv.status, JSON.stringify(iv.body)).toBe(201);
    expect(iv.body.interview.meetingUrl).toMatch(/^https:\/\/meet\.jit\.si\/LearnSphere-[A-Za-z0-9]{16}$/);
    expect(iv.body.interview.orgId).toBe(nb);
    const custom = await officer.post(`/api/campus/drives/${driveId}/interviews`, { candidateId: cand.s1, scheduledAt: new Date(Date.now() + 3 * 86400_000).toISOString(), meeting: { provider: 'custom', url: 'javascript:alert(1)' } });
    expect(custom.status).toBe(400);
    const mine = await s1.get('/api/campus/me/drives');
    expect(mine.body.drives[0].candidate.interviews[0].meetingUrl).toBe(iv.body.interview.meetingUrl);
    expect(mine.body.drives[0].candidate.interviews[0].interviewers).toEqual(['Ravi from Helix']);

    const offer = await officer.patch(`/api/campus/drives/${driveId}/candidates/${cand.s1}`, { stage: 'offer', offerCtcText: '12 LPA + joining bonus', note: 'Offer letter received from Helix' });
    expect(offer.status).toBe(200);
    expect(offer.body.candidate.offerCtcText).toBe('12 LPA + joining bonus');
    expect((await officer.patch(`/api/campus/drives/${driveId}/candidates/${cand.s1}`, { stage: 'placed' })).status).toBe(200);
    expect((await officer.patch(`/api/campus/drives/${driveId}/candidates/${cand.s1}`, { stage: 'invited' })).status).toBe(400);
    const hist = await officer.get(`/api/campus/drives/${driveId}/candidates/${cand.s1}/history`);
    expect(hist.body.events.map((e: { toStage: string }) => e.toStage)).toEqual(['invited', 'registered', 'assessment', 'interview', 'offer', 'placed']);
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'campus.candidate_stage_changed'), eq(auditLogs.targetId, cand.s1)));
    expect(logs.length).toBeGreaterThanOrEqual(3);
    const bulkNoConfirm = await officer.post(`/api/campus/drives/${driveId}/candidates/bulk-stage`, { candidateIds: [cand.s5], stage: 'rejected' });
    expect(bulkNoConfirm.status).toBe(400);
  });

  it('reports the funnel correctly and exports CSV with an audit entry', async () => {
    const r = await officer.get(`/api/campus/drives/${driveId}/report`);
    const f = Object.fromEntries(r.body.funnel.map((s: { key: string; count: number }) => [s.key, s.count]));
    expect(f).toEqual({ invited: 3, registered: 2, assessed: 2, interviewed: 1, offers: 1, placed: 1 });
    expect(r.body.funnel[0].definition).toBeTruthy();
    expect(r.body.offers[0]).toMatchObject({ ctcText: '12 LPA + joining bonus', ctcNumber: null });

    const csv = await officer.get(`/api/campus/drives/${driveId}/report.csv`);
    expect(csv.status).toBe(200);
    expect(String(csv.body)).toContain('Asha Eligible');
    expect(String(csv.body)).toContain('Placed');
    const el = await officer.get(`/api/campus/drives/${driveId}/eligible.csv`);
    expect(String(el.body)).toContain('Needs data');
    const pr = await officer.get('/api/campus/reports/placement.csv');
    expect(pr.status).toBe(200);
    const exports = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'campus.export'), eq(auditLogs.orgId, nb)));
    expect(exports.length).toBe(3);

    const rep = await officer.get('/api/campus/reports');
    const y2027 = rep.body.batches.find((b: { graduationYear: number | null }) => b.graduationYear === 2027);
    expect(y2027.placed).toBe(1);
    expect(y2027.optedIn).toBe(5);
    expect(rep.body.definitions.placementRate).toMatch(/opted in/);
    expect(rep.body.offersByCompany[0]).toMatchObject({ companyName: 'Helix Labs', offers: 1, placed: 1 });
    const ov = await officer.get('/api/campus/overview');
    expect(ov.status).toBe(200);
    expect(ov.body.drives[0].funnel.placed).toBe(1);
    expect(ov.body.readiness.skills.map((s: { slug: string }) => s.slug).sort()).toEqual(['arrays', 'python']);
  });
});

describe('corrections', () => {
  let correctionId: string;
  it('students request corrections on their own record; officers approve with audit and notification', async () => {
    const mine = await s2.get('/api/campus/me/record');
    expect(mine.body.records).toHaveLength(1);
    expect(mine.body.records[0].cgpa).toBeNull();
    expect(mine.body.records[0].gaps).toContain('cgpa');
    const short = await s2.post('/api/campus/me/record/corrections', { field: 'cgpa', proposedValue: '8.1', reason: 'short' });
    expect(short.status).toBe(400);
    const other = await s2.post('/api/campus/me/record/corrections', { recordId: rec.s1, field: 'cgpa', proposedValue: '2', reason: 'Trying to edit someone else' });
    expect(other.status).toBe(404);
    const r = await s2.post('/api/campus/me/record/corrections', { field: 'cgpa', proposedValue: '8.1', reason: 'Semester 5 marksheet shows CGPA 8.1.' });
    expect(r.status).toBe(201);
    correctionId = r.body.correction.id;
    expect((await s2.post('/api/campus/me/record/corrections', { field: 'cgpa', proposedValue: '8.2', reason: 'Duplicate request for cgpa' })).status).toBe(409);
    const q = await officer.get('/api/campus/corrections');
    expect(q.body.items.map((i: { id: string }) => i.id)).toContain(correctionId);
    expect((await rOfficer.post(`/api/campus/corrections/${correctionId}/approve`, {})).status).toBe(404);
    const ok = await officer.post(`/api/campus/corrections/${correctionId}/approve`, {});
    expect(ok.status).toBe(200);
    const [row] = await db.select().from(studentRecords).where(eq(studentRecords.id, rec.s2));
    expect(row.cgpa).toBe(8.1);
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'campus.correction_approved'));
    expect(log.meta).toMatchObject({ field: 'cgpa', to: '8.1' });
    const [n] = await db.select().from(notifications).where(and(eq(notifications.userId, s2.userId), eq(notifications.type, 'campus.correction_reviewed')));
    expect(n.title).toMatch(/approved/);
    expect((await officer.post(`/api/campus/corrections/${correctionId}/approve`, {})).status).toBe(409);
  });

  it('rejection needs a note', async () => {
    const r = await s3.post('/api/campus/me/record/corrections', { field: 'activeBacklogs', proposedValue: '0', reason: 'I cleared my backlogs last month.' });
    const id = r.body.correction.id;
    expect((await officer.post(`/api/campus/corrections/${id}/reject`, { note: '' })).status).toBe(400);
    const rej = await officer.post(`/api/campus/corrections/${id}/reject`, { note: 'Results not published yet; resubmit after the exam cell update.' });
    expect(rej.status).toBe(200);
    const mine = await s3.get('/api/campus/me/record');
    expect(mine.body.records[0].corrections[0]).toMatchObject({ status: 'rejected' });
    expect(mine.body.records[0].activeBacklogs).toBe(2);
  });
});

describe('tenant isolation', () => {
  it('a Riverside placement officer gets 404 on Northbridge drives, records and exports', async () => {
    expect((await rOfficer.get(`/api/campus/drives/${driveId}`)).status).toBe(404);
    expect((await rOfficer.get(`/api/campus/drives/${driveId}/candidates`)).status).toBe(404);
    expect((await rOfficer.get(`/api/campus/drives/${driveId}/report.csv`)).status).toBe(404);
    expect((await rOfficer.get(`/api/campus/drives/${driveId}/eligible.csv`)).status).toBe(404);
    expect((await rOfficer.post(`/api/campus/drives/${driveId}/eligibility/preview`, {})).status).toBe(404);
    expect((await rOfficer.patch(`/api/campus/drives/${driveId}/candidates/${cand.s1}`, { stage: 'rejected' })).status).toBe(404);
    expect((await rOfficer.get(`/api/campus/students/${rec.s1}`)).status).toBe(404);
    expect((await rOfficer.post(`/api/campus/students/${rec.s1}/verify`, {})).status).toBe(404);
    const list = await rOfficer.get('/api/campus/drives');
    expect(list.body.items).toHaveLength(0);
    const students = await rOfficer.get('/api/campus/students');
    expect(students.body.total).toBe(0);
    // The Riverside placement report contains no Northbridge students.
    const pr = await rOfficer.get('/api/campus/reports/placement.csv');
    expect(String(pr.body)).not.toContain('Asha');
  });
});
