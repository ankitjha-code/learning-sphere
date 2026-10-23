import crypto from 'node:crypto';

export type ProviderId = 'razorpay' | 'stripe';
export type ProviderMode = 'test' | 'live';

export type ProviderStatus = {
  id: ProviderId;
  label: string;
  /** Usable for checkouts: API keys present and recognisable. */
  configured: boolean;
  mode: ProviderMode | null;
  /** Webhook secret present (payments can be confirmed without the payer returning to the app). */
  webhookConfigured: boolean;
  currency: string;
  /** Plain-language problems (never includes secret values). */
  problems: string[];
  /** Env var names this provider reads. */
  env: string[];
};

export type CreateCheckoutInput = {
  checkoutId: string;
  amountMinor: number;
  currency: string;
  planId: string;
  planName: string;
  orgId: string | null;
  orgName: string;
  customer: { name: string; email: string };
  returnUrl: string; // our /app/billing/return?checkout=<id>
  cancelUrl: string;
};

export type CreatedCheckout = { providerRef: string; url: string };

export type RemoteStatus = {
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';
  paymentId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  receiptUrl?: string | null;
  /** Our checkout id as the provider reports it (reference_id / client_reference_id). */
  reference?: string | null;
};

export type WebhookOutcome = 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded' | 'ignored';

export type ParsedWebhook = {
  eventId: string;
  type: string;
  outcome: WebhookOutcome;
  /** Provider ref of the checkout (payment link id / session id) when the event carries it. */
  providerRef?: string | null;
  /** Our checkout id (reference_id / client_reference_id / metadata.checkout_id). */
  reference?: string | null;
  paymentId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  receiptUrl?: string | null;
  refundedMinor?: number | null;
  failureReason?: string | null;
};

export interface PaymentProvider {
  id: ProviderId;
  status(): ProviderStatus;
  createCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout>;
  fetchStatus(providerRef: string): Promise<RemoteStatus>;
  /** Best-effort: stop a hosted page from accepting payment. Returns false when the provider refused (e.g. already paid). */
  cancel(providerRef: string): Promise<boolean>;
  verifyWebhook(rawBody: Buffer, headers: (name: string) => string | undefined, nowMs?: number): { ok: true } | { ok: false; reason: string };
  parseWebhook(rawBody: Buffer, headers: (name: string) => string | undefined): ParsedWebhook;
}

export class ProviderError extends Error {
  constructor(
    public provider: ProviderId,
    message: string,
    public httpStatus?: number,
  ) {
    super(message);
  }
}

// ---------- helpers ----------

export function hmacHex(secret: string, data: string | Buffer): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/** Constant-time comparison of two hex/ascii strings. Different lengths are simply unequal. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // Still spend comparable time.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

export const PROVIDER_TIMEOUT_MS = 15_000;

/** Reads a provider error body without ever echoing request credentials. */
export async function providerErrorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { description?: string; message?: string; code?: string } };
    return (j.error?.description ?? j.error?.message ?? j.error?.code ?? `HTTP ${res.status}`).slice(0, 300);
  } catch {
    return `HTTP ${res.status}`;
  }
}
