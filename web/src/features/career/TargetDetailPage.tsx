import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircleIcon, CircleIcon, SparkleIcon, TrashIcon, FileTextIcon, EnvelopeSimpleIcon, ScalesIcon, BookOpenTextIcon, CodeIcon, HammerIcon, InfoIcon, XIcon, PlusIcon, ArrowSquareOutIcon, CaretRightIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PageHeader, Card, CardHeader, CardBody, ErrorState, SkeletonRows, Button, ButtonLink, Badge, ConfirmDialog, Dialog, Field, Select, EmptyState, Banner, buttonClass } from '@/components/ui';
import { GapBadge, ReadinessMeter, AiUnavailable } from './components';
import { isAiFailure, type AiFailure, type Analysis, type ResumeSummary, type Target } from './api';

type Detail = { target: Target; analysis: Analysis };

export default function TargetDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const key = ['career', 'target', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<Detail>(`/career/targets/${id}`) });
  const [showFormula, setShowFormula] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tailorOpen, setTailorOpen] = useState(false);
  const [aiFailure, setAiFailure] = useState<AiFailure | null>(null);
  const [addSlug, setAddSlug] = useState('');

  const skillsList = useQuery({ queryKey: ['learning', 'skills'], queryFn: () => api.get<{ skills: { slug: string; name: string }[] }>('/learning/skills'), staleTime: 300_000 });

  const saveSkills = useMutation({
    mutationFn: (skills: { slug: string; required: boolean }[]) => api.put<Detail>(`/career/targets/${id}/skills`, { skills }),
    onSuccess: (d) => {
      qc.setQueryData(key, d);
      qc.invalidateQueries({ queryKey: ['career', 'targets'] });
      toast.success('Skill list updated.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const aiExtract = useMutation({
    mutationFn: () => api.post<AiFailure | { ok: true; suggestions: { slug: string; name: string; required: boolean }[] }>(`/career/targets/${id}/ai-extract`, {}),
    onSuccess: (r) => {
      if (isAiFailure(r)) setAiFailure(r);
      else {
        setAiFailure(null);
        qc.invalidateQueries({ queryKey: key });
        toast.success(r.suggestions.length ? `${r.suggestions.length} AI suggestions to review.` : 'AI found no additional skills.');
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => api.del(`/career/targets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['career'] });
      toast.success('Job target deleted.');
      nav('/app/career/targets');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return null;
  const { target, analysis } = q.data;
  const current = target.extractedSkills.map((s) => ({ slug: s.slug, required: s.required }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        breadcrumb={<Link to="/app/career/targets">Job targets</Link>}
        title={target.title}
        description={[target.company, `saved ${timeAgo(target.createdAt)}`].filter(Boolean).join(' · ')}
        actions={
          <>
            {target.url && (
              <a href={target.url} target="_blank" rel="noopener noreferrer" className={buttonClass('ghost', 'md')}>
                Original posting <ArrowSquareOutIcon size={14} />
              </a>
            )}
            <Button icon={<FileTextIcon size={16} />} onClick={() => setTailorOpen(true)}>
              Tailor a resume
            </Button>
            <ButtonLink to={`/app/career/documents?new=cover_letter&targetId=${target.id}`} icon={<EnvelopeSimpleIcon size={16} />}>
              Draft cover letter
            </ButtonLink>
            <ButtonLink to={`/app/career/offers?targetId=${target.id}`} icon={<ScalesIcon size={16} />}>
              Check against priorities
            </ButtonLink>
            <Button variant="ghost" icon={<TrashIcon size={16} />} onClick={() => setConfirmDelete(true)} aria-label="Delete job target" />
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0 self-start">
          <CardHeader
            title="Skill gap report"
            description={`${analysis.counts.required} required, ${analysis.counts.preferred} preferred. Statuses come from your Skill DNA.`}
            action={
              <Button size="sm" variant="soft" icon={<SparkleIcon size={14} />} loading={aiExtract.isPending} onClick={() => aiExtract.mutate()}>
                Ask AI for missed skills
              </Button>
            }
          />
          <CardBody className="space-y-3">
            {aiFailure && <AiUnavailable failure={aiFailure} />}
            {analysis.aiSuggestedSkills.length > 0 && (
              <Banner tone="info" title="AI suggested these skills. Confirm each against the job description before adding.">
                <div className="mt-2 flex flex-wrap gap-2">
                  {analysis.aiSuggestedSkills.map((s) => (
                    <Button key={s.slug} size="sm" icon={<PlusIcon size={12} />} onClick={() => saveSkills.mutate([...current, { slug: s.slug, required: s.required }])}>
                      {s.name}
                      {s.required ? '' : ' (preferred)'}
                    </Button>
                  ))}
                </div>
              </Banner>
            )}
            {analysis.skills.length === 0 ? (
              <EmptyState icon={<InfoIcon size={22} />} title="No known skills found" description="The description did not mention skills from the platform list. Add the ones the role needs below." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13.5px]">
                  <thead className="text-[12px] uppercase tracking-wide text-subtle">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Skill</th>
                      <th className="py-2 pr-3 font-medium">Needed</th>
                      <th className="py-2 pr-3 font-medium">Your evidence</th>
                      <th className="py-2 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {analysis.skills.map((s) => (
                      <tr key={s.slug} className="align-top">
                        <td className="py-2.5 pr-3">
                          <Link to={`/app/skills/${s.slug}`} className="font-medium hover:underline">
                            {s.name}
                          </Link>
                          {s.snippet && <div className="mt-0.5 line-clamp-2 max-w-sm text-[12px] text-subtle">"{s.snippet}"</div>}
                        </td>
                        <td className="py-2.5 pr-3">
                          <button
                            type="button"
                            className="rounded focus-visible:outline-2"
                            onClick={() => saveSkills.mutate(current.map((c) => (c.slug === s.slug ? { ...c, required: !c.required } : c)))}
                            aria-label={`Mark ${s.name} as ${s.required ? 'preferred' : 'required'}`}
                            title="Toggle required or preferred"
                          >
                            <Badge tone={s.required ? 'accent' : 'neutral'}>{s.required ? 'Required' : 'Preferred'}</Badge>
                          </button>
                        </td>
                        <td className="py-2.5 pr-3">
                          <GapBadge status={s.status} revisionDue={s.revisionDue} />
                          <div className="mt-0.5 text-[12px] text-muted">{s.evidence}</div>
                        </td>
                        <td className="py-2.5 text-right">
                          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${s.name}`} onClick={() => saveSkills.mutate(current.filter((c) => c.slug !== s.slug))} icon={<XIcon size={14} />} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <Field label="Add a skill the role needs" className="min-w-56 flex-1">
                <Select value={addSlug} onChange={(e) => setAddSlug(e.target.value)}>
                  <option value="">Choose a skill</option>
                  {(skillsList.data?.skills ?? [])
                    .filter((s) => !current.some((c) => c.slug === s.slug))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Button disabled={!addSlug} disabledReason="Choose a skill first" loading={saveSkills.isPending} onClick={() => { saveSkills.mutate([...current, { slug: addSlug, required: true }]); setAddSlug(''); }}>
                Add as required
              </Button>
            </div>
          </CardBody>
        </Card>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Readiness" description="How much evidence you have for these skills." />
            <CardBody className="space-y-2">
              <ReadinessMeter score={analysis.score} />
              <button type="button" onClick={() => setShowFormula((v) => !v)} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg" aria-expanded={showFormula}>
                <InfoIcon size={14} /> {showFormula ? 'Hide' : 'Show'} how this is calculated
              </button>
              {showFormula && (
                <div className="space-y-1 rounded-md bg-surface-2 p-3 text-[12.5px] text-muted">
                  <p>{analysis.formula.text}</p>
                  <p>{analysis.formula.note}</p>
                </div>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Readiness checklist" description={`${analysis.checklistDone} of ${analysis.checklist.length} done`} />
            <CardBody>
              <ul className="space-y-2">
                {analysis.checklist.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-[13.5px]">
                    {c.done ? <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-success" aria-label="Done" /> : <CircleIcon size={18} className="mt-0.5 shrink-0 text-subtle" aria-label="Not done" />}
                    <div>
                      <Link to={c.link} className={c.done ? 'text-muted' : 'font-medium hover:underline'}>
                        {c.label}
                      </Link>
                      {!c.done && <div className="text-[12px] text-muted">{c.hint}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </aside>
      </div>

      <Card className="mt-8">
        <CardHeader title="Targeted plan" description={analysis.plan.gaps.length ? `For ${analysis.plan.gaps.map((g) => g.name).join(', ')}` : 'No gaps that need a plan right now.'} />
        <CardBody>
          {analysis.plan.gaps.length === 0 ? (
            <p className="text-[13.5px] text-muted">Every listed skill has demonstrated or verified evidence. Keep it fresh with revision and practise interviews.</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              <PlanList title="Learn" icon={<BookOpenTextIcon size={16} />} empty="No lessons in the library cover these skills yet." items={analysis.plan.topics.map((t) => ({ link: t.link, title: t.title, meta: `${t.skill} · ${t.trackTitle} · ${t.minutes} min` }))} />
              <PlanList title="Practise" icon={<CodeIcon size={16} />} empty="No CodeLab problems are tagged with these skills yet." items={analysis.plan.practice.map((p) => ({ link: p.link, title: p.title, meta: `${p.skill} · ${p.kind} · ${p.difficulty}` }))} />
              <PlanList title="Build" icon={<HammerIcon size={16} />} empty="No project templates match these skills yet." items={analysis.plan.projects.map((p) => ({ link: p.link, title: p.title, meta: `Covers ${p.covers.join(', ')} · about ${p.estimatedHours} h` }))} />
            </div>
          )}
        </CardBody>
      </Card>

      <details className="group mt-4 rounded-lg border border-border bg-surface shadow-1">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-[15px] font-semibold tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
          <CaretRightIcon size={14} weight="bold" className="text-subtle transition-transform group-open:rotate-90" aria-hidden />
          Job description
        </summary>
        <div className="whitespace-pre-wrap border-t border-border px-5 py-4 text-[13.5px] leading-relaxed text-muted">{target.description}</div>
      </details>

      <TailorDialog open={tailorOpen} onOpenChange={setTailorOpen} targetId={target.id} />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this job target?" description="The saved description and its analysis are removed. Resumes and applications are not affected." confirmLabel="Delete" danger loading={del.isPending} onConfirm={() => del.mutate()} />
    </div>
  );
}

const PLAN_CAP = 5;

function PlanList({ title, icon, items, empty }: { title: string; icon: React.ReactNode; items: { link: string; title: string; meta: string }[]; empty: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, PLAN_CAP);
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent-text">{icon}</span>
        {title}
        {items.length > 0 && <span className="font-normal text-subtle">{items.length}</span>}
      </div>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-muted">{empty}</p>
      ) : (
        <>
          <ul className="-mx-2 space-y-0.5">
            {shown.map((i, n) => (
              <li key={n}>
                <Link to={i.link} className="block rounded-md px-2 py-1.5 transition-colors hover:bg-surface-2">
                  <div className="text-[13.5px] font-medium">{i.title}</div>
                  <div className="text-[12px] text-muted">{i.meta}</div>
                </Link>
              </li>
            ))}
          </ul>
          {items.length > PLAN_CAP && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 inline-flex h-7 items-center rounded-md px-2 -mx-2 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-soft" aria-expanded={all}>
              {all ? 'Show fewer' : `Show ${items.length - PLAN_CAP} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TailorDialog({ open, onOpenChange, targetId }: { open: boolean; onOpenChange: (v: boolean) => void; targetId: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const resumes = useQuery({ queryKey: ['career', 'resumes'], queryFn: () => api.get<{ items: ResumeSummary[] }>('/career/resumes'), enabled: open });
  const [resumeId, setResumeId] = useState('');
  const tailor = useMutation({
    mutationFn: (rid: string) => api.post<{ resume: { id: string }; tailoring: { present: string[]; missing: string[] } }>(`/career/resumes/${rid}/copy`, { targetId }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['career'] });
      toast.success(r.tailoring.missing.length ? `Tailored copy created. Missing from your resume: ${r.tailoring.missing.join(', ')}. Add them only if they are true.` : 'Tailored copy created.');
      onOpenChange(false);
      nav(`/app/career/resumes/${r.resume.id}?tailored=1`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const items = resumes.data?.items ?? [];
  const chosen = resumeId || items.find((r) => r.isPrimary)?.id || '';
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Tailor a resume for this role"
      description="Creates a copy that puts your existing, relevant content first. Nothing is added; missing skills are listed for you to decide."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={tailor.isPending} disabled={!chosen} disabledReason="Create a resume first" onClick={() => tailor.mutate(chosen)}>
            Create tailored copy
          </Button>
        </>
      }
    >
      {resumes.isLoading ? (
        <SkeletonRows rows={2} />
      ) : items.length === 0 ? (
        <EmptyState icon={<FileTextIcon size={22} />} title="No resumes yet" description="Create a resume first, then tailor it." action={<ButtonLink to="/app/career/resumes?new=1" variant="primary">Create a resume</ButtonLink>} />
      ) : (
        <Field label="Start from">
          <Select value={chosen} onChange={(e) => setResumeId(e.target.value)}>
            {items.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
                {r.isPrimary ? ' (primary)' : ''}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </Dialog>
  );
}
