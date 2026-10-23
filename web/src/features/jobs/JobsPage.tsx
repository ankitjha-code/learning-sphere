import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BriefcaseIcon, BookmarkSimpleIcon, BookmarkIcon, MapPinIcon, ArrowsClockwiseIcon, GlobeIcon, KanbanIcon } from '@phosphor-icons/react';
import { api, errorMessage, qs } from '@/lib/api';
import { useSession } from '@/lib/session';
import { timeAgo, formatDate } from '@/lib/format';
import { PageHeader, CardAction, ErrorState, SkeletonRows, EmptyState, Button, Input, Select, Tabs, Badge, Pagination, ProvenanceTag, StatusBadge, Banner } from '@/components/ui';
import { ExternalJobRow, FeedStatusList, MatchChips, TYPE_LABEL, WORKPLACE_LABEL, type ExternalJob, type FeedSource, type Match } from './shared';

type Posting = { id: string; title: string; team: string | null; company: string; isSample: boolean; location: string; workplace: string; employmentType: string; salaryText: string | null; campusOnly: boolean; publishedAt: string | null; closesAt: string | null; match: Match; saved: boolean; applied: string | null };

function useSaveToggle(kind: 'platform' | 'external', invalidate: unknown[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ refId, saved }: { refId: string; saved: boolean }) => (saved ? api.del(`/jobs/saved/${kind}/${refId}`) : api.post('/jobs/saved', { kind, refId })),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: invalidate });
      qc.invalidateQueries({ queryKey: ['jobs', 'saved'] });
      toast.success(v.saved ? 'Removed from saved jobs.' : 'Saved.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

function PlatformTab() {
  const [f, setF] = useState({ q: '', location: '', workplace: '', type: '', page: 1 });
  const key = ['jobs', 'platform', f];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ items: Posting[]; total: number; page: number; pageSize: number }>(`/jobs${qs({ ...f, pageSize: 20 })}`), placeholderData: keepPreviousData });
  const save = useSaveToggle('platform', ['jobs', 'platform']);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Input aria-label="Search jobs" className="col-span-2 w-full sm:w-64" placeholder="Search title, company or text" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} />
        <Input aria-label="Location" className="col-span-2 w-full sm:w-44" placeholder="Location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value, page: 1 })} />
        <Select aria-label="Workplace" className="w-full sm:w-40" value={f.workplace} onChange={(e) => setF({ ...f, workplace: e.target.value, page: 1 })}>
          <option value="">Any workplace</option>
          {Object.entries(WORKPLACE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select aria-label="Job type" className="w-full sm:w-40" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, page: 1 })}>
          <option value="">Any type</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-[12.5px] text-muted">Jobs posted on LearnSphere Nexus by verified employer organizations. The evidence match compares listed skills with your Skill DNA; it is advisory and never uses personal characteristics.</p>
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon={<BriefcaseIcon size={22} />} title="No platform jobs match" description="Employers have not posted matching roles yet. Try the remote jobs tab, or clear filters." />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            {q.data.items.map((p) => (
              <li key={p.id} className="flex items-start gap-4 px-5 py-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                  <BriefcaseIcon size={18} weight="duotone" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <Link to={`/app/jobs/${p.id}`} className="text-[14.5px] font-semibold tracking-[-0.005em] hover:text-accent-text">
                      {p.title}
                    </Link>
                    {p.isSample && <ProvenanceTag kind="sample" />}
                    {p.campusOnly && <Badge tone="info">Campus drive</Badge>}
                    {p.applied && <StatusBadge status={p.applied === 'active' ? 'applied' : p.applied} />}
                  </div>
                  <div className="mt-0.5 text-[13px] text-muted">
                    {p.company} · <MapPinIcon size={12} className="inline align-[-1px]" aria-hidden /> {p.location} · {WORKPLACE_LABEL[p.workplace] ?? p.workplace} · {TYPE_LABEL[p.employmentType] ?? p.employmentType}
                    {p.salaryText && ` · ${p.salaryText}`}
                  </div>
                  <div className="mt-2.5">
                    <MatchChips match={p.match} />
                  </div>
                  {(p.publishedAt || p.closesAt) && (
                    <div className="mt-2 text-[12px] text-subtle">
                      {p.publishedAt && `Posted ${timeAgo(p.publishedAt)}`}
                      {p.closesAt && `${p.publishedAt ? ' · c' : 'C'}loses ${formatDate(p.closesAt)}`}
                    </div>
                  )}
                </div>
                <Button size="icon-sm" variant="ghost" className="-mr-1 shrink-0" aria-label={p.saved ? 'Remove from saved' : 'Save job'} icon={p.saved ? <BookmarkSimpleIcon size={16} weight="fill" className="text-accent-text" /> : <BookmarkIcon size={16} />} onClick={() => save.mutate({ refId: p.id, saved: p.saved })} />
              </li>
            ))}
          </ul>
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(page) => setF({ ...f, page })} />
        </>
      )}
    </div>
  );
}

