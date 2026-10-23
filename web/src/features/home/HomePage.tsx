import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  FireIcon,
  LightningIcon,
  ClockIcon,
  ArrowsClockwiseIcon,
  ArrowRightIcon,
  XIcon,
  CheckCircleIcon,
  CircleIcon,
  PathIcon,
  CodeIcon,
  ExamIcon,
  HammerIcon,
  TargetIcon,
  BriefcaseIcon,
  DnaIcon,
  ArrowUUpLeftIcon,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { timeAgo, plural } from '@/lib/format';
import { Card, CardHeader, CardBody, CardAction, ErrorState, PageHeader, Progress, Skeleton, StatTile, ButtonLink, EmptyState, Badge, Tooltip } from '@/components/ui';

export type Recommendation = {
  id: string;
  kind: 'revision' | 'prerequisite' | 'next_topic' | 'practice' | 'project' | 'skip' | 'job_gap' | 'diagnostic';
  title: string;
  reason: string;
  link: string;
  priority: number;
  skill?: { slug: string; name: string };
};

type Dashboard = {
  streak: { current: number; longest: number; activeToday: boolean };
  xp: number;
  weekMinutes: number;
  dueRevisions: number;
  skillCounts: { verified: number; demonstrated: number; learning: number; needsRevision: number; selfDeclared: number };
  enrollments: { id: string; mode: string; weeklyMinutes: number | null; track: { slug: string; title: string; category: string }; total: number; done: number }[];
  recent: { id: string; kind: string; label: string; xp: number; minutes: number; createdAt: string; link: string | null }[];
};

type Goal = { id: string; title: string; kind: string; status: string; progress: { value: number; target: number } | null; targetDate: string | null };

const KIND_ICON: Record<Recommendation['kind'], typeof PathIcon> = {
  revision: ArrowsClockwiseIcon,
  prerequisite: TargetIcon,
  next_topic: PathIcon,
  practice: CodeIcon,
  project: HammerIcon,
  skip: CheckCircleIcon,
  job_gap: BriefcaseIcon,
  diagnostic: ExamIcon,
};

const KIND_LABEL: Record<Recommendation['kind'], string> = {
  revision: 'Revision',
  prerequisite: 'Fix a gap',
  next_topic: 'Next lesson',
  practice: 'Practice',
  project: 'Build',
  skip: 'Accelerate',
  job_gap: 'Job readiness',
  diagnostic: 'Diagnostic',
};

