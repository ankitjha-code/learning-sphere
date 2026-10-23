import { eq } from 'drizzle-orm';
import { db } from '../../client';
import { tracks } from '../../schema';
import type { DemoContext } from './context';
import { generateInitialPlan } from '../../../modules/learning/planner';

/** Gives the demo learners a starting plan so their dashboards show real (sample) activity paths. */
export async function seed(ctx: DemoContext) {
  const [python] = await db.select({ slug: tracks.slug }).from(tracks).where(eq(tracks.slug, 'programming-foundations-python'));
  if (!python) return;
  await generateInitialPlan(ctx.users.learner, {
    selfRatedSkills: [
      { slug: 'programming-basics', level: 2 },
      { slug: 'sql-basics', level: 2 },
      { slug: 'communication', level: 3 },
    ],
    trackSlugs: ['programming-foundations-python'],
  });
  await generateInitialPlan(ctx.users.student, {
    selfRatedSkills: [
      { slug: 'python', level: 3 },
      { slug: 'arrays', level: 2 },
    ],
    trackSlugs: ['programming-foundations-python'],
  });
}
