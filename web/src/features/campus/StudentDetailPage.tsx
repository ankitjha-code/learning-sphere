import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilSimpleIcon, SealCheckIcon, DnaIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, timeAgo } from '@/lib/format';
import { Badge, Banner, Button, Card, CardAction, CardBody, CardHeader, Checkbox, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, ProvenanceTag, Select, SkeletonRows, StatusBadge, Switch, Textarea } from '@/components/ui';
import { CAMPUS_KEY, FIELD_LABELS, Known, SkillStateBadge, StageBadge, STAGE_LABELS, useStructure } from './shared';

type Detail = {
  record: {
    id: string;
    userId: string;
    rollNumber: string;
    programId: string | null;
    graduationYear: number | null;
    cgpa: number | null;
    activeBacklogs: number | null;
    attendancePercent: number | null;
    status: string;
    placementOptIn: boolean;
    verifiedAt: string | null;
    notes: string | null;
    updatedAt: string;
    gaps: string[];
  };
  student: { name: string; email: string };
  program: { id: string; name: string; code: string } | null;
  department: { id: string; name: string } | null;
  corrections: { id: string; field: string; currentValue: string | null; proposedValue: string; reason: string; status: string; reviewNote: string | null; createdAt: string }[];
  placementHistory: { candidateId: string; driveId: string; driveTitle: string; companyName: string; stage: string; offerCtcText: string | null; updatedAt: string; driveStatus: string; events: { fromStage: string | null; toStage: string; note: string | null; actorKind: string; createdAt: string }[] }[];
  skills: { slug: string; name: string; category: string; state: string; verified: boolean; evidenceCount: number; mastery: number | null; lastEvidenceAt: string | null; sources: string[] }[];
};

