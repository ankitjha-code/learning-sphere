import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CheckIcon, ArrowLeftIcon, ArrowRightIcon, SparkleIcon, PathIcon, ClockIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Badge, Banner, Button, Field, Input, Skeleton } from '@/components/ui';

const STAGES = [
  { value: 'school_graduate', label: 'Finished school', hint: 'Choosing what to study next' },
  { value: 'college_student', label: 'College student', hint: 'Studying and preparing for placements' },
  { value: 'graduate', label: 'Recent graduate', hint: 'Looking for a first role' },
  { value: 'professional', label: 'Working professional', hint: 'Growing in my current field' },
  { value: 'career_switcher', label: 'Switching careers', hint: 'Moving into tech from another field' },
] as const;

const ROLE_SUGGESTIONS = ['Software Engineer', 'Backend Developer', 'Frontend Developer', 'Full-Stack Developer', 'Data Analyst', 'Data Scientist', 'Machine Learning Engineer', 'DevOps Engineer', 'SDE Intern'];

const SKILL_OPTIONS = [
  { slug: 'programming-basics', name: 'Programming basics' },
  { slug: 'python', name: 'Python' },
  { slug: 'javascript', name: 'JavaScript' },
  { slug: 'java', name: 'Java' },
  { slug: 'html-css', name: 'HTML & CSS' },
  { slug: 'react', name: 'React' },
  { slug: 'sql-basics', name: 'SQL' },
  { slug: 'arrays', name: 'Arrays & strings' },
  { slug: 'recursion', name: 'Recursion' },
  { slug: 'oop', name: 'Object-oriented programming' },
  { slug: 'git', name: 'Git' },
  { slug: 'http-rest', name: 'HTTP & REST APIs' },
  { slug: 'statistics', name: 'Statistics' },
  { slug: 'communication', name: 'Communication' },
];

const LEVELS = ['None', 'Beginner', 'Some practice', 'Comfortable', 'Advanced'];

const STYLES = [
  { value: 'guided', label: 'Guided', hint: 'Step-by-step lessons with checks' },
  { value: 'project_first', label: 'Project-first', hint: 'Learn by building' },
  { value: 'independent', label: 'Independent', hint: 'Outline and resources, my own pace' },
  { value: 'intensive', label: 'Intensive', hint: 'Fast revision before a deadline' },
  { value: 'interview', label: 'Interview prep', hint: 'Practice for upcoming interviews' },
] as const;

