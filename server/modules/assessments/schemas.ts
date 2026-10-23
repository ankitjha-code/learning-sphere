import { z } from 'zod';
import type { AnswerKey, AssessmentSettings, QuestionContent } from '../../db/schema/assessment';
import { badRequest } from '../../lib/errors';

/** Every question type the engine understands. */
export const QUESTION_TYPES = ['single', 'multi', 'true_false', 'matching', 'fill_blank', 'short_text', 'long_text', 'coding', 'sql', 'file', 'oral'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const ASSESSMENT_MODES = ['practice', 'diagnostic', 'classroom', 'recruitment', 'placement'] as const;
export type AssessmentMode = (typeof ASSESSMENT_MODES)[number];

export const CODE_LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'go', 'rust'] as const;

const text = (max: number) => z.string().trim().min(1, 'Required.').max(max);
const optionId = z.string().trim().min(1).max(40);
const option = z.object({ id: optionId, text: text(2000) });
const test = z.object({ name: text(120), input: z.string().max(20000), expected: z.string().max(20000) });
const hiddenTest = test.extend({ weight: z.number().positive().max(100).optional() });
const rubricRow = z.object({ criterion: text(300), points: z.number().min(0).max(1000), guidance: z.string().max(2000).optional() });

const baseContent = z.object({
  prompt: text(20000),
  hints: z.array(z.string().max(2000)).max(5).optional(),
});
const baseKey = z.object({
  explanation: z.string().max(10000).optional(),
  modelAnswer: z.string().max(20000).optional(),
  rubric: z.array(rubricRow).max(20).optional(),
});

const choiceContent = baseContent.extend({ options: z.array(option).min(2, 'Add at least two options.').max(12) });
const choiceKey = baseKey.extend({ correct: z.array(optionId).min(1, 'Mark the correct option.') });

/** Per-type schemas for `content` and `answerKey`. */
const TYPE_SCHEMAS: Record<QuestionType, { content: z.ZodType; key: z.ZodType }> = {
  single: { content: choiceContent, key: choiceKey },
  true_false: { content: choiceContent, key: choiceKey },
  multi: { content: choiceContent, key: choiceKey },
  matching: {
    content: baseContent.extend({
      pairs: z.object({ left: z.array(option).min(2, 'Add at least two items.').max(12), right: z.array(option).min(2, 'Add at least two matches.').max(12) }),
    }),
    key: baseKey.extend({ matches: z.record(optionId, optionId) }),
  },
  fill_blank: {
    content: baseContent.extend({ blanks: z.number().int().min(1).max(10) }),
    key: baseKey.extend({ accepted: z.array(z.array(z.string().trim().min(1).max(300)).min(1, 'Add an accepted answer.')).min(1).max(10), caseSensitive: z.boolean().optional() }),
  },
  short_text: { content: baseContent.extend({ wordLimit: z.number().int().min(1).max(5000).optional() }), key: baseKey },
  long_text: { content: baseContent.extend({ wordLimit: z.number().int().min(1).max(20000).optional() }), key: baseKey },
  coding: {
    content: baseContent.extend({
      languages: z.array(z.enum(CODE_LANGUAGES)).min(1, 'Choose at least one language.'),
      starterCode: z.record(z.string(), z.string().max(20000)).optional(),
      visibleTests: z.array(test).max(20).default([]),
      constraints: z.string().max(4000).optional(),
      timeLimitMs: z.number().int().min(100).max(20000).optional(),
      memoryLimitMb: z.number().int().min(16).max(1024).optional(),
    }),
    key: baseKey.extend({ hiddenTests: z.array(hiddenTest).max(50).default([]) }),
  },
  sql: {
    content: baseContent.extend({ schemaSql: text(20000), orderMatters: z.boolean().optional(), constraints: z.string().max(4000).optional() }),
    key: baseKey.extend({ solutionSql: text(20000), seedSql: z.string().max(50000).optional() }),
  },
  file: { content: baseContent.extend({ acceptedFileTypes: z.array(z.string().max(40)).max(20).optional() }), key: baseKey },
  oral: { content: baseContent, key: baseKey },
};

function fieldsFrom(prefix: string, err: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const i of err.issues) {
    const k = [prefix, ...i.path].join('.');
    if (!fields[k]) fields[k] = i.message;
  }
  return fields;
}

/**
 * Validates `content` and `answerKey` for a question type and the cross-field
 * rules (correct options exist, every left item has a match, etc). Throws a 400
 * with field errors the editor can show inline.
 */
