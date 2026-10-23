import { useState } from 'react';
import { BugIcon, PlusIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Button, Card, Badge, EmptyState, Select, Segmented, StatusBadge } from '@/components/ui';
import { STATUS_COLUMNS, type ProjectDetail, type Task } from '../types';
import { TaskDialog, PRIORITY_TONE } from './TaskDialog';
import { useProjectMutation } from './shared';

export function IssuesTab({ d }: { d: ProjectDetail }) {
  const pid = d.project.id;
  const [open, setOpen] = useState<Task | 'new' | null>(null);
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const update = useProjectMutation(pid, (v: { id: string; status: Task['status'] }) => api.patch(`/projects/${pid}/tasks/${v.id}`, { status: v.status }), 'Status updated');
  const all = d.tasks.filter((t) => t.kind !== 'task');
  const items = all.filter((t) => (filter === 'all' ? true : filter === 'open' ? t.status !== 'done' : t.status === 'done'));
  const canReport = d.access.canEdit || d.access.canReview;
  const nameOf = (id: string) => d.team.find((m) => m.userId === id)?.name ?? 'Someone';

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Issue filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: `Open (${all.filter((t) => t.status !== 'done').length})` },
            { value: 'resolved', label: 'Resolved' },
            { value: 'all', label: 'All' },
          ]}
        />
        {canReport && (
          <Button icon={<PlusIcon size={14} />} onClick={() => setOpen('new')}>
            Report a bug or issue
          </Button>
        )}
      </div>
      {!items.length ? (
        <EmptyState
          icon={<BugIcon size={22} />}
          title={filter === 'open' ? 'No open bugs or issues' : 'Nothing here'}
          description="Track defects and open questions here so they are not lost. Reviewers can report them too."
          action={canReport ? <Button variant="primary" onClick={() => setOpen('new')}>Report a bug or issue</Button> : undefined}
        />
      ) : (
        <Card className="divide-y divide-border">
          {items.map((t) => (
            <div key={t.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <button type="button" className="text-left text-[14px] font-medium hover:underline" onClick={() => setOpen(t)}>
                  {t.title}
                </button>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                  <Badge tone={t.kind === 'bug' ? 'danger' : 'warning'}>{t.kind}</Badge>
                  <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                  <span>
                    Reported by {nameOf(t.createdBy)} {timeAgo(t.createdAt)}
                  </span>
                </div>
              </div>
              {d.access.canEdit ? (
                <div className="w-36">
                  <Select aria-label={`Status of ${t.title}`} value={t.status} onChange={(e) => update.mutate({ id: t.id, status: e.target.value as Task['status'] })}>
                    {STATUS_COLUMNS.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.key === 'done' ? 'Resolved' : c.label}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <StatusBadge status={t.status === 'done' ? 'completed' : t.status === 'todo' ? 'open' : 'in_progress'} />
              )}
            </div>
          ))}
        </Card>
      )}
      {open && <TaskDialog d={d} task={open === 'new' ? undefined : open} defaults={{ kind: 'bug' }} open onOpenChange={(v) => !v && setOpen(null)} />}
    </div>
  );
}
