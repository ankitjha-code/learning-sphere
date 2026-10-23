import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileArrowUpIcon, GraduationCapIcon, MagnifyingGlassIcon, PlusIcon, SealCheckIcon, PencilSimpleLineIcon, DownloadSimpleIcon, WarningIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage, qs } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Badge, Banner, Button, Card, CardBody, CardHeader, Checkbox, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, Select, SkeletonRows, StatusBadge, Tabs, Textarea, Tooltip } from '@/components/ui';
import { CAMPUS_KEY, FIELD_LABELS, Known, listGroup, nativeCheckbox, TableWrap, td, th, useStructure } from './shared';
import type { StudentRecordRow } from './types';

type ListResponse = {
  items: StudentRecordRow[];
  total: number;
  page: number;
  pageSize: number;
  studentsWithoutRecord: number;
};

// ---------- Add record ----------

function AddRecordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const structure = useStructure();
  const missing = useQuery({
    queryKey: [...CAMPUS_KEY, 'students', 'missing'],
    queryFn: () => api.get<{ items: { userId: string; name: string; email: string }[] }>('/campus/students/missing'),
    enabled: open,
  });
  const [form, setForm] = useState({
    userId: '',
    rollNumber: '',
    programId: '',
    graduationYear: '',
    cgpa: '',
    activeBacklogs: '',
    verify: false,
  });
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const m = useMutation({
    mutationFn: () =>
      api.post('/campus/students', {
        userId: form.userId,
        rollNumber: form.rollNumber,
        programId: form.programId || null,
        graduationYear: num(form.graduationYear),
        cgpa: num(form.cgpa),
        activeBacklogs: num(form.activeBacklogs),
        verify: form.verify,
      }),
    onSuccess: () => {
      toast.success('Record created');
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const f = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a student record"
      description="Records are created only for existing student members. Leave a value empty when you do not know it; it shows as Needs data, never as zero."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!form.userId || !form.rollNumber.trim()} disabledReason="Choose a student and enter a roll number" onClick={() => m.mutate()}>
            Create record
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Student" error={f.userId} helper={missing.data && !missing.data.items.length ? 'Every student member already has a record. Invite new students from People & roles.' : undefined}>
          <Select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
            <option value="">{missing.isLoading ? 'Loading...' : 'Choose a student without a record'}</option>
            {missing.data?.items.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name} ({p.email})
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Roll number" error={f.rollNumber}>
            <Input value={form.rollNumber} onChange={(e) => setForm({ ...form, rollNumber: e.target.value })} />
          </Field>
          <Field label="Program" optional error={f.programId}>
            <Select value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })}>
              <option value="">Not recorded</option>
              {structure.data?.programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Graduation year" optional error={f.graduationYear}>
            <Input type="number" value={form.graduationYear} onChange={(e) => setForm({ ...form, graduationYear: e.target.value })} />
          </Field>
          <Field label="CGPA" optional error={f.cgpa}>
            <Input type="number" step="0.01" min={0} max={10} value={form.cgpa} onChange={(e) => setForm({ ...form, cgpa: e.target.value })} />
          </Field>
          <Field label="Active backlogs" optional error={f.activeBacklogs}>
            <Input type="number" min={0} value={form.activeBacklogs} onChange={(e) => setForm({ ...form, activeBacklogs: e.target.value })} />
          </Field>
        </div>
        <Checkbox checked={form.verify} onCheckedChange={(v) => setForm({ ...form, verify: v })} label="I checked these values against official records" description="Marks the record verified (recorded in the audit log)." />
      </div>
    </Dialog>
  );
}

// ---------- Records tab ----------

