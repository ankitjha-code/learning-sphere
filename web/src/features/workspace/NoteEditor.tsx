import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CaretLeftIcon, FloppyDiskIcon, LinkIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Badge, Button, Card, ConfirmDialog, ErrorState, Field, Input, Markdown, Segmented, Skeleton, Switch, TagsInput, Textarea } from '@/components/ui';
import type { LinkType, Note } from './types';

type NoteLink = { linkType: string; linkId: string; linkLabel: string | null };

type Draft = { title: string; body: string; tags: string[]; pinned: boolean; link: NoteLink | null };

const LINK_TYPE_LABELS: Record<string, string> = {
  topic: 'Topic',
  resource: 'Resource',
  project: 'Project',
  problem: 'Problem',
  file: 'File',
  track: 'Track',
  assignment: 'Assignment',
  application: 'Application',
};

function sameDraft(a: Draft, b: Draft) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function NoteEditor({
  noteId,
  initialLink,
  onDirtyChange,
  onCreated,
  onDeleted,
  onClose,
}: {
  noteId: string | null;
  initialLink: { linkType: LinkType; linkId: string; linkLabel: string | null } | null;
  onDirtyChange: (dirty: boolean) => void;
  onCreated: (id: string) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const note = useQuery({
    queryKey: ['workspace', 'note', noteId],
    queryFn: () => api.get<{ note: Note }>(`/workspace/notes/${noteId}`),
    enabled: !!noteId,
  });

  if (noteId) {
    if (note.isLoading) {
      return (
        <Card className="space-y-3 p-4" aria-busy="true" aria-label="Loading note">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-9 w-1/3" />
        </Card>
      );
    }
    if (note.isError || !note.data) {
      return (
        <div className="space-y-3">
          <BackButton onClick={onClose} />
          <ErrorState error={note.error} onRetry={() => note.refetch()} />
        </div>
      );
    }
    return <NoteForm key={note.data.note.id} note={note.data.note} initialLink={null} onDirtyChange={onDirtyChange} onCreated={onCreated} onDeleted={onDeleted} onClose={onClose} />;
  }
  return <NoteForm note={null} initialLink={initialLink} onDirtyChange={onDirtyChange} onCreated={onCreated} onDeleted={onDeleted} onClose={onClose} />;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" icon={<CaretLeftIcon size={14} />} onClick={onClick} className="lg:hidden">
      Back to notes
    </Button>
  );
}

