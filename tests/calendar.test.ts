import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { setupTestApp, registerUser, client } from './helpers';
import { db } from '../server/db/client';
import { backgroundJobs, calendarConnections, calendarEventMaps, calendarOauthStates, calendarSettings, notifications } from '../server/db/schema';
import { decryptSecret, sha256 } from '../server/lib/crypto';
import { drainJobs } from '../server/jobs/queue';
import { syncConnection } from '../server/modules/calendar/service';
import { escapeText, foldLine } from '../server/modules/calendar/ics';
import { privacyHandlers } from '../server/modules/privacy/registry';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => ctx.close());
afterEach(() => {
  vi.unstubAllGlobals();
});

const DAY = 86400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

/** GET without any session cookie, like a calendar app would. */
async function anon(path: string) {
  const res = await ctx.app.request(path);
  return { status: res.status, headers: res.headers, text: await res.text() };
}
const pathOf = (url: string) => new URL(url).pathname + new URL(url).search;
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

function setGoogleEnv(on: boolean) {
  if (on) {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client.apps.googleusercontent.com';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-secret';
  } else {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  }
}
function setMsEnv(on: boolean) {
  if (on) {
    process.env.MS_OAUTH_CLIENT_ID = '00000000-0000-0000-0000-000000000001';
    process.env.MS_OAUTH_CLIENT_SECRET = 'ms-secret';
  } else {
    delete process.env.MS_OAUTH_CLIENT_ID;
    delete process.env.MS_OAUTH_CLIENT_SECRET;
    delete process.env.MS_OAUTH_TENANT;
  }
}

// ---------------------------------------------------------------------------------------------
// A small in-memory fake of Google's OAuth and Calendar v3 endpoints.
// ---------------------------------------------------------------------------------------------
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const API = 'https://www.googleapis.com/calendar/v3';

function fakeJwt(payload: Record<string, unknown>) {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'none' })}.${b(payload)}.sig`;
}

function fakeGoogle() {
  const state = {
    calendars: new Map<string, Map<string, any>>(),
    calls: [] as { method: string; url: string; body: string; auth: string | null }[],
    validTokens: new Set<string>(),
    tokenSeq: 0,
    calSeq: 0,
    refreshRevoked: false,
    rateLimitNext: 0,
    grantScope: `openid ${GOOGLE_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
  };
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : '';
    const auth = (init?.headers as Record<string, string> | undefined)?.authorization ?? null;
    state.calls.push({ method, url, body, auth });

    if (url === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(body);
      if (p.get('client_secret') !== 'test-secret') return json(401, { error: 'invalid_client' });
      if (p.get('grant_type') === 'authorization_code') {
        if (p.get('code') !== 'good-code' || !p.get('code_verifier')) return json(400, { error: 'invalid_grant', error_description: 'Bad code' });
        const at = `at-${++state.tokenSeq}`;
        state.validTokens.add(at);
        return json(200, { access_token: at, refresh_token: 'rt-secret-1', expires_in: 3599, scope: state.grantScope, token_type: 'Bearer', id_token: fakeJwt({ email: 'asha@gmail.test' }) });
      }
      if (p.get('grant_type') === 'refresh_token') {
        if (state.refreshRevoked || p.get('refresh_token') !== 'rt-secret-1') return json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
        const at = `at-${++state.tokenSeq}`;
        state.validTokens.add(at);
        return json(200, { access_token: at, expires_in: 3599, scope: state.grantScope, token_type: 'Bearer' });
      }
      return json(400, { error: 'unsupported_grant_type' });
    }
    if (url.startsWith('https://oauth2.googleapis.com/revoke')) return new Response('', { status: 200 });

    if (url.startsWith(API)) {
      const token = auth?.replace(/^Bearer /, '') ?? '';
      if (!state.validTokens.has(token)) return json(401, { error: { code: 401, message: 'Invalid Credentials', status: 'UNAUTHENTICATED' } });
      if (state.rateLimitNext > 0) {
        state.rateLimitNext--;
        return json(429, { error: { code: 429, message: 'Rate Limit Exceeded', errors: [{ reason: 'rateLimitExceeded' }] } }, { 'retry-after': '120' });
      }
      const path = url.slice(API.length).split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
      // /calendars
      if (path.length === 1 && path[0] === 'calendars' && method === 'POST') {
        const id = `cal-${++state.calSeq}@group.calendar.google.com`;
        state.calendars.set(id, new Map());
        return json(200, { id, summary: JSON.parse(body).summary });
      }
      const cal = state.calendars.get(path[1]);
      if (path.length === 2 && method === 'DELETE') {
        if (!cal) return json(404, { error: { code: 404, message: 'Not Found' } });
        state.calendars.delete(path[1]);
        return new Response(null, { status: 204 });
      }
      if (!cal) return json(404, { error: { code: 404, message: 'Not Found' } });
      if (path.length === 3 && path[2] === 'events' && method === 'POST') {
        const ev = JSON.parse(body);
        if (cal.has(ev.id)) return json(409, { error: { code: 409, message: 'The requested identifier already exists.' } });
        cal.set(ev.id, ev);
        return json(200, ev);
      }
      if (path.length === 4 && path[2] === 'events') {
        const id = path[3];
        if (method === 'PUT') {
          if (!cal.has(id)) return json(404, { error: { code: 404, message: 'Not Found' } });
          cal.set(id, { id, ...JSON.parse(body) });
          return json(200, cal.get(id));
        }
        if (method === 'DELETE') {
          if (!cal.has(id)) return json(410, { error: { code: 410, message: 'Resource has been deleted' } });
          cal.delete(id);
          return new Response(null, { status: 204 });
        }
      }
      return json(400, { error: { code: 400, message: `Unhandled ${method} ${url}` } });
    }
    return json(500, { error: `unexpected fetch ${url}` });
  });
  vi.stubGlobal('fetch', fetchMock);
  const count = (method: string, re: RegExp) => state.calls.filter((c) => c.method === method && re.test(c.url)).length;
  return { state, fetchMock, count };
}

