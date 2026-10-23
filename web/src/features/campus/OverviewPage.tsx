import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BuildingOfficeIcon, CalendarIcon, CaretRightIcon, FileArrowUpIcon, GraduationCapIcon, PlusIcon, RocketLaunchIcon, SealCheckIcon, PencilSimpleLineIcon, UserPlusIcon, WarningCircleIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { formatDate, formatDateTime, plural } from '@/lib/format';
import { Badge, ButtonLink, Card, CardAction, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, Progress, Section, Skeleton, StatTile } from '@/components/ui';
import { CAMPUS_KEY, DefinitionTip, DRIVE_STATUS_LABEL, FunnelBars } from './shared';
import type { Funnel } from './types';

export type Readiness = {
  skills: { slug: string; name: string; drives: number }[];
  programs: {
    programId: string | null;
    programName: string;
    students: number;
    skills: {
      slug: string;
      name: string;
      verified: number;
      demonstrated: number;
      selfReportedOnly: number;
      readyShare: number | null;
    }[];
  }[];
  definition: string;
  note: string | null;
};

type Overview = {
  drives: {
    id: string;
    title: string;
    companyName: string;
    status: string;
    registrationDeadline: string | null;
    funnel: Funnel;
  }[];
  counts: {
    records: number;
    unverified: number;
    withGaps: number;
    studentsWithoutRecord: number;
    openCorrections: number;
    activeDrives: number;
  };
  upcomingInterviews: {
    id: string;
    title: string;
    scheduledAt: string;
    durationMinutes: number;
    meetingUrl: string | null;
    candidateName: string;
    driveId: string;
    driveTitle: string;
  }[];
  readiness: Readiness;
};