export function validateQuestion(type: QuestionType, content: unknown, answerKey: unknown): { content: QuestionContent; answerKey: AnswerKey } {
  const s = TYPE_SCHEMAS[type];
  const c = s.content.safeParse(content ?? {});
  const k = s.key.safeParse(answerKey ?? {});
  const fields: Record<string, string> = {};
  if (!c.success) Object.assign(fields, fieldsFrom('content', c.error));
  if (!k.success) Object.assign(fields, fieldsFrom('answerKey', k.error));
  if (c.success && k.success) {
    const cc = c.data as QuestionContent;
    const kk = k.data as AnswerKey;
    const optIds = new Set((cc.options ?? []).map((o) => o.id));
    if (cc.options && optIds.size !== cc.options.length) fields['content.options'] = 'Option ids must be unique.';
    if (type === 'single' || type === 'true_false') {
      if (kk.correct!.length !== 1) fields['answerKey.correct'] = 'Choose exactly one correct option.';
    }
    if (type === 'true_false' && cc.options!.length !== 2) fields['content.options'] = 'True/false questions have exactly two options.';
    if (kk.correct && cc.options && kk.correct.some((id) => !optIds.has(id))) fields['answerKey.correct'] = 'A correct option does not exist.';
    if (type === 'matching') {
      const left = new Set(cc.pairs!.left.map((l) => l.id));
      const right = new Set(cc.pairs!.right.map((r) => r.id));
      const m = kk.matches ?? {};
      if ([...left].some((l) => !m[l])) fields['answerKey.matches'] = 'Give every item a correct match.';
      else if (Object.entries(m).some(([l, r]) => !left.has(l) || !right.has(r))) fields['answerKey.matches'] = 'A match refers to an item that does not exist.';
    }
    if (type === 'fill_blank' && kk.accepted!.length !== cc.blanks) fields['answerKey.accepted'] = `Add accepted answers for each of the ${cc.blanks} blanks.`;
    if (Object.keys(fields).length === 0) return { content: cc, answerKey: kk };
  }
  throw badRequest('Please check the highlighted fields.', { fields });
}

/** Problems a question has that block publishing an assessment that uses it. */
export function questionPublishProblems(q: { type: string; title: string; content: QuestionContent; answerKey: AnswerKey; status: string }): string[] {
  const out: string[] = [];
  if (q.status === 'retired') out.push(`"${q.title}" is retired.`);
  if (q.type === 'coding' && (q.content.visibleTests?.length ?? 0) + (q.answerKey.hiddenTests?.length ?? 0) === 0) out.push(`Coding question "${q.title}" has no tests.`);
  if (q.type === 'sql' && !q.answerKey.solutionSql) out.push(`SQL question "${q.title}" has no reference solution.`);
  if ((q.type === 'single' || q.type === 'multi' || q.type === 'true_false') && !q.answerKey.correct?.length) out.push(`"${q.title}" has no correct option.`);
  return out;
}

export const questionInput = z.object({
  type: z.enum(QUESTION_TYPES),
  title: text(200),
  content: z.record(z.string(), z.unknown()),
  answerKey: z.record(z.string(), z.unknown()).default({}),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  topics: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  skillIds: z.array(z.string().uuid()).max(20).default([]),
  points: z.number().min(0).max(1000).default(1),
  /** Platform admins may add to the public bank. */
  public: z.boolean().optional(),
});

const iso = z.string().datetime({ offset: true }).nullable().optional();

export const settingsInput = z
  .object({
    timeLimitMinutes: z.number().int().min(1).max(600).nullable().optional(),
    maxAttempts: z.number().int().min(1).max(100).nullable().optional(),
    availableFrom: iso,
    availableUntil: iso,
    shuffleQuestions: z.boolean().optional(),
    shuffleOptions: z.boolean().optional(),
    blueprint: z
      .array(
        z.object({
          topic: z.string().trim().max(80).optional(),
          difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
          type: z.enum(QUESTION_TYPES).optional(),
          count: z.number().int().min(1).max(100),
          points: z.number().min(0).max(1000).optional(),
        }),
      )
      .max(20)
      .optional(),
    resultRelease: z.enum(['immediate', 'after_close', 'manual']).optional(),
    showAnswersAfterRelease: z.boolean().optional(),
    passingScore: z.number().min(0).max(100).nullable().optional(),
    allowRegradeRequests: z.boolean().optional(),
    proctoringNote: z.string().max(2000).optional(),
    /** Optional section names in display order (items reference them by name). */
    sections: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  })
  .refine((s) => !s.availableFrom || !s.availableUntil || new Date(s.availableFrom) < new Date(s.availableUntil), {
    message: 'The window must end after it starts.',
    path: ['availableUntil'],
  });

/** Settings plus engine-private flags kept in the same jsonb column. */
export type ExtSettings = AssessmentSettings & {
  sections?: string[];
  /** Personal practice generated by a learner for themselves (orgId null, visible only to the owner). */
  personal?: boolean;
  /** Stable key for reference content created by the seed (upsert target). */
  seedKey?: string;
};

export const DEFAULT_SETTINGS: ExtSettings = {
  timeLimitMinutes: null,
  maxAttempts: null,
  availableFrom: null,
  availableUntil: null,
  shuffleQuestions: false,
  shuffleOptions: false,
  blueprint: [],
  resultRelease: 'immediate',
  showAnswersAfterRelease: false,
  passingScore: null,
  allowRegradeRequests: false,
};

/** Shape of a saved answer (per type). Kept permissive but bounded. */
export const answerInput = z.object({
  answer: z
    .object({
      choice: z.string().max(40).optional(),
      choices: z.array(z.string().max(40)).max(20).optional(),
      blanks: z.array(z.string().max(1000)).max(10).optional(),
      matches: z.record(z.string().max(40), z.string().max(40)).optional(),
      text: z.string().max(50000).optional(),
      code: z.string().max(100000).optional(),
      language: z.string().max(20).optional(),
      query: z.string().max(50000).optional(),
      link: z.string().max(2000).optional(),
    })
    .nullable(),
});
