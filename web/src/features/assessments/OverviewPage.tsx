import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CaretRightIcon, ClockIcon, ListNumbersIcon, ArrowsClockwiseIcon, CalendarIcon, EyeIcon, ScalesIcon, HandIcon, PlayIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { PageHeader, Section, Card, CardBody, CardHeader, Badge, StatusBadge, Banner, Button, ButtonLink, ConfirmDialog, ErrorState, Skeleton, ProvenanceTag, Markdown } from '@/components/ui';
import { MODE_LABEL, type AssessmentMode } from '@/components/assessments/types';
import { attemptLink } from './HubPage';

type Overview = {
  assessment: {
    id: string;
    title: string;
    description: string | null;
    mode: AssessmentMode;
    status: string;
    orgName: string | null;
    isSample: boolean;
    itemCount: number;
    totalPoints: number | null;
    timeLimitMinutes: number | null;
    effectiveTimeLimitMinutes: number | null;
    maxAttempts: number | null;
    availableFrom: string | null;
    availableUntil: string | null;
    resultRelease: 'immediate' | 'after_close' | 'manual';
    showAnswersAfterRelease: boolean;
    passingScore: number | null;
    allowRegradeRequests: boolean;
    proctoringNote: string | null;
    personal: boolean;
  };
  window: { open: boolean; reason?: string; closesAt: string | null };
  invite: { status: string; dueAt: string | null; accommodations: { extraTimePercent?: number; note?: string } } | null;
  attemptsUsed: number;
  attemptsLeft: number | null;
  inProgressAttemptId: string | null;
  canStart: boolean;
  cannotStartReason: string | null;
  isManager: boolean;
  attempts: { id: string; attemptNo: number; status: string; startedAt: string; submittedAt: string | null; percent: number | null }[];
};

const RELEASE_TEXT = {
  immediate: 'Results appear as soon as grading finishes.',
  after_close: 'Results are released when the assessment closes.',
  manual: 'Results are released by the organizer after review.',
};

