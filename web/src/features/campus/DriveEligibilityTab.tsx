import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CaretDownIcon, CaretRightIcon, DownloadSimpleIcon, PaperPlaneTiltIcon, UserPlusIcon, CheckIcon, XIcon, QuestionIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { api, ApiError, errorMessage } from '@/lib/api';
import { Badge, Banner, Button, Card, CardBody, CardHeader, ConfirmDialog, Dialog, ErrorState, Field, SkeletonRows, Textarea } from '@/components/ui';
import { CAMPUS_KEY, downloadCsv, SkillStateBadge, StageBadge } from './shared';
import { RuleBuilder } from './RuleBuilder';
import type { DriveDetail } from './DriveDetailPage';
import type { EligibilityRules, EvalItem, RuleCheck } from './types';

type Preview = { counts: { total: number; eligible: number; notEligible: number; needsData: number; alreadyCandidates: number }; eligible: EvalItem[]; notEligible: EvalItem[]; needsData: EvalItem[]; explanation: string };

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function CheckLine({ c }: { c: RuleCheck }) {
  const Icon = c.status === 'met' ? CheckIcon : c.status === 'not_met' ? XIcon : QuestionIcon;
  return (
    <li className="flex items-start gap-1.5 text-[12px]">
      <Icon size={12} className={clsx('mt-0.5 shrink-0', c.status === 'met' ? 'text-success' : c.status === 'not_met' ? 'text-danger' : 'text-warning')} aria-label={c.status === 'met' ? 'Met' : c.status === 'not_met' ? 'Not met' : 'Needs data'} />
      <span className="text-muted">
        {c.detail}
        {c.skill && (
          <span className="ml-1 inline-flex align-middle">
            <SkillStateBadge state={c.skill.state} />
          </span>
        )}
      </span>
    </li>
  );
}

function StudentRow({ s, action }: { s: EvalItem; action?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-5 py-3">
      <div className="flex items-start gap-2.5">
        <button type="button" onClick={() => setOpen(!open)} className="mt-0.5 text-subtle hover:text-fg" aria-expanded={open} aria-label={open ? 'Hide rule details' : 'Show rule details'}>
          {open ? <CaretDownIcon size={14} /> : <CaretRightIcon size={14} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
            {s.recordId ? (
              <Link to={`/app/campus/students/${s.recordId}`} className="font-medium hover:underline">
                {s.name}
              </Link>
            ) : (
              <span className="font-medium">{s.name}</span>
            )}
            {s.candidateStage && <StageBadge stage={s.candidateStage} />}
          </div>
          <div className="text-[12px] text-subtle">{s.rollNumber ?? 'No record'}</div>
          {!open && s.eligible === false && <div className="mt-0.5 text-[12px] text-danger">{s.reasons.join(' ')}</div>}
          {!open && s.eligible === 'unknown' && <div className="mt-0.5 text-[12px] text-warning">Missing: {s.unknown.join(', ')}</div>}
          {open && (
            <ul className="mt-1 space-y-0.5">
              {s.checks.length ? s.checks.map((c) => <CheckLine key={c.key} c={c} />) : <li className="text-[12px] text-muted">No rules apply.</li>}
            </ul>
          )}
        </div>
        {action}
      </div>
    </li>
  );
}

function Column({ title, tone, items, description, renderAction }: { title: string; tone: 'success' | 'danger' | 'warning'; items: EvalItem[]; description: string; renderAction?: (s: EvalItem) => ReactNode }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader title={<span className="inline-flex items-center gap-2">{title} <Badge tone={tone}>{items.length}</Badge></span>} description={description} />
      {!items.length ? (
        <CardBody>
          <p className="text-[13px] text-subtle">Nobody in this group.</p>
        </CardBody>
      ) : (
        <ul className="max-h-[520px] divide-y divide-border overflow-y-auto border-t border-border">
          {items.map((s) => (
            <StudentRow key={s.userId} s={s} action={renderAction?.(s)} />
          ))}
        </ul>
      )}
    </Card>
  );
}

