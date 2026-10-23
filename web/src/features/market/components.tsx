import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRightIcon, ArrowSquareOutIcon, ArrowUpRightIcon, InfoIcon, MinusIcon } from '@phosphor-icons/react';
import { Badge, Card, CardHeader, ProvenanceTag, StatusBadge } from '@/components/ui';
import { formatDateTime, timeAgo } from '@/lib/format';
import { listText, pctText, rangeText, shortDay, type BasedOn, type Freshness, type SourcesReport, type Trend, type Week } from './api';

/** One-line data provenance: how many postings, from which sources, fetched when. */
export function ProvenanceLine({ basedOn, freshness }: { basedOn: BasedOn; freshness?: Freshness }) {
  if (basedOn.dataset === 'sample') {
    return (
      <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-muted">
        <ProvenanceTag kind="sample" />
        <span>
          Based on {basedOn.postings} sample postings written for demonstration, not real vacancies.
        </span>
      </p>
    );
  }
  if (!basedOn.postings) return <p className="text-[13.5px] text-muted">No postings to analyse yet.</p>;
  const names = basedOn.sources.map((s) => (s.kind === 'platform' ? 'jobs published on this platform' : s.label));
  const fetched = rangeText(basedOn.dateRange.fetchedFrom, basedOn.dateRange.fetchedTo);
  return (
    <p className="text-[13.5px] text-muted" data-testid="market-provenance">
      Based on <span className="font-medium text-fg tabular-nums">{basedOn.postings}</span> postings from {listText(names)}
      {fetched ? `, fetched ${fetched}` : ''}.
      {freshness?.status === 'historical' && <span className="ml-1 font-medium text-warning">Historical data.</span>}
    </p>
  );
}

export function TrendBadge({ trend }: { trend: Trend | null }) {
  if (!trend) return <span className="text-[12.5px] text-subtle">Not shown</span>;
  if (trend.direction === 'up')
    return (
      <Badge tone="success" icon={<ArrowUpRightIcon size={12} weight="bold" aria-hidden />}>
        Up {Math.abs(trend.changePoints).toFixed(1)} pts
      </Badge>
    );
  if (trend.direction === 'down')
    return (
      <Badge tone="warning" icon={<ArrowDownRightIcon size={12} weight="bold" aria-hidden />}>
        Down {Math.abs(trend.changePoints).toFixed(1)} pts
      </Badge>
    );
  return (
    <Badge icon={<MinusIcon size={12} aria-hidden />}>
      No clear change
    </Badge>
  );
}

export type BarRow = { key: string; label: ReactNode; value: number; share: number; extra?: ReactNode };

/**
 * Accessible bar chart that is also the data table: each row shows the label, the count and the
 * share as text, with a decorative bar (aria-hidden) scaled to the largest share.
 */
