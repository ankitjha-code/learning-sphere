import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { setupTestApp, registerUser } from './helpers';
import { db } from '../server/db/client';
import { users, organizations, memberships, auditLogs, notifications, billingCheckouts, billingSubscriptions, billingPaymentRecords, billingPaymentEvents } from '../server/db/schema';
import { resetRateLimits } from '../server/lib/ratelimit';
import { billingMode, configuredProviders, providerStatuses } from '../server/modules/billing/providers';
import { stripe, formEncode } from '../server/modules/billing/providers/stripe';
import { currencyFor } from '../server/modules/billing/providers/env';
import { resetBillingThrottle, runBillingRenewals, addMonthUtc } from '../server/modules/billing/service';
import { getEntitlements } from '../server/modules/admin/plans';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
type C = Awaited<ReturnType<typeof registerUser>>;
let platformAdmin: C;
let orgAdmin: C;
let member: C;
let outsider: C;
let orgA: string;
let orgB: string;

const BILLING_ENV = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'BILLING_CURRENCY'];
const RZP = { RAZORPAY_KEY_ID: 'rzp_test_abc123', RAZORPAY_KEY_SECRET: 'rzp-key-secret', RAZORPAY_WEBHOOK_SECRET: 'rzp-webhook-secret' };
const STRIPE = { STRIPE_SECRET_KEY: 'sk_test_51abc', STRIPE_WEBHOOK_SECRET: 'whsec_test_secret' };

function setEnv(vars: Record<string, string>) {
  for (const k of BILLING_ENV) delete process.env[k];
  Object.assign(process.env, vars);
}

// ---------- Fake provider APIs (mocked fetch) ----------

const rzpLinks = new Map<string, Record<string, any>>();
const stripeSessions = new Map<string, Record<string, any>>();
const calls: { url: string; method: string; headers: Record<string, string>; body: string }[] = [];
let seq = 0;

const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

async function fakeFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const url = String(input);
  const method = init.method ?? 'GET';
  const body = typeof init.body === 'string' ? init.body : '';
  calls.push({ url, method, headers: init.headers as Record<string, string>, body });
  if (url === 'https://api.razorpay.com/v1/payment_links' && method === 'POST') {
    const b = JSON.parse(body);
    const id = `plink_T${++seq}`;
    const link = { id, status: 'created', amount: b.amount, amount_paid: 0, currency: b.currency, reference_id: b.reference_id, short_url: `https://rzp.io/i/${id}`, payments: null };
    rzpLinks.set(id, link);
    return json(200, link);
  }
  let m = url.match(/^https:\/\/api\.razorpay\.com\/v1\/payment_links\/([^/?]+)\/cancel$/);
  if (m) {
    const link = rzpLinks.get(m[1]);
    if (!link || link.status === 'paid') return json(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'cannot cancel' } });
    link.status = 'cancelled';
    return json(200, link);
  }
  m = url.match(/^https:\/\/api\.razorpay\.com\/v1\/payment_links\/([^/?]+)$/);
  if (m && method === 'GET') {
    const link = rzpLinks.get(m[1]);
    return link ? json(200, link) : json(404, { error: { description: 'not found' } });
  }
  if (url === 'https://api.stripe.com/v1/checkout/sessions' && method === 'POST') {
    const f = new URLSearchParams(body);
    const id = `cs_test_${++seq}`;
    const s = {
      id,
      url: `https://checkout.stripe.com/c/pay/${id}`,
      status: 'open',
      payment_status: 'unpaid',
      amount_total: Number(f.get('line_items[0][price_data][unit_amount]')),
      currency: f.get('line_items[0][price_data][currency]'),
      client_reference_id: f.get('client_reference_id'),
      payment_intent: null as unknown,
      _form: f,
    };
    stripeSessions.set(id, s);
    return json(200, s);
  }
  m = url.match(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/([^/?]+)\/expire$/);
  if (m) {
    const s = stripeSessions.get(m[1]);
    if (!s || s.status !== 'open') return json(400, { error: { message: 'not open' } });
    s.status = 'expired';
    return json(200, s);
  }
  m = url.match(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/([^/?]+)(\?.*)?$/);
  if (m && method === 'GET') {
    const s = stripeSessions.get(m[1]);
    return s ? json(200, s) : json(404, { error: { message: 'No such session' } });
  }
  throw new Error(`unexpected fetch ${method} ${url}`);
}

function payRzp(linkId: string, paymentId = `pay_${++seq}`) {
  const link = rzpLinks.get(linkId)!;
  link.status = 'paid';
  link.amount_paid = link.amount;
  link.payments = [{ payment_id: paymentId, status: 'captured', amount: link.amount }];
  return paymentId;
}

// ---------- Signed webhook helpers ----------

const hmac = (secret: string, data: string) => crypto.createHmac('sha256', secret).update(data).digest('hex');