function RemoteTab() {
  const me = useSession();
  const qc = useQueryClient();
  const [f, setF] = useState({ q: '', source: '', page: 1 });
  const q = useQuery({ queryKey: ['jobs', 'external', f], queryFn: () => api.get<{ items: ExternalJob[]; total: number; page: number; pageSize: number; sources: FeedSource[]; backgroundSync?: boolean }>(`/jobs/external${qs({ ...f, pageSize: 20 })}`), placeholderData: keepPreviousData });
  const save = useSaveToggle('external', ['jobs', 'external']);
  const track = useMutation({
    mutationFn: (externalJobId: string) => api.post<{ application: { id: string } }>('/career/applications', { externalJobId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['career'] });
      toast.success('Added to your application tracker as Saved.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const sync = useMutation({
    mutationFn: () => api.post<{ results: { source: string; status: string; message?: string; fetched: number }[] }>('/jobs/feeds/sync-now', {}),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['jobs', 'external'] });
      toast.message(r.results.map((x) => `${x.source}: ${x.status === 'ok' ? `${x.fetched} fetched` : x.status.replace(/_/g, ' ')}`).join(' · '));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const sources = q.data?.sources ?? [];
  const allDisabled = sources.length > 0 && sources.every((s) => !s.enabled);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Input aria-label="Search remote jobs" className="w-full sm:w-64" placeholder="Search title, company or tag" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} />
          <Select aria-label="Source" className="w-full sm:w-44" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value, page: 1 })}>
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s.source} value={s.source}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/jobs/feed" target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-soft">
            <GlobeIcon size={14} aria-hidden /> Public page
          </Link>
          {me.user.platformRole === 'platform_admin' && (
            <Button size="sm" icon={<ArrowsClockwiseIcon size={14} />} loading={sync.isPending} onClick={() => sync.mutate()}>
              Sync now (respects limits)
            </Button>
          )}
        </div>
      </div>
      {sources.length > 0 && <FeedStatusList sources={sources} syncOff={q.data?.backgroundSync === false} />}
      <p className="text-[12.5px] text-muted">Remote jobs from public job APIs, refreshed on a schedule that respects each provider's limits. We link to the original listing; apply on the source site.</p>
      {allDisabled && <Banner tone="warning" title="Job feeds are turned off on this server">An administrator has disabled all external job feeds (JOB_FEEDS).</Banner>}
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon={<GlobeIcon size={22} />} title={f.q || f.source ? 'No remote jobs match' : 'No remote jobs cached yet'} description={f.q || f.source ? 'Try a different search or source.' : q.data?.backgroundSync === false ? 'Automatic job feed sync is turned off on this server, so no external listings have been fetched. An administrator can enable it.' : 'Feeds sync in the background. If a source shows a failed sync above, listings appear once it recovers.'} />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            {q.data.items.map((j) => (
              <ExternalJobRow
                key={j.id}
                job={j}
                to={`/app/jobs/external/${j.id}`}
                actions={
                  <span className="-mr-2 flex gap-1">
                    <Button size="sm" variant="ghost" icon={<KanbanIcon size={14} />} onClick={() => track.mutate(j.id)}>
                      Track
                    </Button>
                    <Button size="sm" variant="ghost" icon={j.saved ? <BookmarkSimpleIcon size={14} weight="fill" /> : <BookmarkIcon size={14} />} onClick={() => save.mutate({ refId: j.id, saved: !!j.saved })}>
                      {j.saved ? 'Unsave' : 'Save'}
                    </Button>
                  </span>
                }
              />
            ))}
          </ul>
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(page) => setF({ ...f, page })} />
        </>
      )}
    </div>
  );
}

