import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import type { ProjectDetail, Task } from '../types';
import { STATUS_COLUMNS } from '../types';
import { useProjectMutation } from './shared';

export const PRIORITY_TONE = { low: 'neutral', medium: 'info', high: 'danger' } as const;

/** Create or edit a task, bug or issue. */
export function TaskDialog({ d, task, defaults, open, onOpenChange }: { d: ProjectDetail; task?: Task; defaults?: Partial<Task>; open: boolean; onOpenChange: (v: boolean) => void }) {
  const pid = d.project.id;
  const init = task ?? defaults ?? {};
  const [title, setTitle] = useState(init.title ?? '');
  const [description, setDescription] = useState(init.description ?? '');
  const [kind, setKind] = useState<Task['kind']>(init.kind ?? 'task');
  const [status, setStatus] = useState<Task['status']>(init.status ?? 'todo');
  const [priority, setPriority] = useState<Task['priority']>(init.priority ?? 'medium');
  const [assigneeId, setAssigneeId] = useState(init.assigneeId ?? '');
  const [milestoneId, setMilestoneId] = useState(init.milestoneId ?? '');
  const reviewerOnly = !d.access.canEdit;
  const save = useProjectMutation(
    pid,
    () => {
      const payload = { title, description: description || null, kind, status, priority, assigneeId: assigneeId || null, milestoneId: milestoneId || null };
      return task ? api.patch(`/projects/${pid}/tasks/${task.id}`, payload) : api.post(`/projects/${pid}/tasks`, payload);
    },
    task ? 'Saved' : kind === 'task' ? 'Task added' : `${kind === 'bug' ? 'Bug' : 'Issue'} reported`,
  );
  const del = useProjectMutation(pid, () => api.del(`/projects/${pid}/tasks/${task!.id}`), 'Deleted');
  const f = save.error instanceof ApiError ? save.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={task ? 'Edit item' : kind === 'task' ? 'Add task' : 'Report a bug or issue'}
      footer={
        <>
          {task && d.access.canEdit && (
            <Button variant="ghost" className="mr-auto text-danger" loading={del.isPending} onClick={() => del.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
              Delete
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} disabled={title.trim().length < 2} disabledReason="Add a short title" onClick={() => save.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
            {task ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" error={f.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} autoFocus />
        </Field>
        <Field label="Description" optional error={f.description}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={kind === 'bug' ? 'Steps to reproduce, expected and actual behaviour' : undefined} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as Task['kind'])}>
              {!reviewerOnly && <option value="task">Task</option>}
              <option value="bug">Bug</option>
              <option value="issue">Issue</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Task['status'])}>
              {STATUS_COLUMNS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assignee" optional error={f.assigneeId}>
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {d.team.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} ({m.role})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Milestone" optional>
            <Select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
              <option value="">No milestone</option>
              {d.milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
