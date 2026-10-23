import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FlagIcon, CheckCircleIcon } from '@phosphor-icons/react';
import { api, qs, errorMessage, ApiError } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { Badge, Banner, Button, Checkbox, Dialog, EmptyState, ErrorState, Field, PageHeader, Pagination, Segmented, Select, SkeletonRows, StatusBadge, Textarea } from '@/components/ui';
import type { Paged } from './api';
import { DetailList, FilterBar, TableCard, Th, rowClass, tdClass, theadClass } from './components';

type ReportRow = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  reporterName: string | null;
  targetTitle: string | null;
  targetExists: boolean;
  targetStatus: string | null;
  openReportsOnTarget: number;
};

type ReportDetail = {
  report: ReportRow & { reporterId: string; resolvedBy: string | null };
  preview: { exists: boolean; title: string | null; excerpt: string | null; status: string | null; authorId: string | null; authorName: string | null; context: string | null };
  otherReports: { id: string; reason: string; details: string | null; status: string; createdAt: string }[];
  quickActions: { id: string; label: string }[];
};

const TARGET_LABEL: Record<string, string> = { post: 'Reply', thread: 'Thread', user: 'User', resource: 'Resource', ai_message: 'AI message', job_posting: 'Job posting' };
const REASON_LABEL: Record<string, string> = { spam: 'Spam', abuse: 'Abuse or harassment', incorrect: 'Incorrect information', copyright: 'Copyright', other: 'Other' };

function ReportDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'report', id], queryFn: () => api.get<ReportDetail>(`/admin/reports/${id}`) });
  const [outcome, setOutcome] = useState<'actioned' | 'dismissed'>('actioned');
  const [resolution, setResolution] = useState('');
  const [quickAction, setQuickAction] = useState('');
  const [includeSame, setIncludeSame] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const resolve = useMutation({
    mutationFn: () =>
      api.post<{ resolved: number }>(`/admin/reports/${id}/resolve`, {
        outcome,
        resolution,
        quickAction: outcome === 'actioned' && quickAction ? quickAction : undefined,
        includeSameTarget: includeSame,
      }),
    onSuccess: (r) => {
      toast.success(`${r.resolved} report(s) resolved. Reporters were notified.`);
      qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (e) => (e instanceof ApiError && e.fields.resolution ? setError(e.fields.resolution) : toast.error(errorMessage(e))),
  });
  const d = q.data;
  const open = d?.report.status === 'open';
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      size="lg"
      title={d ? `${TARGET_LABEL[d.report.targetType] ?? d.report.targetType} reported for ${REASON_LABEL[d.report.reason]?.toLowerCase() ?? d.report.reason}` : 'Report'}
      footer={
        open && (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant={outcome === 'actioned' && quickAction ? 'danger' : 'primary'} loading={resolve.isPending} onClick={() => resolve.mutate()}>
              {outcome === 'dismissed' ? 'Dismiss report' : quickAction ? 'Apply action and resolve' : 'Mark as actioned'}
            </Button>
          </>
        )
      }
    >
      {q.isLoading && <SkeletonRows rows={4} />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {d && (
        <div className="space-y-4">
          <DetailList
            items={[
              ['Reported by', d.report.reporterName ?? 'Unknown'],
              ['When', formatDateTime(d.report.createdAt)],
              ['Reason', REASON_LABEL[d.report.reason] ?? d.report.reason],
              ['Details', d.report.details ?? 'None given'],
              ['Status', <StatusBadge status={d.report.status} />],
            ]}
          />
          <div className="rounded-md border border-border bg-surface-2 p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
              <span>{d.preview.context ?? TARGET_LABEL[d.report.targetType]}</span>
              {d.preview.status && <StatusBadge status={d.preview.status} />}
              {d.preview.authorName && <span>by {d.preview.authorName}</span>}
            </div>
            {d.preview.exists ? (
              <>
                {d.preview.title && <div className="font-medium">{d.preview.title}</div>}
                {d.preview.excerpt && <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-fg">{d.preview.excerpt}</p>}
                <p className="mt-2 text-[12px] text-subtle">Preview is plain text and truncated. Links and formatting are not rendered.</p>
              </>
            ) : (
              <p className="text-[13.5px] text-muted">
                The reported {TARGET_LABEL[d.report.targetType]?.toLowerCase() ?? 'item'} no longer exists or cannot be previewed ({d.report.targetType} {d.report.targetId}).
              </p>
            )}
          </div>
          {d.otherReports.length > 0 && (
            <div>
              <h3 className="mb-1 text-[13px] font-semibold">Other reports on this item ({d.otherReports.length})</h3>
              <ul className="space-y-1 text-[13px]">
                {d.otherReports.map((o) => (
                  <li key={o.id} className="flex justify-between gap-2">
                    <span>
                      {REASON_LABEL[o.reason] ?? o.reason}
                      {o.details ? `: ${o.details}` : ''}
                    </span>
                    <StatusBadge status={o.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {open ? (
            <div className="space-y-3 border-t border-border pt-4">
              <Segmented
                label="Decision"
                value={outcome}
                onChange={setOutcome}
                options={[
                  { value: 'actioned', label: 'Take action' },
                  { value: 'dismissed', label: 'No violation' },
                ]}
              />
              {outcome === 'actioned' && (
                <Field
                  label="Quick action"
                  optional
                  helper={d.quickActions.length ? 'Applied immediately and recorded in the audit log.' : 'No quick action exists for this kind of item. Mark it actioned after handling it elsewhere.'}
                >
                  <Select value={quickAction} onChange={(e) => setQuickAction(e.target.value)} disabled={!d.quickActions.length}>
                    <option value="">None, I handled it elsewhere</option>
                    {d.quickActions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Resolution note" error={error} helper="Kept for moderators. Reporters only learn whether action was taken.">
                <Textarea rows={2} value={resolution} onChange={(e) => (setResolution(e.target.value), setError(undefined))} />
              </Field>
              {d.otherReports.some((o) => o.status === 'open') && <Checkbox checked={includeSame} onCheckedChange={setIncludeSame} label="Resolve the other open reports on this item too" />}
            </div>
          ) : (
            <Banner tone="info" title={`Resolved ${d.report.resolvedAt ? timeAgo(d.report.resolvedAt) : ''}`}>
              {d.report.resolution}
            </Banner>
          )}
        </div>
      )}
    </Dialog>
  );
}

export default function ModerationPage() {
  const [status, setStatus] = useState('open');
  const [targetType, setTargetType] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['admin', 'reports', { status, targetType, page }],
    queryFn: () => api.get<Paged<ReportRow> & { counts: Record<string, number> }>(`/admin/reports${qs({ status, targetType, page, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <div>
      <PageHeader
        title="Moderation"
        description="Reports from people about threads, replies, resources, users, AI messages and job postings. Decide, act, and the reporter is told the outcome in general terms."
      />
      <FilterBar>
        <Field label="Status">
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="open">Open ({list.data?.counts.open ?? 0})</option>
            <option value="actioned">Actioned</option>
            <option value="dismissed">Dismissed</option>
            <option value="all">All</option>
          </Select>
        </Field>
        <Field label="Item type">
          <Select value={targetType} onChange={(e) => (setTargetType(e.target.value), setPage(1))}>
            <option value="">All types</option>
            {Object.entries(TARGET_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>
      {list.isLoading && <SkeletonRows rows={5} />}
      {list.error && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          icon={status === 'open' ? <CheckCircleIcon size={22} /> : <FlagIcon size={22} />}
          title={status === 'open' ? 'Nothing to review' : 'No reports here'}
          description={status === 'open' ? 'There are no open reports. New reports from people appear here.' : 'Change the filters to see other reports.'}
        />
      )}
      {list.data && list.data.items.length > 0 && (
        <>
          <TableCard label="Reports">
            <thead className={theadClass}>
              <tr>
                <Th>Reported item</Th>
                <Th>Reason</Th>
                <Th>Reporter</Th>
                <Th>Status</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((r) => (
                <tr key={r.id} className={rowClass}>
                  <td className={tdClass}>
                    <button type="button" className="text-left hover:underline" onClick={() => setSelected(r.id)}>
                      <span className="font-medium">{r.targetTitle ?? (r.targetExists ? 'Untitled' : 'Item no longer exists')}</span>
                    </button>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <Badge>{TARGET_LABEL[r.targetType] ?? r.targetType}</Badge>
                      {r.targetStatus && r.targetStatus !== 'published' && r.targetStatus !== 'visible' && r.targetStatus !== 'open' && r.targetStatus !== 'active' && (
                        <StatusBadge status={r.targetStatus} />
                      )}
                      {r.openReportsOnTarget > 1 && <Badge tone="warning">{r.openReportsOnTarget} open reports</Badge>}
                    </div>
                  </td>
                  <td className={tdClass}>
                    {REASON_LABEL[r.reason] ?? r.reason}
                    {r.details && <p className="line-clamp-1 text-[12.5px] text-muted">{r.details}</p>}
                  </td>
                  <td className={`${tdClass} text-muted`}>{r.reporterName ?? 'Unknown'}</td>
                  <td className={tdClass}>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-muted`}>{timeAgo(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />
        </>
      )}
      {selected && <ReportDialog id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
