import { db } from '../../client';
import { mentorships, mentorSessions, mentorFeedback, messages, goals, activityEvents, mentorshipAssignments, mentorshipNotes } from '../../schema';
import type { DemoContext } from './context';

const day = 86400_000;

/** Sample data for this module (clearly sample: sample orgs and @demo.learnsphere.test accounts). */
export async function seed(ctx: DemoContext) {
  const { mentor, learner, student } = ctx.users;
  const now = Date.now();

  // Active mentorship: the learner shares Skill DNA and projects, not assessments or applications.
  const [m] = await db
    .insert(mentorships)
    .values({
      mentorId: mentor,
      menteeId: learner,
      status: 'active',
      requestMessage: 'I am moving from library operations into backend development and want help choosing projects and preparing for interviews.',
      goalsSummary: 'Build one portfolio-ready API and be interview-ready in 4 months.',
      sharing: { skillDna: true, projects: true, assessments: false, applications: false },
      startedAt: new Date(now - 21 * day),
      createdAt: new Date(now - 23 * day),
    })
    .returning();

  const completedAt = new Date(now - 7 * day);
  const [done] = await db
    .insert(mentorSessions)
    .values([
      {
        mentorshipId: m.id,
        scheduledAt: completedAt,
        durationMinutes: 45,
        agenda: 'Kickoff: goals, current skills, first project choice',
        meetingUrl: 'https://meet.jit.si/LearnSphere-SampleKickoff2026',
        status: 'completed',
        sharedNotes:
          'We agreed on a REST API for a library catalogue as the first project, using Python and PostgreSQL. Focus for the next two weeks: SQL joins and HTTP basics.',
        mentorPrivateNotes: 'Strong analytical background from reporting work. Nervous about interviews; start mock questions gently in week 4.',
        followUps: [
          { id: 'fu1', text: 'Draft the data model for the catalogue API', done: true },
          { id: 'fu2', text: 'Finish the SQL joins topic and practice set', done: false },
        ],
      },
      {
        mentorshipId: m.id,
        scheduledAt: new Date(now + 5 * day),
        durationMinutes: 30,
        agenda: 'Review the data model and the first two endpoints',
        meetingUrl: 'https://meet.jit.si/LearnSphere-SampleReview20261',
        status: 'scheduled',
      },
    ])
    .returning();

  for (const uid of [mentor, learner]) {
    await db
      .insert(activityEvents)
      .values({ userId: uid, kind: 'mentor.session', label: 'Completed a mentor session', xp: 15, minutes: 45, dedupeKey: `mentor-session:${done.id}`, createdAt: completedAt, link: uid === mentor ? `/app/mentor/mentees/${m.id}` : `/app/mentors/m/${m.id}` })
      .onConflictDoNothing();
  }

  await db.insert(goals).values([
    { userId: learner, title: 'Ship the library catalogue API with tests', kind: 'milestone', source: 'mentor', createdBy: mentor, targetDate: new Date(now + 35 * day) },
    { userId: learner, title: 'Study 4 hours this week', kind: 'weekly', source: 'mentor', createdBy: mentor, metric: { type: 'minutes', target: 240 } },
  ]);

  await db.insert(mentorshipAssignments).values([
    { mentorshipId: m.id, createdBy: mentor, kind: 'topic', title: 'SQL joins and aggregation', link: '/app/learn', note: 'Do the practice set too.', dueAt: new Date(now + 4 * day) },
    { mentorshipId: m.id, createdBy: mentor, kind: 'problem', title: 'Solve two CodeLab SQL problems', link: '/app/practice', status: 'done', completedAt: new Date(now - 2 * day) },
  ]);

  await db.insert(mentorshipNotes).values([
    { mentorshipId: m.id, authorId: mentor, visibility: 'shared', body: 'Reading list: HTTP status codes cheat sheet, PostgreSQL tutorial chapters 2 to 4.' },
    { mentorshipId: m.id, authorId: mentor, visibility: 'mentor_private', body: 'Consider introducing system design basics only after the first project ships.' },
  ]);

  await db.insert(mentorFeedback).values({ mentorshipId: m.id, authorId: mentor, kind: 'progress_review', body: 'Great start. The data model is clean and well normalized. Next, focus on consistent error responses.', createdAt: new Date(now - 6 * day) });

  const key = `mentorship:${m.id}`;
  await db.insert(messages).values([
    { threadKey: key, senderId: learner, body: 'Thanks for the session! I pushed the first draft of the schema.', readBy: [learner, mentor], createdAt: new Date(now - 3 * day) },
    { threadKey: key, senderId: mentor, body: 'Looks good. Add a unique index on ISBN and we can review the endpoints next time.', readBy: [mentor], createdAt: new Date(now - 2 * day) },
  ]);

  // Pending request from the Northbridge student.
  await db.insert(mentorships).values({
    mentorId: mentor,
    menteeId: student,
    orgId: ctx.orgs.northbridge,
    status: 'requested',
    requestMessage: 'I am a third-year CS student preparing for placements. Could you help me plan DSA practice and review my resume?',
    goalsSummary: 'Placement-ready by January',
    sharing: { skillDna: true, projects: false, assessments: true, applications: false },
    createdAt: new Date(now - day),
  });
}