async function rzpWebhook(event: Record<string, unknown>, opts: { eventId?: string; secret?: string; origin?: string } = {}) {
  const raw = JSON.stringify(event);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-razorpay-signature': hmac(opts.secret ?? RZP.RAZORPAY_WEBHOOK_SECRET, raw),
    'x-razorpay-event-id': opts.eventId ?? `evt_${++seq}`,
  };
  if (opts.origin) headers.origin = opts.origin;
  const res = await ctx.app.request('/api/billing/webhooks/razorpay', { method: 'POST', headers, body: raw });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function rzpPaidEvent(linkId: string, paymentId: string, amountOverride?: number) {
  const link = rzpLinks.get(linkId)!;
  const amount = amountOverride ?? link.amount;
  return {
    event: 'payment_link.paid',
    payload: {
      payment_link: { entity: { id: linkId, reference_id: link.reference_id, status: 'paid', amount: link.amount, amount_paid: amount, currency: 'INR' } },
      payment: { entity: { id: paymentId, amount, currency: 'INR', status: 'captured' } },
    },
  };
}

async function stripeWebhook(event: Record<string, unknown>, opts: { secret?: string; t?: number } = {}) {
  const raw = JSON.stringify(event);
  const t = opts.t ?? Math.floor(Date.now() / 1000);
  const sig = hmac(opts.secret ?? STRIPE.STRIPE_WEBHOOK_SECRET, `${t}.${raw}`);
  const res = await ctx.app.request('/api/billing/webhooks/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body: raw });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ---------- Fixtures ----------

async function makeOrg(name: string, slug: string) {
  const [o] = await db.insert(organizations).values({ name, slug, kind: 'college' }).returning();
  return o.id;
}

async function resetOrg(orgId: string) {
  await db.delete(billingCheckouts).where(eq(billingCheckouts.orgId, orgId));
  await db.delete(billingSubscriptions).where(eq(billingSubscriptions.orgId, orgId));
  await db.delete(billingPaymentRecords).where(eq(billingPaymentRecords.orgId, orgId));
  await db.update(organizations).set({ planId: 'free' }).where(eq(organizations.id, orgId));
}

async function orgPlan(orgId: string) {
  const [o] = await db.select({ planId: organizations.planId }).from(organizations).where(eq(organizations.id, orgId));
  return o.planId;
}

async function checkoutRow(id: string) {
  const [r] = await db.select().from(billingCheckouts).where(eq(billingCheckouts.id, id));
  return r;
}

async function newCheckout(c: C, planId = 'campus', provider?: 'razorpay' | 'stripe') {
  const r = await c.post('/api/billing/checkouts', { planId, ...(provider ? { provider } : {}) });
  expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
  return r.body.checkout as { id: string; providerRef: string; url: string; amountMinor: number; currency: string; status: string };
}

beforeAll(async () => {
  ctx = await setupTestApp();
  platformAdmin = await registerUser(ctx.app, 'Pia Platform', 'pia@example.test');
  orgAdmin = await registerUser(ctx.app, 'Omar Orgadmin', 'omar@example.test');
  member = await registerUser(ctx.app, 'Mia Member', 'mia@example.test');
  outsider = await registerUser(ctx.app, 'Otto Outsider', 'otto@example.test');
  await db.update(users).set({ platformRole: 'platform_admin' }).where(eq(users.id, platformAdmin.userId));
  orgA = await makeOrg('Alpha Institute', 'alpha-institute');
  orgB = await makeOrg('Beta Institute', 'beta-institute');
  await db.insert(memberships).values({ orgId: orgA, userId: orgAdmin.userId, roles: ['org_admin'] });
  await db.insert(memberships).values({ orgId: orgA, userId: member.userId, roles: ['student'] });
  await db.insert(memberships).values({ orgId: orgB, userId: outsider.userId, roles: ['org_admin'] });
  expect((await orgAdmin.post('/api/auth/switch', { orgId: orgA })).status).toBe(200);
  expect((await member.post('/api/auth/switch', { orgId: orgA })).status).toBe(200);
  expect((await outsider.post('/api/auth/switch', { orgId: orgB })).status).toBe(200);
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});

afterAll(async () => {
  vi.unstubAllGlobals();
  setEnv({});
  await ctx.close();
});

beforeEach(() => {
  resetRateLimits();
  resetBillingThrottle();
  calls.length = 0;
});
afterEach(() => setEnv({}));

// =====================================================================================

describe('provider selection and mode detection', () => {
  it('is in demonstration mode with no keys', () => {
    setEnv({});
    expect(billingMode().mode).toBe('demonstration');
    expect(configuredProviders()).toHaveLength(0);
  });

  it('detects test and live keys from their prefixes', () => {
    setEnv({ RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 's' });
    expect(billingMode()).toMatchObject({ mode: 'test' });
    expect(billingMode().notice).toMatch(/Test mode: no real money moves/);
    setEnv({ RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 's' });
    expect(billingMode().mode).toBe('live');
    setEnv({ STRIPE_SECRET_KEY: 'sk_test_x' });
    expect(providerStatuses().find((p) => p.id === 'stripe')).toMatchObject({ configured: true, mode: 'test', webhookConfigured: false });
    setEnv({ STRIPE_SECRET_KEY: 'sk_live_x', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 's' });
    expect(billingMode().mode).toBe('live'); // any live provider means real money
  });

  it('refuses unrecognised keys and incomplete pairs, with a reason', () => {
    setEnv({ RAZORPAY_KEY_ID: 'abc', RAZORPAY_KEY_SECRET: 's', STRIPE_SECRET_KEY: 'pk_test_publishable' });
    const st = providerStatuses();
    expect(st.every((p) => !p.configured)).toBe(true);
    expect(st[0].problems.join(' ')).toMatch(/rzp_test_ or rzp_live_/);
    expect(st[1].problems.join(' ')).toMatch(/sk_test_ or sk_live_/);
    setEnv({ RAZORPAY_KEY_ID: 'rzp_test_x' });
    expect(providerStatuses()[0]).toMatchObject({ configured: false });
    expect(JSON.stringify(providerStatuses())).not.toContain('rzp_test_x'); // never echoes key values
  });

  it('defaults to INR on Razorpay and USD on Stripe; BILLING_CURRENCY overrides', () => {
    setEnv({});
    expect(currencyFor('razorpay')).toBe('INR');
    expect(currencyFor('stripe')).toBe('USD');
    setEnv({ BILLING_CURRENCY: 'eur' });
    expect(currencyFor('stripe')).toBe('EUR');
  });

  it('encodes Stripe form parameters with nested brackets', () => {
    const f = formEncode({ line_items: [{ price_data: { unit_amount: 5 } }], metadata: { a: 'b' } });
    expect(f.get('line_items[0][price_data][unit_amount]')).toBe('5');
    expect(f.get('metadata[a]')).toBe('b');
  });
});

describe('no provider configured: demonstration mode keeps working', () => {
  it('says so and refuses to sell anything', async () => {
    await resetOrg(orgA);
    const ov = await orgAdmin.get('/api/billing/overview');
    expect(ov.status).toBe(200);
    expect(ov.body.mode).toBe('demonstration');
    expect(ov.body.notice).toMatch(/Demonstration mode: no payments are processed/);
    expect(ov.body.canManage).toBe(true);
    expect(ov.body.usage.length).toBeGreaterThan(0);
    expect(ov.body.plans.find((p: { id: string }) => p.id === 'campus').prices).toEqual([]);
    const r = await orgAdmin.post('/api/billing/checkouts', { planId: 'campus' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('billing_not_configured');
    expect(r.body.error.message).toMatch(/demonstration mode/);
    expect(calls).toHaveLength(0);
  });

  it('lets the platform admin change plans for free, labelled as before', async () => {
    const r = await platformAdmin.put(`/api/admin/orgs/${orgB}/plan`, { planId: 'campus' });
    expect(r.status).toBe(200);
    expect(r.body.notice).toMatch(/Demonstration mode/);
    expect(await orgPlan(orgB)).toBe('campus');
    expect(await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.orgId, orgB))).toHaveLength(0);
    const ent = await getEntitlements(orgB, outsider.userId);
    expect(ent.mode).toBe('demonstration');
    await platformAdmin.put(`/api/admin/orgs/${orgB}/plan`, { planId: 'free' });
  });

  it('webhooks answer 503 (not configured) rather than pretending', async () => {
    const r = await rzpWebhook({ event: 'payment_link.paid', payload: {} });
    expect(r.status).toBe(503);
  });
});

describe('checkout creation', () => {
  beforeEach(async () => {
    setEnv(RZP);
    await resetOrg(orgA);
  });

  it('computes the amount on the server, ignores client amounts and stores the provider ref', async () => {
    const r = await orgAdmin.post('/api/billing/checkouts', { planId: 'campus', amountMinor: 100, currency: 'USD' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const ch = r.body.checkout;
    expect(ch.amountMinor).toBe(499_900);
    expect(ch.currency).toBe('INR');
    expect(ch.mode).toBe('test');
    expect(ch.url).toMatch(/^https:\/\/rzp\.io\/i\/plink_/);
    expect(r.body.notice).toMatch(/Test mode/);
    const call = calls.find((x) => x.url.endsWith('/payment_links'))!;
    const sent = JSON.parse(call.body);
    expect(sent).toMatchObject({ amount: 499_900, currency: 'INR', reference_id: ch.id, callback_method: 'get', accept_partial: false });
    expect(sent.callback_url).toBe(`http://localhost:5317/app/billing/return?checkout=${ch.id}`);
    expect(call.headers.authorization).toBe(`Basic ${Buffer.from('rzp_test_abc123:rzp-key-secret').toString('base64')}`);
    const row = await checkoutRow(ch.id);
    expect(row.providerRef).toBe(ch.providerRef);
    expect(row.status).toBe('pending');
    const [a] = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'billing.checkout_created'), eq(auditLogs.targetId, ch.id)));
    expect(a.meta).toMatchObject({ amountMinor: 499_900, provider: 'razorpay' });
    expect(JSON.stringify(a.meta)).not.toContain('rzp-key-secret');
  });

  it('reuses a fresh pending checkout instead of creating another provider link', async () => {
    const first = await newCheckout(orgAdmin);
    const again = await orgAdmin.post('/api/billing/checkouts', { planId: 'campus' });
    expect(again.status).toBe(200);
    expect(again.body.reused).toBe(true);
    expect(again.body.checkout.id).toBe(first.id);
    expect(calls.filter((x) => x.url.endsWith('/payment_links'))).toHaveLength(1);
  });

  it('uses the admin-set price, and rejects the free plan and unknown providers', async () => {
    expect((await platformAdmin.put('/api/billing/admin/prices', { planId: 'campus', currency: 'INR', amountMinor: 450_000 })).status).toBe(200);
    const ch = await newCheckout(orgAdmin);
    expect(ch.amountMinor).toBe(450_000);
    expect((await platformAdmin.put('/api/billing/admin/prices', { planId: 'campus', currency: 'INR', amountMinor: 'default' })).status).toBe(200);
    expect((await platformAdmin.put('/api/billing/admin/prices', { planId: 'campus', currency: 'INR', amountMinor: 5 })).status).toBe(400);
    expect((await orgAdmin.post('/api/billing/checkouts', { planId: 'free' })).status).toBe(400);
    expect((await orgAdmin.post('/api/billing/checkouts', { planId: 'campus', provider: 'stripe' })).status).toBe(400);
    expect((await orgAdmin.put('/api/billing/admin/prices', { planId: 'campus', currency: 'INR', amountMinor: 1000 })).status).toBe(403);
  });

  it('says honestly when there is no price in the provider currency', async () => {
    await platformAdmin.put('/api/billing/admin/prices', { planId: 'company', currency: 'INR', amountMinor: null });
    const r = await orgAdmin.post('/api/billing/checkouts', { planId: 'company' });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/No INR price/);
    await platformAdmin.put('/api/billing/admin/prices', { planId: 'company', currency: 'INR', amountMinor: 'default' });
  });

  it('only org admins can buy for their org: members 403, other orgs 404', async () => {
    const asMember = await member.post('/api/billing/checkouts', { planId: 'campus' });
    expect(asMember.status).toBe(403);
    const crossOrg = await outsider.post('/api/billing/checkouts', { planId: 'campus', orgId: orgA });
    expect(crossOrg.status).toBe(404);
    const ch = await newCheckout(orgAdmin);
    expect((await outsider.get(`/api/billing/checkouts/${ch.id}`)).status).toBe(404);
    expect((await outsider.post(`/api/billing/checkouts/${ch.id}/cancel`)).status).toBe(404);
    expect((await member.get(`/api/billing/checkouts/${ch.id}`)).status).toBe(403);
    expect((await member.get('/api/billing/history')).status).toBe(403);
    expect((await outsider.get(`/api/billing/history?orgId=${orgA}`)).status).toBe(404);
    expect((await outsider.get(`/api/billing/overview?orgId=${orgA}`)).status).toBe(404);
    const ov = await member.get('/api/billing/overview');
    expect(ov.status).toBe(200);
    expect(ov.body.canManage).toBe(false);
    expect(ov.body.pendingCheckout).toBeNull();
  });

  it('rate limits checkout creation', async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await orgAdmin.post('/api/billing/checkouts', { planId: 'campus' })).status;
    expect(last).toBe(429);
  });

  it('a provider error marks the checkout failed and charges nothing', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => json(401, { error: { description: 'Authentication failed' } }));
    const r = await orgAdmin.post('/api/billing/checkouts', { planId: 'campus' });
    expect(r.status).toBe(502);
    expect(r.body.error.message).toMatch(/Authentication failed.*Nothing was charged/);
    expect(await orgPlan(orgA)).toBe('free');
  });
});

