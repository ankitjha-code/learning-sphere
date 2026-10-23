import crypto from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../client';
import {
  academicTerms,
  assessmentInvites,
  assessmentItems,
  assessments,
  attempts,
  campusInterviewDetails,
  cohortMembers,
  cohorts,
  departments,
  driveCandidates,
  driveStageEvents,
  employerRelationships,
  interviews,
  placementDrives,
  programs,
  questions,
  recordCorrections,
  skills,
  studentRecords,
} from '../../schema';
import { addEvidence } from '../../../modules/learning/skilldna';
import { DEFAULT_SETTINGS } from '../../../modules/assessments/schemas';
import type { DemoContext } from './context';

const DAY = 86400_000;
const at = (days: number, hours = 0) => new Date(Date.now() + days * DAY + hours * 3600_000);

function jitsi() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return `https://meet.jit.si/LearnSphere-${s}`;
}

/**
 * Campus sample data (Journey 5). Northbridge runs placement drives; Riverside has its own small
 * structure so tenant isolation can be shown. All data lives in sample orgs.
 */
export async function seed(ctx: DemoContext) {
  const nb = ctx.orgs.northbridge;
  const officer = ctx.users.placement;
  const [meera, kabir, ananya, dev, sara, arjun] = ctx.users.students;
  const student = ctx.users.student;

  // ---------- Structure ----------
  const [cse, ece] = await db
    .insert(departments)
    .values([
      { orgId: nb, name: 'Computer Science and Engineering', code: 'CSE', headUserId: ctx.users.faculty },
      { orgId: nb, name: 'Electronics and Communication Engineering', code: 'ECE' },
    ])
    .returning();
  const [btcse, btece] = await db
    .insert(programs)
    .values([
      { orgId: nb, departmentId: cse.id, name: 'B.Tech Computer Science and Engineering', code: 'BTCSE', durationYears: 4 },
      { orgId: nb, departmentId: ece.id, name: 'B.Tech Electronics and Communication', code: 'BTECE', durationYears: 4 },
    ])
    .returning();
  const year = new Date().getUTCFullYear();
  const [term] = await db
    .insert(academicTerms)
    .values([
      { orgId: nb, name: `${year}-${String(year + 1).slice(2)} Odd Semester`, startsOn: `${year}-07-15`, endsOn: `${year}-12-10`, isCurrent: true },
      { orgId: nb, name: `${year - 1}-${String(year).slice(2)} Even Semester`, startsOn: `${year}-01-08`, endsOn: `${year}-05-20`, isCurrent: false },
    ])
    .returning();
  // Batch cohort (kept separate from Teach's section cohorts).
  const [batch] = await db.insert(cohorts).values({ orgId: nb, programId: btcse.id, termId: term.id, name: 'CSE 2027', kind: 'batch', graduationYear: 2027 }).returning();
  const roster = [student, meera, kabir, ananya, dev, sara, arjun];
  await db.insert(cohortMembers).values(roster.map((userId) => ({ cohortId: batch.id, userId, role: 'student' }))).onConflictDoNothing();

  // ---------- Student records ----------
  const verified = { verifiedAt: at(-20), verifiedBy: officer };
  const base = { orgId: nb, programId: btcse.id, departmentId: cse.id, graduationYear: 2027 };
  const recs = await db
    .insert(studentRecords)
    .values([
      { ...base, userId: student, rollNumber: 'NB27CSE001', cgpa: 8.2, activeBacklogs: 0, attendancePercent: 88, ...verified },
      { ...base, userId: meera, rollNumber: 'NB27CSE002', cgpa: 8.9, activeBacklogs: 0, attendancePercent: 93, ...verified },
      { ...base, userId: kabir, rollNumber: 'NB27CSE003', cgpa: 7.4, activeBacklogs: 0, attendancePercent: 81, ...verified },
      // Missing CGPA: eligibility shows "Needs data", never "not eligible".
      { ...base, userId: ananya, rollNumber: 'NB27CSE004', cgpa: null, activeBacklogs: 0, attendancePercent: 90 },
      // Active backlogs: not eligible for drives requiring zero backlogs.
      { ...base, userId: dev, rollNumber: 'NB27CSE005', cgpa: 7.1, activeBacklogs: 2, attendancePercent: 76, ...verified },
      // Not yet verified (shows in the verification queue).
      { ...base, userId: sara, rollNumber: 'NB27CSE006', cgpa: 8.1, activeBacklogs: 0 },
      { ...base, userId: arjun, rollNumber: 'NB27CSE007', cgpa: 7.8, activeBacklogs: 0, attendancePercent: 84, ...verified },
    ])
    .returning();
  const recOf = (uid: string) => recs.find((r) => r.userId === uid)!;

  await db.insert(recordCorrections).values({
    orgId: nb,
    recordId: recOf(ananya).id,
    requestedBy: ananya,
    field: 'cgpa',
    currentValue: null,
    proposedValue: '7.6',
    reason: 'My CGPA is missing. The semester 5 grade card from the exam cell shows 7.6.',
  });

  // ---------- Skill evidence for the drive's required skills ----------
  const sk = await db.select({ id: skills.id, slug: skills.slug }).from(skills).where(inArray(skills.slug, ['arrays', 'python']));
  for (const uid of [student, meera, kabir, sara, arjun, ananya, dev]) {
    for (const s of sk) await addEvidence({ userId: uid, skillId: s.id, source: 'practice', sourceType: 'campus_demo', sourceId: `demo-${s.slug}`, score: 0.82, orgId: nb, note: 'Sample practice evidence' });
  }

  // ---------- Employers ----------
  await db.insert(employerRelationships).values([
    { orgId: nb, companyOrgId: ctx.orgs.helix, companyName: 'Helix Labs', contactName: 'Rohan Iyer', contactEmail: 'campus@helix.example', status: 'active', notes: 'Hires 3 to 5 SDE interns each year. Prefers Python and DSA screening.' },
    { orgId: nb, companyOrgId: ctx.orgs.orbit, companyName: 'Orbit Systems', contactName: 'Leela Das', contactEmail: 'talent@orbit.example', status: 'active', notes: 'Graduate engineer program; one drive per year.' },
    { orgId: nb, companyName: 'Northwind Analytics', status: 'prospect', notes: 'Met at the industry day; follow up in January.' },
  ]);

  // ---------- Drives ----------
  const addCandidate = async (driveId: string, userId: string, path: string[], extra: Partial<typeof driveCandidates.$inferInsert> = {}) => {
    const stage = path[path.length - 1];
    const [c] = await db
      .insert(driveCandidates)
      .values({ driveId, userId, stage, eligibilitySnapshot: { eligible: true, reasons: [], unknown: [] }, updatedBy: officer, ...extra })
      .returning();
    let from: string | null = null;
    for (const [i, to] of path.entries()) {
      await db.insert(driveStageEvents).values({ orgId: nb, driveId, candidateId: c.id, userId, fromStage: from, toStage: to, actorId: to === 'registered' ? userId : officer, actorKind: to === 'registered' ? 'student' : 'officer', createdAt: at(-10 + i) });
      from = to;
    }
    return c;
  };

  // A completed drive so reports have outcomes.
  const [orbitDrive] = await db
    .insert(placementDrives)
    .values({
      orgId: nb,
      companyOrgId: ctx.orgs.orbit,
      companyName: 'Orbit Systems',
      title: 'Orbit Systems Graduate Engineer 2027',
      roleTitle: 'Graduate Engineer Trainee',
      description: 'Pre-placement offers for the 2027 batch.',
      ctcText: '6.5 LPA',
      location: 'Pune',
      eligibility: { graduationYears: [2027], minCgpa: 6.5, maxActiveBacklogs: 0 },
      registrationDeadline: at(-30),
      status: 'completed',
      createdBy: officer,
      createdAt: at(-45),
    })
    .returning();
  await addCandidate(orbitDrive.id, kabir, ['invited', 'registered', 'interview', 'offer', 'placed'], { offerCtcText: '6.5 LPA' });
  await addCandidate(orbitDrive.id, arjun, ['invited', 'registered', 'interview', 'rejected']);

  const [drive] = await db
    .insert(placementDrives)
    .values({
      orgId: nb,
      companyOrgId: ctx.orgs.helix,
      companyName: 'Helix Labs',
      title: 'Helix Labs SDE Intern 2027',
      roleTitle: 'Software Development Engineer Intern',
      description: 'Six-month internship on the platform team with a pre-placement offer for strong performers. Process: online assessment, one technical interview, one HR conversation.',
      ctcText: '45,000 per month stipend',
      location: 'Bengaluru (hybrid)',
      eligibility: { programIds: [btcse.id], graduationYears: [2027], minCgpa: 7, maxActiveBacklogs: 0, requiredSkillSlugs: ['arrays', 'python'] },
      registrationDeadline: at(10),
      stages: ['registered', 'assessment', 'interview', 'offer'],
      status: 'open',
      createdBy: officer,
      createdAt: at(-12),
    })
    .returning();

  // Placement assessment (engine schema: mode 'placement', driveId set, published with a few public questions).
  const qs = await db
    .select({ id: questions.id, version: questions.version, points: questions.points })
    .from(questions)
    .where(and(isNull(questions.orgId), eq(questions.status, 'active'), inArray(questions.type, ['single', 'multi', 'true_false'])))
    .limit(4);
  const [assessment] = await db
    .insert(assessments)
    .values({
      orgId: nb,
      ownerId: officer,
      title: 'Helix SDE Intern screening',
      description: 'Short screening on arrays, complexity and Python basics.',
      mode: 'placement',
      settings: { ...DEFAULT_SETTINGS, timeLimitMinutes: 45, maxAttempts: 1, resultRelease: 'manual' },
      status: qs.length ? 'published' : 'draft',
      publishedAt: qs.length ? at(-5) : null,
      driveId: drive.id,
    })
    .returning();
  const items = qs.length
    ? await db
        .insert(assessmentItems)
        .values(qs.map((q, i) => ({ assessmentId: assessment.id, questionId: q.id, questionVersion: q.version, points: q.points, sortOrder: i })))
        .returning()
    : [];
  const maxScore = items.reduce((a, i) => a + i.points, 0) || 10;
  await db.update(placementDrives).set({ assessmentId: assessment.id }).where(eq(placementDrives.id, drive.id));

  await addCandidate(drive.id, student, ['invited', 'registered', 'assessment']);
  const meeraC = await addCandidate(drive.id, meera, ['invited', 'registered', 'assessment', 'interview'], { interviewAt: at(3, 2) });
  await addCandidate(drive.id, arjun, ['invited', 'registered']);
  await addCandidate(drive.id, sara, ['invited']);

  await db.insert(assessmentInvites).values([student, meera].map((userId) => ({ assessmentId: assessment.id, userId, invitedBy: officer, dueAt: at(5) })));
  const attemptItems = items.map((i) => ({ itemId: i.id, questionId: i.questionId, questionVersion: i.questionVersion, points: i.points }));
  const [aStudent, aMeera] = await db
    .insert(attempts)
    .values([
      { assessmentId: assessment.id, userId: student, orgId: nb, attemptNo: 1, status: 'released', items: attemptItems, startedAt: at(-3), submittedAt: at(-3, 1), gradedAt: at(-3, 1), releasedAt: at(-2), score: Math.round(maxScore * 0.7 * 10) / 10, maxScore },
      { assessmentId: assessment.id, userId: meera, orgId: nb, attemptNo: 1, status: 'released', items: attemptItems, startedAt: at(-3), submittedAt: at(-3, 1), gradedAt: at(-3, 1), releasedAt: at(-2), score: Math.round(maxScore * 0.9 * 10) / 10, maxScore },
    ])
    .returning();
  await db.update(assessmentInvites).set({ status: 'completed' }).where(eq(assessmentInvites.assessmentId, assessment.id));
  // Deterministically graded assessment evidence is verified evidence.
  for (const [att, uid, score] of [[aStudent, student, 0.7], [aMeera, meera, 0.9]] as const) {
    for (const s of sk) await addEvidence({ userId: uid, skillId: s.id, source: 'assessment', sourceType: 'attempt', sourceId: att.id, score, verified: true, orgId: nb });
  }

  const [iv] = await db
    .insert(interviews)
    .values({ orgId: nb, driveCandidateId: meeraC.id, candidateId: meera, title: 'Helix Labs technical interview', kind: 'technical', scheduledAt: at(3, 2), durationMinutes: 45, meetingUrl: jitsi(), meetingProvider: 'jitsi', createdBy: officer })
    .returning();
  await db.insert(campusInterviewDetails).values({ interviewId: iv.id, orgId: nb, driveId: drive.id, interviewers: [{ name: 'Priya Raman (Helix Labs)', email: 'priya.raman@helix.example' }], notes: 'Arrays and Python problem solving; 10 minutes for questions.' });

  // A draft drive for the ECE program.
  await db.insert(placementDrives).values({
    orgId: nb,
    companyName: 'Northwind Analytics',
    title: 'Northwind Analytics Data Intern',
    roleTitle: 'Data Analyst Intern',
    ctcText: 'Stipend to be confirmed',
    location: 'Remote',
    eligibility: { programIds: [btcse.id, btece.id], graduationYears: [2027], minCgpa: 6.5 },
    status: 'draft',
    createdBy: officer,
  });

  // ---------- Riverside (isolation) ----------
  const rv = ctx.orgs.riverside;
  const [bba] = await db.insert(departments).values({ orgId: rv, name: 'Business Administration', code: 'BBA' }).returning();
  const [bbaProg] = await db.insert(programs).values({ orgId: rv, departmentId: bba.id, name: 'Bachelor of Business Administration', code: 'BBA', durationYears: 3 }).returning();
  await db.insert(studentRecords).values({ orgId: rv, userId: ctx.users.riversideStudent, rollNumber: 'RC26BBA014', programId: bbaProg.id, departmentId: bba.id, graduationYear: 2026, cgpa: 8.4, activeBacklogs: 0 });
}
