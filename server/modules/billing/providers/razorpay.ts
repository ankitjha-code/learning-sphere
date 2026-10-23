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
import { sha256 } from '../../../lib/crypto';

/**
 * Razorpay Payment Links (hosted page, no script in our app).
 * Docs: https://razorpay.com/docs/api/payments/payment-links/
 *  - create:  POST /v1/payment_links (Basic auth key_id:key_secret, amount in paise)
 *  - fetch:   GET  /v1/payment_links/:id
 *  - cancel:  POST /v1/payment_links/:id/cancel
 *  - webhook: X-Razorpay-Signature = hex HMAC-SHA256(raw body, webhook secret)
 *  - callback query: razorpay_signature = hex HMAC-SHA256(
 *      `${payment_link_id}|${payment_link_reference_id}|${payment_link_status}|${payment_id}`, key_secret)
 */

const API = 'https://api.razorpay.com/v1';

function keys() {
  return { keyId: billingEnv('RAZORPAY_KEY_ID'), keySecret: billingEnv('RAZORPAY_KEY_SECRET'), webhookSecret: billingEnv('RAZORPAY_WEBHOOK_SECRET') };
}

export function razorpayMode(keyId: string | undefined): 'test' | 'live' | null {
  if (!keyId) return null;
  if (keyId.startsWith('rzp_test_')) return 'test';
  if (keyId.startsWith('rzp_live_')) return 'live';
  return null;
}

function authHeader() {
  const { keyId, keySecret } = keys();
  if (!keyId || !keySecret) throw new ProviderError('razorpay', 'Razorpay is not configured.');
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Record<string, any>> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: authHeader(), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError('razorpay', 'Could not reach Razorpay. Please try again in a moment.');
  }
  if (!res.ok) throw new ProviderError('razorpay', `Razorpay refused the request: ${await providerErrorMessage(res)}`, res.status);
  return (await res.json()) as Record<string, any>;
}

function mapLinkStatus(link: Record<string, any>): RemoteStatus['status'] {
  const s = String(link.status ?? '');
  if (s === 'paid' && Number(link.amount_paid ?? 0) >= Number(link.amount ?? Infinity)) return 'paid';
  if (s === 'expired') return 'expired';
  if (s === 'cancelled') return 'cancelled';
  return 'pending'; // created | partially_paid (partial payments are disabled on our links)
}

/** Verifies the query string Razorpay appends to callback_url. */
export function verifyRazorpayCallback(q: Record<string, string | undefined>): boolean {
  const { keySecret } = keys();
  const sig = q.razorpay_signature;
  if (!keySecret || !sig) return false;
  const payload = `${q.razorpay_payment_link_id ?? ''}|${q.razorpay_payment_link_reference_id ?? ''}|${q.razorpay_payment_link_status ?? ''}|${q.razorpay_payment_id ?? ''}`;
  return safeEqual(hmacHex(keySecret, payload), sig);
}

