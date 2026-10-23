import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  CaretLeftIcon,
  CaretRightIcon,
  LinkSimpleIcon,
  PaperclipIcon,
  ShieldWarningIcon,
  SparkleIcon,
  LockSimpleIcon,
  ArrowsClockwiseIcon,
  ChatCircleTextIcon,
  FlagIcon,
  SealCheckIcon,
  ClockCounterClockwiseIcon,
  ArrowsLeftRightIcon,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import {
  Badge,
  Banner,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Dialog,
  ErrorState,
  Field,
  Input,
  Markdown,
  PageHeader,
  ProvenanceTag,
  Segmented,
  Select,
  SkeletonRows,
  Textarea,
} from '@/components/ui';
import { round2, rubricMax, type LatePolicy, type RubricCriterion, type RubricScore } from './shared';

type FileMeta = { id: string; filename: string; mime: string; size: number; url: string };
type Version = { id: string; version: number; status: string; submittedAt: string; isLate: boolean; receiptCode: string | null; contentHash: string | null; text: string | null; links: { label: string; url: string }[]; files: FileMeta[] };
type Evaluation = {
  id: string;
  graderId: string;
  graderName: string;
  rubricScores: RubricScore[];
  rawScore: number;
  latePenalty: number;
  finalScore: number;
  feedback: string | null;
  privateComment: string | null;
  released: boolean;
  releasedAt: string | null;
  supersededBy: string | null;
  reason: string | null;
  aiProposal: { score: number; rationale: string; model: string } | null;
  createdAt: string;
};
type Detail = {
  submission: Version & { userId: string; teamId: string | null };
  isLatestVersion: boolean;
  assignment: { id: string; title: string; instructions: string; objectives: string[]; maxPoints: number; dueAt: string; latePolicy: LatePolicy; rubric: RubricCriterion[] | null; collaboration: string; releasePolicy: 'manual' | 'on_grade'; submissionTypes: string[] };
  rubricMax: number | null;
  cohort: { id: string; name: string };
  student: { id: string; name: string; email: string };
  team: { id: string; name: string; members: { id: string; name: string }[] } | null;
  versions: Version[];
  late: { daysLate: number; percent: number; policyText: string };
  evaluations: Evaluation[];
  current: Evaluation | null;
  similarity:
    | { status: 'computed'; method: string; methodText: string; wording: string; maxScore: number | null; comparedCount: number; note: string | null; computedAt: string; matches: { otherSubmissionId: string; otherUserId: string; otherName: string; score: number }[] }
    | { status: 'pending'; wording: string; methodText: string };
  comments: { id: string; authorId: string; authorName: string; body: string; visibility: 'shared' | 'instructors'; createdAt: string; submissionId: string }[];
  regrades: { id: string; status: string; reason: string; requesterName: string; previousScore: number | null; newScore: number | null; resolutionNote: string | null; createdAt: string; subjectId: string }[];
  integrityReports: { id: string; status: 'open' | 'cleared' | 'confirmed'; note: string; outcomeNote: string | null; reportedByName: string; createdAt: string }[];
  aiProposal: { id: string; criterionScores: RubricScore[]; rationale: string; model: string | null; createdAt: string; label: string } | null;
  ai: { configured: boolean };
  nav: { previous: string | null; next: string | null; nextUngraded: string | null };
};

type AiResult = { ok: true; proposal: { id: string; criterionScores: RubricScore[]; rationale: string; model: string | null }; label: string; complete: boolean } | { ok: false; reason: string; message: string };

