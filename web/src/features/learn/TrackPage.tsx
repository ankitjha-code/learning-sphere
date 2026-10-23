import { useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  CaretLeftIcon,
  CheckCircleIcon,
  CircleIcon,
  CircleHalfIcon,
  ArrowsClockwiseIcon,
  FlagIcon,
  ClockIcon,
  SkipForwardIcon,
  ArrowCounterClockwiseIcon,
  PlayIcon,
  ListIcon,
  GraphIcon,
  CalendarIcon,
  PauseIcon,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDate, toLocalInput } from '@/lib/format';
import {
  PageHeader,
  ErrorState,
  Skeleton,
  Button,
  Badge,
  Banner,
  Markdown,
  Card,
  CardHeader,
  CardBody,
  Progress,
  Dialog,
  Field,
  Select,
  Input,
  Segmented,
  Tooltip,
  Menu,
} from '@/components/ui';

type Topic = {
  id: string;
  slug: string;
  title: string;
  module: string;
  sortOrder: number;
  objectives: string[];
  estimatedMinutes: number;
  isMilestone: boolean;
  hasQuiz: boolean;
  hasContent: boolean;
  skill: { slug: string; name: string } | null;
  skipped: boolean;
  status: 'not_started' | 'in_progress' | 'completed' | 'needs_revision';
  mastery: number;
  reviewDue: boolean;
  nextReviewAt: string | null;
};

type TrackResponse = {
  track: { id: string; slug: string; title: string; category: string; summary: string; description: string | null; level: string; estimatedHours: number | null; contentStatus: 'complete' | 'outline'; lastReviewedAt: string | null; roles: string[] };
  enrollment: { id: string; mode: string; status: string; weeklyMinutes: number | null; targetDate: string | null; skippedTopicIds: string[] } | null;
  timeline: { remainingMinutes: number; projectedCompletion: string; milestones: { topicId: string; title: string; projectedAt: string; done: boolean }[] } | null;
  topics: Topic[];
};

const MODES = [
  { value: 'guided', label: 'Guided', hint: 'Every lesson in order with quizzes' },
  { value: 'independent', label: 'Independent', hint: 'Jump around; outline and resources' },
  { value: 'intensive', label: 'Intensive revision', hint: 'Quiz first, study only what you miss' },
  { value: 'interview', label: 'Interview prep', hint: 'Emphasis on practice problems' },
  { value: 'project_first', label: 'Project-first', hint: 'Start a project and learn topics as needed' },
];

function StatusIcon({ t }: { t: Topic }) {
  if (t.skipped) return <SkipForwardIcon size={18} className="text-subtle" aria-label="Skipped" />;
  if (t.reviewDue || t.status === 'needs_revision') return <ArrowsClockwiseIcon size={18} className="text-warning" aria-label="Revision due" />;
  if (t.status === 'completed') return <CheckCircleIcon size={18} weight="fill" className="text-success" aria-label="Completed" />;
  if (t.status === 'in_progress') return <CircleHalfIcon size={18} weight="fill" className="text-info" aria-label="In progress" />;
  return <CircleIcon size={18} className="text-subtle" aria-label="Not started" />;
}

