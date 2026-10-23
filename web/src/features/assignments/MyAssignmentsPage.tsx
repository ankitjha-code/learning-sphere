import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardTextIcon, CalendarIcon, MegaphoneIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { dueLabel, formatDate, formatDateTime, timeAgo } from '@/lib/format';
import { Badge, Card, CardBody, CardHeader, EmptyState, ErrorState, Markdown, PageHeader, SkeletonRows, Tabs } from '@/components/ui';
import { WorkStatusBadge, type LatePolicy, type WorkStatus } from '../teach/shared';
import { PeerTodoCard } from './PeerSection';

type Item = {
  id: string;
  title: string;
  cohort: { id: string; name: string } | null;
  course: { id: string; code: string; title: string } | null;
  dueAt: string;
  availableFrom: string | null;
  maxPoints: number;
  collaboration: string;
  latePolicy: LatePolicy;
  latePolicyText: string;
  assignmentStatus: 'published' | 'closed';
  status: WorkStatus;
  hasDraft: boolean;
  submittedAt: string | null;
  isLate: boolean;
  overdue: boolean;
  finalScore: number | null;
  window: { open: boolean; reason: string | null; cutoffAt: string | null };
};
type Data = { items: Item[]; upcoming: Item[]; announcements: { id: string; title: string; body: string; createdAt: string; courseCode: string | null; authorName: string }[]; cohorts: { id: string; name: string }[] };

