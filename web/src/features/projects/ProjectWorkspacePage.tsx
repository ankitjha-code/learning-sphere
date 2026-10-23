import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CaretLeftIcon, CheckCircleIcon, ArchiveIcon, TrashIcon, GraduationCapIcon, SealCheckIcon, LockIcon, LinkIcon, GlobeIcon } from '@phosphor-icons/react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { PageHeader, Button, StatusBadge, Badge, Tabs, ErrorState, Skeleton, ConfirmDialog, Menu, Card, CardHeader, CardBody, Textarea, EmptyState } from '@/components/ui';
import { MODE_INFO, type ProjectDetail } from './types';
import { OverviewTab } from './workspace/OverviewTab';
import { RequirementsTab } from './workspace/RequirementsTab';
import { BoardTab } from './workspace/BoardTab';
import { MilestonesTab } from './workspace/MilestonesTab';
import { DocsTab } from './workspace/DocsTab';
import { IssuesTab } from './workspace/IssuesTab';
import { ReviewsTab } from './workspace/ReviewsTab';
import { TeamTab } from './workspace/TeamTab';
import { ShareTab } from './workspace/ShareTab';
import { AiPanel } from './workspace/AiPanel';
import { useProjectMutation } from './workspace/shared';

const TABS = ['overview', 'requirements', 'board', 'milestones', 'docs', 'issues', 'reviews', 'team', 'share', 'ai', 'retro'] as const;
type Tab = (typeof TABS)[number];

