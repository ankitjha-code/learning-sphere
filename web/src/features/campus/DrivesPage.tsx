import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, MagnifyingGlassIcon, PlusIcon, RocketLaunchIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Badge, ButtonLink, EmptyState, ErrorState, Input, PageHeader, Segmented, SkeletonRows } from '@/components/ui';
import { ALL_STAGES, CAMPUS_KEY, DRIVE_STATUS_LABEL, listGroup, STAGE_LABELS } from './shared';
import type { Drive } from './types';

type Row = Drive & { candidates: number; byStage: Record<string, number> };
const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning'> = {
  draft: 'neutral',
  open: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
};

export default function DrivesPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'active';
  const search = params.get('q') ?? '';
  const q = useQuery({
    queryKey: [...CAMPUS_KEY, 'drives', status, search],
    queryFn: () => api.get<{ items: Row[] }>(`/campus/drives${qs({ status: status === 'all' ? undefined : status, q: search })}`),
  });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next);
  };
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Placement drives"
        description="Create a drive, define eligibility, invite students, run the assessment and interviews, and record outcomes."
        actions={
          <ButtonLink to="/app/campus/drives/new" variant="primary" icon={<PlusIcon size={15} />}>
            New drive
          </ButtonLink>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
          <Segmented
            label="Drive status"
            value={status as 'active' | 'draft' | 'completed' | 'cancelled' | 'all'}
            onChange={(v) => set('status', v === 'active' ? '' : v)}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'draft', label: 'Drafts' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        <div className="relative w-full sm:w-72">
          <MagnifyingGlassIcon size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            defaultValue={search}
            onKeyDown={(e) => e.key === 'Enter' && set('q', (e.target as HTMLInputElement).value)}
            onBlur={(e) => set('q', e.target.value)}
            placeholder="Search drives or companies"
            className="pl-8"
            aria-label="Search drives"
          />
        </div>
      </div>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <SkeletonRows rows={4} />
      ) : !q.data.items.length ? (
        <EmptyState
          icon={<RocketLaunchIcon size={22} />}
          title={status === 'active' ? 'No active drives' : 'No drives here'}
          description="A drive is one company's hiring process at your campus: eligibility, invitations, assessment, interviews and offers."
          action={
            <ButtonLink to="/app/campus/drives/new" variant="primary">
              Create a drive
            </ButtonLink>
          }
        />
      ) : (
        <ul className={listGroup}>
          {q.data.items.map((d) => (
            <li key={d.id}>
              <Link to={`/app/campus/drives/${d.id}`} className="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-2 md:flex-row md:items-center md:gap-6">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                    <RocketLaunchIcon size={18} weight="duotone" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="text-[14.5px] font-semibold tracking-[-0.005em] group-hover:text-accent-text">{d.title}</span>
                      <Badge tone={STATUS_TONE[d.status]}>{DRIVE_STATUS_LABEL[d.status]}</Badge>
                    </div>
                    <div className="mt-1 text-[12.5px] text-muted">
                      {d.companyName} · {d.roleTitle}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-subtle">
                      {d.ctcText ? `${d.ctcText} · ` : ''}
                      {d.registrationDeadline ? `Registration closes ${formatDate(d.registrationDeadline)}` : 'No registration deadline'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 pl-[52px] md:justify-end md:pl-0">
                  <div className="flex flex-wrap gap-1 md:max-w-[340px] md:justify-end">
                    {d.candidates === 0 ? (
                      <span className="text-[12.5px] text-subtle">No candidates yet</span>
                    ) : (
                      Object.entries(d.byStage)
                        .sort(([a], [b]) => ALL_STAGES.indexOf(a as (typeof ALL_STAGES)[number]) - ALL_STAGES.indexOf(b as (typeof ALL_STAGES)[number]))
                        .map(([stage, n]) => (
                          <Badge key={stage}>
                            {STAGE_LABELS[stage] ?? stage}: {n}
                          </Badge>
                        ))
                    )}
                  </div>
                  <ArrowRightIcon size={16} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
