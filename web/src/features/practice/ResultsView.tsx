import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { CaretDownIcon, CaretRightIcon, CheckCircleIcon, XCircleIcon, LockSimpleIcon, InfoIcon, WarningIcon } from '@phosphor-icons/react';
import { Badge, Banner } from '@/components/ui';
import { PROVIDER_LABEL, RUN_STATUS_LABEL, TEST_STATUS_LABEL, runTone, type RunResult, type TestResult } from './api';

function Block({ label, children, tone }: { label: string; children: string; tone?: 'danger' | 'muted' }) {
  return (
    <div>
      <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-subtle">{label}</div>
      <pre
        className={clsx(
          'max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border px-3 py-2 font-mono text-[12.5px] leading-relaxed',
          tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-fg',
        )}
      >
        {children === '' ? <span className="italic text-subtle">(empty)</span> : children}
      </pre>
    </div>
  );
}

function SystemLine({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) {
  return (
    <div className={clsx('flex items-start gap-2 rounded-md px-3 py-2 text-[13px]', tone === 'warning' ? 'bg-warning-soft' : 'bg-info-soft')}>
      {tone === 'warning' ? <WarningIcon size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden /> : <InfoIcon size={16} className="mt-0.5 shrink-0 text-info" aria-hidden />}
      <div className="min-w-0 text-fg">
        <span className="mr-1 text-[11.5px] font-semibold uppercase tracking-wide text-subtle">System</span>
        {children}
      </div>
    </div>
  );
}

function TestRow({ t, defaultOpen }: { t: TestResult; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li className="rounded-md border border-border">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px]">
        {open ? <CaretDownIcon size={13} className="text-subtle" /> : <CaretRightIcon size={13} className="text-subtle" />}
        {t.passed ? <CheckCircleIcon size={16} weight="fill" className="text-success" aria-hidden /> : <XCircleIcon size={16} weight="fill" className="text-danger" aria-hidden />}
        <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
        <Badge tone={t.passed ? 'success' : 'danger'}>{TEST_STATUS_LABEL[t.status]}</Badge>
        {t.timeMs !== null && <span className="text-[12px] tabular-nums text-subtle">{t.timeMs} ms</span>}
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-border px-3 py-3">
          {t.input !== undefined && <Block label="Input">{t.input}</Block>}
          {t.expected !== undefined && <Block label="Expected output">{t.expected}</Block>}
          {t.actual !== undefined && <Block label="Your output (stdout)">{t.actual}</Block>}
          {t.stderr && (
            <Block label="Errors (stderr)" tone="danger">
              {t.stderr}
            </Block>
          )}
        </div>
      )}
    </li>
  );
}

function SqlTable({ columns, rows, rowCount }: { columns: string[]; rows: unknown[][]; rowCount?: number }) {
  return (
    <div>
      <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-subtle">Your result</div>
      <div className="max-h-72 overflow-auto rounded-md border border-border">
        <table className="w-full border-collapse text-left font-mono text-[12.5px]">
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              {columns.map((c, i) => (
                <th key={i} scope="col" className="border-b border-border px-3 py-1.5 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="odd:bg-surface even:bg-surface-2/50">
                {r.map((v, j) => (
                  <td key={j} className="border-b border-border px-3 py-1 align-top">
                    {v === null ? <span className="italic text-subtle">NULL</span> : String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-3 py-3 text-[13px] text-muted">The query returned no rows.</p>}
      </div>
      {rowCount !== undefined && rowCount > rows.length && <p className="mt-1 text-[12px] text-subtle">Showing the first {rows.length} of {rowCount} rows.</p>}
    </div>
  );
}

/** Shows one run or submission: status, system messages, compiler output, per-test results, SQL rows. */
export function ResultsView({ run }: { run: RunResult }) {
  const visible = run.results.filter((t) => !t.hidden);
  const hidden = run.results.filter((t) => t.hidden);
  const hiddenPassed = hidden.filter((t) => t.passed).length;
  const isSql = run.provider === 'pglite';
  const firstFailIdx = visible.findIndex((t) => !t.passed);
  const status = run.custom && run.status === 'accepted' ? 'completed' : run.status;

  if (run.status === 'unavailable') {
    return (
      <Banner tone="warning" title="Execution unavailable on this server">
        {run.message ?? 'No sandbox can run this language here.'} Nothing was executed, so nothing was recorded as evidence.
      </Banner>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={runTone(status)} className="text-[12.5px]">
          {RUN_STATUS_LABEL[status]}
        </Badge>
        {!run.custom && !isSql && (
          <span className="text-[13px] text-muted">
            {run.passed} of {run.total} test{run.total === 1 ? '' : 's'} passed
          </span>
        )}
        <span className="ml-auto text-[12px] text-subtle">
          {run.kind === 'submit' ? 'Submission' : run.custom ? 'Custom input' : 'Sample tests'} · {PROVIDER_LABEL[run.provider]}
          {run.durationMs !== null ? ` · ${run.durationMs} ms` : ''}
        </span>
      </div>

      {run.message && <SystemLine tone={run.status === 'error' || run.status === 'time_limit' ? 'warning' : 'info'}>{run.message}</SystemLine>}

      {run.compileOutput && (
        <Block label="Compiler output" tone="danger">
          {run.compileOutput}
        </Block>
      )}

      {isSql && (
        <div className="space-y-3">
          {run.columns && run.rows && <SqlTable columns={run.columns} rows={run.rows} rowCount={run.rowCount} />}
          {run.expectedColumns && (
            <div className="text-[13px] text-muted">
              <span className="mr-1 font-medium text-fg">Expected columns:</span>
              {run.expectedColumns.map((c) => (
                <code key={c} className="mr-1.5 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-fg">
                  {c}
                </code>
              ))}
              <span className="text-subtle">(the expected rows stay hidden)</span>
            </div>
          )}
        </div>
      )}

      {!isSql && visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((t, i) => (
            <TestRow key={`${run.id}-${i}`} t={t} defaultOpen={run.custom || i === (firstFailIdx >= 0 ? firstFailIdx : 0)} />
          ))}
        </ul>
      )}

      {hidden.length > 0 && (
        <div className="rounded-md border border-border px-3 py-2.5">
          <div className="flex items-center gap-2 text-[13.5px]">
            <LockSimpleIcon size={15} className="text-subtle" aria-hidden />
            <span className="font-medium">
              Hidden tests: {hiddenPassed} of {hidden.length} passed
            </span>
          </div>
          <p className="mt-0.5 text-[12.5px] text-subtle">Hidden test inputs and expected outputs are not shown, so solutions cannot be hard-coded.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {hidden.map((t, i) => (
              <Badge key={i} tone={t.passed ? 'success' : 'danger'}>
                {t.name}: {TEST_STATUS_LABEL[t.status]}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
