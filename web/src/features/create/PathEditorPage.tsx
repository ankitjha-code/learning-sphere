import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  PencilSimpleIcon,
  TrashIcon,
  PlusIcon,
  RocketLaunchIcon,
  ArrowCounterClockwiseIcon,
  FlagIcon,
  ClockIcon,
  ListChecksIcon,
  PathIcon,
  UsersIcon,
  CheckCircleIcon,
  FloppyDiskIcon,
  ArrowSquareOutIcon,
} from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { formatDate, pct } from '@/lib/format';
import {
  PageHeader,
  Badge,
  StatusBadge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  CardBody,
  Tabs,
  Field,
  Input,
  Textarea,
  Select,
  Segmented,
  TagsInput,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonRows,
  StatTile,
  Banner,
  Progress,
} from '@/components/ui';
import { Breadcrumb, DIFFICULTIES, cap, type Path, type Topic } from './shared';
import { TopicEditorDialog } from './TopicEditorDialog';

type PathResponse = { path: Path; topics: Topic[] };
type PathAnalytics = {
  enrollments: { total: number; active: number; completed: number };
  topics: { id: string; title: string; sortOrder: number; started: number; completed: number; avgMastery: number }[];
};

export default function PathEditorPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const key = ['create', 'path', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<PathResponse>(`/create/paths/${id}`) });
  const [tab, setTab] = useState('topics');
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['create', 'paths'] });
    qc.invalidateQueries({ queryKey: ['create', 'overview'] });
  };

  const publish = useMutation({
    mutationFn: (kind: 'publish' | 'unpublish') => api.post<{ path: Path }>(`/create/paths/${id}/${kind}`),
    onSuccess: (r, kind) => {
      toast.success(kind === 'publish' ? `Published version ${r.path.version}` : 'Unpublished. Learners can no longer start this path.');
      setConfirmUnpublish(false);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-9 w-full" />
        <SkeletonRows rows={6} />
      </div>
    );

  const { path, topics } = q.data;
  const published = path.status === 'published';

  return (
    <div>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Creator studio', to: '/app/create' }, { label: 'Learning paths', to: '/app/create/paths' }, { label: path.title }]} />}
        title={path.title}
        badge={
          <>
            <StatusBadge status={path.status} />
            <Badge>v{path.version}</Badge>
            {path.contentStatus === 'outline' && <Badge tone="warning">Outline</Badge>}
          </>
        }
        description={path.summary}
        actions={
          <>
            {published && (
              <ButtonLink to={`/app/learn/${path.slug}`} icon={<ArrowSquareOutIcon size={16} />}>
                View as learner
              </ButtonLink>
            )}
            {published ? (
              <Button icon={<ArrowCounterClockwiseIcon size={16} />} onClick={() => setConfirmUnpublish(true)}>
                Unpublish
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={<RocketLaunchIcon size={16} />}
                loading={publish.isPending && publish.variables === 'publish'}
                disabled={topics.length === 0}
                disabledReason="Add at least one topic before publishing"
                onClick={() => publish.mutate('publish')}
              >
                Publish
              </Button>
            )}
          </>
        }
      />

      {published && (
        <Banner tone="info" className="mb-4">
          This path is live{path.lastReviewedAt ? ` since ${formatDate(path.lastReviewedAt)}` : ''}. Topic edits show to learners right away; publishing again after unpublishing creates a new version.
        </Banner>
      )}

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="mb-4"
        tabs={[
          { value: 'topics', label: 'Topics', count: topics.length },
          { value: 'details', label: 'Details' },
          { value: 'analytics', label: 'Analytics' },
        ]}
      />

      {tab === 'topics' && <TopicsSection path={path} topics={topics} onChanged={invalidate} />}
      {tab === 'details' && <DetailsForm key={path.updatedAt} path={path} onSaved={invalidate} />}
      {tab === 'analytics' && <AnalyticsSection pathId={path.id} />}

      <ConfirmDialog
        open={confirmUnpublish}
        onOpenChange={setConfirmUnpublish}
        title="Unpublish this path?"
        description="It returns to draft. Learners who are enrolled keep their progress, but new learners cannot start it until you publish again."
        confirmLabel="Unpublish"
        loading={publish.isPending && publish.variables === 'unpublish'}
        onConfirm={() => publish.mutate('unpublish')}
      />
    </div>
  );
}

// ---------- Topics ----------

function TopicsSection({ path, topics, onChanged }: { path: Path; topics: Topic[]; onChanged: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Topic | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Topic | null>(null);

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.post(`/create/paths/${path.id}/reorder`, { topicIds: ids }),
    onMutate: async (ids) => {
      const key = ['create', 'path', path.id];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PathResponse>(key);
      if (prev) {
        const byId = new Map(prev.topics.map((t) => [t.id, t]));
        qc.setQueryData<PathResponse>(key, { ...prev, topics: ids.map((tid, i) => ({ ...byId.get(tid)!, sortOrder: i + 1 })) });
      }
      return { prev };
    },
    onSuccess: () => toast.success('Order saved'),
    onError: (e, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(['create', 'path', path.id], ctx.prev);
      toast.error(errorMessage(e));
    },
    onSettled: onChanged,
  });

  const del = useMutation({
    mutationFn: (t: Topic) => api.del(`/create/paths/${path.id}/topics/${t.id}`),
    onSuccess: () => {
      toast.success('Topic deleted');
      setDeleting(null);
      onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const move = (index: number, dir: -1 | 1) => {
    const ids = topics.map((t) => t.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorder.mutate(ids);
  };

  const totalMinutes = topics.reduce((n, t) => n + t.estimatedMinutes, 0);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13.5px] text-muted">
          {topics.length} {topics.length === 1 ? 'topic' : 'topics'} · about {Math.round(totalMinutes / 6) / 10} hours of study
        </p>
        <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setEditing('new')}>
          Add topic
        </Button>
      </div>

      {topics.length === 0 ? (
        <EmptyState
          icon={<PathIcon size={22} />}
          title="No topics yet"
          description="Topics are the steps learners follow in order. Add the first one to start building the path."
          action={
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setEditing('new')}>
              Add the first topic
            </Button>
          }
        />
      ) : (
        <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
          {topics.map((t, i) => {
            const newModule = i === 0 || topics[i - 1].module !== t.module;
            return (
              <li key={t.id}>
                {newModule && <div className="border-b border-border bg-surface-2 px-5 py-2 text-[12px] font-semibold uppercase tracking-wide text-subtle">{t.module}</div>}
                <div className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-2/50 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12.5px] font-semibold tabular-nums text-muted">{i + 1}</span>
                    <div className="min-w-0">
                      <button type="button" onClick={() => setEditing(t)} className="text-left font-medium hover:underline">
                        {t.title}
                      </button>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
                        <span className="inline-flex items-center gap-1">
                          <ClockIcon size={12} aria-hidden /> {t.estimatedMinutes} min
                        </span>
                        {t.isMilestone && (
                          <Badge tone="accent" icon={<FlagIcon size={11} weight="fill" />}>
                            Milestone
                          </Badge>
                        )}
                        {t.skill && <span>Skill: {t.skill.name}</span>}
                        <span>{t.resources.length} resources</span>
                        <span>{t.practice.length} practice</span>
                        <span className="inline-flex items-center gap-1">
                          <ListChecksIcon size={12} aria-hidden /> {t.quiz.length ? `${t.quiz.length} quiz questions` : 'No quiz'}
                        </span>
                        {!t.body.trim() && <span className="text-warning">No notes yet</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                    <Button variant="ghost" size="icon-sm" aria-label={`Move ${t.title} up`} disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}>
                      <ArrowUpIcon size={16} />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Move ${t.title} down`} disabled={i === topics.length - 1 || reorder.isPending} onClick={() => move(i, 1)}>
                      <ArrowDownIcon size={16} />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.title}`} onClick={() => setEditing(t)}>
                      <PencilSimpleIcon size={16} />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.title}`} onClick={() => setDeleting(t)}>
                      <TrashIcon size={16} />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {editing && <TopicEditorDialog key={editing === 'new' ? 'new' : editing.id} pathId={path.id} topic={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={onChanged} />}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this topic?"
        description={deleting ? `"${deleting.title}" and its notes, resources, practice items and quiz selection are deleted. Learner progress on it is removed too. This cannot be undone.` : ''}
        confirmLabel="Delete topic"
        danger
        loading={del.isPending}
        onConfirm={() => {
          if (deleting) del.mutate(deleting);
        }}
      />
    </div>
  );
}

// ---------- Details ----------

function DetailsForm({ path, onSaved }: { path: Path; onSaved: () => void }) {
  const [title, setTitle] = useState(path.title);
  const [summary, setSummary] = useState(path.summary);
  const [description, setDescription] = useState(path.description ?? '');
  const [category, setCategory] = useState(path.category);
  const [level, setLevel] = useState(path.level);
  const [hours, setHours] = useState(path.estimatedHours ? String(path.estimatedHours) : '');
  const [roles, setRoles] = useState<string[]>(path.roles);
  const [contentStatus, setContentStatus] = useState<'complete' | 'outline'>(path.contentStatus === 'outline' ? 'outline' : 'complete');

  const m = useMutation({
    mutationFn: () =>
      api.patch<{ path: Path }>(`/create/paths/${path.id}`, {
        title,
        summary,
        description: description.trim() || null,
        category,
        level,
        estimatedHours: hours ? Number(hours) : null,
        roles,
        contentStatus,
      }),
    onSuccess: () => {
      toast.success('Path details saved');
      onSaved();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fields = m.error instanceof ApiError ? m.error.fields : {};

  return (
    <Card>
      <CardHeader title="Path details" description="Shown on the roadmap page learners see before they enroll." />
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          {m.error && !Object.keys(fields).length && <Banner tone="danger">{errorMessage(m.error)}</Banner>}
          <Field label="Title" required error={fields.title}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
          </Field>
          <Field label="Summary" required error={fields.summary}>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} maxLength={400} />
          </Field>
          <Field label="Description" optional helper="Markdown. Who it is for, prerequisites, what they will build." error={fields.description}>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Category" error={fields.category}>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} />
            </Field>
            <Field label="Level" error={fields.level}>
              <Select value={level} onChange={(e) => setLevel(e.target.value)}>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {cap(d)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estimated hours" optional error={fields.estimatedHours}>
              <Input type="number" min={1} max={1000} value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
          </div>
          <Field label="Target roles" optional helper="Separate with commas" error={fields.roles}>
            <TagsInput value={roles} onChange={setRoles} />
          </Field>
          <div className="space-y-1.5">
            <div className="text-[13px] font-medium">Coverage</div>
            <Segmented
              label="Coverage"
              value={contentStatus}
              onChange={setContentStatus}
              options={[
                { value: 'complete', label: 'Complete' },
                { value: 'outline', label: 'Outline' },
              ]}
            />
            <p className="text-[12.5px] text-subtle">Mark it as an outline while topics still lack notes, so learners know what to expect.</p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" icon={<FloppyDiskIcon size={16} />} loading={m.isPending}>
              Save details
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

// ---------- Analytics ----------

function AnalyticsSection({ pathId }: { pathId: string }) {
  const q = useQuery({ queryKey: ['create', 'path', pathId, 'analytics'], queryFn: () => api.get<PathAnalytics>(`/create/paths/${pathId}/analytics`) });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data)
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-lg" />
          ))}
        </div>
        <SkeletonRows rows={5} />
      </div>
    );
  const { enrollments: e, topics } = q.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Enrolled" value={e.total} icon={<UsersIcon />} />
        <StatTile label="Active" value={e.active} icon={<PathIcon />} />
        <StatTile label="Completed" value={e.completed} tone={e.completed ? 'success' : undefined} icon={<CheckCircleIcon />} />
      </div>
      {e.total === 0 ? (
        <EmptyState icon={<UsersIcon size={22} />} title="No learners yet" description="Once members enroll, you will see how far they get on each topic and their average quiz mastery." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-[12px] text-muted">
                <th className="h-10 px-4 pl-5 font-medium">Topic</th>
                <th className="h-10 px-4 text-right font-medium">Started</th>
                <th className="h-10 px-4 text-right font-medium">Completed</th>
                <th className="h-10 w-56 px-4 pr-5 font-medium">Average mastery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topics.map((t, i) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 pl-5">
                    <span className="mr-2 text-subtle tabular-nums">{i + 1}.</span>
                    {t.title}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.started}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.completed}</td>
                  <td className="px-4 py-3 pr-5">
                    {t.started ? (
                      <div className="flex items-center gap-2">
                        <Progress value={t.avgMastery * 100} label={`Average mastery for ${t.title}`} className="flex-1" />
                        <span className="w-10 text-right tabular-nums">{pct(t.avgMastery)}</span>
                      </div>
                    ) : (
                      <span className="text-subtle">Not started</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border px-5 py-3 text-[12.5px] text-subtle">Mastery comes from quiz and practice evidence only, averaged over learners who started the topic.</p>
        </Card>
      )}
    </div>
  );
}
