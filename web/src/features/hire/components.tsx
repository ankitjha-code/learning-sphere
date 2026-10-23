import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CheckCircleIcon, MinusCircleIcon, XCircleIcon, ScalesIcon, PaperPlaneRightIcon, ChatCircleIcon, InfoIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDateTime, toLocalInput, fromLocalInput } from '@/lib/format';
import { Badge, Banner, Button, Checkbox, Dialog, EmptyState, ErrorState, Field, Input, Select, SkeletonRows, Textarea, Tooltip } from '@/components/ui';
import { RECOMMENDATION_LABEL, useInterviewers, type Feedback, type Match, type MatchFactor, type Message } from './api';

/** One bordered list container with divided rows (rows use px-5 py-4). */
export const listGroup = 'divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1';

// ---------- Evidence & match ----------

const EVIDENCE: Record<MatchFactor['evidence'], { tone: 'success' | 'info' | 'warning' | 'neutral'; label: string }> = {
  verified: { tone: 'success', label: 'Verified' },
  demonstrated: { tone: 'info', label: 'Demonstrated' },
  learning: { tone: 'warning', label: 'Learning' },
  self_reported: { tone: 'neutral', label: 'Self-reported' },
  none: { tone: 'neutral', label: 'No evidence' },
};

export function EvidenceBadge({ evidence }: { evidence: MatchFactor['evidence'] | string }) {
  const e = EVIDENCE[evidence as MatchFactor['evidence']] ?? { tone: 'neutral' as const, label: evidence };
  return <Badge tone={e.tone}>{e.label}</Badge>;
}

export function OutcomeIcon({ outcome }: { outcome: 'met' | 'partial' | 'unmet' | 'unknown' }) {
  if (outcome === 'met') return <CheckCircleIcon size={16} weight="fill" className="text-success" aria-label="Met" />;
  if (outcome === 'partial') return <MinusCircleIcon size={16} weight="fill" className="text-warning" aria-label="Partly met" />;
  if (outcome === 'unknown') return <InfoIcon size={16} className="text-subtle" aria-label="Unknown" />;
  return <XCircleIcon size={16} className="text-subtle" aria-label="Not met" />;
}

export function MatchScore({ score, className }: { score: number | null | undefined; className?: string }) {
  if (score === null || score === undefined) return <span className={clsx('text-[12.5px] text-subtle', className)}>No skills listed</span>;
  const tone = score >= 70 ? 'text-success' : score >= 40 ? 'text-warning' : 'text-muted';
  return (
    <Tooltip content="Evidence for the job's listed skills only. Advisory; it never rejects anyone.">
      <span className={clsx('inline-flex items-baseline gap-0.5 font-semibold tabular-nums', tone, className)}>
        {score}
        <span className="text-[11px] font-normal text-subtle">/100</span>
      </span>
    </Tooltip>
  );
}

export function FairnessNote({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2 text-[12.5px] text-muted', className)}>
      <ScalesIcon size={16} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
      <span>Ranking uses only stated job requirements and demonstrated skills. Decisions are made by people.</span>
    </div>
  );
}

