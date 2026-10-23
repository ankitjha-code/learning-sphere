import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowCounterClockwiseIcon, ChatsCircleIcon, EyeIcon, FlagIcon, LockSimpleIcon, ProhibitIcon, ScalesIcon, SealCheckIcon, UserSwitchIcon, UsersThreeIcon, PlayIcon, PlusIcon, CheckCircleIcon, InfoIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDateTime, fromLocalInput, toLocalInput, timeAgo } from '@/lib/format';
import {
  Badge,
  Banner,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Menu,
  Segmented,
  Select,
  SkeletonRows,
  StatTile,
  Switch,
  Textarea,
} from '@/components/ui';
import { RubricTable, TABLE_WRAP, THEAD, TH, TR, TD, type RubricCriterion, type RubricScore } from './shared';

type Flag = { kind: 'outlier' | 'short' | 'copied' | 'student_flag'; text: string };
type Settings = {
  exists: boolean;
  enabled: boolean;
  reviewsPerSubmission: number;
  openMode: 'manual' | 'auto';
  autoOpenHoursAfterDue: number | null;
  closesAt: string | null;
  minCommentLength: number;
  peerWeightPercent: number;
  outlierThresholdPercent: number;
  state: 'not_open' | 'open';
  openedAt: string | null;
  allocatedAt: string | null;
  allocationNote: { submitters: number; reviewers: number; target: number; shortfalls: { ownerKey: string; received: number }[]; message: string | null; lateAdded?: number } | null;
  releasedAt: string | null;
  releasedAutomatically: boolean;
};
type Review = {
  id: string;
  reviewer: { id: string; name: string };
  reviewee: { ownerKey: string; name: string };
  status: 'assigned' | 'draft' | 'submitted';
  score: number | null;
  comment: string | null;
  rubricScores: RubricScore[];
  savedAt: string | null;
  submittedAt: string | null;
  reopenedAt: string | null;
  lateAllocation: boolean;
  excluded: { at: string; reason: string | null; byName: string } | null;
  helpfulness: number | null;
  studentFlag: { at: string; reason: string | null } | null;
  flags: Flag[];
};
type PeerData = {
  assignment: { id: string; title: string; status: 'draft' | 'published' | 'closed'; dueAt: string; maxPoints: number; collaboration: string };
  settings: Settings;
  window: { phase: 'disabled' | 'not_open' | 'open' | 'closed'; opensAt: string | null; closesAt: string | null; releasedAt: string | null; feedbackVisible: boolean };
  rubric: RubricCriterion[];
  canEnable: { ok: boolean; reason: string | null };
  openBlock: string | null;
  allocation: { pending: boolean; unallocated: { ownerKey: string; name: string; submittedAt: string | null }[] };
  reviewers: { userId: string; name: string; assigned: number; submitted: number; drafts: number }[];
  submissions: {
    ownerKey: string;
    submissionId: string;
    name: string;
    isTeam: boolean;
    assigned: number;
    received: number;
    medianByCriterion: Record<string, number | null>;
    medianScore: number | null;
    allocated: boolean;
    instructor: { evaluationId: string; rawScore: number; finalScore: number; released: boolean; peerApplied: boolean } | null;
  }[];
  reviews: Review[];
  students: { userId: string; name: string }[];
  teams: { id: string; name: string; memberIds: string[] }[];
  counts: { reviews: number; submitted: number; flagged: number; excluded: number; submissions: number };
};

const FLAG_LABEL: Record<Flag['kind'], string> = { outlier: 'Outlier score', short: 'Low effort: short', copied: 'Low effort: copied', student_flag: 'Flagged by student' };

type Form = { enabled: boolean; reviewsPerSubmission: string; openMode: 'manual' | 'auto'; autoOpenHoursAfterDue: string; closesAt: string; minCommentLength: string; peerWeightPercent: string; outlierThresholdPercent: string };

