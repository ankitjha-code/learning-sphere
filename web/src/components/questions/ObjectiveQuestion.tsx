import clsx from 'clsx';
import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react';
import { Markdown } from '@/components/ui';

export type PublicQuestion = {
  id: string;
  type: string;
  title: string;
  difficulty?: string;
  points?: number;
  content: {
    prompt: string;
    options?: { id: string; text: string }[];
    pairs?: { left: { id: string; text: string }[]; right: { id: string; text: string }[] };
    blanks?: number;
    wordLimit?: number;
    [k: string]: unknown;
  };
};

export type ObjectiveAnswer = { choice?: string; choices?: string[]; blanks?: string[]; matches?: Record<string, string>; text?: string };

export type QuestionResult = { correct: boolean; score: number | null; max: number; correctAnswer?: unknown; explanation?: string | null };

/**
 * Renders single, multi, true/false, fill-in-the-blank, matching and short/long text answers.
 * Fully keyboard operable: native radio/checkbox/select/input controls.
 */
export function ObjectiveQuestion({
  q,
  index,
  value,
  onChange,
  result,
  disabled,
}: {
  q: PublicQuestion;
  index?: number;
  value: ObjectiveAnswer | undefined;
  onChange: (v: ObjectiveAnswer) => void;
  result?: QuestionResult;
  disabled?: boolean;
}) {
  const name = `q-${q.id}`;
  const correctIds = Array.isArray(result?.correctAnswer) && typeof (result!.correctAnswer as unknown[])[0] === 'string' ? (result!.correctAnswer as string[]) : [];
  return (
    <fieldset className={clsx('rounded-lg border bg-surface p-4', result ? (result.correct ? 'border-success/50' : 'border-danger/40') : 'border-border')} disabled={disabled}>
      <legend className="sr-only">{`Question ${index ?? ''}: ${q.title}`}</legend>
      <div className="mb-3 flex items-start gap-2">
        {index !== undefined && <span className="mt-0.5 text-[13px] font-semibold text-subtle">{index}.</span>}
        <div className="min-w-0 flex-1">
          <Markdown source={q.content.prompt} className="text-[14.5px]" />
          <div className="mt-1 text-[12px] text-subtle">
            {q.type === 'multi' ? 'Select all that apply' : q.type === 'fill_blank' ? 'Type your answer' : q.type === 'matching' ? 'Match each item' : q.type === 'short_text' || q.type === 'long_text' ? 'Written answer' : 'Choose one'}
            {q.points !== undefined && q.points !== 1 ? ` · ${q.points} points` : ''}
          </div>
        </div>
        {result && (result.correct ? <CheckCircleIcon size={20} weight="fill" className="shrink-0 text-success" aria-label="Correct" /> : <XCircleIcon size={20} weight="fill" className="shrink-0 text-danger" aria-label="Incorrect" />)}
      </div>

      {(q.type === 'single' || q.type === 'true_false') && (
        <div className="space-y-1.5">
          {q.content.options?.map((o) => (
            <label
              key={o.id}
              className={clsx(
                'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-[14px]',
                value?.choice === o.id ? 'border-accent bg-accent-soft/50' : 'border-border hover:border-border-strong',
                result && correctIds.includes(o.id) && 'border-success bg-success-soft',
              )}
            >
              <input type="radio" name={name} className="mt-1 accent-[var(--accent)]" checked={value?.choice === o.id} onChange={() => onChange({ choice: o.id })} />
              <Markdown source={o.text} className="text-[14px] [&_p]:m-0" />
            </label>
          ))}
        </div>
      )}

      {q.type === 'multi' && (
        <div className="space-y-1.5">
          {q.content.options?.map((o) => {
            const checked = value?.choices?.includes(o.id) ?? false;
            return (
              <label
                key={o.id}
                className={clsx(
                  'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-[14px]',
                  checked ? 'border-accent bg-accent-soft/50' : 'border-border hover:border-border-strong',
                  result && correctIds.includes(o.id) && 'border-success bg-success-soft',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 accent-[var(--accent)]"
                  checked={checked}
                  onChange={(e) => {
                    const set = new Set(value?.choices ?? []);
                    e.target.checked ? set.add(o.id) : set.delete(o.id);
                    onChange({ choices: [...set] });
                  }}
                />
                <Markdown source={o.text} className="text-[14px] [&_p]:m-0" />
              </label>
            );
          })}
        </div>
      )}

      {q.type === 'fill_blank' && (
        <div className="space-y-2">
          {Array.from({ length: q.content.blanks ?? 1 }).map((_, i) => (
            <input
              key={i}
              aria-label={`Blank ${i + 1}`}
              className="h-9 w-full max-w-sm rounded-md border border-border bg-surface px-3 font-mono text-[14px] focus:border-accent focus:outline-none"
              value={value?.blanks?.[i] ?? ''}
              onChange={(e) => {
                const blanks = [...(value?.blanks ?? [])];
                blanks[i] = e.target.value;
                onChange({ blanks });
              }}
            />
          ))}
          {result && !result.correct && Array.isArray(result.correctAnswer) && (
            <p className="text-[13px] text-muted">
              Accepted: {(result.correctAnswer as string[][]).map((opts) => opts.join(' / ')).join(', ')}
            </p>
          )}
        </div>
      )}

      {q.type === 'matching' && q.content.pairs && (
        <div className="space-y-2">
          {q.content.pairs.left.map((l) => (
            <div key={l.id} className="grid items-center gap-2 sm:grid-cols-[1fr_220px]">
              <span className="text-[14px]">{l.text}</span>
              <select
                aria-label={`Match for ${l.text}`}
                className="h-9 rounded-md border border-border bg-surface px-2 text-[14px]"
                value={value?.matches?.[l.id] ?? ''}
                onChange={(e) => onChange({ matches: { ...(value?.matches ?? {}), [l.id]: e.target.value } })}
              >
                <option value="">Choose…</option>
                {q.content.pairs!.right.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.text}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {(q.type === 'short_text' || q.type === 'long_text') && (
        <div>
          <textarea
            aria-label="Your answer"
            rows={q.type === 'long_text' ? 8 : 3}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[14px] focus:border-accent focus:outline-none"
            value={value?.text ?? ''}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          {q.content.wordLimit && (
            <div className="mt-1 text-right text-[12px] text-subtle">
              {(value?.text ?? '').trim().split(/\s+/).filter(Boolean).length} / {q.content.wordLimit} words
            </div>
          )}
        </div>
      )}

      {result?.explanation && (
        <div className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-[13.5px]">
          <span className="font-semibold">Explanation: </span>
          <Markdown source={result.explanation} className="inline text-[13.5px] [&_p]:inline" />
        </div>
      )}
    </fieldset>
  );
}

export function isAnswered(q: PublicQuestion, a: ObjectiveAnswer | undefined) {
  if (!a) return false;
  switch (q.type) {
    case 'single':
    case 'true_false':
      return !!a.choice;
    case 'multi':
      return !!a.choices?.length;
    case 'fill_blank':
      return !!a.blanks?.some((b) => b?.trim());
    case 'matching':
      return Object.values(a.matches ?? {}).some(Boolean);
    default:
      return !!a.text?.trim();
  }
}
