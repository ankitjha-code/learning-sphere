import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowClockwiseIcon, CheckCircleIcon, FlagIcon, WarningDiamondIcon, RobotIcon, HeartbeatIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { timeAgo } from '@/lib/format';
import { Badge, Banner, Button, ButtonLink, Card, CardAction, CardBody, CardHeader, ErrorState, PageHeader, Progress, Section, Skeleton, StatusBadge } from '@/components/ui';
import { formatBytes, formatNumber, type Metric } from './api';
import { MetricTile, SeverityBadge } from './components';

type Overview = {
  generatedAt: string;
  metrics: Metric[];
  orgsByKind: { kind: string; total: number; suspended: number }[];
  signupsPerWeek: { week: string; n: number }[];
  jobs: { queued: number; running: number; retrying: number; failed24h: number; failedTotal: number };
  failedWorkflows: { id: string; type: string; lastError: string | null; attempts: number; updatedAt: string }[];
  storage: { purpose: string; bytes: number; count: number }[];
  ai: { requests: number; errors: number; users: number; byStatus: { status: string; n: number }[] };
  openIncidents: { id: string; title: string; severity: string; status: string; createdAt: string }[];
  featureAdoption: { area: string; users: number; events: number }[];
  email: { configured: boolean; provider: string | null; note: string };
  notes: string[];
};

function BarList({ rows, format = formatNumber, label }: { rows: { label: string; value: number }[]; format?: (n: number) => string; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3" aria-label={label}>
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1.5 flex justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-muted first-letter:uppercase">{r.label}</span>
            <span className="font-medium tabular-nums">{format(r.value)}</span>
          </div>
          <Progress value={r.value} max={max} label={`${r.label}: ${format(r.value)}`} />
        </li>
      ))}
    </ul>
  );
}

