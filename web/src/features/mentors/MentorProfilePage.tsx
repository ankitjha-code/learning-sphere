import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClockIcon, ShieldCheckIcon, StarIcon, HandshakeIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { Avatar, Badge, Banner, Button, ButtonLink, Card, CardBody, CardHeader, Dialog, ErrorState, Field, PageHeader, Skeleton, StatusBadge, Switch, Textarea } from '@/components/ui';
import { DAYS, SampleTag, SHARING_LABELS, type Sharing } from './shared';

type MentorDetail = {
  mentor: {
    userId: string;
    name: string;
    avatarColor: string | null;
    isSample: boolean;
    headline: string;
    bio: string;
    expertise: string[];
    yearsExperience: number | null;
    availability: { day: number; start: string; end: string }[];
    acceptingRequests: boolean;
    maxMentees: number;
    activeMentees: number;
    hasCapacity: boolean;
    status: string;
  };
  rating: { average: number; count: number } | null;
  myMentorship: { id: string; status: string } | null;
  isSelf: boolean;
};

function RequestDialog({ open, onOpenChange, mentorId, mentorName }: { open: boolean; onOpenChange: (v: boolean) => void; mentorId: string; mentorName: string }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [message, setMessage] = useState('');
  const [goals, setGoals] = useState('');
  const [sharing, setSharing] = useState<Sharing>({ skillDna: true, projects: true, assessments: false, applications: false });
  const m = useMutation({
    mutationFn: () => api.post<{ mentorship: { id: string } }>('/mentorship/requests', { mentorId, message, goalsSummary: goals || undefined, sharing }),
    onSuccess: () => {
      toast.success(`Request sent to ${mentorName}`);
      qc.invalidateQueries({ queryKey: ['mentor', mentorId] });
      qc.invalidateQueries({ queryKey: ['my-mentorships'] });
      onOpenChange(false);
      nav('/app/mentors');
    },
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Request mentorship from ${mentorName}`}
      description="Mentors have limited time. A specific message helps them say yes."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={message.trim().length < 20} disabledReason="Write at least a couple of sentences" onClick={() => m.mutate()}>
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {m.error && !Object.keys(fields).length && <Banner tone="danger">{errorMessage(m.error)}</Banner>}
        <Field label="Message" error={fields.message} helper="Who you are, where you are now, and what you want help with.">
          <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
        </Field>
        <Field label="Goals for the mentorship" optional error={fields.goalsSummary}>
          <Textarea rows={2} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="For example: ship one API project and be interview-ready in 4 months" maxLength={1000} />
        </Field>
        <fieldset className="rounded-lg border border-border p-3.5">
          <legend className="flex items-center gap-1.5 px-1 text-[13px] font-semibold">
            <ShieldCheckIcon size={16} className="text-success" /> What your mentor can see
          </legend>
          <p className="mb-3 text-[12.5px] text-muted">
            Only what you turn on below. Your private messages, notes, journal and AI conversations are never shared. You can change these at any time, and access ends when the mentorship ends.
          </p>
          <div className="space-y-3">
            {(Object.keys(SHARING_LABELS) as (keyof Sharing)[]).map((k) => (
              <Switch key={k} checked={sharing[k]} onCheckedChange={(v) => setSharing((s) => ({ ...s, [k]: v }))} label={SHARING_LABELS[k].label} description={SHARING_LABELS[k].description} />
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

export default function MentorProfilePage() {
  const { userId = '' } = useParams();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['mentor', userId], queryFn: () => api.get<MentorDetail>(`/mentorship/mentors/${userId}`) });
  const crumb = (
    <Link to="/app/mentors" className="hover:underline">
      Mentors
    </Link>
  );
  if (q.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-48" />
      </div>
    );
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { mentor, rating, myMentorship, isSelf } = q.data!;
  const canRequest = !isSelf && !myMentorship && mentor.acceptingRequests && mentor.hasCapacity && mentor.status === 'active';
  const reason = isSelf ? 'This is your own profile' : myMentorship ? 'You already have a request or mentorship with this mentor' : !mentor.acceptingRequests ? 'This mentor is not accepting requests right now' : !mentor.hasCapacity ? 'This mentor is at capacity' : undefined;
  return (
    <div>
      <PageHeader
        breadcrumb={crumb}
        title={
          <span className="inline-flex items-center gap-3">
            <Avatar name={mentor.name} color={mentor.avatarColor} size={40} />
            {mentor.name}
          </span>
        }
        badge={<SampleTag show={mentor.isSample} />}
        description={mentor.headline}
        actions={
          myMentorship?.status === 'active' ? (
            <ButtonLink to={`/app/mentors/m/${myMentorship.id}`} variant="primary" icon={<HandshakeIcon size={16} />}>
              Open mentorship
            </ButtonLink>
          ) : (
            <Button variant="primary" onClick={() => setOpen(true)} disabled={!canRequest} disabledReason={reason}>
              Request mentorship
            </Button>
          )
        }
      />
      {myMentorship?.status === 'requested' && (
        <Banner tone="info" className="mb-6" title="Request sent">
          {mentor.name} will review it soon. You will get a notification either way.
        </Banner>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardHeader title="About" />
          <CardBody>
            <p className="max-w-[72ch] whitespace-pre-wrap text-[14px] leading-relaxed">{mentor.bio}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {mentor.expertise.map((e) => (
                <Badge key={e} tone="accent">
                  {e}
                </Badge>
              ))}
            </div>
          </CardBody>
          <dl className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
            {[
              ['Experience', mentor.yearsExperience !== null ? `${mentor.yearsExperience} years` : 'Not stated'],
              ['Mentees', `${mentor.activeMentees} of ${mentor.maxMentees}`],
              [
                'Mentee rating',
                rating ? (
                  <span className="inline-flex items-center gap-1">
                    <StarIcon size={14} weight="fill" className="text-xp" aria-hidden />
                    {rating.average} ({rating.count})
                  </span>
                ) : (
                  'No ratings yet'
                ),
              ],
              ['Status', mentor.acceptingRequests ? <StatusBadge status="active" /> : <Badge>Not accepting</Badge>],
            ].map(([label, value], i) => (
              <div key={i} className="bg-surface px-5 py-4">
                <dt className="text-[12.5px] text-muted">{label}</dt>
                <dd className="mt-1 text-[14px] font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <CardHeader title="Availability" description="Times are in the mentor's local time." />
          <CardBody>
            {mentor.availability.length ? (
              <ul className="divide-y divide-border text-[13.5px]">
                {mentor.availability.map((a, i) => (
                  <li key={i} className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0">
                    <ClockIcon size={15} className="text-subtle" aria-hidden />
                    <span className="w-10 font-medium">{DAYS[a.day]}</span>
                    <span className="tabular-nums text-muted">
                      {a.start} to {a.end}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">Availability is agreed after the request is accepted.</p>
            )}
          </CardBody>
        </Card>
      </div>
      {open && <RequestDialog open={open} onOpenChange={setOpen} mentorId={mentor.userId} mentorName={mentor.name} />}
    </div>
  );
}
