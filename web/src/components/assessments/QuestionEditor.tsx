import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlusIcon, TrashIcon, EyeIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { Button, Field, Input, Select, Textarea, Checkbox, Switch, TagsInput, Banner, Badge, SectionTitle } from '@/components/ui';
import { AnswerInput, type TakeQuestion } from './AnswerInput';
import { CodeEditor } from './CodeEditor';
import { CODE_LANGUAGES, QUESTION_TYPES, QUESTION_TYPE_LABEL, type Answer, type AnswerKey, type BankQuestion, type Content, type QuestionType } from './types';

type Draft = {
  type: QuestionType;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  points: number;
  topics: string[];
  skillIds: string[];
  content: Content;
  answerKey: AnswerKey;
};

let idSeq = 0;
const newId = (p: string) => `${p}${Date.now().toString(36).slice(-3)}${(idSeq++).toString(36)}`;

function defaultsFor(type: QuestionType): Pick<Draft, 'content' | 'answerKey'> {
  switch (type) {
    case 'single':
    case 'multi':
      return { content: { prompt: '', options: [{ id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }] }, answerKey: { correct: [] } };
    case 'true_false':
      return { content: { prompt: '', options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }] }, answerKey: { correct: ['true'] } };
    case 'matching':
      return { content: { prompt: '', pairs: { left: [{ id: 'l1', text: '' }, { id: 'l2', text: '' }], right: [{ id: 'r1', text: '' }, { id: 'r2', text: '' }] } }, answerKey: { matches: {} } };
    case 'fill_blank':
      return { content: { prompt: '', blanks: 1 }, answerKey: { accepted: [[]] } };
    case 'coding':
      return { content: { prompt: '', languages: ['python'], starterCode: { python: '' }, visibleTests: [{ name: 'Example', input: '', expected: '' }], timeLimitMs: 2000 }, answerKey: { hiddenTests: [] } };
    case 'sql':
      return { content: { prompt: '', schemaSql: '', orderMatters: false }, answerKey: { solutionSql: '', seedSql: '' } };
    default:
      return { content: { prompt: '' }, answerKey: { rubric: [] } };
  }
}

/** Client-side checks mirroring the server, so most mistakes show before saving. */
export function validateDraft(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.title.trim()) e.title = 'Give the question a short title.';
  if (!d.content.prompt?.trim()) e['content.prompt'] = 'Write the question.';
  if (['single', 'multi', 'true_false'].includes(d.type)) {
    if ((d.content.options ?? []).some((o) => !o.text.trim())) e['content.options'] = 'Fill in or remove empty options.';
    if (!d.answerKey.correct?.length) e['answerKey.correct'] = 'Mark the correct option.';
    if (d.type !== 'multi' && (d.answerKey.correct?.length ?? 0) > 1) e['answerKey.correct'] = 'Choose exactly one correct option.';
  }
  if (d.type === 'matching') {
    const p = d.content.pairs!;
    if ([...p.left, ...p.right].some((x) => !x.text.trim())) e['content.pairs'] = 'Fill in every item and match.';
    if (p.left.some((l) => !d.answerKey.matches?.[l.id])) e['answerKey.matches'] = 'Give every item a correct match.';
  }
  if (d.type === 'fill_blank' && (d.answerKey.accepted ?? []).some((a) => !a.length)) e['answerKey.accepted'] = 'Add at least one accepted answer per blank.';
  if (d.type === 'coding') {
    if (!d.content.languages?.length) e['content.languages'] = 'Choose at least one language.';
    if ((d.content.visibleTests?.length ?? 0) + (d.answerKey.hiddenTests?.length ?? 0) === 0) e['tests'] = 'Add at least one test, or the question cannot be published.';
  }
  if (d.type === 'sql') {
    if (!d.content.schemaSql?.trim()) e['content.schemaSql'] = 'Add the schema candidates will query.';
    if (!d.answerKey.solutionSql?.trim()) e['answerKey.solutionSql'] = 'Add a reference solution.';
  }
  return e;
}

function ListEditor<T>({ items, onChange, render, add, addLabel, min = 0, label }: { items: T[]; onChange: (v: T[]) => void; render: (item: T, set: (v: T) => void, i: number) => ReactNode; add: () => T; addLabel: string; min?: number; label: string }) {
  return (
    <div className="space-y-2" role="group" aria-label={label}>
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{render(it, (v) => onChange(items.map((x, j) => (j === i ? v : x))), i)}</div>
          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${label} ${i + 1}`} disabled={items.length <= min} disabledReason={`Keep at least ${min}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <TrashIcon size={14} />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={<PlusIcon size={14} />} onClick={() => onChange([...items, add()])}>
        {addLabel}
      </Button>
    </div>
  );
}

