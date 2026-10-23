import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ExamIcon, PlusIcon, MagnifyingGlassIcon, ListChecksIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage, qs } from '@/lib/api';
import clsx from 'clsx';
import { plural, timeAgo } from '@/lib/format';
import { PageHeader, Tabs, Input, Select, Button, ButtonLink, Badge, StatusBadge, Dialog, Field, Textarea, ErrorState, EmptyState, SkeletonRows } from '@/components/ui';
import { MODE_LABEL, useAssessmentScope, type AssessmentMode, type AssessmentScope } from './types';

type Row = {
  id: string;
  title: string;
  mode: AssessmentMode;
  status: string;
  cohortName: string | null;
  itemCount: number;
  attemptCount: number;
  needsReview: number;
  awaitingRelease: number;
  inviteCount: number;
  timeLimitMinutes: number | null;
  availableUntil: string | null;
  access: 'view' | 'edit' | null;
  updatedAt: string;
};

export function useCohorts(enabled = true) {
  return useQuery({ queryKey: ['assessments', 'cohorts'], queryFn: () => api.get<{ cohorts: { id: string; name: string; kind: string; members: number }[] }>('/assessments/cohorts'), enabled, retry: false });
}

function CreateDialog({ open, onOpenChange, scope }: { open: boolean; onOpenChange: (v: boolean) => void; scope: AssessmentScope }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<AssessmentMode>(scope.modes[0]);
  const [cohortId, setCohortId] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const cohorts = useCohorts(open && (mode === 'classroom' || mode === 'placement'));
  const create = useMutation({
    mutationFn: () =>
      api.post<{ assessment: { id: string } }>('/assessments', {
        title,
        mode,
        description: description || null,
        cohortId: cohortId || null,
        settings: { resultRelease: mode === 'recruitment' || mode === 'placement' ? 'manual' : 'immediate', showAnswersAfterRelease: mode === 'practice' || mode === 'diagnostic', maxAttempts: mode === 'practice' ? null : 1 },
      }),
    onSuccess: (r) => {
      toast.success('Draft created. Add questions, then publish.');
      onOpenChange(false);
      navigate(`${scope.basePath}/assessments/${r.assessment.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError) setFields(e.fields);
      toast.error(errorMessage(e));
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New assessment"
      description="It starts as a draft. Nobody can see it until you publish."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} disabled={title.trim().length < 3} disabledReason="Enter a title of at least 3 characters" onClick={() => create.mutate()}>
            Create draft
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Title" error={fields.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
        </Field>
        {scope.modes.length > 1 && (
          <Field label="Kind" error={fields.mode}>
            <Select value={mode} onChange={(e) => setMode(e.target.value as AssessmentMode)}>
              {scope.modes.map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {(mode === 'classroom' || mode === 'placement') && (
          <Field label="Cohort" optional helper="Everyone in the cohort can take it once published. You can also invite people individually." error={fields.cohortId}>
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
        <Field label="Description" optional helper="Shown to candidates before they start.">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/** Assessments the caller manages in the active organization, filtered to this workspace's modes. */
export function AssessmentList({ scope: override }: { scope?: Partial<AssessmentScope> }) {
  const scope = useAssessmentScope(override);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const list = useQuery({
    queryKey: ['assessments', 'manage', status, q, mode],
    queryFn: () => api.get<{ items: Row[]; total: number }>(`/assessments/manage${qs({ status, q, mode, pageSize: 100 })}`),
  });
  const rows = (list.data?.items ?? []).filter((r) => scope.modes.includes(r.mode));
  const bankPath = scope.basePath === '/app/teach' || scope.basePath === '/app/create' ? `${scope.basePath}/questions` : null;

  return (
    <div>
      <PageHeader
        title="Assessments"
        description={
          scope.modes.includes('recruitment')
            ? 'Screening tests for candidates. Invite applicants, grade written answers, and release results when you are ready.'
            : 'Exams, quizzes and diagnostics for your cohorts. Objective and coding questions are graded automatically; written answers go to your grading queue.'
        }
        actions={
          <>
            {bankPath && (
              <ButtonLink to={bankPath} icon={<ListChecksIcon size={16} />}>
                Question bank
              </ButtonLink>
            )}
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setCreateOpen(true)}>
              New assessment
            </Button>
          </>
        }
      />
      <Tabs
        className="mb-5"
        value={status || 'active'}
        onValueChange={(v) => setStatus(v === 'active' ? '' : v)}
        tabs={[
          { value: 'active', label: 'Current' },
          { value: 'draft', label: 'Drafts' },
          { value: 'published', label: 'Published' },
          { value: 'closed', label: 'Closed' },
          { value: 'archived', label: 'Archived' },
        ]}
      />
      <div className={clsx('mb-4 grid gap-2', scope.modes.length > 1 ? 'sm:grid-cols-[minmax(0,1fr)_200px]' : 'sm:max-w-md')}>
        <div className="relative">
          <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input className="pl-9" placeholder="Search by title" aria-label="Search assessments" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {scope.modes.length > 1 && (
          <Select aria-label="Kind" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="">All kinds</option>
            {scope.modes.map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </Select>
        )}
      </div>
      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <SkeletonRows rows={5} />
      ) : !rows.length ? (
        <EmptyState
          icon={<ExamIcon size={22} />}
          title={q || status ? 'No assessments match' : 'No assessments yet'}
          description={scope.modes.includes('recruitment') ? 'Create a screening test, add questions from your bank or the public library, then invite candidates.' : 'Create an exam or quiz, add questions, choose a cohort and publish.'}
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              New assessment
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-1">
          <table className="w-full text-left text-[13.5px]">
            <thead className="border-b border-border bg-surface-2 text-[12.5px] text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Assessment</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="hidden px-4 py-3 text-right font-medium md:table-cell">Questions</th>
                <th scope="col" className="hidden px-4 py-3 text-right font-medium md:table-cell">Attempts</th>
                <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">To do</th>
                <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const todo =
                  r.needsReview > 0 || r.awaitingRelease > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {r.needsReview > 0 && <Badge tone="warning">{r.needsReview} to grade</Badge>}
                      {r.awaitingRelease > 0 && <Badge tone="info">{r.awaitingRelease} to release</Badge>}
                    </div>
                  ) : null;
                return (
                  <tr key={r.id} className="align-middle transition-colors hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <Link to={`${scope.basePath}/assessments/${r.id}`} className="font-medium hover:text-accent-text">
                        {r.title}
                      </Link>
                      <div className="mt-0.5 text-[12.5px] text-subtle">
                        {MODE_LABEL[r.mode]}
                        {r.cohortName ? ` · ${r.cohortName}` : ''}
                        {r.inviteCount ? ` · ${r.inviteCount} invited` : ''}
                        {r.access === 'view' ? ' · view only' : ''}
                        <span className="md:hidden">
                          {` · ${plural(r.itemCount, 'question')} · ${plural(r.attemptCount, 'attempt')}`}
                        </span>
                      </div>
                      {todo && <div className="mt-1.5 md:hidden">{todo}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell">{r.itemCount}</td>
                    <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell">{r.attemptCount}</td>
                    <td className="hidden px-4 py-3 md:table-cell">{todo ?? <span className="text-subtle">Nothing pending</span>}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-muted lg:table-cell">{timeAgo(r.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} scope={scope} />
    </div>
  );
}

export default function AssessmentListPage() {
  return <AssessmentList />;
}
