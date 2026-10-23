import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeftIcon, ChatCircleIcon, CheckCircleIcon, CopyIcon, DownloadSimpleIcon, ExamIcon, KanbanIcon, ListIcon, MagicWandIcon, UsersIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';
import {
  Badge,
  Banner,
  Button,
  ButtonLink,
  buttonClass,
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
  Select,
  SkeletonRows,
  StatusBadge,
  Tabs,
} from '@/components/ui';
import { SOURCE_LABEL, type AppRow, type JobDetail } from './api';
import { FairnessNote, MatchScore, StageMoveDialog } from './components';
import { JobForm } from './JobForm';

type Board = { items: AppRow[]; total: number; columns: { key: string; label: string; closing: boolean }[]; canManage: boolean; note: string };

const ASSESSMENT_LABEL: Record<string, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' }> = {
  not_invited: { label: 'Not invited', tone: 'neutral' },
  invited: { label: 'Invited', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
};

function reasonRule(stages: string[], fromStages: string[], to: string): string | null {
  if (to === 'rejected') return 'Rejections need a reason for the decision record.';
  const t = stages.indexOf(to);
  for (const f of fromStages) {
    const i = stages.indexOf(f);
    if (i < 0) return 'Reopening a closed application needs a reason.';
    if (t < i) return 'Moving an application back needs a reason.';
    if (t - i > 1) return 'This skips at least one stage. Skipping stages needs a reason.';
  }
  return null;
}

