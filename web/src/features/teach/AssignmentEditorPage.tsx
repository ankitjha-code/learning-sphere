import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CaretLeftIcon,
  CheckCircleIcon,
  CircleIcon,
  WarningCircleIcon,
  PlusIcon,
  TrashIcon,
  RocketLaunchIcon,
  LockSimpleIcon,
  DownloadSimpleIcon,
  CopyIcon,
  XCircleIcon,
  ArrowCounterClockwiseIcon,
  UsersThreeIcon,
  ShuffleIcon,
  XIcon,
  SealCheckIcon,
  InfoIcon,
} from '@phosphor-icons/react';
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
  Markdown,
  Menu,
  PageHeader,
  Segmented,
  Select,
  SkeletonRows,
  StatusBadge,
  Switch,
  Tabs,
  Textarea,
  buttonClass,
} from '@/components/ui';
import { LIST_GROUP, RubricTable, TABLE_WRAP, THEAD, TH, TR, TD, WorkStatusBadge, csvHref, latePolicyExplain, useLookups, type LatePolicy, type RubricCriterion, type WorkStatus } from './shared';
import { RubricEditorDialog } from './RubricsPage';
import { PeerReviewTab } from './PeerReviewTab';

type Assignment = {
  id: string;
  orgId: string;
  cohortId: string;
  courseId: string | null;
  title: string;
  objectives: string[];
  instructions: string;
  availableFrom: string | null;
  dueAt: string;
  maxPoints: number;
  rubricId: string | null;
  submissionTypes: ('text' | 'file' | 'link')[];
  acceptedFileTypes: string[];
  collaboration: 'individual' | 'team' | 'discuss_only';
  latePolicy: LatePolicy;
  allowResubmission: boolean;
  maxResubmissions: number;
  skillIds: string[];
  status: 'draft' | 'published' | 'closed';
  releasePolicy: 'manual' | 'on_grade';
  updatedAt: string;
};

type Detail = {
  assignment: Assignment;
  cohort: { id: string; name: string };
  course: { id: string; code: string; title: string } | null;
  rubric: { id: string | null; title: string; criteria: RubricCriterion[]; snapshot: boolean; version: number | null } | null;
  skills: { id: string; name: string; slug: string }[];
  teams: { id: string; name: string; memberIds: string[]; members: { id: string; name: string }[] }[];
  students: {
    userId: string;
    name: string;
    email: string;
    team: { id: string; name: string } | null;
    status: WorkStatus;
    hasDraft: boolean;
    submissionId: string | null;
    version: number | null;
    submittedAt: string | null;
    isLate: boolean;
    daysLate: number;
    evaluation: { id: string; finalScore: number; released: boolean } | null;
  }[];
  counts: { students: number; notStarted: number; drafts: number; submitted: number; late: number; graded: number; released: number };
  checklist: { items: { key: string; label: string; ok: boolean; blocking: boolean; detail?: string }[]; canPublish: boolean };
  latePolicyText: string;
  lockedFields: string[];
};

type FormState = {
  cohortId: string;
  courseId: string;
  title: string;
  objectives: string[];
  instructions: string;
  availableFrom: string;
  dueAt: string;
  maxPoints: string;
  rubricId: string;
  submissionTypes: ('text' | 'file' | 'link')[];
  acceptedFileTypes: string;
  collaboration: 'individual' | 'team' | 'discuss_only';
  allowLate: boolean;
  penaltyPercentPerDay: string;
  hardCutoffDays: string;
  allowResubmission: boolean;
  maxResubmissions: string;
  skillIds: string[];
  releasePolicy: 'manual' | 'on_grade';
};

function defaultDue() {
  const d = new Date(Date.now() + 7 * 86400_000);
  d.setHours(23, 59, 0, 0);
  return toLocalInput(d.toISOString());
}

