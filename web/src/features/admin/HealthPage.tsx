import { useQuery } from '@tanstack/react-query';
import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { Badge, Button, Card, CardAction, CardBody, CardHeader, ErrorState, PageHeader, Section, SkeletonRows } from '@/components/ui';
import { formatBytes } from './api';
import { DetailList, HealthBadge, TableCard, Th, rowClass, tdClass, theadClass } from './components';

type Health = {
  overall: string;
  checkedAt: string;
  services: { key: string; label: string; status: string; detail: string }[];
  database: { kind: string; latencyMs: number | null; status: string };
  worker: { running: boolean; lastTickAt: string | null; handlers: number; status: string };
  queue: { ready: number; scheduled: number; running: number; stale: number; failed24h: number; oldestReadyAgeSeconds: number };
  email: { configured: boolean; provider: string | null; note: string };
  ai: { configured: boolean; providers: { label: string; model: string; enabled: boolean; healthy: boolean }[] };
  exec: { language: string; available: boolean; provider: string; reason?: string; setupHint?: string }[];
  storage: { bytes: number; files: number; userQuotaBytes: number };
  retention: { id: string; status: string; updatedAt: string; result: Record<string, unknown> | null } | null;
  app: { version: string; uptimeSeconds: number; node: string; env: string };
  legend: Record<string, string>;
};

function uptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}

export default function HealthPage() {
  const q = useQuery({ queryKey: ['admin', 'health'], queryFn: () => api.get<Health>('/admin/health'), refetchInterval: 15_000 });
  const d = q.data;
  return (
    <div>
      <PageHeader
        title="System health"
        description="Checked live on this server. Optional services that are not set up show as Not configured, and the features that need them say so instead of failing."
        badge={d && <HealthBadge status={d.overall} />}
        actions={
          <Button icon={<ArrowClockwiseIcon size={16} />} onClick={() => q.refetch()} loading={q.isFetching}>
            Check again
          </Button>
        }
      />
      {q.isLoading && <SkeletonRows rows={6} />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {d && (
        <div className="space-y-8">
          <TableCard label="Services">
            <thead className={theadClass}>
              <tr>
                <Th>Service</Th>
                <Th>Status</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {d.services.map((s) => (
                <tr key={s.key} className={rowClass}>
                  <td className={`${tdClass} font-medium`}>{s.label}</td>
                  <td className={tdClass}>
                    <HealthBadge status={s.status} />
                  </td>
                  <td className={`${tdClass} text-muted`}>{s.detail}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <Section title="Code execution runtimes" description="Languages the sandbox can run on this server. Unavailable languages are labeled in CodeLab.">
                {d.exec.length === 0 ? (
                  <p className="rounded-lg border border-border bg-surface px-5 py-4 text-[13.5px] text-muted shadow-1">No runtimes reported by the execution service.</p>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                    {d.exec.map((r) => (
                      <li key={r.language} className="flex items-start justify-between gap-4 px-5 py-3.5 text-[13.5px]">
                        <div className="min-w-0">
                          <span className="font-medium capitalize">{r.language}</span>
                          {!r.available && (r.reason || r.setupHint) && <p className="mt-0.5 text-[12.5px] text-muted">{r.reason ?? r.setupHint}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Badge>{r.provider}</Badge>
                          <HealthBadge status={r.available ? 'ok' : 'not_configured'} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
            <aside className="min-w-0 space-y-5">
              <Card>
                <CardHeader title="Application" />
                <CardBody>
                  <DetailList
                    items={[
                      ['Version', d.app.version],
                      ['Uptime', uptime(d.app.uptimeSeconds)],
                      ['Environment', d.app.env],
                      ['Node.js', d.app.node],
                      ['Database', `${d.database.kind === 'pglite' ? 'Embedded PGlite' : 'PostgreSQL'} (${d.database.latencyMs ?? '—'} ms)`],
                    ]}
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Job queue" action={<CardAction to="/app/admin/jobs">Open jobs</CardAction>} />
                <CardBody>
                  <DetailList
                    items={[
                      ['Worker', d.worker.running ? `Running, ticked ${timeAgo(d.worker.lastTickAt)}` : 'Not running in this process'],
                      ['Ready to run', d.queue.ready],
                      ['Scheduled later', d.queue.scheduled],
                      ['Running', d.queue.running],
                      ['Stuck over 5 min', d.queue.stale],
                      ['Failed in 24 h', d.queue.failed24h],
                      ['Oldest waiting', d.queue.oldestReadyAgeSeconds ? `${d.queue.oldestReadyAgeSeconds} s` : 'None'],
                    ]}
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Storage and retention" action={<CardAction to="/app/admin/settings?tab=retention">Settings</CardAction>} />
                <CardBody>
                  <DetailList
                    items={[
                      ['Stored files', `${d.storage.files} (${formatBytes(d.storage.bytes)})`],
                      ['Quota per user', formatBytes(d.storage.userQuotaBytes)],
                      ['Last retention sweep', d.retention ? `${d.retention.status.charAt(0).toUpperCase()}${d.retention.status.slice(1)} ${formatDateTime(d.retention.updatedAt)}` : 'Not run yet'],
                    ]}
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="AI providers" action={<CardAction to="/app/admin/ai">Manage AI</CardAction>} />
                {d.ai.providers.length === 0 ? (
                  <CardBody>
                    <p className="text-[13.5px] text-muted">No AI provider configured. AI features explain they are unavailable; everything else keeps working.</p>
                  </CardBody>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {d.ai.providers.map((p) => (
                      <li key={p.label + p.model} className="flex items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{p.label}</span>
                          <span className="block truncate font-mono text-[12px] text-muted">{p.model}</span>
                        </span>
                        <HealthBadge status={!p.enabled ? 'not_configured' : p.healthy ? 'ok' : 'degraded'} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </aside>
          </div>
          <div className="rounded-lg border border-border bg-surface-2/60 px-5 py-4 text-[12.5px] text-muted">
            <p className="mb-2">Checked {formatDateTime(d.checkedAt)}. Refreshes every 15 seconds.</p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {Object.entries(d.legend).map(([k, v]) => (
                <li key={k} className="flex items-center gap-1.5">
                  <HealthBadge status={k} /> {v}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
