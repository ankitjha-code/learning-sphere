import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeftIcon, CheckCircleIcon, CircleIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { Banner, Button, Card, CardBody, CardHeader, ConfirmDialog, ErrorState, Field, PageHeader, ProvenanceTag, SkeletonRows, StatusBadge, Textarea } from '@/components/ui';
import { MessageThread } from './components';

type View = {
  application: { id: string; stage: string; stageLabel: string; status: string; appliedAt: string; portfolioShared: boolean; coverNote: string | null };
  job: { id: string; title: string; company: string; isSample: boolean; location: string; status: string };
  stages: { key: string; label: string; current: boolean; passed: boolean }[];
  updates: { stage: string; note: string; at: string }[];
  interviews: { id: string; title: string; scheduledAt: string; durationMinutes: number; status: string; meetingUrl: string | null; meetingNote: string | null; interviewers: string[] }[];
  offers: { id: string; title: string; compensationText: string; startDate: string | null; expiresAt: string | null; status: string; canRespond: boolean }[];
  assessments: { assessmentId: string; title: string; status: string; dueAt: string | null; link: string }[];
  unreadMessages: number;
  closedNote: string | null;
};

function OfferCard({ o, company }: { o: View['offers'][number]; company: string }) {
  const qc = useQueryClient();
  const [decision, setDecision] = useState<'accept' | 'decline' | null>(null);
  const [note, setNote] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/hire/my-offers/${o.id}/respond`, { decision, note: note || undefined }),
    onSuccess: () => {
      toast.success(decision === 'accept' ? `You accepted the offer from ${company}.` : 'You declined the offer. The employer was notified.');
      qc.invalidateQueries({ queryKey: ['hire'] });
      setDecision(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader title={`Offer: ${o.title}`} action={<StatusBadge status={o.status} />} />
      <CardBody className="space-y-3 text-[13.5px]">
        <p className="whitespace-pre-wrap">{o.compensationText}</p>
        <p className="text-muted">
          {o.startDate ? `Start date ${formatDate(o.startDate)}` : 'Start date to be agreed'}
          {o.expiresAt ? ` · respond by ${formatDate(o.expiresAt)}` : ''}
        </p>
        {o.canRespond && (
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => setDecision('accept')}>
              Accept offer
            </Button>
            <Button onClick={() => setDecision('decline')}>Decline</Button>
          </div>
        )}
      </CardBody>
      <ConfirmDialog
        open={!!decision}
        onOpenChange={(v) => !v && setDecision(null)}
        title={decision === 'accept' ? 'Accept this offer?' : 'Decline this offer?'}
        description={decision === 'accept' ? `${company} will be notified and your application will be marked as hired.` : `${company} will be notified. This closes the application.`}
        confirmLabel={decision === 'accept' ? 'Accept offer' : 'Decline offer'}
        danger={decision === 'decline'}
        loading={m.isPending}
        onConfirm={() => m.mutate()}
      >
        <Field label="Note to the employer" optional>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}

export default function MyApplicationPage() {
  const { jobApplicationId = '' } = useParams();
  const q = useQuery({ queryKey: ['hire', 'my-application', jobApplicationId], queryFn: () => api.get<View>(`/hire/my-applications/${jobApplicationId}`) });
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const terminal = d.application.stage === 'rejected' || d.application.stage === 'withdrawn';
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        breadcrumb={
          <Link to={`/app/jobs/${d.job.id}`} className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeftIcon size={13} /> Job posting
          </Link>
        }
        title={d.job.title}
        badge={
          <>
            <StatusBadge status={d.application.stage} />
            {d.job.isSample && <ProvenanceTag kind="sample" />}
          </>
        }
        description={`${d.job.company} · ${d.job.location} · applied ${formatDate(d.application.appliedAt)}`}
      />
      {d.closedNote && <Banner tone={d.application.status === 'hired' ? 'success' : 'info'}>{d.closedNote}</Banner>}
      {d.application.stage === 'rejected' && <Banner tone="info">The employer decided not to move forward. Any note they chose to share is below. Keep building evidence for the skills in the posting; many people get there on the next try.</Banner>}

      {!terminal && (
        <Card>
          <CardHeader title="Where your application is" />
          <CardBody>
            <ol className="flex flex-wrap gap-x-4 gap-y-2">
              {d.stages.map((s) => (
                <li key={s.key} className={clsx('flex items-center gap-1.5 text-[13px]', s.current ? 'font-semibold text-fg' : s.passed ? 'text-muted' : 'text-subtle')} aria-current={s.current ? 'step' : undefined}>
                  {s.passed || s.current ? <CheckCircleIcon size={16} weight={s.current ? 'fill' : 'regular'} className="text-accent-text" /> : <CircleIcon size={16} />}
                  {s.label}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      {d.offers.map((o) => (
        <OfferCard key={o.id} o={o} company={d.job.company} />
      ))}

      {d.assessments.length > 0 && (
        <Card>
          <CardHeader title="Assessments" />
          <CardBody>
            <ul className="space-y-2 text-[13.5px]">
              {d.assessments.map((a) => (
                <li key={a.assessmentId} className="flex items-center justify-between gap-2">
                  <Link to={a.link} className="font-medium hover:underline">
                    {a.title}
                  </Link>
                  <span className="text-muted">
                    <StatusBadge status={a.status} />
                    {a.dueAt ? ` due ${formatDate(a.dueAt)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {d.interviews.length > 0 && (
        <Card>
          <CardHeader title="Interviews" />
          <CardBody>
            <ul className="space-y-3 text-[13.5px]">
              {d.interviews.map((i) => (
                <li key={i.id}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{i.title}</span>
                    <StatusBadge status={i.status} />
                  </div>
                  <div className="text-muted">
                    {formatDateTime(i.scheduledAt)} · {i.durationMinutes} min · with {i.interviewers.join(', ')}
                  </div>
                  {i.meetingUrl && (
                    <a href={i.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                      <VideoCameraIcon size={14} /> Join meeting
                    </a>
                  )}
                  {i.meetingNote && <p className="text-[12.5px] text-subtle">{i.meetingNote}</p>}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {d.updates.length > 0 && (
        <Card>
          <CardHeader title="Notes from the hiring team" />
          <CardBody>
            <ul className="space-y-2 text-[13.5px]">
              {d.updates.map((u, i) => (
                <li key={i}>
                  <span className="font-medium">{u.stage}</span>: {u.note} <span className="text-[12px] text-subtle">· {formatDate(u.at)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title={`Messages with ${d.job.company}`} description="Only you and the employer's hiring team can read these." />
        <CardBody>
          <MessageThread path={`/hire/my-applications/${d.application.id}/messages`} queryKey={['hire', 'my-messages', d.application.id]} emptyHint="Questions about the role or next steps? Ask the hiring team here." />
        </CardBody>
      </Card>
    </div>
  );
}
