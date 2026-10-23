import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowsClockwiseIcon, CaretLeftIcon, CalendarCheckIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';
import { PageHeader, ErrorState, SkeletonRows, EmptyState, ButtonLink, Badge, Progress, Section } from '@/components/ui';

type Row = { topicId: string; title: string; slug: string; trackSlug: string; trackTitle: string; status: string; nextReviewAt: string | null; mastery: number; intervalDays: number };

export default function RevisionPage() {
  const q = useQuery({ queryKey: ['revision'], queryFn: () => api.get<{ due: Row[]; upcoming: Row[] }>('/learning/revision') });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={
          <Link to="/app/learn" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={14} /> Roadmaps
          </Link>
        }
        title="Revision queue"
        description="Spaced revision brings topics back just before you'd forget them. Scores below 60% bring a topic back tomorrow; strong scores push it further out."
      />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <SkeletonRows rows={5} />
      ) : (
        <div className="space-y-8">
          <Section title={`Due now · ${q.data!.due.length}`}>
            {!q.data!.due.length ? (
              <EmptyState icon={<CalendarCheckIcon size={22} />} title="Nothing to review" description="Complete topics and they will be scheduled here for review at the right time." action={<ButtonLink to="/app/learn" variant="primary">Go to roadmaps</ButtonLink>} />
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                {q.data!.due.map((r) => (
                  <li key={r.topicId} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:flex-nowrap">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning">
                      <ArrowsClockwiseIcon size={18} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="text-[14.5px] font-semibold tracking-[-0.005em]">{r.title}</span>
                        {r.status === 'needs_revision' && <Badge tone="warning">Below 60% last time</Badge>}
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-muted">
                        {r.trackTitle} · mastery {Math.round(r.mastery * 100)}% · {r.status === 'needs_revision' ? 'review now' : r.nextReviewAt ? `due ${timeAgo(r.nextReviewAt)}` : 'due now'}
                      </div>
                    </div>
                    <ButtonLink to={`/app/learn/${r.trackSlug}/${r.slug}?review=1`} size="sm" variant="primary">
                      Review
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {q.data!.upcoming.length > 0 && (
            <Section title="Coming up" description="Scheduled from your last quiz score on each topic.">
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                {q.data!.upcoming.map((r) => (
                  <li key={r.topicId} className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-surface-2 sm:flex-nowrap">
                    <div className="min-w-0 flex-1">
                      <Link to={`/app/learn/${r.trackSlug}/${r.slug}`} className="text-[14px] font-medium after:absolute after:inset-0 hover:text-accent-text">
                        {r.title}
                      </Link>
                      <div className="text-[12.5px] text-muted">{r.trackTitle}</div>
                    </div>
                    <div className="flex w-full items-center gap-4 sm:w-auto">
                      <div className="flex flex-1 items-center gap-2 sm:w-36 sm:flex-none">
                        <Progress value={r.mastery * 100} label={`${r.title} mastery`} />
                        <span className="w-9 text-right text-[12px] tabular-nums text-muted">{Math.round(r.mastery * 100)}%</span>
                      </div>
                      <span className="w-24 text-right text-[12.5px] tabular-nums text-muted">{r.nextReviewAt ? formatDate(r.nextReviewAt) : ''}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
