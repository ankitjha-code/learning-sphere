import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, TreeStructureIcon, PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Badge, Banner, Button, Card, CardBody, CardHeader, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Menu, PageHeader, Select, SkeletonRows, Switch, Tabs } from '@/components/ui';
import { CAMPUS_KEY, TableWrap, td, th, useStructure } from './shared';
import { RuleBuilder } from './RuleBuilder';
import type { Batch, Department, EligibilityRules, Program, Structure, Term } from './types';

type Kind = 'departments' | 'programs' | 'terms' | 'batches';
const SINGULAR: Record<Kind, string> = { departments: 'department', programs: 'program', terms: 'term', batches: 'batch' };

function useSave(kind: Kind, id: string | undefined, onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => (id ? api.patch(`/campus/${kind}/${id}`, payload) : api.post(`/campus/${kind}`, payload)),
    onSuccess: () => {
      toast.success(id ? 'Saved' : `${SINGULAR[kind][0].toUpperCase()}${SINGULAR[kind].slice(1)} added`);
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

function DepartmentDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (v: boolean) => void; initial?: Department }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const m = useSave('departments', initial?.id, () => onOpenChange(false));
  const f = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? 'Edit department' : 'New department'}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={name.trim().length < 2 || !code.trim()} disabledReason="Enter a name and a code" onClick={() => m.mutate({ name, code })}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" error={f.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Computer Science and Engineering" autoFocus />
        </Field>
        <Field label="Code" error={f.code} helper="Short and unique, for example CSE.">
          <Input value={code} onChange={(e) => setCode(e.target.value)} className="max-w-[160px]" />
        </Field>
      </div>
    </Dialog>
  );
}

function ProgramDialog({ open, onOpenChange, initial, structure }: { open: boolean; onOpenChange: (v: boolean) => void; initial?: Program; structure: Structure }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [departmentId, setDepartmentId] = useState(initial?.departmentId ?? '');
  const [years, setYears] = useState(String(initial?.durationYears ?? 4));
  const m = useSave('programs', initial?.id, () => onOpenChange(false));
  const f = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? 'Edit program' : 'New program'}
      description="Program codes are used in CSV imports and correction requests."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={name.trim().length < 2 || !code.trim()} disabledReason="Enter a name and a code" onClick={() => m.mutate({ name, code, departmentId: departmentId || null, durationYears: Number(years) || 4 })}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" error={f.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="B.Tech Computer Science and Engineering" autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" error={f.code}>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="BTCSE" />
          </Field>
          <Field label="Duration (years)" error={f.durationYears}>
            <Input type="number" min={1} max={8} value={years} onChange={(e) => setYears(e.target.value)} />
          </Field>
        </div>
        <Field label="Department" optional error={f.departmentId}>
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">None</option>
            {structure.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function TermDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (v: boolean) => void; initial?: Term }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? '');
  const [isCurrent, setIsCurrent] = useState(initial?.isCurrent ?? false);
  const m = useSave('terms', initial?.id, () => onOpenChange(false));
  const f = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? 'Edit term' : 'New academic term'}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={name.trim().length < 2 || !startsOn || !endsOn} disabledReason="Enter a name and both dates" onClick={() => m.mutate({ name, startsOn, endsOn, isCurrent })}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" error={f.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2026-27 Odd Semester" autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts on" error={f.startsOn}>
            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label="Ends on" error={f.endsOn}>
            <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </Field>
        </div>
        <Switch checked={isCurrent} onCheckedChange={setIsCurrent} label="Current term" description="Only one term is current at a time; marking this one unmarks the others." />
      </div>
    </Dialog>
  );
}

