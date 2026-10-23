import { seedReference } from './reference';

/** Reference library (skills, tracks, problems, templates) — product content, safe to run on every boot. */
export { seedReference };

/** Sample organizations and accounts — only when demo seeding is enabled. */
export async function seedAll() {
  const ref = await seedReference();
  const { seedDemo } = await import('./demo');
  await seedDemo();
  console.info(`[seed] library: ${ref.skills} skills, ${ref.tracks} tracks, ${ref.problems} problems, ${ref.templates} templates; demo data created`);
}
