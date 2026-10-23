import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MagnifyingGlassIcon, UsersIcon, NotePencilIcon, SealCheckIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Menu, Select, SkeletonRows, Textarea, Tooltip } from '@/components/ui';
import { ALL_STAGES, CAMPUS_KEY, EligibilityBadge, StageBadge, STAGE_LABELS, TableWrap, td, th, listGroup, nativeCheckbox } from './shared';
import type { DriveDetail } from './DriveDetailPage';
import type { Candidate } from './types';

type CandidateList = { items: Candidate[]; total: number; stageCounts: Record<string, number> };

export function useCandidates(driveId: string, filters: { stage?: string; q?: string } = {}) {
  return useQuery({ queryKey: [...CAMPUS_KEY, 'drive', driveId, 'candidates', filters], queryFn: () => api.get<CandidateList>(`/campus/drives/${driveId}/candidates${qs(filters)}`) });
}

export function AssessmentCell({ a }: { a: Candidate['assessment'] }) {
  if (!a) return <span className="text-subtle">No assessment</span>;
  if (a.final && a.percent !== null)
    return (
      <span className="tabular-nums">
        {a.percent}% <span className="text-[12px] text-subtle">({a.score}/{a.maxScore})</span>
      </span>
    );
  const label: Record<string, string> = { not_invited: 'Not invited', invited: 'Invited, not started', in_progress: 'In progress', submitted: 'Submitted, grading', grading: 'Grading', needs_review: 'Needs manual review' };
  return <span className="text-[12.5px] text-muted">{label[a.status] ?? a.status}</span>;
}

