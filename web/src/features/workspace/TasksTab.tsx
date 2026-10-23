import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CheckSquareIcon, PencilSimpleIcon, PlusIcon, TrashIcon, FunnelSimpleIcon } from '@phosphor-icons/react';
import { api, errorMessage, qs, ApiError } from '@/lib/api';
import { dueLabel, formatDateTime, fromLocalInput, timeAgo, toLocalInput } from '@/lib/format';
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Segmented, Select, SkeletonRows, Textarea } from '@/components/ui';
import type { Task, TaskPriority, TasksResponse } from './types';

type StatusFilter = 'all' | 'todo' | 'done';
type DueFilter = '' | 'overdue' | 'today' | 'week' | 'none';

const PRIORITY: Record<TaskPriority, { label: string; tone: 'danger' | 'neutral' | 'info' }> = {
  high: { label: 'High priority', tone: 'danger' },
  normal: { label: 'Normal', tone: 'neutral' },
  low: { label: 'Low priority', tone: 'info' },
};

function invalidateTasks(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['workspace', 'tasks'] });
  qc.invalidateQueries({ queryKey: ['workspace', 'calendar'] });
}

export function TasksTab() {
  const [status, setStatus] = useState<StatusFilter>('todo');
  const [due, setDue] = useState<DueFilter>('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const qc = useQueryClient();

  const tasks = useQuery({
    queryKey: ['workspace', 'tasks', { status, due }],
    queryFn: () => api.get<TasksResponse>(`/workspace/tasks${qs({ status, due: due || undefined })}`),
    placeholderData: keepPreviousData,
  });

  const toggle = useMutation({
    mutationFn: (t: Task) => api.patch<{ task: Task }>(`/workspace/tasks/${t.id}`, { status: t.status === 'done' ? 'todo' : 'done' }),
    onSuccess: (res) => {
      toast.success(res.task.status === 'done' ? 'Task completed' : 'Task reopened');
      invalidateTasks(qc);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (t: Task) => api.del(`/workspace/tasks/${t.id}`),
    onSuccess: () => {
      setDeleting(null);
      toast.success('Task deleted');
      invalidateTasks(qc);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const counts = tasks.data?.counts;
  const filtered = status !== 'all' || !!due;

  return (
    <div className="space-y-4">
      <QuickAdd />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Task status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All' },
              { value: 'todo', label: 'To do' },
              { value: 'done', label: 'Done' },
            ]}
          />
          <div className="w-44">
            <Select value={due} onChange={(e) => setDue(e.target.value as DueFilter)} aria-label="Filter by due date">
              <option value="">Any due date</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="week">Due this week</option>
              <option value="none">No due date</option>
            </Select>
          </div>
        </div>
        {counts && (
          <p className="text-[13px] text-muted" aria-live="polite">
            <span className="font-medium text-fg">{counts.open}</span> open
            {counts.overdue > 0 && (
              <>
                , <span className="font-medium text-danger">{counts.overdue}</span> overdue
              </>
            )}
          </p>
        )}
      </div>

      {tasks.isLoading ? (
        <SkeletonRows rows={5} />
      ) : tasks.isError ? (
        <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} />
      ) : !tasks.data?.items.length ? (
        counts && counts.total > 0 && filtered ? (
          <EmptyState
            icon={<FunnelSimpleIcon size={22} />}
            title={status === 'todo' && !due ? 'Nothing left to do' : 'No tasks match these filters'}
            description={status === 'todo' && !due ? 'Every task is done. Add a new one above when something comes up.' : 'Try another status or due date filter.'}
            action={
              <Button
                onClick={() => {
                  setStatus('all');
                  setDue('');
                }}
              >
                Show all tasks
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<CheckSquareIcon size={22} />}
            title="No tasks yet"
            description="Add study tasks with a due date and they also appear on your calendar."
            action={
              <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => document.getElementById('quick-task-title')?.focus()}>
                Add a task
              </Button>
            }
          />
        )
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1" aria-busy={tasks.isFetching || undefined}>
          {tasks.data.items.map((t) => {
            const d = dueLabel(t.dueAt);
            const done = t.status === 'done';
            const p = PRIORITY[t.priority] ?? PRIORITY.normal;
            return (
              <li key={t.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <Checkbox
                    checked={done}
                    disabled={toggle.isPending && toggle.variables?.id === t.id}
                    onCheckedChange={() => toggle.mutate(t)}
                    label={<span className={clsx(done && 'text-muted line-through')}>{t.title}</span>}
                    description={t.notes ? <span className="line-clamp-2">{t.notes}</span> : undefined}
                  />
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6.5">
                    {done ? (
                      <Badge tone="success">Done {timeAgo(t.completedAt)}</Badge>
                    ) : (
                      t.dueAt && (
                        <span title={formatDateTime(t.dueAt)}>
                          <Badge tone={d.tone}>{d.text}</Badge>
                        </span>
                      )
                    )}
                    <Badge tone={p.tone}>{p.label}</Badge>
                    {t.linkLabel && <Badge tone="accent">{t.linkLabel}</Badge>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit task ${t.title}`} title="Edit" onClick={() => setEditing(t)}>
                    <PencilSimpleIcon size={16} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete task ${t.title}`} title="Delete" onClick={() => setDeleting(t)}>
                    <TrashIcon size={16} />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <EditTaskDialog key={editing.id} task={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this task?"
        description={deleting ? `"${deleting.title}" will be permanently deleted.` : ''}
        confirmLabel="Delete task"
        danger
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
      />
    </div>
  );
}

function QuickAdd() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [fields, setFields] = useState<Record<string, string>>({});

  const add = useMutation({
    mutationFn: () => api.post<{ task: Task }>('/workspace/tasks', { title: title.trim(), dueAt: fromLocalInput(due), priority }),
    onSuccess: () => {
      toast.success('Task added');
      setTitle('');
      setDue('');
      setPriority('normal');
      setFields({});
      invalidateTasks(qc);
    },
    onError: (e) => {
      if (e instanceof ApiError) setFields(e.fields);
      toast.error(errorMessage(e));
    },
  });

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-1 sm:flex-row sm:items-start"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) add.mutate();
      }}
      aria-label="Add a task"
    >
      <div className="min-w-0 flex-1">
        <label htmlFor="quick-task-title" className="sr-only">
          Task title
        </label>
        <Input
          id="quick-task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task, for example Revise binary search"
          maxLength={300}
          aria-invalid={fields.title ? true : undefined}
        />
        {fields.title && (
          <p className="mt-1 text-[12.5px] text-danger" role="alert">
            {fields.title}
          </p>
        )}
      </div>
      <div className="sm:w-52">
        <label htmlFor="quick-task-due" className="sr-only">
          Due date (optional)
        </label>
        <Input id="quick-task-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-invalid={fields.dueAt ? true : undefined} title="Due date (optional)" />
        {fields.dueAt && (
          <p className="mt-1 text-[12.5px] text-danger" role="alert">
            {fields.dueAt}
          </p>
        )}
      </div>
      <div className="sm:w-36">
        <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} aria-label="Priority">
          <option value="low">Low priority</option>
          <option value="normal">Normal priority</option>
          <option value="high">High priority</option>
        </Select>
      </div>
      <Button type="submit" variant="primary" icon={<PlusIcon size={16} />} loading={add.isPending} disabled={!title.trim()} disabledReason="Type a task title first">
        Add task
      </Button>
    </form>
  );
}

function EditTaskDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [due, setDue] = useState(toLocalInput(task.dueAt));
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [fields, setFields] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => api.patch<{ task: Task }>(`/workspace/tasks/${task.id}`, { title: title.trim(), notes: notes.trim() || null, dueAt: fromLocalInput(due), priority }),
    onSuccess: () => {
      toast.success('Task updated');
      invalidateTasks(qc);
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError) setFields(e.fields);
      toast.error(errorMessage(e));
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="Edit task"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="edit-task-form" loading={save.isPending} disabled={!title.trim()} disabledReason="The task needs a title">
            Save task
          </Button>
        </>
      }
    >
      <form
        id="edit-task-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) save.mutate();
        }}
      >
        <Field label="Title" error={fields.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
        </Field>
        <Field label="Notes" optional error={fields.notes}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={5000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due" optional helper="Leave empty for no deadline." error={fields.dueAt}>
            <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Priority" error={fields.priority}>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </Select>
          </Field>
        </div>
        {task.status === 'done' && <p className="text-[12.5px] text-subtle">Completed {timeAgo(task.completedAt)}. Untick it in the list to reopen it.</p>}
        <p className="text-[12.5px] text-subtle">Tasks with a due date also appear on your calendar.</p>
      </form>
    </Dialog>
  );
}
