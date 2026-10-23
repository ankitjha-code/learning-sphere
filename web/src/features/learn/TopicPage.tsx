import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  CaretLeftIcon,
  CaretRightIcon,
  ClockIcon,
  TargetIcon,
  CodeIcon,
  ArrowSquareOutIcon,
  SparkleIcon,
  NotePencilIcon,
  CheckCircleIcon,
  ArrowsClockwiseIcon,
  FlagIcon,
  PencilLineIcon,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { ErrorState, Skeleton, Button, ButtonLink, Badge, Banner, Markdown, Card, CardHeader, CardBody, Textarea, Field, PageHeader } from '@/components/ui';
import { ObjectiveQuestion, isAnswered, type ObjectiveAnswer, type PublicQuestion, type QuestionResult } from '@/components/questions/ObjectiveQuestion';

type TopicResponse = {
  track: { slug: string; title: string; contentStatus: string; lastReviewedAt: string | null };
  topic: {
    id: string;
    slug: string;
    title: string;
    module: string;
    objectives: string[];
    body: string;
    estimatedMinutes: number;
    practice: { title: string; kind: string; ref?: string; prompt?: string }[];
    resources: { title: string; url: string; source: string; kind: string }[];
    completionCriteria: string | null;
    isMilestone: boolean;
  };
  skill: { slug: string; name: string } | null;
  quiz: PublicQuestion[];
  progress: { status: string; mastery: number; nextReviewAt: string | null; intervalDays: number; completedAt: string | null } | null;
  prev: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
  position: { index: number; total: number };
};

type QuizResponse = {
  score: number;
  max: number;
  ratio: number;
  passed: boolean;
  status: string;
  nextReviewAt: string;
  intervalDays: number;
  results: { questionId: string; score: number | null; max: number; correct: boolean; correctAnswer: unknown; explanation: string | null }[];
};

/** Reports 5 minutes of study time while the tab is visible (no XP; just honest time tracking). */
function useStudyTimer(topicId: string | undefined) {
  const elapsed = useRef(0);
  useEffect(() => {
    if (!topicId) return;
    elapsed.current = 0;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      elapsed.current += 1;
      if (elapsed.current >= 5) {
        elapsed.current = 0;
        api.post(`/learning/topics/${topicId}/time`, { minutes: 5 }).catch(() => {});
      }
    }, 60_000);
    return () => clearInterval(t);
  }, [topicId]);
}

