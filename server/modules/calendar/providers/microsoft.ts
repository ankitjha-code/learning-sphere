/**
 * Microsoft Outlook / Microsoft 365 calendar via Microsoft Graph and plain fetch
 * (Microsoft identity platform v2, authorization code + PKCE).
 *
 * Delegated permissions: Calendars.ReadWrite (Graph has no narrower write scope) and
 * offline_access. The sync only ever touches the dedicated calendar it created.
 */
import { sha256 } from '../../../lib/crypto';
import type { EventSpec } from '../ics';
import { form, idTokenEmail, providerFetch, ProviderError, type CalendarProvider, type TokenSet } from './types';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const CAL_SCOPE = 'https://graph.microsoft.com/Calendars.ReadWrite';
const LABEL = 'Microsoft Outlook';

const env = () => ({
  id: process.env.MS_OAUTH_CLIENT_ID?.trim() ?? '',
  secret: process.env.MS_OAUTH_CLIENT_SECRET?.trim() ?? '',
  tenant: (process.env.MS_OAUTH_TENANT?.trim() || 'common').replace(/[^\w.-]/g, ''),
});
const authority = () => `https://login.microsoftonline.com/${env().tenant}/oauth2/v2.0`;

function tokens(body: any): TokenSet {
  if (!body?.access_token) throw new ProviderError('other', `${LABEL}: the token response had no access token.`);
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresIn: Number(body.expires_in ?? 3600), scope: body.scope, email: idTokenEmail(body.id_token) };
}

/** Graph wants a local date-time plus a time zone name; we always send UTC. */
const graphTime = (d: Date) => ({ dateTime: d.toISOString().slice(0, 23), timeZone: 'UTC' });

function eventBody(spec: EventSpec) {
  return {
    subject: spec.summary,
    body: { contentType: 'text', content: `${spec.description}\n\nAdded by LearnSphere Nexus. Changes made here are replaced on the next sync.` },
    start: graphTime(spec.start),
    end: graphTime(spec.end),
    showAs: spec.busy ? 'busy' : 'free',
    isReminderOn: true,
    reminderMinutesBeforeStart: spec.busy ? 15 : 60,
  };
}

const json = (accessToken: string, method: string, body?: unknown): RequestInit => ({
  method,
  headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const enc = encodeURIComponent;

export const microsoftProvider: CalendarProvider = {
  id: 'microsoft',
  label: LABEL,
  scopes: ['openid', 'email', 'offline_access', CAL_SCOPE],
  configured: () => !!(env().id && env().secret),

  authorizeUrl({ state, codeChallenge, redirectUri }) {
    const p = new URLSearchParams({
      client_id: env().id,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: this.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return `${authority()}/authorize?${p}`;
  },

  async exchangeCode({ code, codeVerifier, redirectUri }) {
    const { id, secret } = env();
    return tokens(
      await providerFetch(
        LABEL,
        `${authority()}/token`,
        form({ grant_type: 'authorization_code', code, code_verifier: codeVerifier, redirect_uri: redirectUri, client_id: id, client_secret: secret, scope: this.scopes.join(' ') }),
        { tokenEndpoint: true },
      ),
    );
  },

  async refresh(refreshToken) {
    const { id, secret } = env();
    // Microsoft rotates refresh tokens: the caller stores the new one when present.
    return tokens(
      await providerFetch(LABEL, `${authority()}/token`, form({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: id, client_secret: secret, scope: this.scopes.join(' ') }), {
        tokenEndpoint: true,
      }),
    );
  },

  hasRequiredScope: (scope) => !scope || /(^|\s|\/)Calendars\.ReadWrite(\s|$)/i.test(scope),

  async createCalendar(accessToken, name) {
    try {
      const r = await providerFetch(LABEL, `${GRAPH}/me/calendars`, json(accessToken, 'POST', { name }));
      return String(r.id);
    } catch (e) {
      // Outlook refuses duplicate calendar names. Reuse ours if it already exists (for example after a reconnect).
      if (e instanceof ProviderError && (e.kind === 'conflict' || /already exists/i.test(e.message))) {
        const list = await providerFetch(LABEL, `${GRAPH}/me/calendars?$select=id,name&$top=100`, json(accessToken, 'GET'));
        const found = (list?.value ?? []).find((c: { name: string }) => c.name === name);
        if (found) return String(found.id);
      }
      throw e;
    }
  },

  async deleteCalendar(accessToken, calendarId) {
    try {
      await providerFetch(LABEL, `${GRAPH}/me/calendars/${enc(calendarId)}`, json(accessToken, 'DELETE'));
    } catch (e) {
      if (e instanceof ProviderError && (e.kind === 'not_found' || e.kind === 'gone')) return;
      throw e;
    }
  },

  async createEvent(accessToken, calendarId, spec, idempotencyKey) {
    // transactionId makes Graph return the existing event when a create is retried.
    const r = await providerFetch(LABEL, `${GRAPH}/me/calendars/${enc(calendarId)}/events`, json(accessToken, 'POST', { ...eventBody(spec), transactionId: sha256(idempotencyKey).slice(0, 40) }));
    return String(r.id);
  },

  async updateEvent(accessToken, calendarId, eventId, spec) {
    await providerFetch(LABEL, `${GRAPH}/me/calendars/${enc(calendarId)}/events/${enc(eventId)}`, json(accessToken, 'PATCH', eventBody(spec)));
  },

  async deleteEvent(accessToken, calendarId, eventId) {
    try {
      await providerFetch(LABEL, `${GRAPH}/me/calendars/${enc(calendarId)}/events/${enc(eventId)}`, json(accessToken, 'DELETE'));
    } catch (e) {
      if (e instanceof ProviderError && (e.kind === 'not_found' || e.kind === 'gone')) return;
      throw e;
    }
  },
};
