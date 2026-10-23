import type { EventSpec } from '../ics';

export type ProviderId = 'google' | 'microsoft';

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope?: string;
  email?: string | null;
};

/**
 * A provider failure classified for the sync engine. Messages come from the provider's
 * error code/description only (never request bodies or headers), so they never contain tokens.
 */
export type ProviderErrorKind = 'auth' | 'rate_limited' | 'not_found' | 'gone' | 'conflict' | 'transient' | 'other';

export class ProviderError extends Error {
  constructor(
    public kind: ProviderErrorKind,
    message: string,
    public status = 0,
    public retryAfterSec?: number,
  ) {
    super(message);
  }
}

export interface CalendarProvider {
  id: ProviderId;
  label: string;
  configured(): boolean;
  scopes: string[];
  authorizeUrl(p: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchangeCode(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  /** Whether the granted scopes are enough to sync. */
  hasRequiredScope(scope: string | undefined): boolean;
  revoke?(token: string): Promise<void>;
  createCalendar(accessToken: string, name: string): Promise<string>;
  deleteCalendar(accessToken: string, calendarId: string): Promise<void>;
  /** Creates an event; `idempotencyKey` lets a retried create land on the same event. Returns the provider event id. */
  createEvent(accessToken: string, calendarId: string, spec: EventSpec, idempotencyKey: string): Promise<string>;
  updateEvent(accessToken: string, calendarId: string, eventId: string, spec: EventSpec): Promise<void>;
  deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;
}

/** Decodes the payload of an ID token received directly from the token endpoint over TLS (OIDC Core 3.1.3.7 allows skipping signature checks here). */
export function idTokenEmail(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
    const email = payload.email ?? payload.preferred_username ?? payload.upn;
    return typeof email === 'string' ? email.slice(0, 320) : null;
  } catch {
    return null;
  }
}

function retryAfter(res: Response): number | undefined {
  const h = res.headers.get('retry-after');
  if (!h) return undefined;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(0, Math.min(n, 3600));
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(0, Math.min(Math.ceil((at - Date.now()) / 1000), 3600)) : undefined;
}

/** Short, token-free description of a provider error body. */
function describe(body: unknown): { code: string; message: string; reason?: string } {
  const b = (body ?? {}) as Record<string, any>;
  if (typeof b.error === 'string') return { code: b.error, message: String(b.error_description ?? b.error).split('\r\n')[0].slice(0, 300) };
  const e = b.error ?? {};
  const reason = e.errors?.[0]?.reason ?? e.status;
  return { code: String(e.code ?? reason ?? 'error'), message: String(e.message ?? 'Request failed').slice(0, 300), reason: reason ? String(reason) : undefined };
}

/** fetch wrapper that maps HTTP failures to ProviderError. */
export async function providerFetch(label: string, url: string, init: RequestInit, opts: { tokenEndpoint?: boolean } = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new ProviderError('transient', `${label} could not be reached (${(e as Error).name === 'TimeoutError' ? 'timed out' : 'network error'}).`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (res.ok) return body;
  const d = describe(body);
  const msg = `${label}: ${d.message}`;
  if (opts.tokenEndpoint) {
    if (d.code === 'invalid_grant' || d.code === 'unauthorized_client' || d.code === 'interaction_required') throw new ProviderError('auth', msg, res.status);
    if (d.code === 'invalid_client') throw new ProviderError('other', `${label}: the OAuth client ID or secret on this server is wrong.`, res.status);
  }
  if (res.status === 401) throw new ProviderError('auth', msg, 401);
  if (res.status === 429 || (res.status === 403 && /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(d.reason ?? d.code)))
    throw new ProviderError('rate_limited', `${label} is rate limiting requests.`, res.status, retryAfter(res) ?? 60);
  if (res.status === 404) throw new ProviderError('not_found', msg, 404);
  if (res.status === 410) throw new ProviderError('gone', msg, 410);
  if (res.status === 409) throw new ProviderError('conflict', msg, 409);
  if (res.status === 403 && /insufficient|accessDenied/i.test(`${d.reason} ${d.code} ${d.message}`)) throw new ProviderError('auth', msg, 403);
  if (res.status >= 500) throw new ProviderError('transient', msg, res.status, retryAfter(res));
  throw new ProviderError('other', msg, res.status);
}

export function form(data: Record<string, string>) {
  return { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(data).toString() };
}
