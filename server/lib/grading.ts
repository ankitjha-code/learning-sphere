import type { AnswerKey, QuestionContent } from '../db/schema/assessment';

/**
 * Deterministic grading for objective question types. Returns a score in
 * [0, points] and a machine-readable detail. Coding and SQL questions are graded
 * by real execution (server/exec); written/file/oral answers need a human.
 */
export type GradeResult = {
  method: 'deterministic' | 'manual';
  score: number | null; // null = needs manual grading
  detail: Record<string, unknown>;
};

export const OBJECTIVE_TYPES = ['single', 'multi', 'true_false', 'matching', 'fill_blank'] as const;
export const EXECUTION_TYPES = ['coding', 'sql'] as const;
export const MANUAL_TYPES = ['short_text', 'long_text', 'file', 'oral'] as const;

function norm(s: string, caseSensitive?: boolean) {
  const t = s.trim().replace(/\s+/g, ' ');
  return caseSensitive ? t : t.toLowerCase();
}

export function gradeObjective(type: string, content: QuestionContent, key: AnswerKey, answer: unknown, points: number): GradeResult {
  const a = (answer ?? {}) as Record<string, unknown>;
  switch (type) {
    case 'single':
    case 'true_false': {
      const chosen = typeof a.choice === 'string' ? a.choice : null;
      const correct = key.correct?.[0];
      const ok = !!chosen && chosen === correct;
      return { method: 'deterministic', score: ok ? points : 0, detail: { correct: ok } };
    }
    case 'multi': {
      // Partial credit: +1 per correct selection, -1 per wrong selection, floored at 0.
      const chosen = new Set(Array.isArray(a.choices) ? (a.choices as string[]) : []);
      const correct = new Set(key.correct ?? []);
      if (!correct.size) return { method: 'deterministic', score: 0, detail: { error: 'no answer key' } };
      let hits = 0;
      let wrong = 0;
      for (const ch of chosen) correct.has(ch) ? hits++ : wrong++;
      const ratio = Math.max(0, (hits - wrong) / correct.size);
      return { method: 'deterministic', score: round(points * ratio), detail: { hits, wrong, of: correct.size } };
    }
    case 'matching': {
      const pairs = (a.matches ?? {}) as Record<string, string>;
      const expected = key.matches ?? {};
      const total = Object.keys(expected).length || 1;
      const right = Object.entries(expected).filter(([l, r]) => pairs[l] === r).length;
      return { method: 'deterministic', score: round((points * right) / total), detail: { right, of: total } };
    }
    case 'fill_blank': {
      const given = Array.isArray(a.blanks) ? (a.blanks as string[]) : [];
      const accepted = key.accepted ?? [];
      const total = accepted.length || content.blanks || 1;
      let right = 0;
      accepted.forEach((options, i) => {
        if (given[i] !== undefined && options.some((o) => norm(o, key.caseSensitive) === norm(String(given[i]), key.caseSensitive))) right++;
      });
      return { method: 'deterministic', score: round((points * right) / total), detail: { right, of: total } };
    }
    default:
      return { method: 'manual', score: null, detail: { reason: 'Needs review by an instructor or reviewer' } };
  }
}

/** Only the parts of a question a candidate may see. Never includes the answer key. */
export function publicQuestion(q: { id: string; type: string; title: string; content: QuestionContent; difficulty: string; points?: number; topics?: string[] }, opts: { optionOrder?: string[]; revealHints?: number } = {}) {
  const c = q.content;
  let options = c.options;
  if (options && opts.optionOrder) {
    const byId = new Map(options.map((o) => [o.id, o]));
    options = opts.optionOrder.map((id) => byId.get(id)!).filter(Boolean);
  }
  return {
    id: q.id,
    type: q.type,
    title: q.title,
    difficulty: q.difficulty,
    points: q.points,
    topics: q.topics,
    content: {
      prompt: c.prompt,
      options,
      pairs: c.pairs,
      blanks: c.blanks,
      languages: c.languages,
      starterCode: c.starterCode,
      visibleTests: c.visibleTests,
      constraints: c.constraints,
      timeLimitMs: c.timeLimitMs,
      memoryLimitMb: c.memoryLimitMb,
      schemaSql: c.schemaSql,
      orderMatters: c.orderMatters,
      wordLimit: c.wordLimit,
      acceptedFileTypes: c.acceptedFileTypes,
      hintCount: c.hints?.length ?? 0,
      hints: opts.revealHints ? c.hints?.slice(0, opts.revealHints) : undefined,
    },
  };
}

export function round(n: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
