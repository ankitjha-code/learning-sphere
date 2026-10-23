import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../client';
import {
  applicationEvents,
  applications,
  assessmentInvites,
  assessments,
  hireCandidatePreferences,
  hireCompanyProfiles,
  hiringDecisions,
  interviewFeedback,
  interviews,
  jobApplications,
  jobPostings,
  messages,
  offers,
  skills,
  DEFAULT_PIPELINE,
} from '../../schema';
import type { DemoContext } from './context';

const DAY = 86400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);

const PERSONAL: Record<string, string> = { assessment: 'assessment', interview: 'interview', offer: 'offer', hired: 'accepted', rejected: 'rejected' };

/**
 * TalentBridge sample data for Helix Labs (and one Orbit Systems posting to show tenant isolation).
 * Everything lives in sample orgs with @demo.learnsphere.test accounts.
 */
export async function seed(ctx: DemoContext) {
  const helix = ctx.orgs.helix;
  const [exists] = await db.select({ id: jobPostings.id }).from(jobPostings).where(and(eq(jobPostings.orgId, helix), eq(jobPostings.title, 'Backend Engineer (Python)')));
  if (exists) return;

  const skillRows = await db.select({ slug: skills.slug, name: skills.name }).from(skills).where(inArray(skills.slug, ['python', 'sql-basics', 'http-rest', 'arrays', 'programming-basics', 'oop']));
  const skill = (slug: string, required: boolean, minLevel?: number) => {
    const s = skillRows.find((r) => r.slug === slug);
    return s ? [{ slug, name: s.name, required, ...(minLevel ? { minLevel } : {}) }] : [];
  };

  await db
    .insert(hireCompanyProfiles)
    .values({
      orgId: helix,
      about: 'Helix Labs (sample company) builds learning tools used by schools and universities. Small teams own whole products end to end.',
      values: ['Learn in public', 'Ship small, ship often', 'Respect for the learner'],
      benefits: ['Hybrid work', 'Learning budget', 'Health insurance', 'Mentorship from senior engineers'],
      locations: ['Bengaluru', 'Remote (India)'],
      hiringProcess: '1. Application review by a recruiter. 2. A 60-minute skills screen. 3. Two structured interviews with engineers. 4. Offer. Every decision is made by people and recorded with a reason.',
      updatedBy: ctx.users.recruiter,
    })
    .onConflictDoNothing();

  const [backend, intern] = await db
    .insert(jobPostings)
    .values([
      {
        orgId: helix,
        createdBy: ctx.users.recruiter,
        title: 'Backend Engineer (Python)',
        team: 'Platform',
        location: 'Bengaluru',
        workplace: 'hybrid',
        employmentType: 'full_time',
        description:
          'Sample posting. Build and operate the Python services behind our learning products: REST APIs, data models in Postgres and background jobs. You will pair with senior engineers and own features from design to production.',
        responsibilities: ['Design and build REST APIs in Python', 'Write and review SQL for product features', 'Add tests and monitoring to the services you own', 'Take part in code review and on-call with support'],
        requiredSkills: [...skill('python', true, 2), ...skill('sql-basics', true), ...skill('http-rest', true), ...skill('arrays', false)],
        eligibility: { minExperienceYears: 0, workAuthorization: 'Eligible to work in India', notes: 'Career switchers welcome; we look at demonstrated skills, not degrees.' },
        salaryText: 'INR 12-18 LPA (sample)',
        stages: [...DEFAULT_PIPELINE],
        openings: 2,
        status: 'published',
        publishedAt: daysAgo(21),
        closesAt: daysAhead(30),
      },
      {
        orgId: helix,
        createdBy: ctx.users.recruiter,
        title: 'SDE Intern 2027',
        team: 'Engineering',
        location: 'Bengaluru',
        workplace: 'onsite',
        employmentType: 'internship',
        description: 'Sample posting for campus hiring. A 6-month internship for students graduating in 2027, working on real features with a mentor.',
        responsibilities: ['Ship one feature end to end with a mentor', 'Write tests and documentation', 'Present your work at the end of the internship'],
        requiredSkills: [...skill('programming-basics', true), ...skill('arrays', true), ...skill('python', false)],
        eligibility: { graduationYears: [2027], degrees: ['B.Tech', 'B.E.', 'B.Sc'], notes: 'Offered through campus placement drives.' },
        salaryText: 'INR 40,000 per month stipend (sample)',
        stages: ['applied', 'eligibility_review', 'assessment', 'interview', 'offer', 'hired'],
        openings: 5,
        status: 'published',
        publishedAt: daysAgo(14),
        closesAt: daysAhead(45),
        campusOnly: true,
      },
      {
        orgId: helix,
        createdBy: ctx.users.recruiter,
        title: 'Data Analyst',
        team: 'Insights',
        location: 'Remote (India)',
        workplace: 'remote',
        employmentType: 'full_time',
        description: 'Draft. Analyse learning data with SQL and Python to help product teams decide what to build next.',
        responsibilities: ['Build dashboards', 'Answer product questions with data'],
        requiredSkills: [...skill('sql-basics', true), ...skill('python', false)],
        eligibility: {},
        status: 'draft',
      },
    ])
    .returning();

  await db.insert(jobPostings).values({
    orgId: ctx.orgs.orbit,
    createdBy: ctx.users.orbitRecruiter,
    title: 'Frontend Developer',
    team: 'Web',
    location: 'Pune',
    workplace: 'hybrid',
    employmentType: 'full_time',
    description: 'Sample posting from a second company. Helix Labs recruiters cannot see this posting or its applicants.',
    responsibilities: ['Build accessible UI components'],
    requiredSkills: [...skill('http-rest', true)],
    eligibility: {},
    status: 'published',
    publishedAt: daysAgo(5),
  });

  // Link the existing recruitment screen to the backend job (skipped if the assessments seed did not create it).
  const [screen] = await db.select({ id: assessments.id }).from(assessments).where(and(eq(assessments.orgId, helix), eq(assessments.title, 'Backend engineer screen (sample)')));
  if (screen) await db.update(jobPostings).set({ assessmentId: screen.id }).where(eq(jobPostings.id, backend.id));

  // Applications with decision history.
  type Step = { to: string; reason: string; visible?: boolean; at: number; by?: string };
  async function application(p: { posting: typeof backend; candidateId: string; source: string; appliedDaysAgo: number; coverNote?: string; portfolioShared: boolean; steps: Step[] }) {
    const last = p.steps[p.steps.length - 1];
    const stage = last?.to ?? 'applied';
    const status = stage === 'rejected' ? 'rejected' : stage === 'hired' ? 'hired' : 'active';
    const [ja] = await db
      .insert(jobApplications)
      .values({
        postingId: p.posting.id,
        orgId: p.posting.orgId,
        candidateId: p.candidateId,
        stage,
        status,
        source: p.source,
        coverNote: p.coverNote ?? null,
        portfolioShared: p.portfolioShared,
        appliedAt: daysAgo(p.appliedDaysAgo),
        updatedAt: last ? daysAgo(last.at) : daysAgo(p.appliedDaysAgo),
      })
      .returning();
    let from = 'applied';
    for (const s of p.steps) {
      await db.insert(hiringDecisions).values({ applicationId: ja.id, orgId: ja.orgId, decidedBy: s.by ?? ctx.users.recruiter, fromStage: from, toStage: s.to, reason: s.reason, visibleToCandidate: !!s.visible, createdAt: daysAgo(s.at) });
      from = s.to;
    }
    const personalStatus = PERSONAL[stage] ?? 'applied';
    const [personal] = await db
      .insert(applications)
      .values({
        userId: p.candidateId,
        company: 'Helix Labs',
        role: p.posting.title,
        source: 'platform',
        jobPostingId: p.posting.id,
        jobApplicationId: ja.id,
        location: p.posting.location,
        status: personalStatus,
        appliedAt: daysAgo(p.appliedDaysAgo),
        salaryText: p.posting.salaryText,
        deadline: p.posting.closesAt,
        notes: 'Sample platform application.',
      })
      .returning();
    await db.insert(applicationEvents).values({ applicationId: personal.id, kind: 'status', fromStatus: null, toStatus: 'applied', note: 'Applied on LearnSphere Nexus', createdAt: daysAgo(p.appliedDaysAgo) });
    if (personalStatus !== 'applied') await db.insert(applicationEvents).values({ applicationId: personal.id, kind: 'status', fromStatus: 'applied', toStatus: personalStatus, note: 'Employer update', createdAt: daysAgo(last.at) });
    return ja;
  }

  const learnerApp = await application({
    posting: backend,
    candidateId: ctx.users.learner,
    source: 'direct',
    appliedDaysAgo: 18,
    coverNote: 'I moved from library operations into backend development and built a small REST API with Python and SQLite. I would love to grow on a platform team.',
    portfolioShared: true,
    steps: [
      { to: 'eligibility_review', reason: 'Moved to Eligibility review', at: 17 },
      { to: 'shortlisted', reason: 'Python and SQL practice evidence matches the core requirements.', at: 15 },
      { to: 'assessment', reason: 'Moved to Assessment', at: 14, visible: false },
      { to: 'interview', reason: 'Screen completed; invite to technical interview.', at: 6, visible: true },
    ],
  });
  const studentApp = await application({
    posting: intern,
    candidateId: ctx.users.student,
    source: 'campus_drive',
    appliedDaysAgo: 12,
    portfolioShared: true,
    steps: [
      { to: 'eligibility_review', reason: 'Moved to Eligibility review', at: 11 },
      { to: 'assessment', reason: 'Meets the 2027 graduation requirement.', at: 10 },
      { to: 'interview', reason: 'Strong arrays and programming basics in the screen.', at: 8 },
      { to: 'offer', reason: 'Both interviewers recommended hire; team agreed.', at: 2, visible: true },
    ],
  });
  const [s2, s3] = ctx.users.students;
  if (s2)
    await application({
      posting: backend,
      candidateId: s2,
      source: 'direct',
      appliedDaysAgo: 9,
      portfolioShared: false,
      steps: [
        { to: 'eligibility_review', reason: 'Moved to Eligibility review', at: 8 },
        { to: 'shortlisted', reason: 'Demonstrated Python practice; SQL evidence still light.', at: 5 },
      ],
    });
  if (s3)
    await application({
      posting: backend,
      candidateId: s3,
      source: 'direct',
      appliedDaysAgo: 16,
      portfolioShared: false,
      steps: [{ to: 'rejected', reason: 'The role needs production SQL experience; encourage reapplying after more SQL practice.', at: 12, visible: true }],
    });

  // Tie the learner's existing screen invitation to this application.
  if (screen)
    await db
      .update(assessmentInvites)
      .set({ applicationId: learnerApp.id })
      .where(and(eq(assessmentInvites.assessmentId, screen.id), eq(assessmentInvites.userId, ctx.users.learner)));

  // Interviews: one upcoming for the learner, one completed (with feedback) for the student.
  const tomorrow = new Date(daysAhead(1).setUTCHours(5, 30, 0, 0));
  await db.insert(interviews).values({
    orgId: helix,
    applicationId: learnerApp.id,
    candidateId: ctx.users.learner,
    title: 'Technical interview: Backend Engineer (Python)',
    kind: 'technical',
    scheduledAt: tomorrow,
    durationMinutes: 60,
    meetingUrl: 'https://meet.jit.si/LearnSphere-SampleHelixAsha01',
    meetingProvider: 'jitsi',
    interviewerIds: [ctx.users.interviewer],
    createdBy: ctx.users.recruiter,
  });
  const [done] = await db
    .insert(interviews)
    .values({
      orgId: helix,
      applicationId: studentApp.id,
      candidateId: ctx.users.student,
      title: 'Technical interview: SDE Intern 2027',
      kind: 'technical',
      scheduledAt: daysAgo(4),
      durationMinutes: 45,
      meetingUrl: 'https://meet.jit.si/LearnSphere-SampleHelixRohan1',
      meetingProvider: 'jitsi',
      interviewerIds: [ctx.users.interviewer],
      status: 'completed',
      createdBy: ctx.users.recruiter,
    })
    .returning();
  await db.insert(interviewFeedback).values({
    interviewId: done.id,
    interviewerId: ctx.users.interviewer,
    recommendation: 'yes',
    scores: [
      { competency: 'Problem solving', rating: 3, note: 'Broke the array problem into steps and tested edge cases.' },
      { competency: 'Technical depth', rating: 3, note: 'Comfortable with complexity analysis.' },
      { competency: 'Communication', rating: 4, note: 'Explained trade-offs clearly.' },
    ],
    summary: 'Sample feedback: solid fundamentals and clear communication. Recommend an internship offer.',
    submittedAt: daysAgo(4),
  });

  await db.insert(offers).values({
    orgId: helix,
    applicationId: studentApp.id,
    title: 'SDE Intern 2027',
    compensationText: 'INR 40,000 per month stipend, 6 months, Bengaluru (sample offer)',
    startDate: daysAhead(120),
    expiresAt: daysAhead(10),
    status: 'extended',
    notes: 'Sample offer for demonstration.',
    createdBy: ctx.users.recruiter,
  });

  await db.insert(messages).values([
    { threadKey: `app:${learnerApp.id}`, orgId: helix, senderId: ctx.users.recruiter, body: 'Hi Asha, thanks for completing the screen. Your technical interview is tomorrow; the link is on your application page.', readBy: [ctx.users.recruiter], createdAt: daysAgo(1) },
    { threadKey: `app:${learnerApp.id}`, orgId: helix, senderId: ctx.users.learner, body: 'Thank you, Jordan. I will be there. Is there anything I should prepare?', readBy: [ctx.users.learner], createdAt: daysAgo(0.9) },
  ]);

  // The independent learner opted in to recruiter search (sample consent).
  await db.insert(hireCandidatePreferences).values({ userId: ctx.users.learner, discoverableByRecruiters: true }).onConflictDoNothing();
}
