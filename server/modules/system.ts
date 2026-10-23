import { Hono } from 'hono';
import { sql, eq } from 'drizzle-orm';
import { users } from '../db/schema';
import { config } from '../lib/config';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, demoEmail } from '../db/seed/demo/context';
import { db, dbHandle } from '../db/client';
import type { AppEnv } from '../lib/context';
import { emailProvider } from '../lib/email';
import { workerStatus } from '../jobs/queue';

export const systemRoutes = new Hono<AppEnv>();

const startedAt = new Date();

/** Public liveness/readiness probe used by hosts and the admin health page. */
systemRoutes.get('/health', async (c) => {
  let database: 'ok' | 'error' = 'ok';
  try {
    await db.execute(sql`select 1`);
  } catch {
    database = 'error';
  }
  const status = database === 'ok' ? 200 : 503;
  return c.json(
    {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      databaseKind: dbHandle().kind,
      worker: workerStatus().running ? 'running' : 'stopped',
      uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    },
    status,
  );
});

/** What is configured on this server, so the UI can show honest availability. No secrets. */
systemRoutes.get('/capabilities', async (c) => {
  const email = emailProvider();
  return c.json({
    email: { configured: email.configured, provider: email.provider, note: email.note },
  });
});

/** Demo sign-in shortcuts: only when demo seeding is enabled and sample accounts exist. */
systemRoutes.get('/demo-accounts', async (c) => {
  const cfg = config();
  const enabled = cfg.SEED_DEMO ? cfg.SEED_DEMO === 'true' : !cfg.isProd;
  if (!enabled) return c.json({ enabled: false, accounts: [] });
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.isSample, true));
  if (!n) return c.json({ enabled: false, accounts: [] });
  return c.json({ enabled: true, password: DEMO_PASSWORD, accounts: DEMO_ACCOUNTS.map((a) => ({ email: demoEmail(a.local), role: a.role, description: a.description })) });
});
