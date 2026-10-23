/** Platform-wide AI settings stored in system_settings (keys prefixed `ai.`). */
import { inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { systemSettings } from '../db/schema';

export type RedactionMode = 'notice_providers' | 'always' | 'off';

export type AiLimits = { userDailyRequests: number; orgMonthlyRequests: number };

export type AiSettings = {
  enabled: boolean;
  disabledFeatures: string[];
  limits: AiLimits;
  redaction: RedactionMode;
};

export const DEFAULT_LIMITS: AiLimits = { userDailyRequests: 60, orgMonthlyRequests: 3000 };

/** Features other modules use; listed in Admin so they can be switched off one by one. */
export const KNOWN_FEATURES: { id: string; label: string }[] = [
  { id: 'chat', label: 'AI Council chat' },
  { id: 'hint', label: 'Practice hints' },
  { id: 'grading_proposal', label: 'Grading proposals for instructors' },
  { id: 'resume_review', label: 'Resume review' },
  { id: 'jd_analysis', label: 'Job description analysis' },
  { id: 'summary', label: 'Summaries' },
  { id: 'quiz_generation', label: 'Quiz generation' },
];

const KEYS = { enabled: 'ai.enabled', disabledFeatures: 'ai.disabledFeatures', limits: 'ai.limits', redaction: 'ai.redaction' } as const;

function num(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export async function getAiSettings(): Promise<AiSettings> {
  const rows = await db.select().from(systemSettings).where(inArray(systemSettings.key, Object.values(KEYS)));
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const limits = (get(KEYS.limits) ?? {}) as Partial<AiLimits>;
  const redaction = get(KEYS.redaction);
  return {
    enabled: get(KEYS.enabled) !== false,
    disabledFeatures: Array.isArray(get(KEYS.disabledFeatures)) ? (get(KEYS.disabledFeatures) as unknown[]).map(String) : [],
    limits: {
      userDailyRequests: num(limits.userDailyRequests, DEFAULT_LIMITS.userDailyRequests),
      orgMonthlyRequests: num(limits.orgMonthlyRequests, DEFAULT_LIMITS.orgMonthlyRequests),
    },
    redaction: redaction === 'always' || redaction === 'off' ? redaction : 'notice_providers',
  };
}

export async function updateAiSettings(patch: Partial<AiSettings>, updatedBy: string | null) {
  const writes: { key: string; value: unknown }[] = [];
  if (patch.enabled !== undefined) writes.push({ key: KEYS.enabled, value: patch.enabled });
  if (patch.disabledFeatures !== undefined) writes.push({ key: KEYS.disabledFeatures, value: [...new Set(patch.disabledFeatures)] });
  if (patch.limits !== undefined) writes.push({ key: KEYS.limits, value: patch.limits });
  if (patch.redaction !== undefined) writes.push({ key: KEYS.redaction, value: patch.redaction });
  for (const w of writes) {
    await db
      .insert(systemSettings)
      .values({ key: w.key, value: w.value, updatedBy })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: w.value, updatedBy, updatedAt: new Date() } });
  }
  return getAiSettings();
}
