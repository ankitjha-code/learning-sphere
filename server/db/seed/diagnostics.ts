import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../client';
import { assessments, assessmentItems, questions } from '../schema';
import type { ExtSettings } from '../../modules/assessments/schemas';

/**
 * Public diagnostics and practice quizzes built from the built-in library
 * (topic quiz questions `quiz:<track>:<topic>:<key>` and CodeLab problems).
 * Idempotent: upserted by `settings.seedKey`; items are only rewritten when the
 * question set, versions or points change.
 */

/** Owner id for platform reference content (not a real user). */
export const LIBRARY_OWNER_ID = '00000000-0000-0000-0000-000000000000';

type Spec = {
  key: string;
  title: string;
  description: string;
  mode: 'diagnostic' | 'practice';
  timeLimitMinutes: number | null;
  items: { slug: string; points?: number }[];
};

const q = (track: string, topic: string, key = 'q1') => ({ slug: `quiz:${track}:${topic}:${key}` });

const PY = 'programming-foundations-python';
const DSA = 'dsa-essentials';
const SQLT = 'sql-database-design';

export const DIAGNOSTICS: Spec[] = [
  {
    key: 'diagnostic:python-foundations',
    title: 'Python foundations diagnostic',
    description:
      'Twelve questions across the Python foundations path: how programs run, types, conditions, loops, functions, collections, strings, errors and files, plus one short coding task. Your results feed Skill DNA so your roadmap can skip what you already know.',
    mode: 'diagnostic',
    timeLimitMinutes: 30,
    items: [
      q(PY, 'how-programs-run'),
      q(PY, 'variables-and-types'),
      q(PY, 'variables-and-types', 'q2'),
      q(PY, 'conditionals-and-boolean-logic'),
      q(PY, 'loops'),
      q(PY, 'loops', 'q2'),
      q(PY, 'functions'),
      q(PY, 'lists-tuples-dicts-sets'),
      q(PY, 'strings-and-string-methods'),
      q(PY, 'errors-and-debugging'),
      q(PY, 'files-and-json'),
      { slug: 'fizzbuzz', points: 3 },
    ],
  },
  {
    key: 'diagnostic:dsa-essentials',
    title: 'DSA essentials diagnostic',
    description:
      'Complexity, arrays, strings, hashing, two pointers, recursion, sorting, binary search, stacks, linked lists and trees, plus two classic coding problems. Use it to find which data-structure topics to study first.',
    mode: 'diagnostic',
    timeLimitMinutes: 45,
    items: [
      q(DSA, 'complexity-analysis'),
      q(DSA, 'arrays-prefix-sums'),
      q(DSA, 'strings'),
      q(DSA, 'hash-maps-sets'),
      q(DSA, 'two-pointers-sliding-window'),
      q(DSA, 'recursion'),
      q(DSA, 'sorting'),
      q(DSA, 'binary-search'),
      q(DSA, 'stacks-queues'),
      q(DSA, 'linked-lists'),
      { slug: 'two-sum', points: 3 },
      { slug: 'valid-parentheses', points: 3 },
    ],
  },
  {
    key: 'diagnostic:sql',
    title: 'SQL diagnostic',
    description:
      'Selecting, filtering, aggregation, joins, subqueries, window functions, keys, normalization, indexes and transactions, plus two queries you write and run. Finds the SQL topics worth your time.',
    mode: 'diagnostic',
    timeLimitMinutes: 40,
    items: [
      q(SQLT, 'relational-model-and-select'),
      q(SQLT, 'filtering-sorting-null'),
      q(SQLT, 'aggregation-group-by-having'),
      q(SQLT, 'sql-joins'),
      q(SQLT, 'subqueries-and-ctes'),
      q(SQLT, 'window-functions'),
      q(SQLT, 'entities-keys-relationships'),
      q(SQLT, 'normalization'),
      q(SQLT, 'indexes-and-explain'),
      q(SQLT, 'transactions-and-isolation'),
      { slug: 'sql-department-headcount', points: 3 },
      { slug: 'sql-orders-with-customer-names', points: 3 },
    ],
  },
  {
    key: 'practice:mixed',
    title: 'Mixed practice quiz',
    description: 'Ten quick questions mixing Python, data structures and SQL. Retake it as often as you like; answers and explanations are shown after each attempt.',
    mode: 'practice',
    timeLimitMinutes: null,
    items: [
      q(PY, 'how-programs-run', 'q2'),
      q(PY, 'conditionals-and-boolean-logic', 'q2'),
      q(PY, 'functions', 'q2'),
      q(PY, 'lists-tuples-dicts-sets', 'q2'),
      q(DSA, 'complexity-analysis', 'q2'),
      q(DSA, 'hash-maps-sets', 'q2'),
      q(DSA, 'binary-search', 'q2'),
      q(SQLT, 'sql-joins', 'q2'),
      q(SQLT, 'aggregation-group-by-having', 'q2'),
      q(SQLT, 'filtering-sorting-null', 'q2'),
    ],
  },
];