export function RecommendationList({ limit = 5 }: { limit?: number }) {
  const qc = useQueryClient();
  const recs = useQuery({ queryKey: ['recommendations'], queryFn: () => api.get<{ recommendations: Recommendation[] }>('/learning/recommendations') });
  const dismiss = useMutation({
    mutationFn: (id: string) => api.post('/learning/recommendations/dismiss', { id }),
    onMutate: async (id) => {
      qc.setQueryData<{ recommendations: Recommendation[] }>(['recommendations'], (d) => (d ? { recommendations: d.recommendations.filter((r) => r.id !== id) } : d));
    },
  });
  const restore = useMutation({
    mutationFn: () => api.post('/learning/recommendations/dismiss', { restoreAll: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recommendations'] }),
  });

  if (recs.isLoading)
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[68px]" />
        ))}
      </div>
    );
  if (recs.error) return <ErrorState error={recs.error} onRetry={() => recs.refetch()} />;
  const list = recs.data!.recommendations.slice(0, limit);
  if (!list.length)
    return (
      <EmptyState
        icon={<PathIcon size={22} />}
        title="Nothing urgent right now"
        description="Enroll in a roadmap or take a diagnostic and your next best steps will appear here, each with the reason it was suggested."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink to="/app/learn" variant="primary">
              Browse roadmaps
            </ButtonLink>
            <button className="text-[13px] text-muted hover:underline" onClick={() => restore.mutate()}>
              Restore dismissed suggestions
            </button>
          </div>
        }
      />
    );
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
      {list.map((r) => {
        const Icon = KIND_ICON[r.kind];
        const attention = r.kind === 'revision' || r.kind === 'prerequisite';
        return (
          <li key={r.id} className="group relative flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
            <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', attention ? 'bg-warning-soft text-warning' : 'bg-accent-soft text-accent-text')}>
              <Icon size={18} weight="duotone" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <Link to={r.link} className="text-[14.5px] font-semibold tracking-[-0.005em] after:absolute after:inset-0 hover:text-accent-text">
                  {r.title}
                </Link>
                <Badge tone={attention ? 'warning' : 'neutral'}>{KIND_LABEL[r.kind]}</Badge>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                <span className="font-medium text-fg">Why: </span>
                {r.reason}
              </p>
            </div>
            <Tooltip content="Not now (hide this suggestion)">
              <button
                onClick={() => dismiss.mutate(r.id)}
                className="relative z-10 -mr-1 rounded-md p-1.5 text-subtle opacity-60 transition hover:bg-surface-3 hover:text-fg group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Dismiss suggestion: ${r.title}`}
              >
                <XIcon size={15} />
              </button>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

function GettingStarted({ d, hasRecs }: { d: Dashboard; hasRecs: boolean }) {
  const items = [
    { done: true, label: 'Set your goals', to: '/app/settings/profile' },
    { done: d.enrollments.length > 0, label: 'Enroll in a roadmap', to: '/app/learn' },
    { done: d.recent.some((r) => r.kind === 'topic.completed'), label: 'Complete your first lesson', to: '/app/learn' },
    { done: d.recent.some((r) => r.kind === 'problem.solved') || d.skillCounts.verified + d.skillCounts.demonstrated > 0, label: 'Solve a CodeLab problem', to: '/app/practice' },
    { done: d.recent.some((r) => r.kind.startsWith('project.')), label: 'Start a project', to: '/app/projects' },
  ];
  const done = items.filter((i) => i.done).length;
  if (done === items.length || (!hasRecs && d.xp > 500)) return null;
  return (
    <Card>
      <CardHeader title="Getting started" description={`${done} of ${items.length} done`} />
      <CardBody>
        <Progress value={done} max={items.length} className="mb-3" label="Getting started progress" />
        <ul className="-mx-2 space-y-px">
          {items.map((i) => (
            <li key={i.label}>
              <Link to={i.to} className="flex h-9 items-center gap-2.5 rounded-md px-2 text-[13.5px] transition-colors hover:bg-surface-2">
                {i.done ? <CheckCircleIcon size={18} weight="fill" className="text-success" /> : <CircleIcon size={18} className="text-subtle" />}
                <span className={clsx(i.done && 'text-muted line-through')}>{i.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

const MODE_LABEL: Record<string, string> = { guided: 'Guided', independent: 'Independent', intensive: 'Intensive revision', interview: 'Interview prep', project_first: 'Project-first' };

export default function HomePage() {
  const me = useSession();
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/learning/dashboard') });
  const goals = useQuery({ queryKey: ['goals'], queryFn: () => api.get<{ goals: Goal[] }>('/learning/goals') });
  const recs = useQuery({ queryKey: ['recommendations'], queryFn: () => api.get<{ recommendations: Recommendation[] }>('/learning/recommendations') });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const d = dash.data;
  const weeklyGoal = goals.data?.goals.find((g) => g.kind === 'weekly' && g.status === 'active' && g.progress);
  const activeGoals = goals.data?.goals.filter((g) => g.status === 'active') ?? [];

  return (
    <div>
      <PageHeader
        hero
        title={`${greeting}, ${me.user.name.split(' ')[0]}`}
        description={`${d?.dueRevisions ? `${plural(d.dueRevisions, 'revision')} due today. ` : ''}Here's what will move you forward most.`}
        actions={
          <>
            <ButtonLink to="/app/skills" icon={<DnaIcon size={16} />}>
              Skill DNA
            </ButtonLink>
            <ButtonLink to="/app/learn" variant="primary" icon={<PathIcon size={16} />}>
              Continue learning
            </ButtonLink>
          </>
        }
      >
      {dash.error ? (
        <ErrorState error={dash.error} onRetry={() => dash.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {!d ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[118px] rounded-lg" />)
          ) : (
            <>
              <StatTile label="Study streak" value={`${d.streak.current} ${d.streak.current === 1 ? 'day' : 'days'}`} hint={d.streak.activeToday ? 'Done for today' : `Longest: ${d.streak.longest}`} icon={<FireIcon weight="fill" />} tone="xp" />
              <StatTile label="Total XP" value={d.xp.toLocaleString()} hint="From completed work only" icon={<LightningIcon weight="fill" />} tone="xp" />
              <StatTile
                label="This week"
                value={`${Math.round(d.weekMinutes / 6) / 10} h`}
                hint={weeklyGoal?.progress ? `Goal: ${Math.round(weeklyGoal.progress.target / 60)} h` : 'Logged study time'}
                icon={<ClockIcon weight="bold" />}
                tone="accent"
              />
              <StatTile label="Revisions due" value={d.dueRevisions} hint={d.dueRevisions ? 'Review to keep skills fresh' : 'All caught up'} icon={<ArrowsClockwiseIcon weight="bold" />} tone={d.dueRevisions ? 'warning' : 'success'} />
            </>
          )}
        </div>
      )}
      </PageHeader>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="next-steps">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <h2 id="next-steps" className="text-[16px] font-semibold tracking-[-0.01em]">
                Your next steps
              </h2>
              <span className="text-[12.5px] text-subtle">Ranked from your evidence. Dismiss anything that doesn't fit.</span>
            </div>
            <RecommendationList />
          </section>

          <section aria-labelledby="roadmaps">
            <div className="mb-3 flex items-end justify-between gap-4">
              <h2 id="roadmaps" className="text-[16px] font-semibold tracking-[-0.01em]">
                Active roadmaps
              </h2>
              <CardAction to="/app/learn">All roadmaps</CardAction>
            </div>
            {!d ? (
              <Skeleton className="h-24 rounded-lg" />
            ) : d.enrollments.length === 0 ? (
              <EmptyState icon={<PathIcon size={22} />} title="No roadmap yet" description="Roadmaps break a goal into lessons, practice and milestones, paced to your weekly time." action={<ButtonLink to="/app/learn" variant="primary">Choose a roadmap</ButtonLink>} />
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                {d.enrollments.map((e) => {
                  const pct = e.total ? Math.round((e.done / e.total) * 100) : 0;
                  return (
                    <li key={e.id}>
                      <Link to={`/app/learn/${e.track.slug}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent-soft font-display text-[14px] font-semibold tabular-nums text-accent-text">{pct}%</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-semibold tracking-[-0.005em]">{e.track.title}</span>
                          <span className="mt-0.5 block text-[12.5px] text-muted">
                            {MODE_LABEL[e.mode] ?? e.mode} mode · {e.done} of {e.total} topics
                          </span>
                          <Progress value={e.done} max={e.total} className="mt-2.5 max-w-md" label={`${e.track.title} progress`} />
                        </span>
                        <ArrowRightIcon size={16} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="recent">
            <div className="mb-3 flex items-end justify-between gap-4">
              <h2 id="recent" className="text-[16px] font-semibold tracking-[-0.01em]">
                Recent activity
              </h2>
              <Link to="/app/notifications?tab=activity" className="group -mr-2 inline-flex h-7 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-soft">
                <ArrowUUpLeftIcon size={13} aria-hidden /> Full history
              </Link>
            </div>
            {!d ? (
              <Skeleton className="h-32 rounded-lg" />
            ) : !d.recent.length ? (
              <p className="rounded-lg border border-dashed border-border-strong/70 px-5 py-6 text-center text-[13px] text-muted">Your completed lessons, solved problems and submissions will appear here.</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                {d.recent.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium">{a.label}</span>
                      <span className="text-[12px] text-subtle">{timeAgo(a.createdAt)}</span>
                    </span>
                    {a.xp > 0 && <Badge tone="xp">+{a.xp} XP</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          {d && <GettingStarted d={d} hasRecs={!!recs.data?.recommendations.length} />}

          <Card>
            <CardHeader title="Skill DNA" description="What your evidence shows" action={<CardAction to="/app/skills">Open</CardAction>} />
            <CardBody>{!d ? <Skeleton className="h-28" /> : <SkillMix counts={d.skillCounts} />}</CardBody>
          </Card>

          <Card>
            <CardHeader title="Goals" action={<CardAction to="/app/goals">Manage</CardAction>} />
            <CardBody>
              {goals.isLoading ? (
                <Skeleton className="h-20" />
              ) : !activeGoals.length ? (
                <p className="text-[13px] text-muted">
                  No active goals. <Link to="/app/goals" className="font-medium text-accent-text hover:underline">Set one</Link> to track daily and weekly progress.
                </p>
              ) : (
                <ul className="space-y-3.5">
                  {activeGoals.slice(0, 5).map((g) => (
                    <li key={g.id}>
                      <div className="flex items-center justify-between gap-3 text-[13.5px]">
                        <span className="truncate">{g.title}</span>
                        {g.progress && (
                          <span className="shrink-0 text-[12px] font-medium tabular-nums text-muted">
                            {g.progress.value}/{g.progress.target}
                          </span>
                        )}
                      </div>
                      {g.progress && <Progress value={g.progress.value} max={g.progress.target} className="mt-1.5" tone={g.progress.value >= g.progress.target ? 'success' : 'accent'} />}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/** Skill counts as one stacked bar plus a legend, instead of a grid of boxes. */
function SkillMix({ counts }: { counts: Dashboard['skillCounts'] }) {
  const rows = [
    ['Verified', counts.verified, 'bg-success'],
    ['Demonstrated', counts.demonstrated, 'bg-accent'],
    ['Learning', counts.learning, 'bg-info'],
    ['Needs revision', counts.needsRevision, 'bg-warning'],
    ['Self-reported', counts.selfDeclared, 'bg-border-strong'],
  ] as const;
  const total = rows.reduce((n, r) => n + r[1], 0);
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {total > 0 && rows.map(([label, n, cls]) => (n > 0 ? <span key={label} className={clsx('h-full first:rounded-l-full last:rounded-r-full', cls)} style={{ width: `${(n / total) * 100}%` }} /> : null))}
      </div>
      <dl className="mt-4 space-y-2">
        {rows.map(([label, n, cls]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-[13px]">
            <dt className="flex items-center gap-2.5 text-muted">
              <span className={clsx('h-2.5 w-2.5 rounded-[3px]', cls)} aria-hidden />
              {label}
            </dt>
            <dd className="font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
