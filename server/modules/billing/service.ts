import { and, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { billingCheckouts, billingPaymentEvents, billingSubscriptions, billingPaymentRecords, organizations, memberships } from '../../db/schema';
import { getPlan } from '../admin/plans';
import { readSetting, writeSetting } from '../admin/settings';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { config } from '../../lib/config';
import { sha256 } from '../../lib/crypto';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import type { AuthContext, Ctx } from '../../lib/context';
import { configuredProviders, getProvider, ProviderError, type ParsedWebhook, type ProviderId, type RemoteStatus } from './providers';
import { verifyRazorpayCallback } from './providers/razorpay';

/**
 * Billing rules (docs/ARCHITECTURE.md): never fake invoices or successful payments, never
 * require paid credentials to run, label demo/test mode, verify everything server-side.
 *
 * - Amounts always come from the plan price stored on the server, never from the client.
 * - A checkout becomes `paid` only via a signature-verified webhook, a signature-verified
 *   return callback (Razorpay), or a server-side status fetch from the provider API.
 * - Activation is idempotent: a conditional UPDATE ... WHERE status <> 'paid' claims the
 *   checkout once, so duplicate webhooks, returns and polls never double-activate.
 */

export type Checkout = typeof billingCheckouts.$inferSelect;
export type Subscription = typeof billingSubscriptions.$inferSelect;

export const PAID_PLAN_IDS = ['campus', 'company'] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];
export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const REMINDER_DAYS = 5;
export const GRACE_DAYS = 7;
const DAY = 86400_000;
const PENDING_REUSE_MS = 60 * 60_000;
const STALE_PENDING_MS = 26 * 3600_000;

export const DEMO_CHECKOUT_MESSAGE =
  'No payment provider is configured, so this server runs in demonstration mode: nothing can be bought here. A platform administrator can assign plans for free from Admin, Organizations.';

/** Starting prices in minor units (paise / cents) per month. Platform admins edit them in Platform settings. */
export const DEFAULT_PRICES: Record<PaidPlanId, Partial<Record<Currency, number>>> = {
  campus: { INR: 499_900, USD: 5_900 },
  company: { INR: 999_900, USD: 11_900 },
};
const PRICES_KEY = 'billing.prices';

export function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export function addMonthUtc(d: Date): Date {
  const day = d.getUTCDate();
  const r = new Date(d.getTime());
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + 1);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

// ---------- Prices ----------

export type PriceTable = Record<PaidPlanId, Record<Currency, { amountMinor: number | null; isDefault: boolean }>>;

export async function getPriceTable(): Promise<PriceTable> {
  const stored = (await readSetting<Record<string, Record<string, number | null>>>(PRICES_KEY, {})) ?? {};
  const out = {} as PriceTable;
  for (const plan of PAID_PLAN_IDS) {
    out[plan] = {} as PriceTable[PaidPlanId];
    for (const cur of SUPPORTED_CURRENCIES) {
      const s = stored[plan]?.[cur];
      if (s === null) out[plan][cur] = { amountMinor: null, isDefault: false };
      else if (typeof s === 'number' && Number.isInteger(s) && s > 0) out[plan][cur] = { amountMinor: s, isDefault: false };
      else out[plan][cur] = { amountMinor: DEFAULT_PRICES[plan][cur] ?? null, isDefault: true };
    }
  }
  return out;
}

export async function priceFor(planId: string, currency: string): Promise<number | null> {
  if (!(PAID_PLAN_IDS as readonly string[]).includes(planId) || !(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) return null;
  const t = await getPriceTable();
  return t[planId as PaidPlanId][currency as Currency].amountMinor;
}

/** amountMinor null = no price in this currency (plan cannot be bought in it); 'default' = back to the built-in default. */
export async function setPrice(planId: PaidPlanId, currency: Currency, amountMinor: number | null | 'default', userId: string) {
  const stored = { ...((await readSetting<Record<string, Record<string, number | null>>>(PRICES_KEY, {})) ?? {}) };
  const row = { ...(stored[planId] ?? {}) };
  if (amountMinor === 'default') delete row[currency];
  else row[currency] = amountMinor;
  stored[planId] = row;
  await writeSetting(PRICES_KEY, stored, userId);
}

// ---------- Access ----------

/** Org billing access: 404 when the caller is not a member (no cross-org probing), 403 for members who are not org admins. */
export function requireOrgBilling(auth: AuthContext, orgId: string | null | undefined, opts: { admin: boolean }) {
  if (!orgId) throw forbidden('Select an organization first (use the workspace switcher). Plans are bought by an organization admin for the organization.');
  const m = auth.memberships.find((x) => x.orgId === orgId);
  if (!m) throw notFound('Organization');
  const isAdmin = m.roles.includes('org_admin');
  if (opts.admin && !isAdmin) throw forbidden('Only an organization admin can manage the plan and payments.', { requiredRoles: ['org_admin'] });
  return { orgId, isAdmin, membership: m };
}

async function orgAdminIds(orgId: string) {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, 'active'), sql`'org_admin' = any(${memberships.roles})`));
  return rows.map((r) => r.userId);
}

