import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ChartBarIcon, CheckCircleIcon, DownloadSimpleIcon, EyeIcon, PaperPlaneTiltIcon, CaretRightIcon, ScalesIcon, TargetIcon, UsersIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDateTime, pct } from '@/lib/format';
import { Badge, Banner, Button, buttonClass, Card, CardBody, CardHeader, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, Segmented, Select, SkeletonRows, StatTile, StatusBadge, Tabs, Textarea } from '@/components/ui';
import { QUESTION_TYPE_LABEL, useAssessmentScope, type Answer, type QuestionType } from './types';

type Results = {
  assessment: { id: string; title: string; mode: string; status: string; resultRelease: string };
  summary: { invited: number; started: number; submitted: number; completionRate: number | null; needsReview: number; awaitingRelease: number; released: number; mean: number | null; median: number | null; passRate: number | null; passingScore: number | null };
  histogram: { label: string; from: number; to: number; count: number }[];
  perQuestion: { questionId: string; title: string; type: QuestionType; difficulty: string; attempts: number; averageRatio: number | null; discrimination: number | null; manuallyGraded: number }[];
  candidates: { userId: string; name: string; email: string; inviteStatus: string | null; accommodations: { extraTimePercent?: number; note?: string }; attempts: number; bestAttemptId: string | null; status: string; score: number | null; maxScore: number | null; percent: number | null; passed: boolean | null; submittedAt: string | null }[];
};

type Regrade = {
  id: string;
  status: string;
  reason: string;
  previousScore: number | null;
  newScore: number | null;
  resolutionNote: string | null;
  createdAt: string;
  candidate: { name: string; email: string };
  questionTitle: string | null;
  currentScore: number | null;
  maxPoints: number;
  answer: Answer | null;
  feedback: string | null;
};

function Histogram({ data, empty }: { data: Results['histogram']; empty?: boolean }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <Card>
      <CardHeader
        title="Score distribution (best attempt per candidate)"
        description="Number of candidates in each score range."
        action={!empty && <Segmented label="Histogram view" value={view} onChange={setView} options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]} />}
      />
      {empty ? (
        <EmptyState inline className="border-t border-border" icon={<ChartBarIcon size={22} />} title="No results yet" description="The distribution appears once candidates submit and are graded." />
      ) : (
        <CardBody>
          {view === 'chart' ? (
            <div className="h-60" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} />
                  <RTooltip cursor={{ fill: 'var(--color-surface-2)' }} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="count" name="Candidates" fill="var(--color-accent)" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          <div className={view === 'chart' ? 'sr-only' : 'overflow-hidden rounded-lg border border-border'}>
            <table className="w-full text-left text-[13.5px]">
              <caption className="sr-only">Number of candidates per score range</caption>
              <thead className="border-b border-border bg-surface-2 text-[12.5px] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Score range</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Candidates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((b) => (
                  <tr key={b.label}>
                    <td className="px-4 py-2.5">{b.label}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{b.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      )}
    </Card>
  );
}

const answerText = (a: Answer) => a.text ?? a.code ?? a.query ?? a.link ?? JSON.stringify(a);