function RetroTab({ d }: { d: ProjectDetail }) {
  const [notes, setNotes] = useState(d.project.privateNotes ?? '');
  useEffect(() => setNotes(d.project.privateNotes ?? ''), [d.project.privateNotes]);
  const save = useProjectMutation(d.project.id, () => api.patch(`/projects/${d.project.id}/notes`, { privateNotes: notes }), 'Notes saved');
  return (
    <div className="space-y-4">
      <DocsTab d={d} only="retrospective" />
      {d.access.canEdit && (
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-1.5"><LockIcon size={16} /> Private notes</span>} description="For your team only. Never shown on shared pages or portfolios." />
          <CardBody>
            <Textarea aria-label="Private notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} maxLength={20000} />
            <div className="mt-2 flex justify-end">
              <Button loading={save.isPending} disabled={notes === (d.project.privateNotes ?? '')} disabledReason="No changes" onClick={() => save.mutate(undefined)}>
                Save notes
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default function ProjectWorkspacePage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as Tab | null;
  const tab: Tab = tabParam && (TABS as readonly string[]).includes(tabParam) ? tabParam : 'overview';
  const setTab = (t: string) => {
    params.set('tab', t);
    setParams(params, { replace: true });
  };
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const q = useQuery({ queryKey: ['project', id], queryFn: () => api.get<ProjectDetail>(`/projects/${id}`) });
  const complete = useProjectMutation(id, () => api.post(`/projects/${id}/complete`), 'Marked complete. Ask a reviewer to approve it to turn the evidence into verified evidence.');
  const archive = useProjectMutation(id, (status: string) => api.patch(`/projects/${id}`, { status }), (_r, s) => (s === 'archived' ? 'Project archived' : 'Project restored'));
  const del = useMutation({
    mutationFn: () => api.del(`/projects/${id}`),
    onSuccess: () => {
      toast.success('Project deleted');
      qc.invalidateQueries({ queryKey: ['projects'] });
      nav('/app/projects');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (q.error) {
    if (q.error instanceof ApiError && q.error.status === 404)
      return <EmptyState icon={<LockIcon size={22} />} title="Project not found" description="It does not exist, or you are not on its team." action={<Link to="/app/projects" className="text-accent-text underline">Back to projects</Link>} />;
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  }
  const d = q.data!;
  const p = d.project;
  const openIssues = d.tasks.filter((t) => t.kind !== 'task' && t.status !== 'done').length;
  const VisIcon = p.visibility === 'public' ? GlobeIcon : p.visibility === 'unlisted' ? LinkIcon : LockIcon;

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'requirements', label: 'Requirements', count: p.requirements.length },
    { value: 'board', label: 'Board', count: d.tasks.filter((t) => t.kind === 'task').length },
    { value: 'milestones', label: 'Milestones', count: d.milestones.length },
    { value: 'docs', label: 'Docs' },
    { value: 'issues', label: 'Issues', count: openIssues || undefined },
    { value: 'reviews', label: 'Reviews', count: d.reviews.length || undefined },
    { value: 'team', label: 'Team', count: d.team.length },
    { value: 'share', label: 'Share & publish' },
    { value: 'ai', label: 'AI assistant' },
    { value: 'retro', label: 'Retrospective' },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/projects" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={12} /> Projects
          </Link>
        }
        title={p.title}
        badge={
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={p.status} />
            <Badge>{MODE_INFO[p.mode]?.label ?? p.mode}</Badge>
            <Badge icon={<VisIcon size={12} />}>{p.visibility.charAt(0).toUpperCase() + p.visibility.slice(1)}</Badge>
            {d.template?.isCapstone && (
              <Badge tone="accent" icon={<GraduationCapIcon size={12} />}>
                Capstone
              </Badge>
            )}
            {p.approvedBy && (
              <Badge tone="success" icon={<SealCheckIcon size={12} weight="fill" />}>
                Reviewer approved
              </Badge>
            )}
          </div>
        }
        description={d.template ? <>From template <Link className="underline underline-offset-2" to={`/app/projects/templates/${d.template.slug}`}>{d.template.title}</Link></> : undefined}
        actions={
          d.access.isOwner && (
            <>
              {p.status !== 'completed' && p.status !== 'archived' && (
                <Button variant="primary" icon={<CheckCircleIcon size={16} />} onClick={() => setConfirmComplete(true)}>
                  Mark complete
                </Button>
              )}
              <Menu
                items={[
                  p.status === 'archived'
                    ? { label: 'Restore project', icon: <ArchiveIcon size={14} />, onSelect: () => archive.mutate('building') }
                    : { label: 'Archive project', icon: <ArchiveIcon size={14} />, onSelect: () => archive.mutate('archived'), disabled: p.status === 'completed' },
                  'separator',
                  { label: p.orgId ? 'Delete (not allowed for capstones)' : 'Delete project', icon: <TrashIcon size={14} />, danger: true, disabled: !!p.orgId, onSelect: () => setConfirmDelete(true) },
                ]}
              />
            </>
          )
        }
      />
      <Tabs value={tab} onValueChange={setTab} tabs={tabs} className="mb-6" />
      {tab === 'overview' && <OverviewTab d={d} />}
      {tab === 'requirements' && <RequirementsTab d={d} />}
      {tab === 'board' && <BoardTab d={d} />}
      {tab === 'milestones' && <MilestonesTab d={d} />}
      {tab === 'docs' && <DocsTab d={d} />}
      {tab === 'issues' && <IssuesTab d={d} />}
      {tab === 'reviews' && <ReviewsTab d={d} />}
      {tab === 'team' && <TeamTab d={d} />}
      {tab === 'share' && <ShareTab d={d} />}
      {tab === 'ai' && <AiPanel d={d} />}
      {tab === 'retro' && <RetroTab d={d} />}

      <ConfirmDialog
        open={confirmComplete}
        onOpenChange={setConfirmComplete}
        title="Mark this project complete?"
        description={
          <>
            Self-completion records your skills as <strong>unverified</strong> project evidence. For verified evidence, invite a mentor or reviewer and request a review instead (you can still do that after marking it complete).
          </>
        }
        confirmLabel="Mark complete"
        loading={complete.isPending}
        onConfirm={() => complete.mutate(undefined, { onSuccess: () => setConfirmComplete(false) })}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this project?"
        description="This permanently deletes the project, its tasks, milestones, docs and reviews. Unverified evidence from it is removed; reviewer-verified evidence stays in your Skill DNA."
        confirmLabel="Delete project"
        confirmText={p.title}
        danger
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}
