import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CaretLeftIcon, ClockIcon, GraduationCapIcon, PlayIcon, TargetIcon, UsersIcon, CheckSquareIcon, FlagIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { PageHeader, Button, Badge, Card, CardHeader, CardBody, ErrorState, Skeleton, Banner, StatusBadge } from '@/components/ui';
import { StartProjectDialog } from './StartProjectDialog';
import { CATEGORY_LABELS, type TemplateDetail } from './types';

type Resp = { template: TemplateDetail; skills: { slug: string; name: string }[]; myProjects: { id: string; title: string; status: string }[] };

export default function TemplateDetailPage() {
  const { slug = '' } = useParams();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['project-template', slug], queryFn: () => api.get<Resp>(`/projects/templates/${slug}`) });
  if (q.isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48" />
      </div>
    );
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { template: t, skills, myProjects } = q.data!;
  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/projects/templates" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={12} /> Templates
          </Link>
        }
        title={t.title}
        badge={
          <div className="flex gap-1.5">
            <Badge>{CATEGORY_LABELS[t.category] ?? t.category}</Badge>
            <Badge tone={t.difficulty === 'beginner' ? 'success' : t.difficulty === 'advanced' ? 'danger' : 'warning'}>{t.difficulty.charAt(0).toUpperCase() + t.difficulty.slice(1)}</Badge>
            {t.isCapstone && (
              <Badge tone="accent" icon={<GraduationCapIcon size={12} />}>
                Capstone
              </Badge>
            )}
          </div>
        }
        description={t.summary}
        actions={
          <Button variant="primary" icon={<PlayIcon size={16} />} onClick={() => setOpen(true)}>
            Start this project
          </Button>
        }
      />
      {myProjects.length > 0 && (
        <Banner tone="info" title="You already started this template" className="mb-6">
          {myProjects.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ', '}
              <Link to={`/app/projects/${p.id}`} className="font-medium text-fg underline underline-offset-2">
                {p.title}
              </Link>{' '}
              <StatusBadge status={p.status} />
            </span>
          ))}
        </Banner>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-1.5"><TargetIcon size={16} /> Problem</span>} />
            <CardBody>
              <p className="text-[14px] leading-relaxed">{t.problem}</p>
              <h4 className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold"><UsersIcon size={14} /> Intended users</h4>
              <p className="mt-1 text-[14px] text-muted">{t.intendedUsers}</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-1.5"><CheckSquareIcon size={16} /> Requirements and acceptance criteria</span>} description="Guided and partially guided modes copy these criteria. Independent mode keeps only the statements." />
            <CardBody>
              <ol className="divide-y divide-border border-t border-border">
                {t.requirements.map((r) => (
                  <li key={r.id} className="flex gap-3 py-4 last:pb-0">
                    <span className="mt-0.5 flex h-6 min-w-8 shrink-0 items-center justify-center rounded-sm bg-surface-2 px-1.5 font-mono text-[11.5px] font-medium text-muted ring-1 ring-inset ring-border">{r.id}</span>
                    <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium">{r.text}</span>
                      {r.optional && <Badge>Optional</Badge>}
                    </div>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-muted">
                      {r.acceptance.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
        <aside className="space-y-5">
          <Card>
            <CardHeader title="At a glance" />
            <CardBody className="space-y-4 text-[13.5px]">
              <div className="flex items-center gap-2 text-muted">
                <ClockIcon size={16} /> About {t.estimatedHours} hours
              </div>
              <div>
                <div className="mb-1.5 font-medium">Learning objectives</div>
                <ul className="list-disc space-y-1 pl-5 leading-relaxed text-muted">
                  {t.objectives.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              </div>
              {skills.length > 0 && (
                <div>
                  <div className="mb-1.5 font-medium">Skills you will show</div>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map((s) => (
                      <Link key={s.slug} to={`/app/skills/${s.slug}`}>
                        <Badge tone="accent">{s.name}</Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-1.5"><FlagIcon size={16} /> Milestones</span>} />
            <CardBody>
              <ol className="relative space-y-4 border-l border-border pl-4">
                {t.milestones.map((m, i) => (
                  <li key={i}>
                    <div className="text-[13.5px] font-medium">
                      Week {m.weekOffset + 1}: {m.title}
                    </div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-muted">
                      {m.tasks.map((task, j) => (
                        <li key={j}>{task}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </aside>
      </div>
      <StartProjectDialog open={open} onOpenChange={setOpen} templateSlug={t.slug} />
    </div>
  );
}
