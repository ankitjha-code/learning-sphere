/**
 * Career Launch Studio logic shared across career routes, the jobs module and jobs.ts.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { applications, applicationEvents, jobTargets, profiles, users } from '../../db/schema';
import type { ResumeData } from '../../db/schema/build';
import { enqueue } from '../../jobs/queue';
import { aiComplete, type AiChatMessage, type AiResult } from '../../ai/service';
import { computeSkillDna, type SkillDnaEntry } from '../learning/skilldna';
import { scoreSkills, buildPlan, readinessChecklist, READINESS_FORMULA, type SkillRow } from './analysis';
import { emptyResume, newId, DEFAULT_SECTION_ORDER } from './resume';
import { extractSkills } from './extract';

export * from './analysis';
export { extractSkills, toStoredSkills, skillName } from './extract';

// ---------- Application status machine ----------

export const APP_STATUSES = ['saved', 'applied', 'assessment', 'interview', 'offer', 'accepted', 'rejected', 'withdrawn'] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

export const TRANSITIONS: Record<AppStatus, AppStatus[]> = {
  saved: ['applied', 'withdrawn'],
  applied: ['assessment', 'interview', 'offer', 'rejected', 'withdrawn'],
  assessment: ['interview', 'offer', 'rejected', 'withdrawn'],
  interview: ['assessment', 'offer', 'rejected', 'withdrawn'],
  offer: ['accepted', 'rejected', 'withdrawn'],
  accepted: ['withdrawn'],
  rejected: ['saved', 'applied'], // reopen a record entered by mistake
  withdrawn: ['saved', 'applied'],
};

export const SOURCES = ['manual', 'platform', 'feed', 'referral', 'campus'] as const;

export async function logEvent(applicationId: string, e: { kind: 'status' | 'note' | 'round' | 'reminder' | 'created'; fromStatus?: string | null; toStatus?: string | null; note?: string | null }) {
  await db.insert(applicationEvents).values({ applicationId, kind: e.kind, fromStatus: e.fromStatus ?? null, toStatus: e.toStatus ?? null, note: e.note ?? null });
}

/** Queues a one-time follow-up reminder for an application's nextActionAt. Idempotent per (application, time). */
export async function scheduleReminder(app: { id: string; userId: string; nextActionAt: Date | null }) {
  if (!app.nextActionAt) return;
  const dueAt = new Date(app.nextActionAt);
  await enqueue('career.reminder', { applicationId: app.id, dueAt: dueAt.toISOString() }, { idempotencyKey: `career.reminder:${app.id}:${dueAt.getTime()}`, runAt: dueAt, maxAttempts: 3, createdBy: app.userId });
}

/** Personal tracker update when the employer-side platform application changes (used by jobs module). */
export async function setApplicationStatus(appId: string, userId: string, to: AppStatus, note?: string, outcomeReason?: string | null) {
  const [app] = await db.select().from(applications).where(and(eq(applications.id, appId), eq(applications.userId, userId)));
  if (!app || app.status === to) return app ?? null;
  const [updated] = await db
    .update(applications)
    .set({ status: to, outcomeReason: outcomeReason ?? app.outcomeReason, appliedAt: to === 'applied' && !app.appliedAt ? new Date() : app.appliedAt, updatedAt: new Date() })
    .where(eq(applications.id, app.id))
    .returning();
  await logEvent(app.id, { kind: 'status', fromStatus: app.status, toStatus: to, note });
  return updated;
}

// ---------- Target analysis ----------

