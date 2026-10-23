import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowSquareOutIcon, BookmarkSimpleIcon, BooksIcon, FolderIcon, TrashIcon } from '@phosphor-icons/react';
import { api, errorMessage, qs } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Badge, Button, ButtonLink, EmptyState, ErrorState, SkeletonRows } from '@/components/ui';
import { BOOKMARK_TYPES, BOOKMARK_TYPE_LABELS, type Bookmark, type BookmarkType, type BookmarksResponse } from './types';

export function BookmarksTab() {
  const qc = useQueryClient();
  const [type, setType] = useState<BookmarkType | null>(null);

  const bookmarks = useQuery({
    queryKey: ['workspace', 'bookmarks', type],
    queryFn: () => api.get<BookmarksResponse>(`/workspace/bookmarks${qs({ type })}`),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (b: Bookmark) => api.del(`/workspace/bookmarks/${b.id}`),
    onSuccess: (_r, b) => {
      toast.success(`Removed "${b.label}" from bookmarks`);
      qc.invalidateQueries({ queryKey: ['workspace', 'bookmarks'] });
      // Other pages show bookmark state on their items.
      qc.invalidateQueries({ queryKey: ['bookmarks'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const counts = new Map((bookmarks.data?.counts ?? []).map((c) => [c.type, c.count]));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const typesWithItems = BOOKMARK_TYPES.filter((t) => (counts.get(t) ?? 0) > 0 || t === type);

  return (
    <div className="space-y-4">
      {total > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
          <FilterChip active={!type} onClick={() => setType(null)} label="All" count={total} />
          {typesWithItems.map((t) => (
            <FilterChip key={t} active={type === t} onClick={() => setType(type === t ? null : t)} label={BOOKMARK_TYPE_LABELS[t]} count={counts.get(t) ?? 0} />
          ))}
        </div>
      )}

      {bookmarks.isLoading ? (
        <SkeletonRows rows={5} />
      ) : bookmarks.isError ? (
        <ErrorState error={bookmarks.error} onRetry={() => bookmarks.refetch()} />
      ) : !bookmarks.data?.items.length ? (
        type ? (
          <EmptyState
            icon={<BookmarkSimpleIcon size={22} />}
            title={`No ${BOOKMARK_TYPE_LABELS[type].toLowerCase()} bookmarks`}
            description="Bookmarks of this type were removed. Show every type to see the rest."
            action={<Button onClick={() => setType(null)}>Show all bookmarks</Button>}
          />
        ) : (
          <EmptyState
            icon={<BookmarkSimpleIcon size={22} />}
            title="No bookmarks yet"
            description="Bookmark resources, topics, practice problems, jobs, projects and threads, and they collect here in one place."
            action={
              <ButtonLink to="/app/library" variant="primary" icon={<BooksIcon size={16} />}>
                Browse the library
              </ButtonLink>
            }
          />
        )
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1" aria-busy={bookmarks.isFetching || undefined}>
          {bookmarks.data.items.map((b) => {
            const typeLabel = BOOKMARK_TYPE_LABELS[b.targetType as BookmarkType] ?? b.targetType;
            const removing = remove.isPending && remove.variables?.id === b.id;
            return (
              <li key={b.id} className="flex items-start gap-3 px-5 py-3.5">
                <BookmarkSimpleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
                <div className="min-w-0 flex-1">
                  {b.link ? (
                    <Link to={b.link} className="text-[14px] font-medium hover:underline">
                      {b.label}
                    </Link>
                  ) : (
                    <span className="text-[14px] font-medium">{b.label}</span>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-subtle">
                    <Badge tone="accent">{typeLabel}</Badge>
                    {b.collection && (
                      <Badge icon={<FolderIcon size={11} aria-hidden />}>
                        <span className="sr-only">Collection: </span>
                        {b.collection}
                      </Badge>
                    )}
                    <span>Saved {timeAgo(b.createdAt)}</span>
                    {!b.link && <span>This item has no page to open.</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {b.link && (
                    <ButtonLink to={b.link} variant="ghost" size="sm" icon={<ArrowSquareOutIcon size={14} />} aria-label={`Open ${b.label}`}>
                      Open
                    </ButtonLink>
                  )}
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove bookmark ${b.label}`} title="Remove bookmark" loading={removing} onClick={() => remove.mutate(b)}>
                    {!removing && <TrashIcon size={16} />}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors',
        active ? 'border-transparent bg-accent-soft text-accent-text' : 'border-border bg-surface text-muted hover:text-fg',
      )}
    >
      {label}
      <span className="tabular-nums text-subtle">{count}</span>
    </button>
  );
}
