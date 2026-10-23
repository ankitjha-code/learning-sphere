import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BriefcaseIcon, PlusIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { formatDate, plural } from '@/lib/format';
import { Badge, ButtonLink, Card, ConfirmDialog, EmptyState, ErrorState, Menu, PageHeader, Segmented, SkeletonRows, StatusBadge } from '@/components/ui';
import { useJobs, WORKPLACE_LABEL, TYPE_LABEL, type Job } from './api';
import { FunnelMini } from './components';

type Filter = 'open' | 'published' | 'draft' | 'closed' | 'archived';

export default function JobsPage() {
  const [filter, setFilter] = useState<Filter>('open');
  const q = useJobs(filter);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState<{ job: Job; action: 'close' | 'archive' } | null>(null);
  const act = useMutation({
    mutationFn: ({ job, action }: { job: Job; action: 'close' | 'archive' | 'duplicate' | 'publish' }) => api.post<{ job: Job }>(`/hire/jobs/${job.id}/${action}`),
    onSuccess: (r, v) => {
      toast.success({ close: 'Job closed. Existing candidates stay in the pipeline.', archive: 'Job archived.', duplicate: 'Draft copy created.', publish: 'Job published.' }[v.action]);
      qc.invalidateQueries({ queryKey: ['hire'] });
      setConfirm(null);
      if (v.action === 'duplicate') nav(`/app/hire/jobs/${r.job.id}?tab=details`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Jobs"
        description="Publish roles with explicit requirements. Matching uses only the skills you list."
        actions={q.data?.canManage && <ButtonLink to="/app/hire/jobs/new" variant="primary" icon={<PlusIcon size={15} />}>New job</ButtonLink>}
      />
      <Segmented
        label="Filter jobs"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'open', label: 'Not archived' },
          { value: 'published', label: 'Published' },
          { value: 'draft', label: 'Drafts' },
          { value: 'closed', label: 'Closed' },
          { value: 'archived', label: 'Archived' },
        ]}
      />
      {q.isLoading ? (
        <SkeletonRows rows={5} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState
          icon={<BriefcaseIcon size={22} />}
          title={filter === 'open' ? 'No jobs yet' : 'No jobs here'}
          description={filter === 'open' ? 'Create your first job: add requirements, choose the pipeline stages and publish when the checklist is complete.' : 'Try another filter.'}
          action={q.data?.canManage && filter === 'open' && <ButtonLink to="/app/hire/jobs/new" variant="primary">Create a job</ButtonLink>}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13.5px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-left text-[12px] text-muted">
                <th className="px-4 py-2.5 font-medium">Job</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Candidates</th>
                <th className="px-4 py-2.5 font-medium">Pipeline</th>
                <th className="px-2 py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((j) => (
                <tr key={j.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <Link to={`/app/hire/jobs/${j.id}`} className="font-medium hover:underline">
                      {j.title}
                    </Link>
                    <div className="text-[12.5px] text-muted">
                      {[j.team, j.location, WORKPLACE_LABEL[j.workplace], TYPE_LABEL[j.employmentType]].filter(Boolean).join(' · ')}
                    </div>
                    {j.campusOnly && <Badge tone="info" className="mt-1">Campus drives only</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={j.status} />
                    {j.closesAt && j.status === 'published' && <div className="mt-1 text-[12px] text-subtle">Closes {formatDate(j.closesAt)}</div>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {plural(j.applicants, 'applicant')}
                    <div className="text-[12px] text-subtle">{j.active} active</div>
                  </td>
                  <td className="px-4 py-3">
                    <FunnelMini stages={j.stages.map((s) => ({ key: s, label: j.stageLabels[s] ?? s, count: j.counts[s] ?? 0 }))} />
                  </td>
                  <td className="px-2 py-3 text-right">
                    {q.data.canManage && (
                      <Menu
                        label={`Actions for ${j.title}`}
                        items={[
                          { label: 'Open pipeline', onSelect: () => nav(`/app/hire/jobs/${j.id}`) },
                          { label: 'Edit details', onSelect: () => nav(`/app/hire/jobs/${j.id}?tab=details`), disabled: j.status === 'archived' },
                          { label: 'Duplicate', onSelect: () => act.mutate({ job: j, action: 'duplicate' }) },
                          'separator',
                          { label: 'Close to new applications', onSelect: () => setConfirm({ job: j, action: 'close' }), disabled: j.status !== 'published' },
                          { label: 'Archive', onSelect: () => setConfirm({ job: j, action: 'archive' }), disabled: j.status === 'published' || j.status === 'archived', danger: true },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm?.action === 'close' ? 'Close this job?' : 'Archive this job?'}
        description={
          confirm?.action === 'close'
            ? 'New applications stop immediately. Candidates already in the pipeline stay, and you can keep moving them.'
            : 'Archived jobs are read-only and hidden from the default list. Their candidates and decisions are kept.'
        }
        confirmLabel={confirm?.action === 'close' ? 'Close job' : 'Archive job'}
        danger={confirm?.action === 'archive'}
        loading={act.isPending}
        onConfirm={() => confirm && act.mutate(confirm)}
      />
    </div>
  );
}
