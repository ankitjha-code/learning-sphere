import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarIcon, CaretLeftIcon, CaretRightIcon, VideoCameraIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import { api, qs } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, PageHeader, Segmented, SkeletonRows, StatusBadge } from '@/components/ui';
import type { Interview } from './api';

const DAY = 86400_000;
function weekStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export default function InterviewsPage() {
  const [view, setView] = useState<'upcoming' | 'week' | 'past'>('upcoming');
  const [mine, setMine] = useState(false);
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const range = useMemo(() => {
    if (view === 'week') return { from: week.toISOString(), to: new Date(week.getTime() + 7 * DAY).toISOString() };
    if (view === 'upcoming') return { from: new Date(Date.now() - 2 * 3600_000).toISOString() };
    return { to: new Date().toISOString() };
  }, [view, week]);
  const q = useQuery({
    queryKey: ['hire', 'interviews', range, mine],
    queryFn: () => api.get<{ items: Interview[]; canManage: boolean }>(`/hire/interviews${qs({ ...range, mine: mine ? 'true' : undefined })}`),
  });
  const items = view === 'past' ? [...(q.data?.items ?? [])].reverse() : (q.data?.items ?? []);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Interviews" description="Structured interviews, meeting links and feedback. Schedule new interviews from a candidate's profile." />
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="View" value={view} onChange={setView} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'week', label: 'Week' }, { value: 'past', label: 'Past' }]} />
        {q.data?.canManage && <Segmented label="Whose interviews" value={mine ? 'mine' : 'all'} onChange={(v) => setMine(v === 'mine')} options={[{ value: 'all', label: 'Team' }, { value: 'mine', label: 'Mine' }]} />}
        {view === 'week' && (
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" aria-label="Previous week" onClick={() => setWeek(new Date(week.getTime() - 7 * DAY))}>
              <CaretLeftIcon size={14} />
            </Button>
            <span className="text-[13px] tabular-nums">Week of {formatDate(week)}</span>
            <Button size="icon-sm" variant="ghost" aria-label="Next week" onClick={() => setWeek(new Date(week.getTime() + 7 * DAY))}>
              <CaretRightIcon size={14} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setWeek(weekStart(new Date()))}>
              This week
            </Button>
          </div>
        )}
      </div>
      {q.isLoading ? (
        <SkeletonRows rows={5} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : view === 'week' ? (
        <div className="grid gap-2 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => new Date(week.getTime() + i * DAY)).map((day) => {
            const list = items.filter((iv) => new Date(iv.scheduledAt).toDateString() === day.toDateString());
            const today = day.toDateString() === new Date().toDateString();
            return (
              <section key={day.toISOString()} className={clsx('min-h-32 rounded-lg border p-2', today ? 'border-accent' : 'border-border')} aria-label={formatDate(day, { weekday: 'long', day: 'numeric', month: 'short' })}>
                <h3 className="mb-2 text-[12.5px] font-semibold">{formatDate(day, { weekday: 'short', day: 'numeric', month: 'short' })}</h3>
                {!list.length ? (
                  <p className="text-[12px] text-subtle">Free</p>
                ) : (
                  <ul className="space-y-1.5">
                    {list.map((iv) => (
                      <li key={iv.id}>
                        <Link to={`/app/hire/interviews/${iv.id}`} className={clsx('block rounded-md px-2 py-1 text-[12px] hover:brightness-95', iv.status === 'cancelled' ? 'bg-surface-2 text-subtle line-through' : 'bg-accent-soft text-accent-text')}>
                          {formatDate(iv.scheduledAt, { timeStyle: 'short' })} {iv.candidateName}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : !items.length ? (
        <EmptyState
          icon={<CalendarIcon size={22} />}
          title={view === 'upcoming' ? 'No upcoming interviews' : 'No past interviews'}
          description="Open a candidate and choose Schedule interview. A free Jitsi Meet link can be generated for you."
          action={q.data?.canManage && <ButtonLink to="/app/hire/candidates">Go to candidates</ButtonLink>}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13.5px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-left text-[12px] text-muted">
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Candidate</th>
                <th className="px-4 py-2.5 font-medium">Interviewers</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {items.map((iv) => (
                <tr key={iv.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDateTime(iv.scheduledAt)}
                    <div className="text-[12px] text-subtle">
                      {iv.kindLabel} · {iv.durationMinutes} min
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/app/hire/interviews/${iv.id}`} className="font-medium hover:underline">
                      {iv.candidateName}
                    </Link>
                    {iv.jobTitle && <div className="text-[12px] text-muted">{iv.jobTitle}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted">{iv.interviewers.map((x) => x.name).join(', ')}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={iv.status} />
                    {iv.meetingUrl && iv.status === 'scheduled' && (
                      <a href={iv.meetingUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-[12.5px] text-accent-text hover:underline">
                        <VideoCameraIcon size={13} /> Join
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {iv.iAmInterviewer && !iv.myFeedbackSubmitted && iv.status !== 'cancelled' && new Date(iv.scheduledAt).getTime() < Date.now() ? (
                      <Badge tone="warning">Yours is due</Badge>
                    ) : (
                      <span className="tabular-nums text-muted">
                        {iv.feedbackCount ?? 0} of {iv.interviewers.length}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
