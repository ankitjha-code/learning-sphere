import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ListChecksIcon, MagnifyingGlassIcon, PlusIcon, PencilSimpleIcon, ClockCounterClockwiseIcon, ArchiveIcon, ArrowCounterClockwiseIcon, TrashIcon, EyeIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { PageHeader, Tabs, Input, Select, Button, Badge, StatusBadge, Menu, Dialog, ConfirmDialog, ErrorState, EmptyState, SkeletonRows, Pagination, Markdown } from '@/components/ui';
import { QuestionEditor } from './QuestionEditor';
import { QUESTION_TYPES, QUESTION_TYPE_LABEL, type BankQuestion, type Content } from './types';

export type BankFilters = { scope: 'org' | 'public'; q: string; type: string; difficulty: string; status: string; topic?: string; page: number };

export function useBank(f: BankFilters, enabled = true) {
  return useQuery({
    queryKey: ['assessments', 'bank', f],
    queryFn: () => api.get<{ items: BankQuestion[]; total: number; page: number; pageSize: number }>(`/assessments/questions${qs({ scope: f.scope, q: f.q, type: f.type, difficulty: f.difficulty, status: f.status, topic: f.topic, page: f.page, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function BankFiltersBar({ f, setF, showStatus = true }: { f: BankFilters; setF: (f: BankFilters) => void; showStatus?: boolean }) {
  const withStatus = showStatus && f.scope === 'org';
  return (
    <div className={clsx('mb-4 grid grid-cols-2 gap-2', withStatus ? 'sm:grid-cols-[minmax(0,1fr)_170px_150px_130px]' : 'sm:grid-cols-[minmax(0,1fr)_170px_150px]')}>
      <div className="relative col-span-2 sm:col-span-1">
        <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
        <Input className="pl-9" placeholder="Search title, prompt or topic" aria-label="Search questions" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} />
      </div>
      <Select aria-label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, page: 1 })}>
        <option value="">All types</option>
        {QUESTION_TYPES.map((t) => (
          <option key={t} value={t}>
            {QUESTION_TYPE_LABEL[t]}
          </option>
        ))}
      </Select>
      <Select aria-label="Difficulty" value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value, page: 1 })}>
        <option value="">Any difficulty</option>
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </Select>
      {withStatus && (
        <div className="col-span-2 sm:col-span-1">
          <Select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
            <option value="active">Active</option>
            <option value="retired">Retired</option>
            <option value="all">All</option>
          </Select>
        </div>
      )}
    </div>
  );
}

function VersionsDialog({ q, onOpenChange }: { q: BankQuestion | null; onOpenChange: (v: boolean) => void }) {
  const v = useQuery({
    queryKey: ['assessments', 'versions', q?.id],
    queryFn: () => api.get<{ current: number; versions: { id: string; version: number; content: Content; points: number; createdAt: string }[] }>(`/assessments/questions/${q!.id}/versions`),
    enabled: !!q,
  });
  return (
    <Dialog open={!!q} onOpenChange={onOpenChange} title={`Version history: ${q?.title ?? ''}`} description="Published assessments keep the version that was current when they were published." size="lg">
      {v.error ? (
        <ErrorState error={v.error} onRetry={() => v.refetch()} />
      ) : !v.data ? (
        <SkeletonRows rows={3} />
      ) : (
        <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          <li className="bg-accent-soft/40 px-4 py-3.5">
            <div className="mb-1.5 flex items-center gap-2 text-[13px]">
              <Badge tone="accent">Version {v.data!.current}</Badge> <span className="text-muted">Current</span>
            </div>
            <Markdown source={q?.content.prompt ?? ''} className="text-[13.5px]" />
          </li>
          {v.data!.versions.map((x) => (
            <li key={x.id} className="px-4 py-3.5">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[13px]">
                <Badge>Version {x.version}</Badge>
                <span className="text-muted">Replaced {formatDateTime(x.createdAt)} · {x.points} pts</span>
              </div>
              <Markdown source={x.content.prompt} className="text-[13.5px]" />
            </li>
          ))}
          {!v.data!.versions.length && <li className="px-4 py-3.5 text-[13px] text-muted">No earlier versions. Editing the question content creates one.</li>}
        </ol>
      )}
    </Dialog>
  );
}

const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** Prompt as one line of plain text; keeps fill-in blanks visible. */
function plainPrompt(prompt: string) {
  return prompt
    .replace(/_{3,}/g, '\u0000')
    .replace(/[`*#_>]/g, '')
    .replace(/\u0000/g, '____');
}

export function QuestionRow({ q, actions, hideLibraryBadge }: { q: BankQuestion; actions?: ReactNode; hideLibraryBadge?: boolean }) {
  return (
    <li className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-semibold tracking-[-0.005em]">{q.title}</span>
          <Badge>{QUESTION_TYPE_LABEL[q.type]}</Badge>
          <Badge tone="neutral">{DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}</Badge>
          {q.status !== 'active' && <StatusBadge status={q.status} />}
          {!q.orgId && !hideLibraryBadge && <Badge tone="info">Public library</Badge>}
        </div>
        <p className="mt-1 line-clamp-1 text-[13px] text-muted">{plainPrompt(q.content.prompt)}</p>
        <div className="mt-1 text-[12.5px] text-subtle">
          v{q.version} · {q.points} {q.points === 1 ? 'pt' : 'pts'}{q.topics.length ? ` · ${q.topics.slice(0, 4).join(', ')}` : ''}
        </div>
      </div>
      {actions && <div className="-mr-1 flex shrink-0 items-center self-center">{actions}</div>}
    </li>
  );
}

/** Org question bank (and read-only public library) with create, edit, version history and retire. */
export function QuestionBank({ title = 'Question bank', description }: { title?: string; description?: string }) {
  const qc = useQueryClient();
  const [f, setF] = useState<BankFilters>({ scope: 'org', q: '', type: '', difficulty: '', status: 'active', page: 1 });
  const [editing, setEditing] = useState<BankQuestion | 'new' | null>(null);
  const [versions, setVersions] = useState<BankQuestion | null>(null);
  const [viewing, setViewing] = useState<BankQuestion | null>(null);
  const [removing, setRemoving] = useState<BankQuestion | null>(null);
  const bank = useBank(f);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['assessments', 'bank'] });

  const retire = useMutation({
    mutationFn: (p: { q: BankQuestion; restore?: boolean }) => api.post(`/assessments/questions/${p.q.id}/${p.restore ? 'restore' : 'retire'}`),
    onSuccess: (_r, p) => {
      toast.success(p.restore ? 'Question restored.' : 'Question retired. Existing assessments keep it; new ones cannot add it.');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (q: BankQuestion) => api.del<{ deleted: boolean; retired: boolean; message?: string }>(`/assessments/questions/${q.id}`),
    onSuccess: (r) => {
      toast.success(r.deleted ? 'Question deleted.' : (r.message ?? 'Question retired.'));
      setRemoving(null);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title={title}
        description={description ?? 'Reusable questions for exams, quizzes and screens. Editing a question creates a new version; published assessments keep the version they were published with.'}
        actions={
          f.scope === 'org' && (
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setEditing('new')}>
              New question
            </Button>
          )
        }
      />
      <Tabs
        className="mb-5"
        value={f.scope}
        onValueChange={(v) => setF({ ...f, scope: v as 'org' | 'public', page: 1, status: 'active' })}
        tabs={[
          { value: 'org', label: 'Your organization' },
          { value: 'public', label: 'Public library' },
        ]}
      />
      <BankFiltersBar f={f} setF={setF} />
      {bank.error ? (
        <ErrorState error={bank.error} onRetry={() => bank.refetch()} />
      ) : !bank.data ? (
        <SkeletonRows rows={6} />
      ) : !bank.data.items.length ? (
        <EmptyState
          icon={<ListChecksIcon size={22} />}
          title={f.q || f.type || f.difficulty ? 'No questions match' : f.scope === 'org' ? 'No questions yet' : 'The public library is empty'}
          description={f.scope === 'org' ? 'Create questions here, or add public library questions directly to an assessment.' : 'Public questions come from the built-in learning library.'}
          action={
            f.scope === 'org' && (
              <Button variant="primary" onClick={() => setEditing('new')}>
                New question
              </Button>
            )
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
            {bank.data.items.map((q) => (
              <QuestionRow
                key={q.id}
                q={q}
                hideLibraryBadge={f.scope === 'public'}
                actions={
                  <Menu
                    label={`Actions for ${q.title}`}
                    items={[
                      { label: 'Preview', icon: <EyeIcon size={15} />, onSelect: () => setViewing(q) },
                      ...(q.editable ? [{ label: 'Edit', icon: <PencilSimpleIcon size={15} />, onSelect: () => setEditing(q) }] : []),
                      { label: 'Version history', icon: <ClockCounterClockwiseIcon size={15} />, onSelect: () => setVersions(q) },
                      ...(q.editable
                        ? [
                            'separator' as const,
                            q.status === 'retired'
                              ? { label: 'Restore', icon: <ArrowCounterClockwiseIcon size={15} />, onSelect: () => retire.mutate({ q, restore: true }) }
                              : { label: 'Retire', icon: <ArchiveIcon size={15} />, onSelect: () => retire.mutate({ q }) },
                            { label: 'Delete', icon: <TrashIcon size={15} />, danger: true, onSelect: () => setRemoving(q) },
                          ]
                        : []),
                    ]}
                  />
                }
              />
            ))}
          </ul>
          <Pagination page={f.page} pageSize={bank.data.pageSize} total={bank.data.total} onPage={(page) => setF({ ...f, page })} />
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} title={editing && editing !== 'new' ? `Edit: ${editing.title}` : 'New question'} size="xl">
        {editing && (
          <QuestionEditor
            initial={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              invalidate();
            }}
          />
        )}
      </Dialog>
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)} title={viewing?.title ?? ''} size="lg">
        {viewing && (
          <div className="space-y-3 text-[14px]">
            <Markdown source={viewing.content.prompt} />
            {viewing.content.options && (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {viewing.content.options.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span>{o.text}</span>
                    {viewing.answerKey?.correct?.includes(o.id) && <Badge tone="success">Correct</Badge>}
                  </li>
                ))}
              </ul>
            )}
            {viewing.keyHidden && <p className="text-[13px] text-muted">The answer key of public library questions is only visible to platform admins.</p>}
            {viewing.answerKey?.explanation && <p className="text-muted">{viewing.answerKey.explanation}</p>}
          </div>
        )}
      </Dialog>
      <VersionsDialog q={versions} onOpenChange={(v) => !v && setVersions(null)} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title="Delete this question?"
        description="If any assessment uses it, it is retired instead so past results stay intact."
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onConfirm={() => {
          if (removing) remove.mutate(removing);
        }}
      />
    </div>
  );
}

export default function QuestionBankPage() {
  return <QuestionBank />;
}
