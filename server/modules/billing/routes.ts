import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client';
import { billingCheckouts, billingPaymentEvents, billingPaymentRecords, billingSubscriptions, organizations } from '../../db/schema';
import { type AppEnv, requireAuth, requirePlatformAdmin } from '../../lib/context';
import { body, idParam, query } from '../../lib/validate';
import { notFound } from '../../lib/errors';
import { rateLimit } from '../../lib/ratelimit';
import { audit } from '../../lib/audit';
import { ensureScheduled } from '../files/recurring';
import { getPlan, getPlans, orgUsage, LIMIT_LABELS, PLAN_ENTITLEMENTS } from '../admin/plans';
import { billingMode, configuredProviders, providerStatuses, type ProviderId } from './providers';
import {
  PAID_PLAN_IDS,
  SUPPORTED_CURRENCIES,
  REMINDER_DAYS,
  GRACE_DAYS,
  DEFAULT_PRICES,
  type Checkout,
  type Subscription,
  createCheckout,
  refreshThrottled,
  applyReturn,
  cancelCheckout,
  handleWebhook,
  setCancelAtPeriodEnd,
  currentSubscription,
  getPriceTable,
  setPrice,
  requireOrgBilling,
  formatMoney,
} from './service';
import { RENEWALS_JOB, RENEWALS_PERIOD_MS } from './jobs';

/**
 * Mounted at /api/billing.
 * Org admins buy plans for their organization on the provider's hosted page; members can see
 * the plan and usage. Platform admins see payments and set prices. Webhooks are authenticated
 * by signature (exempt from the CSRF origin check in app.ts).
 */
export const billingRoutes = new Hono<AppEnv>();

const PROVIDER_LABEL: Record<string, string> = { razorpay: 'Razorpay', stripe: 'Stripe', manual: 'Assigned by platform admin' };

function checkoutView(ch: Checkout) {
  return {
    id: ch.id,
    orgId: ch.orgId,
    planId: ch.planId,
    status: ch.status,
    amountMinor: ch.amountMinor,
    currency: ch.currency,
    amountLabel: formatMoney(ch.amountMinor, ch.currency),
    provider: ch.provider,
    providerLabel: PROVIDER_LABEL[ch.provider] ?? ch.provider,
    mode: ch.mode,
    providerRef: ch.providerRef,
    // The hosted page link is only useful (and only shown) while the checkout can still be paid.
    url: ch.status === 'pending' ? ch.providerUrl : null,
    failureReason: ch.failureReason,
    confirmedVia: ch.confirmedVia,
    createdAt: ch.createdAt,
    paidAt: ch.paidAt,
  };
}

function subscriptionView(s: Subscription | null) {
  if (!s) return null;
  const graceEndsAt = s.status === 'past_due' && s.currentPeriodEnd ? new Date(s.currentPeriodEnd.getTime() + GRACE_DAYS * 86400_000) : null;
  return {
    id: s.id,
    planId: s.planId,
    status: s.status,
    provider: s.provider,
    providerLabel: PROVIDER_LABEL[s.provider] ?? s.provider,
    mode: s.mode,
    currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    graceEndsAt,
    complimentary: s.provider === 'manual',
  };
}

function providersPublic() {
  return providerStatuses().map((p) => ({ id: p.id, label: p.label, configured: p.configured, mode: p.mode, webhookConfigured: p.webhookConfigured, currency: p.currency }));
}

async function loadCheckoutFor(c: Parameters<typeof requireAuth>[0], id: string) {
  const auth = requireAuth(c);
  const [ch] = await db.select().from(billingCheckouts).where(eq(billingCheckouts.id, id));
  if (!ch || !ch.orgId) throw notFound('Checkout');
  // Not a member of that org: 404 (never reveal other organizations' checkouts).
  if (!auth.memberships.some((m) => m.orgId === ch.orgId)) throw notFound('Checkout');
  requireOrgBilling(auth, ch.orgId, { admin: true });
  return ch;
}

const orgQuery = z.object({ orgId: z.string().uuid().optional() });

// ---------- Org: overview, history ----------

