import { and, eq } from 'drizzle-orm';
import { db } from '../../client';
import { portfolios, projects, projectTemplates } from '../../schema';
import type { DemoContext } from './context';
import { ensurePortfolio, snapshotVersion, SECTION_KEYS } from '../../../modules/portfolio/service';

/**
 * Sample portfolios (demo accounts only):
 * - student (Rohan Iyer): public at /p/rohan-iyer, featuring the reviewer-approved habit tracker;
 * - learner: private (default).
 */
export async function seed(ctx: DemoContext) {
  const student = await ensurePortfolio(ctx.users.student);
  const [habit] = await db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(projectTemplates, eq(projectTemplates.id, projects.templateId))
    .where(and(eq(projects.ownerId, ctx.users.student), eq(projectTemplates.slug, 'habit-tracker-with-auth')));
  if (student.visibility !== 'public') {
    const [taken] = await db.select({ userId: portfolios.userId }).from(portfolios).where(eq(portfolios.slug, 'rohan-iyer'));
    await db
      .update(portfolios)
      .set({
        slug: !taken || taken.userId === ctx.users.student ? 'rohan-iyer' : student.slug,
        visibility: 'public',
        headline: 'Computer Science student building full-stack web apps',
        about:
          'Third-year B.Tech student at Northbridge (sample account). I like turning small daily problems into working software, and I write tests before I call something done.',
        sections: SECTION_KEYS.map((key) => ({ key, visible: key !== 'experience' })),
        featuredProjectIds: habit ? [habit.id] : [],
        writing: [{ title: 'What I learned building session auth from scratch (sample)', url: 'https://example.test/rohan/session-auth', summary: 'Notes on cookies, CSRF and why I hash session tokens.' }],
        updatedAt: new Date(),
      })
      .where(eq(portfolios.userId, ctx.users.student));
    await snapshotVersion(ctx.users.student, 'Published as public (sample data)');
  }
  await ensurePortfolio(ctx.users.learner); // stays private
}
