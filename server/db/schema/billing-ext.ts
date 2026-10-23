// Tables owned by the billing feature. Add new tables here (do not edit other schema files).
//
// Payments are processed only on the provider's hosted pages (Razorpay Payment Links,
// Stripe Checkout). Nothing here stores card data. A checkout becomes `paid` only after a
// verified webhook or a verified server-side status fetch.
import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { cols, users, organizations } from './core';

const { id, createdAt, updatedAt } = cols;
const ts = () => timestamp({ withTimezone: true });

/** One attempt to pay for a plan period. Amount is always computed on the server from the plan price. */
export const billingCheckouts = pgTable(
  'billing_checkouts',
  {
    id: id(),
    scope: text().notNull().default('org'), // org | user
    orgId: uuid().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    planId: text().notNull(),
    period: text().notNull().default('month'),
    amountMinor: integer().notNull(),
    currency: text().notNull(),
    provider: text().notNull(), // razorpay | stripe
    mode: text().notNull(), // test | live
    providerRef: text(), // Razorpay payment link id (plink_...) or Stripe Checkout Session id (cs_...)
    providerUrl: text(), // hosted page URL the payer is redirected to
    providerPaymentId: text(), // Razorpay payment id (pay_...) or Stripe PaymentIntent id (pi_...)
    status: text().notNull().default('pending'), // pending | paid | failed | expired | cancelled
    failureReason: text(),
    confirmedVia: text(), // webhook | status_fetch | return_signature
    paidAt: ts(),
    subscriptionId: uuid(),
    createdBy: uuid().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('billing_checkouts_provider_ref_uq').on(t.provider, t.providerRef),
    index('billing_checkouts_org_idx').on(t.orgId, t.createdAt),
    index('billing_checkouts_status_idx').on(t.status, t.createdAt),
  ],
);

/** Every provider webhook we accepted (signature verified), for idempotent processing. Minimal fields only. */
export const billingPaymentEvents = pgTable(
  'billing_payment_events',
  {
    id: id(),
    provider: text().notNull(),
    eventId: text().notNull(),
    type: text().notNull(),
    checkoutId: uuid(),
    payloadHash: text().notNull(), // sha256 of the raw body; the body itself is not stored
    summary: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    outcome: text(), // paid | failed | expired | cancelled | refunded | ignored | error
    error: text(),
    receivedAt: createdAt(),
    processedAt: ts(),
  },
  (t) => [uniqueIndex('billing_payment_events_uq').on(t.provider, t.eventId), index('billing_payment_events_checkout_idx').on(t.checkoutId)],
);

/**
 * A paid (or complimentary) plan for an organization. Monthly one-off payments:
 * each paid checkout activates or extends one period. `manual` = assigned by a platform
 * administrator without payment (no period end; never auto-downgraded).
 */
export const billingSubscriptions = pgTable(
  'billing_subscriptions',
  {
    id: id(),
    scope: text().notNull().default('org'),
    orgId: uuid().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    planId: text().notNull(),
    status: text().notNull().default('active'), // active | past_due | cancelled | expired
    provider: text().notNull(), // razorpay | stripe | manual
    mode: text(), // test | live (null for manual)
    providerRef: text(), // provider ref of the checkout that paid the current period
    currentPeriodStart: ts().notNull(),
    currentPeriodEnd: ts(), // null for manual assignments
    cancelAtPeriodEnd: boolean().notNull().default(false),
    cancelledAt: ts(),
    endedReason: text(),
    reminderSentFor: ts(), // period end the renewal reminder was sent for (idempotent reminders)
    pastDueNotifiedFor: ts(),
    lastCheckoutId: uuid(),
    createdBy: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('billing_subscriptions_org_idx').on(t.orgId, t.status), index('billing_subscriptions_status_idx').on(t.status, t.currentPeriodEnd)],
);

/**
 * "Payment record": our on-platform record of a confirmed payment, with the provider's
 * reference and receipt link. It is NOT an invoice; receipts and invoices come from the provider.
 */
export const billingPaymentRecords = pgTable(
  'billing_payment_records',
  {
    id: id(),
    checkoutId: uuid().notNull(),
    orgId: uuid().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    subscriptionId: uuid(),
    planId: text().notNull(),
    amountMinor: integer().notNull(),
    currency: text().notNull(),
    provider: text().notNull(),
    mode: text().notNull(),
    providerRef: text(),
    providerPaymentId: text(),
    providerReceiptUrl: text(),
    periodStart: ts().notNull(),
    periodEnd: ts().notNull(),
    refundedMinor: integer().notNull().default(0),
    status: text().notNull().default('paid'), // paid | partially_refunded | refunded (refunds are recorded from provider webhooks)
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('billing_payment_records_checkout_uq').on(t.checkoutId), index('billing_payment_records_org_idx').on(t.orgId, t.createdAt)],
);
