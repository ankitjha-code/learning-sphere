import {
  type PaymentProvider,
  type ProviderStatus,
  type CreateCheckoutInput,
  type CreatedCheckout,
  type RemoteStatus,
  type ParsedWebhook,
  ProviderError,
  hmacHex,
  safeEqual,
  providerErrorMessage,
  PROVIDER_TIMEOUT_MS,
} from './types';
import { billingEnv, currencyFor } from './env';

/**
 * Stripe Checkout (hosted page, no Stripe.js in our app).
 * Docs: https://docs.stripe.com/api/checkout/sessions
 *  - create:   POST /v1/checkout/sessions (form-encoded, Bearer secret key)
 *  - retrieve: GET  /v1/checkout/sessions/:id?expand[]=payment_intent.latest_charge
 *  - expire:   POST /v1/checkout/sessions/:id/expire
 *  - webhook:  Stripe-Signature: t=<unix>,v1=<hex HMAC-SHA256(`${t}.${rawBody}`, endpoint secret)>
 */

const API = 'https://api.stripe.com/v1';
/** Stripe's own libraries use the same 5-minute default tolerance against replayed events. */
export const STRIPE_TOLERANCE_SECONDS = 300;

function keys() {
  return { secretKey: billingEnv('STRIPE_SECRET_KEY'), webhookSecret: billingEnv('STRIPE_WEBHOOK_SECRET') };
}

export function stripeMode(key: string | undefined): 'test' | 'live' | null {
  if (!key) return null;
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  return null;
}