type SavedItem = { id: string; kind: 'platform' | 'external'; refId: string; savedAt: string; available: boolean; title: string; company: string; location: string | null; link: string; source: string | null };

function SavedTab() {
  const q = useQuery({ queryKey: ['jobs', 'saved'], queryFn: () => api.get<{ items: SavedItem[] }>('/jobs/saved') });
  const save = useSaveToggle('platform', ['jobs', 'saved']);
  const saveExt = useSaveToggle('external', ['jobs', 'saved']);
  if (q.isLoading) return <SkeletonRows rows={3} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.items.length) return <EmptyState icon={<BookmarkIcon size={22} />} title="No saved jobs" description="Bookmark jobs from either tab to come back to them." />;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
      {q.data.items.map((s) => (
        <li key={s.id} className="flex items-center gap-4 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
            {s.kind === 'external' ? <GlobeIcon size={18} weight="duotone" /> : <BriefcaseIcon size={18} weight="duotone" />}
          </span>
          <div className="min-w-0 flex-1">
            {s.available ? (
              <Link to={s.link} className="text-[14.5px] font-semibold tracking-[-0.005em] hover:text-accent-text">
                {s.title}
              </Link>
            ) : (
              <span className="text-[14.5px] font-semibold text-muted">{s.title}</span>
            )}
            <div className="mt-0.5 text-[12.5px] text-muted">
              {[s.company, s.location, s.kind === 'external' ? `via ${s.source ?? 'feed'}` : 'Platform job', `saved ${timeAgo(s.savedAt)}`].filter(Boolean).join(' · ')}
            </div>
          </div>
          <Button size="sm" variant="ghost" className="-mr-2 shrink-0" onClick={() => (s.kind === 'platform' ? save : saveExt).mutate({ refId: s.refId, saved: true })}>
            Remove
          </Button>
        </li>
      ))}
    </ul>
  );
}

type MyApp = { id: string; postingId: string; title: string; company: string; location: string; stage: string; status: string; appliedAt: string; portfolioShared: boolean; trackerId: string | null; updates: { toStage: string; reason: string; createdAt: string }[] };

function MyApplicationsTab() {
  const q = useQuery({ queryKey: ['jobs', 'my'], queryFn: () => api.get<{ items: MyApp[] }>('/jobs/my/applications') });
  if (q.isLoading) return <SkeletonRows rows={3} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.items.length) return <EmptyState icon={<BriefcaseIcon size={22} />} title="No platform applications yet" description="Applications you send to jobs on this platform appear here with their stage." />;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
      {q.data.items.map((a) => (
        <li key={a.id} className="px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <Link to={`/app/jobs/${a.postingId}`} className="text-[14.5px] font-semibold tracking-[-0.005em] hover:text-accent-text">
                {a.title}
              </Link>
              <div className="mt-0.5 text-[12.5px] text-muted">
                {a.company} · applied {timeAgo(a.appliedAt)} · portfolio {a.portfolioShared ? 'shared' : 'not shared'}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <StatusBadge status={a.status === 'active' ? a.stage : a.status} />
              {a.trackerId && <CardAction to={`/app/career/applications?open=${a.trackerId}`}>Open in tracker</CardAction>}
            </div>
          </div>
          {a.updates.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-md bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
              {a.updates.map((u, i) => (
                <li key={i}>
                  <span className="font-medium text-fg">{formatDate(u.createdAt)}</span>: moved to {u.toStage.replace(/_/g, ' ')}. {u.reason}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function JobsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'platform';
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Job board" description="Jobs from employers on LearnSphere Nexus, plus remote jobs from public job feeds with source credit. No listings are generated." />
      <Tabs
        className="mb-5"
        value={tab}
        onValueChange={(v) => setParams({ tab: v }, { replace: true })}
        tabs={[
          { value: 'platform', label: 'Platform jobs' },
          { value: 'remote', label: 'Remote jobs from public feeds' },
          { value: 'saved', label: 'Saved' },
          { value: 'mine', label: 'My applications' },
        ]}
      />
      {tab === 'platform' && <PlatformTab />}
      {tab === 'remote' && <RemoteTab />}
      {tab === 'saved' && <SavedTab />}
      {tab === 'mine' && <MyApplicationsTab />}
    </div>
  );
}