export function BarTable({ rows, caption, labelHeader, valueHeader = 'Postings', shareHeader = 'Share', extraHeader }: { rows: BarRow[]; caption: string; labelHeader: string; valueHeader?: string; shareHeader?: string; extraHeader?: string }) {
  const maxShare = Math.max(0.0001, ...rows.map((r) => r.share));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13.5px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-left text-[12px] text-muted">
            <th scope="col" className="whitespace-nowrap py-2 pr-3 font-medium">
              {labelHeader}
            </th>
            <th scope="col" className="w-[34%] py-2 pr-3 font-medium">
              <span className="sr-only">Bar</span>
            </th>
            <th scope="col" className="whitespace-nowrap py-2 pr-3 text-right font-medium">
              {shareHeader}
            </th>
            <th scope="col" className="whitespace-nowrap py-2 pr-3 text-right font-medium">
              {valueHeader}
            </th>
            {extraHeader && (
              <th scope="col" className="whitespace-nowrap py-2 text-right font-medium">
                {extraHeader}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                {r.label}
              </th>
              <td className="py-2 pr-3" aria-hidden>
                <div className="h-2 w-full rounded-full bg-surface-3">
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(2, (r.share / maxShare) * 100)}%` }} />
                </div>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{pctText(r.share, r.share < 0.1 ? 1 : 0)}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-muted">{r.value}</td>
              {extraHeader && <td className="py-2 text-right">{r.extra}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Weekly columns (decorative) followed by the same numbers as a table. */
export function WeeklyColumns({ weeks, value, valueLabel, format = (n) => String(n), caption }: { weeks: Week[]; value: (w: Week) => number | null; valueLabel: string; format?: (n: number) => string; caption: string }) {
  const values = weeks.map(value);
  const maxV = Math.max(0.0001, ...values.map((v) => v ?? 0));
  return (
    <div>
      <div className="flex h-32 items-end gap-1.5 border-b border-border pb-1" aria-hidden>
        {weeks.map((w, i) => {
          const v = values[i];
          return (
            <div key={w.weekStart} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[11px] tabular-nums text-subtle">{v === null ? '' : format(v)}</span>
              <div className={`w-full max-w-10 rounded-t ${w.partial ? 'bg-accent-soft' : 'bg-accent'}`} style={{ height: `${v ? Math.max(3, (v / maxV) * 100) : 0}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5" aria-hidden>
        {weeks.map((w) => (
          <span key={w.weekStart} className="min-w-0 flex-1 truncate text-center text-[11px] text-subtle">
            {shortDay(w.weekStart)}
          </span>
        ))}
      </div>
      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer text-muted hover:text-fg">Show as table</summary>
        <table className="mt-2 w-full">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-subtle">
              <th scope="col" className="py-1 pr-3 font-medium">
                Week
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">
                {valueLabel}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Note
              </th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w, i) => (
              <tr key={w.weekStart} className="border-b border-border last:border-0">
                <th scope="row" className="py-1 pr-3 text-left font-normal">
                  {shortDay(w.weekStart)} to {shortDay(w.weekEnd)}
                </th>
                <td className="py-1 pr-3 text-right tabular-nums">{values[i] === null ? 'Too few postings' : format(values[i]!)}</td>
                <td className="py-1 text-right text-muted">{w.partial ? 'Partly outside the period' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="mt-2 text-[12px] text-subtle">Lighter columns are weeks only partly inside the period.</p>
    </div>
  );
}

export function CaveatsBox({ caveats, title = 'How to read these numbers' }: { caveats: string[]; title?: string }) {
  if (!caveats.length) return null;
  return (
    <section aria-labelledby="market-caveats" className="rounded-lg border border-border bg-surface-2 px-5 py-4">
      <h2 id="market-caveats" className="flex items-center gap-2 text-[14px] font-semibold">
        <InfoIcon size={16} aria-hidden /> {title}
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted">
        {caveats.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </section>
  );
}

export function SourcesCard({ report }: { report: SourcesReport }) {
  return (
    <Card>
      <CardHeader title="Sources" description={report.snapshots.method} />
      <ul className="divide-y divide-border border-t border-border">
          {report.sources.map((s) => (
            <li key={s.source} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {s.homepage ? (
                    <a href={s.homepage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                      {s.label} <ArrowSquareOutIcon size={12} aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : (
                    <span className="font-medium">{s.label}</span>
                  )}
                  {s.kind === 'sample' && <ProvenanceTag kind="sample" />}
                  {s.kind === 'public_feed' && !s.enabled && <Badge tone="warning">Turned off</Badge>}
                  {s.kind === 'public_feed' && s.enabled && s.lastStatus && <StatusBadge status={s.lastStatus === 'ok' ? 'succeeded' : s.lastStatus === 'error' ? 'failed' : s.lastStatus} />}
                </div>
                <p className="text-[12.5px] text-muted">{s.attribution}</p>
                {s.lastError && <p className="text-[12.5px] text-warning">{s.lastError}</p>}
              </div>
              <div className="shrink-0 text-[12.5px] text-muted sm:text-right">
                <div>
                  <span className="tabular-nums text-fg">{s.postingsInWindow}</span> postings in the last {report.window.days} days
                </div>
                {s.kind === 'public_feed' && (
                  <div title={s.lastSuccessAt ? formatDateTime(s.lastSuccessAt) : undefined}>{s.lastSuccessAt ? `Last successful fetch ${timeAgo(s.lastSuccessAt)}` : 'Never fetched successfully'}</div>
                )}
              </div>
            </li>
          ))}
      </ul>
      {report.snapshots.lastRunAt && <p className="border-t border-border px-5 py-3 text-[12px] text-subtle">Insights last computed {timeAgo(report.snapshots.lastRunAt)}.</p>}
    </Card>
  );
}

export function SkillLink({ slug, name, search }: { slug: string; name: string; search: string }) {
  return (
    <Link to={`/app/career/market/skills/${slug}${search}`} className="font-medium hover:underline">
      {name}
    </Link>
  );
}
