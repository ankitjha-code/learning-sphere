import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExamIcon, LinkBreakIcon, PaperPlaneTiltIcon, FunnelIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { fromLocalInput } from '@/lib/format';
import { Badge, Banner, Button, ButtonLink, Card, CardBody, CardHeader, ConfirmDialog, ErrorState, Field, Input, Select, SkeletonRows, StatusBadge } from '@/components/ui';
import { CAMPUS_KEY } from './shared';
import type { DriveDetail } from './DriveDetailPage';

type AssessmentInfo = {
  assessment: { id: string; title: string; status: string; mode: string; publishedAt: string | null } | null;
  stats: { invited: number; started: number; submitted: number; finalScores: number; registeredNotInvited: number } | null;
  options: { id: string; title: string; status: string; driveId: string | null }[];
  canManage: boolean;
};
type ShortlistResult = {
  applied: boolean;
  threshold: number;
  toStage: string;
  wouldMove: { candidateId: string; name: string; percent: number }[];
  below: { candidateId: string; name: string; percent: number }[];
  noFinalScore: { candidateId: string; name: string; status: string }[];
  note: string;
};

function Shortlist({ driveId }: { driveId: string }) {
  const qc = useQueryClient();
  const [threshold, setThreshold] = useState('60');
  const [confirm, setConfirm] = useState(false);
  const preview = useMutation({ mutationFn: () => api.post<ShortlistResult>(`/campus/drives/${driveId}/shortlist`, { threshold: Number(threshold), apply: false }), onError: (e) => toast.error(errorMessage(e)) });
  const apply = useMutation({
    mutationFn: () => api.post<ShortlistResult>(`/campus/drives/${driveId}/shortlist`, { threshold: Number(threshold), apply: true }),
    onSuccess: (r) => {
      toast.success(`${r.wouldMove.length} candidate${r.wouldMove.length === 1 ? '' : 's'} moved to interview`);
      setConfirm(false);
      preview.reset();
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const p = preview.data;
  const valid = threshold !== '' && Number(threshold) >= 0 && Number(threshold) <= 100;
  return (
    <Card>
      <CardHeader title="Shortlist by score" description="Moves candidates in the assessment stage with a final score at or above the threshold to the interview stage. Nobody is rejected automatically." />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Threshold (%)">
            <Input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => {
                setThreshold(e.target.value);
                preview.reset();
              }}
              className="w-28"
            />
          </Field>
          <Button icon={<FunnelIcon size={14} />} loading={preview.isPending} disabled={!valid} disabledReason="Enter a percentage between 0 and 100" onClick={() => preview.mutate()}>
            Show who would move
          </Button>
        </div>
        {p && (
          <div className="space-y-2 text-[13px]">
            <div>
              <span className="font-medium">Would move to interview ({p.wouldMove.length}):</span> {p.wouldMove.length ? p.wouldMove.map((w) => `${w.name} (${w.percent}%)`).join(', ') : <span className="text-muted">nobody</span>}
            </div>
            <div className="text-muted">
              Stay in assessment, below threshold ({p.below.length}): {p.below.map((w) => `${w.name} (${w.percent}%)`).join(', ') || 'nobody'}
            </div>
            <div className="text-muted">
              Stay in assessment, no final score yet ({p.noFinalScore.length}): {p.noFinalScore.map((w) => w.name).join(', ') || 'nobody'}
            </div>
            <p className="text-[12px] text-subtle">{p.note}</p>
            <Button variant="primary" disabled={!p.wouldMove.length} disabledReason="Nobody meets the threshold" onClick={() => setConfirm(true)}>
              Move {p.wouldMove.length} to interview
            </Button>
          </div>
        )}
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={`Move ${p?.wouldMove.length ?? 0} candidates to interview?`}
          description="Each student is notified. Candidates below the threshold stay where they are."
          confirmLabel="Move candidates"
          loading={apply.isPending}
          onConfirm={() => apply.mutate()}
        />
      </CardBody>
    </Card>
  );
}

export function AssessmentTab({ d }: { d: DriveDetail }) {
  const qc = useQueryClient();
  const driveId = d.drive.id;
  const q = useQuery({ queryKey: [...CAMPUS_KEY, 'drive', driveId, 'assessment'], queryFn: () => api.get<AssessmentInfo>(`/campus/drives/${driveId}/assessment`) });
  const [title, setTitle] = useState(`${d.drive.companyName} ${d.drive.roleTitle} screening`);
  const [pick, setPick] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: CAMPUS_KEY });
  const link = useMutation({
    mutationFn: (payload: { title: string } | { assessmentId: string }) => api.post<{ assessmentId: string }>(`/campus/drives/${driveId}/assessment`, payload),
    onSuccess: () => {
      toast.success('Assessment linked to this drive');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const unlink = useMutation({
    mutationFn: () => api.del(`/campus/drives/${driveId}/assessment`),
    onSuccess: () => {
      toast.success('Assessment unlinked. Invitations and attempts are kept on the assessment.');
      setConfirmUnlink(false);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const invite = useMutation({
    mutationFn: () => api.post<{ invited: number; alreadyInvited: number; moved: number; warning: string | null }>(`/campus/drives/${driveId}/assessment/invite`, { dueAt: fromLocalInput(dueAt) }),
    onSuccess: (r) => {
      toast.success(`${r.invited} invited${r.alreadyInvited ? `, ${r.alreadyInvited} already invited` : ''}. ${r.moved} moved to the assessment stage.`);
      if (r.warning) toast.warning(r.warning);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = link.error instanceof ApiError ? link.error.fields : {};
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <SkeletonRows rows={4} />;
  const { assessment, stats, options, canManage } = q.data;

  if (!assessment)
    return (
      <div className="space-y-4">
        {!canManage && <Banner tone="warning">Linking and creating placement assessments needs the Placement officer or Organization admin role.</Banner>}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col">
            <CardHeader title="Create a placement assessment" description="Creates a draft assessment for this drive. Add questions and publish it in the assessment editor." />
            <CardBody className="flex flex-1 flex-col gap-4">
              <Field label="Title" error={fields.title}>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <div className="mt-auto">
                <Button
                  variant="primary"
                  icon={<ExamIcon size={15} />}
                  loading={link.isPending}
                  disabled={!canManage || title.trim().length < 3}
                  disabledReason={!canManage ? 'Needs the Placement officer role' : 'Enter a title'}
                  onClick={() => link.mutate({ title })}
                >
                  Create and link
                </Button>
              </div>
            </CardBody>
          </Card>
          <Card className="flex flex-col">
            <CardHeader title="Or link an existing one" description="Placement assessments in your institution that are not linked to another drive." />
            <CardBody className="flex flex-1 flex-col gap-4">
              <Field label="Assessment">
                <Select value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">{options.length ? 'Choose an assessment' : 'No unlinked placement assessments'}</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title} ({o.status})
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="mt-auto">
                <Button loading={link.isPending} disabled={!canManage || !pick} disabledReason={!canManage ? 'Needs the Placement officer role' : 'Choose an assessment'} onClick={() => link.mutate({ assessmentId: pick })}>
                  Link assessment
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              {assessment.title} <StatusBadge status={assessment.status} />
            </span>
          }
          description="Placement assessment linked to this drive."
          action={
            <div className="flex gap-2">
              <ButtonLink to={`/app/campus/assessments/${assessment.id}`} size="sm" variant="primary">
                Open in editor
              </ButtonLink>
              {canManage && (
                <Button size="sm" variant="ghost" icon={<LinkBreakIcon size={14} />} onClick={() => setConfirmUnlink(true)}>
                  Unlink
                </Button>
              )}
            </div>
          }
        />
        <CardBody className="space-y-4">
          {assessment.status !== 'published' && (
            <Banner tone="warning" title="Not published yet">
              Add questions and publish the assessment in the editor. Invited candidates can start only after it is published.
            </Banner>
          )}
          {stats && (
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-4">
              {(
                [
                  ['Invited', stats.invited, null],
                  ['Started', stats.started, null],
                  ['Submitted', stats.submitted, null],
                  ['Final scores', stats.finalScores, 'Graded or released'],
                ] as const
              ).map(([label, value, hint]) => (
                <div key={label} className="bg-surface-2 px-4 py-3">
                  <dt className="text-[12.5px] font-medium text-muted">{label}</dt>
                  <dd className="mt-1 font-display text-[22px] font-semibold leading-7 tabular-nums">{value}</dd>
                  {hint && <dd className="text-[12px] text-subtle">{hint}</dd>}
                </div>
              ))}
            </dl>
          )}
          <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <Field label="Complete by" optional>
              <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </Field>
            <Button
              icon={<PaperPlaneTiltIcon size={15} />}
              loading={invite.isPending}
              disabled={!canManage || !stats?.registeredNotInvited}
              disabledReason={!canManage ? 'Needs the Placement officer role' : 'No registered candidates waiting for an invitation'}
              onClick={() => invite.mutate()}
            >
              Invite {stats?.registeredNotInvited ?? 0} registered candidate{stats?.registeredNotInvited === 1 ? '' : 's'}
            </Button>
            {stats && stats.registeredNotInvited === 0 && <Badge>All registered candidates are invited</Badge>}
          </div>
        </CardBody>
      </Card>
      <Shortlist driveId={driveId} />
      <ConfirmDialog
        open={confirmUnlink}
        onOpenChange={setConfirmUnlink}
        title="Unlink this assessment?"
        description="Scores stop showing on this drive. The assessment, its invitations and attempts are not deleted."
        confirmLabel="Unlink"
        danger
        loading={unlink.isPending}
        onConfirm={() => unlink.mutate()}
      />
    </div>
  );
}
