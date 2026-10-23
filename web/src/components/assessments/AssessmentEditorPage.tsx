import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CaretRightIcon,
  CaretUpIcon,
  CaretDownIcon,
  PlusIcon,
  TrashIcon,
  RocketLaunchIcon,
  CheckCircleIcon,
  WarningCircleIcon,
  WarningIcon,
  EyeIcon,
  CopyIcon,
  ArchiveIcon,
  LockKeyIcon,
  LockKeyOpenIcon,
  UserPlusIcon,
  ListChecksIcon,
  ShuffleIcon,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDateTime, fromLocalInput, toLocalInput } from '@/lib/format';
import {
  Avatar,
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
  PageHeader,
  Section,
  Select,
  Skeleton,
  SkeletonRows,
  StatusBadge,
  Switch,
  Tabs,
  TagsInput,
  Textarea,
} from '@/components/ui';
import { QuestionEditor } from './QuestionEditor';
import { BankFiltersBar, QuestionRow, useBank, type BankFilters } from './QuestionBankPage';
import { GradingQueue } from './GradingQueuePage';
import { AssessmentResults } from './ResultsPage';
import { useCohorts } from './AssessmentListPage';
import { MODE_LABEL, QUESTION_TYPES, QUESTION_TYPE_LABEL, useAssessmentScope, type AssessmentScope, type BankQuestion, type ManagedAssessment, type Settings } from './types';

type ItemDraft = { questionId: string; title: string; type: string; points: number; section: string | null; retired?: boolean; version?: number };

// ---------------------------------------------------------------- Setup

