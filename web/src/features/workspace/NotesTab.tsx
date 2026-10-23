import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { NotebookIcon, NotePencilIcon, PushPinIcon, LinkIcon, MagnifyingGlassIcon, BooksIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Button, ConfirmDialog, EmptyState, ErrorState, Input, SkeletonRows } from '@/components/ui';
import { NoteEditor } from './NoteEditor';
import { isLinkType, useDebounced, type NoteListItem, type NotesResponse } from './types';

function plainExcerpt(s: string) {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function NotesTab() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('note');
  const isNew = !selectedId && params.get('new') === 'note';
  const rawLinkType = params.get('linkType');
  const linkId = params.get('linkId');
  const initialLink =
    isNew && isLinkType(rawLinkType) && linkId ? { linkType: rawLinkType, linkId, linkLabel: params.get('linkLabel') || null } : null;

  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const [tag, setTag] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);

  const list = useQuery({
    queryKey: ['workspace', 'notes', { q: dq, tag }],
    queryFn: () => api.get<NotesResponse>(`/workspace/notes${qs({ q: dq, tag, pageSize: 100 })}`),
    placeholderData: keepPreviousData,
  });

  /** Asks before leaving an editor with unsaved changes. */
  const guard = (fn: () => void) => {
    if (dirty) setPendingNav(() => fn);
    else fn();
  };
  const openNote = (id: string) => {
    if (id === selectedId) return;
    guard(() => setParams({ note: id }));
  };
  const newNote = () => guard(() => setParams({ new: 'note' }));
  const closeEditor = () => guard(() => setParams({}));

  const editorOpen = !!selectedId || isNew;
  const editorKey = selectedId ?? `new:${initialLink?.linkType ?? ''}:${initialLink?.linkId ?? ''}`;
  const filtered = !!dq || !!tag;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* List pane */}
      <section aria-label="Notes" className={clsx('min-w-0 space-y-3', editorOpen && 'hidden lg:block')}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MagnifyingGlassIcon size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" aria-label="Search notes" className="pl-8" />
          </div>
          <Button variant="primary" icon={<NotePencilIcon size={16} />} onClick={newNote}>
            New note
          </Button>
        </div>

        {!!list.data?.tags.length && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
            <TagChip active={!tag} onClick={() => setTag(null)}>
              All
            </TagChip>
            {list.data.tags.map((t) => (
              <TagChip key={t.tag} active={tag === t.tag} onClick={() => setTag(tag === t.tag ? null : t.tag)}>
                {t.tag} <span className="tabular-nums text-subtle">{t.count}</span>
              </TagChip>
            ))}
          </div>
        )}

        {list.isLoading ? (
          <SkeletonRows rows={6} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data?.items.length ? (
          filtered ? (
            <EmptyState
              icon={<MagnifyingGlassIcon size={22} />}
              title="No notes match"
              description="Try a different search or tag."
              action={
                <Button
                  onClick={() => {
                    setQ('');
                    setTag(null);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<NotebookIcon size={22} />}
              title="No notes yet"
              description="Write notes while you learn. Notes you start from a topic or resource stay linked to it."
              action={
                <Button variant="primary" icon={<NotePencilIcon size={16} />} onClick={newNote}>
                  Write a note
                </Button>
              }
            />
          )
        ) : (
          <>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1" aria-busy={list.isFetching || undefined}>
              {list.data.items.map((n) => (
                <NoteRow key={n.id} note={n} active={n.id === selectedId} onOpen={() => openNote(n.id)} />
              ))}
            </ul>
            {list.data.total > list.data.items.length && (
              <p className="text-[12.5px] text-subtle">
                Showing {list.data.items.length} of {list.data.total}. Search to find older notes.
              </p>
            )}
          </>
        )}

        <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
          <BooksIcon size={14} aria-hidden />
          <span>
            Knowledge base documents live in{' '}
            <Link to="/app/library/knowledge" className="font-medium text-accent-text hover:underline">
              Library, My knowledge base
            </Link>
            .
          </span>
        </p>
      </section>

      {/* Editor pane */}
      <section aria-label="Note editor" className={clsx('min-w-0', !editorOpen && 'hidden lg:block')}>
        {editorOpen ? (
          <NoteEditor
            key={editorKey}
            noteId={selectedId}
            initialLink={initialLink}
            onDirtyChange={setDirty}
            onCreated={(id) => {
              setDirty(false);
              setParams({ note: id }, { replace: true });
            }}
            onDeleted={() => {
              setDirty(false);
              setParams({});
            }}
            onClose={closeEditor}
          />
        ) : (
          <EmptyState
            icon={<NotePencilIcon size={22} />}
            title="Select a note"
            description="Pick a note from the list to read or edit it, or start a new one."
            action={
              <Button variant="primary" icon={<NotePencilIcon size={16} />} onClick={newNote}>
                New note
              </Button>
            }
            className="h-full min-h-72"
          />
        )}
      </section>

      <ConfirmDialog
        open={!!pendingNav}
        onOpenChange={(v) => !v && setPendingNav(null)}
        title="Discard unsaved changes?"
        description="This note has changes that are not saved. Leaving now discards them."
        confirmLabel="Discard changes"
        danger
        onConfirm={() => {
          const fn = pendingNav;
          setPendingNav(null);
          setDirty(false);
          fn?.();
        }}
      />
    </div>
  );
}

function TagChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition-colors',
        active ? 'border-transparent bg-accent-soft text-accent-text' : 'border-border bg-surface text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

function NoteRow({ note, active, onOpen }: { note: NoteListItem; active: boolean; onOpen: () => void }) {
  const excerpt = plainExcerpt(note.excerpt);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active || undefined}
        className={clsx('block w-full px-4 py-3.5 text-left transition-colors hover:bg-surface-2', active && 'bg-accent-soft/50')}
      >
        <span className="flex items-start gap-1.5">
          {note.pinned && <PushPinIcon size={14} weight="fill" className="mt-0.5 shrink-0 text-accent-text" aria-label="Pinned" />}
          <span className="line-clamp-1 text-[14px] font-medium">{note.title}</span>
        </span>
        {excerpt && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-muted">{excerpt}</span>}
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-subtle">
          {note.linkType && (
            <span className="inline-flex max-w-[180px] items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-muted">
              <LinkIcon size={11} aria-hidden />
              <span className="truncate">{note.linkLabel ?? note.linkType}</span>
            </span>
          )}
          {note.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-surface-2 px-1.5 py-0.5 text-muted">
              {t}
            </span>
          ))}
          <span>Updated {timeAgo(note.updatedAt)}</span>
        </span>
      </button>
    </li>
  );
}
