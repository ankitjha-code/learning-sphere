import { useState } from 'react';
import clsx from 'clsx';
import { PlayIcon, CheckCircleIcon, XCircleIcon, LinkSimpleIcon, MicrophoneIcon } from '@phosphor-icons/react';
import { Markdown, Button, Field, Input, Select, Textarea, Banner, Badge } from '@/components/ui';
import { ObjectiveQuestion, type PublicQuestion } from '@/components/questions/ObjectiveQuestion';
import { errorMessage } from '@/lib/api';
import { CodeEditor } from './CodeEditor';
import type { Answer, Content, ExecRun } from './types';

export type TakeQuestion = PublicQuestion & { content: Content & { hintCount?: number } };

const OBJECTIVE_OR_TEXT = ['single', 'multi', 'true_false', 'matching', 'fill_blank', 'short_text', 'long_text'];

/** Whether a candidate has given any answer to a question. */
export function hasAnswer(q: TakeQuestion, a: Answer | null | undefined) {
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
    case 'coding':
      return !!a.code?.trim() && a.code.trim() !== (q.content.starterCode?.[a.language ?? ''] ?? '').trim();
    case 'sql':
      return !!a.query?.trim();
    case 'file':
      return !!a.link?.trim();
    default:
      return !!a.text?.trim();
  }
}

