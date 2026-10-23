import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../client';
import { assessments, assessmentItems, attempts, attemptAnswers, questions, skills } from '../../schema';
import type { AnswerKey, QuestionContent } from '../../schema/assessment';
import type { DemoContext } from './context';
import { inviteToAssessment } from '../../../modules/assessments/service';
import { startAttempt, submitAttempt, gradeAttempt } from '../../../modules/assessments/engine';
import type { ExtSettings } from '../../../modules/assessments/schemas';

/** Sample data for this module (clearly sample: sample orgs and @demo.learnsphere.test accounts). */

type DemoQuestion = { type: string; title: string; content: QuestionContent; answerKey: AnswerKey; difficulty: string; topics: string[]; skills: string[]; points: number };

const JS_READ = "const input = require('fs').readFileSync(0, 'utf8');\n";

const HELIX_QUESTIONS: DemoQuestion[] = [
  {
    type: 'single',
    title: 'Status code for a created resource',
    content: {
      prompt: 'A `POST /orders` request creates a new order. Which status code should a REST API return?',
      options: [
        { id: 'a', text: '`200 OK`' },
        { id: 'b', text: '`201 Created`' },
        { id: 'c', text: '`204 No Content`' },
        { id: 'd', text: '`302 Found`' },
      ],
    },
    answerKey: { correct: ['b'], explanation: '`201 Created`, usually with a `Location` header pointing at the new resource.' },
    difficulty: 'easy',
    topics: ['http', 'rest'],
    skills: ['http-rest'],
    points: 2,
  },
  {
    type: 'multi',
    title: 'Idempotent HTTP methods',
    content: {
      prompt: 'Which HTTP methods are idempotent by definition? Select all that apply.',
      options: [
        { id: 'get', text: 'GET' },
        { id: 'post', text: 'POST' },
        { id: 'put', text: 'PUT' },
        { id: 'delete', text: 'DELETE' },
      ],
    },
    answerKey: { correct: ['get', 'put', 'delete'], explanation: 'GET, PUT and DELETE are idempotent. POST is not: repeating it can create duplicates.' },
    difficulty: 'medium',
    topics: ['http', 'rest'],
    skills: ['http-rest'],
    points: 3,
  },
  {
    type: 'true_false',
    title: 'Indexes and writes',
    content: {
      prompt: 'Adding an index to a table always makes INSERT statements faster.',
      options: [
        { id: 'true', text: 'True' },
        { id: 'false', text: 'False' },
      ],
    },
    answerKey: { correct: ['false'], explanation: 'Every index must be updated on write, so indexes speed up reads at some cost to writes.' },
    difficulty: 'easy',
    topics: ['databases', 'indexes'],
    skills: ['indexing'],
    points: 1,
  },
  {
    type: 'fill_blank',
    title: 'Remove duplicate rows',
    content: { prompt: 'Complete the query so each city appears once: `SELECT ____ city FROM customers;`', blanks: 1 },
    answerKey: { accepted: [['DISTINCT']], explanation: '`SELECT DISTINCT city` removes duplicate rows from the result.' },
    difficulty: 'easy',
    topics: ['sql'],
    skills: ['sql-basics'],
    points: 1,
  },
  {
    type: 'coding',
    title: 'Reverse the words',
    content: {
      prompt: 'Read one line of text and print the words in reverse order, separated by single spaces. Words are separated by one or more spaces.\n\n**Example**\n\nInput: `the quick  fox`\n\nOutput: `fox quick the`',
      languages: ['python', 'javascript'],
      starterCode: { python: 'line = input()\n# print the words in reverse order\n', javascript: `${JS_READ}// print the words in reverse order\n` },
      visibleTests: [{ name: 'Example', input: 'the quick  fox\n', expected: 'fox quick the' }],
      timeLimitMs: 2000,
      memoryLimitMb: 256,
    },
    answerKey: {
      hiddenTests: [
        { name: 'Single word', input: 'hello\n', expected: 'hello' },
        { name: 'Leading spaces', input: '   a b c\n', expected: 'c b a' },
        { name: 'Many words', input: 'one two three four five\n', expected: 'five four three two one', weight: 2 },
      ],
      modelAnswer: "print(' '.join(reversed(input().split())))",
      explanation: 'Split on whitespace (which also drops repeated spaces), reverse, and join with single spaces.',
    },
    difficulty: 'easy',
    topics: ['strings'],
    skills: ['programming-basics'],
    points: 10,
  },
  {
    type: 'short_text',
    title: 'Debugging a slow endpoint',
    content: { prompt: 'An API endpoint that used to respond in 80 ms now takes 2 seconds. Describe, in order, how you would find the cause.', wordLimit: 200 },
    answerKey: {
      rubric: [
        { criterion: 'Measures before changing anything (logs, traces, metrics)', points: 2 },
        { criterion: 'Narrows down the slow layer (DB query, external call, CPU)', points: 2 },
        { criterion: 'Mentions checking recent deploys or data growth', points: 1 },
      ],
      modelAnswer: 'Reproduce and measure first: check request traces or timing logs to see which span grew. Compare with recent deploys and data volume. If the database dominates, run EXPLAIN on the slow query and look for missing indexes or N+1 patterns; if an external call dominates, check its latency and timeouts. Fix, then confirm with the same measurement.',
    },
    difficulty: 'medium',
    topics: ['debugging', 'performance'],
    skills: ['debugging'],
    points: 5,
  },
];