function SetupTab({ data, editable }: { data: ManagedAssessment; editable: boolean }) {
  const qc = useQueryClient();
  const a = data.assessment;
  const [title, setTitle] = useState(a.title);
  const [description, setDescription] = useState(a.description ?? '');
  const [cohortId, setCohortId] = useState(a.cohortId ?? '');
  const [s, setS] = useState<Settings>(a.settings);
  const [fields, setFields] = useState<Record<string, string>>({});
  const cohorts = useCohorts(editable && !!a.orgId && (a.mode === 'classroom' || a.mode === 'placement'));
  useEffect(() => {
    setTitle(a.title);
    setDescription(a.description ?? '');
    setCohortId(a.cohortId ?? '');
    setS(a.settings);
  }, [a]);
  const save = useMutation({
    mutationFn: () => {
      const { personal: _p, ...settings } = s;
      return api.patch(`/assessments/${a.id}`, { title, description: description || null, cohortId: cohortId || null, settings });
    },
    onSuccess: () => {
      toast.success('Settings saved.');
      setFields({});
      qc.invalidateQueries({ queryKey: ['assessments', 'manage-one', a.id] });
    },
    onError: (e) => {
      if (e instanceof ApiError) setFields(e.fields);
      toast.error(errorMessage(e));
    },
  });
  const num = (v: string) => (v === '' ? null : Number(v));
  const f = (k: string) => fields[`settings.${k}`] ?? fields[k];
  return (
    <fieldset disabled={!editable} className="min-w-0 space-y-6">
      <Card>
        <CardHeader title="Basics" />
        <CardBody className="space-y-4">
          <Field label="Title" error={fields.title}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Description" optional helper="Shown to candidates before they start. Markdown supported.">
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {a.orgId && (a.mode === 'classroom' || a.mode === 'placement') && (
            <Field label="Cohort" optional helper="Everyone in the cohort can take it once published." error={fields.cohortId}>
              <Select value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
                <option value="">No cohort (invite people)</option>
                {cohorts.data?.cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.members} students)
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Timing and attempts" />
        <CardBody className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
          <Field label="Time limit (minutes)" optional helper="Leave empty for untimed. Extra time accommodations add to this." error={f('timeLimitMinutes')}>
            <Input type="number" min={1} max={600} value={s.timeLimitMinutes ?? ''} onChange={(e) => setS({ ...s, timeLimitMinutes: num(e.target.value) })} />
          </Field>
          <Field label="Attempts allowed" optional helper="Leave empty for unlimited." error={f('maxAttempts')}>
            <Input type="number" min={1} max={100} value={s.maxAttempts ?? ''} onChange={(e) => setS({ ...s, maxAttempts: num(e.target.value) })} />
          </Field>
          <Field label="Opens" optional error={f('availableFrom')}>
            <Input type="datetime-local" value={toLocalInput(s.availableFrom)} onChange={(e) => setS({ ...s, availableFrom: fromLocalInput(e.target.value) })} />
          </Field>
          <Field label="Closes" optional helper="Attempts in progress are submitted at this time." error={f('availableUntil')}>
            <Input type="datetime-local" value={toLocalInput(s.availableUntil)} onChange={(e) => setS({ ...s, availableUntil: fromLocalInput(e.target.value) })} />
          </Field>
          <div className="space-y-4 border-t border-border pt-4 sm:col-span-2">
            <Switch checked={!!s.shuffleQuestions} onCheckedChange={(v) => setS({ ...s, shuffleQuestions: v })} label="Shuffle question order" description="Each attempt gets its own order." />
            <Switch checked={!!s.shuffleOptions} onCheckedChange={(v) => setS({ ...s, shuffleOptions: v })} label="Shuffle answer options" />
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Results and grading" />
        <CardBody className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
          <Field label="Release results">
            <Select value={s.resultRelease} onChange={(e) => setS({ ...s, resultRelease: e.target.value as Settings['resultRelease'] })}>
              <option value="immediate">As soon as grading finishes</option>
              <option value="after_close">When the assessment closes</option>
              <option value="manual">When I release them</option>
            </Select>
          </Field>
          <Field label="Passing score (%)" optional error={f('passingScore')}>
            <Input type="number" min={0} max={100} value={s.passingScore ?? ''} onChange={(e) => setS({ ...s, passingScore: num(e.target.value) })} />
          </Field>
          <div className="space-y-4 border-y border-border py-4 sm:col-span-2">
            <Switch checked={!!s.showAnswersAfterRelease} onCheckedChange={(v) => setS({ ...s, showAnswersAfterRelease: v })} label="Show correct answers and explanations after release" />
            <Switch checked={!!s.allowRegradeRequests} onCheckedChange={(v) => setS({ ...s, allowRegradeRequests: v })} label="Allow regrade requests" description="Candidates can appeal a released answer. You resolve requests in Results." />
          </div>
          <Field label="Rules shown to candidates" optional className="sm:col-span-2">
            <Textarea rows={2} value={s.proctoringNote ?? ''} onChange={(e) => setS({ ...s, proctoringNote: e.target.value })} placeholder="For example: closed book, no AI assistants." />
          </Field>
          <Field label="Sections" optional helper="Names in order, separated by commas. Assign questions to sections on the Questions tab." className="sm:col-span-2">
            <TagsInput value={s.sections ?? []} onChange={(sections) => setS({ ...s, sections })} />
          </Field>
        </CardBody>
      </Card>
      {editable && (
        <div className="flex justify-end">
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save settings
          </Button>
        </div>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------- Questions

function PickerDialog({ open, onOpenChange, existing, onAdd, publicOnly }: { open: boolean; onOpenChange: (v: boolean) => void; existing: string[]; onAdd: (qs: BankQuestion[]) => void; publicOnly: boolean }) {
  const [f, setF] = useState<BankFilters>({ scope: publicOnly ? 'public' : 'org', q: '', type: '', difficulty: '', status: 'active', page: 1 });
  const [picked, setPicked] = useState<Map<string, BankQuestion>>(new Map());
  const bank = useBank(f, open);
  useEffect(() => {
    if (!open) setPicked(new Map());
  }, [open]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add questions"
      description="Pick from your organization's bank or the public library."
      size="xl"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!picked.size} disabledReason="Select at least one question" onClick={() => onAdd([...picked.values()])}>
            Add {picked.size || ''} question{picked.size === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      {!publicOnly && (
        <Tabs
          className="mb-3"
          value={f.scope}
          onValueChange={(v) => setF({ ...f, scope: v as 'org' | 'public', page: 1 })}
          tabs={[
            { value: 'org', label: 'Your organization' },
            { value: 'public', label: 'Public library' },
          ]}
        />
      )}
      <BankFiltersBar f={f} setF={setF} showStatus={false} />
      {bank.error ? (
        <ErrorState error={bank.error} onRetry={() => bank.refetch()} />
      ) : !bank.data ? (
        <SkeletonRows rows={5} />
      ) : !bank.data.items.length ? (
        <EmptyState icon={<ListChecksIcon size={22} />} title="No questions found" description="Try other filters, or create a new question instead." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {bank.data.items.map((q) => {
            const already = existing.includes(q.id);
            return (
              <QuestionRow
                key={q.id}
                q={q}
                hideLibraryBadge={f.scope === 'public'}
                actions={
                  already ? (
                    <Badge tone="success">Added</Badge>
                  ) : (
                    <Checkbox
                      label={<span className="sr-only">Select {q.title}</span>}
                      checked={picked.has(q.id)}
                      onCheckedChange={(v) =>
                        setPicked((m) => {
                          const n = new Map(m);
                          if (v) n.set(q.id, q);
                          else n.delete(q.id);
                          return n;
                        })
                      }
                    />
                  )
                }
              />
            );
          })}
        </ul>
      )}
      {bank.data && bank.data.total > bank.data.pageSize && (
        <div className="mt-3 flex items-center justify-between text-[13px]">
          <Button size="sm" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>
            Previous
          </Button>
          <span className="text-muted">
            Page {f.page} of {Math.ceil(bank.data.total / bank.data.pageSize)}
          </span>
          <Button size="sm" disabled={f.page * bank.data.pageSize >= bank.data.total} onClick={() => setF({ ...f, page: f.page + 1 })}>
            Next
          </Button>
        </div>
      )}
    </Dialog>
  );
}

function BlueprintEditor({ data, editable }: { data: ManagedAssessment; editable: boolean }) {
  const qc = useQueryClient();
  const a = data.assessment;
  const [rows, setRows] = useState(a.settings.blueprint ?? []);
  useEffect(() => setRows(a.settings.blueprint ?? []), [a.settings.blueprint]);
  const topics = useQuery({ queryKey: ['assessments', 'topics'], queryFn: () => api.get<{ topics: { topic: string; count: number }[] }>('/assessments/questions/topics'), enabled: editable });
  const save = useMutation({
    mutationFn: () => api.patch(`/assessments/${a.id}`, { settings: { ...a.settings, personal: undefined, blueprint: rows } }),
    onSuccess: () => {
      toast.success('Blueprint saved.');
      qc.invalidateQueries({ queryKey: ['assessments', 'manage-one', a.id] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const dirty = JSON.stringify(rows) !== JSON.stringify(a.settings.blueprint ?? []);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <ShuffleIcon size={16} className="text-subtle" aria-hidden /> Random draw (blueprint)
          </span>
        }
        description="Each attempt draws its own questions matching these rules, in addition to the fixed questions above. Draws come from your bank and the public library."
      />
      {rows.length > 0 ? (
        <ol className="divide-y divide-border border-t border-border">
          {rows.map((r, i) => (
            <li key={i} className="grid grid-cols-2 items-end gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_120px_140px_80px_96px_auto]">
              <Field label="Topic" className="col-span-2 md:col-span-1">
                <Select value={r.topic ?? ''} onChange={(e) => set(i, { topic: e.target.value || undefined })} disabled={!editable}>
                  <option value="">Any topic</option>
                  {topics.data?.topics.map((t) => (
                    <option key={t.topic} value={t.topic}>
                      {t.topic} ({t.count})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Difficulty">
                <Select value={r.difficulty ?? ''} onChange={(e) => set(i, { difficulty: e.target.value || undefined })} disabled={!editable}>
                  <option value="">Any</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </Select>
              </Field>
              <Field label="Type">
                <Select value={r.type ?? ''} onChange={(e) => set(i, { type: e.target.value || undefined })} disabled={!editable}>
                  <option value="">Any type</option>
                  {QUESTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {QUESTION_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Count">
                <Input type="number" min={1} max={100} value={r.count} disabled={!editable} onChange={(e) => set(i, { count: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
              <Field label="Points each">
                <Input type="number" min={0} placeholder="Default" value={r.points ?? ''} disabled={!editable} onChange={(e) => set(i, { points: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </Field>
              {editable && (
                <Button size="icon" variant="ghost" className="col-span-2 justify-self-end md:col-span-1" aria-label={`Remove rule ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  <TrashIcon size={15} />
                </Button>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <CardBody>
          <p className="rounded-md bg-surface-2 px-4 py-3 text-[13px] text-muted">{editable ? 'No rules yet. Add a rule to give each candidate a different set of questions.' : 'No random draw rules.'}</p>
        </CardBody>
      )}
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
          <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => setRows([...rows, { count: 3 }])}>
            Add rule
          </Button>
          <Button size="sm" variant="primary" disabled={!dirty} disabledReason="No changes to save" loading={save.isPending} onClick={() => save.mutate()}>
            Save blueprint
          </Button>
        </div>
      )}
    </Card>
  );
}

function QuestionsTab({ data }: { data: ManagedAssessment }) {
  const qc = useQueryClient();
  const a = data.assessment;
  const locked = data.itemsLocked || !data.editable;
  const toDraft = (): ItemDraft[] => data.items.map((i) => ({ questionId: i.question.id, title: i.question.title, type: i.question.type, points: i.points, section: i.section, retired: 'status' in i.question && i.question.status === 'retired', version: i.questionVersion }));
  const [items, setItems] = useState<ItemDraft[]>(toDraft);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => setItems(toDraft()), [data.items]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(items.map(({ questionId, points, section }) => ({ questionId, points, section }))) !== JSON.stringify(toDraft().map(({ questionId, points, section }) => ({ questionId, points, section })));
  const save = useMutation({
    mutationFn: () => api.put(`/assessments/${a.id}/items`, { items: items.map((i) => ({ questionId: i.questionId, points: i.points, section: i.section })) }),
    onSuccess: () => {
      toast.success('Questions saved.');
      qc.invalidateQueries({ queryKey: ['assessments', 'manage-one', a.id] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const add = (qs: BankQuestion[]) => {
    setItems((cur) => [...cur, ...qs.filter((q) => !cur.some((c) => c.questionId === q.id)).map((q) => ({ questionId: q.id, title: q.title, type: q.type, points: q.points, section: null }))]);
    setPickerOpen(false);
  };
  const move = (i: number, d: -1 | 1) => setItems((cur) => {
    const n = [...cur];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    return n;
  });
  const total = items.reduce((n, i) => n + (Number(i.points) || 0), 0);
  const sections = a.settings.sections ?? [];

  return (
    <div className="min-w-0 space-y-6">
      {data.itemsLocked && (
        <Banner tone="info" title="Questions are frozen">
          This assessment is {a.status}. Candidates get exactly the question versions that were current when it was published. Duplicate it to change questions.
        </Banner>
      )}
      <Card>
        <CardHeader
          title="Fixed questions"
          description={`${items.length} question${items.length === 1 ? '' : 's'} · ${total} points`}
          action={
            !locked && (
              <>
                <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => setCreating(true)}>
                  New question
                </Button>
                <Button size="sm" variant="primary" icon={<ListChecksIcon size={14} />} onClick={() => setPickerOpen(true)}>
                  Add from bank
                </Button>
              </>
            )
          }
        />
        {!items.length ? (
          <EmptyState inline className="border-t border-border" icon={<ListChecksIcon size={22} />} title="No fixed questions" description={locked ? 'This assessment only uses random draw rules.' : 'Add questions from your bank or the public library, or create a new one. You can also use only a random draw.'} />
        ) : (
          <ol className="divide-y divide-border border-t border-border">
            {items.map((it, i) => (
              <li key={it.questionId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
                {!locked && (
                  <div className="-ml-1.5 flex flex-col">
                    <button className="flex h-4 w-6 items-center justify-center rounded-sm text-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30" aria-label={`Move ${it.title} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                      <CaretUpIcon size={12} weight="bold" />
                    </button>
                    <button className="flex h-4 w-6 items-center justify-center rounded-sm text-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30" aria-label={`Move ${it.title} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                      <CaretDownIcon size={12} weight="bold" />
                    </button>
                  </div>
                )}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-[12.5px] font-semibold tabular-nums text-muted ring-1 ring-inset ring-border">{i + 1}</span>
                <div className="min-w-0 flex-1 basis-48">
                  <div className="truncate text-[14px] font-medium">{it.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-subtle">
                    {QUESTION_TYPE_LABEL[it.type as keyof typeof QUESTION_TYPE_LABEL] ?? it.type}
                    {it.version && data.itemsLocked ? ` · frozen at v${it.version}` : ''}
                    {it.retired && <Badge tone="danger">Retired</Badge>}
                  </div>
                </div>
                {locked ? (
                  <div className="ml-auto flex items-center gap-2 text-[13px]">
                    {it.section && <Badge>{it.section}</Badge>}
                    <span className="min-w-14 text-right font-medium tabular-nums">{it.points} {it.points === 1 ? 'pt' : 'pts'}</span>
                  </div>
                ) : (
                  <div className="ml-auto flex items-center gap-2">
                    {sections.length > 0 && (
                      <Select aria-label={`Section for ${it.title}`} className="w-40" value={it.section ?? ''} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, section: e.target.value || null } : x)))}>
                        <option value="">No section</option>
                        {sections.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                    )}
                    <div className="relative">
                      <Input aria-label={`Points for ${it.title}`} className="w-24 pr-9 text-right tabular-nums" type="number" min={0} step={0.5} value={it.points} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))} />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-subtle" aria-hidden>
                        pts
                      </span>
                    </div>
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${it.title}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                      <TrashIcon size={15} />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {!locked && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
            <span className="text-[12.5px] text-subtle">{dirty ? 'You have unsaved changes.' : sections.length ? 'Order, sections and points are saved together.' : 'Define sections on the Setup tab to group questions.'}</span>
            <Button variant="primary" disabled={!dirty} disabledReason="No unsaved changes" loading={save.isPending} onClick={() => save.mutate()}>
              Save questions
            </Button>
          </div>
        )}
      </Card>
      <BlueprintEditor data={data} editable={!locked} />
      <PickerDialog open={pickerOpen} onOpenChange={setPickerOpen} existing={items.map((i) => i.questionId)} onAdd={add} publicOnly={!a.orgId} />
      <Dialog open={creating} onOpenChange={setCreating} title="New question" description="Saved to your organization's bank and added to this assessment." size="xl">
        {creating && (
          <QuestionEditor
            onCancel={() => setCreating(false)}
            onSaved={(q) => {
              setCreating(false);
              add([q]);
              qc.invalidateQueries({ queryKey: ['assessments', 'bank'] });
              toast.info('Added. Save questions to keep the change.');
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- People

type Invite = { id: string; userId: string; name: string; email: string; status: string; dueAt: string | null; accommodations: { extraTimePercent?: number; note?: string }; createdAt: string };

function InviteDialog({ open, onOpenChange, assessmentId, mode }: { open: boolean; onOpenChange: (v: boolean) => void; assessmentId: string; mode: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [emails, setEmails] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [extra, setExtra] = useState('');
  const [note, setNote] = useState('');
  const people = useQuery({
    queryKey: ['org-people', search, mode],
    queryFn: () => api.get<{ people: { userId: string; name: string; email: string; roles: string[] }[] }>(`/org/people${search ? `?q=${encodeURIComponent(search)}` : mode === 'recruitment' ? '' : '?role=student'}`),
    enabled: open,
    retry: false,
  });
  useEffect(() => {
    if (!open) {
      setPicked(new Set());
      setEmails('');
      setExtra('');
      setNote('');
      setDueAt('');
    }
  }, [open]);
  const emailList = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  const m = useMutation({
    mutationFn: () =>
      api.post<{ invited: number; alreadyInvited: number; unknownEmails: string[] }>(`/assessments/${assessmentId}/invites`, {
        userIds: [...picked],
        emails: emailList,
        dueAt: fromLocalInput(dueAt),
        accommodations: extra || note ? { extraTimePercent: extra ? Number(extra) : undefined, note: note || undefined } : undefined,
      }),
    onSuccess: (r) => {
      toast.success(`Invited ${r.invited}${r.alreadyInvited ? `, ${r.alreadyInvited} already invited` : ''}.`);
      if (r.unknownEmails.length) toast.warning(`No account for: ${r.unknownEmails.join(', ')}. Ask them to sign up first, then invite again.`);
      qc.invalidateQueries({ queryKey: ['assessments', 'invites', assessmentId] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite people"
      description="Invited people get a notification and can start once the assessment is published and open."
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!picked.size && !emailList.length} disabledReason="Choose people or enter email addresses" onClick={() => m.mutate()}>
            Send invitations
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Field label="People in your organization">
            <Input placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border">
            {people.error ? (
              <p className="px-4 py-3 text-[13px] text-muted">{errorMessage(people.error)}</p>
            ) : !people.data ? (
              <SkeletonRows rows={3} className="p-2" />
            ) : !people.data.people.length ? (
              <p className="px-4 py-3 text-[13px] text-muted">Nobody found. Invite by email below.</p>
            ) : (
              <ul className="divide-y divide-border">
                {people.data.people.map((p) => (
                  <li key={p.userId} className="px-4 py-2.5">
                    <Checkbox
                      checked={picked.has(p.userId)}
                      onCheckedChange={(v) =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (v) n.add(p.userId);
                          else n.delete(p.userId);
                          return n;
                        })
                      }
                      label={p.name}
                      description={p.email}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <Field label="Or invite by email" optional helper="Separate with commas or new lines. People need an account on this platform.">
          <Textarea rows={2} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="candidate@example.com" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Personal due date" optional>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
          <Field label="Extra time (%)" optional helper="Accommodation, e.g. 25 or 50.">
            <Input type="number" min={0} max={300} value={extra} onChange={(e) => setExtra(e.target.value)} />
          </Field>
          <Field label="Accommodation note" optional>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function EditInviteDialog({ inv, onOpenChange, assessmentId }: { inv: Invite | null; onOpenChange: (v: boolean) => void; assessmentId: string }) {
  const qc = useQueryClient();
  const [extra, setExtra] = useState('');
  const [note, setNote] = useState('');
  const [dueAt, setDueAt] = useState('');
  useEffect(() => {
    setExtra(inv?.accommodations.extraTimePercent ? String(inv.accommodations.extraTimePercent) : '');
    setNote(inv?.accommodations.note ?? '');
    setDueAt(toLocalInput(inv?.dueAt));
  }, [inv]);
  const m = useMutation({
    mutationFn: () => api.patch(`/assessments/${assessmentId}/invites/${inv!.id}`, { accommodations: { extraTimePercent: extra ? Number(extra) : 0, note: note || undefined }, dueAt: fromLocalInput(dueAt) }),
    onSuccess: () => {
      toast.success('Accommodations saved. A running attempt gets the new deadline.');
      qc.invalidateQueries({ queryKey: ['assessments', 'invites', assessmentId] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={!!inv}
      onOpenChange={onOpenChange}
      title={`Accommodations for ${inv?.name ?? ''}`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Extra time (%)">
          <Input type="number" min={0} max={300} value={extra} onChange={(e) => setExtra(e.target.value)} />
        </Field>
        <Field label="Note" optional helper="Shown to the candidate on the overview page.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="Personal due date" optional>
          <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function PeopleTab({ data }: { data: ManagedAssessment }) {
  const qc = useQueryClient();
  const a = data.assessment;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Invite | null>(null);
  const [revoking, setRevoking] = useState<Invite | null>(null);
  const q = useQuery({ queryKey: ['assessments', 'invites', a.id], queryFn: () => api.get<{ invites: Invite[] }>(`/assessments/${a.id}/invites`) });
  const revoke = useMutation({
    mutationFn: (inv: Invite) => api.patch(`/assessments/${a.id}/invites/${inv.id}`, { status: inv.status === 'revoked' ? 'invited' : 'revoked' }),
    onSuccess: () => {
      toast.success('Invitation updated.');
      setRevoking(null);
      qc.invalidateQueries({ queryKey: ['assessments', 'invites', a.id] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!a.orgId) return <Banner tone="info">Public library assessments are open to every signed-in user. There is nobody to invite.</Banner>;
  return (
    <div className="space-y-6">
      {data.cohort && (
        <Banner tone="info" title={`Assigned to cohort ${data.cohort.name}`}>
          Every member of the cohort can take this assessment once it is published. Invite individuals below to give accommodations or include people outside the cohort.
        </Banner>
      )}
      <Section
        title="Invited people"
        description={q.data?.invites.length ? `${q.data.invites.length} invited. Withdraw an invitation or add accommodations from the row menu.` : undefined}
        action={
          data.editable && (
            <Button size="sm" variant="primary" icon={<UserPlusIcon size={14} />} onClick={() => setInviteOpen(true)} disabled={a.status === 'closed' || a.status === 'archived'} disabledReason="Reopen the assessment to invite more people">
              Invite
            </Button>
          )
        }
      >
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data ? (
          <SkeletonRows rows={3} />
        ) : !q.data.invites.length ? (
          <EmptyState icon={<UserPlusIcon size={22} />} title="Nobody invited yet" description={a.mode === 'recruitment' ? 'Invite candidates by name or email. They get a notification with a link.' : 'Invite students individually, or assign a cohort on the Setup tab.'} />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            {q.data.invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={inv.name} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{inv.name}</div>
                    <div className="text-[12.5px] text-subtle">
                      <span className="break-all">{inv.email}</span>
                      {inv.dueAt ? ` · due ${formatDateTime(inv.dueAt)}` : ''}
                      {inv.accommodations.extraTimePercent ? ` · ${inv.accommodations.extraTimePercent}% extra time` : ''}
                    </div>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <StatusBadge status={inv.status} />
                  {data.editable && (
                    <Menu
                      label={`Actions for ${inv.name}`}
                      items={[
                        { label: 'Edit accommodations', onSelect: () => setEditing(inv) },
                        { label: inv.status === 'revoked' ? 'Restore invitation' : 'Withdraw invitation', danger: inv.status !== 'revoked', onSelect: () => (inv.status === 'revoked' ? revoke.mutate(inv) : setRevoking(inv)) },
                      ]}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} assessmentId={a.id} mode={a.mode} />
      <EditInviteDialog inv={editing} onOpenChange={(v) => !v && setEditing(null)} assessmentId={a.id} />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(v) => !v && setRevoking(null)}
        title="Withdraw invitation?"
        description={`${revoking?.name ?? ''} will no longer be able to start this assessment. Attempts already submitted are kept.`}
        confirmLabel="Withdraw"
        danger
        loading={revoke.isPending}
        onConfirm={() => {
          if (revoking) revoke.mutate(revoking);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Page

function Checklist({ data }: { data: ManagedAssessment }) {
  const c = data.checklist;
  return (
    <Card>
      <CardHeader title="Publish checklist" description={`${c.itemCount} fixed + ${c.blueprintCount} drawn questions`} />
      <ul className="divide-y divide-border border-t border-border text-[13.5px]">
        {c.ready && !c.warnings.length && (
          <li className="flex items-start gap-2 px-5 py-3 text-success">
            <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> Ready to publish.
          </li>
        )}
        {c.problems.map((p) => (
          <li key={p} className="flex items-start gap-2 px-5 py-3 text-danger">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {p}
          </li>
        ))}
        {c.warnings.map((w) => (
          <li key={w} className="flex items-start gap-2 px-5 py-3 text-muted">
            <WarningIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-warning" aria-hidden /> {w}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Full editor for one assessment. Works under teach, hire, campus and create base paths. */
export function AssessmentEditor({ assessmentId, scope: override }: { assessmentId: string; scope?: Partial<AssessmentScope> }) {
  const scope = useAssessmentScope(override);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [confirm, setConfirm] = useState<null | 'publish' | 'close' | 'archive' | 'delete'>(null);
  const q = useQuery({ queryKey: ['assessments', 'manage-one', assessmentId], queryFn: () => api.get<ManagedAssessment>(`/assessments/${assessmentId}`) });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['assessments', 'manage-one', assessmentId] });
    qc.invalidateQueries({ queryKey: ['assessments', 'manage'] });
  };
  const action = useMutation({
    mutationFn: (kind: 'publish' | 'close' | 'reopen' | 'archive' | 'duplicate' | 'delete') =>
      kind === 'delete' ? api.del(`/assessments/${assessmentId}`) : api.post<{ assessment: { id: string }; released?: number; autoSubmitted?: number }>(`/assessments/${assessmentId}/${kind}`),
    onSuccess: (r, kind) => {
      setConfirm(null);
      const res = r as { assessment?: { id: string }; released?: number; autoSubmitted?: number };
      if (kind === 'duplicate' && res.assessment) {
        toast.success('Copy created as a draft.');
        navigate(`${scope.basePath}/assessments/${res.assessment.id}`);
        return;
      }
      if (kind === 'delete') {
        toast.success('Draft deleted.');
        navigate(`${scope.basePath}/assessments`);
        return;
      }
      toast.success(
        kind === 'publish'
          ? 'Published. Invited people and cohort members can now take it.'
          : kind === 'close'
            ? `Closed.${res.autoSubmitted ? ` ${res.autoSubmitted} open attempt(s) were submitted.` : ''}${res.released ? ` ${res.released} result(s) released.` : ''}`
            : kind === 'reopen'
              ? 'Reopened.'
              : 'Archived.',
      );
      invalidate();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setConfirm(null);
      invalidate();
    },
  });

  const data = q.data;
  const editable = !!data?.editable;
  const tabs = useMemo(
    () =>
      editable
        ? [
            { value: 'setup', label: 'Setup' },
            { value: 'questions', label: 'Questions', count: data?.checklist.itemCount },
            { value: 'people', label: 'People' },
            { value: 'grading', label: 'Grading', count: data?.counts.needsReview || undefined },
            { value: 'results', label: 'Results' },
          ]
        : [
            { value: 'results', label: 'Results' },
            { value: 'questions', label: 'Questions' },
          ],
    [editable, data?.checklist.itemCount, data?.counts.needsReview],
  );
  const requested = params.get('tab') === 'regrades' ? 'results' : params.get('tab');
  const tab = tabs.some((t) => t.value === requested) ? requested! : tabs[0].value;

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !data)
    return (
      <div aria-busy="true" aria-label="Loading">
        <Skeleton className="mb-3 h-4 w-48" />
        <Skeleton className="mb-7 h-9 w-80 max-w-full" />
        <Skeleton className="mb-6 h-10 w-full" />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Skeleton className="h-[420px] rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </div>
    );
  const a = data.assessment;
  const publishDisabled = !data.checklist.ready ? data.checklist.problems[0] : undefined;

  return (
    <div>
      <PageHeader
        breadcrumb={
          <nav className="flex min-w-0 items-center gap-1" aria-label="Breadcrumb">
            <Link to={`${scope.basePath}/assessments`} className="shrink-0 hover:text-fg">
              Assessments
            </Link>
            <CaretRightIcon size={12} className="shrink-0" aria-hidden />
            <span className="truncate text-fg">{a.title}</span>
          </nav>
        }
        title={a.title}
        badge={
          <>
            <StatusBadge status={a.status} />
            <Badge tone="accent">{MODE_LABEL[a.mode]}</Badge>
            {!editable && (
              <Badge icon={<EyeIcon size={11} />} tone="neutral">
                View only
              </Badge>
            )}
          </>
        }
        description={a.publishedAt ? `Published ${formatDateTime(a.publishedAt)} · version ${a.version}` : 'Draft: only managers can see it.'}
        actions={
          editable && (
            <>
              <ButtonLink to={`/app/assessments/${a.id}`} icon={<EyeIcon size={15} />}>
                Candidate view
              </ButtonLink>
              {a.status === 'draft' && (
                <Button variant="primary" icon={<RocketLaunchIcon size={15} />} disabled={!!publishDisabled} disabledReason={publishDisabled} onClick={() => setConfirm('publish')}>
                  Publish
                </Button>
              )}
              {a.status === 'published' && (
                <Button icon={<LockKeyIcon size={15} />} onClick={() => setConfirm('close')}>
                  Close
                </Button>
              )}
              {a.status === 'closed' && (
                <Button icon={<LockKeyOpenIcon size={15} />} loading={action.isPending} onClick={() => action.mutate('reopen')}>
                  Reopen
                </Button>
              )}
              <Menu
                items={[
                  { label: 'Duplicate', icon: <CopyIcon size={15} />, onSelect: () => action.mutate('duplicate') },
                  ...(a.status !== 'archived' ? [{ label: 'Archive', icon: <ArchiveIcon size={15} />, onSelect: () => setConfirm('archive') }] : []),
                  ...(a.status === 'draft' && !data.counts.attempts ? ['separator' as const, { label: 'Delete draft', icon: <TrashIcon size={15} />, danger: true, onSelect: () => setConfirm('delete') }] : []),
                ]}
              />
            </>
          )
        }
      />
      {data.counts.needsReview > 0 && editable && tab !== 'grading' && (
        <Banner
          tone="warning"
          className="mb-6"
          title={`${data.counts.needsReview} attempt${data.counts.needsReview === 1 ? '' : 's'} need grading`}
          action={
            <Button size="sm" onClick={() => setParams({ tab: 'grading' })}>
              Open grading
            </Button>
          }
        />
      )}
      <Tabs className="mb-6" value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} tabs={tabs} />
      {tab === 'setup' && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <SetupTab data={data} editable={editable && a.status !== 'archived'} />
          <div className="lg:sticky lg:top-4 lg:self-start">
            <Checklist data={data} />
          </div>
        </div>
      )}
      {tab === 'questions' && (
        <div className={editable ? 'grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]' : undefined}>
          <QuestionsTab data={data} />
          {editable && (
            <div className="lg:sticky lg:top-4 lg:self-start">
              <Checklist data={data} />
            </div>
          )}
        </div>
      )}
      {tab === 'people' && <PeopleTab data={data} />}
      {tab === 'grading' && <GradingQueue assessmentId={a.id} />}
      {tab === 'results' && <AssessmentResults assessmentId={a.id} canEdit={editable} initialTab={params.get('tab') === 'regrades' ? 'regrades' : 'summary'} />}

      <ConfirmDialog
        open={confirm === 'publish'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Publish this assessment?"
        description="Question versions are frozen. Invited people and cohort members are able to start it during its window."
        confirmLabel="Publish"
        loading={action.isPending}
        onConfirm={() => action.mutate('publish')}
      >
        {data.checklist.warnings.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-[13px]">
            {data.checklist.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'close'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Close this assessment?"
        description="Nobody can start a new attempt. Attempts in progress are submitted now with the answers saved so far."
        confirmLabel="Close assessment"
        loading={action.isPending}
        onConfirm={() => action.mutate('close')}
      />
      <ConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Archive this assessment?"
        description="It disappears from the current list and nobody can take it. Results stay available."
        confirmLabel="Archive"
        loading={action.isPending}
        onConfirm={() => action.mutate('archive')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Delete this draft?"
        description="This cannot be undone. Questions stay in the bank."
        confirmLabel="Delete draft"
        danger
        confirmText={a.title}
        loading={action.isPending}
        onConfirm={() => action.mutate('delete')}
      />
    </div>
  );
}

export default function AssessmentEditorPage() {
  const { id = '' } = useParams();
  return <AssessmentEditor assessmentId={id} />;
}