billingRoutes.get('/overview', async (c) => {
  const auth = requireAuth(c);
  ensureScheduled(RENEWALS_JOB, RENEWALS_PERIOD_MS);
  const q = query(c, orgQuery);
  const orgId = q.orgId ?? auth.session.activeOrgId;
  const { mode, notice } = billingMode();
  const configured = configuredProviders();
  const priceTable = await getPriceTable();
  const plans = await getPlans();
  const planViews = plans.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    limits: p.limits,
    entitlements: p.entitlements,
    paid: (PAID_PLAN_IDS as readonly string[]).includes(p.id),
    prices: (PAID_PLAN_IDS as readonly string[]).includes(p.id)
      ? configured.map((prov) => {
          const amount = priceTable[p.id as (typeof PAID_PLAN_IDS)[number]][prov.currency as (typeof SUPPORTED_CURRENCIES)[number]]?.amountMinor ?? null;
          return { provider: prov.id, providerLabel: prov.label, mode: prov.mode, currency: prov.currency, amountMinor: amount, amountLabel: amount === null ? null : formatMoney(amount, prov.currency) };
        })
      : [],
  }));
  const base = {
    mode,
    notice,
    providers: providersPublic(),
    plans: planViews,
    limitLabels: LIMIT_LABELS,
    entitlementLabels: PLAN_ENTITLEMENTS,
    rules: { period: 'month', reminderDays: REMINDER_DAYS, graceDays: GRACE_DAYS },
  };
  if (!orgId) {
    const free = await getPlan('free');
    return c.json({ ...base, org: null, canManage: false, currentPlan: free, subscription: null, usage: [], pendingCheckout: null, recentPayments: [] });
  }
  const { isAdmin } = requireOrgBilling(auth, orgId, { admin: false });
  const [org] = await db.select({ id: organizations.id, name: organizations.name, planId: organizations.planId }).from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw notFound('Organization');
  const currentPlan = await getPlan(org.planId);
  const sub = await currentSubscription(orgId);
  let pendingCheckout = null;
  let recentPayments: unknown[] = [];
  if (isAdmin) {
    const [p] = await db
      .select()
      .from(billingCheckouts)
      .where(and(eq(billingCheckouts.orgId, orgId), eq(billingCheckouts.status, 'pending')))
      .orderBy(desc(billingCheckouts.createdAt))
      .limit(1);
    pendingCheckout = p ? checkoutView(p) : null;
    recentPayments = (await db.select().from(billingPaymentRecords).where(eq(billingPaymentRecords.orgId, orgId)).orderBy(desc(billingPaymentRecords.createdAt)).limit(3)).map(recordView);
  }
  return c.json({
    ...base,
    org,
    canManage: isAdmin,
    currentPlan,
    subscription: subscriptionView(sub),
    usage: await orgUsage(orgId),
    pendingCheckout,
    recentPayments,
  });
});

function recordView(r: typeof billingPaymentRecords.$inferSelect) {
  return {
    id: r.id,
    checkoutId: r.checkoutId,
    planId: r.planId,
    amountMinor: r.amountMinor,
    currency: r.currency,
    amountLabel: formatMoney(r.amountMinor, r.currency),
    refundedMinor: r.refundedMinor,
    refundedLabel: r.refundedMinor ? formatMoney(r.refundedMinor, r.currency) : null,
    provider: r.provider,
    providerLabel: PROVIDER_LABEL[r.provider] ?? r.provider,
    mode: r.mode,
    providerRef: r.providerRef,
    providerPaymentId: r.providerPaymentId,
    providerReceiptUrl: r.providerReceiptUrl,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    status: r.status,
    createdAt: r.createdAt,
  };
}

