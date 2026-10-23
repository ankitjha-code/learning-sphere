import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  CaretRightIcon,
  PlayIcon,
  PaperPlaneTiltIcon,
  CloudCheckIcon,
  CloudArrowUpIcon,
  CloudSlashIcon,
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  DatabaseIcon,
  SealCheckIcon,
  TerminalWindowIcon,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { ErrorState, Skeleton, Badge, Banner, Button, Markdown, Tabs, Select, Textarea, Tooltip, ConfirmDialog, CopyButton, Switch, EmptyState } from '@/components/ui';
import { CodeEditor } from './CodeEditor';
import { ResultsView } from './ResultsView';
import { SplitPane, useMediaQuery } from './SplitPane';
import { HintsPanel, SolutionPanel, SubmissionsPanel } from './WorkspacePanels';
import { DIFFICULTY_TONE, LANGUAGE_LABEL, PROVIDER_LABEL, starterFor, type Language, type ProblemDetail, type RunResult, type RuntimeInfo, type SubmitResponse } from './api';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const LANGUAGE_PREFERENCE: Language[] = ['python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'go', 'rust'];

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'saving')
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-subtle" role="status">
        <CloudArrowUpIcon size={14} /> Saving
      </span>
    );
  if (state === 'error')
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-danger" role="status">
        <CloudSlashIcon size={14} /> Not saved
      </span>
    );
  if (state === 'saved')
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-subtle" role="status">
        <CloudCheckIcon size={14} /> Saved
      </span>
    );
  return null;
}

function Statement({ d }: { d: ProblemDetail }) {
  const c = d.problem.content;
  return (
    <div className="space-y-4">
      <Markdown source={c.prompt} />
      {c.constraints && (
        <div className="text-[13.5px]">
          <span className="font-medium">Constraints: </span>
          <span className="text-muted">{c.constraints}</span>
        </div>
      )}
      {d.problem.type === 'sql' && c.schemaSql && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[13px] font-medium">Schema (PostgreSQL)</span>
            <CopyButton value={c.schemaSql} />
          </div>
          <pre className="max-h-80 overflow-auto rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[12.5px] leading-relaxed">{c.schemaSql}</pre>
          <p className="mt-1.5 text-[12.5px] text-subtle">
            {c.orderMatters ? 'Row order matters for this problem.' : 'Row order does not matter.'} The sample data is hidden; your query runs against it on a fresh database each time.
          </p>
        </div>
      )}
      {d.problem.type === 'coding' && (
        <p className="text-[12.5px] text-subtle">
          Read from standard input and print to standard output. Time limit {(c.timeLimitMs ?? 2000) / 1000} s per test{c.memoryLimitMb ? `, memory ${c.memoryLimitMb} MB` : ''}.
        </p>
      )}
      {d.skills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="text-muted">Skills:</span>
          {d.skills.map((s) => (
            <Link key={s.id} to={`/app/skills/${s.slug}`} className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-[12px] font-medium text-accent-text hover:underline">
              {s.name}
            </Link>
          ))}
        </div>
      )}
      {d.problem.source && <p className="text-[12px] text-subtle">Source: {d.problem.source}</p>}
    </div>
  );
}

