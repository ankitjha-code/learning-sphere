import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { UsersIcon, CaretRightIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Card, EmptyState, ErrorState, PageHeader, Segmented, Skeleton, StatusBadge } from '@/components/ui';
import { PersonLine, type Person } from '@/features/mentors/shared';
import { MentorGate } from './shared';

type Row = {
  id: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  goalsSummary: string | null;
  mentee: Person | null;
};

export default function MenteesPage() {
  const [filter, setFilter] = useState<'active' | 'requested' | 'past'>('active');
  const q = useQuery({
    queryKey: ['my-mentorships'],
    queryFn: () => api.get<{ asMentor: Row[] }>('/mentorship/mine'),
  });
  const rows = (q.data?.asMentor ?? []).filter((r) => (filter === 'past' ? r.status === 'ended' || r.status === 'declined' : r.status === filter));
  return (
    <div>
      <PageHeader title="Mentees" description="Open a mentee to review the progress they share, set goals and plan sessions." />
      <MentorGate>
        <div className="mb-4">
          <Segmented
            label="Filter mentees"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'requested', label: 'Requests' },
              { value: 'past', label: 'Past' },
            ]}
          />
        </div>
        {q.isLoading ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !rows.length ? (
          <EmptyState
            icon={<UsersIcon size={22} />}
            title={filter === 'active' ? 'No active mentees' : filter === 'requested' ? 'No pending requests' : 'No past mentorships'}
            description={filter === 'active' ? 'Learners who request you and are accepted appear here. Keep your profile and availability up to date.' : 'Nothing here yet.'}
          />
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {rows.map((r) => (
              <Link key={r.id} to={r.status === 'requested' ? '/app/mentor' : `/app/mentor/mentees/${r.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <PersonLine person={r.mentee} sub={r.goalsSummary ?? undefined} />
                </div>
                <span className="hidden shrink-0 text-[12.5px] text-muted sm:inline">
                  {r.status === 'ended' && r.endedAt ? `Ended ${timeAgo(r.endedAt)}` : r.startedAt ? `Since ${timeAgo(r.startedAt)}` : `Requested ${timeAgo(r.createdAt)}`}
                </span>
                <StatusBadge status={r.status} />
                <CaretRightIcon size={16} className="shrink-0 text-subtle" aria-hidden />
              </Link>
            ))}
          </Card>
        )}
      </MentorGate>
    </div>
  );
}