const LANGS = ['python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'go', 'rust'];

type State = {
  stage: string | null;
  targetRoles: string[];
  targetDate: string;
  institution: string;
  degree: string;
  field: string;
  endYear: string;
  skills: Record<string, number>;
  learningStyle: string | null;
  weeklyHours: number;
  preferredLanguages: string[];
  trackSlugs: string[];
};

export default function OnboardingPage() {
  const me = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [customRole, setCustomRole] = useState('');
  const [s, set] = useState<State>({
    stage: null,
    targetRoles: [],
    targetDate: '',
    institution: '',
    degree: '',
    field: '',
    endYear: '',
    skills: {},
    learningStyle: 'guided',
    weeklyHours: 6,
    preferredLanguages: ['python'],
    trackSlugs: [],
  });

  const suggest = useQuery({
    queryKey: ['suggest', s.targetRoles],
    queryFn: () => api.get<{ tracks: { slug: string; title: string; summary: string; level: string; estimatedHours: number | null; contentStatus: string; category: string }[] }>(`/learning/suggest?roles=${encodeURIComponent(s.targetRoles.join(','))}`),
    enabled: step === 3,
  });

  const submit = useMutation({
    mutationFn: (skip: boolean) =>
      api.post<{ plan: unknown }>('/me/onboarding', {
        skip,
        stage: s.stage,
        targetRoles: s.targetRoles,
        targetDate: s.targetDate ? new Date(s.targetDate).toISOString() : null,
        education: s.institution ? [{ institution: s.institution, degree: s.degree || undefined, field: s.field || undefined, endYear: s.endYear ? Number(s.endYear) : undefined }] : undefined,
        learningStyle: s.learningStyle,
        weeklyHours: s.weeklyHours,
        preferredLanguages: s.preferredLanguages,
        selfRatedSkills: Object.entries(s.skills)
          .filter(([, l]) => l > 0)
          .map(([slug, level]) => ({ slug, level })),
        trackSlugs: s.trackSlugs.length ? s.trackSlugs : undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/app', { replace: true });
    },
  });

  const toggleRole = (r: string) => set({ ...s, targetRoles: s.targetRoles.includes(r) ? s.targetRoles.filter((x) => x !== r) : [...s.targetRoles, r].slice(0, 3) });
  const steps = ['Your goal', 'Your background', 'How you learn', 'Your plan'];

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" width={26} height={26} className="rounded-md" />
            <span className="text-[15px] font-semibold">LearnSphere Nexus</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => submit.mutate(true)} disabled={submit.isPending}>
            Skip for now
          </Button>
        </div>

        <ol className="mb-8 flex items-center gap-2" aria-label="Onboarding progress">
          {steps.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={clsx(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold',
                  i < step ? 'bg-accent text-on-accent' : i === step ? 'border-2 border-accent text-accent-text' : 'border border-border text-subtle',
                )}
                aria-current={i === step ? 'step' : undefined}
              >
                {i < step ? <CheckIcon size={12} weight="bold" /> : i + 1}
              </span>
              <span className={clsx('hidden text-[12.5px] sm:inline', i === step ? 'font-medium text-fg' : 'text-subtle')}>{label}</span>
              {i < steps.length - 1 && <span className="h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-1 sm:p-7">
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em]">Hi {me.user.name.split(' ')[0]}, what are you working toward?</h1>
                <p className="mt-1 text-muted">We'll use this to suggest a roadmap. Everything here is optional and editable later.</p>
              </div>
              <fieldset>
                <legend className="mb-2 text-[13px] font-medium">Where are you right now?</legend>
                <div className="grid gap-2.5 sm:grid-cols-2 sm:[&>*:last-child:nth-child(odd)]:col-span-2">
                  {STAGES.map((st) => (
                    <button
                      key={st.value}
                      type="button"
                      onClick={() => set({ ...s, stage: st.value })}
                      aria-pressed={s.stage === st.value}
                      className={clsx('rounded-lg border px-4 py-3 text-left transition-colors', s.stage === st.value ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong')}
                    >
                      <span className="block text-[14px] font-medium">{st.label}</span>
                      <span className="block text-[12.5px] text-muted">{st.hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-[13px] font-medium">Target roles (up to 3)</legend>
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set([...ROLE_SUGGESTIONS, ...s.targetRoles])].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRole(r)}
                      aria-pressed={s.targetRoles.includes(r)}
                      className={clsx('rounded-full border px-3 py-1 text-[13px]', s.targetRoles.includes(r) ? 'border-accent bg-accent text-on-accent' : 'border-border hover:border-border-strong')}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input placeholder="Add another role" value={customRole} onChange={(e) => setCustomRole(e.target.value)} className="max-w-xs" aria-label="Custom role" />
                  <Button
                    onClick={() => {
                      if (customRole.trim()) toggleRole(customRole.trim());
                      setCustomRole('');
                    }}
                    disabled={!customRole.trim()}
                  >
                    Add
                  </Button>
                </div>
              </fieldset>
              <Field label="Target date" optional helper="When would you like to be job-ready or finish your goal?">
                <Input type="date" value={s.targetDate} onChange={(e) => set({ ...s, targetDate: e.target.value })} className="max-w-[200px]" />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em]">What do you already know?</h1>
                <p className="mt-1 text-muted">Ratings are recorded as <strong>self-reported</strong>. They never count as verified until you prove them in practice or assessments.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="School or college" optional>
                  <Input value={s.institution} onChange={(e) => set({ ...s, institution: e.target.value })} />
                </Field>
                <Field label="Degree" optional>
                  <Input value={s.degree} onChange={(e) => set({ ...s, degree: e.target.value })} placeholder="e.g. B.Tech" />
                </Field>
                <Field label="Field of study" optional>
                  <Input value={s.field} onChange={(e) => set({ ...s, field: e.target.value })} />
                </Field>
                <Field label="Graduation year" optional>
                  <Input inputMode="numeric" value={s.endYear} onChange={(e) => set({ ...s, endYear: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                </Field>
              </div>
              <div>
                <div className="mb-2 text-[13px] font-medium">Rate the skills you have</div>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {SKILL_OPTIONS.map((sk) => (
                    <div key={sk.slug} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-[14px]">{sk.name}</span>
                      <div className="flex gap-1" role="radiogroup" aria-label={`${sk.name} level`}>
                        {LEVELS.map((l, i) => (
                          <button
                            key={l}
                            type="button"
                            role="radio"
                            aria-checked={(s.skills[sk.slug] ?? 0) === i}
                            onClick={() => set({ ...s, skills: { ...s.skills, [sk.slug]: i } })}
                            className={clsx('rounded-md px-2 py-1 text-[12px]', (s.skills[sk.slug] ?? 0) === i ? 'bg-accent text-on-accent' : 'text-muted hover:bg-surface-2')}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em]">How do you like to learn?</h1>
                <p className="mt-1 text-muted">This sets your default learning mode. You can change it per roadmap.</p>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 sm:[&>*:last-child:nth-child(odd)]:col-span-2">
                {STYLES.map((st) => (
                  <button
                    key={st.value}
                    type="button"
                    onClick={() => set({ ...s, learningStyle: st.value })}
                    aria-pressed={s.learningStyle === st.value}
                    className={clsx('rounded-lg border px-4 py-3 text-left', s.learningStyle === st.value ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong')}
                  >
                    <span className="block text-[14px] font-medium">{st.label}</span>
                    <span className="block text-[12.5px] text-muted">{st.hint}</span>
                  </button>
                ))}
              </div>
              <Field label={`Weekly study time: ${s.weeklyHours} hours`} helper="Be realistic. We'll pace your plan to fit, with room for rest days.">
                <input type="range" min={1} max={30} value={s.weeklyHours} onChange={(e) => set({ ...s, weeklyHours: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
              </Field>
              <fieldset>
                <legend className="mb-2 text-[13px] font-medium">Preferred programming languages</legend>
                <div className="flex flex-wrap gap-1.5">
                  {LANGS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={s.preferredLanguages.includes(l)}
                      onClick={() => set({ ...s, preferredLanguages: s.preferredLanguages.includes(l) ? s.preferredLanguages.filter((x) => x !== l) : [...s.preferredLanguages, l] })}
                      className={clsx('rounded-full border px-3 py-1 font-mono text-[12.5px]', s.preferredLanguages.includes(l) ? 'border-accent bg-accent text-on-accent' : 'border-border hover:border-border-strong')}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em]">Pick your first roadmaps</h1>
                <p className="mt-1 text-muted">
                  {s.targetRoles.length ? <>Suggested for {s.targetRoles.join(', ')}.</> : 'Good starting points.'} Choose up to 3, or let us pick.
                </p>
              </div>
              {suggest.isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : suggest.error ? (
                <Banner tone="danger">{errorMessage(suggest.error)}</Banner>
              ) : (
                <div className="space-y-2">
                  {suggest.data?.tracks.map((t) => {
                    const on = s.trackSlugs.includes(t.slug);
                    return (
                      <button
                        key={t.slug}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ ...s, trackSlugs: on ? s.trackSlugs.filter((x) => x !== t.slug) : [...s.trackSlugs, t.slug].slice(0, 3) })}
                        className={clsx('flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left', on ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong')}
                      >
                        <span className={clsx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border', on ? 'border-accent bg-accent text-on-accent' : 'border-border-strong')}>
                          {on && <CheckIcon size={12} weight="bold" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[14px] font-semibold">{t.title}</span>
                            <Badge>{t.level}</Badge>
                            {t.contentStatus === 'outline' && <Badge tone="warning">Outline</Badge>}
                          </span>
                          <span className="mt-0.5 block text-[13px] text-muted">{t.summary}</span>
                          {t.estimatedHours && (
                            <span className="mt-1 inline-flex items-center gap-1 text-[12px] text-subtle">
                              <ClockIcon size={13} /> about {t.estimatedHours} hours
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] text-muted">
                <SparkleIcon size={16} className="mt-0.5 shrink-0 text-accent-text" />
                After this, a short diagnostic can check what you already know so your roadmap skips it. Self-ratings alone never skip anything.
              </div>
            </div>
          )}

          {submit.error && <Banner tone="danger" className="mt-5">{errorMessage(submit.error)}</Banner>}

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" icon={<ArrowLeftIcon size={16} />} onClick={() => setStep(step - 1)} disabled={step === 0}>
              Back
            </Button>
            {step < 3 ? (
              <Button variant="primary" onClick={() => setStep(step + 1)}>
                Continue <ArrowRightIcon size={16} />
              </Button>
            ) : (
              <Button variant="primary" icon={<PathIcon size={16} />} loading={submit.isPending} onClick={() => submit.mutate(false)}>
                Create my plan
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

