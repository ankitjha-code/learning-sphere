import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BooksIcon, MagnifyingGlassIcon, PlusIcon, StarIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PageHeader, ButtonLink, Button, Input, Select, Tabs, EmptyState, ErrorState, SkeletonRows, Pagination, Card } from '@/components/ui';
import { ResourceStatus, KIND_LABEL, Breadcrumb, type ResourceSummary } from './shared';

const PAGE_SIZE = 25;

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function ResourcesListPage() {
  const [params, setParams] = useSearchParams();
  const scope = params.get('scope') ?? 'all';
  const status = params.get('status') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounced(search.trim());

  const update = (patch: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) update({ q: debounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const listParams = { scope, status: status || undefined, q: params.get('q') || undefined, page, pageSize: PAGE_SIZE };
  const q = useQuery({
    queryKey: ['create', 'resources', listParams],
    queryFn: () => api.get<{ items: ResourceSummary[]; total: number; canAuthorOrg: boolean }>(`/create/resources${qs(listParams)}`),
    placeholderData: keepPreviousData,
  });

  const canAuthorOrg = q.data?.canAuthorOrg ?? true;
  const tabs = [{ value: 'all', label: 'All' }, ...(canAuthorOrg ? [{ value: 'org', label: 'Organization' }] : []), { value: 'public', label: 'Public' }, { value: 'mine', label: 'Mine' }];
  const filtered = !!(status || params.get('q'));

  return (
    <div>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Creator studio', to: '/app/create' }, { label: 'Resources' }]} />}
        title="Resources"
        description="Everything you can edit: your public submissions and your organization's library."
        actions={
          <ButtonLink to="/app/create/resources/new" variant="primary" icon={<PlusIcon size={16} />}>
            New resource
          </ButtonLink>
        }
      />

      <Tabs value={tabs.some((t) => t.value === scope) ? scope : 'all'} onValueChange={(v) => update({ scope: v === 'all' ? null : v })} tabs={tabs} className="mb-4" />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title" aria-label="Search resources" className="pl-9" />
        </div>
        <div className="sm:w-52">
          <Select value={status} onChange={(e) => update({ status: e.target.value || null })} aria-label="Filter by status">
            <option value="">Any status</option>
            <option value="draft">Draft</option>
            <option value="in_review">In review</option>
            <option value="published">Published</option>
            <option value="rejected">Changes requested</option>
            <option value="archived">Archived</option>
          </Select>
        </div>
      </div>

      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <SkeletonRows rows={8} />
      ) : !q.data?.items.length ? (
        <EmptyState
          icon={<BooksIcon size={22} />}
          title={filtered ? 'No resources match' : 'No resources yet'}
          description={filtered ? 'Try another status or search term.' : 'Create a resource to share an article, cheatsheet or curated link.'}
          action={
            filtered ? (
              <Button
                variant="primary"
                onClick={() => {
                  setSearch('');
                  update({ status: null, q: null });
                }}
              >
                Clear filters
              </Button>
            ) : (
              <ButtonLink to="/app/create/resources/new" variant="primary" icon={<PlusIcon size={16} />}>
                New resource
              </ButtonLink>
            )
          }
        />
      ) : (
        <>
          {/* Table on wide screens */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-[12px] text-muted">
                  <th className="h-10 px-4 pl-5 font-medium">Title</th>
                  <th className="h-10 px-4 font-medium">Status</th>
                  <th className="h-10 px-4 text-right font-medium">Views</th>
                  <th className="h-10 px-4 text-right font-medium">Rating</th>
                  <th className="h-10 px-4 text-right font-medium">Completions</th>
                  <th className="h-10 px-4 text-right font-medium">Bookmarks</th>
                  <th className="h-10 px-4 font-medium">Updated</th>
                  <th className="h-10 px-4 pr-5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {q.data.items.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface-2/50">
                    <td className="px-4 py-3 pl-5">
                      <Link to={`/app/create/resources/${r.id}`} className="font-medium text-fg hover:underline">
                        {r.title}
                      </Link>
                      <div className="mt-0.5 text-[12.5px] text-muted">
                        {KIND_LABEL[r.kind] ?? r.kind} · {r.scope === 'org' ? 'Organization' : 'Public'} · v{r.version}
                        {r.analytics.openReports > 0 && <span className="text-warning"> · {r.analytics.openReports} open reports</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ResourceStatus status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.analytics.views.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.analytics.ratingAvg !== null ? (
                        <span className="inline-flex items-center gap-1">
                          <StarIcon size={12} weight="fill" className="text-xp" aria-hidden />
                          {r.analytics.ratingAvg.toFixed(1)} <span className="text-subtle">({r.analytics.ratingCount})</span>
                        </span>
                      ) : (
                        <span className="text-subtle">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.analytics.completions}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.analytics.bookmarks}</td>
                    <td className="px-4 py-3 text-muted">{timeAgo(r.updatedAt)}</td>
                    <td className="px-4 py-3 pr-5 text-right">
                      <Link to={`/app/create/resources/${r.id}`} className="inline-flex rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-fg" aria-label={`Edit ${r.title}`}>
                        <PencilSimpleIcon size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Cards on small screens */}
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1 md:hidden">
            {q.data.items.map((r) => (
              <li key={r.id} className="relative px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/app/create/resources/${r.id}`} className="font-medium after:absolute after:inset-0 hover:text-accent-text">
                    {r.title}
                  </Link>
                  <ResourceStatus status={r.status} />
                </div>
                <div className="mt-1 text-[12.5px] text-muted">
                  {KIND_LABEL[r.kind] ?? r.kind} · {r.scope === 'org' ? 'Organization' : 'Public'} · {r.analytics.views} views · {r.analytics.completions} completions
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={(p) => update({ page: String(p) }, true)} />
        </>
      )}
    </div>
  );
}