function AttemptReviewDialog({ attemptId, onOpenChange }: { attemptId: string | null; onOpenChange: (v: boolean) => void }) {
  const q = useQuery({
    queryKey: ['assessments', 'review', attemptId],
    queryFn: () =>
      api.get<{
        candidate: { name?: string; email?: string };
        attempt: { status: string; score: number | null; maxScore: number | null; autoSubmitted: boolean; submittedAt: string | null };
        accommodations: { extraTimePercent?: number };
        items: { index: number; points: number; question: { title: string; type: QuestionType; content: { prompt: string } } | null; answer: { answer: Answer | null; finalScore: number | null; gradingMethod: string | null; feedback: string | null } | null }[];
      }>(`/assessments/attempts/${attemptId}/review`),
    enabled: !!attemptId,
  });
  return (
    <Dialog open={!!attemptId} onOpenChange={onOpenChange} title={q.data ? `Attempt by ${q.data.candidate.name}` : 'Attempt'} size="lg">
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <StatusBadge status={q.data.attempt.status} />
            <span className="font-medium tabular-nums">
              Score {q.data.attempt.score ?? 'n/a'} / {q.data.attempt.maxScore ?? 'n/a'}
            </span>
            {q.data.attempt.autoSubmitted && <Badge tone="warning">Auto-submitted at time limit</Badge>}
            {q.data.accommodations.extraTimePercent ? <Badge>{q.data.accommodations.extraTimePercent}% extra time</Badge> : null}
          </div>
          <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {q.data.items.map((it) => (
              <li key={it.index} className="px-4 py-3.5 text-[13.5px]">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium">
                    Q{it.index + 1}. {it.question?.title}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {it.answer?.finalScore != null ? (
                      <>
                        <span className="font-medium text-fg">{it.answer.finalScore}</span> / {it.points}
                      </>
                    ) : (
                      `Not scored · ${it.points} ${it.points === 1 ? 'pt' : 'pts'}`
                    )}
                  </span>
                </div>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 px-3 py-2 font-mono text-[12px]">{it.answer?.answer ? answerText(it.answer.answer) : 'No answer'}</pre>
                {it.answer?.feedback && <p className="mt-2 text-muted">Feedback: {it.answer.feedback}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Dialog>
  );
}

function ResolveDialog({ r, onOpenChange, assessmentId }: { r: Regrade | null; onOpenChange: (v: boolean) => void; assessmentId: string }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'upheld' | 'adjusted' | 'rejected'>('upheld');
  const [newScore, setNewScore] = useState('');
  const [note, setNote] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => api.patch(`/assessments/regrades/${r!.id}`, { status, note, newScore: status === 'adjusted' ? Number(newScore) : undefined }),
    onSuccess: () => {
      toast.success('Regrade resolved. The candidate was notified.');
      qc.invalidateQueries({ queryKey: ['assessments', 'regrades', assessmentId] });
      qc.invalidateQueries({ queryKey: ['assessments', 'results', assessmentId] });
      onOpenChange(false);
      setNote('');
      setNewScore('');
    },
    onError: (e) => {
      if (e instanceof ApiError) setFields(e.fields);
      toast.error(errorMessage(e));
    },
  });
  return (
    <Dialog
      open={!!r}
      onOpenChange={onOpenChange}
      title="Resolve regrade request"
      description={r ? `${r.candidate.name} · ${r.questionTitle ?? ''} · current score ${r.currentScore ?? 'n/a'} / ${r.maxPoints}` : undefined}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={note.trim().length < 3 || (status === 'adjusted' && newScore === '')} disabledReason={note.trim().length < 3 ? 'Write a note for the candidate' : 'Enter the new score'} onClick={() => m.mutate()}>
            Resolve
          </Button>
        </>
      }
    >
      {r && (
        <div className="space-y-4">
          <div className="rounded-md bg-surface-2 px-4 py-3 text-[13.5px]">
            <div className="mb-0.5 text-[12px] font-medium text-muted">Candidate's reason</div>
            <p className="whitespace-pre-wrap">{r.reason}</p>
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border px-3 py-2 font-mono text-[12px]">{r.answer ? (r.answer.text ?? r.answer.code ?? r.answer.query ?? JSON.stringify(r.answer)) : 'No answer'}</pre>
          <Field label="Decision">
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="upheld">Uphold the original score</option>
              <option value="adjusted">Adjust the score</option>
              <option value="rejected">Reject the request</option>
            </Select>
          </Field>
          {status === 'adjusted' && (
            <Field label={`New score (0 to ${r.maxPoints})`} error={fields.newScore}>
              <Input type="number" min={0} max={r.maxPoints} step={0.5} value={newScore} onChange={(e) => setNewScore(e.target.value)} />
            </Field>
          )}
          <Field label="Note for the candidate" error={fields.note}>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

function Regrades({ assessmentId }: { assessmentId: string }) {
  const [resolving, setResolving] = useState<Regrade | null>(null);
  const q = useQuery({ queryKey: ['assessments', 'regrades', assessmentId], queryFn: () => api.get<{ items: Regrade[] }>(`/assessments/${assessmentId}/regrades`), retry: false });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <SkeletonRows rows={3} />;
  if (!q.data.items.length) return <EmptyState icon={<ScalesIcon size={22} />} title="No regrade requests" description="When candidates ask for a regrade on a released answer, the request appears here." />;
  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
        {q.data.items.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
                <span className="font-medium">{r.candidate.name}</span>
                <span className="text-muted">{r.questionTitle}</span>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] text-muted">{r.reason}</p>
              <p className="mt-0.5 text-[12.5px] tabular-nums text-subtle">
                {formatDateTime(r.createdAt)} · score {r.previousScore ?? 'n/a'}
                {r.newScore !== null && r.status === 'adjusted' ? ` → ${r.newScore}` : ''} / {r.maxPoints}
              </p>
            </div>
            {r.status === 'open' && (
              <Button size="sm" variant="primary" onClick={() => setResolving(r)}>
                Resolve
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ResolveDialog r={resolving} onOpenChange={(v) => !v && setResolving(null)} assessmentId={assessmentId} />
    </>
  );
}

/** Summary, distribution, per-question and per-candidate results with CSV export and release. */
export function AssessmentResults({ assessmentId, canEdit = true, initialTab = 'summary' }: { assessmentId: string; canEdit?: boolean; initialTab?: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState(initialTab);
  const [review, setReview] = useState<string | null>(null);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const q = useQuery({ queryKey: ['assessments', 'results', assessmentId], queryFn: () => api.get<Results>(`/assessments/${assessmentId}/results`) });
  const release = useMutation({
    mutationFn: (attemptIds?: string[]) => api.post<{ released: number }>(`/assessments/${assessmentId}/release`, { attemptIds }),
    onSuccess: (r) => {
      toast.success(r.released ? `Released ${r.released} result${r.released === 1 ? '' : 's'}. Candidates were notified.` : 'Nothing to release.');
      setConfirmRelease(false);
      qc.invalidateQueries({ queryKey: ['assessments'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <SkeletonRows rows={6} />;
  const d = q.data;
  const s = d.summary;
  return (
    <div>
      <div className="mb-6 flex flex-col-reverse gap-3 border-b border-border sm:flex-row sm:items-end sm:justify-between">
        <Tabs
          className="-mb-px min-w-0"
          value={tab}
          onValueChange={setTab}
          tabs={[
            { value: 'summary', label: 'Summary' },
            { value: 'questions', label: 'Questions', count: d.perQuestion.length },
            { value: 'candidates', label: 'Candidates', count: d.candidates.length },
            ...(canEdit ? [{ value: 'regrades', label: 'Regrade requests' }] : []),
          ]}
        />
        <div className="flex flex-wrap gap-2 sm:pb-2">
          <a href={`/api/assessments/${assessmentId}/results.csv`} className={buttonClass('secondary', 'md')} download>
            <DownloadSimpleIcon size={15} aria-hidden /> Export CSV
          </a>
          {canEdit && (
            <Button variant="primary" icon={<PaperPlaneTiltIcon size={15} />} disabled={!s.awaitingRelease} disabledReason="No graded results are waiting for release" onClick={() => setConfirmRelease(true)}>
              Release results{s.awaitingRelease ? ` (${s.awaitingRelease})` : ''}
            </Button>
          )}
        </div>
      </div>

      {tab === 'summary' && (
        <div className="space-y-6">
          {s.needsReview > 0 && (
            <Banner tone="warning" title={`${s.needsReview} attempt${s.needsReview === 1 ? '' : 's'} need grading`}>
              Scores and release wait until every answer has a score.
            </Banner>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Submitted" value={s.submitted} hint={`${s.started} started${s.invited ? ` · ${s.invited} invited` : ''}`} icon={<UsersIcon size={16} />} tone="accent" />
            <StatTile label="Completion rate" value={pct(s.completionRate)} hint={s.awaitingRelease ? `${s.awaitingRelease} waiting for release` : `${s.released} released`} icon={<CheckCircleIcon size={16} />} tone="success" />
            <StatTile label="Average score" value={s.mean !== null ? `${s.mean}%` : 'n/a'} hint={s.median !== null ? `Median ${s.median}%, best attempt each` : 'Best attempt per candidate'} icon={<ChartBarIcon size={16} />} />
            <StatTile label="Pass rate" value={s.passingScore !== null ? pct(s.passRate) : 'n/a'} hint={s.passingScore !== null ? `Pass mark ${s.passingScore}%` : 'No pass mark set'} icon={<TargetIcon size={16} />} tone={s.passingScore !== null ? 'success' : undefined} />
          </div>
          <Histogram data={d.histogram} empty={!s.submitted} />
        </div>
      )}

      {tab === 'questions' &&
        (d.perQuestion.length ? (
          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13.5px]">
              <thead className="border-b border-border bg-surface-2 text-[12.5px] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Question</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Answers</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Average score</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium" title="Top 27% minus bottom 27% average score. Near 0 or negative means the question does not separate strong from weak candidates.">
                    Discrimination
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Hand graded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.perQuestion.map((p) => (
                  <tr key={p.questionId} className="transition-colors hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.title}</div>
                      <div className="mt-0.5 text-[12.5px] text-subtle">
                        {QUESTION_TYPE_LABEL[p.type]} · <span className="capitalize">{p.difficulty}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.attempts}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{pct(p.averageRatio)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.discrimination === null ? <span className="text-subtle">Needs 4+ attempts</span> : <span className={p.discrimination < 0.1 ? 'text-warning' : undefined}>{p.discrimination.toFixed(2)}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.manuallyGraded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="border-t border-border bg-surface-2 px-4 py-3 text-[12.5px] text-subtle">Discrimination is a simple estimate (upper minus lower group). Treat it as a prompt to review a question, not a verdict.</p>
          </div>
        ) : (
          <EmptyState icon={<ChartBarIcon size={22} />} title="No graded answers yet" description="Per-question statistics appear after attempts are graded." />
        ))}

      {tab === 'candidates' &&
        (d.candidates.length ? (
          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13.5px]">
              <thead className="border-b border-border bg-surface-2 text-[12.5px] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Candidate</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Best score</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Attempts</th>
                  <th scope="col" className="px-4 py-3 font-medium">Submitted</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.candidates.map((c) => (
                  <tr key={c.userId} className="transition-colors hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.name}</div>
                      <div className="mt-0.5 text-[12.5px] text-subtle">
                        {c.email}
                        {c.accommodations.extraTimePercent ? ` · ${c.accommodations.extraTimePercent}% extra time` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <div className="flex flex-wrap items-center gap-2">
                        {c.percent !== null ? <span className="font-medium">{c.percent}%</span> : <span className="text-subtle">Not scored</span>}
                        {c.passed !== null && <Badge tone={c.passed ? 'success' : 'warning'}>{c.passed ? 'Pass' : 'Below pass mark'}</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.attempts}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{c.submittedAt ? formatDateTime(c.submittedAt) : <span className="text-subtle">Not submitted</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {c.bestAttemptId && (
                          <Button size="sm" variant="ghost" icon={<EyeIcon size={14} />} onClick={() => setReview(c.bestAttemptId)}>
                            View
                          </Button>
                        )}
                        {canEdit && c.status === 'graded' && c.bestAttemptId && (
                          <Button size="sm" onClick={() => release.mutate([c.bestAttemptId!])} loading={release.isPending}>
                            Release
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        ) : (
          <EmptyState icon={<UsersIcon size={22} />} title="No candidates yet" description="Invite people or assign a cohort. Candidates appear here once invited or once they start." />
        ))}

      {tab === 'regrades' && canEdit && <Regrades assessmentId={assessmentId} />}

      <AttemptReviewDialog attemptId={review} onOpenChange={(v) => !v && setReview(null)} />
      <ConfirmDialog
        open={confirmRelease}
        onOpenChange={setConfirmRelease}
        title="Release results?"
        description={`${s.awaitingRelease} candidate${s.awaitingRelease === 1 ? '' : 's'} will see their scores${d.assessment.resultRelease === 'manual' ? '' : ' now'} and get a notification. Released results also become Skill DNA evidence. This cannot be undone.`}
        confirmLabel="Release results"
        loading={release.isPending}
        onConfirm={() => release.mutate(undefined)}
      />
    </div>
  );
}

export default function ResultsPage() {
  const { id = '' } = useParams();
  const scope = useAssessmentScope();
  return (
    <div>
      <PageHeader
        breadcrumb={
          <nav className="flex items-center gap-1" aria-label="Breadcrumb">
            <Link to={`${scope.basePath}/assessments`} className="hover:text-fg">
              Assessments
            </Link>
            <CaretRightIcon size={12} aria-hidden />
            <Link to={`${scope.basePath}/assessments/${id}`} className="hover:text-fg">
              Assessment
            </Link>
            <CaretRightIcon size={12} aria-hidden />
            <span className="text-fg">Results</span>
          </nav>
        }
        title="Results"
      />
      <AssessmentResults assessmentId={id} />
    </div>
  );
}
