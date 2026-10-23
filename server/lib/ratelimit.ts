import { tooMany } from './errors';

// Fixed-window in-memory limiter. Good for a single instance; a multi-instance
// deployment should move this to Postgres or Redis (documented in OPERATIONS.md).
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  w.count += 1;
  if (w.count > limit) {
    throw tooMany(undefined, Math.ceil((w.resetAt - now) / 1000));
  }
}

export function resetRateLimits() {
  windows.clear();
}

setInterval(() => {
  const now = Date.now();
  for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
}, 60_000).unref();
