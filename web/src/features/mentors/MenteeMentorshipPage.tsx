import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheckIcon, TargetIcon, NotePencilIcon, CalendarIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import clsx from 'clsx';
import { Avatar, Banner, Button, Card, CardAction, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge, Switch } from '@/components/ui';
import {
  AssignmentList,
  FeedbackForm,
  FeedbackList,
  FollowUpChecklist,
  GoalList,
  MessagesPanel,
  ScheduleButton,
  SessionCard,
  SampleTag,
  SHARING_LABELS,
  SharedNotes,
  useMentorship,
  type Sharing,
  type Session,
} from './shared';

function SharingControls({ mentorshipId, sharing, active }: { mentorshipId: string; sharing: Sharing; active: boolean }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (patch: Partial<Sharing>) => api.patch(`/mentorship/${mentorshipId}/sharing`, patch),
    onSuccess: () => {
      toast.success('Sharing updated');
      qc.invalidateQueries({ queryKey: ['mentorship', mentorshipId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader title="What your mentor can see" description="Change this any time. Every change is recorded." />
      <CardBody className="space-y-3">
        {(Object.keys(SHARING_LABELS) as (keyof Sharing)[]).map((k) => (
          <Switch key={k} checked={sharing[k]} disabled={m.isPending || !active} onCheckedChange={(v) => m.mutate({ [k]: v })} label={SHARING_LABELS[k].label} description={SHARING_LABELS[k].description} />
        ))}
        <p className="flex items-start gap-1.5 border-t border-border pt-3 text-[12px] text-muted">
          <ShieldCheckIcon size={15} className="mt-0.5 shrink-0 text-success" />
          Messages with other people, your journal, notes and AI conversations are never shared. Access ends automatically when the mentorship ends.
        </p>
      </CardBody>
    </Card>
  );
}

function SessionsSection({ mentorshipId, sessions, active, jitsiNote }: { mentorshipId: string; sessions: Session[]; active: boolean; jitsiNote: string }) {
  const qc = useQueryClient();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const patch = useMutation({
    mutationFn: ({ sid, body }: { sid: string; body: Record<string, unknown> }) => api.patch(`/mentorship/${mentorshipId}/sessions/${sid}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentorship', mentorshipId] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const upcoming = sessions.filter((s) => (s.status === 'scheduled' || s.status === 'requested') && new Date(s.scheduledAt).getTime() > Date.now() - 3600_000).reverse();
  const past = sessions.filter((s) => !upcoming.includes(s));
  return (
    <Card>
      <CardHeader title="Sessions" action={<ScheduleButton mentorshipId={mentorshipId} role="mentee" jitsiNote={jitsiNote} disabled={!active} />} />
      <CardBody>
        {!sessions.length && <EmptyState className="border-0! bg-transparent! px-0! py-8!" icon={<CalendarIcon size={22} />} title="No sessions yet" description="Request a first session to agree on goals with your mentor." />}
        {upcoming.length > 0 && (
          <div className="divide-y divide-border">
        {upcoming.map((s) => (
          <SessionCard key={s.id} s={s} flat>
            {active && (
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => setCancelId(s.id)}>
                  Cancel session
                </Button>
              </div>
            )}
          </SessionCard>
        ))}
          </div>
        )}
        {past.length > 0 && <div className={clsx('mb-3 border-b border-border pb-2 text-[11.5px] font-semibold uppercase tracking-wide text-subtle', upcoming.length > 0 && 'mt-6')}>Past</div>}
        {past.length > 0 && (
          <div className="divide-y divide-border">
        {past.map((s) => (
          <SessionCard key={s.id} s={s} flat>
            <FollowUpChecklist items={s.followUps} disabled={!active || patch.isPending} onToggle={(id, done) => patch.mutate({ sid: s.id, body: { followUps: s.followUps.map((f) => (f.id === id ? { ...f, done } : f)) } })} />
          </SessionCard>
        ))}
          </div>
        )}
      </CardBody>
      <ConfirmDialog
        open={!!cancelId}
        onOpenChange={(v) => !v && setCancelId(null)}
        title="Cancel this session?"
        description="Your mentor will be notified. You can request a new time afterwards."
        confirmLabel="Cancel session"
        danger
        loading={patch.isPending}
        onConfirm={() => patch.mutate({ sid: cancelId!, body: { status: 'cancelled' } }, { onSuccess: () => (setCancelId(null), toast.success('Session cancelled')) })}
      />
    </Card>
  );
}

export default function MenteeMentorshipPage() {
  const { mentorshipId = '' } = useParams();
  const qc = useQueryClient();
  const q = useMentorship(mentorshipId);
  const [ending, setEnding] = useState(false);
  const end = useMutation({
    mutationFn: () => api.post(`/mentorship/${mentorshipId}/end`, {}),
    onSuccess: () => {
      toast.success('Mentorship ended. Your mentor no longer has access to your progress.');
      setEnding(false);
      qc.invalidateQueries({ queryKey: ['mentorship', mentorshipId] });
      qc.invalidateQueries({ queryKey: ['my-mentorships'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const assignment = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/mentorship/${mentorshipId}/assignments/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentorship', mentorshipId] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    );
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const active = d.mentorship.status === 'active';
  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/mentors" className="hover:underline">
            Mentors
          </Link>
        }
        title={
          <span className="inline-flex items-center gap-3">
            <Avatar name={d.mentor.name} color={d.mentor.avatarColor} size={40} />
            {d.mentor.name}
          </span>
        }
        badge={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={d.mentorship.status} />
            <SampleTag show={d.mentor.isSample} />
          </span>
        }
        description={[d.mentor.headline, d.mentorship.goalsSummary ? `Focus: ${d.mentorship.goalsSummary}` : null].filter(Boolean).join('. ')}
        actions={
          (active || d.mentorship.status === 'requested') && (
            <Button onClick={() => setEnding(true)}>
              {active ? 'End mentorship' : 'Withdraw request'}
            </Button>
          )
        }
      />
      {d.mentorship.status === 'requested' && (
        <Banner tone="info" className="mb-6" title="Waiting for your mentor">
          You will be notified when {d.mentor.name} responds.
        </Banner>
      )}
      {d.mentorship.status === 'ended' && (
        <Banner tone="info" className="mb-6" title="This mentorship has ended">
          Your mentor no longer sees any of your progress. Goals they set stay in your Goals list.
        </Banner>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Goals from your mentor" description="These also appear in your Goals page." action={<CardAction to="/app/goals">All goals</CardAction>} />
            <CardBody>
              <GoalList goals={d.goals} empty={<EmptyState className="border-0! bg-transparent! px-0! py-8!" icon={<TargetIcon size={22} />} title="No goals yet" description="Your mentor can add goals after your first session." />} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Assigned activities" description="Tick them off as you go. Your mentor sees your progress here." />
            <CardBody>
              <AssignmentList items={d.assignments} onStatus={active ? (a, status) => assignment.mutate({ id: a.id, status }) : undefined} />
            </CardBody>
          </Card>
          <SessionsSection mentorshipId={mentorshipId} sessions={d.sessions} active={active} jitsiNote={d.jitsiNote} />
          <Card>
            <CardHeader title="Shared notes" description="Visible to you and your mentor." action={<NotePencilIcon size={18} className="text-subtle" />} />
            <CardBody>
              <SharedNotes mentorshipId={mentorshipId} notes={d.notes} myId={d.mentee.id} canWrite={active} />
            </CardBody>
          </Card>
          <MessagesPanel mentorshipId={mentorshipId} active={active} otherName={d.mentor.name} />
        </div>
        <aside className="space-y-5">
          <SharingControls mentorshipId={mentorshipId} sharing={d.mentorship.sharing} active={active} />
          <Card>
            <CardHeader title="Feedback" />
            <CardBody className="space-y-4">
              <FeedbackList items={d.feedback} mentorId={d.mentor.id} />
              {(active || d.mentorship.status === 'ended') && <FeedbackForm mentorshipId={mentorshipId} role="mentee" />}
            </CardBody>
          </Card>
        </aside>
      </div>
      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title={active ? 'End this mentorship?' : 'Withdraw this request?'}
        description={active ? 'Your mentor immediately loses access to your shared progress, and upcoming sessions are cancelled. You can still read past notes and messages.' : 'Your mentor will be notified.'}
        confirmLabel={active ? 'End mentorship' : 'Withdraw request'}
        danger
        loading={end.isPending}
        onConfirm={() => end.mutate()}
      />
    </div>
  );
}
