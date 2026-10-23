import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  CaretLeftIcon,
  SparkleIcon,
  LinkSimpleIcon,
  PaperclipIcon,
  PlusIcon,
  TrashIcon,
  ReceiptIcon,
  CheckCircleIcon,
  CloudCheckIcon,
  CloudSlashIcon,
  CircleNotchIcon,
  ClockIcon,
  ChatCircleTextIcon,
  ArrowsClockwiseIcon,
  UsersThreeIcon,
  UploadSimpleIcon,
  ClockCounterClockwiseIcon,
  WarningIcon,
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
  ConfirmDialog,
  CopyButton,
  Dialog,
  ErrorState,
  Field,
  Input,
  Markdown,
  PageHeader,
  SkeletonRows,
  Textarea,
} from '@/components/ui';
import { PeerSection } from './PeerSection';
import { RubricTable, WorkStatusBadge, latePolicyExplain, type LatePolicy, type RubricCriterion, type RubricScore, type WorkStatus } from '../teach/shared';

type FileMeta = { id: string; filename: string; mime: string; size: number; url: string };
type Link_ = { label: string; url: string };
type Sub = { id: string; version: number; status: string; text: string | null; links: Link_[]; fileIds: string[]; submittedAt: string | null; isLate: boolean; receiptCode: string | null; contentHash: string | null; savedAt: string | null; files: FileMeta[] };
type StudentEval = { id: string; rubricScores: RubricScore[]; rawScore: number; latePenalty: number; finalScore: number; feedback: string | null; releasedAt: string | null; reason: string | null; createdAt: string };
type Detail = {
  assignment: {
    id: string;
    orgId: string;
    title: string;
    objectives: string[];
    instructions: string;
    availableFrom: string | null;
    dueAt: string;
    maxPoints: number;
    rubric: RubricCriterion[] | null;
    submissionTypes: ('text' | 'file' | 'link')[];
    acceptedFileTypes: string[];
    collaboration: 'individual' | 'team' | 'discuss_only';
    latePolicy: LatePolicy;
    allowResubmission: boolean;
    maxResubmissions: number;
    status: 'published' | 'closed';
  };
  cohort: { id: string; name: string } | null;
  course: { id: string; code: string; title: string } | null;
  skills: { id: string; name: string; slug: string }[];
  latePolicyText: string;
  team: { id: string; name: string; members: { id: string; name: string }[] } | null;
  needsTeam: boolean;
  status: WorkStatus;
  window: { open: boolean; reason: string | null; isLate: boolean; cutoffAt: string | null; penaltyPreviewPercent?: number; daysLate?: number };
  resubmission: { allowed: boolean; used: number; max: number; remaining: number; reason: string | null };
  canEdit: boolean;
  draft: Sub | null;
  current: (Sub & { submittedByName: string }) | null;
  versions: { id: string; version: number; status: string; submittedAt: string | null; isLate: boolean; receiptCode: string | null; contentHash: string | null; savedAt: string | null; text: string | null; links: Link_[]; fileCount: number; submittedByName: string }[];
  feedback: { evaluation: StudentEval; history: StudentEval[]; latePenaltyDays: number } | null;
  comments: { id: string; body: string; createdAt: string; authorName: string; mine: boolean }[];
  regrades: { id: string; status: string; reason: string; previousScore: number | null; newScore: number | null; resolutionNote: string | null; createdAt: string; resolvedAt: string | null }[];
  integrity: { id: string; status: 'cleared' | 'confirmed'; outcomeNote: string | null }[];
  guideLink: string;
};
type Receipt = { code: string | null; version: number; submittedAt: string; contentHash: string | null; isLate: boolean; daysLate: number; latePenaltyPercent: number };

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Countdown({ dueAt, cutoffAt, done }: { dueAt: string; cutoffAt: string | null; done?: boolean }) {
  const now = useNow();
  const ms = new Date(dueAt).getTime() - now;
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86400_000);
  const h = Math.floor((abs % 86400_000) / 3600_000);
  const m = Math.floor((abs % 3600_000) / 60_000);
  const text = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (
    <div className={clsx('rounded-lg border p-5 shadow-1', done ? 'border-border bg-surface' : ms < 0 ? 'border-danger/30 bg-danger-soft' : ms < 86400_000 ? 'border-warning/30 bg-warning-soft' : 'border-border bg-surface')} role="timer" aria-live="off">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
        <ClockIcon size={15} /> {done ? (ms < 0 ? 'Was due' : 'Due in') : ms < 0 ? 'Past due by' : 'Due in'}
      </div>
      <div className="mt-1.5 font-display text-[28px] font-semibold leading-9 tracking-[-0.02em] tabular-nums">{text}</div>
      <div className="mt-0.5 text-[12.5px] text-muted">{formatDateTime(dueAt)}</div>
      {ms < 0 && cutoffAt && !done && <div className="mt-1 text-[12px] text-muted">Late submissions close {formatDateTime(cutoffAt)}</div>}
    </div>
  );
}