function RubricEditor({ k, setK }: { k: AnswerKey; setK: (v: AnswerKey) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Model answer" optional helper="Shown to graders, never to candidates.">
        <Textarea rows={3} value={k.modelAnswer ?? ''} onChange={(e) => setK({ ...k, modelAnswer: e.target.value })} />
      </Field>
      <div>
        <div className="mb-1 text-[13px] font-medium">Rubric</div>
        <ListEditor
          label="rubric row"
          items={k.rubric ?? []}
          onChange={(rubric) => setK({ ...k, rubric })}
          add={() => ({ criterion: '', points: 1 })}
          addLabel="Add criterion"
          render={(r, set) => (
            <div className="grid gap-2 sm:grid-cols-[1fr_80px]">
              <Input aria-label="Criterion" placeholder="What earns credit" value={r.criterion} onChange={(e) => set({ ...r, criterion: e.target.value })} />
              <Input aria-label="Points" type="number" min={0} value={r.points} onChange={(e) => set({ ...r, points: Number(e.target.value) })} />
            </div>
          )}
        />
      </div>
    </div>
  );
}

type TestRow = { name: string; input: string; expected: string; weight?: number };

function TestsEditor({ tests, onChange, hidden }: { tests: TestRow[]; onChange: (v: TestRow[]) => void; hidden?: boolean }) {
  return (
    <ListEditor<TestRow>
      label={hidden ? 'hidden test' : 'visible test'}
      items={tests}
      onChange={onChange}
      add={() => ({ name: `${hidden ? 'Hidden' : 'Test'} ${tests.length + 1}`, input: '', expected: '' })}
      addLabel={hidden ? 'Add hidden test' : 'Add visible test'}
      render={(t, set) => (
        <div className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[140px_1fr_1fr_70px]">
          <Input aria-label="Test name" value={t.name} onChange={(e) => set({ ...t, name: e.target.value })} />
          <Textarea aria-label="Input (stdin)" rows={2} className="font-mono text-[12.5px]" placeholder="stdin" value={t.input} onChange={(e) => set({ ...t, input: e.target.value })} />
          <Textarea aria-label="Expected output" rows={2} className="font-mono text-[12.5px]" placeholder="expected stdout" value={t.expected} onChange={(e) => set({ ...t, expected: e.target.value })} />
          {hidden ? <Input aria-label="Weight" type="number" min={1} value={t.weight ?? 1} onChange={(e) => set({ ...t, weight: Number(e.target.value) || 1 })} /> : <span />}
        </div>
      )}
    />
  );
}

/**
 * Create or edit a bank question of any type, with a live candidate preview.
 * Editing creates a new version on the server; published assessments keep the old one.
 */
