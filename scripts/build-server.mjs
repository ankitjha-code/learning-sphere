// Bundles the API into dist/server and copies migrations next to it.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

await build({
  entryPoints: ['server/index.ts', 'server/exec/worker.ts'].filter((f) => fs.existsSync(f)),
  outdir: 'dist/server',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  packages: 'external',
  alias: { '@shared': path.resolve('shared') },
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});
fs.cpSync('server/db/migrations', 'dist/server/migrations', { recursive: true });
console.log('Server bundled to dist/server');