export function MatchBreakdown({ match }: { match: Match }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <MatchScore score={match.score} className="text-[22px]" />
        <span className="text-[13px] text-muted">
          {match.summary.requiredMet} of {match.summary.required} required skills met
          {match.summary.partial ? `, ${match.summary.partial} partly` : ''}
        </span>
      </div>
      {match.factors.length === 0 ? (
        <p className="text-[13px] text-muted">This job lists no skills, so there is nothing to match against.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-subtle">
                <th className="py-1.5 pr-3 font-medium">Requirement</th>
                <th className="py-1.5 pr-3 font-medium">Evidence</th>
                <th className="py-1.5 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {match.factors.map((f) => (
                <tr key={f.slug} className="border-b border-border/60 align-top last:border-0">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-1.5">
                      <OutcomeIcon outcome={f.outcome} />
                      <span className="font-medium">{f.name}</span>
                    </div>
                    <div className="ml-[22px] text-[12px] text-subtle">
                      {f.required ? 'Required' : 'Preferred'}
                      {f.minLevel ? ` · min level ${f.minLevel}` : ''}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <EvidenceBadge evidence={f.evidence} />
                  </td>
                  <td className="py-2 text-muted">
                    {f.evidenceDetail}
                    {f.level !== null && <span className="text-subtle"> · level {f.level} of 4</span>}
                    {f.note && <div className="mt-0.5 text-[12px] text-warning">{f.note}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {match.eligibility.length > 0 && (
        <div>
          <h4 className="mb-1 text-[12.5px] font-semibold text-subtle">Eligibility (information only, never applied automatically)</h4>
          <ul className="space-y-1 text-[13px]">
            {match.eligibility.map((e) => (
              <li key={e.label} className="flex items-start gap-1.5">
                <OutcomeIcon outcome={e.outcome} />
                <span>
                  {e.label} <span className="text-muted">· {e.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="text-[12.5px] text-muted">
        <summary className="cursor-pointer text-fg">How this is calculated</summary>
        <p className="mt-1">{match.formula}</p>
        <p className="mt-1">{match.note}</p>
      </details>
    </div>
  );
}

// ---------- Funnel bars ----------

export function FunnelMini({ stages }: { stages: { key: string; label: string; count: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="flex h-10 items-end gap-1" role="img" aria-label={stages.map((s) => `${s.label}: ${s.count}`).join(', ')}>
      {stages.map((s) => (
        <Tooltip key={s.key} content={`${s.label}: ${s.count}`}>
          <div className="flex w-6 flex-col items-center">
            <div className="w-full rounded-sm bg-accent/70" style={{ height: `${Math.max(3, (s.count / max) * 32)}px` }} />
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

// ---------- Stage move dialog (single or bulk) ----------

export function StageMoveDialog({
  open,
  onOpenChange,
  applicationIds,
  stages,
  initialStage,
  needsReasonFor,
  candidateLabel,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  applicationIds: string[];
  stages: { key: string; label: string; blocked?: string | null }[];
  initialStage?: string;
  needsReasonFor?: (stage: string) => string | null;
  candidateLabel: string;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [toStage, setToStage] = useState(initialStage ?? '');
  const [reason, setReason] = useState('');
  const [visible, setVisible] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const stagesRef = useRef(stages);
  stagesRef.current = stages;
  useEffect(() => {
    // Reset only when the dialog opens (not when the parent re-renders with a new stages array).
    if (open) {
      setToStage(initialStage ?? stagesRef.current.find((s) => !s.blocked)?.key ?? '');
      setReason('');
      setVisible(false);
      setConfirmed(false);
    }
  }, [open, initialStage]);
  const bulk = applicationIds.length > 1;
  const why = toStage === 'rejected' ? 'Rejections need a reason for the decision record.' : (needsReasonFor?.(toStage) ?? null);
  const m = useMutation({
    mutationFn: () =>
      bulk
        ? api.post<{ count: number }>('/hire/applications/bulk-move', { applicationIds, toStage, reason: reason || null, visibleToCandidate: visible, confirm: true })
        : api.post(`/hire/applications/${applicationIds[0]}/move`, { toStage, reason: reason || null, visibleToCandidate: visible }),
    onSuccess: () => {
      toast.success(bulk ? `Moved ${applicationIds.length} candidates.` : 'Stage updated and recorded.');
      qc.invalidateQueries({ queryKey: ['hire'] });
      onOpenChange(false);
      onDone?.();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  const label = stages.find((s) => s.key === toStage)?.label ?? toStage;
  const reasonMissing = !!why && reason.trim().length < 5;
  const blockedReason = !toStage ? 'Choose a stage' : reasonMissing ? 'Write a reason first' : bulk && !confirmed ? 'Confirm the bulk move' : undefined;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={bulk ? `Move ${applicationIds.length} candidates` : `Move ${candidateLabel}`}
      description="Every move is recorded with who made it and why. Candidates get a short, respectful update."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={toStage === 'rejected' ? 'danger' : 'primary'} loading={m.isPending} disabled={!!blockedReason} disabledReason={blockedReason} onClick={() => m.mutate()}>
            {toStage === 'rejected' ? 'Reject' : `Move to ${label}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="New stage">
          <Select value={toStage} onChange={(e) => setToStage(e.target.value)}>
            <option value="" disabled>
              Choose a stage
            </option>
            {stages.map((s) => (
              <option key={s.key} value={s.key} disabled={!!s.blocked}>
                {s.label}
                {s.blocked ? ` (${s.blocked})` : ''}
              </option>
            ))}
          </Select>
        </Field>
        {why && <Banner tone="info">{why}</Banner>}
        <Field label="Reason" optional={!why} error={fields.reason} helper="Kept in the decision log. Base it on the job's requirements and the evidence you reviewed.">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
        </Field>
        <Checkbox
          checked={visible}
          onCheckedChange={setVisible}
          disabled={!reason.trim()}
          label="Share this reason with the candidate"
          description={reason.trim() ? 'They will see it on their application page and in the notification.' : 'Write a reason to share it.'}
        />
        {bulk && <Checkbox checked={confirmed} onCheckedChange={setConfirmed} label={`I reviewed these ${applicationIds.length} candidates individually and confirm this move.`} />}
      </div>
    </Dialog>
  );
}

// ---------- Message thread ----------

export function MessageThread({ path, queryKey, emptyHint, canSend = true }: { path: string; queryKey: unknown[]; emptyHint: string; canSend?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey, queryFn: () => api.get<{ items: Message[] }>(path), refetchInterval: 30_000 });
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [q.data?.items.length]);
  const send = useMutation({
    mutationFn: () => api.post(path, { body: text }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="flex flex-col gap-3">
      {q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon={<ChatCircleIcon size={22} />} title="No messages yet" description={emptyHint} />
      ) : (
        <ol className="max-h-[420px] space-y-2 overflow-y-auto pr-1" aria-label="Messages">
          {q.data.items.map((m) => (
            <li key={m.id} className={clsx('max-w-[85%] rounded-lg px-3 py-2 text-[13.5px]', m.mine ? 'ml-auto bg-accent-soft' : 'bg-surface-2')}>
              <div className="mb-0.5 text-[11.5px] text-subtle">
                {m.mine ? 'You' : m.senderName} · {formatDateTime(m.createdAt)}
              </div>
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
            </li>
          ))}
          <div ref={end} />
        </ol>
      )}
      {canSend && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) send.mutate();
          }}
        >
          <Textarea aria-label="Message" rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Write a message" className="flex-1" />
          <Button type="submit" variant="primary" icon={<PaperPlaneRightIcon size={15} />} loading={send.isPending} disabled={!text.trim()} disabledReason="Write a message first">
            Send
          </Button>
        </form>
      )}
    </div>
  );
}

// ---------- Schedule interview ----------

export function ScheduleInterviewDialog({ open, onOpenChange, applicationId, candidateName }: { open: boolean; onOpenChange: (v: boolean) => void; applicationId: string; candidateName: string }) {
  const qc = useQueryClient();
  const team = useInterviewers(open);
  const [kind, setKind] = useState('technical');
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState('45');
  const [ids, setIds] = useState<string[]>([]);
  const [provider, setProvider] = useState<'jitsi' | 'custom' | 'none'>('jitsi');
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (open) {
      const d = new Date(Date.now() + 86400_000);
      d.setMinutes(0, 0, 0);
      setWhen(toLocalInput(d.toISOString()));
      setIds([]);
      setProvider('jitsi');
      setUrl('');
    }
  }, [open]);
  const m = useMutation({
    mutationFn: () =>
      api.post('/hire/interviews', {
        applicationId,
        kind,
        scheduledAt: fromLocalInput(when),
        durationMinutes: Number(duration),
        interviewerIds: ids,
        meeting: provider === 'custom' ? { provider, url } : { provider },
      }),
    onSuccess: () => {
      toast.success('Interview scheduled. The candidate and interviewers were notified.');
      qc.invalidateQueries({ queryKey: ['hire'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  const blocked = !when ? 'Pick a time' : !ids.length ? 'Choose at least one interviewer' : provider === 'custom' && !url ? 'Paste the meeting link' : undefined;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Schedule an interview with ${candidateName}`}
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!!blocked} disabledReason={blocked} onClick={() => m.mutate()}>
            Schedule interview
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="technical">Technical</option>
            <option value="behavioral">Behavioral</option>
            <option value="system_design">System design</option>
            <option value="hr">HR</option>
            <option value="panel">Panel</option>
          </Select>
        </Field>
        <Field label="Duration">
          <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
            {[30, 45, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d} minutes
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date and time" helper="Your local time. Recipients see it in their own timezone." error={fields.scheduledAt} className="sm:col-span-2">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <div className="mb-1.5 text-[13px] font-medium">Interviewers</div>
          {team.isLoading ? (
            <SkeletonRows rows={2} />
          ) : team.error ? (
            <ErrorState error={team.error} onRetry={() => team.refetch()} />
          ) : !team.data?.items.length ? (
            <p className="text-[13px] text-muted">Nobody on your team has the Interviewer or Recruiter role yet. Invite them from Company & team.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {team.data.items.map((p) => (
                <Checkbox
                  key={p.userId}
                  checked={ids.includes(p.userId)}
                  onCheckedChange={(v) => setIds(v ? [...ids, p.userId] : ids.filter((x) => x !== p.userId))}
                  label={p.name}
                  description={p.title ?? p.roles.filter((r) => ['interviewer', 'recruiter', 'recruiter_admin'].includes(r)).join(', ')}
                />
              ))}
            </div>
          )}
          {fields.interviewerIds && <p className="mt-1 text-[12.5px] text-danger">{fields.interviewerIds}</p>}
        </div>
        <Field label="Meeting link" className="sm:col-span-2">
          <Select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
            <option value="jitsi">Generate a free Jitsi Meet link</option>
            <option value="custom">Use my own link</option>
            <option value="none">No link (in person or phone)</option>
          </Select>
        </Field>
        {provider === 'jitsi' && <p className="text-[12.5px] text-muted sm:col-span-2">The first participant may need to sign in to start the meeting.</p>}
        {provider === 'custom' && (
          <Field label="Meeting URL" error={fields['meeting.url']} className="sm:col-span-2">
            <Input type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function FeedbackCard({ f }: { f: Feedback }) {
  const tone = f.recommendation.endsWith('yes') ? 'success' : 'danger';
  return (
    <div className="rounded-md bg-surface-2 px-4 py-3 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{f.interviewerName}</span>
        <Badge tone={tone}>{RECOMMENDATION_LABEL[f.recommendation] ?? f.recommendation}</Badge>
      </div>
      <ul className="mt-2 space-y-1">
        {f.scores.map((s) => (
          <li key={s.competency}>
            <span className="tabular-nums">{s.rating}/4</span> {s.competency}
            {s.note && <span className="text-muted"> · {s.note}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 whitespace-pre-wrap text-muted">{f.summary}</p>
      <div className="mt-1 text-[12px] text-subtle">Submitted {formatDateTime(f.submittedAt)}</div>
    </div>
  );
}

