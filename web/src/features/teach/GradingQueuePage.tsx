import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquareOffsetIcon, ArrowsClockwiseIcon, ShieldWarningIcon, SealCheckIcon, ClipboardTextIcon, ClockIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage, qs } from '@/lib/api';
import { timeAgo, formatDateTime } from '@/lib/format';
import { Badge, Button, ButtonLink, Checkbox, EmptyState, ErrorState, PageHeader, Pagination, Select, Skeleton, SkeletonRows, StatTile, Tabs, Tooltip } from '@/components/ui';
import { TABLE_WRAP, THEAD, TH, TR, TD } from './shared';

type QueueItem = {
  submissionId: string;
  assignment: { id: string; title: string; maxPoints: number; cohortName: string; dueAt: string };
  student: { id: string; name: string };
  team: { id: string; name: string } | null;
  version: number;
  submittedAt: string;
  isLate: boolean;
  state: 'ungraded' | 'draft' | 'released';
  evaluation: { id: string; finalScore: number; released: boolean } | null;
  regradeOpen: boolean;
  similarityMax: number | null;
};
type Queue = {
  items: QueueItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: { total: number; ungraded: number; draft: number; released: number; late: number; regrade: number };
  assignments: { id: string; title: string; cohortName: string }[];
};

const STATE_LABEL: Record<QueueItem['state'], { label: string; tone: 'warning' | 'neutral' | 'success' }> = {
  ungraded: { label: 'Not graded', tone: 'warning' },
  draft: { label: 'Graded, not released', tone: 'neutral' },
  released: { label: 'Released', tone: 'success' },
};