function bucket(i: Item): 'upcoming' | 'overdue' | 'submitted' | 'graded' {
  if (i.status === 'graded' || i.status === 'returned') return 'graded';
  if (i.status === 'submitted' || i.status === 'late') return 'submitted';
  return i.overdue ? 'overdue' : 'upcoming';
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

function dayLabel(key: string) {
  const d = new Date(key);
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.round((d.getTime() - t0) / 86400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return formatDate(d, { weekday: 'long', month: 'short', day: 'numeric' });
}

function Row({ i }: { i: Item }) {
  const due = dueLabel(i.dueAt);
  const notOpen = i.availableFrom && new Date(i.availableFrom).getTime() > Date.now();
  return (
    <li className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-surface-2">
      <div className="min-w-0 flex-1">
        <Link to={`/app/assignments/${i.id}`} className="text-[14.5px] font-semibold tracking-[-0.005em] after:absolute after:inset-0 hover:text-accent-text">
          {i.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12.5px] text-subtle">
          <span>{[i.course?.code, i.cohort?.name].filter(Boolean).join(' · ')}</span>
          {i.collaboration === 'team' && (
            <span className="inline-flex items-center gap-1">
              <UsersThreeIcon size={12} /> Team
            </span>
          )}
          <span>Due {formatDateTime(i.dueAt)}</span>
        </div>
        {bucket(i) === 'overdue' && <div className="mt-1 text-[12.5px] text-muted">{i.window.open ? `Late submissions accepted${i.window.cutoffAt ? ` until ${formatDateTime(i.window.cutoffAt)}` : ''}. ${i.latePolicyText}` : (i.window.reason ?? 'Submissions are closed.')}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {notOpen ? <Badge tone="info">Opens {formatDate(i.availableFrom)}</Badge> : null}
        <WorkStatusBadge status={i.status} />
        {i.hasDraft && i.status !== 'draft' && <Badge>Revision in progress</Badge>}
        {(bucket(i) === 'upcoming' || bucket(i) === 'overdue') && <Badge tone={due.tone === 'neutral' ? 'neutral' : due.tone}>{due.text}</Badge>}
        {i.finalScore !== null && (
          <span className="text-[13px] font-semibold tabular-nums">
            {i.finalScore} / {i.maxPoints}
          </span>
        )}
      </div>
    </li>
  );
}

export default function MyAssignmentsPage() {
  const q = useQuery({ queryKey: ['my-assignments'], queryFn: () => api.get<Data>('/teach/my/assignments') });
  const [tab, setTab] = useState<'upcoming' | 'overdue' | 'submitted' | 'graded'>('upcoming');
  const groups = useMemo(() => {
    const g = { upcoming: [] as Item[], overdue: [] as Item[], submitted: [] as Item[], graded: [] as Item[] };
    for (const i of q.data?.items ?? []) g[bucket(i)].push(i);
    g.submitted.reverse();
    g.graded.reverse();
    return g;
  }, [q.data]);
  const calendar = useMemo(() => {
    const open = [...groups.overdue, ...groups.upcoming].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    const map = new Map<string, Item[]>();
    for (const i of open) (map.get(dayKey(i.dueAt)) ?? map.set(dayKey(i.dueAt), []).get(dayKey(i.dueAt))!).push(i);
    return [...map.entries()];
  }, [groups]);
  const list = groups[tab];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Assignments" description="Work set by your instructors. Drafts save automatically; you get a receipt every time you submit." />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <SkeletonRows rows={5} />
      ) : !q.data!.cohorts.length ? (
        <EmptyState icon={<ClipboardTextIcon size={22} />} title="You're not in a class yet" description="Assignments appear here once an instructor adds you to a cohort in your organization. If you expected to see some, switch to your college in the workspace switcher." />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as typeof tab)}
              tabs={[
                { value: 'upcoming', label: 'Upcoming', count: groups.upcoming.length },
                { value: 'overdue', label: 'Overdue', count: groups.overdue.length },
                { value: 'submitted', label: 'Submitted', count: groups.submitted.length },
                { value: 'graded', label: 'Graded', count: groups.graded.length },
              ]}
              className="mb-4"
            />
            {!list.length ? (
              <EmptyState
                icon={<ClipboardTextIcon size={22} />}
                title={{ upcoming: 'Nothing coming up', overdue: 'Nothing overdue', submitted: 'Nothing waiting for a grade', graded: 'No graded work yet' }[tab]}
                description={{ upcoming: 'New assignments appear here when your instructor publishes them.', overdue: 'You are on top of your deadlines.', submitted: 'Submitted work shows here until feedback is released.', graded: 'Released feedback and scores show here.' }[tab]}
              />
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                {list.map((i) => (
                  <Row key={i.id} i={i} />
                ))}
              </ul>
            )}
          </div>
          <aside className="space-y-5">
            <PeerTodoCard />
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-1.5"><CalendarIcon size={16} /> Deadline calendar</span>} description="Everything you still need to submit, by due date." />
              <CardBody>
                {!calendar.length ? (
                  <p className="text-[13px] text-muted">No open deadlines.</p>
                ) : (
                  <ol className="space-y-4">
                    {calendar.map(([day, items]) => (
                      <li key={day}>
                        <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-subtle">{dayLabel(day)}</div>
                        <ul className="space-y-1.5">
                          {items.map((i) => (
                            <li key={i.id} className="flex items-center gap-2 text-[13px]">
                              <span className={i.overdue ? 'h-2 w-2 shrink-0 rounded-full bg-danger' : 'h-2 w-2 shrink-0 rounded-full bg-accent'} aria-hidden />
                              <Link to={`/app/assignments/${i.id}`} className="min-w-0 flex-1 truncate hover:underline">
                                {i.title}
                              </Link>
                              <span className="text-[12px] tabular-nums text-subtle">{formatDate(i.dueAt, { timeStyle: 'short' })}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                )}
              </CardBody>
            </Card>
            {q.data!.announcements.length > 0 && (
              <Card>
                <CardHeader title={<span className="inline-flex items-center gap-1.5"><MegaphoneIcon size={16} /> Announcements</span>} />
                <CardBody>
                  <ul className="divide-y divide-border">
                    {q.data!.announcements.map((a) => (
                      <li key={a.id} className="py-3 text-[13px] first:pt-0 last:pb-0">
                        <div className="font-medium">
                          {a.courseCode ? `${a.courseCode}: ` : ''}
                          {a.title}
                        </div>
                        <div className="mt-0.5 text-[12px] text-subtle">
                          {a.authorName} · {timeAgo(a.createdAt)}
                        </div>
                        <Markdown source={a.body} className="mt-1.5 text-[13px]! leading-relaxed text-muted!" />
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