function CompareDialog({ a, b, onOpenChange }: { a: string; b: string; onOpenChange: (v: boolean) => void }) {
  const q = useQuery({
    queryKey: ['teach', 'compare', a, b],
    queryFn: () => api.get<{ a: { studentName: string; text: string; version: number }; b: { studentName: string; text: string; version: number }; score: number | null; sharedPhrases: string[]; wording: string; methodText: string }>(`/teach/submissions/${a}/compare/${b}`),
  });
  return (
    <Dialog open onOpenChange={onOpenChange} size="xl" title="Compare side by side" description={q.data?.wording ?? 'Similarity indicator. Not proof of plagiarism; review the texts side by side.'}>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading || !q.data ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="space-y-4">
          <p className="text-[12.5px] text-muted">
            Score {q.data.score === null ? 'not available' : `${Math.round(q.data.score * 100)}%`}. {q.data.methodText}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {[q.data.a, q.data.b].map((s, i) => (
              <div key={i} className="min-w-0 rounded-lg border border-border">
                <div className="border-b border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium">
                  {s.studentName} · v{s.version}
                </div>
                <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words p-3 font-sans text-[13px]">{s.text || 'No text.'}</pre>
              </div>
            ))}
          </div>
          {q.data.sharedPhrases.length > 0 && (
            <div>
              <h3 className="mb-1 text-[13px] font-semibold">Shared five-word sequences (first {q.data.sharedPhrases.length})</h3>
              <ul className="flex flex-wrap gap-1.5">
                {q.data.sharedPhrases.map((p) => (
                  <li key={p} className="rounded bg-warning-soft px-1.5 py-0.5 text-[12px]">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

export default function GradingPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const q = useQuery({ queryKey: ['teach', 'submission', submissionId], queryFn: () => api.get<Detail>(`/teach/submissions/${submissionId}`) });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <SkeletonRows rows={8} />;
  return <GradingView key={`${submissionId}:${q.data.current?.id ?? 'none'}`} d={q.data} />;
}

function GradingView({ d }: { d: Detail }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const a = d.assignment;
  const criteria = a.rubric ?? [];
  const [viewVersion, setViewVersion] = useState(d.submission.id);
  const shown = d.versions.find((v) => v.id === viewVersion) ?? d.submission;
  const [compare, setCompare] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<'submission' | 'instructions'>('submission');

  // ---- Form (prefilled from the current evaluation) ----
  const cur = d.current;
  const [picks, setPicks] = useState<Record<string, { levelLabel: string; comment: string }>>(() => Object.fromEntries((cur?.rubricScores ?? []).map((r) => [r.criterionId, { levelLabel: r.levelLabel, comment: r.comment ?? '' }])));
  const [score, setScore] = useState(cur && !criteria.length ? String(cur.rawScore) : '');
  const [feedback, setFeedback] = useState(cur?.feedback ?? '');
  const [privateComment, setPrivateComment] = useState(cur?.privateComment ?? '');
  const [reason, setReason] = useState('');
  const [waive, setWaive] = useState(false);
  const [returnForRevision, setReturnForRevision] = useState(false);
  const [aiProposalId, setAiProposalId] = useState<string | undefined>(undefined);
  const [ai, setAi] = useState<AiResult | null>(d.aiProposal ? { ok: true, proposal: d.aiProposal, label: d.aiProposal.label, complete: d.aiProposal.criterionScores.length === criteria.length } : null);

  const rubricPoints = criteria.reduce((s, c) => s + (c.levels.find((l) => l.label === picks[c.id]?.levelLabel)?.points ?? 0), 0);
  const max = rubricMax(criteria);
  const allPicked = criteria.every((c) => picks[c.id]?.levelLabel);
  const raw = criteria.length ? (max > 0 ? round2((rubricPoints / max) * a.maxPoints) : 0) : Number(score) || 0;
  const penaltyPoints = waive ? 0 : round2((raw * d.late.percent) / 100);
  const final = Math.max(0, round2(raw - penaltyPoints));
  const reevaluating = !!cur?.released;
  const needsReason = reevaluating || (waive && d.submission.isLate);
  const formError = criteria.length && !allPicked ? 'Choose a level for every criterion' : !criteria.length && (score === '' || Number(score) > a.maxPoints || Number(score) < 0) ? `Enter a score from 0 to ${a.maxPoints}` : needsReason && reason.trim().length < 3 ? (reevaluating ? 'Give a reason for re-evaluating released work' : 'Give a reason for waiving the penalty') : null;

  const evalPayload = () => ({
    ...(criteria.length ? { rubricScores: criteria.map((c) => ({ criterionId: c.id, levelLabel: picks[c.id].levelLabel, ...(picks[c.id].comment.trim() ? { comment: picks[c.id].comment.trim() } : {}) })) } : { score: Number(score) }),
    feedback: feedback.trim() || undefined,
    privateComment: privateComment.trim() || undefined,
    waiveLatePenalty: waive,
    ...(reason.trim() ? { reason: reason.trim() } : {}),
    ...(aiProposalId ? { aiProposalId } : {}),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['teach'] });
  const saveEval = useMutation({
    mutationFn: (release: boolean) => api.post<{ evaluation: Evaluation }>(`/teach/submissions/${d.submission.id}/evaluations`, { ...evalPayload(), release, returnForRevision: release && returnForRevision }),
    onSuccess: (r) => {
      toast.success(r.evaluation.released ? 'Saved and released. The student was notified.' : 'Saved. Not visible to the student until released.');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const releaseCurrent = useMutation({
    mutationFn: () => api.post(`/teach/evaluations/${cur!.id}/release`, { returnForRevision }),
    onSuccess: () => {
      toast.success('Released. The student was notified.');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const askAi = useMutation({
    mutationFn: () => api.post<AiResult>(`/teach/submissions/${d.submission.id}/ai-proposal`),
    onSuccess: (r) => setAi(r),
    onError: (e) => setAi({ ok: false, reason: 'error', message: errorMessage(e) }),
  });

  // ---- Comments, regrade, integrity ----
  const [comment, setComment] = useState('');
  const [visibility, setVisibility] = useState<'shared' | 'instructors'>('shared');
  const postComment = useMutation({
    mutationFn: () => api.post(`/teach/submissions/${d.submission.id}/comments`, { body: comment, visibility }),
    onSuccess: () => {
      toast.success(visibility === 'shared' ? 'Reply sent to the student' : 'Instructor note saved');
      setComment('');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const openRegrade = d.regrades.find((r) => r.status === 'open');
  const [regradeNote, setRegradeNote] = useState('');
  const resolve = useMutation({
    mutationFn: (decision: 'upheld' | 'adjusted' | 'rejected') =>
      api.post(`/teach/regrades/${openRegrade!.id}/resolve`, { decision, note: regradeNote, ...(decision === 'adjusted' ? { evaluation: { ...evalPayload(), reason: undefined } } : {}) }),
    onSuccess: () => {
      toast.success('Regrade decision recorded. The student was notified.');
      setRegradeNote('');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [reporting, setReporting] = useState(false);
  const [reportNote, setReportNote] = useState('');
  const report = useMutation({
    mutationFn: () => api.post(`/teach/submissions/${d.submission.id}/integrity-reports`, { note: reportNote }),
    onSuccess: () => {
      toast.success('Report filed. The student is not notified until a decision is recorded.');
      setReporting(false);
      setReportNote('');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [deciding, setDeciding] = useState<{ id: string; status: 'cleared' | 'confirmed' } | null>(null);
  const [outcome, setOutcome] = useState('');
  const decide = useMutation({
    mutationFn: () => api.post(`/teach/integrity-reports/${deciding!.id}/decide`, { status: deciding!.status, outcomeNote: outcome }),
    onSuccess: () => {
      toast.success('Decision recorded. The student was notified of the outcome.');
      setDeciding(null);
      setOutcome('');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const commentsForVersion = useMemo(() => d.comments, [d.comments]);
  const fieldErr = saveEval.error instanceof ApiError ? saveEval.error.fields : {};

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/teach/grading" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={14} /> Grading queue
          </Link>
        }
        title={d.team ? d.team.name : d.student.name}
        description={`${a.title} · ${d.cohort.name}${d.team ? ` · ${d.team.members.map((m) => m.name).join(', ')}` : ''}`}
        actions={
          <>
            <Button size="sm" icon={<CaretLeftIcon size={14} />} disabled={!d.nav.previous} disabledReason="First submission" onClick={() => nav(`/app/teach/grading/${d.nav.previous}`)}>
              Previous
            </Button>
            <Button size="sm" disabled={!d.nav.next} disabledReason="Last submission" onClick={() => nav(`/app/teach/grading/${d.nav.next}`)}>
              Next <CaretRightIcon size={14} />
            </Button>
            {d.nav.nextUngraded && (
              <ButtonLink size="sm" variant="soft" to={`/app/teach/grading/${d.nav.nextUngraded}`}>
                Next ungraded
              </ButtonLink>
            )}
          </>
        }
      />
      {!d.isLatestVersion && <Banner tone="warning" className="mb-4" title="This is not the latest version">The student has submitted a newer version. Grade the latest version from the queue.</Banner>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* ---------- Left: the submission ---------- */}
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <Segmented label="Left panel" value={leftTab} onChange={setLeftTab} options={[{ value: 'submission', label: 'Submission' }, { value: 'instructions', label: 'Instructions' }]} />
              {leftTab === 'submission' && d.versions.length > 1 && (
                <div className="w-52">
                  <Select value={viewVersion} onChange={(e) => setViewVersion(e.target.value)} aria-label="Version">
                    {d.versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        Version {v.version} · {formatDateTime(v.submittedAt)}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {shown.isLate ? <Badge tone="warning">Late · {d.late.daysLate} day{d.late.daysLate === 1 ? '' : 's'}</Badge> : <Badge tone="success">On time</Badge>}
                <span className="text-[12px] text-subtle" title={formatDateTime(shown.submittedAt)}>
                  Submitted {timeAgo(shown.submittedAt)}
                </span>
              </div>
            </div>
            <CardBody className="pt-4">
              {leftTab === 'instructions' ? (
                <div className="space-y-3">
                  {a.objectives.length > 0 && (
                    <ul className="list-disc pl-5 text-[13.5px]">
                      {a.objectives.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  )}
                  <Markdown source={a.instructions} />
                </div>
              ) : (
                <div className="space-y-4">
                  {shown.text ? <pre className="whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 font-mono text-[13px] leading-relaxed">{shown.text}</pre> : <p className="text-[13px] text-subtle">No written answer.</p>}
                  {shown.links.length > 0 && (
                    <div>
                      <h3 className="mb-1 text-[13px] font-semibold">Links</h3>
                      <ul className="space-y-1">
                        {shown.links.map((l) => (
                          <li key={l.url} className="flex items-center gap-1.5 text-[13.5px]">
                            <LinkSimpleIcon size={14} className="text-subtle" />
                            <a href={l.url} target="_blank" rel="noopener noreferrer" className="break-all text-accent-text hover:underline">
                              {l.label || l.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {shown.files.length > 0 && (
                    <div>
                      <h3 className="mb-1 text-[13px] font-semibold">Files</h3>
                      <ul className="space-y-1">
                        {shown.files.map((f) => (
                          <li key={f.id} className="flex items-center gap-1.5 text-[13.5px]">
                            <PaperclipIcon size={14} className="text-subtle" />
                            <a href={f.url} className="text-accent-text hover:underline" download>
                              {f.filename}
                            </a>
                            <span className="text-[12px] text-subtle">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="text-[11.5px] text-subtle">
                    Receipt {shown.receiptCode ?? 'none'} · content fingerprint {shown.contentHash?.slice(0, 12) ?? 'none'}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-1.5"><ShieldWarningIcon size={16} /> Similarity</span>} description={d.similarity.wording} />
            <CardBody className="space-y-2">
              {d.similarity.status === 'pending' ? (
                <p className="text-[13px] text-muted">Not computed yet. It runs in the background after each submission.</p>
              ) : d.similarity.maxScore === null ? (
                <p className="text-[13px] text-muted">{d.similarity.note}</p>
              ) : !d.similarity.matches.length ? (
                <p className="text-[13px] text-muted">No other submissions of this assignment to compare with yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {d.similarity.matches.map((m) => (
                    <li key={m.otherSubmissionId} className="flex items-center gap-3 py-2 text-[13px]">
                      <span className="flex-1">{m.otherName}</span>
                      <span className={clsx('tabular-nums', m.score >= 0.4 ? 'font-semibold text-warning' : 'text-muted')}>{Math.round(m.score * 100)}%</span>
                      <Button size="sm" variant="ghost" icon={<ArrowsLeftRightIcon size={14} />} onClick={() => setCompare(m.otherSubmissionId)}>
                        Compare
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <details className="text-[12px] text-subtle">
                <summary className="cursor-pointer">How this is calculated</summary>
                <p className="mt-1">{d.similarity.methodText}</p>
              </details>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-1.5"><FlagIcon size={16} /> Academic integrity</span>} description="Students are not notified while a report is open. They are told the outcome once you record a decision." action={<Button size="sm" onClick={() => setReporting(true)} disabled={d.integrityReports.some((r) => r.status === 'open')} disabledReason="A report is already open">File a report</Button>} />
            <CardBody>
              {!d.integrityReports.length ? (
                <p className="text-[13px] text-muted">No reports for this submission.</p>
              ) : (
                <ul className="space-y-3">
                  {d.integrityReports.map((r) => (
                    <li key={r.id} className="rounded-md border border-border p-3 text-[13px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={r.status === 'open' ? 'warning' : r.status === 'confirmed' ? 'danger' : 'success'}>{r.status === 'open' ? 'Open' : r.status === 'confirmed' ? 'Concern confirmed' : 'Cleared'}</Badge>
                        <span className="text-[12px] text-subtle">
                          {r.reportedByName} · {timeAgo(r.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1">{r.note}</p>
                      {r.outcomeNote && <p className="mt-1 text-muted">Outcome: {r.outcomeNote}</p>}
                      {r.status === 'open' && (
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" onClick={() => setDeciding({ id: r.id, status: 'cleared' })}>
                            Clear
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setDeciding({ id: r.id, status: 'confirmed' })}>
                            Confirm concern
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-1.5"><ChatCircleTextIcon size={16} /> Comments</span>} description="Student questions about feedback, your replies, and instructor-only notes." />
            <CardBody className="space-y-3">
              {!commentsForVersion.length ? (
                <p className="text-[13px] text-muted">No comments yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {commentsForVersion.map((c) => (
                    <li key={c.id} className={clsx('rounded-md p-2.5 text-[13px]', c.visibility === 'instructors' ? 'border border-dashed border-border-strong bg-surface-2' : 'bg-surface-2')}>
                      <div className="mb-0.5 flex flex-wrap items-center gap-2 text-[12px] text-subtle">
                        <span className="font-medium text-fg">{c.authorName}</span>
                        <span>{timeAgo(c.createdAt)}</span>
                        {c.visibility === 'instructors' && (
                          <Badge icon={<LockSimpleIcon size={11} />}>Only instructors see this</Badge>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap">{c.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-2">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder={visibility === 'shared' ? 'Reply to the student' : 'Note for other instructors'} aria-label="Comment" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Segmented label="Comment visibility" value={visibility} onChange={setVisibility} options={[{ value: 'shared', label: 'Student can see' }, { value: 'instructors', label: 'Instructors only' }]} />
                  <Button size="sm" variant="primary" loading={postComment.isPending} disabled={!comment.trim()} disabledReason="Write a comment" onClick={() => postComment.mutate()}>
                    {visibility === 'shared' ? 'Send reply' : 'Save note'}
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* ---------- Right: scoring ---------- */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          {openRegrade && (
            <Card className="border-info">
              <CardHeader title={<span className="inline-flex items-center gap-1.5"><ArrowsClockwiseIcon size={16} /> Regrade requested</span>} description={`${openRegrade.requesterName} · ${timeAgo(openRegrade.createdAt)} · current score ${openRegrade.previousScore ?? 'unknown'}`} />
              <CardBody className="space-y-3">
                <blockquote className="border-l-2 border-border-strong pl-3 text-[13px]">{openRegrade.reason}</blockquote>
                <Field label="Decision note for the student">
                  <Textarea value={regradeNote} onChange={(e) => setRegradeNote(e.target.value)} rows={3} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" loading={resolve.isPending && resolve.variables === 'adjusted'} disabled={regradeNote.trim().length < 5 || !!(formError && !formError.startsWith('Give a reason'))} disabledReason={regradeNote.trim().length < 5 ? 'Write a decision note (5+ characters)' : (formError ?? undefined)} onClick={() => resolve.mutate('adjusted')}>
                    Adjust to {final}
                  </Button>
                  <Button size="sm" loading={resolve.isPending && resolve.variables === 'upheld'} disabled={regradeNote.trim().length < 5} disabledReason="Write a decision note (5+ characters)" onClick={() => resolve.mutate('upheld')}>
                    Keep grade
                  </Button>
                  <Button size="sm" variant="ghost" loading={resolve.isPending && resolve.variables === 'rejected'} disabled={regradeNote.trim().length < 5} disabledReason="Write a decision note (5+ characters)" onClick={() => resolve.mutate('rejected')}>
                    Reject request
                  </Button>
                </div>
                <p className="text-[12px] text-subtle">Adjust uses the rubric scores below and records a new evaluation with your note as the reason. The earlier evaluation is kept.</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title={reevaluating ? 'Re-evaluate' : cur ? 'Edit evaluation' : 'Evaluate'}
              description={cur ? `Current: ${cur.finalScore} / ${a.maxPoints}${cur.released ? ', released' : ', not released'}` : a.releasePolicy === 'on_grade' ? 'Grades release to the student as soon as you save.' : 'Grades stay hidden until you release them.'}
            />
            <CardBody className="space-y-4">
              {criteria.length ? (
                criteria.map((c) => (
                  <fieldset key={c.id} className="space-y-1.5">
                    <legend className="text-[13.5px] font-medium">
                      {c.title}
                      {c.description && <span className="block text-[12px] font-normal text-muted">{c.description}</span>}
                    </legend>
                    <div className="grid gap-1.5" role="radiogroup" aria-label={c.title}>
                      {c.levels.map((l) => {
                        const on = picks[c.id]?.levelLabel === l.label;
                        const aiPick = ai?.ok ? ai.proposal.criterionScores.find((x) => x.criterionId === c.id)?.levelLabel === l.label : false;
                        return (
                          <label key={l.label} className={clsx('flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-[13px]', on ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2')}>
                            <input type="radio" name={`crit-${c.id}`} className="mt-0.5 accent-[var(--accent)]" checked={on} onChange={() => setPicks({ ...picks, [c.id]: { levelLabel: l.label, comment: picks[c.id]?.comment ?? '' } })} />
                            <span className="flex-1">
                              <span className="font-medium">{l.label}</span>
                              {l.description && <span className="block text-[12px] text-muted">{l.description}</span>}
                            </span>
                            {aiPick && <Badge tone="info">AI suggests</Badge>}
                            <span className="tabular-nums text-muted">{l.points}</span>
                          </label>
                        );
                      })}
                    </div>
                    <Input value={picks[c.id]?.comment ?? ''} onChange={(e) => setPicks({ ...picks, [c.id]: { levelLabel: picks[c.id]?.levelLabel ?? '', comment: e.target.value } })} placeholder="Comment on this criterion (student sees it)" aria-label={`Comment on ${c.title}`} />
                  </fieldset>
                ))
              ) : (
                <Field label={`Score (out of ${a.maxPoints})`} error={fieldErr.score}>
                  <Input type="number" min={0} max={a.maxPoints} step="0.5" value={score} onChange={(e) => setScore(e.target.value)} className="max-w-[140px]" />
                </Field>
              )}

              <div className="rounded-md bg-surface-2 p-3 text-[13px]" aria-live="polite">
                {criteria.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted">Rubric points</span>
                    <span className="tabular-nums">
                      {rubricPoints} / {max}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted">Raw score{criteria.length ? ` (scaled to ${a.maxPoints})` : ''}</span>
                  <span className="tabular-nums">{raw}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Late penalty</span>
                  <span className="tabular-nums">{penaltyPoints ? `-${penaltyPoints}` : '0'}</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
                  <span>Final score</span>
                  <span className="tabular-nums">
                    {final} / {a.maxPoints}
                  </span>
                </div>
                <p className="mt-2 text-[12px] text-muted">
                  {d.submission.isLate
                    ? `Submitted ${d.late.daysLate} started day${d.late.daysLate === 1 ? '' : 's'} late, so ${d.late.percent}% of the raw score is deducted. ${d.late.policyText}`
                    : 'Submitted on time: no late penalty.'}
                </p>
                {d.submission.isLate && (
                  <div className="mt-2">
                    <Checkbox checked={waive} onCheckedChange={setWaive} label="Waive the late penalty" description="Requires a reason (kept in the audit trail)." />
                  </div>
                )}
              </div>

              <Field label="Feedback for the student" helper="Markdown supported. Shown with the rubric breakdown when released.">
                <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={5} />
              </Field>
              <div className="space-y-1.5 rounded-md border border-dashed border-border-strong p-3">
                <label htmlFor="private-comment" className="flex items-center gap-1.5 text-[13px] font-medium">
                  <LockSimpleIcon size={14} /> Private comment
                  <Badge>Only instructors see this</Badge>
                </label>
                <Textarea id="private-comment" value={privateComment} onChange={(e) => setPrivateComment(e.target.value)} rows={2} placeholder="Never shown to the student" />
              </div>
              {(needsReason || cur) && (
                <Field label={reevaluating ? 'Reason for re-evaluation' : 'Reason'} optional={!needsReason} helper={reevaluating ? 'Required. Creates a new evaluation; the released one is kept in the history.' : undefined} error={fieldErr.reason}>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={reevaluating ? 'e.g. Rubric level misapplied for correctness' : 'Why are you changing this?'} />
                </Field>
              )}
              {aiProposalId && (
                <p className="text-[12px] text-info">
                  Levels were filled from the AI suggestion. You are responsible for the final grade; review every criterion before saving.
                </p>
              )}
              <Checkbox checked={returnForRevision} onCheckedChange={setReturnForRevision} label="Return for revision when released" description="Lets the student revise and resubmit even if resubmission is otherwise off." />
              <div className="flex flex-wrap gap-2">
                {a.releasePolicy === 'manual' && (
                  <Button loading={saveEval.isPending && saveEval.variables === false} disabled={!!formError} disabledReason={formError ?? undefined} onClick={() => saveEval.mutate(false)}>
                    Save without releasing
                  </Button>
                )}
                <Button variant="primary" icon={<SealCheckIcon size={15} />} loading={saveEval.isPending && saveEval.variables === true} disabled={!!formError} disabledReason={formError ?? undefined} onClick={() => saveEval.mutate(true)}>
                  Save and release
                </Button>
                {cur && !cur.released && (
                  <Button variant="soft" loading={releaseCurrent.isPending} onClick={() => releaseCurrent.mutate()}>
                    Release saved grade ({cur.finalScore})
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-1.5"><SparkleIcon size={16} /> AI suggestion</span>} description="Suggests rubric levels from the instructions, rubric and written answer. It never sets a score; you decide." />
            <CardBody className="space-y-3">
              {!d.ai.configured ? (
                <Banner tone="warning" title="AI is not available">No AI provider is configured on this server. Grading works the same without it.</Banner>
              ) : !criteria.length ? (
                <p className="text-[13px] text-muted">AI suggestions need a rubric on the assignment.</p>
              ) : null}
              <Button
                icon={<SparkleIcon size={14} />}
                loading={askAi.isPending}
                disabled={!d.ai.configured || !criteria.length || !shown.text}
                disabledReason={!d.ai.configured ? 'No AI provider is configured' : !criteria.length ? 'Needs a rubric' : 'No written answer to read'}
                onClick={() => askAi.mutate()}
              >
                {ai?.ok ? 'Ask again' : 'Get AI suggestion'}
              </Button>
              {ai && !ai.ok && <Banner tone="warning" title="No suggestion">{ai.message}</Banner>}
              {ai?.ok && (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProvenanceTag kind="ai" />
                    <span className="text-[12px] font-medium">{ai.label}</span>
                  </div>
                  <ul className="text-[13px]">
                    {ai.proposal.criterionScores.map((s) => (
                      <li key={s.criterionId}>
                        {criteria.find((c) => c.id === s.criterionId)?.title}: <span className="font-medium">{s.levelLabel}</span>
                        {s.comment && <span className="text-muted">. {s.comment}</span>}
                      </li>
                    ))}
                  </ul>
                  {ai.proposal.rationale && <p className="text-[12.5px] text-muted">{ai.proposal.rationale}</p>}
                  <Button
                    size="sm"
                    onClick={() => {
                      const next = { ...picks };
                      for (const s of ai.proposal.criterionScores) next[s.criterionId] = { levelLabel: s.levelLabel, comment: next[s.criterionId]?.comment || s.comment || '' };
                      setPicks(next);
                      setAiProposalId(ai.proposal.id);
                      toast.info('Suggestion copied into the form. Review it before saving.');
                    }}
                  >
                    Copy into the form for review
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>

          {d.evaluations.length > 0 && (
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-1.5"><ClockCounterClockwiseIcon size={16} /> Evaluation history</span>} description="Every evaluation is kept. Newer evaluations supersede older ones." />
              <CardBody>
                <ol className="space-y-2.5">
                  {[...d.evaluations].reverse().map((e) => (
                    <li key={e.id} className={clsx('rounded-md border p-2.5 text-[12.5px]', e.supersededBy ? 'border-border opacity-75' : 'border-accent')}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold tabular-nums">
                          {e.finalScore} / {a.maxPoints}
                        </span>
                        {e.latePenalty > 0 && <span className="text-subtle">(raw {e.rawScore}, late -{e.latePenalty})</span>}
                        {e.supersededBy ? <Badge>Superseded</Badge> : <Badge tone="accent">Current</Badge>}
                        {e.released ? <Badge tone="success">Released</Badge> : <Badge>Not released</Badge>}
                        {e.aiProposal && <Badge tone="info">Reviewed an AI suggestion</Badge>}
                      </div>
                      <div className="mt-0.5 text-subtle">
                        {e.graderName} · {formatDateTime(e.createdAt)}
                      </div>
                      {e.reason && <div className="mt-0.5">Reason: {e.reason}</div>}
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          )}

          {d.regrades.filter((r) => r.status !== 'open').length > 0 && (
            <Card>
              <CardHeader title="Past regrade requests" />
              <CardBody>
                <ul className="space-y-2 text-[12.5px]">
                  {d.regrades
                    .filter((r) => r.status !== 'open')
                    .map((r) => (
                      <li key={r.id}>
                        <Badge>{r.status}</Badge> {r.previousScore} to {r.newScore}. {r.resolutionNote}
                      </li>
                    ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {compare && <CompareDialog a={d.submission.id} b={compare} onOpenChange={(v) => !v && setCompare(null)} />}
      <Dialog
        open={reporting}
        onOpenChange={setReporting}
        title="File an academic integrity report"
        description="Describe what you observed. A similarity score alone is not evidence; note what you saw when comparing the texts. The student is told only the outcome, once you decide."
        footer={
          <>
            <Button onClick={() => setReporting(false)}>Cancel</Button>
            <Button variant="primary" loading={report.isPending} disabled={reportNote.trim().length < 10} disabledReason="Write at least 10 characters" onClick={() => report.mutate()}>
              File report
            </Button>
          </>
        }
      >
        <Textarea value={reportNote} onChange={(e) => setReportNote(e.target.value)} rows={5} aria-label="Report note" />
      </Dialog>
      <Dialog
        open={!!deciding}
        onOpenChange={(v) => !v && setDeciding(null)}
        title={deciding?.status === 'cleared' ? 'Clear this report' : 'Confirm a concern'}
        description="The student is notified of the outcome and can read the note you write here."
        footer={
          <>
            <Button onClick={() => setDeciding(null)}>Cancel</Button>
            <Button variant={deciding?.status === 'confirmed' ? 'danger' : 'primary'} loading={decide.isPending} disabled={outcome.trim().length < 5} disabledReason="Write the outcome (5+ characters)" onClick={() => decide.mutate()}>
              Record decision
            </Button>
          </>
        }
      >
        <Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={4} aria-label="Outcome note" />
      </Dialog>
    </div>
  );
}
