import { useRef, useState, type Ref } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowSquareOutIcon, LinkIcon, MagnifyingGlassIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { api, errorMessage, qs, ApiError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Button, Card, CardBody, CardHeader, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, SkeletonRows, Textarea } from '@/components/ui';
import { useDebounced, type SavedLink } from './types';

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

type LinkDraft = { title: string; url: string; note: string };

function LinkFields({ value, onChange, fields, titleRef }: { value: LinkDraft; onChange: (v: LinkDraft) => void; fields: Record<string, string>; titleRef?: Ref<HTMLInputElement> }) {
  return (
    <>
      <Field label="Title" error={fields.title}>
        <Input ref={titleRef} value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} maxLength={200} placeholder="MDN guide to flexbox" />
      </Field>
      <Field label="URL" error={fields.url}>
        <Input type="url" inputMode="url" value={value.url} onChange={(e) => onChange({ ...value, url: e.target.value })} maxLength={2000} placeholder="https://" />
      </Field>
      <Field label="Note" optional error={fields.note}>
        <Textarea value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} rows={2} maxLength={2000} placeholder="Why this link is useful" />
      </Field>
    </>
  );
}

export function LinksTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const [draft, setDraft] = useState<LinkDraft>({ title: '', url: '', note: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<SavedLink | null>(null);
  const [deleting, setDeleting] = useState<SavedLink | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const links = useQuery({
    queryKey: ['workspace', 'links', dq],
    queryFn: () => api.get<{ items: SavedLink[]; total: number }>(`/workspace/links${qs({ q: dq })}`),
    placeholderData: keepPreviousData,
  });

  const add = useMutation({
    mutationFn: () => api.post<{ link: SavedLink }>('/workspace/links', { title: draft.title.trim(), url: draft.url.trim(), note: draft.note.trim() || null }),
    onSuccess: () => {
      toast.success('Link saved');
      setDraft({ title: '', url: '', note: '' });
      setFields({});
      qc.invalidateQueries({ queryKey: ['workspace', 'links'] });
    },
    onError: (e) => {
      if (e instanceof ApiError) setFields(e.fields);
      toast.error(errorMessage(e));
    },
  });

  const remove = useMutation({
    mutationFn: (l: SavedLink) => api.del(`/workspace/links/${l.id}`),
    onSuccess: () => {
      setDeleting(null);
      toast.success('Link deleted');
      qc.invalidateQueries({ queryKey: ['workspace', 'links'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const missing = !draft.title.trim() ? 'Add a title first' : !draft.url.trim() ? 'Add a URL first' : undefined;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <div className="order-2 min-w-0 space-y-3 lg:order-1">
        <div className="relative">
          <MagnifyingGlassIcon size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search saved links" aria-label="Search saved links" className="pl-8" />
        </div>
        {links.isLoading ? (
          <SkeletonRows rows={5} />
        ) : links.isError ? (
          <ErrorState error={links.error} onRetry={() => links.refetch()} />
        ) : !links.data?.items.length ? (
          dq ? (
            <EmptyState icon={<MagnifyingGlassIcon size={22} />} title="No links match" description={`Nothing matches "${dq}" in titles, URLs or notes.`} action={<Button onClick={() => setQ('')}>Clear search</Button>} />
          ) : (
            <EmptyState
              icon={<LinkIcon size={22} />}
              title="No saved links yet"
              description="Keep articles, docs and videos you want to come back to, with a note on why they matter."
              action={
                <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => titleRef.current?.focus()}>
                  Save a link
                </Button>
              }
            />
          )
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1" aria-busy={links.isFetching || undefined}>
            {links.data.items.map((l) => (
              <li key={l.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-[14px] font-medium hover:underline">
                    <span className="truncate">{l.title}</span>
                    <ArrowSquareOutIcon size={13} className="shrink-0 text-subtle" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                  <div className="truncate text-[12px] text-subtle">
                    {hostOf(l.url)} · saved {timeAgo(l.createdAt)}
                  </div>
                  {l.note && <p className="mt-1 whitespace-pre-line text-[13px] text-muted">{l.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit link ${l.title}`} title="Edit" onClick={() => setEditing(l)}>
                    <PencilSimpleIcon size={16} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete link ${l.title}`} title="Delete" onClick={() => setDeleting(l)}>
                    <TrashIcon size={16} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Card className="order-1 self-start lg:order-2">
        <CardHeader title="Save a link" description="Only http and https links can be saved." />
        <CardBody>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!missing) add.mutate();
            }}
          >
            <LinkFields value={draft} onChange={setDraft} fields={fields} titleRef={titleRef} />
            <Button type="submit" variant="primary" icon={<PlusIcon size={16} />} loading={add.isPending} disabled={!!missing} disabledReason={missing} className="w-full">
              Save link
            </Button>
          </form>
        </CardBody>
      </Card>

      {editing && <EditLinkDialog key={editing.id} link={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this link?"
        description={deleting ? `"${deleting.title}" will be removed from your saved links.` : ''}
        confirmLabel="Delete link"
        danger
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
      />
    </div>
  );
}

function EditLinkDialog({ link, onClose }: { link: SavedLink; onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<LinkDraft>({ title: link.title, url: link.url, note: link.note ?? '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => api.patch<{ link: SavedLink }>(`/workspace/links/${link.id}`, { title: draft.title.trim(), url: draft.url.trim(), note: draft.note.trim() || null }),
    onSuccess: () => {
      toast.success('Link updated');
      qc.invalidateQueries({ queryKey: ['workspace', 'links'] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError) setFields(e.fields);
      toast.error(errorMessage(e));
    },
  });
  const missing = !draft.title.trim() ? 'Add a title first' : !draft.url.trim() ? 'Add a URL first' : undefined;
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="Edit link"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="edit-link-form" loading={save.isPending} disabled={!!missing} disabledReason={missing}>
            Save link
          </Button>
        </>
      }
    >
      <form
        id="edit-link-form"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!missing) save.mutate();
        }}
      >
        <LinkFields value={draft} onChange={setDraft} fields={fields} />
      </form>
    </Dialog>
  );
}
