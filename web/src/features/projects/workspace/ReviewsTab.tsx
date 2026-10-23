import { useState } from 'react';
import { ChatCircleTextIcon, SealCheckIcon, PaperPlaneTiltIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Button, Card, Badge, Banner, Dialog, Field, Select, Textarea, Checkbox, EmptyState, Markdown, Input, ProvenanceTag } from '@/components/ui';
import type { ProjectDetail, Review } from '../types';
import { useProjectMutation } from './shared';

const KIND_LABEL: Record<Review['kind'], { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' }> = {
  feedback: { label: 'Feedback', tone: 'neutral' },
  code_review: { label: 'Code review', tone: 'info' },
  changes_requested: { label: 'Changes requested', tone: 'warning' },
  approval: { label: 'Completion approved', tone: 'success' },
};

function RequestReviewDialog({ d, open, onOpenChange }: { d: ProjectDetail; open: boolean; onOpenChange: (v: boolean) => void }) {
  const reviewers = d.team.filter((m) => m.role === 'mentor' || m.role === 'reviewer');
  if (d.reviewer && !reviewers.some((r) => r.userId === d.reviewer!.id)) reviewers.push({ userId: d.reviewer.id, name: d.reviewer.name, role: 'reviewer', avatarColor: null, email: '', addedAt: '' });
  const [who, setWho] = useState('');
  const [note, setNote] = useState('');
  const m = useProjectMutation(d.project.id, () => api.post<{ notified: number }>(`/projects/${d.project.id}/review-request`, { ...(who ? { reviewerUserId: who } : {}), note: note || undefined }), (r) => `Review requested from ${r.notified} ${r.notified === 1 ? 'person' : 'people'}`);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Request a review"
      description="Reviewers can leave feedback, request changes, or approve completion. Approval turns confirmed skills into verified evidence."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!reviewers.length} disabledReason="Invite a mentor or reviewer on the Team tab first" onClick={() => m.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
            Send request
          </Button>
        </>
      }
    >
      {!reviewers.length ? (
        <Banner tone="warning" title="No reviewers yet">
          Invite a mentor or reviewer from the Team tab, then request a review.
        </Banner>
      ) : (
        <div className="space-y-4">
          <Field label="Reviewer">
            <Select value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">All mentors and reviewers ({reviewers.length})</option>
              {reviewers.map((r) => (
                <option key={r.userId} value={r.userId}>
                  {r.name} ({r.role})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note" optional helper="What should they look at? Link the demo or the parts you are unsure about.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

type ScoreRow = { criterion: string; points: string; max: string; comment: string };

function WriteReview({ d }: { d: ProjectDetail }) {
  const [kind, setKind] = useState<Review['kind']>('feedback');
  const [bodyText, setBodyText] = useState('');
  const [skills, setSkills] = useState<string[]>(d.skills.map((s) => s.id));
  const [rows, setRows] = useState<ScoreRow[]>(
    d.rubric ? d.rubric.criteria.map((c) => ({ criterion: c.title, points: '', max: String(Math.max(0, ...c.levels.map((l) => l.points))), comment: '' })) : [],
  );
  const m = useProjectMutation(
    d.project.id,
    () =>
      api.post<{ evidenceCount: number }>(`/projects/${d.project.id}/reviews`, {
        kind,
        body: bodyText,
        rubricScores: rows.filter((r) => r.criterion.trim() && r.points !== '').map((r) => ({ criterion: r.criterion.trim(), points: Number(r.points), max: Number(r.max) || 1, ...(r.comment.trim() ? { comment: r.comment.trim() } : {}) })),
        confirmedSkillIds: kind === 'approval' ? skills : [],
      }),
    (r) => (kind === 'approval' ? `Completion approved. ${r.evidenceCount} verified skill evidence records created.` : 'Review posted'),
  );
  const f = m.error instanceof ApiError ? m.error.fields : {};
  const approved = !!d.project.approvedBy;
  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold">Write a review</h3>
      <p className="mb-3 text-[12.5px] text-muted">Judge the learner's own work. Ask them to walk you through it if you are unsure they understand it.</p>
      <div className="space-y-4">
        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Review['kind'])}>
            <option value="feedback">Feedback</option>
            <option value="code_review">Code review notes</option>
            <option value="changes_requested">Request changes</option>
            <option value="approval" disabled={approved}>
              Approve completion{approved ? ' (already approved)' : ''}
            </option>
          </Select>
        </Field>
        <Field label="Review" error={f.body} helper="Markdown supported.">
          <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={6} maxLength={20000} />
        </Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-medium">Rubric scores {d.rubric ? `(${d.rubric.title})` : <span className="font-normal text-subtle">(optional)</span>}</span>
            {!d.rubric && (
              <Button size="sm" variant="ghost" icon={<PlusIcon size={14} />} onClick={() => setRows([...rows, { criterion: '', points: '', max: '10', comment: '' }])}>
                Add criterion
              </Button>
            )}
          </div>
          {rows.length > 0 && (
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_70px_auto] items-center gap-2">
                  <Input aria-label="Criterion" value={r.criterion} readOnly={!!d.rubric} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, criterion: e.target.value } : x)))} placeholder="Criterion" />
                  <Input aria-label="Points" type="number" min={0} value={r.points} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, points: e.target.value } : x)))} placeholder="Pts" />
                  <Input aria-label="Maximum" type="number" min={1} value={r.max} readOnly={!!d.rubric} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)))} placeholder="Max" />
                  {!d.rubric ? (
                    <Button size="icon-sm" variant="ghost" aria-label="Remove criterion" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      <TrashIcon size={14} />
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
              {f.rubricScores && <p className="text-[12.5px] text-danger">{f.rubricScores}</p>}
            </div>
          )}
        </div>
        {kind === 'approval' && (
          <div className="rounded-md border border-border p-3">
            <div className="text-[13px] font-medium">Skills you confirm the learner demonstrated</div>
            <p className="mb-2 text-[12px] text-muted">Each confirmed skill becomes verified evidence in their Skill DNA, credited to you. Score: rubric total, or 80% without a rubric.</p>
            {d.skills.length ? (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {d.skills.map((s) => (
                  <Checkbox key={s.id} checked={skills.includes(s.id)} onCheckedChange={(v) => setSkills(v ? [...skills, s.id] : skills.filter((x) => x !== s.id))} label={s.name} />
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-subtle">This project lists no skills.</p>
            )}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant={kind === 'approval' ? 'primary' : 'secondary'} loading={m.isPending} disabled={bodyText.trim().length < 10} disabledReason="Write at least a sentence" onClick={() => m.mutate(undefined, { onSuccess: () => setBodyText('') })}>
            {kind === 'approval' ? 'Approve completion' : kind === 'changes_requested' ? 'Request changes' : 'Post review'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function ReviewsTab({ d }: { d: ProjectDetail }) {
  const [requesting, setRequesting] = useState(false);
  const skillName = (id: string) => d.skills.find((s) => s.id === id)?.name ?? 'Skill';
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-3">
        {d.project.approvedBy && d.approvedBy && (
          <Banner tone="success" title="Completion approved by a reviewer">
            {d.approvedBy.name} approved this project on {formatDate(d.project.approvedAt)}. Confirmed skills are verified evidence.
          </Banner>
        )}
        {d.project.status === 'completed' && !d.project.approvedBy && (
          <Banner tone="info" title="Self-completed">
            Marked complete by the owner. Skill evidence from it is unverified until a reviewer approves the project.
          </Banner>
        )}
        {d.access.canEdit && !d.project.approvedBy && (
          <div className="flex justify-end">
            <Button icon={<PaperPlaneTiltIcon size={14} />} onClick={() => setRequesting(true)}>
              Request review
            </Button>
          </div>
        )}
        {!d.reviews.length ? (
          <EmptyState icon={<ChatCircleTextIcon size={22} />} title="No reviews yet" description="Invite a mentor or reviewer, then request a review. Feedback, code review notes and approvals appear here." />
        ) : (
          d.reviews.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={KIND_LABEL[r.kind].tone} icon={r.kind === 'approval' ? <SealCheckIcon size={12} weight="fill" /> : undefined}>
                    {KIND_LABEL[r.kind].label}
                  </Badge>
                  <span className="text-[13px] font-medium">{r.reviewerName}</span>
                  <ProvenanceTag kind="reviewer" />
                </div>
                <span className="text-[12px] text-subtle">{formatDate(r.createdAt)}</span>
              </div>
              <Markdown source={r.body} className="mt-2 text-[14px]" />
              {r.rubricScores?.length ? (
                <table className="mt-3 w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[12px] text-subtle">
                      <th className="py-1 font-medium">Criterion</th>
                      <th className="py-1 text-right font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rubricScores.map((s, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1">
                          {s.criterion}
                          {s.comment && <div className="text-[12px] text-muted">{s.comment}</div>}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {s.points}/{s.max}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {r.kind === 'approval' && r.confirmedSkillIds.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1">
                  <span className="text-[12px] text-muted">Confirmed skills:</span>
                  {r.confirmedSkillIds.map((id) => (
                    <Badge key={id} tone="success">
                      {skillName(id)}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
          ))
        )}
      </div>
      <div>
        {d.access.canReview ? (
          <WriteReview d={d} />
        ) : (
          <Card className="p-5 text-[13px] text-muted">
            Reviews come from mentors and reviewers on the team{d.project.orgId ? ' or faculty of your organization' : ''}. Owners cannot review their own project, so completion approval is always independent.
          </Card>
        )}
      </div>
      {requesting && <RequestReviewDialog d={d} open onOpenChange={setRequesting} />}
    </div>
  );
}
