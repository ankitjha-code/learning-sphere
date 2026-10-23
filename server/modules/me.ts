import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, isNull, sql, inArray, gte } from 'drizzle-orm';
import { db } from '../db/client';
import { users, profiles, notifications, notificationDeliveries, activityEvents } from '../db/schema';
import { type AppEnv, requireAuth } from '../lib/context';
import { body, query, idParam } from '../lib/validate';
import { notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { NOTIFICATION_CATEGORIES } from '../lib/notify';
import { generateInitialPlan } from './learning/planner';

export const meRoutes = new Hono<AppEnv>();

// ---------- Profile ----------

const educationItem = z.object({
  institution: z.string().trim().min(1).max(200),
  degree: z.string().trim().max(120).optional(),
  field: z.string().trim().max(120).optional(),
  startYear: z.number().int().min(1950).max(2100).optional(),
  endYear: z.number().int().min(1950).max(2100).optional(),
  grade: z.string().trim().max(40).optional(),
});
const experienceItem = z.object({
  company: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  start: z.string().max(20).optional(),
  end: z.string().max(20).optional(),
  summary: z.string().max(2000).optional(),
});

const profileInput = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  headline: z.string().trim().max(160).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  stage: z.enum(['school_graduate', 'college_student', 'graduate', 'professional', 'career_switcher']).nullable().optional(),
  education: z.array(educationItem).max(10).optional(),
  experience: z.array(experienceItem).max(20).optional(),
  interests: z.array(z.string().trim().max(60)).max(30).optional(),
  targetRoles: z.array(z.string().trim().max(80)).max(10).optional(),
  targetDate: z.string().datetime().nullable().optional(),
  weeklyHours: z.number().int().min(1).max(80).nullable().optional(),
  learningStyle: z.enum(['guided', 'independent', 'project_first', 'intensive', 'interview']).nullable().optional(),
  preferredLanguages: z.array(z.string().trim().max(30)).max(12).optional(),
  links: z.array(z.object({ label: z.string().trim().max(40), url: z.string().url().max(500) })).max(10).optional(),
  timezone: z.string().max(60).optional(),
});

meRoutes.get('/profile', async (c) => {
  const auth = requireAuth(c);
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, auth.user.id));
  return c.json({ profile: p ?? null, user: { name: auth.user.name, email: auth.user.email, timezone: auth.user.timezone } });
});

async function saveProfile(userId: string, input: z.infer<typeof profileInput>) {
  const { name, timezone, targetDate, ...rest } = input;
  if (name || timezone) await db.update(users).set({ ...(name ? { name } : {}), ...(timezone ? { timezone } : {}), updatedAt: new Date() }).where(eq(users.id, userId));
  const values = { ...rest, ...(targetDate !== undefined ? { targetDate: targetDate ? new Date(targetDate) : null } : {}), updatedAt: new Date() };
  await db
    .insert(profiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: profiles.userId, set: values });
}

meRoutes.put('/profile', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, profileInput);
  await saveProfile(auth.user.id, input);
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, auth.user.id));
  return c.json({ profile: p });
});

/**
 * Onboarding: everything optional except skipping is explicit. Generates an
 * editable plan (enrollments + goals) from the stated goals and evidence.
 */
meRoutes.post('/onboarding', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    profileInput.extend({
      skip: z.boolean().optional(),
      selfRatedSkills: z.array(z.object({ slug: z.string().max(80), level: z.number().int().min(1).max(4) })).max(40).optional(),
      trackSlugs: z.array(z.string().max(80)).max(5).optional(),
    }),
  );
  const { skip, selfRatedSkills, trackSlugs, ...profile } = input;
  await saveProfile(auth.user.id, profile);
  let plan = null;
  if (!skip) plan = await generateInitialPlan(auth.user.id, { selfRatedSkills: selfRatedSkills ?? [], trackSlugs });
  await db.update(profiles).set({ onboardingCompletedAt: new Date() }).where(eq(profiles.userId, auth.user.id));
  await audit(c, { action: 'onboarding.completed', targetType: 'user', targetId: auth.user.id, meta: { skipped: !!skip } });
  return c.json({ ok: true, plan });
});

