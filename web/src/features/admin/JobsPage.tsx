import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowClockwiseIcon, QueueIcon, MagnifyingGlassIcon, StopCircleIcon, FirstAidKitIcon, CheckCircleIcon } from '@phosphor-icons/react';
import { api, qs, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDateTime, timeAgo, fromLocalInput } from '@/lib/format';
import { Badge, Banner, Button, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, Select, SkeletonRows, StatusBadge, Tooltip } from '@/components/ui';
import type { JobRow, Paged } from './api';
import { DetailList, FilterBar, JsonBlock, TableCard, Th, rowClass, tdClass, theadClass } from './components';

type JobsResponse = Paged<JobRow> & {
  counts: Record<string, number>;
  types: { type: string; total: number; failed: number }[];
  staleRunning: number;
  worker: { running: boolean; lastTickAt: string | null; handlerCount: number };
};

type JobDetail = {
  job: JobRow & {
    payload: unknown;
    result: unknown;
    idempotencyKey: string | null;
    orgName: string | null;
    createdBy: string | null;
    createdByName: string | null;
  };
  history: { id: string; action: string; createdAt: string }[];
  can: { retry: boolean; cancel: boolean };
  reasons: { retry: string | null; cancel: string | null };
};

const STATUSES = ['queued', 'running', 'retrying', 'succeeded', 'failed', 'cancelled'];

function JobDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'job', id], queryFn: () => api.get<JobDetail>(`/admin/jobs/${id}`), refetchInterval: 5000 });
  const act = useMutation({
    mutationFn: (action: 'retry' | 'cancel') => api.post(`/admin/jobs/${id}/${action}`),
    onSuccess: (_r, action) => {
      toast.success(action === 'retry' ? 'Job queued for retry. The worker will pick it up shortly.' : 'Job cancelled');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const d = q.data;
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      size="lg"
      title={d ? <span className="font-mono">{d.job.type}</span> : 'Job'}
      description={d ? `Job ${d.job.id}` : undefined}
      footer={
        d && (
          <>
            <Button
              icon={<StopCircleIcon size={16} />}
              disabled={!d.can.cancel}
              disabledReason={d.reasons.cancel ?? undefined}
              loading={act.isPending && act.variables === 'cancel'}
              onClick={() => act.mutate('cancel')}
            >
              Cancel job
            </Button>
            <Button
              variant="primary"
              icon={<ArrowClockwiseIcon size={16} />}
              disabled={!d.can.retry}
              disabledReason={d.reasons.retry ?? undefined}
              loading={act.isPending && act.variables === 'retry'}
              onClick={() => act.mutate('retry')}
            >
              Retry job
            </Button>
          </>
        )
      }
    >
      {q.isLoading && <SkeletonRows rows={4} />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {d && (
        <div className="space-y-4">
          {d.job.status === 'failed' && (
            <Banner tone="danger" title="This job stopped after using all its attempts">
              Fix the cause if you can (for example configure the missing service), then retry. Handlers are idempotent, so a retry does not create duplicate results.
            </Banner>
          )}
          {d.can.retry && d.reasons.retry && <Banner tone="warning">{d.reasons.retry}</Banner>}
          <DetailList
            items={[
              ['Status', <StatusBadge status={d.job.status} />],
              ['Attempts', `${d.job.attempts} of ${d.job.maxAttempts}`],
              ['Created', `${formatDateTime(d.job.createdAt)}${d.job.createdByName ? ` by ${d.job.createdByName}` : ''}`],
              ['Last update', formatDateTime(d.job.updatedAt)],
              ['Next run', d.job.status === 'queued' || d.job.status === 'retrying' ? formatDateTime(d.job.runAt) : '—'],
              ['Locked since', d.job.lockedAt ? formatDateTime(d.job.lockedAt) : '—'],
              ['Organization', d.job.orgName ?? '—'],
              ['Idempotency key', d.job.idempotencyKey ? <span className="font-mono text-[12.5px]">{d.job.idempotencyKey}</span> : '—'],
              ['Handler', d.job.handlerRegistered ? 'Registered' : <span className="text-danger">Not registered in this process</span>],
            ]}
          />
          {d.job.lastError && (
            <div>
              <h3 className="mb-1 text-[13px] font-semibold">Last error</h3>
              <pre className="max-h-48 overflow-auto rounded-md border border-border bg-danger-soft p-3 font-mono text-[12px] whitespace-pre-wrap text-fg">{d.job.lastError}</pre>
            </div>
          )}
          <div>
            <h3 className="mb-1 text-[13px] font-semibold">Payload</h3>
            <p className="mb-1 text-[12px] text-muted">Fields that look like secrets (passwords, tokens, keys) are replaced with [redacted].</p>
            <JsonBlock value={d.job.payload} label="Job payload" />
          </div>
          <div>
            <h3 className="mb-1 text-[13px] font-semibold">Result</h3>
            <JsonBlock value={d.job.result} label="Job result" />
          </div>
          {d.history.length > 0 && (
            <div>
              <h3 className="mb-1 text-[13px] font-semibold">Admin actions</h3>
              <ul className="space-y-1 text-[13px]">
                {d.history.map((h) => (
                  <li key={h.id} className="flex justify-between">
                    <span>{h.action.replace('admin.job_', '').replace('_', ' ')}</span>
                    <span className="text-muted">{formatDateTime(h.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

export default function JobsPage() {
  const me = useSession();
  const isAdmin = me.user.platformRole === 'platform_admin';
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const type = params.get('type') ?? '';
  const status = params.get('status') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Number(params.get('page') ?? 1);
  const selected = params.get('job');
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmStale, setConfirmStale] = useState(false);
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page' && k !== 'job') next.delete('page');
    setParams(next, { replace: true });
  };

  const list = useQuery({
    queryKey: ['admin', 'jobs', { type, status, from, to, page }],
    queryFn: () => api.get<JobsResponse>(`/admin/jobs${qs({ type, status, from: fromLocalInput(from), to: fromLocalInput(to), page, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 5000, // pauses automatically while the tab is hidden
  });
  const bulk = useMutation({
    mutationFn: () => api.post<{ retried: number }>('/admin/jobs/bulk-retry', { type }),
    onSuccess: (r) => {
      toast.success(`${r.retried} job(s) queued for retry`);
      setConfirmBulk(false);
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const stale = useMutation({
    mutationFn: () => api.post<{ recovered: number }>('/admin/jobs/recover-stale', { olderThanMinutes: 5 }),
    onSuccess: (r) => {
      toast.success(r.recovered ? `${r.recovered} stuck job(s) returned to the queue` : 'No stuck jobs found');
      setConfirmStale(false);
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const quick = useMutation({
    mutationFn: (id: string) => api.post(`/admin/jobs/${id}/retry`),
    onSuccess: () => {
      toast.success('Job queued for retry');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const d = list.data;
  const failedOfType = d?.types.find((t) => t.type === type)?.failed ?? 0;
  const filtered = !!(type || status || from || to);
  const readOnly = !isAdmin ? 'Support staff have read-only access.' : undefined;

  return (
    <div>
      <PageHeader
        title="Background jobs"
        description="Grading, document processing, email, exports and other work that runs outside a request. Failed jobs stay here with their error until someone retries or cancels them."
        actions={
          <Button icon={<FirstAidKitIcon size={16} />} onClick={() => setConfirmStale(true)} disabled={!isAdmin} disabledReason={readOnly}>
            Recover stuck jobs{d?.staleRunning ? ` (${d.staleRunning})` : ''}
          </Button>
        }
      />
      {d && !d.worker.running && (
        <Banner tone="warning" title="The background worker is not running in this server process" className="mb-4">
          Queued jobs wait until a worker runs. Check WORKER_ENABLED, or that a worker process is deployed.
        </Banner>
      )}
      {d && d.staleRunning > 0 && (
        <Banner tone="warning" className="mb-4">
          {d.staleRunning} job(s) have been running for more than 5 minutes, usually because a server restarted mid-job. Recover them to put them back in the queue. The worker also does this
          automatically.
        </Banner>
      )}
      {d && (
        <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Jobs by status">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set('status', status === s ? null : s)}
              aria-pressed={status === s}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors ${status === s ? 'border-accent bg-accent-soft text-accent-text' : 'border-border bg-surface text-muted hover:text-fg'}`}
            >
              <span className="capitalize">{s}</span>
              <span className="tabular-nums font-semibold">{d.counts[s] ?? 0}</span>
            </button>
          ))}
          <span className="w-full text-[12.5px] text-subtle sm:ml-auto sm:w-auto">Worker {d.worker.running ? `ticked ${timeAgo(d.worker.lastTickAt)}` : 'stopped'} · refreshes every 5 s</span>
        </div>
      )}
      <FilterBar>
        <Field label="Type">
          <Select value={type} onChange={(e) => set('type', e.target.value)}>
            <option value="">All types</option>
            {d?.types.map((t) => (
              <option key={t.type} value={t.type}>
                {t.type} ({t.total}
                {t.failed ? `, ${t.failed} failed` : ''})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Created from">
          <Input type="datetime-local" value={from} onChange={(e) => set('from', e.target.value)} />
        </Field>
        <Field label="Created to">
          <Input type="datetime-local" value={to} onChange={(e) => set('to', e.target.value)} />
        </Field>
        {type && (
          <div className="self-end">
            <Button icon={<ArrowClockwiseIcon size={16} />} onClick={() => setConfirmBulk(true)} disabled={!isAdmin || failedOfType === 0} disabledReason={readOnly ?? 'No failed jobs of this type'}>
              Retry all failed ({failedOfType})
            </Button>
          </div>
        )}
      </FilterBar>

      {list.isLoading && <SkeletonRows rows={6} />}
      {list.error && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
      {d && d.items.length === 0 && (
        <EmptyState
          icon={filtered ? <MagnifyingGlassIcon size={22} /> : status === 'failed' ? <CheckCircleIcon size={22} /> : <QueueIcon size={22} />}
          title={filtered ? 'No jobs match these filters' : 'No background jobs yet'}
          description={filtered ? 'Clear a filter to see more.' : 'Jobs appear when the platform sends email, grades work, builds exports or syncs feeds.'}
        />
      )}
      {d && d.items.length > 0 && (
        <>
          <TableCard label="Background jobs">
            <thead className={theadClass}>
              <tr>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Attempts</Th>
                <Th>Last error</Th>
                <Th>Updated</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((j) => (
                <tr key={j.id} className={rowClass}>
                  <td className={tdClass}>
                    <button type="button" className="text-left font-mono text-[13px] font-medium hover:underline" onClick={() => set('job', j.id)}>
                      {j.type}
                    </button>
                    {!j.handlerRegistered && (
                      <div>
                        <Badge tone="danger">No handler</Badge>
                      </div>
                    )}
                  </td>
                  <td className={tdClass}>
                    <StatusBadge status={j.status} />
                  </td>
                  <td className={`${tdClass} tabular-nums`}>
                    {j.attempts}/{j.maxAttempts}
                  </td>
                  <td className={`${tdClass} max-w-[360px]`}>
                    {j.lastError ? (
                      <Tooltip content={j.lastError}>
                        <span className="line-clamp-2 text-[12.5px] text-muted" tabIndex={0}>
                          {j.lastError}
                        </span>
                      </Tooltip>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-muted`}>{timeAgo(j.updatedAt)}</td>
                  <td className={`${tdClass} text-right`}>
                    <div className="flex justify-end gap-1">
                      {(j.status === 'failed' || j.status === 'cancelled') && (
                        <Button
                          size="sm"
                          icon={<ArrowClockwiseIcon size={14} />}
                          onClick={() => quick.mutate(j.id)}
                          loading={quick.isPending && quick.variables === j.id}
                          disabled={!isAdmin}
                          disabledReason={readOnly}
                        >
                          Retry
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => set('job', j.id)}>
                        Details
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <Pagination page={page} pageSize={25} total={d.total} onPage={(p) => set('page', String(p))} />
        </>
      )}

      {selected && <JobDetailDialog id={selected} onClose={() => set('job', null)} />}
      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        title={`Retry ${failedOfType} failed "${type}" job(s)?`}
        description="Each job gets one more attempt. Handlers are idempotent, so jobs that partly ran do not produce duplicate results. If the cause is not fixed they will fail again."
        confirmLabel="Retry all"
        loading={bulk.isPending}
        onConfirm={() => bulk.mutate()}
      />
      <ConfirmDialog
        open={confirmStale}
        onOpenChange={setConfirmStale}
        title="Recover stuck jobs?"
        description="Jobs marked running for more than 5 minutes go back to the queue and run again. Only do this if no worker is still processing them."
        confirmLabel="Recover jobs"
        loading={stale.isPending}
        onConfirm={() => stale.mutate()}
      />
    </div>
  );
}