function wordCount(s: string) {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

/** Draft editor with autosave. Saves 1.5 s after the last change; the indicator always says what state the draft is in. */
function DraftEditor({ d, onSubmitted }: { d: Detail; onSubmitted: (r: Receipt) => void }) {
  const qc = useQueryClient();
  const a = d.assignment;
  const base = d.draft ?? (d.current ? { text: d.current.text, links: d.current.links, files: d.current.files } : null);
  const [text, setText] = useState(base?.text ?? '');
  const [links, setLinks] = useState<Link_[]>(base?.links ?? []);
  const [files, setFiles] = useState<FileMeta[]>(base?.files ?? []);
  const [savedAt, setSavedAt] = useState<string | null>(d.draft?.savedAt ?? null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(d.draft ? 'saved' : 'idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [ownWork, setOwnWork] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const payload = useMemo(() => ({ text, links: links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() })), fileIds: files.map((f) => f.id) }), [text, links, files]);
  const lastSaved = useRef(JSON.stringify(d.draft ? { text: d.draft.text ?? '', links: d.draft.links, fileIds: d.draft.fileIds } : base ? { text: base.text ?? '', links: base.links, fileIds: base.files.map((f) => f.id) } : { text: '', links: [], fileIds: [] }));
  const dirty = JSON.stringify(payload) !== lastSaved.current;

  const save = useMutation({
    mutationFn: (p: typeof payload) => api.put<{ draft: Sub }>(`/teach/my/assignments/${a.id}/draft`, p),
    onMutate: () => setSaveState('saving'),
    onSuccess: (r, p) => {
      lastSaved.current = JSON.stringify(p);
      setSavedAt(r.draft.savedAt);
      setSaveState('saved');
      setSaveError(null);
    },
    onError: (e) => {
      setSaveState('error');
      setSaveError(errorMessage(e));
    },
  });

  useEffect(() => {
    if (!dirty) return;
    const invalidLink = payload.links.some((l) => !/^https?:\/\/\S+$/i.test(l.url));
    if (invalidLink) return; // wait until links look complete
    const t = setTimeout(() => save.mutate(payload), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, dirty]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || save.isPending) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, save.isPending]);

  const submit = useMutation({
    mutationFn: () => api.post<{ receipt: Receipt }>(`/teach/my/assignments/${a.id}/submit`, { ...payload, confirm: true }),
    onSuccess: (r) => {
      setConfirming(false);
      lastSaved.current = JSON.stringify(payload);
      qc.invalidateQueries({ queryKey: ['my-assignment', a.id] });
      qc.invalidateQueries({ queryKey: ['my-assignments'] });
      onSubmitted(r.receipt);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(list)) {
        const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
        if (a.acceptedFileTypes.length && !a.acceptedFileTypes.includes(ext)) {
          toast.error(`${f.name} is not an accepted type (${a.acceptedFileTypes.join(', ')}).`);
          continue;
        }
        const form = new FormData();
        form.append('purpose', 'submission');
        form.append('orgId', a.orgId);
        form.append('file', f);
        const r = await api.upload<{ file: FileMeta }>('/files', form);
        setFiles((x) => [...x, r.file]);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const allowText = a.submissionTypes.includes('text');
  const allowLink = a.submissionTypes.includes('link');
  const allowFile = a.submissionTypes.includes('file');
  const empty = !text.trim() && !payload.links.length && !files.length;
  const badLink = payload.links.find((l) => !/^https?:\/\/\S+$/i.test(l.url));
  const nextVersion = (d.versions[d.versions.length - 1]?.status === 'draft' ? d.versions[d.versions.length - 1].version : (d.versions[d.versions.length - 1]?.version ?? 0) + 1) || 1;
  const submitReason = empty ? 'Add your work first' : badLink ? 'Fix the link that is not a full https:// address' : undefined;
  const penalty = d.window.penaltyPreviewPercent ?? 0;

  return (
    <Card>
      <CardHeader
        title={d.current ? `Revise and resubmit (version ${nextVersion})` : 'Your work'}
        description={d.current ? `You can resubmit ${d.resubmission.remaining} more time${d.resubmission.remaining === 1 ? '' : 's'}. Earlier versions are kept.` : 'Drafts save automatically and are private until you submit.'}
        action={
          <span className="inline-flex items-center gap-1 text-[12px] text-muted" aria-live="polite">
            {saveState === 'saving' ? (
              <>
                <CircleNotchIcon size={14} className="animate-spin" /> Saving
              </>
            ) : saveState === 'error' ? (
              <>
                <CloudSlashIcon size={14} className="text-danger" /> Not saved
              </>
            ) : dirty ? (
              <>Unsaved changes</>
            ) : savedAt ? (
              <>
                <CloudCheckIcon size={14} className="text-success" /> Draft saved {timeAgo(savedAt)}
              </>
            ) : null}
          </span>
        }
      />
      <CardBody className="space-y-4">
        {saveState === 'error' && (
          <Banner tone="danger" title="Your draft could not be saved" action={<Button size="sm" onClick={() => save.mutate(payload)}>Retry</Button>}>
            {saveError}
          </Banner>
        )}
        {allowText && (
          <Field label="Written answer" helper={`${wordCount(text)} words. Markdown and code are fine.`}>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} className="font-mono text-[13px]" />
          </Field>
        )}
        {allowLink && (
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium">Links</legend>
            {links.map((l, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[180px_1fr_36px]">
                <Input value={l.label} onChange={(e) => setLinks(links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} placeholder="Label (e.g. Repository)" aria-label={`Link ${i + 1} label`} />
                <Input
                  value={l.url}
                  onChange={(e) => setLinks(links.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))}
                  placeholder="https://"
                  aria-label={`Link ${i + 1} address`}
                  aria-invalid={l.url.trim() !== '' && !/^https?:\/\/\S+$/i.test(l.url.trim()) ? true : undefined}
                />
                <Button size="icon" variant="ghost" aria-label={`Remove link ${i + 1}`} onClick={() => setLinks(links.filter((_, k) => k !== i))}>
                  <TrashIcon size={14} />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<PlusIcon size={13} />} onClick={() => setLinks([...links, { label: '', url: '' }])} disabled={links.length >= 20}>
              Add link
            </Button>
          </fieldset>
        )}
        {allowFile && (
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium">Files</legend>
            <p className="text-[12px] text-muted">{a.acceptedFileTypes.length ? `Accepted: ${a.acceptedFileTypes.join(', ')}.` : 'PDF, images, text, Markdown, CSV, JSON, ZIP or DOCX.'} Up to 10 MB each.</p>
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-[13px]">
                    <PaperclipIcon size={14} className="text-subtle" />
                    <a href={f.url} className="text-accent-text hover:underline" download>
                      {f.filename}
                    </a>
                    <span className="text-[12px] text-subtle">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${f.filename}`} onClick={() => setFiles(files.filter((x) => x.id !== f.id))}>
                      <TrashIcon size={13} />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <input ref={fileInput} type="file" multiple className="sr-only" id="submission-files" accept={a.acceptedFileTypes.map((x) => `.${x}`).join(',') || undefined} onChange={(e) => upload(e.target.files)} />
            <Button size="sm" icon={<UploadSimpleIcon size={14} />} loading={uploading} disabled={files.length >= 10} disabledReason="Up to 10 files" onClick={() => fileInput.current?.click()}>
              Attach files
            </Button>
          </fieldset>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          {d.window.isLate && <span className="mr-auto text-[12.5px] text-warning">Submitting now counts as late{penalty ? ` (${penalty}% penalty)` : ''}.</span>}
          <Button variant="primary" disabled={!!submitReason} disabledReason={submitReason} onClick={() => setConfirming(true)}>
            {d.current ? 'Review and resubmit' : 'Review and submit'}
          </Button>
        </div>
      </CardBody>

      <Dialog
        open={confirming}
        onOpenChange={(v) => {
          setConfirming(v);
          if (!v) setOwnWork(false);
        }}
        title={d.current ? `Resubmit as version ${nextVersion}?` : 'Submit your work?'}
        description="Check what will be submitted. You will get a receipt with a code."
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Keep editing</Button>
            <Button variant="primary" loading={submit.isPending} disabled={!ownWork} disabledReason="Confirm the statement first" onClick={() => submit.mutate()}>
              Submit
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13.5px]">
          <ul className="space-y-1.5">
            {allowText && (
              <li>
                Written answer: <span className="font-medium">{text.trim() ? `${wordCount(text)} words` : 'none'}</span>
              </li>
            )}
            {allowLink && (
              <li>
                Links: <span className="font-medium">{payload.links.length ? payload.links.map((l) => l.label || l.url).join(', ') : 'none'}</span>
              </li>
            )}
            {allowFile && (
              <li>
                Files: <span className="font-medium">{files.length ? files.map((f) => f.filename).join(', ') : 'none'}</span>
              </li>
            )}
            {d.team && (
              <li>
                Team submission for <span className="font-medium">{d.team.name}</span>: every member gets the receipt.
              </li>
            )}
          </ul>
          {d.window.isLate ? (
            <Banner tone="warning" title={`This submission is late (${d.window.daysLate} started day${d.window.daysLate === 1 ? '' : 's'})`}>
              {penalty ? `Your score will be reduced by ${penalty}% under the late policy.` : 'The late policy has no penalty.'} {latePolicyExplain(a.latePolicy, a.maxPoints).summary}
            </Banner>
          ) : (
            <p className="text-muted">On time. Due {formatDateTime(a.dueAt)}.</p>
          )}
          {d.current && <p className="text-muted">Version {d.current.version} stays in your history. Your instructor will grade the newest version.</p>}
          {!d.current && !a.allowResubmission && <p className="text-muted">This assignment does not allow resubmission, so this is final.</p>}
          <Checkbox checked={ownWork} onCheckedChange={setOwnWork} label={a.collaboration === 'team' ? 'This is our team’s own work, following the collaboration rules.' : 'This is my own work, following the collaboration rules for this assignment.'} />
        </div>
      </Dialog>
    </Card>
  );
}

function ReceiptView({ r, title }: { r: Receipt; title: string }) {
  return (
    <div className="space-y-2 text-[13.5px]">
      <div className="flex items-center gap-2 text-success">
        <CheckCircleIcon size={20} weight="fill" /> <span className="font-semibold text-fg">Submitted: {title}</span>
      </div>
      <dl className="grid grid-cols-[140px_1fr] gap-y-1">
        <dt className="text-muted">Receipt code</dt>
        <dd className="flex items-center gap-1 font-mono font-semibold">
          {r.code} {r.code && <CopyButton value={r.code} label="Copy code" />}
        </dd>
        <dt className="text-muted">Version</dt>
        <dd>{r.version}</dd>
        <dt className="text-muted">Submitted at</dt>
        <dd>{formatDateTime(r.submittedAt)}</dd>
        <dt className="text-muted">Timeliness</dt>
        <dd>{r.isLate ? `Late by ${r.daysLate} started day${r.daysLate === 1 ? '' : 's'}${r.latePenaltyPercent ? `, ${r.latePenaltyPercent}% penalty` : ''}` : 'On time'}</dd>
        <dt className="text-muted">Fingerprint</dt>
        <dd className="break-all font-mono text-[12px]">{r.contentHash}</dd>
      </dl>
      <p className="text-[12px] text-subtle">The fingerprint is a hash of exactly what you submitted. Keep the code in case you need to show when and what you submitted.</p>
    </div>
  );
}

export default function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-assignment', id], queryFn: () => api.get<Detail>(`/teach/my/assignments/${id}`) });
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [comment, setComment] = useState('');
  const [regradeOpen, setRegradeOpen] = useState(false);
  const [regradeReason, setRegradeReason] = useState('');
  const [discarding, setDiscarding] = useState(false);
  const [showVersion, setShowVersion] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['my-assignment', id] });
  const ask = useMutation({
    mutationFn: () => api.post(`/teach/my/submissions/${q.data!.current!.id}/comments`, { body: comment }),
    onSuccess: () => {
      toast.success('Question sent to your instructor');
      setComment('');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const regrade = useMutation({
    mutationFn: () => api.post(`/teach/my/submissions/${q.data!.current!.id}/regrade`, { reason: regradeReason }),
    onSuccess: () => {
      toast.success('Regrade request sent. You will be notified of the decision.');
      setRegradeOpen(false);
      setRegradeReason('');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const discard = useMutation({
    mutationFn: () => api.del(`/teach/my/assignments/${id}/draft`),
    onSuccess: () => {
      toast.success('Draft discarded');
      setDiscarding(false);
      setEditing(false);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const viewReceipt = useMutation({
    mutationFn: (subId: string) => api.get<{ receipt: Receipt }>(`/teach/my/submissions/${subId}/receipt`),
    onSuccess: (r) => setReceipt(r.receipt),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} className="mx-auto max-w-5xl" />;
  if (q.isLoading || !q.data) return <SkeletonRows rows={8} className="mx-auto max-w-5xl" />;
  const d = q.data;
  const a = d.assignment;
  const policy = latePolicyExplain(a.latePolicy, a.maxPoints);
  const openRegrade = d.regrades.find((r) => r.status === 'open');
  const regradeReasonDisabled = !d.feedback ? 'Available after feedback is released' : openRegrade ? 'You already have an open request' : undefined;
  const showEditor = d.canEdit && (!d.current || editing || !!d.draft);
  const notOpenYet = a.availableFrom && new Date(a.availableFrom).getTime() > Date.now();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        breadcrumb={
          <Link to="/app/assignments" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={14} /> Assignments
          </Link>
        }
        title={a.title}
        badge={<WorkStatusBadge status={d.status} />}
        description={[d.course ? `${d.course.code} · ${d.course.title}` : null, d.cohort?.name, `${a.maxPoints} points`].filter(Boolean).join(' · ')}
        actions={
          <ButtonLink to={d.guideLink} icon={<SparkleIcon size={15} />}>
            Get guidance from the assignment guide
          </ButtonLink>
        }
      />
      <p className="-mt-4 mb-7 text-[12.5px] text-subtle">The assignment guide is an AI that explains concepts and asks guiding questions. It will not write your submission.</p>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {d.integrity.map((r) => (
            <Banner key={r.id} tone={r.status === 'confirmed' ? 'danger' : 'success'} title={r.status === 'confirmed' ? 'Academic integrity review: concern found' : 'Academic integrity review closed: no concern found'}>
              {r.outcomeNote}
            </Banner>
          ))}

          {d.feedback && (
            <Card>
              <CardHeader
                title="Feedback"
                description={`Released ${timeAgo(d.feedback.evaluation.releasedAt)}`}
                action={
                  <div className="text-right">
                    <div className="font-display text-[24px] font-semibold leading-7 tabular-nums">
                      {d.feedback.evaluation.finalScore} <span className="text-[14px] font-normal text-muted">/ {a.maxPoints}</span>
                    </div>
                  </div>
                }
              />
              <CardBody className="space-y-4">
                {d.feedback.evaluation.latePenalty > 0 && (
                  <p className="text-[13px] text-muted">
                    Raw score {d.feedback.evaluation.rawScore}, minus {d.feedback.evaluation.latePenalty} for submitting {d.feedback.latePenaltyDays} started day{d.feedback.latePenaltyDays === 1 ? '' : 's'} late.
                  </p>
                )}
                {d.status === 'returned' && <Banner tone="warning" title="Returned for revision">Your instructor returned this so you can revise it. Use the editor below to resubmit.</Banner>}
                {a.rubric && d.feedback.evaluation.rubricScores.length > 0 && <RubricTable criteria={a.rubric} selected={d.feedback.evaluation.rubricScores} />}
                {d.feedback.evaluation.feedback ? <Markdown source={d.feedback.evaluation.feedback} /> : <p className="text-[13px] text-muted">No written comments.</p>}
                {d.feedback.history.length > 1 && (
                  <details className="text-[13px]">
                    <summary className="cursor-pointer text-muted">Grade history ({d.feedback.history.length} released evaluations)</summary>
                    <ol className="mt-2 space-y-1">
                      {d.feedback.history.map((h) => (
                        <li key={h.id}>
                          {formatDateTime(h.releasedAt ?? h.createdAt)}: {h.finalScore} / {a.maxPoints}
                          {h.reason ? ` (${h.reason})` : ''}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <Button size="sm" icon={<ArrowsClockwiseIcon size={14} />} disabled={!!regradeReasonDisabled} disabledReason={regradeReasonDisabled} onClick={() => setRegradeOpen(true)}>
                    Request a regrade
                  </Button>
                </div>
                {d.regrades.length > 0 && (
                  <ul className="space-y-1.5 text-[13px]">
                    {d.regrades.map((r) => (
                      <li key={r.id} className="rounded-md bg-surface-2 p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={r.status === 'open' ? 'info' : r.status === 'adjusted' ? 'success' : 'neutral'}>
                            {{ open: 'Regrade pending', upheld: 'Grade kept after review', adjusted: 'Grade adjusted', rejected: 'Request not accepted' }[r.status] ?? r.status}
                          </Badge>
                          <span className="text-[12px] text-subtle">{timeAgo(r.createdAt)}</span>
                          {r.status === 'adjusted' && (
                            <span className="text-[12px]">
                              {r.previousScore} to {r.newScore}
                            </span>
                          )}
                        </div>
                        {r.resolutionNote && <p className="mt-1">{r.resolutionNote}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}

          {receipt && (
            <Card className="border-success">
              <CardBody className="pt-4">
                <ReceiptView r={receipt} title={a.title} />
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => setReceipt(null)}>
                  Hide receipt
                </Button>
              </CardBody>
            </Card>
          )}

          {d.needsTeam && <Banner tone="warning" title="You are not in a team yet">This is a team assignment. Ask your instructor to add you to a team before you can start.</Banner>}
          {notOpenYet && <Banner tone="info" title={`Opens ${formatDateTime(a.availableFrom)}`}>You can read the instructions now. Submissions open at that time.</Banner>}
          {!d.window.open && !notOpenYet && !d.current && <Banner tone="danger" title="Submissions are closed">{d.window.reason}</Banner>}

          {showEditor ? (
            <>
              <DraftEditor key={d.draft?.id ?? d.current?.id ?? 'new'} d={d} onSubmitted={(r) => { setReceipt(r); setEditing(false); toast.success(`Submitted. Receipt ${r.code}.`); }} />
              {d.draft && (
                <div className="-mt-3 flex justify-end">
                  <Button size="sm" variant="ghost" icon={<TrashIcon size={13} />} onClick={() => setDiscarding(true)}>
                    Discard draft
                  </Button>
                </div>
              )}
            </>
          ) : null}

          {d.current && (
            <Card>
              <CardHeader
                title={`Submitted work (version ${d.current.version})`}
                description={`${d.current.isLate ? 'Late. ' : ''}Submitted ${formatDateTime(d.current.submittedAt)}${d.team ? ` by ${d.current.submittedByName}` : ''}`}
                action={
                  <div className="flex gap-2">
                    <Button size="sm" icon={<ReceiptIcon size={14} />} loading={viewReceipt.isPending} onClick={() => viewReceipt.mutate(d.current!.id)}>
                      Receipt
                    </Button>
                    {d.canEdit && !showEditor && (
                      <Button size="sm" variant="primary" onClick={() => setEditing(true)}>
                        Revise and resubmit
                      </Button>
                    )}
                  </div>
                }
              />
              <CardBody className="space-y-3">
                {d.current.text && <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 font-mono text-[13px]">{d.current.text}</pre>}
                {d.current.links.length > 0 && (
                  <ul className="space-y-1 text-[13.5px]">
                    {d.current.links.map((l) => (
                      <li key={l.url} className="flex items-center gap-1.5">
                        <LinkSimpleIcon size={14} className="text-subtle" />
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="break-all text-accent-text hover:underline">
                          {l.label || l.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {d.current.files.length > 0 && (
                  <ul className="space-y-1 text-[13.5px]">
                    {d.current.files.map((f) => (
                      <li key={f.id} className="flex items-center gap-1.5">
                        <PaperclipIcon size={14} className="text-subtle" />
                        <a href={f.url} className="text-accent-text hover:underline" download>
                          {f.filename}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {!d.canEdit && d.resubmission.reason && <p className="text-[12.5px] text-muted">{d.resubmission.reason}</p>}
              </CardBody>
            </Card>
          )}

          {d.current && (
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-1.5"><ChatCircleTextIcon size={16} /> Questions about feedback</span>} description="Ask your instructor for clarification. Only you, your team and your instructors can see this." />
              <CardBody className="space-y-3">
                {d.comments.length > 0 && (
                  <ul className="space-y-2">
                    {d.comments.map((c) => (
                      <li key={c.id} className={clsx('rounded-md p-2.5 text-[13px]', c.mine ? 'bg-accent-soft' : 'bg-surface-2')}>
                        <div className="mb-0.5 text-[12px] text-subtle">
                          <span className="font-medium text-fg">{c.mine ? 'You' : c.authorName}</span> · {timeAgo(c.createdAt)}
                        </div>
                        <p className="whitespace-pre-wrap">{c.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="What would you like to understand better?" aria-label="Your question" />
                <div className="flex justify-end">
                  <Button size="sm" variant="primary" loading={ask.isPending} disabled={comment.trim().length < 2} disabledReason="Write your question" onClick={() => ask.mutate()}>
                    Send question
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          <PeerSection assignmentId={a.id} rubric={a.rubric} maxPoints={a.maxPoints} />

          <Card>
            <CardHeader title="Instructions" />
            <CardBody className="space-y-4">
              {a.objectives.length > 0 && (
                <div>
                  <h3 className="mb-1 text-[13px] font-semibold">Objectives</h3>
                  <ul className="list-disc space-y-0.5 pl-5 text-[13.5px]">
                    {a.objectives.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Markdown source={a.instructions} />
              {a.rubric && (
                <div>
                  <h3 className="mb-1.5 text-[13px] font-semibold">How it will be graded</h3>
                  <RubricTable criteria={a.rubric} />
                </div>
              )}
            </CardBody>
          </Card>

          {d.versions.filter((v) => v.status !== 'draft').length > 0 && (
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-1.5"><ClockCounterClockwiseIcon size={16} /> Version history</span>} description="Every submitted version is kept." />
              <CardBody>
                <ol className="divide-y divide-border">
                  {d.versions
                    .filter((v) => v.status !== 'draft')
                    .reverse()
                    .map((v) => (
                      <li key={v.id} className="py-3 text-[13px] first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">Version {v.version}</span>
                          <span className="text-subtle">{formatDateTime(v.submittedAt)}</span>
                          {v.isLate && <Badge tone="warning">Late</Badge>}
                          <span className="font-mono text-[12px] text-subtle">{v.receiptCode}</span>
                          <div className="ml-auto flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setShowVersion(showVersion === v.id ? null : v.id)}>
                              {showVersion === v.id ? 'Hide' : 'View'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => viewReceipt.mutate(v.id)}>
                              Receipt
                            </Button>
                          </div>
                        </div>
                        {showVersion === v.id && (
                          <div className="mt-2 space-y-1">
                            {v.text && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-2.5 font-mono text-[12.5px]">{v.text}</pre>}
                            {v.links.map((l) => (
                              <div key={l.url} className="break-all text-[12.5px]">
                                {l.label || l.url}: {l.url}
                              </div>
                            ))}
                            {v.fileCount > 0 && <div className="text-[12.5px] text-muted">{v.fileCount} file{v.fileCount === 1 ? '' : 's'} attached</div>}
                          </div>
                        )}
                      </li>
                    ))}
                </ol>
              </CardBody>
            </Card>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <Countdown dueAt={a.dueAt} cutoffAt={d.window.cutoffAt} done={!!d.current} />
          <Card>
            <CardHeader title="Late policy" />
            <CardBody className="space-y-2 text-[13px] leading-relaxed">
              <p>{policy.summary}</p>
              {policy.example && <p className="text-muted">{policy.example}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Rules" />
            <CardBody className="space-y-2.5 text-[13px] leading-relaxed">
              <p>
                <span className="font-medium">Submit as: </span>
                {a.submissionTypes.map((t) => ({ text: 'written answer', file: 'files', link: 'links' })[t]).join(', ')}
                {a.acceptedFileTypes.length > 0 && ` (${a.acceptedFileTypes.join(', ')})`}
              </p>
              <p>
                <span className="font-medium">Collaboration: </span>
                {{ individual: 'Individual work.', discuss_only: 'You may discuss ideas with classmates, but submit your own work.', team: 'Team submission. One submission counts for the whole team.' }[a.collaboration]}
              </p>
              {d.team && (
                <p className="inline-flex items-start gap-1.5">
                  <UsersThreeIcon size={15} className="mt-0.5 text-subtle" />
                  <span>
                    {d.team.name}: {d.team.members.map((m) => m.name).join(', ')}
                  </span>
                </p>
              )}
              <p>
                <span className="font-medium">Resubmission: </span>
                {a.allowResubmission ? `Allowed up to ${a.maxResubmissions} time${a.maxResubmissions === 1 ? '' : 's'} after your first submission (${d.resubmission.used} used).` : 'Not allowed. Your first submission is final unless your instructor returns it.'}
              </p>
              {d.skills.length > 0 && (
                <div>
                  <span className="font-medium">Skills: </span>
                  {d.skills.map((s) => s.name).join(', ')}
                  <p className="mt-0.5 text-[12px] text-muted">Your graded result becomes verified evidence in your Skill DNA once released.</p>
                </div>
              )}
            </CardBody>
          </Card>
          {d.window.open && d.window.isLate && (
            <Banner tone="warning" title="Past the due time">
              <span className="inline-flex items-start gap-1">
                <WarningIcon size={14} className="mt-0.5" /> Submitting now applies a {d.window.penaltyPreviewPercent ?? 0}% penalty.
              </span>
            </Banner>
          )}
        </aside>
      </div>

      <Dialog
        open={regradeOpen}
        onOpenChange={setRegradeOpen}
        title="Request a regrade"
        description="Explain which part you believe was graded incorrectly and why, referring to the rubric. Your instructor will review it and you will be notified of the decision."
        footer={
          <>
            <Button onClick={() => setRegradeOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={regrade.isPending} disabled={regradeReason.trim().length < 10} disabledReason="Write at least 10 characters" onClick={() => regrade.mutate()}>
              Send request
            </Button>
          </>
        }
      >
        <Field label="Reason" error={regrade.error instanceof ApiError ? regrade.error.fields.reason : undefined}>
          <Textarea value={regradeReason} onChange={(e) => setRegradeReason(e.target.value)} rows={5} />
        </Field>
      </Dialog>
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title="Discard this draft?"
        description="The unsubmitted draft is deleted. Submitted versions are not affected."
        confirmLabel="Discard draft"
        danger
        loading={discard.isPending}
        onConfirm={() => discard.mutate()}
      />
    </div>
  );
}