async function upsertOrgQuestion(orgId: string, ownerId: string, q: DemoQuestion, skillId: Map<string, string>) {
  const [existing] = await db.select({ id: questions.id, version: questions.version }).from(questions).where(and(eq(questions.orgId, orgId), eq(questions.title, q.title)));
  if (existing) return existing;
  const [row] = await db
    .insert(questions)
    .values({
      orgId,
      ownerId,
      type: q.type,
      title: q.title,
      content: q.content,
      answerKey: q.answerKey,
      difficulty: q.difficulty,
      topics: q.topics,
      skillIds: q.skills.map((s) => skillId.get(s)).filter(Boolean) as string[],
      points: q.points,
      visibility: 'org',
      status: 'active',
    })
    .returning({ id: questions.id, version: questions.version });
  return row;
}

export async function seed(ctx: DemoContext) {
  const skillRows = await db.select({ id: skills.id, slug: skills.slug }).from(skills);
  const skillId = new Map(skillRows.map((s) => [s.slug, s.id]));

  // 1) Helix Labs recruitment screen (org questions: objective + coding + written).
  const title = 'Backend engineer screen (sample)';
  let [screen] = await db.select().from(assessments).where(and(eq(assessments.orgId, ctx.orgs.helix), eq(assessments.title, title)));
  if (!screen) {
    const qs = [];
    for (const q of HELIX_QUESTIONS) qs.push(await upsertOrgQuestion(ctx.orgs.helix, ctx.users.recruiter, q, skillId));
    const settings: ExtSettings = {
      timeLimitMinutes: 60,
      maxAttempts: 1,
      availableFrom: null,
      availableUntil: new Date(Date.now() + 21 * 86400_000).toISOString(),
      shuffleQuestions: false,
      shuffleOptions: true,
      blueprint: [],
      resultRelease: 'manual',
      showAnswersAfterRelease: false,
      passingScore: 60,
      allowRegradeRequests: true,
      proctoringNote: 'Work alone. You may use language documentation but not AI assistants.',
    };
    [screen] = await db
      .insert(assessments)
      .values({
        orgId: ctx.orgs.helix,
        ownerId: ctx.users.recruiter,
        title,
        description: 'A 60-minute screen for the Backend Engineer role: HTTP and SQL fundamentals, one short coding task and one written answer reviewed by the hiring team.',
        mode: 'recruitment',
        settings,
        status: 'published',
        publishedAt: new Date(),
        skillIds: [skillId.get('http-rest'), skillId.get('sql-basics'), skillId.get('programming-basics')].filter(Boolean) as string[],
      })
      .returning();
    await db.insert(assessmentItems).values(qs.map((q, i) => ({ assessmentId: screen.id, questionId: q.id, questionVersion: q.version, points: HELIX_QUESTIONS[i].points, sortOrder: i + 1, section: i < 4 ? 'Fundamentals' : i === 4 ? 'Coding' : 'Written' })));
    await inviteToAssessment({ assessmentId: screen.id, userIds: [ctx.users.learner], invitedBy: ctx.users.recruiter, accommodations: {} });
  }

  // 2) A diagnostic the Northbridge student took, graded by the real pipeline.
  const [diag] = await db
    .select()
    .from(assessments)
    .where(and(isNull(assessments.orgId), sql`${assessments.settings}->>'seedKey' = 'diagnostic:python-foundations'`));
  if (!diag) return;
  const [already] = await db.select({ id: attempts.id }).from(attempts).where(and(eq(attempts.assessmentId, diag.id), eq(attempts.userId, ctx.users.student)));
  if (already) return;
  const { attempt } = await startAttempt(ctx.users.student, diag, null);
  const qRows = await db.select().from(questions);
  let i = 0;
  for (const item of attempt.items) {
    const q = qRows.find((x) => x.id === item.questionId);
    if (!q) continue;
    i++;
    // The student knows most of the material; misses two questions and skips the coding task.
    const wrong = i === 4 || i === 9;
    let answer: Record<string, unknown> | null = null;
    if (q.type === 'single' || q.type === 'true_false') {
      const right = q.answerKey.correct?.[0];
      answer = { choice: wrong ? q.content.options?.find((o) => o.id !== right)?.id : right };
    } else if (q.type === 'multi') answer = { choices: wrong ? [] : q.answerKey.correct };
    else if (q.type === 'fill_blank') answer = { blanks: wrong ? ['?'] : q.answerKey.accepted?.map((a) => a[0]) };
    else if (q.type === 'matching') answer = { matches: wrong ? {} : q.answerKey.matches };
    if (!answer) continue;
    await db
      .insert(attemptAnswers)
      .values({ attemptId: attempt.id, questionId: q.id, answer, savedAt: new Date(), maxPoints: item.points })
      .onConflictDoNothing();
  }
  await submitAttempt(attempt, { submitKey: 'demo-seed' });
  await gradeAttempt(attempt.id);
}
