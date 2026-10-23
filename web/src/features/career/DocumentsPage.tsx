import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EnvelopeSimpleIcon, PlusIcon, SparkleIcon, MagicWandIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PageHeader, Card, ErrorState, SkeletonRows, EmptyState, Button, Dialog, Field, Input, Textarea, Select, Badge, ProvenanceTag } from '@/components/ui';
import { AiUnavailable, AiDraftLabel, HighlightedDraft } from './components';
import { DOC_KIND_LABEL, isAiFailure, type AiFailure, type Application, type CareerDoc, type DocKind, type ResumeSummary, type TargetSummary } from './api';

type FactKey =
  | 'name'
  | 'email'
  | 'role'
  | 'company'
  | 'recipientName'
  | 'currentRole'
  | 'whyCompany'
  | 'whyRole'
  | 'relevantExperience'
  | 'achievement'
  | 'skills'
  | 'projectName'
  | 'projectDescription'
  | 'projectRole'
  | 'projectOutcome'
  | 'techStack'
  | 'link'
  | 'availability'
  | 'question'
  | 'answerPoints'
  | 'mutualConnection'
  | 'interviewDate'
  | 'interviewerName'
  | 'topicDiscussed'
  | 'goal';

const FACT_LABEL: Record<FactKey, { label: string; long?: boolean; list?: boolean }> = {
  name: { label: 'Your name' },
  email: { label: 'Your email' },
  role: { label: 'Role title' },
  company: { label: 'Company' },
  recipientName: { label: 'Recipient name' },
  currentRole: { label: 'What you do now' },
  whyCompany: { label: 'Why this company (your reason)', long: true },
  whyRole: { label: 'Why this role (your reason)', long: true },
  relevantExperience: { label: 'Relevant experience (your words)', long: true },
  achievement: { label: 'One real accomplishment', long: true },
  skills: { label: 'Skills (comma separated)', list: true },
  projectName: { label: 'Project name' },
  projectDescription: { label: 'What the project does', long: true },
  projectRole: { label: 'What you built or decided', long: true },
  projectOutcome: { label: 'Outcome (only what really happened)', long: true },
  techStack: { label: 'Technologies used (comma separated)', list: true },
  link: { label: 'Link to your work' },
  availability: { label: 'Availability' },
  question: { label: 'The application question', long: true },
  answerPoints: { label: 'Points you want to make', long: true },
  mutualConnection: { label: 'Mutual connection' },
  interviewDate: { label: 'Interview date' },
  interviewerName: { label: 'Interviewer name' },
  topicDiscussed: { label: 'Something you discussed' },
  goal: { label: 'Your goal' },
};

const FIELDS: Record<DocKind, FactKey[]> = {
  cover_letter: ['name', 'email', 'role', 'company', 'recipientName', 'currentRole', 'whyCompany', 'relevantExperience', 'skills', 'achievement', 'whyRole', 'availability'],
  answer: ['question', 'answerPoints', 'relevantExperience', 'achievement'],
  outreach: ['name', 'recipientName', 'role', 'company', 'currentRole', 'mutualConnection', 'relevantExperience', 'link'],
  cold_email: ['name', 'recipientName', 'company', 'role', 'whyCompany', 'relevantExperience', 'skills', 'goal', 'link'],
  follow_up: ['name', 'interviewerName', 'role', 'company', 'interviewDate', 'topicDiscussed', 'whyRole'],
  bio: ['name', 'currentRole', 'relevantExperience', 'skills', 'projectName', 'projectDescription', 'goal'],
  project_summary: ['projectName', 'projectDescription', 'projectRole', 'techStack', 'projectOutcome', 'link'],
};

type GenResult = { title: string; body: string; placeholders: string[]; aiAssisted: boolean; flaggedNumbers?: number };

