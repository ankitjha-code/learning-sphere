import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { TrashIcon, LockKeyIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { Avatar, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorState, Input, Markdown, PageHeader, Segmented, Select, Skeleton, Textarea } from '@/components/ui';
import type { Author } from './shared';

type Task = { id: string; text: string; done: boolean; assigneeId?: string };
type GroupDetail = {
  group: { id: string; name: string; goal: string; maxMembers: number; ownerId: string; createdAt: string; sharedNotes: string | null; sharedTasks: Task[] | null };
  members: Author[];
  isMember: boolean;
  isOwner: boolean;
};

function NotesEditor({ id, initial }: { id: string; initial: string }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial]);
  const save = useMutation({
    mutationFn: () => api.patch(`/community/groups/${id}/notes`, { sharedNotes: text }),
    onSuccess: () => (toast.success('Notes saved'), setMode('view'), qc.invalidateQueries({ queryKey: ['study-group', id] })),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader
        title="Shared notes"
        description="Everyone in the group can edit. Last save wins."
        action={
          <Segmented
            label="Notes mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'view', label: 'View' },
              { value: 'edit', label: 'Edit' },
            ]}
          />
        }
      />
      <CardBody>
        {mode === 'view' ? (
          text ? <Markdown source={text} /> : <p className="text-[13px] text-muted">No notes yet. Switch to Edit to start.</p>
        ) : (
          <div className="space-y-2">
            <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} aria-label="Shared notes" className="font-mono text-[13px]" />
            <div className="flex justify-end gap-2">
              <Button onClick={() => (setText(initial), setMode('view'))}>Discard</Button>
              <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
                Save notes
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function TaskBoard({ id, tasks, members }: { id: string; tasks: Task[]; members: Author[] }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['study-group', id] });
  const add = useMutation({ mutationFn: () => api.post(`/community/groups/${id}/tasks`, { text }), onSuccess: () => (setText(''), refresh()), onError: (e) => toast.error(errorMessage(e)) });
  const patch = useMutation({ mutationFn: ({ tid, body }: { tid: string; body: Record<string, unknown> }) => api.patch(`/community/groups/${id}/tasks/${tid}`, body), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const del = useMutation({ mutationFn: (tid: string) => api.del(`/community/groups/${id}/tasks/${tid}`), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Card>
      <CardHeader title="Task board" description={`${tasks.filter((t) => t.done).length} of ${tasks.length} done`} />
      <CardBody className="space-y-2">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={t.done} onChange={(e) => patch.mutate({ tid: t.id, body: { done: e.target.checked } })} aria-label={`Done: ${t.text}`} />
            <span className={clsx('flex-1 text-[13.5px]', t.done && 'text-muted line-through')}>{t.text}</span>
            <div className="w-36">
              <Select aria-label="Assignee" value={t.assigneeId ?? ''} onChange={(e) => patch.mutate({ tid: t.id, body: { assigneeId: e.target.value || null } })}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <button type="button" className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-danger" aria-label={`Delete ${t.text}`} onClick={() => del.mutate(t.id)}>
              <TrashIcon size={15} />
            </button>
          </div>
        ))}
        <form
          className="flex gap-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) add.mutate();
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task" aria-label="New task" maxLength={300} />
          <Button type="submit" loading={add.isPending} disabled={!text.trim()} disabledReason="Type a task first">
            Add
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

export default function GroupPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const q = useQuery({ queryKey: ['study-group', id], queryFn: () => api.get<GroupDetail>(`/community/groups/${id}`) });
  const join = useMutation({
    mutationFn: () => api.post(`/community/groups/${id}/join`),
    onSuccess: () => (toast.success('Joined the group'), qc.invalidateQueries({ queryKey: ['study-group', id] })),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const leave = useMutation({
    mutationFn: () => api.post(`/community/groups/${id}/leave`),
    onSuccess: () => (toast.success('You left the group'), qc.invalidateQueries({ queryKey: ['study-groups'] }), nav('/app/community/groups')),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const full = d.members.length >= d.group.maxMembers;
  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/community/groups" className="hover:underline">
            Study groups
          </Link>
        }
        title={d.group.name}
        description={d.group.goal}
        actions={
          d.isMember ? (
            <Button variant="ghost" onClick={() => setLeaving(true)}>
              Leave group
            </Button>
          ) : (
            <Button variant="primary" loading={join.isPending} disabled={full} disabledReason="This group is full" onClick={() => join.mutate()}>
              Join group
            </Button>
          )
        }
      />
      <div className="-mt-2 mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        {d.members.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pl-0.5 pr-2.5 text-[12.5px]">
            <Avatar name={m.name} color={m.avatarColor} size={22} />
            {m.name}
            {m.id === d.group.ownerId && <span className="text-subtle">(owner)</span>}
          </span>
        ))}
        <span className="text-[12px] text-subtle">
          {d.members.length}/{d.group.maxMembers} members
        </span>
      </div>
      {!d.isMember ? (
        <EmptyState icon={<LockKeyIcon size={22} />} title="Notes and tasks are for members" description="Join the group to see and edit its shared notes and task board." />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <NotesEditor id={id} initial={d.group.sharedNotes ?? ''} />
          <TaskBoard id={id} tasks={d.group.sharedTasks ?? []} members={d.members} />
        </div>
      )}
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Leave this group?"
        description={d.isOwner ? (d.members.length > 1 ? 'Ownership passes to another member.' : 'You are the last member, so the group and its notes will be deleted.') : 'You can join again later if there is space.'}
        confirmLabel="Leave group"
        danger
        loading={leave.isPending}
        onConfirm={() => leave.mutate()}
      />
    </div>
  );
}
