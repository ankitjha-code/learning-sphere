import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChatsCircleIcon, FlagIcon, StarIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage, ApiError } from '@/lib/api';
import { dueLabel, formatDateTime } from '@/lib/format';
import { Badge, Banner, Button, ButtonLink, Card, CardBody, CardHeader, Dialog, ErrorState, Field, SkeletonRows, Textarea } from '@/components/ui';
import { RubricTable, type RubricCriterion, type RubricScore } from '../teach/shared';

type PeerInfo =
  | { enabled: false }
  | {
      enabled: true;
      window: { phase: 'disabled' | 'not_open' | 'open' | 'closed'; opensAt: string | null; closesAt: string | null; openMode: 'manual' | 'auto' };
      settings: { reviewsPerSubmission: number; minCommentLength: number; peerWeightPercent: number };
      toReview: { id: string; label: string; status: 'assigned' | 'draft' | 'submitted'; submittedAt: string | null; canEdit: boolean; lockedReason: string | null }[];
      feedback:
        | { visible: false; reason: string }
        | { visible: true; releasedAt: string | null; reviews: { id: string; label: string; rubricScores: RubricScore[]; comment: string | null; score: number | null; helpfulness: number | null; flagged: boolean }[]; medianByCriterion: Record<string, number | null>; medianScore: number | null };
    };

type PeerTodo = { id: string; assignmentId: string; assignmentTitle: string; label: string; status: 'assigned' | 'draft' | 'submitted'; closesAt: string | null; phase: string; canEdit: boolean; lockedReason: string | null; submittedAt: string | null; reopened: boolean };

const STATUS: Record<'assigned' | 'draft' | 'submitted', { label: string; tone: 'neutral' | 'info' | 'success' }> = {
  assigned: { label: 'To do', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'info' },
  submitted: { label: 'Submitted', tone: 'success' },
};

