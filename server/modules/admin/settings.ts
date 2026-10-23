import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { systemSettings, organizations } from '../../db/schema';

/**
 * Platform settings stored in `system_settings` (key -> JSON value).
 * Everything here has a safe default, so a fresh database behaves sensibly
 * before an administrator changes anything.
 */

export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, key));
  return row === undefined || row.value === null || row.value === undefined ? fallback : (row.value as T);
}

export async function writeSetting(key: string, value: unknown, updatedBy: string | null) {
  await db
    .insert(systemSettings)
    .values({ key, value, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedBy, updatedAt: new Date() } });
}

// ---------- Feature flags ----------

export const FEATURE_FLAGS = {
  ai: { label: 'AI assistants', description: 'Tutor, hints, resume review and grading proposals. Needs an AI provider (Admin, AI providers).', default: true },
  community: { label: 'Community', description: 'Discussion spaces, questions, study groups and showcases.', default: true },
  jobFeeds: { label: 'Public job feeds', description: 'Background sync of remote job listings from free public APIs.', default: true },
  mentorship: { label: 'Mentorship', description: 'Mentor profiles, requests and sessions.', default: true },
  publicPortfolios: { label: 'Public portfolios', description: 'Learners can publish a portfolio page anyone with the link can view.', default: true },
  codeExecutionDocker: { label: 'Docker code execution', description: 'Use a local Docker daemon for languages the in-process sandbox cannot run. Only effective when Docker is reachable.', default: false },
  emailNotifications: { label: 'Email notifications', description: 'Send email copies of notifications when an email provider is configured. In-app notifications always work.', default: true },
} as const;
export type FeatureFlag = keyof typeof FEATURE_FLAGS;
export const FEATURE_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlag[];

export async function getFeatureFlags(): Promise<Record<FeatureFlag, boolean>> {
  const stored = await readSetting<Record<string, unknown>>('features', {});
  const out = {} as Record<FeatureFlag, boolean>;
  for (const k of FEATURE_KEYS) out[k] = typeof stored?.[k] === 'boolean' ? (stored[k] as boolean) : FEATURE_FLAGS[k].default;
  return out;
}

/** For other modules: `if (!(await isFeatureEnabled('community'))) throw unavailable(...)`. */
export async function isFeatureEnabled(flag: FeatureFlag): Promise<boolean> {
  return (await getFeatureFlags())[flag];
}

// ---------- Retention, storage, signup ----------

export const retentionSchema = z.object({
  deletionGraceDays: z.number().int().min(1).max(90),
  auditLogRetentionDays: z.number().int().min(90, 'Audit logs are kept at least 90 days.').max(3650),
  exportFileRetentionDays: z.number().int().min(1).max(90),
  aiConversationRetentionDays: z.number().int().min(7).max(3650).nullable(),
});
export type RetentionSettings = z.infer<typeof retentionSchema>;

export const RETENTION_DEFAULTS: RetentionSettings = {
  deletionGraceDays: 7,
  auditLogRetentionDays: 730,
  exportFileRetentionDays: 7,
  aiConversationRetentionDays: null,
};

/** Never prune audit logs younger than this, whatever the setting says. */
export const AUDIT_MIN_RETENTION_DAYS = 90;
/** Revoked or expired sessions are removed this long after they stop working. */
export const SESSION_PRUNE_DAYS = 30;

export async function getRetention(): Promise<RetentionSettings> {
  const stored = await readSetting<Partial<RetentionSettings>>('retention', {});
  // The privacy module reads `privacy.deletionGraceDays`; keep both in sync when saving.
  const grace = await readSetting<number | null>('privacy.deletionGraceDays', null);
  const merged = { ...RETENTION_DEFAULTS, ...(stored ?? {}) };
  if (typeof grace === 'number') merged.deletionGraceDays = grace;
  const parsed = retentionSchema.safeParse(merged);
  return parsed.success ? parsed.data : RETENTION_DEFAULTS;
}

export const DEFAULT_USER_QUOTA_BYTES = 200 * 1024 * 1024; // mirrors files/service.ts

export async function getUserStorageQuotaBytes(): Promise<number> {
  const v = await readSetting<number>('storage.userQuotaBytes', DEFAULT_USER_QUOTA_BYTES);
  return typeof v === 'number' && v > 0 ? v : DEFAULT_USER_QUOTA_BYTES;
}

/**
 * Whether self-service registration is open. Invitation sign-ups stay allowed
 * when closed (an org admin vouched for the person).
 * INTEGRATION: /api/auth/register should call this and reject when false and no inviteToken is present.
 */
export async function isSignupOpen(): Promise<boolean> {
  const v = await readSetting<boolean>('auth.signupOpen', true);
  return v !== false;
}

// ---------- Organization policies ----------

export const orgPolicySchema = z.object({
  requireVerifiedRecordForPlacement: z.boolean(),
  allowStudentDirectory: z.boolean(),
  aiEnabled: z.boolean(),
  aiMonthlyRequestLimit: z.number().int().min(0).max(1_000_000).nullable(),
  maxUploadMb: z.number().int().min(1).max(10),
});
export type OrgPolicies = z.infer<typeof orgPolicySchema>;

export const ORG_POLICY_DEFAULTS: OrgPolicies = {
  requireVerifiedRecordForPlacement: false,
  allowStudentDirectory: false,
  aiEnabled: true,
  aiMonthlyRequestLimit: null,
  maxUploadMb: 10,
};

export const ORG_POLICY_DESCRIPTIONS: Record<keyof OrgPolicies, string> = {
  requireVerifiedRecordForPlacement: 'Students need a verified academic record before they can be added to placement drives.',
  allowStudentDirectory: 'Students can see a directory of other students in the organization. Off by default for privacy.',
  aiEnabled: 'Members can use AI assistants while working in this organization (also needs the platform AI flag).',
  aiMonthlyRequestLimit: 'Maximum AI requests per month across the whole organization. Empty means the plan limit applies.',
  maxUploadMb: 'Largest single upload members can make, in MB. The platform maximum is 10 MB.',
};

export function readOrgPolicies(settings: Record<string, unknown> | null | undefined): OrgPolicies {
  const raw = (settings?.policies ?? {}) as Partial<OrgPolicies>;
  const merged = { ...ORG_POLICY_DEFAULTS, ...raw };
  const parsed = orgPolicySchema.safeParse(merged);
  return parsed.success ? parsed.data : ORG_POLICY_DEFAULTS;
}

/** For other modules: policies of an organization with defaults applied. */
export async function getOrgPolicies(orgId: string): Promise<OrgPolicies> {
  const [o] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId));
  return readOrgPolicies(o?.settings);
}
