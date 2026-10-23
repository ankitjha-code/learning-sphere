import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CaretRightIcon, CheckCircleIcon, XCircleIcon, MinusCircleIcon, HourglassIcon, ChatCircleTextIcon, ArrowSquareOutIcon, DnaIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { PageHeader, Section, Badge, Banner, Button, ButtonLink, Card, CardBody, CardHeader, Dialog, ErrorState, Field, Markdown, ProvenanceTag, Skeleton, StatTile, StatusBadge, Textarea, Progress } from '@/components/ui';
import { ObjectiveQuestion } from '@/components/questions/ObjectiveQuestion';
import type { TakeQuestion } from '@/components/assessments/AnswerInput';
import { CodeEditor } from '@/components/assessments/CodeEditor';
import { MODE_LABEL, type Answer, type AssessmentMode } from '@/components/assessments/types';

type ResultItem = {
  index: number;
  answerId: string | null;
  question: TakeQuestion | null;
  answer: Answer | null;
  score: number | null;
  maxPoints: number;
  correct: boolean;
  gradingMethod: string | null;
  feedback: string | null;
  detail: { needsReview?: boolean; reason?: string; passed?: number; total?: number; results?: { name: string; hidden: boolean; passed: boolean; status: string }[]; message?: string; aiAssisted?: boolean } | null;
  correctAnswer?: unknown;
  explanation?: string | null;
  regrade: { id: string; status: string; reason: string; previousScore: number | null; newScore: number | null; resolutionNote: string | null; createdAt: string; resolvedAt: string | null } | null;
};

type Released = {
  released: true;
  attempt: { id: string; attemptNo: number; status: string; startedAt: string; submittedAt: string | null; releasedAt: string | null; autoSubmitted: boolean };
  assessment: { id: string; title: string; mode: AssessmentMode; passingScore: number | null; allowRegradeRequests: boolean; showAnswersAfterRelease: boolean };
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean | null;
  items: ResultItem[];
  skills: { skillId: string; slug: string; name: string; ratio: number }[];
};
type Pending = { released: false; status: string; message: string; attempt: { id: string; status: string; submittedAt: string | null; autoSubmitted: boolean }; assessment: { id: string; title: string; mode: AssessmentMode } };

const METHOD_LABEL: Record<string, string> = { deterministic: 'Auto-graded', execution: 'Graded by running tests', manual: 'Reviewer graded', pending: 'Awaiting review' };

