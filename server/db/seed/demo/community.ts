import { eq } from 'drizzle-orm';
import { db } from '../../client';
import { communitySpaces, spaceMembers, threads, posts, votes, studyGroups, activityEvents, threadSignups, threadInvites } from '../../schema';
import type { DemoContext } from './context';

const day = 86400_000;

/** Sample data for this module (clearly sample: sample orgs and @demo.learnsphere.test accounts). */
export async function seed(ctx: DemoContext) {
  const { admin, learner, student, students, mentor, faculty, creator } = ctx.users;
  const [meera, kabir, ananya, dev, sara, arjun] = students;
  const now = Date.now();

  const spaceRows = await db
    .insert(communitySpaces)
    .values([
      { slug: 'python-help', name: 'Python help', description: 'Questions and answers about Python, from syntax to packaging.', kind: 'topic', createdBy: admin },
      { slug: 'dsa-practice', name: 'DSA practice', description: 'Data structures and algorithms: approaches, complexity and practice partners.', kind: 'topic', createdBy: admin },
      { slug: 'career-questions', name: 'Career questions', description: 'Resumes, interviews, offers and career switches. Ask privately when it is sensitive.', kind: 'topic', createdBy: admin },
      { slug: 'project-showcase', name: 'Project showcase', description: 'Share what you built, get feedback, and find teammates.', kind: 'showcase', createdBy: admin },
      { slug: 'events', name: 'Events', description: 'Study sessions, workshops and challenges run by moderators.', kind: 'events', createdBy: admin },
      { slug: 'northbridge-cs', name: 'Northbridge CS lounge', description: 'For Northbridge students and faculty only: course help, placement prep and study groups.', kind: 'topic', orgId: ctx.orgs.northbridge, createdBy: faculty },
    ])
    .returning();
  const space = Object.fromEntries(spaceRows.map((s) => [s.slug, s.id])) as Record<string, string>;

  const members: (typeof spaceMembers.$inferInsert)[] = [
    { spaceId: space['python-help'], userId: creator, role: 'moderator' },
    { spaceId: space['dsa-practice'], userId: creator, role: 'moderator' },
    { spaceId: space['career-questions'], userId: mentor, role: 'moderator' },
    { spaceId: space['project-showcase'], userId: creator, role: 'moderator' },
    { spaceId: space['events'], userId: creator, role: 'moderator' },
    { spaceId: space['northbridge-cs'], userId: faculty, role: 'moderator' },
  ];
  for (const u of [learner, student, meera, kabir, ananya]) members.push({ spaceId: space['python-help'], userId: u }, { spaceId: space['dsa-practice'], userId: u });
  for (const u of [student, meera, kabir, ananya, dev, sara, arjun]) members.push({ spaceId: space['northbridge-cs'], userId: u });
  members.push({ spaceId: space['career-questions'], userId: learner }, { spaceId: space['project-showcase'], userId: learner }, { spaceId: space['events'], userId: student });
  await db.insert(spaceMembers).values(members).onConflictDoNothing();

  async function thread(v: typeof threads.$inferInsert, replies: { authorId: string; body: string; ago: number; votesFrom?: string[] }[] = [], threadVotes: string[] = []) {
    const [t] = await db.insert(threads).values({ ...v, replyCount: replies.length }).returning();
    const created: (typeof posts.$inferSelect)[] = [];
    for (const r of replies) {
      const [p] = await db.insert(posts).values({ threadId: t.id, authorId: r.authorId, body: r.body, score: r.votesFrom?.length ?? 0, createdAt: new Date(now - r.ago) }).returning();
      if (r.votesFrom?.length) await db.insert(votes).values(r.votesFrom.map((u) => ({ userId: u, targetType: 'post', targetId: p.id, value: 1 })));
      created.push(p);
    }
    if (threadVotes.length) await db.insert(votes).values(threadVotes.map((u) => ({ userId: u, targetType: 'thread', targetId: t.id, value: 1 })));
    return { t, posts: created };
  }

  // Question with an accepted answer.
  const q1 = await thread(
    {
      spaceId: space['python-help'],
      authorId: learner,
      kind: 'question',
      title: 'Why does my default list argument keep growing between calls?',
      body: 'I wrote `def add(item, items=[]): items.append(item); return items` and each call returns the previous items too. Why does this happen and what is the usual fix?',
      tags: ['python', 'functions'],
      score: 3,
      createdAt: new Date(now - 4 * day),
      lastActivityAt: new Date(now - 3 * day),
    },
    [
      { authorId: meera, body: 'Default values are evaluated once, when the function is defined, so every call shares the same list. Use `items=None` and create a new list inside: `if items is None: items = []`.', ago: 3.5 * day, votesFrom: [learner, kabir, student] },
      { authorId: kabir, body: 'Same thing happens with dicts and sets. Linters like ruff flag this as B006.', ago: 3 * day, votesFrom: [learner] },
    ],
    [meera, kabir, student],
  );
  await db.update(threads).set({ acceptedPostId: q1.posts[0].id, status: 'answered' }).where(eq(threads.id, q1.t.id));
  await db
    .insert(activityEvents)
    .values({ userId: meera, kind: 'community.answer_accepted', label: `Answer accepted: ${q1.t.title.slice(0, 80)}`, xp: 10, link: `/app/community/t/${q1.t.id}`, dedupeKey: `answer-accepted:${q1.posts[0].id}`, createdAt: new Date(now - 3 * day) })
    .onConflictDoNothing();

  await thread(
    {
      spaceId: space['dsa-practice'],
      authorId: student,
      kind: 'question',
      title: 'Two pointers vs hash map for pair sum: when to pick which?',
      body: 'For "find a pair that sums to K", I can sort and use two pointers, or use a hash set in one pass. How do you decide in an interview?',
      tags: ['arrays', 'interview'],
      score: 2,
      createdAt: new Date(now - 2 * day),
      lastActivityAt: new Date(now - day),
    },
    [{ authorId: ananya, body: 'Hash set is O(n) time and O(n) space. Sorting plus two pointers is O(n log n) time but O(1) extra space, and it works nicely if the input is already sorted. Mention both trade-offs.', ago: day, votesFrom: [student] }],
    [ananya, dev],
  );

  await thread({
    spaceId: space['dsa-practice'],
    authorId: dev,
    kind: 'discussion',
    title: 'Weekly practice partners for graph problems?',
    body: 'Looking for two or three people to solve one graph problem every evening this month and compare approaches.',
    tags: ['graphs', 'study-partners'],
    createdAt: new Date(now - day),
  });

  // Private career question (visible to the author, the space moderator and the invited mentor only).
  const priv = await thread(
    {
      spaceId: space['career-questions'],
      authorId: learner,
      kind: 'question',
      title: 'How do I explain a career switch gap in interviews?',
      body: 'I left my previous job six months ago to study full time. How should I talk about that gap without sounding defensive?',
      tags: ['career-switch', 'interviews'],
      isPrivate: true,
      createdAt: new Date(now - 2 * day),
    },
    [{ authorId: mentor, body: 'Frame it as a deliberate investment: what you studied, what you built, and how it maps to the role. Keep it to two or three sentences, then move to a project.', ago: day }],
  );
  await db.insert(threadInvites).values({ threadId: priv.t.id, userId: mentor, invitedBy: learner });

  await thread(
    {
      spaceId: space['career-questions'],
      authorId: sara,
      kind: 'discussion',
      title: 'What helped you most in your first technical interview?',
      body: 'Share one thing that made a difference in your first technical interview. Mine was saying my thought process out loud.',
      tags: ['interviews'],
      createdAt: new Date(now - 5 * day),
    },
    [{ authorId: mentor, body: 'Asking clarifying questions before coding. Interviewers want to see how you reduce ambiguity.', ago: 4 * day, votesFrom: [sara, learner] }],
  );

  // Team formation with signups.
  const team = await thread({
    spaceId: space['project-showcase'],
    authorId: kabir,
    kind: 'team_formation',
    title: 'Looking for a frontend teammate for a study planner app',
    body: 'I am building the API (FastAPI + PostgreSQL). Looking for someone who wants to build the React frontend over four weeks.',
    tags: ['react', 'team'],
    createdAt: new Date(now - 3 * day),
  });
  await db.insert(threadSignups).values([{ threadId: team.t.id, userId: ananya, note: 'I have built two React projects and would love to join.' }]);

  // Moderated event.
  const ev = await thread({
    spaceId: space['events'],
    authorId: creator,
    kind: 'event',
    title: 'Live session: reading SQL query plans',
    body: 'A 45-minute walkthrough of EXPLAIN output in PostgreSQL, followed by Q&A. Link will be posted here 10 minutes before the start.',
    tags: ['sql', 'workshop'],
    eventAt: new Date(now + 6 * day),
    createdAt: new Date(now - day),
  });
  await db.insert(threadSignups).values([{ threadId: ev.t.id, userId: student }, { threadId: ev.t.id, userId: learner }]);

  // Org-only space thread.
  await thread(
    {
      spaceId: space['northbridge-cs'],
      authorId: meera,
      kind: 'question',
      title: 'Is the DS assignment 3 deadline extended for the lab outage?',
      body: 'The lab machines were down on Monday. Does the assignment 3 deadline move, or should we submit from home?',
      tags: ['assignments'],
      createdAt: new Date(now - day),
    },
    [{ authorId: faculty, body: 'Yes, the deadline moves by 48 hours. The new date is on the assignment page.', ago: 0.5 * day, votesFrom: [meera, student] }],
  );

  await db.insert(studyGroups).values({
    spaceId: space['dsa-practice'],
    name: 'Evening DSA circle',
    goal: 'Solve one medium problem every weekday evening and review each other’s solutions on Saturday.',
    ownerId: student,
    memberIds: [student, meera, dev],
    maxMembers: 6,
    sharedNotes: '## Patterns so far\n- Sliding window: longest substring without repeats\n- Two pointers: container with most water\n\nNext up: binary search on answers.',
    sharedTasks: [
      { id: 'task-1', text: 'Pick this week’s problems', done: true, assigneeId: student },
      { id: 'task-2', text: 'Write a summary of BFS vs DFS', done: false, assigneeId: meera },
      { id: 'task-3', text: 'Share a binary search template', done: false },
    ],
  });
}