async function notifyOrgAdmins(orgId: string, n: { type: string; title: string; body: string; link?: string }) {
  for (const uid of await orgAdminIds(orgId)) {
    await notify(uid, { ...n, category: 'organization', orgId, link: n.link ?? '/app/billing' });
  }
}

export async function currentSubscription(orgId: string): Promise<Subscription | null> {
  const [s] = await db
    .select()
    .from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.orgId, orgId), inArray(billingSubscriptions.status, ['active', 'past_due'])))
    .orderBy(desc(billingSubscriptions.createdAt))
    .limit(1);
  return s ?? null;
}

// ---------- Checkout creation ----------

function appUrl() {
  return config().APP_URL.replace(/\/+$/, '');
}

export async function createCheckout(c: Ctx, auth: AuthContext, input: { orgId: string; planId: string; provider?: ProviderId }) {
  const configured = configuredProviders();
  if (configured.length === 0) throw new AppError(409, 'billing_not_configured', DEMO_CHECKOUT_MESSAGE);
  const prov = input.provider ? configured.find((p) => p.id === input.provider) : configured[0];
  if (!prov) throw badRequest('That payment provider is not configured on this server.');
  if (!(PAID_PLAN_IDS as readonly string[]).includes(input.planId)) throw badRequest('Choose a paid plan. To return to Free, cancel the current plan; it ends at the end of the paid period.');

  const [org] = await db.select().from(organizations).where(eq(organizations.id, input.orgId));
  if (!org || org.status !== 'active') throw notFound('Organization');
  const amountMinor = await priceFor(input.planId, prov.currency);
  if (amountMinor === null) throw conflict(`No ${prov.currency} price is set for this plan yet. A platform administrator can set it in Platform settings, Plans and limits.`);
  const plan = await getPlan(input.planId);

  // Reuse a fresh pending checkout for the same thing instead of creating a new provider link each click.
  const [existing] = await db
    .select()
    .from(billingCheckouts)
    .where(
      and(
        eq(billingCheckouts.orgId, org.id),
        eq(billingCheckouts.planId, plan.id),
        eq(billingCheckouts.provider, prov.id),
        eq(billingCheckouts.status, 'pending'),
        eq(billingCheckouts.amountMinor, amountMinor),
        eq(billingCheckouts.currency, prov.currency),
        gt(billingCheckouts.createdAt, new Date(Date.now() - PENDING_REUSE_MS)),
      ),
    )
    .orderBy(desc(billingCheckouts.createdAt))
    .limit(1);
  if (existing?.providerUrl) return { checkout: existing, reused: true };

  const [row] = await db
    .insert(billingCheckouts)
    .values({ scope: 'org', orgId: org.id, planId: plan.id, amountMinor, currency: prov.currency, provider: prov.id, mode: prov.mode!, createdBy: auth.user.id })
    .returning();
  const returnUrl = `${appUrl()}/app/billing/return?checkout=${row.id}`;
  try {
    const created = await getProvider(prov.id)!.createCheckout({
      checkoutId: row.id,
      amountMinor,
      currency: prov.currency,
      planId: plan.id,
      planName: plan.name,
      orgId: org.id,
      orgName: org.name,
      customer: { name: auth.user.name, email: auth.user.email },
      returnUrl,
      cancelUrl: `${returnUrl}&cancelled=1`,
    });
    const [updated] = await db
      .update(billingCheckouts)
      .set({ providerRef: created.providerRef, providerUrl: created.url, updatedAt: new Date() })
      .where(eq(billingCheckouts.id, row.id))
      .returning();
    await audit(c, {
      action: 'billing.checkout_created',
      orgId: org.id,
      targetType: 'billing_checkout',
      targetId: row.id,
      meta: { planId: plan.id, amountMinor, currency: prov.currency, provider: prov.id, mode: prov.mode, providerRef: created.providerRef },
    });
    return { checkout: updated, reused: false };
  } catch (e) {
    const msg = e instanceof ProviderError ? e.message : 'The payment provider could not start a checkout.';
    await db.update(billingCheckouts).set({ status: 'failed', failureReason: msg.slice(0, 300), updatedAt: new Date() }).where(eq(billingCheckouts.id, row.id));
    if (!(e instanceof ProviderError)) console.error(`[billing] checkout ${row.id} creation failed`, (e as Error).message);
    throw new AppError(502, 'provider_error', `${msg} Nothing was charged.`);
  }
}

