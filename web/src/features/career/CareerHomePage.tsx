import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { RocketLaunchIcon, TargetIcon, ArrowRightIcon, CalendarIcon, KanbanIcon, FileTextIcon, BriefcaseIcon, MicrophoneStageIcon, PaperPlaneTiltIcon, LightningIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { PageHeader, Card, CardHeader, CardAction, Section, ErrorState, Skeleton, EmptyState, ButtonLink, StatTile, Badge } from '@/components/ui';
import { ReadinessMeter } from './components';
import { STATUS_LABEL, type AppStatus } from './api';

type Overview = {
  readiness: { id: string; title: string; company: string | null; score: number | null; gaps: string[] }[];
  applications: { total: number; byStatus: Record<AppStatus, number>; active: number };
  upcoming: { date: string; kind: string; title: string; applicationId: string }[];
  actions: { title: string; reason: string; link: string }[];
  resumes: { total: number; primaryId: string | null };
};

const KIND_LABEL: Record<string, string> = { deadline: 'Deadline', follow_up: 'Follow-up', interview: 'Interview', offer_deadline: 'Offer decision' };
const LIST = 'divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1';

export default function CareerHomePage() {
  const q = useQuery({ queryKey: ['career', 'overview'], queryFn: () => api.get<Overview>('/career/overview') });
  const d = q.data;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        hero
        title="Career Launch Studio"
        description="Turn the skills you have proven into applications: analyze job descriptions, build honest resumes, track applications and practise interviews."
        actions={
          <>
            <ButtonLink to="/app/career/targets?new=1" icon={<TargetIcon size={16} />}>
              Analyze a job description
            </ButtonLink>
            <ButtonLink to="/app/jobs" variant="primary" icon={<BriefcaseIcon size={16} />}>
              Browse jobs
            </ButtonLink>
          </>
        }
      >
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {!d ? (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[118px] rounded-lg" />)
            ) : (
              <>
                <StatTile label="Tracked applications" value={d.applications.total} hint="Across every status" icon={<KanbanIcon weight="bold" />} tone="accent" />
                <StatTile label="Active" value={d.applications.active} hint="Applied through offer" icon={<PaperPlaneTiltIcon weight="bold" />} tone="accent" />
                <StatTile label="Interviews" value={d.applications.byStatus.interview} hint={d.applications.byStatus.interview ? 'In the interview stage' : 'None scheduled yet'} icon={<MicrophoneStageIcon weight="bold" />} tone={d.applications.byStatus.interview ? 'success' : undefined} />
                <StatTile label="Resumes" value={d.resumes.total} hint={d.resumes.primaryId ? 'Primary resume set' : 'No primary resume yet'} icon={<FileTextIcon weight="bold" />} tone={d.resumes.total ? undefined : 'warning'} />
              </>
            )}
          </div>
        )}
      </PageHeader>
      {!q.error && (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-8">
              {d && d.resumes.total === 0 && (
                <EmptyState icon={<RocketLaunchIcon size={22} />} title="Start with a resume" description="We prefill it from your profile. You add only what is true; checks help you tighten it." action={<ButtonLink to="/app/career/resumes?new=1" variant="primary">Create a resume</ButtonLink>} />
              )}

              <Section title="Readiness by job target" description="Evidence-based estimate per saved job description. Open one to see the formula and plan." action={<CardAction to="/app/career/targets">All targets</CardAction>}>
                {!d ? (
                  <Skeleton className="h-24 rounded-lg" />
                ) : d.readiness.length === 0 ? (
                  <EmptyState icon={<TargetIcon size={22} />} title="No job targets yet" description="Paste a job description you are aiming for. We compare it with your Skill DNA and show the gaps." action={<ButtonLink to="/app/career/targets?new=1" variant="primary">Add a job target</ButtonLink>} />
                ) : (
                  <ul className={LIST}>
                    {d.readiness.map((t) => (
                      <li key={t.id}>
                        <Link to={`/app/career/targets/${t.id}`} className="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-6">
                          <span className="flex min-w-0 flex-1 items-start gap-4">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                              <TargetIcon size={18} weight="duotone" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[14.5px] font-semibold tracking-[-0.005em] group-hover:text-accent-text">{t.title}</span>
                              <span className="mt-0.5 block text-[12.5px] text-muted">{t.company ?? 'No company added'}</span>
                              {t.gaps.length > 0 && <span className="mt-1 block text-[12.5px] leading-relaxed text-muted"><span className="font-medium text-fg">Gaps: </span>{t.gaps.join(', ')}</span>}
                            </span>
                          </span>
                          <span className="flex items-center gap-4 pl-[52px] sm:w-56 sm:shrink-0 sm:pl-0">
                            <ReadinessMeter score={t.score} size="md" />
                            <ArrowRightIcon size={16} className="hidden shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg sm:block" aria-hidden />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Applications by status" description="Open a status to see those applications in the tracker." action={<CardAction to="/app/career/applications">Open tracker</CardAction>}>
                {!d ? (
                  <Skeleton className="h-40 rounded-lg" />
                ) : d.applications.total === 0 ? (
                  <EmptyState icon={<KanbanIcon size={22} />} title="Nothing tracked yet" description="Track jobs you are considering or have applied to, including ones from outside the platform." action={<ButtonLink to="/app/career/applications?new=1" variant="primary">Track an application</ButtonLink>} />
                ) : (
                  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border shadow-1 sm:grid-cols-4">
                    {(Object.keys(STATUS_LABEL) as AppStatus[]).map((s) => {
                      const n = d.applications.byStatus[s];
                      return (
                        <Link key={s} to={`/app/career/applications?status=${s}`} className="group flex flex-col bg-surface px-5 py-4 transition-colors hover:bg-surface-2">
                          <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-muted">
                            {STATUS_LABEL[s]}
                            <ArrowRightIcon size={14} className="text-subtle opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
                          </span>
                          <span className={clsx('mt-1 font-display text-[24px] font-semibold leading-8 tracking-[-0.02em] tabular-nums', !n && 'text-subtle')}>{n}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Section>
            </div>

            <aside className="space-y-5">
              <Card className="overflow-hidden">
                <CardHeader title="Next actions" description="Suggestions from your own data." />
                {!d ? (
                  <div className="px-5 pb-5">
                    <Skeleton className="h-24" />
                  </div>
                ) : d.actions.length === 0 ? (
                  <p className="px-5 pb-5 text-[13.5px] text-muted">Nothing pressing. Keep practising and tracking.</p>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {d.actions.map((a, i) => (
                      <li key={i}>
                        <Link to={a.link} className="group flex items-start gap-3 px-5 py-4 transition-colors hover:bg-surface-2">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                            <LightningIcon size={15} weight="fill" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-semibold leading-5 group-hover:text-accent-text">{a.title}</span>
                            <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">{a.reason}</span>
                          </span>
                          <ArrowRightIcon size={14} className="mt-1 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="overflow-hidden">
                <CardHeader title="Next two weeks" description="Deadlines, interviews and follow-ups from your tracker." />
                {!d ? (
                  <div className="px-5 pb-5">
                    <Skeleton className="h-24" />
                  </div>
                ) : d.upcoming.length === 0 ? (
                  <div className="flex items-start gap-3 px-5 pb-5 text-[13px] text-muted">
                    <CalendarIcon size={18} className="mt-0.5 shrink-0 text-subtle" aria-hidden />
                    <p>Nothing scheduled. Add deadlines, interview rounds and follow-up reminders to applications and they appear here.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {d.upcoming.map((u, i) => (
                      <li key={i}>
                        <Link to={`/app/career/applications?open=${u.applicationId}`} className="group block px-5 py-3.5 transition-colors hover:bg-surface-2">
                          <span className="flex items-center justify-between gap-3">
                            <Badge tone={u.kind === 'interview' ? 'info' : u.kind === 'deadline' || u.kind === 'offer_deadline' ? 'warning' : 'neutral'}>{KIND_LABEL[u.kind] ?? u.kind}</Badge>
                            <span className="text-[12px] tabular-nums text-subtle">{formatDateTime(u.date)}</span>
                          </span>
                          <span className="mt-1.5 block text-[13.5px] font-medium leading-5 group-hover:text-accent-text">{u.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