export function GeneratorDialog({ open, onOpenChange, initialKind, initialTargetId, initialApplicationId }: { open: boolean; onOpenChange: (v: boolean) => void; initialKind?: DocKind; initialTargetId?: string; initialApplicationId?: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [kind, setKind] = useState<DocKind>(initialKind ?? 'cover_letter');
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [resumeId, setResumeId] = useState('');
  const [targetId, setTargetId] = useState(initialTargetId ?? '');
  const [applicationId, setApplicationId] = useState(initialApplicationId ?? '');
  const [result, setResult] = useState<GenResult | null>(null);
  const [aiFailure, setAiFailure] = useState<AiFailure | null>(null);
  useEffect(() => {
    if (open) {
      setKind(initialKind ?? 'cover_letter');
      setTargetId(initialTargetId ?? '');
      setApplicationId(initialApplicationId ?? '');
      setResult(null);
      setAiFailure(null);
    }
  }, [open, initialKind, initialTargetId, initialApplicationId]);
  const resumes = useQuery({ queryKey: ['career', 'resumes'], queryFn: () => api.get<{ items: ResumeSummary[] }>('/career/resumes'), enabled: open });
  const targets = useQuery({ queryKey: ['career', 'targets'], queryFn: () => api.get<{ items: TargetSummary[] }>('/career/targets'), enabled: open });
  const apps = useQuery({ queryKey: ['career', 'applications', 'all'], queryFn: () => api.get<{ items: Application[] }>('/career/applications'), enabled: open });
  useEffect(() => {
    if (!resumeId && resumes.data?.items.length) setResumeId(resumes.data.items.find((r) => r.isPrimary)?.id ?? '');
  }, [resumes.data, resumeId]);

  const payload = () => {
    const f: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(facts)) {
      if (!v.trim()) continue;
      f[k] = FACT_LABEL[k as FactKey]?.list ? v.split(',').map((x) => x.trim()).filter(Boolean) : v;
    }
    return { kind, facts: f, resumeId: resumeId || undefined, targetId: targetId || undefined, applicationId: applicationId || undefined };
  };
  const generate = useMutation({
    mutationFn: () => api.post<GenResult>('/career/documents/generate', payload()),
    onSuccess: (r) => {
      setResult(r);
      setAiFailure(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const aiDraft = useMutation({
    mutationFn: () => api.post<AiFailure | (GenResult & { ok: true })>('/career/documents/generate/ai', payload()),
    onSuccess: (r) => {
      if (isAiFailure(r)) setAiFailure(r);
      else {
        setAiFailure(null);
        setResult(r);
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const save = useMutation({
    mutationFn: () => api.post<{ document: CareerDoc }>('/career/documents', { kind, title: result!.title, body: result!.body, aiAssisted: result!.aiAssisted, applicationId: applicationId || null }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['career', 'documents'] });
      toast.success('Document saved. Fill in the highlighted placeholders before sending.');
      onOpenChange(false);
      nav(`/app/career/documents/${r.document.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Write a document"
      description="Uses only the facts you give (and what is already in your resume, target or application). Missing facts become highlighted placeholders."
      footer={
        <>
          <Button icon={<SparkleIcon size={14} />} loading={aiDraft.isPending} onClick={() => aiDraft.mutate()}>
            Try AI draft
          </Button>
          <Button icon={<MagicWandIcon size={14} />} loading={generate.isPending} onClick={() => generate.mutate()}>
            Fill template
          </Button>
          <Button variant="primary" disabled={!result} disabledReason="Generate a draft first" loading={save.isPending} onClick={() => save.mutate()}>
            Save draft
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Document type">
            <Select value={kind} onChange={(e) => { setKind(e.target.value as DocKind); setResult(null); }}>
              {(Object.keys(DOC_KIND_LABEL) as DocKind[]).map((k) => (
                <option key={k} value={k}>
                  {DOC_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Resume" optional>
              <Select value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
                <option value="">None</option>
                {(resumes.data?.items ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Job target" optional>
              <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">None</option>
                {(targets.data?.items ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Application" optional>
              <Select value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
                <option value="">None</option>
                {(apps.data?.items ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.role} at {a.company}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {FIELDS[kind].map((k) => (
            <Field key={k} label={FACT_LABEL[k].label} optional>
              {FACT_LABEL[k].long ? <Textarea rows={2} value={facts[k] ?? ''} onChange={(e) => setFacts({ ...facts, [k]: e.target.value })} /> : <Input value={facts[k] ?? ''} onChange={(e) => setFacts({ ...facts, [k]: e.target.value })} />}
            </Field>
          ))}
        </div>
        <div className="space-y-2">
          {aiFailure && <AiUnavailable failure={aiFailure} />}
          {result ? (
            <>
              {result.aiAssisted ? <AiDraftLabel text="AI draft: review every claim before sending." /> : <Badge tone="neutral">Template draft (no AI)</Badge>}
              {!!result.flaggedNumbers && <p className="text-[12.5px] text-warning">{result.flaggedNumbers} number(s) you did not provide were replaced with a placeholder.</p>}
              {result.placeholders.length > 0 && <p className="text-[12.5px] text-muted">{result.placeholders.length} missing fact(s) highlighted. Fill them in or delete those sentences.</p>}
              <Card className="max-h-[60vh] overflow-y-auto p-4">
                <div className="mb-2 text-[13px] font-semibold">{result.title}</div>
                <HighlightedDraft text={result.body} />
              </Card>
            </>
          ) : (
            <EmptyState icon={<EnvelopeSimpleIcon size={22} />} title="Draft preview" description="Fill in what you know and choose Fill template. Leave anything you are unsure of empty; it becomes a placeholder." />
          )}
        </div>
      </div>
    </Dialog>
  );
}

export default function DocumentsPage() {
  const [params, setParams] = useSearchParams();
  const initialKind = params.get('new') as DocKind | null;
  const [open, setOpen] = useState(!!initialKind);
  const [kind, setKind] = useState<DocKind | ''>('');
  const q = useQuery({ queryKey: ['career', 'documents', kind], queryFn: () => api.get<{ items: CareerDoc[] }>(`/career/documents${kind ? `?kind=${kind}` : ''}`) });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Documents"
        description="Cover letters, application answers, outreach, follow-ups, bios and project summaries, built from your own facts."
        actions={
          <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setOpen(true)}>
            Write a document
          </Button>
        }
      />
      <div className="mb-4 w-full sm:w-60">
        <Select aria-label="Filter by type" value={kind} onChange={(e) => setKind(e.target.value as DocKind | '')}>
          <option value="">All types</option>
          {(Object.keys(DOC_KIND_LABEL) as DocKind[]).map((k) => (
            <option key={k} value={k}>
              {DOC_KIND_LABEL[k]}
            </option>
          ))}
        </Select>
      </div>
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon={<EnvelopeSimpleIcon size={22} />} title={kind ? 'No documents of this type' : 'No documents yet'} description="Generate a draft from a template. Facts you have not provided show up as placeholders, never as made-up claims." action={<Button variant="primary" onClick={() => setOpen(true)}>Write a document</Button>} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
          {q.data.items.map((d) => (
            <li key={d.id}>
              <Link to={`/app/career/documents/${d.id}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                  <EnvelopeSimpleIcon size={18} weight="duotone" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="text-[14.5px] font-semibold tracking-[-0.005em] group-hover:text-accent-text">{d.title}</span>
                    <Badge>{DOC_KIND_LABEL[d.kind]}</Badge>
                    {d.aiAssisted && <ProvenanceTag kind="ai" />}
                    {!!d.placeholders && <Badge tone="warning">{d.placeholders} placeholder{d.placeholders === 1 ? '' : 's'} to fill</Badge>}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-muted">Edited {timeAgo(d.updatedAt)}</span>
                </span>
                <ArrowRightIcon size={16} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <GeneratorDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v && params.get('new')) setParams({}, { replace: true });
        }}
        initialKind={initialKind ?? undefined}
        initialTargetId={params.get('targetId') ?? undefined}
        initialApplicationId={params.get('applicationId') ?? undefined}
      />
    </div>
  );
}