billingRoutes.get('/history', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, orgQuery);
  const { orgId } = requireOrgBilling(auth, q.orgId ?? auth.session.activeOrgId, { admin: true });
  const records = await db.select().from(billingPaymentRecords).where(eq(billingPaymentRecords.orgId, orgId)).orderBy(desc(billingPaymentRecords.createdAt)).limit(200);
  const checkouts = await db.select().from(billingCheckouts).where(eq(billingCheckouts.orgId, orgId)).orderBy(desc(billingCheckouts.createdAt)).limit(100);
  const subs = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.orgId, orgId)).orderBy(desc(billingSubscriptions.createdAt)).limit(50);
  return c.json({
    ...billingMode(),
    records: records.map(recordView),
    checkouts: checkouts.map(checkoutView),
    subscriptions: subs.map(subscriptionView),
    note: 'Payment records are kept on this platform with the provider’s reference. They are not tax invoices: receipts and invoices are issued by the payment provider.',
  });
});

// ---------- Org: checkout ----------

billingRoutes.post('/checkouts', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ orgId: z.string().uuid().optional(), planId: z.string().min(1).max(40), provider: z.enum(['razorpay', 'stripe']).optional() }));
  const { orgId } = requireOrgBilling(auth, input.orgId ?? auth.session.activeOrgId, { admin: true });
  rateLimit(`billing:checkout:${auth.user.id}`, 10, 10 * 60_000);
  const r = await createCheckout(c, auth, { orgId, planId: input.planId, provider: input.provider as ProviderId | undefined });
  return c.json({ checkout: checkoutView(r.checkout), reused: r.reused, ...billingMode() }, r.reused ? 200 : 201);
});

billingRoutes.get('/checkouts/:id', async (c) => {
  const ch = await loadCheckoutFor(c, idParam(c));
  const fresh = ch.status === 'pending' || ch.status === 'failed' ? await refreshThrottled(c, ch) : ch;
  const sub = fresh.status === 'paid' && fresh.orgId ? await currentSubscription(fresh.orgId) : null;
  return c.json({ checkout: checkoutView(fresh), subscription: subscriptionView(sub), ...billingMode() });
});

billingRoutes.post('/checkouts/:id/return', async (c) => {
  const ch = await loadCheckoutFor(c, idParam(c));
  const input = await body(c, z.object({ params: z.record(z.string(), z.string().max(500)).default({}) }));
  const fresh = await applyReturn(c, ch, input.params);
  return c.json({ checkout: checkoutView(fresh), ...billingMode() });
});

billingRoutes.post('/checkouts/:id/cancel', async (c) => {
  const ch = await loadCheckoutFor(c, idParam(c));
  const fresh = await cancelCheckout(c, ch);
  return c.json({ checkout: checkoutView(fresh) });
});

// ---------- Org: cancel at period end ----------

billingRoutes.post('/subscription/cancel', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, orgQuery);
  const { orgId } = requireOrgBilling(auth, input.orgId ?? auth.session.activeOrgId, { admin: true });
  return c.json({ subscription: subscriptionView(await setCancelAtPeriodEnd(c, orgId, true)) });
});

billingRoutes.post('/subscription/resume', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, orgQuery);
  const { orgId } = requireOrgBilling(auth, input.orgId ?? auth.session.activeOrgId, { admin: true });
  return c.json({ subscription: subscriptionView(await setCancelAtPeriodEnd(c, orgId, false)) });
});

// ---------- Webhooks (signature-authenticated, raw body) ----------

const MAX_WEBHOOK_BYTES = 1024 * 1024;

for (const provider of ['razorpay', 'stripe'] as const) {
  billingRoutes.post(`/webhooks/${provider}`, async (c) => {
    const raw = Buffer.from(await c.req.arrayBuffer());
    if (raw.length > MAX_WEBHOOK_BYTES) return c.json({ error: { code: 'too_large', message: 'Event too large.' } }, 413);
    const r = await handleWebhook(c, provider, raw);
    return c.json(r.body, r.status);
  });
}

// ---------- Platform admin ----------

billingRoutes.get('/admin/status', async (c) => {
  requirePlatformAdmin(c);
  return c.json({
    ...billingMode(),
    providers: providerStatuses(),
    prices: await getPriceTable(),
    defaults: DEFAULT_PRICES,
    currencies: SUPPORTED_CURRENCIES,
    paidPlanIds: PAID_PLAN_IDS,
    webhookPaths: { razorpay: '/api/billing/webhooks/razorpay', stripe: '/api/billing/webhooks/stripe' },
    rules: { period: 'month', reminderDays: REMINDER_DAYS, graceDays: GRACE_DAYS },
  });
});

