import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CheckSquareOffsetIcon, SparkleIcon, CaretRightIcon, ArrowSquareOutIcon, WarningIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Banner, Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Field, Input, Markdown, PageHeader, ProvenanceTag, Segmented, SkeletonRows, Textarea, StatusBadge } from '@/components/ui';
import { CodeEditor } from './CodeEditor';
import { QUESTION_TYPE_LABEL, useAssessmentScope, type Answer, type AnswerKey, type Content, type QuestionType } from './types';

type QueueItem = {
  answerId: string;
  attemptId: string;
  attemptStatus: string;
  candidate: { userId: string; name: string; email: string };
  submittedAt: string | null;
  question: { id: string; type: QuestionType; title: string; prompt: string; content: Content; points: number; version: number; guidance: AnswerKey } | null;
  answer: Answer | null;
  maxPoints: number;
  autoScore: number | null;
  manualScore: number | null;
  finalScore: number | null;
  gradingMethod: string | null;
  gradingDetail: { reason?: string; needsReview?: boolean; passed?: number; total?: number; aiAssisted?: boolean } | null;
  feedback: string | null;
  aiProposal: { score: number; rationale: string; model: string; createdAt: string; accepted?: boolean } | null;
};

function ResponseView({ item }: { item: QueueItem }) {
  const a = item.answer;
  const t = item.question?.type;
  if (!a) return <p className="text-[13.5px] text-muted">No answer was submitted.</p>;
  if (t === 'coding') return <CodeEditor value={a.code ?? ''} language={a.language ?? 'python'} label="Candidate code" readOnly minHeight="120px" />;
  if (t === 'sql') return <CodeEditor value={a.query ?? ''} language="sql" label="Candidate query" readOnly minHeight="80px" />;
  if (t === 'file')
    return (
      <div className="space-y-2 text-[13.5px]">
        {a.link ? (
          <a href={a.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
            Open submitted link <ArrowSquareOutIcon size={13} aria-hidden />
          </a>
        ) : (
          <p className="text-muted">No link provided.</p>
        )}
        {a.text && <p className="whitespace-pre-wrap rounded-md bg-surface-2 px-4 py-3">{a.text}</p>}
      </div>
    );
  return <p className="whitespace-pre-wrap rounded-md bg-surface-2 px-4 py-3 text-[14px] leading-relaxed">{a.text || JSON.stringify(a)}</p>;
}

function GradeForm({ item, onDone, assessmentId }: { item: QueueItem; onDone: () => void; assessmentId: string }) {
  const qc = useQueryClient();
  const [score, setScore] = useState<string>(item.finalScore !== null ? String(item.finalScore) : '');
  const [feedback, setFeedback] = useState(item.feedback ?? '');
  const [reason, setReason] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [proposal, setProposal] = useState(item.aiProposal);
  const [aiNote, setAiNote] = useState<string | null>(null);
  useEffect(() => {
    setScore(item.finalScore !== null ? String(item.finalScore) : '');
    setFeedback(item.feedback ?? '');
    setReason('');
    setFields({});
    setProposal(item.aiProposal);
    setAiNote(null);
  }, [item.answerId, item.finalScore, item.feedback, item.aiProposal]);
  const overriding = item.finalScore !== null && score !== '' && Number(score) !== item.finalScore;
  const num = Number(score);
  const invalid = score === '' || Number.isNaN(num) || num < 0 || num > item.maxPoints;
  const onError = (e: unknown) => {
    if (e instanceof ApiError) setFields(e.fields);
    toast.error(errorMessage(e));
  };
  const onSaved = (r: { attemptStatus: string }) => {
    toast.success(r.attemptStatus === 'released' ? 'Saved. All answers graded and results released.' : r.attemptStatus === 'graded' ? 'Saved. Attempt fully graded and ready to release.' : 'Score saved.');
    qc.invalidateQueries({ queryKey: ['assessments', 'grading', assessmentId] });
    qc.invalidateQueries({ queryKey: ['assessments', 'manage-one', assessmentId] });
    qc.invalidateQueries({ queryKey: ['assessments', 'results', assessmentId] });
    onDone();
  };
  const save = useMutation({
    mutationFn: () => api.patch<{ attemptStatus: string }>(`/assessments/answers/${item.answerId}`, { manualScore: num, feedback: feedback || null, reason: reason || undefined }),
    onSuccess: onSaved,
    onError,
  });
  const accept = useMutation({
    mutationFn: () => api.post<{ attemptStatus: string }>(`/assessments/answers/${item.answerId}/accept-proposal`, { score: num, feedback: feedback || null, reason: reason || undefined }),
    onSuccess: onSaved,
    onError,
  });
  const ai = useMutation({
    mutationFn: () => api.post<{ proposal: QueueItem['aiProposal']; ai: { ok: boolean; reason?: string; message?: string } }>(`/assessments/answers/${item.answerId}/ai-proposal`),
    onSuccess: (r) => {
      if (r.proposal) {
        setProposal(r.proposal);
        setAiNote(null);
      } else setAiNote(r.ai.message ?? 'AI suggestions are unavailable.');
    },
    onError: (e) => setAiNote(errorMessage(e)),
  });
  const usingProposal = !!proposal && score !== '' && num === proposal.score;

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-surface-2 px-4 py-3.5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
            <SparkleIcon size={15} className="text-accent-text" aria-hidden /> AI suggestion: review before accepting <ProvenanceTag kind="ai" />
          </span>
          <Button size="sm" variant="soft" loading={ai.isPending} onClick={() => ai.mutate()}>
            {proposal ? 'Ask again' : 'Get AI suggestion'}
          </Button>
        </div>
        {aiNote && (
          <Banner tone="warning" className="mb-2">
            {aiNote} You can grade manually as usual.
          </Banner>
        )}
        {proposal ? (
          <div className="text-[13.5px]">
            <p>
              Suggested score <span className="font-semibold">{proposal.score}</span> / {item.maxPoints}
              <span className="text-subtle"> · {proposal.model}</span>
            </p>
            <p className="mt-1 text-muted">{proposal.rationale}</p>
            <Button size="sm" className="mt-2" onClick={() => setScore(String(proposal.score))}>
              Use this score as a starting point
            </Button>
            <p className="mt-2 text-[12px] text-subtle">The suggestion is a proposal only. Nothing counts until you save a score yourself.</p>
          </div>
        ) : (
          !aiNote && <p className="text-[12.5px] text-subtle">Optional. The AI reads the rubric, model answer and response and proposes a score with a reason.</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
        <Field label={`Score (0 to ${item.maxPoints})`} error={fields.manualScore ?? (score !== '' && invalid ? `Between 0 and ${item.maxPoints}` : undefined)}>
          <Input type="number" min={0} max={item.maxPoints} step={0.5} value={score} onChange={(e) => setScore(e.target.value)} />
        </Field>
        <Field label="Feedback for the candidate" optional>
          <Textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </Field>
      </div>
      {overriding && (
        <Field label="Reason for changing the score" error={fields.reason} helper="Required when overriding an existing score. Recorded in the audit log.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        {usingProposal ? (
          <Button variant="primary" loading={accept.isPending} disabled={invalid || (overriding && !reason.trim())} disabledReason={overriding && !reason.trim() ? 'Give a reason for the change' : 'Enter a valid score'} onClick={() => accept.mutate()}>
            Accept suggested score
          </Button>
        ) : (
          <Button variant="primary" loading={save.isPending} disabled={invalid || (overriding && !reason.trim())} disabledReason={overriding && !reason.trim() ? 'Give a reason for the change' : 'Enter a valid score'} onClick={() => save.mutate()}>
            Save score
          </Button>
        )}
      </div>
    </div>
  );
}

/** Answers that need a human score (written, file, oral, and code that could not be run). */
export function GradingQueue({ assessmentId }: { assessmentId: string }) {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['assessments', 'grading', assessmentId, filter], queryFn: () => api.get<{ items: QueueItem[] }>(`/assessments/${assessmentId}/grading-queue?status=${filter}`) });
  const items = q.data?.items ?? [];
  const current = items.find((i) => i.answerId === selected) ?? items[0] ?? null;
  const goNext = () => {
    const idx = items.findIndex((i) => i.answerId === current?.answerId);
    setSelected(items[idx + 1]?.answerId ?? null);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Show"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setSelected(null);
          }}
          options={[
            { value: 'pending', label: 'Needs a score' },
            { value: 'all', label: 'All answers (moderation)' },
          ]}
        />
        {q.data && <span className="text-[13px] tabular-nums text-muted">{items.length === 1 ? '1 answer' : `${items.length} answers`}</span>}
      </div>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <SkeletonRows rows={5} />
      ) : !items.length ? (
        <EmptyState icon={<CheckSquareOffsetIcon size={22} />} title={filter === 'pending' ? 'Nothing to grade' : 'No submitted answers yet'} description={filter === 'pending' ? 'Every submitted answer has a score. New written answers appear here as candidates submit.' : 'Answers appear here after candidates submit.'} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
          <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface shadow-1 lg:sticky lg:top-4" aria-label="Answers to grade">
            {items.map((i) => (
              <li key={i.answerId}>
                <button
                  type="button"
                  onClick={() => setSelected(i.answerId)}
                  aria-current={current?.answerId === i.answerId ? 'true' : undefined}
                  className={clsx(
                    'relative w-full px-4 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-offset-[-2px]',
                    current?.answerId === i.answerId && 'bg-accent-soft/60 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-accent hover:bg-accent-soft/60',
                  )}
                >
                  <div className="truncate text-[13.5px] font-medium">{i.candidate.name}</div>
                  <div className="truncate text-[12.5px] text-muted">{i.question?.title ?? 'Removed question'}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[12px] tabular-nums text-subtle">
                    {i.finalScore !== null ? `${i.finalScore}/${i.maxPoints}` : 'Not scored'}
                    {i.gradingDetail?.needsReview && i.question?.type === 'coding' && <Badge tone="warning">Could not run</Badge>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {current && (
            <Card>
              <CardHeader
                title={current.question?.title ?? 'Removed question'}
                description={
                  <>
                    {current.candidate.name} · {current.candidate.email} · submitted {formatDateTime(current.submittedAt)}
                  </>
                }
                action={
                  <>
                    {current.question && <Badge>{QUESTION_TYPE_LABEL[current.question.type]}</Badge>}
                    <StatusBadge status={current.attemptStatus} />
                  </>
                }
              />
              <CardBody className="space-y-5">
                {current.gradingDetail?.reason && (
                  <Banner tone="warning" title="Why this needs a reviewer">
                    {current.gradingDetail.reason}
                  </Banner>
                )}
                {current.question && <Markdown source={current.question.prompt} className="text-[14px]" />}
                <div>
                  <div className="mb-1.5 text-[12.5px] font-medium text-muted">Response</div>
                  <ResponseView item={current} />
                </div>
                {current.question && (current.question.guidance.rubric?.length || current.question.guidance.modelAnswer) ? (
                  <details className="rounded-md bg-surface-2 px-4 py-3 text-[13.5px]" open>
                    <summary className="cursor-pointer font-medium">Rubric and model answer</summary>
                    {current.question.guidance.rubric?.length ? (
                      <ul className="mt-2.5 space-y-1.5">
                        {current.question.guidance.rubric.map((r, i) => (
                          <li key={i}>
                            <span className="font-medium">{r.points} pts</span> · {r.criterion}
                            {r.guidance && <span className="text-muted"> ({r.guidance})</span>}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {current.question.guidance.modelAnswer && <pre className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-surface px-3 py-2.5 font-sans text-[13px]">{current.question.guidance.modelAnswer}</pre>}
                  </details>
                ) : (
                  <p className="inline-flex items-center gap-1 text-[12.5px] text-subtle">
                    <WarningIcon size={13} aria-hidden /> No rubric on this question. Add one in the question bank for consistent grading.
                  </p>
                )}
                {current.attemptStatus === 'released' && current.finalScore !== null && <Banner tone="info">Results for this attempt are already released. Changing the score notifies the candidate.</Banner>}
                <GradeForm item={current} onDone={goNext} assessmentId={assessmentId} />
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default function GradingQueuePage() {
  const { id = '' } = useParams();
  const scope = useAssessmentScope();
  const a = useQuery({ queryKey: ['assessments', 'manage-one', id], queryFn: () => api.get<{ assessment: { title: string } }>(`/assessments/${id}`) });
  return (
    <div>
      <PageHeader
        breadcrumb={
          <nav className="flex min-w-0 items-center gap-1" aria-label="Breadcrumb">
            <Link to={`${scope.basePath}/assessments`} className="shrink-0 hover:text-fg">
              Assessments
            </Link>
            <CaretRightIcon size={12} className="shrink-0" aria-hidden />
            <Link to={`${scope.basePath}/assessments/${id}`} className="truncate hover:text-fg">
              {a.data?.assessment.title ?? 'Assessment'}
            </Link>
            <CaretRightIcon size={12} className="shrink-0" aria-hidden />
            <span className="shrink-0 text-fg">Grading</span>
          </nav>
        }
        title="Grading queue" description="Score written, file and oral answers, and code that could not be run automatically. Overriding a score needs a reason and is audited." />
      {a.error ? <ErrorState error={a.error} onRetry={() => a.refetch()} /> : <GradingQueue assessmentId={id} />}
    </div>
  );
}
