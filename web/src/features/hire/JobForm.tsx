import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import { api, errorMessage, qs, ApiError } from '@/lib/api';
import { Badge, Banner, Button, Card, CardBody, CardHeader, Field, Input, Markdown, Segmented, Select, Switch, Textarea } from '@/components/ui';
import type { Job, SkillReq } from './api';

const DEFAULT_STAGES = ['applied', 'eligibility_review', 'shortlisted', 'assessment', 'interview', 'offer', 'hired'];
const STAGE_LABEL: Record<string, string> = { applied: 'Applied', eligibility_review: 'Eligibility review', shortlisted: 'Shortlisted', assessment: 'Assessment', interview: 'Interview', offer: 'Offer', hired: 'Hired' };
const labelOf = (s: string) => STAGE_LABEL[s] ?? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

type FormState = {
  title: string;
  team: string;
  location: string;
  workplace: Job['workplace'];
  employmentType: Job['employmentType'];
  description: string;
  responsibilities: string;
  requiredSkills: SkillReq[];
  minExperienceYears: string;
  graduationYears: string;
  degrees: string;
  workAuthorization: string;
  eligibilityNotes: string;
  salaryText: string;
  openings: string;
  closesAt: string;
  campusOnly: boolean;
  stages: string[];
};

function initial(job?: Job): FormState {
  return {
    title: job?.title ?? '',
    team: job?.team ?? '',
    location: job?.location ?? '',
    workplace: job?.workplace ?? 'onsite',
    employmentType: job?.employmentType ?? 'full_time',
    description: job?.description ?? '',
    responsibilities: (job?.responsibilities ?? []).join('\n'),
    requiredSkills: job?.requiredSkills ?? [],
    minExperienceYears: job?.eligibility.minExperienceYears !== undefined ? String(job.eligibility.minExperienceYears) : '',
    graduationYears: (job?.eligibility.graduationYears ?? []).join(', '),
    degrees: (job?.eligibility.degrees ?? []).join(', '),
    workAuthorization: job?.eligibility.workAuthorization ?? '',
    eligibilityNotes: job?.eligibility.notes ?? '',
    salaryText: job?.salaryText ?? '',
    openings: String(job?.openings ?? 1),
    closesAt: job?.closesAt ? job.closesAt.slice(0, 10) : '',
    campusOnly: job?.campusOnly ?? false,
    stages: job?.stages ?? DEFAULT_STAGES,
  };
}

function toPayload(f: FormState) {
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  return {
    title: f.title,
    team: f.team || null,
    location: f.location,
    workplace: f.workplace,
    employmentType: f.employmentType,
    description: f.description,
    responsibilities: f.responsibilities.split('\n').map((x) => x.trim()).filter(Boolean),
    requiredSkills: f.requiredSkills.map((s) => ({ slug: s.slug, required: s.required, minLevel: s.minLevel ?? null })),
    eligibility: {
      ...(f.minExperienceYears !== '' ? { minExperienceYears: Number(f.minExperienceYears) } : {}),
      ...(f.graduationYears ? { graduationYears: list(f.graduationYears).map(Number).filter((n) => Number.isFinite(n)) } : {}),
      ...(f.degrees ? { degrees: list(f.degrees) } : {}),
      ...(f.workAuthorization ? { workAuthorization: f.workAuthorization } : {}),
      ...(f.eligibilityNotes ? { notes: f.eligibilityNotes } : {}),
    },
    salaryText: f.salaryText || null,
    openings: Number(f.openings) || 1,
    closesAt: f.closesAt ? new Date(`${f.closesAt}T23:59:00`).toISOString() : null,
    campusOnly: f.campusOnly,
    stages: f.stages,
  };
}