export default function TopicPage() {
  const { slug = '', topic: topicSlug = '' } = useParams();
  const [params] = useSearchParams();
  const review = params.get('review') === '1';
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, ObjectiveAnswer>>({});
  const [result, setResult] = useState<QuizResponse | null>(null);
  const [reflection, setReflection] = useState('');
  const quizRef = useRef<HTMLDivElement>(null);

  const q = useQuery({ queryKey: ['topic', slug, topicSlug], queryFn: () => api.get<TopicResponse>(`/learning/tracks/${slug}/topics/${topicSlug}`) });
  const topicId = q.data?.topic.id;
  useStudyTimer(topicId);

  useEffect(() => {
    setAnswers({});
    setResult(null);
    setReflection('');
    if (topicId) api.post(`/learning/topics/${topicId}/start`).catch(() => {});
  }, [topicId]);

  useEffect(() => {
    if (q.data && (params.get('quiz') === '1' || review)) quizRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [q.data, params, review]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['topic', slug, topicSlug] });
    qc.invalidateQueries({ queryKey: ['track', slug] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['recommendations'] });
    qc.invalidateQueries({ queryKey: ['skill-dna'] });
    qc.invalidateQueries({ queryKey: ['revision'] });
  };

  const submitQuiz = useMutation({
    mutationFn: () => api.post<QuizResponse>(`/learning/topics/${topicId}/quiz`, { answers, review }),
    onSuccess: (r) => {
      setResult(r);
      invalidate();
      if (r.passed) toast.success(`Passed with ${Math.round(r.ratio * 100)}%. Next review in ${r.intervalDays} day${r.intervalDays === 1 ? '' : 's'}.`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const complete = useMutation({
    mutationFn: () => api.post(`/learning/topics/${topicId}/complete`, { reflection }),
    onSuccess: () => {
      toast.success('Topic completed. Your reflection is saved as self-reported evidence.');
      invalidate();
    },
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-[600px] rounded-lg" />;
  const d = q.data!;
  const completed = d.progress?.status === 'completed';
  const allAnswered = d.quiz.every((x) => isAnswered(x, answers[x.id]));
  const resultById = new Map<string, QuestionResult>((result?.results ?? []).map((r) => [r.questionId, { correct: r.correct, score: r.score, max: r.max, correctAnswer: r.correctAnswer, explanation: r.explanation }]));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={
          <nav className="flex min-w-0 items-center gap-1" aria-label="Breadcrumb">
            <Link to="/app/learn" className="shrink-0 hover:text-fg">
              Roadmaps
            </Link>
            <CaretRightIcon size={12} className="shrink-0" aria-hidden />
            <Link to={`/app/learn/${slug}`} className="truncate hover:text-fg">
              {d.track.title}
            </Link>
            <CaretRightIcon size={12} className="shrink-0" aria-hidden />
            <span className="truncate text-fg">{d.topic.title}</span>
          </nav>
        }
        title={d.topic.title}
        badge={
          <>
            {d.topic.isMilestone && (
              <Badge tone="accent" icon={<FlagIcon size={11} weight="fill" />}>
                Milestone
              </Badge>
            )}
            {completed && <Badge tone="success">Completed</Badge>}
            {d.progress?.status === 'needs_revision' && <Badge tone="warning">Needs revision</Badge>}
          </>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {d.topic.module} · Topic {d.position.index} of {d.position.total}
            </span>
            <span className="inline-flex items-center gap-1">
              <ClockIcon size={14} aria-hidden /> {d.topic.estimatedMinutes} min
            </span>
            {d.skill && (
              <span>
                Builds the skill{' '}
                <Link to={`/app/skills/${d.skill.slug}`} className="font-medium text-accent-text hover:underline">
                  {d.skill.name}
                </Link>
              </span>
            )}
          </span>
        }
      />

      {review && (
        <Banner tone="warning" title="Revision mode" className="mb-6">
          Skim the notes, then retake the quiz. Your score sets when this topic comes back next.
        </Banner>
      )}

      {d.topic.objectives.length > 0 && (
        <Card className="mb-6">
          <CardHeader title={<span className="inline-flex items-center gap-2"><TargetIcon size={17} className="text-accent-text" aria-hidden /> By the end you will</span>} />
          <CardBody>
            <ul className="space-y-2 text-[14px]">
              {d.topic.objectives.map((o) => (
                <li key={o} className="flex items-start gap-2.5">
                  <CheckCircleIcon size={16} className="mt-0.5 shrink-0 text-subtle" aria-hidden />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <article className="mb-8">
        {d.topic.body ? <Markdown source={d.topic.body} /> : <p className="text-muted">This topic has no written notes yet. Use the resources below.</p>}
      </article>

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader title="Practice" description="Doing beats re-reading" />
          {d.topic.practice.length === 0 ? (
            <CardBody>
              <p className="text-[13px] text-muted">No practice items for this topic.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {d.topic.practice.map((p, i) => (
                <li key={i}>
                  {p.ref && (p.kind === 'problem' || p.kind === 'sql') ? (
                    <Link to={`/app/practice/${p.ref}`} className="group flex items-center gap-3 px-5 py-3 text-[13.5px] transition-colors hover:bg-surface-2">
                      <CodeIcon size={18} className="shrink-0 text-accent-text" aria-hidden />
                      <span className="min-w-0 flex-1 font-medium group-hover:text-accent-text">{p.title}</span>
                      <CaretRightIcon size={14} className="shrink-0 text-subtle" aria-hidden />
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 px-5 py-3 text-[13.5px]">
                      <PencilLineIcon size={18} className="mt-0.5 shrink-0 text-subtle" aria-hidden />
                      <div className="min-w-0">
                        <span className="font-medium">{p.title}</span>
                        {p.prompt && <p className="mt-0.5 text-[13px] text-muted">{p.prompt}</p>}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="flex flex-col">
          <CardHeader title="Resources" description={d.track.lastReviewedAt ? `Links checked ${formatDate(d.track.lastReviewedAt)}` : 'Curated free material'} />
          {d.topic.resources.length === 0 ? (
            <CardBody>
              <p className="text-[13px] text-muted">No external resources listed.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {d.topic.resources.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 px-5 py-3 text-[13.5px] transition-colors hover:bg-surface-2">
                    <ArrowSquareOutIcon size={18} className="mt-0.5 shrink-0 text-subtle" aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-medium text-accent-text group-hover:underline">{r.title}</span>
                      <span className="block text-[12px] text-subtle">
                        {r.source} · {r.kind}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        <ButtonLink to={`/app/ai?assistant=tutor&context=topic:${d.topic.id}&label=${encodeURIComponent(d.topic.title)}`} icon={<SparkleIcon size={16} />}>
          Ask the tutor about this topic
        </ButtonLink>
        <ButtonLink to={`/app/workspace?new=note&linkType=topic&linkId=${d.topic.id}&linkLabel=${encodeURIComponent(d.topic.title)}`} icon={<NotePencilIcon size={16} />}>
          Take a note
        </ButtonLink>
      </div>

      <section ref={quizRef} aria-labelledby="check" className="mb-10 scroll-mt-20">
        <h2 id="check" className="text-[18px] font-semibold tracking-[-0.01em]">
          {d.quiz.length ? (review ? 'Revision quiz' : 'Check your understanding') : 'Complete this topic'}
        </h2>
        <p className="mb-4 mt-1 text-[13.5px] text-muted">{d.topic.completionCriteria}</p>

        {d.quiz.length > 0 ? (
          <div className="space-y-3">
            {d.quiz.map((question, i) => (
              <ObjectiveQuestion
                key={question.id}
                q={question}
                index={i + 1}
                value={answers[question.id]}
                onChange={(v) => setAnswers({ ...answers, [question.id]: v })}
                result={resultById.get(question.id)}
                disabled={!!result}
              />
            ))}
            {result ? (
              <div className={clsx('flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center', result.passed ? 'bg-success-soft' : 'bg-warning-soft')} role="status" aria-live="polite">
                {result.passed ? <CheckCircleIcon size={28} weight="fill" className="shrink-0 text-success" /> : <ArrowsClockwiseIcon size={28} className="shrink-0 text-warning" />}
                <div className="flex-1 text-[14px]">
                  <div className="font-semibold">
                    {Math.round(result.ratio * 100)}% · {result.passed ? 'Passed' : 'Not yet: 70% needed'}
                  </div>
                  <div className="text-muted">
                    {result.passed
                      ? `Next review scheduled for ${formatDate(result.nextReviewAt)} (in ${result.intervalDays} day${result.intervalDays === 1 ? '' : 's'}).`
                      : 'Review the explanations above, revisit the notes, then try again.'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setResult(null);
                      setAnswers({});
                    }}
                  >
                    Retake
                  </Button>
                  {result.passed && d.next && (
                    <ButtonLink to={`/app/learn/${slug}/${d.next.slug}`} variant="primary">
                      Next topic
                    </ButtonLink>
                  )}
                </div>
              </div>
            ) : (
              <Button variant="primary" size="lg" disabled={!allAnswered} disabledReason="Answer every question first" loading={submitQuiz.isPending} onClick={() => submitQuiz.mutate()}>
                Submit answers
              </Button>
            )}
          </div>
        ) : completed ? (
          <Banner tone="success" title="Completed">
            You completed this topic {d.progress?.completedAt ? `on ${formatDate(d.progress.completedAt)}` : ''}.
          </Banner>
        ) : (
          <div className="space-y-3">
            <Field
              label="Reflection"
              helper="In your own words: what did you learn, and what is still unclear? This is saved as self-reported evidence."
              error={complete.error instanceof ApiError ? (complete.error.fields.reflection ?? complete.error.message) : undefined}
            >
              <Textarea rows={5} value={reflection} onChange={(e) => setReflection(e.target.value)} />
            </Field>
            <Button variant="primary" loading={complete.isPending} disabled={reflection.trim().length < 40} disabledReason="Write at least 40 characters" onClick={() => complete.mutate()}>
              Mark as completed
            </Button>
          </div>
        )}
      </section>

      <nav className="flex items-center justify-between gap-3 border-t border-border pt-5" aria-label="Topic navigation">
        {d.prev ? (
          <Link to={`/app/learn/${slug}/${d.prev.slug}`} className="inline-flex min-w-0 items-center gap-1.5 text-[13.5px] text-muted hover:text-fg">
            <CaretLeftIcon size={16} className="shrink-0" />
            <span className="truncate">{d.prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {d.next && (
          <Link to={`/app/learn/${slug}/${d.next.slug}`} className="inline-flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium text-accent-text hover:underline">
            <span className="truncate">{d.next.title}</span>
            <CaretRightIcon size={16} className="shrink-0" />
          </Link>
        )}
      </nav>
    </div>
  );
}
