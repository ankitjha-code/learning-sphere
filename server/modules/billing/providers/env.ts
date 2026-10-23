import { config } from '../../../lib/config';

/**
 * Billing env vars are read at call time (not cached) so an operator can rotate keys with a
 * restart and tests can switch providers. config() is called first so a local .env is loaded.
 */
export function billingEnv(name: string): string | undefined {
  config();
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** BILLING_CURRENCY overrides both providers; defaults are INR for Razorpay and USD for Stripe. */
export function currencyFor(provider: 'razorpay' | 'stripe'): string {
  const forced = billingEnv('BILLING_CURRENCY');
  if (forced && /^[A-Za-z]{3}$/.test(forced)) return forced.toUpperCase();
  return provider === 'razorpay' ? 'INR' : 'USD';
}
