import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams, useBlocker } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FloppyDiskIcon,
  PrinterIcon,
  DownloadSimpleIcon,
  SparkleIcon,
  PlusIcon,
  TrashIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  WarningCircleIcon,
  InfoIcon,
  LightbulbIcon,
  IdentificationBadgeIcon,
  QuestionIcon,
} from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PageHeader, Card, CardHeader, CardBody, ErrorState, SkeletonRows, Button, Field, Input, Textarea, Select, Tabs, Badge, Menu, Banner, Dialog, Checkbox, ConfirmDialog, EmptyState } from '@/components/ui';
import { ResumePreview } from './ResumePreview';
import { AiUnavailable, AiDraftLabel } from './components';
import { isAiFailure, type AiFailure, type ChecksResponse, type Resume, type ResumeCheck, type ResumeData } from './api';

type Detail = { resume: Resume; related: { id: string; title: string; targetRole: string | null; parentId: string | null; updatedAt: string }[] } & ChecksResponse;
type Suggestion = { section: string; kind: 'rewrite' | 'question' | 'tip'; text: string; original?: string };

const uid = () => Math.random().toString(36).slice(2, 10);
const SECTIONS = [
  { value: 'basics', label: 'Contact' },
  { value: 'summary', label: 'Summary' },
  { value: 'experience', label: 'Experience' },
  { value: 'projects', label: 'Projects' },
  { value: 'education', label: 'Education' },
  { value: 'skills', label: 'Skills' },
  { value: 'certifications', label: 'Certifications' },
  { value: 'order', label: 'Order' },
];
const SECTION_NAMES: Record<string, string> = { summary: 'Summary', experience: 'Experience', projects: 'Projects', education: 'Education', skills: 'Skills', certifications: 'Certifications' };