function SkillPicker({ value, onChange }: { value: SkillReq[]; onChange: (v: SkillReq[]) => void }) {
  const [search, setSearch] = useState('');
  const q = useQuery({
    queryKey: ['hire', 'skills', search],
    queryFn: () => api.get<{ items: { slug: string; name: string; category: string }[] }>(`/hire/skills${qs({ q: search })}`),
    enabled: search.trim().length > 0,
  });
  const options = (q.data?.items ?? []).filter((o) => !value.some((v) => v.slug === o.slug));
  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((s, i) => (
            <li key={s.slug} className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
              <span className="min-w-32 flex-1 font-medium">{s.name}</span>
              <Segmented
                label={`Is ${s.name} required?`}
                value={s.required ? 'required' : 'preferred'}
                onChange={(v) => onChange(value.map((x, j) => (j === i ? { ...x, required: v === 'required' } : x)))}
                options={[
                  { value: 'required', label: 'Required' },
                  { value: 'preferred', label: 'Preferred' },
                ]}
              />
              <Select aria-label={`Minimum level for ${s.name}`} className="h-8 w-40 text-[13px]" value={s.minLevel ?? ''} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, minLevel: e.target.value ? Number(e.target.value) : undefined } : x)))}>
                <option value="">Any evidence level</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    Min level {n} of 4
                  </option>
                ))}
              </Select>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${s.name}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <XIcon size={14} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Input aria-label="Search skills to add" placeholder="Search skills to add, for example Python or SQL" value={search} onChange={(e) => setSearch(e.target.value)} />
        {search.trim() && (
          <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-2">
            {q.isLoading ? (
              <p className="px-3 py-2 text-[13px] text-muted">Searching...</p>
            ) : !options.length ? (
              <p className="px-3 py-2 text-[13px] text-muted">No matching skills. Matching only works with skills from the shared skill list.</p>
            ) : (
              options.map((o) => (
                <button
                  key={o.slug}
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-[13.5px] hover:bg-surface-2"
                  onClick={() => {
                    onChange([...value, { slug: o.slug, name: o.name, required: true }]);
                    setSearch('');
                  }}
                >
                  {o.name}
                  <span className="text-[12px] text-subtle">{o.category}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StageConfigurator({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [custom, setCustom] = useState('');
  const middle = value.slice(1, -1);
  const setMiddle = (m: string[]) => onChange(['applied', ...m, 'hired']);
  const optional = ['eligibility_review', 'shortlisted', 'assessment', 'interview', 'offer'].filter((s) => !middle.includes(s));
  const key = custom.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return (
    <div className="space-y-3">
      <ol className="space-y-1.5">
        <li className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-1.5 text-[13.5px]">
          <Badge>1</Badge> Applied <span className="text-[12px] text-subtle">(always first)</span>
        </li>
        {middle.map((s, i) => (
          <li key={s} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-[13.5px]">
            <Badge>{i + 2}</Badge>
            <span className="flex-1">{labelOf(s)}</span>
            <Button size="icon-sm" variant="ghost" aria-label={`Move ${labelOf(s)} up`} disabled={disabled || i === 0} onClick={() => setMiddle(middle.map((x, j) => (j === i - 1 ? s : j === i ? middle[i - 1] : x)))}>
              <ArrowUpIcon size={14} />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Move ${labelOf(s)} down`} disabled={disabled || i === middle.length - 1} onClick={() => setMiddle(middle.map((x, j) => (j === i + 1 ? s : j === i ? middle[i + 1] : x)))}>
              <ArrowDownIcon size={14} />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${labelOf(s)}`} disabled={disabled} onClick={() => setMiddle(middle.filter((x) => x !== s))}>
              <TrashIcon size={14} />
            </Button>
          </li>
        ))}
        <li className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-1.5 text-[13.5px]">
          <Badge>{value.length}</Badge> Hired <span className="text-[12px] text-subtle">(always last; Rejected and Withdrawn are added automatically)</span>
        </li>
      </ol>
      {!disabled && (
        <div className="flex flex-wrap items-end gap-2">
          {optional.map((s) => (
            <Button key={s} size="sm" icon={<PlusIcon size={13} />} onClick={() => setMiddle([...middle, s])}>
              {labelOf(s)}
            </Button>
          ))}
          <div className="flex items-end gap-2">
            <Input aria-label="Custom stage name" className="h-7 w-44 text-[13px]" placeholder="Custom stage, e.g. Take-home" value={custom} onChange={(e) => setCustom(e.target.value)} />
            <Button size="sm" disabled={key.length < 2 || value.includes(key) || value.length >= 12} disabledReason={value.length >= 12 ? 'Up to 12 stages' : 'Type a new stage name'} onClick={() => { setMiddle([...middle, key]); setCustom(''); }}>
              Add stage
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onChange(DEFAULT_STAGES)}>
            Reset to default
          </Button>
        </div>
      )}
    </div>
  );
}

export function JobForm({ job, onSaved }: { job?: Job; onSaved: (job: Job) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<FormState>(() => initial(job));
  const [preview, setPreview] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = useMutation({
    mutationFn: () => (job ? api.patch<{ job: Job }>(`/hire/jobs/${job.id}`, toPayload(f)) : api.post<{ job: Job }>('/hire/jobs', toPayload(f))),
    onSuccess: (r) => {
      toast.success(job ? 'Job saved.' : 'Draft created. Review the publish checklist next.');
      qc.invalidateQueries({ queryKey: ['hire'] });
      onSaved(r.job);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = save.error instanceof ApiError ? save.error.fields : {};
  const readOnly = job?.status === 'archived';
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {readOnly && <Banner tone="info">Archived jobs are read-only. Duplicate it from the Jobs list to start a new posting.</Banner>}
      <fieldset disabled={readOnly} className="space-y-5">
        <Card>
          <CardHeader title="Role" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Job title" error={fields.title} className="sm:col-span-2">
              <Input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={160} />
            </Field>
            <Field label="Team" optional>
              <Input value={f.team} onChange={(e) => set('team', e.target.value)} />
            </Field>
            <Field label="Location" error={fields.location}>
              <Input value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="City, region or Remote" />
            </Field>
            <Field label="Workplace">
              <Select value={f.workplace} onChange={(e) => set('workplace', e.target.value as FormState['workplace'])}>
                <option value="onsite">On-site</option>
                <option value="hybrid">Hybrid</option>
                <option value="remote">Remote</option>
              </Select>
            </Field>
            <Field label="Employment type">
              <Select value={f.employmentType} onChange={(e) => set('employmentType', e.target.value as FormState['employmentType'])}>
                <option value="full_time">Full time</option>
                <option value="internship">Internship</option>
                <option value="contract">Contract</option>
                <option value="part_time">Part time</option>
              </Select>
            </Field>
            <Field label="Salary or stipend" optional helper="Shown to candidates as written.">
              <Input value={f.salaryText} onChange={(e) => set('salaryText', e.target.value)} />
            </Field>
            <Field label="Openings">
              <Input type="number" min={1} max={1000} value={f.openings} onChange={(e) => set('openings', e.target.value)} />
            </Field>
            <Field label="Closes on" optional helper="Applications stop after this date.">
              <Input type="date" value={f.closesAt} onChange={(e) => set('closesAt', e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Switch checked={f.campusOnly} onCheckedChange={(v) => set('campusOnly', v)} label="Campus drives only" description="Only students of colleges running a placement drive for this job can see and apply." />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Description"
            description="Markdown supported."
            action={<Segmented label="Description view" value={preview ? 'preview' : 'write'} onChange={(v) => setPreview(v === 'preview')} options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />}
          />
          <CardBody className="space-y-4">
            {preview ? <Markdown source={f.description || '_Nothing yet._'} className="min-h-32 rounded-md border border-border p-3" /> : (
              <Field label="About the role" error={fields.description} helper="At least 40 characters to publish.">
                <Textarea rows={8} value={f.description} onChange={(e) => set('description', e.target.value)} />
              </Field>
            )}
            <Field label="Responsibilities" optional helper="One per line.">
              <Textarea rows={4} value={f.responsibilities} onChange={(e) => set('responsibilities', e.target.value)} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Required skills" description="Candidates are matched only on these skills and the evidence behind them (verified, demonstrated, learning or self-reported)." />
          <CardBody>
            <SkillPicker value={f.requiredSkills} onChange={(v) => set('requiredSkills', v)} />
            {fields.requiredSkills && <p className="mt-1 text-[12.5px] text-danger">{fields.requiredSkills}</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Eligibility" description="Shown to recruiters as information next to each candidate. It never rejects anyone automatically." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum years of experience" optional>
              <Input type="number" min={0} max={40} step={0.5} value={f.minExperienceYears} onChange={(e) => set('minExperienceYears', e.target.value)} />
            </Field>
            <Field label="Graduation years" optional helper="Separate with commas, e.g. 2026, 2027.">
              <Input value={f.graduationYears} onChange={(e) => set('graduationYears', e.target.value)} />
            </Field>
            <Field label="Degrees" optional helper="Separate with commas.">
              <Input value={f.degrees} onChange={(e) => set('degrees', e.target.value)} />
            </Field>
            <Field label="Work authorization" optional>
              <Input value={f.workAuthorization} onChange={(e) => set('workAuthorization', e.target.value)} />
            </Field>
            <Field label="Notes" optional className="sm:col-span-2">
              <Textarea rows={2} value={f.eligibilityNotes} onChange={(e) => set('eligibilityNotes', e.target.value)} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Pipeline stages" description="The board columns for this job. Remove stages you do not use or add your own." />
          <CardBody>
            <StageConfigurator value={f.stages} onChange={(v) => set('stages', v)} disabled={readOnly} />
            {fields.stages && <p className="mt-2 text-[12.5px] text-danger">{fields.stages}</p>}
          </CardBody>
        </Card>
      </fieldset>
      {!readOnly && (
        <div className="flex justify-end gap-2">
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!f.title.trim() || !f.location.trim()} disabledReason="Add a title and a location">
            {job ? 'Save changes' : 'Create draft'}
          </Button>
        </div>
      )}
    </form>
  );
}
