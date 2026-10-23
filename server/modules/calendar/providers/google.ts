/**
 * Google Calendar via plain fetch (OAuth 2.0 authorization code + PKCE, Calendar API v3).
 *
 * Scope: calendar.app.created lets the app create secondary calendars and manage events
 * only on calendars it created. It cannot see or change any of the user's other calendars.
 */
import { sha256 } from '../../../lib/crypto';
import type { EventSpec } from '../ics';
import { form, idTokenEmail, providerFetch, ProviderError, type CalendarProvider, type TokenSet } from './types';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/calendar/v3';
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const LABEL = 'Google Calendar';

const env = () => ({ id: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? '', secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? '' });

function tokens(body: any): TokenSet {
  if (!body?.access_token) throw new ProviderError('other', `${LABEL}: the token response had no access token.`);
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresIn: Number(body.expires_in ?? 3600), scope: body.scope, email: idTokenEmail(body.id_token) };
}

function eventBody(spec: EventSpec) {
  return {
    summary: spec.summary,
    description: `${spec.description}\n\nAdded by LearnSphere Nexus. Changes made here are replaced on the next sync.`,
    start: { dateTime: spec.start.toISOString(), timeZone: 'UTC' },
    end: { dateTime: spec.end.toISOString(), timeZone: 'UTC' },
    status: 'confirmed',
    transparency: spec.busy ? 'opaque' : 'transparent',
    source: { title: 'LearnSphere Nexus', url: spec.url },
    extendedProperties: { private: { learnsphereKey: spec.key } },
  };
}

const json = (accessToken: string, method: string, body?: unknown): RequestInit => ({
  method,
  headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

const enc = encodeURIComponent;

export const googleProvider: CalendarProvider = {
  id: 'google',
  label: LABEL,
  scopes: ['openid', 'email', GOOGLE_CALENDAR_SCOPE],
  configured: () => !!(env().id && env().secret),

  authorizeUrl({ state, codeChallenge, redirectUri }) {
    const p = new URLSearchParams({
      client_id: env().id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      access_type: 'offline', // refresh token
      prompt: 'consent', // always return a refresh token, also on reconnect
      include_granted_scopes: 'false',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${AUTH_URL}?${p}`;
  },

  async exchangeCode({ code, codeVerifier, redirectUri }) {
    const { id, secret } = env();
    return tokens(
      await providerFetch(LABEL, TOKEN_URL, form({ grant_type: 'authorization_code', code, code_verifier: codeVerifier, redirect_uri: redirectUri, client_id: id, client_secret: secret }), { tokenEndpoint: true }),
    );
  },

  async refresh(refreshToken) {
    const { id, secret } = env();
    return tokens(await providerFetch(LABEL, TOKEN_URL, form({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: id, client_secret: secret }), { tokenEndpoint: true }));
  },

  hasRequiredScope: (scope) => !scope || scope.split(/\s+/).includes(GOOGLE_CALENDAR_SCOPE),

  async revoke(token) {
    await providerFetch(LABEL, REVOKE_URL, form({ token })).catch(() => undefined);
  },

  async createCalendar(accessToken, name) {
    const r = await providerFetch(LABEL, `${API}/calendars`, json(accessToken, 'POST', { summary: name, description: 'Deadlines, interviews and sessions from LearnSphere Nexus. Managed automatically.', timeZone: 'UTC' }));
    return String(r.id);
  },

  async deleteCalendar(accessToken, calendarId) {
    try {
      await providerFetch(LABEL, `${API}/calendars/${enc(calendarId)}`, json(accessToken, 'DELETE'));
    } catch (e) {
      if (e instanceof ProviderError && (e.kind === 'not_found' || e.kind === 'gone')) return;
      throw e;
    }
  },

  async createEvent(accessToken, calendarId, spec, idempotencyKey) {
    // Google accepts client-chosen ids (base32hex, 5-1024 chars); hex is a subset. A retried create
    // after a crash hits 409 and is turned into an update of the same event (which also restores
    // an event the user deleted, since Google keeps deleted events as "cancelled").
    const eventId = sha256(idempotencyKey);
    try {
      await providerFetch(LABEL, `${API}/calendars/${enc(calendarId)}/events`, json(accessToken, 'POST', { id: eventId, ...eventBody(spec) }));
    } catch (e) {
      if (e instanceof ProviderError && e.kind === 'conflict') await this.updateEvent(accessToken, calendarId, eventId, spec);
      else throw e;
    }
    return eventId;
  },

  async updateEvent(accessToken, calendarId, eventId, spec) {
    await providerFetch(LABEL, `${API}/calendars/${enc(calendarId)}/events/${enc(eventId)}`, json(accessToken, 'PUT', eventBody(spec)));
  },

  async deleteEvent(accessToken, calendarId, eventId) {
    try {
      await providerFetch(LABEL, `${API}/calendars/${enc(calendarId)}/events/${enc(eventId)}`, json(accessToken, 'DELETE'));
    } catch (e) {
      if (e instanceof ProviderError && (e.kind === 'not_found' || e.kind === 'gone')) return;
      throw e;
    }
  },
};