// ---------- Preferences ----------

meRoutes.patch('/preferences', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({
      theme: z.enum(['light', 'dark', 'system']).optional(),
      reducedMotion: z.boolean().optional(),
      publicProfile: z.boolean().optional(),
      showOnLeaderboard: z.boolean().optional(),
      studyReminders: z.boolean().optional(),
      restDays: z.array(z.number().int().min(0).max(6)).max(3).optional(),
      notifications: z
        .record(z.string(), z.object({ inApp: z.boolean(), email: z.boolean() }))
        .optional()
        .refine((v) => !v || Object.keys(v).every((k) => k in NOTIFICATION_CATEGORIES), 'Unknown notification category'),
      locale: z.string().max(12).optional(),
    }),
  );
  const [u] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, auth.user.id));
  const { locale, ...prefs } = input;
  const merged = { ...u.preferences, ...prefs, notifications: { ...(u.preferences.notifications ?? {}), ...(prefs.notifications ?? {}) } };
  await db
    .update(users)
    .set({ preferences: merged, ...(locale ? { locale } : {}), updatedAt: new Date() })
    .where(eq(users.id, auth.user.id));
  return c.json({ preferences: merged });
});

meRoutes.get('/notification-settings', async (c) => {
  const auth = requireAuth(c);
  const prefs = (auth.user.preferences as { notifications?: Record<string, { inApp: boolean; email: boolean }> }).notifications ?? {};
  return c.json({
    categories: Object.entries(NOTIFICATION_CATEGORIES).map(([key, v]) => ({
      key,
      label: v.label,
      inApp: prefs[key]?.inApp ?? true,
      email: prefs[key]?.email ?? v.emailDefault,
      locked: key === 'security',
    })),
  });
});

// ---------- Activity history ----------

meRoutes.get('/activity', async (c) => {
  const auth = requireAuth(c);
  const { days } = query(c, z.object({ days: z.coerce.number().int().min(1).max(366).default(30) }));
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select()
    .from(activityEvents)
    .where(and(eq(activityEvents.userId, auth.user.id), gte(activityEvents.createdAt, since)))
    .orderBy(desc(activityEvents.createdAt))
    .limit(300);
  return c.json({ items: rows });
});

// ---------- Notifications ----------

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.get('/', async (c) => {
  const auth = requireAuth(c);
  const q = query(
    c,
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(20),
      unread: z.enum(['true', 'false']).optional(),
      category: z.string().max(30).optional(),
    }),
  );
  const where = and(
    eq(notifications.userId, auth.user.id),
    q.unread === 'true' ? isNull(notifications.readAt) : undefined,
    q.category ? eq(notifications.category, q.category) : undefined,
  );
  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const ids = rows.map((r) => r.id);
  const deliveries = ids.length
    ? await db.select().from(notificationDeliveries).where(inArray(notificationDeliveries.notificationId, ids))
    : [];
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(notifications).where(where);
  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, auth.user.id), isNull(notifications.readAt)));
  return c.json({
    items: rows.map((r) => {
      const d = deliveries.find((x) => x.notificationId === r.id);
      return { ...r, email: d ? { status: d.status, provider: d.provider, lastError: d.status === 'failed' ? 'Delivery failed' : null } : null };
    }),
    total,
    unread,
  });
});

notificationRoutes.post('/read-all', async (c) => {
  const auth = requireAuth(c);
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, auth.user.id), isNull(notifications.readAt)));
  return c.json({ ok: true });
});

notificationRoutes.post('/:id/read', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const res = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, auth.user.id)))
    .returning({ id: notifications.id });
  if (!res.length) throw notFound('Notification');
  return c.json({ ok: true });
});