// ---------- Confirmation (idempotent) ----------

type PaidInfo = { paymentId?: string | null; amountMinor?: number | null; currency?: string | null; receiptUrl?: string | null };
type Via = 'webhook' | 'status_fetch' | 'return_signature';

export async function confirmPaid(c: Ctx | null, checkout: Checkout, info: PaidInfo, via: Via): Promise<{ activated: boolean; reason?: string }> {
  if (checkout.status === 'paid') return { activated: false, reason: 'already_paid' };
  const currencyOk = !info.currency || info.currency.toUpperCase() === checkout.currency;
  const amountOk = info.amountMinor === null || info.amountMinor === undefined || info.amountMinor >= checkout.amountMinor;
  if (!currencyOk || !amountOk) {
    const reason = `Amount mismatch: provider reported ${info.amountMinor ?? '?'} ${info.currency ?? '?'}, expected ${checkout.amountMinor} ${checkout.currency}. Review and refund in the provider dashboard.`;
    const [row] = await db
      .update(billingCheckouts)
      .set({ status: 'failed', failureReason: reason, providerPaymentId: info.paymentId ?? null, updatedAt: new Date() })
      .where(and(eq(billingCheckouts.id, checkout.id), ne(billingCheckouts.status, 'paid')))
      .returning();
    if (row) await audit(c, { action: 'billing.amount_mismatch', orgId: checkout.orgId, targetType: 'billing_checkout', targetId: checkout.id, actorId: null, meta: { via, reported: { amountMinor: info.amountMinor, currency: info.currency }, expected: { amountMinor: checkout.amountMinor, currency: checkout.currency } } });
    return { activated: false, reason: 'amount_mismatch' };
  }

  // The claim: only one caller can move this checkout to paid.
  const [claimed] = await db
    .update(billingCheckouts)
    .set({ status: 'paid', paidAt: new Date(), providerPaymentId: info.paymentId ?? checkout.providerPaymentId ?? null, confirmedVia: via, failureReason: null, updatedAt: new Date() })
    .where(and(eq(billingCheckouts.id, checkout.id), ne(billingCheckouts.status, 'paid')))
    .returning();
  if (!claimed) return { activated: false, reason: 'already_paid' };
  await activate(c, claimed, info, via);
  return { activated: true };
}

