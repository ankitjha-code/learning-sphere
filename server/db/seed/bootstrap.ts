import { sql } from 'drizzle-orm';
import { db } from '../client';
import { users } from '../schema';
import { seedReference } from './reference';

/** Always refresh the reference library; create demo data only when enabled and the database has no users yet. */
export async function bootstrapSeed(opts: { demo: boolean }) {
  const ref = await seedReference();
  console.info(`[seed] library ready: ${ref.skills} skills, ${ref.tracks} tracks, ${ref.problems} problems, ${ref.templates} project templates`);
  if (!opts.demo) return;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if (count > 0) return;
  const { seedDemo } = await import('./demo');
  await seedDemo();
  console.info('[seed] demo organizations and accounts created (sample data)');
}
