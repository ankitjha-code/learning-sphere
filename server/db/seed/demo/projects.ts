import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../client';
import { projectTemplates, projects, projectMembers, projectMilestones, projectTasks, projectReviews, projectSettings, achievements } from '../../schema';
import type { DemoContext } from './context';
import { createProjectFromTemplate } from '../../../modules/projects/service';
import { addEvidence } from '../../../modules/learning/skilldna';
import { recordActivity, XP } from '../../../lib/activity';

const DAY = 86400_000;

async function template(slug: string) {
  const [t] = await db.select().from(projectTemplates).where(eq(projectTemplates.slug, slug));
  return t ?? null;
}

async function alreadyHas(ownerId: string, templateId: string) {
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.ownerId, ownerId), eq(projects.templateId, templateId)));
  return !!p;
}

/**
 * Sample ProjectForge data (demo accounts only):
 * - learner: an in-progress Library REST API (guided) with the first milestone done and work on the board;
 * - student: a completed Habit tracker approved by the mentor (reviewer member), producing verified review evidence.
 */
export async function seed(ctx: DemoContext) {
  const lib = await template('library-rest-api');
  if (lib && !(await alreadyHas(ctx.users.learner, lib.id))) {
    const p = await createProjectFromTemplate(ctx.users.learner, lib, { mode: 'guided' });
    const ms = await db.select().from(projectMilestones).where(eq(projectMilestones.projectId, p.id)).orderBy(asc(projectMilestones.sortOrder));
    const tasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, p.id)).orderBy(asc(projectTasks.sortOrder));
    const first = ms[0];
    await db.update(projectMilestones).set({ status: 'done', completedAt: new Date(Date.now() - 3 * DAY) }).where(eq(projectMilestones.id, first.id));
    for (const t of tasks.filter((t) => t.milestoneId === first.id)) await db.update(projectTasks).set({ status: 'done', assigneeId: ctx.users.learner }).where(eq(projectTasks.id, t.id));
    const second = tasks.filter((t) => t.milestoneId === ms[1]?.id);
    if (second[0]) await db.update(projectTasks).set({ status: 'doing', priority: 'high', assigneeId: ctx.users.learner }).where(eq(projectTasks.id, second[0].id));
    if (second[1]) await db.update(projectTasks).set({ status: 'review', assigneeId: ctx.users.learner }).where(eq(projectTasks.id, second[1].id));
    await db.insert(projectTasks).values({
      projectId: p.id,
      milestoneId: ms[1]?.id ?? null,
      title: 'POST /books accepts negative copy counts',
      description: 'Validation should reject copies < 0 with a 400 and a field error.',
      kind: 'bug',
      priority: 'high',
      status: 'todo',
      createdBy: ctx.users.learner,
      sortOrder: 999,
    });
    const reqs = p.requirements.map((r, i) => (i === 0 ? { ...r, done: true } : r));
    await db
      .update(projects)
      .set({
        status: 'building',
        requirements: reqs,
        repoUrl: 'https://github.com/example/library-api-sample',
        docs: {
          architecture: 'Node.js + Hono HTTP layer, a service layer for loan rules, and Postgres accessed through a query builder. Loans are created inside a transaction that locks the book row.',
          dataModel: '- **books** (id, isbn unique, title, author, copies_total)\n- **members** (id, email unique, name)\n- **loans** (id, book_id, member_id, due_at, returned_at) with an index on (due_at) where returned_at is null',
        },
        updatedAt: new Date(),
      })
      .where(eq(projects.id, p.id));
    await recordActivity(ctx.users.learner, {
      kind: 'project.milestone',
      label: `Completed milestone "${first.title}" in ${p.title}`,
      link: `/app/projects/${p.id}`,
      xp: XP.projectMilestone,
      skillIds: p.skillIds,
      dedupeKey: `project.milestone:${first.id}`,
    });
  }

  const habit = await template('habit-tracker-with-auth');
  if (habit && !(await alreadyHas(ctx.users.student, habit.id))) {
    const p = await createProjectFromTemplate(ctx.users.student, habit, { mode: 'guided' });
    await db.insert(projectMembers).values({ projectId: p.id, userId: ctx.users.mentor, role: 'reviewer' }).onConflictDoNothing();
    const ms = await db.select().from(projectMilestones).where(eq(projectMilestones.projectId, p.id)).orderBy(asc(projectMilestones.sortOrder));
    for (const [i, m] of ms.entries()) await db.update(projectMilestones).set({ status: 'done', completedAt: new Date(Date.now() - (ms.length - i) * 5 * DAY) }).where(eq(projectMilestones.id, m.id));
    await db.update(projectTasks).set({ status: 'done', assigneeId: ctx.users.student }).where(eq(projectTasks.projectId, p.id));
    const approvedAt = new Date(Date.now() - 2 * DAY);
    await db
      .update(projects)
      .set({
        status: 'completed',
        visibility: 'public',
        requirements: p.requirements.map((r) => ({ ...r, done: !r.optional })),
        repoUrl: 'https://github.com/example/habit-tracker-sample',
        demoUrl: 'https://habit-tracker-sample.example.test',
        docs: {
          architecture: 'React single-page app talking to a Node.js REST API. Sessions are stored server-side; passwords hashed with scrypt. Postgres stores users, habits and check-ins.',
          testPlan: '- Unit tests for streak calculation (timezone edge cases)\n- API tests for sign-up, login, logout and ownership checks (another user gets 404)\n- Manual keyboard-only pass for the habit list',
          retrospective: 'What went well: ownership checks were tested early. What I would change: model check-ins per local date from the start; I had to migrate once.',
        },
        completedAt: approvedAt,
        approvedAt,
        approvedBy: ctx.users.mentor,
        updatedAt: approvedAt,
      })
      .where(eq(projects.id, p.id));
    await db.insert(projectSettings).values({ projectId: p.id, showTasksPublic: false }).onConflictDoNothing();
    await db.insert(projectReviews).values([
      {
        projectId: p.id,
        reviewerId: ctx.users.mentor,
        kind: 'code_review',
        body: 'Auth flow is solid. Move the streak calculation out of the route handler and add a test for the day-boundary case.',
        createdAt: new Date(Date.now() - 6 * DAY),
      },
      {
        projectId: p.id,
        reviewerId: ctx.users.mentor,
        kind: 'approval',
        body: 'Walked through the demo and tests together. Every required acceptance criterion is met and Rohan explained the session design clearly.',
        rubricScores: [
          { criterion: 'Requirements met', points: 9, max: 10 },
          { criterion: 'Code quality', points: 8, max: 10 },
          { criterion: 'Testing', points: 8, max: 10 },
        ],
        confirmedSkillIds: p.skillIds,
        createdAt: approvedAt,
      },
    ]);
    const score = 25 / 30;
    for (const skillId of p.skillIds) {
      await addEvidence({ userId: ctx.users.student, skillId, source: 'review', sourceType: 'project', sourceId: p.id, score, verified: true, verifiedBy: ctx.users.mentor, note: `Project "${p.title}" approved by reviewer (sample data)` });
    }
    for (const m of ms)
      await recordActivity(ctx.users.student, { kind: 'project.milestone', label: `Completed milestone "${m.title}" in ${p.title}`, link: `/app/projects/${p.id}`, xp: XP.projectMilestone, dedupeKey: `project.milestone:${m.id}` });
    await recordActivity(ctx.users.student, { kind: 'project.completed', label: `Completed project ${p.title}`, link: `/app/projects/${p.id}`, xp: XP.projectCompleted, skillIds: p.skillIds, dedupeKey: `project.completed:${p.id}` });
    await db
      .insert(achievements)
      .values([
        { userId: ctx.users.student, key: 'project_completed', title: 'First project completed', description: `Completed ${p.title}` },
        { userId: ctx.users.student, key: 'project_verified', title: 'First reviewer-approved project', description: `${p.title} approved by a reviewer` },
      ])
      .onConflictDoNothing();
  }
}
