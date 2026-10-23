import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EyeIcon, StarIcon, CheckCircleIcon, BookmarkSimpleIcon, PlusIcon, BooksIcon, PathIcon, ClipboardTextIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PageHeader, ButtonLink, Banner, StatTile, Card, CardAction, CardHeader, CardBody, EmptyState, ErrorState, Section, Skeleton, SkeletonRows } from '@/components/ui';
import { ResourceStatus, KIND_LABEL, type Overview, type ResourceSummary } from './shared';

const STATUS_ORDER: [string, string][] = [
  ['draft', 'Drafts'],
  ['in_review', 'In review'],
  ['published', 'Published'],
  ['rejected', 'Changes requested'],
  ['archived', 'Archived'],
];

export default function CreateOverviewPage() {
  const q = useQuery({ queryKey: ['create', 'overview'], queryFn: () => api.get<Overview>('/create/overview') });

  const header = (stats?: ReactNode) => (
    <PageHeader
      hero
      title="Creator studio"
      description="Write and curate resources for the library, build learning paths for your organization, and see how learners use them."
      actions={
        <>
          <ButtonLink to="/app/create/paths" icon={<PathIcon size={16} />}>
            Learning paths
          </ButtonLink>
          <ButtonLink to="/app/create/resources/new" variant="primary" icon={<PlusIcon size={16} />}>
            New resource
          </ButtonLink>
        </>
      }
    >
      {stats}
    </PageHeader>
  );

  if (q.error)
    return (
      <div>
        {header()}
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </div>
    );
  if (q.isLoading || !q.data)
    return (
      <div>
        {header(
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[118px] rounded-lg" />
            ))}
          </div>,
        )}
        <SkeletonRows rows={6} />
      </div>
    );

  const d = q.data;
  const totalResources = Object.values(d.counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      {header(
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Views" value={d.totals.views.toLocaleString()} hint="Across all your resources" icon={<EyeIcon />} tone="accent" />
          <StatTile label="Ratings" value={d.totals.ratings.toLocaleString()} hint="From learners who read them" icon={<StarIcon />} tone="xp" />
          <StatTile label="Completions" value={d.totals.completions.toLocaleString()} hint="Self-reported by readers" icon={<CheckCircleIcon />} tone="success" />
          <StatTile label="Bookmarks" value={d.totals.bookmarks.toLocaleString()} hint="Saved for later" icon={<BookmarkSimpleIcon />} tone="accent" />
        </div>,
      )}

      <div className="mb-8 space-y-3 empty:hidden">
        {!d.canAuthorOrg && (
          <Banner tone="info" title="You are publishing to the public library">
            Without a creator, faculty or admin role in an organization, your resources are public submissions. A platform admin reviews each one before it goes live.
          </Banner>
        )}
        {d.canAuthorOrg && d.activeOrg && (
          <Banner tone="success" title={`Authoring for ${d.activeOrg.name}`}>
            Organization resources and paths publish directly to your members. Public submissions still go through platform admin review.
          </Banner>
        )}
        {d.isPlatformAdmin && (
          <Banner
            tone={d.reviewQueue ? 'warning' : 'info'}
            title={d.reviewQueue ? `${d.reviewQueue} ${d.reviewQueue === 1 ? 'submission is' : 'submissions are'} waiting for review` : 'The review queue is clear'}
            action={
              <ButtonLink to="/app/create/review" size="sm" icon={<ClipboardTextIcon size={14} />}>
                Open review queue
              </ButtonLink>
            }
          />
        )}
      </div>

      {totalResources === 0 && d.paths.total === 0 ? (
        <EmptyState
          icon={<BooksIcon size={22} />}
          title="Nothing created yet"
          description="Write an article, share a cheatsheet or curate a great external link. Drafts stay private until you publish or submit them."
          action={
            <ButtonLink to="/app/create/resources/new" variant="primary" icon={<PlusIcon size={16} />}>
              Create your first resource
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-8">
            <ResourceListSection title="Drafts and changes requested" items={d.drafts} empty="No drafts. Everything you started is published or in review." />
            <ResourceListSection title="In review" items={d.inReview} empty="Nothing is waiting for review." />
            <ResourceListSection title="Top published resources" items={d.top} empty="Publish a resource to see how it performs." showViews />
          </div>
          <aside className="min-w-0 space-y-5">
            <Card>
              <CardHeader title="Resources by status" description={`${totalResources} in total`} action={<CardAction to="/app/create/resources">View all</CardAction>} />
              <ul className="divide-y divide-border border-t border-border">
                {STATUS_ORDER.map(([s, label]) => (
                  <li key={s}>
                    <Link to={`/app/create/resources?status=${s}`} className="flex items-center justify-between gap-3 px-5 py-3 text-[13.5px] transition-colors hover:bg-surface-2">
                      <span className="text-muted">{label}</span>
                      <span className="font-medium tabular-nums">{d.counts[s] ?? 0}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Learning paths" action={<CardAction to="/app/create/paths">Manage</CardAction>} />
              <CardBody>
                {d.canAuthorOrg ? (
                  <div className="grid grid-cols-2 divide-x divide-border rounded-md border border-border bg-surface-2">
                    <div className="px-4 py-3">
                      <div className="font-display text-[24px] font-semibold leading-8 tabular-nums">{d.paths.total}</div>
                      <div className="text-[12.5px] text-muted">Total</div>
                    </div>
                    <div className="px-4 py-3">
                      <div className="font-display text-[24px] font-semibold leading-8 tabular-nums">{d.paths.published}</div>
                      <div className="text-[12.5px] text-muted">Published</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-muted">Learning paths are built for an organization. Ask an admin for a creator or faculty role to build them.</p>
                )}
              </CardBody>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}

function ResourceListSection({ title, items, empty, showViews }: { title: string; items: ResourceSummary[]; empty: string; showViews?: boolean }) {
  return (
    <Section title={title}>
      {items.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-5 py-4 text-[13.5px] text-muted shadow-1">{empty}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1">
          {items.map((r) => (
            <li key={r.id} className="group relative flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                <Link to={`/app/create/resources/${r.id}`} className="text-[14.5px] font-semibold tracking-[-0.005em] after:absolute after:inset-0 hover:text-accent-text">
                  {r.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
                  <span>{KIND_LABEL[r.kind] ?? r.kind}</span>
                  <span aria-hidden>·</span>
                  <span>{r.scope === 'org' ? 'Organization' : 'Public'}</span>
                  <span aria-hidden>·</span>
                  <span>Updated {timeAgo(r.updatedAt)}</span>
                  {showViews && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{r.analytics.views.toLocaleString()} views</span>
                    </>
                  )}
                </div>
              </div>
              <ResourceStatus status={r.status} />
              <PencilSimpleIcon size={16} className="shrink-0 text-subtle transition-colors group-hover:text-fg" aria-hidden />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
