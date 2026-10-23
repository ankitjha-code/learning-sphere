import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { Badge, Banner, Button, Card, CardAction, CardBody, CardHeader, ErrorState, Field, Input, Progress, SkeletonRows } from '@/components/ui';
import { formatBytes, type LimitCheck } from '@/features/admin/api';
import { CHECKOUT_STATUS_LABEL, formatMinor, type AdminStatus, type BillingMode, type CheckoutView } from './api';

/** The honest mode label, shown at the top of every billing screen. */
export function ModeBanner({ mode, notice, className }: { mode: BillingMode; notice: string; className?: string }) {
  if (mode === 'demonstration') {
    return (
      <Banner tone="info" title="Demonstration mode: no payment provider configured" className={className}>
        {notice} Nothing can be bought on this server: no card details are collected and no invoices are created. A platform administrator assigns plans.
      </Banner>
    );
  }
  if (mode === 'test') {
    return (
      <Banner tone="warning" title="Test mode: no real money moves" className={className}>
        Payments run on the provider’s test environment. Use the provider’s test cards; nothing is charged.
      </Banner>
    );
  }
  return (
    <Banner tone="info" title="Live payments" className={className}>
      {notice} Card and UPI details are entered only on the provider’s page and never reach this server.
    </Banner>
  );
}

export function ModeBadge({ mode }: { mode: string | null | undefined }) {
  if (mode === 'test') return <Badge tone="warning">Test mode</Badge>;
  if (mode === 'live') return <Badge tone="success">Live</Badge>;
  if (mode === 'demonstration') return <Badge tone="info">Demonstration</Badge>;
  return <Badge>Not set</Badge>;
}

const CHECKOUT_TONE: Record<CheckoutView['status'], 'warning' | 'success' | 'danger' | 'neutral'> = {
  pending: 'warning',
  paid: 'success',
  failed: 'danger',
  expired: 'neutral',
  cancelled: 'neutral',
};

export function CheckoutStatusBadge({ status }: { status: CheckoutView['status'] }) {
  return <Badge tone={CHECKOUT_TONE[status] ?? 'neutral'}>{CHECKOUT_STATUS_LABEL[status] ?? status}</Badge>;
}

const SUB_STATUS: Record<string, ['success' | 'warning' | 'neutral' | 'danger', string]> = {
  active: ['success', 'Active'],
  past_due: ['warning', 'Renewal due (grace period)'],
  cancelled: ['neutral', 'Cancelled'],
  expired: ['neutral', 'Expired'],
};
export function SubscriptionStatusBadge({ status }: { status: string }) {
  const [tone, label] = SUB_STATUS[status] ?? ['neutral', status];
  return <Badge tone={tone}>{label}</Badge>;
}

const METRIC_LABEL: Record<string, string> = {
  'org.members': 'Active members',
  'job_postings.active': 'Published job postings',
  'assessments.month': 'Assessments created this month',
  'ai.requests.month': 'AI requests this month (org policy)',
};

