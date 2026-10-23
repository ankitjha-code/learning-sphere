import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PlusIcon, LockKeyIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { Badge, Banner, Button, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton, Segmented } from '@/components/ui';
import { AuthorChip, EmptyThreads, NewThreadDialog, ThreadListQuery, type Author } from './shared';

type SpaceDetail = {
  space: { id: string; slug: string; name: string; description: string; kind: string; visibility: string; orgId: string | null };
  membership: { role: string } | null;
  isModerator: boolean;
  canRead: boolean;
  moderators: Author[];
  memberCount: number;
  tags: string[];
};

export default function SpacePage() {
  const { slug = '' } = useParams();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<'recent' | 'top' | 'unanswered'>('recent');
  const [kind, setKind] = useState('');
  const [tag, setTag] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const s = useQuery({ queryKey: ['community-space', slug], queryFn: () => api.get<SpaceDetail>(`/community/spaces/${slug}`) });
  const membership = useMutation({
    mutationFn: (action: 'join' | 'leave') => api.post(`/community/spaces/${slug}/${action}`),
    onSuccess: (_r, action) => {
      toast.success(action === 'join' ? 'Joined space' : 'Left space');
      qc.invalidateQueries({ queryKey: ['community-space', slug] });
      qc.invalidateQueries({ queryKey: ['community-spaces'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (s.isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    );
  if (s.error) return <ErrorState error={s.error} onRetry={() => s.refetch()} />;
  const d = s.data!;
  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/community" className="hover:underline">
            Community
          </Link>
        }
        title={d.space.name}
        badge={
          <>
            {d.space.orgId && (
              <Badge tone="info" icon={<LockKeyIcon size={11} />}>
                Organization members only
              </Badge>
            )}
            {d.isModerator && <Badge tone="accent">You moderate this space</Badge>}
          </>
        }
        description={d.space.description}
        actions={
          <>
            {d.membership ? (
              <Button variant="ghost" onClick={() => membership.mutate('leave')} loading={membership.isPending}>
                Leave
              </Button>
            ) : (
              <Button onClick={() => membership.mutate('join')} loading={membership.isPending}>
                Join space
              </Button>
            )}
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setOpen(true)} disabled={!d.canRead} disabledReason="Join this space to post">
              New post
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
        <span>{d.memberCount} members</span>
        {d.moderators.length > 0 && (
          <span className="flex flex-wrap items-center gap-2">
            Moderators:
            {d.moderators.map((m) => (
              <AuthorChip key={m.id} a={m} />
            ))}
          </span>
        )}
      </div>
      {!d.canRead ? (
        <EmptyState icon={<LockKeyIcon size={22} />} title="Members only" description="Join this space to read and post." action={<Button variant="primary" onClick={() => membership.mutate('join')}>Join space</Button>} />
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <form
              className="relative flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                setQ(search.trim());
              }}
            >
              <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
              <Input className="pl-8" placeholder="Search this space and press Enter" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search this space" />
            </form>
            <div className="w-full sm:w-40">
              <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
                <option value="">All types</option>
                <option value="question">Questions</option>
                <option value="discussion">Discussions</option>
                <option value="showcase">Showcases</option>
                <option value="team_formation">Team formation</option>
                <option value="event">Events</option>
              </Select>
            </div>
            {d.tags.length > 0 && (
              <div className="w-full sm:w-40">
                <Select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
                  <option value="">All tags</option>
                  {d.tags.map((t) => (
                    <option key={t} value={t}>
                      #{t}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <Segmented
              label="Sort"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'recent', label: 'Recent' },
                { value: 'top', label: 'Top' },
                { value: 'unanswered', label: 'Unanswered' },
              ]}
            />
          </div>
          {d.isModerator && <Banner className="mb-3">As a moderator you also see private questions and hidden threads in this space.</Banner>}
          <ThreadListQuery
            key={`${sort}-${kind}-${tag}-${q}`}
            path={`/community/spaces/${slug}/threads`}
            params={{ sort, kind: kind || undefined, tag: tag || undefined, q: q || undefined }}
            empty={
              <EmptyThreads
                action={
                  <Button variant="primary" onClick={() => setOpen(true)}>
                    Start a thread
                  </Button>
                }
              />
            }
          />
        </>
      )}
      {open && <NewThreadDialog open={open} onOpenChange={setOpen} spaceSlug={slug} spaceName={d.space.name} isModerator={d.isModerator} defaultKind={d.space.kind === 'showcase' ? 'showcase' : d.space.kind === 'events' && d.isModerator ? 'event' : 'question'} />}
    </div>
  );
}
