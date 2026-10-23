import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeftIcon, LockSimpleIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError, qs } from '@/lib/api';
import { formatDateTime, fromLocalInput, toLocalInput } from '@/lib/format';
import { Banner, Button, ButtonLink, Card, CardAction, CardBody, CardHeader, ConfirmDialog, CopyButton, Dialog, ErrorState, Field, Input, PageHeader, Segmented, Select, SkeletonRows, StatusBadge, Textarea } from '@/components/ui';
import { RECOMMENDATION_LABEL, type Feedback, type Interview } from './api';
import { FeedbackCard } from './components';

type Detail = {
  interview: Interview;
  feedback: Feedback[];
  hiddenFeedbackCount: number;
  myFeedback: Feedback | null;
  permissions: { canManage: boolean; canSubmitFeedback: boolean; isInterviewer: boolean };
  competencies: string[];
  rubric: Record<string, string>;
  biasNote: string;
};

function FeedbackForm({ d }: { d: Detail }) {
  const qc = useQueryClient();
  const [rec, setRec] = useState('');
  const [scores, setScores] = useState<Record<string, { rating: string; note: string }>>({});
  const [summary, setSummary] = useState('');
  const m = useMutation({
    mutationFn: () =>
      api.post(`/hire/interviews/${d.interview.id}/feedback`, {
        recommendation: rec,
        scores: Object.entries(scores)
          .filter(([, v]) => v.rating)
          .map(([competency, v]) => ({ competency, rating: Number(v.rating), ...(v.note ? { note: v.note } : {}) })),
        summary,
      }),
    onSuccess: () => {
      toast.success('Feedback submitted. You can now see your colleagues’ feedback.');
      qc.invalidateQueries({ queryKey: ['hire'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  const rated = Object.values(scores).filter((v) => v.rating).length;
  const blocked = !rec ? 'Choose a recommendation' : !rated ? 'Rate at least one competency' : summary.trim().length < 10 ? 'Write a summary of at least 10 characters' : undefined;
  return (
    <Card>
      <CardHeader title="Your feedback" description="Submit independently. Colleagues' feedback stays hidden until you submit yours." />
      <CardBody className="space-y-4">
        <Banner tone="info">{d.biasNote}</Banner>
        <div className="space-y-3">
          {d.competencies.map((c) => (
            <div key={c} className="grid gap-2 sm:grid-cols-[180px_160px_1fr] sm:items-center">
              <span className="text-[13.5px] font-medium">{c}</span>
              <Select aria-label={`Rating for ${c}`} className="h-8 text-[13px]" value={scores[c]?.rating ?? ''} onChange={(e) => setScores({ ...scores, [c]: { rating: e.target.value, note: scores[c]?.note ?? '' } })}>
                <option value="">Not assessed</option>
                {Object.entries(d.rubric).map(([k, v]) => (
                  <option key={k} value={k}>
                    {k}: {v}
                  </option>
                ))}
              </Select>
              <Input aria-label={`Evidence note for ${c}`} className="h-8 text-[13px]" placeholder="What did you observe?" value={scores[c]?.note ?? ''} onChange={(e) => setScores({ ...scores, [c]: { rating: scores[c]?.rating ?? '', note: e.target.value } })} />
            </div>
          ))}
        </div>
        {fields.scores && <p className="text-[12.5px] text-danger">{fields.scores}</p>}
        <Field label="Summary" error={fields.summary} helper="Evidence for your recommendation, tied to the competencies.">
          <Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={5000} />
        </Field>
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Recommendation</div>
          <Segmented label="Recommendation" value={rec as 'strong_yes'} onChange={setRec} options={Object.entries(RECOMMENDATION_LABEL).map(([value, label]) => ({ value: value as 'strong_yes', label }))} />
        </div>
        <div className="flex justify-end">
          <Button variant="primary" loading={m.isPending} disabled={!!blocked} disabledReason={blocked} onClick={() => m.mutate()}>
            Submit feedback
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function RescheduleDialog({ d, open, onOpenChange }: { d: Detail; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState('45');
  useEffect(() => {
    if (open) {
      setWhen(toLocalInput(d.interview.scheduledAt));
      setDuration(String(d.interview.durationMinutes));
    }
  }, [open]); // reset when opened, not on background refetch
  const m = useMutation({
    mutationFn: () => api.patch(`/hire/interviews/${d.interview.id}`, { scheduledAt: fromLocalInput(when), durationMinutes: Number(duration) }),
    onSuccess: () => {
      toast.success('Rescheduled. The candidate and interviewers were notified.');
      qc.invalidateQueries({ queryKey: ['hire'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Reschedule interview"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!when} disabledReason="Pick a time" onClick={() => m.mutate()}>
            Save new time
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date and time">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Duration">
          <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
            {[30, 45, 60, 90].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

export default function InterviewDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hire', 'interview', id], queryFn: () => api.get<Detail>(`/hire/interviews/${id}`) });
  const [resched, setResched] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState('');
  const act = useMutation({
    mutationFn: (a: 'cancel' | 'complete' | 'no_show') => (a === 'cancel' ? api.post(`/hire/interviews/${id}/cancel`, { reason: reason || undefined }) : api.patch(`/hire/interviews/${id}`, { status: a === 'complete' ? 'completed' : 'no_show' })),
    onSuccess: (_r, a) => {
      toast.success(a === 'cancel' ? 'Interview cancelled. Everyone was notified.' : 'Status updated.');
      qc.invalidateQueries({ queryKey: ['hire'] });
      setCancel(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const iv = d.interview;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        breadcrumb={
          <Link to="/app/hire/interviews" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeftIcon size={13} /> Interviews
          </Link>
        }
        title={`${iv.kindLabel} interview with ${iv.candidateName}`}
        badge={<StatusBadge status={iv.status} />}
        description={`${formatDateTime(iv.scheduledAt)} · ${iv.durationMinutes} min${iv.jobTitle ? ` · ${iv.jobTitle}` : ''}`}
        actions={
          d.permissions.canManage &&
          iv.status !== 'cancelled' && (
            <>
              {iv.applicationId && (
                <ButtonLink to={`/app/hire/candidates/${iv.applicationId}`} variant="ghost">
                  Candidate profile
                </ButtonLink>
              )}
              <Button onClick={() => setResched(true)}>Reschedule</Button>
              {iv.status === 'scheduled' && new Date(iv.scheduledAt).getTime() < Date.now() && (
                <>
                  <Button onClick={() => act.mutate('no_show')}>Mark no-show</Button>
                  <Button onClick={() => act.mutate('complete')}>Mark completed</Button>
                </>
              )}
              <Button variant="ghost" onClick={() => setCancel(true)}>
                Cancel interview
              </Button>
            </>
          )
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {d.permissions.canSubmitFeedback && <FeedbackForm d={d} />}
          <Card>
            <CardHeader title="Feedback" description={d.permissions.canManage ? 'Recruiters see all submitted feedback.' : undefined} />
            <CardBody className="space-y-3">
              {d.hiddenFeedbackCount > 0 && (
                <p className="flex items-center gap-1.5 text-[13px] text-muted">
                  <LockSimpleIcon size={14} /> {d.hiddenFeedbackCount} colleague feedback hidden until you submit yours. This keeps first impressions independent.
                </p>
              )}
              {!d.feedback.length ? <p className="rounded-md bg-surface-2 px-4 py-5 text-center text-[13px] text-muted">No feedback visible yet.</p> : d.feedback.map((f) => <FeedbackCard key={f.id} f={f} />)}
            </CardBody>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Details" action={iv.postingId && <CardAction to={`/app/hire/jobs/${iv.postingId}${qs({ tab: 'pipeline' })}`}>Job pipeline</CardAction>} />
          <CardBody className="space-y-4 text-[13.5px]">
            <div>
              <div className="mb-0.5 text-[12px] font-medium text-subtle">Interviewers</div>
              {iv.interviewers.map((x) => x.name).join(', ')}
            </div>
            <div>
              <div className="mb-0.5 text-[12px] font-medium text-subtle">Meeting</div>
              {iv.meetingUrl ? (
                <div className="space-y-1">
                  <a href={iv.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-accent-text hover:underline">
                    <VideoCameraIcon size={14} /> {iv.meetingUrl}
                  </a>
                  <CopyButton value={iv.meetingUrl} label="Copy link" />
                  {iv.meetingNote && <p className="text-[12.5px] text-muted">{iv.meetingNote}</p>}
                </div>
              ) : (
                <span className="text-muted">No link (in person or phone)</span>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
      {d.permissions.canManage && <RescheduleDialog d={d} open={resched} onOpenChange={setResched} />}
      <ConfirmDialog open={cancel} onOpenChange={setCancel} title="Cancel this interview?" description="The candidate and interviewers are notified. Schedule a new interview if you still want to meet." confirmLabel="Cancel interview" danger loading={act.isPending} onConfirm={() => act.mutate('cancel')}>
        <Field label="Note to include" optional>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
