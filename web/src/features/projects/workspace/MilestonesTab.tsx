import { useState } from 'react';
import clsx from 'clsx';
import { CheckCircleIcon, CircleIcon, FlagIcon, PlusIcon, PencilSimpleIcon, TrashIcon, ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { api, ApiError } from '@/lib/api';
import { dueLabel, formatDate, toLocalInput, fromLocalInput } from '@/lib/format';
import { Button, Card, Dialog, Field, Input, EmptyState, Progress, Menu, ConfirmDialog } from '@/components/ui';
import type { Milestone, ProjectDetail } from '../types';
import { useProjectMutation } from './shared';

function MilestoneDialog({ d, m, open, onOpenChange }: { d: ProjectDetail; m?: Milestone; open: boolean; onOpenChange: (v: boolean) => void }) {
  const pid = d.project.id;
  const [title, setTitle] = useState(m?.title ?? '');
  const [due, setDue] = useState(toLocalInput(m?.dueAt).slice(0, 10));
  const save = useProjectMutation(
    pid,
    () => {
      const payload = { title, dueAt: due ? fromLocalInput(`${due}T17:00`) : null };
      return m ? api.patch(`/projects/${pid}/milestones/${m.id}`, payload) : api.post(`/projects/${pid}/milestones`, payload);
    },
    m ? 'Milestone saved' : 'Milestone added',
  );
  const f = save.error instanceof ApiError ? save.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={m ? 'Edit milestone' : 'Add milestone'}
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} disabled={title.trim().length < 2} disabledReason="Give the milestone a name" onClick={() => save.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
            Save milestone
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" error={f.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
        </Field>
        <Field label="Deadline" optional error={f.dueAt}>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="max-w-[200px]" />
        </Field>
      </div>
    </Dialog>
  );
}

export function MilestonesTab({ d }: { d: ProjectDetail }) {
  const pid = d.project.id;
  const [editing, setEditing] = useState<Milestone | 'new' | null>(null);
  const [removing, setRemoving] = useState<Milestone | null>(null);
  const complete = useProjectMutation(pid, (id: string) => api.post<{ xpAwarded: boolean }>(`/projects/${pid}/milestones/${id}/complete`), (r) => (r.xpAwarded ? `Milestone completed. +40 XP` : 'Milestone completed'));
  const reopen = useProjectMutation(pid, (id: string) => api.post(`/projects/${pid}/milestones/${id}/reopen`), 'Milestone reopened');
  const del = useProjectMutation(pid, (id: string) => api.del(`/projects/${pid}/milestones/${id}`), 'Milestone removed');
  const ms = [...d.milestones].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13.5px] text-muted">Completing a milestone awards XP once to each contributor and notifies the team.</p>
        {d.access.canEdit && (
          <Button icon={<PlusIcon size={14} />} onClick={() => setEditing('new')}>
            Add milestone
          </Button>
        )}
      </div>
      {!ms.length ? (
        <EmptyState icon={<FlagIcon size={22} />} title="No milestones" description="Milestones split the project into checkpoints with deadlines." action={d.access.canEdit ? <Button variant="primary" onClick={() => setEditing('new')}>Add milestone</Button> : undefined} />
      ) : (
        <ol className="relative space-y-3 border-l-2 border-border pl-6">
          {ms.map((m) => {
            const tasks = d.tasks.filter((t) => t.milestoneId === m.id && t.kind === 'task');
            const doneTasks = tasks.filter((t) => t.status === 'done').length;
            const due = dueLabel(m.dueAt);
            const isDone = m.status === 'done';
            return (
              <li key={m.id} className="relative">
                <span className={clsx('absolute -left-[33px] top-4 flex h-5 w-5 items-center justify-center rounded-full bg-bg', isDone ? 'text-success' : 'text-subtle')}>
                  {isDone ? <CheckCircleIcon size={20} weight="fill" aria-label="Completed" /> : <CircleIcon size={20} aria-label="Open" />}
                </span>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-[14.5px] font-semibold">{m.title}</h3>
                      <p className={clsx('text-[12.5px]', isDone ? 'text-success' : due.tone === 'danger' ? 'text-danger' : due.tone === 'warning' ? 'text-warning' : 'text-muted')}>
                        {isDone ? `Completed ${formatDate(m.completedAt)}` : due.text}
                      </p>
                    </div>
                    {d.access.canEdit && (
                      <div className="flex items-center gap-1">
                        {isDone ? (
                          <Button size="sm" icon={<ArrowCounterClockwiseIcon size={14} />} loading={reopen.isPending && reopen.variables === m.id} onClick={() => reopen.mutate(m.id)}>
                            Reopen
                          </Button>
                        ) : (
                          <Button size="sm" icon={<CheckCircleIcon size={14} />} loading={complete.isPending && complete.variables === m.id} onClick={() => complete.mutate(m.id)}>
                            Mark complete
                          </Button>
                        )}
                        <Menu
                          label={`Actions for ${m.title}`}
                          items={[
                            { label: 'Edit', icon: <PencilSimpleIcon size={14} />, onSelect: () => setEditing(m) },
                            { label: 'Remove', icon: <TrashIcon size={14} />, danger: true, onSelect: () => setRemoving(m) },
                          ]}
                        />
                      </div>
                    )}
                  </div>
                  {tasks.length > 0 && (
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-[12px] text-muted">
                        <span>Tasks</span>
                        <span className="tabular-nums">
                          {doneTasks}/{tasks.length}
                        </span>
                      </div>
                      <Progress value={doneTasks} max={tasks.length} tone={isDone ? 'success' : 'accent'} label={`${m.title} tasks`} />
                      {!isDone && doneTasks < tasks.length && <p className="mt-1 text-[12px] text-subtle">You can still complete the milestone if the remaining tasks are no longer needed.</p>}
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      )}
      {editing && <MilestoneDialog d={d} m={editing === 'new' ? undefined : editing} open onOpenChange={(v) => !v && setEditing(null)} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title="Remove milestone?"
        description="Tasks in this milestone are kept and become unassigned to any milestone."
        confirmLabel="Remove milestone"
        danger
        loading={del.isPending}
        onConfirm={() => {
          if (removing) del.mutate(removing.id, { onSuccess: () => setRemoving(null) });
        }}
      />
    </div>
  );
}