function RunResults({ run }: { run: ExecRun }) {
  if (run.status === 'unavailable') {
    return (
      <Banner tone="warning" title="Running code is not available right now">
        {run.message ?? 'No sandbox can run this language on this server.'} Your answer is still saved and will be graded after you submit, by a reviewer if automatic grading cannot run.
      </Banner>
    );
  }
  if (run.columns) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-muted">{run.message}</p>
        {run.columns.length > 0 && (
          <div className="max-h-64 overflow-auto rounded-md border border-border">
            <table className="w-full text-left font-mono text-[12.5px]">
              <thead className="bg-surface-2">
                <tr>
                  {run.columns.map((c) => (
                    <th key={c} scope="col" className="px-2 py-1 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(run.rows ?? []).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    {r.map((v, j) => (
                      <td key={j} className="px-2 py-1">
                        {v === null ? 'NULL' : String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2" aria-live="polite">
      <p className="text-[13px]">
        <span className="font-medium">
          {run.passed}/{run.total} visible tests passed
        </span>
        <span className="text-muted"> · ran on {run.provider}</span>
      </p>
      {run.compileOutput && <pre className="max-h-40 overflow-auto rounded-md bg-surface-2 p-2 font-mono text-[12px]">{run.compileOutput}</pre>}
      {(run.results ?? []).map((t) => (
        <div key={t.name} className={clsx('rounded-md border px-3 py-2 text-[12.5px]', t.passed ? 'border-success/40' : 'border-danger/40')}>
          <div className="flex items-center gap-1.5 font-medium">
            {t.passed ? <CheckCircleIcon size={14} weight="fill" className="text-success" aria-hidden /> : <XCircleIcon size={14} weight="fill" className="text-danger" aria-hidden />}
            {t.name} <span className="font-normal text-muted">({t.passed ? 'passed' : t.status.replace(/_/g, ' ')})</span>
          </div>
          {!t.passed && t.input !== undefined && (
            <div className="mt-1 grid gap-1 font-mono sm:grid-cols-3">
              <div>
                <div className="text-subtle">Input</div>
                <pre className="whitespace-pre-wrap">{t.input}</pre>
              </div>
              <div>
                <div className="text-subtle">Expected</div>
                <pre className="whitespace-pre-wrap">{t.expected}</pre>
              </div>
              <div>
                <div className="text-subtle">Your output</div>
                <pre className="whitespace-pre-wrap">{t.actual ?? t.stderr}</pre>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Answer control for every question type. Objective and written types reuse
 * ObjectiveQuestion; coding and SQL get an editor with a visible-tests run.
 */
export function AnswerInput({
  q,
  index,
  value,
  onChange,
  onRun,
  disabled,
}: {
  q: TakeQuestion;
  index?: number;
  value: Answer | null | undefined;
  onChange: (v: Answer) => void;
  onRun?: (payload: { language?: string; code?: string; query?: string }) => Promise<ExecRun>;
  disabled?: boolean;
}) {
  const [run, setRun] = useState<ExecRun | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  if (OBJECTIVE_OR_TEXT.includes(q.type)) {
    return <ObjectiveQuestion q={q} index={index} value={value ?? undefined} onChange={(v) => onChange(v)} disabled={disabled} />;
  }

  const doRun = async (payload: { language?: string; code?: string; query?: string }) => {
    if (!onRun) return;
    setRunning(true);
    setRunError(null);
    try {
      setRun(await onRun(payload));
    } catch (e) {
      setRunError(errorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  const header = (
    <div className="mb-3 flex items-start gap-2">
      {index !== undefined && <span className="mt-0.5 text-[13px] font-semibold text-subtle">{index}.</span>}
      <div className="min-w-0 flex-1">
        <Markdown source={q.content.prompt} className="text-[14.5px]" />
        <div className="mt-1 text-[12px] text-subtle">
          {q.type === 'coding' ? 'Write a program' : q.type === 'sql' ? 'Write a SQL query' : q.type === 'file' ? 'File answer' : 'Oral answer'}
          {q.points !== undefined ? ` · ${q.points} point${q.points === 1 ? '' : 's'}` : ''}
        </div>
      </div>
    </div>
  );

  if (q.type === 'coding') {
    const langs = q.content.languages ?? ['python'];
    const language = value?.language && langs.includes(value.language) ? value.language : langs[0];
    const code = value?.code ?? q.content.starterCode?.[language] ?? '';
    return (
      <fieldset className="rounded-lg border border-border bg-surface p-4" disabled={disabled}>
        <legend className="sr-only">{`Question ${index ?? ''}: ${q.title}`}</legend>
        {header}
        {q.content.constraints && <p className="mb-2 text-[12.5px] text-muted">Constraints: {q.content.constraints}</p>}
        <div className="mb-2 flex flex-wrap items-end gap-2">
          <Field label="Language" className="w-44">
            <Select
              value={language}
              onChange={(e) => {
                const next = e.target.value;
                const untouched = !value?.code || value.code === (q.content.starterCode?.[language] ?? '');
                onChange({ language: next, code: untouched ? (q.content.starterCode?.[next] ?? '') : value!.code });
              }}
            >
              {langs.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          {onRun && (
            <Button icon={<PlayIcon size={14} />} loading={running} onClick={() => doRun({ language, code })} disabled={disabled || !code.trim()} disabledReason={!code.trim() ? 'Write some code first' : undefined}>
              Run visible tests
            </Button>
          )}
        </div>
        <CodeEditor value={code} language={language} label={`Code for question ${index ?? ''}`} onChange={(v) => onChange({ language, code: v })} readOnly={disabled} />
        {(q.content.visibleTests?.length ?? 0) > 0 && (
          <details className="mt-2 text-[13px]">
            <summary className="cursor-pointer text-muted">Visible tests ({q.content.visibleTests!.length})</summary>
            <div className="mt-1 space-y-1">
              {q.content.visibleTests!.map((t) => (
                <div key={t.name} className="grid gap-2 rounded-md bg-surface-2 p-2 font-mono text-[12px] sm:grid-cols-2">
                  <div>
                    <div className="text-subtle">Input</div>
                    <pre className="whitespace-pre-wrap">{t.input}</pre>
                  </div>
                  <div>
                    <div className="text-subtle">Expected</div>
                    <pre className="whitespace-pre-wrap">{t.expected}</pre>
                  </div>
                </div>
              ))}
              <p className="text-[12px] text-subtle">Hidden tests also run when you submit. Partial credit is given per passing test.</p>
            </div>
          </details>
        )}
        {runError && <Banner tone="danger" className="mt-2">{runError}</Banner>}
        {run && <div className="mt-3">{<RunResults run={run} />}</div>}
      </fieldset>
    );
  }

  if (q.type === 'sql') {
    const query = value?.query ?? '';
    return (
      <fieldset className="rounded-lg border border-border bg-surface p-4" disabled={disabled}>
        <legend className="sr-only">{`Question ${index ?? ''}: ${q.title}`}</legend>
        {header}
        {q.content.schemaSql && (
          <details className="mb-2 text-[13px]" open>
            <summary className="cursor-pointer text-muted">Schema</summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-surface-2 p-2 font-mono text-[12px]">{q.content.schemaSql}</pre>
          </details>
        )}
        <CodeEditor value={query} language="sql" label={`SQL for question ${index ?? ''}`} minHeight="140px" onChange={(v) => onChange({ query: v })} readOnly={disabled} />
        <div className="mt-2 flex items-center gap-2">
          {onRun && (
            <Button icon={<PlayIcon size={14} />} loading={running} onClick={() => doRun({ query })} disabled={disabled || !query.trim()} disabledReason={!query.trim() ? 'Write a query first' : undefined}>
              Run query
            </Button>
          )}
          <span className="text-[12px] text-subtle">{q.content.orderMatters ? 'Row order matters for this question.' : 'Row order does not matter.'} Correctness is checked after you submit.</span>
        </div>
        {runError && <Banner tone="danger" className="mt-2">{runError}</Banner>}
        {run && <div className="mt-3">{<RunResults run={run} />}</div>}
      </fieldset>
    );
  }

  if (q.type === 'file') {
    return (
      <fieldset className="rounded-lg border border-border bg-surface p-4" disabled={disabled}>
        <legend className="sr-only">{`Question ${index ?? ''}: ${q.title}`}</legend>
        {header}
        <Banner tone="info" className="mb-3" title="Link instead of upload">
          Direct file uploads for assessments are not available yet. Share your file (for example from a cloud drive with view access) and paste the link.
        </Banner>
        <Field label={<span className="inline-flex items-center gap-1"><LinkSimpleIcon size={14} /> Link to your file</span>} helper={q.content.acceptedFileTypes?.length ? `Accepted types: ${q.content.acceptedFileTypes.join(', ')}` : undefined}>
          <Input type="url" value={value?.link ?? ''} placeholder="https://" onChange={(e) => onChange({ ...value, link: e.target.value })} />
        </Field>
        <Field label="Note for the reviewer" optional className="mt-3">
          <Textarea rows={2} value={value?.text ?? ''} onChange={(e) => onChange({ ...value, text: e.target.value })} />
        </Field>
      </fieldset>
    );
  }

  // oral
  return (
    <fieldset className="rounded-lg border border-border bg-surface p-4" disabled={disabled}>
      <legend className="sr-only">{`Question ${index ?? ''}: ${q.title}`}</legend>
      {header}
      <p className="mb-2 flex items-center gap-1.5 text-[13px] text-muted">
        <MicrophoneIcon size={15} aria-hidden /> Your examiner assesses this answer live. Write your key points below so they are on record. <Badge>Recording not available</Badge>
      </p>
      <Textarea rows={5} aria-label="Key points" value={value?.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} />
    </fieldset>
  );
}
