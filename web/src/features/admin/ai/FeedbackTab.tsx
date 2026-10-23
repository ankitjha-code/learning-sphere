import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FlagIcon, ThumbsDownIcon, ThumbsUpIcon, ChatCircleDotsIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Banner, Button, Card, Dialog, EmptyState, ErrorState, Field, Markdown, Pagination, Segmented, SkeletonRows, StatTile, StatusBadge, Textarea } from '@/components/ui';

type Report = { id: string; messageId: string; reason: string; details: string | null; status: string; resolution: string | null; createdAt: string; reporterName: string | null };
type Feedback = { messageId: string; value: number; note: string | null; assistant: string; provider: string | null; model: string | null; createdAt: string };

export function FeedbackTab() {
  const [view, setView] = useState<'reports' | 'feedback'>('reports');
  return (
    <div className="space-y-4">
      <Segmented
        label="Show"
        value={view}
        onChange={setView}
        options={[
          { value: 'reports', label: 'Reports' },
          { value: 'feedback', label: 'Ratings' },
        ]}
      />
      {view === 'reports' ? <Reports /> : <Ratings />}
    </div>
  );
}

function Reports() {
  const [status, setStatus] = useState<'open' | 'actioned' | 'dismissed'>('open');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<Report | null>(null);
  const q = useQuery({ queryKey: ['admin', 'ai', 'reports', status, page], queryFn: () => api.get<{ items: Report[]; total: number }>(`/ai/admin/reports?status=${status}&page=${page}`) });
  return (
    <div className="space-y-3">
      <Segmented
        label="Report status"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'actioned', label: 'Actioned' },
          { value: 'dismissed', label: 'Dismissed' },
        ]}
      />
      {q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <EmptyState icon={<FlagIcon size={22} />} title={`No ${status} reports`} description="When someone reports an AI answer, it shows up here for review." />
      ) : (
        <>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {q.data!.items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-4 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{r.reason}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="text-[12px] text-subtle">
                      {r.reporterName ?? 'Unknown'} · {formatDateTime(r.createdAt)}
                    </div>
                    {r.details && <p className="mt-1 text-muted">{r.details}</p>}
                  </div>
                  <Button size="sm" onClick={() => setViewing(r)}>
                    Review
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
          <Pagination page={page} pageSize={25} total={q.data!.total} onPage={setPage} />
        </>
      )}
      {viewing && <ReportDialog report={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ReportDialog({ report, onClose }: { report: Report; onClose: () => void }) {
  const qc = useQueryClient();
  const [resolution, setResolution] = useState('');
  const q = useQuery({
    queryKey: ['admin', 'ai', 'report', report.id],
    queryFn: () => api.get<{ message: { content: string; provider: string | null; model: string | null; assistant: string; status: string } | null }>(`/ai/admin/reports/${report.id}`),
  });
  const resolve = useMutation({
    mutationFn: (status: 'actioned' | 'dismissed') => api.post(`/ai/admin/reports/${report.id}/resolve`, { status, resolution: resolution.trim() || undefined }),
    onSuccess: (_d, s) => {
      toast.success(s === 'actioned' ? 'Report marked as actioned' : 'Report dismissed');
      qc.invalidateQueries({ queryKey: ['admin', 'ai', 'reports'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const open = report.status === 'open';
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="Reported answer"
      description="Opening a reported answer is recorded in the audit log."
      size="lg"
      footer={
        open ? (
          <>
            <Button onClick={() => resolve.mutate('dismissed')} loading={resolve.isPending && resolve.variables === 'dismissed'}>
              Dismiss
            </Button>
            <Button variant="primary" onClick={() => resolve.mutate('actioned')} loading={resolve.isPending && resolve.variables === 'actioned'}>
              Mark actioned
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      {q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data!.message ? (
        <Banner tone="info">The message was deleted by its owner.</Banner>
      ) : (
        <div className="space-y-3">
          <p className="text-[12.5px] text-subtle">
            {q.data!.message.assistant} · {q.data!.message.provider ?? 'no provider'} {q.data!.message.model ? `· ${q.data!.message.model}` : ''}
          </p>
          <div className="max-h-80 overflow-auto rounded-md border border-border p-3">
            <Markdown source={q.data!.message.content} />
          </div>
          {open ? (
            <Field label="Resolution note" optional>
              <Textarea rows={2} value={resolution} maxLength={1000} onChange={(e) => setResolution(e.target.value)} />
            </Field>
          ) : (
            report.resolution && <p className="text-[13px] text-muted">Resolution: {report.resolution}</p>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Ratings() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['admin', 'ai', 'feedback', page],
    queryFn: () => api.get<{ items: Feedback[]; total: number; summary: { up: number; down: number }; note: string }>(`/ai/admin/feedback?page=${page}`),
  });
  if (q.isLoading) return <SkeletonRows rows={3} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  if (!d.items.length) return <EmptyState icon={<ChatCircleDotsIcon size={22} />} title="No ratings yet" description="Thumbs up and down on AI answers appear here, without the answer text." />;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <StatTile label="Helpful" value={d.summary.up} icon={<ThumbsUpIcon />} tone="success" />
        <StatTile label="Not helpful" value={d.summary.down} icon={<ThumbsDownIcon />} tone="warning" />
      </div>
      <p className="text-[12.5px] text-subtle">{d.note}</p>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {d.items.map((f) => (
            <li key={f.messageId} className="flex items-start gap-3 px-5 py-3.5 text-[13px]">
              {f.value === 1 ? <ThumbsUpIcon size={16} className="mt-0.5 text-success" aria-label="Helpful" /> : <ThumbsDownIcon size={16} className="mt-0.5 text-danger" aria-label="Not helpful" />}
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-subtle">
                  {f.assistant} · {f.provider ?? 'n/a'} {f.model ? `· ${f.model}` : ''} · {formatDateTime(f.createdAt)}
                </div>
                {f.note && <p className="text-muted">{f.note}</p>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Pagination page={page} pageSize={25} total={d.total} onPage={setPage} />
    </div>
  );
}