function AppCard({ a, selected, onSelect, onMove, canManage }: { a: AppRow; selected: boolean; onSelect: (v: boolean) => void; onMove: () => void; canManage: boolean }) {
  const closed = a.status === 'withdrawn' || a.status === 'declined';
  const nav = useNavigate();
  return (
    <li className={clsx('rounded-md border bg-surface p-2.5 text-[13px] shadow-1', selected ? 'border-accent' : 'border-border')}>
      <div className="flex items-start gap-2">
        {canManage && !closed && (
          <input type="checkbox" className="mt-1 accent-[var(--accent)]" aria-label={`Select ${a.candidate.name}`} checked={selected} onChange={(e) => onSelect(e.target.checked)} />
        )}
        <div className="min-w-0 flex-1">
          <Link to={`/app/hire/candidates/${a.id}`} className="block truncate font-medium hover:underline">
            {a.candidate.name}
          </Link>
          {a.candidate.headline && <div className="truncate text-[12px] text-muted">{a.candidate.headline}</div>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <MatchScore score={a.match.score} className="text-[13px]" />
            {a.assessment.summary !== 'not_invited' && <Badge tone={ASSESSMENT_LABEL[a.assessment.summary].tone}>{ASSESSMENT_LABEL[a.assessment.summary].label}</Badge>}
            {a.status === 'declined' && <Badge>Declined offer</Badge>}
            {a.unread > 0 && (
              <Badge tone="warning" icon={<ChatCircleIcon size={12} />}>
                {a.unread}
              </Badge>
            )}
          </div>
        </div>
        {canManage && !closed && (
          <Menu label={`Actions for ${a.candidate.name}`} items={[{ label: 'Move to another stage', onSelect: onMove }, { label: 'Open profile', onSelect: () => nav(`/app/hire/candidates/${a.id}`) }]} />
        )}
      </div>
    </li>
  );
}

function ShortlistDialog({ open, onOpenChange, jobId, onSelect }: { open: boolean; onOpenChange: (v: boolean) => void; jobId: string; onSelect: (ids: string[]) => void }) {
  const [minScore, setMinScore] = useState('60');
  const [allRequired, setAllRequired] = useState(false);
  const m = useMutation({
    mutationFn: () => api.post<{ suggestions: { applicationId: string; score: number | null; factors: { name: string; outcome: string; required: boolean }[] }[]; note: string }>(`/hire/jobs/${jobId}/suggest-shortlist`, { minScore: Number(minScore) || 0, requireAllRequired: allRequired }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) m.reset();
        onOpenChange(v);
      }}
      title="Suggest a shortlist"
      description="Finds active candidates whose skill evidence meets your threshold. Nothing changes until you review and move them yourself."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
          {m.data?.suggestions.length ? (
            <Button
              variant="primary"
              onClick={() => {
                onSelect(m.data!.suggestions.map((s) => s.applicationId));
                onOpenChange(false);
                toast.success('Selected on the board. Review each one, then use Move selected.');
              }}
            >
              Select {m.data.suggestions.length} for review
            </Button>
          ) : (
            <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
              Find candidates
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Minimum match score" helper="0 to 100, from evidence for the job's listed skills.">
          <Input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(e.target.value)} />
        </Field>
        <Checkbox checked={allRequired} onCheckedChange={setAllRequired} label="Only candidates who meet every required skill" />
        {m.data && (
          <div className="space-y-2">
            <Banner tone="info">{m.data.note}</Banner>
            {!m.data.suggestions.length ? (
              <p className="text-[13px] text-muted">No candidates meet this threshold. Nobody was rejected; try a lower score.</p>
            ) : (
              <ul className="space-y-1 text-[13px]">
                {m.data.suggestions.map((s) => (
                  <li key={s.applicationId} className="flex items-center justify-between rounded border border-border px-2 py-1">
                    <Link to={`/app/hire/candidates/${s.applicationId}`} className="hover:underline" target="_blank">
                      Open profile
                    </Link>
                    <span className="text-muted">
                      Score {s.score} · {s.factors.filter((f) => f.outcome === 'met').length} of {s.factors.length} skills met
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function InviteAssessmentDialog({ open, onOpenChange, jobId, applicationIds, assessments }: { open: boolean; onOpenChange: (v: boolean) => void; jobId: string; applicationIds: string[]; assessments: JobDetail['assessments'] }) {
  const qc = useQueryClient();
  const [aid, setAid] = useState('');
  const [due, setDue] = useState('');
  const m = useMutation({
    mutationFn: () => api.post<{ invited: number; alreadyInvited: number; note: string | null }>(`/hire/jobs/${jobId}/assessments/${aid}/invite`, { applicationIds, dueAt: due ? new Date(`${due}T23:59:00`).toISOString() : null }),
    onSuccess: (r) => {
      toast.success(`Invited ${r.invited}${r.alreadyInvited ? `, ${r.alreadyInvited} already invited` : ''}.${r.note ? ` ${r.note}` : ''}`);
      qc.invalidateQueries({ queryKey: ['hire'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Invite ${applicationIds.length} to an assessment`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!aid} disabledReason="Choose an assessment" onClick={() => m.mutate()}>
            Send invitations
          </Button>
        </>
      }
    >
      {!assessments.length ? (
        <p className="text-[13.5px] text-muted">This job has no linked assessment yet. Add one on the Assessments tab.</p>
      ) : (
        <div className="space-y-4">
          <Field label="Assessment">
            <Select value={aid} onChange={(e) => setAid(e.target.value)}>
              <option value="">Choose an assessment</option>
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({a.status})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Complete by" optional>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

function AssessmentsTab({ data, canManage }: { data: JobDetail; canManage: boolean }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [title, setTitle] = useState(`${data.job.title} screen`);
  const [linkId, setLinkId] = useState('');
  const existing = useQuery({
    queryKey: ['hire', 'recruitment-assessments'],
    queryFn: () => api.get<{ items: { id: string; title: string; status: string; jobPostingId: string | null }[] }>(`/assessments/manage${qs({ mode: 'recruitment' })}`),
    enabled: canManage,
  });
  const create = useMutation({
    mutationFn: async () => {
      const r = await api.post<{ assessment: { id: string } }>('/assessments', { title, mode: 'recruitment', jobPostingId: data.job.id });
      await api.post(`/hire/jobs/${data.job.id}/assessment`, { assessmentId: r.assessment.id });
      return r.assessment.id;
    },
    onSuccess: (id) => {
      toast.success('Assessment created. Add questions, then publish it.');
      qc.invalidateQueries({ queryKey: ['hire'] });
      nav(`/app/hire/assessments/${id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const link = useMutation({
    mutationFn: (assessmentId: string | null) => api.post(`/hire/jobs/${data.job.id}/assessment`, { assessmentId }),
    onSuccess: () => {
      toast.success('Screen updated.');
      qc.invalidateQueries({ queryKey: ['hire'] });
      setLinkId('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const linkable = (existing.data?.items ?? []).filter((a) => !data.assessments.some((x) => x.id === a.id));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Linked assessments" description="Invite applicants from the board or the applicants table. Completion and scores appear on each candidate." />
        <CardBody>
          {!data.assessments.length ? (
            <EmptyState icon={<ExamIcon size={22} />} title="No assessment linked" description="Create a recruitment assessment for this job or link one you already have." />
          ) : (
            <ul className="divide-y divide-border">
              {data.assessments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <Link to={a.link} className="font-medium hover:underline">
                      {a.title}
                    </Link>
                    <div className="text-[12.5px] text-muted">
                      {a.invited} invited · {a.completed} completed {a.primary && <Badge tone="accent" className="ml-1">Primary screen</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={a.status} />
                    {canManage && a.primary && (
                      <Button size="sm" variant="ghost" onClick={() => link.mutate(null)}>
                        Unset primary
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      {canManage && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Create an assessment" />
            <CardBody className="space-y-3">
              <Field label="Title">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Button variant="primary" loading={create.isPending} disabled={title.trim().length < 3} disabledReason="Use at least 3 characters" onClick={() => create.mutate()}>
                Create and open editor
              </Button>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Link an existing one" />
            <CardBody className="space-y-3">
              <Select aria-label="Recruitment assessment" value={linkId} onChange={(e) => setLinkId(e.target.value)}>
                <option value="">{existing.isLoading ? 'Loading...' : linkable.length ? 'Choose an assessment' : 'No other recruitment assessments'}</option>
                {linkable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} ({a.status})
                  </option>
                ))}
              </Select>
              <Button loading={link.isPending} disabled={!linkId} disabledReason="Choose an assessment" onClick={() => link.mutate(linkId)}>
                Link as primary screen
              </Button>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

function Checklist({ data }: { data: JobDetail }) {
  return (
    <Card>
      <CardHeader title="Publish checklist" description={data.checklist.ready ? 'Ready to publish.' : 'Each open item explains what is missing.'} />
      <CardBody>
        <ul className="space-y-2 text-[13px]">
          {data.checklist.items.map((i) => (
            <li key={i.key} className="flex items-start gap-2">
              {i.ok ? <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-success" /> : <WarningCircleIcon size={16} className="mt-0.5 shrink-0 text-warning" />}
              <div>
                <div className={i.ok ? '' : 'font-medium'}>{i.label}</div>
                {!i.ok && <div className="text-muted">{i.reason}</div>}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export default function JobDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'pipeline';
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['hire', 'job', id], queryFn: () => api.get<JobDetail>(`/hire/jobs/${id}`) });
  const [filters, setFilters] = useState({ stage: '', status: '', skill: '', assessment: '', sort: 'recent' });
  const board = useQuery({
    queryKey: ['hire', 'job', id, 'apps', filters],
    queryFn: () => api.get<Board>(`/hire/jobs/${id}/applications${qs(filters)}`),
    enabled: !!q.data && (tab === 'pipeline' || tab === 'applicants'),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [move, setMove] = useState<{ ids: string[]; stage?: string; label: string } | null>(null);
  const [shortlist, setShortlist] = useState(false);
  const [invite, setInvite] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const action = useMutation({
    mutationFn: (a: 'publish' | 'close' | 'duplicate') => api.post<{ job: { id: string } }>(`/hire/jobs/${id}/${a}`),
    onSuccess: (r, a) => {
      toast.success({ publish: 'Job published. Candidates can now apply.', close: 'Job closed to new applications.', duplicate: 'Draft copy created.' }[a]);
      qc.invalidateQueries({ queryKey: ['hire'] });
      setConfirmClose(false);
      if (a === 'duplicate') nav(`/app/hire/jobs/${r.job.id}?tab=details`);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      qc.invalidateQueries({ queryKey: ['hire', 'job', id] });
    },
  });
  const items = board.data?.items ?? [];
  const selectedApps = items.filter((a) => selected.includes(a.id));
  const job = q.data?.job;
  const stagesForMove = useMemo(() => (job ? [...job.stages, 'rejected'].map((s) => ({ key: s, label: job.stageLabels[s] ?? s })) : []), [job]);

  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data || !job) return null;
  const canManage = q.data.canManage;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        breadcrumb={
          <Link to="/app/hire/jobs" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeftIcon size={13} /> Jobs
          </Link>
        }
        title={job.title}
        badge={<StatusBadge status={job.status} />}
        description={[job.team, job.location, job.closesAt ? `closes ${formatDate(job.closesAt)}` : null, `${job.applicants} applicants`].filter(Boolean).join(' · ')}
        actions={
          canManage && (
            <>
              <a className={buttonClass('secondary', 'md')} href={`/api/hire/exports/pipeline.csv${qs({ postingId: job.id })}`} download>
                <DownloadSimpleIcon size={15} /> Export CSV
              </a>
              <Button icon={<CopyIcon size={15} />} onClick={() => action.mutate('duplicate')} loading={action.isPending && action.variables === 'duplicate'}>
                Duplicate
              </Button>
              {job.status === 'published' && <Button onClick={() => setConfirmClose(true)}>Close job</Button>}
              {(job.status === 'draft' || job.status === 'closed') && (
                <Button variant="primary" loading={action.isPending && action.variables === 'publish'} disabled={!q.data.checklist.ready} disabledReason={q.data.checklist.items.filter((i) => !i.ok).map((i) => i.reason).join(' ')} onClick={() => action.mutate('publish')}>
                  {job.status === 'closed' ? 'Reopen' : 'Publish'}
                </Button>
              )}
            </>
          )
        }
      />
      {job.status === 'draft' && !q.data.checklist.ready && (
        <Banner tone="info" title="This job is a draft" action={<Button size="sm" onClick={() => setParams({ tab: 'details' })}>Open checklist</Button>}>
          Complete the publish checklist on the Details tab to publish it.
        </Banner>
      )}
      <Tabs
        value={tab}
        onValueChange={(v) => setParams({ tab: v })}
        tabs={[
          { value: 'pipeline', label: <><KanbanIcon size={15} /> Pipeline</> },
          { value: 'applicants', label: <><ListIcon size={15} /> Applicants</>, count: job.applicants },
          { value: 'details', label: 'Details' },
          { value: 'assessments', label: 'Assessments', count: q.data.assessments.length },
        ]}
      />

      {(tab === 'pipeline' || tab === 'applicants') && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {tab === 'pipeline' && <FairnessNote className="min-w-0 flex-1" />}
            {tab === 'applicants' && (
              <>
                <Select aria-label="Filter by stage" className="w-44" value={filters.stage} onChange={(e) => setFilters({ ...filters, stage: e.target.value })}>
                  <option value="">All stages</option>
                  {[...job.stages, 'rejected', 'withdrawn'].map((s) => (
                    <option key={s} value={s}>
                      {job.stageLabels[s] ?? s}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Filter by required skill met" className="w-48" value={filters.skill} onChange={(e) => setFilters({ ...filters, skill: e.target.value })}>
                  <option value="">Any skills</option>
                  {job.requiredSkills.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      Meets {s.name}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Filter by assessment" className="w-56" value={filters.assessment} onChange={(e) => setFilters({ ...filters, assessment: e.target.value })}>
                  <option value="">Any assessment status</option>
                  {Object.entries(ASSESSMENT_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Sort" className="w-48" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
                  <option value="recent">Recently updated</option>
                  <option value="match">Skill match</option>
                </Select>
              </>
            )}
            {canManage && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button size="sm" icon={<MagicWandIcon size={14} />} onClick={() => setShortlist(true)}>
                  Suggest shortlist
                </Button>
                {selected.length > 0 && (
                  <>
                    <span className="text-[13px] text-muted">{selected.length} selected</span>
                    <Button size="sm" onClick={() => setSelected([])}>
                      Clear
                    </Button>
                    <Button size="sm" onClick={() => setInvite(true)}>
                      Invite to assessment
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => setMove({ ids: selected, label: `${selected.length} candidates` })}>
                      Move selected
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
          {tab === 'applicants' && <FairnessNote />}
          {board.error ? (
            <ErrorState error={board.error} onRetry={() => board.refetch()} />
          ) : !board.data ? (
            <SkeletonRows rows={5} />
          ) : !items.length && !Object.values(filters).some((v) => v && v !== 'recent') ? (
            <EmptyState
              icon={<UsersIcon size={22} />}
              title="No applications yet"
              description={job.status === 'published' ? 'Candidates who apply from the job board appear here. You can also invite people from Candidates, Search.' : 'Publish the job to start receiving applications.'}
              action={canManage && job.status === 'published' && <ButtonLink to="/app/hire/candidates?tab=search">Search candidates</ButtonLink>}
            />
          ) : tab === 'pipeline' ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {board.data.columns.map((col) => {
                const colItems = items.filter((a) => a.stage === col.key);
                return (
                  <section key={col.key} className={clsx('flex w-64 shrink-0 flex-col rounded-lg border border-border p-2', col.closing ? 'bg-surface-2/40' : 'bg-surface-2')} aria-label={`${col.label} column`}>
                    <h3 className="mb-2 flex items-center justify-between px-1 text-[13px] font-semibold">
                      {col.label}
                      <span className="rounded-full bg-surface px-1.5 text-[11.5px] tabular-nums text-muted">{colItems.length}</span>
                    </h3>
                    {!colItems.length ? (
                      <p className="px-1 py-3 text-[12.5px] text-subtle">Nobody in this stage.</p>
                    ) : (
                      <ul className="space-y-2">
                        {colItems.map((a) => (
                          <AppCard
                            key={a.id}
                            a={a}
                            canManage={canManage}
                            selected={selected.includes(a.id)}
                            onSelect={(v) => setSelected(v ? [...selected, a.id] : selected.filter((x) => x !== a.id))}
                            onMove={() => setMove({ ids: [a.id], label: a.candidate.name })}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          ) : !items.length ? (
            <EmptyState icon={<UsersIcon size={22} />} title="No candidates match these filters" description="Clear a filter to see more candidates." action={<Button onClick={() => setFilters({ stage: '', status: '', skill: '', assessment: '', sort: 'recent' })}>Clear filters</Button>} />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13.5px]">
                <thead>
                  <tr className="border-b border-border bg-surface-2/60 text-left text-[12px] text-muted">
                    {canManage && (
                      <th className="w-10 py-2.5 pl-4 pr-0">
                        <input
                          type="checkbox"
                          className="accent-[var(--accent)]"
                          aria-label="Select all"
                          checked={items.length > 0 && items.filter((a) => a.status === 'active' || a.status === 'rejected').every((a) => selected.includes(a.id))}
                          onChange={(e) => setSelected(e.target.checked ? items.filter((a) => a.status === 'active' || a.status === 'rejected').map((a) => a.id) : [])}
                        />
                      </th>
                    )}
                    <th className="px-4 py-2.5 font-medium">Candidate</th>
                    <th className="px-4 py-2.5 font-medium">Stage</th>
                    <th className="px-4 py-2.5 font-medium">Match</th>
                    <th className="px-4 py-2.5 font-medium">Assessment</th>
                    <th className="px-4 py-2.5 font-medium">Source</th>
                    <th className="px-4 py-2.5 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      {canManage && (
                        <td className="px-4 py-3">
                          {(a.status === 'active' || a.status === 'rejected') && (
                            <input type="checkbox" className="accent-[var(--accent)]" aria-label={`Select ${a.candidate.name}`} checked={selected.includes(a.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, a.id] : selected.filter((x) => x !== a.id))} />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <Link to={`/app/hire/candidates/${a.id}`} className="font-medium hover:underline">
                          {a.candidate.name}
                        </Link>
                        {a.unread > 0 && <Badge tone="warning" className="ml-2">{a.unread} unread</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.stage} />
                      </td>
                      <td className="px-4 py-3">
                        <MatchScore score={a.match.score} />
                        <span className="ml-1 text-[12px] text-subtle">
                          {a.match.met}/{a.match.total} met
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={ASSESSMENT_LABEL[a.assessment.summary].tone}>{ASSESSMENT_LABEL[a.assessment.summary].label}</Badge>
                        {a.assessment.items.find((x) => x.percent !== null) && <span className="ml-1 text-[12px] tabular-nums">{a.assessment.items.find((x) => x.percent !== null)!.percent}%</span>}
                      </td>
                      <td className="px-4 py-3 text-muted">{SOURCE_LABEL[a.source] ?? a.source}</td>
                      <td className="px-4 py-3 text-muted">{timeAgo(a.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {tab === 'details' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          {canManage ? <JobForm key={job.updatedAt} job={job} onSaved={() => qc.invalidateQueries({ queryKey: ['hire', 'job', id] })} /> : <Banner tone="info">Only recruiters can edit job details.</Banner>}
          <div className="space-y-4">
            <Checklist data={q.data} />
          </div>
        </div>
      )}

      {tab === 'assessments' && <AssessmentsTab data={q.data} canManage={canManage} />}

      <StageMoveDialog
        open={!!move}
        onOpenChange={(v) => !v && setMove(null)}
        applicationIds={move?.ids ?? []}
        stages={stagesForMove}
        candidateLabel={move?.label ?? ''}
        needsReasonFor={(s) => reasonRule(job.stages, (move?.ids ?? []).map((i) => items.find((a) => a.id === i)?.stage ?? 'applied'), s)}
        onDone={() => setSelected([])}
      />
      <ShortlistDialog open={shortlist} onOpenChange={setShortlist} jobId={job.id} onSelect={(ids) => { setSelected(ids); setParams({ tab: 'pipeline' }); }} />
      <InviteAssessmentDialog open={invite} onOpenChange={setInvite} jobId={job.id} applicationIds={selectedApps.map((a) => a.id)} assessments={q.data.assessments} />
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Close this job?"
        description="New applications stop immediately. Candidates already in the pipeline stay, and you can keep moving them."
        confirmLabel="Close job"
        loading={action.isPending}
        onConfirm={() => action.mutate('close')}
      />
    </div>
  );
}