function toForm(s: Settings, dueAt: string): Form {
  const defaultClose = new Date(new Date(dueAt).getTime() + 4 * 86400_000);
  return {
    enabled: s.enabled,
    reviewsPerSubmission: String(s.reviewsPerSubmission),
    openMode: s.openMode,
    autoOpenHoursAfterDue: s.autoOpenHoursAfterDue === null ? '24' : String(s.autoOpenHoursAfterDue),
    closesAt: toLocalInput(s.closesAt ?? defaultClose.toISOString()),
    minCommentLength: String(s.minCommentLength),
    peerWeightPercent: String(s.peerWeightPercent),
    outlierThresholdPercent: String(s.outlierThresholdPercent),
  };
}

function toPayload(f: Form) {
  return {
    enabled: f.enabled,
    reviewsPerSubmission: Number(f.reviewsPerSubmission),
    openMode: f.openMode,
    autoOpenHoursAfterDue: f.openMode === 'auto' ? Number(f.autoOpenHoursAfterDue) || 0 : null,
    closesAt: fromLocalInput(f.closesAt),
    minCommentLength: Number(f.minCommentLength) || 0,
    peerWeightPercent: Number(f.peerWeightPercent) || 0,
    outlierThresholdPercent: Number(f.outlierThresholdPercent) || 0,
  };
}

function PhaseBadge({ d }: { d: PeerData }) {
  if (d.window.phase === 'disabled') return <Badge>Off</Badge>;
  if (d.window.phase === 'not_open') return <Badge tone="info">{d.settings.openMode === 'auto' ? 'Scheduled' : 'Not open'}</Badge>;
  if (d.window.phase === 'open') return d.window.releasedAt ? <Badge tone="success">Open, feedback released</Badge> : <Badge tone="success">Open</Badge>;
  return <Badge>Closed{d.window.releasedAt ? ', feedback released' : ''}</Badge>;
}

// ---------- Settings ----------

