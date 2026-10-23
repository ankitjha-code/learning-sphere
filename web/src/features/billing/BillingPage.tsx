import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckIcon, LockSimpleIcon, ReceiptIcon } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Badge, Banner, Button, ButtonLink, Card, CardBody, CardHeader, ConfirmDialog, ErrorState, PageHeader, SkeletonRows } from '@/components/ui';
import type { PlanLimits } from '@/features/admin/api';
import { ModeBanner, ModeBadge, SubscriptionStatusBadge, UsageList } from './components';
import type { BillingPlan, CheckoutResponse, Overview, PlanPrice } from './api';

function goToProvider(url: string | null) {
  if (!url || !/^https:\/\//.test(url)) {
    toast.error('The payment provider did not return a secure payment page. Nothing was charged.');
    return;
  }
  // Full-page navigation to the provider's hosted page (no provider script runs in this app).
  window.location.assign(url);
}

function limitText(v: number | null, unit: string) {
  return v === null ? 'No limit' : `${v.toLocaleString()} ${unit}`;
}

function PlanCard({ plan, d, onBuy }: { plan: BillingPlan; d: Overview; onBuy: (plan: BillingPlan, price: PlanPrice) => void }) {
  const isCurrent = d.currentPlan.id === plan.id;
  const sub = d.subscription;
  const renewable = isCurrent && plan.paid && sub && !sub.complimentary;
  const keys: (keyof PlanLimits)[] = ['membersPerOrg', 'aiRequestsPerUserPerDay', 'storagePerUserMb', 'activeJobPostings', 'assessmentsPerMonth'];
  let action: ReactNode = null;
  if (!plan.paid) {
    action = isCurrent ? null : <p className="text-[12.5px] text-muted">To return to Free, cancel the current plan. It stays until the end of the paid period.</p>;
  } else if (d.mode === 'demonstration') {
    action = (
      <Button variant="secondary" disabled disabledReason="No payment provider is configured on this server">
        Not available in demonstration mode
      </Button>
    );
  } else if (!d.org) {
    action = <p className="text-[12.5px] text-muted">Switch to an organization to see its plan. Organization admins buy plans for the organization.</p>;
  } else if (!d.canManage) {
    action = <p className="text-[12.5px] text-muted">Ask an organization admin to change the plan.</p>;
  } else if (isCurrent && sub?.complimentary) {
    action = <p className="text-[12.5px] text-muted">Assigned by a platform administrator at no charge.</p>;
  } else {
    action = (
      <div className="flex flex-col gap-2">
        {plan.prices.map((p) =>
          p.amountMinor === null ? (
            <Button key={p.provider} variant="secondary" disabled disabledReason={`No ${p.currency} price is set. A platform administrator can set it in Platform settings.`}>
              No {p.currency} price set
            </Button>
          ) : (
            <Button key={p.provider} variant={isCurrent ? 'secondary' : 'primary'} onClick={() => onBuy(plan, p)}>
              {renewable ? 'Renew' : 'Upgrade'} with {p.providerLabel} · {p.amountLabel} / month
            </Button>
          ),
        )}
      </div>
    );
  }
  return (
    <Card className={clsx('flex h-full flex-col', isCurrent && 'border-accent ring-1 ring-accent')}>
      <CardHeader title={plan.name} description={plan.description} action={isCurrent ? <Badge tone="accent">Current plan</Badge> : undefined} />
      <CardBody className="flex flex-1 flex-col gap-4">
        <div className="font-display text-[24px] font-semibold leading-8 tracking-[-0.02em] tabular-nums">
          {plan.paid ? (plan.prices.find((p) => p.amountLabel)?.amountLabel ?? 'Price not set') : 'Free'}
          {plan.paid && plan.prices.some((p) => p.amountLabel) && <span className="text-[13px] font-normal text-muted"> / month</span>}
        </div>
        {plan.prices.length > 1 && (
          <p className="text-[12.5px] text-muted">
            {plan.prices
              .filter((p) => p.amountLabel)
              .map((p) => `${p.amountLabel} with ${p.providerLabel}`)
              .join(' · ')}
          </p>
        )}
        <ul className="divide-y divide-border border-y border-border text-[13px]">
          {keys.map((k) => (
            <li key={k} className="flex justify-between gap-3 py-2">
              <span className="text-muted">{d.limitLabels[k].label}</span>
              <span className="tabular-nums">{limitText(plan.limits[k], d.limitLabels[k].unit)}</span>
            </li>
          ))}
        </ul>
        <ul className="space-y-1.5 text-[13px]">
          {Object.entries(d.entitlementLabels)
            .filter(([k]) => plan.entitlements[k])
            .map(([k, label]) => (
              <li key={k} className="flex gap-2">
                <CheckIcon size={15} className="mt-0.5 shrink-0 text-success" aria-hidden />
                <span>{label}</span>
              </li>
            ))}
        </ul>
        {action && <div className="mt-auto pt-2 [&_button]:w-full [&>span]:w-full">{action}</div>}
      </CardBody>
    </Card>
  );
}

