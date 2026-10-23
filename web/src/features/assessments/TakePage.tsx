import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CaretLeftIcon, CaretRightIcon, FlagIcon, ClockIcon, CheckCircleIcon, CloudSlashIcon, CloudCheckIcon, CircleNotchIcon, PaperPlaneTiltIcon, ArrowClockwiseIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { Button, Banner, ConfirmDialog, ErrorState, Skeleton, Segmented, Badge } from '@/components/ui';
import { AnswerInput, hasAnswer, type TakeQuestion } from '@/components/assessments/AnswerInput';
import type { Answer, ExecRun } from '@/components/assessments/types';

type AttemptView = {
  serverTime: string;
  attempt: { id: string; assessmentId: string; attemptNo: number; status: string; startedAt: string; deadlineAt: string | null; submittedAt: string | null };
  assessment: { id: string; title: string; mode: string; timeLimitMinutes: number | null; sections: string[]; proctoringNote: string | null };
  accommodations: { extraTimePercent?: number; note?: string };
  items: { index: number; itemId: string; points: number; question: TakeQuestion | null }[];
  answers: Record<string, Answer | null>;
  savedAt: Record<string, string | null>;
  state: { flagged: string[]; currentIndex: number };
};

type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

const pendingKey = (id: string) => `ls:attempt:${id}:pending`;
function readPending(id: string): Record<string, Answer> {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(id)) ?? '{}');
  } catch {
    return {};
  }
}
function writePending(id: string, v: Record<string, Answer>) {
  try {
    if (Object.keys(v).length) localStorage.setItem(pendingKey(id), JSON.stringify(v));
    else localStorage.removeItem(pendingKey(id));
  } catch {
    /* storage unavailable: the in-memory copy still retries */
  }
}

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Countdown that updates visually every second but only announces at 10, 5 and 1 minutes left. */
function Countdown({ deadline, offset, onExpire }: { deadline: number; offset: number; onExpire: () => void }) {
  const [now, setNow] = useState(() => Date.now() + offset);
  const [announce, setAnnounce] = useState('');
  const announced = useRef(new Set<number>());
  const expired = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);
  const left = deadline - now;
  useEffect(() => {
    for (const m of [10, 5, 1]) {
      if (left <= m * 60_000 && left > (m - 1) * 60_000 - 1000 && !announced.current.has(m)) {
        announced.current.add(m);
        setAnnounce(`${m} minute${m === 1 ? '' : 's'} left.`);
      }
    }
    if (left <= 0 && !expired.current) {
      expired.current = true;
      setAnnounce('Time is up. Submitting your answers.');
      onExpire();
    }
  }, [left, onExpire]);
  const urgent = left <= 5 * 60_000;
  return (
    <div className={clsx('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[14px] tabular-nums', urgent ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-fg')}>
      <ClockIcon size={15} aria-hidden />
      <span aria-hidden>{fmt(left)}</span>
      <span className="sr-only">Time remaining: {Math.ceil(Math.max(0, left) / 60_000)} minutes</span>
      <span className="sr-only" aria-live="assertive" role="status">
        {announce}
      </span>
    </div>
  );
}

export default function TakePage() {
  const { attemptId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['assessments', 'attempt', attemptId], queryFn: () => api.get<AttemptView>(`/assessments/attempts/${attemptId}`), refetchOnWindowFocus: false, staleTime: Infinity });

  const [answers, setAnswers] = useState<Record<string, Answer | null>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [view, setView] = useState<'one' | 'all'>('one');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [timeUp, setTimeUp] = useState(false);

  const pending = useRef<Record<string, Answer>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitKey = useRef(`${attemptId}:${Math.random().toString(36).slice(2)}`);
  const initialized = useRef(false);
  const finished = useRef(false);

  const goToResult = useCallback(
    (msg?: string) => {
      if (finished.current) return;
      finished.current = true;
      if (msg) toast.info(msg);
      writePending(attemptId, {});
      qc.invalidateQueries({ queryKey: ['assessments'] });
      navigate(`/app/assessments/attempts/${attemptId}/result`, { replace: true });
    },
    [attemptId, navigate, qc],
  );

  // Initialise from the server, then re-apply any answers saved only locally (e.g. offline before a reload).
  useEffect(() => {
    if (!q.data || initialized.current) return;
    initialized.current = true;
    if (q.data.attempt.status !== 'in_progress') {
      goToResult();
      return;
    }
    const local = readPending(attemptId);
    pending.current = local;
    setAnswers({ ...q.data.answers, ...local });
    setFlagged(q.data.state.flagged);
    setCurrent(Math.min(q.data.state.currentIndex, q.data.items.length - 1));
    if (Object.keys(local).length) {
      setPendingCount(Object.keys(local).length);
      void flush();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const saveOne = useCallback(
    async (questionId: string) => {
      const value = pending.current[questionId];
      if (value === undefined) return true;
      try {
        await api.put(`/assessments/attempts/${attemptId}/answers/${questionId}`, { answer: value });
        if (pending.current[questionId] === value) delete pending.current[questionId];
        writePending(attemptId, pending.current);
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          goToResult(e.message);
          return true;
        }
        throw e;
      }
    },
    [attemptId, goToResult],
  );

  const flush = useCallback(async (): Promise<boolean> => {
    const ids = Object.keys(pending.current);
    if (!ids.length) {
      setSaveState((s) => (s === 'idle' ? s : 'saved'));
      setPendingCount(0);
      return true;
    }
    setSaveState('saving');
    try {
      for (const id of ids) await saveOne(id);
      const left = Object.keys(pending.current).length;
      setPendingCount(left);
      setSaveState(left ? 'saving' : 'saved');
      if (retryTimer.current) clearTimeout(retryTimer.current);
      return left === 0;
    } catch (e) {
      const offline = e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 429);
      setSaveState(offline ? 'offline' : 'error');
      setPendingCount(Object.keys(pending.current).length);
      if (offline) {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => void flush(), 5000);
      } else toast.error(errorMessage(e));
      return false;
    }
  }, [saveOne]);

  useEffect(() => {
    const on = () => void flush();
    window.addEventListener('online', on);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('beforeunload', beforeUnload);
      Object.values(timers.current).forEach(clearTimeout);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [flush]);

  const setAnswer = (questionId: string, v: Answer) => {
    setAnswers((prev) => ({ ...prev, [questionId]: v }));
    pending.current[questionId] = v;
    writePending(attemptId, pending.current);
    setPendingCount(Object.keys(pending.current).length);
    setSaveState('saving');
    clearTimeout(timers.current[questionId]);
    timers.current[questionId] = setTimeout(() => void flush(), 700);
  };

  // Navigation state is saved separately (flags + position), debounced.
  const stateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!initialized.current || finished.current) return;
    if (stateTimer.current) clearTimeout(stateTimer.current);
    stateTimer.current = setTimeout(() => {
      api.put(`/assessments/attempts/${attemptId}/state`, { flagged, currentIndex: current }).catch(() => {});
    }, 800);
  }, [flagged, current, attemptId]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    await flush();
    try {
      await api.post(`/assessments/attempts/${attemptId}/submit`, { submitKey: submitKey.current });
      goToResult('Submitted. Your answers are being graded.');
    } catch (e) {
      toast.error(errorMessage(e));
      setSubmitting(false);
    }
  }, [attemptId, flush, goToResult]);

  const onExpire = useCallback(() => {
    setTimeUp(true);
    void submit();
  }, [submit]);

  const run = useCallback((questionId: string) => async (payload: { language?: string; code?: string; query?: string }) => {
    const r = await api.post<{ run: ExecRun }>(`/assessments/attempts/${attemptId}/run/${questionId}`, payload);
    return r.run;
  }, [attemptId]);

  const items = useMemo(() => (q.data?.items ?? []).filter((i) => i.question), [q.data]);
  const offset = useMemo(() => (q.data ? new Date(q.data.serverTime).getTime() - Date.now() : 0), [q.data]);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <Skeleton className="h-[600px]" />;
  const d = q.data;
  const answered = (qid: string, qq: TakeQuestion) => hasAnswer(qq, answers[qid]);
  const unanswered = items.filter((i) => !answered(i.question!.id, i.question!)).map((i) => i.index + 1);
  const flaggedNums = items.filter((i) => flagged.includes(i.question!.id)).map((i) => i.index + 1);
  const cur = items[current];
  const toggleFlag = (id: string) => setFlagged((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const saveIndicator = (
    <div className="flex items-center gap-1.5 text-[12.5px]" role="status" aria-live="polite">
      {saveState === 'saving' && (
        <>
          <CircleNotchIcon size={14} className="animate-spin text-muted" aria-hidden /> <span className="text-muted">Saving</span>
        </>
      )}
      {(saveState === 'saved' || saveState === 'idle') && (
        <>
          <CloudCheckIcon size={15} className="text-success" aria-hidden /> <span className="text-muted">{saveState === 'saved' ? 'All answers saved' : 'Answers save automatically'}</span>
        </>
      )}
      {(saveState === 'offline' || saveState === 'error') && (
        <>
          <CloudSlashIcon size={15} className="text-warning" aria-hidden />
          <span className="text-warning">
            {saveState === 'offline' ? 'Offline' : 'Not saved'}: {pendingCount} waiting
          </span>
          <button className="inline-flex items-center gap-0.5 font-medium text-fg underline-offset-2 hover:underline" onClick={() => void flush()}>
            <ArrowClockwiseIcon size={13} aria-hidden /> Retry
          </button>
        </>
      )}
    </div>
  );

  const renderItem = (i: (typeof items)[number]) => {
    const qq = i.question!;
    const isFlagged = flagged.includes(qq.id);
    return (
      <div key={qq.id} id={`q-${i.index}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[13px] text-muted">
            Question {i.index + 1} of {items.length}
            {qq.title ? ` · ${qq.title}` : ''}
          </div>
          <Button size="sm" variant={isFlagged ? 'soft' : 'ghost'} icon={<FlagIcon size={14} weight={isFlagged ? 'fill' : 'regular'} />} aria-pressed={isFlagged} onClick={() => toggleFlag(qq.id)}>
            {isFlagged ? 'Flagged' : 'Flag for review'}
          </Button>
        </div>
        <AnswerInput q={qq} index={i.index + 1} value={answers[qq.id]} onChange={(v) => setAnswer(qq.id, v)} onRun={qq.type === 'coding' || qq.type === 'sql' ? run(qq.id) : undefined} disabled={submitting || timeUp} />
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg/95 px-4 py-2.5 backdrop-blur">
        <div className="min-w-0">
          <h1 className="truncate font-display text-[18px] font-semibold tracking-[-0.02em]">{d.assessment.title}</h1>
          <div className="text-[12px] text-subtle">
            Attempt {d.attempt.attemptNo}
            {d.accommodations.extraTimePercent ? ` · includes ${d.accommodations.extraTimePercent}% extra time` : ''}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {saveIndicator}
          {d.attempt.deadlineAt && <Countdown deadline={new Date(d.attempt.deadlineAt).getTime()} offset={offset} onExpire={onExpire} />}
          <Button variant="primary" icon={<PaperPlaneTiltIcon size={15} />} onClick={() => setConfirmOpen(true)} loading={submitting}>
            Submit
          </Button>
        </div>
      </div>

      {timeUp && (
        <Banner tone="warning" className="mb-4" title="Time is up">
          Submitting the answers saved so far.
        </Banner>
      )}
      {d.assessment.proctoringNote && (
        <Banner tone="info" className="mb-4">
          {d.assessment.proctoringNote}
        </Banner>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-5">
          {view === 'one' && cur ? (
            <>
              {renderItem(cur)}
              <div className="flex items-center justify-between">
                <Button icon={<CaretLeftIcon size={14} />} disabled={current === 0} disabledReason="This is the first question" onClick={() => setCurrent((c) => c - 1)}>
                  Previous
                </Button>
                {current < items.length - 1 ? (
                  <Button variant="primary" onClick={() => setCurrent((c) => c + 1)}>
                    Next <CaretRightIcon size={14} />
                  </Button>
                ) : (
                  <Button variant="primary" icon={<PaperPlaneTiltIcon size={15} />} onClick={() => setConfirmOpen(true)}>
                    Review and submit
                  </Button>
                )}
              </div>
            </>
          ) : (
            items.map(renderItem)
          )}
        </div>

        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <Segmented
            label="Layout"
            value={view}
            onChange={setView}
            options={[
              { value: 'one', label: 'One at a time' },
              { value: 'all', label: 'All questions' },
            ]}
          />
          <nav aria-label="Question navigator" className="rounded-lg border border-border bg-surface p-4 shadow-1">
            <div className="mb-2 flex items-center justify-between text-[12.5px] text-muted">
              <span>
                {items.length - unanswered.length}/{items.length} answered
              </span>
              {flaggedNums.length > 0 && <Badge tone="warning">{flaggedNums.length} flagged</Badge>}
            </div>
            <ol className="grid grid-cols-6 gap-1.5">
              {items.map((i) => {
                const qq = i.question!;
                const isA = answered(qq.id, qq);
                const isF = flagged.includes(qq.id);
                const isCur = view === 'one' && i.index === items[current]?.index;
                return (
                  <li key={qq.id}>
                    <button
                      type="button"
                      onClick={() => {
                        const pos = items.findIndex((x) => x.index === i.index);
                        setCurrent(pos);
                        if (view === 'all') document.getElementById(`q-${i.index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      aria-current={isCur ? 'step' : undefined}
                      aria-label={`Question ${i.index + 1}, ${isA ? 'answered' : 'not answered'}${isF ? ', flagged' : ''}`}
                      className={clsx(
                        'relative flex h-8 w-full items-center justify-center rounded-md border text-[12.5px] font-medium tabular-nums',
                        isA ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted hover:border-border-strong',
                        isCur && 'ring-2 ring-accent ring-offset-1 ring-offset-surface',
                      )}
                    >
                      {i.index + 1}
                      {isF && <FlagIcon size={10} weight="fill" className="absolute -right-1 -top-1 text-warning" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 space-y-1 text-[11.5px] text-subtle">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm border border-accent bg-accent-soft" aria-hidden /> Answered
              </div>
              <div className="flex items-center gap-1.5">
                <FlagIcon size={11} weight="fill" className="text-warning" aria-hidden /> Flagged for review
              </div>
            </div>
          </nav>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Submit your answers?"
        description={unanswered.length ? `You have ${unanswered.length} unanswered question${unanswered.length === 1 ? '' : 's'}.` : 'All questions have an answer.'}
        confirmLabel="Submit answers"
        loading={submitting}
        onConfirm={async () => {
          await submit();
          setConfirmOpen(false);
        }}
      >
        <div className="space-y-2 text-[13.5px]">
          {unanswered.length > 0 && <p>Unanswered: {unanswered.map((n) => `Q${n}`).join(', ')}</p>}
          {flaggedNums.length > 0 && <p>Flagged for review: {flaggedNums.map((n) => `Q${n}`).join(', ')}</p>}
          {pendingCount > 0 && (
            <p className="text-warning">
              {pendingCount} answer{pendingCount === 1 ? ' is' : 's are'} not saved yet. We will try to save before submitting.
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <CheckCircleIcon size={14} aria-hidden /> You cannot change answers after submitting.
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