describe('Razorpay webhooks', () => {
  beforeEach(async () => {
    setEnv(RZP);
    await resetOrg(orgA);
  });

  it('valid signature: marks paid, activates the plan, audits and notifies', async () => {
    const ch = await newCheckout(orgAdmin);
    const pay = payRzp(ch.providerRef);
    // An unexpected Origin header does not matter: webhooks are exempt from the CSRF check and authenticated by signature.
    const r = await rzpWebhook(rzpPaidEvent(ch.providerRef, pay), { origin: 'https://evil.example' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.outcome).toBe('paid');
    const row = await checkoutRow(ch.id);
    expect(row).toMatchObject({ status: 'paid', providerPaymentId: pay, confirmedVia: 'webhook' });
    expect(await orgPlan(orgA)).toBe('campus');
    const [sub] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.orgId, orgA));
    expect(sub).toMatchObject({ status: 'active', planId: 'campus', provider: 'razorpay', mode: 'test' });
    expect(sub.currentPeriodEnd!.getTime()).toBe(addMonthUtc(sub.currentPeriodStart).getTime());
    const audits = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'billing.payment_confirmed'), eq(auditLogs.targetId, ch.id)));
    expect(audits).toHaveLength(1);
    expect(audits[0].meta).toMatchObject({ planTo: 'campus', amountMinor: 499_900, providerRef: ch.providerRef });
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, orgAdmin.userId), eq(notifications.type, 'billing.payment_confirmed')));
    expect(notes.at(-1)?.body).toMatch(/Test mode: no real money moved/);
    const hist = await orgAdmin.get('/api/billing/history');
    expect(hist.body.records).toHaveLength(1);
    expect(hist.body.records[0]).toMatchObject({ providerRef: ch.providerRef, providerPaymentId: pay, amountMinor: 499_900, status: 'paid' });
    expect(hist.body.note).toMatch(/not tax invoices/);
  });

  it('invalid signature: 400 and nothing changes', async () => {
    const ch = await newCheckout(orgAdmin);
    const pay = payRzp(ch.providerRef);
    const r = await rzpWebhook(rzpPaidEvent(ch.providerRef, pay), { secret: 'wrong-secret' });
    expect(r.status).toBe(400);
    expect((await checkoutRow(ch.id)).status).toBe('pending');
    expect(await orgPlan(orgA)).toBe('free');
    expect(await db.select().from(billingPaymentEvents).where(eq(billingPaymentEvents.provider, 'razorpay'))).not.toContainEqual(expect.objectContaining({ checkoutId: ch.id }));
    const unsigned = await ctx.app.request('/api/billing/webhooks/razorpay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rzpPaidEvent(ch.providerRef, pay)) });
    expect(unsigned.status).toBe(400);
  });

  it('duplicate deliveries are processed once', async () => {
    const ch = await newCheckout(orgAdmin);
    const pay = payRzp(ch.providerRef);
    const event = rzpPaidEvent(ch.providerRef, pay);
    expect((await rzpWebhook(event, { eventId: 'evt_dup_1' })).body.outcome).toBe('paid');
    const again = await rzpWebhook(event, { eventId: 'evt_dup_1' });
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    // Same payment, different event id (e.g. the return page confirmed first): still one activation.
    expect((await rzpWebhook(event, { eventId: 'evt_dup_2' })).status).toBe(200);
    expect(await db.select().from(billingPaymentRecords).where(eq(billingPaymentRecords.checkoutId, ch.id))).toHaveLength(1);
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'billing.payment_confirmed'), eq(auditLogs.targetId, ch.id)))).toHaveLength(1);
    expect(await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.orgId, orgA))).toHaveLength(1);
  });

  it('an underpaid amount does not activate anything', async () => {
    const ch = await newCheckout(orgAdmin);
    const pay = payRzp(ch.providerRef);
    const r = await rzpWebhook(rzpPaidEvent(ch.providerRef, pay, 100));
    expect(r.body.outcome).toBe('amount_mismatch');
    expect((await checkoutRow(ch.id)).status).toBe('failed');
    expect(await orgPlan(orgA)).toBe('free');
  });

  it('expired, cancelled and failed events change nothing but the checkout', async () => {
    const ch = await newCheckout(orgAdmin);
    const link = rzpLinks.get(ch.providerRef)!;
    const failed = await rzpWebhook({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_f', status: 'failed', notes: { checkout_id: ch.id }, error_description: 'Card declined' } } } });
    expect(failed.body.outcome).toBe('failed');
    expect(await checkoutRow(ch.id)).toMatchObject({ status: 'failed', failureReason: 'Card declined' });
    const expired = await rzpWebhook({ event: 'payment_link.expired', payload: { payment_link: { entity: { id: ch.providerRef, reference_id: link.reference_id, status: 'expired' } } } });
    expect(expired.body.outcome).toBe('expired');
    expect((await checkoutRow(ch.id)).status).toBe('expired');
    expect(await orgPlan(orgA)).toBe('free');
    expect(await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.orgId, orgA))).toHaveLength(0);
    // Events about links we never created are recorded and ignored.
    const foreign = await rzpWebhook({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: 'plink_foreign', reference_id: 'x', amount_paid: 1 } } } });
    expect(foreign.body.outcome).toBe('ignored');
  });

  it('records provider refunds without a manual "mark as refunded"', async () => {
    const ch = await newCheckout(orgAdmin);
    const pay = payRzp(ch.providerRef);
    await rzpWebhook(rzpPaidEvent(ch.providerRef, pay));
    const r = await rzpWebhook({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: pay, amount: 499_900, currency: 'INR' } }, payment: { entity: { id: pay, amount_refunded: 499_900 } } } });
    expect(r.body.outcome).toBe('refunded');
    const [rec] = await db.select().from(billingPaymentRecords).where(eq(billingPaymentRecords.checkoutId, ch.id));
    expect(rec).toMatchObject({ status: 'refunded', refundedMinor: 499_900 });
  });
});

