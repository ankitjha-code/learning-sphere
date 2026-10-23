import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChartBarIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { Card, CardBody, CardHeader, EmptyState, ErrorState, ProvenanceTag, Segmented, SkeletonRows, StatTile } from '@/components/ui';

type Agg = { requests: number; errors: number; tokens: number; estimatedRows: number; avgLatencyMs: number | null };
type Usage = {
  days: number;
  totals: Agg & { quotaBlocked: number; inputTokens: number; outputTokens: number; p95LatencyMs: number | null };
  byProvider: (Agg & { provider: string | null; model: string | null })[];
  byAssistant: (Agg & { assistant: string })[];
  byFeature: (Agg & { feature: string })[];
  byDay: (Agg & { day: string })[];
  topUsers: { userId: string; name: string | null; email: string | null; requests: number; tokens: number }[];
  note: string;
};

const nf = new Intl.NumberFormat();

export function UsageTab() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const q = useQuery({ queryKey: ['admin', 'ai', 'usage', days], queryFn: () => api.get<Usage>(`/ai/admin/usage?days=${days}`) });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13.5px] text-muted">Counts only. Prompt and answer text is never stored in usage records.</p>
        <Segmented
          label="Period"
          value={days}
          onChange={setDays}
          options={[
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
          ]}
        />
      </div>
      {q.isLoading ? <SkeletonRows rows={5} /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <UsageBody u={q.data!} />}
    </div>
  );
}

function UsageBody({ u }: { u: Usage }) {
  const t = u.totals;
  if (t.requests + t.errors + t.quotaBlocked === 0)
    return <EmptyState icon={<ChartBarIcon size={22} />} title="No AI requests in this period" description="Usage appears here once people use the AI Council or other AI features." />;
  const errorRate = t.requests + t.errors ? Math.round((t.errors / (t.requests + t.errors)) * 100) : 0;
  const maxDay = Math.max(1, ...u.byDay.map((d) => d.requests + d.errors));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Successful requests" value={nf.format(t.requests)} />
        <StatTile label="Failed attempts" value={nf.format(t.errors)} hint={`${errorRate}% of attempts`} tone={errorRate > 20 ? 'warning' : undefined} />
        <StatTile label="Blocked by quota" value={nf.format(t.quotaBlocked)} />
        <StatTile label="Tokens" value={nf.format(t.tokens)} hint={t.estimatedRows ? `${nf.format(t.estimatedRows)} requests estimated` : 'All reported by providers'} />
        <StatTile label="Latency" value={t.avgLatencyMs != null ? `${nf.format(t.avgLatencyMs)} ms` : 'n/a'} hint={t.p95LatencyMs != null ? `p95 ${nf.format(t.p95LatencyMs)} ms` : undefined} />
      </div>
      {t.estimatedRows > 0 && (
        <p className="flex items-center gap-2 text-[12.5px] text-muted">
          <ProvenanceTag kind="estimate" /> {u.note}
        </p>
      )}

      <Card>
        <CardHeader title="Requests per day" description="Successful requests and failed attempts (a failover can add a failed attempt before a success)." />
        <CardBody>
          <div className="flex h-40 items-end gap-1" role="img" aria-label={`Requests per day over ${u.days} days`}>
            {u.byDay.map((d) => (
              <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.day}: ${d.requests} ok, ${d.errors} failed`}>
                <div className="w-full rounded-t-sm bg-danger/70" style={{ height: `${(d.errors / maxDay) * 100}%` }} />
                <div className="w-full bg-accent" style={{ height: `${(d.requests / maxDay) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11.5px] text-subtle">
            <span>{u.byDay[0]?.day}</span>
            <span className="flex gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-accent" aria-hidden /> Successful
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-danger/70" aria-hidden /> Failed
              </span>
            </span>
            <span>{u.byDay[u.byDay.length - 1]?.day}</span>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <AggTable title="By provider" rows={u.byProvider.map((r) => ({ key: `${r.provider}-${r.model}`, label: `${r.provider} · ${r.model}`, ...r }))} />
        <AggTable title="By specialist" rows={u.byAssistant.map((r) => ({ key: r.assistant, label: r.assistant, ...r }))} />
        <AggTable title="By feature" rows={u.byFeature.map((r) => ({ key: r.feature, label: r.feature, ...r }))} />
        <Card>
          <CardHeader title="Top users" description="Request counts only." />
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-[13px]">
              <thead className="border-b border-border bg-surface-2 text-left text-[12px] text-muted">
                <tr>
                  <th className="h-9 px-3 pl-5 font-medium">User</th>
                  <th className="h-9 px-3 text-right font-medium">Requests</th>
                  <th className="h-9 px-3 pr-5 text-right font-medium">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {u.topUsers.map((r) => (
                  <tr key={r.userId} className="border-b border-border last:border-0">
                    <td className="max-w-[14rem] px-3 py-2.5 pl-5">
                      <div className="truncate">{r.name ?? 'Deleted user'}</div>
                      <div className="truncate text-[11.5px] text-subtle">{r.email}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{nf.format(r.requests)}</td>
                    <td className="px-3 py-2.5 pr-5 text-right tabular-nums">{nf.format(r.tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function AggTable({ title, rows }: { title: string; rows: (Agg & { key: string; label: string })[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full text-[13px]">
          <thead className="border-b border-border bg-surface-2 text-left text-[12px] text-muted">
            <tr>
              <th className="h-9 px-3 pl-5 font-medium">Name</th>
              <th className="h-9 px-3 text-right font-medium">OK</th>
              <th className="h-9 px-3 text-right font-medium">Failed</th>
              <th className="h-9 px-3 text-right font-medium">Tokens</th>
              <th className="h-9 px-3 pr-5 text-right font-medium">Avg ms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-0">
                <td className="max-w-[12rem] truncate px-3 py-2.5 pl-5 font-mono text-[12px]">{r.label}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{nf.format(r.requests)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{nf.format(r.errors)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {nf.format(r.tokens)}
                  {r.estimatedRows > 0 && (
                    <span className="text-subtle" title="Includes estimated tokens">
                      *
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 pr-5 text-right tabular-nums">{r.avgLatencyMs ?? 'n/a'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.some((r) => r.estimatedRows > 0) && <p className="border-t border-border px-5 py-2.5 text-[11.5px] text-subtle">* includes tokens estimated as characters / 4</p>}
      </div>
    </Card>
  );
}
