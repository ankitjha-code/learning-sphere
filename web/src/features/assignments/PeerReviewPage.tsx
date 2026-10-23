import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CaretLeftIcon, EyeSlashIcon, LinkSimpleIcon, LockSimpleIcon, PaperclipIcon, ClockIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { Badge, Banner, Button, ButtonLink, Card, CardBody, CardHeader, ConfirmDialog, ErrorState, Field, Input, Markdown, PageHeader, SkeletonRows, Textarea } from '@/components/ui';
import { RubricTable, rubricMax, round2, type RubricCriterion, type RubricScore } from '../teach/shared';

type Detail = {
  review: { id: string; label: string; status: 'assigned' | 'draft' | 'submitted'; rubricScores: RubricScore[]; comment: string; score: number | null; savedAt: string | null; submittedAt: string | null; reopened: boolean };
  assignment: { id: string; title: string; instructions: string; objectives: string[]; maxPoints: number; rubric: RubricCriterion[] };
  settings: { minCommentLength: number; reviewsPerSubmission: number };
  window: { phase: 'disabled' | 'not_open' | 'open' | 'closed'; closesAt: string | null };
  canEdit: boolean;
  lockedReason: string | null;
  work: { text: string | null; links: { label: string; url: string }[]; files: { id: string; label: string; mime: string; size: number; url: string }[] } | null;
  others: { id: string; label: string }[];
};

type Picks = Record<string, { levelLabel: string; comment: string }>;

function toPicks(scores: RubricScore[]): Picks {
  return Object.fromEntries(scores.map((s) => [s.criterionId, { levelLabel: s.levelLabel, comment: s.comment ?? '' }]));
}

function payload(picks: Picks, comment: string) {
  return {
    rubricScores: Object.entries(picks)
      .filter(([, v]) => v.levelLabel || v.comment.trim())
      .map(([criterionId, v]) => ({ criterionId, levelLabel: v.levelLabel, ...(v.comment.trim() ? { comment: v.comment.trim() } : {}) })),
    comment,
  };
}

