import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PlusIcon, TrashIcon, MagnifyingGlassIcon, ListChecksIcon, CheckIcon, XIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError, qs } from '@/lib/api';
import { Banner, Badge, Button, Dialog, Field, Input, Textarea, Select, Switch, Tabs, Markdown, EmptyState, ErrorState, SkeletonRows, Pagination } from '@/components/ui';
import { QUESTION_TYPE_LABEL, cap, lines, type Topic, type TopicPractice, type TopicResource, type QuizQuestion } from './shared';

type QuestionRow = { id: string; title: string; type: string; difficulty: string; topics: string[]; prompt: string | null; scope: 'org' | 'public' };

const PRACTICE_KINDS: TopicPractice['kind'][] = ['problem', 'quiz', 'exercise', 'sql'];
const RESOURCE_KINDS = ['article', 'video', 'docs', 'cheatsheet', 'course', 'exercise', 'interview', 'link'];

export function TopicEditorDialog({ pathId, topic, onClose, onSaved }: { pathId: string; topic: Topic | null; onClose: () => void; onSaved: () => void }) {
  const [topicId, setTopicId] = useState<string | null>(topic?.id ?? null);
  const [tab, setTab] = useState('content');
  const [bodyTab, setBodyTab] = useState('write');
  const [justCreated, setJustCreated] = useState(false);

  const [title, setTitle] = useState(topic?.title ?? '');
  const [module, setModule] = useState(topic?.module ?? 'Core');
  const [minutes, setMinutes] = useState(String(topic?.estimatedMinutes ?? 20));
  const [isMilestone, setIsMilestone] = useState(topic?.isMilestone ?? false);
  const [skillSlug, setSkillSlug] = useState(topic?.skill?.slug ?? '');
  const [objectives, setObjectives] = useState((topic?.objectives ?? []).join('\n'));
  const [body, setBody] = useState(topic?.body ?? '');
  const [criteria, setCriteria] = useState(topic?.completionCriteria ?? '');
  const [resources, setResources] = useState<TopicResource[]>(topic?.resources ?? []);
  const [practice, setPractice] = useState<TopicPractice[]>(topic?.practice ?? []);
  const [quiz, setQuiz] = useState<QuizQuestion[]>(topic?.quiz ?? []);
  const [quizDirty, setQuizDirty] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title,
        module: module.trim() || 'Core',
        estimatedMinutes: Number(minutes) || 20,
        isMilestone,
        skillSlug: skillSlug.trim() || null,
        objectives: lines(objectives),
        body,
        completionCriteria: criteria.trim() || null,
        resources: resources.map((r) => ({ ...r, kind: r.kind || 'article' })),
        practice: practice.map((p) => ({ title: p.title, kind: p.kind, ref: p.ref?.trim() || undefined, prompt: p.prompt?.trim() || undefined })),
      };
      return topicId ? api.patch<{ topic: { id: string } }>(`/create/paths/${pathId}/topics/${topicId}`, payload) : api.post<{ topic: { id: string } }>(`/create/paths/${pathId}/topics`, payload);
    },
    onSuccess: (r) => {
      onSaved();
      if (!topicId) {
        setTopicId(r.topic.id);
        setJustCreated(true);
        toast.success('Topic added');
      } else {
        toast.success('Topic saved');
        onClose();
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const saveQuiz = useMutation({
    mutationFn: () => api.put(`/create/paths/${pathId}/topics/${topicId}/quiz`, { questionIds: quiz.map((q) => q.id) }),
    onSuccess: () => {
      setQuizDirty(false);
      onSaved();
      toast.success(quiz.length ? `Quiz saved with ${quiz.length} ${quiz.length === 1 ? 'question' : 'questions'}` : 'Quiz removed');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const fields = save.error instanceof ApiError ? save.error.fields : {};
  const fe = (k: string) => fields[k] ?? Object.entries(fields).find(([key]) => key.startsWith(`${k}.`))?.[1];
  const hasContentError = ['title', 'module', 'estimatedMinutes', 'skillSlug', 'objectives', 'body', 'completionCriteria'].some((k) => fe(k));
  const hasExtrasError = ['resources', 'practice'].some((k) => fe(k));

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      size="xl"
      title={topicId ? `Edit topic${title ? `: ${title}` : ''}` : 'New topic'}
      description="Topics are the steps of a path. Learners read the notes, use the resources, practise and take the quiz."
      footer={
        tab === 'quiz' ? (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" loading={saveQuiz.isPending} disabled={!quizDirty} disabledReason="No quiz changes to save" onClick={() => saveQuiz.mutate()}>
              Save quiz
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>{justCreated ? 'Close' : 'Cancel'}</Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              {topicId ? 'Save topic' : 'Add topic'}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {justCreated && (
          <Banner tone="success" title="Topic saved">
            You can attach a quiz from the Quiz tab, keep editing, or close this dialog.
          </Banner>
        )}
        {save.error && !Object.keys(fields).length && <Banner tone="danger">{errorMessage(save.error)}</Banner>}
        <Tabs
          value={tab}
          onValueChange={setTab}
          tabs={[
            { value: 'content', label: hasContentError ? 'Content (check fields)' : 'Content' },
            { value: 'extras', label: hasExtrasError ? 'Resources and practice (check fields)' : 'Resources and practice', count: resources.length + practice.length },
            { value: 'quiz', label: 'Quiz', count: quiz.length },
          ]}
        />

        {tab === 'content' && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_120px]">
              <Field label="Title" required error={fe('title')}>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
              </Field>
              <Field label="Module" helper="Groups topics into sections" error={fe('module')}>
                <Input value={module} onChange={(e) => setModule(e.target.value)} maxLength={80} />
              </Field>
              <Field label="Minutes" error={fe('estimatedMinutes')}>
                <Input type="number" min={5} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Skill slug" optional helper="Links progress on this topic to a skill in the skill graph." error={fe('skillSlug')}>
                <Input value={skillSlug} onChange={(e) => setSkillSlug(e.target.value)} placeholder="sql-joins" maxLength={80} />
              </Field>
              <div className="pt-6">
                <Switch checked={isMilestone} onCheckedChange={setIsMilestone} label="Milestone" description="Highlights this topic as a checkpoint in the path." />
              </div>
            </div>
            <Field label="Objectives" optional helper="One per line. Shown as 'By the end you will'." error={fe('objectives')}>
              <Textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} rows={4} />
            </Field>
            <div>
              <Tabs
                value={bodyTab}
                onValueChange={setBodyTab}
                className="mb-3"
                tabs={[
                  { value: 'write', label: 'Write notes' },
                  { value: 'preview', label: 'Preview' },
                ]}
              />
              {bodyTab === 'write' ? (
                <Field label="Notes" optional helper="Markdown. Explain the idea, then show an example." error={fe('body')}>
                  <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className="font-mono text-[13px]" />
                </Field>
              ) : body.trim() ? (
                <div className="min-h-40 rounded-md border border-border bg-surface-2 p-4">
                  <Markdown source={body} />
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-border p-6 text-center text-[13px] text-muted">Nothing to preview yet.</p>
              )}
            </div>
            <Field label="Completion criteria" optional helper="What a learner must show to finish this topic." error={fe('completionCriteria')}>
              <Textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={2} maxLength={500} />
            </Field>
          </div>
        )}

        {tab === 'extras' && (
          <div className="space-y-6">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[14px] font-semibold">Resources</h3>
                <Button
                  size="sm"
                  icon={<PlusIcon size={14} />}
                  onClick={() => setResources((r) => [...r, { title: '', url: '', source: '', kind: 'article' }])}
                  disabled={resources.length >= 20}
                  disabledReason="Up to 20 resources"
                >
                  Add resource
                </Button>
              </div>
              {resources.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-[13px] text-muted">No resources. Add links to good external reading with the source named.</p>
              ) : (
                <ul className="space-y-3">
                  {resources.map((r, i) => {
                    const upd = (patch: Partial<TopicResource>) => setResources((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                    return (
                      <li key={i} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_130px_auto] sm:items-end">
                        <Field label="Title" error={fields[`resources.${i}.title`]}>
                          <Input value={r.title} onChange={(e) => upd({ title: e.target.value })} />
                        </Field>
                        <Field label="URL" error={fields[`resources.${i}.url`]}>
                          <Input type="url" value={r.url} onChange={(e) => upd({ url: e.target.value })} placeholder="https://" />
                        </Field>
                        <Field label="Source" error={fields[`resources.${i}.source`]}>
                          <Input value={r.source} onChange={(e) => upd({ source: e.target.value })} />
                        </Field>
                        <Field label="Kind">
                          <Select value={r.kind} onChange={(e) => upd({ kind: e.target.value })}>
                            {RESOURCE_KINDS.map((k) => (
                              <option key={k} value={k}>
                                {cap(k)}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Button variant="ghost" size="icon" aria-label={`Remove resource ${i + 1}`} onClick={() => setResources((all) => all.filter((_, j) => j !== i))}>
                          <TrashIcon size={16} />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[14px] font-semibold">Practice</h3>
                <Button
                  size="sm"
                  icon={<PlusIcon size={14} />}
                  onClick={() => setPractice((p) => [...p, { title: '', kind: 'exercise', ref: '', prompt: '' }])}
                  disabled={practice.length >= 20}
                  disabledReason="Up to 20 practice items"
                >
                  Add practice item
                </Button>
              </div>
              {practice.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-[13px] text-muted">No practice items. Link a CodeLab problem or describe an exercise.</p>
              ) : (
                <ul className="space-y-3">
                  {practice.map((p, i) => {
                    const upd = (patch: Partial<TopicPractice>) => setPractice((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                    return (
                      <li key={i} className="space-y-2 rounded-md border border-border p-3">
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_140px_minmax(0,1fr)_auto] sm:items-end">
                          <Field label="Title" error={fields[`practice.${i}.title`]}>
                            <Input value={p.title} onChange={(e) => upd({ title: e.target.value })} />
                          </Field>
                          <Field label="Kind" error={fields[`practice.${i}.kind`]}>
                            <Select value={p.kind} onChange={(e) => upd({ kind: e.target.value as TopicPractice['kind'] })}>
                              {PRACTICE_KINDS.map((k) => (
                                <option key={k} value={k}>
                                  {k === 'sql' ? 'SQL' : cap(k)}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Reference" optional helper="Problem slug or id" error={fields[`practice.${i}.ref`]}>
                            <Input value={p.ref ?? ''} onChange={(e) => upd({ ref: e.target.value })} />
                          </Field>
                          <Button variant="ghost" size="icon" aria-label={`Remove practice item ${i + 1}`} onClick={() => setPractice((all) => all.filter((_, j) => j !== i))}>
                            <TrashIcon size={16} />
                          </Button>
                        </div>
                        <Field label="Prompt" optional error={fields[`practice.${i}.prompt`]}>
                          <Textarea value={p.prompt ?? ''} onChange={(e) => upd({ prompt: e.target.value })} rows={2} maxLength={2000} />
                        </Field>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === 'quiz' &&
          (topicId ? (
            <QuizPicker
              selected={quiz}
              onChange={(q) => {
                setQuiz(q);
                setQuizDirty(true);
              }}
            />
          ) : (
            <EmptyState
              icon={<ListChecksIcon size={22} />}
              title="Save the topic first"
              description="Quizzes attach to a saved topic. Add the topic, then come back to pick questions."
              action={
                <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
                  Add topic
                </Button>
              }
            />
          ))}
      </div>
    </Dialog>
  );
}

const PICKER_SIZE = 10;

function QuizPicker({ selected, onChange }: { selected: QuizQuestion[]; onChange: (q: QuizQuestion[]) => void }) {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [type, setType] = useState('');
  const [scope, setScope] = useState('all');
  const [page, setPage] = useState(1);
  const params = { q: submitted || undefined, type: type || undefined, scope, page, pageSize: PICKER_SIZE };
  const q = useQuery({
    queryKey: ['create', 'questions', params],
    queryFn: () => api.get<{ items: QuestionRow[]; total: number }>(`/create/questions${qs(params)}`),
    placeholderData: keepPreviousData,
  });
  const ids = new Set(selected.map((s) => s.id));
  const full = selected.length >= 20;

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <section>
        <h3 className="mb-2 text-[14px] font-semibold">
          In this quiz <span className="font-normal text-muted">({selected.length} of 20)</span>
        </h3>
        {selected.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-[13px] text-muted">No questions yet. Pick auto-graded questions from the bank.</p>
        ) : (
          <ol className="space-y-1.5">
            {selected.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[13.5px]">
                <span className="w-5 shrink-0 text-subtle tabular-nums">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <Badge>{QUESTION_TYPE_LABEL[s.type] ?? s.type}</Badge>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${s.title} from quiz`} onClick={() => onChange(selected.filter((x) => x.id !== s.id))}>
                  <XIcon size={14} />
                </Button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[14px] font-semibold">Question bank</h3>
        <form
          className="mb-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(search.trim());
            setPage(1);
          }}
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or topic" aria-label="Search questions" className="pl-9" />
            </div>
            <Button type="submit">Search</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              aria-label="Question type"
            >
              <option value="">Any type</option>
              {Object.entries(QUESTION_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setPage(1);
              }}
              aria-label="Question source"
            >
              <option value="all">Organization and public</option>
              <option value="org">Organization bank</option>
              <option value="public">Public bank</option>
            </Select>
          </div>
        </form>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <SkeletonRows rows={4} />
        ) : !q.data?.items.length ? (
          <EmptyState
            icon={<ListChecksIcon size={22} />}
            title="No questions found"
            description="Only active auto-graded questions (single, multiple, true or false, matching, fill in the blank) can be attached."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  setSearch('');
                  setSubmitted('');
                  setType('');
                  setScope('all');
                }}
              >
                Reset search
              </Button>
            }
          />
        ) : (
          <>
            <ul className="space-y-1.5">
              {q.data.items.map((row) => {
                const added = ids.has(row.id);
                return (
                  <li key={row.id} className="rounded-md border border-border px-3 py-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium">{row.title}</div>
                        <div className="mt-0.5 flex flex-wrap gap-1.5 text-[12px] text-muted">
                          <span>{QUESTION_TYPE_LABEL[row.type] ?? row.type}</span>
                          <span>· {cap(row.difficulty)}</span>
                          <span>· {row.scope === 'org' ? 'Organization' : 'Public'}</span>
                        </div>
                        {row.prompt && <p className="mt-1 line-clamp-2 text-[12.5px] text-subtle">{row.prompt}</p>}
                      </div>
                      {added ? (
                        <Button size="sm" variant="soft" icon={<CheckIcon size={14} />} onClick={() => onChange(selected.filter((x) => x.id !== row.id))} aria-label={`Remove ${row.title}`}>
                          Added
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          icon={<PlusIcon size={14} />}
                          disabled={full}
                          disabledReason="A quiz can have up to 20 questions"
                          onClick={() => onChange([...selected, { id: row.id, title: row.title, type: row.type, difficulty: row.difficulty }])}
                          aria-label={`Add ${row.title}`}
                        >
                          Add
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination page={page} pageSize={PICKER_SIZE} total={q.data.total} onPage={setPage} />
          </>
        )}
      </section>
    </div>
  );
}