billingRoutes.put('/admin/prices', async (c) => {
  const auth = requirePlatformAdmin(c);
  const input = await body(
    c,
    z.object({
      planId: z.enum(PAID_PLAN_IDS),
      currency: z.enum(SUPPORTED_CURRENCIES),
      // Minor units (paise / cents). null = not sold in this currency. 'default' = built-in default.
      amountMinor: z.union([z.number().int().min(100, 'The smallest price is 1.00 (100 minor units).').max(100_000_000), z.null(), z.literal('default')]),
    }),
  );
  const before = (await getPriceTable())[input.planId][input.currency];
  await setPrice(input.planId, input.currency, input.amountMinor, auth.user.id);
  const after = (await getPriceTable())[input.planId][input.currency];
  await audit(c, { action: 'billing.price_updated', targetType: 'plan', targetId: input.planId, meta: { currency: input.currency, before: before.amountMinor, after: after.amountMinor } });
  return c.json({ prices: await getPriceTable() });
});

const listQuery = z.object({
  status: z.string().max(20).optional(),
  provider: z.string().max(20).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

billingRoutes.get('/admin/payments', async (c) => {
  requirePlatformAdmin(c);
  const q = query(c, listQuery);
  const conds: SQL[] = [];
  if (q.status) conds.push(eq(billingCheckouts.status, q.status));
  if (q.provider) conds.push(eq(billingCheckouts.provider, q.provider));
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select({ ch: billingCheckouts, orgName: organizations.name })
    .from(billingCheckouts)
    .leftJoin(organizations, eq(organizations.id, billingCheckouts.orgId))
    .where(where)
    .orderBy(desc(billingCheckouts.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(billingCheckouts).where(where);
  const ids = rows.map((r) => r.ch.id);
  const records = ids.length ? await db.select().from(billingPaymentRecords).where(inArray(billingPaymentRecords.checkoutId, ids)) : [];
  return c.json({
    ...billingMode(),
    total: n,
    page: q.page,
    pageSize: q.pageSize,
    items: rows.map((r) => {
      const rec = records.find((x) => x.checkoutId === r.ch.id);
      return { ...checkoutView(r.ch), url: null, orgName: r.orgName, record: rec ? recordView(rec) : null };
    }),
    note: 'Refunds are made in the provider dashboard; refund webhooks are recorded here. There is no manual "mark as refunded".',
  });
});

billingRoutes.get('/admin/subscriptions', async (c) => {
  requirePlatformAdmin(c);
  const q = query(c, listQuery);
  const where = q.status ? eq(billingSubscriptions.status, q.status) : undefined;
  const rows = await db
    .select({ s: billingSubscriptions, orgName: organizations.name })
    .from(billingSubscriptions)
    .leftJoin(organizations, eq(organizations.id, billingSubscriptions.orgId))
    .where(where)
    .orderBy(desc(billingSubscriptions.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(billingSubscriptions).where(where);
  return c.json({ total: n, page: q.page, pageSize: q.pageSize, items: rows.map((r) => ({ ...subscriptionView(r.s)!, orgId: r.s.orgId, orgName: r.orgName, endedReason: r.s.endedReason })) });
});

billingRoutes.get('/admin/events', async (c) => {
  requirePlatformAdmin(c);
  const rows = await db
    .select({
      id: billingPaymentEvents.id,
      provider: billingPaymentEvents.provider,
      eventId: billingPaymentEvents.eventId,
      type: billingPaymentEvents.type,
      outcome: billingPaymentEvents.outcome,
      error: billingPaymentEvents.error,
      checkoutId: billingPaymentEvents.checkoutId,
      receivedAt: billingPaymentEvents.receivedAt,
      processedAt: billingPaymentEvents.processedAt,
    })
    .from(billingPaymentEvents)
    .orderBy(desc(billingPaymentEvents.receivedAt))
    .limit(50);
  return c.json({ items: rows });
});