export default function GradingQueuePage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'ungraded';
  const assignmentId = params.get('assignmentId') ?? '';
  const late = params.get('late') ?? '';
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const q = useQuery({
    queryKey: ['teach', 'queue', status, assignmentId, late, page],
    queryFn: () => api.get<Queue>(`/teach/grading/queue${qs({ status, assignmentId, late, page, pageSize: 25 })}`),
  });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setPage(1);
    setSelected([]);
  };
  const release = useMutation({
    mutationFn: () => api.post<{ released: number; skipped: { id: string; reason: string }[] }>('/teach/grading/release', { evaluationIds: selected }),
    onSuccess: (r) => {
      toast.success(`Released ${r.released}${r.skipped.length ? `, skipped ${r.skipped.length}` : ''}. Students were notified.`);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ['teach'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const c = q.data?.counts;
  const releasable = (q.data?.items ?? []).filter((i) => i.state === 'draft' && i.evaluation).map((i) => i.evaluation!.id);

  return (
    <div>
      <PageHeader title="Grading queue" description="Latest submitted version from each student or team. Ungraded and regrade requests come first, oldest first." />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {!c ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[118px] rounded-lg" />)
        ) : (
          <>
            <StatTile label="Not graded" value={c.ungraded} hint="Latest versions only" icon={<CheckSquareOffsetIcon weight="bold" />} tone={c.ungraded ? 'warning' : 'success'} />
            <StatTile label="Graded, not released" value={c.draft} hint="Students cannot see these yet" icon={<ClipboardTextIcon weight="bold" />} tone="accent" />
            <StatTile label="Regrade requests" value={c.regrade} hint={c.regrade ? 'Waiting for your review' : 'None open'} icon={<ArrowsClockwiseIcon weight="bold" />} tone={c.regrade ? 'warning' : 'success'} />
            <StatTile label="Submitted late" value={c.late} hint="A late penalty may apply" icon={<ClockIcon weight="bold" />} />
          </>
        )}
      </div>
      <Tabs
        value={status}
        onValueChange={(v) => set('status', v)}
        tabs={[
          { value: 'ungraded', label: 'To grade', count: c?.ungraded },
          { value: 'draft', label: 'To release', count: c?.draft },
          { value: 'regrade', label: 'Regrades', count: c?.regrade },
          { value: 'released', label: 'Released', count: c?.released },
          { value: 'all', label: 'All', count: c?.total },
        ]}
        className="mb-4"
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72">
          <Select value={assignmentId} onChange={(e) => set('assignmentId', e.target.value)} aria-label="Filter by assignment">
            <option value="">All assignments</option>
            {q.data?.assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({a.cohortName})
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <Select value={late} onChange={(e) => set('late', e.target.value)} aria-label="Filter by lateness">
            <option value="">Late or on time</option>
            <option value="true">Late only</option>
            <option value="false">On time only</option>
          </Select>
        </div>
        {status === 'draft' && (
          <Button className="ml-auto" variant="primary" size="sm" icon={<SealCheckIcon size={14} />} disabled={!selected.length} disabledReason="Select graded submissions to release" loading={release.isPending} onClick={() => release.mutate()}>
            Release {selected.length || ''} selected
          </Button>
        )}
      </div>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <SkeletonRows rows={6} />
      ) : !q.data!.items.length ? (
        <EmptyState
          icon={<CheckSquareOffsetIcon size={22} />}
          title={status === 'ungraded' ? 'Nothing waiting to be graded' : 'Nothing here'}
          description={status === 'ungraded' ? 'New submissions appear here as students submit. Drafts never appear until submitted.' : 'Try another tab or clear the filters.'}
          action={<ButtonLink to="/app/teach/assignments">View assignments</ButtonLink>}
        />
      ) : (
        <>
          <div className={TABLE_WRAP}>
            <table className="w-full min-w-[780px] text-left text-[13.5px]">
              <thead className={THEAD}>
                <tr>
                  {status === 'draft' && (
                    <th scope="col" className="h-10 w-10 pl-4 pr-0">
                      <Checkbox checked={!!releasable.length && selected.length === releasable.length} onCheckedChange={(v) => setSelected(v ? releasable : [])} label={<span className="sr-only">Select all</span>} />
                    </th>
                  )}
                  <th scope="col" className={TH}>Student</th>
                  <th scope="col" className={TH}>Assignment</th>
                  <th scope="col" className={TH}>Submitted</th>
                  <th scope="col" className={TH}>State</th>
                  <th scope="col" className={`${TH} text-right`}>Score</th>
                  <th scope="col" className={TH}><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {q.data!.items.map((i) => (
                  <tr key={i.submissionId} className={TR}>
                    {status === 'draft' && (
                      <td className="py-3 pl-4 pr-0">
                        {i.evaluation && (
                          <Checkbox
                            checked={selected.includes(i.evaluation.id)}
                            onCheckedChange={(v) => setSelected(v ? [...selected, i.evaluation!.id] : selected.filter((x) => x !== i.evaluation!.id))}
                            label={<span className="sr-only">Select {i.student.name}</span>}
                          />
                        )}
                      </td>
                    )}
                    <td className={TD}>
                      <div className="font-semibold">{i.team ? i.team.name : i.student.name}</div>
                      {i.team && <div className="text-[12px] text-subtle">Submitted by {i.student.name}</div>}
                    </td>
                    <td className={TD}>
                      <Link to={`/app/teach/assignments/${i.assignment.id}?tab=submissions`} className="hover:underline">
                        {i.assignment.title}
                      </Link>
                      <div className="mt-0.5 text-[12px] text-subtle">{i.assignment.cohortName}</div>
                    </td>
                    <td className={TD}>
                      <span title={formatDateTime(i.submittedAt)} className="text-[12.5px] text-muted">
                        {timeAgo(i.submittedAt)} · v{i.version}
                      </span>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {i.isLate && <Badge tone="warning">Late</Badge>}
                        {i.regradeOpen && (
                          <Badge tone="info" icon={<ArrowsClockwiseIcon size={11} />}>
                            Regrade requested
                          </Badge>
                        )}
                        {i.similarityMax !== null && i.similarityMax >= 0.4 && (
                          <Tooltip content="Similarity indicator. Not proof of plagiarism; review the texts side by side.">
                            <span>
                              <Badge tone="neutral" icon={<ShieldWarningIcon size={11} />}>
                                Similarity {Math.round(i.similarityMax * 100)}%
                              </Badge>
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    <td className={TD}>
                      <Badge tone={STATE_LABEL[i.state].tone}>{STATE_LABEL[i.state].label}</Badge>
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{i.evaluation ? `${i.evaluation.finalScore} / ${i.assignment.maxPoints}` : <span className="text-subtle">None yet</span>}</td>
                    <td className={`${TD} text-right`}>
                      <ButtonLink size="sm" variant={i.state === 'ungraded' || i.regradeOpen ? 'primary' : 'secondary'} to={`/app/teach/grading/${i.submissionId}`}>
                        {i.state === 'ungraded' ? 'Grade' : i.regradeOpen ? 'Review request' : 'Open'}
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={q.data!.pageSize} total={q.data!.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
