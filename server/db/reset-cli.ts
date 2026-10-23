import fs from 'node:fs';
import path from 'node:path';
import { config } from '../lib/config';

const cfg = config();
if (cfg.DATABASE_URL) {
  console.error('db:reset only deletes the embedded PGlite database. For hosted Postgres, drop the schema yourself.');
  process.exit(1);
}
const dir = path.resolve(cfg.PGLITE_DIR);
fs.rmSync(dir, { recursive: true, force: true });
console.info(`[db] removed ${dir}. Start the server to recreate, migrate and seed it.`);
