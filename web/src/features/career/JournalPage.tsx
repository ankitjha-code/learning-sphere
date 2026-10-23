import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookBookmarkIcon, FlagIcon, TrashIcon, CheckIcon, LockSimpleIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { PageHeader, Card, CardHeader, CardBody, ErrorState, SkeletonRows, EmptyState, Button, Field, Input, Textarea, Select, Badge, ConfirmDialog, StatusBadge } from '@/components/ui';

type Entry = { id: string; kind: 'reflection' | 'career' | 'weekly_review'; title: string | null; body: string; mood: number | null; createdAt: string };
type Goal = { id: string; title: string; kind: string; status: string; targetDate: string | null };

const KIND_LABEL: Record<Entry['kind'], string> = { reflection: 'Reflection', career: 'Career', weekly_review: 'Weekly review' };
const PROMPTS: Record<Entry['kind'], string> = {
  reflection: 'What did you learn or notice today?',
  career: 'What happened in your job search this week, and what will you change?',
  weekly_review: 'Wins, struggles, and the one thing to focus on next week.',
};

function CareerGoals() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['learning', 'goals'], queryFn: () => api.get<{ goals: Goal[] }>('/learning/goals') });
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const add = useMutation({
    mutationFn: () => api.post('/learning/goals', { title, kind: 'career', targetDate: date ? new Date(date).toISOString() : null }),
    onSuccess: () => {
      setTitle('');
      setDate('');
      qc.invalidateQueries({ queryKey: ['learning', 'goals'] });
      toast.success('Career goal added.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/learning/goals/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['learning', 'goals'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const goals = (q.data?.goals ?? []).filter((g) => g.kind === 'career');
  return (
    <Card>
      <CardHeader title="Career goals" description="Shared with your goals on the learning side." />
      <CardBody className="space-y-3">
        {q.isLoading ? (
          <SkeletonRows rows={2} />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : goals.length === 0 ? (
          <p className="text-[13.5px] text-muted">No career goals yet.</p>
        ) : (
          <ul className="-mt-1 divide-y divide-border">
            {goals.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
                <span className="min-w-0">
                  <span className={g.status === 'done' ? 'text-muted line-through' : ''}>{g.title}</span>
                  {g.targetDate && <span className="text-[12px] text-subtle"> · by {formatDate(g.targetDate)}</span>}
                </span>
                {g.status === 'active' ? (
                  <Button size="sm" variant="ghost" className="-mr-2 shrink-0" icon={<CheckIcon size={14} />} onClick={() => setStatus.mutate({ id: g.id, status: 'done' })}>
                    Mark done
                  </Button>
                ) : (
                  <StatusBadge status={g.status === 'done' ? 'completed' : g.status} />
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-3 border-t border-border pt-4">
          <Field label="New career goal">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Land a junior backend role" />
          </Field>
          <Field label="Target date" optional>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button icon={<FlagIcon size={14} />} disabled={title.trim().length < 2} disabledReason="Write the goal first" loading={add.isPending} onClick={() => add.mutate()}>
            Add goal
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export default function JournalPage() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Entry['kind']>('career');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mood, setMood] = useState('');
  const [editing, setEditing] = useState<Entry | null>(null);
  const [toDelete, setToDelete] = useState<Entry | null>(null);
  const q = useQuery({ queryKey: ['career', 'journal'], queryFn: () => api.get<{ items: Entry[] }>('/career/journal') });
  const reset = () => {
    setTitle('');
    setBody('');
    setMood('');
    setEditing(null);
  };
  const save = useMutation({
    mutationFn: () => {
      const payload = { kind, title: title || null, body, mood: mood ? Number(mood) : null };
      return editing ? api.put(`/career/journal/${editing.id}`, payload) : api.post('/career/journal', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['career', 'journal'] });
      toast.success(editing ? 'Entry updated.' : 'Entry saved.');
      reset();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/career/journal/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['career', 'journal'] });
      setToDelete(null);
      toast.success('Entry deleted.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Growth journal" description="Private notes on your progress, job search and lessons learned." badge={<Badge icon={<LockSimpleIcon size={11} />}>Only you can see this</Badge>} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <Card>
            <CardHeader title={editing ? 'Edit entry' : 'New entry'} />
            <CardBody className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[12rem_1fr_8rem]">
                <Field label="Type">
                  <Select value={kind} onChange={(e) => setKind(e.target.value as Entry['kind'])}>
                    {(Object.keys(KIND_LABEL) as Entry['kind'][]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Title" optional>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label="Mood" optional>
                  <Select value={mood} onChange={(e) => setMood(e.target.value)}>
                    <option value="">Skip</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} of 5
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Entry" helper={PROMPTS[kind]}>
                <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
              </Field>
              <div className="flex justify-end gap-2">
                {editing && <Button onClick={reset}>Cancel</Button>}
                <Button variant="primary" loading={save.isPending} disabled={!body.trim()} disabledReason="Write something first" onClick={() => save.mutate()}>
                  {editing ? 'Save changes' : 'Save entry'}
                </Button>
              </div>
            </CardBody>
          </Card>
          {q.isLoading ? (
            <SkeletonRows rows={3} />
          ) : q.error ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : !q.data?.items.length ? (
            <EmptyState icon={<BookBookmarkIcon size={22} />} title="No entries yet" description="A few lines a week helps you see progress and prepare honest interview stories." />
          ) : (
            <section aria-labelledby="journal-entries">
              <h2 id="journal-entries" className="mb-3 text-[16px] font-semibold tracking-[-0.01em]">
                Entries <span className="font-normal text-subtle">{q.data.items.length}</span>
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                {q.data.items.map((e) => (
                  <li key={e.id} className="group px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <Badge>{KIND_LABEL[e.kind]}</Badge>
                          {e.title && <span className="text-[14.5px] font-semibold tracking-[-0.005em]">{e.title}</span>}
                        </div>
                        <div className="mt-1 text-[12px] text-subtle">
                          {formatDateTime(e.createdAt)}
                          {e.mood && ` · mood ${e.mood}/5`}
                        </div>
                      </div>
                      <div className="-mr-1.5 -mt-1 flex shrink-0 gap-1">
                        <Button size="icon-sm" variant="ghost" aria-label="Edit entry" icon={<PencilSimpleIcon size={14} />} onClick={() => { setEditing(e); setKind(e.kind); setTitle(e.title ?? ''); setBody(e.body); setMood(e.mood ? String(e.mood) : ''); }} />
                        <Button size="icon-sm" variant="ghost" aria-label="Delete entry" icon={<TrashIcon size={14} />} onClick={() => setToDelete(e)} />
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed">{e.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="space-y-5">
          <CareerGoals />
        </aside>
      </div>
      <ConfirmDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)} title="Delete this entry?" description="This cannot be undone." confirmLabel="Delete" danger loading={del.isPending} onConfirm={() => toDelete && del.mutate(toDelete.id)} />
    </div>
  );
}
