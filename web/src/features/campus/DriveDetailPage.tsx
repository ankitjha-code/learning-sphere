import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Badge, Banner, Button, Card, CardAction, CardBody, CardHeader, ConfirmDialog, ErrorState, Field, PageHeader, SkeletonRows, StatusBadge, Tabs, Textarea } from '@/components/ui';
import { CAMPUS_KEY, DRIVE_STATUS_LABEL, FunnelBars } from './shared';
import { DriveForm, driveToForm, formToPayload, type DriveFormValue } from './DriveForm';
import { EligibilityTab } from './DriveEligibilityTab';
import { CandidatesTab, OutcomesTab } from './DriveCandidatesTab';
import { AssessmentTab } from './DriveAssessmentTab';
import { InterviewsTab } from './DriveInterviewsTab';
import { ReportTab } from './DriveReportTab';
import type { Drive, Funnel } from './types';

export type DriveDetail = { drive: Drive; assessment: { id: string; title: string; status: string } | null; funnel: Funnel; policy: { requireVerifiedRecordForPlacement: boolean } };

const NEXT: Record<string, { status: string; label: string; description: string; danger?: boolean }[]> = {
  draft: [
    { status: 'open', label: 'Open drive', description: 'Students can then be invited, and eligible students see the drive on their Placements page.' },
    { status: 'cancelled', label: 'Cancel drive', description: 'The drive is closed and cannot be reopened.', danger: true },
  ],
  open: [
    { status: 'in_progress', label: 'Close registration', description: 'Registration closes and the selection process continues. Students can no longer register.' },
    { status: 'cancelled', label: 'Cancel drive', description: 'Active candidates are notified that the drive was cancelled. This cannot be undone.', danger: true },
  ],
  in_progress: [
    { status: 'completed', label: 'Mark completed', description: 'Use this after all outcomes are recorded. Completed drives cannot be edited.' },
    { status: 'open', label: 'Reopen registration', description: 'Students can register again until the deadline.' },
    { status: 'cancelled', label: 'Cancel drive', description: 'Active candidates are notified that the drive was cancelled. This cannot be undone.', danger: true },
  ],
};

export function useDrive(id: string) {
  return useQuery({ queryKey: [...CAMPUS_KEY, 'drive', id], queryFn: () => api.get<DriveDetail>(`/campus/drives/${id}`) });
}

function DetailsTab({ d }: { d: DriveDetail }) {
  const qc = useQueryClient();
  const locked = d.drive.status === 'completed' || d.drive.status === 'cancelled';
  const m = useMutation({
    mutationFn: (v: DriveFormValue) => {
      const { eligibility: _e, ...rest } = formToPayload(v);
      return api.patch(`/campus/drives/${d.drive.id}`, rest);
    },
    onSuccess: () => {
      toast.success('Drive saved');
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const f = d.funnel;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        {locked && (
          <Banner tone="info" className="mb-4">
            This drive is {d.drive.status}, so its details are read-only.
          </Banner>
        )}
        <DriveForm initial={driveToForm(d.drive)} onSubmit={(v) => m.mutate(v)} submitting={m.isPending} error={m.error} submitLabel="Save details" locked={locked} showEligibility={false} />
      </div>
      <aside className="space-y-5">
        <Card>
          <CardHeader title="Funnel" description="Scaled to the number invited." action={<CardAction to="?tab=report">Report</CardAction>} />
          <CardBody>
            <FunnelBars funnel={f} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Assessment" action={<CardAction to="?tab=assessment">{d.assessment ? 'Manage' : 'Set up'}</CardAction>} />
          <CardBody>
            {d.assessment ? (
              <div className="flex items-start justify-between gap-3 text-[13px]">
                <span className="min-w-0 font-medium">{d.assessment.title}</span>
                <StatusBadge status={d.assessment.status} />
              </div>
            ) : (
              <p className="text-[13px] text-muted">No assessment linked yet. Create or link one from the Assessment tab.</p>
            )}
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

export default function DriveDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'details';
  const q = useDrive(id);
  const qc = useQueryClient();
  const [transition, setTransition] = useState<{ status: string; label: string; description: string; danger?: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const status = useMutation({
    mutationFn: () => api.post(`/campus/drives/${id}/status`, { status: transition!.status, reason: reason.trim() || undefined }),
    onSuccess: () => {
      toast.success(`Drive is now ${DRIVE_STATUS_LABEL[transition!.status].toLowerCase()}`);
      setTransition(null);
      setReason('');
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const breadcrumb = (
    <Link to="/app/campus/drives" className="hover:text-fg">
      Placement drives
    </Link>
  );
  if (q.error)
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Placement drive" breadcrumb={breadcrumb} />
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </div>
    );
  if (!q.data)
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Placement drive" breadcrumb={breadcrumb} />
        <SkeletonRows rows={6} />
      </div>
    );
  const d = q.data;
  const f = d.funnel;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        breadcrumb={breadcrumb}
        title={d.drive.title}
        description={`${d.drive.companyName} · ${d.drive.roleTitle}${d.drive.registrationDeadline ? ` · registration closes ${formatDateTime(d.drive.registrationDeadline)}` : ''}`}
        badge={<Badge tone={d.drive.status === 'open' ? 'info' : d.drive.status === 'completed' ? 'success' : 'neutral'}>{DRIVE_STATUS_LABEL[d.drive.status]}</Badge>}
        actions={(NEXT[d.drive.status] ?? []).map((t) => (
          <Button key={t.status} variant={t.status === 'open' && d.drive.status === 'draft' ? 'primary' : t.danger ? 'ghost' : 'secondary'} onClick={() => setTransition(t)}>
            {t.label}
          </Button>
        ))}
      />
      {d.policy.requireVerifiedRecordForPlacement && (
        <Banner tone="info" className="mb-4">
          Institution policy: students need a verified record. Unverified records show as Needs data.
        </Banner>
      )}
      <Tabs
        value={tab}
        onValueChange={(v) => setParams(v === 'details' ? {} : { tab: v })}
        tabs={[
          { value: 'details', label: 'Details' },
          { value: 'eligibility', label: 'Eligibility' },
          { value: 'candidates', label: 'Candidates', count: f.invited },
          { value: 'assessment', label: 'Assessment' },
          { value: 'interviews', label: 'Interviews', count: f.interviewed },
          { value: 'outcomes', label: 'Outcomes', count: f.offers },
          { value: 'report', label: 'Report' },
        ]}
        className="mb-4"
      />
      {tab === 'details' && <DetailsTab d={d} />}
      {tab === 'eligibility' && <EligibilityTab d={d} />}
      {tab === 'candidates' && <CandidatesTab d={d} />}
      {tab === 'assessment' && <AssessmentTab d={d} />}
      {tab === 'interviews' && <InterviewsTab d={d} />}
      {tab === 'outcomes' && <OutcomesTab d={d} />}
      {tab === 'report' && <ReportTab d={d} />}
      <ConfirmDialog
        open={!!transition}
        onOpenChange={(v) => !v && setTransition(null)}
        title={`${transition?.label ?? ''}?`}
        description={transition?.description ?? ''}
        confirmLabel={transition?.label ?? 'Confirm'}
        danger={transition?.danger}
        confirmText={transition?.status === 'cancelled' ? 'cancel' : undefined}
        loading={status.isPending}
        onConfirm={() => status.mutate()}
      >
        {transition?.status === 'cancelled' && (
          <Field label="Reason shared with candidates" optional>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
      </ConfirmDialog>
    </div>
  );
}
