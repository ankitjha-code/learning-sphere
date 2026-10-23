import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CaretLeftIcon } from '@phosphor-icons/react';
import { api, ApiError, qs } from '@/lib/api';
import { ErrorState, SkeletonRows } from '@/components/ui';
import { PortfolioView } from './PortfolioView';
import { PublicProjectView } from './PublicProjectView';
import { PublicLayout, PublicNotFound } from './PublicLayout';
import type { ComposedPortfolio, PublicProject } from './types';

function ProjectPage({ id, token, slug }: { id: string; token: string | null; slug: string }) {
  const q = useQuery({ queryKey: ['public-project', id, token], queryFn: () => api.get<PublicProject>(`/projects/public/${id}${qs({ token })}`), retry: false });
  useEffect(() => {
    if (q.data) document.title = `${q.data.project.title} · ${q.data.ownerName}`;
  }, [q.data]);
  return (
    <PublicLayout wide>
      <Link to={`/p/${slug}`} className="mb-6 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
        <CaretLeftIcon size={12} /> Portfolio
      </Link>
      {q.error ? (
        q.error instanceof ApiError && q.error.status === 404 ? (
          <PublicNotFound title="Project not available" description="This project is private, its share link was revoked, or it does not exist." />
        ) : (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        )
      ) : !q.data ? (
        <SkeletonRows rows={6} />
      ) : (
        <PublicProjectView v={q.data} />
      )}
    </PublicLayout>
  );
}

/** Public portfolio at /p/:slug (unlisted needs ?token=). Also hosts shared project pages via ?project=<id>&ptoken=. */
export default function PublicPortfolioPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const projectId = params.get('project');
  const token = params.get('token');
  const q = useQuery({
    queryKey: ['public-portfolio', slug, token],
    queryFn: () => api.get<ComposedPortfolio>(`/portfolio/public/${encodeURIComponent(slug)}${qs({ token })}`),
    enabled: !projectId,
    retry: false,
  });
  useEffect(() => {
    if (q.data) document.title = `${q.data.owner.name} · Portfolio`;
  }, [q.data]);

  if (projectId) return <ProjectPage id={projectId} token={params.get('ptoken')} slug={slug} />;
  return (
    <PublicLayout wide>
      {q.error ? (
        q.error instanceof ApiError && q.error.status === 404 ? (
          <PublicNotFound title="Portfolio not available" description="This portfolio is private, the link was changed or revoked, or it does not exist. Ask the owner for a current link." />
        ) : (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        )
      ) : !q.data ? (
        <SkeletonRows rows={6} />
      ) : (
        <PortfolioView v={q.data} />
      )}
    </PublicLayout>
  );
}