export default function OverviewPage() {
  const me = useSession();
  const isAdmin = me.user.platformRole === 'platform_admin';
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api.get<Overview>('/admin/overview'), refetchInterval: 30_000 });
  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/admin/jobs/${id}/retry`),
    onSuccess: () => {
      toast.success('Job queued for retry');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const d = q.data;
  const metric = (key: string) => d?.metrics.find((m) => m.key === key);
  const tone = (key: string, v: number | string): 'danger' | 'warning' | undefined =>
    typeof v !== 'number' || v === 0 ? undefined : key === 'jobs.failed24h' || key === 'ai.errors7' ? 'danger' : key === 'reports.open' || key === 'incidents.open' ? 'warning' : undefined;

  const metricsGrid = (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
      {d
        ? d.metrics.map((m) => (
            <MetricTile key={m.key} label={m.label} definition={m.definition} value={m.key === 'storage.bytes' ? formatBytes(Number(m.value)) : formatNumber(m.value)} tone={tone(m.key, m.value)} />
          ))
        : Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-lg" />)}
    </div>
  );

  return (
    <div>
      <PageHeader
        hero
        title="Platform overview"
        description="Live counts from stored records. Hover or focus the info icon on a tile to see exactly how it is counted."
        actions={
          <>
            <ButtonLink to="/app/admin/health" icon={<HeartbeatIcon size={16} />}>
              System health
            </ButtonLink>
            <ButtonLink to="/app/admin/ai" icon={<RobotIcon size={16} />}>
              AI providers
            </ButtonLink>
          </>
        }
      >
        {q.error ? null : metricsGrid}
      </PageHeader>
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {d && (
        <div className="space-y-8">
          {!d.email.configured && (
            <Banner tone="warning" title="Email is not configured">
              {d.email.note} Password resets need an admin-generated link (Users, open a user, Create reset link).
            </Banner>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-8">
              <Section
                title="Failed background work"
                description={`${d.jobs.failed24h} failed in the last 24 hours, ${d.jobs.failedTotal} awaiting action in total.`}
                action={<CardAction to="/app/admin/jobs?status=failed">Open jobs</CardAction>}
              >
                {d.failedWorkflows.length === 0 ? (
                  <QuietRow icon={<CheckCircleIcon size={18} weight="fill" />} title="No failed jobs">
                    Every background task either succeeded or is still being retried automatically.
                  </QuietRow>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                    {d.failedWorkflows.map((j) => (
                      <li key={j.id} className="flex items-start justify-between gap-4 px-5 py-4">
                        <div className="min-w-0">
                          <Link to={`/app/admin/jobs?job=${j.id}`} className="font-mono text-[13px] font-medium hover:text-accent-text">
                            {j.type}
                          </Link>
                          <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">{j.lastError ?? 'No error message recorded.'}</p>
                          <p className="mt-0.5 text-[12px] text-subtle">
                            {j.attempts} attempts, failed {timeAgo(j.updatedAt)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          icon={<ArrowClockwiseIcon size={14} />}
                          onClick={() => retry.mutate(j.id)}
                          loading={retry.isPending && retry.variables === j.id}
                          disabled={!isAdmin}
                          disabledReason={!isAdmin ? 'Support staff have read-only access.' : undefined}
                        >
                          Retry
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section
                title="Open incidents"
                description="High and critical incidents show a banner to every signed-in user."
                action={<CardAction to="/app/admin/incidents">All incidents</CardAction>}
              >
                {d.openIncidents.length === 0 ? (
                  <QuietRow icon={<CheckCircleIcon size={18} weight="fill" />} title="No open incidents">
                    Record an incident when something affects users, so there is a timeline to share.
                  </QuietRow>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                    {d.openIncidents.map((i) => (
                      <li key={i.id} className="relative flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning">
                            <WarningDiamondIcon size={18} weight="duotone" />
                          </span>
                          <Link to={`/app/admin/incidents/${i.id}`} className="min-w-0 truncate text-[14px] font-medium after:absolute after:inset-0 hover:text-accent-text">
                            {i.title}
                          </Link>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="hidden text-[12.5px] text-muted sm:inline">{timeAgo(i.createdAt)}</span>
                          <SeverityBadge severity={i.severity} />
                          <StatusBadge status={i.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Card>
                <CardHeader title="Feature adoption, last 30 days" description="Distinct users with at least one recorded activity in each area. Shows usage, not why it changed." />
                <CardBody>
                  {d.featureAdoption.length ? (
                    <BarList label="Feature adoption" rows={d.featureAdoption.map((a) => ({ label: a.area.replace(/_/g, ' '), value: a.users }))} />
                  ) : (
                    <p className="text-[13px] text-muted">No learning or work activity recorded in the last 30 days.</p>
                  )}
                </CardBody>
              </Card>

              <section aria-labelledby="reading-numbers" className="rounded-lg border border-border bg-surface-2/60 px-5 py-4">
                <h2 id="reading-numbers" className="text-[13.5px] font-semibold">
                  Reading these numbers
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-muted">
                  {d.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                  <li>Generated {timeAgo(d.generatedAt)}. The page refreshes every 30 seconds.</li>
                </ul>
              </section>
            </div>

            <aside className="min-w-0 space-y-5">
              <Card>
                <CardHeader title="Moderation" description="Reports waiting for a decision." action={<CardAction to="/app/admin/moderation">Open queue</CardAction>} />
                <CardBody className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-subtle ring-1 ring-inset ring-border">
                    <FlagIcon size={18} />
                  </span>
                  <span className="font-display text-[28px] font-semibold leading-9 tabular-nums">{formatNumber(metric('reports.open')?.value ?? 0)}</span>
                  <span className="text-[13px] text-muted">open {Number(metric('reports.open')?.value ?? 0) === 1 ? 'report' : 'reports'}</span>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Organizations" description="By kind. Suspended ones are noted." action={<CardAction to="/app/admin/orgs">Manage</CardAction>} />
                {d.orgsByKind.length === 0 ? (
                  <CardBody>
                    <p className="text-[13px] text-muted">No organizations yet.</p>
                  </CardBody>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {d.orgsByKind.map((o) => (
                      <li key={o.kind} className="flex items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
                        <span className="capitalize text-muted">{o.kind}</span>
                        <span className="flex items-center gap-2 tabular-nums">
                          {o.suspended > 0 && <Badge tone="warning">{o.suspended} suspended</Badge>}
                          <span className="font-medium">{o.total}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card>
                <CardHeader title="Signups per week" description="New accounts by ISO week, last 8 weeks." />
                <CardBody>
                  {d.signupsPerWeek.length ? (
                    <BarList label="Signups per week" rows={d.signupsPerWeek.map((s) => ({ label: `Week of ${s.week}`, value: s.n }))} />
                  ) : (
                    <p className="text-[13px] text-muted">No signups in the last 8 weeks.</p>
                  )}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="AI usage, last 7 days" description={`${formatNumber(d.ai.requests)} requests from ${formatNumber(d.ai.users)} users.`} />
                <CardBody>
                  {d.ai.byStatus.length ? (
                    <BarList label="AI requests by status" rows={d.ai.byStatus.map((s) => ({ label: s.status.replace(/_/g, ' '), value: s.n }))} />
                  ) : (
                    <p className="text-[13px] text-muted">No AI requests recorded in the last 7 days.</p>
                  )}
                  <p className="mt-3 text-[12px] text-subtle">Failures include timeouts, rate limits and quota stops.</p>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Storage by purpose" description="Ready files only. Deleted and expired files are excluded." />
                <CardBody>
                  {d.storage.length ? (
                    <BarList label="Storage by purpose" rows={d.storage.map((s) => ({ label: `${s.purpose} (${s.count} files)`, value: s.bytes }))} format={formatBytes} />
                  ) : (
                    <p className="text-[13px] text-muted">No stored files yet.</p>
                  )}
                </CardBody>
              </Card>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

/** A one-row "all clear" message in the same frame as a list group. */
function QuietRow({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface px-5 py-4 shadow-1">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-success-soft text-success">{icon}</span>
      <div className="min-w-0">
        <div className="text-[14px] font-medium">{title}</div>
        <p className="mt-0.5 text-[13px] text-muted">{children}</p>
      </div>
    </div>
  );
}