describe('return from the hosted page', () => {
  beforeEach(async () => {
    setEnv(RZP);
    await resetOrg(orgA);
  });

  function signedReturn(ch: { id: string; providerRef: string }, pay: string, status = 'paid', secret = RZP.RAZORPAY_KEY_SECRET) {
    const p = { razorpay_payment_link_id: ch.providerRef, razorpay_payment_link_reference_id: ch.id, razorpay_payment_link_status: status, razorpay_payment_id: pay };
    return { ...p, razorpay_signature: hmac(secret, `${p.razorpay_payment_link_id}|${p.razorpay_payment_link_reference_id}|${p.razorpay_payment_link_status}|${p.razorpay_payment_id}`) };
  }

  it('a verified Razorpay callback signature confirms the payment', async () => {
    const ch = await newCheckout(orgAdmin);
    const r = await orgAdmin.post(`/api/billing/checkouts/${ch.id}/return`, { params: signedReturn(ch, 'pay_ret1') });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.checkout.status).toBe('paid');
    expect((await checkoutRow(ch.id)).confirmedVia).toBe('return_signature');
    expect(await orgPlan(orgA)).toBe('campus');
    // The webhook arriving afterwards does not activate twice.
    payRzp(ch.providerRef, 'pay_ret1');
    await rzpWebhook(rzpPaidEvent(ch.providerRef, 'pay_ret1'));
    expect(await db.select().from(billingPaymentRecords).where(eq(billingPaymentRecords.checkoutId, ch.id))).toHaveLength(1);
  });

  it('a forged or mismatched callback is rejected and nothing changes', async () => {
    const ch = await newCheckout(orgAdmin);
    const forged = await orgAdmin.post(`/api/billing/checkouts/${ch.id}/return`, { params: signedReturn(ch, 'pay_x', 'paid', 'guessed-secret') });
    expect(forged.status).toBe(400);
    expect(forged.body.error.code).toBe('bad_signature');
    const other = await newCheckout(orgAdmin, 'company');
    const mismatched = await orgAdmin.post(`/api/billing/checkouts/${ch.id}/return`, { params: signedReturn(other, 'pay_y') });
    expect(mismatched.status).toBe(400);
    expect((await checkoutRow(ch.id)).status).toBe('pending');
    expect(await orgPlan(orgA)).toBe('free');
  });

  it('polling falls back to a server-side status fetch', async () => {
    const ch = await newCheckout(orgAdmin);
    const pending = await orgAdmin.get(`/api/billing/checkouts/${ch.id}`);
    expect(pending.body.checkout.status).toBe('pending');
    payRzp(ch.providerRef, 'pay_poll');
    resetBillingThrottle();
    const paid = await orgAdmin.get(`/api/billing/checkouts/${ch.id}`);
    expect(paid.body.checkout.status).toBe('paid');
    expect(paid.body.subscription).toMatchObject({ planId: 'campus', status: 'active' });
    expect((await checkoutRow(ch.id)).confirmedVia).toBe('status_fetch');
  });

  it('cancelling stops the hosted page and changes nothing else', async () => {
    const ch = await newCheckout(orgAdmin);
    const r = await orgAdmin.post(`/api/billing/checkouts/${ch.id}/cancel`);
    expect(r.body.checkout.status).toBe('cancelled');
    expect(rzpLinks.get(ch.providerRef)!.status).toBe('cancelled');
    expect(await orgPlan(orgA)).toBe('free');
  });

  it('cancelling a checkout that was just paid keeps the payment', async () => {
    const ch = await newCheckout(orgAdmin);
    payRzp(ch.providerRef, 'pay_race');
    const r = await orgAdmin.post(`/api/billing/checkouts/${ch.id}/cancel`);
    expect(r.body.checkout.status).toBe('paid');
    expect(await orgPlan(orgA)).toBe('campus');
  });
});