function toForm(a?: Assignment, cohortId = ''): FormState {
  return {
    cohortId: a?.cohortId ?? cohortId,
    courseId: a?.courseId ?? '',
    title: a?.title ?? '',
    objectives: a?.objectives ?? [],
    instructions: a?.instructions ?? '',
    availableFrom: a?.availableFrom ? toLocalInput(a.availableFrom) : '',
    dueAt: a ? toLocalInput(a.dueAt) : defaultDue(),
    maxPoints: String(a?.maxPoints ?? 100),
    rubricId: a?.rubricId ?? '',
    submissionTypes: a?.submissionTypes ?? ['text'],
    acceptedFileTypes: (a?.acceptedFileTypes ?? []).join(', '),
    collaboration: a?.collaboration ?? 'individual',
    allowLate: a?.latePolicy.allowLate ?? true,
    penaltyPercentPerDay: String(a?.latePolicy.penaltyPercentPerDay ?? 10),
    hardCutoffDays: a ? (a.latePolicy.hardCutoffDays === undefined || a.latePolicy.hardCutoffDays === null ? '' : String(a.latePolicy.hardCutoffDays)) : '3',
    allowResubmission: a?.allowResubmission ?? false,
    maxResubmissions: String(a?.maxResubmissions || 1),
    skillIds: a?.skillIds ?? [],
    releasePolicy: a?.releasePolicy ?? 'manual',
  };
}

function toPayload(f: FormState) {
  return {
    courseId: f.courseId || null,
    title: f.title.trim(),
    objectives: f.objectives.map((o) => o.trim()).filter(Boolean),
    instructions: f.instructions,
    availableFrom: fromLocalInput(f.availableFrom),
    dueAt: fromLocalInput(f.dueAt) ?? new Date().toISOString(),
    maxPoints: Number(f.maxPoints) || 0,
    rubricId: f.rubricId || null,
    submissionTypes: f.submissionTypes,
    acceptedFileTypes: f.acceptedFileTypes
      .split(',')
      .map((s) => s.trim().replace(/^\./, '').toLowerCase())
      .filter(Boolean),
    collaboration: f.collaboration,
    latePolicy: { allowLate: f.allowLate, penaltyPercentPerDay: Number(f.penaltyPercentPerDay) || 0, hardCutoffDays: f.hardCutoffDays === '' ? null : Number(f.hardCutoffDays) },
    allowResubmission: f.allowResubmission,
    maxResubmissions: f.allowResubmission ? Number(f.maxResubmissions) || 0 : 0,
    skillIds: f.skillIds,
    releasePolicy: f.releasePolicy,
  };
}

/** PATCH only what changed, so untouched dates are never rewritten (and students are not told a deadline moved). */
function changedFields<T extends Record<string, unknown>>(next: T, initial: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(next) as (keyof T)[]) if (JSON.stringify(next[k]) !== JSON.stringify(initial[k])) out[k] = next[k];
  return out;
}

// ---------- Editor form ----------

