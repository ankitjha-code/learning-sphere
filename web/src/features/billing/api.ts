import type { LimitCheck, Plan, PlanLimits } from '@/features/admin/api';

export type BillingMode = 'demonstration' | 'test' | 'live';
export type ProviderId = 'razorpay' | 'stripe';

export type ProviderPublic = { id: ProviderId; label: string; configured: boolean; mode: 'test' | 'live' | null; webhookConfigured: boolean; currency: string };
export type ProviderAdmin = ProviderPublic & { problems: string[]; env: string[] };

export type CheckoutView = {
  id: string;
  orgId: string | null;
  planId: string;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';
  amountMinor: number;
  currency: string;
  amountLabel: string;
  provider: ProviderId;
  providerLabel: string;
  mode: 'test' | 'live';
  providerRef: string | null;
  url: string | null;
  failureReason: string | null;
  confirmedVia: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type SubscriptionView = {
  id: string;
  planId: string;
  status: 'active' | 'past_due' | 'cancelled' | 'expired';
  provider: string;
  providerLabel: string;
  mode: 'test' | 'live' | null;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  graceEndsAt: string | null;
  complimentary: boolean;
};

export type PaymentRecord = {
  id: string;
  checkoutId: string;
  planId: string;
  amountMinor: number;
  currency: string;
  amountLabel: string;
  refundedMinor: number;
  refundedLabel: string | null;
  provider: string;
  providerLabel: string;
  mode: string;
  providerRef: string | null;
  providerPaymentId: string | null;
  providerReceiptUrl: string | null;
  periodStart: string;
  periodEnd: string;
  status: 'paid' | 'partially_refunded' | 'refunded';
  createdAt: string;
};

export type PlanPrice = { provider: ProviderId; providerLabel: string; mode: 'test' | 'live' | null; currency: string; amountMinor: number | null; amountLabel: string | null };
export type BillingPlan = Pick<Plan, 'id' | 'name' | 'description' | 'limits' | 'entitlements'> & { paid: boolean; prices: PlanPrice[] };

export type Overview = {
  mode: BillingMode;
  notice: string;
  providers: ProviderPublic[];
  plans: BillingPlan[];
  limitLabels: Record<keyof PlanLimits, { label: string; unit: string; explain: string }>;
  entitlementLabels: Record<string, string>;
  rules: { period: 'month'; reminderDays: number; graceDays: number };
  org: { id: string; name: string; planId: string } | null;
  canManage: boolean;
  currentPlan: Plan;
  subscription: SubscriptionView | null;
  usage: LimitCheck[];
  pendingCheckout: CheckoutView | null;
  recentPayments: PaymentRecord[];
};

export type CheckoutResponse = { checkout: CheckoutView; subscription?: SubscriptionView | null; mode: BillingMode; notice: string };

export type PriceCell = { amountMinor: number | null; isDefault: boolean };
export type AdminStatus = {
  mode: BillingMode;
  notice: string;
  providers: ProviderAdmin[];
  prices: Record<'campus' | 'company', Record<string, PriceCell>>;
  defaults: Record<'campus' | 'company', Record<string, number>>;
  currencies: string[];
  paidPlanIds: ('campus' | 'company')[];
  webhookPaths: Record<ProviderId, string>;
  rules: { period: 'month'; reminderDays: number; graceDays: number };
};

export function formatMinor(amountMinor: number | null | undefined, currency: string): string {
  if (amountMinor === null || amountMinor === undefined) return 'Not set';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export const CHECKOUT_STATUS_LABEL: Record<CheckoutView['status'], string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Failed',
  expired: 'Expired',
  cancelled: 'Cancelled',
};
