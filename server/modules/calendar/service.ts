/**
 * Calendar sync: private ICS feed, OAuth connections (Google, Microsoft) and the one-way push
 * engine. LearnSphere is the source of truth; we write only to a dedicated calendar we created
 * and never read or modify the user's other calendars.
 */
import crypto from 'node:crypto';
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { calendarConnections, calendarEventMaps, calendarOauthStates, calendarSettings, users } from '../../db/schema';
import { config } from '../../lib/config';
import { decryptSecret, encryptSecret, randomToken, sha256 } from '../../lib/crypto';
import { notify } from '../../lib/notify';
import { enqueue } from '../../jobs/queue';
import { calendarFor } from '../workspace/routes';
import { buildIcs, CALENDAR_NAME, CALENDAR_TYPES, specHash, syncWindow, toEventSpec, type CalendarType, type EventSpec } from './ics';
import { googleProvider } from './providers/google';
import { microsoftProvider } from './providers/microsoft';
import { ProviderError, type CalendarProvider, type ProviderId, type TokenSet } from './providers/types';

export const PROVIDERS: Record<ProviderId, CalendarProvider> = { google: googleProvider, microsoft: microsoftProvider };
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export type Connection = typeof calendarConnections.$inferSelect;

const appUrl = () => config().APP_URL.replace(/\/+$/, '');
export const redirectUri = (p: ProviderId) => `${appUrl()}/api/calendar/oauth/${p}/callback`;
export const feedUrl = (token: string) => `${appUrl()}/api/calendar/ics/${token}.ics`;

/** Google and Outlook fetch subscribed feeds from their own servers, so a local address cannot work for them. */
export function isLocalAppUrl() {
  try {
    const h = new URL(appUrl()).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local') || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h);
  } catch {
    return true;
  }
}

// ======================================================================
// Settings + ICS feed
// ======================================================================

export async function getSettings(userId: string) {
  const [row] = await db.select().from(calendarSettings).where(eq(calendarSettings.userId, userId));
  return row ?? null;
}

async function ensureSettings(userId: string) {
  await db.insert(calendarSettings).values({ userId }).onConflictDoNothing();
  return (await getSettings(userId))!;
}

export function normalizeTypes(types: readonly string[] | null | undefined): CalendarType[] {
  const set = new Set(types ?? CALENDAR_TYPES);
  return CALENDAR_TYPES.filter((t) => set.has(t));
}

export function feedView(s: typeof calendarSettings.$inferSelect | null) {
  let url: string | null = null;
  if (s?.feedEnabled && s.feedTokenEnc) {
    try {
      url = feedUrl(decryptSecret(s.feedTokenEnc));
    } catch {
      url = null; // APP_SECRET changed: the user regenerates
    }
  }
  return {
    enabled: !!s?.feedEnabled && !!url,
    url,
    webcalUrl: url ? url.replace(/^https?:\/\//, 'webcal://') : null,
    createdAt: s?.feedTokenCreatedAt ?? null,
    lastAccessedAt: s?.feedLastAccessedAt ?? null,
  };
}

/** Issues a new token (the old URL stops working immediately) and enables the feed. */
export async function rotateFeedToken(userId: string) {
  await ensureSettings(userId);
  const token = randomToken(32);
  await db
    .update(calendarSettings)
    .set({ feedEnabled: true, feedTokenHash: sha256(token), feedTokenEnc: encryptSecret(token), feedTokenCreatedAt: new Date(), feedLastAccessedAt: null, updatedAt: new Date() })
    .where(eq(calendarSettings.userId, userId));
  return token;
}

export async function enableFeed(userId: string) {
  const s = await ensureSettings(userId);
  if (s.feedTokenHash && s.feedTokenEnc) {
    await db.update(calendarSettings).set({ feedEnabled: true, updatedAt: new Date() }).where(eq(calendarSettings.userId, userId));
    return;
  }
  await rotateFeedToken(userId);
}

/** Disabling also forgets the token, so re-enabling always issues a fresh URL. */
export async function disableFeed(userId: string) {
  await ensureSettings(userId);
  await db
    .update(calendarSettings)
    .set({ feedEnabled: false, feedTokenHash: null, feedTokenEnc: null, feedTokenCreatedAt: null, updatedAt: new Date() })
    .where(eq(calendarSettings.userId, userId));
}

export async function setTypes(userId: string, types: CalendarType[]) {
  await ensureSettings(userId);
  await db.update(calendarSettings).set({ types: normalizeTypes(types), updatedAt: new Date() }).where(eq(calendarSettings.userId, userId));
}

/** Resolves a feed token to its owner, or null (unknown, disabled, or account not active). */
export async function userForFeedToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const [row] = await db
    .select({ s: calendarSettings, status: users.status })
    .from(calendarSettings)
    .innerJoin(users, eq(users.id, calendarSettings.userId))
    .where(and(eq(calendarSettings.feedTokenHash, sha256(token)), eq(calendarSettings.feedEnabled, true)));
  if (!row || row.status !== 'active') return null;
  return row.s;
}