function EnrollDialog({ open, onOpenChange, slug, current }: { open: boolean; onOpenChange: (v: boolean) => void; slug: string; current?: TrackResponse['enrollment'] }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState(current?.mode ?? 'guided');
  const [hours, setHours] = useState(String(Math.round((current?.weeklyMinutes ?? 300) / 60)));
  const [target, setTarget] = useState(current?.targetDate ? toLocalInput(current.targetDate).slice(0, 10) : '');
  const m = useMutation({
    mutationFn: () => {
      const payload = { mode, weeklyMinutes: Math.max(30, Math.round(Number(hours || 1) * 60)), targetDate: target ? new Date(target).toISOString() : null };
      return current ? api.patch(`/learning/enrollments/${current.id}`, payload) : api.post(`/learning/tracks/${slug}/enroll`, payload);
    },
    onSuccess: () => {
      toast.success(current ? 'Plan updated' : 'Enrolled. Your timeline is ready.');
      qc.invalidateQueries({ queryKey: ['track', slug] });
      qc.invalidateQueries({ queryKey: ['tracks'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['recommendations'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={current ? 'Adjust your plan' : 'Start this roadmap'}
      description="Pick how you want to learn and how much time you have. You can change this any time."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            {current ? 'Save plan' : 'Enroll'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Learning mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}: {x.hint}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Hours per week for this roadmap" helper="Used to project milestone dates.">
          <Input type="number" min={1} max={60} value={hours} onChange={(e) => setHours(e.target.value)} className="max-w-[120px]" />
        </Field>
        <Field label="Target date" optional>
          <Input type="date" value={target} onChange={(e) => setTarget(e.target.value)} className="max-w-[200px]" />
        </Field>
      </div>
    </Dialog>
  );
}

/** Splits a title into at most three lines so graph labels are never cut off mid-word. */
function wrapLabel(text: string, max: number) {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if (cur && (cur + ' ' + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) return [...lines.slice(0, 2), lines.slice(2).join(' ')];
  return lines;
}

/** Topics layered by prerequisite depth (from the skill graph), so the order of learning is visible. */
function PrereqGraph({ topics }: { topics: Topic[] }) {
  const markerId = useId();
  const graph = useQuery({ queryKey: ['skill-graph'], queryFn: () => api.get<{ nodes: { id: string; slug: string }[]; edges: { skillId: string; prereqId: string }[] }>('/learning/graph'), staleTime: 600_000 });
  const layout = useMemo(() => {
    if (!graph.data) return null;
    const slugById = new Map(graph.data.nodes.map((n) => [n.id, n.slug]));
    const prereqSlugs = new Map<string, string[]>();
    for (const e of graph.data.edges) {
      const s = slugById.get(e.skillId)!;
      (prereqSlugs.get(s) ?? prereqSlugs.set(s, []).get(s)!).push(slugById.get(e.prereqId)!);
    }
    const bySkill = new Map<string, Topic[]>();
    topics.forEach((t) => t.skill && (bySkill.get(t.skill.slug) ?? bySkill.set(t.skill.slug, []).get(t.skill.slug)!).push(t));
    const edges: [Topic, Topic][] = [];
    for (const t of topics) {
      if (!t.skill) continue;
      // prerequisite topics: earlier topics whose skill is a prerequisite, or the same skill earlier in order
      for (const p of topics) {
        if (p.sortOrder >= t.sortOrder || !p.skill) continue;
        if ((prereqSlugs.get(t.skill.slug) ?? []).includes(p.skill.slug)) edges.push([p, t]);
      }
      const sameSkillPrev = (bySkill.get(t.skill.slug) ?? []).filter((x) => x.sortOrder < t.sortOrder).pop();
      if (sameSkillPrev) edges.push([sameSkillPrev, t]);
    }
    const depth = new Map<string, number>();
    for (const t of [...topics].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const ins = edges.filter(([, to]) => to.id === t.id).map(([from]) => (depth.get(from.id) ?? 0) + 1);
      depth.set(t.id, ins.length ? Math.max(...ins) : 0);
    }
    const cols = new Map<number, Topic[]>();
    topics.forEach((t) => (cols.get(depth.get(t.id)!) ?? cols.set(depth.get(t.id)!, []).get(depth.get(t.id)!)!).push(t));
    // Depth runs top to bottom (foundations first); topics at the same depth sit side by side.
    const W = 208;
    const H = 50;
    const GX = 20;
    const GY = 30;
    const pos = new Map<string, { x: number; y: number }>();
    const rows = [...cols.entries()].sort((x, y) => x[0] - y[0]);
    const maxCols = Math.max(1, ...rows.map(([, list]) => list.length));
    const width = maxCols * (W + GX) - GX;
    rows.forEach(([, list], r) => {
      const offset = (width - (list.length * (W + GX) - GX)) / 2;
      [...list].sort((x, y) => x.sortOrder - y.sortOrder).forEach((t, i) => pos.set(t.id, { x: offset + i * (W + GX), y: r * (H + GY) }));
    });
    return { edges, pos, W, H, width, height: rows.length * (H + GY) - GY };
  }, [graph.data, topics]);

  if (graph.isLoading || !layout) return <Skeleton className="h-64 rounded-lg" />;
  return (
    <div className="rounded-lg border border-border bg-surface shadow-1">
      <div className="overflow-x-auto p-5">
      <svg width={layout.width} height={layout.height + 2} role="img" aria-label="Prerequisite graph of topics in this roadmap" className="mx-auto block overflow-visible">
        <defs>
          <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--border-strong)" />
          </marker>
        </defs>
        {layout.edges.map(([a, b]) => {
          const p = layout.pos.get(a.id)!;
          const q = layout.pos.get(b.id)!;
          const x1 = p.x + layout.W / 2;
          const y1 = p.y + layout.H;
          const x2 = q.x + layout.W / 2;
          const y2 = q.y;
          const mid = (y1 + y2) / 2;
          return <path key={a.id + b.id} d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`} fill="none" stroke="var(--border-strong)" strokeWidth={1.25} markerEnd={`url(#${markerId})`} />;
        })}
        {[...layout.pos.entries()].map(([id, p]) => {
          const t = topics.find((x) => x.id === id)!;
          const fill = t.status === 'completed' ? 'var(--success-soft)' : t.status === 'in_progress' ? 'var(--info-soft)' : 'var(--surface-2)';
          const stroke = t.isMilestone ? 'var(--accent)' : 'var(--border)';
          return (
            <g key={id}>
              <rect x={p.x} y={p.y} width={layout.W} height={layout.H} rx={8} fill={fill} stroke={stroke} strokeWidth={t.isMilestone ? 2 : 1} />
              {(() => {
                const lines = wrapLabel(t.title, 27);
                const top = p.y + layout.H / 2 - ((lines.length - 1) * 15) / 2 + 4;
                return (
                  <text fontSize={12} fill="var(--text)" fontWeight={t.isMilestone ? 600 : 500}>
                    {lines.map((l, i) => (
                      <tspan key={i} x={p.x + 12} y={top + i * 15}>
                        {l}
                      </tspan>
                    ))}
                  </text>
                );
              })()}
            </g>
          );
        })}
      </svg>
      </div>
      <p className="border-t border-border px-5 py-3 text-[12.5px] text-subtle">Foundations sit at the top; arrows point to the topics that build on them. Outlined boxes are milestones.</p>
    </div>
  );
}

export default function TrackPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [enrollOpen, setEnrollOpen] = useState(false);
  const q = useQuery({ queryKey: ['track', slug], queryFn: () => api.get<TrackResponse>(`/learning/tracks/${slug}`) });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/learning/enrollments/${q.data!.enrollment!.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['track', slug] });
      qc.invalidateQueries({ queryKey: ['recommendations'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-[480px] rounded-lg" />;
  const { track, enrollment, timeline, topics } = q.data!;
  const done = topics.filter((t) => t.status === 'completed' || t.skipped).length;
  const next = topics.find((t) => t.status !== 'completed' && !t.skipped);
  const modules = [...new Set(topics.map((t) => t.module))];

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/learn" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={14} /> Roadmaps
          </Link>
        }
        title={track.title}
        badge={
          <>
            <Badge>{track.level.charAt(0).toUpperCase() + track.level.slice(1)}</Badge>
            {track.contentStatus === 'outline' && <Badge tone="warning">Outline</Badge>}
            {enrollment?.status === 'paused' && <Badge tone="neutral">Paused</Badge>}
          </>
        }
        description={track.summary}
        actions={
          enrollment ? (
            <>
              <Menu
                items={[
                  { label: 'Adjust plan', icon: <CalendarIcon size={16} />, onSelect: () => setEnrollOpen(true) },
                  enrollment.status === 'paused'
                    ? { label: 'Resume roadmap', icon: <PlayIcon size={16} />, onSelect: () => patch.mutate({ status: 'active' }) }
                    : { label: 'Pause roadmap', icon: <PauseIcon size={16} />, onSelect: () => patch.mutate({ status: 'paused' }) },
                ]}
              />
              {next && (
                <Button variant="primary" icon={<PlayIcon size={16} weight="fill" />} onClick={() => navigate(`/app/learn/${slug}/${next.slug}`)}>
                  {done === 0 ? 'Start first topic' : 'Continue'}
                </Button>
              )}
            </>
          ) : (
            <Button variant="primary" onClick={() => setEnrollOpen(true)}>
              Start this roadmap
            </Button>
          )
        }
      />

      {track.contentStatus === 'outline' && (
        <Banner tone="warning" className="mb-8" title="Outline roadmap">
          Topics have objectives, concise notes, examples and curated free resources. Some topics include a short quiz; the others are completed with a written reflection, which counts as self-reported evidence.
        </Banner>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold tracking-[-0.01em]">
              Topics <span className="font-normal text-muted">· {done} of {topics.length} done</span>
            </h2>
            <Segmented
              label="Topic view"
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: <span className="inline-flex items-center gap-1"><ListIcon size={14} /> List</span> },
                { value: 'graph', label: <span className="inline-flex items-center gap-1"><GraphIcon size={14} /> Prerequisites</span> },
              ]}
            />
          </div>

          {view === 'graph' ? (
            <PrereqGraph topics={topics} />
          ) : (
            modules.map((mod) => (
              <section key={mod}>
                <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-subtle">{mod}</h3>
                <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                  {topics
                    .filter((t) => t.module === mod)
                    .map((t) => (
                      <li key={t.id} className="relative flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2">
                        <StatusIcon t={t} />
                        <Link to={`/app/learn/${slug}/${t.slug}`} className={clsx('group min-w-0 flex-1 after:absolute after:inset-0', t.skipped && 'text-muted')}>
                          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="text-[14px] font-medium group-hover:text-accent-text">{t.title}</span>
                            {t.isMilestone && (
                              <Badge tone="accent" icon={<FlagIcon size={11} weight="fill" />}>
                                Milestone
                              </Badge>
                            )}
                            {(t.reviewDue || t.status === 'needs_revision') && <Badge tone="warning">Review due</Badge>}
                          </span>
                          <span className="mt-0.5 flex items-center gap-3 text-[12px] text-subtle">
                            <span className="inline-flex items-center gap-1">
                              <ClockIcon size={12} /> {t.estimatedMinutes} min
                            </span>
                            {t.skill && <span>{t.skill.name}</span>}
                            {t.status === 'completed' && t.mastery > 0 && <span>Quiz {Math.round(t.mastery * 100)}%</span>}
                          </span>
                        </Link>
                        {enrollment && t.status !== 'completed' && (
                          <Tooltip content={t.skipped ? 'Add back to plan' : 'Skip: you already know this (no evidence recorded)'}>
                            <button
                              className="relative z-10 -mr-1.5 rounded-md p-1.5 text-subtle hover:bg-surface-3 hover:text-fg"
                              aria-label={t.skipped ? `Unskip ${t.title}` : `Skip ${t.title}`}
                              onClick={() => patch.mutate(t.skipped ? { unskipTopicId: t.id } : { skipTopicId: t.id })}
                            >
                              {t.skipped ? <ArrowCounterClockwiseIcon size={16} /> : <SkipForwardIcon size={16} />}
                            </button>
                          </Tooltip>
                        )}
                      </li>
                    ))}
                </ol>
              </section>
            ))
          )}

          {track.description && (
            <Card>
              <CardHeader title="About this roadmap" />
              <CardBody>
                <Markdown source={track.description} />
                {track.lastReviewedAt && <p className="mt-3 text-[12px] text-subtle">Content last reviewed {formatDate(track.lastReviewedAt)}.</p>}
              </CardBody>
            </Card>
          )}
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Progress" description={`${done} of ${topics.length} topics${track.estimatedHours ? ` · ~${track.estimatedHours} h total` : ''}`} />
            <CardBody>
              <Progress value={done} max={topics.length} label="Roadmap progress" tone={done && done === topics.length ? 'success' : 'accent'} />
            </CardBody>
            {enrollment && timeline ? (
              <div className="border-t border-border px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[12.5px] text-muted">Projected finish</div>
                    <div className="mt-0.5 font-display text-[20px] font-semibold tracking-[-0.01em]">{timeline.remainingMinutes === 0 ? 'Done' : formatDate(timeline.projectedCompletion)}</div>
                  </div>
                  <Badge>
                    {Math.round((enrollment.weeklyMinutes ?? 300) / 60)} h/week · {MODES.find((m) => m.value === enrollment.mode)?.label ?? enrollment.mode}
                  </Badge>
                </div>
                {enrollment.targetDate && (
                  <div className={clsx('mt-1 text-[12.5px]', new Date(timeline.projectedCompletion) > new Date(enrollment.targetDate) ? 'text-warning' : 'text-success')}>
                    Target {formatDate(enrollment.targetDate)}
                    {new Date(timeline.projectedCompletion) > new Date(enrollment.targetDate) ? ' · add time or skip known topics to make it' : ' · on track'}
                  </div>
                )}
                {timeline.milestones.length > 0 && (
                  <>
                    <h4 className="mt-5 text-[12px] font-semibold uppercase tracking-[0.05em] text-subtle">Milestones</h4>
                    <ol className="mt-2.5 space-y-3">
                      {timeline.milestones.map((m) => (
                        <li key={m.topicId} className="flex items-start gap-2.5 text-[13.5px]">
                          {m.done ? <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-success" /> : <FlagIcon size={16} className="mt-0.5 shrink-0 text-accent-text" />}
                          <span className="min-w-0">
                            <span className={clsx('block', m.done && 'text-muted line-through')}>{m.title}</span>
                            {!m.done && <span className="block text-[12px] text-subtle">around {formatDate(m.projectedAt)}</span>}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
                <Button size="sm" className="mt-5 w-full" icon={<CalendarIcon size={15} />} onClick={() => setEnrollOpen(true)}>
                  Adjust plan
                </Button>
              </div>
            ) : (
              <div className="border-t border-border px-5 py-4">
                <h4 className="text-[13.5px] font-semibold">Plan your pace</h4>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">Enroll to get a personal timeline, milestone dates, spaced revision and recommendations for this roadmap.</p>
                <Button variant="primary" size="sm" className="mt-4 w-full" onClick={() => setEnrollOpen(true)}>
                  Start this roadmap
                </Button>
              </div>
            )}
          </Card>
          {track.roles.length > 0 && (
            <Card>
              <CardHeader title="Useful for" description="Roles that rely on these skills" />
              <CardBody className="flex flex-wrap gap-1.5">
                {track.roles.map((r) => (
                  <Badge key={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</Badge>
                ))}
              </CardBody>
            </Card>
          )}
        </aside>
      </div>

      {enrollOpen && <EnrollDialog open={enrollOpen} onOpenChange={setEnrollOpen} slug={slug} current={enrollment} />}
    </div>
  );
}
