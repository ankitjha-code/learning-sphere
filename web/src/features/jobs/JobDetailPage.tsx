import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapPinIcon, PaperPlaneTiltIcon, BookmarkIcon, BookmarkSimpleIcon, CheckCircleIcon, MinusCircleIcon, TargetIcon, FileTextIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';
import { PageHeader, Card, CardHeader, CardBody, ErrorState, SkeletonRows, Button, ButtonLink, Badge, Dialog, Field, Select, Textarea, Checkbox, ConfirmDialog, ProvenanceTag, StatusBadge, Banner, Input, EmptyState, buttonClass } from '@/components/ui';
import { TYPE_LABEL, WORKPLACE_LABEL, type Match } from './shared';

type Job = {
  id: string;
  title: string;
  team: string | null;
  company: string;
  companyWebsite: string | null;
  isSample: boolean;
  location: string;
  workplace: string;
  employmentType: string;
  description: string;
  responsibilities: string[];
  requiredSkills: { slug: string; name: string; required: boolean }[];
  eligibility: { minExperienceYears?: number; graduationYears?: number[]; degrees?: string[]; workAuthorization?: string; notes?: string };
  salaryText: string | null;
  openings: number;
  status: string;
  publishedAt: string | null;
  closesAt: string | null;
  campusOnly: boolean;
  open: boolean;
};
type Detail = { job: Job; match: Match; saved: boolean; myApplication: { id: string; stage: string; status: string; appliedAt: string; portfolioShared: boolean } | null };