function CurrentPlanCard({ d }: { d: Overview }) {
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const sub = d.subscription;
  const toggle = useMutation({
    mutationFn: (cancel: boolean) => api.post(`/billing/subscription/${cancel ? 'cancel' : 'resume'}`, { orgId: d.org?.id }),
    onSuccess: (_r, cancel) => {
      toast.success(cancel ? 'The plan will end at the end of the paid period.' : 'The plan will continue. Renew before the period ends.');
      setConfirmCancel(false);
      qc.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancelPending = useMutation({
    mutationFn: (id: string) => api.post(`/billing/checkouts/${id}/cancel`),
    onSuccess: () => {
      toast.success('Checkout cancelled. Nothing was charged.');
      qc.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader
        title={d.org ? `${d.org.name}: ${d.currentPlan.name} plan` : `Personal: ${d.currentPlan.name} plan`}
        description={d.currentPlan.description}
        action={sub ? <SubscriptionStatusBadge status={sub.status} /> : undefined}
      />
      <div className="grid border-t border-border lg:grid-cols-2 lg:divide-x lg:divide-border">
      <div className="space-y-3 px-5 py-4 text-[13.5px]">
        <h4 className="text-[13px] font-semibold">Plan status</h4>
        <dl className="divide-y divide-border border-y border-border text-[13px]">
          {(
            [
              ['Plan', d.currentPlan.name],
              ['Status', sub ? <SubscriptionStatusBadge status={sub.status} /> : d.currentPlan.id === 'free' ? 'Free plan' : 'Assigned without a payment'],
              ['Payments', <ModeBadge mode={d.mode} />],
              ['Paid through', sub && !sub.complimentary ? formatDate(sub.currentPeriodEnd) : 'Not applicable'],
              ['Billing period', `One month per payment, ${d.rules.graceDays}-day grace period`],
            ] as [string, ReactNode][]
          ).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {!d.org && <p className="text-muted">You are not in an organization workspace. People without an organization use the Free plan. Plans are bought by an organization admin for the whole organization.</p>}
        {d.org && !sub && d.currentPlan.id === 'free' && <p className="text-muted">No paid plan. Compare plans below.</p>}
        {d.org && !sub && d.currentPlan.id !== 'free' && <p className="text-muted">This plan was assigned without a payment record (for example in demonstration mode). It does not expire automatically.</p>}
        {sub?.complimentary && <p className="text-muted">Assigned by a platform administrator at no charge. It has no end date.</p>}
        {sub && !sub.complimentary && (
          <div className="space-y-1">
            <p>
              Paid through <strong>{formatDate(sub.currentPeriodEnd)}</strong> with {sub.providerLabel} <ModeBadge mode={sub.mode} />
            </p>
            {sub.status === 'active' && !sub.cancelAtPeriodEnd && (
              <p className="text-muted">
                Plans are paid one month at a time and do not renew by themselves. Admins get a reminder {d.rules.reminderDays} days before the end; renew any time and the new month starts when the current one ends.
              </p>
            )}
            {sub.cancelAtPeriodEnd && <Banner tone="info">Cancelled: the {d.currentPlan.name} plan stays until {formatDate(sub.currentPeriodEnd)}, then the organization moves to Free. Existing data is kept.</Banner>}
            {sub.status === 'past_due' && (
              <Banner tone="warning" title="Renewal due">
                The paid period ended. The plan stays active during the grace period until {formatDate(sub.graceEndsAt)}; after that the organization moves to Free.
              </Banner>
            )}
          </div>
        )}
        {d.pendingCheckout && (
          <Banner
            tone="info"
            title="Unfinished checkout"
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" loading={cancelPending.isPending} onClick={() => cancelPending.mutate(d.pendingCheckout!.id)}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={() => goToProvider(d.pendingCheckout!.url)}>
                  Continue to {d.pendingCheckout.providerLabel}
                </Button>
              </div>
            }
          >
            {d.pendingCheckout.amountLabel} for the {d.plans.find((p) => p.id === d.pendingCheckout!.planId)?.name ?? d.pendingCheckout.planId} plan, started {formatDate(d.pendingCheckout.createdAt)}. Not paid yet.
          </Banner>
        )}
        {d.canManage && sub && !sub.complimentary && sub.status === 'active' && (
          <div className="flex justify-end">
            {sub.cancelAtPeriodEnd ? (
              <Button variant="secondary" loading={toggle.isPending} onClick={() => toggle.mutate(false)}>
                Keep the plan
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                Cancel at period end
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="border-t border-border px-5 py-4 lg:border-t-0">
        <h4 className="text-[13px] font-semibold">Usage and limits</h4>
        <p className="mt-0.5 text-[12.5px] text-muted">{d.org ? 'Counted from stored records. New actions are blocked when a limit is reached; existing data is never deleted.' : 'Personal limits are shown in Settings.'}</p>
        <div className="mt-4">{d.usage.length ? <UsageList usage={d.usage} /> : <p className="text-[13.5px] text-muted">No organization selected.</p>}</div>
      </div>
      </div>
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel at the end of the paid period?"
        description={`The ${d.currentPlan.name} plan stays until ${formatDate(sub?.currentPeriodEnd)}. After that the organization moves to Free and Free limits apply. Nothing is refunded for the current period; you can change your mind before it ends.`}
        confirmLabel="Cancel at period end"
        loading={toggle.isPending}
        onConfirm={() => toggle.mutate(true)}
      />
    </Card>
  );
}

export default function BillingPage() {
  const q = useQuery({ queryKey: ['billing', 'overview'], queryFn: () => api.get<Overview>('/billing/overview') });
  const [buying, setBuying] = useState<{ plan: BillingPlan; price: PlanPrice } | null>(null);
  const buy = useMutation({
    mutationFn: (v: { plan: BillingPlan; price: PlanPrice }) => api.post<CheckoutResponse>('/billing/checkouts', { orgId: q.data?.org?.id, planId: v.plan.id, provider: v.price.provider }),
    onSuccess: (r) => goToProvider(r.checkout.url),
    onError: (e) => {
      toast.error(errorMessage(e));
      setBuying(null);
    },
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <SkeletonRows rows={8} />;
  const d = q.data;
  const replacing = buying && d.subscription && !d.subscription.complimentary && d.subscription.planId !== buying.plan.id && d.subscription.status !== 'expired';
  const renewing = buying && d.subscription && !d.subscription.complimentary && d.subscription.planId === buying.plan.id;

  return (
    <div>
      <PageHeader
        title="Plan & billing"
        description="Your organization’s plan, what it includes, current usage against its limits, and payments."
        actions={
          d.canManage ? (
            <ButtonLink to="/app/billing/history" icon={<ReceiptIcon size={16} />}>
              Payment history
            </ButtonLink>
          ) : undefined
        }
      />
      <ModeBanner mode={d.mode} notice={d.notice} className="mb-6" />
      <CurrentPlanCard d={d} />
      <section aria-labelledby="plans-heading" className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <h2 id="plans-heading" className="text-[16px] font-semibold leading-6 tracking-[-0.01em]">
            Plans
          </h2>
          {d.mode !== 'demonstration' && (
            <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
              <LockSimpleIcon size={14} aria-hidden /> You pay on {d.providers.filter((p) => p.configured).map((p) => p.label).join(' or ')}’s secure page. Card details never reach this server.
            </p>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {d.plans.map((p) => (
            <PlanCard key={p.id} plan={p} d={d} onBuy={(plan, price) => setBuying({ plan, price })} />
          ))}
        </div>
        <p className="mt-3 text-[12.5px] text-muted">
          One month per payment. Reminder {d.rules.reminderDays} days before the period ends; if it is not renewed, a {d.rules.graceDays}-day grace period follows, then the organization moves to Free. Refunds are handled by the payment provider.
        </p>
      </section>
      <ConfirmDialog
        open={!!buying}
        onOpenChange={(v) => !v && !buy.isPending && setBuying(null)}
        title={buying ? `${renewing ? 'Renew' : 'Buy'} one month of ${buying.plan.name}?` : ''}
        description={
          buying
            ? `You will be taken to ${buying.price.providerLabel}’s secure page to pay ${buying.price.amountLabel} for one month of the ${buying.plan.name} plan for ${d.org?.name}.${buying.price.mode === 'test' ? ' Test mode: no real money moves.' : ''}${
                renewing ? ' The new month starts when the current paid period ends.' : ''
              }${replacing ? ` The current ${d.plans.find((p) => p.id === d.subscription!.planId)?.name} plan ends as soon as this payment is confirmed; unused days are not credited.` : ''} The plan changes only after ${buying.price.providerLabel} confirms the payment.`
            : ''
        }
        confirmLabel={buying ? `Continue to ${buying.price.providerLabel}` : 'Continue'}
        loading={buy.isPending}
        onConfirm={() => buying && buy.mutate(buying)}
      />
    </div>
  );
}
