/**
 * AI request quotas.
 * - Per user per UTC day (`usage_counters` scope=user, metric=ai.requests, period=YYYY-MM-DD).
 * - Per organization per UTC month (scope=org, period=YYYY-MM).
 * Defaults live in settings.ts (DEFAULT_LIMITS), overridable platform-wide via
 * system_settings 'ai.limits' and per organization via organizations.settings.ai
 * ({ monthlyRequests?, userDailyRequests? }).
 * Only successful provider calls count; failures are never charged to the user.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { organizations, usageCounters } from '../db/schema';
import { notify } from '../lib/notify';
import { getAiSettings, type AiLimits } from './settings';

export { DEFAULT_LIMITS } from './settings';

export const NOTICE_THRESHOLD = 0.8;

export function dayPeriod(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
export function monthPeriod(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

export function secondsUntilNextUtcDay(now = new Date()) {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}
export function secondsUntilNextUtcMonth(now = new Date()) {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

async function counter(scope: 'user' | 'org', scopeId: string, metric: string, period: string) {
  const [row] = await db
    .select({ value: usageCounters.value })
    .from(usageCounters)
    .where(and(eq(usageCounters.scope, scope), eq(usageCounters.scopeId, scopeId), eq(usageCounters.metric, metric), eq(usageCounters.period, period)));
  return row?.value ?? 0;
}

export async function bump(scope: 'user' | 'org', scopeId: string, metric: string, period: string, by = 1) {
  const [row] = await db
    .insert(usageCounters)
    .values({ scope, scopeId, metric, period, value: by })
    .onConflictDoUpdate({
      target: [usageCounters.scope, usageCounters.scopeId, usageCounters.metric, usageCounters.period],
      set: { value: sql`${usageCounters.value} + ${by}`, updatedAt: new Date() },
    })
    .returning({ value: usageCounters.value });
  return row.value;
}

/** Effective limits for a user acting within an (optional) organization. */
export async function effectiveLimits(orgId?: string | null): Promise<AiLimits> {
  const base = (await getAiSettings()).limits;
  if (!orgId) return base;
  const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId));
  const ai = (org?.settings?.ai ?? {}) as { monthlyRequests?: unknown; userDailyRequests?: unknown };
  const pick = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : fallback);
  return { userDailyRequests: pick(ai.userDailyRequests, base.userDailyRequests), orgMonthlyRequests: pick(ai.monthlyRequests, base.orgMonthlyRequests) };
}

export type QuotaCheck = { ok: true } | { ok: false; scope: 'user' | 'org'; message: string; retryAfterSeconds: number };

export async function checkQuota(userId: string | null, orgId?: string | null): Promise<QuotaCheck> {
  const limits = await effectiveLimits(orgId);
  if (userId) {
    const used = await counter('user', userId, 'ai.requests', dayPeriod());
    if (used >= limits.userDailyRequests)
      return {
        ok: false,
        scope: 'user',
        message: `You have used all ${limits.userDailyRequests} AI requests for today. The limit resets at 00:00 UTC.`,
        retryAfterSeconds: secondsUntilNextUtcDay(),
      };
  }
  if (orgId) {
    const used = await counter('org', orgId, 'ai.requests', monthPeriod());
    if (used >= limits.orgMonthlyRequests)
      return {
        ok: false,
        scope: 'org',
        message: `Your organization has used all ${limits.orgMonthlyRequests} AI requests for this month. Ask an organization admin, or try again next month.`,
        retryAfterSeconds: secondsUntilNextUtcMonth(),
      };
  }
  return { ok: true };
}

/** Counts one successful request (and its tokens) and sends the 80% notice once per day. */
export async function chargeRequest(userId: string | null, orgId: string | null | undefined, tokens: number) {
  const day = dayPeriod();
  const month = monthPeriod();
  if (userId) {
    const used = await bump('user', userId, 'ai.requests', day);
    if (tokens > 0) await bump('user', userId, 'ai.tokens', day, tokens);
    const limits = await effectiveLimits(orgId);
    if (limits.userDailyRequests > 0 && used >= Math.ceil(limits.userDailyRequests * NOTICE_THRESHOLD)) {
      // The first request that crosses the threshold claims today's notice; later ones see value > 1.
      const claimed = await bump('user', userId, 'ai.quota_notice', day);
      if (claimed === 1) {
        await notify(userId, {
          type: 'ai.quota',
          category: 'general',
          title: 'You have used 80% of today’s AI requests',
          body: `${used} of ${limits.userDailyRequests} requests used. The limit resets at 00:00 UTC. Everything else keeps working without AI.`,
          link: '/app/ai',
          orgId: orgId ?? null,
          email: false,
        }).catch(() => {});
      }
    }
  }
  if (orgId) {
    await bump('org', orgId, 'ai.requests', month);
    if (tokens > 0) await bump('org', orgId, 'ai.tokens', month, tokens);
  }
}

export async function remainingQuota(userId: string, orgId?: string | null) {
  const limits = await effectiveLimits(orgId);
  const used = await counter('user', userId, 'ai.requests', dayPeriod());
  const orgUsed = orgId ? await counter('org', orgId, 'ai.requests', monthPeriod()) : null;
  return {
    user: { limit: limits.userDailyRequests, used, remaining: Math.max(0, limits.userDailyRequests - used), resetsInSeconds: secondsUntilNextUtcDay() },
    org: orgId ? { limit: limits.orgMonthlyRequests, used: orgUsed!, remaining: Math.max(0, limits.orgMonthlyRequests - orgUsed!), resetsInSeconds: secondsUntilNextUtcMonth() } : null,
  };
}