export async function seedDiagnostics() {
  const allSlugs = DIAGNOSTICS.flatMap((d) => d.items.map((i) => i.slug));
  const qs = await db
    .select({ id: questions.id, slug: questions.slug, version: questions.version, skillIds: questions.skillIds, status: questions.status })
    .from(questions)
    .where(and(inArray(questions.slug, allSlugs), isNull(questions.orgId)));
  const bySlug = new Map(qs.filter((x) => x.status === 'active').map((x) => [x.slug!, x]));
  let created = 0;
  for (const d of DIAGNOSTICS) {
    const items = d.items.flatMap((i) => {
      const row = bySlug.get(i.slug);
      return row ? [{ questionId: row.id, questionVersion: row.version, points: i.points ?? 1, skillIds: row.skillIds }] : [];
    });
    if (items.length < 5) continue; // library content missing; do not publish a hollow diagnostic
    const settings: ExtSettings = {
      seedKey: d.key,
      timeLimitMinutes: d.timeLimitMinutes,
      maxAttempts: null,
      availableFrom: null,
      availableUntil: null,
      shuffleQuestions: false,
      shuffleOptions: d.mode === 'practice',
      blueprint: [],
      resultRelease: 'immediate',
      showAnswersAfterRelease: true,
      passingScore: null,
      allowRegradeRequests: false,
    };
    const skillIds = [...new Set(items.flatMap((i) => i.skillIds))];
    const values = { title: d.title, description: d.description, mode: d.mode, settings, skillIds, status: 'published' as const, updatedAt: new Date() };
    const [existing] = await db
      .select()
      .from(assessments)
      .where(and(isNull(assessments.orgId), sql`${assessments.settings}->>'seedKey' = ${d.key}`));
    let id: string;
    if (existing) {
      id = existing.id;
      await db.update(assessments).set(values).where(eq(assessments.id, id));
    } else {
      const [row] = await db
        .insert(assessments)
        .values({ ...values, orgId: null, ownerId: LIBRARY_OWNER_ID, publishedAt: new Date() })
        .returning({ id: assessments.id });
      id = row.id;
      created++;
    }
    const current = await db.select().from(assessmentItems).where(eq(assessmentItems.assessmentId, id)).orderBy(asc(assessmentItems.sortOrder));
    const sig = (xs: { questionId: string; questionVersion: number; points: number }[]) => xs.map((x) => `${x.questionId}@${x.questionVersion}:${x.points}`).join('|');
    if (sig(current) !== sig(items)) {
      await db.delete(assessmentItems).where(eq(assessmentItems.assessmentId, id));
      await db.insert(assessmentItems).values(items.map((it, i) => ({ assessmentId: id, questionId: it.questionId, questionVersion: it.questionVersion, points: it.points, sortOrder: i + 1 })));
    }
  }
  return { diagnostics: DIAGNOSTICS.length, created };
}
