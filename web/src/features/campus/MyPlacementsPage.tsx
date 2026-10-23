import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseIcon, CalendarIcon, CheckIcon, IdentificationCardIcon, QuestionIcon, VideoCameraIcon, XIcon, ExamIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Banner, Button, ButtonLink, Card, CardBody, ConfirmDialog, EmptyState, ErrorState, Field, PageHeader, SkeletonRows, Textarea } from '@/components/ui';
import { EligibilityBadge, SkillStateBadge, StageBadge, STAGE_LABELS } from './shared';
import type { Eligibility } from './types';

type MyDrive = {
  drive: {
    id: string;
    orgName: string;
    title: string;
    companyName: string;
    roleTitle: string;
    description: string | null;
    ctcText: string | null;
    location: string | null;
    registrationDeadline: string | null;
    status: string;
    stages: string[];
  };
  eligibility: Eligibility;
  candidate: {
    id: string;
    stage: string;
    stageLabel: string;
    offerCtcText: string | null;
    updatedAt: string;
    timeline: { toStage: string; label: string; at: string }[];
    interviews: { id: string; title: string; kind: string; scheduledAt: string; durationMinutes: number; meetingUrl: string | null; meetingProvider: string | null; status: string; interviewers: string[] }[];
  } | null;
  assessment: { id: string; title: string; inviteStatus: string; published: boolean } | null;
  actions: { canRegister: boolean; registerBlockedReason: string | null; canDecline: boolean; canWithdraw: boolean };
};
type Resp = { drives: MyDrive[]; needsDataCount: number; hasStudentMembership: boolean };

const PATH = ['invited', 'registered', 'assessment', 'interview', 'offer', 'placed'];