function SettingsCard({ d }: { d: PeerData }) {
  const qc = useQueryClient();
  const initial = useMemo(() => toForm(d.settings, d.assignment.dueAt), [d.settings, d.assignment.dueAt]);
  const [f, setF] = useState<Form>(initial);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const open = d.settings.state === 'open';
  const dirty = JSON.stringify(toPayload(f)) !== JSON.stringify(toPayload(initial)) || !d.settings.exists;
  const save = useMutation({
    mutationFn: () => api.patch(`/teach/assignments/${d.assignment.id}/peer`, toPayload(f)),
    onSuccess: () => {
      toast.success('Peer review settings saved');
      qc.invalidateQueries({ queryKey: ['teach', 'assignment', d.assignment.id, 'peer'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = save.error instanceof ApiError ? save.error.fields : {};
  const lockedReason = 'Locked because the review window is open';
  const weight = Number(f.peerWeightPercent) || 0;
  return (
    <Card>
      <CardHeader title="Settings" description="Students review each other’s submitted work with this assignment’s rubric. Reviews are always anonymous to students; you see every name." />
      <CardBody className="space-y-4">
        {!d.canEnable.ok && <Banner tone="warning">{d.canEnable.reason}</Banner>}
        <Switch
          checked={f.enabled}
          onCheckedChange={(v) => set('enabled', v)}
          disabled={(open && f.enabled) || (!d.canEnable.ok && !f.enabled)}
          label="Use peer review for this assignment"
          description={open ? 'The review window is open, so peer review stays on.' : 'Nothing is sent to students until the review window opens.'}
        />
        {f.enabled && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reviews per submission" helper="Each student also writes this many reviews when enough classmates submit." error={fields.reviewsPerSubmission}>
                <Select value={f.reviewsPerSubmission} onChange={(e) => set('reviewsPerSubmission', e.target.value)} disabled={open} title={open ? lockedReason : undefined}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Minimum written comment (characters)" helper="A written comment is required. Per-criterion comments are optional." error={fields.minCommentLength}>
                <Input type="number" min={20} max={2000} value={f.minCommentLength} onChange={(e) => set('minCommentLength', e.target.value)} />
              </Field>
            </div>
            <div className="space-y-2">
              <div className="text-[13px] font-medium">Review window opens</div>
              <Segmented
                label="How the review window opens"
                value={f.openMode}
                onChange={(v) => !open && set('openMode', v)}
                options={[
                  { value: 'manual', label: 'When I open it' },
                  { value: 'auto', label: 'Automatically after the due date' },
                ]}
              />
              {f.openMode === 'auto' && (
                <Field label="Hours after the due date" error={fields.autoOpenHoursAfterDue} helper={`Opens ${formatDateTime(new Date(new Date(d.assignment.dueAt).getTime() + (Number(f.autoOpenHoursAfterDue) || 0) * 3600_000))}.`}>
                  <Input type="number" min={0} max={720} value={f.autoOpenHoursAfterDue} onChange={(e) => set('autoOpenHoursAfterDue', e.target.value)} disabled={open} className="max-w-[140px]" />
                </Field>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Review window closes" error={fields.closesAt} helper="Students get one reminder 24 hours before. Feedback is shown to students when the window closes unless you release it earlier.">
                <Input type="datetime-local" value={f.closesAt} onChange={(e) => set('closesAt', e.target.value)} />
              </Field>
              <Field label="Peer component of the grade (%)" error={fields.peerWeightPercent} helper={weight === 0 ? '0% means peer feedback is advisory only and never changes a grade.' : `Applied only when you choose: final = your score x ${(1 - weight / 100).toFixed(2)} + peer median x ${(weight / 100).toFixed(2)}.`}>
                <Input type="number" min={0} max={50} value={f.peerWeightPercent} onChange={(e) => set('peerWeightPercent', e.target.value)} />
              </Field>
            </div>
            <Field label="Outlier threshold (% of maximum points)" error={fields.outlierThresholdPercent} helper={`A review is flagged when its score is more than ${round(((Number(f.outlierThresholdPercent) || 0) / 100) * d.assignment.maxPoints)} points from the median of the other reviews of the same work.`}>
              <Input type="number" min={5} max={100} value={f.outlierThresholdPercent} onChange={(e) => set('outlierThresholdPercent', e.target.value)} className="max-w-[140px]" />
            </Field>
          </>
        )}
        <div className="-mx-5 -mb-5 flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
          {dirty && d.settings.exists && <span className="mr-auto text-[12.5px] text-warning">Unsaved changes</span>}
          <Button onClick={() => setF(initial)} disabled={!dirty || !d.settings.exists}>
            Discard changes
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!dirty} disabledReason="No changes to save" onClick={() => save.mutate()}>
            Save settings
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

// ---------- Window ----------

function WindowCard({ d }: { d: PeerData }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<null | 'open' | 'release'>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['teach', 'assignment', d.assignment.id, 'peer'] });
  const act = useMutation({
    mutationFn: (kind: 'open' | 'release' | 'allocate-late') => api.post<{ notified?: number }>(`/teach/assignments/${d.assignment.id}/peer/${kind}`),
    onSuccess: (r, kind) => {
      setConfirm(null);
      if (kind === 'open') toast.success('Review window opened. Reviews are being allocated.');
      if (kind === 'release') toast.success(`Peer feedback released. ${r.notified ?? 0} students notified.`);
      if (kind === 'allocate-late') toast.success('Allocating late submissions');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const s = d.settings;
  const beforeDue = Date.now() < new Date(d.assignment.dueAt).getTime();
  if (!s.enabled && !s.exists) return null;
  return (
    <Card>
      <CardHeader title="Review window" action={<PhaseBadge d={d} />} />
      <CardBody className="space-y-3 text-[13px]">
        <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2">
          <dt className="text-muted">Opens</dt>
          <dd className="font-medium">{d.window.opensAt ? formatDateTime(d.window.opensAt) : 'When you open it'}</dd>
          <dt className="text-muted">Closes</dt>
          <dd className="font-medium">{d.window.closesAt ? formatDateTime(d.window.closesAt) : 'Not set'}</dd>
          <dt className="text-muted">Feedback</dt>
          <dd className="leading-relaxed">{d.window.releasedAt ? `Released ${timeAgo(d.window.releasedAt)}${s.releasedAutomatically ? ' (when the window closed)' : ''}` : 'Shown to students when the window closes or when you release it'}</dd>
        </dl>
        {d.allocation.pending && <Banner tone="info" title="Allocating reviews">Reviewers are being assigned in the background. This page updates automatically.</Banner>}
        {s.allocationNote?.message && <Banner tone="warning" title="Fewer reviews than requested">{s.allocationNote.message}</Banner>}
        {d.allocation.unallocated.length > 0 && d.window.phase === 'open' && (
          <Banner tone="info" title={`${d.allocation.unallocated.length} submission${d.allocation.unallocated.length === 1 ? '' : 's'} not in peer review yet`}>
            {d.allocation.unallocated.map((u) => u.name).join(', ')} submitted after reviews were allocated.
          </Banner>
        )}
        <div className="-mx-5 -mb-5 grid gap-2 border-t border-border px-5 py-4 empty:hidden [&>*]:w-full [&_button]:w-full">
          {s.state !== 'open' && (
            <Button size="sm" variant="primary" icon={<PlayIcon size={14} />} disabled={!!d.openBlock} disabledReason={d.openBlock ?? undefined} onClick={() => setConfirm('open')}>
              Open review window
            </Button>
          )}
          {d.window.phase === 'open' && (
            <Button size="sm" icon={<PlusIcon size={14} />} loading={act.isPending && act.variables === 'allocate-late'} disabled={!d.allocation.unallocated.length || d.allocation.pending} disabledReason={d.allocation.pending ? 'Allocation is still running' : 'No late submissions waiting'} onClick={() => act.mutate('allocate-late')}>
              Allocate late submissions
            </Button>
          )}
          {s.state === 'open' && !d.window.releasedAt && (
            <Button size="sm" icon={<SealCheckIcon size={14} />} onClick={() => setConfirm('release')}>
              Release peer feedback
            </Button>
          )}
        </div>
      </CardBody>
      <ConfirmDialog
        open={confirm === 'open'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Open the review window?"
        description={`Every student with a submitted version is assigned up to ${s.reviewsPerSubmission} anonymous review${s.reviewsPerSubmission === 1 ? '' : 's'} and notified. Reviews per submission and the opening rule lock once it opens.`}
        confirmLabel="Open review window"
        loading={act.isPending}
        onConfirm={() => act.mutate('open')}
      >
        {beforeDue && <Banner tone="warning">The assignment is not due yet. Students who submit later can be added with “Allocate late submissions”.</Banner>}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'release'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Release peer feedback now?"
        description="Students see the anonymous reviews of their work (scores per criterion and comments) and are notified. Reviewers who have not finished can still submit until the window closes. This cannot be undone."
        confirmLabel="Release peer feedback"
        loading={act.isPending}
        onConfirm={() => act.mutate('release')}
      />
    </Card>
  );
}

// ---------- Dashboard ----------

function ReviewDialog({ r, d, onClose }: { r: Review; d: PeerData; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`${r.reviewer.name} reviewing ${r.reviewee.name}`} description={r.submittedAt ? `Submitted ${formatDateTime(r.submittedAt)}` : r.savedAt ? `Draft saved ${timeAgo(r.savedAt)}` : 'Not started'} size="lg">
      <div className="space-y-4 text-[13.5px]">
        {r.flags.length > 0 && (
          <ul className="space-y-1">
            {r.flags.map((f) => (
              <li key={f.kind + f.text} className="flex items-start gap-2">
                <Badge tone={f.kind === 'outlier' || f.kind === 'student_flag' ? 'danger' : 'warning'}>{FLAG_LABEL[f.kind]}</Badge>
                <span className="text-muted">{f.text}</span>
              </li>
            ))}
          </ul>
        )}
        {r.excluded && (
          <Banner tone="warning" title="Excluded from medians">
            {r.excluded.reason} ({r.excluded.byName}, {timeAgo(r.excluded.at)})
          </Banner>
        )}
        {d.rubric.length > 0 && <RubricTable criteria={d.rubric} selected={r.rubricScores.filter((x) => x.levelLabel)} compact />}
        <div>
          <div className="mb-1 text-[13px] font-medium">Written comment</div>
          {r.comment ? <p className="whitespace-pre-wrap rounded-md bg-surface-2 p-3">{r.comment}</p> : <p className="text-subtle">No comment yet.</p>}
        </div>
        <div className="flex flex-wrap gap-4 text-[12.5px] text-muted">
          <span>Score: {r.score === null ? 'Not submitted' : `${r.score} / ${d.assignment.maxPoints}`}</span>
          <span>Helpfulness rated by the student: {r.helpfulness ? `${r.helpfulness} / 5` : 'Not rated'}</span>
          {r.lateAllocation && <span>Allocated as a late submission</span>}
        </div>
      </div>
    </Dialog>
  );
}

function ReviewsPanel({ d }: { d: PeerData }) {
  const qc = useQueryClient();
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [view, setView] = useState<Review | null>(null);
  const [excluding, setExcluding] = useState<Review | null>(null);
  const [reason, setReason] = useState('');
  const [reassigning, setReassigning] = useState<Review | null>(null);
  const [newReviewer, setNewReviewer] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [reopening, setReopening] = useState<Review | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['teach', 'assignment', d.assignment.id, 'peer'] });
  const act = useMutation({
    mutationFn: ({ id, kind, body }: { id: string; kind: 'exclude' | 'include' | 'reopen' | 'reassign'; body?: unknown }) => api.post(`/teach/peer-reviews/${id}/${kind}`, body ?? {}),
    onSuccess: (_r, v) => {
      toast.success({ exclude: 'Review excluded from medians', include: 'Review counted again', reopen: 'Review reopened. The reviewer was notified.', reassign: 'Review reassigned. The new reviewer was notified.' }[v.kind]);
      setExcluding(null);
      setReason('');
      setReassigning(null);
      setNewReviewer('');
      setReassignReason('');
      setReopening(null);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rows = d.reviews.filter((r) => (flaggedOnly ? r.flags.length > 0 : true));
  const membersOf = (ownerKey: string) => d.teams.find((t) => t.id === ownerKey)?.memberIds ?? [ownerKey];
  const taken = (ownerKey: string) => new Set(d.reviews.filter((x) => x.reviewee.ownerKey === ownerKey).map((x) => x.reviewer.id));
  const candidates = reassigning ? d.students.filter((s) => !membersOf(reassigning.reviewee.ownerKey).includes(s.userId) && !taken(reassigning.reviewee.ownerKey).has(s.userId)) : [];
  if (!d.reviews.length) return <EmptyState icon={<ChatsCircleIcon size={22} />} title="No reviews allocated" description={d.settings.allocationNote?.message ?? 'Reviews appear here once the window opens and allocation finishes.'} />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Checkbox checked={flaggedOnly} onCheckedChange={setFlaggedOnly} label={`Only flagged reviews (${d.counts.flagged})`} />
      </div>
      {!rows.length ? (
        <EmptyState icon={<CheckCircleIcon size={22} />} title="No flagged reviews" description="No outliers, low-effort comments or student flags so far." />
      ) : (
        <div className={TABLE_WRAP}>
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead className={THEAD}>
              <tr>
                <th scope="col" className={TH}>Reviewer</th>
                <th scope="col" className={TH}>Reviewing</th>
                <th scope="col" className={TH}>Status</th>
                <th scope="col" className={`${TH} text-right`}>Score</th>
                <th scope="col" className={TH}>Flags</th>
                <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.excluded ? `${TR} text-muted` : TR}>
                  <td className={`${TD} whitespace-nowrap font-semibold`}>{r.reviewer.name}</td>
                  <td className={`${TD} whitespace-nowrap`}>{r.reviewee.name}</td>
                  <td className={TD}>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={r.status === 'submitted' ? 'success' : r.status === 'draft' ? 'info' : 'neutral'}>{{ assigned: 'Not started', draft: 'Draft', submitted: 'Submitted' }[r.status]}</Badge>
                      {r.excluded && <Badge tone="warning">Excluded</Badge>}
                      {r.reopenedAt && r.status !== 'submitted' && <Badge>Reopened</Badge>}
                    </div>
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{r.score === null ? <span className="text-subtle">None</span> : r.score}</td>
                  <td className={TD}>
                    <div className="flex flex-wrap gap-1">
                      {r.flags.map((f) => (
                        <span key={f.kind + f.text} title={f.text}>
                          <Badge tone={f.kind === 'outlier' || f.kind === 'student_flag' ? 'danger' : 'warning'} icon={f.kind === 'student_flag' ? <FlagIcon size={11} /> : undefined}>
                            {FLAG_LABEL[f.kind]}
                          </Badge>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={`${TD} text-right`}>
                    <Menu
                      label={`Actions for ${r.reviewer.name}'s review of ${r.reviewee.name}`}
                      items={[
                        { label: 'View review', icon: <EyeIcon size={15} />, onSelect: () => setView(r) },
                        ...(r.status === 'submitted' ? [{ label: 'Reopen for the reviewer', icon: <ArrowCounterClockwiseIcon size={15} />, onSelect: () => setReopening(r) }] : []),
                        ...(r.status !== 'submitted' ? [{ label: 'Reassign to another student', icon: <UserSwitchIcon size={15} />, onSelect: () => setReassigning(r) }] : []),
                        r.excluded
                          ? { label: 'Count this review again', icon: <CheckCircleIcon size={15} />, onSelect: () => act.mutate({ id: r.id, kind: 'include' }) }
                          : { label: 'Exclude from medians', icon: <ProhibitIcon size={15} />, danger: true, onSelect: () => setExcluding(r) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view && <ReviewDialog r={view} d={d} onClose={() => setView(null)} />}
      <ConfirmDialog
        open={!!excluding}
        onOpenChange={(v) => {
          if (!v) {
            setExcluding(null);
            setReason('');
          }
        }}
        title="Exclude this review?"
        description="It stops counting toward peer medians and the peer component, and the student who received it no longer sees it. The reason is kept in the audit trail."
        confirmLabel="Exclude review"
        danger
        loading={act.isPending}
        onConfirm={() => {
          if (reason.trim().length < 5) return toast.error('Write a reason of at least 5 characters.');
          act.mutate({ id: excluding!.id, kind: 'exclude', body: { reason } });
        }}
      >
        <Field label="Reason" error={act.error instanceof ApiError ? act.error.fields.reason : undefined}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Does not engage with the submission" />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={!!reopening}
        onOpenChange={(v) => !v && setReopening(null)}
        title="Reopen this review?"
        description="The reviewer can edit and resubmit it, even after the window closes. Until they resubmit it does not count."
        confirmLabel="Reopen review"
        loading={act.isPending}
        onConfirm={() => act.mutate({ id: reopening!.id, kind: 'reopen' })}
      />
      <Dialog
        open={!!reassigning}
        onOpenChange={(v) => !v && setReassigning(null)}
        title="Reassign review"
        description={reassigning ? `${reassigning.reviewer.name} will no longer review ${reassigning.reviewee.name}. The new reviewer stays anonymous to the student.` : undefined}
        footer={
          <>
            <Button onClick={() => setReassigning(null)}>Cancel</Button>
            <Button variant="primary" loading={act.isPending} disabled={!newReviewer} disabledReason="Choose a student" onClick={() => act.mutate({ id: reassigning!.id, kind: 'reassign', body: { reviewerId: newReviewer, reason: reassignReason || undefined } })}>
              Reassign
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="New reviewer" helper="Students already reviewing this work and its authors are not listed.">
            <Select value={newReviewer} onChange={(e) => setNewReviewer(e.target.value)}>
              <option value="">Choose a student</option>
              {candidates.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason" optional>
            <Input value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} placeholder="e.g. Reviewer is absent this week" />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

function SubmissionsPanel({ d }: { d: PeerData }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const apply = useMutation({
    mutationFn: () => api.post<{ applied: { submissionId: string; finalScore: number }[]; skipped: { submissionId: string; reason: string }[] }>(`/teach/assignments/${d.assignment.id}/peer/apply`, {}),
    onSuccess: (r) => {
      setConfirm(false);
      toast.success(`Peer component applied to ${r.applied.length} submission${r.applied.length === 1 ? '' : 's'}${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}.`);
      qc.invalidateQueries({ queryKey: ['teach'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const w = d.settings.peerWeightPercent;
  const applyBlock = w <= 0 ? 'The peer weight is 0%, so peer feedback is advisory only' : !d.window.feedbackVisible ? 'Available after the window closes or you release peer feedback' : !d.submissions.some((s) => s.instructor && !s.instructor.peerApplied && s.received > 0) ? 'Needs an instructor grade and at least one peer review' : undefined;
  if (!d.submissions.length) return <EmptyState icon={<UsersThreeIcon size={22} />} title="No submissions yet" description="Peer medians appear once students submit and review each other." />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-[12.5px] text-muted">Medians use submitted reviews that are not excluded. Your grade stays authoritative; peers never set grades on their own.</p>
        <Button size="sm" variant="primary" className="ml-auto" icon={<ScalesIcon size={14} />} disabled={!!applyBlock} disabledReason={applyBlock} onClick={() => setConfirm(true)}>
          Apply peer component
        </Button>
      </div>
      <div className={TABLE_WRAP}>
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className={THEAD}>
            <tr>
              <th scope="col" className={TH}>Submission by</th>
              <th scope="col" className={TH}>Reviews received</th>
              {d.rubric.map((c) => (
                <th key={c.id} scope="col" className={`${TH} text-right`}>
                  {c.title}
                </th>
              ))}
              <th scope="col" className={`${TH} text-right`}>Peer median</th>
              <th scope="col" className={`${TH} text-right`}>Your grade</th>
              <th scope="col" className={TH}><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {d.submissions.map((s) => (
              <tr key={s.ownerKey} className={TR}>
                <td className={`${TD} whitespace-nowrap font-semibold`}>
                  {s.name}
                  {!s.allocated && d.settings.allocatedAt && <div className="text-[11.5px] text-subtle">Not allocated yet</div>}
                </td>
                <td className={`${TD} tabular-nums`}>
                  {s.received} of {s.assigned}
                </td>
                {d.rubric.map((c) => (
                  <td key={c.id} className={`${TD} text-right tabular-nums`}>
                    {s.medianByCriterion[c.id] ?? <span className="text-subtle">None</span>}
                  </td>
                ))}
                <td className={`${TD} text-right tabular-nums`}>{s.medianScore === null ? <span className="text-subtle">None</span> : `${s.medianScore} / ${d.assignment.maxPoints}`}</td>
                <td className={`${TD} text-right tabular-nums`}>
                  {s.instructor ? (
                    <>
                      {s.instructor.finalScore}
                      {s.instructor.peerApplied && <div className="text-[11.5px] text-subtle">Includes peer component</div>}
                    </>
                  ) : (
                    <span className="text-subtle">Not graded</span>
                  )}
                </td>
                <td className={`${TD} text-right`}>
                  <ButtonLink size="sm" to={`/app/teach/grading/${s.submissionId}`}>
                    {s.instructor ? 'Review' : 'Grade'}
                  </ButtonLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Apply the ${w}% peer component?`}
        description={`For every submission with your grade and at least one peer review, a new evaluation is recorded: final = your score x ${(1 - w / 100).toFixed(2)} + peer median x ${(w / 100).toFixed(2)}, keeping your late penalty. Earlier evaluations are kept in the history, and students whose grade was already released are notified.`}
        confirmLabel="Apply peer component"
        loading={apply.isPending}
        onConfirm={() => apply.mutate()}
      />
    </div>
  );
}

function ReviewersPanel({ d }: { d: PeerData }) {
  if (!d.reviewers.length) return <EmptyState icon={<UsersThreeIcon size={22} />} title="No reviewers yet" description="Reviewers appear once reviews are allocated." />;
  return (
    <div className={TABLE_WRAP}>
      <table className="w-full min-w-[520px] text-left text-[13px]">
        <thead className={THEAD}>
          <tr>
            <th scope="col" className={TH}>Reviewer</th>
            <th scope="col" className={TH}>Completion</th>
            <th scope="col" className={TH}>Drafts</th>
          </tr>
        </thead>
        <tbody>
          {d.reviewers.map((r) => (
            <tr key={r.userId} className={TR}>
              <td className={`${TD} whitespace-nowrap font-semibold`}>{r.name}</td>
              <td className={TD}>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <div className="h-full bg-accent" style={{ width: `${(r.submitted / Math.max(1, r.assigned)) * 100}%` }} />
                  </div>
                  <span className="tabular-nums">
                    {r.submitted} of {r.assigned} submitted
                  </span>
                </div>
              </td>
              <td className={`${TD} tabular-nums`}>{r.drafts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dashboard({ d }: { d: PeerData }) {
  const [view, setView] = useState<'submissions' | 'reviewers' | 'reviews'>('submissions');
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="Reviews submitted" value={`${d.counts.submitted} / ${d.counts.reviews}`} hint="Allocated reviews" />
        <StatTile label="Submissions in review" value={d.submissions.filter((s) => s.allocated).length} hint={`${d.counts.submissions} submitted`} />
        <StatTile label="Flagged reviews" value={d.counts.flagged} hint="Outliers or low effort" tone={d.counts.flagged ? 'warning' : undefined} />
        <StatTile label="Excluded" value={d.counts.excluded} hint="Not counted in medians" />
      </div>
      <Segmented
        label="Peer review dashboard view"
        value={view}
        onChange={setView}
        options={[
          { value: 'submissions', label: 'Submissions' },
          { value: 'reviewers', label: 'Reviewers' },
          { value: 'reviews', label: `Reviews${d.counts.flagged ? ` (${d.counts.flagged} flagged)` : ''}` },
        ]}
      />
      {view === 'submissions' && <SubmissionsPanel d={d} />}
      {view === 'reviewers' && <ReviewersPanel d={d} />}
      {view === 'reviews' && <ReviewsPanel d={d} />}
    </div>
  );
}

export function PeerReviewTab({ assignmentId }: { assignmentId: string }) {
  const q = useQuery({
    queryKey: ['teach', 'assignment', assignmentId, 'peer'],
    queryFn: () => api.get<PeerData>(`/teach/assignments/${assignmentId}/peer`),
    refetchInterval: (query) => (query.state.data?.allocation.pending ? 2000 : false),
  });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <SkeletonRows rows={6} />;
  const d = q.data;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        {d.settings.state === 'open' ? (
          <Dashboard d={d} />
        ) : (
          <Banner tone="info" title="How peer review works">
            After the due date, each student who submitted is anonymously assigned classmates’ work to score with the rubric and a written comment. You see every review, flags for outliers and low-effort comments, and decide whether the peer median counts toward the grade.
          </Banner>
        )}
        <SettingsCard key={`${d.settings.exists}-${d.settings.state}-${d.settings.closesAt}`} d={d} />
      </div>
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <WindowCard d={d} />
        <Card>
          <CardHeader title="Privacy and evidence" />
          <CardBody className="space-y-2.5 text-[13px] leading-relaxed text-muted">
            <p className="flex items-start gap-2">
              <LockSimpleIcon size={16} className="mt-0.5 shrink-0 text-subtle" aria-hidden /> Students never see who reviewed them or whose work they review.
            </p>
            <p className="flex items-start gap-2">
              <InfoIcon size={16} className="mt-0.5 shrink-0 text-subtle" aria-hidden /> Peer scores are opinions, not verification: they never add verified evidence to a student’s Skill DNA.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
