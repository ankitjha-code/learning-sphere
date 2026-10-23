import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CheckSquareOffsetIcon,
  ClipboardTextIcon,
  UsersIcon,
  WarningCircleIcon,
  CalendarCheckIcon,
  PlusIcon,
  ArrowsClockwiseIcon,
  ArrowRightIcon,
  ChalkboardTeacherIcon,
  PathIcon,
  ChatsCircleIcon,
  CalendarBlankIcon,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { dueLabel, formatDateTime } from '@/lib/format';
import { Avatar, Badge, ButtonLink, Card, CardAction, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, Section, Skeleton, StatTile } from '@/components/ui';

type Overview = {
  cohorts: { id: string; name: string; kind: string; students: number; assignments: number }[];
  backlog: { ungraded: number; ungradedLate: number; drafts: number; regradesOpen: number };
  upcoming: { id: string; title: string; dueAt: string; cohortName: string; submitted: number; students: number }[];
  atRisk: { userId: string; name: string; cohortId: string; cohortName: string; reasons: { code: string; text: string }[] }[];
  atRiskTotal: number;
  draftAssignments: number;
};

const listGroup = 'divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1';

export default function OverviewPage() {
  const q = useQuery({ queryKey: ['teach', 'overview'], queryFn: () => api.get<Overview>('/teach/overview') });
  const d = q.data;
  const hasCohorts = !!d?.cohorts.length;
  return (
    <div>
      <PageHeader
        hero
        title="Teaching overview"
        description="Your cohorts, what needs grading, upcoming deadlines and students who may need a check-in."
        actions={
          q.error ? undefined : (
            <>
              <ButtonLink to="/app/teach/attendance" icon={<CalendarCheckIcon size={16} />}>
                Take attendance
              </ButtonLink>
              <ButtonLink to="/app/teach/assignments/new" variant="primary" icon={<PlusIcon size={16} />}>
                New assignment
              </ButtonLink>
            </>
          )
        }
      >
        {q.error ? null : !d ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[118px] rounded-lg" />
            ))}
          </div>
        ) : hasCohorts ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <TileLink to="/app/teach/grading?status=ungraded">
              <StatTile label="Waiting to be graded" value={d.backlog.ungraded} hint={d.backlog.ungradedLate ? `${d.backlog.ungradedLate} submitted late` : 'Latest versions only'} icon={<CheckSquareOffsetIcon weight="bold" />} tone={d.backlog.ungraded ? 'warning' : 'success'} />
            </TileLink>
            <TileLink to="/app/teach/grading?status=draft">
              <StatTile label="Graded, not released" value={d.backlog.drafts} hint="Students cannot see these yet" icon={<ClipboardTextIcon weight="bold" />} tone="accent" />
            </TileLink>
            <TileLink to="/app/teach/grading?status=regrade">
              <StatTile label="Open regrade requests" value={d.backlog.regradesOpen} hint={d.backlog.regradesOpen ? 'Students asked for a second look' : 'None open'} icon={<ArrowsClockwiseIcon weight="bold" />} tone={d.backlog.regradesOpen ? 'warning' : 'success'} />
            </TileLink>
            <TileLink to="/app/teach/analytics">
              <StatTile label="Students to check in with" value={d.atRiskTotal} hint="Based on rules with data" icon={<WarningCircleIcon weight="bold" />} tone={d.atRiskTotal ? 'warning' : 'success'} />
            </TileLink>
          </div>
        ) : null}
      </PageHeader>

      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading || !d ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-8">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : !hasCohorts ? (
        <EmptyState
          icon={<ChalkboardTeacherIcon size={22} />}
          title="Start by creating a cohort"
          description="A cohort is a section, batch or training group. Add students to it, then create assignments and take attendance for it."
          action={
            <ButtonLink to="/app/teach/cohorts" variant="primary">
              Create a cohort
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-8">
            <Section title="Upcoming deadlines" description="Published assignments due in the next 14 days." action={<CardAction to="/app/teach/assignments">All assignments</CardAction>}>
              {!d.upcoming.length ? (
                <p className="rounded-lg border border-dashed border-border-strong/70 px-5 py-6 text-center text-[13px] text-muted">
                  Nothing due in the next two weeks.{d.draftAssignments ? ` You have ${d.draftAssignments} draft assignment${d.draftAssignments === 1 ? '' : 's'} to publish.` : ''}
                </p>
              ) : (
                <ul className={listGroup}>
                  {d.upcoming.map((a) => {
                    const due = dueLabel(a.dueAt);
                    return (
                      <li key={a.id} className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-surface-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                          <CalendarBlankIcon size={18} weight="duotone" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link to={`/app/teach/assignments/${a.id}`} className="block truncate text-[14.5px] font-semibold tracking-[-0.005em] after:absolute after:inset-0 hover:text-accent-text">
                            {a.title}
                          </Link>
                          <div className="mt-0.5 text-[12.5px] text-muted">
                            {a.cohortName} · {formatDateTime(a.dueAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 pl-13 sm:pl-0">
                          <Badge tone={due.tone === 'neutral' ? 'neutral' : due.tone}>{due.text}</Badge>
                          <span className="w-[92px] text-right text-[12.5px] tabular-nums text-muted">
                            {a.submitted}/{a.students} submitted
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            <Section title="My cohorts" action={<CardAction to="/app/teach/cohorts">Manage cohorts</CardAction>}>
              <ul className={listGroup}>
                {d.cohorts.map((c) => (
                  <li key={c.id}>
                    <Link to={`/app/teach/cohorts/${c.id}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted ring-1 ring-inset ring-border">
                        <UsersIcon size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-semibold tracking-[-0.005em]">{c.name}</span>
                        <span className="mt-0.5 block text-[12.5px] text-muted">
                          {c.students} student{c.students === 1 ? '' : 's'} · {c.assignments} assignment{c.assignments === 1 ? '' : 's'}
                        </span>
                      </span>
                      <ArrowRightIcon size={16} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <aside className="space-y-5">
            <Card>
              <CardHeader title="Check in with" action={<CardAction to="/app/teach/analytics">Open analytics</CardAction>} />
              <p className="-mt-2 px-5 pb-4 text-[13px] leading-5 text-muted">Each student shows the rule that triggered the flag.</p>
              {!d.atRisk.length ? (
                <CardBody>
                  <p className="text-[13px] leading-relaxed text-muted">No student meets an at-risk rule right now. Rules only use data that exists; missing data never flags anyone.</p>
                </CardBody>
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {d.atRisk.map((s) => (
                    <li key={`${s.cohortId}:${s.userId}`} className="flex items-start gap-3 px-5 py-3.5">
                      <Avatar name={s.name} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold">{s.name}</div>
                        <div className="text-[12px] text-subtle">{s.cohortName}</div>
                        <ul className="mt-1.5 space-y-1">
                          {s.reasons.map((r) => (
                            <li key={r.code} className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
                              <WarningCircleIcon size={14} weight="fill" className="mt-px shrink-0 text-warning" aria-hidden />
                              <span>{r.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

          </aside>

          <Section title="Shortcuts" className="lg:col-span-2">
            <ul className="grid divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1 md:grid-cols-3 md:divide-x md:divide-y-0">
              <QuickLink to="/app/teach/rubrics" icon={<ClipboardTextIcon size={18} />} title="Rubrics" text="Reusable grading criteria, versioned." />
              <QuickLink to="/app/create/paths" icon={<PathIcon size={18} />} title="Learning paths" text="Author org paths, then link them to courses." />
              <QuickLink to="/app/community" icon={<ChatsCircleIcon size={18} />} title="Discussions" text="Moderate your organization's community space." />
            </ul>
          </Section>
        </div>
      )}
    </div>
  );
}

function TileLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="block h-full rounded-lg transition-transform hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2">
      {children}
    </Link>
  );
}

function QuickLink({ to, icon, title, text }: { to: string; icon: ReactNode; title: string; text: string }) {
  return (
    <li>
      <Link to={to} className="group flex h-full items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted ring-1 ring-inset ring-border">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold">{title}</span>
          <span className="block text-[12.5px] text-muted">{text}</span>
        </span>
        <ArrowRightIcon size={14} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
      </Link>
    </li>
  );
}
