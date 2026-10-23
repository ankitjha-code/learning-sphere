import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './lib/config';
import { openDb, setDb } from './db/client';
import { createApp } from './app';
import { startWorker } from './jobs/queue';
import { registerAllJobs } from './jobs/register';
import { bootstrapSeed } from './db/seed/bootstrap';
import { shutdownExecPool } from './exec/pool';

async function main() {
  const cfg = config();
  const handle = await openDb({ url: cfg.DATABASE_URL, pgliteDir: cfg.PGLITE_DIR });
  setDb(handle);
  await handle.migrate();
  console.info(`[db] ${handle.kind === 'pglite' ? `embedded PGlite at ${cfg.PGLITE_DIR}` : 'Postgres via DATABASE_URL'} — migrations applied`);

  const seedDemo = cfg.SEED_DEMO ? cfg.SEED_DEMO === 'true' : !cfg.isProd;
  await bootstrapSeed({ demo: seedDemo });

  registerAllJobs();
  if (cfg.WORKER_ENABLED !== 'false') startWorker();

  const app = createApp();

  // Serve the built SPA in production (single process, single port).
  const webDir = path.resolve('dist/web');
  if (fs.existsSync(webDir)) {
    app.use('/assets/*', serveStatic({ root: './dist/web', onFound: (_p, c) => c.header('cache-control', 'public, max-age=31536000, immutable') }));
    app.use('/*', serveStatic({ root: './dist/web' }));
    // Re-read index.html when it changes (cheap mtime check) so redeploys never serve stale asset hashes.
    const indexPath = path.join(webDir, 'index.html');
    let cached = { mtime: 0, html: '' };
    const indexHtml = () => {
      const m = fs.statSync(indexPath).mtimeMs;
      if (m !== cached.mtime) cached = { mtime: m, html: fs.readFileSync(indexPath, 'utf8') };
      return cached.html;
    };
    app.get('/assets/*', (c) => c.text('Not found', 404));
    app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.notFound() : c.html(indexHtml())));
  }

  serve({ fetch: app.fetch, port: cfg.PORT }, (info) => {
    console.info(`[http] LearnSphere Nexus API listening on http://localhost:${info.port}`);
  });

  const shutdown = async () => {
    console.info('[http] shutting down');
    await Promise.resolve(shutdownExecPool()).catch(() => {});
    await handle.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
