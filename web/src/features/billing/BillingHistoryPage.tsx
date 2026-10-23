import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowSquareOutIcon, CaretLeftIcon, ReceiptIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { Badge, Banner, EmptyState, ErrorState, PageHeader, Section, SkeletonRows } from '@/components/ui';
import { TableCard, Th, theadClass, rowClass, tdClass } from '@/features/admin/components';
import { CheckoutStatusBadge, ModeBadge, ModeBanner } from './components';
import type { BillingMode, CheckoutView, PaymentRecord } from './api';

type History = { mode: BillingMode; notice: string; records: PaymentRecord[]; checkouts: CheckoutView[]; note: string };

const planName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

function RecordStatus({ r }: { r: PaymentRecord }) {
  if (r.status === 'refunded') return <Badge tone="neutral">Refunded {r.refundedLabel}</Badge>;
  if (r.status === 'partially_refunded') return <Badge tone="warning">Partly refunded {r.refundedLabel}</Badge>;
  return <Badge tone="success">Paid</Badge>;
}

export default function BillingHistoryPage() {
  const q = useQuery({ queryKey: ['billing', 'history'], queryFn: () => api.get<History>('/billing/history') });
  return (
    <div>
      <PageHeader
        title="Payment history"
        description="Confirmed payments and checkout attempts for this organization."
        breadcrumb={
          <Link to="/app/billing" className="inline-flex items-center gap-1 hover:text-fg">
            <CaretLeftIcon size={14} /> Plan & billing
          </Link>
        }
      />
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {!q.data && !q.error && <SkeletonRows rows={6} />}
      {q.data && (
        <>
          <div className="space-y-3">
            <ModeBanner mode={q.data.mode} notice={q.data.notice} />
            <Banner tone="info" title="Payment records, not invoices">
              {q.data.note} Receipts are sent by the provider to the payer’s email; when the provider offers a receipt link, it is shown here.
            </Banner>
          </div>
          <Section title="Payment records" className="mt-8">
            {q.data.records.length === 0 ? (
              <EmptyState icon={<ReceiptIcon size={22} />} title="No payments yet" description="When a payment is confirmed by the provider, its record appears here with the provider’s reference." />
            ) : (
              <TableCard label="Payment records">
                <thead className={theadClass}>
                  <tr>
                    <Th>Date</Th>
                    <Th>Plan and period</Th>
                    <Th>Amount</Th>
                    <Th>Status</Th>
                    <Th>Provider</Th>
                    <Th>Provider reference</Th>
                    <Th>Receipt</Th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.records.map((r) => (
                    <tr key={r.id} className={rowClass}>
                      <td className={`${tdClass} whitespace-nowrap`}>{formatDateTime(r.createdAt)}</td>
                      <td className={tdClass}>
                        {planName(r.planId)}
                        <div className="text-[12px] text-subtle">
                          {formatDate(r.periodStart)} to {formatDate(r.periodEnd)}
                        </div>
                      </td>
                      <td className={`${tdClass} tabular-nums`}>{r.amountLabel}</td>
                      <td className={tdClass}>
                        <RecordStatus r={r} />
                      </td>
                      <td className={tdClass}>
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {r.providerLabel} <ModeBadge mode={r.mode} />
                        </span>
                      </td>
                      <td className={`${tdClass} font-mono text-[12px]`}>
                        <div>{r.providerRef ?? 'None'}</div>
                        {r.providerPaymentId && <div className="text-subtle">{r.providerPaymentId}</div>}
                      </td>
                      <td className={tdClass}>
                        {r.providerReceiptUrl ? (
                          <a href={r.providerReceiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                            {r.providerLabel} receipt <ArrowSquareOutIcon size={13} aria-hidden />
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        ) : (
                          <span className="text-[12.5px] text-muted">Emailed by {r.providerLabel}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableCard>
            )}
          </Section>
          <Section title="Checkout attempts" className="mt-8">
            {q.data.checkouts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-strong/70 px-5 py-6 text-center text-[13px] text-muted">No checkouts were started.</p>
            ) : (
              <TableCard label="Checkout attempts">
                <thead className={theadClass}>
                  <tr>
                    <Th>Started</Th>
                    <Th>Plan</Th>
                    <Th>Amount</Th>
                    <Th>Status</Th>
                    <Th>Provider</Th>
                    <Th>Details</Th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.checkouts.map((c) => (
                    <tr key={c.id} className={rowClass}>
                      <td className={`${tdClass} whitespace-nowrap`}>{formatDateTime(c.createdAt)}</td>
                      <td className={tdClass}>{planName(c.planId)}</td>
                      <td className={`${tdClass} tabular-nums`}>{c.amountLabel}</td>
                      <td className={tdClass}>
                        <CheckoutStatusBadge status={c.status} />
                      </td>
                      <td className={tdClass}>
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {c.providerLabel} <ModeBadge mode={c.mode} />
                        </span>
                      </td>
                      <td className={`${tdClass} max-w-[320px] text-[12.5px] text-muted`}>{c.failureReason ?? (c.status === 'pending' ? 'Not paid yet.' : '')}</td>
                    </tr>
                  ))}
                </tbody>
              </TableCard>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