describe('Stripe', () => {
  beforeEach(async () => {
    setEnv({ ...RZP, ...STRIPE });
    await resetOrg(orgA);
  });

  it('verifies signatures with a 5-minute timestamp tolerance', () => {
    const raw = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }));
    const now = Date.now();
    const t = Math.floor(now / 1000);
    const sig = hmac(STRIPE.STRIPE_WEBHOOK_SECRET, `${t}.${raw.toString()}`);
    const h = (v: string) => (name: string) => (name === 'stripe-signature' ? v : undefined);
    expect(stripe.verifyWebhook(raw, h(`t=${t},v1=${sig}`), now)).toEqual({ ok: true });
    expect(stripe.verifyWebhook(raw, h(`t=${t},v1=deadbeef,v1=${sig}`), now)).toEqual({ ok: true }); // secret rotation
    expect(stripe.verifyWebhook(raw, h(`t=${t},v1=${sig}`), now + 301_000)).toEqual({ ok: false, reason: 'timestamp_outside_tolerance' });
    expect(stripe.verifyWebhook(raw, h(`t=${t},v1=${sig}`), now + 299_000)).toEqual({ ok: true });
    expect(stripe.verifyWebhook(raw, h(`t=${t},v1=${hmac('other', `${t}.${raw}`)}`), now)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(stripe.verifyWebhook(raw, h(`v1=${sig}`), now)).toEqual({ ok: false, reason: 'malformed_signature' });
    expect(stripe.verifyWebhook(Buffer.from(raw.toString() + ' '), h(`t=${t},v1=${sig}`), now)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('creates a Checkout Session with a server-side USD price and activates on a signed webhook', async () => {
    const ch = await newCheckout(orgAdmin, 'company', 'stripe');
    expect(ch).toMatchObject({ amountMinor: 11_900, currency: 'USD' });
    expect(ch.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const call = calls.find((x) => x.url.endsWith('/checkout/sessions'))!;
    expect(call.headers.authorization).toBe('Bearer sk_test_51abc');
    const f = new URLSearchParams(call.body);
    expect(f.get('mode')).toBe('payment');
    expect(f.get('client_reference_id')).toBe(ch.id);
    expect(f.get('success_url')).toBe(`http://localhost:5317/app/billing/return?checkout=${ch.id}&session_id={CHECKOUT_SESSION_ID}`);
    expect(f.get('cancel_url')).toContain('cancelled=1');

    const session = { id: ch.providerRef, object: 'checkout.session', client_reference_id: ch.id, payment_status: 'paid', status: 'complete', amount_total: 11_900, currency: 'usd', payment_intent: 'pi_123' };
    const stale = await stripeWebhook({ id: 'evt_s_old', type: 'checkout.session.completed', data: { object: session } }, { t: Math.floor(Date.now() / 1000) - 600 });
    expect(stale.status).toBe(400);
    expect((await checkoutRow(ch.id)).status).toBe('pending');
    const ok = await stripeWebhook({ id: 'evt_s_1', type: 'checkout.session.completed', data: { object: session } });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(await checkoutRow(ch.id)).toMatchObject({ status: 'paid', providerPaymentId: 'pi_123' });
    expect(await orgPlan(orgA)).toBe('company');
    expect((await stripeWebhook({ id: 'evt_s_1', type: 'checkout.session.completed', data: { object: session } })).body.duplicate).toBe(true);
  });

  it('an unpaid completed session (delayed payment) does not activate; expiry changes nothing', async () => {
    const ch = await newCheckout(orgAdmin, 'campus', 'stripe');
    const session = { id: ch.providerRef, client_reference_id: ch.id, payment_status: 'unpaid', status: 'complete', amount_total: 5900, currency: 'usd' };
    expect((await stripeWebhook({ id: 'evt_s_2', type: 'checkout.session.completed', data: { object: session } })).body.outcome).toBe('ignored');
    expect((await checkoutRow(ch.id)).status).toBe('pending');
    expect((await stripeWebhook({ id: 'evt_s_3', type: 'checkout.session.expired', data: { object: { ...session, status: 'expired' } } })).body.outcome).toBe('expired');
    expect((await checkoutRow(ch.id)).status).toBe('expired');
    expect(await orgPlan(orgA)).toBe('free');
  });

  it('payment_intent.payment_failed marks the checkout failed only', async () => {
    const ch = await newCheckout(orgAdmin, 'campus', 'stripe');
    const r = await stripeWebhook({ id: 'evt_s_4', type: 'payment_intent.payment_failed', data: { object: { id: 'pi_f', metadata: { checkout_id: ch.id }, last_payment_error: { message: 'Your card was declined.' } } } });
    expect(r.body.outcome).toBe('failed');
    expect(await checkoutRow(ch.id)).toMatchObject({ status: 'failed', failureReason: 'Your card was declined.' });
    expect(await orgPlan(orgA)).toBe('free');
  });

  it('on return, retrieves the session server-side and rejects a foreign session id', async () => {
    const ch = await newCheckout(orgAdmin, 'campus', 'stripe');
    const wrong = await orgAdmin.post(`/api/billing/checkouts/${ch.id}/return`, { params: { session_id: 'cs_test_someone_else' } });
    expect(wrong.status).toBe(400);
    const s = stripeSessions.get(ch.providerRef)!;
    Object.assign(s, { status: 'complete', payment_status: 'paid', payment_intent: { id: 'pi_ret', latest_charge: { receipt_url: 'https://pay.stripe.com/receipts/r_1' } } });
    const r = await orgAdmin.post(`/api/billing/checkouts/${ch.id}/return`, { params: { session_id: ch.providerRef } });
    expect(r.body.checkout.status).toBe('paid');
    const [rec] = await db.select().from(billingPaymentRecords).where(eq(billingPaymentRecords.checkoutId, ch.id));
    expect(rec.providerReceiptUrl).toBe('https://pay.stripe.com/receipts/r_1');
    expect(calls.some((x) => x.url.includes(`/checkout/sessions/${ch.providerRef}?expand`))).toBe(true);
  });

  it('cancel_url return expires the session', async () => {
    const ch = await newCheckout(orgAdmin, 'campus', 'stripe');
    const r = await orgAdmin.post(`/api/billing/checkouts/${ch.id}/return`, { params: { cancelled: '1' } });
    expect(r.body.checkout.status).toBe('cancelled');
    expect(stripeSessions.get(ch.providerRef)!.status).toBe('expired');
  });
});

describe('renewals, grace period and cancellation', () => {
  beforeEach(async () => {
    setEnv(RZP);
    await resetOrg(orgA);
  });

  async function activeCampus() {
    const ch = await newCheckout(orgAdmin);
    const pay = payRzp(ch.providerRef);
    await rzpWebhook(rzpPaidEvent(ch.providerRef, pay));
    const [sub] = await db.select().from(billingSubscriptions).where(and(eq(billingSubscriptions.orgId, orgA), eq(billingSubscriptions.status, 'active')));
    return sub;
  }

  it('reminds once 5 days before, keeps the plan during 7 days of grace, then downgrades', async () => {
    const sub = await activeCampus();
    const DAY = 86400_000;
    const now = new Date();
    await db.update(billingSubscriptions).set({ currentPeriodEnd: new Date(now.getTime() + 3 * DAY) }).where(eq(billingSubscriptions.id, sub.id));
    expect((await runBillingRenewals(now)).reminders).toBe(1);
    expect((await runBillingRenewals(now)).reminders).toBe(0);
    const reminders = await db.select().from(notifications).where(and(eq(notifications.userId, orgAdmin.userId), eq(notifications.type, 'billing.renewal_reminder')));
    expect(reminders.length).toBeGreaterThanOrEqual(1);

    await db.update(billingSubscriptions).set({ currentPeriodEnd: new Date(now.getTime() - DAY) }).where(eq(billingSubscriptions.id, sub.id));
    expect((await runBillingRenewals(now)).pastDue).toBe(1);
    expect(await orgPlan(orgA)).toBe('campus'); // grace period
    const ov = await orgAdmin.get('/api/billing/overview');
    expect(ov.body.subscription).toMatchObject({ status: 'past_due' });
    expect(ov.body.subscription.graceEndsAt).toBeTruthy();

    await db.update(billingSubscriptions).set({ currentPeriodEnd: new Date(now.getTime() - 8 * DAY) }).where(eq(billingSubscriptions.id, sub.id));
    const r = await runBillingRenewals(now);
    expect(r).toMatchObject({ expired: 1, downgraded: 1 });
    expect(await orgPlan(orgA)).toBe('free');
    const [after] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, sub.id));
    expect(after.status).toBe('expired');
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'billing.plan_downgraded'), eq(auditLogs.targetId, sub.id)))).toHaveLength(1);
    expect(await runBillingRenewals(now)).toMatchObject({ expired: 0, downgraded: 0, pastDue: 0 }); // idempotent
  });

  it('renewing before the period ends extends from the current end', async () => {
    const sub = await activeCampus();
    const end = sub.currentPeriodEnd!;
    const ch = await newCheckout(orgAdmin);
    const pay = payRzp(ch.providerRef);
    await rzpWebhook(rzpPaidEvent(ch.providerRef, pay));
    const [after] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, sub.id));
    expect(after.currentPeriodEnd!.getTime()).toBe(addMonthUtc(end).getTime());
    expect(await db.select().from(billingPaymentRecords).where(eq(billingPaymentRecords.orgId, orgA))).toHaveLength(2);
  });

  it('cancel at period end: plan stays until the end, then moves to Free without grace', async () => {
    const sub = await activeCampus();
    expect((await member.post('/api/billing/subscription/cancel')).status).toBe(403);
    const r = await orgAdmin.post('/api/billing/subscription/cancel');
    expect(r.status).toBe(200);
    expect(r.body.subscription.cancelAtPeriodEnd).toBe(true);
    expect(await orgPlan(orgA)).toBe('campus');
    const resumed = await orgAdmin.post('/api/billing/subscription/resume');
    expect(resumed.body.subscription.cancelAtPeriodEnd).toBe(false);
    await orgAdmin.post('/api/billing/subscription/cancel');
    await db.update(billingSubscriptions).set({ currentPeriodEnd: new Date(Date.now() - 1000) }).where(eq(billingSubscriptions.id, sub.id));
    expect(await runBillingRenewals()).toMatchObject({ cancelledAtPeriodEnd: 1, downgraded: 1 });
    expect(await orgPlan(orgA)).toBe('free');
  });

  it('platform admin assignment with a provider configured is a labelled complimentary plan', async () => {
    const r = await platformAdmin.put(`/api/admin/orgs/${orgA}/plan`, { planId: 'company' });
    expect(r.status).toBe(200);
    expect(r.body.notice).toMatch(/Complimentary assignment/);
    const [sub] = await db.select().from(billingSubscriptions).where(and(eq(billingSubscriptions.orgId, orgA), eq(billingSubscriptions.status, 'active')));
    expect(sub).toMatchObject({ provider: 'manual', planId: 'company', currentPeriodEnd: null });
    expect(await runBillingRenewals(new Date(Date.now() + 400 * 86400_000))).toMatchObject({ downgraded: 0 });
    expect(await orgPlan(orgA)).toBe('company');
    expect((await orgAdmin.post('/api/billing/subscription/cancel')).status).toBe(409);
  });
});

