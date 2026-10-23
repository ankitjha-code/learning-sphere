import type { PaymentProvider, ProviderId, ProviderStatus } from './types';
import { razorpay } from './razorpay';
import { stripe } from './stripe';

export * from './types';

/**
 * Payment providers behind one interface. Both use hosted pages, so no third-party script
 * runs in our app (the strict CSP stays intact) and card data never reaches our server.
 * This module only reads env vars; it must not import other billing or admin modules
 * (admin/plans.ts imports it for the billing mode label).
 */
export const PROVIDERS: Record<ProviderId, PaymentProvider> = { razorpay, stripe };
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function providerStatuses(): ProviderStatus[] {
  return PROVIDER_IDS.map((id) => PROVIDERS[id].status());
}

export function configuredProviders(): ProviderStatus[] {
  return providerStatuses().filter((p) => p.configured);
}

export function getProvider(id: string): PaymentProvider | null {
  return (PROVIDERS as Record<string, PaymentProvider>)[id] ?? null;
}

export type BillingMode = 'demonstration' | 'test' | 'live';

export const DEMO_NOTICE = 'Demonstration mode: no payments are processed; plan changes are free and immediate.';
export const TEST_NOTICE = 'Test mode: no real money moves. Use the provider’s test cards or test UPI IDs.';
export const LIVE_NOTICE = 'Live payments: charges are real and are processed on the provider’s secure hosted page.';

/**
 * demonstration: no provider configured (the original behaviour).
 * test: every configured provider uses test keys.
 * live: at least one configured provider uses live keys.
 */
export function billingMode(): { mode: BillingMode; notice: string } {
  const configured = configuredProviders();
  if (configured.length === 0) return { mode: 'demonstration', notice: DEMO_NOTICE };
  if (configured.some((p) => p.mode === 'live')) return { mode: 'live', notice: LIVE_NOTICE };
  return { mode: 'test', notice: TEST_NOTICE };
}
