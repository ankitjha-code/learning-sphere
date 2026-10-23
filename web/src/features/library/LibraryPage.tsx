import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BooksIcon, MagnifyingGlassIcon, FolderIcon, ClockCounterClockwiseIcon, BrainIcon, FunnelSimpleIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { PageHeader, ButtonLink, Button, Input, Select, Switch, Field, EmptyState, ErrorState, Skeleton, Pagination, Card } from '@/components/ui';
import { ResourceCardView, useDebounced, kindLabel, cap, type ResourceCard } from './shared';

type Facet = { value: string; count: number };
type Facets = {
  kinds: Facet[];
  topics: Facet[];
  languages: Facet[];
  roles: Facet[];
  skills: { value: string; label: string; count: number }[];
  orgResources: number;
};
type ListResponse = { items: ResourceCard[]; total: number; page: number; pageSize: number };

const PAGE_SIZE = 24;
const FILTER_KEYS = ['kind', 'topic', 'difficulty', 'language', 'role', 'skill', 'scope'] as const;

export default function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounced(search.trim(), 300);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const get = (k: string) => params.get(k) ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const sort = get('sort') || 'relevance';

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

  const facets = useQuery({ queryKey: ['library', 'facets'], queryFn: () => api.get<Facets>('/library/facets'), staleTime: 60_000 });

  const listParams = {
    q: get('q'),
    kind: get('kind'),
    topic: get('topic'),
    difficulty: get('difficulty'),
    language: get('language'),
    role: get('role'),
    skill: get('skill'),
    scope: get('scope'),
    sort,
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: ['library', 'resources', listParams],
    queryFn: () => api.get<ListResponse>(`/library/resources${qs(listParams)}`),
    placeholderData: keepPreviousData,
  });

  const activeFilters = FILTER_KEYS.filter((k) => !!get(k)).length;
  const clearAll = () => {
    setSearch('');
    setParams(new URLSearchParams(sort !== 'relevance' ? { sort } : {}), { replace: true });
  };

  const f = facets.data;
  const filterSelect = (key: string, label: string, options: { value: string; label: string; count?: number }[]) => (
    <Field label={label}>
      <Select value={get(key)} onChange={(e) => update({ [key]: e.target.value || null })}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.count !== undefined ? ` (${o.count})` : ''}
          </option>
        ))}
      </Select>
    </Field>
  );

  const filters = (
    <div className="space-y-3">
      {facets.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : facets.error ? (
        <ErrorState error={facets.error} onRetry={() => facets.refetch()} />
      ) : f ? (
        <>
          {f.orgResources > 0 && (
            <Switch
              checked={get('scope') === 'org'}
              onCheckedChange={(v) => update({ scope: v ? 'org' : null })}
              label="My organizations only"
              description={`${f.orgResources} resources shared by your organizations`}
            />
          )}
          {filterSelect(
            'kind',
            'Type',
            f.kinds.map((k) => ({ value: k.value, label: kindLabel(k.value), count: k.count })),
          )}
          {filterSelect('difficulty', 'Difficulty', [
            { value: 'beginner', label: 'Beginner' },
            { value: 'intermediate', label: 'Intermediate' },
            { value: 'advanced', label: 'Advanced' },
          ])}
          {filterSelect(
            'topic',
            'Topic',
            f.topics.map((t) => ({ value: t.value, label: cap(t.value), count: t.count })),
          )}
          {f.skills.length > 0 && filterSelect('skill', 'Skill', f.skills)}
          {f.languages.length > 0 &&
            filterSelect(
              'language',
              'Language',
              f.languages.map((l) => ({ value: l.value, label: l.value, count: l.count })),
            )}
          {f.roles.length > 0 &&
            filterSelect(
              'role',
              'Role',
              f.roles.map((r) => ({ value: r.value, label: r.value, count: r.count })),
            )}
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear filters
            </Button>
          )}
        </>
      ) : null}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Library"
        description="Curated articles, docs, videos and cheatsheets, plus anything your organizations share with you."
        actions={
          <>
            <ButtonLink to="/app/library/collections" icon={<FolderIcon size={16} />}>
              Collections
            </ButtonLink>
            <ButtonLink to="/app/library/history" icon={<ClockCounterClockwiseIcon size={16} />}>
              History
            </ButtonLink>
            <ButtonLink to="/app/library/knowledge" icon={<BrainIcon size={16} />}>
              My knowledge base
            </ButtonLink>
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles, topics and content"
            aria-label="Search the library"
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <div className="w-44">
            <Select value={sort} onChange={(e) => update({ sort: e.target.value === 'relevance' ? null : e.target.value })} aria-label="Sort by">
              <option value="relevance">Most relevant</option>
              <option value="newest">Newest</option>
              <option value="top_rated">Top rated</option>
            </Select>
          </div>
          <Button className="lg:hidden" icon={<FunnelSimpleIcon size={16} />} onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}>
            Filters{activeFilters ? ` (${activeFilters})` : ''}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
        <aside className={filtersOpen ? 'block' : 'hidden lg:block'} aria-label="Filters">
          <Card className="p-5 lg:sticky lg:top-4">{filters}</Card>
        </aside>

        <section aria-live="polite" aria-busy={list.isFetching}>
          {list.error ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : list.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-lg" />
              ))}
            </div>
          ) : !list.data || list.data.items.length === 0 ? (
            <EmptyState
              icon={<BooksIcon size={22} />}
              title={activeFilters || get('q') ? 'No resources match' : 'The library is empty'}
              description={
                activeFilters || get('q')
                  ? 'Try a broader search or remove some filters.'
                  : 'Nothing has been published to the library yet. Check back soon.'
              }
              action={
                activeFilters || get('q') ? (
                  <Button variant="primary" onClick={clearAll}>
                    Clear search and filters
                  </Button>
                ) : (
                  <ButtonLink variant="primary" to="/app/library/knowledge">
                    Upload your own notes
                  </ButtonLink>
                )
              }
            />
          ) : (
            <>
              <p className="mb-3 text-[12.5px] tabular-nums text-subtle">
                {list.data.total} {list.data.total === 1 ? 'resource' : 'resources'}
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {list.data.items.map((r) => (
                  <ResourceCardView key={r.id} card={r} />
                ))}
              </div>
              <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={(p) => update({ page: String(p) }, true)} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
