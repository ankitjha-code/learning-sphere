import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HandshakeIcon, MagnifyingGlassIcon, ClockIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Badge, ButtonLink, Card, EmptyState, ErrorState, Input, PageHeader, Pagination, Select, Skeleton, StatusBadge, Tabs, Checkbox } from '@/components/ui';
import { DAYS, PersonLine, SampleTag, type Person } from './shared';

type MentorCard = {
  userId: string;
  name: string;
  avatarColor: string | null;
  isSample: boolean;
  headline: string;
  expertise: string[];
  yearsExperience: number | null;
  availability: { day: number; start: string; end: string }[];
  acceptingRequests: boolean;
  hasCapacity: boolean;
};
type MineRow = { id: string; status: string; createdAt: string; startedAt: string | null; goalsSummary: string | null; mentor: Person | null; mentee: Person | null };

function Discover() {
  const [q, setQ] = useState('');
  const [expertise, setExpertise] = useState('');
  const [day, setDay] = useState('');
  const [accepting, setAccepting] = useState(true);
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['mentors', q, expertise, day, accepting, page],
    queryFn: () => api.get<{ items: MentorCard[]; total: number; page: number; pageSize: number; expertiseOptions: string[] }>(`/mentorship/mentors${qs({ q, expertise, day, accepting: accepting ? 'true' : undefined, page, pageSize: 12 })}`),
    placeholderData: (p) => p,
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
          <Input className="pl-8" placeholder="Search by name, role or skill" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} aria-label="Search mentors" />
        </div>
        <div className="w-full sm:w-48">
          <Select value={expertise} onChange={(e) => (setExpertise(e.target.value), setPage(1))} aria-label="Expertise">
            <option value="">Any expertise</option>
            {list.data?.expertiseOptions.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-40">
          <Select value={day} onChange={(e) => (setDay(e.target.value), setPage(1))} aria-label="Available on">
            <option value="">Any day</option>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                Available {d}
              </option>
            ))}
          </Select>
        </div>
        <Checkbox checked={accepting} onCheckedChange={(v) => (setAccepting(v), setPage(1))} label="Accepting requests" />
      </div>
      {list.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data!.items.length ? (
        <EmptyState
          icon={<HandshakeIcon size={22} />}
          title="No mentors match these filters"
          description="Try another skill or clear the availability filter. New mentors join regularly."
          action={
            <button className="text-[13px] font-medium text-accent-text hover:underline" onClick={() => (setQ(''), setExpertise(''), setDay(''), setAccepting(false))}>
              Clear filters
            </button>
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            {list.data!.items.map((m) => (
              <li key={m.userId}>
                <Link to={`/app/mentors/${m.userId}`} className="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-2 md:flex-row md:items-center md:gap-6">
                  <div className="min-w-0 md:w-[42%] md:shrink-0">
                    <PersonLine person={{ id: m.userId, name: m.name, avatarColor: m.avatarColor, isSample: m.isSample, headline: m.headline }} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {m.expertise.slice(0, 5).map((e) => (
                      <Badge key={e}>{e}</Badge>
                    ))}
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-4 text-[12.5px] text-muted md:justify-end">
                    <span className="inline-flex items-center gap-1">
                      <ClockIcon size={14} aria-hidden />
                      {m.availability.length ? m.availability.map((a) => DAYS[a.day]).filter((d, i, arr) => arr.indexOf(d) === i).join(', ') : 'Availability on request'}
                    </span>
                    {!m.acceptingRequests ? <Badge>Not accepting</Badge> : !m.hasCapacity ? <Badge tone="warning">Full</Badge> : <Badge tone="success">Accepting</Badge>}
                    <ArrowRightIcon size={16} className="hidden shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg md:block" aria-hidden />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={list.data!.pageSize} total={list.data!.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function MyMentorships() {
  const mine = useQuery({ queryKey: ['my-mentorships'], queryFn: () => api.get<{ asMentee: MineRow[]; asMentor: MineRow[] }>('/mentorship/mine') });
  if (mine.isLoading) return <Skeleton className="h-32" />;
  if (mine.error) return <ErrorState error={mine.error} onRetry={() => mine.refetch()} />;
  const rows = mine.data!.asMentee;
  if (!rows.length)
    return (
      <EmptyState
        icon={<HandshakeIcon size={22} />}
        title="No mentorships yet"
        description="A mentor can help you set goals, review your progress and prepare for interviews. You decide exactly what they can see."
      />
    );
  return (
    <Card className="divide-y divide-border overflow-hidden">
      {rows.map((r) => (
        <Link key={r.id} to={r.status === 'requested' || r.status === 'declined' ? `/app/mentors/${r.mentor?.id}` : `/app/mentors/m/${r.id}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
          <div className="min-w-0 flex-1">
            <PersonLine person={r.mentor} sub={r.goalsSummary ?? undefined} />
          </div>
          <span className="hidden text-[12px] text-subtle sm:inline">{r.startedAt ? `Since ${timeAgo(r.startedAt)}` : `Requested ${timeAgo(r.createdAt)}`}</span>
          <StatusBadge status={r.status} />
          <ArrowRightIcon size={16} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
        </Link>
      ))}
    </Card>
  );
}

export default function MentorsPage() {
  const [tab, setTab] = useState('discover');
  const mine = useQuery({ queryKey: ['my-mentorships'], queryFn: () => api.get<{ asMentee: MineRow[]; asMentor: MineRow[] }>('/mentorship/mine') });
  const activeCount = mine.data?.asMentee.filter((r) => r.status === 'active' || r.status === 'requested').length;
  return (
    <div>
      <PageHeader
        title="Mentors"
        description="Find a mentor for goals, project reviews and interview preparation. Mentors only see the progress you choose to share, and you can change that at any time."
        actions={
          <ButtonLink to="/app/mentor/profile">
            Become a mentor
          </ButtonLink>
        }
        badge={mine.data?.asMentee.some((r) => r.mentor?.isSample) ? <SampleTag show /> : undefined}
      />
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'discover', label: 'Discover' },
          { value: 'mine', label: 'My mentorships', count: activeCount },
        ]}
        className="mb-6"
      />
      {tab === 'discover' ? <Discover /> : <MyMentorships />}
    </div>
  );
}
