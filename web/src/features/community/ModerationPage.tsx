import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FlagIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Badge, Button, ButtonLink, Checkbox, Dialog, EmptyState, ErrorState, Field, PageHeader, Pagination, Segmented, SkeletonRows, StatusBadge, Textarea } from '@/components/ui';

type ReportItem = {
  id: string;
  targetType: 'thread' | 'post' | 'user';
  targetId: string;
  reason: string;
  details: string | null;
  status: string;
  resolution: string | null;
  createdAt: string;
  reporter: { id: string; name: string };
  target: { kind: string; title?: string; excerpt?: string; name?: string; status: string; author?: { id: string; name: string }; link?: string } | null;
};

function ResolveDialog({ r, onClose }: { r: ReportItem; onClose: () => void }) {
  const qc = useQueryClient();
  const [resolution, setResolution] = useState('');
  const [hide, setHide] = useState(r.targetType !== 'user');
  const m = useMutation({
    mutationFn: (status: 'actioned' | 'dismissed') => api.post(`/community/moderation/reports/${r.id}/resolve`, { status, resolution, hideContent: status === 'actioned' && hide }),
    onSuccess: () => (toast.success('Report resolved. The action is recorded in the audit log.'), qc.invalidateQueries({ queryKey: ['mod-reports'] }), onClose()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="Resolve report"
      description="The reporter is told the report was reviewed. They are not told what action was taken."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button loading={m.isPending && m.variables === 'dismissed'} disabled={resolution.trim().length < 3} disabledReason="Write a short resolution note" onClick={() => m.mutate('dismissed')}>
            Dismiss
          </Button>
          <Button variant="danger" loading={m.isPending && m.variables === 'actioned'} disabled={resolution.trim().length < 3} disabledReason="Write a short resolution note" onClick={() => m.mutate('actioned')}>
            Take action
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {r.target?.excerpt && <blockquote className="rounded-md bg-surface-2 px-3 py-2 text-[13px] text-muted">{r.target.excerpt}</blockquote>}
        <Field label="Resolution note" helper="For the audit log and other moderators.">
          <Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} maxLength={1000} />
        </Field>
        {r.targetType !== 'user' && <Checkbox checked={hide} onCheckedChange={setHide} label="Hide the content when taking action" description="Hidden content stays visible to its author and moderators." />}
        {r.targetType === 'user' && <p className="text-[12.5px] text-muted">Account actions such as suspension are handled in Admin, Users.</p>}
      </div>
    </Dialog>
  );
}

export default function ModerationPage() {
  const [status, setStatus] = useState<'open' | 'actioned' | 'dismissed'>('open');
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<ReportItem | null>(null);
  const q = useQuery({ queryKey: ['mod-reports', status, page], queryFn: () => api.get<{ items: ReportItem[]; total: number; pageSize: number }>(`/community/moderation/reports?status=${status}&page=${page}`) });
  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/community" className="hover:underline">
            Community
          </Link>
        }
        title="Moderation queue"
        description="Reports from spaces you moderate. Hide content that breaks the guidelines, lock heated threads, and dismiss reports that do not need action."
      />
      <div className="mb-3">
        <Segmented
          label="Report status"
          value={status}
          onChange={(v) => (setStatus(v), setPage(1))}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'actioned', label: 'Actioned' },
            { value: 'dismissed', label: 'Dismissed' },
          ]}
        />
      </div>
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data!.items.length ? (
        <EmptyState icon={<FlagIcon size={22} />} title={status === 'open' ? 'No open reports' : 'Nothing here'} description="When people report threads, replies or accounts in your spaces, they appear here." />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            {q.data!.items.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="danger">{r.reason}</Badge>
                      <Badge>{r.targetType}</Badge>
                      {r.target && <StatusBadge status={r.target.status} />}
                      <span className="text-[12px] text-subtle">
                        Reported by {r.reporter.name} {timeAgo(r.createdAt)}
                      </span>
                    </div>
                    {r.target ? (
                      <div className="mt-1.5 text-[13.5px]">
                        {r.target.title && <div className="font-medium">{r.target.title}</div>}
                        {r.target.excerpt && <p className="line-clamp-3 text-muted">{r.target.excerpt}</p>}
                        {r.target.name && <div className="font-medium">{r.target.name}</div>}
                        {r.target.author && <div className="text-[12px] text-subtle">by {r.target.author.name}</div>}
                      </div>
                    ) : (
                      <p className="mt-1.5 text-[13px] text-muted">The reported content no longer exists.</p>
                    )}
                    {r.details && <p className="mt-1 text-[12.5px] text-muted">Reporter note: {r.details}</p>}
                    {r.resolution && <p className="mt-1 text-[12.5px] text-muted">Resolution: {r.resolution}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {r.target?.link && (
                      <ButtonLink to={r.target.link} size="sm">
                        Open
                      </ButtonLink>
                    )}
                    {r.status === 'open' && (
                      <Button size="sm" variant="primary" onClick={() => setResolving(r)}>
                        Resolve
                      </Button>
                    )}
                  </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={q.data!.pageSize} total={q.data!.total} onPage={setPage} />
        </>
      )}
      {resolving && <ResolveDialog r={resolving} onClose={() => setResolving(null)} />}
    </div>
  );
}