/** Stage change for one candidate, with optional note and offer CTC. */
export function StageDialog({ driveId, candidate, initialStage, onClose }: { driveId: string; candidate: Candidate | null; initialStage?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [stage, setStage] = useState(initialStage ?? candidate?.stage ?? 'registered');
  const [note, setNote] = useState('');
  const [ctc, setCtc] = useState(candidate?.offerCtcText ?? '');
  const m = useMutation({
    mutationFn: () => api.patch(`/campus/drives/${driveId}/candidates/${candidate!.id}`, { stage, note: note.trim() || undefined, ...(stage === 'offer' || stage === 'placed' ? { offerCtcText: ctc.trim() || null } : {}) }),
    onSuccess: () => {
      toast.success(stage === candidate?.stage ? 'Note saved' : `Moved to ${STAGE_LABELS[stage]}. The student was notified.`);
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={!!candidate}
      onOpenChange={(v) => !v && onClose()}
      title={candidate ? `Update ${candidate.student.name}` : ''}
      description="Stage changes are recorded in the candidate's history and the audit log, and the student is notified."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={stage === candidate?.stage && !note.trim() && ctc === (candidate?.offerCtcText ?? '')} disabledReason="Change the stage or add a note" onClick={() => m.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Stage">
          <Select value={stage} onChange={(e) => setStage(e.target.value)}>
            {ALL_STAGES.filter((s) => s !== 'invited' || candidate?.stage === 'invited').map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        {(stage === 'offer' || stage === 'placed') && (
          <Field label="Offer CTC (as stated in the offer)" optional helper="Stored as text. Reports never estimate a number from it.">
            <Input value={ctc} onChange={(e) => setCtc(e.target.value)} placeholder="12 LPA" />
          </Field>
        )}
        <Field label="Internal note" optional helper="Visible to campus staff only.">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function HistoryDialog({ driveId, candidate, onClose }: { driveId: string; candidate: Candidate | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: [...CAMPUS_KEY, 'drive', driveId, 'history', candidate?.id],
    queryFn: () => api.get<{ events: { id: string; fromStage: string | null; toStage: string; note: string | null; actorKind: string; actorName: string | null; createdAt: string }[] }>(`/campus/drives/${driveId}/candidates/${candidate!.id}/history`),
    enabled: !!candidate,
  });
  return (
    <Dialog open={!!candidate} onOpenChange={(v) => !v && onClose()} title={`History: ${candidate?.student.name ?? ''}`}>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <SkeletonRows rows={3} />
      ) : (
        <ol className="space-y-2 border-l border-border pl-3">
          {q.data.events.map((e) => (
            <li key={e.id} className="text-[13px]">
              <div className="flex items-center gap-2">
                <StageBadge stage={e.toStage} />
                <span className="text-[12px] text-subtle">
                  {formatDateTime(e.createdAt)} · {e.actorKind === 'student' ? 'by the student' : (e.actorName ?? 'system')}
                </span>
              </div>
              {e.note && <p className="mt-0.5 text-muted">{e.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

export function CandidatesTab({ d }: { d: DriveDetail }) {
  const qc = useQueryClient();
  const driveId = d.drive.id;
  const [stage, setStage] = useState('');
  const [q, setQ] = useState('');
  const list = useCandidates(driveId, { stage: stage || undefined, q: q || undefined });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState('');
  const [bulkNote, setBulkNote] = useState('');
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [editing, setEditing] = useState<{ c: Candidate; stage?: string } | null>(null);
  const [history, setHistory] = useState<Candidate | null>(null);
  const bulk = useMutation({
    mutationFn: () => api.post<{ moved: number; unchanged: number }>(`/campus/drives/${driveId}/candidates/bulk-stage`, { candidateIds: [...selected], stage: bulkStage, note: bulkNote.trim() || undefined, confirm: true }),
    onSuccess: (r) => {
      toast.success(`${r.moved} candidate${r.moved === 1 ? '' : 's'} moved to ${STAGE_LABELS[bulkStage]}${r.unchanged ? `, ${r.unchanged} already there` : ''}`);
      setConfirmBulk(false);
      setSelected(new Set());
      setBulkNote('');
      qc.invalidateQueries({ queryKey: CAMPUS_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const data = list.data;
  const selectedNames = data?.items.filter((i) => selected.has(i.id)).map((i) => i.student.name) ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stage" className="w-44">
          <option value="">All stages ({data ? Object.values(data.stageCounts).reduce((a, b) => a + b, 0) : 0})</option>
          {ALL_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]} ({data?.stageCounts[s] ?? 0})
            </option>
          ))}
        </Select>
        <div className="relative w-full max-w-xs">
          <MagnifyingGlassIcon size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or roll" className="pl-8" aria-label="Search candidates" />
        </div>
        {selected.size > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2 rounded-md bg-surface-2 px-2 py-1">
            <span className="text-[12.5px]">{selected.size} selected</span>
            <Select value={bulkStage} onChange={(e) => setBulkStage(e.target.value)} aria-label="Move to stage" className="w-40">
              <option value="">Move to...</option>
              {ALL_STAGES.filter((s) => s !== 'invited').map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="primary" icon={<ArrowRightIcon size={13} />} disabled={!bulkStage} disabledReason="Choose a stage" onClick={() => setConfirmBulk(true)}>
              Move
            </Button>
          </div>
        )}
      </div>
      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !data ? (
        <SkeletonRows rows={5} />
      ) : !data.items.length ? (
        <EmptyState icon={<UsersIcon size={22} />} title={stage || q ? 'No candidates match' : 'No candidates yet'} description={stage || q ? 'Try another stage or search.' : 'Invite eligible students from the Eligibility tab once the drive is open.'} />
      ) : (
        <TableWrap>
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-border">
              <tr>
                <th className={`${th} w-10 pr-0`}>
                  <input type="checkbox" className={nativeCheckbox} aria-label="Select all" checked={data.items.every((i) => selected.has(i.id))} onChange={(e) => setSelected(e.target.checked ? new Set(data.items.map((i) => i.id)) : new Set())} />
                </th>
                <th className={th}>Student</th>
                <th className={th}>Stage</th>
                <th className={th}>At invitation</th>
                <th className={th}>Assessment</th>
                <th className={th}>Interview</th>
                <th className={th}>Notes</th>
                <th className={th} aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.map((c) => {
                const nextIv = c.interviews.find((i) => i.status === 'scheduled');
                return (
                  <tr key={c.id}>
                    <td className={`${td} pr-0`}>
                      <input
                        type="checkbox"
                        className={nativeCheckbox}
                        aria-label={`Select ${c.student.name}`}
                        checked={selected.has(c.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(c.id);
                          else next.delete(c.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className={td}>
                      {c.student.recordId ? (
                        <Link to={`/app/campus/students/${c.student.recordId}`} className="font-medium hover:underline">
                          {c.student.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{c.student.name}</span>
                      )}
                      <div className="text-[12px] text-subtle">{c.student.rollNumber ?? c.student.email}</div>
                    </td>
                    <td className={td}>
                      <StageBadge stage={c.stage} />
                      {c.offerCtcText && <div className="mt-0.5 text-[12px] text-muted">{c.offerCtcText}</div>}
                    </td>
                    <td className={td}>
                      {c.eligibilitySnapshot ? (
                        <div className="space-y-0.5">
                          <EligibilityBadge value={c.eligibilitySnapshot.status} />
                          {c.eligibilitySnapshot.manualInclusion && (
                            <Tooltip content={c.eligibilitySnapshot.manualInclusion.reason}>
                              <span>
                                <Badge tone="info">Manually included</Badge>
                              </span>
                            </Tooltip>
                          )}
                        </div>
                      ) : (
                        <span className="text-subtle">Not recorded</span>
                      )}
                    </td>
                    <td className={td}>
                      <AssessmentCell a={c.assessment} />
                    </td>
                    <td className={td}>{nextIv ? formatDateTime(nextIv.scheduledAt) : c.interviews.length ? `${c.interviews.length} past` : <span className="text-subtle">None</span>}</td>
                    <td className={`${td} max-w-[200px]`}>
                      <span className="line-clamp-2 text-[12.5px] text-muted">{c.notes}</span>
                      <span className="text-[11.5px] text-subtle">updated {timeAgo(c.updatedAt)}</span>
                    </td>
                    <td className={`${td} text-right`}>
                      <Menu
                        items={[
                          { label: 'Change stage', icon: <ArrowRightIcon size={14} />, onSelect: () => setEditing({ c }) },
                          { label: 'Add note', icon: <NotePencilIcon size={14} />, onSelect: () => setEditing({ c, stage: c.stage }) },
                          { label: 'Record offer', icon: <SealCheckIcon size={14} />, onSelect: () => setEditing({ c, stage: 'offer' }) },
                          'separator',
                          { label: 'View history', onSelect: () => setHistory(c) },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        title={`Move ${selected.size} candidate${selected.size === 1 ? '' : 's'} to ${STAGE_LABELS[bulkStage] ?? ''}?`}
        description={
          <>
            <p>Each student is notified and the change is audited.</p>
            <p className="mt-1 text-[12.5px]">{selectedNames.slice(0, 8).join(', ')}{selectedNames.length > 8 ? ` and ${selectedNames.length - 8} more` : ''}</p>
          </>
        }
        confirmLabel="Move candidates"
        danger={bulkStage === 'rejected'}
        loading={bulk.isPending}
        onConfirm={() => bulk.mutate()}
      >
        <Field label="Note for the history" optional>
          <Textarea rows={2} value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} />
        </Field>
      </ConfirmDialog>
      {editing && <StageDialog driveId={driveId} candidate={editing.c} initialStage={editing.stage} onClose={() => setEditing(null)} />}
      <HistoryDialog driveId={driveId} candidate={history} onClose={() => setHistory(null)} />
    </div>
  );
}

const OUTCOME_GROUPS: { stages: string[]; title: string; hint: string }[] = [
  { stages: ['interview'], title: 'Interviewing', hint: 'Record an offer or a decision after interviews.' },
  { stages: ['offer'], title: 'Offers', hint: 'Mark placed when the student accepts, or declined if they turn it down.' },
  { stages: ['placed'], title: 'Placed', hint: '' },
  { stages: ['rejected', 'withdrawn', 'declined'], title: 'Closed', hint: '' },
];

export function OutcomesTab({ d }: { d: DriveDetail }) {
  const list = useCandidates(d.drive.id);
  const [editing, setEditing] = useState<{ c: Candidate; stage: string } | null>(null);
  if (list.error) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  if (!list.data) return <SkeletonRows rows={4} />;
  const groups = OUTCOME_GROUPS.map((g) => ({ ...g, items: list.data.items.filter((c) => g.stages.includes(c.stage)) }));
  if (!groups.some((g) => g.items.length))
    return <EmptyState icon={<SealCheckIcon size={22} />} title="No outcomes yet" description="Candidates appear here once they reach interviews. Record offers, placements and decisions from this view." />;
  const actions = (c: Candidate): ReactNode => {
    const btn = (stage: string, label: string, variant: 'primary' | 'secondary' | 'ghost' = 'secondary') => (
      <Button key={stage} size="sm" variant={variant} onClick={() => setEditing({ c, stage })}>
        {label}
      </Button>
    );
    if (c.stage === 'interview') return [btn('offer', 'Record offer', 'primary'), btn('rejected', 'Not selected', 'ghost')];
    if (c.stage === 'offer') return [btn('placed', 'Mark placed', 'primary'), btn('declined', 'Declined', 'ghost')];
    return null;
  };
  return (
    <div className="space-y-8">
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <section key={g.title}>
            <div className="mb-3">
              <h3 className="text-[16px] font-semibold tracking-[-0.01em]">
                {g.title} <span className="text-[14px] font-normal text-subtle">({g.items.length})</span>
              </h3>
              {g.hint && <p className="mt-0.5 text-[13px] text-muted">{g.hint}</p>}
            </div>
            <ul className={listGroup}>
              {g.items.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5 text-[13.5px]">
                  <span className="min-w-0 flex-1 font-semibold">{c.student.name}</span>
                  <StageBadge stage={c.stage} />
                  {c.offerCtcText && <span className="text-muted">CTC: {c.offerCtcText}</span>}
                  {actions(c) && <div className="flex gap-1.5">{actions(c)}</div>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      {editing && <StageDialog driveId={d.drive.id} candidate={editing.c} initialStage={editing.stage} onClose={() => setEditing(null)} />}
    </div>
  );
}