function ApplyDialog({ open, onOpenChange, job }: { open: boolean; onOpenChange: (v: boolean) => void; job: Job }) {
  const qc = useQueryClient();
  const resumes = useQuery({ queryKey: ['career', 'resumes'], queryFn: () => api.get<{ items: { id: string; title: string; isPrimary: boolean; targetRole: string | null }[] }>('/career/resumes'), enabled: open });
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [coverNote, setCoverNote] = useState('');
  const [share, setShare] = useState(false);
  const items = resumes.data?.items ?? [];
  const chosen = resumeId ?? items.find((r) => r.isPrimary)?.id ?? '';
  const apply = useMutation({
    mutationFn: () => api.post(`/jobs/${job.id}/apply`, { resumeId: chosen || null, coverNote: coverNote.trim() || null, sharePortfolio: share }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['career'] });
      toast.success('Application sent. It is also in your application tracker.');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = apply.error instanceof ApiError ? apply.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Apply: ${job.title}`}
      description={`To ${job.company}. You can apply once; you can withdraw later.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" icon={<PaperPlaneTiltIcon size={14} />} loading={apply.isPending} onClick={() => apply.mutate()}>
            Send application
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {resumes.isLoading ? (
          <SkeletonRows rows={1} />
        ) : items.length === 0 ? (
          <Banner tone="warning" title="You have no resume yet" action={<ButtonLink size="sm" to="/app/career/resumes?new=1">Create one</ButtonLink>}>
            You can still apply; the employer will only see your profile and anything you share.
          </Banner>
        ) : (
          <Field label="Resume version" error={fields.resumeId} helper="A snapshot of this version is sent. Later edits do not change what the employer sees.">
            <Select value={chosen} onChange={(e) => setResumeId(e.target.value)}>
              <option value="">Do not attach a resume</option>
              {items.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                  {r.isPrimary ? ' (primary)' : ''}
                  {r.targetRole ? ` · for ${r.targetRole}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Note to the employer" optional helper="A few sentences in your own words.">
          <Textarea rows={4} value={coverNote} onChange={(e) => setCoverNote(e.target.value)} />
        </Field>
        <div className="rounded-md border border-border p-3">
          <Checkbox
            checked={share}
            onCheckedChange={setShare}
            label="Share my portfolio and Skill DNA evidence with this employer"
            description="Recruiters at this organization can see your projects and skill evidence for this application. You can withdraw the application at any time."
          />
        </div>
      </div>
    </Dialog>
  );
}

export default function JobDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const key = ['jobs', 'detail', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<Detail>(`/jobs/${id}`) });
  const [applyOpen, setApplyOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: (saved: boolean) => (saved ? api.del(`/jobs/saved/platform/${id}`) : api.post('/jobs/saved', { kind: 'platform', refId: id })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Updated saved jobs.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const target = useMutation({
    mutationFn: (job: Job) => api.post<{ target: { id: string } }>('/career/targets', { title: job.title, company: job.company, description: `${job.description}\n\n${job.responsibilities.join('\n')}\n\nRequirements:\n${job.requiredSkills.filter((s) => s.required).map((s) => `- ${s.name}`).join('\n')}\n\nNice to have:\n${job.requiredSkills.filter((s) => !s.required).map((s) => `- ${s.name}`).join('\n')}` }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['career'] });
      toast.success('Saved as a job target with a gap analysis.', { action: { label: 'Open', onClick: () => nav(`/app/career/targets/${r.target.id}`) } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const withdraw = useMutation({
    mutationFn: () => api.post(`/jobs/applications/${q.data!.myApplication!.id}/withdraw`, { reason: reason || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['career'] });
      setWithdrawOpen(false);
      toast.success('Application withdrawn. The employer has been notified.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.error) {
    if (q.error instanceof ApiError && q.error.status === 404)
      return <EmptyState icon={<MinusCircleIcon size={22} />} title="This job is not available" description="It may have closed, or it is only open to students of a partner college." action={<ButtonLink to="/app/jobs">Back to job board</ButtonLink>} />;
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  }
  if (!q.data) return null;
  const { job, match, myApplication } = q.data;
  const e = job.eligibility ?? {};
  const eligibilityLines = [
    e.minExperienceYears !== undefined && `Experience: at least ${e.minExperienceYears} year(s)`,
    e.graduationYears?.length && `Graduation year: ${e.graduationYears.join(', ')}`,
    e.degrees?.length && `Degrees: ${e.degrees.join(', ')}`,
    e.workAuthorization && `Work authorization: ${e.workAuthorization}`,
    e.notes,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        breadcrumb={<Link to="/app/jobs">Job board</Link>}
        title={job.title}
        badge={
          <>
            {job.isSample && <ProvenanceTag kind="sample" />}
            {job.campusOnly && <Badge tone="info">Campus drive</Badge>}
            {!job.open && <StatusBadge status="closed" />}
          </>
        }
        description={
          <span>
            {job.company}
            {job.team && ` · ${job.team}`} · <MapPinIcon size={12} className="inline" /> {job.location} · {WORKPLACE_LABEL[job.workplace] ?? job.workplace} · {TYPE_LABEL[job.employmentType] ?? job.employmentType}
          </span>
        }
        actions={
          <>
            <Button icon={q.data.saved ? <BookmarkSimpleIcon size={16} weight="fill" /> : <BookmarkIcon size={16} />} loading={save.isPending} onClick={() => save.mutate(q.data!.saved)}>
              {q.data.saved ? 'Unsave' : 'Save'}
            </Button>
            <Button icon={<TargetIcon size={16} />} loading={target.isPending} onClick={() => target.mutate(job)}>
              Analyze my gaps
            </Button>
            {myApplication ? (
              myApplication.status === 'active' ? (
                <Button variant="danger" onClick={() => setWithdrawOpen(true)}>
                  Withdraw application
                </Button>
              ) : null
            ) : (
              <Button variant="primary" icon={<PaperPlaneTiltIcon size={16} />} disabled={!job.open} disabledReason="This job is no longer accepting applications" onClick={() => setApplyOpen(true)}>
                Apply
              </Button>
            )}
          </>
        }
      />
      {myApplication && (
        <Banner tone={myApplication.status === 'active' ? 'success' : 'info'} className="mb-6" title={myApplication.status === 'active' ? `You applied ${timeAgo(myApplication.appliedAt)}` : `Application ${myApplication.status}`}>
          Current stage: {myApplication.stage.replace(/_/g, ' ')}. Portfolio {myApplication.portfolioShared ? 'shared' : 'not shared'}.{' '}
          <Link to="/app/career/applications" className="font-medium text-accent-text underline-offset-2 hover:underline">
            Open your tracker
          </Link>
        </Banner>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="About the role" />
            <CardBody className="space-y-4">
              <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{job.description}</div>
              {job.responsibilities.length > 0 && (
                <div className="border-t border-border pt-4">
                  <h4 className="text-[13.5px] font-semibold">Responsibilities</h4>
                  <ul className="mt-1.5 ml-5 list-disc space-y-1 text-[14px] leading-relaxed">{job.responsibilities.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              )}
            </CardBody>
          </Card>
          {eligibilityLines.length > 0 && (
            <Card>
              <CardHeader title="Eligibility (as stated by the employer)" description="Check these yourself; they are not evaluated here." />
              <CardBody>
                <ul className="ml-5 list-disc space-y-1 text-[13.5px]">{eligibilityLines.map((l, i) => <li key={i}>{l}</li>)}</ul>
              </CardBody>
            </Card>
          )}
        </div>
        <aside className="space-y-5">
          <Card>
            <CardHeader title={`Evidence match ${match.hasSkills ? `${match.score}%` : ''}`} description={match.skillsSource === 'posting' ? 'Skills listed by the employer.' : 'Skills found in the description (no list provided).'} />
            <CardBody className="space-y-3">
              {!match.hasSkills ? (
                <p className="text-[13px] text-muted">No skills to match.</p>
              ) : (
                <ul className="space-y-2.5">
                  {match.factors.map((f) => (
                    <li key={f.label} className="flex items-start gap-2 text-[13px]">
                      {f.met ? <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-success" aria-label="Evidence" /> : <MinusCircleIcon size={16} className="mt-0.5 shrink-0 text-subtle" aria-label="Little or no evidence" />}
                      <span>
                        {f.label}
                        <span className="block text-[12px] text-muted">{f.evidence}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="border-t border-border pt-3 text-[12px] leading-relaxed text-subtle">{match.note}</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="divide-y divide-border text-[13px]">
                {(
                  [
                    ['Salary', job.salaryText],
                    ['Openings', String(job.openings)],
                    ['Posted', job.publishedAt ? formatDate(job.publishedAt) : null],
                    ['Closes', job.closesAt ? formatDate(job.closesAt) : null],
                  ] as [string, string | null][]
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                      <dt className="text-muted">{k}</dt>
                      <dd className="text-right font-medium">{v}</dd>
                    </div>
                  ))}
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <ButtonLink size="sm" to="/app/career/resumes" icon={<FileTextIcon size={14} />}>
                  Prepare a resume
                </ButtonLink>
                {job.companyWebsite && (
                  <a href={job.companyWebsite} target="_blank" rel="noopener noreferrer" className={buttonClass('ghost', 'sm')}>
                    Company website <ArrowSquareOutIcon size={14} />
                  </a>
                )}
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>
      <ApplyDialog open={applyOpen} onOpenChange={setApplyOpen} job={job} />
      <ConfirmDialog open={withdrawOpen} onOpenChange={setWithdrawOpen} title="Withdraw your application?" description="The employer is notified and the application closes. You cannot re-apply to this posting." confirmLabel="Withdraw" danger loading={withdraw.isPending} onConfirm={() => withdraw.mutate()}>
        <Field label="Reason" optional helper="Shared with the employer.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
