import { Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, requireAuth, requirePlatformAdmin } from '../../lib/context';
import { query } from '../../lib/validate';
import { notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { rateLimit } from '../../lib/ratelimit';
import { computeSkillDna } from '../learning/skilldna';
import { KNOWN_SKILL_SLUGS } from '../career/extract';
import { ensureSnapshotScheduled } from './jobs';
import { ensureFreshSnapshot, fetchLatest, meVsMarket, overview, runSnapshot, skillDetail, sourcesReport } from './service';

/** Mounted at /api/market. */
export const marketRoutes = new Hono<AppEnv>();

marketRoutes.use('*', async (_c, next) => {
  ensureSnapshotScheduled();
  await next();
});

const windowQuery = z.object({
  days: z.enum(['30', '90']).default('30').transform((v) => Number(v) as 30 | 90),
  scope: z.enum(['all', 'public', 'platform']).default('all'),
});

marketRoutes.get('/overview', async (c) => {
  requireAuth(c);
  const q = query(c, windowQuery);
  await ensureFreshSnapshot();
  return c.json(await overview(q));
});

marketRoutes.get('/skills/:slug', async (c) => {
  requireAuth(c);
  const slug = c.req.param('slug');
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || !KNOWN_SKILL_SLUGS.has(slug)) throw notFound('Skill');
  const q = query(c, windowQuery.extend({ days: z.enum(['30', '90']).default('90').transform((v) => Number(v) as 30 | 90) }));
  await ensureFreshSnapshot();
  return c.json(await skillDetail(slug, q));
});

marketRoutes.get('/me', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, windowQuery);
  await ensureFreshSnapshot();
  const dna = await computeSkillDna(auth.user.id);
  return c.json(await meVsMarket(dna, q));
});

marketRoutes.get('/sources', async (c) => {
  requireAuth(c);
  const q = query(c, windowQuery.pick({ days: true }));
  await ensureFreshSnapshot();
  return c.json(await sourcesReport(q));
});

// ---------- Platform admin ----------

marketRoutes.post('/admin/fetch', async (c) => {
  const auth = requirePlatformAdmin(c);
  rateLimit(`market-fetch:${auth.user.id}`, 6, 60_000);
  const out = await fetchLatest();
  await audit(c, {
    action: 'market.fetch_latest',
    targetType: 'job_feed',
    meta: { results: out.results.map((r) => ({ source: r.source, status: r.status, fetched: r.fetched })), newPostings: out.snapshot.newPostings },
  });
  return c.json(out);
});

marketRoutes.post('/admin/recompute', async (c) => {
  const auth = requirePlatformAdmin(c);
  rateLimit(`market-recompute:${auth.user.id}`, 10, 60_000);
  const snapshot = await runSnapshot({ trigger: 'admin' });
  await audit(c, { action: 'market.recompute', targetType: 'market_snapshot', meta: { newPostings: snapshot.newPostings, rowsWritten: snapshot.rowsWritten } });
  return c.json({ snapshot });
});
