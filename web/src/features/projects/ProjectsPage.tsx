import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { HammerIcon, PlusIcon, SquaresFourIcon, UsersThreeIcon, SealCheckIcon, CalendarIcon, EnvelopeSimpleIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { api, errorMessage, qs } from '@/lib/api';
import { dueLabel, timeAgo } from '@/lib/format';
import { PageHeader, Button, ButtonLink, Progress, StatusBadge, Badge, EmptyState, ErrorState, Skeleton, Tabs, Pagination, Banner } from '@/components/ui';
import { StartProjectDialog } from './StartProjectDialog';
import { CATEGORY_LABELS, type ProjectListItem } from './types';

const FILTERS = [
  { value: 'all', label: 'Active' },
  { value: 'planning', label: 'Planning' },
  { value: 'building', label: 'Building' },
  { value: 'review', label: 'In review' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

type Invite = { id: string; role: string; projectId: string; projectTitle: string; invitedByName: string; createdAt: string };

function Invites() {
  const qc = useQueryClient();
  const invites = useQuery({ queryKey: ['project-invites'], queryFn: () => api.get<{ items: Invite[] }>('/projects/invites') });
  const respond = useMutation({
    mutationFn: (v: { id: string; accept: boolean }) => api.post(`/projects/invites/${v.id}/${v.accept ? 'accept' : 'decline'}`),
    onSuccess: (_r, v) => {
      toast.success(v.accept ? 'You joined the project' : 'Invitation declined');
      qc.invalidateQueries({ queryKey: ['project-invites'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!invites.data?.items.length) return null;
  return (
    <div className="mb-6 space-y-2" id="invites">
      {invites.data.items.map((i) => (
        <Banner
          key={i.id}
          tone="info"
          title={`${i.invitedByName} invited you to "${i.projectTitle}"`}
          action={
            <div className="flex gap-2">
              <Button size="sm" onClick={() => respond.mutate({ id: i.id, accept: false })} disabled={respond.isPending}>
                Decline
              </Button>
              <Button size="sm" variant="primary" loading={respond.isPending && respond.variables?.id === i.id && respond.variables.accept} onClick={() => respond.mutate({ id: i.id, accept: true })}>
                Accept
              </Button>
            </div>
          }
        >
          Role: {i.role}. Sent {timeAgo(i.createdAt)}.
        </Banner>
      ))}
    </div>
  );
}

function ProjectRow({ p }: { p: ProjectListItem }) {
  const due = dueLabel(p.dueAt);
  return (
    <li>
      <Link to={`/app/projects/${p.id}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
        <span
          className={clsx(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-md font-display text-[14px] font-semibold tabular-nums',
            p.status === 'completed' ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent-text',
          )}
        >
          {p.progress}%
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="truncate text-[14.5px] font-semibold tracking-[-0.005em]">{p.title}</span>
            <StatusBadge status={p.status} />
            {p.orgId && <Badge tone="accent">Capstone</Badge>}
            {p.approvedAt && (
              <Badge tone="success" icon={<SealCheckIcon size={12} weight="fill" />}>
                Reviewer approved
              </Badge>
            )}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
            <span>{CATEGORY_LABELS[p.category] ?? p.category}</span>
            {p.role !== 'owner' && (
              <span className="inline-flex items-center gap-1">
                <UsersThreeIcon size={13} aria-hidden />
                {p.role === 'member' ? `Team: ${p.ownerName}` : `${p.role === 'mentor' ? 'Mentoring' : 'Reviewing'} ${p.ownerName}`}
              </span>
            )}
            <span className={clsx('inline-flex items-center gap-1', due.tone === 'danger' && p.status !== 'completed' ? 'text-danger' : due.tone === 'warning' ? 'text-warning' : '')}>
              <CalendarIcon size={13} aria-hidden />
              {p.status === 'completed' ? 'Completed' : due.text}
            </span>
            <span className="text-subtle">Updated {timeAgo(p.updatedAt)}</span>
          </span>
          <Progress value={p.progress} tone={p.status === 'completed' ? 'success' : 'accent'} label={`${p.title} progress`} className="mt-2.5 max-w-md" />
        </span>
        <ArrowRightIcon size={16} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
      </Link>
    </li>
  );
}

export default function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [startOpen, setStartOpen] = useState(false);

  useEffect(() => {
    if (params.get('new') === '1') {
      setStartOpen(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const list = useQuery({
    queryKey: ['projects', { filter, page }],
    queryFn: () => api.get<{ items: ProjectListItem[]; total: number; counts: Record<string, number> }>(`/projects${qs({ status: filter === 'all' ? undefined : filter, page, pageSize: 24 })}`),
  });

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Plan, build, document and get your work reviewed. Completed projects become portfolio evidence."
        actions={
          <>
            <ButtonLink to="/app/projects/templates" icon={<SquaresFourIcon size={16} />}>
              Browse templates
            </ButtonLink>
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setStartOpen(true)}>
              Start a project
            </Button>
          </>
        }
      />
      <Invites />
      <Tabs
        value={filter}
        onValueChange={(v) => {
          setFilter(v);
          setPage(1);
        }}
        tabs={FILTERS.map((f) => ({ ...f, count: f.value === 'all' ? undefined : list.data?.counts[f.value] }))}
        className="mb-6"
      />
      {list.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data?.items.length ? (
        filter === 'all' ? (
          <EmptyState
            icon={<HammerIcon size={22} />}
            title="No projects yet"
            description="Pick a template matched to your skills, or start from a blank page. Guided mode gives you requirements, milestones and a task board."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink to="/app/projects/templates">Browse templates</ButtonLink>
                <Button variant="primary" onClick={() => setStartOpen(true)}>
                  Start a project
                </Button>
              </div>
            }
          />
        ) : (
          <EmptyState icon={<EnvelopeSimpleIcon size={22} />} title="Nothing here" description="No projects have this status." action={<Button onClick={() => setFilter('all')}>Show active projects</Button>} />
        )
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            {list.data.items.map((p) => (
              <ProjectRow key={p.id} p={p} />
            ))}
          </ul>
          <Pagination page={page} pageSize={24} total={list.data.total} onPage={setPage} />
        </>
      )}
      <StartProjectDialog open={startOpen} onOpenChange={setStartOpen} />
    </div>
  );
}