export function EligibilityTab({ d }: { d: DriveDetail }) {
  const qc = useQueryClient();
  const driveId = d.drive.id;
  const locked = d.drive.status === 'completed' || d.drive.status === 'cancelled';
  const canInvite = d.drive.status === 'open' || d.drive.status === 'in_progress';
  const [rules, setRules] = useState<EligibilityRules>(d.drive.eligibility);
  const dirty = JSON.stringify(rules) !== JSON.stringify(d.drive.eligibility);
  const debounced = useDebounced(rules, 500);
  const preview = useQuery({
    queryKey: [...CAMPUS_KEY, 'drive', driveId, 'preview', debounced],
    queryFn: () => api.post<Preview>(`/campus/drives/${driveId}/eligibility/preview`, { rules: debounced }),
    placeholderData: (prev) => prev,
  });
  const save = useMutation({
    mutationFn: () => api.patch(`/campus/drives/${driveId}`, { eligibility: rules }),
    onSuccess: () => {
      toast.success('Eligibility rules saved');
      qc.invalidateQueries({ queryKey: [...CAMPUS_KEY, 'drive', driveId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [confirmInvite, setConfirmInvite] = useState(false);
  const invite = useMutation({
    mutationFn: () => api.post<{ invited: number; skipped: { alreadyCandidates: number; notEligible: number; needsData: number } }>(`/campus/drives/${driveId}/invite`, {}),
    onSuccess: (r) => {
      toast.success(`${r.invited} student${r.invited === 1 ? '' : 's'} invited and notified`);
      setConfirmInvite(false);
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [including, setIncluding] = useState<EvalItem | null>(null);
  const [reason, setReason] = useState('');
  const include = useMutation({
    mutationFn: () => api.post(`/campus/drives/${driveId}/include`, { userId: including!.userId, reason }),
    onSuccess: () => {
      toast.success(`${including!.name} included. The reason was recorded in the audit log.`);
      setIncluding(null);
      setReason('');
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const p = preview.data;
  const newEligible = p ? p.eligible.filter((s) => !s.candidateStage).length : 0;
  const inviteReason = !canInvite ? 'Open the drive before inviting students' : dirty ? 'Save the rules first, so invitations use them' : !newEligible ? 'No eligible students left to invite' : undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader title="Rules" description="Changes preview live. Save to apply them to invitations." />
          <CardBody className="space-y-4">
            <RuleBuilder value={rules} onChange={setRules} disabled={locked} />
            {!locked && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button variant="primary" loading={save.isPending} disabled={!dirty} disabledReason="No unsaved changes" onClick={() => save.mutate()}>
                  Save rules
                </Button>
                {dirty && <Button onClick={() => setRules(d.drive.eligibility)}>Discard changes</Button>}
              </div>
            )}
          </CardBody>
        </Card>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={<PaperPlaneTiltIcon size={15} />} disabled={!!inviteReason} disabledReason={inviteReason} onClick={() => setConfirmInvite(true)}>
              Invite {newEligible} eligible
            </Button>
            <Button icon={<DownloadSimpleIcon size={15} />} onClick={() => downloadCsv(`/campus/drives/${driveId}/eligible.csv`, `eligibility-${d.drive.title}.csv`)}>
              Export list
            </Button>
            {preview.isFetching && <span className="text-[12px] text-subtle">Updating preview...</span>}
          </div>
          {p && <p className="text-[13px] leading-relaxed text-muted">{p.explanation}</p>}
          {preview.error ? (
            <ErrorState error={preview.error} onRetry={() => preview.refetch()} />
          ) : !p ? (
            <SkeletonRows rows={5} />
          ) : p.counts.total === 0 ? (
            <Banner tone="info" title="No student members yet">
              Invite students from People & roles and add their records, then come back to preview eligibility.
            </Banner>
          ) : (
            <div className="space-y-4">
              <Column title="Eligible" tone="success" items={p.eligible} description="Meet every rule with known data." />
              <Column title="Not eligible" tone="danger" items={p.notEligible} description="Known data fails at least one rule. Reasons shown." />
              <Column
                title="Needs data"
                tone="warning"
                items={p.needsData}
                description="A rule could not be checked. This is not a judgement; fix the record or include with a reason."
                renderAction={(s) =>
                  !s.candidateStage && canInvite ? (
                    <Button size="sm" variant="ghost" icon={<UserPlusIcon size={13} />} onClick={() => setIncluding(s)}>
                      Include
                    </Button>
                  ) : null
                }
              />
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmInvite}
        onOpenChange={setConfirmInvite}
        title={`Invite ${newEligible} eligible student${newEligible === 1 ? '' : 's'}?`}
        description="Each student gets an in-app notification (and email if configured) and can register or decline before the deadline. Eligibility is checked again on the server; students already in the drive are skipped."
        confirmLabel="Send invitations"
        loading={invite.isPending}
        onConfirm={() => invite.mutate()}
      />
      <IncludeDialog student={including} reason={reason} setReason={setReason} onClose={() => setIncluding(null)} onConfirm={() => include.mutate()} pending={include.isPending} error={include.error} />
    </div>
  );
}

function IncludeDialog({ student, reason, setReason, onClose, onConfirm, pending, error }: { student: EvalItem | null; reason: string; setReason: (v: string) => void; onClose: () => void; onConfirm: () => void; pending: boolean; error: unknown }) {
  const f = error instanceof ApiError ? error.fields : {};
  return (
    <Dialog
      open={!!student}
      onOpenChange={(v) => !v && onClose()}
      title={`Include ${student?.name ?? ''} manually`}
      description="This student's eligibility could not be checked because data is missing. Including them is your decision; the reason is stored with the candidate and in the audit log."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={pending} disabled={reason.trim().length < 10} disabledReason="Write a reason of at least 10 characters" onClick={onConfirm}>
            Include and invite
          </Button>
        </>
      }
    >
      {student && (
        <div className="space-y-3">
          <Banner tone="warning">Missing: {student.unknown.join(', ')}</Banner>
          <Field label="Reason" error={f.reason}>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: CGPA confirmed on the paper grade card; exam cell update pending." autoFocus />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
