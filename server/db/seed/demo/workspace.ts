import { eq } from 'drizzle-orm';
import { db } from '../../client';
import { notes, tasks, savedLinks, topics, tracks } from '../../schema';
import type { DemoContext } from './context';

const days = (n: number) => new Date(Date.now() + n * 86400_000);

/** Sample data for this module (clearly sample: sample orgs and @demo.learnsphere.test accounts). */
export async function seed(ctx: DemoContext) {
  const [topic] = await db
    .select({ id: topics.id, title: topics.title })
    .from(topics)
    .innerJoin(tracks, eq(tracks.id, topics.trackId))
    .where(eq(tracks.slug, 'programming-foundations-python'))
    .limit(1);

  await db.insert(notes).values([
    {
      userId: ctx.users.learner,
      title: 'Why I am switching to backend',
      body: '## Goal\nBackend developer role by next spring.\n\n## This month\n- Finish Python foundations\n- Build the Todo API project\n- Two mock interviews',
      tags: ['career', 'plan'],
      pinned: true,
    },
    {
      userId: ctx.users.learner,
      title: topic ? `Notes: ${topic.title}` : 'Notes: how programs run',
      body: 'Source code is translated into instructions the machine runs. Python compiles to bytecode first, then the interpreter executes it.',
      tags: ['python', 'revision'],
      ...(topic ? { linkType: 'topic', linkId: topic.id, linkLabel: topic.title } : {}),
    },
    {
      userId: ctx.users.learner,
      title: 'SQL joins in one line each',
      body: '- INNER: only matching rows\n- LEFT: every left row, NULLs when no match\n- Self join: compare rows in the same table',
      tags: ['sql'],
    },
    {
      userId: ctx.users.student,
      title: 'CS201 exam topics',
      body: 'Linked lists, stacks, queues, recursion. Ask about tail recursion in office hours.',
      tags: ['cs201', 'exam'],
      pinned: true,
    },
  ]);

  await db.insert(tasks).values([
    { userId: ctx.users.learner, title: 'Finish the loops topic quiz', dueAt: days(1), priority: 'high' },
    { userId: ctx.users.learner, title: 'Update resume summary', dueAt: days(3), priority: 'normal' },
    { userId: ctx.users.learner, title: 'Watch a talk on REST API design', dueAt: days(6), priority: 'low' },
    { userId: ctx.users.learner, title: 'Set up GitHub profile README', status: 'done', completedAt: days(-2), priority: 'normal' },
    { userId: ctx.users.student, title: 'Start linked list lab', dueAt: days(2), priority: 'high' },
    { userId: ctx.users.student, title: 'Review stack notes', dueAt: days(4), priority: 'normal' },
  ]);

  await db.insert(savedLinks).values([
    { userId: ctx.users.learner, title: 'Python tutorial (official)', url: 'https://docs.python.org/3/tutorial/', note: 'Chapters 3 to 5 for this week' },
    { userId: ctx.users.learner, title: 'HTTP overview on MDN', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview' },
    { userId: ctx.users.student, title: 'VisuAlgo', url: 'https://visualgo.net/en', note: 'Animations for linked lists' },
  ]);
}
