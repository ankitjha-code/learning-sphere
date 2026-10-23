import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, UsersIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage, ApiError } from '@/lib/api';
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, Segmented, Select, SkeletonRows } from '@/components/ui';
import { TABLE_WRAP, THEAD, TH, TR, TD, useLookups } from './shared';

type CohortRow = {
  id: string;
  name: string;
  kind: string;
  graduationYear: number | null;
  programName: string | null;
  students: number;
  instructors: number;
  assignments: number;
  teaching: boolean;
};

const KINDS = [
  { value: 'section', label: 'Section' },
  { value: 'batch', label: 'Batch' },
  { value: 'course', label: 'Course roster' },
  { value: 'training', label: 'Training cohort' },
];

export function CohortFormDialog({
  open,
  onOpenChange,
  initial,
  cohortId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: { name: string; kind: string; programId: string | null; termId: string | null; graduationYear: number | null };
  cohortId?: string;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const lookups = useLookups();
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState(initial?.kind ?? 'section');
  const [programId, setProgramId] = useState(initial?.programId ?? '');
  const [termId, setTermId] = useState(initial?.termId ?? '');
  const [year, setYear] = useState(initial?.graduationYear ? String(initial.graduationYear) : '');
  const m = useMutation({
    mutationFn: () => {
      const payload = { name, kind, programId: programId || null, termId: termId || null, graduationYear: year ? Number(year) : null };
      return cohortId ? api.patch<{ cohort: { id: string } }>(`/teach/cohorts/${cohortId}`, payload) : api.post<{ cohort: { id: string } }>('/teach/cohorts', payload);
    },
    onSuccess: (r) => {
      toast.success(cohortId ? 'Cohort updated' : 'Cohort created. Add students next.');
      qc.invalidateQueries({ queryKey: ['teach'] });
      onOpenChange(false);
      if (!cohortId) nav(`/app/teach/cohorts/${r.cohort.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={cohortId ? 'Edit cohort' : 'New cohort'}
      description="A cohort is any group you teach: a section, a batch or a training group."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={name.trim().length < 2} disabledReason="Enter a name" onClick={() => m.mutate()}>
            {cohortId ? 'Save' : 'Create cohort'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" error={fields.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CSE 2027 Section A" autoFocus />
        </Field>
        <Field label="Kind">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Program" optional error={fields.programId} helper={lookups.data && !lookups.data.programs.length ? 'No programs set up in Campus yet.' : undefined}>
            <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
              <option value="">None</option>
              {lookups.data?.programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Term" optional error={fields.termId}>
            <Select value={termId} onChange={(e) => setTermId(e.target.value)}>
              <option value="">None</option>
              {lookups.data?.terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isCurrent ? ' (current)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Graduation year" optional error={fields.graduationYear}>
          <Input type="number" min={1990} max={2100} value={year} onChange={(e) => setYear(e.target.value)} className="max-w-[140px]" />
        </Field>
      </div>
    </Dialog>
  );
}

export default function CohortsPage() {
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ['teach', 'cohorts', scope, q], queryFn: () => api.get<{ items: CohortRow[]; canSeeAll: boolean }>(`/teach/cohorts?scope=${scope}${q ? `&q=${encodeURIComponent(q)}` : ''}`) });
  return (
    <div>
      <PageHeader
        title="Cohorts"
        description="Groups of students you teach. Assignments, attendance and analytics are organized by cohort."
        actions={
          <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setCreating(true)}>
            New cohort
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <MagnifyingGlassIcon size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cohorts" className="pl-8" aria-label="Search cohorts" />
        </div>
        {list.data?.canSeeAll && (
          <Segmented
            label="Which cohorts"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'mine', label: 'I teach' },
              { value: 'all', label: 'All in organization' },
            ]}
          />
        )}
      </div>
      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <SkeletonRows rows={4} />
      ) : !list.data!.items.length ? (
        <EmptyState
          icon={<UsersIcon size={22} />}
          title={q ? 'No cohorts match' : 'No cohorts yet'}
          description={q ? 'Try a different search.' : 'Create a cohort, add students, then publish assignments to it.'}
          action={
            !q && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                Create a cohort
              </Button>
            )
          }
        />
      ) : (
        <div className={TABLE_WRAP}>
          <table className="w-full min-w-[560px] text-left text-[13.5px]">
            <thead className={THEAD}>
              <tr>
                <th scope="col" className={TH}>Cohort</th>
                <th scope="col" className={TH}>Program</th>
                <th scope="col" className={`${TH} text-right`}>Students</th>
                <th scope="col" className={`${TH} text-right`}>Instructors</th>
                <th scope="col" className={`${TH} text-right`}>Assignments</th>
              </tr>
            </thead>
            <tbody>
              {list.data!.items.map((c) => (
                <tr key={c.id} className={TR}>
                  <td className={TD}>
                    <Link to={`/app/teach/cohorts/${c.id}`} className="font-semibold hover:text-accent-text hover:underline">
                      {c.name}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-subtle">
                      <span className="capitalize">{c.kind}</span>
                      {c.graduationYear && <span>· Class of {c.graduationYear}</span>}
                      {!c.teaching && <Badge>Not teaching</Badge>}
                    </div>
                  </td>
                  <td className={`${TD} text-muted`}>{c.programName ?? 'None'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{c.students}</td>
                  <td className={`${TD} text-right tabular-nums`}>{c.instructors}</td>
                  <td className={`${TD} text-right tabular-nums`}>{c.assignments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <CohortFormDialog open={creating} onOpenChange={setCreating} />}
    </div>
  );
}
