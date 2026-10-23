import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { CompassIcon, GlobeIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { useMe } from '@/lib/session';
import { PageHeader, ButtonLink, ErrorState, SkeletonRows, EmptyState, Input, Select, Pagination, Banner } from '@/components/ui';
import { ExternalJobRow, FeedStatusList, type ExternalJob, type FeedSource } from './shared';

type FeedResponse = { items: ExternalJob[]; total: number; page: number; pageSize: number; sources: FeedSource[]; notice: string; backgroundSync?: boolean };

/**
 * Public job feed at /jobs/feed. Works without an account (Remotive's terms forbid
 * putting its listings behind signup). External listings only, each credited and linked to its source.
 */
export default function PublicFeedPage() {
  const me = useMe();
  const [f, setF] = useState({ q: '', source: '', page: 1 });
  const q = useQuery({ queryKey: ['public-feed', f], queryFn: () => api.get<FeedResponse>(`/jobs/feed/public${qs({ ...f, pageSize: 20 })}`), placeholderData: keepPreviousData });
  const signedIn = !!me.data?.user;
  const sources = q.data?.sources ?? [];
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[14px] font-semibold" aria-label="LearnSphere Nexus home">
            <CompassIcon size={20} weight="duotone" className="text-accent-text" aria-hidden />
            <span className="hidden min-[400px]:inline" aria-hidden>LearnSphere Nexus</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Account">
            {signedIn ? (
              <ButtonLink to="/app/jobs?tab=remote" size="sm" variant="primary">
                Open the full job board
              </ButtonLink>
            ) : (
              <>
                <ButtonLink to="/login?next=/app/jobs" size="sm" variant="ghost">
                  Sign in
                </ButtonLink>
                <ButtonLink to="/register" size="sm" variant="primary">
                  Create a free account
                </ButtonLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <PageHeader
          title="Remote software jobs"
          description={
            <>
              Listings from public job APIs ({sources.map((s) => s.label).join(', ') || 'Jobicy, Himalayas, Remotive'}). Every listing links to its original posting; apply on the source site. No account is needed to browse.
              {!signedIn && <span className="mt-1 block text-[13px] text-subtle">An account is optional. It adds a skill-gap analysis and an application tracker.</span>}
            </>
          }
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input aria-label="Search jobs" className="w-full sm:w-72" placeholder="Search title, company or tag" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} />
          <Select aria-label="Source" className="w-full sm:w-44" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value, page: 1 })}>
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s.source} value={s.source}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        {sources.length > 0 && (
          <div className="mt-3">
            <FeedStatusList sources={sources} syncOff={q.data?.backgroundSync === false} />
          </div>
        )}
        {sources.length > 0 && sources.every((s) => !s.enabled) && (
          <Banner tone="warning" className="mt-4" title="Job feeds are turned off">
            This server has disabled external job feeds.
          </Banner>
        )}
        <div className="mt-6">
          {q.isLoading ? (
            <SkeletonRows rows={5} />
          ) : q.error ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : !q.data?.items.length ? (
            <EmptyState icon={<GlobeIcon size={22} />} title={f.q || f.source ? 'No jobs match' : 'No jobs cached yet'} description={f.q || f.source ? 'Try a different search or source.' : 'Listings appear after the next scheduled sync. Check the source status above.'} />
          ) : (
            <>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
                {q.data.items.map((j) => (
                  <ExternalJobRow key={j.id} job={j} />
                ))}
              </ul>
              <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(page) => setF({ ...f, page })} />
            </>
          )}
        </div>
      </main>
      <footer className="border-t border-border px-4 py-6 text-center text-[12px] text-subtle">{q.data?.notice ?? 'Listings come from public job APIs and link to the original postings.'}</footer>
    </div>
  );
}
