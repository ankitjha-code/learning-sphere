import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import clsx from 'clsx';
import { CheckCircleIcon, CircleDashedIcon, CircleHalfIcon, MagnifyingGlassIcon, CodeIcon, DatabaseIcon, GraphIcon, XIcon, TrophyIcon, TargetIcon, FeatherIcon, BarbellIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { PageHeader, ErrorState, SkeletonRows, Skeleton, Input, Select, Badge, EmptyState, Button, ButtonLink, Pagination, StatTile, Card, Tooltip } from '@/components/ui';
import { DIFFICULTY_TONE, type Collection, type ProblemListResponse, type ProblemSummary } from './api';

const PAGE_SIZE = 25;

function StatusIcon({ p }: { p: ProblemSummary }) {
  if (p.solved)
    return (
      <Tooltip content="Solved">
        <CheckCircleIcon size={18} weight="fill" className="text-success" aria-label="Solved" />
      </Tooltip>
    );
  if (p.attempted)
    return (
      <Tooltip content={p.bestScore !== null && p.bestScore > 0 ? `Attempted, best ${Math.round(p.bestScore * 100)}% of tests` : 'Attempted'}>
        <CircleHalfIcon size={18} weight="fill" className="text-warning" aria-label="Attempted" />
      </Tooltip>
    );
  return <CircleDashedIcon size={18} className="text-subtle" aria-label="Not started" />;
}

export default function ProblemListPage() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const [search, setSearch] = useState(get('q'));

  // Functional update: always start from the current URL, so a delayed search update never drops filters set meanwhile.
  const set = (patch: Record<string, string | null>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        if (!('page' in patch)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  // Debounced search keeps the URL in sync without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== get('q')) set({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const filters = { q: get('q'), difficulty: get('difficulty'), type: get('type'), status: get('status'), topic: get('topic'), skill: get('skill'), collection: get('collection') };
  const list = useQuery({
    queryKey: ['practice', 'problems', filters, page],
    queryFn: () => api.get<ProblemListResponse>(`/practice/problems${qs({ ...filters, page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  });
  const collections = useQuery({ queryKey: ['practice', 'collections'], queryFn: () => api.get<{ collections: Collection[] }>('/practice/collections') });
  const counts = list.data?.counts;
  const anyFilter = Object.values(filters).some(Boolean);

  return (
    <div>
      <PageHeader
        title="CodeLab"
        description="Coding and SQL practice that runs in real sandboxes. Solving a problem adds verified evidence to your Skill DNA."
        actions={
          <ButtonLink to="/app/practice/visualize" icon={<GraphIcon size={16} />}>
            Open visualizer
          </ButtonLink>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {counts ? (
          <>
            <StatTile label="Solved" value={`${counts.solved} / ${counts.total}`} hint="Accepted on every test" icon={<TrophyIcon weight="fill" />} tone="success" />
            <StatTile label="Attempted" value={counts.attempted} hint="Started but not yet accepted" icon={<TargetIcon weight="bold" />} tone="warning" />
            <StatTile label="Easy solved" value={`${counts.byDifficulty.easy?.solved ?? 0} / ${counts.byDifficulty.easy?.total ?? 0}`} hint="Warm-ups and fundamentals" icon={<FeatherIcon weight="bold" />} />
            <StatTile
              label="Medium and hard solved"
              value={`${(counts.byDifficulty.medium?.solved ?? 0) + (counts.byDifficulty.hard?.solved ?? 0)} / ${(counts.byDifficulty.medium?.total ?? 0) + (counts.byDifficulty.hard?.total ?? 0)}`}
              hint="Interview-level problems"
              icon={<BarbellIcon weight="bold" />}
              tone="accent"
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-lg" />)
        )}
      </div>

      <section aria-label="Collections" className="mb-5">
        {collections.isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : collections.error ? (
          <ErrorState error={collections.error} onRetry={() => collections.refetch()} />
        ) : (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {collections.data!.collections.map((col) => {
              const active = filters.collection === col.id;
              return (
                <Tooltip key={col.id} content={col.description}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => set({ collection: active ? null : col.id })}
                    className={clsx(
                      'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
                      active ? 'border-accent bg-accent-soft text-accent-text' : 'border-border bg-surface text-muted hover:border-border-strong hover:text-fg',
                    )}
                  >
                    {col.type === 'sql' ? <DatabaseIcon size={14} /> : <CodeIcon size={14} />}
                    {col.title}
                    <span className="tabular-nums text-subtle">
                      {col.solved}/{col.count}
                    </span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        )}
      </section>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_160px_160px_160px]">
        <div className="relative">
          <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search problems or topics" className="pl-9" aria-label="Search problems" />
        </div>
        <Select value={filters.difficulty} onChange={(e) => set({ difficulty: e.target.value || null })} aria-label="Difficulty">
          <option value="">Any difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </Select>
        <Select value={filters.type} onChange={(e) => set({ type: e.target.value || null })} aria-label="Problem type">
          <option value="">Coding and SQL</option>
          <option value="coding">Coding</option>
          <option value="sql">SQL</option>
        </Select>
        <Select value={filters.status} onChange={(e) => set({ status: e.target.value || null })} aria-label="Status">
          <option value="">Any status</option>
          <option value="new">Not started</option>
          <option value="attempted">Attempted</option>
          <option value="solved">Solved</option>
        </Select>
      </div>

      {(filters.topic || filters.skill) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
          {filters.topic && (
            <Badge tone="accent">
              Topic: {filters.topic}
              <button type="button" onClick={() => set({ topic: null })} aria-label="Remove topic filter" className="ml-0.5">
                <XIcon size={11} />
              </button>
            </Badge>
          )}
          {filters.skill && (
            <Badge tone="accent">
              Skill: {filters.skill}
              <button type="button" onClick={() => set({ skill: null })} aria-label="Remove skill filter" className="ml-0.5">
                <XIcon size={11} />
              </button>
            </Badge>
          )}
        </div>
      )}

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <SkeletonRows rows={8} />
      ) : list.data!.items.length === 0 ? (
        <EmptyState
          icon={<MagnifyingGlassIcon size={22} />}
          title={anyFilter ? 'No problems match these filters' : 'No practice problems yet'}
          description={anyFilter ? 'Try a different search or clear the filters to see every problem.' : 'Problems appear here once the learning library is seeded.'}
          action={
            anyFilter ? (
              <Button
                onClick={() => {
                  setSearch('');
                  setParams(new URLSearchParams(), { replace: true });
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Card className={clsx('overflow-hidden', list.isFetching && 'opacity-70')}>
            <ul className="divide-y divide-border">
              {list.data!.items.map((p) => (
                <li key={p.id} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2">
                  <StatusIcon p={p} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/app/practice/${p.slug ?? p.id}`} className="text-[14px] font-medium text-fg hover:text-accent-text">
                      {p.title}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {p.topics.slice(0, 4).map((t) => (
                        <button key={t} type="button" onClick={() => set({ topic: t })} className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-muted ring-1 ring-inset ring-border transition-colors hover:text-fg">
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="hidden max-w-[260px] shrink-0 flex-wrap justify-end gap-x-1.5 text-[12px] text-subtle md:flex">
                    {p.skills.slice(0, 2).map((s, i) => (
                      <span key={s.id} className="inline-flex items-center gap-1.5">
                        {i > 0 && <span aria-hidden>·</span>}
                        <Link to={`/app/skills/${s.slug}`} className="hover:text-fg">
                          {s.name}
                        </Link>
                      </span>
                    ))}
                  </div>
                  <div className="flex w-[92px] shrink-0 items-center justify-end gap-1.5">
                    {p.type === 'sql' && (
                      <Badge tone="info" icon={<DatabaseIcon size={11} />}>
                        SQL
                      </Badge>
                    )}
                    <Badge tone={DIFFICULTY_TONE[p.difficulty]}>{p.difficulty[0].toUpperCase() + p.difficulty.slice(1)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data!.total} onPage={(p) => set({ page: String(p) })} />
        </>
      )}
    </div>
  );
}