function RecordsTab() {
  const [params, setParams] = useSearchParams();
  const structure = useStructure();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmVerify, setConfirmVerify] = useState(false);
  const [adding, setAdding] = useState(false);
  const filters = {
    q: params.get('q') ?? '',
    programId: params.get('programId') ?? '',
    graduationYear: params.get('graduationYear') ?? '',
    verified: params.get('verified') ?? '',
    gaps: params.get('gaps') ?? '',
    status: params.get('status') ?? '',
    page: Number(params.get('page') ?? 1),
  };
  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };
  const list = useQuery({
    queryKey: [...CAMPUS_KEY, 'students', filters],
    queryFn: () => api.get<ListResponse>(`/campus/students${qs({ ...filters, pageSize: 25 })}`),
  });
  const verify = useMutation({
    mutationFn: () =>
      api.post<{ verified: number }>('/campus/students/verify', {
        recordIds: [...selected],
      }),
    onSuccess: (r) => {
      toast.success(`${r.verified} record${r.verified === 1 ? '' : 's'} verified`);
      setSelected(new Set());
      setConfirmVerify(false);
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const d = list.data;
  const filtered = Object.entries(filters).some(([k, v]) => k !== 'page' && v);

  return (
    <div className="space-y-3">
      {d && d.studentsWithoutRecord > 0 && (
        <Banner
          tone="warning"
          title={`${d.studentsWithoutRecord} student member${d.studentsWithoutRecord === 1 ? ' has' : 's have'} no academic record`}
          action={
            <Button size="sm" onClick={() => setAdding(true)}>
              Add record
            </Button>
          }
        >
          Their eligibility shows as Needs data in every drive. Add records one by one or import a CSV.
        </Banner>
      )}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:w-72">
          <MagnifyingGlassIcon size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            defaultValue={filters.q}
            onKeyDown={(e) => e.key === 'Enter' && setFilter('q', (e.target as HTMLInputElement).value)}
            onBlur={(e) => setFilter('q', e.target.value)}
            placeholder="Search name, email or roll number"
            className="pl-8"
            aria-label="Search students"
          />
        </div>
        <Select value={filters.programId} onChange={(e) => setFilter('programId', e.target.value)} aria-label="Program" className="w-full sm:w-[150px]">
          <option value="">All programs</option>
          {structure.data?.programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code}
            </option>
          ))}
        </Select>
        <Input type="number" value={filters.graduationYear} onChange={(e) => setFilter('graduationYear', e.target.value)} placeholder="Graduation year" aria-label="Graduation year" className="w-full sm:w-[140px]" />
        <Select value={filters.verified} onChange={(e) => setFilter('verified', e.target.value)} aria-label="Verification" className="w-full sm:w-[164px]">
          <option value="">Any verification</option>
          <option value="yes">Verified</option>
          <option value="no">Not verified</option>
        </Select>
        <Select value={filters.gaps} onChange={(e) => setFilter('gaps', e.target.value)} aria-label="Data gaps" className="w-full sm:w-[150px]">
          <option value="">Any data</option>
          <option value="yes">Has data gaps</option>
          <option value="no">Complete</option>
        </Select>
        <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status" className="w-full sm:w-[140px]">
          <option value="">Any status</option>
          <option value="enrolled">Enrolled</option>
          <option value="on_leave">On leave</option>
          <option value="graduated">Graduated</option>
          <option value="withdrawn">Withdrawn</option>
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-[13px] text-muted" aria-live="polite">
          {d ? `${d.total} record${d.total === 1 ? '' : 's'}` : 'Loading records'}
          {selected.size > 0 && <span className="font-medium text-fg"> · {selected.size} selected</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<SealCheckIcon size={14} />} disabled={!selected.size} disabledReason="Select records to verify" onClick={() => setConfirmVerify(true)}>
            Verify selected
          </Button>
          <Button size="sm" variant="primary" icon={<PlusIcon size={14} />} onClick={() => setAdding(true)}>
            Add record
          </Button>
        </div>
      </div>
      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !d ? (
        <SkeletonRows rows={6} />
      ) : !d.items.length ? (
        <EmptyState
          icon={<GraduationCapIcon size={22} />}
          title={filtered ? 'No records match these filters' : 'No student records yet'}
          description={filtered ? 'Clear a filter to see more students.' : 'Import a CSV of roll numbers, programs, CGPA and backlogs, or add records one by one.'}
          action={
            filtered ? (
              <Button onClick={() => setParams({})}>Clear filters</Button>
            ) : (
              <Button variant="primary" onClick={() => setParams({ tab: 'import' })}>
                Import CSV
              </Button>
            )
          }
        />
      ) : (
        <>
          <TableWrap>
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-border">
                <tr>
                  <th className={`${th} w-10 pr-0`}>
                    <input
                      type="checkbox"
                      className={nativeCheckbox}
                      aria-label="Select all unverified on this page"
                      checked={d.items.filter((i) => !i.verifiedAt).length > 0 && d.items.filter((i) => !i.verifiedAt).every((i) => selected.has(i.id))}
                      onChange={(e) => setSelected(e.target.checked ? new Set(d.items.filter((i) => !i.verifiedAt).map((i) => i.id)) : new Set())}
                    />
                  </th>
                  <th className={th}>Student</th>
                  <th className={th}>Roll number</th>
                  <th className={th}>Program</th>
                  <th className={th}>Year</th>
                  <th className={th}>CGPA</th>
                  <th className={th}>Backlogs</th>
                  <th className={th}>Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.items.map((r) => (
                  <tr key={r.id}>
                    <td className={`${td} pr-0`}>
                      {!r.verifiedAt && (
                        <input
                          type="checkbox"
                          className={nativeCheckbox}
                          aria-label={`Select ${r.name}`}
                          checked={selected.has(r.id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                            setSelected(next);
                          }}
                        />
                      )}
                    </td>
                    <td className={td}>
                      <Link to={`/app/campus/students/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-[12px] text-subtle">{r.email}</div>
                    </td>
                    <td className={td}>{r.rollNumber}</td>
                    <td className={td}>
                      <Known value={r.programCode} />
                    </td>
                    <td className={td}>
                      <Known value={r.graduationYear} />
                    </td>
                    <td className={td}>
                      <Known value={r.cgpa} />
                    </td>
                    <td className={td}>
                      <Known value={r.activeBacklogs} />
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap items-center gap-1">
                        {r.verifiedAt ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}
                        {r.gaps.length > 0 && (
                          <Tooltip content={`Missing: ${r.gaps.map((g) => FIELD_LABELS[g] ?? g).join(', ')}`}>
                            <span>
                              <Badge tone="warning" icon={<WarningIcon size={11} />}>
                                {r.gaps.length} gap
                                {r.gaps.length === 1 ? '' : 's'}
                              </Badge>
                            </span>
                          </Tooltip>
                        )}
                        {r.openCorrections > 0 && <Badge tone="info">{r.openCorrections} correction</Badge>}
                        {r.status !== 'enrolled' && <StatusBadge status={r.status} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {d.total > d.pageSize && <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => setFilter('page', String(p))} />}
        </>
      )}
      <ConfirmDialog
        open={confirmVerify}
        onOpenChange={setConfirmVerify}
        title={`Verify ${selected.size} record${selected.size === 1 ? '' : 's'}?`}
        description="Verify only after checking the values against official academic records. Verification is recorded in the audit log with your name."
        confirmLabel="Verify"
        loading={verify.isPending}
        onConfirm={() => verify.mutate()}
      />
      {adding && <AddRecordDialog open onOpenChange={setAdding} />}
    </div>
  );
}

// ---------- Import tab ----------

type ImportRow = {
  line: number;
  email: string;
  rollNumber: string;
  programCode: string;
  graduationYear: number | null;
  cgpa: number | null;
  activeBacklogs: number | null;
  status: string;
  messages: string[];
  name?: string;
};
const IMPORT_STATUS: Record<string, { label: string; tone: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }> = {
  create: { label: 'Will create', tone: 'success' },
  update: { label: 'Will update', tone: 'info' },
  exists: { label: 'Already has a record', tone: 'neutral' },
  duplicate: { label: 'Duplicate in file', tone: 'warning' },
  not_member: { label: 'Not a member', tone: 'danger' },
  not_student: { label: 'Not a student', tone: 'danger' },
  invalid: { label: 'Invalid', tone: 'danger' },
};
const TEMPLATE = 'email,roll number,program code,graduation year,cgpa,active backlogs\nstudent@example.edu,NB27CSE101,BTCSE,2027,8.1,0\n';

function ImportTab() {
  const qc = useQueryClient();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [updateExisting, setUpdateExisting] = useState(false);
  const preview = useMutation({
    mutationFn: () =>
      api.post<{
        rows: ImportRow[];
        summary: Record<string, number>;
        total: number;
      }>('/campus/students/import/preview', { csv, updateExisting }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const confirm = useMutation({
    mutationFn: () =>
      api.post<{
        created: number;
        updated: number;
        summary: Record<string, number>;
      }>('/campus/students/import/confirm', { csv, updateExisting }),
    onSuccess: (r) => {
      toast.success(`Import finished: ${r.created} created, ${r.updated} updated`);
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const applicable = (preview.data?.summary.create ?? 0) + (preview.data?.summary.update ?? 0);
  const reset = () => {
    setCsv('');
    setFileName('');
    preview.reset();
    confirm.reset();
  };
  return (
    <div className="space-y-4">
      <Banner tone="info" title="Importing never creates accounts">
        Rows are matched to existing members by email. People who are not student members are reported so you can invite them from People & roles. Empty cells are stored as unknown, not zero. Imported values are unverified until you verify
        them.
      </Banner>
      {confirm.data ? (
        <div className="rounded-lg border border-border bg-surface p-5 shadow-1">
          <h3 className="text-[15px] font-semibold">Import complete</h3>
          <p className="mt-1 text-[13.5px] text-muted">
            {confirm.data.created} records created, {confirm.data.updated} updated.{' '}
            {Object.entries(confirm.data.summary)
              .filter(([k]) => k !== 'create' && k !== 'update')
              .map(([k, v]) => `${v} ${IMPORT_STATUS[k]?.label.toLowerCase() ?? k}`)
              .join(', ') || 'No rows were skipped.'}
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={reset}>Import another file</Button>
          </div>
        </div>
      ) : (
        <>
          <Card>
            <CardHeader
              title="Upload a CSV"
              description="Preview first. Nothing is saved until you confirm the import."
              action={
                <a
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
                  download="student-records-template.csv"
                  className="-mr-2 inline-flex h-7 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-soft"
                >
                  <DownloadSimpleIcon size={14} aria-hidden /> Download template
                </a>
              }
            />
            <CardBody className="space-y-4">
              <Field label="CSV file" helper="Columns: email, roll number, program code, graduation year, cgpa, active backlogs." className="max-w-md">
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 2_000_000) {
                      toast.error('The file is too large (2 MB maximum).');
                      return;
                    }
                    setFileName(f.name);
                    setCsv(await f.text());
                    preview.reset();
                  }}
                  className="py-1.5"
                />
              </Field>
              <Checkbox
                checked={updateExisting}
                onCheckedChange={(v) => {
                  setUpdateExisting(v);
                  preview.reset();
                }}
                label="Update existing records"
                description="Filled-in cells overwrite current values (and clear verification). Blank cells keep the current value."
              />
              <div className="border-t border-border pt-4">
                <Button variant="primary" icon={<FileArrowUpIcon size={15} />} loading={preview.isPending} disabled={!csv} disabledReason="Choose a CSV file first" onClick={() => preview.mutate()}>
                  Preview import
                </Button>
              </div>
            </CardBody>
          </Card>
          {preview.data && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-medium">{fileName}</span>
                <span className="text-muted">{preview.data.total} rows:</span>
                {Object.entries(preview.data.summary).map(([k, v]) => (
                  <Badge key={k} tone={IMPORT_STATUS[k]?.tone ?? 'neutral'}>
                    {v} {IMPORT_STATUS[k]?.label.toLowerCase() ?? k}
                  </Badge>
                ))}
              </div>
              <TableWrap className="max-h-[420px] overflow-y-auto">
                <table className="w-full min-w-[820px]">
                  <thead className="sticky top-0 border-b border-border bg-surface">
                    <tr>
                      <th className={th}>Line</th>
                      <th className={th}>Email</th>
                      <th className={th}>Roll</th>
                      <th className={th}>Program</th>
                      <th className={th}>Year</th>
                      <th className={th}>CGPA</th>
                      <th className={th}>Backlogs</th>
                      <th className={th}>Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.data.rows.map((r) => (
                      <tr key={r.line}>
                        <td className={td}>{r.line}</td>
                        <td className={td}>
                          {r.email}
                          {r.name && <div className="text-[12px] text-subtle">{r.name}</div>}
                        </td>
                        <td className={td}>{r.rollNumber}</td>
                        <td className={td}>{r.programCode || <span className="text-subtle">blank</span>}</td>
                        <td className={td}>
                          <Known value={r.graduationYear} label="Unknown" />
                        </td>
                        <td className={td}>
                          <Known value={r.cgpa} label="Unknown" />
                        </td>
                        <td className={td}>
                          <Known value={r.activeBacklogs} label="Unknown" />
                        </td>
                        <td className={td}>
                          <Badge tone={IMPORT_STATUS[r.status]?.tone ?? 'neutral'}>{IMPORT_STATUS[r.status]?.label ?? r.status}</Badge>
                          {r.messages.map((m, i) => (
                            <div key={i} className="mt-0.5 text-[12px] text-muted">
                              {m}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <div className="flex gap-2">
                <Button variant="primary" loading={confirm.isPending} disabled={!applicable} disabledReason="No rows can be imported. Fix the file and preview again." onClick={() => confirm.mutate()}>
                  Import {applicable} row{applicable === 1 ? '' : 's'}
                </Button>
                <Button onClick={reset}>Cancel</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Corrections tab ----------

type Correction = {
  id: string;
  field: string;
  fieldLabel: string;
  currentValue: string | null;
  proposedValue: string;
  reason: string;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  recordId: string;
  student: { name: string; email: string; rollNumber: string };
};

function CorrectionsTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('open');
  const q = useQuery({
    queryKey: [...CAMPUS_KEY, 'corrections', status],
    queryFn: () => api.get<{ items: Correction[] }>(`/campus/corrections?status=${status}`),
  });
  const [approving, setApproving] = useState<Correction | null>(null);
  const [rejecting, setRejecting] = useState<Correction | null>(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const done = (msg: string) => {
    toast.success(msg);
    setApproving(null);
    setRejecting(null);
    setNote('');
    qc.invalidateQueries({ queryKey: CAMPUS_KEY });
  };
  const approve = useMutation({
    mutationFn: () =>
      api.post(`/campus/corrections/${approving!.id}/approve`, {
        value: value.trim() || undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: () => done('Correction applied and the student was notified'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: () => api.post(`/campus/corrections/${rejecting!.id}/reject`, { note }),
    onSuccess: () => done('Request rejected and the student was notified'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const af = approve.error instanceof ApiError ? approve.error.fields : {};
  const rf = reject.error instanceof ApiError ? reject.error.fields : {};
  return (
    <div className="space-y-3">
      <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="w-40">
        <option value="open">Open</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="all">All</option>
      </Select>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <SkeletonRows rows={3} />
      ) : !q.data.items.length ? (
        <EmptyState
          icon={<PencilSimpleLineIcon size={22} />}
          title={status === 'open' ? 'No open correction requests' : 'Nothing here'}
          description="Students request corrections from their Placements record page. Requests appear here for review."
        />
      ) : (
        <ul className={listGroup}>
          {q.data.items.map((x) => (
            <li key={x.id} className="px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <div className="text-[14.5px] font-semibold tracking-[-0.005em]">
                    <Link to={`/app/campus/students/${x.recordId}`} className="hover:underline">
                      {x.student.name}
                    </Link>{' '}
                    <span className="text-[12.5px] font-normal text-subtle">{x.student.rollNumber}</span>
                  </div>
                  <div className="mt-1.5 text-[13.5px]">
                    {x.fieldLabel}: <span className="text-muted">{x.currentValue ?? 'Not recorded'}</span> to <span className="font-medium">{x.proposedValue}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-muted">{x.reason}</p>
                  {x.reviewNote && <p className="mt-1 text-[12.5px] text-subtle">Review note: {x.reviewNote}</p>}
                  <div className="mt-1.5 text-[12px] text-subtle">Requested {timeAgo(x.createdAt)}</div>
                </div>
                {x.status === 'open' ? (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setRejecting(x);
                        setNote('');
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setApproving(x);
                        setValue('');
                        setNote('');
                      }}
                    >
                      Approve
                    </Button>
                  </div>
                ) : (
                  <StatusBadge status={x.status} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={!!approving}
        onOpenChange={(v) => !v && setApproving(null)}
        title="Approve correction"
        description="The record is updated right away and the change is recorded in the audit log."
        footer={
          <>
            <Button onClick={() => setApproving(null)}>Cancel</Button>
            <Button variant="primary" loading={approve.isPending} onClick={() => approve.mutate()}>
              Apply correction
            </Button>
          </>
        }
      >
        {approving && (
          <div className="space-y-4 text-[13.5px]">
            <p>
              {approving.fieldLabel}: <span className="text-muted">{approving.currentValue ?? 'Not recorded'}</span> to <span className="font-medium">{approving.proposedValue}</span>
            </p>
            <Field label="Value to apply" optional error={af.value} helper={approving.field === 'program' ? 'Enter a program code from Structure.' : 'Leave empty to apply the proposed value.'}>
              <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={approving.proposedValue} />
            </Field>
            <Field label="Note to the student" optional>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        )}
      </Dialog>
      <Dialog
        open={!!rejecting}
        onOpenChange={(v) => !v && setRejecting(null)}
        title="Reject correction"
        description="Tell the student why, so they know what to do next."
        footer={
          <>
            <Button onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="danger" loading={reject.isPending} disabled={note.trim().length < 5} disabledReason="Write a short explanation" onClick={() => reject.mutate()}>
              Reject request
            </Button>
          </>
        }
      >
        <Field label="Explanation" error={rf.note}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the exam cell has not published semester 6 results yet." />
        </Field>
      </Dialog>
    </div>
  );
}

export default function StudentsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'records';
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Student records" description="Academic records used for placement eligibility. Missing values are shown as Needs data and never count against a student." />
      <Tabs
        value={tab}
        onValueChange={(v) => setParams(v === 'records' ? {} : { tab: v })}
        tabs={[
          { value: 'records', label: 'Records' },
          { value: 'import', label: 'Import CSV' },
          { value: 'corrections', label: 'Correction requests' },
        ]}
        className="mb-4"
      />
      {tab === 'import' ? <ImportTab /> : tab === 'corrections' ? <CorrectionsTab /> : <RecordsTab />}
    </div>
  );
}
