import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MicrophoneStageIcon, CheckCircleIcon, XCircleIcon, SparkleIcon, TimerIcon, TrashIcon, PlayIcon, CalendarCheckIcon, CaretRightIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { timeAgo, formatDateTime } from '@/lib/format';
import { PageHeader, Card, CardHeader, CardBody, CardAction, ErrorState, SkeletonRows, EmptyState, Button, Field, Textarea, Select, Tabs, Badge, Checkbox, Markdown, ConfirmDialog, Input } from '@/components/ui';
import { AiUnavailable, AiDraftLabel } from './components';
import { isAiFailure, type AiFailure, type BankQuestion, type Feedback, type FeedbackStats, type Mock, type Practice } from './api';

type QuestionsResponse = { kinds: { value: string; label: string }[]; questions: BankQuestion[]; codelab: BankQuestion[] };

function FeedbackList({ feedback, stats }: { feedback: Feedback; stats?: FeedbackStats }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">Checklist feedback (no AI)</Badge>
        {stats && (
          <span className="text-[12.5px] text-muted">
            {stats.words} words · about {Math.round(stats.speakingSeconds / 6) / 10} min spoken · {stats.fillerCount} filler word{stats.fillerCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <ul className="space-y-1">
        {feedback.items.map((i, n) => (
          <li key={n} className="flex items-start gap-2 text-[13.5px]">
            {i.met ? <CheckCircleIcon size={17} weight="fill" className="mt-0.5 shrink-0 text-success" aria-label="Met" /> : <XCircleIcon size={17} className="mt-0.5 shrink-0 text-warning" aria-label="Not met" />}
            <span>
              {i.label}
              {!i.met && i.note && <span className="block text-[12.5px] text-muted">{i.note}</span>}
            </span>
          </li>
        ))}
      </ul>
      {feedback.summary && <p className="text-[13px] text-muted">{feedback.summary}</p>}
    </div>
  );
}

function PracticePanel({ initialKind }: { initialKind: string }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState(initialKind);
  const [question, setQuestion] = useState<BankQuestion | null>(null);
  const [custom, setCustom] = useState('');
  const [answer, setAnswer] = useState('');
  const [rating, setRating] = useState('');
  const [live, setLive] = useState<{ feedback: Feedback; stats: FeedbackStats } | null>(null);
  const [saved, setSaved] = useState<{ practice: Practice; stats: FeedbackStats; modelAnswer: string | null } | null>(null);
  const [ai, setAi] = useState<{ strengths: string[]; improvements: string[]; summary: string } | null>(null);
  const [aiFailure, setAiFailure] = useState<AiFailure | null>(null);
  const q = useQuery({ queryKey: ['career', 'interview', 'questions', kind], queryFn: () => api.get<QuestionsResponse>(`/career/interview/questions?kind=${kind}`) });

  useEffect(() => {
    if (answer.trim().length < 15) return setLive(null);
    const t = setTimeout(() => {
      api.post<{ feedback: Feedback; stats: FeedbackStats }>('/career/interview/feedback-preview', { kind, answer }).then(setLive).catch(() => setLive(null));
    }, 600);
    return () => clearTimeout(t);
  }, [answer, kind]);

  const prompt = question?.prompt ?? custom;
  const save = useMutation({
    mutationFn: () => api.post<{ practice: Practice; stats: FeedbackStats; modelAnswer: string | null }>('/career/interview/practice', { kind, question: prompt, answer, selfRating: rating ? Number(rating) : undefined }),
    onSuccess: (r) => {
      setSaved(r);
      setAi(null);
      setAiFailure(null);
      qc.invalidateQueries({ queryKey: ['career', 'interview'] });
      toast.success('Answer saved with checklist feedback.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const aiFeedback = useMutation({
    mutationFn: () => api.post<AiFailure | { ok: true; feedback: { strengths: string[]; improvements: string[]; summary: string } }>(`/career/interview/practice/${saved!.practice.id}/ai-feedback`, {}),
    onSuccess: (r) => {
      if (isAiFailure(r)) setAiFailure(r);
      else {
        setAiFailure(null);
        setAi(r.feedback);
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const list = [...(q.data?.questions ?? []), ...(q.data?.codelab ?? [])];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="self-start">
        <CardBody className="space-y-4 pt-5">
          <Field label="Kind">
            <Select value={kind} onChange={(e) => { setKind(e.target.value); setQuestion(null); setSaved(null); }}>
              {(q.data?.kinds ?? [{ value: kind, label: kind }]).map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          {q.isLoading ? (
            <SkeletonRows rows={4} />
          ) : q.error ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : (
            <ul className="-mx-2 max-h-[55vh] space-y-0.5 overflow-y-auto">
              {list.map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => { setQuestion(x); setSaved(null); setAnswer(''); }} aria-pressed={question?.id === x.id} className={`w-full rounded-md px-2.5 py-2 text-left text-[13.5px] leading-snug transition-colors ${question?.id === x.id ? 'bg-accent-soft font-medium text-accent-text' : 'hover:bg-surface-2'}`}>
                    {x.prompt}
                    {x.difficulty && <span className="ml-1 text-[12px] text-subtle">· {x.difficulty}</span>}
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="text-[13px] text-muted">No questions for this kind yet. Write your own below.</li>}
            </ul>
          )}
          <Field label="Or practise your own question" optional className="border-t border-border pt-4">
            <Input value={custom} onChange={(e) => { setCustom(e.target.value); setQuestion(null); }} placeholder="Paste a question you expect" />
          </Field>
        </CardBody>
      </Card>
      <div className="space-y-4">
        {!prompt ? (
          <EmptyState icon={<MicrophoneStageIcon size={22} />} title="Pick a question" description="Choose a question on the left or write your own. You get structured checklist feedback instantly, without AI." />
        ) : (
          <>
            <Card>
              <CardHeader title={prompt} description={question?.guidance} action={question?.link && <CardAction to={question.link}>Solve in CodeLab</CardAction>} />
              <CardBody className="space-y-3">
                <Field label="Your answer" helper="Write it as you would say it. For coding and SQL, explain your approach, complexity and edge cases.">
                  <Textarea rows={9} value={answer} onChange={(e) => setAnswer(e.target.value)} />
                </Field>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="How did it feel?" optional className="w-44">
                    <Select value={rating} onChange={(e) => setRating(e.target.value)}>
                      <option value="">Skip</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} of 5
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button variant="primary" loading={save.isPending} disabled={!answer.trim()} disabledReason="Write an answer first" onClick={() => save.mutate()}>
                    Save and get feedback
                  </Button>
                </div>
                {live && !saved && (
                  <div className="rounded-md border border-dashed border-border p-3">
                    <div className="mb-1 text-[12px] font-medium text-subtle">Live check while you type</div>
                    <FeedbackList feedback={live.feedback} stats={live.stats} />
                  </div>
                )}
              </CardBody>
            </Card>
            {saved && (
              <Card>
                <CardHeader
                  title="Feedback"
                  action={
                    <Button size="sm" variant="soft" icon={<SparkleIcon size={14} />} loading={aiFeedback.isPending} onClick={() => aiFeedback.mutate()}>
                      Get AI feedback
                    </Button>
                  }
                />
                <CardBody className="space-y-4">
                  {saved.practice.feedback && <FeedbackList feedback={saved.practice.feedback} stats={saved.stats} />}
                  {aiFailure && <AiUnavailable failure={aiFailure} />}
                  {ai && (
                    <div className="space-y-2 rounded-md border border-border p-3">
                      <AiDraftLabel text="AI feedback: a second opinion, not a grade." />
                      {ai.strengths.length > 0 && (
                        <div>
                          <div className="text-[13px] font-semibold">Strengths</div>
                          <ul className="ml-4 list-disc text-[13.5px]">{ai.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </div>
                      )}
                      {ai.improvements.length > 0 && (
                        <div>
                          <div className="text-[13px] font-semibold">To improve</div>
                          <ul className="ml-4 list-disc text-[13.5px]">{ai.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </div>
                      )}
                      <p className="text-[13.5px] text-muted">{ai.summary}</p>
                    </div>
                  )}
                  {saved.modelAnswer && (
                    <details className="rounded-md border border-border p-3">
                      <summary className="cursor-pointer text-[13.5px] font-medium">Model answer for study</summary>
                      <p className="mt-1 text-[12px] text-subtle">General guidance on structure and content. Use your own real experience, not this text.</p>
                      <Markdown source={saved.modelAnswer} className="mt-2 text-[13.5px]" />
                    </details>
                  )}
                </CardBody>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function fmt(sec: number) {
  const s = Math.abs(sec);
  return `${sec < 0 ? '-' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function MockPanel() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['career', 'interview', 'mocks'], queryFn: () => api.get<{ items: Mock[] }>('/career/interview/mock') });
  const [kinds, setKinds] = useState<string[]>(['behavioral', 'technical']);
  const [count, setCount] = useState(4);
  const [minutes, setMinutes] = useState(3);
  const [active, setActive] = useState<Mock | null>(null);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [toDelete, setToDelete] = useState<Mock | null>(null);

  useEffect(() => {
    if (!active || active.status !== 'in_progress') return;
    setElapsed(0);
    timer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [active?.id, active?.status, idx]);

  const start = useMutation({
    mutationFn: () => api.post<{ mock: Mock }>('/career/interview/mock', { kinds, count, minutesPerQuestion: minutes }),
    onSuccess: (r) => {
      setActive(r.mock);
      setIdx(0);
      setAnswer('');
      qc.invalidateQueries({ queryKey: ['career', 'interview', 'mocks'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submit = useMutation({
    mutationFn: () => api.post<{ mock: Mock }>(`/career/interview/mock/${active!.id}/answer`, { questionId: active!.questions[idx].id, answer, durationSec: elapsed }),
    onSuccess: (r) => {
      setActive(r.mock);
      setAnswer('');
      if (idx + 1 < r.mock.questions.length) setIdx(idx + 1);
      else complete.mutate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const complete = useMutation({
    mutationFn: () => api.post<{ mock: Mock }>(`/career/interview/mock/${active!.id}/complete`, {}),
    onSuccess: (r) => {
      setActive(r.mock);
      qc.invalidateQueries({ queryKey: ['career'] });
      toast.success('Mock interview complete.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/career/interview/mock/${id}`),
    onSuccess: () => {
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ['career', 'interview', 'mocks'] });
      toast.success('Deleted.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (active && active.status === 'in_progress') {
    const q = active.questions[idx];
    const remaining = active.minutesPerQuestion * 60 - elapsed;
    return (
      <Card>
        <CardHeader
          title={`Question ${idx + 1} of ${active.questions.length}`}
          description={q.kind.replace('_', ' ')}
          action={
            <Badge tone={remaining < 0 ? 'danger' : remaining < 30 ? 'warning' : 'neutral'} icon={<TimerIcon size={12} />}>
              <span aria-live="off" className="tabular-nums">{remaining < 0 ? `Over by ${fmt(-remaining)}` : `${fmt(remaining)} left`}</span>
            </Badge>
          }
        />
        <CardBody className="space-y-3">
          <p className="text-[16px] font-medium">{q.prompt}</p>
          <Textarea aria-label="Your answer" rows={10} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer as you would say it. Keep going when the timer runs out; it only records the time." />
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => complete.mutate()} loading={complete.isPending}>
              End early
            </Button>
            <Button variant="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
              {idx + 1 < active.questions.length ? 'Submit and next' : 'Submit and finish'}
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {active?.status === 'completed' && active.summary && (
        <Card>
          <CardHeader title="Mock interview summary" description={active.summary.note} action={<Button size="sm" onClick={() => setActive(null)}>Close summary</Button>} />
          <CardBody className="space-y-3 text-[13.5px]">
            <div className="flex flex-wrap gap-4">
              <span>
                Answered <strong>{active.summary.answered}</strong> of {active.summary.total}
              </span>
              <span>
                Checklist average <strong>{active.summary.avgChecklist === null ? '-' : `${Math.round(active.summary.avgChecklist * 100)}%`}</strong>
              </span>
              <span>
                Over time on <strong>{active.summary.overTime}</strong>
              </span>
              <span>Total {fmt(active.summary.totalSeconds)}</span>
            </div>
            {active.summary.weakest.length > 0 && (
              <div>
                <div className="font-semibold">Most often missed</div>
                <ul className="ml-4 list-disc">{active.summary.weakest.map((w) => <li key={w.label}>{w.label} ({w.count})</li>)}</ul>
              </div>
            )}
            <ul className="space-y-1">
              {active.questions.map((q) => (
                <li key={q.id} className="flex justify-between gap-2 border-t border-border pt-1">
                  <span>{q.prompt}</span>
                  <span className="shrink-0 text-muted">{q.practiceId ? `${q.checklistMet}/${q.checklistTotal} · ${fmt(q.durationSec ?? 0)}` : 'Skipped'}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="self-start">
        <CardHeader title="Start a timed mock interview" description="A sequence of questions with a timer per question. Each answer gets checklist feedback and is saved to your history." />
        <CardBody className="space-y-3">
          <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['behavioral', 'Behavioral'],
              ['project', 'Project discussion'],
              ['technical', 'Technical concepts'],
              ['system_design', 'System design'],
              ['role', 'Role-specific'],
              ['sql', 'SQL'],
              ['dsa', 'Coding and DSA'],
              ['communication', 'Communication'],
            ].map(([v, l]) => (
              <Checkbox key={v} checked={kinds.includes(v)} onCheckedChange={(on) => setKinds((k) => (on ? [...k, v] : k.filter((x) => x !== v)))} label={l} />
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <Field label="Questions" className="w-32">
              <Select value={String(count)} onChange={(e) => setCount(Number(e.target.value))}>
                {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            <Field label="Minutes per question" className="w-44">
              <Select value={String(minutes)} onChange={(e) => setMinutes(Number(e.target.value))}>
                {[1, 2, 3, 5, 10, 15].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            <Button variant="primary" icon={<PlayIcon size={14} />} loading={start.isPending} disabled={!kinds.length} disabledReason="Pick at least one kind" onClick={() => start.mutate()}>
              Start mock interview
            </Button>
          </div>
        </CardBody>
      </Card>
      <Card className="self-start">
        <CardHeader title="Past mock interviews" />
        <CardBody>
          {list.isLoading ? (
            <SkeletonRows rows={2} />
          ) : list.error ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : !list.data?.items.length ? (
            <p className="text-[13.5px] text-muted">None yet. Finished and paused sessions appear here so you can review or resume them.</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.data.items.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 text-[13.5px] first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    {formatDateTime(m.startedAt)} · {m.questions.length} questions · {m.kinds.join(', ')}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={m.status === 'completed' ? 'success' : 'info'}>{m.status === 'completed' ? 'Completed' : 'In progress'}</Badge>
                    <Button size="sm" onClick={() => { setActive(m); setIdx(Math.max(0, m.questions.findIndex((q) => !q.practiceId))); }}>
                      {m.status === 'completed' ? 'View' : 'Resume'}
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Delete mock interview" icon={<TrashIcon size={14} />} onClick={() => setToDelete(m)} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      </div>
      <ConfirmDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)} title="Delete this mock interview?" description="The session is removed. Answers stay in your practice history." confirmLabel="Delete" danger loading={del.isPending} onConfirm={() => toDelete && del.mutate(toDelete.id)} />
    </div>
  );
}

function HistoryPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['career', 'interview', 'history'], queryFn: () => api.get<{ items: Practice[] }>('/career/interview/practice') });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/career/interview/practice/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['career', 'interview'] });
      toast.success('Deleted.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <SkeletonRows rows={4} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.items.length) return <EmptyState icon={<MicrophoneStageIcon size={22} />} title="No practice yet" description="Answers you save appear here with their feedback, so you can see progress over time." />;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
      {q.data.items.map((p) => {
        const met = p.feedback?.items.filter((i) => i.met).length ?? 0;
        const total = p.feedback?.items.length ?? 0;
        return (
          <li key={p.id}>
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 text-[13.5px] transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-start gap-2.5">
                  <CaretRightIcon size={14} weight="bold" className="mt-[3px] shrink-0 text-subtle transition-transform group-open:rotate-90" aria-hidden />
                  <span className="font-semibold">{p.question}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 pl-6 text-[12.5px] text-muted sm:pl-0">
                  <Badge className="capitalize">{p.kind.replace('_', ' ')}</Badge>
                  {total > 0 && <Badge tone={met / total >= 0.7 ? 'success' : 'warning'}>{met}/{total} checks</Badge>}
                  {timeAgo(p.createdAt)}
                </span>
              </summary>
              <div className="space-y-4 border-t border-border bg-surface-2/50 px-5 py-4 pl-11">
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{p.answer}</p>
                {p.feedback && <FeedbackList feedback={p.feedback} />}
                <Button size="sm" variant="ghost" className="-ml-3" icon={<TrashIcon size={14} />} onClick={() => del.mutate(p.id)}>
                  Delete
                </Button>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

type Plan = { perKind: { kind: string; label: string; attempts: number; avgChecklist: number | null; commonMisses: string[] }[]; weakSkills: { slug: string; name: string; state: string }[]; items: { day: number; kind: string; title: string; reason: string; link: string }[]; basis: string };

function PlanPanel() {
  const q = useQuery({ queryKey: ['career', 'interview', 'plan'], queryFn: () => api.get<Plan>('/career/interview/revision-plan') });
  if (q.isLoading) return <SkeletonRows rows={4} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="self-start">
        <CardHeader title="Your revision plan" description={q.data.basis} />
        <CardBody>
          {q.data.items.length === 0 ? (
            <p className="text-[13.5px] text-muted">Nothing urgent. Keep practising a question a day.</p>
          ) : (
            <ol className="-mt-1 divide-y divide-border">
              {q.data.items.map((i, n) => (
                <li key={n} className="flex items-start gap-3 py-3 last:pb-0">
                  <span className="w-[68px] shrink-0">
                    <Badge tone="accent" icon={<CalendarCheckIcon size={12} />}>Day {i.day}</Badge>
                  </span>
                  <div className="min-w-0">
                    <Link to={i.link} className="text-[13.5px] font-medium hover:underline">
                      {i.title}
                    </Link>
                    <div className="text-[12.5px] text-muted">{i.reason}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
      <Card className="self-start">
        <CardHeader title="Practice by kind" />
        <CardBody>
          <table className="w-full text-[13.5px]">
            <thead className="border-b border-border text-left text-[12px] text-subtle">
              <tr>
                <th className="pb-2 font-medium">Kind</th>
                <th className="pb-2 text-right font-medium">Attempts</th>
                <th className="pb-2 text-right font-medium">Average</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.data.perKind.map((k) => (
                <tr key={k.kind}>
                  <td className="py-2">{k.label}</td>
                  <td className="py-2 text-right tabular-nums">{k.attempts}</td>
                  <td className="py-2 text-right tabular-nums">{k.avgChecklist === null ? '-' : `${Math.round(k.avgChecklist * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

export default function InterviewPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'practice';
  const kind = params.get('kind') ?? 'behavioral';
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Interview prep" description="Practise behavioral, project, system design, technical, SQL and coding questions. Checklist feedback is instant and always available; AI feedback is optional." />
      <Tabs
        className="mb-5"
        value={tab}
        onValueChange={(v) => {
          const n = new URLSearchParams(params);
          n.set('tab', v);
          setParams(n, { replace: true });
        }}
        tabs={[
          { value: 'practice', label: 'Practice' },
          { value: 'mock', label: 'Mock interview' },
          { value: 'history', label: 'History' },
          { value: 'plan', label: 'Revision plan' },
        ]}
      />
      {tab === 'practice' && <PracticePanel initialKind={kind} />}
      {tab === 'mock' && <MockPanel />}
      {tab === 'history' && <HistoryPanel />}
      {tab === 'plan' && <PlanPanel />}
    </div>
  );
}
