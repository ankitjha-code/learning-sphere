import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 90000,
    hookTimeout: 60000,
    pool: 'forks',
    // Each test file runs its own embedded Postgres; too many at once starves the CPU.
    maxWorkers: 4,
  },
});
