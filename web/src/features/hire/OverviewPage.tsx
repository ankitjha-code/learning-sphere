import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BriefcaseIcon, CalendarIcon, ChatCircleIcon, CheckCircleIcon, ClipboardTextIcon, PlusIcon, SealCheckIcon, UsersIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { formatDate, formatDateTime, plural } from '@/lib/format';
import { Avatar, ButtonLink, Card, CardAction, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, Section, Skeleton, SkeletonRows, StatTile, Badge } from '@/components/ui';
import { FairnessNote, FunnelMini, listGroup } from './components';

type Overview = {
  canManage: boolean;
  assignedCandidates: number | null;
  openJobs: { id: string; title: string; location: string; closesAt: string | null; total: number; stages: { key: string; label: string; count: number }[] }[];
  awaiting: { id: string; candidateName: string; jobTitle: string; stageLabel: string; waitingDays: number }[];
  todaysInterviews: { id: string; title: string; candidateName: string; scheduledAt: string; durationMinutes: number; meetingUrl: string | null; interviewers: string[]; applicationId: string | null }[];
  pendingFeedback: { id: string; title: string; candidateName: string; scheduledAt: string }[];
  counters: { unreadMessages: number; extendedOffers: number; interviewsMissingFeedback: number };
};

export default function OverviewPage() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400_000);
  const q = useQuery({ queryKey: ['hire', 'overview'], queryFn: () => api.get<Overview>(`/hire/overview${qs({ from: start.toISOString(), to: end.toISOString() })}`) });
  const d = q.data;
  const applicants = d?.openJobs.reduce((n, j) => n + j.total, 0) ?? 0;
  const compactEmpty = 'rounded-md bg-surface-2 px-4 py-5 text-center text-[13px] text-muted';
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        hero
        title="Hiring overview"
        description="Open roles, candidates waiting on you, today's interviews and feedback you owe."
        actions={d?.canManage && <ButtonLink to="/app/hire/jobs/new" variant="primary" icon={<PlusIcon size={15} />}>New job</ButtonLink>}
      >
        {q.error ? null : !d ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[118px] rounded-lg" />
            ))}
          </div>
        ) : (
          <div className={d.canManage ? 'grid grid-cols-2 gap-4 lg:grid-cols-4' : 'grid grid-cols-2 gap-4'}>
            <StatTile label="Open jobs" value={d.openJobs.length} hint={plural(applicants, 'applicant') + ' in total'} icon={<BriefcaseIcon size={16} />} tone="accent" />
            {d.canManage ? (
              <>
                <StatTile label="Unread candidate messages" value={d.counters.unreadMessages} hint={d.counters.unreadMessages ? 'Reply from the candidate profile' : 'Inbox is clear'} icon={<ChatCircleIcon size={16} />} tone={d.counters.unreadMessages ? 'warning' : 'success'} />
                <StatTile label="Offers awaiting answer" value={d.counters.extendedOffers} hint="Extended, waiting for a reply" icon={<SealCheckIcon size={16} />} tone="accent" />
                <StatTile label="Interviews missing feedback" value={d.counters.interviewsMissingFeedback} hint={d.counters.interviewsMissingFeedback ? 'Remind the interview panel' : 'All feedback is in'} icon={<ClipboardTextIcon size={16} />} tone={d.counters.interviewsMissingFeedback ? 'warning' : 'success'} />
              </>
            ) : (
              <StatTile label="Candidates you interview" value={d.assignedCandidates ?? 0} hint="Assigned to you as interviewer" icon={<UsersIcon size={16} />} tone="accent" />
            )}
          </div>
        )}
      </PageHeader>
      {q.isLoading ? (
        <SkeletonRows rows={6} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : d ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-8">
              <Section title="Open jobs" description="Bars show how many candidates are in each stage." action={<CardAction to="/app/hire/jobs">All jobs</CardAction>}>
                {!d.openJobs.length ? (
                  <EmptyState
                    icon={<BriefcaseIcon size={22} />}
                    title="No published jobs"
                    description="Publish a job to start receiving applications."
                    action={d.canManage && <ButtonLink to="/app/hire/jobs/new" variant="primary">Create a job</ButtonLink>}
                  />
                ) : (
                  <ul className={listGroup}>
                    {d.openJobs.map((j) => (
                      <li key={j.id} className="group relative flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
                        <div className="flex min-w-0 items-center gap-4">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                            <BriefcaseIcon size={18} weight="duotone" />
                          </span>
                          <div className="min-w-0">
                            <Link to={`/app/hire/jobs/${j.id}`} className="block truncate text-[14.5px] font-semibold tracking-[-0.005em] after:absolute after:inset-0 hover:text-accent-text">
                              {j.title}
                            </Link>
                            <div className="mt-0.5 text-[12.5px] text-muted">
                              {j.location} · {plural(j.total, 'applicant')}
                              {j.closesAt ? ` · closes ${formatDate(j.closesAt)}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="hidden shrink-0 sm:block">
                          <FunnelMini stages={j.stages} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {d.canManage && (
                <Section title="Candidates awaiting review" description="Oldest first. Open a profile to review the evidence and decide." action={<CardAction to="/app/hire/candidates">All candidates</CardAction>}>
                  {!d.awaiting.length ? (
                    <div className="flex items-center gap-4 rounded-lg border border-dashed border-border-strong/70 bg-surface/60 px-5 py-5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-success-soft text-success">
                        <CheckCircleIcon size={18} weight="fill" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold">You're all caught up</div>
                        <p className="text-[13px] text-muted">New applications that need a first review show up here.</p>
                      </div>
                    </div>
                  ) : (
                    <ul className={listGroup}>
                      {d.awaiting.map((a) => (
                        <li key={a.id} className="group relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-surface-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar name={a.candidateName} size={32} />
                            <div className="min-w-0">
                              <Link to={`/app/hire/candidates/${a.id}`} className="block truncate text-[14px] font-semibold after:absolute after:inset-0 hover:text-accent-text">
                                {a.candidateName}
                              </Link>
                              <div className="truncate text-[12.5px] text-muted">{a.jobTitle}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge>{a.stageLabel}</Badge>
                            <span className={a.waitingDays > 5 ? 'text-[12.5px] font-medium text-warning' : 'text-[12.5px] text-subtle'}>{a.waitingDays ? `${plural(a.waitingDays, 'day')} waiting` : 'today'}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}
            </div>

            <aside className="space-y-5">
              <Card>
                <CardHeader title="Today's interviews" action={<CardAction to="/app/hire/interviews">Calendar</CardAction>} />
                {!d.todaysInterviews.length ? (
                  <CardBody>
                    <p className={compactEmpty}>Nothing scheduled today. Interviews you or your team schedule appear here.</p>
                  </CardBody>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {d.todaysInterviews.map((i) => (
                      <li key={i.id} className="flex items-start gap-3.5 px-5 py-4">
                        <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-accent-soft text-accent-text" aria-hidden>
                          <CalendarIcon size={18} weight="duotone" />
                        </span>
                        <div className="min-w-0 flex-1 text-[13px]">
                          <Link to={`/app/hire/interviews/${i.id}`} className="block truncate font-semibold hover:text-accent-text hover:underline">
                            {i.candidateName}
                          </Link>
                          <div className="text-muted">
                            {formatDate(i.scheduledAt, { timeStyle: 'short' })} · {i.durationMinutes} min
                          </div>
                          {i.interviewers.length > 0 && <div className="truncate text-[12.5px] text-subtle">With {i.interviewers.join(', ')}</div>}
                          {i.meetingUrl && (
                            <a href={i.meetingUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-text hover:underline">
                              <VideoCameraIcon size={14} /> Join meeting
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader title="Feedback you owe" description="Submit soon after the interview, while it is fresh." />
                {!d.pendingFeedback.length ? (
                  <CardBody>
                    <p className={compactEmpty}>No pending feedback. After an interview you take part in, your feedback form appears here.</p>
                  </CardBody>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {d.pendingFeedback.map((p) => (
                      <li key={p.id}>
                        <Link to={`/app/hire/interviews/${p.id}`} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold">{p.candidateName}</span>
                            <span className="block text-[12.5px] text-muted">{formatDateTime(p.scheduledAt)}</span>
                          </span>
                          <Badge tone="warning">Due</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </aside>
          </div>
          <FairnessNote className="mt-8" />
        </>
      ) : null}
    </div>
  );
}
