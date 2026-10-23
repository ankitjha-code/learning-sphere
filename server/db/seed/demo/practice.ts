import { and, inArray } from 'drizzle-orm';
import { db } from '../../client';
import { codeRuns, questions } from '../../schema';
import type { DemoContext } from './context';
import { ALL_PROBLEMS } from '../content/problems';
import { executeAndRecord } from '../../../modules/practice/service';

/**
 * CodeLab sample activity for the demo student and learner. Every run here is real:
 * the library's reference solutions (and one deliberately wrong attempt) are executed
 * through the same sandboxes learners use, so the stored results and any evidence come
 * from actual execution. Skipped if the accounts already have CodeLab runs.
 */
export async function seed(ctx: DemoContext) {
  const slugs = ['sum-two-numbers', 'even-or-odd', 'sql-sales-salary-filter', 'sql-top-four-salaries'];
  const rows = await db.select().from(questions).where(inArray(questions.slug, slugs));
  const bySlug = new Map(rows.map((r) => [r.slug!, r]));
  const lib = new Map(ALL_PROBLEMS.map((p) => [p.slug, p]));
  const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 86400_000 - h * 3600_000);

  type Step = { user: string; slug: string; language: string; code: string | undefined; kind: 'run' | 'submit'; at: Date };
  const js = (slug: string) => lib.get(slug)?.solutions?.javascript;
  const sqlSolution = (slug: string) => lib.get(slug)?.solutionSql;
  const steps: Step[] = [
    // Student: two solved coding problems (one after a wrong attempt) and one SQL problem.
    { user: ctx.users.student, slug: 'sum-two-numbers', language: 'javascript', code: js('sum-two-numbers'), kind: 'run', at: daysAgo(9, 3) },
    { user: ctx.users.student, slug: 'sum-two-numbers', language: 'javascript', code: js('sum-two-numbers'), kind: 'submit', at: daysAgo(9, 2) },
    {
      user: ctx.users.student,
      slug: 'even-or-odd',
      language: 'javascript',
      // Wrong on negative odd numbers (-3 % 2 is -1 in JavaScript): a real, common mistake.
      code: "const n = Number(require('fs').readFileSync(0, 'utf8').trim());\nconsole.log(n % 2 === 1 ? 'odd' : 'even');\n",
      kind: 'submit',
      at: daysAgo(6, 5),
    },
    { user: ctx.users.student, slug: 'even-or-odd', language: 'javascript', code: js('even-or-odd'), kind: 'submit', at: daysAgo(6, 4) },
    { user: ctx.users.student, slug: 'sql-sales-salary-filter', language: 'sql', code: sqlSolution('sql-sales-salary-filter'), kind: 'submit', at: daysAgo(3, 1) },
    // Learner: one solved problem and one SQL attempt that breaks the salary tie the wrong way.
    { user: ctx.users.learner, slug: 'sum-two-numbers', language: 'javascript', code: js('sum-two-numbers'), kind: 'submit', at: daysAgo(4, 2) },
    { user: ctx.users.learner, slug: 'sql-top-four-salaries', language: 'sql', code: 'SELECT name, salary\nFROM employees\nORDER BY salary DESC, name DESC\nLIMIT 4;\n', kind: 'submit', at: daysAgo(2, 6) },
  ];

  const existing = await db
    .select({ id: codeRuns.id })
    .from(codeRuns)
    .where(and(inArray(codeRuns.userId, [ctx.users.student, ctx.users.learner]), inArray(codeRuns.kind, ['run', 'submit'])))
    .limit(1);
  if (existing.length) return;

  for (const s of steps) {
    const q = bySlug.get(s.slug);
    if (!q || !s.code) continue;
    try {
      await executeAndRecord({ userId: s.user, question: q, language: s.language, code: s.code, kind: s.kind, at: s.at });
    } catch (e) {
      console.warn(`[seed] CodeLab demo run for ${s.slug} failed: ${(e as Error).message}`);
    }
  }
}