describe('platform admin views', () => {
  beforeEach(() => setEnv(RZP));

  it('lists payments, subscriptions, events and provider status without secrets', async () => {
    await resetOrg(orgA);
    const ch = await newCheckout(orgAdmin);
    await rzpWebhook(rzpPaidEvent(ch.providerRef, payRzp(ch.providerRef)));
    const st = await platformAdmin.get('/api/billing/admin/status');
    expect(st.status).toBe(200);
    expect(st.body.mode).toBe('test');
    expect(st.body.prices.campus.INR).toEqual({ amountMinor: 499_900, isDefault: true });
    expect(JSON.stringify(st.body)).not.toMatch(/rzp-key-secret|rzp-webhook-secret|rzp_test_abc123/);
    const pays = await platformAdmin.get('/api/billing/admin/payments');
    expect(pays.status).toBe(200);
    expect(pays.body.total).toBeGreaterThan(0);
    expect(pays.body.items[0]).toHaveProperty('orgName');
    expect(pays.body.items.every((i: { url: string | null }) => i.url === null)).toBe(true);
    expect((await platformAdmin.get('/api/billing/admin/payments?status=paid')).body.items.every((i: { status: string }) => i.status === 'paid')).toBe(true);
    expect((await platformAdmin.get('/api/billing/admin/subscriptions')).status).toBe(200);
    expect((await platformAdmin.get('/api/billing/admin/events')).body.items.length).toBeGreaterThan(0);
    for (const p of ['/api/billing/admin/status', '/api/billing/admin/payments', '/api/billing/admin/subscriptions', '/api/billing/admin/events']) {
      expect((await orgAdmin.get(p)).status, p).toBe(403);
    }
  });
});