function NoteForm({
  note,
  initialLink,
  onDirtyChange,
  onCreated,
  onDeleted,
  onClose,
}: {
  note: Note | null;
  initialLink: NoteLink | null;
  onDirtyChange: (dirty: boolean) => void;
  onCreated: (id: string) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  // The form is keyed by note id, so the initial draft is computed once.
  const [initial] = useState<Draft>(() =>
    note
      ? {
          title: note.title,
          body: note.body,
          tags: note.tags,
          pinned: note.pinned,
          link: note.linkType && note.linkId ? { linkType: note.linkType, linkId: note.linkId, linkLabel: note.linkLabel } : null,
        }
      : { title: '', body: '', tags: [], pinned: false, link: initialLink },
  );
  const [baseline, setBaseline] = useState<Draft>(initial);
  const [draft, setDraft] = useState<Draft>(initial);
  const [updatedAt, setUpdatedAt] = useState(note?.updatedAt ?? null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  // TagsInput is uncontrolled, so remount it when a discard resets the draft.
  const [resetKey, setResetKey] = useState(0);
  const isNew = !note;
  const dirty = !sameDraft(draft, baseline);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // Warn before closing the tab with unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const payload = {
        title: d.title.trim(),
        body: d.body,
        tags: d.tags,
        pinned: d.pinned,
        linkType: d.link?.linkType ?? null,
        linkId: d.link?.linkId ?? null,
        linkLabel: d.link?.linkLabel ?? null,
      };
      return note ? api.patch<{ note: Note }>(`/workspace/notes/${note.id}`, payload) : api.post<{ note: Note }>('/workspace/notes', payload);
    },
    onSuccess: (res, d) => {
      setFields({});
      setBaseline(d);
      setUpdatedAt(res.note.updatedAt);
      qc.setQueryData(['workspace', 'note', res.note.id], res);
      qc.invalidateQueries({ queryKey: ['workspace', 'notes'] });
      toast.success(isNew ? 'Note created' : 'Note saved');
      if (isNew) {
        onDirtyChange(false);
        onCreated(res.note.id);
      }
    },
    onError: (e) => {
      if (e instanceof ApiError) setFields(e.fields);
      toast.error(errorMessage(e));
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/workspace/notes/${note!.id}`),
    onSuccess: () => {
      setConfirmDelete(false);
      qc.removeQueries({ queryKey: ['workspace', 'note', note!.id] });
      qc.invalidateQueries({ queryKey: ['workspace', 'notes'] });
      toast.success('Note deleted');
      onDeleted();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const titleMissing = !draft.title.trim();
  const saveBlockedReason = titleMissing ? 'Add a title first' : !dirty ? 'No changes to save' : undefined;
  const trySave = () => {
    if (!saveBlockedReason && !save.isPending) save.mutate(draft);
  };
  const formRef = useRef<HTMLFormElement>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      // Tags commit on blur, so blur first and submit once that update has rendered.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      setTimeout(() => formRef.current?.requestSubmit(), 0);
    }
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const link = draft.link;
  const linkText = link ? `${LINK_TYPE_LABELS[link.linkType] ?? link.linkType}: ${link.linkLabel ?? link.linkId}` : '';

  return (
    <Card className="p-4" onKeyDown={onKeyDown}>
      <form
        ref={formRef}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          trySave();
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BackButton onClick={onClose} />
          <div className="flex items-center gap-2 text-[12.5px] text-subtle" aria-live="polite">
            {dirty ? (
              <Badge tone="warning">Unsaved changes</Badge>
            ) : isNew ? (
              <span>New note, not saved yet</span>
            ) : (
              <span>Saved {timeAgo(updatedAt)}</span>
            )}
          </div>
        </div>

        <Field label="Title" error={fields.title}>
          <Input value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="What is this note about?" maxLength={200} autoFocus={isNew} />
        </Field>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="note-body" className="text-[13px] font-medium">
              Note
            </label>
            <Segmented
              label="Editor mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'edit', label: 'Edit' },
                { value: 'preview', label: 'Preview' },
              ]}
            />
          </div>
          {mode === 'edit' ? (
            <Textarea
              id="note-body"
              value={draft.body}
              onChange={(e) => set('body', e.target.value)}
              rows={16}
              placeholder="Write in Markdown. Headings, lists, links and code blocks are supported."
              className="font-mono text-[13.5px]"
              aria-invalid={fields.body ? true : undefined}
              aria-describedby="note-body-hint"
            />
          ) : (
            <div className="min-h-64 rounded-md border border-border bg-surface-2 px-4 py-3">
              {draft.body.trim() ? <Markdown source={draft.body} /> : <p className="text-[13.5px] text-subtle">Nothing to preview yet. Switch to Edit and write something.</p>}
            </div>
          )}
          <p id="note-body-hint" className={fields.body ? 'text-[12.5px] text-danger' : 'text-[12.5px] text-subtle'} role={fields.body ? 'alert' : undefined}>
            {fields.body ?? 'Markdown is supported. Press Ctrl+S or Cmd+S to save.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tags" optional helper="Separate tags with commas." error={fields.tags}>
            <TagsInput key={resetKey} value={draft.tags} onChange={(v) => set('tags', [...new Set(v.map((t) => t.toLowerCase()))])} placeholder="arrays, interview prep" />
          </Field>
          <div className="pt-6">
            <Switch checked={draft.pinned} onCheckedChange={(v) => set('pinned', v)} label="Pin to top" description="Pinned notes are listed first." />
          </div>
        </div>

        {link && (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-muted">Linked to</span>
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent-soft py-0.5 pl-2.5 pr-1 text-accent-text">
              <LinkIcon size={13} aria-hidden />
              {link.linkType === 'resource' ? (
                <Link to={`/app/library/${link.linkId}`} className="truncate font-medium hover:underline">
                  {linkText}
                </Link>
              ) : (
                <span className="truncate font-medium">{linkText}</span>
              )}
              <button
                type="button"
                onClick={() => set('link', null)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-surface"
                aria-label={`Remove link to ${linkText}`}
              >
                <XIcon size={12} />
              </button>
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <div>
            {!isNew && (
              <Button variant="ghost" icon={<TrashIcon size={16} />} onClick={() => setConfirmDelete(true)} className="text-danger hover:text-danger">
                Delete
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {dirty && !isNew && (
              <Button
                variant="ghost"
                disabled={save.isPending}
                onClick={() => {
                  setDraft(baseline);
                  setResetKey((k) => k + 1);
                }}
              >
                Discard changes
              </Button>
            )}
            <Button type="submit" variant="primary" icon={<FloppyDiskIcon size={16} />} loading={save.isPending} disabled={!!saveBlockedReason} disabledReason={saveBlockedReason}>
              {isNew ? 'Create note' : 'Save'}
            </Button>
          </div>
        </div>
      </form>

      {note && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete this note?"
          description={`"${note.title}" will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete note"
          danger
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </Card>
  );
}
