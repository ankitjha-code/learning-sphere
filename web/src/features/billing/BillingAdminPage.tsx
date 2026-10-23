import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CreditCardIcon } from '@phosphor-icons/react';
import { api, qs } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { Badge, ButtonLink, EmptyState, ErrorState, Field, PageHeader, Pagination, Select, SkeletonRows, Tabs } from '@/components/ui';
import { FilterBar, TableCard, Th, theadClass, rowClass, tdClass } from '@/features/admin/components';
import { CheckoutStatusBadge, ModeBadge, ModeBanner, SubscriptionStatusBadge } from './components';
import type { BillingMode, CheckoutView, PaymentRecord, SubscriptionView } from './api';

type Payments = { mode: BillingMode; notice: string; total: number; page: number; pageSize: number; note: string; items: (CheckoutView & { orgName: string | null; record: PaymentRecord | null })[] };
type Subs = { total: number; page: number; pageSize: number; items: (SubscriptionView & { orgId: string | null; orgName: string | null; endedReason: string | null })[] };
type Events = { items: { id: string; provider: string; eventId: string; type: string; outcome: string | null; error: string | null; checkoutId: string | null; receivedAt: string; processedAt: string | null }[] };

const planName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

function PaymentsTab() {
  const [status, setStatus] = useState('');
  const [provider, setProvider] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['billing', 'admin', 'payments', status, provider, page], queryFn: () => api.get<Payments>(`/billing/admin/payments${qs({ status, provider, page })}`) });
  return (
    <div className="space-y-4">
      {q.data && <ModeBanner mode={q.data.mode} notice={q.data.notice} />}
      <FilterBar>
        <Field label="Status">
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="">All</option>
            <option value="pending">Awaiting payment</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
        <Field label="Provider">
          <Select value={provider} onChange={(e) => (setProvider(e.target.value), setPage(1))}>
            <option value="">All</option>
            <option value="razorpay">Razorpay</option>
            <option value="stripe">Stripe</option>
          </Select>
        </Field>
      </FilterBar>
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {!q.data && !q.error && <SkeletonRows rows={6} />}
      {q.data && q.data.items.length === 0 && <EmptyState icon={<CreditCardIcon size={22} />} title="No payments" description={status || provider ? 'Clear a filter to see more.' : 'Checkouts appear here when an organization admin starts one.'} />}
      {q.data && q.data.items.length > 0 && (
        <>
          <TableCard label="Payments">
            <thead className={theadClass}>
              <tr>
                <Th>Started</Th>
                <Th>Organization</Th>
                <Th>Plan</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th>Provider</Th>
                <Th>References</Th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((p) => (
                <tr key={p.id} className={rowClass}>
                  <td className={`${tdClass} whitespace-nowrap`}>{formatDateTime(p.createdAt)}</td>
                  <td className={tdClass}>{p.orgName ?? 'None'}</td>
                  <td className={tdClass}>{planName(p.planId)}</td>
                  <td className={`${tdClass} tabular-nums`}>
                    {p.amountLabel}
                    {p.record?.refundedLabel && <div className="text-[12px] text-warning">Refunded {p.record.refundedLabel}</div>}
                  </td>
                  <td className={tdClass}>
                    <CheckoutStatusBadge status={p.status} />
                    {p.failureReason && <div className="mt-1 max-w-[260px] text-[12px] text-muted">{p.failureReason}</div>}
                  </td>
                  <td className={tdClass}>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {p.providerLabel} <ModeBadge mode={p.mode} />
                    </span>
                    {p.confirmedVia && <div className="text-[12px] text-subtle">Confirmed via {p.confirmedVia.replace('_', ' ')}</div>}
                  </td>
                  <td className={`${tdClass} font-mono text-[12px]`}>
                    <div>{p.providerRef ?? 'None'}</div>
                    {p.record?.providerPaymentId && <div className="text-subtle">{p.record.providerPaymentId}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <Pagination page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
          <p className="text-[12.5px] text-subtle">{q.data.note}</p>
        </>
      )}
    </div>
  );
}

function SubscriptionsTab() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['billing', 'admin', 'subscriptions', page], queryFn: () => api.get<Subs>(`/billing/admin/subscriptions${qs({ page })}`) });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <SkeletonRows rows={6} />;
  if (q.data.items.length === 0) return <EmptyState icon={<CreditCardIcon size={22} />} title="No subscriptions" description="A subscription starts when a payment is confirmed, or when you assign a plan while a provider is configured." />;
  return (
    <>
      <TableCard label="Subscriptions">
        <thead className={theadClass}>
          <tr>
            <Th>Organization</Th>
            <Th>Plan</Th>
            <Th>Status</Th>
            <Th>Source</Th>
            <Th>Current period</Th>
            <Th>Notes</Th>
          </tr>
        </thead>
        <tbody>
          {q.data.items.map((s) => (
            <tr key={s.id} className={rowClass}>
              <td className={tdClass}>{s.orgName ?? 'None'}</td>
              <td className={tdClass}>{planName(s.planId)}</td>
              <td className={tdClass}>
                <SubscriptionStatusBadge status={s.status} />
              </td>
              <td className={tdClass}>
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {s.providerLabel} {s.mode && <ModeBadge mode={s.mode} />}
                </span>
              </td>
              <td className={`${tdClass} whitespace-nowrap`}>
                {formatDate(s.currentPeriodStart)} to {s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : 'no end date'}
              </td>
              <td className={`${tdClass} text-[12.5px] text-muted`}>
                {s.cancelAtPeriodEnd && <Badge tone="info">Ends at period end</Badge>}
                {s.graceEndsAt && <div>Grace until {formatDate(s.graceEndsAt)}</div>}
                {s.endedReason && <div>Ended: {s.endedReason.replace(/_/g, ' ')}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      <Pagination page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
    </>
  );
}

function EventsTab() {
  const q = useQuery({ queryKey: ['billing', 'admin', 'events'], queryFn: () => api.get<Events>('/billing/admin/events') });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <SkeletonRows rows={6} />;
  if (q.data.items.length === 0) return <EmptyState icon={<CreditCardIcon size={22} />} title="No webhook events yet" description="Signature-verified events from Razorpay and Stripe appear here. Events with a bad signature are rejected and not stored." />;
  return (
    <TableCard label="Webhook events">
      <thead className={theadClass}>
        <tr>
          <Th>Received</Th>
          <Th>Provider</Th>
          <Th>Event</Th>
          <Th>Outcome</Th>
          <Th>Event id</Th>
        </tr>
      </thead>
      <tbody>
        {q.data.items.map((e) => (
          <tr key={e.id} className={rowClass}>
            <td className={`${tdClass} whitespace-nowrap`}>{formatDateTime(e.receivedAt)}</td>
            <td className={tdClass}>{e.provider === 'razorpay' ? 'Razorpay' : 'Stripe'}</td>
            <td className={`${tdClass} font-mono text-[12px]`}>{e.type}</td>
            <td className={tdClass}>
              {e.error ? <Badge tone="danger">Error</Badge> : e.processedAt ? <Badge tone={e.outcome === 'ignored' ? 'neutral' : 'success'}>{e.outcome}</Badge> : <Badge tone="warning">Not processed</Badge>}
              {e.error && <div className="mt-1 max-w-[260px] text-[12px] text-muted">{e.error}</div>}
            </td>
            <td className={`${tdClass} font-mono text-[12px] text-subtle`}>{e.eventId}</td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

/** Platform admins: every payment attempt, subscription and webhook. No manual refunds: those happen in the provider dashboard. */
export default function BillingAdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'payments';
  return (
    <div>
      <PageHeader
        title="Payments and subscriptions"
        description="All organizations. Prices and provider status are in Platform settings, Plans and limits. Refunds are made in the provider dashboard and recorded here from their webhooks."
        actions={<ButtonLink to="/app/admin/settings?tab=plans">Prices and providers</ButtonLink>}
      />
      <Tabs
        className="mb-6"
        value={tab}
        onValueChange={(v) => setParams({ tab: v }, { replace: true })}
        tabs={[
          { value: 'payments', label: 'Payments' },
          { value: 'subscriptions', label: 'Subscriptions' },
          { value: 'events', label: 'Webhook events' },
        ]}
      />
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'subscriptions' && <SubscriptionsTab />}
      {tab === 'events' && <EventsTab />}
    </div>
  );
}
