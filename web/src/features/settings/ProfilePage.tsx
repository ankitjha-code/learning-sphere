import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCapIcon, BriefcaseIcon, LinkIcon, PlusIcon, TrashIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { toLocalInput } from '@/lib/format';
import { Button, Card, CardBody, CardHeader, ErrorState, Field, Input, Select, Skeleton, TagsInput, Textarea } from '@/components/ui';
import { InlineEmpty, fieldErrors, timeZones, type ProfileResponse } from './shared';

const STAGE_OPTIONS = [
  { value: 'school_graduate', label: 'Finished school' },
  { value: 'college_student', label: 'College student' },
  { value: 'graduate', label: 'Recent graduate' },
  { value: 'professional', label: 'Working professional' },
  { value: 'career_switcher', label: 'Switching careers' },
] as const;

const LEARNING_STYLE_OPTIONS = [
  { value: 'guided', label: 'Guided: a clear path, step by step' },
  { value: 'independent', label: 'Independent: I choose what to learn next' },
  { value: 'project_first', label: 'Project first: learn by building' },
  { value: 'intensive', label: 'Intensive: a fast, focused pace' },
  { value: 'interview', label: 'Interview prep: practice for hiring rounds' },
] as const;

// Form state keeps everything as strings so inputs stay controlled; conversion happens on save.
type EduRow = { institution: string; degree: string; field: string; startYear: string; endYear: string; grade: string };
type ExpRow = { company: string; title: string; start: string; end: string; summary: string };
type LinkRow = { label: string; url: string };

type FormState = {
  name: string;
  headline: string;
  bio: string;
  location: string;
  timezone: string;
  stage: string;
  targetRoles: string[];
  targetDate: string; // yyyy-mm-dd
  weeklyHours: string;
  learningStyle: string;
  interests: string[];
  preferredLanguages: string[];
  education: EduRow[];
  experience: ExpRow[];
  links: LinkRow[];
};

const emptyEdu: EduRow = { institution: '', degree: '', field: '', startYear: '', endYear: '', grade: '' };
const emptyExp: ExpRow = { company: '', title: '', start: '', end: '', summary: '' };
const emptyLink: LinkRow = { label: '', url: '' };

function toForm(d: ProfileResponse): FormState {
  const p = d.profile;
  return {
    name: d.user.name ?? '',
    headline: p?.headline ?? '',
    bio: p?.bio ?? '',
    location: p?.location ?? '',
    timezone: d.user.timezone || 'UTC',
    stage: p?.stage ?? '',
    targetRoles: p?.targetRoles ?? [],
    targetDate: p?.targetDate ? toLocalInput(p.targetDate).slice(0, 10) : '',
    weeklyHours: p?.weeklyHours ? String(p.weeklyHours) : '',
    learningStyle: p?.learningStyle ?? '',
    interests: p?.interests ?? [],
    preferredLanguages: p?.preferredLanguages ?? [],
    education: (p?.education ?? []).map((e) => ({
      institution: e.institution ?? '',
      degree: e.degree ?? '',
      field: e.field ?? '',
      startYear: e.startYear ? String(e.startYear) : '',
      endYear: e.endYear ? String(e.endYear) : '',
      grade: e.grade ?? '',
    })),
    experience: (p?.experience ?? []).map((e) => ({ company: e.company ?? '', title: e.title ?? '', start: e.start ?? '', end: e.end ?? '', summary: e.summary ?? '' })),
    links: (p?.links ?? []).map((l) => ({ label: l.label ?? '', url: l.url ?? '' })),
  };
}

const opt = (s: string) => (s.trim() ? s.trim() : undefined);
const year = (s: string) => (s.trim() ? Number(s) : undefined);
const isBlank = (row: Record<string, string>) => Object.values(row).every((v) => !v.trim());

/**
 * Builds the PUT /me/profile body. Completely empty list rows are dropped; `maps` records
 * which form row each sent row came from so server errors land on the right inputs.
 */
