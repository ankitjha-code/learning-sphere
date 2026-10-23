import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { type AppEnv, type Ctx, clientIp, requireAuth } from '../../lib/context';
import { db } from '../../db/client';
import { calendarConnections } from '../../db/schema';
import { body, idParam } from '../../lib/validate';
import { notFound, unavailable } from '../../lib/errors';
import { rateLimit } from '../../lib/ratelimit';
import { audit } from '../../lib/audit';
import { sha256 } from '../../lib/crypto';
import { ensureScheduled } from '../files/recurring';
import { CALENDAR_TYPES, TYPE_LABELS } from './ics';
import { ProviderError, type ProviderId } from './providers/types';
import {
  PROVIDERS,
  PROVIDER_IDS,
  SWEEP_PERIOD_MS,
  connectionView,
  consumeState,
  disableFeed,
  disconnect,
  enableFeed,
  enqueueSync,
  feedIcs,
  feedView,
  getSettings,
  isLocalAppUrl,
  normalizeTypes,
  redirectUri,
  rotateFeedToken,
  saveConnection,
  setTypes,
  startOAuth,
  userForFeedToken,
} from './service';
import './privacy';

/** Mounted at /api/calendar. */
export const calendarRoutes = new Hono<AppEnv>();

const SETTINGS_PATH = '/app/settings/calendar';

function providerParam(c: Ctx): ProviderId {
  const p = c.req.param('provider');
  if (!p || !(PROVIDER_IDS as string[]).includes(p)) throw notFound('Calendar provider');
  return p as ProviderId;
}

/** The caller's own connection, or 404 (never reveals other users' connections). */
async function ownConnection(c: Ctx) {
  const auth = requireAuth(c);
  const [row] = await db
    .select()
    .from(calendarConnections)
    .where(and(eq(calendarConnections.id, idParam(c)), eq(calendarConnections.userId, auth.user.id)));
  if (!row) throw notFound('Calendar connection');
  return row;
}

async function overview(userId: string) {
  const settings = await getSettings(userId);
  const types = normalizeTypes(settings?.types);
  const conns = await db.select().from(calendarConnections).where(eq(calendarConnections.userId, userId));
  return {
    types: CALENDAR_TYPES.map((t) => ({ key: t, label: TYPE_LABELS[t], included: types.includes(t) })),
    feed: { ...feedView(settings), reachableByCloudCalendars: !isLocalAppUrl() },
    providers: PROVIDER_IDS.map((id) => ({
      id,
      label: PROVIDERS[id].label,
      configured: PROVIDERS[id].configured(),
      redirectUri: redirectUri(id),
      scopes: PROVIDERS[id].scopes,
      connection: connectionView(conns.find((x) => x.provider === id)),
    })),
  };
}

calendarRoutes.get('/', async (c) => {
  const auth = requireAuth(c);
  ensureScheduled('calendar.sweep', SWEEP_PERIOD_MS);
  return c.json(await overview(auth.user.id));
});

calendarRoutes.patch('/settings', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ types: z.array(z.enum(CALENDAR_TYPES)).max(CALENDAR_TYPES.length) }));
  await setTypes(auth.user.id, input.types);
  // Connected calendars pick up the new filter right away.
  const conns = await db.select({ id: calendarConnections.id }).from(calendarConnections).where(and(eq(calendarConnections.userId, auth.user.id), eq(calendarConnections.status, 'active')));
  for (const x of conns) await enqueueSync(x.id, { reason: 'manual' });
  return c.json(await overview(auth.user.id));
});

// ---------- ICS subscription feed ----------

calendarRoutes.post('/feed/enable', async (c) => {
  const auth = requireAuth(c);
  await enableFeed(auth.user.id);
  return c.json(await overview(auth.user.id));
});

calendarRoutes.post('/feed/disable', async (c) => {
  const auth = requireAuth(c);
  await disableFeed(auth.user.id);
  await audit(c, { action: 'calendar.feed_disabled', targetType: 'user', targetId: auth.user.id });
  return c.json(await overview(auth.user.id));
});

calendarRoutes.post('/feed/regenerate', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`calendar-feed-rotate:${auth.user.id}`, 20, 3600_000);
  await rotateFeedToken(auth.user.id);
  await audit(c, { action: 'calendar.feed_regenerated', targetType: 'user', targetId: auth.user.id });
  return c.json(await overview(auth.user.id));
});

