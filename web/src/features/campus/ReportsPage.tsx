import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DownloadSimpleIcon, ChartBarIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Banner, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, SkeletonRows } from '@/components/ui';
import { CAMPUS_KEY, DefinitionTip, downloadCsv, Known, STAGE_LABELS, td, th } from './shared';
import { ReadinessTable, type Readiness } from './OverviewPage';

type Reports = {
  courseOutcomes: { courseId: string; code: string; title: string; assignments: number; submissions: number; released: number; averagePercent: number | null }[];
  batches: { graduationYear: number | null; records: number; optedIn: number; notOptedIn: number; placed: number; rate: number | null }[];
  offersByCompany: { companyName: string; drives: number; offers: number; placed: number }[];
  ctc: { candidateName: string; companyName: string; roleTitle: string; driveTitle: string; stage: string; ctcText: string | null; ctcSource: string | null; ctcNumber: number | null }[];
  departments: { departmentId: string | null; name: string; records: number; verified: number; withGaps: number; cgpaKnown: number; averageCgpa: number | null; optedIn: number; placed: number; placementRate: number | null }[];
  cohorts: { cohortId: string; name: string; graduationYear: number | null; students: number; withRecord: number; optedIn: number; placed: number; placementRate: number | null }[];
  workload: { userId: string; name: string; ungraded: number; oldest: string | null }[];
  drives: { id: string; title: string; companyName: string; status: string }[];
  definitions: Record<string, string>;
};

function Section({ title, definition, description, children, action, flush }: { title: string; definition?: string; description?: string; children: ReactNode; action?: ReactNode; flush?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            {title} {definition && <DefinitionTip>{definition}</DefinitionTip>}
          </span>
        }
        description={description ?? definition}
        action={action}
        className={flush ? 'pb-4' : undefined}
      />
      {flush ? <div className="border-t border-border">{children}</div> : <CardBody>{children}</CardBody>}
    </Card>
  );
}

