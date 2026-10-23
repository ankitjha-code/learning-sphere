import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AdminStatus } from '@/features/billing/api';
import { InfoIcon } from '@phosphor-icons/react';
import { Badge, Banner, Card, Tooltip } from '@/components/ui';
import { DEMO_BILLING_NOTICE } from './api';

/** Stat tile whose definition is available on hover and keyboard focus. */
export function MetricTile({ label, value, definition, tone }: { label: string; value: ReactNode; definition: string; tone?: 'danger' | 'warning' | 'success' }) {
  // Same frame and type scale as the shared StatTile; the value takes a semantic colour only when it needs attention.
  return (
    <div className="flex h-full min-w-0 flex-col rounded-lg border border-border bg-surface p-4 shadow-1">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="min-w-0 text-[13px] font-medium leading-5 text-muted">{label}</span>
        <Tooltip content={definition}>
          <button
            type="button"
            className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
            aria-label={`How "${label}" is counted: ${definition}`}
          >
            <InfoIcon size={15} />
          </button>
        </Tooltip>
      </div>
      <div
        className={clsx(
          'mt-2 font-display text-[28px] font-semibold leading-9 tracking-[-0.02em] tabular-nums',
          tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-fg',
        )}
      >
        {value}
      </div>
    </div>
  );
}

const HEALTH: Record<string, ['success' | 'warning' | 'danger' | 'neutral', string]> = {
  ok: ['success', 'OK'],
  degraded: ['warning', 'Degraded'],
  down: ['danger', 'Down'],
  not_configured: ['neutral', 'Not configured'],
};

export function HealthBadge({ status }: { status: string }) {
  const [tone, label] = HEALTH[status] ?? ['neutral', status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const tone = severity === 'critical' ? 'danger' : severity === 'high' ? 'warning' : severity === 'medium' ? 'info' : 'neutral';
  return <Badge tone={tone}>{severity.charAt(0).toUpperCase() + severity.slice(1)}</Badge>;
}

export function JsonBlock({ value, label }: { value: unknown; label: string }) {
  const text = value === null || value === undefined ? 'None' : JSON.stringify(value, null, 2);
  return (
    <pre aria-label={label} className="max-h-72 overflow-auto rounded-md border border-border bg-surface-2 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-fg whitespace-pre-wrap break-all">
      {text}
    </pre>
  );
}

/** Real billing mode from the payments service. Falls back to demonstration while loading or when unavailable. */
export function useBillingMode() {
  const q = useQuery({ queryKey: ['billing', 'admin', 'status'], queryFn: () => api.get<AdminStatus>('/billing/admin/status'), retry: false, staleTime: 60_000 });
  return { mode: q.data?.mode ?? 'demonstration', notice: q.data?.notice ?? null, loaded: !q.isLoading, unknown: !!q.error };
}

/** Honest payments banner: "Demonstration mode" only when no provider is configured, otherwise the actual test or live mode. */
export function BillingModeBanner({ className }: { className?: string }) {
  const b = useBillingMode();
  if (!b.loaded || b.unknown) return null;
  if (b.mode === 'demonstration') return <DemoModeBanner className={className} />;
  return (
    <Banner tone={b.mode === 'test' ? 'warning' : 'info'} title={b.mode === 'test' ? 'Test mode' : 'Live payments'} className={className}>
      {b.notice ?? (b.mode === 'test' ? 'Payments run against the provider sandbox. No real money moves.' : 'Organization admins pay through the configured provider.')} Plan changes you make here are
      complimentary: no payment is taken.
    </Banner>
  );
}

export function DemoModeBanner({ className }: { className?: string }) {
  return (
    <Banner tone="info" title="Demonstration mode" className={className}>
      {DEMO_BILLING_NOTICE} No invoices are created and no card details are collected.
    </Banner>
  );
}

/** Consistent filter row above tables: fields share one baseline and wrap on phones. */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 grid grid-cols-2 items-end gap-3 *:min-w-0 [&>*:first-child]:col-span-2 sm:flex sm:flex-wrap sm:[&>*]:min-w-[170px] sm:[&>*]:max-w-[260px] sm:[&>*]:flex-1">{children}</div>
  );
}

export function TableCard({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <Card className={clsx('overflow-x-auto', className)}>
      <table className="w-full text-left text-[13.5px]" aria-label={label}>
        {children}
      </table>
    </Card>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={clsx('h-10 whitespace-nowrap px-4 font-medium first:pl-5 last:pr-5', className)}>
      {children}
    </th>
  );
}

/** One table style for every admin table: tinted header, 12px labels, rows px-4 py-3, first and last cells aligned with card padding. */
export const theadClass = 'border-b border-border bg-surface-2 text-[12px] text-muted';
export const rowClass = 'border-b border-border transition-colors last:border-0 hover:bg-surface-2/50';
export const tdClass = 'px-4 py-3 align-middle first:pl-5 last:pr-5';

/** Key/value list for detail panels. */
export function DetailList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-6 gap-y-2.5 text-[13.5px] leading-5">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