/**
 * Public (no session): calendar apps fetch this URL from their servers. The unguessable token in
 * the path is the credential; unknown, revoked or disabled tokens get the same 404.
 * `?view=text` serves the same file as plain text so a browser shows it instead of downloading it.
 */
calendarRoutes.get('/ics/:file', async (c) => {
  const file = c.req.param('file');
  rateLimit(`calendar-ics:${clientIp(c)}`, 240, 60_000);
  if (!file.endsWith('.ics')) throw notFound('Calendar feed');
  const token = file.slice(0, -4);
  rateLimit(`calendar-ics-token:${sha256(token).slice(0, 16)}`, 60, 60_000);
  const settings = await userForFeedToken(token);
  if (!settings) throw notFound('Calendar feed');
  const asText = c.req.query('view') === 'text';
  const ics = await feedIcs(settings, { preview: asText });
  c.header('content-type', asText ? 'text/plain; charset=utf-8' : 'text/calendar; charset=utf-8');
  if (!asText) c.header('content-disposition', 'inline; filename="learnsphere-nexus.ics"');
  c.header('cache-control', 'private, max-age=300');
  c.header('x-robots-tag', 'noindex, nofollow');
  c.header('referrer-policy', 'no-referrer');
  return c.body(ics, 200);
});

// ---------- OAuth connect ----------

calendarRoutes.post('/oauth/:provider/start', async (c) => {
  const auth = requireAuth(c);
  const provider = providerParam(c);
  if (!PROVIDERS[provider].configured()) {
    throw unavailable('not_configured', `${PROVIDERS[provider].label} sync is not configured on this server. An administrator needs to add the OAuth client settings.`, { provider });
  }
  rateLimit(`calendar-oauth:${auth.user.id}`, 20, 600_000);
  const url = await startOAuth(auth.user.id, auth.session.id, provider);
  return c.json({ url });
});

calendarRoutes.get('/oauth/:provider/callback', async (c) => {
  const provider = providerParam(c);
  const back = (params: Record<string, string>) => c.redirect(`${SETTINGS_PATH}?${new URLSearchParams({ provider, ...params })}`, 302);
  const auth = c.get('auth');
  if (!auth) return c.redirect(`/login?next=${encodeURIComponent(SETTINGS_PATH)}`, 302);
  const q = c.req.query();
  // The state must match one we issued to this user in this browser session (CSRF / login-CSRF protection).
  const verifier = await consumeState(auth.user.id, auth.session.id, provider, q.state ?? '');
  if (!verifier) return back({ error: 'invalid_state' });
  if (q.error) return back({ error: q.error === 'access_denied' ? 'denied' : 'provider_error' });
  if (!q.code || q.code.length > 4096) return back({ error: 'provider_error' });
  const p = PROVIDERS[provider];
  if (!p.configured()) return back({ error: 'not_configured' });
  try {
    const tokens = await p.exchangeCode({ code: q.code, codeVerifier: verifier, redirectUri: redirectUri(provider) });
    if (!p.hasRequiredScope(tokens.scope)) return back({ error: 'scope' });
    const conn = await saveConnection(auth.user.id, provider, tokens);
    await audit(c, { action: 'calendar.connected', targetType: 'calendar_connection', targetId: conn.id, meta: { provider } });
    await enqueueSync(conn.id, { reason: 'connect', force: true });
    return back({ connected: '1' });
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e;
    if (!process.env.VITEST) console.warn(`[calendar] ${provider} code exchange failed: ${e.message}`);
    return back({ error: 'exchange_failed' });
  }
});

// ---------- Connections ----------

calendarRoutes.post('/connections/:id/sync', async (c) => {
  const conn = await ownConnection(c);
  if (conn.status !== 'active') throw unavailable('needs_reconnect', 'Reconnect this calendar before syncing.');
  rateLimit(`calendar-sync:${conn.id}`, 10, 600_000);
  const { job } = await enqueueSync(conn.id, { reason: 'manual', force: true });
  return c.json({ queued: true, jobId: job?.id ?? null }, 202);
});

calendarRoutes.post('/connections/:id/disconnect', async (c) => {
  const conn = await ownConnection(c);
  const input = await body(c, z.object({ deleteCalendar: z.boolean().default(false) }));
  const result = await disconnect(conn, input);
  await audit(c, { action: 'calendar.disconnected', targetType: 'calendar_connection', targetId: conn.id, meta: { provider: conn.provider, calendarDeleted: result.calendarDeleted } });
  return c.json({ ok: true, ...result });
});
