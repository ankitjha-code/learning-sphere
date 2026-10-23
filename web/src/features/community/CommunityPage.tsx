import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TrophyIcon, UsersThreeIcon, FlagIcon, GearSixIcon, MagnifyingGlassIcon, LockKeyIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { Badge, Button, ButtonLink, Card, CardAction, CardBody, CardHeader, ErrorState, Input, PageHeader, Skeleton, StatTile, Tabs } from '@/components/ui';
import { EmptyThreads, ThreadListQuery, useCommunityOverview } from './shared';

export type SpaceRow = { id: string; slug: string; name: string; description: string; kind: string; visibility: string; orgId: string | null; orgName: string | null; memberCount: number; threadCount: number; joined: boolean; myRole: string | null };

function SpacesPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['community-spaces'], queryFn: () => api.get<{ items: SpaceRow[] }>('/community/spaces') });
  const join = useMutation({
    mutationFn: (slug: string) => api.post(`/community/spaces/${slug}/join`),
    onSuccess: () => (toast.success('Joined'), qc.invalidateQueries({ queryKey: ['community-spaces'] })),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const mine = q.data!.items.filter((s) => s.joined);
  const others = q.data!.items.filter((s) => !s.joined);
  const Row = ({ s }: { s: SpaceRow }) => (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <Link to={`/app/community/s/${s.slug}`} className="min-w-0 hover:text-accent-text">
        <span className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium">
          {s.name}
          {s.orgId && (
            <Badge tone="info" icon={<LockKeyIcon size={11} />}>
              {s.orgName ?? 'Organization'}
            </Badge>
          )}
          {s.myRole === 'moderator' && <Badge tone="accent">Moderator</Badge>}
        </span>
        <span className="mt-0.5 block text-[12px] text-subtle">
          {s.threadCount} threads · {s.memberCount} members
        </span>
      </Link>
      {!s.joined && (
        <Button size="sm" onClick={() => join.mutate(s.slug)} loading={join.isPending && join.variables === s.slug}>
          Join
        </Button>
      )}
    </li>
  );
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="My spaces" />
        <CardBody>{mine.length ? <ul className="divide-y divide-border">{mine.map((s) => <Row key={s.id} s={s} />)}</ul> : <p className="text-[13px] text-muted">Join a space to follow its threads.</p>}</CardBody>
      </Card>
      {others.length > 0 && (
        <Card>
          <CardHeader title="Explore spaces" />
          <CardBody>
            <ul className="divide-y divide-border">
              {others.map((s) => (
                <Row key={s.id} s={s} />
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

const TABS = [
  { value: 'recent', label: 'Recent' },
  { value: 'trending', label: 'Trending' },
  { value: 'unanswered', label: 'Unanswered' },
  { value: 'events', label: 'Events' },
  { value: 'showcase', label: 'Showcase' },
  { value: 'teams', label: 'Team formation' },
  { value: 'mine', label: 'My posts' },
];

export default function CommunityPage() {
  const [tab, setTab] = useState('recent');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const ov = useCommunityOverview();
  const params: Record<string, string | undefined> =
    tab === 'events'
      ? { kind: 'event', sort: 'upcoming' }
      : tab === 'showcase'
        ? { kind: 'showcase' }
        : tab === 'teams'
          ? { kind: 'team_formation' }
          : tab === 'mine'
            ? { mine: 'true' }
            : { sort: tab };
  return (
    <div>
      <PageHeader
        title="Community"
        description="Ask questions, help others, find study partners and teammates. Private questions stay between you, moderators and mentors you invite."
        actions={
          <>
            <ButtonLink to="/app/community/groups" icon={<UsersThreeIcon size={16} />}>
              Study groups
            </ButtonLink>
            {ov.data?.canModerate && (
              <ButtonLink to="/app/community/moderation" icon={<FlagIcon size={16} />}>
                Moderation
              </ButtonLink>
            )}
            <ButtonLink to="/app/community/settings" variant="ghost" size="icon" aria-label="Community settings">
              <GearSixIcon size={18} />
            </ButtonLink>
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <form
            className="relative mb-4"
            onSubmit={(e) => {
              e.preventDefault();
              setQ(search.trim());
            }}
          >
            <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
            <Input className="pl-8" placeholder="Search threads and press Enter" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search threads" />
          </form>
          <Tabs value={tab} onValueChange={setTab} tabs={TABS} className="mb-4" />
          <ThreadListQuery key={`${tab}-${q}`} path="/community/threads" params={{ ...params, q: q || undefined }} showSpace empty={<EmptyThreads />} />
        </div>
        <aside className="space-y-5">
          {/* Wrapped so the tile keeps its natural height inside the stretched side column. */}
          <div>
          <StatTile
            label="Your reputation"
            value={ov.data?.reputation.reputation ?? 0}
            icon={<TrophyIcon weight="fill" />}
            tone="xp"
            hint={`Net votes on your posts plus 15 for each accepted answer.${ov.data ? ` ${ov.data.reputation.accepted} accepted so far.` : ''}`}
          />
          </div>
          <SpacesPanel />
          <Card>
            <CardHeader title="Community guidelines" action={<CardAction to="/app/community/guidelines">Read</CardAction>} />
            <CardBody>
              <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
                <ShieldCheckIcon size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
                Report anything that breaks the guidelines from its menu. Block people to hide their posts.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
