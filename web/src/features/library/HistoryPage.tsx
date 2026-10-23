import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClockCounterClockwiseIcon, CheckCircleIcon, TrashIcon, CaretLeftIcon } from '@phosphor-icons/react';
import { api, errorMessage, qs } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PageHeader, Button, ButtonLink, EmptyState, ErrorState, Skeleton, Pagination, Segmented, ConfirmDialog } from '@/components/ui';
import { KindIcon, kindLabel, DifficultyBadge, type ResourceCard } from './shared';

type HistoryItem = { lastOpenedAt: string; completed: boolean; resource: ResourceCard };
type Filter = 'all' | 'true' | 'false';
const PAGE_SIZE = 30;

export default function HistoryPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(false);

  const params = { page, pageSize: PAGE_SIZE, completed: filter === 'all' ? undefined : filter };
  const q = useQuery({
    queryKey: ['library', 'history', params],
    queryFn: () => api.get<{ items: HistoryItem[]; total: number }>(`/library/history${qs(params)}`),
    placeholderData: keepPreviousData,
  });

  const clear = useMutation({
    mutationFn: () => api.del<{ ok: true; cleared: number }>('/library/history'),
    onSuccess: (r) => {
      toast.success(`Cleared ${r.cleared} ${r.cleared === 1 ? 'entry' : 'entries'}`);
      setConfirm(false);
      setPage(1);
      qc.invalidateQueries({ queryKey: ['library'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const hasItems = !!q.data?.items.length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={
          <Link to="/app/library" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={14} aria-hidden /> Library
          </Link>
        }
        title="Reading history"
        description="Resources you opened, most recent first. Completion is self-reported and only visible to you."
        actions={
          <Button variant="secondary" icon={<TrashIcon size={16} />} onClick={() => setConfirm(true)} disabled={q.isSuccess && !hasItems && filter === 'all'} disabledReason="Your history is already empty">
            Clear history
          </Button>
        }
      />

      <div className="mb-5">
        <Segmented<Filter>
          label="Filter history"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All' },
            { value: 'false', label: 'In progress' },
            { value: 'true', label: 'Completed' },
          ]}
        />
      </div>

      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <Skeleton className="h-80 rounded-lg" />
      ) : !hasItems ? (
        <EmptyState
          icon={<ClockCounterClockwiseIcon size={22} />}
          title={filter === 'all' ? 'No reading history' : filter === 'true' ? 'Nothing completed yet' : 'Nothing in progress'}
          description={filter === 'all' ? 'Resources you open in the library will be listed here.' : 'Try a different filter or open something new from the library.'}
          action={
            <ButtonLink variant="primary" to="/app/library">
              Browse the library
            </ButtonLink>
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            {q.data!.items.map((h) => (
              <li key={h.resource.id} className="relative flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                    <KindIcon kind={h.resource.kind} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link to={`/app/library/${h.resource.id}`} className="text-[14.5px] font-semibold leading-snug tracking-[-0.005em] after:absolute after:inset-0 hover:text-accent-text">
                      {h.resource.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px] text-muted">
                      <span>
                        {kindLabel(h.resource.kind)}
                        {h.resource.sourceName && <> · {h.resource.sourceName}</>}
                      </span>
                      <DifficultyBadge difficulty={h.resource.difficulty} />
                      <span>Opened {timeAgo(h.lastOpenedAt)}</span>
                    </div>
                  </div>
                  {h.completed && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-success">
                      <CheckCircleIcon size={15} weight="fill" aria-hidden /> <span className="hidden sm:inline">Completed</span>
                      <span className="sr-only sm:hidden">Completed</span>
                    </span>
                  )}
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={q.data!.total} onPage={setPage} />
        </>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Clear reading history?"
        description="This removes every entry from your reading history, including completion marks. Bookmarks and ratings are kept. This cannot be undone."
        confirmLabel="Clear history"
        danger
        loading={clear.isPending}
        onConfirm={() => clear.mutate()}
      />
    </div>
  );
}