function EditRecordDialog({ d, open, onOpenChange }: { d: Detail; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const structure = useStructure();
  const r = d.record;
  const s = (v: number | null) => (v === null ? '' : String(v));
  const [form, setForm] = useState({ rollNumber: r.rollNumber, programId: r.programId ?? '', graduationYear: s(r.graduationYear), cgpa: s(r.cgpa), activeBacklogs: s(r.activeBacklogs), attendancePercent: s(r.attendancePercent), status: r.status, placementOptIn: r.placementOptIn, notes: r.notes ?? '', verify: false });
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const m = useMutation({
    mutationFn: () =>
      api.patch(`/campus/students/${r.id}`, {
        rollNumber: form.rollNumber,
        programId: form.programId || null,
        graduationYear: num(form.graduationYear),
        cgpa: num(form.cgpa),
        activeBacklogs: num(form.activeBacklogs),
        attendancePercent: num(form.attendancePercent),
        status: form.status,
        placementOptIn: form.placementOptIn,
        notes: form.notes || null,
        ...(form.verify ? { verify: true } : {}),
      }),
    onSuccess: () => {
      toast.success('Record saved');
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
      size="lg"
      title="Edit record"
      description="Leave a value empty when it is unknown. Changing academic values on a verified record clears verification unless you verify again."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!form.rollNumber.trim()} disabledReason="Roll number is required" onClick={() => m.mutate()}>
            Save record
          </Button>
        </>
      }
    >
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
        <Field label="Attendance (%)" optional error={f.attendancePercent} helper="Usually synced from Teach attendance.">
          <Input type="number" min={0} max={100} value={form.attendancePercent} onChange={(e) => setForm({ ...form, attendancePercent: e.target.value })} />
        </Field>
        <Field label="Status" error={f.status}>
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="enrolled">Enrolled</option>
            <option value="on_leave">On leave</option>
            <option value="graduated">Graduated</option>
            <option value="withdrawn">Withdrawn</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Switch checked={form.placementOptIn} onCheckedChange={(v) => setForm({ ...form, placementOptIn: v })} label="Opted in for placement" />
        </div>
        <Field label="Internal notes" optional className="sm:col-span-2" helper="Visible to campus staff only.">
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox checked={form.verify} onCheckedChange={(v) => setForm({ ...form, verify: v })} label="Mark verified after saving" description="Only when you checked the values against official records." />
        </div>
      </div>
    </Dialog>
  );
}

export default function StudentDetailPage() {
  const { recordId } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...CAMPUS_KEY, 'student', recordId], queryFn: () => api.get<Detail>(`/campus/students/${recordId}`) });
  const [editing, setEditing] = useState(false);
  const [confirmVerify, setConfirmVerify] = useState(false);
  const verify = useMutation({
    mutationFn: () => api.post(`/campus/students/${recordId}/verify`, {}),
    onSuccess: () => {
      toast.success('Record verified');
      setConfirmVerify(false);
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const d = q.data;
  const breadcrumb = (
    <Link to="/app/campus/students" className="hover:text-fg">
      Student records
    </Link>
  );
  if (q.error)
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Student record" breadcrumb={breadcrumb} />
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </div>
    );
  if (!d)
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Student record" breadcrumb={breadcrumb} />
        <SkeletonRows rows={6} />
      </div>
    );
  const r = d.record;
  const rows: [string, ReactNode][] = [
    ['Roll number', r.rollNumber],
    ['Program', <Known key="p" value={d.program ? `${d.program.name} (${d.program.code})` : null} />],
    ['Department', <Known key="d" value={d.department?.name} />],
    ['Graduation year', <Known key="y" value={r.graduationYear} />],
    ['CGPA', <Known key="c" value={r.cgpa} />],
    ['Active backlogs', <Known key="b" value={r.activeBacklogs} />],
    ['Attendance', <Known key="a" value={r.attendancePercent === null ? null : Math.round(r.attendancePercent * 10) / 10} suffix="%" label="Not recorded" />],
    ['Status', <StatusBadge key="s" status={r.status} />],
    ['Placement', r.placementOptIn ? 'Opted in' : 'Opted out'],
  ];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        breadcrumb={breadcrumb}
        title={d.student.name}
        description={d.student.email}
        badge={r.verifiedAt ? <Badge tone="success">Verified {formatDate(r.verifiedAt)}</Badge> : <Badge tone="warning">Not verified</Badge>}
        actions={
          <>
            <Button icon={<PencilSimpleIcon size={15} />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            {!r.verifiedAt && (
              <Button variant="primary" icon={<SealCheckIcon size={15} />} onClick={() => setConfirmVerify(true)}>
                Verify record
              </Button>
            )}
          </>
        }
      />
      {r.gaps.length > 0 && (
        <Banner tone="warning" className="mb-6" title="This record has data gaps">
          Missing: {r.gaps.map((g) => FIELD_LABELS[g] ?? g).join(', ')}. Drive rules that need these values show this student as Needs data until they are filled in.
        </Banner>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden">
            <CardHeader title="Skill DNA readiness" description="Evidence from the student's learning record. Only verified and demonstrated skills count toward drive requirements." />
            {!d.skills.length ? (
              <CardBody>
                <EmptyState icon={<DnaIcon size={22} />} title="No skill evidence yet" description="Evidence appears when the student completes graded assessments, practice, reviewed projects or assignments." />
              </CardBody>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {d.skills.map((s) => (
                  <li key={s.slug} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-3 text-[13px]">
                    <span className="min-w-0">
                      <span className="block font-semibold">{s.name}</span>
                      <span className="block text-[12px] text-subtle">
                        {s.evidenceCount} evidence · {s.sources.join(', ')}
                        {s.lastEvidenceAt ? ` · ${timeAgo(s.lastEvidenceAt)}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <SkillStateBadge state={s.state} />
                      {s.verified && s.state !== 'verified' ? <ProvenanceTag kind="verified" /> : s.sources.length === 1 && s.sources[0] === 'self' ? <ProvenanceTag kind="self" /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Placement history" description="Drives this student was part of in your institution." />
            {!d.placementHistory.length ? (
              <CardBody>
                <p className="text-[13.5px] text-muted">Not part of any drive yet.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {d.placementHistory.map((h) => (
                  <li key={h.candidateId} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <Link to={`/app/campus/drives/${h.driveId}?tab=candidates`} className="text-[14px] font-semibold hover:text-accent-text hover:underline">
                        {h.driveTitle}
                      </Link>
                      <StageBadge stage={h.stage} />
                    </div>
                    {h.offerCtcText && <div className="mt-0.5 text-[12.5px] text-muted">Offer: {h.offerCtcText}</div>}
                    <ol className="mt-2 space-y-1 border-l border-border pl-3 text-[12px] text-subtle">
                      {h.events.map((e, i) => (
                        <li key={i}>
                          {STAGE_LABELS[e.toStage] ?? e.toStage} · {formatDateTime(e.createdAt)}
                          {e.actorKind === 'student' ? ' (by student)' : ''}
                          {e.note ? ` · ${e.note}` : ''}
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Correction requests" action={<CardAction to="/app/campus/students?tab=corrections">Review queue</CardAction>} />
            {!d.corrections.length ? (
              <CardBody>
                <p className="text-[13.5px] text-muted">No correction requests from this student.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-border border-t border-border text-[13px]">
                {d.corrections.map((x) => (
                  <li key={x.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <span>
                        {FIELD_LABELS[x.field] ?? x.field}: <span className="text-muted">{x.currentValue ?? 'Not recorded'}</span> to <span className="font-semibold">{x.proposedValue}</span>
                      </span>
                      <StatusBadge status={x.status} />
                    </div>
                    <p className="mt-1 text-muted">{x.reason}</p>
                    {x.reviewNote && <p className="mt-1 text-[12px] text-subtle">Review: {x.reviewNote}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Academic record" description={`Updated ${timeAgo(r.updatedAt)}`} />
            <CardBody>
              <dl className="divide-y divide-border text-[13.5px]">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                    <dt className="shrink-0 text-muted">{k}</dt>
                    <dd className="min-w-0 text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              {r.notes && <p className="mt-4 rounded-md bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">{r.notes}</p>}
            </CardBody>
          </Card>
        </aside>
      </div>
      {editing && <EditRecordDialog d={d} open onOpenChange={setEditing} />}
      <ConfirmDialog
        open={confirmVerify}
        onOpenChange={setConfirmVerify}
        title="Verify this record?"
        description={r.gaps.length ? `Missing values (${r.gaps.map((g) => FIELD_LABELS[g] ?? g).join(', ')}) stay unknown after verification. Verify only what you checked against official records.` : 'Verify only after checking the values against official records. This is recorded in the audit log.'}
        confirmLabel="Verify"
        loading={verify.isPending}
        onConfirm={() => verify.mutate()}
      />
    </div>
  );
}
