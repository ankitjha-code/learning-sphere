import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { CaretLeftIcon, CaretRightIcon, KanbanIcon, PlusIcon, BugIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { Button, Badge, EmptyState, Select, Avatar } from '@/components/ui';
import { STATUS_COLUMNS, type ProjectDetail, type Task } from '../types';
import { TaskDialog, PRIORITY_TONE } from './TaskDialog';
import { useProjectMutation } from './shared';

export function TaskCard({ d, t, onOpen, onMove, moving }: { d: ProjectDetail; t: Task; onOpen: () => void; onMove?: (dir: -1 | 1) => void; moving?: boolean }) {
  const idx = STATUS_COLUMNS.findIndex((c) => c.key === t.status);
  const assignee = d.team.find((m) => m.userId === t.assigneeId);
  const milestone = d.milestones.find((m) => m.id === t.milestoneId);
  return (
    <div className="rounded-md border border-border bg-surface p-2.5 shadow-1">
      <button type="button" onClick={onOpen} className="block w-full text-left text-[13.5px] font-medium leading-snug hover:underline focus-visible:outline-2">
        {t.kind === 'bug' && <BugIcon size={14} className="mr-1 inline text-danger" aria-label="Bug" />}
        {t.kind === 'issue' && <WarningCircleIcon size={14} className="mr-1 inline text-warning" aria-label="Issue" />}
        {t.title}
      </button>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}</Badge>
        {milestone && <span className="truncate text-[11.5px] text-subtle">{milestone.title}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between">
        {assignee ? (
          <span className="flex items-center gap-1 text-[12px] text-muted">
            <Avatar name={assignee.name} color={assignee.avatarColor} size={18} />
            {assignee.name.split(' ')[0]}
          </span>
        ) : (
          <span className="text-[12px] text-subtle">Unassigned</span>
        )}
        {onMove && (
          <div className="flex gap-0.5">
            <Button size="icon-sm" variant="ghost" aria-label={`Move "${t.title}" to ${STATUS_COLUMNS[idx - 1]?.label ?? ''}`} disabled={idx <= 0 || moving} onClick={() => onMove(-1)}>
              <CaretLeftIcon size={14} />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Move "${t.title}" to ${STATUS_COLUMNS[idx + 1]?.label ?? ''}`} disabled={idx >= STATUS_COLUMNS.length - 1 || moving} onClick={() => onMove(1)}>
              <CaretRightIcon size={14} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function BoardTab({ d }: { d: ProjectDetail }) {
  const pid = d.project.id;
  const [open, setOpen] = useState<Task | 'new' | null>(null);
  const [milestone, setMilestone] = useState('');
  const [assignee, setAssignee] = useState('');
  const [showBugs, setShowBugs] = useState(false);
  const move = useProjectMutation(pid, (v: { id: string; status: Task['status'] }) => api.patch(`/projects/${pid}/tasks/${v.id}`, { status: v.status }), (_r, v) => `Moved to ${STATUS_COLUMNS.find((c) => c.key === v.status)?.label}`);
  const tasks = useMemo(
    () => d.tasks.filter((t) => (showBugs || t.kind === 'task') && (!milestone || t.milestoneId === milestone) && (!assignee || (assignee === 'none' ? !t.assigneeId : t.assigneeId === assignee))),
    [d.tasks, milestone, assignee, showBugs],
  );

  if (!d.tasks.length)
    return (
      <EmptyState
        icon={<KanbanIcon size={22} />}
        title="The board is empty"
        description="Break your milestones into small tasks you can finish in a sitting. Move them across the board as you work."
        action={d.access.canEdit ? <Button variant="primary" onClick={() => setOpen('new')}>Add task</Button> : undefined}
      />
    );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-48">
          <Select aria-label="Filter by milestone" value={milestone} onChange={(e) => setMilestone(e.target.value)}>
            <option value="">All milestones</option>
            {d.milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select aria-label="Filter by assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Everyone</option>
            <option value="none">Unassigned</option>
            {d.team.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-1.5 text-[13px] text-muted">
          <input type="checkbox" checked={showBugs} onChange={(e) => setShowBugs(e.target.checked)} className="accent-[var(--accent)]" />
          Include bugs and issues
        </label>
        {d.access.canEdit && (
          <Button className="ml-auto" icon={<PlusIcon size={14} />} onClick={() => setOpen('new')}>
            Add task
          </Button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STATUS_COLUMNS.map((col, ci) => {
          const items = tasks.filter((t) => t.status === col.key);
          return (
            <section key={col.key} aria-label={col.label} className={clsx('rounded-lg border border-border bg-surface-2 p-2', col.key === 'done' && 'opacity-95')}>
              <h3 className="mb-2 flex items-center justify-between px-1 text-[12.5px] font-semibold uppercase tracking-wide text-subtle">
                {col.label}
                <span className="rounded-full bg-surface px-1.5 tabular-nums">{items.length}</span>
              </h3>
              <div className="space-y-2">
                {items.map((t) => (
                  <TaskCard
                    key={t.id}
                    d={d}
                    t={t}
                    onOpen={() => setOpen(t)}
                    moving={move.isPending && move.variables?.id === t.id}
                    onMove={d.access.canEdit ? (dir) => move.mutate({ id: t.id, status: STATUS_COLUMNS[ci + dir].key }) : undefined}
                  />
                ))}
                {!items.length && <p className="px-1 py-3 text-center text-[12px] text-subtle">Nothing here</p>}
              </div>
            </section>
          );
        })}
      </div>
      {open && <TaskDialog d={d} task={open === 'new' ? undefined : open} defaults={{ kind: 'task' }} open onOpenChange={(v) => !v && setOpen(null)} />}
    </div>
  );
}
