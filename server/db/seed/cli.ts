import { config } from '../../lib/config';
import { openDb, setDb } from '../client';
import { bootstrapSeed } from './bootstrap';

const cfg = config();
const h = await openDb({ url: cfg.DATABASE_URL, pgliteDir: cfg.PGLITE_DIR });
setDb(h);
await h.migrate();
await bootstrapSeed({ demo: process.argv.includes('--demo') || cfg.SEED_DEMO === 'true' || (!cfg.isProd && cfg.SEED_DEMO !== 'false') });
await h.close();