async function activate(c: Ctx | null, checkout: Checkout, info: PaidInfo, via: Via) {
  const orgId = checkout.orgId!;
  const now = new Date();
  const plan = await getPlan(checkout.planId);
  const current = await currentSubscription(orgId);
  let sub: Subscription;
  let periodStart = now;
  if (current && current.planId === checkout.planId && current.provider !== 'manual' && current.currentPeriodEnd) {
    // Renewal: extend from the end of a still-running period, or start now after a lapse.
    const start = current.status === 'active' && current.currentPeriodEnd > now ? current.currentPeriodEnd : now;
    const keepStart = start !== now;
    periodStart = start;
    [sub] = await db
      .update(billingSubscriptions)
      .set({
        status: 'active',
        provider: checkout.provider,
        mode: checkout.mode,
        providerRef: checkout.providerRef,
        currentPeriodStart: keepStart ? current.currentPeriodStart : now,
        currentPeriodEnd: addMonthUtc(start),
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        reminderSentFor: null,
        pastDueNotifiedFor: null,
        lastCheckoutId: checkout.id,
        updatedAt: now,
      })
      .where(eq(billingSubscriptions.id, current.id))
      .returning();
  } else {
    if (current) {
      await db
        .update(billingSubscriptions)
        .set({ status: 'cancelled', cancelledAt: now, endedReason: 'replaced', updatedAt: now })
        .where(eq(billingSubscriptions.id, current.id));
    }
    [sub] = await db
      .insert(billingSubscriptions)
      .values({
        scope: 'org',
        orgId,
        planId: checkout.planId,
        status: 'active',
        provider: checkout.provider,
        mode: checkout.mode,
        providerRef: checkout.providerRef,
        currentPeriodStart: now,
        currentPeriodEnd: addMonthUtc(now),
        lastCheckoutId: checkout.id,
        createdBy: checkout.createdBy,
      })
      .returning();
  }
  const periodEnd = sub.currentPeriodEnd!;
  await db.update(billingCheckouts).set({ subscriptionId: sub.id, updatedAt: now }).where(eq(billingCheckouts.id, checkout.id));
  await db
    .insert(billingPaymentRecords)
    .values({
      checkoutId: checkout.id,
      orgId,
      subscriptionId: sub.id,
      planId: checkout.planId,
      amountMinor: info.amountMinor ?? checkout.amountMinor,
      currency: checkout.currency,
      provider: checkout.provider,
      mode: checkout.mode,
      providerRef: checkout.providerRef,
      providerPaymentId: info.paymentId ?? checkout.providerPaymentId,
      providerReceiptUrl: info.receiptUrl ?? null,
      periodStart,
      periodEnd,
    })
    .onConflictDoNothing();

  const [org] = await db.select({ name: organizations.name, planId: organizations.planId }).from(organizations).where(eq(organizations.id, orgId));
  await db.update(organizations).set({ planId: checkout.planId, updatedAt: now }).where(eq(organizations.id, orgId));
  await audit(c, {
    action: 'billing.payment_confirmed',
    orgId,
    targetType: 'billing_checkout',
    targetId: checkout.id,
    actorId: via === 'webhook' ? null : undefined,
    meta: {
      planFrom: org?.planId,
      planTo: checkout.planId,
      amountMinor: info.amountMinor ?? checkout.amountMinor,
      currency: checkout.currency,
      provider: checkout.provider,
      mode: checkout.mode,
      providerRef: checkout.providerRef,
      providerPaymentId: info.paymentId ?? null,
      confirmedVia: via,
      subscriptionId: sub.id,
      periodEnd: periodEnd.toISOString(),
    },
  });
  const testNote = checkout.mode === 'test' ? ' Test mode: no real money moved.' : '';
  await notifyOrgAdmins(orgId, {
    type: 'billing.payment_confirmed',
    title: `${org?.name ?? 'Your organization'} is now on the ${plan.name} plan`,
    body: `Payment of ${formatMoney(info.amountMinor ?? checkout.amountMinor, checkout.currency)} confirmed by ${checkout.provider === 'razorpay' ? 'Razorpay' : 'Stripe'}. Paid through ${periodEnd.toISOString().slice(0, 10)} (UTC).${testNote}`,
    link: '/app/billing/history',
  });
}

/** pending -> failed/expired/cancelled, failed -> expired/cancelled. A paid checkout never changes. Nothing else changes either. */
export async function markClosed(c: Ctx | null, checkout: Checkout, status: 'failed' | 'expired' | 'cancelled', reason: string | null) {
  const from = status === 'failed' ? ['pending'] : ['pending', 'failed'];
  const [row] = await db
    .update(billingCheckouts)
    .set({ status, failureReason: reason?.slice(0, 300) ?? null, updatedAt: new Date() })
    .where(and(eq(billingCheckouts.id, checkout.id), inArray(billingCheckouts.status, from)))
    .returning();
  if (row) await audit(c, { action: `billing.checkout_${status}`, orgId: checkout.orgId, targetType: 'billing_checkout', targetId: checkout.id, meta: { provider: checkout.provider, providerRef: checkout.providerRef, reason } });
  return row ?? null;
}

async function reload(id: string) {
  const [row] = await db.select().from(billingCheckouts).where(eq(billingCheckouts.id, id));
  return row;
}

