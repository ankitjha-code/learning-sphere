import { eq, inArray } from 'drizzle-orm';
import { db } from '../../client';
import { users, activityEvents, challenges, challengeParticipants, accountabilityPartners, journalEntries } from '../../schema';
import { startOfWeek } from '../../../lib/streak';
import type { DemoContext } from './context';

const day = 86400_000;

/** Sample data for this module (clearly sample: sample orgs and @demo.learnsphere.test accounts). */
export async function seed(ctx: DemoContext) {
  const { learner, student, students, admin, faculty } = ctx.users;
  const [meera, kabir, ananya, dev] = students;

  // Opt a few sample students into the public leaderboard (the learner stays opted out by default).
  const optIn = [student, meera, kabir, ananya, dev];
  const rows = await db.select({ id: users.id, preferences: users.preferences }).from(users).where(inArray(users.id, optIn));
  for (const r of rows) await db.update(users).set({ preferences: { ...r.preferences, showOnLeaderboard: true } }).where(eq(users.id, r.id));

  // This week's substantive activity for the sample leaderboard (deduplicated by key).
  const weekStart = startOfWeek().getTime();
  const elapsedDays = Math.max(1, Math.min(7, Math.floor((Date.now() - weekStart) / day) + 1));
  const plan: [string, number][] = [
    [meera, 7],
    [student, 5],
    [kabir, 4],
    [ananya, 3],
    [dev, 2],
  ];
  const events: (typeof activityEvents.$inferInsert)[] = [];
  for (const [uid, solved] of plan) {
    for (let i = 0; i < solved; i++) {
      const at = new Date(Math.min(Date.now() - 60_000, weekStart + ((i % elapsedDays) * day) + 10 * 3600_000));
      events.push({ userId: uid, kind: 'problem.solved', label: `Solved sample problem ${i + 1}`, xp: 25, minutes: 20, link: '/app/practice', dedupeKey: `demo-motivation:${uid}:problem:${i}`, createdAt: at });
    }
  }
  // A few days of history for the learner so the streak calendar is not empty.
  for (let i = 1; i <= 9; i++) {
    if (i === 4) continue; // a missed day, shown neutrally
    events.push({ userId: learner, kind: 'study.time', label: 'Study session', xp: 0, minutes: 30 + (i % 3) * 10, dedupeKey: `demo-motivation:learner:study:${i}`, createdAt: new Date(Date.now() - i * day) });
  }
  await db.insert(activityEvents).values(events).onConflictDoNothing();

  // Current platform challenge.
  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const monthName = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(now);
  const [sprint] = await db
    .insert(challenges)
    .values({
      title: `${monthName} problem-solving sprint`,
      description: 'Solve 20 CodeLab problems this month. Any difficulty counts; only passing submissions are counted, once per problem. Rest days are encouraged.',
      kind: 'season',
      metric: 'problems_solved',
      target: 20,
      startsAt: new Date(Date.UTC(y, mo, 1)),
      endsAt: new Date(Date.UTC(y, mo + 1, 1) - 1000),
      createdBy: admin,
    })
    .returning();
  await db.insert(challengeParticipants).values([student, meera, kabir, ananya].map((userId) => ({ challengeId: sprint.id, userId }))).onConflictDoNothing();

  // Northbridge team challenge.
  const [team] = await db
    .insert(challenges)
    .values({
      orgId: ctx.orgs.northbridge,
      title: 'Northbridge topic relay',
      description: 'Teams of three complete roadmap topics together over two weeks. Team totals only; individual standings show people who opted in.',
      kind: 'team',
      metric: 'topics_completed',
      target: 30,
      startsAt: new Date(Date.now() - 3 * day),
      endsAt: new Date(Date.now() + 11 * day),
      createdBy: faculty,
    })
    .returning();
  await db
    .insert(challengeParticipants)
    .values([
      { challengeId: team.id, userId: student, teamName: 'Byte Club' },
      { challengeId: team.id, userId: meera, teamName: 'Byte Club' },
      { challengeId: team.id, userId: kabir, teamName: 'Stack Sprinters' },
    ])
    .onConflictDoNothing();

  await db.insert(accountabilityPartners).values({ userId: student, partnerId: meera, status: 'active' }).onConflictDoNothing();

  await db.insert(journalEntries).values([
    { userId: learner, kind: 'weekly_review', title: 'Week 3 review', body: 'Finished SQL joins. Struggled with GROUP BY at first, then it clicked after the practice set. Next week: first API endpoints.', mood: 4, createdAt: new Date(Date.now() - 2 * day) },
    { userId: learner, kind: 'reflection', title: null, body: 'Explaining my code out loud to my mentor helped me spot a bug. Do that more often.', mood: 5, createdAt: new Date(Date.now() - 6 * day) },
  ]);
}
