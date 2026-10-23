import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import { FolderIcon, FolderOpenIcon, BookmarkSimpleIcon, TrashIcon, ArrowsLeftRightIcon, BooksIcon, CaretLeftIcon } from '@phosphor-icons/react';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { PageHeader, ButtonLink, Button, EmptyState, ErrorState, SkeletonRows, Skeleton, Dialog, Field, Input, Select, ConfirmDialog, Menu } from '@/components/ui';
import { KindIcon, kindLabel, DifficultyBadge, RatingInline, type Collection, type ResourceCard } from './shared';

type BookmarkItem = { bookmarkId: string; collection: string | null; savedAt: string; resource: ResourceCard };

/** Selection key: '' = all bookmarks, '__unsorted' = null collection, otherwise the collection name. */
const UNSORTED = '__unsorted';

export default function CollectionsPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('c') ?? '';
  const qc = useQueryClient();

  const cols = useQuery({ queryKey: ['library', 'collections'], queryFn: () => api.get<{ collections: Collection[] }>('/library/collections') });
  const listQs = selected === UNSORTED ? qs({ unsorted: 'true' }) : qs({ collection: selected || undefined });
  const list = useQuery({
    queryKey: ['library', 'bookmarks', selected],
    queryFn: () => api.get<{ items: BookmarkItem[] }>(`/library/bookmarks${listQs}`),
  });

  const [moving, setMoving] = useState<BookmarkItem | null>(null);
  const [removing, setRemoving] = useState<BookmarkItem | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['library', 'collections'] });
    qc.invalidateQueries({ queryKey: ['library', 'bookmarks'] });
    qc.invalidateQueries({ queryKey: ['library', 'resources'] });
    qc.invalidateQueries({ queryKey: ['library', 'resource'] });
  };

  const remove = useMutation({
    mutationFn: (b: BookmarkItem) => api.del(`/library/resources/${b.resource.id}/bookmark`),
    onSuccess: () => {
      toast.success('Bookmark removed');
      setRemoving(null);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const total = (cols.data?.collections ?? []).reduce((n, c) => n + c.count, 0);
  const select = (v: string) => setParams(v ? { c: v } : {}, { replace: true });
  const selectedLabel = selected === UNSORTED ? 'Unsorted' : selected || 'All bookmarks';

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/library" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={14} aria-hidden /> Library
          </Link>
        }
        title="Collections"
        description="Your bookmarked resources, grouped the way you like. Save into a collection from any resource page."
        actions={
          <ButtonLink to="/app/library" icon={<BooksIcon size={16} />}>
            Browse library
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[232px_minmax(0,1fr)] md:gap-8">
        <aside aria-label="Collections">
          {cols.isLoading ? (
            <SkeletonRows rows={4} />
          ) : cols.error ? (
            <ErrorState error={cols.error} onRetry={() => cols.refetch()} />
          ) : (
            <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
              <CollectionLink active={selected === ''} onClick={() => select('')} label="All bookmarks" count={total} icon={<BookmarkSimpleIcon size={16} />} />
              {(cols.data?.collections ?? []).map((c) => {
                const v = c.name ?? UNSORTED;
                return (
                  <CollectionLink
                    key={v}
                    active={selected === v}
                    onClick={() => select(v)}
                    label={c.name ?? 'Unsorted'}
                    count={c.count}
                    icon={selected === v ? <FolderOpenIcon size={16} /> : <FolderIcon size={16} />}
                  />
                );
              })}
            </nav>
          )}
        </aside>

        <section aria-live="polite">
          <div className="mb-3 flex items-end justify-between gap-4">
            <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{selectedLabel}</h2>
            {!!list.data?.items.length && <span className="text-[12.5px] tabular-nums text-subtle">{list.data.items.length} saved</span>}
          </div>
          {list.isLoading ? (
            <Skeleton className="h-72 rounded-lg" />
          ) : list.error ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : !list.data?.items.length ? (
            <EmptyState
              icon={<BookmarkSimpleIcon size={22} />}
              title={selected ? 'This collection is empty' : 'No bookmarks yet'}
              description="Bookmark resources from the library and they will show up here."
              action={
                <ButtonLink variant="primary" to="/app/library">
                  Browse the library
                </ButtonLink>
              }
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
              {list.data.items.map((b) => (
                <li key={b.bookmarkId} className="relative flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                      <KindIcon kind={b.resource.kind} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link to={`/app/library/${b.resource.id}`} className="text-[14.5px] font-semibold leading-snug tracking-[-0.005em] after:absolute after:inset-0 hover:text-accent-text">
                        {b.resource.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px] text-muted">
                        <span>
                          {kindLabel(b.resource.kind)}
                          {b.resource.sourceName && <> · {b.resource.sourceName}</>}
                        </span>
                        <DifficultyBadge difficulty={b.resource.difficulty} />
                        <RatingInline avg={b.resource.ratingAvg} count={b.resource.ratingCount} />
                        {!selected && (
                          <span className="inline-flex items-center gap-1">
                            <FolderIcon size={12} aria-hidden /> {b.collection ?? 'Unsorted'}
                          </span>
                        )}
                        <span>Saved {formatDate(b.savedAt)}</span>
                      </div>
                    </div>
                    <div className="relative z-10 -mr-2 shrink-0">
                    <Menu
                      label={`Actions for ${b.resource.title}`}
                      items={[
                        { label: 'Move to collection', icon: <ArrowsLeftRightIcon size={15} />, onSelect: () => setMoving(b) },
                        'separator',
                        { label: 'Remove bookmark', icon: <TrashIcon size={15} />, danger: true, onSelect: () => setRemoving(b) },
                      ]}
                    />
                    </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {moving && (
        <MoveDialog
          item={moving}
          collections={(cols.data?.collections ?? []).map((c) => c.name).filter((n): n is string => !!n)}
          onClose={() => setMoving(null)}
          onMoved={invalidate}
        />
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title="Remove bookmark?"
        description={removing ? `"${removing.resource.title}" will be removed from your bookmarks. You can bookmark it again any time.` : ''}
        confirmLabel="Remove"
        danger
        loading={remove.isPending}
        onConfirm={() => {
          if (removing) remove.mutate(removing);
        }}
      />
    </div>
  );
}

function CollectionLink({ active, onClick, label, count, icon }: { active: boolean; onClick: () => void; label: string; count: number; icon: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={clsx(
        'flex h-9 shrink-0 items-center gap-2.5 rounded-md px-3 text-left text-[13.5px] transition-colors md:w-full',
        active ? 'bg-accent-soft font-medium text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      <span aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-[12px] tabular-nums text-subtle">{count}</span>
    </button>
  );
}

const NEW = '__new';

function MoveDialog({ item, collections, onClose, onMoved }: { item: BookmarkItem; collections: string[]; onClose: () => void; onMoved: () => void }) {
  const [target, setTarget] = useState(item.collection ?? UNSORTED);
  const [newName, setNewName] = useState('');
  const m = useMutation({
    mutationFn: () => {
      const collection = target === UNSORTED ? null : target === NEW ? newName.trim() : target;
      return api.patch<{ ok: true; collection: string | null }>(`/library/bookmarks/${item.bookmarkId}`, { collection });
    },
    onSuccess: (r) => {
      toast.success(`Moved to ${r.collection ?? 'Unsorted'}`);
      onMoved();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const invalid = target === NEW && !newName.trim();
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="Move bookmark"
      description={item.resource.title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={invalid} disabledReason="Name the new collection" onClick={() => m.mutate()}>
            Move
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Collection">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value={UNSORTED}>Unsorted</option>
            {collections.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={NEW}>New collection...</option>
          </Select>
        </Field>
        {target === NEW && (
          <Field label="New collection name">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} autoFocus />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
