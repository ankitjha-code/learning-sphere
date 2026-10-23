import { and, inArray, isNull } from 'drizzle-orm';
import { db } from '../../client';
import { resources, resourceReviews, bookmarks, resourceRatings, readingHistory, skills } from '../../schema';
import { recomputeRating } from '../../../modules/library/service';
import type { DemoContext } from './context';

/** Sample data for this module (clearly sample: sample orgs and @demo.learnsphere.test accounts). */
export async function seed(ctx: DemoContext) {
  const sk = await db.select({ id: skills.id, slug: skills.slug }).from(skills).where(inArray(skills.slug, ['linked-lists', 'stacks-queues', 'sql-joins', 'http-rest', 'git']));
  const skill = (slug: string) => sk.filter((s) => s.slug === slug).map((s) => s.id);

  // Organization library: only Northbridge members can see these.
  await db.insert(resources).values([
    {
      orgId: ctx.orgs.northbridge,
      authorId: ctx.users.faculty,
      kind: 'cheatsheet',
      title: 'CS201 linked list lab checklist',
      summary: 'What the Northbridge CS201 lab expects before you submit a linked list assignment.',
      body: '# Linked list lab checklist\n\n- Handle the empty list and a single node.\n- Draw pointer changes before coding a reversal.\n- Test insert at head, middle and tail.\n- State the time complexity of each operation in your README.\n',
      sourceName: 'Northbridge Institute of Technology (sample)',
      license: 'Internal course material',
      topics: ['linked-lists', 'labs'],
      roles: ['Software Engineer'],
      difficulty: 'beginner',
      skillIds: skill('linked-lists'),
      status: 'published',
      downloadable: true,
      lastReviewedAt: new Date(),
      isSample: true,
    },
    {
      orgId: ctx.orgs.northbridge,
      authorId: ctx.users.faculty,
      kind: 'article',
      title: 'Stacks and queues: CS201 week 4 notes',
      summary: 'Lecture notes covering LIFO and FIFO structures, with the examples used in class.',
      body: '# Week 4: stacks and queues\n\nA **stack** adds and removes at the same end (last in, first out). A **queue** adds at the back and removes at the front (first in, first out).\n\nIn class we used a stack to check balanced brackets and a queue to simulate a printer.\n',
      sourceName: 'Northbridge Institute of Technology (sample)',
      topics: ['stacks', 'queues'],
      difficulty: 'beginner',
      skillIds: skill('stacks-queues'),
      status: 'published',
      lastReviewedAt: new Date(),
      isSample: true,
    },
    {
      orgId: ctx.orgs.northbridge,
      authorId: ctx.users.faculty,
      kind: 'exercise',
      title: 'CS201 hash map practice set (draft)',
      summary: 'Draft practice set, not yet visible to students.',
      body: '# Hash maps practice\n\n1. Count word frequencies in a paragraph.\n2. Find the first repeated character.\n',
      sourceName: 'Northbridge Institute of Technology (sample)',
      difficulty: 'intermediate',
      status: 'draft',
      isSample: true,
    },
  ]);

  // A community submission waiting for platform admin review.
  const [submission] = await db
    .insert(resources)
    .values({
      orgId: null,
      authorId: ctx.users.creator,
      kind: 'article',
      title: 'Reading HTTP status codes like a backend developer',
      summary: 'A short guide to choosing status codes for common API situations.',
      body: '# Choosing status codes\n\n- **201 Created** when a POST makes a new resource; include its location.\n- **400** for malformed input, **422** when input is well formed but fails validation rules.\n- **404** when the caller may not know the resource exists.\n- **409** for conflicts such as duplicate usernames.\n',
      sourceName: 'LearnSphere Nexus community (sample)',
      license: 'CC BY 4.0',
      topics: ['http', 'api'],
      roles: ['Backend Developer'],
      difficulty: 'beginner',
      skillIds: skill('http-rest'),
      status: 'in_review',
      isSample: true,
    })
    .returning({ id: resources.id });
  await db.insert(resourceReviews).values({ resourceId: submission.id, reviewerId: ctx.users.creator, decision: 'submitted', note: 'First submission, happy to adjust wording.', version: '1' });

  // The independent learner's bookmarks, ratings and reading history in the public library.
  const curated = await db
    .select({ id: resources.id, title: resources.title, kind: resources.kind })
    .from(resources)
    .where(and(isNull(resources.orgId), isNull(resources.authorId)))
    .limit(12);
  if (!curated.length) return;
  const pick = curated.slice(0, 5);
  await db
    .insert(bookmarks)
    .values(pick.slice(0, 4).map((r, i) => ({ userId: ctx.users.learner, targetType: 'resource', targetId: r.id, label: r.title, collection: i < 3 ? 'Backend path' : null })))
    .onConflictDoNothing();
  await db
    .insert(readingHistory)
    .values(pick.map((r, i) => ({ userId: ctx.users.learner, resourceId: r.id, completed: i < 2, lastOpenedAt: new Date(Date.now() - i * 86400_000) })))
    .onConflictDoNothing();
  const raters = [ctx.users.learner, ctx.users.student, ...ctx.users.students.slice(0, 3)];
  for (const [i, r] of pick.slice(0, 3).entries()) {
    await db
      .insert(resourceRatings)
      .values(raters.map((userId, j) => ({ userId, resourceId: r.id, rating: Math.max(3, 5 - ((i + j) % 3)) })))
      .onConflictDoNothing();
    await recomputeRating(r.id);
  }
}