/** Server-side status fetch from the provider API (authenticated with our secret, so its answer is trustworthy). */
export async function refreshFromProvider(c: Ctx | null, checkout: Checkout): Promise<Checkout> {
  if (checkout.status === 'paid' || !checkout.providerRef) return checkout;
  const provider = getProvider(checkout.provider);
  if (!provider || !provider.status().configured) return checkout;
  const remote: RemoteStatus = await provider.fetchStatus(checkout.providerRef);
  if (remote.reference && remote.reference !== checkout.id) {
    console.warn(`[billing] provider reference mismatch for checkout ${checkout.id}`);
    return checkout;
  }
  if (remote.status === 'paid') await confirmPaid(c, checkout, remote, 'status_fetch');
  else if (remote.status === 'expired' || remote.status === 'cancelled') await markClosed(c, checkout, remote.status, `The provider reports this checkout as ${remote.status}.`);
  return reload(checkout.id);
}

const lastFetch = new Map<string, number>();
/** For polling: at most one provider status fetch per checkout every few seconds. */
export async function refreshThrottled(c: Ctx | null, checkout: Checkout, minIntervalMs = 4000): Promise<Checkout> {
  if (checkout.status === 'paid' || checkout.status === 'expired' || checkout.status === 'cancelled') return checkout;
  const last = lastFetch.get(checkout.id) ?? 0;
  if (Date.now() - last < minIntervalMs) return checkout;
  lastFetch.set(checkout.id, Date.now());
  if (lastFetch.size > 5000) lastFetch.clear();
  try {
    return await refreshFromProvider(c, checkout);
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e;
    return checkout; // provider unreachable: stay pending, the webhook can still confirm
  }
}

export function resetBillingThrottle() {
  lastFetch.clear();
}

/** The payer came back from the hosted page. Verifies what the provider put in the URL before trusting it. */
export async function applyReturn(c: Ctx, checkout: Checkout, q: Record<string, string | undefined>) {
  if (checkout.provider === 'razorpay' && q.razorpay_signature) {
    if (q.razorpay_payment_link_reference_id !== checkout.id || q.razorpay_payment_link_id !== checkout.providerRef) {
      throw badRequest('This payment confirmation does not belong to this checkout.');
    }
    if (!verifyRazorpayCallback(q)) {
      await audit(c, { action: 'billing.return_signature_invalid', orgId: checkout.orgId, targetType: 'billing_checkout', targetId: checkout.id, meta: { provider: 'razorpay' } });
      throw new AppError(400, 'bad_signature', 'The payment confirmation could not be verified, so nothing was changed. If you paid, the plan is applied as soon as Razorpay confirms the payment to our server.');
    }
    if (q.razorpay_payment_link_status === 'paid') {
      await confirmPaid(c, checkout, { paymentId: q.razorpay_payment_id ?? null }, 'return_signature');
      return reload(checkout.id);
    }
  }
  if (checkout.provider === 'stripe' && q.session_id && q.session_id !== checkout.providerRef) {
    throw badRequest('This payment confirmation does not belong to this checkout.');
  }
  if (q.cancelled === '1' && checkout.status === 'pending') return cancelCheckout(c, checkout);
  try {
    return await refreshFromProvider(c, checkout);
  } catch (e) {
    if (e instanceof ProviderError) return checkout;
    throw e;
  }
}

/** Stops the hosted page from accepting payment, then re-checks so a payment that just went through is never lost. */
export async function cancelCheckout(c: Ctx | null, checkout: Checkout): Promise<Checkout> {
  if (checkout.status !== 'pending' && checkout.status !== 'failed') return checkout;
  const provider = getProvider(checkout.provider);
  if (provider && provider.status().configured && checkout.providerRef) {
    try {
      await provider.cancel(checkout.providerRef);
      const remote = await provider.fetchStatus(checkout.providerRef);
      if (remote.status === 'paid' && (!remote.reference || remote.reference === checkout.id)) {
        await confirmPaid(c, checkout, remote, 'status_fetch');
        return reload(checkout.id);
      }
    } catch (e) {
      if (!(e instanceof ProviderError)) throw e;
    }
  }
  await markClosed(c, checkout, 'cancelled', 'Cancelled before payment.');
  return reload(checkout.id);
}

// ---------- Webhooks ----------

export type WebhookResult = { status: 200 | 400 | 503; body: Record<string, unknown> };

