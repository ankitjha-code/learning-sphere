import { config } from '../lib/config';
import { openDb } from './client';

const cfg = config();
const h = await openDb({ url: cfg.DATABASE_URL, pgliteDir: cfg.PGLITE_DIR });
await h.migrate();
console.info(`[db] migrations applied (${h.kind})`);
await h.close();
