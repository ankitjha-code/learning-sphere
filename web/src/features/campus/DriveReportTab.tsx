import { useQuery } from '@tanstack/react-query';
import { DownloadSimpleIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { Button, Card, CardBody, CardHeader, ErrorState, SkeletonRows } from '@/components/ui';
import { CAMPUS_KEY, DefinitionTip, downloadCsv, StageBadge, STAGE_LABELS, td, th } from './shared';
import type { DriveDetail } from './DriveDetailPage';

type Report = {
  funnel: { key: string; count: number; definition: string; fromPrevious: number | null }[];
  stageCounts: Record<string, number>;
  offers: { name: string; stage: string; ctcText: string | null; ctcNumber: number | null }[];
  note: string;
};
const LABEL: Record<string, string> = { invited: 'Invited', registered: 'Registered', assessed: 'Assessed', interviewed: 'Interviewed', offers: 'Offers', placed: 'Placed' };

export function ReportTab({ d }: { d: DriveDetail }) {
  const q = useQuery({ queryKey: [...CAMPUS_KEY, 'drive', d.drive.id, 'report'], queryFn: () => api.get<Report>(`/campus/drives/${d.drive.id}/report`) });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <SkeletonRows rows={5} />;
  const r = q.data;
  const max = Math.max(r.funnel[0]?.count ?? 0, 1);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button icon={<DownloadSimpleIcon size={15} />} onClick={() => downloadCsv(`/campus/drives/${d.drive.id}/report.csv`, `drive-outcomes-${d.drive.title}.csv`)}>
          Export outcomes CSV
        </Button>
        <Button icon={<DownloadSimpleIcon size={15} />} onClick={() => downloadCsv(`/campus/drives/${d.drive.id}/eligible.csv`, `eligibility-${d.drive.title}.csv`)}>
          Export eligibility CSV
        </Button>
      </div>
      <Card>
        <CardHeader title="Placement funnel" description={r.note} />
        <CardBody>
          <ol className="space-y-2">
            {r.funnel.map((s) => (
              <li key={s.key} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[120px_minmax(0,1fr)_auto] text-[13px]">
                <span className="inline-flex items-center gap-1 text-muted">
                  {LABEL[s.key]} <DefinitionTip>{s.definition}</DefinitionTip>
                </span>
                <span className="relative h-2.5 overflow-hidden rounded-full bg-surface-3">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(s.count / max) * 100}%` }} />
                </span>
                <span className="whitespace-nowrap text-right tabular-nums sm:w-44">
                  {s.count}
                  {s.fromPrevious !== null && <span className="ml-1 hidden text-[12px] text-subtle sm:inline">({s.fromPrevious}% of previous)</span>}
                </span>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Current stages" description="Where every candidate is right now." />
          <CardBody>
            <ul className="space-y-1.5 text-[13px]">
              {Object.entries(r.stageCounts)
                .filter(([, n]) => n > 0)
                .map(([stage, n]) => (
                  <li key={stage} className="flex items-center justify-between">
                    <StageBadge stage={stage} />
                    <span className="tabular-nums">{n}</span>
                  </li>
                ))}
              {!Object.values(r.stageCounts).some((n) => n > 0) && <li className="text-muted">No candidates yet.</li>}
            </ul>
          </CardBody>
        </Card>
        <Card className="flex flex-col overflow-hidden">
          <CardHeader title="Offers and CTC" description="CTC exactly as entered. A number is shown only when the text is a plain number." />
          {!r.offers.length ? (
            <CardBody className="flex flex-1">
              <p className="flex flex-1 items-center justify-center rounded-md bg-surface-2 px-4 py-5 text-center text-[13px] text-muted">No offers recorded.</p>
            </CardBody>
          ) : (
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className={`${th} pl-5`}>Student</th>
                    <th className={th}>Stage</th>
                    <th className={th}>CTC (as entered)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {r.offers.map((o, i) => (
                    <tr key={i}>
                      <td className={`${td} pl-5 font-medium`}>{o.name}</td>
                      <td className={td}>{STAGE_LABELS[o.stage] ?? o.stage}</td>
                      <td className={td}>{o.ctcText ?? <span className="text-subtle">Not recorded</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
