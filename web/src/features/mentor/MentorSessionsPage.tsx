import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { CopyButton, EmptyState, ErrorState, PageHeader, Segmented, SkeletonRows, StatusBadge, buttonClass } from '@/components/ui';
import { PersonLine, type Person, type Session } from '@/features/mentors/shared';
import { MentorGate } from './shared';

type Row = Session & {
  role: 'mentor' | 'mentee';
  mentorshipStatus: string;
  with: Person | null;
};

export default function MentorSessionsPage() {
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
  const q = useQuery({
    queryKey: ['mentor-sessions'],
    queryFn: () => api.get<{ items: Row[] }>('/mentorship/sessions?role=mentor'),
  });
  const now = Date.now() - 3600_000;
  const rows = (q.data?.items ?? []).filter((s) =>
    view === 'upcoming'
      ? (s.status === 'scheduled' || s.status === 'requested') && new Date(s.scheduledAt).getTime() > now
      : !((s.status === 'scheduled' || s.status === 'requested') && new Date(s.scheduledAt).getTime() > now),
  );
  if (view === 'upcoming') rows.reverse();
  return (
    <div>
      <PageHeader title="Sessions" description="All sessions across your mentees. Open a mentee to confirm, complete or add notes." />
      <MentorGate>
        <div className="mb-4">
          <Segmented
            label="Session view"
            value={view}
            onChange={setView}
            options={[
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'past', label: 'Past' },
            ]}
          />
        </div>
        {q.isLoading ? (
          <SkeletonRows rows={4} />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !rows.length ? (
          <EmptyState
            icon={<CalendarIcon size={22} />}
            title={view === 'upcoming' ? 'No upcoming sessions' : 'No past sessions'}
            description="Schedule sessions from a mentee's page. A free Jitsi link can be created for you."
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            {rows.map((s) => {
              const live = !!s.meetingUrl && s.status !== 'cancelled' && s.status !== 'completed';
              return (
                <li key={s.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                    <Link to={`/app/mentor/mentees/${s.mentorshipId}`} className="min-w-0 flex-1 rounded-md hover:text-accent-text sm:max-w-[260px]">
                      <PersonLine person={s.with} />
                    </Link>
                    <div className="min-w-0 flex-1 basis-60">
                      <div className="text-[14px] font-medium tabular-nums">{formatDateTime(s.scheduledAt)}</div>
                      <div className="truncate text-[12.5px] text-muted">
                        {s.durationMinutes} min
                        {s.agenda ? ` · ${s.agenda}` : ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {live && (
                        <>
                          <CopyButton value={s.meetingUrl!} label="Copy link" />
                          <a href={s.meetingUrl!} target="_blank" rel="noreferrer noopener" className={buttonClass('soft', 'sm')}>
                            <VideoCameraIcon size={15} /> Join meeting
                          </a>
                        </>
                      )}
                      <StatusBadge status={s.status} />
                    </div>
                  </div>
                  {s.sharedNotes && (
                    <div className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-[13px] sm:ml-[42px]">
                      <div className="mb-0.5 text-[11.5px] font-medium uppercase tracking-wide text-subtle">Shared notes</div>
                      <p className="whitespace-pre-wrap">{s.sharedNotes}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </MentorGate>
    </div>
  );
}