function toPayload(f: FormState) {
  const maps: Record<'education' | 'experience' | 'links', number[]> = { education: [], experience: [], links: [] };
  const keep = <T extends Record<string, string>>(key: keyof typeof maps, rows: T[]) =>
    rows.filter((r, i) => {
      if (isBlank(r)) return false;
      maps[key].push(i);
      return true;
    });
  const body = {
    name: f.name.trim(),
    headline: f.headline.trim() || null,
    bio: f.bio.trim() || null,
    location: f.location.trim() || null,
    timezone: f.timezone,
    stage: f.stage || null,
    targetRoles: f.targetRoles,
    targetDate: f.targetDate ? new Date(`${f.targetDate}T00:00`).toISOString() : null,
    weeklyHours: f.weeklyHours.trim() ? Math.round(Number(f.weeklyHours)) : null,
    learningStyle: f.learningStyle || null,
    interests: f.interests,
    preferredLanguages: f.preferredLanguages,
    education: keep('education', f.education).map((e) => ({
      institution: e.institution.trim(),
      degree: opt(e.degree),
      field: opt(e.field),
      startYear: year(e.startYear),
      endYear: year(e.endYear),
      grade: opt(e.grade),
    })),
    experience: keep('experience', f.experience).map((e) => ({ company: e.company.trim(), title: e.title.trim(), start: opt(e.start), end: opt(e.end), summary: opt(e.summary) })),
    links: keep('links', f.links).map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
  };
  return { body, maps };
}

function remapErrors(errors: Record<string, string>, maps: Record<string, number[]>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(errors)) {
    const m = /^(education|experience|links)\.(\d+)(\..*)?$/.exec(k);
    if (m && maps[m[1]]?.[Number(m[2])] !== undefined) out[`${m[1]}.${maps[m[1]][Number(m[2])]}${m[3] ?? ''}`] = v;
    else out[k] = v;
  }
  return out;
}

export default function ProfilePage() {
  const q = useQuery({ queryKey: ['me', 'profile'], queryFn: () => api.get<ProfileResponse>('/me/profile') });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading profile">
        <Skeleton className="h-72" />
        <Skeleton className="h-60" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  return <ProfileForm data={q.data} />;
}

