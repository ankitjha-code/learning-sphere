import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { NotebookIcon, LockKeyIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, Input, Menu, Pagination, Select, SkeletonRows, Textarea } from '@/components/ui';

type Entry = { id: string; kind: 'reflection' | 'weekly_review' | 'career'; title: string | null; body: string; mood: number | null; createdAt: string };
const KIND_LABEL: Record<Entry['kind'], string> = { reflection: 'Reflection', weekly_review: 'Weekly review', career: 'Career' };
const MOODS = ['Rough', 'Low', 'Okay', 'Good', 'Great'];
const PROMPTS: Record<Entry['kind'], string> = {
  reflection: 'What did you learn today? What surprised you?',
  weekly_review: 'What went well this week? What will you change next week?',
  career: 'What are you working toward, and what is the next small step?',
};

function EntryForm({ entry, onDone }: { entry?: Entry; onDone: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Entry['kind']>(entry?.kind ?? 'reflection');
  const [title, setTitle] = useState(entry?.title ?? '');
  const [body, setBody] = useState(entry?.body ?? '');
  const [mood, setMood] = useState<number | null>(entry?.mood ?? null);
  const m = useMutation({
    mutationFn: () => {
      const payload = { kind, title: title || null, body, mood };
      return entry ? api.patch(`/motivation/journal/${entry.id}`, payload) : api.post('/motivation/journal', payload);
    },
    onSuccess: () => {
      toast.success(entry ? 'Entry updated' : 'Entry saved');
      qc.invalidateQueries({ queryKey: ['journal'] });
      if (!entry) {
        setTitle('');
        setBody('');
        setMood(null);
      }
      onDone();
    },
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Entry['kind'])}>
            {Object.entries(KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title" optional>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
        </Field>
      </div>
      <Field label="Entry" error={fields.body}>
        <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder={PROMPTS[kind]} maxLength={20000} />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Mood (optional)" className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[12.5px] text-muted">Mood</span>
          {MOODS.map((label, i) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={mood === i + 1}
              onClick={() => setMood(mood === i + 1 ? null : i + 1)}
              className={clsx('h-7 rounded-md border px-2 text-[12px]', mood === i + 1 ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted hover:bg-surface-2')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {entry && <Button onClick={onDone}>Cancel</Button>}
          <Button variant="primary" loading={m.isPending} disabled={!body.trim()} disabledReason="Write something first" onClick={() => m.mutate()}>
            {entry ? 'Save changes' : 'Save entry'}
          </Button>
        </div>
      </div>
      {m.error && !Object.keys(fields).length && <p className="text-[12.5px] text-danger">{errorMessage(m.error)}</p>}
    </div>
  );
}

export default function JournalTab() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const q = useQuery({ queryKey: ['journal', page, kind], queryFn: () => api.get<{ items: Entry[]; total: number; pageSize: number }>(`/motivation/journal?page=${page}&pageSize=10${kind ? `&kind=${kind}` : ''}`) });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/motivation/journal/${id}`),
    onSuccess: () => (toast.success('Entry deleted'), setDeleting(null), qc.invalidateQueries({ queryKey: ['journal'] })),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <LockKeyIcon size={14} /> Private. Only you can read your journal.
          </p>
          <div className="w-44">
            <Select value={kind} onChange={(e) => (setKind(e.target.value), setPage(1))} aria-label="Filter entries">
              <option value="">All entries</option>
              {Object.entries(KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {q.isLoading ? (
          <SkeletonRows rows={3} />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data!.items.length ? (
          <EmptyState icon={<NotebookIcon size={22} />} title="No entries yet" description="A few lines after a study session helps you notice what works for you." />
        ) : (
          <>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            {q.data!.items.map((e) => (
              <li key={e.id} className="px-5 py-4">
                  {editing === e.id ? (
                    <EntryForm entry={e} onDone={() => setEditing(null)} />
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {e.title && <span className="text-[14px] font-semibold">{e.title}</span>}
                          <Badge>{KIND_LABEL[e.kind]}</Badge>
                          {e.mood && <Badge tone="neutral">{MOODS[e.mood - 1]}</Badge>}
                          <span className="text-[12px] text-subtle">{formatDate(e.createdAt)}</span>
                        </div>
                        <Menu
                          items={[
                            { label: 'Edit', onSelect: () => setEditing(e.id) },
                            { label: 'Delete', danger: true, onSelect: () => setDeleting(e) },
                          ]}
                        />
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed">{e.body}</p>
                    </>
                  )}
              </li>
            ))}
            </ul>
            <Pagination page={page} pageSize={q.data!.pageSize} total={q.data!.total} onPage={setPage} />
          </>
        )}
      </div>
      <Card className="self-start">
        <CardHeader title="New entry" />
        <CardBody>
          <EntryForm onDone={() => {}} />
        </CardBody>
      </Card>
      <ConfirmDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)} title="Delete this entry?" description="This cannot be undone." confirmLabel="Delete entry" danger loading={del.isPending} onConfirm={() => {
          if (deleting) del.mutate(deleting.id);
        }} />
    </div>
  );
}