function BatchDialog({ open, onOpenChange, initial, structure }: { open: boolean; onOpenChange: (v: boolean) => void; initial?: Batch; structure: Structure }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [programId, setProgramId] = useState(initial?.programId ?? '');
  const [termId, setTermId] = useState(initial?.termId ?? '');
  const [year, setYear] = useState(initial?.graduationYear ? String(initial.graduationYear) : '');
  const m = useSave('batches', initial?.id, () => onOpenChange(false));
  const f = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? 'Edit batch' : 'New batch'}
      description="A batch groups students graduating together. Add or remove members in Teach, Cohorts."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={name.trim().length < 2 || !year} disabledReason="Enter a name and a graduation year" onClick={() => m.mutate({ name, programId: programId || null, termId: termId || null, graduationYear: Number(year) })}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" error={f.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CSE 2027" autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Graduation year" error={f.graduationYear}>
            <Input type="number" min={1990} max={2100} value={year} onChange={(e) => setYear(e.target.value)} />
          </Field>
          <Field label="Program" optional error={f.programId}>
            <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
              <option value="">None</option>
              {structure.programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Term" optional error={f.termId}>
          <Select value={termId} onChange={(e) => setTermId(e.target.value)}>
            <option value="">None</option>
            {structure.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function DeleteDialog({ kind, target, onOpenChange }: { kind: Kind; target: { id: string; name: string } | null; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.del(`/campus/${kind}/${target!.id}`),
    onSuccess: () => {
      toast.success('Deleted');
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={onOpenChange}
      title={`Delete ${SINGULAR[kind]}?`}
      description={`${target?.name ?? ''} will be removed. Items that still use it block the deletion, and you will be told what to move first.`}
      confirmLabel="Delete"
      danger
      loading={m.isPending}
      onConfirm={() => m.mutate()}
    />
  );
}

function PoliciesPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [...CAMPUS_KEY, 'settings'],
    queryFn: () =>
      api.get<{
        settings: { placementOptInDefault: boolean; eligibilityDefaults: EligibilityRules };
        policies: { requireVerifiedRecordForPlacement: boolean; allowStudentDirectory: boolean };
        policyDescriptions: Record<string, string>;
        branding: { accent?: string };
        canEditBranding: boolean;
      }>('/campus/settings'),
  });
  const [optIn, setOptIn] = useState(true);
  const [rules, setRules] = useState<EligibilityRules>({});
  const [accent, setAccent] = useState('');
  useEffect(() => {
    if (q.data) {
      setOptIn(q.data.settings.placementOptInDefault);
      setRules(q.data.settings.eligibilityDefaults ?? {});
      if (q.data.branding.accent) setAccent(q.data.branding.accent);
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.put('/campus/settings', { placementOptInDefault: optIn, eligibilityDefaults: rules }),
    onSuccess: () => {
      toast.success('Campus settings saved');
      qc.invalidateQueries({ queryKey: [...CAMPUS_KEY, 'settings'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const brand = useMutation({
    mutationFn: () => api.patch('/org/current', { accent }),
    onSuccess: () => toast.success('Accent colour saved'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <SkeletonRows rows={4} />;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="min-w-0">
        <CardHeader title="Placement defaults" description="Applied to new student records and new drives. Existing data is not changed." />
        <CardBody className="space-y-4">
          <Switch checked={optIn} onCheckedChange={setOptIn} label="Students are opted in for placement by default" description="Students can change their own opt-in from their Placements page." />
          <div className="border-t border-border pt-4">
            <div className="mb-3 text-[14px] font-semibold">Default eligibility rules for new drives</div>
            <RuleBuilder value={rules} onChange={setRules} />
          </div>
          <div className="border-t border-border pt-4">
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              Save defaults
            </Button>
          </div>
        </CardBody>
      </Card>
      <div className="space-y-5">
        <Card>
          <CardHeader title="Institution policies" description="Set by an organization admin in organization settings. Shown here because they change how eligibility works." />
          <CardBody className="space-y-3 text-[13px]">
            {(['requireVerifiedRecordForPlacement', 'allowStudentDirectory'] as const).map((k) => (
              <div key={k} className="flex items-start justify-between gap-3">
                <span className="text-muted">{q.data.policyDescriptions[k]}</span>
                <Badge tone={q.data.policies[k] ? 'success' : 'neutral'}>{q.data.policies[k] ? 'On' : 'Off'}</Badge>
              </div>
            ))}
            {q.data.policies.requireVerifiedRecordForPlacement && <Banner tone="info">Unverified records show as "Needs data" in every drive until someone verifies them.</Banner>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Branding" description="Accent colour used across your organization's workspace." />
          <CardBody>
            {q.data.canEditBranding ? (
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Accent colour" helper="A hex colour such as the one in your logo.">
                  <Input value={accent} onChange={(e) => setAccent(e.target.value.trim())} placeholder="Hex code" className="w-36 font-mono" />
                </Field>
                {/^#[0-9a-fA-F]{6}$/.test(accent) && <span className="mb-2 h-7 w-7 rounded-md border border-border" style={{ background: accent }} aria-hidden />}
                <Button loading={brand.isPending} disabled={!/^#[0-9a-fA-F]{6}$/.test(accent)} disabledReason="Enter a 6-digit hex colour starting with #" onClick={() => brand.mutate()}>
                  Save colour
                </Button>
              </div>
            ) : (
              <p className="text-[13px] text-muted">Only an organization admin can change branding.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function StructurePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Kind | 'policies') ?? 'departments';
  const q = useStructure();
  const [editing, setEditing] = useState<{ kind: Kind; item?: unknown } | null>(null);
  const [deleting, setDeleting] = useState<{ kind: Kind; id: string; name: string } | null>(null);
  const s = q.data;
  const tabs = [
    { value: 'departments', label: 'Departments', count: s?.departments.length },
    { value: 'programs', label: 'Programs', count: s?.programs.length },
    { value: 'terms', label: 'Terms', count: s?.terms.length },
    { value: 'batches', label: 'Batches', count: s?.batches.length },
    { value: 'policies', label: 'Policies & branding' },
  ];
  const rowMenu = (kind: Kind, item: { id: string; name: string }) => (
    <Menu
      items={[
        { label: 'Edit', icon: <PencilSimpleIcon size={14} />, onSelect: () => setEditing({ kind, item }) },
        { label: 'Delete', icon: <TrashIcon size={14} />, danger: true, onSelect: () => setDeleting({ kind, id: item.id, name: item.name }) },
      ]}
    />
  );
  const progName = (id: string | null) => s?.programs.find((p) => p.id === id)?.name ?? null;
  const depName = (id: string | null) => s?.departments.find((p) => p.id === id)?.name ?? null;
  const termName = (id: string | null) => s?.terms.find((p) => p.id === id)?.name ?? null;
  const addLabel = tab === 'policies' ? null : `Add ${SINGULAR[tab]}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Institution structure"
        description="Departments, programs, academic terms and graduating batches. Courses and cohort membership live in Teach."
        actions={
          addLabel && (
            <Button variant="primary" icon={<PlusIcon size={15} />} onClick={() => setEditing({ kind: tab as Kind })}>
              {addLabel}
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })} tabs={tabs} className="mb-4" />
      {tab === 'policies' ? (
        <PoliciesPanel />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !s ? (
        <SkeletonRows rows={5} />
      ) : (
        (() => {
          const rows = s[tab as Kind] as unknown[];
          if (!rows.length)
            return (
              <EmptyState
                icon={<TreeStructureIcon size={22} />}
                title={`No ${tab} yet`}
                description={
                  tab === 'batches'
                    ? 'Batches group students by graduation year. Create one, then add members from Teach, Cohorts.'
                    : tab === 'terms'
                      ? 'Add your academic terms and mark the current one.'
                      : `Add your ${tab} so student records and drive eligibility can refer to them.`
                }
                action={
                  <Button variant="primary" onClick={() => setEditing({ kind: tab as Kind })}>
                    {addLabel}
                  </Button>
                }
              />
            );
          return (
            <TableWrap>
              <table className="w-full min-w-[560px]">
                <thead className="border-b border-border">
                  {tab === 'departments' && (
                    <tr>
                      <th className={th}>Department</th>
                      <th className={th}>Code</th>
                      <th className={th}>Programs</th>
                      <th className={th}>Student records</th>
                      <th className={th} aria-label="Actions" />
                    </tr>
                  )}
                  {tab === 'programs' && (
                    <tr>
                      <th className={th}>Program</th>
                      <th className={th}>Code</th>
                      <th className={th}>Department</th>
                      <th className={th}>Duration</th>
                      <th className={th}>Student records</th>
                      <th className={th} aria-label="Actions" />
                    </tr>
                  )}
                  {tab === 'terms' && (
                    <tr>
                      <th className={th}>Term</th>
                      <th className={th}>Dates</th>
                      <th className={th}>Status</th>
                      <th className={th} aria-label="Actions" />
                    </tr>
                  )}
                  {tab === 'batches' && (
                    <tr>
                      <th className={th}>Batch</th>
                      <th className={th}>Graduation year</th>
                      <th className={th}>Program</th>
                      <th className={th}>Term</th>
                      <th className={th}>Members</th>
                      <th className={th} aria-label="Actions" />
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-border">
                  {tab === 'departments' &&
                    s.departments.map((d) => (
                      <tr key={d.id}>
                        <td className={`${td} font-medium`}>{d.name}</td>
                        <td className={td}>{d.code}</td>
                        <td className={td}>{d.programs}</td>
                        <td className={td}>{d.students}</td>
                        <td className={`${td} text-right`}>{rowMenu('departments', d)}</td>
                      </tr>
                    ))}
                  {tab === 'programs' &&
                    s.programs.map((p) => (
                      <tr key={p.id}>
                        <td className={`${td} font-medium`}>{p.name}</td>
                        <td className={td}>{p.code}</td>
                        <td className={td}>{depName(p.departmentId) ?? <span className="text-subtle">None</span>}</td>
                        <td className={td}>{p.durationYears} years</td>
                        <td className={td}>
                          <Link to={`/app/campus/students?programId=${p.id}`} className="hover:underline">
                            {p.students}
                          </Link>
                        </td>
                        <td className={`${td} text-right`}>{rowMenu('programs', p)}</td>
                      </tr>
                    ))}
                  {tab === 'terms' &&
                    s.terms.map((t) => (
                      <tr key={t.id}>
                        <td className={`${td} font-medium`}>{t.name}</td>
                        <td className={td}>
                          {formatDate(t.startsOn)} to {formatDate(t.endsOn)}
                        </td>
                        <td className={td}>{t.isCurrent ? <Badge tone="success">Current</Badge> : <span className="text-subtle">Not current</span>}</td>
                        <td className={`${td} text-right`}>{rowMenu('terms', t)}</td>
                      </tr>
                    ))}
                  {tab === 'batches' &&
                    s.batches.map((b) => (
                      <tr key={b.id}>
                        <td className={`${td} font-medium`}>{b.name}</td>
                        <td className={td}>{b.graduationYear ?? 'Not set'}</td>
                        <td className={td}>{progName(b.programId) ?? <span className="text-subtle">None</span>}</td>
                        <td className={td}>{termName(b.termId) ?? <span className="text-subtle">None</span>}</td>
                        <td className={td}>
                          <Link to={`/app/teach/cohorts/${b.id}`} className="hover:underline">
                            {b.members} in Teach
                          </Link>
                        </td>
                        <td className={`${td} text-right`}>{rowMenu('batches', b)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </TableWrap>
          );
        })()
      )}
      {editing?.kind === 'departments' && s && <DepartmentDialog open onOpenChange={() => setEditing(null)} initial={editing.item as Department | undefined} />}
      {editing?.kind === 'programs' && s && <ProgramDialog open onOpenChange={() => setEditing(null)} initial={editing.item as Program | undefined} structure={s} />}
      {editing?.kind === 'terms' && s && <TermDialog open onOpenChange={() => setEditing(null)} initial={editing.item as Term | undefined} />}
      {editing?.kind === 'batches' && s && <BatchDialog open onOpenChange={() => setEditing(null)} initial={editing.item as Batch | undefined} structure={s} />}
      <DeleteDialog kind={deleting?.kind ?? 'departments'} target={deleting} onOpenChange={(v) => !v && setDeleting(null)} />
    </div>
  );
}