function ProfileForm({ data }: { data: ProfileResponse }) {
  const qc = useQueryClient();
  const [initial, setInitial] = useState(() => toForm(data));
  const [f, setF] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // TagsInput is uncontrolled while typing; bumping this remounts it after a discard.
  const [rev, setRev] = useState(0);
  const zones = useMemo(() => timeZones(f.timezone), [f.timezone]);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const setRow = <K extends 'education' | 'experience' | 'links'>(k: K, i: number, patch: Partial<FormState[K][number]>) =>
    setF((s) => ({ ...s, [k]: (s[k] as FormState[K][number][]).map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const addRow = <K extends 'education' | 'experience' | 'links'>(k: K, row: FormState[K][number]) => setF((s) => ({ ...s, [k]: [...(s[k] as FormState[K][number][]), row] }));
  const removeRow = (k: 'education' | 'experience' | 'links', i: number) => {
    setF((s) => ({ ...s, [k]: (s[k] as unknown[]).filter((_, j) => j !== i) }));
    // Row indexes shift, so stale per-row errors no longer apply.
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([key]) => !key.startsWith(`${k}.`))));
  };

  const save = useMutation({
    mutationFn: async () => {
      const { body, maps } = toPayload(f);
      try {
        return await api.put('/me/profile', body);
      } catch (e) {
        setErrors(remapErrors(fieldErrors(e), maps));
        throw e;
      }
    },
    onSuccess: () => {
      setErrors({});
      setInitial(f);
      toast.success('Profile saved.');
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  const err = (k: string) => errors[k];
  const atLimit = (n: number, max: number) => n >= max;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Card>
        <CardHeader title="About you" description="Shown on your profile and used to personalise your learning plan." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={err('name')} required>
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" maxLength={100} />
          </Field>
          <Field label="Location" optional error={err('location')}>
            <Input value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="City, country" maxLength={120} />
          </Field>
          <Field label="Headline" optional error={err('headline')} helper="One line, for example: Frontend developer learning system design." className="sm:col-span-2">
            <Input value={f.headline} onChange={(e) => set('headline', e.target.value)} maxLength={160} />
          </Field>
          <Field label="Bio" optional error={err('bio')} helper={`${f.bio.length} of 2000 characters`} className="sm:col-span-2">
            <Textarea value={f.bio} onChange={(e) => set('bio', e.target.value)} maxLength={2000} rows={4} />
          </Field>
          <Field label="Time zone" error={err('timezone')} helper="Used for reminders, streaks and deadlines." className="sm:col-span-2">
            <Select value={f.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Goals and learning" description="Helps us recommend roadmaps, practice and a realistic weekly plan." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Current stage" optional error={err('stage')}>
            <Select value={f.stage} onChange={(e) => set('stage', e.target.value)}>
              <option value="">Not specified</option>
              {STAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Learning style" optional error={err('learningStyle')}>
            <Select value={f.learningStyle} onChange={(e) => set('learningStyle', e.target.value)}>
              <option value="">Not specified</option>
              {LEARNING_STYLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Target roles" optional error={err('targetRoles')} helper="Up to 10, separated by commas." className="sm:col-span-2">
            <TagsInput key={`targetRoles-${rev}`} value={f.targetRoles} onChange={(v) => set('targetRoles', v)} placeholder="Frontend developer, Data analyst" />
          </Field>
          <Field label="Target date" optional error={err('targetDate')} helper="When you want to be job ready.">
            <Input type="date" value={f.targetDate} onChange={(e) => set('targetDate', e.target.value)} />
          </Field>
          <Field label="Hours per week" optional error={err('weeklyHours')} helper="Between 1 and 80.">
            <Input type="number" inputMode="numeric" min={1} max={80} step={1} value={f.weeklyHours} onChange={(e) => set('weeklyHours', e.target.value)} />
          </Field>
          <Field label="Interests" optional error={err('interests')} helper="Separated by commas." className="sm:col-span-2">
            <TagsInput key={`interests-${rev}`} value={f.interests} onChange={(v) => set('interests', v)} placeholder="Web development, Machine learning" />
          </Field>
          <Field label="Preferred programming languages" optional error={err('preferredLanguages')} helper="Up to 12, separated by commas." className="sm:col-span-2">
            <TagsInput key={`preferredLanguages-${rev}`} value={f.preferredLanguages} onChange={(v) => set('preferredLanguages', v)} placeholder="JavaScript, Python, SQL" />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Education"
          description="Schools, colleges and courses."
          action={
            f.education.length > 0 && (
              <Button
                size="sm"
                icon={<PlusIcon size={14} />}
                onClick={() => addRow('education', { ...emptyEdu })}
                disabled={atLimit(f.education.length, 10)}
                disabledReason="You can add up to 10 education entries"
              >
                Add education
              </Button>
            )
          }
        />
        <CardBody className="space-y-3">
          {err('education') && <p className="text-[12.5px] text-danger" role="alert">{err('education')}</p>}
          {f.education.length === 0 ? (
            <InlineEmpty
              icon={<GraduationCapIcon size={22} />}
              title="No education added"
              description="Add your school or college so mentors and recruiters see where you studied."
              action={
                <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => addRow('education', { ...emptyEdu })}>
                  Add education
                </Button>
              }
            />
          ) : (
            f.education.map((row, i) => (
              <fieldset key={i} className="rounded-md bg-surface-2 p-4">
                <legend className="sr-only">Education {i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-6">
                  <Field label="Institution" required error={err(`education.${i}.institution`)} className="sm:col-span-4">
                    <Input value={row.institution} onChange={(e) => setRow('education', i, { institution: e.target.value })} maxLength={200} />
                  </Field>
                  <Field label="Grade" optional error={err(`education.${i}.grade`)} className="sm:col-span-2">
                    <Input value={row.grade} onChange={(e) => setRow('education', i, { grade: e.target.value })} placeholder="8.2 CGPA" maxLength={40} />
                  </Field>
                  <Field label="Degree" optional error={err(`education.${i}.degree`)} className="sm:col-span-3">
                    <Input value={row.degree} onChange={(e) => setRow('education', i, { degree: e.target.value })} placeholder="B.Tech" maxLength={120} />
                  </Field>
                  <Field label="Field of study" optional error={err(`education.${i}.field`)} className="sm:col-span-3">
                    <Input value={row.field} onChange={(e) => setRow('education', i, { field: e.target.value })} placeholder="Computer science" maxLength={120} />
                  </Field>
                  <Field label="Start year" optional error={err(`education.${i}.startYear`)} className="sm:col-span-2">
                    <Input type="number" inputMode="numeric" min={1950} max={2100} value={row.startYear} onChange={(e) => setRow('education', i, { startYear: e.target.value })} />
                  </Field>
                  <Field label="End year" optional error={err(`education.${i}.endYear`)} className="sm:col-span-2">
                    <Input type="number" inputMode="numeric" min={1950} max={2100} value={row.endYear} onChange={(e) => setRow('education', i, { endYear: e.target.value })} />
                  </Field>
                  <div className="flex items-end sm:col-span-2 sm:justify-end">
                    <Button variant="ghost" size="sm" icon={<TrashIcon size={14} />} onClick={() => removeRow('education', i)} aria-label={`Remove education ${row.institution || i + 1}`}>
                      Remove
                    </Button>
                  </div>
                </div>
              </fieldset>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Experience"
          description="Jobs, internships and freelance work."
          action={
            f.experience.length > 0 && (
              <Button
                size="sm"
                icon={<PlusIcon size={14} />}
                onClick={() => addRow('experience', { ...emptyExp })}
                disabled={atLimit(f.experience.length, 20)}
                disabledReason="You can add up to 20 experience entries"
              >
                Add experience
              </Button>
            )
          }
        />
        <CardBody className="space-y-3">
          {err('experience') && <p className="text-[12.5px] text-danger" role="alert">{err('experience')}</p>}
          {f.experience.length === 0 ? (
            <InlineEmpty
              icon={<BriefcaseIcon size={22} />}
              title="No experience added"
              description="Add internships or jobs, even short ones. They help with role recommendations."
              action={
                <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => addRow('experience', { ...emptyExp })}>
                  Add experience
                </Button>
              }
            />
          ) : (
            f.experience.map((row, i) => (
              <fieldset key={i} className="rounded-md bg-surface-2 p-4">
                <legend className="sr-only">Experience {i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-6">
                  <Field label="Company" required error={err(`experience.${i}.company`)} className="sm:col-span-3">
                    <Input value={row.company} onChange={(e) => setRow('experience', i, { company: e.target.value })} maxLength={200} />
                  </Field>
                  <Field label="Title" required error={err(`experience.${i}.title`)} className="sm:col-span-3">
                    <Input value={row.title} onChange={(e) => setRow('experience', i, { title: e.target.value })} maxLength={200} />
                  </Field>
                  <Field label="Start" optional error={err(`experience.${i}.start`)} className="sm:col-span-2">
                    <Input value={row.start} onChange={(e) => setRow('experience', i, { start: e.target.value })} placeholder="2023-06" maxLength={20} />
                  </Field>
                  <Field label="End" optional error={err(`experience.${i}.end`)} helper="Leave empty if current." className="sm:col-span-2">
                    <Input value={row.end} onChange={(e) => setRow('experience', i, { end: e.target.value })} placeholder="2024-01" maxLength={20} />
                  </Field>
                  <div className="flex items-end sm:col-span-2 sm:justify-end">
                    <Button variant="ghost" size="sm" icon={<TrashIcon size={14} />} onClick={() => removeRow('experience', i)} aria-label={`Remove experience ${row.company || i + 1}`}>
                      Remove
                    </Button>
                  </div>
                  <Field label="Summary" optional error={err(`experience.${i}.summary`)} className="sm:col-span-6">
                    <Textarea value={row.summary} onChange={(e) => setRow('experience', i, { summary: e.target.value })} rows={3} maxLength={2000} />
                  </Field>
                </div>
              </fieldset>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Links"
          description="Portfolio, GitHub, LinkedIn or a personal site."
          action={
            f.links.length > 0 && (
              <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => addRow('links', { ...emptyLink })} disabled={atLimit(f.links.length, 10)} disabledReason="You can add up to 10 links">
                Add link
              </Button>
            )
          }
        />
        <CardBody className="space-y-3">
          {err('links') && <p className="text-[12.5px] text-danger" role="alert">{err('links')}</p>}
          {f.links.length === 0 ? (
            <InlineEmpty
              icon={<LinkIcon size={22} />}
              title="No links added"
              description="Add links to your work so others can see what you have built."
              action={
                <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => addRow('links', { ...emptyLink })}>
                  Add link
                </Button>
              }
            />
          ) : (
            f.links.map((row, i) => (
              <fieldset key={i} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                <legend className="sr-only">Link {i + 1}</legend>
                <Field label="Label" error={err(`links.${i}.label`)}>
                  <Input value={row.label} onChange={(e) => setRow('links', i, { label: e.target.value })} placeholder="GitHub" maxLength={40} />
                </Field>
                <Field label="URL" error={err(`links.${i}.url`)}>
                  <Input type="url" value={row.url} onChange={(e) => setRow('links', i, { url: e.target.value })} placeholder="https://github.com/you" maxLength={500} />
                </Field>
                <div className="flex items-end">
                  <Button variant="ghost" size="icon" onClick={() => removeRow('links', i)} aria-label={`Remove link ${row.label || i + 1}`}>
                    <TrashIcon size={16} />
                  </Button>
                </div>
              </fieldset>
            ))
          )}
        </CardBody>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-3 border-t border-border bg-bg/90 px-1 py-3 backdrop-blur">
        {dirty && <span className="text-[13px] text-muted">You have unsaved changes</span>}
        <Button
          variant="ghost"
          onClick={() => {
            setF(initial);
            setErrors({});
            setRev((r) => r + 1);
          }}
          disabled={!dirty || save.isPending}
          disabledReason={!dirty ? 'Nothing to discard' : undefined}
        >
          Discard changes
        </Button>
        <Button type="submit" variant="primary" icon={<FloppyDiskIcon size={16} />} loading={save.isPending} disabled={!dirty} disabledReason="No changes to save">
          Save profile
        </Button>
      </div>
    </form>
  );
}
