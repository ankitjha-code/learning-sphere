import type { RouteObject } from 'react-router-dom';
import { page } from '@/lib/lazy';

export const routes: RouteObject[] = [
  { path: 'billing', lazy: page(() => import('./BillingPage')) },
  // Razorpay callback_url and Stripe success_url / cancel_url point here.
  { path: 'billing/return', lazy: page(() => import('./BillingReturnPage')) },
  { path: 'billing/history', lazy: page(() => import('./BillingHistoryPage')) },
  // Platform admins (every endpoint re-checks the role on the server).
  { path: 'billing/admin', lazy: page(() => import('./BillingAdminPage')) },
];