function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function ItemControls({ i, n, onMove, onRemove, label }: { i: number; n: number; onMove: (d: -1 | 1) => void; onRemove: () => void; label: string }) {
  return (
    <div className="flex gap-1">
      <Button size="icon-sm" variant="ghost" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => onMove(-1)} icon={<ArrowUpIcon size={14} />} />
      <Button size="icon-sm" variant="ghost" aria-label={`Move ${label} down`} disabled={i === n - 1} onClick={() => onMove(1)} icon={<ArrowDownIcon size={14} />} />
      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${label}`} onClick={onRemove} icon={<TrashIcon size={14} />} />
    </div>
  );
}

const linesToList = (s: string) => s.split('\n').map((x) => x.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);

export default function ResumeEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const key = ['career', 'resume', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<Detail>(`/career/resumes/${id}`) });
  const [data, setData] = useState<ResumeData | null>(null);
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState('clean');
  const [section, setSection] = useState('basics');
  const [dirty, setDirty] = useState(false);
  const [checks, setChecks] = useState<ChecksResponse | null>(null);
  const [ai, setAi] = useState<{ suggestions: Suggestion[]; dropped: number } | null>(null);
  const [aiFailure, setAiFailure] = useState<AiFailure | null>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  // Bullet textareas keep raw text while typing; parsed on blur.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (q.data && !dirty) {
      setData(structuredClone(q.data.resume.data));
      setTitle(q.data.resume.title);
      setTemplate(q.data.resume.template);
      setChecks({ checks: q.data.checks, stats: q.data.stats });
      setDrafts({});
    }
  }, [q.data, dirty]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  const update = (fn: (d: ResumeData) => void) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () => api.put<{ resume: Resume } & ChecksResponse>(`/career/resumes/${id}`, { title, template, data }),
    onSuccess: (r) => {
      setChecks({ checks: r.checks, stats: r.stats });
      setDirty(false);
      qc.setQueryData<Detail>(key, (d) => (d ? { ...d, resume: r.resume, checks: r.checks, stats: r.stats } : d));
      qc.invalidateQueries({ queryKey: ['career', 'resumes'] });
      toast.success('Resume saved.');
    },
    onError: (e) => toast.error(e instanceof ApiError && e.fields ? `${errorMessage(e)} ${Object.entries(e.fields).map(([k, v]) => `${k}: ${v}`).join('; ')}` : errorMessage(e)),
  });
  const review = useMutation({
    mutationFn: () => api.post<AiFailure | { ok: true; suggestions: Suggestion[]; dropped: number }>(`/career/resumes/${id}/review`, {}),
    onSuccess: (r) => {
      if (isAiFailure(r)) {
        setAiFailure(r);
        setAi(null);
      } else {
        setAiFailure(null);
        setAi({ suggestions: r.suggestions, dropped: r.dropped });
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const groupedChecks = useMemo(() => {
    const list = checks?.checks ?? [];
    return { error: list.filter((c) => c.severity === 'error'), warning: list.filter((c) => c.severity === 'warning'), tip: list.filter((c) => c.severity === 'tip') };
  }, [checks]);

  if (q.isLoading || (!data && !q.error)) return <SkeletonRows rows={8} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!data || !q.data) return null;
  const r = q.data.resume;

  const exportUrl = (format: string) => `/api/career/resumes/${id}/export?format=${format}`;
  const openCheck = (c: ResumeCheck) => {
    const s = c.path?.split(/[.[]/)[0] ?? c.section;
    if (SECTIONS.some((x) => x.value === s)) setSection(s);
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        breadcrumb={<Link to="/app/career/resumes">Resumes</Link>}
        title={title || 'Untitled resume'}
        badge={
          <>
            {r.isPrimary && <Badge tone="accent">Primary</Badge>}
            {r.targetRole && <Badge>For {r.targetRole}</Badge>}
            {dirty && <Badge tone="warning">Unsaved changes</Badge>}
          </>
        }
        description={`Version ${r.version} · saved ${timeAgo(r.updatedAt)}`}
        actions={
          <>
            <Button icon={<IdentificationBadgeIcon size={16} />} onClick={() => setPortfolioOpen(true)}>
              Import from portfolio
            </Button>
            <Menu
              label="Export"
              trigger={
                <Button icon={<DownloadSimpleIcon size={16} />} disabled={dirty} disabledReason="Save your changes before exporting">
                  Export
                </Button>
              }
              items={[
                { label: 'Print or save as PDF', icon: <PrinterIcon size={14} />, onSelect: () => window.open(exportUrl('html'), '_blank', 'noopener') },
                { label: 'Download plain text', icon: <DownloadSimpleIcon size={14} />, onSelect: () => window.open(exportUrl('text'), '_blank', 'noopener') },
                { label: 'Download JSON', icon: <DownloadSimpleIcon size={14} />, onSelect: () => window.open(exportUrl('json'), '_blank', 'noopener') },
              ]}
            />
            <Button variant="primary" icon={<FloppyDiskIcon size={16} />} loading={save.isPending} disabled={!dirty} disabledReason="No changes to save" onClick={() => save.mutate()}>
              Save
            </Button>
          </>
        }
      />
      {params.get('tailored') && (
        <Banner tone="info" className="mb-4" title="Tailored copy">
          Your existing content was reordered for the target role. Nothing was added. If the job needs a skill you genuinely have, add it yourself.
        </Banner>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardBody className="pt-4">
              <div className="mb-3 grid gap-3 sm:grid-cols-2">
                <Field label="Resume name">
                  <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
                </Field>
                <Field label="Template">
                  <Select value={template} onChange={(e) => { setTemplate(e.target.value); setDirty(true); }}>
                    <option value="clean">Clean</option>
                    <option value="compact">Compact</option>
                    <option value="modern">Modern</option>
                  </Select>
                </Field>
              </div>
              <Tabs value={section} onValueChange={setSection} tabs={SECTIONS} wrap />
              <div className="mt-4 space-y-3">
                {section === 'basics' && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Full name">
                        <Input value={data.basics.name} onChange={(e) => update((d) => void (d.basics.name = e.target.value))} />
                      </Field>
                      <Field label="Headline" optional>
                        <Input value={data.basics.headline ?? ''} onChange={(e) => update((d) => void (d.basics.headline = e.target.value))} />
                      </Field>
                      <Field label="Email">
                        <Input type="email" value={data.basics.email ?? ''} onChange={(e) => update((d) => void (d.basics.email = e.target.value))} />
                      </Field>
                      <Field label="Phone" optional>
                        <Input value={data.basics.phone ?? ''} onChange={(e) => update((d) => void (d.basics.phone = e.target.value))} />
                      </Field>
                      <Field label="Location" optional>
                        <Input value={data.basics.location ?? ''} onChange={(e) => update((d) => void (d.basics.location = e.target.value))} />
                      </Field>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[13px] font-medium">Links</div>
                      {(data.basics.links ?? []).map((l, i) => (
                        <div key={i} className="flex gap-2">
                          <Input aria-label="Link label" className="w-32" value={l.label} onChange={(e) => update((d) => void (d.basics.links![i].label = e.target.value))} />
                          <Input aria-label="Link URL" value={l.url} onChange={(e) => update((d) => void (d.basics.links![i].url = e.target.value))} />
                          <Button size="icon" variant="ghost" aria-label="Remove link" icon={<TrashIcon size={14} />} onClick={() => update((d) => void d.basics.links!.splice(i, 1))} />
                        </div>
                      ))}
                      <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => update((d) => void (d.basics.links = [...(d.basics.links ?? []), { label: 'Portfolio', url: '' }]))}>
                        Add link
                      </Button>
                    </div>
                  </>
                )}
                {section === 'summary' && (
                  <Field label="Summary" helper="Two or three sentences about what you do and what you are looking for, in your own words.">
                    <Textarea rows={5} value={data.summary ?? ''} onChange={(e) => update((d) => void (d.summary = e.target.value))} />
                  </Field>
                )}
                {section === 'experience' && (
                  <>
                    {data.experience.map((e, i) => (
                      <div key={e.id} className="space-y-2 rounded-md border border-border p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[13px] font-semibold">{e.title || 'New role'}</div>
                          <ItemControls i={i} n={data.experience.length} label="role" onMove={(dir) => update((d) => void (d.experience = move(d.experience, i, dir)))} onRemove={() => update((d) => void d.experience.splice(i, 1))} />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Field label="Job title">
                            <Input value={e.title} onChange={(ev) => update((d) => void (d.experience[i].title = ev.target.value))} />
                          </Field>
                          <Field label="Organization">
                            <Input value={e.company} onChange={(ev) => update((d) => void (d.experience[i].company = ev.target.value))} />
                          </Field>
                          <Field label="Start" helper="For example 2021-06">
                            <Input value={e.start ?? ''} onChange={(ev) => update((d) => void (d.experience[i].start = ev.target.value))} />
                          </Field>
                          <Field label="End" helper="Leave empty if current">
                            <Input value={e.end ?? ''} onChange={(ev) => update((d) => void (d.experience[i].end = ev.target.value))} />
                          </Field>
                        </div>
                        <Field label="Bullets" helper="One per line. Describe what you did; add a result only if it is real.">
                          <Textarea
                            rows={4}
                            value={drafts[`e-${e.id}`] ?? e.bullets.join('\n')}
                            onChange={(ev) => { setDrafts((s) => ({ ...s, [`e-${e.id}`]: ev.target.value })); update((d) => void (d.experience[i].bullets = linesToList(ev.target.value))); }}
                          />
                        </Field>
                      </div>
                    ))}
                    <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => update((d) => void d.experience.push({ id: uid(), company: '', title: '', bullets: [] }))}>
                      Add role
                    </Button>
                  </>
                )}
                {section === 'projects' && (
                  <>
                    {data.projects.map((p, i) => (
                      <div key={p.id} className="space-y-2 rounded-md border border-border p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[13px] font-semibold">
                            {p.name || 'New project'}
                            {p.projectId && <Badge tone="success">Linked to platform project</Badge>}
                          </div>
                          <ItemControls i={i} n={data.projects.length} label="project" onMove={(dir) => update((d) => void (d.projects = move(d.projects, i, dir)))} onRemove={() => update((d) => void d.projects.splice(i, 1))} />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Field label="Name">
                            <Input value={p.name} onChange={(ev) => update((d) => void (d.projects[i].name = ev.target.value))} />
                          </Field>
                          <Field label="Link" optional>
                            <Input value={p.url ?? ''} onChange={(ev) => update((d) => void (d.projects[i].url = ev.target.value))} />
                          </Field>
                        </div>
                        <Field label="Bullets" helper="One per line.">
                          <Textarea rows={3} value={drafts[`p-${p.id}`] ?? p.bullets.join('\n')} onChange={(ev) => { setDrafts((s) => ({ ...s, [`p-${p.id}`]: ev.target.value })); update((d) => void (d.projects[i].bullets = linesToList(ev.target.value))); }} />
                        </Field>
                      </div>
                    ))}
                    <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => update((d) => void d.projects.push({ id: uid(), name: '', bullets: [] }))}>
                      Add project
                    </Button>
                  </>
                )}
                {section === 'education' && (
                  <>
                    {data.education.map((e, i) => (
                      <div key={e.id} className="space-y-2 rounded-md border border-border p-3">
                        <div className="flex justify-end">
                          <ItemControls i={i} n={data.education.length} label="education entry" onMove={(dir) => update((d) => void (d.education = move(d.education, i, dir)))} onRemove={() => update((d) => void d.education.splice(i, 1))} />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Field label="Institution">
                            <Input value={e.institution} onChange={(ev) => update((d) => void (d.education[i].institution = ev.target.value))} />
                          </Field>
                          <Field label="Degree" optional>
                            <Input value={e.degree ?? ''} onChange={(ev) => update((d) => void (d.education[i].degree = ev.target.value))} />
                          </Field>
                          <Field label="Field" optional>
                            <Input value={e.field ?? ''} onChange={(ev) => update((d) => void (d.education[i].field = ev.target.value))} />
                          </Field>
                          <Field label="Grade" optional helper="Only an official grade you can show.">
                            <Input value={e.grade ?? ''} onChange={(ev) => update((d) => void (d.education[i].grade = ev.target.value))} />
                          </Field>
                          <Field label="Start" optional>
                            <Input value={e.start ?? ''} onChange={(ev) => update((d) => void (d.education[i].start = ev.target.value))} />
                          </Field>
                          <Field label="End" optional>
                            <Input value={e.end ?? ''} onChange={(ev) => update((d) => void (d.education[i].end = ev.target.value))} />
                          </Field>
                        </div>
                      </div>
                    ))}
                    <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => update((d) => void d.education.push({ id: uid(), institution: '' }))}>
                      Add education
                    </Button>
                  </>
                )}
                {section === 'skills' && (
                  <>
                    {data.skills.map((g, i) => (
                      <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-end">
                        <Field label="Group" className="sm:w-40">
                          <Input value={g.group} onChange={(ev) => update((d) => void (d.skills[i].group = ev.target.value))} />
                        </Field>
                        <Field label="Skills" helper="Separate with commas" className="flex-1">
                          <Input value={drafts[`s-${i}`] ?? g.items.join(', ')} onChange={(ev) => { setDrafts((s) => ({ ...s, [`s-${i}`]: ev.target.value })); update((d) => void (d.skills[i].items = ev.target.value.split(',').map((x) => x.trim()).filter(Boolean))); }} />
                        </Field>
                        <ItemControls i={i} n={data.skills.length} label="skill group" onMove={(dir) => { setDrafts({}); update((d) => void (d.skills = move(d.skills, i, dir))); }} onRemove={() => { setDrafts({}); update((d) => void d.skills.splice(i, 1)); }} />
                      </div>
                    ))}
                    <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => update((d) => void d.skills.push({ group: 'Technical', items: [] }))}>
                      Add skill group
                    </Button>
                  </>
                )}
                {section === 'certifications' && (
                  <>
                    <p className="text-[12.5px] text-muted">List only certifications you hold. Platform certificates are verifiable from your portfolio.</p>
                    {data.certifications.map((c, i) => (
                      <div key={c.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
                        <Field label="Name">
                          <Input value={c.name} onChange={(ev) => update((d) => void (d.certifications[i].name = ev.target.value))} />
                        </Field>
                        <Field label="Issuer" optional>
                          <Input value={c.issuer ?? ''} onChange={(ev) => update((d) => void (d.certifications[i].issuer = ev.target.value))} />
                        </Field>
                        <Field label="Date" optional>
                          <Input value={c.date ?? ''} onChange={(ev) => update((d) => void (d.certifications[i].date = ev.target.value))} />
                        </Field>
                        <Button size="icon" variant="ghost" aria-label="Remove certification" icon={<TrashIcon size={14} />} onClick={() => update((d) => void d.certifications.splice(i, 1))} />
                      </div>
                    ))}
                    <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => update((d) => void d.certifications.push({ id: uid(), name: '' }))}>
                      Add certification
                    </Button>
                  </>
                )}
                {section === 'order' && (
                  <ul className="space-y-1.5">
                    {data.sectionOrder.map((s, i) => (
                      <li key={s} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-[13.5px]">
                        {SECTION_NAMES[s] ?? s}
                        <div className="flex gap-1">
                          <Button size="icon-sm" variant="ghost" aria-label={`Move ${s} up`} disabled={i === 0} onClick={() => update((d) => void (d.sectionOrder = move(d.sectionOrder, i, -1)))} icon={<ArrowUpIcon size={14} />} />
                          <Button size="icon-sm" variant="ghost" aria-label={`Move ${s} down`} disabled={i === data.sectionOrder.length - 1} onClick={() => update((d) => void (d.sectionOrder = move(d.sectionOrder, i, 1)))} icon={<ArrowDownIcon size={14} />} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Checks" description={checks ? `About ${checks.stats.words} words, ${checks.stats.bullets} bullets. Always available, no AI.${dirty ? ' Save to re-run.' : ''}` : undefined} />
            <CardBody>
              {!checks?.checks.length ? (
                <p className="text-[13.5px] text-muted">No issues found.</p>
              ) : (
                <ul className="space-y-1.5">
                  {[...groupedChecks.error, ...groupedChecks.warning, ...groupedChecks.tip].map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => openCheck(c)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2">
                        {c.severity === 'error' ? <WarningCircleIcon size={16} className="mt-0.5 shrink-0 text-danger" aria-label="Error" /> : c.severity === 'warning' ? <InfoIcon size={16} className="mt-0.5 shrink-0 text-warning" aria-label="Warning" /> : <LightbulbIcon size={16} className="mt-0.5 shrink-0 text-info" aria-label="Tip" />}
                        <span>
                          {c.message}
                          {c.question && <span className="mt-0.5 block text-[12px] text-muted">Ask yourself: {c.question}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="AI review"
              description="Optional second opinion. Suggestions that would add a fact are phrased as questions; anything adding numbers is removed."
              action={
                <Button size="sm" variant="soft" icon={<SparkleIcon size={14} />} loading={review.isPending} disabled={dirty} disabledReason="Save your changes first" onClick={() => review.mutate()}>
                  Get AI suggestions
                </Button>
              }
            />
            <CardBody className="space-y-2">
              {aiFailure && <AiUnavailable failure={aiFailure} />}
              {ai && (
                <>
                  <AiDraftLabel text="AI suggestions: review every claim before using it." />
                  {ai.dropped > 0 && <p className="text-[12.5px] text-muted">{ai.dropped} suggestion(s) were removed because they added numbers or facts not in your resume.</p>}
                  {ai.suggestions.length === 0 ? (
                    <p className="text-[13.5px] text-muted">No suggestions.</p>
                  ) : (
                    <ul className="space-y-2">
                      {ai.suggestions.map((s, i) => (
                        <li key={i} className="rounded-md border border-border p-2.5 text-[13px]">
                          <div className="mb-1 flex items-center gap-2">
                            <Badge tone={s.kind === 'question' ? 'warning' : s.kind === 'rewrite' ? 'info' : 'neutral'} icon={s.kind === 'question' ? <QuestionIcon size={12} /> : undefined}>
                              {s.kind === 'question' ? 'Question for you' : s.kind === 'rewrite' ? 'Rephrase' : 'Tip'}
                            </Badge>
                            <span className="text-[12px] text-subtle">{s.section}</span>
                          </div>
                          {s.original && <div className="text-[12px] text-muted line-through">{s.original}</div>}
                          <div>{s.text}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {!ai && !aiFailure && <p className="text-[13px] text-muted">Run a review to get phrasing suggestions and questions about missing facts.</p>}
            </CardBody>
          </Card>

          {q.data.related.length > 0 && (
            <Card>
              <CardHeader title="Related versions" />
              <CardBody>
                <ul className="space-y-1 text-[13.5px]">
                  {q.data.related.map((v) => (
                    <li key={v.id}>
                      <Link to={`/app/career/resumes/${v.id}`} className="hover:underline">
                        {v.title}
                      </Link>
                      <span className="text-muted"> · {v.id === r.parentId ? 'copied from' : 'copy of this'} · {timeAgo(v.updatedAt)}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>

        <Card className="overflow-hidden xl:sticky xl:top-4 xl:self-start">
          <div className="flex h-11 items-center border-b border-border px-5 text-[13px] font-semibold">
            Live preview <span className="ml-1.5 font-normal text-muted">({template.charAt(0).toUpperCase() + template.slice(1)} template)</span>
          </div>
          <div className="bg-surface-2 p-4 sm:p-5">
            <ResumePreview data={data} template={template} />
          </div>
        </Card>
      </div>

      <PortfolioImportDialog
        open={portfolioOpen}
        onOpenChange={setPortfolioOpen}
        onAdd={(projects, skills) =>
          update((d) => {
            for (const p of projects) if (!d.projects.some((x) => x.projectId === p.projectId)) d.projects.push(p);
            if (skills.length) {
              const g = d.skills.find((x) => x.group === 'Verified on LearnSphere');
              if (g) g.items = [...new Set([...g.items, ...skills])];
              else d.skills.push({ group: 'Verified on LearnSphere', items: skills });
            }
          })
        }
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(v) => !v && blocker.state === 'blocked' && blocker.reset()}
        title="Leave without saving?"
        description="You have unsaved changes to this resume."
        confirmLabel="Leave"
        danger
        onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
      />
    </div>
  );
}

type Evidence = {
  projects?: { id: string; title?: string; name?: string; summary?: string; description?: string; url?: string; repoUrl?: string; demoUrl?: string; verification?: string }[];
  skills?: { name: string; verified?: boolean }[];
  verifiedSkills?: { slug: string; name: string }[];
};

function PortfolioImportDialog({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (v: boolean) => void; onAdd: (projects: ResumeData['projects'], skills: string[]) => void }) {
  const q = useQuery({
    queryKey: ['portfolio', 'evidence-for-resume'],
    queryFn: () => api.get<Evidence>('/portfolio/evidence-for-resume'),
    enabled: open,
    retry: false,
  });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const notAvailable = q.error instanceof ApiError && q.error.status === 404;
  const projects = q.data?.projects ?? [];
  // Only verified skills are offered for import (portfolio returns them as verifiedSkills).
  const skills = (q.data?.skills ?? q.data?.verifiedSkills?.map((v) => ({ name: v.name, verified: true })) ?? []).filter((s) => s.verified !== false);
  const toggle = (k: string, on: boolean) => setPicked((s) => {
    const n = new Set(s);
    if (on) n.add(k);
    else n.delete(k);
    return n;
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import from your portfolio"
      description="Adds your platform projects and verified skills. Pick what to include; you can edit wording afterwards."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={picked.size === 0}
            disabledReason="Pick at least one item"
            onClick={() => {
              onAdd(
                projects
                  .filter((p) => picked.has(`p:${p.id}`))
                  .map((p) => ({ id: uid(), projectId: p.id, name: p.title ?? p.name ?? 'Project', url: p.demoUrl ?? p.repoUrl ?? p.url, bullets: (p.summary ?? p.description) ? [String(p.summary ?? p.description)] : [] })),
                skills.filter((s) => picked.has(`s:${s.name}`)).map((s) => s.name),
              );
              setPicked(new Set());
              onOpenChange(false);
              toast.success('Added to the resume. Review and save.');
            }}
          >
            Add selected
          </Button>
        </>
      }
    >
      {q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : notAvailable ? (
        <EmptyState icon={<IdentificationBadgeIcon size={22} />} title="Portfolio import is not available yet" description="This server does not provide portfolio evidence yet. Add projects manually in the Projects section." />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : projects.length === 0 && skills.length === 0 ? (
        <EmptyState icon={<IdentificationBadgeIcon size={22} />} title="Nothing to import yet" description="Complete a project or earn verified skills and they will show up here." />
      ) : (
        <div className="space-y-4">
          {projects.length > 0 && (
            <div className="space-y-2">
              <div className="text-[13px] font-semibold">Projects</div>
              {projects.map((p) => (
                <Checkbox key={p.id} checked={picked.has(`p:${p.id}`)} onCheckedChange={(v) => toggle(`p:${p.id}`, v)} label={p.title ?? p.name ?? 'Project'} description={p.summary ?? p.description} />
              ))}
            </div>
          )}
          {skills.length > 0 && (
            <div className="space-y-2">
              <div className="text-[13px] font-semibold">Verified skills</div>
              {skills.map((s) => (
                <Checkbox key={s.name} checked={picked.has(`s:${s.name}`)} onCheckedChange={(v) => toggle(`s:${s.name}`, v)} label={s.name} />
              ))}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
