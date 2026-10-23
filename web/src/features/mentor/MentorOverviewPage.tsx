import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarIcon, ListChecksIcon, UsersIcon, TrayIcon, CaretRightIcon, CircleIcon, UserCircleIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { Badge, Banner, Button, ButtonLink, Card, CardAction, CardBody, CardHeader, Dialog, Field, PageHeader, Section, Skeleton, StatTile, StatusBadge, Textarea } from '@/components/ui';
import { PersonLine } from '@/features/mentors/shared';
import { MentorGate, SharingBadges, useWorkspace, type Workspace } from './shared';

/** A list-group shaped placeholder so an empty section keeps the same frame as a filled one. */
function EmptyRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-5 py-4 text-[13.5px] text-muted shadow-1">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-subtle ring-1 ring-inset ring-border">{icon}</span>
      {children}
    </div>
  );
}

function RequestCard({ r }: { r: Workspace['requests'][number] }) {
  const qc = useQueryClient();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const done = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ['mentor-workspace'] });
    qc.invalidateQueries({ queryKey: ['my-mentorships'] });
  };
  const accept = useMutation({
    mutationFn: () => api.post(`/mentorship/${r.id}/accept`),
    onSuccess: () => done('Request accepted'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const decline = useMutation({
    mutationFn: () => api.post(`/mentorship/${r.id}/decline`, { reason: reason || undefined }),
    onSuccess: () => (setDeclining(false), done('Request declined')),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <PersonLine person={r.mentee} sub={`Requested ${timeAgo(r.createdAt)}`} />
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDeclining(true)}>
            Decline
          </Button>
          <Button size="sm" variant="primary" loading={accept.isPending} onClick={() => accept.mutate()}>
            Accept
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-2 sm:pl-[42px]">
        {r.requestMessage && <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{r.requestMessage}</p>}
        {r.goalsSummary && (
          <p className="text-[13px] text-muted">
            <span className="font-medium text-fg">Goals: </span>
            {r.goalsSummary}
          </p>
        )}
        <SharingBadges sharing={r.sharing} />
      </div>
      <Dialog
        open={declining}
        onOpenChange={setDeclining}
        title="Decline this request?"
        description="The learner gets a kind notification. Adding a short reason or a suggestion helps."
        footer={
          <>
            <Button onClick={() => setDeclining(false)}>Cancel</Button>
            <Button variant="danger" loading={decline.isPending} onClick={() => decline.mutate()}>
              Decline request
            </Button>
          </>
        }
      >
        <Field label="Message to the learner" optional>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: I am at capacity this month. Try again in November." maxLength={500} />
        </Field>
      </Dialog>
    </li>
  );
}

export default function MentorOverviewPage() {
  const ws = useWorkspace();
  const d = ws.data;
  return (
    <div>
      <PageHeader
        hero
        title="Mentor workspace"
        description="Requests, mentees, sessions and follow-ups in one place. You only see the progress each mentee chooses to share."
        actions={
          <>
            <ButtonLink to="/app/mentor/profile" icon={<UserCircleIcon size={16} />}>
              Mentor profile
            </ButtonLink>
            <ButtonLink to="/app/mentor/mentees" variant="primary" icon={<UsersIcon size={16} />}>
              View mentees
            </ButtonLink>
          </>
        }
      >
        {ws.isLoading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[118px] rounded-lg" />
            ))}
          </div>
        ) : d && (d.profile || d.workspaceUnlocked) ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Requests"
              value={d.requests.length}
              hint={d.requests.length ? 'Waiting for your answer' : 'None waiting'}
              icon={<TrayIcon />}
              tone={d.requests.length ? 'warning' : undefined}
            />
            <StatTile
              label="Active mentees"
              value={d.profile ? `${d.mentees.length} / ${d.profile.maxMentees}` : d.mentees.length}
              hint={d.profile ? (d.profile.acceptingRequests ? 'Accepting requests' : 'Requests paused') : 'Through your organization'}
              icon={<UsersIcon />}
              tone="accent"
            />
            <StatTile
              label="Upcoming sessions"
              value={d.upcomingSessions.length}
              hint={d.upcomingSessions.some((s) => s.status === 'requested') ? 'Some need confirmation' : 'All confirmed'}
              icon={<CalendarIcon />}
              tone="accent"
            />
            <StatTile
              label="Open follow-ups"
              value={d.followUps.length}
              hint={d.followUps.length ? 'From past sessions' : 'Nothing outstanding'}
              icon={<ListChecksIcon />}
              tone={d.followUps.length ? 'warning' : 'success'}
            />
          </div>
        ) : null}
      </PageHeader>
      <MentorGate>
        {d && (
          <div className="space-y-8">
            {d.profile?.status === 'pending' && (
              <Banner tone="warning" title="Your profile is waiting for approval">
                Learners can find you once a platform admin approves it. You can keep editing it meanwhile.
              </Banner>
            )}
            {d.profile?.status === 'rejected' && (
              <Banner
                tone="warning"
                title="Your profile was not approved"
                action={
                  <ButtonLink to="/app/mentor/profile" size="sm">
                    Edit profile
                  </ButtonLink>
                }
              >
                Update it and save to submit it again.
              </Banner>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-8">
                <Section title="Requests" description="Accepting counts toward your capacity.">
                  {d.requests.length ? (
                    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                      {d.requests.map((r) => (
                        <RequestCard key={r.id} r={r} />
                      ))}
                    </ul>
                  ) : (
                    <EmptyRow icon={<TrayIcon size={18} />}>No pending requests. New requests from learners appear here.</EmptyRow>
                  )}
                </Section>
                <Section title="Upcoming sessions" action={<CardAction to="/app/mentor/sessions">All sessions</CardAction>}>
                  {d.upcomingSessions.length ? (
                    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                      {d.upcomingSessions.slice(0, 6).map((s) => (
                        <li key={s.id}>
                          <Link to={`/app/mentor/mentees/${s.mentorshipId}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
                            <div className="min-w-0 flex-1">
                              <PersonLine person={s.mentee} sub={s.agenda ?? `${s.durationMinutes} min session`} />
                            </div>
                            <div className="hidden shrink-0 text-right sm:block">
                              <div className="text-[13.5px] font-medium tabular-nums">{formatDateTime(s.scheduledAt)}</div>
                              <div className="text-[12.5px] text-muted">{s.durationMinutes} min</div>
                            </div>
                            {s.status === 'requested' ? <Badge tone="warning">Needs confirmation</Badge> : <StatusBadge status={s.status} />}
                            <CaretRightIcon size={16} className="shrink-0 text-subtle" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyRow icon={<CalendarIcon size={18} />}>No sessions scheduled. Plan one from a mentee's page.</EmptyRow>
                  )}
                </Section>
              </div>
              <aside className="min-w-0 space-y-5">
                <Card>
                  <CardHeader
                    title="Active mentees"
                    description={d.mentees.length ? `${d.mentees.length} in progress` : undefined}
                    action={<CardAction to="/app/mentor/mentees">All mentees</CardAction>}
                  />
                  {d.mentees.length ? (
                    <ul className="divide-y divide-border border-t border-border">
                      {d.mentees.map((m) => (
                        <li key={m.id}>
                          <Link to={`/app/mentor/mentees/${m.id}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2">
                            <div className="min-w-0 flex-1">
                              <PersonLine person={m.mentee} sub={m.nextSession ? `Next: ${formatDateTime(m.nextSession)}` : 'No session scheduled'} />
                            </div>
                            {m.openAssignments > 0 && <Badge>{m.openAssignments} open</Badge>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <CardBody>
                      <p className="text-[13px] text-muted">Accepted requests appear here.</p>
                    </CardBody>
                  )}
                </Card>
                <Card>
                  <CardHeader title="Follow-ups due" description="Open items from past sessions." />
                  {d.followUps.length ? (
                    <ul className="divide-y divide-border border-t border-border">
                      {d.followUps.slice(0, 10).map((f) => (
                        <li key={`${f.sessionId}-${f.id}`}>
                          <Link to={`/app/mentor/mentees/${f.mentorshipId}`} className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2">
                            <CircleIcon size={16} className="mt-0.5 shrink-0 text-subtle" aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13.5px] leading-5">{f.text}</span>
                              {f.mentee?.name && <span className="mt-0.5 block text-[12.5px] text-muted">{f.mentee.name}</span>}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <CardBody>
                      <p className="text-[13px] text-muted">Nothing outstanding.</p>
                    </CardBody>
                  )}
                </Card>
              </aside>
            </div>
          </div>
        )}
      </MentorGate>
    </div>
  );
}
