import clsx from 'clsx';
import { TrashIcon, EyeSlashIcon, ArchiveIcon, CheckCircleIcon } from '@phosphor-icons/react';
import { formatDateTime, plural } from '@/lib/format';
import { Badge } from '@/components/ui';

export type DeletionSummaryItem = { key: string; label: string; action: 'deleted' | 'anonymized' | 'retained'; count: number; reason?: string };

/** Shape stored on a completed deletion request (server/modules/privacy/jobs.ts). */
export type DeletionSummaryData = {
  completedAt?: string | null;
  reason?: string | null;
  deleted?: DeletionSummaryItem[];
  anonymized?: DeletionSummaryItem[];
  retained?: DeletionSummaryItem[];
};

export function isDeletionSummary(v: unknown): v is DeletionSummaryData {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.deleted) || Array.isArray(o.anonymized) || Array.isArray(o.retained);
}

const GROUPS = [
  { key: 'deleted', title: 'Deleted', tone: 'danger', icon: TrashIcon, blurb: 'Permanently removed.' },
  { key: 'anonymized', title: 'Kept without identity', tone: 'warning', icon: EyeSlashIcon, blurb: 'Kept for others, with your name and email removed.' },
  { key: 'retained', title: 'Retained', tone: 'neutral', icon: ArchiveIcon, blurb: 'Kept under an obligation, without your identity.' },
] as const;

/**
 * What a completed account deletion actually did, item by item. Reusable for the
 * user's own Privacy page and for admin audit views.
 */
export function DeletionSummary({
  summary,
  title = 'What was completed',
  hideEmpty = true,
  className,
}: {
  summary: DeletionSummaryData;
  title?: string;
  /** Hide items with a count of 0 (they are kept in a collapsed list for audits). */
  hideEmpty?: boolean;
  className?: string;
}) {
  const totals = GROUPS.map((g) => ({ ...g, items: summary[g.key] ?? [] }));
  return (
    <section className={clsx('space-y-3', className)} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold">
          <CheckCircleIcon size={18} weight="fill" className="text-success" aria-hidden />
          {title}
        </h3>
        {summary.completedAt && <span className="text-[12.5px] text-muted">Completed {formatDateTime(summary.completedAt)}</span>}
      </div>
      {summary.reason && (
        <p className="text-[13px] text-muted">
          Reason given: <span className="text-fg">{summary.reason}</span>
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {totals.map((g) => {
          const shown = hideEmpty ? g.items.filter((i) => i.count > 0) : g.items;
          const empty = g.items.length - shown.length;
          const total = g.items.reduce((n, i) => n + (i.count || 0), 0);
          return (
            <div key={g.key} className="rounded-md border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                  <g.icon size={16} aria-hidden />
                  {g.title}
                </div>
                <Badge tone={g.tone}>{total.toLocaleString()} records</Badge>
              </div>
              <p className="mt-0.5 text-[12px] text-subtle">{g.blurb}</p>
              {shown.length === 0 ? (
                <p className="mt-2 text-[13px] text-muted">Nothing in this group.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {shown.map((i) => (
                    <li key={i.key} className="text-[13px]">
                      <div className="flex items-baseline justify-between gap-2">
                        <span>{i.label}</span>
                        <span className="shrink-0 tabular-nums text-muted">{i.count.toLocaleString()}</span>
                      </div>
                      {i.reason && <div className="text-[12px] text-subtle">{i.reason}</div>}
                    </li>
                  ))}
                </ul>
              )}
              {empty > 0 && <p className="mt-2 text-[12px] text-subtle">{plural(empty, 'more category', 'more categories')} had no records.</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default DeletionSummary;
