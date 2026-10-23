import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TargetIcon, PlusIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PageHeader, ErrorState, SkeletonRows, EmptyState, Button, Dialog, Field, Input, Textarea, Badge } from '@/components/ui';
import { ReadinessMeter } from './components';
import type { TargetSummary } from './api';

type Extracted = { slug: string; name: string; required: boolean; matched: string[] };

export function NewTargetDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (v: boolean) => void; initial?: { title?: string; company?: string; url?: string; description?: string } }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: '', company: '', url: '', description: '' });
  const [preview, setPreview] = useState<Extracted[] | null>(null);
  useEffect(() => {
    if (open) setForm({ title: initial?.title ?? '', company: initial?.company ?? '', url: initial?.url ?? '', description: initial?.description ?? '' });
  }, [open, initial?.title, initial?.company, initial?.url, initial?.description]);
  // Live, deterministic extraction preview while pasting.
  useEffect(() => {
    if (form.description.trim().length < 40) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .post<{ skills: Extracted[] }>('/career/targets/extract', { description: form.description })
        .then((r) => setPreview(r.skills))
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(t);
  }, [form.description]);
  const create = useMutation({
    mutationFn: () => api.post<{ target: { id: string } }>('/career/targets', { ...form, url: form.url || null, company: form.company || null }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['career'] });
      toast.success('Job target saved and analyzed.');
      onOpenChange(false);
      nav(`/app/career/targets/${r.target.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = create.error instanceof ApiError ? create.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Analyze a job description"
      description="Paste the full posting. Skills are matched against the platform skill list without AI; you can adjust them afterwards."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()} disabled={!form.title.trim() || form.description.trim().length < 40} disabledReason="Add a title and paste the job description first">
            Save and analyze
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Job title" required error={fields.title}>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Junior Backend Developer" />
          </Field>
          <Field label="Company" optional error={fields.company}>
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </Field>
        </div>
        <Field label="Link to the posting" optional error={fields.url}>
          <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" />
        </Field>
        <Field label="Job description" required error={fields.description} helper="Include requirements and nice-to-have sections so required and preferred skills can be told apart.">
          <Textarea rows={10} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        {preview && (
          <div className="rounded-md border border-border bg-surface-2 p-3">
            <div className="mb-2 text-[12.5px] font-medium text-muted">Skills found ({preview.length})</div>
            {preview.length === 0 ? (
              <p className="text-[13px] text-muted">No known skills matched yet. You can add skills manually after saving.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {preview.map((s) => (
                  <Badge key={s.slug} tone={s.required ? 'accent' : 'neutral'}>
                    {s.name}
                    {!s.required && ' (preferred)'}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default function TargetsPage() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get('new') === '1');
  const q = useQuery({ queryKey: ['career', 'targets'], queryFn: () => api.get<{ items: TargetSummary[] }>('/career/targets') });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Job targets"
        description="Save the job descriptions you are aiming for. Each one gets a skill-gap report against your Skill DNA, a readiness checklist and a targeted plan."
        actions={
          <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setOpen(true)}>
            Add job target
          </Button>
        }
      />
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon={<TargetIcon size={22} />} title="No job targets yet" description="Paste a job description to see which required skills you can already prove and what to work on next." action={<Button variant="primary" onClick={() => setOpen(true)}>Add job target</Button>} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
          {q.data.items.map((t) => (
            <li key={t.id} className="group relative flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                  <TargetIcon size={18} weight="duotone" />
                </span>
                <div className="min-w-0">
                  <Link to={`/app/career/targets/${t.id}`} className="text-[14.5px] font-semibold tracking-[-0.005em] after:absolute after:inset-0 hover:text-accent-text">
                    {t.title}
                  </Link>
                  <div className="mt-0.5 text-[12.5px] text-muted">
                    {[t.company, `${t.requiredSkills} required of ${t.skills} skills`, `saved ${timeAgo(t.createdAt)}`].filter(Boolean).join(' · ')}
                  </div>
                  {t.checklistTotal !== null && (
                    <div className="mt-1 text-[12.5px] text-subtle">
                      Checklist: {t.checklistDone} of {t.checklistTotal} done{t.computedAt ? ` · updated ${timeAgo(t.computedAt)}` : ''}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 pl-[52px] sm:w-56 sm:shrink-0 sm:pl-0">
                {t.score === null && !t.computedAt && t.skills > 0 ? <span className="flex-1 text-[13px] text-subtle">Not analyzed yet. Open to see readiness.</span> : <ReadinessMeter score={t.score} />}
                <ArrowRightIcon size={16} className="hidden shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg sm:block" aria-hidden />
              </div>
            </li>
          ))}
        </ul>
      )}
      <NewTargetDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v && params.get('new')) setParams({}, { replace: true });
        }}
      />
    </div>
  );
}