/** Starts the Google connect flow for `user` and completes it through the callback. */
async function connectGoogle(user: Awaited<ReturnType<typeof registerUser>>) {
  const start = await user.post('/api/calendar/oauth/google/start');
  expect(start.status).toBe(200);
  const state = new URL(start.body.url).searchParams.get('state')!;
  const cb = await ctx.app.request(`/api/calendar/oauth/google/callback?code=good-code&state=${encodeURIComponent(state)}`, { headers: { cookie: user.cookie } });
  return { start, state, cb };
}

// =============================================================================================

describe('calendar: ICS subscription feed', () => {
  it('serves a valid RFC 5545 feed with only the owner\'s items, and revokes on regenerate / disable', async () => {
    const a = await registerUser(ctx.app, 'Asha Feed', 'asha-feed@cal.test');
    const b = await registerUser(ctx.app, 'Ben Feed', 'ben-feed@cal.test');
    const longTitle = 'Read chapter 4; then summarise, compare and contrast the sorting algorithms covered in lecture with ünïcödé notes for revision';
    const t1 = await a.post('/api/workspace/tasks', { title: longTitle, dueAt: inDays(3), priority: 'high' });
    expect(t1.status).toBe(201);
    const t2 = await a.post('/api/workspace/tasks', { title: 'Finished task', dueAt: inDays(1), status: 'done' });
    await a.post('/api/workspace/tasks', { title: 'Too far away', dueAt: inDays(400) });
    await a.post('/api/workspace/tasks', { title: 'Long ago', dueAt: inDays(-90) });
    await b.post('/api/workspace/tasks', { title: 'Ben private task', dueAt: inDays(2) });

    // Off by default; enabling issues a URL.
    const before = await a.get('/api/calendar');
    expect(before.status).toBe(200);
    expect(before.body.feed.enabled).toBe(false);
    expect(before.body.feed.url).toBeNull();
    const en = await a.post('/api/calendar/feed/enable');
    expect(en.status).toBe(200);
    const url: string = en.body.feed.url;
    expect(url).toMatch(/^http:\/\/localhost:5317\/api\/calendar\/ics\/[A-Za-z0-9_-]{40,}\.ics$/);
    expect(en.body.feed.webcalUrl.startsWith('webcal://')).toBe(true);
    expect(en.body.feed.reachableByCloudCalendars).toBe(false); // localhost

    // Stored hashed (lookup) + encrypted (owner redisplay), never in plain text.
    const token = url.split('/').pop()!.replace(/\.ics$/, '');
    const [row] = await db.select().from(calendarSettings).where(eq(calendarSettings.userId, a.userId));
    expect(row.feedTokenHash).toBe(sha256(token));
    expect(row.feedTokenEnc).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(token);

    const r = await anon(pathOf(url));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/^text\/calendar/);
    expect(r.headers.get('cache-control')).toBe('private, max-age=300');
    const ics = r.text;
    // CRLF everywhere and every physical line within 75 octets.
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    const u = unfold(ics);
    for (const prop of ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:LearnSphere Nexus', 'END:VCALENDAR']) expect(u).toContain(prop);
    const events = u.split('BEGIN:VEVENT').slice(1);
    expect(events).toHaveLength(2); // the two in-window tasks, nothing of Ben's
    expect(u).not.toContain('Ben private task');
    expect(u).not.toContain('Too far away');
    expect(u).not.toContain('Long ago');
    for (const ev of events) {
      for (const p of ['UID:', 'DTSTAMP:', 'DTSTART:', 'DTEND:', 'SUMMARY:', 'DESCRIPTION:', 'URL:', 'END:VEVENT']) expect(ev).toContain(p);
      expect(ev).toMatch(/DTSTART:\d{8}T\d{6}Z\r\n/);
      expect(ev).toMatch(/DTEND:\d{8}T\d{6}Z\r\n/);
      expect(ev).toMatch(/DTSTAMP:\d{8}T\d{6}Z\r\n/);
    }
    expect(u).toContain(`UID:task-${t1.body.task.id}@learnsphere`);
    expect(u).toContain(`SUMMARY:${escapeText(longTitle)}`);
    expect(u).toContain('SUMMARY:Read chapter 4\\; then summarise\\, compare');
    expect(u).toContain('SUMMARY:Done: Finished task');
    expect(u).toMatch(/DESCRIPTION:Task\\, high priority\\n\\nOpen in LearnSphere Nexus: http:\/\/localhost:5317\/app\/workspace\?tab=tasks/);
    expect(u).toContain(`UID:task-${t2.body.task.id}@learnsphere`);
    const start = new Date(t1.body.task.dueAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    expect(u).toContain(`DTSTART:${start}`);

    // Stable UIDs across fetches; plain-text preview serves the same calendar.
    const again = unfold((await anon(pathOf(url))).text);
    expect(again.match(/UID:[^\r]+/g)).toEqual(u.match(/UID:[^\r]+/g));
    const preview = await anon(`${pathOf(url)}?view=text`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(preview.text).toContain('BEGIN:VCALENDAR');

    // Wrong tokens get 404.
    expect((await anon('/api/calendar/ics/not-a-real-token-but-long-enough-xxxxxxxxxxxx.ics')).status).toBe(404);
    expect((await anon(`/api/calendar/ics/${token}`)).status).toBe(404);
    expect((await anon(`/api/calendar/ics/${token.slice(0, -1)}A.ics`)).status).toBe(404);

    // Ben cannot see Asha's feed URL; his own overview is independent.
    const bo = await b.get('/api/calendar');
    expect(bo.body.feed.url).toBeNull();
    expect(JSON.stringify(bo.body)).not.toContain(token);

    // Category filter.
    const f = await a.patch('/api/calendar/settings', { types: ['interview', 'mentor_session'] });
    expect(f.status).toBe(200);
    expect(f.body.types.find((t: any) => t.key === 'task').included).toBe(false);
    expect(unfold((await anon(pathOf(url))).text)).not.toContain('BEGIN:VEVENT');
    expect((await a.patch('/api/calendar/settings', { types: ['bogus'] })).status).toBe(400);
    await a.patch('/api/calendar/settings', { types: ['task'] });
    expect(unfold((await anon(pathOf(url))).text)).toContain('BEGIN:VEVENT');

    // Regenerate revokes the old URL.
    const rg = await a.post('/api/calendar/feed/regenerate');
    expect(rg.body.feed.url).not.toBe(url);
    expect((await anon(pathOf(url))).status).toBe(404);
    expect((await anon(pathOf(rg.body.feed.url))).status).toBe(200);

    // Disable: 404; re-enable issues yet another URL.
    const dis = await a.post('/api/calendar/feed/disable');
    expect(dis.body.feed.enabled).toBe(false);
    expect((await anon(pathOf(rg.body.feed.url))).status).toBe(404);
    const re = await a.post('/api/calendar/feed/enable');
    expect(re.body.feed.url).not.toBe(rg.body.feed.url);
    expect((await anon(pathOf(re.body.feed.url))).status).toBe(200);

    // Signed-out users cannot manage feeds; the feed itself needs no session.
    expect((await client(ctx.app).get('/api/calendar')).status).toBe(401);
  });

  it('folds by octets without splitting UTF-8 characters and escapes text', () => {
    const line = `SUMMARY:${'é'.repeat(100)}`;
    const folded = foldLine(line);
    for (const l of folded.split('\r\n')) expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
});

describe('calendar: OAuth connect (Google)', () => {
  it('reports "not configured" when the env vars are missing', async () => {
    setGoogleEnv(false);
    setMsEnv(false);
    const u = await registerUser(ctx.app, 'No Env', 'noenv@cal.test');
    const o = await u.get('/api/calendar');
    expect(o.body.providers.map((p: any) => [p.id, p.configured])).toEqual([
      ['google', false],
      ['microsoft', false],
    ]);
    expect(o.body.providers[0].redirectUri).toBe('http://localhost:5317/api/calendar/oauth/google/callback');
    const s = await u.post('/api/calendar/oauth/google/start');
    expect(s.status).toBe(503);
    expect(s.body.error.code).toBe('not_configured');
    expect((await u.post('/api/calendar/oauth/microsoft/start')).status).toBe(503);
    expect((await u.post('/api/calendar/oauth/yahoo/start')).status).toBe(404);
  });

  it('binds state + PKCE to the session, rejects bad state, exchanges the code and stores the refresh token encrypted', async () => {
    setGoogleEnv(true);
    const g = fakeGoogle();
    const a = await registerUser(ctx.app, 'Asha Oauth', 'asha-oauth@cal.test');
    const b = await registerUser(ctx.app, 'Ben Oauth', 'ben-oauth@cal.test');

    const start = await a.post('/api/calendar/oauth/google/start');
    expect(start.status).toBe(200);
    const authUrl = new URL(start.body.url);
    expect(authUrl.origin + authUrl.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const sp = authUrl.searchParams;
    expect(sp.get('client_id')).toBe('test-client.apps.googleusercontent.com');
    expect(sp.get('redirect_uri')).toBe('http://localhost:5317/api/calendar/oauth/google/callback');
    expect(sp.get('response_type')).toBe('code');
    expect(sp.get('access_type')).toBe('offline');
    expect(sp.get('scope')).toContain(GOOGLE_SCOPE);
    expect(sp.get('scope')).not.toMatch(/auth\/calendar(\s|$)/); // never the full calendar scope
    expect(sp.get('code_challenge_method')).toBe('S256');
    const state = sp.get('state')!;
    expect(state.length).toBeGreaterThanOrEqual(40);
    const [st] = await db.select().from(calendarOauthStates).where(eq(calendarOauthStates.stateHash, sha256(state)));
    expect(st.userId).toBe(a.userId);
    const verifier = decryptSecret(st.codeVerifierEnc);
    expect(crypto.createHash('sha256').update(verifier).digest('base64url')).toBe(sp.get('code_challenge'));

    // Bad state, and someone else's session presenting Asha's state, are both rejected.
    const bad = await ctx.app.request(`/api/calendar/oauth/google/callback?code=good-code&state=forged`, { headers: { cookie: a.cookie } });
    expect(bad.status).toBe(302);
    expect(bad.headers.get('location')).toContain('error=invalid_state');
    const start2 = await a.post('/api/calendar/oauth/google/start');
    const state2 = new URL(start2.body.url).searchParams.get('state')!;
    const cross = await ctx.app.request(`/api/calendar/oauth/google/callback?code=good-code&state=${state2}`, { headers: { cookie: b.cookie } });
    expect(cross.headers.get('location')).toContain('error=invalid_state');
    expect(await db.select().from(calendarConnections).where(eq(calendarConnections.userId, b.userId))).toHaveLength(0);
    expect(g.count('POST', /oauth2\.googleapis\.com\/token/)).toBe(0); // no exchange attempted

    // Valid callback.
    const cb = await ctx.app.request(`/api/calendar/oauth/google/callback?code=good-code&state=${state}`, { headers: { cookie: a.cookie } });
    expect(cb.status).toBe(302);
    expect(cb.headers.get('location')).toBe('/app/settings/calendar?provider=google&connected=1');
    const tokenCall = g.state.calls.find((c) => c.url === 'https://oauth2.googleapis.com/token')!;
    const tp = new URLSearchParams(tokenCall.body);
    expect(tp.get('code_verifier')).toBe(verifier);
    expect(tp.get('redirect_uri')).toBe('http://localhost:5317/api/calendar/oauth/google/callback');

    const [conn] = await db.select().from(calendarConnections).where(eq(calendarConnections.userId, a.userId));
    expect(conn.accountEmail).toBe('asha@gmail.test');
    expect(conn.refreshTokenEnc).not.toContain('rt-secret-1');
    expect(decryptSecret(conn.refreshTokenEnc!)).toBe('rt-secret-1');
    expect(conn.status).toBe('active');

    // Replaying the same state fails (one-time use).
    const replay = await ctx.app.request(`/api/calendar/oauth/google/callback?code=good-code&state=${state}`, { headers: { cookie: a.cookie } });
    expect(replay.headers.get('location')).toContain('error=invalid_state');

    // The API never returns tokens.
    const o = await a.get('/api/calendar');
    const google = o.body.providers.find((p: any) => p.id === 'google');
    expect(google.connection.accountEmail).toBe('asha@gmail.test');
    const dump = JSON.stringify(o.body);
    expect(dump).not.toContain('rt-secret-1');
    expect(dump).not.toMatch(/at-\d/);
    expect(dump).not.toContain('refreshToken');

    // User denied consent: state consumed, friendly error.
    const s3 = new URL((await b.post('/api/calendar/oauth/google/start')).body.url).searchParams.get('state')!;
    const denied = await ctx.app.request(`/api/calendar/oauth/google/callback?error=access_denied&state=${s3}`, { headers: { cookie: b.cookie } });
    expect(denied.headers.get('location')).toContain('error=denied');

    // Calendar permission unticked on the consent screen.
    g.state.grantScope = 'openid https://www.googleapis.com/auth/userinfo.email';
    const s4 = new URL((await b.post('/api/calendar/oauth/google/start')).body.url).searchParams.get('state')!;
    const noScope = await ctx.app.request(`/api/calendar/oauth/google/callback?code=good-code&state=${s4}`, { headers: { cookie: b.cookie } });
    expect(noScope.headers.get('location')).toContain('error=scope');
    expect(await db.select().from(calendarConnections).where(eq(calendarConnections.userId, b.userId))).toHaveLength(0);
  });

  it('builds the Microsoft authorize URL with PKCE, tenant and the delegated scopes', async () => {
    setMsEnv(true);
    process.env.MS_OAUTH_TENANT = 'consumers';
    const u = await registerUser(ctx.app, 'Mia Microsoft', 'mia-ms@cal.test');
    const s = await u.post('/api/calendar/oauth/microsoft/start');
    expect(s.status).toBe(200);
    const url = new URL(s.body.url);
    expect(url.origin + url.pathname).toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
    expect(url.searchParams.get('scope')).toContain('offline_access');
    expect(url.searchParams.get('scope')).toContain('Calendars.ReadWrite');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5317/api/calendar/oauth/microsoft/callback');
    setMsEnv(false);
  });
});

describe('calendar: push sync engine (Google, fetch mocked)', () => {
  it('creates the dedicated calendar once, upserts idempotently, deletes removed items, refreshes tokens and handles revocation', async () => {
    setGoogleEnv(true);
    const g = fakeGoogle();
    const a = await registerUser(ctx.app, 'Asha Sync', 'asha-sync@cal.test');
    const other = await registerUser(ctx.app, 'Olu Other', 'olu-sync@cal.test');
    const t1 = await a.post('/api/workspace/tasks', { title: 'Submit essay, part 1', dueAt: inDays(2) });
    const t2 = await a.post('/api/workspace/tasks', { title: 'Mock interview prep', dueAt: inDays(5) });
    await other.post('/api/workspace/tasks', { title: 'Olu secret', dueAt: inDays(2) });
    await drainJobs(); // jobs left over from earlier tests run first, so counts below are only ours
    const calsCreatedBefore = g.count('POST', /\/calendars$/);

    const { cb } = await connectGoogle(a);
    expect(cb.headers.get('location')).toContain('connected=1');
    const [conn] = await db.select().from(calendarConnections).where(eq(calendarConnections.userId, a.userId));
    // The callback queued a sync; the worker runs it.
    expect((await db.select().from(backgroundJobs).where(eq(backgroundJobs.type, 'calendar.sync'))).length).toBeGreaterThanOrEqual(1);
    await drainJobs();

    expect(g.count('POST', /\/calendars$/)).toBe(calsCreatedBefore + 1);
    const [cx] = await db.select().from(calendarConnections).where(eq(calendarConnections.id, conn.id));
    const calId = cx.externalCalendarId!;
    const events = [...g.state.calendars.get(calId)!.values()];
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.summary).sort()).toEqual(['Mock interview prep', 'Submit essay, part 1']);
    expect(events.some((e) => e.summary === 'Olu secret')).toBe(false);
    expect(events[0].start.timeZone).toBe('UTC');
    expect(events[0].transparency).toBe('transparent');
    let [c1] = await db.select().from(calendarConnections).where(eq(calendarConnections.id, conn.id));
    expect(c1.externalCalendarId).toBe(calId);
    expect(c1.lastSyncStatus).toBe('ok');
    expect(c1.lastSyncStats).toMatchObject({ created: 2, failed: 0 });
    const maps = await db.select().from(calendarEventMaps).where(eq(calendarEventMaps.connectionId, conn.id));
    expect(maps.map((m) => m.itemKey).sort()).toEqual([`task-${t1.body.task.id}`, `task-${t2.body.task.id}`].sort());

    // Idempotent: a second (forced) run creates and updates nothing.
    const writesBefore = g.state.calls.filter((c) => c.method !== 'GET' && c.url.startsWith(API)).length;
    const again = await syncConnection(conn.id, { force: true });
    expect(again).toMatchObject({ status: 'ok', stats: { created: 0, updated: 0, deleted: 0, unchanged: 2 } });
    expect(g.state.calls.filter((c) => c.method !== 'GET' && c.url.startsWith(API)).length).toBe(writesBefore);
    expect(g.count('POST', /\/calendars$/)).toBe(calsCreatedBefore + 1);

    // Unforced run with an unchanged agenda short-circuits on the fingerprint.
    expect(await syncConnection(conn.id)).toMatchObject({ unchanged: true });

    // An edit updates the mapped event in place; a deletion removes it.
    await a.patch(`/api/workspace/tasks/${t1.body.task.id}`, { title: 'Submit essay, final' });
    await a.del(`/api/workspace/tasks/${t2.body.task.id}`);
    const r3 = await syncConnection(conn.id);
    expect(r3).toMatchObject({ status: 'ok', stats: { created: 0, updated: 1, deleted: 1 } });
    const after = [...g.state.calendars.get(calId)!.values()];
    expect(after).toHaveLength(1);
    expect(after[0].summary).toBe('Submit essay, final');
    expect(await db.select().from(calendarEventMaps).where(eq(calendarEventMaps.connectionId, conn.id))).toHaveLength(1);

    // An expired access token is refreshed with the stored refresh token.
    await db.update(calendarConnections).set({ accessTokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(calendarConnections.id, conn.id));
    const refreshesBefore = g.state.calls.filter((c) => c.url.endsWith('/token') && c.body.includes('grant_type=refresh_token')).length;
    await a.post('/api/workspace/tasks', { title: 'New after refresh', dueAt: inDays(4) });
    expect(await syncConnection(conn.id)).toMatchObject({ status: 'ok', stats: { created: 1 } });
    expect(g.state.calls.filter((c) => c.url.endsWith('/token') && c.body.includes('grant_type=refresh_token')).length).toBe(refreshesBefore + 1);
    const lastApi = g.state.calls.filter((c) => c.url.startsWith(API)).pop()!;
    expect(lastApi.auth).toBe(`Bearer at-${g.state.tokenSeq}`);
    [c1] = await db.select().from(calendarConnections).where(eq(calendarConnections.id, conn.id));
    expect(decryptSecret(c1.accessTokenEnc!)).toBe(`at-${g.state.tokenSeq}`);

    // Another user can neither sync nor disconnect my connection.
    expect((await other.post(`/api/calendar/connections/${conn.id}/sync`)).status).toBe(404);
    expect((await other.post(`/api/calendar/connections/${conn.id}/disconnect`, { deleteCalendar: true })).status).toBe(404);
    expect((await other.get('/api/calendar')).body.providers.find((p: any) => p.id === 'google').connection).toBeNull();

    // "Sync now" queues a job for the owner.
    const now = await a.post(`/api/calendar/connections/${conn.id}/sync`);
    expect(now.status).toBe(202);
    await drainJobs();

    // Rate limited: partial status with a visible error and a scheduled retry.
    await a.post('/api/workspace/tasks', { title: 'Rate limited one', dueAt: inDays(6) });
    g.state.rateLimitNext = 1;
    const rl = await syncConnection(conn.id);
    expect(rl).toMatchObject({ status: 'error' });
    [c1] = await db.select().from(calendarConnections).where(eq(calendarConnections.id, conn.id));
    expect(c1.lastSyncError).toMatch(/slow down/);
    expect(c1.nextRetryAt).not.toBeNull();
    expect(new Date(c1.nextRetryAt!).getTime()).toBeGreaterThanOrEqual(Date.now() + 110_000); // honours Retry-After: 120
    const retryJobs = await db.select().from(backgroundJobs).where(and(eq(backgroundJobs.type, 'calendar.sync'), eq(backgroundJobs.status, 'queued')));
    expect(retryJobs.some((j) => (j.idempotencyKey ?? '').includes(':retry:'))).toBe(true);
    expect(await syncConnection(conn.id)).toMatchObject({ status: 'ok', stats: { created: 1 } }); // recovers

    // The user deleted our calendar in Google: it is recreated once and everything is pushed again.
    g.state.calendars.delete(calId);
    await a.post('/api/workspace/tasks', { title: 'After calendar deleted', dueAt: inDays(7) });
    expect(await syncConnection(conn.id)).toMatchObject({ status: 'ok' });
    expect(g.count('POST', /\/calendars$/)).toBe(calsCreatedBefore + 2);
    [c1] = await db.select().from(calendarConnections).where(eq(calendarConnections.id, conn.id));
    const newCal = c1.externalCalendarId!;
    expect(newCal).not.toBe(calId);
    expect([...g.state.calendars.get(newCal)!.values()].map((e) => e.summary)).toContain('After calendar deleted');

    // Access revoked: the cached token stops working and the refresh token is rejected.
    g.state.validTokens.clear();
    g.state.refreshRevoked = true;
    await a.post('/api/workspace/tasks', { title: 'After revoke', dueAt: inDays(8) });
    expect(await syncConnection(conn.id)).toMatchObject({ status: 'needs_reconnect' });
    [c1] = await db.select().from(calendarConnections).where(eq(calendarConnections.id, conn.id));
    expect(c1.status).toBe('needs_reconnect');
    expect(c1.lastSyncError).toMatch(/revoked or has expired/);
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, a.userId), eq(notifications.type, 'calendar.reconnect')));
    expect(notes).toHaveLength(1);
    expect(notes[0].link).toBe('/app/settings/calendar');
    expect((await a.post(`/api/calendar/connections/${conn.id}/sync`)).status).toBe(503);
    const ov = await a.get('/api/calendar');
    expect(ov.body.providers.find((p: any) => p.id === 'google').connection.status).toBe('needs_reconnect');

    // Reconnecting restores it; disconnecting with "delete calendar" removes the calendar and all tokens.
    g.state.refreshRevoked = false;
    await connectGoogle(a);
    [c1] = await db.select().from(calendarConnections).where(eq(calendarConnections.id, conn.id));
    expect(c1.status).toBe('active');
    await drainJobs();
    const calsBefore = g.state.calendars.size;
    const d = await a.post(`/api/calendar/connections/${conn.id}/disconnect`, { deleteCalendar: true });
    expect(d.status).toBe(200);
    expect(d.body.calendarDeleted).toBe(true);
    expect(g.state.calendars.size).toBe(calsBefore - 1);
    expect(g.count('POST', /oauth2\.googleapis\.com\/revoke/)).toBe(1);
    expect(await db.select().from(calendarConnections).where(eq(calendarConnections.userId, a.userId))).toHaveLength(0);
    expect(await db.select().from(calendarEventMaps).where(eq(calendarEventMaps.connectionId, conn.id))).toHaveLength(0);
  });
});

describe('calendar: privacy', () => {
  it('exports metadata without tokens and erases tokens, mappings and the feed token', async () => {
    setGoogleEnv(true);
    fakeGoogle();
    const a = await registerUser(ctx.app, 'Pia Privacy', 'pia-privacy@cal.test');
    await a.post('/api/workspace/tasks', { title: 'Private deadline', dueAt: inDays(2) });
    const feed = await a.post('/api/calendar/feed/enable');
    const token = feed.body.feed.url.split('/').pop().replace('.ics', '');
    await connectGoogle(a);
    await drainJobs();
    const h = privacyHandlers().find((x) => x.key === 'calendar')!;
    expect(h).toBeTruthy();
    const exp = JSON.stringify(await h.export!(a.userId));
    expect(exp).toContain('google');
    expect(exp).toContain('asha@gmail.test');
    expect(exp).not.toContain('rt-secret-1');
    expect(exp).not.toContain(token);
    expect(exp).not.toMatch(/at-\d/);
    const [conn] = await db.select().from(calendarConnections).where(eq(calendarConnections.userId, a.userId));
    expect((await db.select().from(calendarEventMaps).where(eq(calendarEventMaps.connectionId, conn.id))).length).toBe(1);

    const res = await h.erase!(a.userId);
    expect(res.action).toBe('deleted');
    expect(res.count).toBeGreaterThanOrEqual(3);
    expect(await db.select().from(calendarConnections).where(eq(calendarConnections.userId, a.userId))).toHaveLength(0);
    expect(await db.select().from(calendarEventMaps).where(eq(calendarEventMaps.connectionId, conn.id))).toHaveLength(0);
    expect(await db.select().from(calendarSettings).where(eq(calendarSettings.userId, a.userId))).toHaveLength(0);
    expect((await anon(`/api/calendar/ics/${token}.ics`)).status).toBe(404);
  });
});
