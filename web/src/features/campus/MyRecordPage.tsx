import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IdentificationCardIcon, PencilSimpleLineIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';
import { Badge, Banner, Button, Card, CardBody, CardHeader, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, Select, SkeletonRows, StatusBadge, Switch, Textarea } from '@/components/ui';
import { FIELD_LABELS, Known } from './shared';

type MyRecord = {
  id: string;
  orgName: string;
  rollNumber: string;
  programName: string | null;
  programCode: string | null;
  graduationYear: number | null;
  cgpa: number | null;
  activeBacklogs: number | null;
  attendancePercent: number | null;
  status: string;
  placementOptIn: boolean;
  verified: boolean;
  verifiedAt: string | null;
  updatedAt: string;
  gaps: string[];
  corrections: { id: string; field: string; fieldLabel: string; currentValue: string | null; proposedValue: string; reason: string; status: string; reviewNote: string | null; createdAt: string }[];
};
type Resp = { records: MyRecord[]; correctionFields: { value: string; label: string }[]; hasStudentMembership: boolean };

function CorrectionDialog({ record, fields, initialField, onClose }: { record: MyRecord; fields: Resp['correctionFields']; initialField?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [field, setField] = useState(initialField ?? fields[0]?.value ?? 'cgpa');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api.post('/campus/me/record/corrections', { recordId: record.id, field, proposedValue: value, reason }),
    onSuccess: () => {
      toast.success('Request sent to your placement office');
      qc.invalidateQueries({ queryKey: ['placements'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const f = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="Request a correction"
      description="Your placement office reviews the request. Your record changes only if they approve it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!value.trim() || reason.trim().length < 10}
            disabledReason={!value.trim() ? 'Enter the correct value' : 'Explain the correction in at least 10 characters'}
            onClick={() => m.mutate()}
          >
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What is wrong or missing?" error={f.field}>
          <Select value={field} onChange={(e) => setField(e.target.value)}>
            {fields.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Correct value" error={f.proposedValue} helper={field === 'program' ? 'Your program name or code.' : undefined}>
          <Input value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Why, and where can it be checked?" error={f.reason}>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: semester 5 grade card issued by the exam cell shows CGPA 7.6." />
        </Field>
      </div>
    </Dialog>
  );
}

function RecordCard({ r, fields }: { r: MyRecord; fields: Resp['correctionFields'] }) {
  const qc = useQueryClient();
  const [correcting, setCorrecting] = useState<string | null>(null);
  const optIn = useMutation({
    mutationFn: (v: boolean) => api.post(`/campus/me/record/${r.id}/opt-in`, { placementOptIn: v }),
    onSuccess: (_d, v) => {
      toast.success(v ? 'You are opted in for campus placements' : 'You are opted out of campus placements');
      qc.invalidateQueries({ queryKey: ['placements'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const gapField = (g: string) => (g === 'programId' ? 'program' : g);
  const rows: [string, string, ReactNode][] = [
    ['rollNumber', 'Roll number', r.rollNumber],
    ['program', 'Program', <Known key="p" value={r.programName ? `${r.programName} (${r.programCode})` : null} />],
    ['graduationYear', 'Graduation year', <Known key="y" value={r.graduationYear} />],
    ['cgpa', 'CGPA', <Known key="c" value={r.cgpa} />],
    ['activeBacklogs', 'Active backlogs', <Known key="b" value={r.activeBacklogs} />],
    ['attendancePercent', 'Attendance', <Known key="a" value={r.attendancePercent === null ? null : Math.round(r.attendancePercent * 10) / 10} suffix="%" label="Not recorded" />],
  ];
  const open = r.corrections.filter((x) => x.status === 'open');
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={r.orgName}
          description={`Updated ${timeAgo(r.updatedAt)}`}
          action={r.verified ? <Badge tone="success">Verified {r.verifiedAt ? formatDate(r.verifiedAt) : ''}</Badge> : <Badge tone="warning">Not verified yet</Badge>}
        />
        <CardBody className="space-y-4">
          {r.gaps.length > 0 && (
            <Banner tone="warning" title="Some information is missing">
              {r.gaps.map((g) => FIELD_LABELS[g] ?? g).join(', ')}. Drives that need it show "Needs data" for you, which never counts as ineligible. Request a correction so the placement office can fill it in.
            </Banner>
          )}
          <dl className="divide-y divide-border text-[13.5px]">
            {rows.map(([key, label, value]) => (
              <div key={key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <dt className="text-muted">{label}</dt>
                <dd className="flex items-center gap-2">
                  {value}
                  <Button size="sm" variant="ghost" onClick={() => setCorrecting(key)} aria-label={`Request a correction to ${label}`}>
                    Correct
                  </Button>
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted">Status</dt>
              <dd>
                <StatusBadge status={r.status} />
              </dd>
            </div>
          </dl>
          <div className="space-y-4 border-t border-border pt-4">
            <Switch
              checked={r.placementOptIn}
              disabled={optIn.isPending}
              onCheckedChange={(v) => optIn.mutate(v)}
              label="Take part in campus placements"
              description="When off, you are not invited to drives and they are not shown to you as eligible."
            />
            <Button icon={<PencilSimpleLineIcon size={15} />} onClick={() => setCorrecting(r.gaps[0] ? gapField(r.gaps[0]) : 'cgpa')}>
              Request a correction
            </Button>
          </div>
        </CardBody>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Correction requests" description={open.length ? `${open.length} waiting for review` : undefined} />
        {!r.corrections.length ? (
          <CardBody>
            <p className="text-[13.5px] text-muted">You have not requested any corrections.</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-border border-t border-border text-[13px]">
            {r.corrections.map((x) => (
              <li key={x.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {x.fieldLabel}: {x.currentValue ?? 'Not recorded'} to <span className="font-medium">{x.proposedValue}</span>
                  </span>
                  <StatusBadge status={x.status === 'open' ? 'pending' : x.status} />
                </div>
                <p className="mt-0.5 text-muted">{x.reason}</p>
                {x.reviewNote && <p className="mt-0.5 text-[12.5px]">Placement office: {x.reviewNote}</p>}
                <p className="mt-0.5 text-[12px] text-subtle">Sent {timeAgo(x.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {correcting && <CorrectionDialog record={r} fields={fields} initialField={correcting} onClose={() => setCorrecting(null)} />}
    </div>
  );
}

export default function MyRecordPage() {
  const q = useQuery({ queryKey: ['placements', 'record'], queryFn: () => api.get<Resp>('/campus/me/record') });
  const d = q.data;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={
          <Link to="/app/placements" className="hover:text-fg">
            Placements
          </Link>
        }
        title="My academic record"
        description="What your institution uses to check placement eligibility. Only you and your institution's campus staff can see it."
      />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !d ? (
        <SkeletonRows rows={5} />
      ) : !d.records.length ? (
        <EmptyState
          icon={<IdentificationCardIcon size={22} />}
          title="No academic record yet"
          description={
            d.hasStudentMembership
              ? 'Your placement office has not added your record yet. Until they do, drives show "Needs data" for you. Contact them to get it added.'
              : 'Records are kept by colleges for their students. Join your college on LearnSphere to see yours.'
          }
        />
      ) : (
        <div className="space-y-6">
          {d.records.map((r) => (
            <RecordCard key={r.id} r={r} fields={d.correctionFields} />
          ))}
        </div>
      )}
    </div>
  );
}
