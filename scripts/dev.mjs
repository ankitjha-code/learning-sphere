// Runs the API (with reload) and the Vite dev server together. Ctrl+C stops both.
import { spawn } from 'node:child_process';

const procs = [
  ['api', 'pnpm', ['run', 'dev:server']],
  ['web', 'pnpm', ['run', 'dev:web']],
].map(([name, cmd, args]) => {
  const p = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], env: process.env });
  const tag = name === 'api' ? '\x1b[36m[api]\x1b[0m' : '\x1b[35m[web]\x1b[0m';
  for (const stream of [p.stdout, p.stderr]) stream.on('data', (d) => process.stdout.write(String(d).split('\n').filter(Boolean).map((l) => `${tag} ${l}`).join('\n') + '\n'));
  p.on('exit', (code) => {
    console.log(`${tag} exited with code ${code}`);
    procs.forEach((x) => x.kill());
    process.exit(code ?? 0);
  });
  return p;
});
process.on('SIGINT', () => procs.forEach((p) => p.kill('SIGINT')));
