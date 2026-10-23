import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, ClipboardTextIcon, MagnifyingGlassIcon, ListChecksIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { dueLabel, formatDateTime } from '@/lib/format';
import { Badge, ButtonLink, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonRows, StatusBadge } from '@/components/ui';
import { TABLE_WRAP, THEAD, TH, TR, TD } from './shared';

type Row = {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'closed';
  dueAt: string;
  cohortId: string;
  cohortName: string;
  collaboration: string;
  students: number;
  submitted: number;
  late: number;
  ungraded: number;
};

export default function AssignmentsPage() {
  const [params, setParams] = useSearchParams();
  const cohortId = params.get('cohortId') ?? '';
  const status = params.get('status') ?? '';
  const [q, setQ] = useState('');
  const cohorts = useQuery({ queryKey: ['teach', 'cohorts', 'mine', ''], queryFn: () => api.get<{ items: { id: string; name: string }[] }>('/teach/cohorts') });
  const list = useQuery({ queryKey: ['teach', 'assignments', cohortId, status, q], queryFn: () => api.get<{ items: Row[] }>(`/teach/assignments${qs({ cohortId, status, q })}`) });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  return (
    <div>
      <PageHeader
        title="Assignments"
        description="Draft, publish and track assignments for your cohorts."
        actions={
          <>
            <ButtonLink to="/app/teach/rubrics" icon={<ListChecksIcon size={16} />}>
              Rubrics
            </ButtonLink>
            <ButtonLink to={`/app/teach/assignments/new${cohortId ? `?cohortId=${cohortId}` : ''}`} variant="primary" icon={<PlusIcon size={16} />}>
              New assignment
            </ButtonLink>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <MagnifyingGlassIcon size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles" className="pl-8" aria-label="Search assignments" />
        </div>
        <div className="w-full sm:w-52">
          <Select value={cohortId} onChange={(e) => set('cohortId', e.target.value)} aria-label="Filter by cohort">
            <option value="">All my cohorts</option>
            {cohorts.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <Select value={status} onChange={(e) => set('status', e.target.value)} aria-label="Filter by status">
            <option value="">Any status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="closed">Closed</option>
          </Select>
        </div>
      </div>
      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <SkeletonRows rows={5} />
      ) : !list.data!.items.length ? (
        <EmptyState
          icon={<ClipboardTextIcon size={22} />}
          title={q || cohortId || status ? 'No assignments match' : 'No assignments yet'}
          description={q || cohortId || status ? 'Try clearing the filters.' : 'Create an assignment with objectives, instructions, a rubric and a late policy, then publish it to a cohort.'}
          action={!(q || cohortId || status) && <ButtonLink to="/app/teach/assignments/new" variant="primary">New assignment</ButtonLink>}
        />
      ) : (
        <div className={TABLE_WRAP}>
          <table className="w-full min-w-[760px] text-left text-[13.5px]">
            <thead className={THEAD}>
              <tr>
                <th scope="col" className={TH}>Assignment</th>
                <th scope="col" className={TH}>Due</th>
                <th scope="col" className={TH}>Status</th>
                <th scope="col" className={`${TH} text-right`}>Submitted</th>
                <th scope="col" className={`${TH} text-right`}>Late</th>
                <th scope="col" className={`${TH} text-right`}>To grade</th>
              </tr>
            </thead>
            <tbody>
              {list.data!.items.map((a) => {
                const due = dueLabel(a.dueAt);
                return (
                  <tr key={a.id} className={TR}>
                    <td className={TD}>
                      <Link to={`/app/teach/assignments/${a.id}`} className="font-semibold hover:text-accent-text hover:underline">
                        {a.title}
                      </Link>
                      <div className="mt-0.5 text-[12px] text-subtle">
                        {a.cohortName}
                        {a.collaboration === 'team' ? ' · Team' : ''}
                      </div>
                    </td>
                    <td className={TD}>
                      <div className="text-[13px]">{formatDateTime(a.dueAt)}</div>
                      {a.status === 'published' && <Badge tone={due.tone === 'neutral' ? 'neutral' : due.tone} className="mt-1">{due.text}</Badge>}
                    </td>
                    <td className={TD}>
                      <StatusBadge status={a.status} />
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {a.submitted}/{a.students}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{a.late || <span className="text-subtle">0</span>}</td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {a.ungraded ? (
                        <Link to={`/app/teach/grading?assignmentId=${a.id}&status=ungraded`} className="font-medium text-accent-text hover:underline">
                          {a.ungraded}
                        </Link>
                      ) : (
                        <span className="text-subtle">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