function Rule({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <span className="mt-0.5 text-subtle" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-[12.5px] text-muted">{label}</dt>
        <dd className="text-[14px]">{value}</dd>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: ['assessments', 'overview', id], queryFn: () => api.get<Overview>(`/assessments/${id}/overview`) });
  const start = useMutation({
    mutationFn: () => api.post<{ attempt: { id: string }; created: boolean }>(`/assessments/${id}/attempts`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['assessments'] });
      if (!r.created) toast.info('Resuming your attempt in progress.');
      navigate(`/app/assessments/attempts/${r.attempt.id}`);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setConfirm(false);
      q.refetch();
    },
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-[480px]" />;
  const d = q.data!;
  const a = d.assessment;
  const extra = d.invite?.accommodations.extraTimePercent ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        breadcrumb={
          <nav className="flex items-center gap-1" aria-label="Breadcrumb">
            <Link to="/app/assessments" className="hover:text-fg">
              Assessments
            </Link>
            <CaretRightIcon size={12} aria-hidden />
            <span className="truncate text-fg">{a.title}</span>
          </nav>
        }
        title={a.title}
        badge={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{MODE_LABEL[a.mode]}</Badge>
            {a.status !== 'published' && <StatusBadge status={a.status} />}
            {a.isSample && <ProvenanceTag kind="sample" />}
            {a.personal && <Badge>Only you can see this</Badge>}
          </span>
        }
        description={a.orgName ? `From ${a.orgName}` : undefined}
      />
      {a.description && <Markdown source={a.description} className="-mt-4 mb-7 max-w-[72ch] text-[14.5px]! leading-relaxed text-muted!" />}

      {d.isManager && !a.personal && (
        <Banner tone="info" className="mb-5" title="Organizer preview">
          {d.cannotStartReason && !d.canStart ? d.cannotStartReason : 'You manage this assessment. Starting it here creates a real attempt in your name.'}
        </Banner>
      )}
      {a.mode === 'diagnostic' && (
        <Banner tone="info" className="mb-5" title="How diagnostics are used">
          Your graded answers become verified Skill DNA evidence. Topics you already know are suggested as skippable on your roadmap. There is no pass or fail.
        </Banner>
      )}

      <Card>
        <CardHeader title="Before you start" />
        <CardBody>
          <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
            <Rule icon={<ListNumbersIcon size={16} />} label="Questions" value={`${a.itemCount}${a.totalPoints !== null ? ` · ${a.totalPoints} points` : ''}`} />
            <Rule
              icon={<ClockIcon size={16} />}
              label="Time limit"
              value={
                a.timeLimitMinutes ? (
                  <>
                    {d.assessment.effectiveTimeLimitMinutes} minutes
                    {extra > 0 && <span className="text-muted"> (includes {extra}% extra time)</span>}
                    <div className="text-[12.5px] text-muted">The timer keeps running if you leave. Answers save automatically and submit when time is up.</div>
                  </>
                ) : (
                  'Untimed'
                )
              }
            />
            <Rule icon={<ArrowsClockwiseIcon size={16} />} label="Attempts" value={a.maxAttempts ? `${d.attemptsLeft} of ${a.maxAttempts} left` : `Unlimited (${d.attemptsUsed} used)`} />
            <Rule
              icon={<CalendarIcon size={16} />}
              label="Window"
              value={
                a.availableFrom || d.window.closesAt ? (
                  <>
                    {a.availableFrom ? `Opens ${formatDateTime(a.availableFrom)}` : 'Open now'}
                    {d.window.closesAt ? ` · closes ${formatDateTime(d.window.closesAt)}` : ''}
                  </>
                ) : (
                  'Always open'
                )
              }
            />
            <Rule icon={<EyeIcon size={16} />} label="Results" value={`${RELEASE_TEXT[a.resultRelease]}${a.showAnswersAfterRelease ? ' Correct answers and explanations are shown.' : ''}`} />
            <Rule icon={<ScalesIcon size={16} />} label="Passing score" value={a.passingScore !== null ? `${a.passingScore}%` : 'No pass mark'} />
          </dl>
          {a.allowRegradeRequests && <p className="mt-2 text-[13px] text-muted">You can ask for a regrade on any answer after results are released.</p>}
          {d.invite?.accommodations.note && (
            <p className="mt-2 text-[13px]">
              <span className="font-medium">Accommodation note: </span>
              {d.invite.accommodations.note}
            </p>
          )}
          {a.proctoringNote && (
            <Banner tone="warning" className="mt-3" title="Rules from the organizer">
              {a.proctoringNote}
            </Banner>
          )}
        </CardBody>
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
        {d.inProgressAttemptId ? (
          <ButtonLink to={`/app/assessments/attempts/${d.inProgressAttemptId}`} variant="primary" size="lg" icon={<PlayIcon size={16} />}>
            Resume attempt
          </ButtonLink>
        ) : (
          <Button variant="primary" size="lg" icon={<PlayIcon size={16} />} disabled={!d.canStart} disabledReason={d.cannotStartReason ?? undefined} onClick={() => setConfirm(true)}>
            Start {d.attemptsUsed ? 'a new attempt' : 'assessment'}
          </Button>
        )}
        {!d.canStart && d.cannotStartReason && !d.isManager && (
          <span className="inline-flex items-center gap-1 text-[13px] text-muted">
            <HandIcon size={14} aria-hidden /> {d.cannotStartReason}
          </span>
        )}
        </div>
      </Card>

      {d.attempts.length > 0 && (
        <Section title="Your attempts" className="mt-8">
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            {d.attempts.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 text-[13.5px]">
                <div className="min-w-0">
                  <div className="font-medium">Attempt {t.attemptNo}</div>
                  <div className="mt-0.5 text-[12.5px] text-muted">{t.submittedAt ? `Submitted ${formatDateTime(t.submittedAt)}` : `Started ${formatDateTime(t.startedAt)}`}</div>
                </div>
                <div className="flex items-center gap-3">
                  {t.percent !== null && <span className="font-medium tabular-nums">{t.percent}%</span>}
                  <StatusBadge status={t.status} />
                  <ButtonLink to={attemptLink(t)} size="sm">
                    {t.status === 'in_progress' ? 'Resume' : 'Open'}
                  </ButtonLink>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Start now?"
        description={
          a.timeLimitMinutes
            ? `The ${d.assessment.effectiveTimeLimitMinutes}-minute timer starts as soon as you begin and keeps running if you close the page.`
            : 'You can leave and come back; your answers are saved as you go.'
        }
        confirmLabel="Start"
        loading={start.isPending}
        onConfirm={() => start.mutate()}
      >
        {a.maxAttempts ? <p>This uses 1 of your {d.attemptsLeft} remaining attempts.</p> : null}
      </ConfirmDialog>
    </div>
  );
}
