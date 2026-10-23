import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowSquareOutIcon, BookmarkIcon, BookmarkSimpleIcon, KanbanIcon, TargetIcon, MinusCircleIcon, MapPinIcon } from '@phosphor-icons/react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PageHeader, Card, CardHeader, CardBody, ErrorState, SkeletonRows, Button, ButtonLink, Badge, EmptyState, StatusBadge, buttonClass } from '@/components/ui';
import { SourceCredit, type ExternalJob } from './shared';

type Detail = { job: ExternalJob & { description: string | null }; saved: boolean; tracked: { id: string; status: string } | null };

export default function ExternalJobPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['jobs', 'external', 'detail', id], queryFn: () => api.get<Detail>(`/jobs/external/${id}`) });
  const save = useMutation({
    mutationFn: (saved: boolean) => (saved ? api.del(`/jobs/saved/external/${id}`) : api.post('/jobs/saved', { kind: 'external', refId: id })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Updated saved jobs.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const track = useMutation({
    mutationFn: () => api.post('/career/applications', { externalJobId: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['career'] });
      toast.success('Added to your tracker as Saved.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const target = useMutation({
    mutationFn: (j: Detail['job']) => api.post<{ target: { id: string } }>('/career/targets', { title: j.title, company: j.company, url: j.url, description: j.description && j.description.length >= 40 ? j.description : `${j.title} at ${j.company}. Tags: ${j.tags.join(', ')}.` }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['career'] });
      toast.success('Saved as a job target.', { action: { label: 'Open', onClick: () => nav(`/app/career/targets/${r.target.id}`) } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.error) {
    if (q.error instanceof ApiError && q.error.status === 404)
      return <EmptyState icon={<MinusCircleIcon size={22} />} title="This listing is no longer available" description="External listings are removed when they expire at the source." action={<ButtonLink to="/app/jobs?tab=remote">Back to remote jobs</ButtonLink>} />;
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  }
  if (!q.data) return null;
  const j = q.data.job;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        breadcrumb={<Link to="/app/jobs?tab=remote">Remote jobs</Link>}
        title={j.title}
        badge={q.data.tracked && <StatusBadge status={q.data.tracked.status} />}
        description={
          <span>
            {j.company}
            {j.location && (
              <>
                {' '}
                · <MapPinIcon size={12} className="inline align-[-1px]" aria-hidden /> {j.location}
              </>
            )}
            {j.publishedAt && ` · posted ${timeAgo(j.publishedAt)}`}
          </span>
        }
        actions={
          <a href={j.url} target="_blank" rel="noopener noreferrer" className={buttonClass('primary')}>
            {j.attribution.applyLabel} <ArrowSquareOutIcon size={16} />
          </a>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0 self-start">
          <CardHeader title="About the role" description={`As published on ${j.attribution.label}.`} />
          <CardBody className="space-y-4">
            {j.description ? <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{j.description}</div> : <p className="text-[13.5px] text-muted">No description was provided by the source. Open the original listing for details.</p>}
            <div className="border-t border-border pt-4">
              <a href={j.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-accent-text underline-offset-2 hover:underline">
                View the original listing on {j.attribution.label} <ArrowSquareOutIcon size={14} />
              </a>
            </div>
          </CardBody>
        </Card>
        <aside className="space-y-5">
          <Card>
            <CardHeader title="Your next step" description={q.data.tracked ? 'This listing is in your tracker.' : 'Keep this job close while you decide.'} />
            <CardBody className="space-y-2">
              {q.data.tracked ? (
                <ButtonLink to={`/app/career/applications?open=${q.data.tracked.id}`} icon={<KanbanIcon size={16} />} className="w-full">
                  Open in tracker
                </ButtonLink>
              ) : (
                <Button icon={<KanbanIcon size={16} />} loading={track.isPending} onClick={() => track.mutate()} className="w-full">
                  Track
                </Button>
              )}
              <Button icon={<TargetIcon size={16} />} loading={target.isPending} onClick={() => target.mutate(j)} className="w-full">
                Analyze my gaps
              </Button>
              <Button icon={q.data.saved ? <BookmarkSimpleIcon size={16} weight="fill" /> : <BookmarkIcon size={16} />} onClick={() => save.mutate(q.data!.saved)} loading={save.isPending} className="w-full">
                {q.data.saved ? 'Unsave' : 'Save'}
              </Button>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Source" />
            <CardBody className="space-y-3">
              <SourceCredit job={j} />
              <p className="text-[12.5px] leading-relaxed text-muted">This listing comes from {j.attribution.label}. Applications happen on the original site; we only link to it.</p>
              {j.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 border-t border-border pt-3">
                  {j.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