/** Stripe's nested form encoding: a[b][0][c]=v. */
export function formEncode(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' && item !== null ? formEncode(item as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === 'object') formEncode(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call(method: 'GET' | 'POST', path: string, form?: Record<string, unknown>): Promise<Record<string, any>> {
  const { secretKey } = keys();
  if (!secretKey) throw new ProviderError('stripe', 'Stripe is not configured.');
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${secretKey}`, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? formEncode(form).toString() : undefined,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new ProviderError('stripe', 'Could not reach Stripe. Please try again in a moment.');
  }
  if (!res.ok) throw new ProviderError('stripe', `Stripe refused the request: ${await providerErrorMessage(res)}`, res.status);
  return (await res.json()) as Record<string, any>;
}

function parseSignatureHeader(header: string): { t: number | null; v1: string[] } {
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2).map((s) => s?.trim());
    if (k === 't' && v && /^\d+$/.test(v)) t = Number(v);
    if (k === 'v1' && v) v1.push(v);
  }
  return { t, v1 };
}

const idOf = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v ? String((v as { id: unknown }).id) : null);

export const stripe: PaymentProvider = {
  id: 'stripe',

  status(): ProviderStatus {
    const { secretKey, webhookSecret } = keys();
    const mode = stripeMode(secretKey);
    const problems: string[] = [];
    if (secretKey && !mode) problems.push('STRIPE_SECRET_KEY should start with sk_test_ or sk_live_ (or a restricted rk_ key).');
    if (secretKey && mode && !webhookSecret) problems.push('STRIPE_WEBHOOK_SECRET is not set: payments are confirmed only when the payer returns to the app.');
    return {
      id: 'stripe',
      label: 'Stripe',
      configured: !!(secretKey && mode),
      mode,
      webhookConfigured: !!webhookSecret,
      currency: currencyFor('stripe'),
      problems,
      env: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    };
  },

  async createCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout> {
    const sep = input.returnUrl.includes('?') ? '&' : '?';
    const session = await call('POST', '/checkout/sessions', {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amountMinor,
            product_data: { name: `${input.planName} plan (1 month)`, description: `LearnSphere Nexus plan for ${input.orgName}`.slice(0, 500) },
          },
        },
      ],
      client_reference_id: input.checkoutId,
      customer_email: input.customer.email,
      // Stripe replaces {CHECKOUT_SESSION_ID} with the real id when redirecting back.
      success_url: `${input.returnUrl}${sep}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: input.cancelUrl,
      metadata: { checkout_id: input.checkoutId, plan_id: input.planId, org_id: input.orgId ?? '' },
      payment_intent_data: { metadata: { checkout_id: input.checkoutId } },
    });
    if (!session.id || !session.url) throw new ProviderError('stripe', 'Stripe did not return a Checkout Session URL.');
    return { providerRef: String(session.id), url: String(session.url) };
  },

  async fetchStatus(providerRef: string): Promise<RemoteStatus> {
    const s = await call('GET', `/checkout/sessions/${encodeURIComponent(providerRef)}?expand[]=payment_intent.latest_charge`);
    const pi = s.payment_intent && typeof s.payment_intent === 'object' ? (s.payment_intent as Record<string, any>) : null;
    const charge = pi?.latest_charge && typeof pi.latest_charge === 'object' ? (pi.latest_charge as Record<string, any>) : null;
    const status: RemoteStatus['status'] = s.payment_status === 'paid' ? 'paid' : s.status === 'expired' ? 'expired' : 'pending';
    return {
      status,
      paymentId: idOf(s.payment_intent),
      amountMinor: s.amount_total != null ? Number(s.amount_total) : null,
      currency: s.currency ? String(s.currency).toUpperCase() : null,
      receiptUrl: charge?.receipt_url ?? null,
      reference: s.client_reference_id ?? null,
    };
  },

  async cancel(providerRef: string): Promise<boolean> {
    try {
      await call('POST', `/checkout/sessions/${encodeURIComponent(providerRef)}/expire`, {});
      return true;
    } catch (e) {
      if (e instanceof ProviderError && e.httpStatus && e.httpStatus < 500) return false;
      throw e;
    }
  },

  verifyWebhook(rawBody, headers, nowMs = Date.now()) {
    const { webhookSecret } = keys();
    if (!webhookSecret) return { ok: false, reason: 'not_configured' };
    const header = headers('stripe-signature');
    if (!header) return { ok: false, reason: 'missing_signature' };
    const { t, v1 } = parseSignatureHeader(header);
    if (t === null || v1.length === 0) return { ok: false, reason: 'malformed_signature' };
    if (Math.abs(Math.floor(nowMs / 1000) - t) > STRIPE_TOLERANCE_SECONDS) return { ok: false, reason: 'timestamp_outside_tolerance' };
    const expected = hmacHex(webhookSecret, Buffer.concat([Buffer.from(`${t}.`, 'utf8'), rawBody]));
    // Check every v1 (Stripe sends several during secret rotation) without short-circuiting.
    let ok = false;
    for (const sig of v1) ok = safeEqual(expected, sig) || ok;
    return ok ? { ok: true } : { ok: false, reason: 'bad_signature' };
  },

  parseWebhook(rawBody): ParsedWebhook {
    const event = JSON.parse(rawBody.toString('utf8')) as Record<string, any>;
    const type = String(event.type ?? 'unknown');
    const obj = (event.data?.object ?? {}) as Record<string, any>;
    const eventId = String(event.id ?? '');
    if (!eventId) throw new Error('Stripe event without id');
    const session = () => ({
      providerRef: obj.id ?? null,
      reference: obj.client_reference_id ?? obj.metadata?.checkout_id ?? null,
      paymentId: idOf(obj.payment_intent),
      amountMinor: obj.amount_total != null ? Number(obj.amount_total) : null,
      currency: obj.currency ? String(obj.currency).toUpperCase() : null,
    });
    switch (type) {
      case 'checkout.session.completed':
        // Delayed payment methods complete the session before money moves; wait for async_payment_succeeded.
        return { eventId, type, ...session(), outcome: obj.payment_status === 'paid' ? 'paid' : 'ignored' };
      case 'checkout.session.async_payment_succeeded':
        return { eventId, type, ...session(), outcome: 'paid' };
      case 'checkout.session.async_payment_failed':
        return { eventId, type, ...session(), outcome: 'failed', failureReason: 'The delayed payment failed.' };
      case 'checkout.session.expired':
        return { eventId, type, ...session(), outcome: 'expired' };
      case 'payment_intent.payment_failed':
        return {
          eventId,
          type,
          outcome: 'failed',
          providerRef: null,
          reference: obj.metadata?.checkout_id ?? null,
          paymentId: obj.id ?? null,
          failureReason: String(obj.last_payment_error?.message ?? 'The payment attempt failed.').slice(0, 300),
        };
      case 'charge.refunded':
        return {
          eventId,
          type,
          outcome: 'refunded',
          providerRef: null,
          reference: obj.metadata?.checkout_id ?? null,
          paymentId: idOf(obj.payment_intent),
          refundedMinor: obj.amount_refunded != null ? Number(obj.amount_refunded) : null,
          currency: obj.currency ? String(obj.currency).toUpperCase() : null,
        };
      default:
        return { eventId, type, outcome: 'ignored', providerRef: null, reference: null };
    }
  },
};