function RegradeDialog({ item, open, onOpenChange, attemptId }: { item: ResultItem; open: boolean; onOpenChange: (v: boolean) => void; attemptId: string }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const m = useMutation({
    mutationFn: () => api.post(`/assessments/answers/${item.answerId}/regrade`, { reason }),
    onSuccess: () => {
      toast.success('Regrade requested. You will be notified when it is reviewed.');
      onOpenChange(false);
      setReason('');
      qc.invalidateQueries({ queryKey: ['assessments', 'result', attemptId] });
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.fields.reason : undefined);
      toast.error(errorMessage(e));
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Request a regrade for question ${item.index + 1}`}
      description="Explain specifically why you think the score is wrong. A reviewer will look at your answer again and reply."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={reason.trim().length < 10} disabledReason="Write at least 10 characters" onClick={() => m.mutate()}>
            Send request
          </Button>
        </>
      }
    >
      <Field label="Reason" error={error} helper="For example: which part of the rubric your answer meets.">
        <Textarea rows={5} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
      </Field>
    </Dialog>
  );
}

function ItemResult({ item, d }: { item: ResultItem; d: Released }) {
  const [regradeOpen, setRegradeOpen] = useState(false);
  const q = item.question;
  if (!q) return null;
  const partial = item.score !== null && item.score > 0 && item.score < item.maxPoints;
  const Icon = item.score === null ? HourglassIcon : item.correct ? CheckCircleIcon : partial ? MinusCircleIcon : XCircleIcon;
  const tone = item.score === null ? 'text-muted' : item.correct ? 'text-success' : partial ? 'text-warning' : 'text-danger';
  const objective = ['single', 'multi', 'true_false', 'matching', 'fill_blank', 'short_text', 'long_text'].includes(q.type);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-3">
        <div className="flex min-w-0 items-center gap-2 text-[13.5px]">
          <Icon size={18} weight="fill" className={clsx('shrink-0', tone)} aria-hidden />
          <span className="font-semibold">Question {item.index + 1}</span>
          <span className="truncate text-muted">{q.title}</span>
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          {item.gradingMethod && <Badge>{METHOD_LABEL[item.gradingMethod] ?? item.gradingMethod}</Badge>}
          {item.detail?.aiAssisted && <Badge tone="info">Reviewer used an AI suggestion</Badge>}
          <span className="font-semibold tabular-nums">
            {item.score ?? '?'} / {item.maxPoints}
          </span>
        </div>
      </div>
      <CardBody className="pt-4">
        {objective ? (
          // The question renders its own bordered panel; flatten it so there is no card inside the card (the header icon carries correctness).
          <div className="[&>fieldset]:rounded-none [&>fieldset]:border-0 [&>fieldset]:bg-transparent [&>fieldset]:p-0">
          <ObjectiveQuestion
            q={q}
            value={item.answer ?? undefined}
            onChange={() => {}}
            disabled
            result={d.assessment.showAnswersAfterRelease ? { correct: item.correct, score: item.score, max: item.maxPoints, correctAnswer: item.correctAnswer, explanation: item.explanation } : undefined}
          />
          </div>
        ) : (
          <div className="space-y-2">
            <Markdown source={q.content.prompt} className="text-[14px]" />
            {q.type === 'coding' && item.answer?.code && <CodeEditor value={item.answer.code} language={item.answer.language ?? 'python'} label="Your code" readOnly minHeight="80px" />}
            {q.type === 'sql' && item.answer?.query && <CodeEditor value={item.answer.query} language="sql" label="Your query" readOnly minHeight="60px" />}
            {q.type === 'file' && item.answer?.link && (
              <a href={item.answer.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-accent-text hover:underline">
                Your file link <ArrowSquareOutIcon size={13} aria-hidden />
              </a>
            )}
            {(q.type === 'oral' || q.type === 'file') && item.answer?.text && <p className="whitespace-pre-wrap rounded-md bg-surface-2 p-2 text-[13.5px]">{item.answer.text}</p>}
            {!item.answer && <p className="text-[13.5px] text-muted">No answer submitted.</p>}
            {item.detail?.total !== undefined && (
              <div className="text-[13px]">
                <span className="font-medium">
                  {item.detail.passed}/{item.detail.total} tests passed
                </span>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {(item.detail.results ?? []).map((t, i) => (
                    <li key={i}>
                      <Badge tone={t.passed ? 'success' : 'danger'}>
                        {t.hidden ? `Hidden test ${i + 1}` : t.name}: {t.passed ? 'passed' : t.status.replace(/_/g, ' ')}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {item.detail?.message && q.type === 'sql' && <p className="text-[13px] text-muted">{item.detail.message}</p>}
            {d.assessment.showAnswersAfterRelease && item.explanation && (
              <div className="rounded-md bg-surface-2 px-3 py-2 text-[13.5px]">
                <span className="font-semibold">Explanation: </span>
                <Markdown source={item.explanation} className="inline [&_p]:inline" />
              </div>
            )}
          </div>
        )}
        {item.feedback && (
          <div className="mt-3 rounded-md border border-border px-3 py-2 text-[13.5px]">
            <div className="mb-0.5 flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
              <ChatCircleTextIcon size={14} aria-hidden /> Reviewer feedback
            </div>
            <p className="whitespace-pre-wrap">{item.feedback}</p>
          </div>
        )}
        {item.regrade ? (
          <div className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-[13px]">
            <div className="flex items-center gap-2">
              <span className="font-medium">Regrade request</span>
              <StatusBadge status={item.regrade.status} />
            </div>
            {item.regrade.resolutionNote && <p className="mt-1">{item.regrade.resolutionNote}</p>}
            {item.regrade.status === 'adjusted' && (
              <p className="mt-1 text-muted">
                Score changed from {item.regrade.previousScore ?? 'ungraded'} to {item.regrade.newScore}.
              </p>
            )}
          </div>
        ) : (
          d.assessment.allowRegradeRequests &&
          item.answerId && (
            <div className="mt-3">
              <Button size="sm" variant="ghost" onClick={() => setRegradeOpen(true)}>
                Request a regrade
              </Button>
              <RegradeDialog item={item} open={regradeOpen} onOpenChange={setRegradeOpen} attemptId={d.attempt.id} />
            </div>
          )
        )}
      </CardBody>
    </Card>
  );
}

export default function ResultPage() {
  const { attemptId = '' } = useParams();
  const q = useQuery({
    queryKey: ['assessments', 'result', attemptId],
    queryFn: () => api.get<Released | Pending>(`/assessments/attempts/${attemptId}/result`),
    // Poll briefly while grading runs in the background.
    refetchInterval: (query) => {
      const data = query.state.data as Released | Pending | undefined;
      return data && !data.released && (data.status === 'submitted' || data.status === 'grading') ? 2500 : false;
    },
  });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-[480px]" />;
  const d = q.data!;
  const crumbs = (
    <nav className="flex items-center gap-1" aria-label="Breadcrumb">
      <Link to="/app/assessments" className="hover:text-fg">
        Assessments
      </Link>
      <CaretRightIcon size={12} aria-hidden />
      <Link to={`/app/assessments/${d.assessment.id}`} className="truncate hover:text-fg">
        {d.assessment.title}
      </Link>
      <CaretRightIcon size={12} aria-hidden />
      <span className="text-fg">Result</span>
    </nav>
  );
  if (!d.released) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader breadcrumb={crumbs} title={d.assessment.title} />
        <Card>
          <CardBody className="flex flex-col items-center py-10 text-center">
            <HourglassIcon size={32} className="mb-3 text-accent-text" aria-hidden />
            <StatusBadge status={d.status} />
            <p className="mt-3 max-w-md text-[14px] text-muted">{d.message}</p>
            {d.attempt.autoSubmitted && <p className="mt-2 text-[13px] text-muted">This attempt was submitted automatically when time ran out.</p>}
            {d.attempt.submittedAt && <p className="mt-1 text-[12.5px] text-subtle">Submitted {formatDateTime(d.attempt.submittedAt)}</p>}
            <ButtonLink to="/app/assessments" className="mt-5">
              Back to assessments
            </ButtonLink>
          </CardBody>
        </Card>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={crumbs}
        title={d.assessment.title}
        badge={<Badge tone="accent">{MODE_LABEL[d.assessment.mode]}</Badge>}
        description={`Attempt ${d.attempt.attemptNo} · released ${formatDateTime(d.attempt.releasedAt)}${d.attempt.autoSubmitted ? ' · submitted automatically at the time limit' : ''}`}
        actions={<ButtonLink to={`/app/assessments/${d.assessment.id}`}>Back to overview</ButtonLink>}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile label="Score" value={`${d.score} / ${d.maxScore}`} />
        <StatTile label="Percent" value={`${d.percent}%`} tone={d.passed === false ? 'warning' : 'success'} />
        <div className="col-span-2 sm:col-span-1">
        <StatTile
          label="Result"
          value={d.passed === null ? (d.assessment.mode === 'diagnostic' ? 'Diagnostic' : 'No pass mark') : d.passed ? 'Passed' : 'Not passed'}
          hint={d.assessment.passingScore !== null ? `Pass mark ${d.assessment.passingScore}%` : undefined}
          tone={d.passed === null ? undefined : d.passed ? 'success' : 'warning'}
        />
        </div>
      </div>

      {d.skills.length > 0 && (
        <Card className="mt-8">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-1.5">
                <DnaIcon size={16} aria-hidden /> Added to your Skill DNA
              </span>
            }
            description="Scores from auto-grading, test runs and human reviewers count as verified evidence. AI suggestions never verify anything on their own."
            action={<ProvenanceTag kind="verified" />}
          />
          <CardBody>
            <ul className="space-y-2.5">
              {d.skills.map((s) => (
                <li key={s.skillId} className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[200px_minmax(0,1fr)_48px]">
                  <Link to={`/app/skills/${s.slug}`} className="text-[13.5px] font-medium text-accent-text hover:underline">
                    {s.name}
                  </Link>
                  <Progress className="order-last col-span-2 sm:order-none sm:col-span-1" value={s.ratio * 100} label={`${s.name} score`} tone={s.ratio >= 0.7 ? 'success' : s.ratio >= 0.4 ? 'accent' : 'warning'} />
                  <span className="text-right text-[13px] tabular-nums">{Math.round(s.ratio * 100)}%</span>
                </li>
              ))}
            </ul>
            {d.assessment.mode === 'diagnostic' && <p className="mt-3 text-[13px] text-muted">Strong skills are now suggested as skippable on your roadmap; weaker ones are prioritised.</p>}
          </CardBody>
        </Card>
      )}

      {!d.assessment.showAnswersAfterRelease && (
        <Banner tone="info" className="mt-8">
          The organizer chose not to show correct answers for this assessment.
        </Banner>
      )}

      <Section title="Question breakdown" className="mt-8">
        <div className="space-y-4">
          {d.items.map((it) => (
            <ItemResult key={it.index} item={it} d={d} />
          ))}
        </div>
      </Section>
    </div>
  );
}