export async function handleWebhook(c: Ctx, providerId: ProviderId, raw: Buffer): Promise<WebhookResult> {
  const provider = getProvider(providerId)!;
  const header = (name: string) => c.req.header(name);
  const v = provider.verifyWebhook(raw, header);
  if (!v.ok) {
    if (v.reason === 'not_configured') return { status: 503, body: { error: { code: 'not_configured', message: 'Webhook secret is not configured on this server.' } } };
    console.warn(`[billing] rejected ${providerId} webhook: ${v.reason}`);
    return { status: 400, body: { error: { code: 'bad_signature', message: 'Signature verification failed.' } } };
  }
  let parsed: ParsedWebhook;
  try {
    parsed = provider.parseWebhook(raw, header);
  } catch {
    return { status: 400, body: { error: { code: 'bad_request', message: 'Malformed event.' } } };
  }

  const summary = { outcome: parsed.outcome, providerRef: parsed.providerRef ?? null, reference: parsed.reference ?? null, paymentId: parsed.paymentId ?? null, amountMinor: parsed.amountMinor ?? null, currency: parsed.currency ?? null };
  const [inserted] = await db
    .insert(billingPaymentEvents)
    .values({ provider: providerId, eventId: parsed.eventId.slice(0, 200), type: parsed.type.slice(0, 100), payloadHash: sha256(raw), summary })
    .onConflictDoNothing()
    .returning();
  let eventRow = inserted;
  if (!eventRow) {
    const [existing] = await db.select().from(billingPaymentEvents).where(and(eq(billingPaymentEvents.provider, providerId), eq(billingPaymentEvents.eventId, parsed.eventId.slice(0, 200))));
    if (existing?.processedAt) return { status: 200, body: { received: true, duplicate: true } };
    eventRow = existing; // an earlier delivery failed mid-way: process again (activation itself is idempotent)
  }

  try {
    const r = await processEvent(c, providerId, parsed);
    await db.update(billingPaymentEvents).set({ processedAt: new Date(), outcome: r.outcome, checkoutId: r.checkoutId, error: null }).where(eq(billingPaymentEvents.id, eventRow.id));
    return { status: 200, body: { received: true, outcome: r.outcome } };
  } catch (e) {
    await db.update(billingPaymentEvents).set({ outcome: 'error', error: String((e as Error).message).slice(0, 500) }).where(eq(billingPaymentEvents.id, eventRow.id));
    throw e; // 500: the provider retries later
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findCheckout(providerId: ProviderId, parsed: ParsedWebhook): Promise<Checkout | null> {
  if (parsed.providerRef) {
    const [row] = await db.select().from(billingCheckouts).where(and(eq(billingCheckouts.provider, providerId), eq(billingCheckouts.providerRef, parsed.providerRef)));
    if (row) return parsed.reference && parsed.reference !== row.id ? null : row;
  }
  if (parsed.reference && UUID.test(parsed.reference)) {
    const [row] = await db.select().from(billingCheckouts).where(and(eq(billingCheckouts.provider, providerId), eq(billingCheckouts.id, parsed.reference)));
    if (row && (!parsed.providerRef || !row.providerRef || row.providerRef === parsed.providerRef)) return row;
  }
  return null;
}

async function processEvent(c: Ctx, providerId: ProviderId, parsed: ParsedWebhook): Promise<{ outcome: string; checkoutId: string | null }> {
  if (parsed.outcome === 'refunded') {
    if (!parsed.paymentId || parsed.refundedMinor == null) return { outcome: 'ignored', checkoutId: null };
    const [rec] = await db
      .select()
      .from(billingPaymentRecords)
      .where(and(eq(billingPaymentRecords.provider, providerId), eq(billingPaymentRecords.providerPaymentId, parsed.paymentId)));
    if (!rec) return { outcome: 'ignored', checkoutId: null };
    const refunded = Math.max(rec.refundedMinor, parsed.refundedMinor);
    await db
      .update(billingPaymentRecords)
      .set({ refundedMinor: refunded, status: refunded >= rec.amountMinor ? 'refunded' : 'partially_refunded', updatedAt: new Date() })
      .where(eq(billingPaymentRecords.id, rec.id));
    await audit(c, { action: 'billing.refund_recorded', orgId: rec.orgId, targetType: 'billing_payment_record', targetId: rec.id, actorId: null, meta: { provider: providerId, providerPaymentId: parsed.paymentId, refundedMinor: refunded, currency: rec.currency } });
    return { outcome: 'refunded', checkoutId: rec.checkoutId };
  }
  if (parsed.outcome === 'ignored') return { outcome: 'ignored', checkoutId: null };
  const checkout = await findCheckout(providerId, parsed);
  if (!checkout) return { outcome: 'ignored', checkoutId: null };
  if (parsed.outcome === 'paid') {
    const r = await confirmPaid(c, checkout, parsed, 'webhook');
    return { outcome: r.reason === 'amount_mismatch' ? 'amount_mismatch' : 'paid', checkoutId: checkout.id };
  }
  await markClosed(c, checkout, parsed.outcome, parsed.failureReason ?? `The provider reported: ${parsed.type}.`);
  return { outcome: parsed.outcome, checkoutId: checkout.id };
}

// ---------- Subscription management ----------

export async function setCancelAtPeriodEnd(c: Ctx, orgId: string, cancel: boolean) {
  const sub = await currentSubscription(orgId);
  if (!sub) throw conflict('There is no paid plan to change.');
  if (sub.provider === 'manual') throw conflict('This plan was assigned by a platform administrator. Ask them to change it.');
  if (!cancel && (sub.status !== 'active' || !sub.currentPeriodEnd || sub.currentPeriodEnd <= new Date())) throw conflict('This period has already ended. Renew the plan instead.');
  const [row] = await db
    .update(billingSubscriptions)
    .set({ cancelAtPeriodEnd: cancel, cancelledAt: cancel ? new Date() : null, updatedAt: new Date() })
    .where(eq(billingSubscriptions.id, sub.id))
    .returning();
  await audit(c, { action: cancel ? 'billing.cancel_scheduled' : 'billing.cancel_withdrawn', orgId, targetType: 'billing_subscription', targetId: sub.id, meta: { planId: sub.planId, periodEnd: sub.currentPeriodEnd?.toISOString() ?? null } });
  return row;
}

/**
 * Platform admin assigns a plan while a payment provider is configured: recorded as a
 * complimentary ("manual") subscription with no period end, never auto-downgraded.
 * Ends any running subscription (no automatic refund; refunds happen in the provider dashboard).
 */
export async function assignPlanManually(orgId: string, planId: string, adminId: string) {
  const now = new Date();
  const current = await currentSubscription(orgId);
  if (current) {
    await db.update(billingSubscriptions).set({ status: 'cancelled', cancelledAt: now, endedReason: 'replaced_by_admin', updatedAt: now }).where(eq(billingSubscriptions.id, current.id));
  }
  if (planId !== 'free') {
    await db.insert(billingSubscriptions).values({ scope: 'org', orgId, planId, status: 'active', provider: 'manual', currentPeriodStart: now, createdBy: adminId });
  }
  return { endedSubscription: current ? { id: current.id, planId: current.planId, provider: current.provider } : null };
}

// ---------- Renewals (job 'billing.renewals') ----------

async function downgradeIfNoActive(sub: Subscription, reason: string) {
  const orgId = sub.orgId!;
  const other = await currentSubscription(orgId);
  if (other) return false;
  const [org] = await db.select({ name: organizations.name, planId: organizations.planId }).from(organizations).where(eq(organizations.id, orgId));
  if (!org || org.planId !== sub.planId) return false;
  await db.update(organizations).set({ planId: 'free', updatedAt: new Date() }).where(eq(organizations.id, orgId));
  await audit(null, { action: 'billing.plan_downgraded', orgId, targetType: 'billing_subscription', targetId: sub.id, actorId: null, meta: { from: sub.planId, to: 'free', reason } });
  const plan = await getPlan(sub.planId);
  await notifyOrgAdmins(orgId, {
    type: 'billing.downgraded',
    title: `${org.name} moved to the Free plan`,
    body:
      reason === 'cancelled'
        ? `The ${plan.name} plan ended at the end of the paid period, as requested. Existing data is kept; Free plan limits now apply.`
        : `The ${plan.name} plan was not renewed within the ${GRACE_DAYS}-day grace period. Existing data is kept; Free plan limits now apply. You can buy the plan again at any time.`,
  });
  return true;
}

/** Idempotent: every step is a conditional update, so running it twice changes nothing the second time. */
export async function runBillingRenewals(now = new Date()) {
  const summary = { reminders: 0, pastDue: 0, cancelledAtPeriodEnd: 0, expired: 0, downgraded: 0, staleCheckoutsChecked: 0 };
  const paid = ne(billingSubscriptions.provider, 'manual');

  // 1. Reminder REMINDER_DAYS before the period ends (once per period).
  const dueSoon = await db
    .select()
    .from(billingSubscriptions)
    .where(
      and(
        paid,
        eq(billingSubscriptions.status, 'active'),
        eq(billingSubscriptions.cancelAtPeriodEnd, false),
        gt(billingSubscriptions.currentPeriodEnd, now),
        lte(billingSubscriptions.currentPeriodEnd, new Date(now.getTime() + REMINDER_DAYS * DAY)),
      ),
    );
  for (const s of dueSoon) {
    if (s.reminderSentFor && s.currentPeriodEnd && s.reminderSentFor.getTime() === s.currentPeriodEnd.getTime()) continue;
    const [claimed] = await db
      .update(billingSubscriptions)
      .set({ reminderSentFor: s.currentPeriodEnd, updatedAt: now })
      .where(and(eq(billingSubscriptions.id, s.id), or(isNull(billingSubscriptions.reminderSentFor), ne(billingSubscriptions.reminderSentFor, s.currentPeriodEnd!))))
      .returning();
    if (!claimed) continue;
    const plan = await getPlan(s.planId);
    await notifyOrgAdmins(s.orgId!, {
      type: 'billing.renewal_reminder',
      title: `Your ${plan.name} plan ends on ${s.currentPeriodEnd!.toISOString().slice(0, 10)}`,
      body: `Plans are paid one month at a time. Renew from Plan & billing to keep the ${plan.name} plan. If it is not renewed, a ${GRACE_DAYS}-day grace period follows, then the organization moves to Free.`,
    });
    summary.reminders++;
  }

  // 2. Period ended: cancel-at-period-end ends now; otherwise grace period (past_due).
  const ended = await db.select().from(billingSubscriptions).where(and(paid, eq(billingSubscriptions.status, 'active'), lte(billingSubscriptions.currentPeriodEnd, now)));
  for (const s of ended) {
    if (s.cancelAtPeriodEnd) {
      const [row] = await db
        .update(billingSubscriptions)
        .set({ status: 'cancelled', endedReason: 'cancelled_at_period_end', updatedAt: now })
        .where(and(eq(billingSubscriptions.id, s.id), eq(billingSubscriptions.status, 'active')))
        .returning();
      if (row) {
        summary.cancelledAtPeriodEnd++;
        if (await downgradeIfNoActive(row, 'cancelled')) summary.downgraded++;
      }
    } else {
      const [row] = await db
        .update(billingSubscriptions)
        .set({ status: 'past_due', pastDueNotifiedFor: s.currentPeriodEnd, updatedAt: now })
        .where(and(eq(billingSubscriptions.id, s.id), eq(billingSubscriptions.status, 'active')))
        .returning();
      if (row) {
        summary.pastDue++;
        const plan = await getPlan(s.planId);
        const graceEnd = new Date(s.currentPeriodEnd!.getTime() + GRACE_DAYS * DAY);
        await notifyOrgAdmins(s.orgId!, {
          type: 'billing.past_due',
          title: `Renew the ${plan.name} plan by ${graceEnd.toISOString().slice(0, 10)}`,
          body: `The paid period ended. The ${plan.name} plan stays active during a ${GRACE_DAYS}-day grace period; after that the organization moves to Free.`,
        });
      }
    }
  }

  // 3. Grace period over: expire and downgrade.
  const lapsed = await db
    .select()
    .from(billingSubscriptions)
    .where(and(paid, eq(billingSubscriptions.status, 'past_due'), lte(billingSubscriptions.currentPeriodEnd, new Date(now.getTime() - GRACE_DAYS * DAY))));
  for (const s of lapsed) {
    const [row] = await db
      .update(billingSubscriptions)
      .set({ status: 'expired', endedReason: 'not_renewed', updatedAt: now })
      .where(and(eq(billingSubscriptions.id, s.id), eq(billingSubscriptions.status, 'past_due')))
      .returning();
    if (row) {
      summary.expired++;
      if (await downgradeIfNoActive(row, 'not_renewed')) summary.downgraded++;
    }
  }

  // 4. Old pending checkouts: ask the provider (best effort) so they do not stay pending forever.
  const stale = await db
    .select()
    .from(billingCheckouts)
    .where(and(eq(billingCheckouts.status, 'pending'), lte(billingCheckouts.createdAt, new Date(now.getTime() - STALE_PENDING_MS))))
    .limit(20);
  for (const ch of stale) {
    summary.staleCheckoutsChecked++;
    try {
      await refreshFromProvider(null, ch);
    } catch {
      // provider unreachable or not configured any more: try again next run
    }
  }
  return summary;
}