/** Table that sits flush inside a card (no second border). */
function FlushTable({ children, minWidth }: { children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${minWidth ?? ''}`}>{children}</table>
    </div>
  );
}

/** A short line inside a flush card when a list is empty. */
function FlushEmpty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-5 text-[13px] text-muted">{children}</p>;
}

const flushTh = th.replace('px-4', 'px-5');
const rowCls = 'flex items-start justify-between gap-4 px-5 py-3 text-[13px]';

const pctText = (v: number | null) => (v === null ? 'n/a' : `${v}%`);

export default function ReportsPage() {
  const q = useQuery({ queryKey: [...CAMPUS_KEY, 'reports'], queryFn: () => api.get<Reports>('/campus/reports') });
  const readiness = useQuery({ queryKey: [...CAMPUS_KEY, 'reports', 'readiness'], queryFn: () => api.get<Readiness>('/campus/reports/readiness') });
  const r = q.data;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Reports"
        description="Placement outcomes, readiness and workload. Every metric states how it is calculated. Differences between groups describe what happened; they do not show why."
        actions={
          <Button icon={<DownloadSimpleIcon size={15} />} onClick={() => downloadCsv('/campus/reports/placement.csv', 'placement-report.csv')}>
            Export placement report
          </Button>
        }
      />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !r ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <Skeleton className="h-48 rounded-lg" />
            <Skeleton className="h-48 rounded-lg" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-5">
              <Section title="Placement rate by graduating batch" definition={r.definitions.placementRate} flush>
                {!r.batches.length ? (
                  <div className="p-5">
                    <EmptyState icon={<ChartBarIcon size={22} />} title="No student records yet" description="Placement rates appear once student records exist." />
                  </div>
                ) : (
                  <>
                    <FlushTable minWidth="min-w-[560px]">
                      <thead className="border-b border-border">
                        <tr>
                          <th className={flushTh}>Graduating</th>
                          <th className={th}>Records</th>
                          <th className={th}>Opted in (denominator)</th>
                          <th className={th}>Placed</th>
                          <th className={th}>Placement rate</th>
                          <th className={th}>Not opted in</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {r.batches.map((b) => (
                          <tr key={b.graduationYear ?? 'unknown'}>
                            <td className={`${td} pl-5 font-medium`}>{b.graduationYear ?? <Known value={null} label="Not recorded" />}</td>
                            <td className={td}>{b.records}</td>
                            <td className={td}>{b.optedIn}</td>
                            <td className={td}>{b.placed}</td>
                            <td className={`${td} font-medium tabular-nums`}>{pctText(b.rate)}</td>
                            <td className={td}>{b.notOptedIn}</td>
                          </tr>
                        ))}
                      </tbody>
                    </FlushTable>
                    <p className="border-t border-border px-5 py-3 text-[12px] text-subtle">{r.definitions.unknownYear}</p>
                  </>
                )}
              </Section>

              <Section title="Student readiness" description="Share of enrolled students per program whose Skill DNA shows verified or demonstrated evidence for the skills your drives require most.">
                {readiness.error ? (
                  <ErrorState error={readiness.error} onRetry={() => readiness.refetch()} />
                ) : !readiness.data ? (
                  <SkeletonRows rows={3} />
                ) : (
                  <>
                    <ReadinessTable r={readiness.data} />
                    <p className="mt-4 border-t border-border pt-3 text-[12px] leading-relaxed text-subtle">{readiness.data.definition}</p>
                  </>
                )}
              </Section>

              <Section title="Drive exports" description="Outcome and eligibility lists for each drive. Every export is recorded in the audit log." flush>
                {!r.drives.length ? (
                  <FlushEmpty>No drives yet.</FlushEmpty>
                ) : (
                  <ul className="divide-y divide-border">
                    {r.drives.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
                        <Link to={`/app/campus/drives/${d.id}?tab=report`} className="text-[13.5px] font-medium hover:text-accent-text hover:underline">
                          {d.title}
                        </Link>
                        <div className="-mr-2 flex gap-1">
                          <Button size="sm" variant="ghost" icon={<DownloadSimpleIcon size={14} />} onClick={() => downloadCsv(`/campus/drives/${d.id}/report.csv`, `drive-outcomes-${d.title}.csv`)}>
                            Outcomes
                          </Button>
                          <Button size="sm" variant="ghost" icon={<DownloadSimpleIcon size={14} />} onClick={() => downloadCsv(`/campus/drives/${d.id}/eligible.csv`, `eligibility-${d.title}.csv`)}>
                            Eligibility
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>

            <aside className="space-y-5">
              <Section title="Offers by company" definition={r.definitions.offers} description="Offer stage reached, by company." flush>
                {!r.offersByCompany.length ? (
                  <FlushEmpty>No drives yet.</FlushEmpty>
                ) : (
                  <ul className="divide-y divide-border">
                    {r.offersByCompany.map((c) => (
                      <li key={c.companyName} className={rowCls}>
                        <span className="min-w-0 font-medium">{c.companyName}</span>
                        <span className="shrink-0 text-right text-[12.5px] tabular-nums text-muted">
                          {c.drives} {c.drives === 1 ? 'drive' : 'drives'} · {c.offers} {c.offers === 1 ? 'offer' : 'offers'} · {c.placed} placed
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="CTC as entered" definition={r.definitions.ctc} description="Exactly as recorded; never averaged." flush>
                {!r.ctc.length ? (
                  <FlushEmpty>No offers recorded yet.</FlushEmpty>
                ) : (
                  <ul className="divide-y divide-border">
                    {r.ctc.map((c, i) => (
                      <li key={i} className={rowCls}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{c.candidateName}</span>
                          <span className="block truncate text-[12px] text-subtle">
                            {c.companyName} · {STAGE_LABELS[c.stage] ?? c.stage}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-muted">
                          {c.ctcText ?? 'Not recorded'}
                          {c.ctcSource === 'drive' && <span className="block text-[11.5px] text-subtle">(drive figure)</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Batches" definition={r.definitions.cohorts} description="Placement rate per batch cohort." flush>
                {!r.cohorts.length ? (
                  <FlushEmpty>
                    No batch cohorts yet. Create them in{' '}
                    <Link to="/app/campus/structure?tab=batches" className="text-accent-text hover:underline">
                      Structure
                    </Link>
                    .
                  </FlushEmpty>
                ) : (
                  <ul className="divide-y divide-border">
                    {r.cohorts.map((c) => (
                      <li key={c.cohortId} className={rowCls}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{c.name}</span>
                          <span className="block text-[12px] text-subtle">
                            {c.students} members · {c.withRecord} with records
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-medium tabular-nums">{pctText(c.placementRate)}</span>
                          <span className="block text-[12px] tabular-nums text-subtle">
                            {c.placed}/{c.optedIn} placed
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Faculty grading workload" definition={r.definitions.workload} description="Submissions waiting for a grade." flush>
                {!r.workload.length ? (
                  <FlushEmpty>No submissions are waiting to be graded.</FlushEmpty>
                ) : (
                  <ul className="divide-y divide-border">
                    {r.workload.map((w) => (
                      <li key={w.userId} className={rowCls}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{w.name}</span>
                          {w.oldest && <span className="block text-[12px] text-subtle">Oldest from {formatDate(w.oldest)}</span>}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">{w.ungraded} ungraded</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </aside>
          </div>

          <div className="mt-8 space-y-5">
            <Section title="Departments" definition={r.definitions.departments} flush>
              <FlushTable minWidth="min-w-[760px]">
                <thead className="border-b border-border">
                  <tr>
                    <th className={flushTh}>Department</th>
                    <th className={th}>Records</th>
                    <th className={th}>Verified</th>
                    <th className={th}>With gaps</th>
                    <th className={th}>Average CGPA (known)</th>
                    <th className={th}>Opted in</th>
                    <th className={th}>Placed</th>
                    <th className={th}>Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {r.departments.map((d) => (
                    <tr key={d.departmentId ?? 'none'}>
                      <td className={`${td} pl-5 font-medium`}>{d.name}</td>
                      <td className={td}>{d.records}</td>
                      <td className={td}>{d.verified}</td>
                      <td className={td}>{d.withGaps}</td>
                      <td className={td}>{d.averageCgpa === null ? <span className="text-subtle">No data</span> : `${d.averageCgpa} (n=${d.cgpaKnown})`}</td>
                      <td className={td}>{d.optedIn}</td>
                      <td className={td}>{d.placed}</td>
                      <td className={td}>{pctText(d.placementRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </FlushTable>
            </Section>
            <Section title="Course outcomes" definition={r.definitions.courseOutcomes} flush>
              {!r.courseOutcomes.length ? (
                <FlushEmpty>No courses yet. Faculty create courses in Teach.</FlushEmpty>
              ) : (
                <FlushTable minWidth="min-w-[560px]">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={flushTh}>Course</th>
                      <th className={th}>Published assignments</th>
                      <th className={th}>Submissions</th>
                      <th className={th}>Released grades</th>
                      <th className={th}>Average released score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {r.courseOutcomes.map((c) => (
                      <tr key={c.courseId}>
                        <td className={`${td} pl-5 font-medium`}>
                          {c.code} <span className="font-normal text-muted">{c.title}</span>
                        </td>
                        <td className={td}>{c.assignments}</td>
                        <td className={td}>{c.submissions}</td>
                        <td className={td}>{c.released}</td>
                        <td className={td}>{c.averagePercent === null ? <span className="text-subtle">No released grades</span> : `${c.averagePercent}% (n=${c.released})`}</td>
                      </tr>
                    ))}
                  </tbody>
                </FlushTable>
              )}
            </Section>
          </div>
          <Banner tone="info" className="mt-8">
            Correlation is not causation: for example, a department with a higher placement rate may simply have had more drives open to it.
          </Banner>
        </>
      )}
    </div>
  );
}
