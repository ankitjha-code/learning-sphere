import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { type AppEnv, resolveAuth } from './lib/context';
import { AppError } from './lib/errors';
import { config } from './lib/config';
import { registerModules } from './modules';

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('requestId', c.req.header('x-request-id')?.slice(0, 64) ?? randomUUID());
    await next();
    c.header('x-request-id', c.get('requestId'));
  });

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
      referrerPolicy: 'strict-origin-when-cross-origin',
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CSRF: state-changing API calls must come from our own origin.
  app.use('/api/*', async (c, next) => {
    const method = c.req.method;
    // Payment provider webhooks have no browser origin; they are authenticated by HMAC signature instead.
    const isSignedWebhook = c.req.path.startsWith('/api/billing/webhooks/');
    if (!isSignedWebhook && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const origin = c.req.header('origin');
      if (origin) {
        const host = c.req.header('host');
        const allowed = new Set([new URL(config().APP_URL).origin]);
        if (host) {
          allowed.add(`http://${host}`);
          allowed.add(`https://${host}`);
        }
        if (!allowed.has(origin)) {
          return c.json({ error: { code: 'bad_origin', message: 'Request blocked: unexpected origin.' } }, 403);
        }
      } else if (config().isProd && !c.req.header('x-requested-with')) {
        return c.json({ error: { code: 'bad_origin', message: 'Request blocked: missing origin.' } }, 403);
      }
    }
    await next();
  });

  app.use('/api/*', bodyLimit({ maxSize: 12 * 1024 * 1024, onError: (c) => c.json({ error: { code: 'too_large', message: 'Upload is too large (limit 10 MB).' } }, 413) }));

  app.use('/api/*', async (c, next) => {
    c.set('auth', await resolveAuth(c));
    c.header('cache-control', 'no-store');
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof AppError) {
      if (err.status === 429 && (err.details as { retryAfter?: number })?.retryAfter) {
        c.header('retry-after', String((err.details as { retryAfter: number }).retryAfter));
      }
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as 400);
    }
    if (err instanceof ZodError) {
      return c.json({ error: { code: 'bad_request', message: 'Invalid input.', details: err.issues } }, 400);
    }
    // Unknown errors: log with request id, never leak internals to the client.
    console.error(`[error] ${c.get('requestId')} ${c.req.method} ${c.req.path}`, err);
    return c.json(
      { error: { code: 'internal', message: 'Something went wrong on our side. Please try again.', requestId: c.get('requestId') } },
      500,
    );
  });

  registerModules(app);

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) return c.json({ error: { code: 'not_found', message: 'Endpoint not found.' } }, 404);
    return c.text('Not found', 404);
  });

  return app;
}