export function ReadinessTable({ r }: { r: Readiness }) {
  if (!r.skills.length) return <p className="text-[13.5px] text-muted">{r.note}</p>;
  return (
    <div className="space-y-5">
      {r.programs.map((p) => (
        <div key={p.programId ?? 'none'}>
          <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 text-[13.5px] font-medium">
            {p.programName} <span className="text-[12.5px] font-normal text-subtle">{p.students} students</span>
          </div>
          <ul className="space-y-2.5">
            {p.skills.map((s) => (
              <li key={s.slug} className="grid grid-cols-[minmax(0,96px)_minmax(0,1fr)_auto] items-center gap-3 text-[13px] sm:grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto]">
                <span className="truncate text-muted">{s.name}</span>
                <Progress value={s.readyShare ?? 0} tone="success" label={`${s.name} readiness`} />
                <span className="text-right tabular-nums">
                  <span className="font-medium">{s.readyShare === null ? 'n/a' : `${s.readyShare}%`}</span>
                  <span className="ml-1.5 hidden text-[12px] text-subtle sm:inline">
                    ({s.verified} verified, {s.demonstrated} demonstrated)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {r.note && <p className="text-[12px] text-subtle">{r.note}</p>}
    </div>
  );
}

export default function OverviewPage() {
  const q = useQuery({
    queryKey: [...CAMPUS_KEY, 'overview'],
    queryFn: () => api.get<Overview>('/campus/overview'),
  });
  const d = q.data;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        hero
        title="Campus overview"
        description="Active placement drives, records that need attention and what is coming up this fortnight."
        actions={
          <>
            <ButtonLink to="/app/campus/students" icon={<GraduationCapIcon size={15} />}>
              Student records
            </ButtonLink>
            <ButtonLink to="/app/campus/drives/new" variant="primary" icon={<PlusIcon size={15} />}>
              New drive
            </ButtonLink>
          </>
        }
      >
        {q.error ? null : !d ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[118px] rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Link to="/app/campus/drives" className="block h-full rounded-lg focus-visible:outline-2">
              <StatTile
                label="Active drives"
                value={d.counts.activeDrives}
                hint={d.upcomingInterviews.length ? `${plural(d.upcomingInterviews.length, 'interview')} in the next 14 days` : 'No interviews in the next 14 days'}
                icon={<RocketLaunchIcon size={16} />}
                tone="accent"
              />
            </Link>
            <Link to="/app/campus/students?verified=no" className="block h-full rounded-lg focus-visible:outline-2">
              <StatTile label="Records to verify" value={d.counts.unverified} hint={`of ${d.counts.records} records`} icon={<SealCheckIcon size={16} />} tone={d.counts.unverified ? 'warning' : 'success'} />
            </Link>
            <Link to="/app/campus/students?gaps=yes" className="block h-full rounded-lg focus-visible:outline-2">
              <StatTile
                label="Records with data gaps"
                value={d.counts.withGaps}
                hint={d.counts.studentsWithoutRecord ? `${d.counts.studentsWithoutRecord} students have no record` : 'Missing program, year, CGPA or backlogs'}
                icon={<WarningCircleIcon size={16} />}
                tone={d.counts.withGaps || d.counts.studentsWithoutRecord ? 'warning' : 'success'}
              />
            </Link>
            <Link to="/app/campus/students?tab=corrections" className="block h-full rounded-lg focus-visible:outline-2">
              <StatTile
                label="Open correction requests"
                value={d.counts.openCorrections}
                hint={d.counts.openCorrections ? 'Students waiting for a review' : 'Nothing waiting'}
                icon={<PencilSimpleLineIcon size={16} />}
                tone={d.counts.openCorrections ? 'warning' : 'success'}
              />
            </Link>
          </div>
        )}
      </PageHeader>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading || !d ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-8">
              <Section title="Active drives" description="Funnel counts per drive. Bars are scaled to the number invited." action={<CardAction to="/app/campus/drives">All drives</CardAction>}>
                {!d.drives.length ? (
                  <EmptyState
                    icon={<RocketLaunchIcon size={22} />}
                    title="No open drives"
                    description="Create a drive, define who is eligible and invite students when you open it."
                    action={
                      <ButtonLink to="/app/campus/drives/new" variant="primary">
                        Create a drive
                      </ButtonLink>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                    {d.drives.map((dr) => (
                      <li key={dr.id} className="group relative grid gap-x-8 gap-y-4 px-5 py-4 transition-colors hover:bg-surface-2 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)] md:items-center">
                        <div className="flex min-w-0 items-start gap-4">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                            <RocketLaunchIcon size={18} weight="duotone" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                              <Link to={`/app/campus/drives/${dr.id}`} className="text-[14.5px] font-semibold tracking-[-0.005em] after:absolute after:inset-0 hover:text-accent-text">
                                {dr.title}
                              </Link>
                              <Badge tone="info">{DRIVE_STATUS_LABEL[dr.status]}</Badge>
                            </div>
                            <div className="mt-1 text-[12.5px] text-muted">{dr.companyName}</div>
                            <div className="mt-0.5 text-[12.5px] text-subtle">{dr.registrationDeadline ? `Registration closes ${formatDate(dr.registrationDeadline)}` : 'No registration deadline'}</div>
                          </div>
                        </div>
                        <FunnelBars funnel={dr.funnel} compact />
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Card>
                <CardHeader
                  title={
                    <span className="inline-flex items-center gap-1.5">
                      Readiness snapshot <DefinitionTip>{d.readiness.definition}</DefinitionTip>
                    </span>
                  }
                  description="Share of students with verified or demonstrated Skill DNA evidence for the skills your drives require most."
                  action={<CardAction to="/app/campus/reports">Full reports</CardAction>}
                />
                <CardBody>
                  <ReadinessTable r={d.readiness} />
                </CardBody>
              </Card>
            </div>

            <aside className="space-y-5">
              <Card>
                <CardHeader title="Upcoming interviews" description="Next 14 days, campus-run interviews." />
                {!d.upcomingInterviews.length ? (
                  <CardBody>
                    <p className="rounded-md bg-surface-2 px-4 py-5 text-center text-[13px] text-muted">No interviews scheduled. Schedule them from a drive's Interviews tab.</p>
                  </CardBody>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {d.upcomingInterviews.map((iv) => {
                      const at = new Date(iv.scheduledAt);
                      return (
                        <li key={iv.id} className="flex items-start gap-3.5 px-5 py-4">
                          <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-accent-soft text-accent-text" aria-hidden>
                            <span className="text-[10.5px] font-semibold uppercase leading-none tracking-wide">
                              {at.toLocaleDateString(undefined, {
                                month: 'short',
                              })}
                            </span>
                            <span className="mt-0.5 font-display text-[16px] font-semibold leading-none tabular-nums">{at.getDate()}</span>
                          </span>
                          <div className="min-w-0 flex-1 text-[13px]">
                            <div className="truncate font-semibold">{iv.candidateName}</div>
                            <Link to={`/app/campus/drives/${iv.driveId}?tab=interviews`} className="block truncate text-muted hover:text-accent-text hover:underline">
                              {iv.driveTitle}
                            </Link>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-subtle">
                              <span className="inline-flex items-center gap-1">
                                <CalendarIcon size={13} aria-hidden />
                                {formatDateTime(iv.scheduledAt)}
                              </span>
                              {iv.meetingUrl && (
                                <a href={iv.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
                                  <VideoCameraIcon size={13} aria-hidden /> Meeting link
                                </a>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader title="Shortcuts" />
                <ul className="divide-y divide-border border-t border-border">
                  {(
                    [
                      ['/app/campus/students?tab=import', 'Import student records', FileArrowUpIcon],
                      ['/app/campus/students?tab=corrections', 'Review correction requests', PencilSimpleLineIcon],
                      ['/app/campus/people', 'Invite students and staff', UserPlusIcon],
                      ['/app/campus/employers', 'Manage employers', BuildingOfficeIcon],
                    ] as const
                  ).map(([to, label, Icon]) => (
                    <li key={to}>
                      <Link to={to} className="group flex items-center gap-3 px-5 py-3 text-[13.5px] font-medium transition-colors hover:bg-surface-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-subtle ring-1 ring-inset ring-border group-hover:text-accent-text">
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        <CaretRightIcon size={14} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