export function QuestionEditor({ initial, onSaved, onCancel }: { initial?: BankQuestion | null; onSaved: (q: BankQuestion) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(() =>
    initial
      ? { type: initial.type, title: initial.title, difficulty: initial.difficulty, points: initial.points, topics: initial.topics, skillIds: initial.skillIds, content: initial.content, answerKey: initial.answerKey ?? {} }
      : { type: 'single', title: '', difficulty: 'medium', points: 1, topics: [], skillIds: [], ...defaultsFor('single') },
  );
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [preview, setPreview] = useState<Answer | null>(null);
  const [starterLang, setStarterLang] = useState(d.content.languages?.[0] ?? 'python');
  const skills = useQuery({ queryKey: ['skill-graph'], queryFn: () => api.get<{ nodes: { id: string; slug: string; name: string; category: string }[] }>('/learning/graph'), staleTime: 300_000 });

  const clientErrors = useMemo(() => validateDraft(d), [d]);
  const errors = { ...(showErrors ? clientErrors : {}), ...serverFields };
  const setC = (c: Partial<Content>) => setD((x) => ({ ...x, content: { ...x.content, ...c } }));
  const setK = (k: AnswerKey) => setD((x) => ({ ...x, answerKey: k }));

  const save = useMutation({
    mutationFn: () => {
      const payload = { title: d.title, difficulty: d.difficulty, points: d.points, topics: d.topics, skillIds: d.skillIds, content: d.content, answerKey: d.answerKey };
      return initial ? api.patch<{ question: BankQuestion }>(`/assessments/questions/${initial.id}`, payload) : api.post<{ question: BankQuestion }>('/assessments/questions', { ...payload, type: d.type });
    },
    onSuccess: (r) => {
      toast.success(initial ? `Saved as version ${r.question.version}.` : 'Question created.');
      onSaved(r.question);
    },
    onError: (e) => {
      if (e instanceof ApiError) setServerFields(e.fields);
      toast.error(errorMessage(e));
    },
  });

  const submit = () => {
    setShowErrors(true);
    setServerFields({});
    if (Object.keys(clientErrors).length) {
      toast.error('Fix the highlighted fields first.');
      return;
    }
    save.mutate();
  };

  const opts = d.content.options ?? [];
  const pairs = d.content.pairs;
  const previewQ: TakeQuestion = { id: 'preview', type: d.type, title: d.title || 'Untitled', points: d.points, content: d.content as TakeQuestion['content'] };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" helper={initial ? 'The type cannot change after creation.' : undefined}>
            <Select
              value={d.type}
              disabled={!!initial}
              onChange={(e) => {
                const type = e.target.value as QuestionType;
                setD((x) => ({ ...x, type, ...defaultsFor(type), content: { ...defaultsFor(type).content, prompt: x.content.prompt } }));
                setPreview(null);
              }}
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" error={errors.title} helper="Short label for the bank and graders.">
            <Input value={d.title} maxLength={200} onChange={(e) => setD({ ...d, title: e.target.value })} />
          </Field>
        </div>
        <Field label="Question" error={errors['content.prompt']} helper="Markdown supported, including `code` and fenced blocks.">
          <Textarea rows={4} value={d.content.prompt} onChange={(e) => setC({ prompt: e.target.value })} />
        </Field>

        {['single', 'multi', 'true_false'].includes(d.type) && (
          <div>
            <div className="mb-1 text-[13px] font-medium">Options {d.type === 'multi' ? '(tick every correct one)' : '(choose the correct one)'}</div>
            {d.type === 'true_false' ? (
              <div className="flex gap-4">
                {opts.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-[14px]">
                    <input type="radio" name="tf-correct" checked={d.answerKey.correct?.[0] === o.id} onChange={() => setK({ ...d.answerKey, correct: [o.id] })} className="accent-[var(--accent)]" />
                    {o.text} is correct
                  </label>
                ))}
              </div>
            ) : (
              <ListEditor
                label="option"
                min={2}
                items={opts}
                onChange={(options) => {
                  setC({ options });
                  setK({ ...d.answerKey, correct: (d.answerKey.correct ?? []).filter((c) => options.some((o) => o.id === c)) });
                }}
                add={() => ({ id: newId('o'), text: '' })}
                addLabel="Add option"
                render={(o, set, i) => (
                  <div className="flex items-center gap-2">
                    <input
                      type={d.type === 'multi' ? 'checkbox' : 'radio'}
                      name="correct-option"
                      aria-label={`Option ${i + 1} is correct`}
                      className="accent-[var(--accent)]"
                      checked={d.answerKey.correct?.includes(o.id) ?? false}
                      onChange={(e) => {
                        const cur = new Set(d.answerKey.correct ?? []);
                        if (d.type === 'multi') e.target.checked ? cur.add(o.id) : cur.delete(o.id);
                        setK({ ...d.answerKey, correct: d.type === 'multi' ? [...cur] : [o.id] });
                      }}
                    />
                    <Input aria-label={`Option ${i + 1}`} value={o.text} onChange={(e) => set({ ...o, text: e.target.value })} />
                  </div>
                )}
              />
            )}
            {(errors['content.options'] || errors['answerKey.correct']) && (
              <p className="mt-1 text-[12.5px] text-danger" role="alert">
                {errors['content.options'] ?? errors['answerKey.correct']}
              </p>
            )}
          </div>
        )}

        {d.type === 'matching' && pairs && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[13px] font-medium">Items and their correct match</div>
              <ListEditor
                label="item"
                min={2}
                items={pairs.left}
                onChange={(left) => setC({ pairs: { ...pairs, left } })}
                add={() => ({ id: newId('l'), text: '' })}
                addLabel="Add item"
                render={(l, set, i) => (
                  <div className="grid gap-1.5">
                    <Input aria-label={`Item ${i + 1}`} value={l.text} onChange={(e) => set({ ...l, text: e.target.value })} />
                    <Select aria-label={`Correct match for item ${i + 1}`} value={d.answerKey.matches?.[l.id] ?? ''} onChange={(e) => setK({ ...d.answerKey, matches: { ...(d.answerKey.matches ?? {}), [l.id]: e.target.value } })}>
                      <option value="">Correct match…</option>
                      {pairs.right.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.text || '(empty)'}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              />
            </div>
            <div>
              <div className="mb-1 text-[13px] font-medium">Matches (you may add distractors)</div>
              <ListEditor label="match" min={2} items={pairs.right} onChange={(right) => setC({ pairs: { ...pairs, right } })} add={() => ({ id: newId('r'), text: '' })} addLabel="Add match" render={(r, set, i) => <Input aria-label={`Match ${i + 1}`} value={r.text} onChange={(e) => set({ ...r, text: e.target.value })} />} />
            </div>
            {(errors['content.pairs'] || errors['answerKey.matches']) && (
              <p className="text-[12.5px] text-danger sm:col-span-2" role="alert">
                {errors['content.pairs'] ?? errors['answerKey.matches']}
              </p>
            )}
          </div>
        )}

        {d.type === 'fill_blank' && (
          <div className="space-y-3">
            <Field label="Number of blanks">
              <Input
                type="number"
                min={1}
                max={10}
                value={d.content.blanks ?? 1}
                onChange={(e) => {
                  const n = Math.max(1, Math.min(10, Number(e.target.value) || 1));
                  const acc = [...(d.answerKey.accepted ?? [])];
                  while (acc.length < n) acc.push([]);
                  setC({ blanks: n });
                  setK({ ...d.answerKey, accepted: acc.slice(0, n) });
                }}
              />
            </Field>
            {(d.answerKey.accepted ?? []).map((a, i) => (
              <Field key={i} label={`Accepted answers for blank ${i + 1}`} helper="Separate alternatives with commas.">
                <TagsInput value={a} onChange={(v) => setK({ ...d.answerKey, accepted: (d.answerKey.accepted ?? []).map((x, j) => (j === i ? v : x)) })} />
              </Field>
            ))}
            <Switch checked={!!d.answerKey.caseSensitive} onCheckedChange={(v) => setK({ ...d.answerKey, caseSensitive: v })} label="Case sensitive" description="Off: DISTINCT and distinct both count." />
            {errors['answerKey.accepted'] && <p className="text-[12.5px] text-danger">{errors['answerKey.accepted']}</p>}
          </div>
        )}

        {(d.type === 'short_text' || d.type === 'long_text') && (
          <>
            <Field label="Word limit" optional>
              <Input type="number" min={1} value={d.content.wordLimit ?? ''} onChange={(e) => setC({ wordLimit: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <RubricEditor k={d.answerKey} setK={setK} />
          </>
        )}

        {d.type === 'file' && (
          <>
            <Field label="Accepted file types" optional helper="For example: pdf, png, zip">
              <TagsInput value={d.content.acceptedFileTypes ?? []} onChange={(v) => setC({ acceptedFileTypes: v })} />
            </Field>
            <RubricEditor k={d.answerKey} setK={setK} />
          </>
        )}

        {d.type === 'oral' && <RubricEditor k={d.answerKey} setK={setK} />}

        {d.type === 'coding' && (
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-[13px] font-medium">Languages</div>
              <div className="flex flex-wrap gap-3">
                {CODE_LANGUAGES.map((l) => (
                  <Checkbox
                    key={l}
                    label={l}
                    checked={d.content.languages?.includes(l) ?? false}
                    onCheckedChange={(v) => setC({ languages: v ? [...(d.content.languages ?? []), l] : (d.content.languages ?? []).filter((x) => x !== l) })}
                  />
                ))}
              </div>
              {errors['content.languages'] && <p className="mt-1 text-[12.5px] text-danger">{errors['content.languages']}</p>}
            </div>
            {(d.content.languages?.length ?? 0) > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[13px] font-medium">Starter code</span>
                  <Select aria-label="Starter code language" value={d.content.languages!.includes(starterLang) ? starterLang : d.content.languages![0]} onChange={(e) => setStarterLang(e.target.value)} className="h-7 w-36">
                    {d.content.languages!.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </Select>
                </div>
                {(() => {
                  const lang = d.content.languages!.includes(starterLang) ? starterLang : d.content.languages![0];
                  return <CodeEditor language={lang} label={`Starter code (${lang})`} minHeight="100px" value={d.content.starterCode?.[lang] ?? ''} onChange={(v) => setC({ starterCode: { ...(d.content.starterCode ?? {}), [lang]: v } })} />;
                })()}
              </div>
            )}
            <div>
              <SectionTitle>Visible tests (shown to candidates)</SectionTitle>
              <TestsEditor tests={d.content.visibleTests ?? []} onChange={(visibleTests) => setC({ visibleTests })} />
            </div>
            <div>
              <SectionTitle>Hidden tests (graded, never shown)</SectionTitle>
              <TestsEditor hidden tests={d.answerKey.hiddenTests ?? []} onChange={(hiddenTests) => setK({ ...d.answerKey, hiddenTests })} />
            </div>
            {errors.tests && <Banner tone="warning">{errors.tests}</Banner>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Constraints" optional>
                <Input value={d.content.constraints ?? ''} onChange={(e) => setC({ constraints: e.target.value })} />
              </Field>
              <Field label="Time limit per test (ms)">
                <Input type="number" min={100} max={20000} value={d.content.timeLimitMs ?? 2000} onChange={(e) => setC({ timeLimitMs: Number(e.target.value) || 2000 })} />
              </Field>
            </div>
            <Field label="Reference solution" optional helper="For graders only.">
              <Textarea rows={3} className="font-mono text-[12.5px]" value={d.answerKey.modelAnswer ?? ''} onChange={(e) => setK({ ...d.answerKey, modelAnswer: e.target.value })} />
            </Field>
          </div>
        )}

        {d.type === 'sql' && (
          <div className="space-y-3">
            <Field label="Schema (shown to candidates)" error={errors['content.schemaSql']}>
              <Textarea rows={4} className="font-mono text-[12.5px]" value={d.content.schemaSql ?? ''} onChange={(e) => setC({ schemaSql: e.target.value })} />
            </Field>
            <Field label="Seed data (hidden)" optional helper="INSERT statements kept secret so results cannot be hard-coded.">
              <Textarea rows={3} className="font-mono text-[12.5px]" value={d.answerKey.seedSql ?? ''} onChange={(e) => setK({ ...d.answerKey, seedSql: e.target.value })} />
            </Field>
            <Field label="Reference solution (hidden)" error={errors['answerKey.solutionSql']} helper="The candidate's result set must match this query's result.">
              <Textarea rows={3} className="font-mono text-[12.5px]" value={d.answerKey.solutionSql ?? ''} onChange={(e) => setK({ ...d.answerKey, solutionSql: e.target.value })} />
            </Field>
            <Switch checked={!!d.content.orderMatters} onCheckedChange={(v) => setC({ orderMatters: v })} label="Row order matters" />
          </div>
        )}

        <Field label="Explanation" optional helper="Shown to candidates after results are released, if the assessment allows it.">
          <Textarea rows={2} value={d.answerKey.explanation ?? ''} onChange={(e) => setK({ ...d.answerKey, explanation: e.target.value })} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Difficulty">
            <Select value={d.difficulty} onChange={(e) => setD({ ...d, difficulty: e.target.value as Draft['difficulty'] })}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
          </Field>
          <Field label="Default points">
            <Input type="number" min={0} max={1000} step={0.5} value={d.points} onChange={(e) => setD({ ...d, points: Number(e.target.value) })} />
          </Field>
          <Field label="Topics" helper="Used by blueprint rules and filters." className="sm:col-span-2">
            <TagsInput value={d.topics} onChange={(topics) => setD({ ...d, topics })} />
          </Field>
        </div>
        <Field label="Skills" optional helper="Scores on this question become Skill DNA evidence for these skills.">
          <Select
            value=""
            onChange={(e) => e.target.value && !d.skillIds.includes(e.target.value) && setD({ ...d, skillIds: [...d.skillIds, e.target.value] })}
          >
            <option value="">Add a skill…</option>
            {skills.data?.nodes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        {d.skillIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {d.skillIds.map((sid) => (
              <button key={sid} type="button" onClick={() => setD({ ...d, skillIds: d.skillIds.filter((x) => x !== sid) })} aria-label="Remove skill">
                <Badge tone="accent">{skills.data?.nodes.find((n) => n.id === sid)?.name ?? 'Skill'} ×</Badge>
              </button>
            ))}
          </div>
        )}

        {Object.keys(serverFields).length > 0 && (
          <Banner tone="danger" title="The server rejected some fields">
            {Object.entries(serverFields)
              .map(([k, v]) => `${k}: ${v}`)
              .join(' · ')}
          </Banner>
        )}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {initial ? 'Save new version' : 'Create question'}
          </Button>
        </div>
      </div>

      <aside className="space-y-2 lg:sticky lg:top-0 lg:self-start">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
          <EyeIcon size={15} aria-hidden /> Candidate preview
        </div>
        {d.content.prompt?.trim() ? (
          <AnswerInput q={previewQ} value={preview} onChange={setPreview} />
        ) : (
          <p className="rounded-lg border border-dashed border-border-strong/70 bg-surface-2/60 px-4 py-6 text-center text-[13px] leading-relaxed text-muted">Write the question to see what candidates will see. Answer keys and hidden tests are never shown.</p>
        )}
      </aside>
    </div>
  );
}