function StageTrack({ stage, stages }: { stage: string; stages: string[] }) {
  const steps = PATH.filter((s) => s === 'invited' || s === 'placed' || stages.includes(s));
  const idx = steps.indexOf(stage);
  const closed = idx < 0;
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium" aria-label="Your progress">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span
            className={clsx('inline-flex h-6 items-center rounded-full px-2.5', !closed && i < idx ? 'bg-success-soft text-success' : !closed && i === idx ? 'bg-accent text-on-accent' : 'bg-surface-2 text-subtle')}
            aria-current={i === idx ? 'step' : undefined}
          >
            {STAGE_LABELS[s]}
          </span>
          {i < steps.length - 1 && <span className={clsx('h-px w-3', !closed && i < idx ? 'bg-success' : 'bg-border-strong')} aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function DriveCard({ item }: { item: MyDrive }) {
  const qc = useQueryClient();
  const [showRules, setShowRules] = useState(!item.candidate);
  const [confirm, setConfirm] = useState<'decline' | 'withdraw' | null>(null);
  const [reason, setReason] = useState('');
  const act = useMutation({
    mutationFn: (action: 'register' | 'decline' | 'withdraw') => api.post(`/campus/me/drives/${item.drive.id}/${action}`, action === 'register' ? {} : { reason: reason.trim() || undefined }),
    onSuccess: (_r, action) => {
      toast.success(action === 'register' ? 'You are registered. Watch your notifications for next steps.' : action === 'decline' ? 'Declined. The placement office can see your decision.' : 'You have withdrawn from this drive.');
      setConfirm(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['placements'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const { drive: d, candidate: c, eligibility: e, actions } = item;
  const upcoming = c?.interviews.filter((i) => i.status === 'scheduled') ?? [];
  return (
    <Card>
      <CardBody className="space-y-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-4">
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text sm:flex">
              <BriefcaseIcon size={20} weight="duotone" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{d.title}</h2>
              <div className="mt-0.5 text-[13px] text-muted">
                {d.companyName} · {d.roleTitle}
                {d.location ? ` · ${d.location}` : ''}
              </div>
              <div className="text-[12.5px] text-subtle">
                {d.ctcText ? `${d.ctcText} · ` : ''}
                {d.registrationDeadline ? `Register by ${formatDateTime(d.registrationDeadline)}` : 'No registration deadline'} · {d.orgName}
              </div>
            </div>
          </div>
          {c ? <StageBadge stage={c.stage} /> : <EligibilityBadge value={e.eligible} />}
        </div>
        {d.description && <p className="text-[13.5px] leading-relaxed text-muted">{d.description}</p>}
        {d.status === 'cancelled' && <Banner tone="warning">This drive was cancelled by the placement office.</Banner>}
        {c && <StageTrack stage={c.stage} stages={d.stages} />}
        {c?.offerCtcText && (c.stage === 'offer' || c.stage === 'placed') && (
          <p className="text-[13px]">
            Offer: <span className="font-medium">{c.offerCtcText}</span>
          </p>
        )}

        {item.assessment && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-md bg-surface-2 px-4 py-3 text-[13px]">
            <ExamIcon size={15} className="text-subtle" aria-hidden />
            <span className="min-w-0 flex-1">
              {item.assessment.title}: {item.assessment.inviteStatus === 'completed' ? 'completed' : item.assessment.published ? 'ready to take' : 'opens once the placement office publishes it'}
            </span>
            {item.assessment.published && item.assessment.inviteStatus !== 'completed' && (
              <ButtonLink to={`/app/assessments/${item.assessment.id}`} size="sm" variant="primary">
                Open assessment
              </ButtonLink>
            )}
          </div>
        )}

        {upcoming.map((iv) => (
          <div key={iv.id} className="rounded-md bg-surface-2 px-4 py-3 text-[13px]">
            <div className="flex items-center gap-1.5 font-medium">
              <CalendarIcon size={14} aria-hidden /> {iv.title}
            </div>
            <div className="text-muted">
              {formatDateTime(iv.scheduledAt)} · {iv.durationMinutes} min{iv.interviewers.length ? ` · with ${iv.interviewers.join(', ')}` : ''}
            </div>
            {iv.meetingUrl && (
              <a href={iv.meetingUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-accent-text hover:underline">
                <VideoCameraIcon size={13} aria-hidden /> Join meeting
              </a>
            )}
            {iv.meetingProvider === 'jitsi' && <p className="mt-0.5 text-[12px] text-subtle">Opens in your browser with Jitsi Meet; no account is needed to join.</p>}
          </div>
        ))}

        {showRules && (
          <ul className="space-y-1.5 rounded-md bg-surface-2 px-4 py-3">
            {e.checks.length ? (
              e.checks.map((ch) => {
                const Icon = ch.status === 'met' ? CheckIcon : ch.status === 'not_met' ? XIcon : QuestionIcon;
                return (
                  <li key={ch.key} className="flex items-start gap-1.5 text-[13px]">
                    <Icon
                      size={14}
                      className={clsx('mt-0.5 shrink-0', ch.status === 'met' ? 'text-success' : ch.status === 'not_met' ? 'text-danger' : 'text-warning')}
                      aria-label={ch.status === 'met' ? 'Met' : ch.status === 'not_met' ? 'Not met' : 'Needs data'}
                    />
                    <span className="text-muted">
                      {ch.detail} {ch.skill && <SkillStateBadge state={ch.skill.state} />}
                    </span>
                  </li>
                );
              })
            ) : (
              <li className="text-[13px] text-muted">This drive has no eligibility rules.</li>
            )}
            {e.eligible === 'unknown' && (
              <li className="text-[12.5px]">
                <Link to="/app/placements/record" className="text-accent-text hover:underline">
                  Check your record and request a correction
                </Link>
              </li>
            )}
          </ul>
        )}

        <div className="-mx-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border px-5 pt-4">
          <button
            type="button"
            className="-ml-2 inline-flex h-8 items-center rounded-md px-2 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-soft"
            onClick={() => setShowRules(!showRules)}
            aria-expanded={showRules}
          >
            {showRules ? 'Hide eligibility details' : 'Show eligibility details'}
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {(actions.canRegister || (actions.registerBlockedReason && (!c || c.stage === 'invited'))) && (
              <Button variant="primary" loading={act.isPending && act.variables === 'register'} disabled={!actions.canRegister} disabledReason={actions.registerBlockedReason ?? undefined} onClick={() => act.mutate('register')}>
                Register
              </Button>
            )}
            {actions.canDecline && <Button onClick={() => setConfirm('decline')}>{c?.stage === 'offer' ? 'Decline offer' : 'Decline invitation'}</Button>}
            {actions.canWithdraw && <Button onClick={() => setConfirm('withdraw')}>Withdraw</Button>}
          </div>
        </div>
      </CardBody>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm === 'withdraw' ? 'Withdraw from this drive?' : c?.stage === 'offer' ? 'Decline this offer?' : 'Decline this invitation?'}
        description="This cannot be undone from your side. Talk to your placement office if you change your mind."
        confirmLabel={confirm === 'withdraw' ? 'Withdraw' : 'Decline'}
        danger
        loading={act.isPending}
        onConfirm={() => act.mutate(confirm!)}
      >
        <Field label="Reason for the placement office" optional>
          <Textarea rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}

export default function MyPlacementsPage() {
  const q = useQuery({ queryKey: ['placements', 'drives'], queryFn: () => api.get<Resp>('/campus/me/drives') });
  const d = q.data;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Placements"
        description="Campus placement drives you are invited to or eligible for, your stage in each, and interview details."
        actions={
          <ButtonLink to="/app/placements/record" icon={<IdentificationCardIcon size={15} />}>
            My academic record
          </ButtonLink>
        }
      />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !d ? (
        <SkeletonRows rows={4} />
      ) : !d.hasStudentMembership ? (
        <EmptyState
          icon={<BriefcaseIcon size={22} />}
          title="Campus placements need a college membership"
          description="When your college invites you as a student, its placement drives appear here. You can still use the job board in Career."
          action={<ButtonLink to="/app/jobs">Open the job board</ButtonLink>}
        />
      ) : (
        <div className="space-y-4">
          {d.needsDataCount > 0 && (
            <Banner
              tone="warning"
              title={`${d.needsDataCount} open drive${d.needsDataCount === 1 ? '' : 's'} could not check your eligibility`}
              action={
                <ButtonLink to="/app/placements/record" size="sm">
                  Review record
                </ButtonLink>
              }
            >
              Some information those drives need is missing from your academic record. Missing data never counts against you, but it has to be filled in before you can register.
            </Banner>
          )}
          {!d.drives.length ? (
            <EmptyState icon={<BriefcaseIcon size={22} />} title="No drives for you right now" description="When your placement office opens a drive you are eligible for, or invites you, it shows up here and you get a notification." />
          ) : (
            d.drives.map((item) => <DriveCard key={item.drive.id} item={item} />)
          )}
        </div>
      )}
    </div>
  );
}