export async function analyzeTarget(userId: string, target: typeof jobTargets.$inferSelect, dna?: SkillDnaEntry[]) {
  const skillDna = dna ?? (await computeSkillDna(userId));
  const { score, rows } = scoreSkills(target.extractedSkills, skillDna);
  const aiSuggested = ((target.analysis as { aiSuggestedSkills?: { slug: string; name: string; required: boolean }[] } | null)?.aiSuggestedSkills ?? []).filter(
    (s) => !target.extractedSkills.some((e) => e.slug === s.slug),
  );
  const [plan, checklist] = await Promise.all([buildPlan(rows), readinessChecklist(userId, target, rows)]);
  const details = extractSkills(target.description);
  const rowsWithCue: (SkillRow & { snippet?: string; matched?: string[] })[] = rows.map((r) => {
    const d = details.find((x) => x.slug === r.slug);
    return { ...r, snippet: d?.snippet, matched: d?.matched };
  });
  const analysis = {
    computedAt: new Date().toISOString(),
    score,
    formula: READINESS_FORMULA,
    skills: rowsWithCue,
    counts: {
      required: rows.filter((r) => r.required).length,
      preferred: rows.filter((r) => !r.required).length,
      strong: rows.filter((r) => r.status === 'verified' || r.status === 'demonstrated').length,
      gaps: rows.filter((r) => r.status === 'none' || r.status === 'self_reported').length,
    },
    plan,
    checklist,
    checklistDone: checklist.filter((c) => c.done).length,
    aiSuggestedSkills: aiSuggested,
  };
  await db
    .update(jobTargets)
    .set({ analysis: { ...analysis, skills: undefined, plan: undefined, checklist: undefined, score, checklistDone: analysis.checklistDone, checklistTotal: checklist.length, aiSuggestedSkills: aiSuggested } })
    .where(eq(jobTargets.id, target.id));
  return analysis;
}

// ---------- Resume defaults ----------

/** Starts a resume from what the user already entered in their profile (no new facts). */
export async function resumeFromProfile(userId: string): Promise<ResumeData> {
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId));
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  const d = emptyResume(u?.name ?? '');
  if (u?.email) d.basics.email = u.email;
  if (p) {
    d.basics.headline = p.headline ?? undefined;
    d.basics.location = p.location ?? undefined;
    d.basics.links = (p.links ?? []).map((l) => ({ label: l.label, url: l.url }));
    d.summary = p.bio ?? '';
    d.experience = (p.experience ?? []).map((e) => ({ id: newId(), company: e.company, title: e.title, start: e.start, end: e.end, bullets: e.summary ? [e.summary] : [] }));
    d.education = (p.education ?? []).map((e) => ({
      id: newId(),
      institution: e.institution,
      degree: e.degree,
      field: e.field,
      start: e.startYear ? String(e.startYear) : undefined,
      end: e.endYear ? String(e.endYear) : undefined,
      grade: e.grade,
    }));
  }
  d.sectionOrder = [...DEFAULT_SECTION_ORDER];
  return d;
}

// ---------- AI helpers (always optional) ----------

export async function runAi(opts: { userId: string; assistant: string; feature: string; messages: AiChatMessage[]; json?: boolean; maxTokens?: number }): Promise<AiResult> {
  try {
    return await aiComplete({ userId: opts.userId, assistant: opts.assistant, feature: opts.feature, messages: opts.messages, json: opts.json, maxTokens: opts.maxTokens ?? 1200, temperature: 0.2 });
  } catch {
    return { ok: false, reason: 'error', message: 'The AI service failed. The non-AI tools still work.' };
  }
}

export function aiUnavailable(r: Extract<AiResult, { ok: false }>) {
  return { ok: false as const, reason: r.reason, message: r.message, retryAfterSeconds: r.retryAfterSeconds };
}

export function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

export const HONESTY_SYSTEM =
  'You help a job seeker with their own materials. Never invent employment history, qualifications, achievements, grades, metrics, dates or certifications. Never add numbers that are not in the user text. When a fact would strengthen the text but is missing, ask the user a question instead of supplying it.';

export async function latestApplications(userId: string, limit = 50) {
  return db.select().from(applications).where(eq(applications.userId, userId)).orderBy(desc(applications.updatedAt)).limit(limit);
}
