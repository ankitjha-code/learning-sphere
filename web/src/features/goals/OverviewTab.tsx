import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { FireIcon, LightningIcon, PlusIcon, TrophyIcon, TargetIcon, LockSimpleIcon, MedalIcon, InfoIcon, HandshakeIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Badge, Banner, Button, Card, CardBody, CardHeader, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Menu, Progress, Select, Skeleton, StatTile, Switch, Tooltip, type MenuItem } from '@/components/ui';
import { Celebration, usePreferences, WEEKDAYS, type Summary } from './shared';

type Goal = {
  id: string;
  title: string;
  kind: 'career' | 'milestone' | 'weekly' | 'daily';
  status: 'active' | 'done' | 'dropped';
  targetDate: string | null;
  metric: { type: 'minutes' | 'topics' | 'problems' | 'custom'; target: number } | null;
  source: string;
  progress: { value: number; target: number } | null;
  completedAt: string | null;
};
type Achievement = { key: string; title: string; description: string; earned: boolean; awardedAt: string | null; isNew: boolean };

const METRIC_LABEL: Record<string, string> = { minutes: 'minutes', topics: 'topics and problems', problems: 'problems', custom: '' };

function GoalDialog({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [kind, setKind] = useState<Goal['kind']>(goal?.kind ?? 'weekly');
  const [targetDate, setTargetDate] = useState(goal?.targetDate ? goal.targetDate.slice(0, 10) : '');
  const [metric, setMetric] = useState(goal?.metric?.type ?? 'minutes');
  const [target, setTarget] = useState(goal?.metric?.target?.toString() ?? '120');
  const m = useMutation({
    mutationFn: () => {
      const payload = {
        title,
        kind,
        targetDate: targetDate ? new Date(`${targetDate}T12:00:00`).toISOString() : null,
        metric: metric && metric !== 'custom' && target ? { type: metric, target: Number(target) } : null,
      };
      return goal ? api.patch(`/learning/goals/${goal.id}`, payload) : api.post('/learning/goals', payload);
    },
    onSuccess: () => {
      toast.success(goal ? 'Goal updated' : 'Goal added');
      qc.invalidateQueries({ queryKey: ['goals'] });
      onClose();
    },
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={goal ? 'Edit goal' : 'New goal'}
      description="Pick something realistic. You can adjust or drop goals at any time without penalty."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={title.trim().length < 2} disabledReason="Add a title" onClick={() => m.mutate()}>
            {goal ? 'Save goal' : 'Add goal'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {m.error && !Object.keys(fields).length && <Banner tone="danger">{errorMessage(m.error)}</Banner>}
        <Field label="Goal" error={fields.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: study 3 hours this week" maxLength={200} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as Goal['kind'])}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="milestone">Milestone</option>
              <option value="career">Career</option>
            </Select>
          </Field>
          <Field label="Target date" optional>
            <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Measure" helper={kind === 'daily' ? 'Counted from midnight UTC.' : kind === 'weekly' ? 'Counted from Monday.' : 'Counted for the current week.'}>
            <Select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}>
              <option value="minutes">Study minutes</option>
              <option value="topics">Topics and problems completed</option>
              <option value="problems">Problems solved</option>
              <option value="custom">Not measured (tick it off yourself)</option>
            </Select>
          </Field>
          {metric !== 'custom' && (
            <Field label="Target" error={fields['metric.target']}>
              <Input type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} />
            </Field>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function GoalRow({ g, onEdit, onDelete, onStatus }: { g: Goal; onEdit: () => void; onDelete: () => void; onStatus: (s: Goal['status']) => void }) {
  const met = g.progress && g.progress.value >= g.progress.target;
  const items: MenuItem[] =
    g.status === 'active'
      ? [{ label: 'Mark complete', onSelect: () => onStatus('done') }, { label: 'Edit', onSelect: onEdit }, { label: 'Drop goal', onSelect: () => onStatus('dropped') }, 'separator', { label: 'Delete', danger: true, onSelect: onDelete }]
      : [{ label: 'Reopen', onSelect: () => onStatus('active') }, 'separator', { label: 'Delete', danger: true, onSelect: onDelete }];
  return (
    <li className="py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={clsx('text-[14px] font-medium', g.status !== 'active' && 'text-muted line-through')}>{g.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-subtle">
            {g.source === 'mentor' && (
              <Badge tone="accent" icon={<HandshakeIcon size={11} />}>
                Set by your mentor
              </Badge>
            )}
            {g.source === 'plan_generator' && <Badge>From your plan</Badge>}
            {g.targetDate && <span>Target {formatDate(g.targetDate)}</span>}
            {g.status === 'done' && g.completedAt && <span>Completed {formatDate(g.completedAt)}</span>}
            {g.status === 'dropped' && <span>Dropped</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {g.status === 'active' && (
            <Button size="sm" variant={met ? 'soft' : 'ghost'} onClick={() => onStatus('done')}>
              Complete
            </Button>
          )}
          <Menu items={items} label={`Actions for ${g.title}`} />
        </div>
      </div>
      {g.status === 'active' && g.progress && (
        <div className="mt-1.5">
          <Progress value={g.progress.value} max={g.progress.target} tone={met ? 'success' : 'accent'} label={`${g.title} progress`} />
          <div className="mt-1 text-[11.5px] tabular-nums text-subtle">
            {g.progress.value} of {g.progress.target} {METRIC_LABEL[g.metric?.type ?? 'custom']}
            {met ? ' · target reached' : ''}
          </div>
        </div>
      )}
    </li>
  );
}

function GoalsCard({ onCelebrate }: { onCelebrate: (title: string, body?: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['goals'], queryFn: () => api.get<{ goals: Goal[] }>('/learning/goals') });
  const [editing, setEditing] = useState<Goal | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);
  const [showDone, setShowDone] = useState(false);
  const status = useMutation({
    mutationFn: ({ g, s }: { g: Goal; s: Goal['status'] }) => api.patch(`/learning/goals/${g.id}`, { status: s }),
    onSuccess: async (_r, { g, s }) => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['goal-analytics'] });
      if (s === 'done') {
        const ach = await api.get<{ newlyEarned: string[]; items: Achievement[] }>('/motivation/achievements').catch(() => null);
        const fresh = ach?.items.filter((a) => ach.newlyEarned.includes(a.key)).map((a) => a.title) ?? [];
        onCelebrate(`Goal complete: ${g.title}`, fresh.length ? `New achievement: ${fresh.join(', ')}` : 'Nice work. Take a moment to note what helped in your journal.');
        qc.invalidateQueries({ queryKey: ['achievements'] });
      } else toast.success(s === 'dropped' ? 'Goal dropped. Adjusting goals is part of planning well.' : 'Goal reopened');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (g: Goal) => api.del(`/learning/goals/${g.id}`),
    onSuccess: () => (toast.success('Goal deleted'), setDeleting(null), qc.invalidateQueries({ queryKey: ['goals'] })),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const goals = q.data?.goals ?? [];
  const active = goals.filter((g) => g.status === 'active');
  const groups: [string, Goal[]][] = [
    ['Today', active.filter((g) => g.kind === 'daily')],
    ['This week', active.filter((g) => g.kind === 'weekly')],
    ['Milestones and career', active.filter((g) => g.kind === 'milestone' || g.kind === 'career')],
  ];
  const finished = goals.filter((g) => g.status !== 'active');
  return (
    <Card>
      <CardHeader
        title="Goals"
        description="Daily and weekly goals measure completed work automatically."
        action={
          <Button size="sm" variant="primary" icon={<PlusIcon size={14} />} onClick={() => setEditing('new')}>
            New goal
          </Button>
        }
      />
      <CardBody>
        {q.isLoading ? (
          <Skeleton className="h-32" />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !goals.length ? (
          <EmptyState className="border-0! bg-transparent! px-0! py-8!" icon={<TargetIcon size={22} />} title="No goals yet" description="A small weekly goal, like 3 hours of study or 5 problems, is a great start." action={<Button variant="primary" onClick={() => setEditing('new')}>Add a goal</Button>} />
        ) : (
          <div className="space-y-4">
            {groups
              .filter(([, list]) => list.length)
              .map(([label, list]) => (
                <section key={label}>
                  <h3 className="text-[12px] font-semibold uppercase tracking-wide text-subtle">{label}</h3>
                  <ul className="divide-y divide-border">
                    {list.map((g) => (
                      <GoalRow key={g.id} g={g} onEdit={() => setEditing(g)} onDelete={() => setDeleting(g)} onStatus={(s) => status.mutate({ g, s })} />
                    ))}
                  </ul>
                </section>
              ))}
            {!active.length && <p className="text-[13px] text-muted">No active goals right now.</p>}
            {finished.length > 0 && (
              <section>
                <button type="button" className="text-[12.5px] font-medium text-muted hover:text-fg" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
                  {showDone ? 'Hide' : 'Show'} completed and dropped ({finished.length})
                </button>
                {showDone && (
                  <ul className="divide-y divide-border">
                    {finished.map((g) => (
                      <GoalRow key={g.id} g={g} onEdit={() => setEditing(g)} onDelete={() => setDeleting(g)} onStatus={(s) => status.mutate({ g, s })} />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        )}
      </CardBody>
      {editing && <GoalDialog goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this goal?"
        description="It is removed from your history and analytics. To keep the record, drop it instead."
        confirmLabel="Delete goal"
        danger
        loading={del.isPending}
        onConfirm={() => {
          if (deleting) del.mutate(deleting);
        }}
      />
    </Card>
  );
}

function Heatmap({ s }: { s: Summary }) {
  const cells = s.heatmap;
  const lead = cells.length ? new Date(`${cells[0].date}T12:00:00Z`).getUTCDay() : 0;
  const level = (c: Summary['heatmap'][number]) => {
    const v = c.xp + c.minutes / 2;
    if (!c.active) return c.rest ? 'rest' : 'none';
    if (v < 20) return 'l1';
    if (v < 50) return 'l2';
    if (v < 100) return 'l3';
    return 'l4';
  };
  const cls: Record<string, string> = {
    none: 'bg-surface-3',
    rest: 'bg-surface-2 border border-dashed border-border-strong',
    l1: 'bg-accent/25',
    l2: 'bg-accent/50',
    l3: 'bg-accent/75',
    l4: 'bg-accent',
  };
  const activeDays = cells.filter((c) => c.active).length;
  return (
    <Card>
      <CardHeader title="Study calendar" description={`${activeDays} active days in the last 16 weeks. Rest days are shown with a dashed outline and never count against you.`} />
      <CardBody>
        <div className="overflow-x-auto pb-1">
          <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label={`Study activity heatmap: ${activeDays} active days in the last 16 weeks`}>
            {Array.from({ length: lead }).map((_, i) => (
              <span key={`pad-${i}`} className="h-3 w-3" />
            ))}
            {cells.map((c) => {
              const lv = level(c);
              const label = `${new Date(`${c.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}: ${c.active ? `${c.xp} XP, ${c.minutes} min` : c.rest ? 'rest day' : 'no activity'}`;
              return <span key={c.date} title={label} className={clsx('h-3 w-3 rounded-[3px]', cls[lv])} />;
            })}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-subtle">
          <span className="flex items-center gap-1">
            Less <span className="h-2.5 w-2.5 rounded-[2px] bg-surface-3" />
            <span className="h-2.5 w-2.5 rounded-[2px] bg-accent/25" />
            <span className="h-2.5 w-2.5 rounded-[2px] bg-accent/50" />
            <span className="h-2.5 w-2.5 rounded-[2px] bg-accent/75" />
            <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" /> More
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[2px] border border-dashed border-border-strong bg-surface-2" /> Rest day
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

function RoutineCard({ s }: { s: Summary }) {
  const prefs = usePreferences();
  const rest = s.preferences.restDays;
  const toggleDay = (d: number) => {
    const next = rest.includes(d) ? rest.filter((x) => x !== d) : [...rest, d];
    if (next.length > 3) return toast.error('Choose up to 3 rest days a week.');
    prefs.mutate({ restDays: next.sort() });
  };
  return (
    <Card>
      <CardHeader title="Your routine" description="You are in control. Nothing here is required." />
      <CardBody className="space-y-4">
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Rest days</div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Rest days">
            {WEEKDAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={rest.includes(i)}
                disabled={prefs.isPending}
                onClick={() => toggleDay(i)}
                className={clsx('h-8 rounded-md border px-2.5 text-[12.5px]', rest.includes(i) ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted hover:bg-surface-2')}
              >
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[12px] text-subtle">Rest days never break your streak and you will not get reminders on them. Up to 3 a week.</p>
        </div>
        <Switch
          checked={s.preferences.studyReminders}
          disabled={prefs.isPending}
          onCheckedChange={(v) => prefs.mutate({ studyReminders: v })}
          label="Gentle study reminders"
          description="At most one in-app nudge in the evening, only on days you have not studied yet, never on rest days."
        />
      </CardBody>
    </Card>
  );
}

function Achievements() {
  const q = useQuery({ queryKey: ['achievements'], queryFn: () => api.get<{ items: Achievement[]; newlyEarned: string[] }>('/motivation/achievements') });
  if (q.isLoading) return <Skeleton className="h-40" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data!.items;
  const earned = items.filter((a) => a.earned).length;
  return (
    <Card>
      <CardHeader title="Achievements" description={`${earned} of ${items.length} earned. Each one comes from real, completed work.`} />
      {/* One panel split by hairlines (no boxes inside the card); filler cells keep the last row closed. */}
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-b-lg border-t border-border bg-border lg:grid-cols-5">
        {items.map((a) => (
          <li key={a.key} className={clsx('px-5 py-4', a.earned ? 'bg-surface' : 'bg-surface-2/60')}>
            <div className="flex items-center gap-2">
              {a.earned ? <MedalIcon size={18} weight="duotone" className="shrink-0 text-xp" aria-hidden /> : <LockSimpleIcon size={16} className="shrink-0 text-subtle" aria-hidden />}
              <span className={clsx('text-[13px] font-medium leading-snug', !a.earned && 'text-muted')}>{a.title}</span>
              {!a.earned && <span className="sr-only">(locked)</span>}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{a.description}</p>
            {a.earned && a.awardedAt && <p className="mt-1 text-[11.5px] text-subtle">Earned {formatDate(a.awardedAt)}</p>}
          </li>
        ))}
        {items.length % 2 === 1 && <li aria-hidden className="bg-surface lg:hidden" />}
        {Array.from({ length: (5 - (items.length % 5)) % 5 }).map((_, i) => (
          <li key={`fill-${i}`} aria-hidden className="hidden bg-surface lg:block" />
        ))}
      </ul>
    </Card>
  );
}

export default function OverviewTab() {
  const s = useQuery({ queryKey: ['motivation-summary'], queryFn: () => api.get<Summary>('/motivation/summary') });
  const [celebration, setCelebration] = useState<{ title: string; body?: string } | null>(null);
  const d = s.data;
  const levelPct = useMemo(() => (d ? ((d.xp - d.level.currentLevelAt) / (d.level.nextLevelAt - d.level.currentLevelAt)) * 100 : 0), [d]);
  return (
    <div className="space-y-8">
      {celebration && (
        <Celebration title={celebration.title} onDismiss={() => setCelebration(null)}>
          {celebration.body}
        </Celebration>
      )}
      {s.error ? (
        <ErrorState error={s.error} onRetry={() => s.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {!d ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[118px] rounded-lg" />)
          ) : (
            <>
              <StatTile label="Study streak" value={`${d.streak.current} ${d.streak.current === 1 ? 'day' : 'days'}`} hint={d.streak.activeToday ? 'Done for today' : 'Today still counts if you study'} icon={<FireIcon size={16} />} tone="xp" />
              <StatTile label="This week" value={`${d.weekXp} XP`} hint="Since Monday" icon={<LightningIcon size={16} />} tone="xp" />
              <StatTile
                label="Level"
                value={d.level.level}
                icon={
                  <Tooltip content={d.level.explanation}>
                    <button type="button" className="flex h-full w-full items-center justify-center rounded-md hover:text-fg" aria-label="How levels work">
                      <InfoIcon size={16} />
                    </button>
                  </Tooltip>
                }
                hint={
                  <>
                    <Progress value={levelPct} tone="xp" className="mb-1.5 mt-0.5" label="Progress to next level" />
                    {d.xp} XP · {d.level.toNext} to level {d.level.level + 1}
                  </>
                }
              />
              <StatTile
                label="Personal records"
                value={`${d.records.longestStreak} days`}
                hint={`Longest streak${d.records.bestWeek ? ` · best week ${d.records.bestWeek.xp} XP` : ''}${d.records.mostProblemsInDay ? ` · ${d.records.mostProblemsInDay.count} problems in a day` : ''}`}
                icon={<TrophyIcon size={16} />}
              />
            </>
          )}
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <GoalsCard onCelebrate={(title, body) => setCelebration({ title, body })} />
        </div>
        <aside className="space-y-5">
          {d && <Heatmap s={d} />}
          {d && <RoutineCard s={d} />}
          {d && (
            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-1.5">
                    <LightningIcon size={16} className="text-xp" aria-hidden /> How XP works
                  </span>
                }
              />
              <CardBody className="text-[13px] leading-relaxed text-muted">{d.xpPolicy}</CardBody>
            </Card>
          )}
        </aside>
      </div>
      <Achievements />
    </div>
  );
}
