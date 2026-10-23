import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../client';
import { organizations, incidents, backgroundJobs, reports, threads, posts, resources, systemSettings } from '../../schema';
import { FEATURE_FLAGS, FEATURE_KEYS } from '../../../modules/admin/settings';
import { DEMO_FAILING_JOB } from '../../../modules/admin/jobs';
import type { DemoContext } from './context';

/** Sample data for this module (clearly sample: sample orgs and @demo.learnsphere.test accounts). */
export async function seed(ctx: DemoContext) {
  const now = Date.now();
  const H = 3600_000;

  // Feature flags at their defaults, so Platform settings shows a saved state.
  await db
    .insert(systemSettings)
    .values({ key: 'features', value: Object.fromEntries(FEATURE_KEYS.map((k) => [k, FEATURE_FLAGS[k].default])), updatedBy: ctx.users.admin })
    .onConflictDoNothing();

  // Plans (demonstration mode): colleges on Campus, Helix on Company, the rest stay Free.
  await db.update(organizations).set({ planId: 'campus' }).where(eq(organizations.id, ctx.orgs.northbridge));
  await db.update(organizations).set({ planId: 'company' }).where(eq(organizations.id, ctx.orgs.helix));

  // Incidents: one resolved with a full timeline, one open low-severity.
  await db.insert(incidents).values([
    {
      title: 'Email notifications delayed',
      severity: 'medium',
      status: 'resolved',
      summary: 'Sample incident. The email provider rate-limited sends for about 40 minutes; in-app notifications were unaffected.',
      createdBy: ctx.users.admin,
      createdAt: new Date(now - 6 * 24 * H),
      resolvedAt: new Date(now - 6 * 24 * H + 2 * H),
      timeline: [
        { at: new Date(now - 6 * 24 * H).toISOString(), note: 'Email deliveries started failing with a rate-limit error.', by: 'Priya Admin' },
        { at: new Date(now - 6 * 24 * H + 30 * 60_000).toISOString(), note: 'Queue retries with backoff are working; no messages lost.', by: 'Priya Admin' },
        { at: new Date(now - 6 * 24 * H + 2 * H).toISOString(), note: 'Provider limit reset. Backlog delivered. Resolved.', by: 'Priya Admin' },
      ],
    },
    {
      title: 'Job feed sync delayed',
      severity: 'low',
      status: 'open',
      summary: 'Sample incident. One public job feed is responding slowly, so new remote listings may appear a few hours late.',
      createdBy: ctx.users.admin,
      createdAt: new Date(now - 3 * H),
      timeline: [{ at: new Date(now - 3 * H).toISOString(), note: 'Feed sync jobs are taking longer than usual. Watching.', by: 'Priya Admin' }],
    },
  ]);

  // One failed background job so Admin, Background jobs shows the recovery path.
  await db
    .insert(backgroundJobs)
    .values({
      type: DEMO_FAILING_JOB,
      payload: { label: 'Demonstration job (safe to retry)' },
      status: 'failed',
      attempts: 3,
      maxAttempts: 3,
      runAt: new Date(now - 2 * H),
      lastError: 'Demonstration failure: the upstream service timed out after 30 s (simulated). Retrying is safe; the demonstration handler succeeds on retry.',
      idempotencyKey: 'demo.failing_example:seed',
      createdBy: ctx.users.admin,
      createdAt: new Date(now - 2 * H - 10 * 60_000),
      updatedAt: new Date(now - 2 * H),
    })
    .onConflictDoNothing();

  // Two open reports: on community content when it exists, otherwise on library resources.
  const [thread] = await db.select({ id: threads.id }).from(threads).where(ne(threads.authorId, ctx.users.student)).limit(1);
  const [post] = await db.select({ id: posts.id }).from(posts).where(ne(posts.authorId, ctx.users.learner)).limit(1);
  const targets: { targetType: string; targetId: string }[] = [];
  if (thread) targets.push({ targetType: 'thread', targetId: thread.id });
  if (post) targets.push({ targetType: 'post', targetId: post.id });
  if (targets.length < 2) {
    const rs = await db.select({ id: resources.id }).from(resources).where(and(eq(resources.status, 'published'))).limit(2 - targets.length);
    for (const r of rs) targets.push({ targetType: 'resource', targetId: r.id });
  }
  const samples = [
    { reporterId: ctx.users.student, reason: 'spam', details: 'Sample report: looks like promotional content unrelated to the topic.' },
    { reporterId: ctx.users.learner, reason: 'incorrect', details: 'Sample report: part of this explanation seems out of date.' },
  ];
  for (const [i, t] of targets.slice(0, 2).entries()) {
    await db.insert(reports).values({ ...t, ...samples[i], createdAt: new Date(now - (i + 1) * 5 * H) });
  }
}
