import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import { CheckCircleIcon, QuestionIcon, XCircleIcon } from '@phosphor-icons/react';
import { api, ApiError } from '@/lib/api';
import { Badge, Tooltip } from '@/components/ui';
import type { Funnel, Structure, Tri } from './types';

export const CAMPUS_KEY = ['campus'] as const;

export function useStructure() {
  return useQuery({ queryKey: [...CAMPUS_KEY, 'structure'], queryFn: () => api.get<Structure>('/campus/structure') });
}

export function useSkillCatalog() {
  return useQuery({ queryKey: [...CAMPUS_KEY, 'skills'], queryFn: () => api.get<{ items: { slug: string; name: string; category: string }[] }>('/campus/skills'), staleTime: 300_000 });
}

export const STAGE_LABELS: Record<string, string> = {
  invited: 'Invited',
  registered: 'Registered',
  assessment: 'Assessment',
  interview: 'Interview',
  offer: 'Offer',
  placed: 'Placed',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
  declined: 'Declined',
};
export const PROGRESS_STAGES = ['invited', 'registered', 'assessment', 'interview', 'offer', 'placed'] as const;
export const OUTCOME_STAGES = ['rejected', 'withdrawn', 'declined'] as const;
export const ALL_STAGES = [...PROGRESS_STAGES, ...OUTCOME_STAGES];

const STAGE_TONE: Record<string, 'neutral' | 'info' | 'accent' | 'success' | 'warning' | 'danger'> = {
  invited: 'neutral',
  registered: 'info',
  assessment: 'info',
  interview: 'accent',
  offer: 'success',
  placed: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
  declined: 'neutral',
};

export function StageBadge({ stage }: { stage: string }) {
  return <Badge tone={STAGE_TONE[stage] ?? 'neutral'}>{STAGE_LABELS[stage] ?? stage}</Badge>;
}

export const DRIVE_STATUS_LABEL: Record<string, string> = { draft: 'Draft', open: 'Open', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };

export function EligibilityBadge({ value }: { value: Tri | 'eligible' | 'not_eligible' | 'needs_data' }) {
  if (value === true || value === 'eligible')
    return (
      <Badge tone="success" icon={<CheckCircleIcon size={12} weight="fill" />}>
        Eligible
      </Badge>
    );
  if (value === false || value === 'not_eligible')
    return (
      <Badge tone="danger" icon={<XCircleIcon size={12} weight="fill" />}>
        Not eligible
      </Badge>
    );
  return (
    <Badge tone="warning" icon={<QuestionIcon size={12} weight="fill" />}>
      Needs data
    </Badge>
  );
}

/** A value that may be unknown. Unknown is shown as "Needs data", never as zero. */
export function Known({ value, suffix = '', label = 'Needs data' }: { value: number | string | null | undefined; suffix?: string; label?: string }) {
  if (value === null || value === undefined || value === '')
    return (
      <span className="inline-flex items-center gap-1 text-[12.5px] text-warning">
        <QuestionIcon size={12} aria-hidden />
        {label}
      </span>
    );
  return (
    <span className="tabular-nums">
      {value}
      {suffix}
    </span>
  );
}

const FUNNEL_STEPS: { key: keyof Funnel; label: string }[] = [
  { key: 'invited', label: 'Invited' },
  { key: 'registered', label: 'Registered' },
  { key: 'assessed', label: 'Assessed' },
  { key: 'interviewed', label: 'Interviewed' },
  { key: 'offers', label: 'Offers' },
  { key: 'placed', label: 'Placed' },
];

/** Compact funnel: one bar per step, scaled to the invited count. */
export function FunnelBars({ funnel, compact }: { funnel: Funnel; compact?: boolean }) {
  const max = Math.max(funnel.invited, 1);
  return (
    <ol className={clsx('space-y-1', compact && 'space-y-0.5')} aria-label="Placement funnel">
      {FUNNEL_STEPS.map((s) => (
        <li key={s.key} className="flex items-center gap-2 text-[12px]">
          <span className={clsx('shrink-0 text-muted', compact ? 'w-20' : 'w-24')}>{s.label}</span>
          <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
            <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(funnel[s.key] / max) * 100}%` }} />
          </span>
          <span className="w-8 shrink-0 text-right tabular-nums">{funnel[s.key]}</span>
        </li>
      ))}
    </ol>
  );
}

export function DefinitionTip({ children, label = 'How this is calculated' }: { children: ReactNode; label?: string }) {
  return (
    <Tooltip content={children}>
      <button type="button" className="inline-flex items-center text-subtle hover:text-fg" aria-label={label}>
        <QuestionIcon size={14} />
      </button>
    </Tooltip>
  );
}

/** Downloads a CSV export through fetch so permission errors show as a toast instead of a raw page. */
export async function downloadCsv(path: string, filename: string) {
  try {
    const res = await fetch(`/api${path}`, { credentials: 'same-origin' });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? `Export failed (${res.status}).`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Export downloaded. The export was recorded in the audit log.');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Export failed.');
  }
}

export const FIELD_LABELS: Record<string, string> = {
  rollNumber: 'Roll number',
  programId: 'Program',
  graduationYear: 'Graduation year',
  cgpa: 'CGPA',
  activeBacklogs: 'Active backlogs',
  attendancePercent: 'Attendance',
};

export const SKILL_STATE_LABEL: Record<string, { label: string; tone: 'success' | 'info' | 'neutral' | 'warning' }> = {
  verified: { label: 'Verified', tone: 'success' },
  demonstrated: { label: 'Demonstrated', tone: 'info' },
  learning: { label: 'Learning', tone: 'neutral' },
  needs_revision: { label: 'Needs revision', tone: 'warning' },
  self_declared: { label: 'Self-reported', tone: 'neutral' },
  not_started: { label: 'No evidence', tone: 'neutral' },
  unknown_skill: { label: 'Unknown skill', tone: 'warning' },
};

export function SkillStateBadge({ state }: { state: string }) {
  const s = SKILL_STATE_LABEL[state] ?? { label: state, tone: 'neutral' as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('overflow-x-auto rounded-lg border border-border bg-surface shadow-1', className)}>{children}</div>;
}

export const th = 'whitespace-nowrap bg-surface-2/60 px-4 py-2.5 text-left text-[12px] font-medium text-muted';
export const td = 'px-4 py-3 align-middle text-[13px]';

/** One bordered list container with divided rows (rows use px-5 py-4). */
export const listGroup = 'divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-1';

/** Native checkbox tinted with the accent token, for table row selection. */
export const nativeCheckbox = 'h-4 w-4 cursor-pointer align-middle accent-accent';
