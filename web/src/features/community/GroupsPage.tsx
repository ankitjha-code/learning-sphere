import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UsersThreeIcon, PlusIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { Badge, Banner, Button, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, Skeleton, Textarea } from '@/components/ui';
import { AuthorChip, type Author } from './shared';

type GroupRow = { id: string; name: string; goal: string; maxMembers: number; memberCount: number; isMember: boolean; isOwner: boolean; owner: Author | null; createdAt: string };

function CreateGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [max, setMax] = useState('8');
  const m = useMutation({
    mutationFn: () => api.post<{ group: { id: string } }>('/community/groups', { name, goal, maxMembers: Number(max) }),
    onSuccess: (r) => {
      toast.success('Study group created');
      qc.invalidateQueries({ queryKey: ['study-groups'] });
      nav(`/app/community/groups/${r.group.id}`);
    },
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start a study group"
      description="Members share notes and a task list. Only members can see them."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={name.trim().length < 3 || goal.trim().length < 10} disabledReason="Add a name and a goal" onClick={() => m.mutate()}>
            Create group
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {m.error && !Object.keys(fields).length && <Banner tone="danger">{errorMessage(m.error)}</Banner>}
        <Field label="Name" error={fields.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Goal" error={fields.goal} helper="What will you work on together, and how often?">
          <Textarea rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={500} />
        </Field>
        <Field label="Maximum members" error={fields.maxMembers}>
          <Input type="number" min={2} max={30} className="w-32" value={max} onChange={(e) => setMax(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

export default function GroupsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['study-groups'], queryFn: () => api.get<{ items: GroupRow[] }>('/community/groups') });
  const join = useMutation({
    mutationFn: (id: string) => api.post(`/community/groups/${id}/join`),
    onSuccess: () => (toast.success('Joined the group'), qc.invalidateQueries({ queryKey: ['study-groups'] })),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const items = q.data?.items ?? [];
  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/community" className="hover:underline">
            Community
          </Link>
        }
        title="Study groups"
        description="Small peer groups with shared notes and a task board."
        actions={
          <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setOpen(true)}>
            Start a group
          </Button>
        }
      />
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !items.length ? (
        <EmptyState icon={<UsersThreeIcon size={22} />} title="No study groups yet" description="Start one for a course, an exam or a practice routine." action={<Button variant="primary" onClick={() => setOpen(true)}>Start a group</Button>} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
          {items.map((g) => (
            <li key={g.id} className="relative flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-6">
              <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text sm:flex">
                <UsersThreeIcon size={18} weight="duotone" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Link to={`/app/community/groups/${g.id}`} className="text-[14.5px] font-semibold tracking-[-0.005em] after:absolute after:inset-0 hover:text-accent-text">
                    {g.name}
                  </Link>
                  {g.isMember && <Badge tone="success">{g.isOwner ? 'Owner' : 'Member'}</Badge>}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{g.goal}</p>
              </div>
              <div className="relative z-10 flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                {g.owner ? <AuthorChip a={g.owner} /> : <span />}
                <span className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 text-[12.5px] tabular-nums text-subtle">
                    <UsersThreeIcon size={14} aria-hidden />
                    {g.memberCount}/{g.maxMembers}
                  </span>
                  {!g.isMember && (
                    <Button size="sm" onClick={() => join.mutate(g.id)} disabled={g.memberCount >= g.maxMembers} disabledReason="This group is full" loading={join.isPending && join.variables === g.id}>
                      Join
                    </Button>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && <CreateGroupDialog open={open} onOpenChange={setOpen} />}
    </div>
  );
}