function SampleTests({ d }: { d: ProblemDetail }) {
  const tests = d.problem.content.visibleTests ?? [];
  if (!tests.length) return <p className="text-[13px] text-muted">This problem has no sample tests. Use custom input or submit.</p>;
  return (
    <ul className="divide-y divide-border">
      {tests.map((t) => (
        <li key={t.name} className="py-3.5 first:pt-0 last:pb-0">
          <div className="mb-2 text-[13px] font-semibold">{t.name}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-subtle">Input</div>
              <pre className="overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[12.5px]">{t.input || ' '}</pre>
            </div>
            <div>
              <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-subtle">Expected output</div>
              <pre className="overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[12.5px]">{t.expected}</pre>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function WorkspacePage() {
  const { slug = '' } = useParams();
  const qc = useQueryClient();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const detailQ = useQuery({ queryKey: ['practice', 'problem', slug], queryFn: () => api.get<ProblemDetail>(`/practice/problems/${encodeURIComponent(slug)}`) });
  const runtimesQ = useQuery({ queryKey: ['practice', 'runtimes'], queryFn: () => api.get<{ runtimes: RuntimeInfo[] }>('/practice/runtimes'), staleTime: 60_000 });
  const d = detailQ.data;

  const [language, setLanguage] = useState<Language | null>(null);
  const [codes, setCodes] = useState<Partial<Record<Language, string>>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [useCustom, setUseCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);
  const [lastSubmit, setLastSubmit] = useState<SubmitResponse | null>(null);
  const [leftTab, setLeftTab] = useState('description');
  const [consoleTab, setConsoleTab] = useState('tests');
  const [mobileTab, setMobileTab] = useState('problem');
  const [confirmReset, setConfirmReset] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // Initialise language and editor contents once per problem (drafts first, then starter code).
  useEffect(() => {
    if (!d || loadedFor.current === d.problem.id) return;
    // Wait for runtimes so the first language picked is one this server can run.
    if (!runtimesQ.data && !runtimesQ.error) return;
    loadedFor.current = d.problem.id;
    const langs = d.problem.content.languages;
    const avail = new Set((runtimesQ.data?.runtimes ?? []).filter((r) => r.available).map((r) => r.language));
    const draftLangs = Object.keys(d.state.drafts) as Language[];
    const initial =
      (d.state.lastLanguage && langs.includes(d.state.lastLanguage) ? d.state.lastLanguage : null) ??
      draftLangs.find((l) => langs.includes(l)) ??
      LANGUAGE_PREFERENCE.find((l) => langs.includes(l) && avail.has(l)) ??
      langs[0];
    setLanguage(initial);
    const next: Partial<Record<Language, string>> = {};
    for (const l of langs) next[l] = d.state.drafts[l]?.code ?? starterFor(d, l);
    setCodes(next);
    setResult(null);
    setLastSubmit(null);
    setSaveState(draftLangs.length ? 'saved' : 'idle');
  }, [d, runtimesQ.data, runtimesQ.error]);

  const code = (language && codes[language]) ?? '';
  const runtime = runtimesQ.data?.runtimes.find((r) => r.language === language);
  const unavailableReason = runtime && !runtime.available ? `Unavailable on this server: ${runtime.reason ?? 'no sandbox for this language'}` : undefined;

  // Debounced autosave of the draft for the current language.
  const dirty = useRef(false);
  useEffect(() => {
    if (!d || !language || !dirty.current) return;
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        await api.put(`/practice/problems/${d.problem.id}/draft`, { language, code });
        setSaveState('saved');
        dirty.current = false;
      } catch {
        setSaveState('error');
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [code, language, d]);

  const onChange = useCallback(
    (v: string) => {
      if (!language) return;
      dirty.current = true;
      setCodes((prev) => ({ ...prev, [language]: v }));
    },
    [language],
  );

  const afterRun = () => {
    dirty.current = false;
    setSaveState('saved');
    qc.invalidateQueries({ queryKey: ['practice', 'submissions'] });
    qc.invalidateQueries({ queryKey: ['practice', 'problems'] });
    setConsoleTab('result');
    if (!desktop) setMobileTab('results');
  };

  const run = useMutation({
    mutationFn: () => api.post<{ run: RunResult }>(`/practice/problems/${d!.problem.id}/run`, { language, code, ...(useCustom && d!.problem.type !== 'sql' ? { customInput } : {}) }),
    onSuccess: (r) => {
      setResult(r.run);
      setLastSubmit(null);
      afterRun();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submit = useMutation({
    mutationFn: () => api.post<SubmitResponse>(`/practice/problems/${d!.problem.id}/submit`, { language, code }),
    onSuccess: (r) => {
      setResult(r.submission);
      setLastSubmit(r);
      afterRun();
      qc.invalidateQueries({ queryKey: ['practice', 'problem'] });
      qc.invalidateQueries({ queryKey: ['practice', 'collections'] });
      qc.invalidateQueries({ queryKey: ['skill-dna'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (r.firstSolve) toast.success(`Accepted. ${r.xpAwarded ? `+${r.xpAwarded} XP. ` : ''}Verified evidence added to your Skill DNA.`);
      else if (r.submission.status === 'accepted') toast.success('Accepted. All tests passed.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const busy = run.isPending || submit.isPending;
  const blockReason = unavailableReason ?? (busy ? 'Already running' : !code.trim() ? 'Write some code first.' : undefined);
  const doRun = useCallback(() => {
    if (!blockReason) run.mutate();
  }, [blockReason, run]);
  const doSubmit = useCallback(() => {
    if (!blockReason) submit.mutate();
  }, [blockReason, submit]);

  // Shortcuts also work when focus is outside the editor (the editor handles its own keys first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return;
      e.preventDefault();
      if (e.shiftKey) doSubmit();
      else doRun();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doRun, doSubmit]);

  const leftTabs = useMemo(
    () => [
      { value: 'description', label: 'Description' },
      { value: 'hints', label: 'Hints', count: d?.state.hintCount || undefined },
      { value: 'solution', label: 'Solution' },
      { value: 'submissions', label: 'Submissions' },
    ],
    [d?.state.hintCount],
  );

  if (detailQ.error) return <ErrorState error={detailQ.error} onRetry={() => detailQ.refetch()} />;
  if (detailQ.isLoading || !d || !language) return <Skeleton className="h-[calc(100dvh-9rem)] min-h-[520px]" />;
  const isSql = d.problem.type === 'sql';

  const header = (
    <div className="mb-4">
      <nav className="mb-2 flex items-center gap-1 text-[13px] font-medium text-muted" aria-label="Breadcrumb">
        <Link to="/app/practice" className="hover:text-fg">
          CodeLab
        </Link>
        <CaretRightIcon size={12} />
        <span className="truncate text-fg">{d.problem.title}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.02em]">{d.problem.title}</h1>
        <Badge tone={DIFFICULTY_TONE[d.problem.difficulty]}>{d.problem.difficulty[0].toUpperCase() + d.problem.difficulty.slice(1)}</Badge>
        {isSql && (
          <Badge tone="info" icon={<DatabaseIcon size={11} />}>
            SQL
          </Badge>
        )}
        {d.state.solved && (
          <Badge tone="success" icon={<CheckCircleIcon size={11} weight="fill" />}>
            Solved
          </Badge>
        )}
      </div>
    </div>
  );

  const leftPanel = (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-surface shadow-1">
      <Tabs value={leftTab} onValueChange={setLeftTab} tabs={leftTabs} className="shrink-0 px-2" />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {leftTab === 'description' && <Statement d={d} />}
        {leftTab === 'hints' && <HintsPanel detail={d} code={code} language={language} />}
        {leftTab === 'solution' && <SolutionPanel detail={d} code={code} language={language} />}
        {leftTab === 'submissions' && <SubmissionsPanel problemId={d.problem.id} />}
      </div>
    </div>
  );

  const languagePicker = (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="w-40">
        <Select
          aria-label="Language"
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value as Language);
            setResult(null);
          }}
          disabled={isSql}
        >
          {d.problem.content.languages.map((l) => {
            const rt = runtimesQ.data?.runtimes.find((r) => r.language === l);
            return (
              <option key={l} value={l}>
                {LANGUAGE_LABEL[l]}
                {rt && !rt.available ? ' (unavailable)' : ''}
              </option>
            );
          })}
        </Select>
      </div>
      {runtime && (
        <Tooltip content={runtime.available ? 'Code is executed for real in this sandbox. Nothing is simulated.' : (runtime.setupHint ?? runtime.reason ?? '')}>
          <span tabIndex={0} className={clsx('min-w-0 truncate text-[12px]', runtime.available ? 'text-muted' : 'text-warning')}>
            {runtime.available ? PROVIDER_LABEL[runtime.provider] : unavailableReason}
          </span>
        </Tooltip>
      )}
    </div>
  );

  const actionButton = (kind: 'run' | 'submit') => {
    const isRun = kind === 'run';
    const btn = (
      <Button
        variant={isRun ? 'secondary' : 'primary'}
        icon={isRun ? <PlayIcon size={15} weight="fill" /> : <PaperPlaneTiltIcon size={15} />}
        loading={isRun ? run.isPending : submit.isPending}
        disabled={!!blockReason}
        disabledReason={blockReason}
        onClick={isRun ? doRun : doSubmit}
      >
        {isRun ? 'Run' : 'Submit'}
      </Button>
    );
    if (blockReason) return btn;
    return (
      <Tooltip
        content={`${isRun ? (isSql ? 'Run your query' : useCustom ? 'Run with your custom input' : 'Run the sample tests') : isSql ? 'Submit your query for judging' : 'Run every test, including hidden ones'} (Ctrl/Cmd + ${isRun ? '' : 'Shift + '}Enter)`}
      >
        {btn}
      </Tooltip>
    );
  };

  const editorPanel = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-1">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        {languagePicker}
        <div className="flex items-center gap-2">
          <SaveIndicator state={saveState} />
          <Button size="icon-sm" variant="ghost" aria-label="Reset to starter code" title="Reset to starter code" onClick={() => setConfirmReset(true)}>
            <ArrowCounterClockwiseIcon size={15} />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <CodeEditor key={language} value={code} onChange={onChange} language={language} onRun={doRun} onSubmit={doSubmit} label={`${LANGUAGE_LABEL[language]} code editor`} minHeight="240px" />
      </div>
    </div>
  );

  const evidenceBanner =
    lastSubmit?.firstSolve && lastSubmit.evidence ? (
      <Banner tone="success" title="Verified evidence added to Skill DNA" className="mb-3">
        All tests passed in a real sandbox{lastSubmit.xpAwarded ? ` (+${lastSubmit.xpAwarded} XP)` : ''}. Updated:{' '}
        {lastSubmit.evidence.skills.map((s, i) => (
          <span key={s.id}>
            {i > 0 && ', '}
            <Link to={`/app/skills/${s.slug}`} className="font-medium text-accent-text hover:underline">
              {s.name}
            </Link>
          </span>
        ))}
        {lastSubmit.evidence.skills.length === 0 && 'no linked skills'}
      </Banner>
    ) : null;

  const consolePanel = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-1">
      <div className="flex shrink-0 items-center justify-between gap-2 pr-3">
        <Tabs
          value={consoleTab}
          onValueChange={setConsoleTab}
          tabs={[
            { value: 'tests', label: isSql ? 'Expected output' : 'Sample tests' },
            ...(isSql ? [] : [{ value: 'custom', label: 'Custom input' }]),
            { value: 'result', label: 'Result' },
          ]}
          className="min-w-0 flex-1 px-2"
        />
        {desktop && (
          <div className="flex shrink-0 items-center gap-2 py-1.5">
            {actionButton('run')}
            {actionButton('submit')}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" tabIndex={0} role="region" aria-label="Problem details">
        {consoleTab === 'tests' &&
          (isSql ? (
            <p className="text-[13px] text-muted">The expected rows are computed from the reference query on hidden data and are never shown. Run your query to see your result and the expected column names.</p>
          ) : (
            <SampleTests d={d} />
          ))}
        {consoleTab === 'custom' && !isSql && (
          <div className="space-y-3">
            <Switch checked={useCustom} onCheckedChange={setUseCustom} label="Run with custom input" description="Run uses this input instead of the sample tests. Submit always runs every test." />
            <Textarea value={customInput} onChange={(e) => setCustomInput(e.target.value)} rows={6} className="font-mono text-[13px]" aria-label="Custom input" placeholder={d.problem.content.visibleTests?.[0]?.input ?? 'Type the input your program reads from stdin'} />
          </div>
        )}
        {consoleTab === 'result' &&
          (busy ? (
            <div className="space-y-2" role="status" aria-live="polite">
              <p className="text-[13px] text-muted">{submit.isPending ? 'Running every test in the sandbox' : 'Running in the sandbox'}</p>
              <Skeleton className="h-10" />
              <Skeleton className="h-24" />
            </div>
          ) : result ? (
            <div aria-live="polite">
              {evidenceBanner}
              <ResultsView run={result} />
            </div>
          ) : (
            <EmptyState icon={<TerminalWindowIcon size={22} />} title="No results yet" description={isSql ? 'Run your query to see its rows here.' : 'Run the sample tests or submit to see results here.'} />
          ))}
      </div>
    </div>
  );

  const resetDialog = (
    <ConfirmDialog
      open={confirmReset}
      onOpenChange={setConfirmReset}
      title="Reset to starter code?"
      description={`Your ${LANGUAGE_LABEL[language]} draft for this problem will be replaced with the starter code. Submissions you already made are kept.`}
      confirmLabel="Reset code"
      danger
      onConfirm={() => {
        onChange(starterFor(d, language));
        setConfirmReset(false);
      }}
    />
  );

  if (!desktop) {
    return (
      <div>
        {header}
        {d.state.solved && (
          <p className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-success">
            <SealCheckIcon size={14} /> Solved with verified evidence
          </p>
        )}
        <Tabs
          value={mobileTab}
          onValueChange={setMobileTab}
          tabs={[
            { value: 'problem', label: 'Problem' },
            { value: 'code', label: 'Code' },
            { value: 'results', label: 'Results' },
          ]}
          className="mb-3"
        />
        {mobileTab !== 'problem' && (
          <div className="mb-3 flex items-center justify-end gap-2">
            {actionButton('run')}
            {actionButton('submit')}
          </div>
        )}
        <div className={clsx(mobileTab === 'problem' ? 'block' : 'hidden', 'h-[calc(100dvh-17rem)] min-h-[420px]')}>{leftPanel}</div>
        <div className={clsx(mobileTab === 'code' ? 'block' : 'hidden', 'h-[calc(100dvh-17rem)] min-h-[420px]')}>{editorPanel}</div>
        <div className={clsx(mobileTab === 'results' ? 'block' : 'hidden', 'h-[calc(100dvh-17rem)] min-h-[420px]')}>{consolePanel}</div>
        {resetDialog}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[560px] flex-col">
      {header}
      <SplitPane
        direction="horizontal"
        storageKey="ls-practice-split-x"
        initial={42}
        min={25}
        max={70}
        label="Resize problem and editor panels"
        className="min-h-0 flex-1"
        first={leftPanel}
        second={<SplitPane direction="vertical" storageKey="ls-practice-split-y" initial={58} min={25} max={80} label="Resize editor and console" className="h-full" first={editorPanel} second={consolePanel} />}
      />
      {resetDialog}
    </div>
  );
}
