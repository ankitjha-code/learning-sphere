/**
 * Creates (or promotes) a platform admin and prints a one-time password-set link.
 * Usage: DATABASE_URL=... npx tsx scripts/create-admin.ts <email> "<Full name>"
 */
import { sql, eq } from 'drizzle-orm';
import { config } from '../server/lib/config';
import { openDb, setDb, db } from '../server/db/client';
import { users, profiles, passwordResets, auditLogs } from '../server/db/schema';
import { randomToken, sha256 } from '../server/lib/crypto';

const [email, name] = process.argv.slice(2);
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: npx tsx scripts/create-admin.ts <email> "<Full name>"');
  process.exit(1);
}

const cfg = config();
const h = await openDb({ url: cfg.DATABASE_URL, pgliteDir: cfg.PGLITE_DIR });
setDb(h);
await h.migrate();

const lower = email.toLowerCase();
let [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${lower}`);
if (u) {
  await db.update(users).set({ platformRole: 'platform_admin', status: 'active', updatedAt: new Date() }).where(eq(users.id, u.id));
  console.info(`Promoted existing user ${lower} to platform admin.`);
} else {
  [u] = await db.insert(users).values({ email: lower, name: name || 'Platform Admin', platformRole: 'platform_admin' }).returning();
  await db.insert(profiles).values({ userId: u.id, onboardingCompletedAt: new Date() });
  console.info(`Created platform admin ${lower}.`);
}

const token = randomToken(32);
await db.insert(passwordResets).values({ userId: u.id, tokenHash: sha256(token), createdBy: 'admin', expiresAt: new Date(Date.now() + 24 * 3600_000) });
await db.insert(auditLogs).values({ action: 'admin.bootstrap', actorId: null, targetType: 'user', targetId: u.id, meta: { via: 'scripts/create-admin.ts' } });
console.info(`\nSet the password within 24 hours (single use):\n${cfg.APP_URL}/reset-password?token=${token}\n`);
await h.close();