export const razorpay: PaymentProvider = {
  id: 'razorpay',

  status(): ProviderStatus {
    const { keyId, keySecret, webhookSecret } = keys();
    const mode = razorpayMode(keyId);
    const problems: string[] = [];
    if (keyId && !mode) problems.push('RAZORPAY_KEY_ID should start with rzp_test_ or rzp_live_.');
    if (keyId && !keySecret) problems.push('RAZORPAY_KEY_SECRET is missing.');
    if (!keyId && keySecret) problems.push('RAZORPAY_KEY_ID is missing.');
    if (keyId && keySecret && !webhookSecret) problems.push('RAZORPAY_WEBHOOK_SECRET is not set: payments are confirmed only when the payer returns to the app.');
    return {
      id: 'razorpay',
      label: 'Razorpay',
      configured: !!(keyId && keySecret && mode),
      mode,
      webhookConfigured: !!webhookSecret,
      currency: currencyFor('razorpay'),
      problems,
      env: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
    };
  },

  async createCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout> {
    const link = await call('POST', '/payment_links', {
      amount: input.amountMinor,
      currency: input.currency,
      accept_partial: false,
      reference_id: input.checkoutId,
      description: `${input.planName} plan, 1 month, for ${input.orgName}`.slice(0, 2048),
      customer: { name: input.customer.name, email: input.customer.email },
      notify: { sms: false, email: false },
      reminder_enable: false,
      // A link stays usable for one day; the renewal job marks stale checkouts after that.
      expire_by: Math.floor(Date.now() / 1000) + 86400,
      callback_url: input.returnUrl,
      callback_method: 'get',
      notes: { checkout_id: input.checkoutId, plan_id: input.planId, org_id: input.orgId ?? '' },
    });
    if (!link.id || !link.short_url) throw new ProviderError('razorpay', 'Razorpay did not return a payment link.');
    return { providerRef: String(link.id), url: String(link.short_url) };
  },

  async fetchStatus(providerRef: string): Promise<RemoteStatus> {
    const link = await call('GET', `/payment_links/${encodeURIComponent(providerRef)}`);
    const payments = Array.isArray(link.payments) ? (link.payments as Record<string, any>[]) : [];
    const captured = payments.find((p) => p.status === 'captured') ?? payments[payments.length - 1];
    return {
      status: mapLinkStatus(link),
      paymentId: captured?.payment_id ?? null,
      amountMinor: link.amount_paid != null ? Number(link.amount_paid) : null,
      currency: link.currency ?? null,
      receiptUrl: null, // Razorpay emails the receipt to the payer; there is no public receipt URL on the link.
      reference: link.reference_id ?? null,
    };
  },

  async cancel(providerRef: string): Promise<boolean> {
    try {
      await call('POST', `/payment_links/${encodeURIComponent(providerRef)}/cancel`, {});
      return true;
    } catch (e) {
      if (e instanceof ProviderError && e.httpStatus && e.httpStatus < 500) return false;
      throw e;
    }
  },

  verifyWebhook(rawBody, headers) {
    const { webhookSecret } = keys();
    if (!webhookSecret) return { ok: false, reason: 'not_configured' };
    const sig = headers('x-razorpay-signature');
    if (!sig) return { ok: false, reason: 'missing_signature' };
    return safeEqual(hmacHex(webhookSecret, rawBody), sig) ? { ok: true } : { ok: false, reason: 'bad_signature' };
  },

  parseWebhook(rawBody, headers): ParsedWebhook {
    const body = JSON.parse(rawBody.toString('utf8')) as Record<string, any>;
    const type = String(body.event ?? 'unknown');
    // Razorpay sends a unique x-razorpay-event-id header; fall back to a body hash.
    const eventId = headers('x-razorpay-event-id') ?? `body:${sha256(rawBody)}`;
    const link = body.payload?.payment_link?.entity as Record<string, any> | undefined;
    const payment = body.payload?.payment?.entity as Record<string, any> | undefined;
    const refund = body.payload?.refund?.entity as Record<string, any> | undefined;
    const base = { eventId, type, providerRef: link?.id ?? null, reference: link?.reference_id ?? payment?.notes?.checkout_id ?? null };
    switch (type) {
      case 'payment_link.paid':
        return {
          ...base,
          outcome: 'paid',
          paymentId: payment?.id ?? null,
          amountMinor: link?.amount_paid != null ? Number(link.amount_paid) : payment?.amount != null ? Number(payment.amount) : null,
          currency: link?.currency ?? payment?.currency ?? null,
        };
      case 'payment_link.expired':
        return { ...base, outcome: 'expired' };
      case 'payment_link.cancelled':
        return { ...base, outcome: 'cancelled' };
      case 'payment.failed':
        return { ...base, outcome: 'failed', paymentId: payment?.id ?? null, failureReason: String(payment?.error_description ?? 'The payment attempt failed.').slice(0, 300) };
      case 'refund.processed':
        // refundedMinor is the cumulative amount refunded for the payment.
        return {
          ...base,
          outcome: 'refunded',
          paymentId: refund?.payment_id ?? payment?.id ?? null,
          refundedMinor: payment?.amount_refunded != null ? Number(payment.amount_refunded) : refund?.amount != null ? Number(refund.amount) : null,
          currency: refund?.currency ?? payment?.currency ?? null,
        };
      default:
        return { ...base, outcome: 'ignored' };
    }
  },
};
