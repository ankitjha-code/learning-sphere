import { enqueue } from '../../jobs/queue';

/**
 * Minimal recurring scheduling on top of the idempotent queue: each period gets
 * exactly one job (idempotency key = type + period bucket). Handlers call
 * `scheduleNext` when they finish, and routes call `ensureScheduled` lazily so a
 * fresh process starts the chain without touching the server entry point.
 */
export async function scheduleNext(type: string, periodMs: number) {
  const bucket = Math.floor(Date.now() / periodMs) + 1;
  await enqueue(type, {}, { idempotencyKey: `${type}:${bucket}`, runAt: new Date(bucket * periodMs), maxAttempts: 3 });
}

const started = new Set<string>();

export function ensureScheduled(type: string, periodMs: number) {
  if (started.has(type) || process.env.VITEST) return;
  started.add(type);
  const bucket = Math.floor(Date.now() / periodMs);
  enqueue(type, {}, { idempotencyKey: `${type}:${bucket}`, runAt: new Date(), maxAttempts: 3 }).catch(() => started.delete(type));
}