function AssignmentForm({ detail, initialCohort }: { detail?: Detail; initialCohort: string }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const lookups = useLookups();
  const a = detail?.assignment;
  const [f, setF] = useState<FormState>(() => toForm(a, initialCohort));
  const [preview, setPreview] = useState<'write' | 'preview'>('write');
  const [newRubric, setNewRubric] = useState(false);
  const [skillPick, setSkillPick] = useState('');
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  const locked = new Set(detail?.lockedFields ?? []);
  const lockedReason = 'Locked after publishing because submissions and grades depend on it';
  const cohorts = useQuery({ queryKey: ['teach', 'cohorts', 'mine', ''], queryFn: () => api.get<{ items: { id: string; name: string; students: number }[] }>('/teach/cohorts') });
  const courses = useQuery({ queryKey: ['teach', 'courses'], queryFn: () => api.get<{ items: { id: string; code: string; title: string; cohorts: { id: string }[] }[] }>('/teach/courses') });
  const rubrics = useQuery({ queryKey: ['teach', 'rubrics'], queryFn: () => api.get<{ items: { id: string; title: string; criteria: RubricCriterion[]; version: number }[] }>('/teach/rubrics') });
  const selectedRubric = rubrics.data?.items.find((r) => r.id === f.rubricId);
  const dirty = useMemo(() => JSON.stringify(toPayload(f)) !== JSON.stringify(toPayload(toForm(a, initialCohort))), [f, a, initialCohort]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const save = useMutation({
    mutationFn: () => (a ? api.patch<{ assignment: Assignment }>(`/teach/assignments/${a.id}`, changedFields(toPayload(f), toPayload(toForm(a, initialCohort)))) : api.post<{ assignment: Assignment }>('/teach/assignments', { cohortId: f.cohortId, ...toPayload(f) })),
    onSuccess: (r) => {
      toast.success(a ? 'Changes saved' : 'Draft created. Review the publish checklist.');
      qc.invalidateQueries({ queryKey: ['teach'] });
      if (!a) nav(`/app/teach/assignments/${r.assignment.id}`, { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = save.error instanceof ApiError ? save.error.fields : {};
  const policy = latePolicyExplain({ allowLate: f.allowLate, penaltyPercentPerDay: Number(f.penaltyPercentPerDay) || 0, hardCutoffDays: f.hardCutoffDays === '' ? null : Number(f.hardCutoffDays) }, Number(f.maxPoints) || 100);
  const canSave = f.title.trim().length >= 3 && !!f.cohortId && !!f.dueAt && f.submissionTypes.length > 0;
  const saveReason = !f.cohortId ? 'Choose a cohort' : f.title.trim().length < 3 ? 'Enter a title of at least 3 characters' : !f.submissionTypes.length ? 'Allow at least one way to submit' : undefined;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Basics" />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cohort" error={fields.cohortId} helper={a ? 'The cohort cannot change after creation. Duplicate the assignment to reuse it.' : undefined}>
              <Select value={f.cohortId} onChange={(e) => set('cohortId', e.target.value)} disabled={!!a}>
                <option value="">Choose a cohort</option>
                {cohorts.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.students} students)
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Course" optional>
              <Select value={f.courseId} onChange={(e) => set('courseId', e.target.value)}>
                <option value="">None</option>
                {courses.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Title" error={fields.title}>
            <Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Assignment 3: Binary search trees" />
          </Field>
          <div className="space-y-1.5">
            <div className="text-[13px] font-medium">
              Learning objectives <span className="font-normal text-subtle">(recommended)</span>
            </div>
            {f.objectives.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input value={o} onChange={(e) => set('objectives', f.objectives.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`Objective ${i + 1}`} placeholder="Students will be able to..." />
                <Button size="icon" variant="ghost" aria-label={`Remove objective ${i + 1}`} onClick={() => set('objectives', f.objectives.filter((_, k) => k !== i))}>
                  <TrashIcon size={14} />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<PlusIcon size={13} />} onClick={() => set('objectives', [...f.objectives, ''])} disabled={f.objectives.length >= 12}>
              Add objective
            </Button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="instructions" className="text-[13px] font-medium">
                Instructions
              </label>
              <Segmented label="Instructions view" value={preview} onChange={setPreview} options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />
            </div>
            {preview === 'write' ? (
              <Textarea id="instructions" value={f.instructions} onChange={(e) => set('instructions', e.target.value)} rows={12} className="font-mono text-[13px]" placeholder={'## Task\nDescribe the task.\n\n## What to submit\n- ...'} />
            ) : (
              <div className="min-h-[200px] rounded-md border border-border bg-surface p-3">{f.instructions.trim() ? <Markdown source={f.instructions} /> : <p className="text-[13px] text-subtle">Nothing to preview yet.</p>}</div>
            )}
            <p className="text-[12px] text-subtle">Markdown: headings, lists, links, code blocks. Students see exactly the preview.</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Dates and points" />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Opens" optional helper="Empty means it opens when you publish." error={fields.availableFrom}>
              <Input type="datetime-local" value={f.availableFrom} onChange={(e) => set('availableFrom', e.target.value)} />
            </Field>
            <Field label="Due" error={fields.dueAt}>
              <Input type="datetime-local" value={f.dueAt} onChange={(e) => set('dueAt', e.target.value)} />
            </Field>
            <Field label="Maximum points" error={fields.maxPoints}>
              <Input type="number" min={1} max={1000} value={f.maxPoints} onChange={(e) => set('maxPoints', e.target.value)} disabled={locked.has('maxPoints')} title={locked.has('maxPoints') ? lockedReason : undefined} />
            </Field>
          </div>
          {a?.status === 'published' && <p className="text-[12.5px] text-muted">Changing the due date notifies every student in the cohort.</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Rubric" description="Grading criteria. When you publish, the assignment keeps a copy of the rubric version in use." />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1">
              <Field label="Rubric" optional>
                <Select value={f.rubricId} onChange={(e) => set('rubricId', e.target.value)} disabled={locked.has('rubricId')} title={locked.has('rubricId') ? lockedReason : undefined}>
                  <option value="">No rubric (grade with a single score)</option>
                  {rubrics.data?.items.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} (v{r.version})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {!locked.has('rubricId') && (
              <Button icon={<PlusIcon size={14} />} onClick={() => setNewRubric(true)}>
                Build a new rubric
              </Button>
            )}
          </div>
          {locked.has('rubricId') && detail?.rubric ? (
            <>
              <p className="inline-flex items-center gap-1 text-[12.5px] text-muted">
                <LockSimpleIcon size={13} /> Published with this rubric. It is locked so grades stay comparable.
              </p>
              <RubricTable criteria={detail.rubric.criteria} />
            </>
          ) : selectedRubric ? (
            <RubricTable criteria={selectedRubric.criteria} />
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Submission" />
        <CardBody className="space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium">Students can submit</legend>
            <div className="flex flex-wrap gap-5">
              {(['text', 'file', 'link'] as const).map((t) => (
                <Checkbox
                  key={t}
                  checked={f.submissionTypes.includes(t)}
                  onCheckedChange={(v) => set('submissionTypes', v ? [...f.submissionTypes, t] : f.submissionTypes.filter((x) => x !== t))}
                  label={{ text: 'Written answer', file: 'File uploads', link: 'Links' }[t]}
                />
              ))}
            </div>
            {fields.submissionTypes && <p className="mt-1 text-[12.5px] text-danger">{fields.submissionTypes}</p>}
          </fieldset>
          {f.submissionTypes.includes('file') && (
            <Field label="Accepted file types" optional helper="Comma-separated extensions, for example pdf, zip, md. Empty accepts any supported type." error={fields.acceptedFileTypes}>
              <Input value={f.acceptedFileTypes} onChange={(e) => set('acceptedFileTypes', e.target.value)} placeholder="pdf, zip" />
            </Field>
          )}
          <Field label="Collaboration" helper={{ individual: 'Each student submits their own work.', team: 'One submission per team; create teams before publishing.', discuss_only: 'Students may discuss ideas but each submits their own work.' }[f.collaboration]}>
            <Select value={f.collaboration} onChange={(e) => set('collaboration', e.target.value as FormState['collaboration'])} disabled={locked.has('collaboration')} title={locked.has('collaboration') ? lockedReason : undefined}>
              <option value="individual">Individual</option>
              <option value="discuss_only">Discuss together, submit individually</option>
              <option value="team">Team submission</option>
            </Select>
          </Field>
          <div className="space-y-3 rounded-md bg-surface-2 p-4">
            <Switch checked={f.allowResubmission} onCheckedChange={(v) => set('allowResubmission', v)} label="Allow resubmission" description="Every submitted version is kept. Graders see the latest version and the history." />
            {f.allowResubmission && (
              <Field label="Resubmissions allowed after the first submission">
                <Input type="number" min={1} max={10} value={f.maxResubmissions} onChange={(e) => set('maxResubmissions', e.target.value)} className="max-w-[120px]" />
              </Field>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Late policy" />
        <CardBody className="space-y-4">
          <Switch checked={f.allowLate} onCheckedChange={(v) => set('allowLate', v)} label="Accept late submissions" />
          {f.allowLate && (
            <div className="space-y-4 rounded-md bg-surface-2 p-4">
              <Field label="Penalty per started day late (%)">
                <Input type="number" min={0} max={100} value={f.penaltyPercentPerDay} onChange={(e) => set('penaltyPercentPerDay', e.target.value)} className="max-w-[160px]" />
              </Field>
              <Field label="Close submissions this many days after the due time" optional helper="Empty means no final cutoff.">
                <Input type="number" min={0} max={60} value={f.hardCutoffDays} onChange={(e) => set('hardCutoffDays', e.target.value)} className="max-w-[160px]" />
              </Field>
            </div>
          )}
          <Banner tone="info" title="What students will read">
            {policy.summary} {policy.example}
          </Banner>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Skills and release" />
        <CardBody className="space-y-4">
          <div className="space-y-1.5">
            <div className="text-[13px] font-medium">
              Skills assessed <span className="font-normal text-subtle">(optional)</span>
            </div>
            <p className="text-[12.5px] text-muted">When a grade is released, each skill gets verified Skill DNA evidence because an instructor graded it.</p>
            <div className="flex flex-wrap gap-1.5">
              {f.skillIds.map((id) => {
                const s = lookups.data?.skills.find((x) => x.id === id);
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[12px] text-accent-text">
                    {s?.name ?? 'Skill'}
                    <button aria-label={`Remove ${s?.name ?? 'skill'}`} onClick={() => set('skillIds', f.skillIds.filter((x) => x !== id))}>
                      <XIcon size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="max-w-sm">
              <Select
                value={skillPick}
                aria-label="Add a skill"
                onChange={(e) => {
                  const v = e.target.value;
                  if (v && !f.skillIds.includes(v) && f.skillIds.length < 10) set('skillIds', [...f.skillIds, v]);
                  setSkillPick('');
                }}
              >
                <option value="">Add a skill</option>
                {lookups.data?.skills
                  .filter((s) => !f.skillIds.includes(s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.category})
                    </option>
                  ))}
              </Select>
            </div>
          </div>
          <Field label="Releasing grades" helper={f.releasePolicy === 'manual' ? 'Grades stay hidden until you release them (one by one or all at once).' : 'Each grade is released to the student as soon as you save it.'}>
            <Select value={f.releasePolicy} onChange={(e) => set('releasePolicy', e.target.value as FormState['releasePolicy'])}>
              <option value="manual">I release grades manually</option>
              <option value="on_grade">Release each grade when saved</option>
            </Select>
          </Field>
        </CardBody>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-2 border-t border-border bg-bg/95 px-1 py-3 backdrop-blur">
        {dirty && <span className="mr-auto text-[12.5px] text-warning">Unsaved changes</span>}
        {a && (
          <Button onClick={() => setF(toForm(a, initialCohort))} disabled={!dirty}>
            Discard changes
          </Button>
        )}
        <Button variant="primary" loading={save.isPending} disabled={!canSave || (!!a && !dirty)} disabledReason={saveReason ?? (a && !dirty ? 'No changes to save' : undefined)} onClick={() => save.mutate()}>
          {a ? 'Save changes' : 'Create draft'}
        </Button>
      </div>
      {newRubric && <RubricEditorDialog open onOpenChange={setNewRubric} onSaved={(r) => set('rubricId', r.id)} />}
    </div>
  );
}

// ---------- Publish panel ----------

function PublishPanel({ detail }: { detail: Detail }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const a = detail.assignment;
  const [confirm, setConfirm] = useState<null | 'publish' | 'close' | 'delete'>(null);
  const action = useMutation({
    mutationFn: (kind: 'publish' | 'close' | 'reopen' | 'duplicate' | 'delete') =>
      kind === 'delete' ? api.del(`/teach/assignments/${a.id}`) : api.post<{ assignment?: Assignment; notified?: number }>(`/teach/assignments/${a.id}/${kind}`),
    onSuccess: (r, kind) => {
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['teach'] });
      if (kind === 'publish') toast.success(`Published. ${(r as { notified?: number }).notified ?? 0} students notified.`);
      if (kind === 'close') toast.success('Closed. Students can no longer submit.');
      if (kind === 'reopen') toast.success('Reopened for submissions.');
      if (kind === 'duplicate') {
        toast.success('Copy created as a draft');
        nav(`/app/teach/assignments/${(r as { assignment: Assignment }).assignment.id}`);
      }
      if (kind === 'delete') {
        toast.success('Draft deleted');
        nav('/app/teach/assignments');
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const firstBlock = detail.checklist.items.find((i) => i.blocking && !i.ok);
  return (
    <Card>
      <CardHeader title={a.status === 'draft' ? 'Publish checklist' : 'Status'} action={<StatusBadge status={a.status} />} />
      <CardBody className="space-y-3">
        {a.status === 'draft' ? (
          <>
            <ul className="space-y-1.5">
              {detail.checklist.items.map((i) => (
                <li key={i.key} className="flex items-start gap-2 text-[13px]">
                  {i.ok ? (
                    <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-success" aria-label="Done" />
                  ) : i.blocking ? (
                    <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-danger" aria-label="Required" />
                  ) : (
                    <CircleIcon size={16} className="mt-0.5 shrink-0 text-subtle" aria-label="Optional" />
                  )}
                  <span>
                    {i.label}
                    {!i.ok && i.detail && <span className="block text-[12px] text-muted">{i.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <Button variant="primary" className="w-full" icon={<RocketLaunchIcon size={15} />} disabled={!detail.checklist.canPublish} disabledReason={firstBlock ? `${firstBlock.label}: ${firstBlock.detail ?? 'required'}` : undefined} onClick={() => setConfirm('publish')}>
              Publish to {detail.cohort.name}
            </Button>
            <p className="text-[12px] text-subtle">Checklist reflects saved changes.</p>
          </>
        ) : (
          <div className="space-y-1 text-[13px] text-muted">
            <div>Due {formatDateTime(a.dueAt)}</div>
            <div>{detail.latePolicyText}</div>
          </div>
        )}
        <div className="grid gap-2 border-t border-border pt-4 [&>*]:w-full [&_button]:w-full">
          {a.status === 'published' && (
            <Button size="sm" icon={<XCircleIcon size={14} />} onClick={() => setConfirm('close')}>
              Close submissions
            </Button>
          )}
          {a.status === 'closed' && (
            <Button size="sm" icon={<ArrowCounterClockwiseIcon size={14} />} loading={action.isPending} onClick={() => action.mutate('reopen')}>
              Reopen
            </Button>
          )}
          <Button size="sm" icon={<CopyIcon size={14} />} loading={action.isPending && action.variables === 'duplicate'} onClick={() => action.mutate('duplicate')}>
            Duplicate
          </Button>
          {a.status !== 'draft' && (
            <a href={csvHref(`/assignments/${a.id}/grades.csv`)} className={buttonClass('secondary', 'sm')} download>
              <DownloadSimpleIcon size={14} /> Grades CSV
            </a>
          )}
          {a.status === 'draft' && (
            <Button size="sm" variant="ghost" icon={<TrashIcon size={14} />} onClick={() => setConfirm('delete')}>
              Delete draft
            </Button>
          )}
        </div>
      </CardBody>
      <ConfirmDialog
        open={confirm === 'publish'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Publish this assignment?"
        description={`Every student in ${detail.cohort.name} is notified. The rubric, collaboration mode and maximum points lock once published.`}
        confirmLabel="Publish"
        loading={action.isPending}
        onConfirm={() => action.mutate('publish')}
      />
      <ConfirmDialog
        open={confirm === 'close'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Close submissions?"
        description="Students can no longer submit or edit drafts. Existing submissions and grading are unaffected. You can reopen later."
        confirmLabel="Close submissions"
        loading={action.isPending}
        onConfirm={() => action.mutate('close')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Delete this draft?"
        description="The draft assignment is removed. This cannot be undone."
        confirmLabel="Delete draft"
        danger
        loading={action.isPending}
        onConfirm={() => action.mutate('delete')}
      />
    </Card>
  );
}

// ---------- Submissions tab ----------

function SubmissionsTab({ detail }: { detail: Detail }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'submitted' | 'missing' | 'late'>('all');
  const releaseAll = useMutation({
    mutationFn: () => api.post<{ released: number; skipped: unknown[] }>('/teach/grading/release', { assignmentId: detail.assignment.id }),
    onSuccess: (r) => {
      toast.success(`Released ${r.released} grade${r.released === 1 ? '' : 's'}. Students were notified.`);
      qc.invalidateQueries({ queryKey: ['teach'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const unreleased = detail.students.filter((s) => s.evaluation && !s.evaluation.released).length;
  const rows = detail.students.filter((s) => (filter === 'all' ? true : filter === 'submitted' ? !!s.submissionId : filter === 'missing' ? !s.submissionId : s.isLate));
  const c = detail.counts;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1 sm:grid-cols-5 sm:divide-x">
        {[
          ['Submitted', `${c.submitted} of ${c.students}`],
          ['Late', c.late],
          ['Drafting', c.drafts],
          ['Graded', c.graded],
          ['Released', c.released],
        ].map(([label, value]) => (
          <div key={label as string} className="border-b border-border px-5 py-3 last:border-b-0 sm:border-b-0">
            <dt className="text-[12.5px] font-medium text-muted">{label}</dt>
            <dd className="mt-0.5 font-display text-[20px] font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Filter students"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'submitted', label: 'Submitted' },
            { value: 'missing', label: 'Missing' },
            { value: 'late', label: 'Late' },
          ]}
        />
        <Button size="sm" variant="primary" icon={<SealCheckIcon size={14} />} disabled={!unreleased} disabledReason="No graded work waiting for release" loading={releaseAll.isPending} onClick={() => releaseAll.mutate()}>
          Release {unreleased || ''} graded
        </Button>
      </div>
      {!detail.students.length ? (
        <EmptyState icon={<UsersThreeIcon size={22} />} title="No students in this cohort" description="Add students to the cohort to collect submissions." action={<ButtonLink to={`/app/teach/cohorts/${detail.cohort.id}`} variant="primary">Open cohort</ButtonLink>} />
      ) : (
        <div className={TABLE_WRAP}>
          <table className="w-full min-w-[720px] text-left text-[13.5px]">
            <thead className={THEAD}>
              <tr>
                <th scope="col" className={TH}>Student</th>
                <th scope="col" className={TH}>Status</th>
                <th scope="col" className={TH}>Submitted</th>
                <th scope="col" className={`${TH} text-right`}>Score</th>
                <th scope="col" className={TH}><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.userId} className={TR}>
                  <td className={TD}>
                    <div className="font-semibold">{s.name}</div>
                    <div className="mt-0.5 text-[12px] text-subtle">{s.team ? s.team.name : s.email}</div>
                  </td>
                  <td className={TD}>
                    <div className="flex flex-wrap gap-1">
                      <WorkStatusBadge status={s.status} />
                      {s.isLate && <Badge tone="warning">{s.daysLate} day{s.daysLate === 1 ? '' : 's'} late</Badge>}
                      {s.hasDraft && s.submissionId && <Badge>Revising</Badge>}
                    </div>
                  </td>
                  <td className={`${TD} text-[12.5px] text-muted`}>{s.submittedAt ? `${timeAgo(s.submittedAt)} · v${s.version}` : 'Not submitted'}</td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {s.evaluation ? (
                      <>
                        {s.evaluation.finalScore} / {detail.assignment.maxPoints}
                        {!s.evaluation.released && <div className="text-[11.5px] text-subtle">Not released</div>}
                      </>
                    ) : (
                      <span className="text-subtle">Not graded</span>
                    )}
                  </td>
                  <td className={`${TD} text-right`}>
                    {s.submissionId && (
                      <ButtonLink size="sm" to={`/app/teach/grading/${s.submissionId}`} variant={s.evaluation ? 'secondary' : 'primary'}>
                        {s.evaluation ? 'Review' : 'Grade'}
                      </ButtonLink>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Teams tab ----------

function TeamsTab({ detail }: { detail: Detail }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [size, setSize] = useState('3');
  const inTeam = new Set(detail.teams.flatMap((t) => t.memberIds));
  const free = detail.students.filter((s) => !inTeam.has(s.userId));
  const invalidate = () => qc.invalidateQueries({ queryKey: ['teach', 'assignment', detail.assignment.id] });
  const create = useMutation({
    mutationFn: () => api.post(`/teach/assignments/${detail.assignment.id}/teams`, { name, memberIds: members }),
    onSuccess: () => {
      toast.success('Team created');
      setCreating(false);
      setName('');
      setMembers([]);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const auto = useMutation({
    mutationFn: () => api.post<{ created: number }>(`/teach/assignments/${detail.assignment.id}/teams/auto`, { size: Number(size) }),
    onSuccess: (r) => {
      toast.success(`Created ${r.created} team${r.created === 1 ? '' : 's'}`);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/teach/teams/${id}`),
    onSuccess: () => {
      toast.success('Team removed');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (detail.assignment.collaboration !== 'team') return <Banner tone="info">Teams are only used when collaboration is set to Team submission.</Banner>;
  return (
    <div className="space-y-4">
      {free.length > 0 && (
        <Banner tone="warning" title={`${free.length} student${free.length === 1 ? ' is' : 's are'} not in a team`}>
          {free.map((s) => s.name).join(', ')}. Every student must be in a team before publishing.
        </Banner>
      )}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setCreating(true)} disabled={!free.length} disabledReason="Everyone is already in a team">
          New team
        </Button>
        <div className="flex items-end gap-2">
          <Field label="Team size">
            <Input type="number" min={2} max={10} value={size} onChange={(e) => setSize(e.target.value)} className="w-20" />
          </Field>
          <Button icon={<ShuffleIcon size={14} />} loading={auto.isPending} disabled={free.length < 2} disabledReason="Needs at least 2 students without a team" onClick={() => auto.mutate()}>
            Form random teams
          </Button>
        </div>
      </div>
      {!detail.teams.length ? (
        <EmptyState icon={<UsersThreeIcon size={22} />} title="No teams yet" description="Create teams by hand or form random teams from students who are not in one." />
      ) : (
        <ul className={LIST_GROUP}>
          {detail.teams.map((t) => (
            <li key={t.id} className="flex items-center gap-4 px-5 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                <UsersThreeIcon size={18} weight="duotone" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-semibold tracking-[-0.005em]">{t.name}</div>
                <div className="mt-0.5 text-[12.5px] text-muted">{t.members.map((m) => m.name).join(', ')}</div>
              </div>
              <Menu label={`Actions for ${t.name}`} items={[{ label: 'Delete team', danger: true, icon: <TrashIcon size={15} />, onSelect: () => remove.mutate(t.id) }]} />
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="New team"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" loading={create.isPending} disabled={!name.trim() || !members.length} disabledReason="Name the team and pick members" onClick={() => create.mutate()}>
              Create team
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Team name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Team ${detail.teams.length + 1}`} autoFocus />
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium">Members (students without a team)</legend>
            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {free.map((s) => (
                <li key={s.userId}>
                  <Checkbox checked={members.includes(s.userId)} onCheckedChange={(v) => setMembers(v ? [...members, s.userId] : members.filter((x) => x !== s.userId))} label={s.name} />
                </li>
              ))}
            </ul>
          </fieldset>
        </div>
      </Dialog>
    </div>
  );
}

// ---------- Page ----------

export default function AssignmentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'details';
  const q = useQuery({ queryKey: ['teach', 'assignment', id], queryFn: () => api.get<Detail>(`/teach/assignments/${id}`), enabled: !!id });

  if (!id) {
    return (
      <div>
        <PageHeader
          breadcrumb={
            <Link to="/app/teach/assignments" className="inline-flex items-center gap-1 hover:text-fg">
              <CaretLeftIcon size={14} /> Assignments
            </Link>
          }
          title="New assignment"
          description="Save a draft first. You can publish once the checklist is complete."
        />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <AssignmentForm initialCohort={params.get('cohortId') ?? ''} />
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <Card>
              <CardHeader title="Before you publish" />
              <CardBody>
                <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
                  <InfoIcon size={16} className="mt-0.5 shrink-0 text-subtle" aria-hidden />
                  Create the draft first. The checklist appears here and shows what is still needed before students can see the assignment.
                </p>
              </CardBody>
            </Card>
          </aside>
        </div>
      </div>
    );
  }
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <SkeletonRows rows={8} />;
  const d = q.data;
  const tabs = [
    { value: 'details', label: 'Details' },
    { value: 'submissions', label: 'Submissions', count: d.counts.submitted },
    ...(d.assignment.collaboration === 'team' ? [{ value: 'teams', label: 'Teams', count: d.teams.length }] : []),
    { value: 'peer', label: 'Peer review' },
  ];
  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/teach/assignments" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={14} /> Assignments
          </Link>
        }
        title={d.assignment.title}
        badge={<StatusBadge status={d.assignment.status} />}
        description={`${d.cohort.name}${d.course ? ` · ${d.course.code}` : ''} · due ${formatDateTime(d.assignment.dueAt)}`}
        actions={
          d.counts.submitted > d.counts.graded ? (
            <ButtonLink to={`/app/teach/grading?assignmentId=${d.assignment.id}&status=ungraded`} variant="primary">
              Grade {d.counts.submitted - d.counts.graded} submission{d.counts.submitted - d.counts.graded === 1 ? '' : 's'}
            </ButtonLink>
          ) : undefined
        }
      />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          next.set('tab', v);
          setParams(next, { replace: true });
        }}
        tabs={tabs}
        className="mb-6"
      />
      {tab === 'details' && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <AssignmentForm key={d.assignment.updatedAt} detail={d} initialCohort={d.assignment.cohortId} />
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <PublishPanel detail={d} />
          </div>
        </div>
      )}
      {tab === 'submissions' && <SubmissionsTab detail={d} />}
      {tab === 'teams' && <TeamsTab detail={d} />}
      {tab === 'peer' && <PeerReviewTab assignmentId={d.assignment.id} />}
    </div>
  );
}