export async function eventSpecsFor(userId: string, types: readonly string[], now = new Date()): Promise<EventSpec[]> {
  const { from, to } = syncWindow(now);
  const allowed = new Set(normalizeTypes(types));
  const items = await calendarFor(userId, from, to);
  return items.filter((it) => allowed.has(it.type)).map((it) => toEventSpec(it, appUrl()));
}

export async function feedIcs(settings: typeof calendarSettings.$inferSelect, opts: { preview?: boolean } = {}) {
  const specs = await eventSpecsFor(settings.userId, settings.types);
  // Record that a calendar app is fetching the feed (at most every 5 minutes) so the owner can see it works.
  if (!opts.preview && (!settings.feedLastAccessedAt || Date.now() - new Date(settings.feedLastAccessedAt).getTime() > 5 * 60_000)) {
    await db.update(calendarSettings).set({ feedLastAccessedAt: new Date() }).where(eq(calendarSettings.userId, settings.userId));
  }
  return buildIcs(specs);
}

// ======================================================================
// OAuth (authorization code + PKCE, state bound to the browser session)
// ======================================================================

const STATE_TTL_MS = 10 * 60_000;

export function pkcePair() {
  const verifier = randomToken(48); // 64 base64url chars (RFC 7636: 43-128)
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function startOAuth(userId: string, sessionId: string, provider: ProviderId) {
  const p = PROVIDERS[provider];
  const state = randomToken(32);
  const { verifier, challenge } = pkcePair();
  await db.delete(calendarOauthStates).where(lt(calendarOauthStates.expiresAt, new Date()));
  await db.insert(calendarOauthStates).values({
    userId,
    sessionId,
    provider,
    stateHash: sha256(state),
    codeVerifierEnc: encryptSecret(verifier),
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });
  return p.authorizeUrl({ state, codeChallenge: challenge, redirectUri: redirectUri(provider) });
}

/** Consumes the state (one-time) and returns the PKCE verifier only if it belongs to this user, session and provider. */
export async function consumeState(userId: string, sessionId: string, provider: ProviderId, state: string) {
  if (!state || state.length > 200) return null;
  const [row] = await db.delete(calendarOauthStates).where(eq(calendarOauthStates.stateHash, sha256(state))).returning();
  if (!row) return null;
  if (row.userId !== userId || row.sessionId !== sessionId || row.provider !== provider || new Date(row.expiresAt) < new Date()) return null;
  return decryptSecret(row.codeVerifierEnc);
}

export async function saveConnection(userId: string, provider: ProviderId, t: TokenSet) {
  if (!t.refreshToken) throw new ProviderError('other', 'The provider did not return a refresh token. Remove LearnSphere Nexus from your account permissions and connect again.');
  const [existing] = await db.select().from(calendarConnections).where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, provider)));
  const sameAccount = existing && (!existing.accountEmail || !t.email || existing.accountEmail.toLowerCase() === t.email.toLowerCase());
  const values = {
    accountEmail: t.email ?? existing?.accountEmail ?? null,
    scope: t.scope ?? null,
    refreshTokenEnc: encryptSecret(t.refreshToken),
    accessTokenEnc: encryptSecret(t.accessToken),
    accessTokenExpiresAt: new Date(Date.now() + t.expiresIn * 1000),
    status: 'active',
    lastSyncError: null,
    nextRetryAt: null,
    consecutiveFailures: 0,
    lastFingerprint: null,
    updatedAt: new Date(),
  };
  if (existing) {
    if (!sameAccount) {
      // A different account: its calendar and events are unrelated to the previous mappings.
      await db.delete(calendarEventMaps).where(eq(calendarEventMaps.connectionId, existing.id));
    }
    const [row] = await db
      .update(calendarConnections)
      .set({ ...values, ...(sameAccount ? {} : { externalCalendarId: null, lastSyncStatus: 'never', lastSyncAt: null, lastSyncStats: null }) })
      .where(eq(calendarConnections.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db.insert(calendarConnections).values({ userId, provider, ...values }).returning();
  return row;
}

export function connectionView(c: Connection | undefined | null) {
  if (!c) return null;
  return {
    id: c.id,
    provider: c.provider as ProviderId,
    accountEmail: c.accountEmail,
    status: c.status as 'active' | 'needs_reconnect',
    calendarCreated: !!c.externalCalendarId,
    lastSyncAt: c.lastSyncAt,
    lastSyncStatus: c.lastSyncStatus,
    lastSyncError: c.lastSyncError,
    lastSyncStats: c.lastSyncStats,
    nextRetryAt: c.nextRetryAt,
    syncing: !!c.syncLockedUntil && new Date(c.syncLockedUntil) > new Date(),
    connectedAt: c.createdAt,
  };
}

// ======================================================================
// Sync engine
// ======================================================================

export function enqueueSync(connectionId: string, opts: { reason: 'manual' | 'scheduled' | 'connect' | 'retry'; runAt?: Date; force?: boolean } = { reason: 'manual' }) {
  const runAt = opts.runAt ?? new Date();
  const bucket = opts.reason === 'scheduled' ? Math.floor(Date.now() / SWEEP_PERIOD_MS) : Math.floor(runAt.getTime() / 15_000);
  return enqueue('calendar.sync', { connectionId, force: !!opts.force }, { idempotencyKey: `calendar.sync:${connectionId}:${opts.reason}:${bucket}`, runAt, maxAttempts: 2 });
}

export const SWEEP_PERIOD_MS = 15 * 60_000;
/** Even when nothing changed, re-push everything this often (repairs drift). */
const FULL_SYNC_MS = 6 * 3600_000;
const LOCK_MS = 5 * 60_000;

async function markNeedsReconnect(c: Connection, reason: string) {
  const [row] = await db
    .update(calendarConnections)
    .set({ status: 'needs_reconnect', accessTokenEnc: null, accessTokenExpiresAt: null, lastSyncStatus: 'error', lastSyncError: reason, lastSyncAt: new Date(), syncLockedUntil: null, updatedAt: new Date() })
    .where(and(eq(calendarConnections.id, c.id), eq(calendarConnections.status, 'active')))
    .returning();
  if (row) {
    const label = PROVIDERS[c.provider as ProviderId]?.label ?? 'your calendar';
    await notify(c.userId, {
      type: 'calendar.reconnect',
      category: 'general',
      title: `Reconnect ${label}`,
      body: `LearnSphere Nexus can no longer update ${label}. Access was revoked or expired. Reconnect it in Settings, Calendar.`,
      link: '/app/settings/calendar',
    });
  }
}

/** A valid access token, refreshing (and storing a rotated refresh token) when needed. */
export async function accessTokenFor(c: Connection, forceRefresh = false): Promise<string> {
  if (!forceRefresh && c.accessTokenEnc && c.accessTokenExpiresAt && new Date(c.accessTokenExpiresAt).getTime() - Date.now() > 60_000) {
    return decryptSecret(c.accessTokenEnc);
  }
  if (!c.refreshTokenEnc) throw new ProviderError('auth', 'No refresh token stored. Connect again.');
  const t = await PROVIDERS[c.provider as ProviderId].refresh(decryptSecret(c.refreshTokenEnc));
  const patch = {
    accessTokenEnc: encryptSecret(t.accessToken),
    accessTokenExpiresAt: new Date(Date.now() + t.expiresIn * 1000),
    ...(t.refreshToken ? { refreshTokenEnc: encryptSecret(t.refreshToken) } : {}),
    updatedAt: new Date(),
  };
  await db.update(calendarConnections).set(patch).where(eq(calendarConnections.id, c.id));
  Object.assign(c, patch);
  return t.accessToken;
}

type Stats = { created: number; updated: number; deleted: number; unchanged: number; failed: number };

class CalendarMissing extends Error {}

export async function syncConnection(connectionId: string, opts: { force?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  // Per-connection lock so the sweep and "Sync now" never run the same connection concurrently.
  const [c] = await db
    .update(calendarConnections)
    .set({ syncLockedUntil: new Date(Date.now() + LOCK_MS) })
    .where(
      and(
        eq(calendarConnections.id, connectionId),
        eq(calendarConnections.status, 'active'),
        or(isNull(calendarConnections.syncLockedUntil), lt(calendarConnections.syncLockedUntil, new Date())),
      ),
    )
    .returning();
  if (!c) return { skipped: 'busy_or_inactive' as const };
  const provider = PROVIDERS[c.provider as ProviderId];
  if (!provider?.configured()) {
    await finish(c, { lastSyncStatus: 'error', lastSyncError: `${provider?.label ?? c.provider} is not configured on this server.`, lastSyncAt: new Date() });
    return { skipped: 'not_configured' as const };
  }

  const stats: Stats = { created: 0, updated: 0, deleted: 0, unchanged: 0, failed: 0 };
  let token: string;
  try {
    token = await accessTokenFor(c);
  } catch (e) {
    return handleFatal(c, e, stats);
  }

  try {
    const settings = await getSettings(c.userId);
    const specs = await eventSpecsFor(c.userId, settings?.types ?? CALENDAR_TYPES, now);
    const hashes = new Map(specs.map((s) => [s.key, specHash(s)]));
    const fingerprint = sha256([c.externalCalendarId ?? '', ...[...hashes].map(([k, h]) => `${k}:${h}`).sort()].join('|'));
    const recentFull = !!c.lastFullSyncAt && now.getTime() - new Date(c.lastFullSyncAt).getTime() < FULL_SYNC_MS;
    if (!opts.force && c.externalCalendarId && c.lastFingerprint === fingerprint && recentFull) {
      await finish(c, { lastSyncAt: new Date(), lastSyncStatus: 'ok', lastSyncError: null, lastSyncStats: { ...stats, unchanged: specs.length } });
      return { unchanged: true, stats: { ...stats, unchanged: specs.length } };
    }

    let firstError: string | null = null;
    const run = async () => {
      if (!c.externalCalendarId) {
        const calId = await provider.createCalendar(token, CALENDAR_NAME);
        await db.delete(calendarEventMaps).where(eq(calendarEventMaps.connectionId, c.id));
        await db.update(calendarConnections).set({ externalCalendarId: calId, updatedAt: new Date() }).where(eq(calendarConnections.id, c.id));
        c.externalCalendarId = calId;
      }
      const calId = c.externalCalendarId;
      const maps = await db.select().from(calendarEventMaps).where(eq(calendarEventMaps.connectionId, c.id));
      const byKey = new Map(maps.map((m) => [m.itemKey, m]));

      for (const spec of specs) {
        const hash = hashes.get(spec.key)!;
        const m = byKey.get(spec.key);
        // Unchanged items are skipped, except on the periodic full sync, which re-pushes everything to repair
        // events edited or deleted on the provider side.
        if (m && m.contentHash === hash && recentFull) {
          stats.unchanged++;
          continue;
        }
        try {
          let eventId = m?.externalEventId;
          if (eventId) {
            try {
              await provider.updateEvent(token, calId, eventId, spec);
              stats.updated++;
            } catch (e) {
              if (!(e instanceof ProviderError) || (e.kind !== 'not_found' && e.kind !== 'gone')) throw e;
              eventId = undefined; // deleted on the provider side: recreate below
            }
          }
          if (!eventId) {
            try {
              eventId = await provider.createEvent(token, calId, spec, `${c.id}:${spec.key}`);
            } catch (e) {
              if (e instanceof ProviderError && e.kind === 'not_found') throw new CalendarMissing();
              throw e;
            }
            stats.created++;
          }
          await db
            .insert(calendarEventMaps)
            .values({ connectionId: c.id, itemKey: spec.key, externalEventId: eventId, contentHash: hash, startsAt: spec.start })
            .onConflictDoUpdate({
              target: [calendarEventMaps.connectionId, calendarEventMaps.itemKey],
              set: { externalEventId: eventId, contentHash: hash, startsAt: spec.start, updatedAt: new Date() },
            });
        } catch (e) {
          if (e instanceof CalendarMissing || (e instanceof ProviderError && (e.kind === 'auth' || e.kind === 'rate_limited'))) throw e;
          stats.failed++;
          firstError ??= e instanceof Error ? e.message : 'Unknown error';
        }
      }

      // Items that disappeared (deleted, cancelled, filtered out) are removed. Items that merely aged out
      // of the window keep their event as history; only our mapping row is dropped.
      const windowStart = syncWindow(now).from;
      for (const m of maps) {
        if (hashes.has(m.itemKey)) continue;
        if (new Date(m.startsAt) < windowStart) {
          await db.delete(calendarEventMaps).where(eq(calendarEventMaps.id, m.id));
          continue;
        }
        try {
          await provider.deleteEvent(token, calId, m.externalEventId);
          await db.delete(calendarEventMaps).where(eq(calendarEventMaps.id, m.id));
          stats.deleted++;
        } catch (e) {
          if (e instanceof ProviderError && (e.kind === 'auth' || e.kind === 'rate_limited')) throw e;
          stats.failed++;
          firstError ??= e instanceof Error ? e.message : 'Unknown error';
        }
      }
    };

    let recreated = false;
    let refreshed = false;
    for (;;) {
      try {
        await run();
        break;
      } catch (e) {
        stats.unchanged = stats.failed = 0;
        firstError = null;
        if (e instanceof CalendarMissing && !recreated) {
          // The user deleted our calendar: create a fresh one and push everything again (once).
          recreated = true;
          c.externalCalendarId = null;
          continue;
        }
        if (e instanceof ProviderError && e.kind === 'auth' && !refreshed) {
          // A cached access token can be revoked before it expires: refresh once, then give up.
          refreshed = true;
          token = await accessTokenFor(c, true);
          continue;
        }
        throw e;
      }
    }

    const ok = stats.failed === 0;
    await finish(c, {
      lastSyncAt: new Date(),
      lastSyncStatus: ok ? 'ok' : 'partial',
      lastSyncError: ok ? null : `${stats.failed} item${stats.failed === 1 ? '' : 's'} could not be synced. First error: ${firstError}`,
      lastSyncStats: stats,
      lastFingerprint: ok ? sha256([c.externalCalendarId ?? '', ...[...hashes].map(([k, h]) => `${k}:${h}`).sort()].join('|')) : null,
      lastFullSyncAt: ok ? new Date() : c.lastFullSyncAt,
      consecutiveFailures: ok ? 0 : c.consecutiveFailures + 1,
      nextRetryAt: null,
    });
    if (!ok) await scheduleRetry(c, c.consecutiveFailures + 1);
    return { stats, status: ok ? 'ok' : 'partial' };
  } catch (e) {
    return handleFatal(c, e, stats);
  }
}

async function finish(c: Connection, patch: Partial<typeof calendarConnections.$inferInsert>) {
  await db
    .update(calendarConnections)
    .set({ ...patch, syncLockedUntil: null, updatedAt: new Date() })
    .where(eq(calendarConnections.id, c.id));
}

function backoffMs(failures: number, retryAfterSec?: number) {
  const exp = Math.min(60 * 60_000, 2 ** Math.max(0, failures - 1) * 60_000);
  return Math.max(exp, (retryAfterSec ?? 0) * 1000);
}

async function scheduleRetry(c: Connection, failures: number, retryAfterSec?: number) {
  if (failures > 6) return null; // give up until the next sweep or a manual "Sync now"
  const runAt = new Date(Date.now() + backoffMs(failures, retryAfterSec));
  await db.update(calendarConnections).set({ nextRetryAt: runAt }).where(eq(calendarConnections.id, c.id));
  await enqueueSync(c.id, { reason: 'retry', runAt });
  return runAt;
}

async function handleFatal(c: Connection, e: unknown, stats: Stats) {
  if (e instanceof ProviderError && e.kind === 'auth') {
    await markNeedsReconnect(c, 'Access was revoked or has expired. Reconnect to resume syncing.');
    await db.update(calendarConnections).set({ syncLockedUntil: null }).where(eq(calendarConnections.id, c.id));
    return { status: 'needs_reconnect' as const, stats };
  }
  const failures = c.consecutiveFailures + 1;
  const transient = e instanceof ProviderError && (e.kind === 'rate_limited' || e.kind === 'transient');
  const message =
    e instanceof ProviderError
      ? e.kind === 'rate_limited'
        ? `${PROVIDERS[c.provider as ProviderId].label} asked us to slow down. The sync will continue automatically.`
        : e.message
      : 'Unexpected error during sync.';
  if (!(e instanceof ProviderError) && !process.env.VITEST) console.warn(`[calendar] sync ${c.id} failed: ${(e as Error)?.message ?? e}`);
  const anyDone = stats.created + stats.updated + stats.deleted > 0;
  await finish(c, { lastSyncAt: new Date(), lastSyncStatus: anyDone ? 'partial' : 'error', lastSyncError: message, lastSyncStats: stats, lastFingerprint: null, consecutiveFailures: failures, nextRetryAt: null });
  const retryAt = transient ? await scheduleRetry(c, failures, (e as ProviderError).retryAfterSec) : await scheduleRetry(c, failures);
  return { status: 'error' as const, error: message, retryAt, stats };
}

export async function sweepConnections() {
  const rows = await db.select({ id: calendarConnections.id }).from(calendarConnections).where(eq(calendarConnections.status, 'active'));
  for (const r of rows) await enqueueSync(r.id, { reason: 'scheduled' });
  return rows.length;
}

// ======================================================================
// Disconnect + privacy
// ======================================================================

export async function disconnect(c: Connection, opts: { deleteCalendar: boolean }) {
  const provider = PROVIDERS[c.provider as ProviderId];
  let calendarDeleted = false;
  let calendarError: string | null = null;
  if (opts.deleteCalendar && c.externalCalendarId && c.status === 'active' && provider.configured()) {
    try {
      const token = await accessTokenFor(c);
      await provider.deleteCalendar(token, c.externalCalendarId);
      calendarDeleted = true;
    } catch (e) {
      calendarError = e instanceof ProviderError ? e.message : 'The calendar could not be deleted.';
    }
  }
  if (provider.revoke && c.refreshTokenEnc && provider.configured()) {
    try {
      await provider.revoke(decryptSecret(c.refreshTokenEnc));
    } catch {
      /* best effort: tokens are deleted locally regardless */
    }
  }
  await db.delete(calendarConnections).where(eq(calendarConnections.id, c.id)); // mappings cascade
  return { calendarDeleted, calendarError };
}

export async function eraseUser(userId: string) {
  const conns = await db.select({ id: calendarConnections.id }).from(calendarConnections).where(eq(calendarConnections.userId, userId));
  const maps = conns.length ? await db.delete(calendarEventMaps).where(inArray(calendarEventMaps.connectionId, conns.map((x) => x.id))).returning({ id: calendarEventMaps.id }) : [];
  const c = await db.delete(calendarConnections).where(eq(calendarConnections.userId, userId)).returning({ id: calendarConnections.id });
  const s = await db.delete(calendarSettings).where(eq(calendarSettings.userId, userId)).returning({ id: calendarSettings.userId });
  const o = await db.delete(calendarOauthStates).where(eq(calendarOauthStates.userId, userId)).returning({ id: calendarOauthStates.id });
  return maps.length + c.length + s.length + o.length;
}
