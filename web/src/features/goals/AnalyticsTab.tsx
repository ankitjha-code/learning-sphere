import { useQuery } from '@tanstack/react-query';
import { ChartBarIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { pct } from '@/lib/format';
import { Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton, StatTile } from '@/components/ui';

type Analytics = {
  months: { month: string; created: number; done: number; dropped: number }[];
  totals: { total: number; active: number; done: number; dropped: number };
  completionRate: number | null;
  averageDaysToComplete: number | null;
  bySource: { source: string; total: number; done: number }[];
  note: string;
};

const SOURCE_LABEL: Record<string, string> = { user: 'Set by you', mentor: 'Set by a mentor', plan_generator: 'From your plan' };

export default function AnalyticsTab() {
  const q = useQuery({ queryKey: ['goal-analytics'], queryFn: () => api.get<Analytics>('/motivation/analytics') });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  if (!d.totals.total) return <EmptyState icon={<ChartBarIcon size={22} />} title="No goals to analyse yet" description="Once you complete or drop a few goals, you will see how long goals take you and how realistic your plans are." />;
  const max = Math.max(1, ...d.months.map((m) => Math.max(m.created, m.done + m.dropped)));
  const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Completed" value={d.totals.done} hint={`${d.totals.active} active`} tone="success" />
        <StatTile label="Dropped" value={d.totals.dropped} hint="Changing plans is fine" />
        <StatTile label="Completion rate" value={d.completionRate === null ? <span className="text-subtle">None yet</span> : pct(d.completionRate)} hint="Of goals you finished or dropped" />
        <StatTile label="Average time to complete" value={d.averageDaysToComplete !== null ? `${d.averageDaysToComplete} days` : <span className="text-subtle">None yet</span>} hint={d.averageDaysToComplete !== null ? 'From creation to completion' : 'Not enough completed goals yet'} />
      </div>
      <Card>
        <CardHeader title="Goals by month" description="Last 6 months. Completed goals count in the month they were completed; dropped goals in the month they were created." />
        <CardBody>
          <div className="flex items-center gap-4 pb-2 text-[12px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-success" /> Completed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-surface-3" /> Dropped
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-border-strong" /> Created
            </span>
          </div>
          <table className="w-full text-[13px]">
            <caption className="sr-only">Goals created, completed and dropped per month</caption>
            <thead className="sr-only">
              <tr>
                <th>Month</th>
                <th>Chart</th>
                <th>Completed</th>
                <th>Dropped</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {d.months.map((m) => (
                <tr key={m.month}>
                  <th scope="row" className="w-16 py-1 pr-3 text-left font-normal text-muted">
                    {monthLabel(m.month)}
                  </th>
                  <td className="py-1">
                    <div className="relative h-4">
                      <div className="absolute inset-y-0 left-0 rounded-sm border border-border-strong" style={{ width: `${(m.created / max) * 100}%` }} aria-hidden />
                      <div className="absolute inset-y-[3px] left-0 flex overflow-hidden rounded-sm" style={{ width: `${((m.done + m.dropped) / max) * 100}%` }} aria-hidden>
                        <div className="h-full bg-success" style={{ width: `${m.done + m.dropped ? (m.done / (m.done + m.dropped)) * 100 : 0}%` }} />
                        <div className="h-full flex-1 bg-surface-3" />
                      </div>
                    </div>
                  </td>
                  <td className="w-24 py-1 pl-3 text-right tabular-nums text-muted">
                    {m.done} done
                  </td>
                  <td className="w-24 py-1 pl-2 text-right tabular-nums text-subtle">{m.dropped} dropped</td>
                  <td className="w-24 py-1 pl-2 text-right tabular-nums text-subtle">{m.created} new</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="By source" />
        <CardBody>
          <ul className="space-y-1.5 text-[13.5px]">
            {d.bySource
              .filter((s) => s.total)
              .map((s) => (
                <li key={s.source} className="flex justify-between">
                  <span>{SOURCE_LABEL[s.source] ?? s.source}</span>
                  <span className="tabular-nums text-muted">
                    {s.done} of {s.total} completed
                  </span>
                </li>
              ))}
          </ul>
          <p className="mt-3 text-[12px] text-subtle">{d.note}</p>
        </CardBody>
      </Card>
    </div>
  );
}
