import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChartBarIcon, DownloadSimpleIcon, ExamIcon, SealCheckIcon, TrendUpIcon, UsersIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { pct } from '@/lib/format';
import { buttonClass, Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, Select, SkeletonRows, StatTile, StatusBadge, Tooltip } from '@/components/ui';
import { hasRole, useSession } from '@/lib/session';
import { SOURCE_LABEL, useJobs } from './api';

type Analytics = {
  scope: { kind: string; title?: string | null };
  totals: { applications: number; active: number; hired: number; rejected: number; withdrawn: number; applicationConversion: number | null };
  funnel: { stage: string; label: string; reached: number; conversionFromPrevious: number | null }[];
  assessment: { invited: number; completed: number; completionRate: number | null };
  interviews: { throughput: { weekStart: string; scheduled: number; completed: number }[]; total: number; completed: number };
  daysInStage: { stage: string; label: string; averageDays: number | null; samples: number }[];
  offers: { extended: number; accepted: number; declined: number; expired: number; rescinded: number; acceptanceRate: number | null };
  sources: { source: string; count: number }[];
  perJob: { postingId: string; title: string; status: string; applications: number; active: number; inInterview: number; offers: number; hired: number; rejected: number }[];
  definitions: Record<string, string>;
};

/** Single-series horizontal bars (accent hue only), value labels in text ink, hover detail. */
function Bars({ rows, unit, noteLabel }: { rows: { key: string; label: string; value: number; detail?: string; note?: string }[]; unit?: string; noteLabel?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const hasNote = rows.some((r) => r.note !== undefined);
  return (
    <ul className="space-y-2.5" role="list">
      {hasNote && noteLabel && (
        <li className="grid grid-cols-[minmax(0,96px)_minmax(0,1fr)_40px_68px] items-center gap-3 text-[12px] font-medium text-subtle sm:grid-cols-[130px_minmax(0,1fr)_56px_72px]" aria-hidden>
          <span />
          <span />
          <span className="text-right">Count</span>
          <span className="text-right">{noteLabel}</span>
        </li>
      )}
      {rows.map((r) => (
        <li key={r.key} className={hasNote ? 'grid grid-cols-[minmax(0,96px)_minmax(0,1fr)_40px_68px] items-center gap-3 text-[13px] sm:grid-cols-[130px_minmax(0,1fr)_56px_72px]' : 'grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_56px] items-center gap-3 text-[13px] sm:grid-cols-[130px_minmax(0,1fr)_64px]'}>
          <span className="truncate text-muted">{r.label}</span>
          <Tooltip content={r.detail ?? `${r.label}: ${r.value}${unit ?? ''}`}>
            <div className="h-4 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div className="h-full rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0 }} />
            </div>
          </Tooltip>
          <span className="text-right font-medium tabular-nums">
            {r.value}
            {unit}
          </span>
          {hasNote && <span className="text-right tabular-nums text-muted">{r.note}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Weekly columns: scheduled (soft) with completed (solid) inside it. */
function WeekColumns({ weeks }: { weeks: { weekStart: string; scheduled: number; completed: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.scheduled));
  return (
    <div>
      <div className="flex h-36 items-end gap-1.5 border-b border-border" aria-hidden>
        {weeks.map((w) => (
          <Tooltip key={w.weekStart} content={`Week of ${w.weekStart}: ${w.scheduled} scheduled, ${w.completed} completed`}>
            <div className="relative flex h-full min-w-0 flex-1 items-end">
              <div className="relative w-full rounded-t-[4px] bg-accent-soft" style={{ height: w.scheduled ? `${(w.scheduled / max) * 100}%` : 2 }}>
                <div className="absolute inset-x-0 bottom-0 rounded-t-[4px] bg-accent" style={{ height: w.scheduled ? `${(w.completed / w.scheduled) * 100}%` : 0 }} />
              </div>
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5 text-[11px] tabular-nums text-subtle" aria-hidden>
        {weeks.map((w, i) => (
          <span key={w.weekStart} className="min-w-0 flex-1 truncate text-center">
            {i % 2 === 0 ? w.weekStart.slice(5) : ''}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-accent-soft ring-1 ring-inset ring-accent/30" /> Scheduled
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" /> Completed
        </span>
      </div>
    </div>
  );
}

const DEF_LABEL: Record<string, string> = {
  applications: 'Applications',
  stageReached: 'Stage reached',
  stageConversion: 'Stage conversion',
  applicationConversion: 'Application conversion',
  assessmentCompletion: 'Assessment completion',
  interviewThroughput: 'Interview throughput',
  daysInStage: 'Days in stage',
  offerAcceptance: 'Offer acceptance',
  sources: 'Sources',
  fairness: 'Fairness',
};

export default function AnalyticsPage() {
  const me = useSession();
  const isAdmin = hasRole(me, 'recruiter_admin', 'org_admin');
  const jobs = useJobs('open');
  const [postingId, setPostingId] = useState('');
  const q = useQuery({ queryKey: ['hire', 'analytics', postingId], queryFn: () => api.get<Analytics>(`/hire/analytics${qs({ postingId })}`) });
  const d = q.data;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Recruitment analytics"
        description="Funnel health from your own pipeline records. No demographic analytics are computed."
        actions={
          <>
            <Select aria-label="Scope" className="w-64" value={postingId} onChange={(e) => setPostingId(e.target.value)}>
              <option value="">All jobs</option>
              {(jobs.data?.items ?? []).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </Select>
            {isAdmin && (
              <a className={buttonClass('secondary', 'md')} href={`/api/hire/exports/decisions.csv${qs({ postingId })}`} download>
                <DownloadSimpleIcon size={15} /> Decision log CSV
              </a>
            )}
          </>
        }
      />
      {q.isLoading ? (
        <SkeletonRows rows={8} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !d ? null : d.totals.applications === 0 ? (
        <EmptyState icon={<ChartBarIcon size={22} />} title="No applications yet" description="Analytics appear once candidates apply to your jobs." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Applications" value={d.totals.applications} hint={`${d.totals.active} active`} icon={<UsersIcon />} tone="accent" />
            <StatTile label="Application conversion" value={pct(d.totals.applicationConversion, 1)} hint={`${d.totals.hired} hired`} icon={<TrendUpIcon />} tone="accent" />
            <StatTile label="Assessment completion" value={pct(d.assessment.completionRate)} hint={`${d.assessment.completed} of ${d.assessment.invited} invited`} icon={<ExamIcon />} tone="accent" />
            <StatTile label="Offer acceptance" value={pct(d.offers.acceptanceRate)} hint={`${d.offers.accepted} accepted, ${d.offers.declined} declined`} icon={<SealCheckIcon />} tone="success" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Stage funnel" description="Applications that reached each stage, with conversion from the previous stage." />
              <CardBody>
                <Bars
                  noteLabel="From prev."
                  rows={d.funnel.map((f) => ({
                    key: f.stage,
                    label: f.label,
                    value: f.reached,
                    note: f.conversionFromPrevious === null ? 'n/a' : pct(f.conversionFromPrevious),
                    detail: `${f.label}: ${f.reached} reached${f.conversionFromPrevious !== null ? `, ${pct(f.conversionFromPrevious)} of previous stage` : ''}`,
                  }))}
                />
                <table className="sr-only">
                  <caption>Stage conversion table</caption>
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Reached</th>
                      <th>Conversion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.funnel.map((f) => (
                      <tr key={f.stage}>
                        <td>{f.label}</td>
                        <td>{f.reached}</td>
                        <td>{f.conversionFromPrevious === null ? 'n/a' : pct(f.conversionFromPrevious)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Average days in stage" description="From hiring decision timestamps. n = completed stays." />
              <CardBody>
                <Bars rows={d.daysInStage.map((s) => ({ key: s.stage, label: s.label, value: s.averageDays ?? 0, detail: s.averageDays === null ? `${s.label}: no completed stays yet` : `${s.label}: ${s.averageDays} days on average (n = ${s.samples})` }))} unit="d" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Interview throughput" description={`${d.interviews.completed} completed of ${d.interviews.total} scheduled. Weeks start Monday (UTC).`} />
              <CardBody>
                <WeekColumns weeks={d.interviews.throughput} />
                <table className="sr-only">
                  <caption>Interviews per week</caption>
                  <thead>
                    <tr>
                      <th>Week of</th>
                      <th>Scheduled</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.interviews.throughput.map((w) => (
                      <tr key={w.weekStart}>
                        <td>{w.weekStart}</td>
                        <td>{w.scheduled}</td>
                        <td>{w.completed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Sources and offers" description="How applications arrived, and what happened to offers." />
              <CardBody className="space-y-5">
                <Bars rows={d.sources.map((s) => ({ key: s.source, label: SOURCE_LABEL[s.source] ?? s.source, value: s.count }))} />
                <div className="border-t border-border pt-4">
                  <div className="mb-2.5 text-[12.5px] font-medium text-muted">Offers</div>
                  <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-5">
                    {(
                      [
                        ['Extended', d.offers.extended],
                        ['Accepted', d.offers.accepted],
                        ['Declined', d.offers.declined],
                        ['Expired', d.offers.expired],
                        ['Rescinded', d.offers.rescinded],
                      ] as const
                    ).map(([label, n]) => (
                      <div key={label} className="bg-surface-2 px-3 py-2.5">
                        <dt className="text-[11.5px] text-muted">{label}</dt>
                        <dd className="font-display text-[18px] font-semibold tabular-nums">{n}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </CardBody>
            </Card>
          </div>
          {!postingId && (
            <Card className="overflow-hidden">
              <CardHeader title="By job" description="Current pipeline per job." className="pb-4" />
              <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-surface-2/60 text-left text-[12px] text-muted">
                    <th className="px-5 py-2.5 font-medium">Job</th>
                    <th className="px-4 py-2.5 text-right font-medium">Applications</th>
                    <th className="px-4 py-2.5 text-right font-medium">Active</th>
                    <th className="px-4 py-2.5 text-right font-medium">Interview</th>
                    <th className="px-4 py-2.5 text-right font-medium">Offer</th>
                    <th className="px-4 py-2.5 text-right font-medium">Hired</th>
                    <th className="px-4 py-2.5 text-right font-medium">Rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {d.perJob.map((j) => (
                    <tr key={j.postingId} className="border-b border-border last:border-0">
                      <td className="px-5 py-3">
                        <Link to={`/app/hire/jobs/${j.postingId}`} className="font-medium hover:text-accent-text hover:underline">
                          {j.title}
                        </Link>{' '}
                        <StatusBadge status={j.status} />
                      </td>
                      {[j.applications, j.active, j.inInterview, j.offers, j.hired, j.rejected].map((n, i) => (
                        <td key={i} className="px-4 py-3 text-right tabular-nums">
                          {n}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Definitions" />
            <CardBody>
              <dl className="grid gap-x-8 gap-y-3.5 text-[13px] md:grid-cols-2">
                {Object.entries(d.definitions).map(([k, v]) => (
                  <div key={k}>
                    <dt className="font-medium">{DEF_LABEL[k] ?? k}</dt>
                    <dd className="text-muted">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
