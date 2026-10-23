import { seedDemoCore } from './core';
import type { DemoContext } from './context';

/**
 * Module demo seeders run in order after the core seed. Each module owns one file
 * in this folder exporting `seed(ctx)`. All demo records are clearly sample data
 * (sample organizations, @demo.learnsphere.test accounts).
 */
const MODULE_SEEDERS: { name: string; load: () => Promise<{ seed: (ctx: DemoContext) => Promise<void> }> }[] = [
  { name: 'learning', load: () => import('./learning') },
  { name: 'assessments', load: () => import('./assessments') },
  { name: 'practice', load: () => import('./practice') },
  { name: 'ai', load: () => import('./ai') },
  { name: 'library', load: () => import('./library') },
  { name: 'workspace', load: () => import('./workspace') },
  { name: 'teach', load: () => import('./teach') },
  { name: 'campus', load: () => import('./campus') },
  { name: 'hire', load: () => import('./hire') },
  { name: 'market', load: () => import('./market') },
  { name: 'career', load: () => import('./career') },
  { name: 'projects', load: () => import('./projects') },
  { name: 'portfolio', load: () => import('./portfolio') },
  { name: 'mentorship', load: () => import('./mentorship') },
  { name: 'community', load: () => import('./community') },
  { name: 'motivation', load: () => import('./motivation') },
  { name: 'admin', load: () => import('./admin') },
];

export async function seedDemo() {
  const ctx = await seedDemoCore();
  for (const m of MODULE_SEEDERS) {
    const mod = await m.load();
    await mod.seed(ctx);
  }
  return ctx;
}