function Helpfulness({ reviewId, value, assignmentId }: { reviewId: string; value: number | null; assignmentId: string }) {
  const qc = useQueryClient();
  const rate = useMutation({
    mutationFn: (helpfulness: number) => api.post(`/teach/my/peer-feedback/${reviewId}/rate`, { helpfulness }),
    onSuccess: () => {
      toast.success('Thanks for rating this review');
      qc.invalidateQueries({ queryKey: ['my-assignment-peer', assignmentId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="flex items-center gap-1" role="group" aria-label="How helpful was this review?">
      <span className="mr-1 text-[12px] text-muted">Helpful?</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} of 5`}
          aria-pressed={value === n}
          disabled={rate.isPending}
          onClick={() => rate.mutate(n)}
          className={clsx('rounded p-0.5', value && n <= value ? 'text-xp' : 'text-subtle hover:text-fg')}
        >
          <StarIcon size={16} weight={value && n <= value ? 'fill' : 'regular'} />
        </button>
      ))}
    </div>
  );
}

export function PeerSection({ assignmentId, rubric, maxPoints }: { assignmentId: string; rubric: RubricCriterion[] | null; maxPoints: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-assignment-peer', assignmentId], queryFn: () => api.get<PeerInfo>(`/teach/my/assignments/${assignmentId}/peer`) });
  const [flagging, setFlagging] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const flag = useMutation({
    mutationFn: () => api.post(`/teach/my/peer-feedback/${flagging}/flag`, { reason }),
    onSuccess: () => {
      toast.success('Review flagged. Your instructor will look at it.');
      setFlagging(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['my-assignment-peer', assignmentId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <SkeletonRows rows={3} />;
  const p = q.data;
  if (!p.enabled) return null;
  const w = p.window;
  const criteria = rubric ?? [];
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            <ChatsCircleIcon size={16} /> Peer reviews
          </span>
        }
        description={
          w.phase === 'not_open'
            ? w.opensAt
              ? `Peer review opens ${formatDateTime(w.opensAt)}. You will review ${p.settings.reviewsPerSubmission} classmate${p.settings.reviewsPerSubmission === 1 ? '' : 's'}’ work.`
              : 'Your instructor will open peer review after the due date.'
            : w.closesAt
              ? `${w.phase === 'closed' ? 'Closed' : 'Reviews due'} ${formatDateTime(w.closesAt)}`
              : undefined
        }
      />
      <CardBody className="space-y-4">
        <p className="inline-flex items-start gap-1.5 text-[12.5px] text-muted">
          <EyeSlashIcon size={14} className="mt-0.5 shrink-0" /> Anonymous both ways: you never see whose work you review or who reviewed yours.{' '}
          {p.settings.peerWeightPercent > 0 ? `Your instructor may count the peer median as ${p.settings.peerWeightPercent}% of the grade; their grade stays authoritative.` : 'Peer scores are feedback only and do not change your grade.'}
        </p>

        {p.toReview.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-[13px] font-semibold">Reviews you write</h3>
            <ul className="divide-y divide-border">
              {p.toReview.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2.5 text-[13px] first:pt-0 last:pb-0">
                  <span className="font-medium">{r.label}</span>
                  <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                  <ButtonLink size="sm" className="ml-auto" variant={r.canEdit && r.status !== 'submitted' ? 'primary' : 'secondary'} to={`/app/assignments/peer-reviews/${r.id}`}>
                    {r.canEdit && r.status !== 'submitted' ? (r.status === 'draft' ? 'Continue review' : 'Start review') : 'View'}
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </div>
        )}
        {w.phase !== 'not_open' && !p.toReview.length && <p className="text-[13px] text-muted">You have no reviews to write for this assignment. Reviews are assigned to students who submitted before the window opened.</p>}

        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold">Feedback on your work</h3>
          {!p.feedback.visible ? (
            <p className="text-[13px] text-muted">{p.feedback.reason}</p>
          ) : !p.feedback.reviews.length ? (
            <p className="text-[13px] text-muted">No peer reviews of your work were submitted.</p>
          ) : (
            <div className="space-y-3">
              {p.feedback.medianScore !== null && (
                <p className="text-[13px]">
                  Peer median: <span className="font-semibold tabular-nums">{p.feedback.medianScore} / {maxPoints}</span>
                  <span className="text-muted"> from {p.feedback.reviews.length} review{p.feedback.reviews.length === 1 ? '' : 's'}</span>
                </p>
              )}
              {p.feedback.reviews.map((r) => (
                <div key={r.id} className="space-y-2 rounded-md bg-surface-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold">{r.label}</span>
                    {r.score !== null && <span className="text-[12.5px] tabular-nums text-muted">{r.score} / {maxPoints}</span>}
                    {r.flagged && <Badge tone="warning">Flagged</Badge>}
                  </div>
                  {criteria.length > 0 && <RubricTable criteria={criteria} selected={r.rubricScores.filter((x) => x.levelLabel)} compact />}
                  {r.comment && <p className="whitespace-pre-wrap text-[13.5px]">{r.comment}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Helpfulness reviewId={r.id} value={r.helpfulness} assignmentId={assignmentId} />
                    <Button size="sm" variant="ghost" icon={<FlagIcon size={14} />} disabled={r.flagged} disabledReason="You already flagged this review" onClick={() => setFlagging(r.id)}>
                      Flag as inappropriate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardBody>
      <Dialog
        open={!!flagging}
        onOpenChange={(v) => !v && setFlagging(null)}
        title="Flag this review"
        description="Tell your instructor what is wrong, for example rude language or a review that ignores your work. The reviewer is not told who flagged it."
        footer={
          <>
            <Button onClick={() => setFlagging(null)}>Cancel</Button>
            <Button variant="primary" loading={flag.isPending} disabled={reason.trim().length < 5} disabledReason="Write at least 5 characters" onClick={() => flag.mutate()}>
              Flag review
            </Button>
          </>
        }
      >
        <Field label="What is wrong?" error={flag.error instanceof ApiError ? flag.error.fields.reason : undefined}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} />
        </Field>
      </Dialog>
    </Card>
  );
}

/** "Peer reviews to do" for the assignments list. Renders nothing when the student has no peer reviews at all. */
export function PeerTodoCard() {
  const q = useQuery({ queryKey: ['my-peer-reviews'], queryFn: () => api.get<{ items: PeerTodo[]; todo: number }>('/teach/my/peer-reviews') });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <SkeletonRows rows={2} />;
  const items = q.data?.items ?? [];
  if (!items.length) return null;
  const open = items.filter((i) => i.status !== 'submitted' && i.canEdit);
  const done = items.filter((i) => i.status === 'submitted').length;
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            <ChatsCircleIcon size={16} /> Peer reviews to do
          </span>
        }
        description={`${done} of ${items.length} submitted. Reviews are anonymous.`}
      />
      <CardBody>
        {!open.length ? (
          <Banner tone="success">You are all caught up on peer reviews.</Banner>
        ) : (
          <ul className="space-y-2">
            {open.map((i) => {
              const due = dueLabel(i.closesAt);
              return (
                <li key={i.id} className="text-[13px]">
                  <Link to={`/app/assignments/peer-reviews/${i.id}`} className="font-medium hover:underline">
                    {i.assignmentTitle}: {i.label}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={STATUS[i.status].tone}>{i.reopened ? 'Reopened' : STATUS[i.status].label}</Badge>
                    {i.closesAt && <Badge tone={due.tone === 'neutral' ? 'neutral' : due.tone}>{due.text}</Badge>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