export function UsageList({ usage }: { usage: LimitCheck[] }) {
  return (
    <ul className="space-y-4">
      {usage.map((u) => {
        const label = METRIC_LABEL[u.metric] ?? u.metric;
        const value = u.metric === 'storage.bytes' ? formatBytes(u.used) : u.used;
        const limit = u.limit === null ? 'No limit' : u.metric === 'storage.bytes' ? formatBytes(u.limit) : u.limit;
        const ratio = u.limit ? u.used / u.limit : 0;
        return (
          <li key={u.metric}>
            <div className="flex justify-between gap-3 text-[13.5px]">
              <span className="font-medium">{label}</span>
              <span className="tabular-nums text-muted">
                {value} / {limit}
              </span>
            </div>
            {u.limit !== null && <Progress className="mt-1.5" value={u.used} max={u.limit} tone={ratio >= 1 ? 'warning' : ratio >= 0.8 ? 'xp' : 'accent'} label={`${label} usage`} />}
            <p className="mt-1 text-[12px] leading-relaxed text-subtle">{u.explanation}</p>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Platform settings: provider status and prices ----------

const PLAN_NAMES: Record<string, string> = { campus: 'Campus', company: 'Company' };

function toMajor(minor: number | null) {
  return minor === null ? '' : (minor / 100).toFixed(2);
}

function PriceRow({ planId, s }: { planId: 'campus' | 'company'; s: AdminStatus }) {
  const qc = useQueryClient();
  const initial = () => Object.fromEntries(s.currencies.map((cur) => [cur, toMajor(s.prices[planId][cur]?.amountMinor ?? null)])) as Record<string, string>;
  const [values, setValues] = useState(initial);
  useEffect(() => setValues(initial()), [s]); // eslint-disable-line react-hooks/exhaustive-deps
  const [errors, setErrors] = useState<Record<string, string>>({});
  const changed = s.currencies.filter((cur) => values[cur] !== toMajor(s.prices[planId][cur]?.amountMinor ?? null));
  const save = useMutation({
    mutationFn: async () => {
      for (const cur of changed) {
        const raw = values[cur].trim();
        const amountMinor = raw === '' ? null : Math.round(Number(raw) * 100);
        await api.put('/billing/admin/prices', { planId, currency: cur, amountMinor });
      }
    },
    onSuccess: () => {
      toast.success(`${PLAN_NAMES[planId]} prices saved. New checkouts use them; existing payments are unchanged.`);
      qc.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reset = useMutation({
    mutationFn: async () => {
      for (const cur of s.currencies) await api.put('/billing/admin/prices', { planId, currency: cur, amountMinor: 'default' });
    },
    onSuccess: () => {
      toast.success(`${PLAN_NAMES[planId]} prices reset to defaults`);
      qc.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  function validate() {
    const next: Record<string, string> = {};
    for (const cur of changed) {
      const raw = values[cur].trim();
      if (raw !== '' && (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) < 1)) next[cur] = 'Enter an amount of at least 1.00, or leave empty.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }
  return (
    <div className="space-y-3 rounded-md bg-surface-2 p-4">
      <div className="text-[13.5px] font-semibold">{PLAN_NAMES[planId]} plan, per month</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {s.currencies.map((cur) => {
          const cell = s.prices[planId][cur];
          const def = s.defaults[planId]?.[cur];
          return (
            <Field
              key={cur}
              label={cur}
              error={errors[cur]}
              helper={cell?.isDefault ? (def ? 'Built-in default. Review before going live.' : 'Not sold in this currency.') : def ? `Default ${formatMinor(def, cur)}` : 'Leave empty to not sell in this currency.'}
            >
              <Input inputMode="decimal" value={values[cur] ?? ''} onChange={(e) => setValues({ ...values, [cur]: e.target.value })} placeholder="Not sold" aria-label={`${PLAN_NAMES[planId]} price in ${cur}`} />
            </Field>
          );
        })}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" loading={reset.isPending} onClick={() => reset.mutate()}>
          Use default prices
        </Button>
        <Button variant="primary" loading={save.isPending} disabled={changed.length === 0} disabledReason="No unsaved changes" onClick={() => validate() && save.mutate()}>
          Save prices
        </Button>
      </div>
    </div>
  );
}

/** Used in Admin, Platform settings, Plans and limits. */
export function BillingSettingsCard() {
  const q = useQuery({ queryKey: ['billing', 'admin', 'status'], queryFn: () => api.get<AdminStatus>('/billing/admin/status') });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <SkeletonRows rows={4} />;
  const s = q.data;
  return (
    <Card>
      <CardHeader
        title="Payments"
        description={`Organizations pay one month at a time on the provider’s hosted page. Reminder ${s.rules.reminderDays} days before the period ends, then a ${s.rules.graceDays}-day grace period before moving to Free.`}
        action={<CardAction to="/app/billing/admin">Payments and subscriptions</CardAction>}
      />
      <CardBody className="space-y-4">
        <ModeBanner mode={s.mode} notice={s.notice} />
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-left text-[13.5px]" aria-label="Payment providers">
            <thead className="border-b border-border bg-surface-2 text-[12px] text-muted">
              <tr>
                <th scope="col" className="h-10 px-4 font-medium">Provider</th>
                <th scope="col" className="h-10 px-4 font-medium">Status</th>
                <th scope="col" className="h-10 px-4 font-medium">Currency</th>
                <th scope="col" className="h-10 px-4 font-medium">Webhook</th>
                <th scope="col" className="h-10 px-4 font-medium">Setup</th>
              </tr>
            </thead>
            <tbody>
              {s.providers.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 align-top">
                  <td className="h-10 px-4 font-medium">{p.label}</td>
                  <td className="px-4 py-3">{p.configured ? <ModeBadge mode={p.mode} /> : <Badge tone="neutral">Not configured</Badge>}</td>
                  <td className="px-4 py-3">{p.currency}</td>
                  <td className="px-4 py-3">
                    {p.webhookConfigured ? <Badge tone="success">Secret set</Badge> : <Badge tone="neutral">Not set</Badge>}
                    <div className="mt-1 font-mono text-[11.5px] text-subtle">{s.webhookPaths[p.id]}</div>
                  </td>
                  <td className="px-4 py-3 text-[12.5px] text-muted">
                    {p.problems.length ? p.problems.join(' ') : p.configured ? 'Ready.' : `Set ${p.env.join(', ')} on the server. See docs/DEPLOYMENT.md, Payments.`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3">
          <div>
            <h3 className="text-[14px] font-semibold">Plan prices</h3>
            <p className="text-[12.5px] text-muted">
              Amounts are charged exactly as set here, computed on the server for every checkout. Razorpay charges in {s.providers.find((p) => p.id === 'razorpay')?.currency}, Stripe in{' '}
              {s.providers.find((p) => p.id === 'stripe')?.currency} (change with BILLING_CURRENCY). The Free plan has no price.
            </p>
          </div>
          {s.paidPlanIds.map((id) => (
            <PriceRow key={id} planId={id} s={s} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