function ReviewForm({ d }: { d: Detail }) {
  const qc = useQueryClient();
  const [picks, setPicks] = useState<Picks>(() => toPicks(d.review.rubricScores));
  const [comment, setComment] = useState(d.review.comment);
  const [confirming, setConfirming] = useState(false);
  const criteria = d.assignment.rubric;
  const initial = useMemo(() => JSON.stringify(payload(toPicks(d.review.rubricScores), d.review.comment)), [d.review]);
  const dirty = JSON.stringify(payload(picks, comment)) !== initial;
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['my-peer-review', d.review.id] });
    qc.invalidateQueries({ queryKey: ['my-peer-reviews'] });
    qc.invalidateQueries({ queryKey: ['my-assignment-peer', d.assignment.id] });
  };
  const save = useMutation({
    mutationFn: () => api.put<{ review: { savedAt: string } }>(`/teach/my/peer-reviews/${d.review.id}`, payload(picks, comment)),
    onSuccess: () => {
      toast.success('Draft saved');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submit = useMutation({
    mutationFn: () => api.post(`/teach/my/peer-reviews/${d.review.id}/submit`, { ...payload(picks, comment), confirm: true }),
    onSuccess: () => {
      toast.success('Review submitted. Thank you.');
      setConfirming(false);
      invalidate();
    },
    onError: (e) => {
      setConfirming(false);
      toast.error(errorMessage(e));
    },
  });
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
  const missing = criteria.filter((c) => !picks[c.id]?.levelLabel);
  const len = comment.trim().length;
  const min = d.settings.minCommentLength;
  const points = criteria.reduce((s, c) => s + (c.levels.find((l) => l.label === picks[c.id]?.levelLabel)?.points ?? 0), 0);
  const max = rubricMax(criteria);
  const submitBlock = missing.length ? `Choose a level for ${missing.map((c) => c.title).join(', ')}` : len < min ? `Write at least ${min} characters (${len} so far)` : undefined;
  const fieldErr = submit.error instanceof ApiError ? submit.error.fields : {};
  return (
    <Card>
      <CardHeader title="Your review" description="Score each criterion, then explain your scores. Be specific and kind: say what works and one concrete improvement." />
      <CardBody className="space-y-5">
        {criteria.map((c) => (
          <fieldset key={c.id} className="space-y-1.5">
            <legend className="text-[13.5px] font-medium">
              {c.title}
              {c.description && <span className="block text-[12px] font-normal text-muted">{c.description}</span>}
            </legend>
            <div className="grid gap-1.5" role="radiogroup" aria-label={c.title}>
              {c.levels.map((l) => {
                const on = picks[c.id]?.levelLabel === l.label;
                return (
                  <label key={l.label} className={clsx('flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-[13px]', on ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2')}>
                    <input type="radio" name={`crit-${c.id}`} className="mt-0.5 accent-[var(--accent)]" checked={on} onChange={() => setPicks({ ...picks, [c.id]: { levelLabel: l.label, comment: picks[c.id]?.comment ?? '' } })} />
                    <span className="flex-1">
                      <span className="font-medium">{l.label}</span>
                      {l.description && <span className="block text-[12px] text-muted">{l.description}</span>}
                    </span>
                    <span className="tabular-nums text-muted">{l.points}</span>
                  </label>
                );
              })}
            </div>
            {fieldErr[`rubric.${c.id}`] && <p className="text-[12.5px] text-danger">{fieldErr[`rubric.${c.id}`]}</p>}
            <Input value={picks[c.id]?.comment ?? ''} onChange={(e) => setPicks({ ...picks, [c.id]: { levelLabel: picks[c.id]?.levelLabel ?? '', comment: e.target.value } })} placeholder="Optional comment on this criterion" aria-label={`Comment on ${c.title}`} />
          </fieldset>
        ))}
        <Field label="Written feedback" error={fieldErr.comment} helper={`${len} of at least ${min} characters.`}>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={6} placeholder="What does this submission do well? What is one specific thing that would improve it?" />
        </Field>
        <div className="rounded-md bg-surface-2 p-3 text-[13px]" aria-live="polite">
          <div className="flex justify-between">
            <span className="text-muted">Rubric points</span>
            <span className="tabular-nums">
              {points} / {max}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Equivalent score</span>
            <span className="tabular-nums">{max > 0 ? `${round2((points / max) * d.assignment.maxPoints)} / ${d.assignment.maxPoints}` : 'None'}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {d.review.savedAt && <span className="mr-auto text-[12.5px] text-subtle">Draft saved {timeAgo(d.review.savedAt)}</span>}
          <Button loading={save.isPending} disabled={!dirty} disabledReason="No changes since the last save" onClick={() => save.mutate()}>
            Save draft
          </Button>
          <Button variant="primary" disabled={!!submitBlock} disabledReason={submitBlock} onClick={() => setConfirming(true)}>
            Submit review
          </Button>
        </div>
      </CardBody>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Submit this review?"
        description="Submitted reviews are locked. Only your instructor can reopen it. The student will see your scores and comments without your name."
        confirmLabel="Submit review"
        loading={submit.isPending}
        onConfirm={() => submit.mutate()}
      />
    </Card>
  );
}

export default function PeerReviewPage() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const q = useQuery({ queryKey: ['my-peer-review', reviewId], queryFn: () => api.get<Detail>(`/teach/my/peer-reviews/${reviewId}`) });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} className="mx-auto max-w-5xl" />;
  if (q.isLoading || !q.data) return <SkeletonRows rows={8} className="mx-auto max-w-5xl" />;
  const d = q.data;
  const r = d.review;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        breadcrumb={
          <Link to={`/app/assignments/${d.assignment.id}`} className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={14} /> {d.assignment.title}
          </Link>
        }
        title={`Peer review: ${r.label}`}
        badge={<Badge tone={r.status === 'submitted' ? 'success' : r.status === 'draft' ? 'info' : 'neutral'}>{{ assigned: 'Not started', draft: 'Draft', submitted: 'Submitted' }[r.status]}</Badge>}
        description={d.window.closesAt ? `Reviews close ${formatDateTime(d.window.closesAt)}` : undefined}
        actions={d.others.map((o) => (
          <ButtonLink key={o.id} size="sm" to={`/app/assignments/peer-reviews/${o.id}`}>
            Open {o.label}
          </ButtonLink>
        ))}
      />
      <Banner tone="info" className="mb-5" title="Anonymous review">
        <span className="inline-flex items-start gap-1.5">
          <EyeSlashIcon size={14} className="mt-0.5 shrink-0" /> You do not see whose work this is, and they will not see your name. Your instructor can see both.
        </span>
      </Banner>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* The submission stays in view while the reviewer works down the rubric. */}
        <div className="min-w-0 space-y-5 lg:sticky lg:top-[84px] lg:self-start">
          <Card>
            <CardHeader title="The submission" />
            <CardBody className="space-y-3">
              {!d.work ? (
                <p className="text-[13px] text-muted">{d.lockedReason ?? 'The submission is no longer available.'}</p>
              ) : (
                <>
                  {d.work.text ? <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 font-mono text-[12.5px]">{d.work.text}</pre> : <p className="text-[13px] text-subtle">No written answer.</p>}
                  {d.work.links.length > 0 && (
                    <ul className="space-y-1 text-[13px]">
                      {d.work.links.map((l) => (
                        <li key={l.url} className="flex items-center gap-1.5 break-all">
                          <LinkSimpleIcon size={14} className="shrink-0 text-subtle" />
                          <a href={l.url} target="_blank" rel="noreferrer noopener" className="text-accent-text hover:underline">
                            {l.label || l.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {d.work.files.length > 0 && (
                    <ul className="space-y-1 text-[13px]">
                      {d.work.files.map((f) => (
                        <li key={f.id} className="flex items-center gap-1.5">
                          <PaperclipIcon size={14} className="shrink-0 text-subtle" />
                          <a href={f.url} target="_blank" rel="noreferrer" className="text-accent-text hover:underline">
                            {f.label}
                          </a>
                          <span className="text-[12px] text-subtle">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Assignment instructions" />
            <CardBody>
              <Markdown source={d.assignment.instructions} />
            </CardBody>
          </Card>
        </div>
        <div className="min-w-0 space-y-5">
          {r.reopened && r.status !== 'submitted' && <Banner tone="warning" title="Reopened by your instructor">Revise your review and submit it again.</Banner>}
          {d.canEdit ? (
            <ReviewForm key={`${r.id}-${r.status}`} d={d} />
          ) : (
            <Card>
              <CardHeader title="Your review" action={<LockSimpleIcon size={16} className="text-subtle" aria-label="Locked" />} />
              <CardBody className="space-y-3">
                <Banner tone={r.status === 'submitted' ? 'success' : 'info'}>
                  <span className="inline-flex items-start gap-1.5">
                    {r.status === 'submitted' ? null : <ClockIcon size={14} className="mt-0.5 shrink-0" />}
                    {r.status === 'submitted' ? `Submitted ${formatDateTime(r.submittedAt)}. ${d.lockedReason ?? ''}` : d.lockedReason}
                  </span>
                </Banner>
                {d.assignment.rubric.length > 0 && r.rubricScores.some((x) => x.levelLabel) && <RubricTable criteria={d.assignment.rubric} selected={r.rubricScores.filter((x) => x.levelLabel)} compact />}
                {r.comment && <p className="whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-[13.5px]">{r.comment}</p>}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
