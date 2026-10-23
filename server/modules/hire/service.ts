/**
 * TalentBridge (employer-side recruiting) shared logic: access rules, stage changes with
 * auditable decisions, candidate-safe payloads, messaging and CSV helpers.
 *
 * Roles in a company org:
 *  - recruiter_admin, org_admin: everything, incl. company profile and decision-log export
 *  - recruiter: jobs, candidates, assessments, interviews, offers, messages
 *  - interviewer: only candidates of interviews they are assigned to; submits own feedback
 */
import { randomBytes } from 'node:crypto';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { applications, hiringDecisions, interviews, jobApplications, jobPostings, memberships, messages, offers, organizations, users } from '../../db/schema';
import { type AuthContext, type Ctx, requireAuth, requireActiveOrg, requireOrgRole, rolesIn } from '../../lib/context';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { setApplicationStatus, type AppStatus } from '../career/service';
import type { OrgRole } from '@shared/roles';

export const MANAGE_ROLES: OrgRole[] = ['recruiter', 'recruiter_admin', 'org_admin'];
export const VIEW_ROLES: OrgRole[] = [...MANAGE_ROLES, 'interviewer'];
export const ADMIN_ROLES: OrgRole[] = ['recruiter_admin', 'org_admin'];
export const INTERVIEWER_CAPABLE: OrgRole[] = ['interviewer', 'recruiter', 'recruiter_admin', 'org_admin'];

export const TERMINAL_STAGES = ['rejected', 'withdrawn'] as const;
export const KNOWN_STAGE_LABELS: Record<string, string> = {
  applied: 'Applied',
  eligibility_review: 'Eligibility review',
  shortlisted: 'Shortlisted',
  assessment: 'Assessment',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};
export function stageLabel(s: string) {
  return KNOWN_STAGE_LABELS[s] ?? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export type Job = typeof jobPostings.$inferSelect;
export type JobApp = typeof jobApplications.$inferSelect;

// ---------- Access ----------

export function hasAny(held: readonly string[], wanted: readonly string[]) {
  return wanted.some((w) => held.includes(w));
}

/** Active org for hire screens. Interviewers may read; pass MANAGE_ROLES for writes. */
export function hireOrg(c: Ctx, roles: OrgRole[] = VIEW_ROLES) {
  const { orgId, roles: held } = requireActiveOrg(c, roles);
  return { orgId, roles: held, canManage: hasAny(held, MANAGE_ROLES), isAdmin: hasAny(held, ADMIN_ROLES) };
}

/** Application ids in an org that this user interviews for. */
export async function assignedApplicationIds(orgId: string, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: interviews.applicationId })
    .from(interviews)
    .where(and(eq(interviews.orgId, orgId), sql`${userId} = ANY(${interviews.interviewerIds})`, sql`${interviews.applicationId} IS NOT NULL`));
  return [...new Set(rows.map((r) => r.id!).filter(Boolean))];
}

/**
 * Loads a job. Callers with no hire role in the job's org get 404 (existence is not leaked).
 * `manage` additionally requires a recruiter role (403 for interviewers).
 */
export async function loadJob(c: Ctx, id: string, need: 'view' | 'manage' = 'view'): Promise<Job> {
  const auth = requireAuth(c);
  const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, id));
  if (!job || !hasAny(rolesIn(auth, job.orgId), VIEW_ROLES)) throw notFound('Job');
  if (need === 'manage') requireOrgRole(c, job.orgId, MANAGE_ROLES);
  return job;
}

/**
 * Loads an application. Recruiters of the org see all; interviewers only those they interview
 * for (others are 404). `manage` requires a recruiter role.
 */
export async function loadApplication(c: Ctx, id: string, need: 'view' | 'manage' = 'view'): Promise<{ app: JobApp; job: Job; canManage: boolean }> {
  const auth = requireAuth(c);
  const [row] = await db.select({ app: jobApplications, job: jobPostings }).from(jobApplications).innerJoin(jobPostings, eq(jobPostings.id, jobApplications.postingId)).where(eq(jobApplications.id, id));
  if (!row) throw notFound('Application');
  const held = rolesIn(auth, row.app.orgId);
  const canManage = hasAny(held, MANAGE_ROLES);
  if (!canManage) {
    if (!held.includes('interviewer')) throw notFound('Application');
    const assigned = await assignedApplicationIds(row.app.orgId, auth.user.id);
    if (!assigned.includes(row.app.id)) throw notFound('Application');
    if (need === 'manage') requireOrgRole(c, row.app.orgId, MANAGE_ROLES);
  }
  return { app: row.app, job: row.job, canManage };
}

// ---------- Stages ----------

const STAGE_KEY = /^[a-z][a-z0-9_]{1,39}$/;

/** Validates a configurable pipeline. Returns an error message or null. */
export function stagesError(stages: string[]): string | null {
  if (stages.length < 2 || stages.length > 12) return 'Use between 2 and 12 stages.';
  if (stages[0] !== 'applied') return 'The first stage must be "applied".';
  if (stages[stages.length - 1] !== 'hired') return 'The last stage must be "hired".';
  if (new Set(stages).size !== stages.length) return 'Each stage can appear only once.';
  for (const s of stages) {
    if (!STAGE_KEY.test(s)) return `"${s}" is not a valid stage key (lowercase letters, digits and underscores).`;
    if ((TERMINAL_STAGES as readonly string[]).includes(s)) return `"${s}" is added automatically as a closing stage.`;
  }
  return null;
}

/** Candidate's personal tracker status for an employer-side stage. */
export function personalStatusFor(stage: string): AppStatus {
  switch (stage) {
    case 'assessment':
      return 'assessment';
    case 'interview':
      return 'interview';
    case 'offer':
      return 'offer';
    case 'hired':
      return 'accepted';
    case 'rejected':
      return 'rejected';
    case 'withdrawn':
      return 'withdrawn';
    default:
      return 'applied';
  }
}

export type StageMoveInput = { toStage: string; reason?: string | null; visibleToCandidate?: boolean };

/** Describes whether a move needs a written reason (rejections, skips, going back, reopening). */
export function moveRules(job: Pick<Job, 'stages'>, app: Pick<JobApp, 'stage' | 'status'>, toStage: string): { needsReason: boolean; why: string | null; error: string | null } {
  if (toStage === 'withdrawn') return { needsReason: false, why: null, error: 'Only the candidate can withdraw an application.' };
  if (app.status === 'withdrawn' || app.status === 'declined') return { needsReason: false, why: null, error: 'The candidate closed this application. It cannot be moved.' };
  if (toStage === app.stage) return { needsReason: false, why: null, error: `The application is already in ${stageLabel(toStage)}.` };
  if (toStage !== 'rejected' && !job.stages.includes(toStage)) return { needsReason: false, why: null, error: `"${toStage}" is not a stage of this job.` };
  if (toStage === 'rejected') return { needsReason: true, why: 'Rejections need a reason for the decision record.', error: null };
  const from = job.stages.indexOf(app.stage);
  const to = job.stages.indexOf(toStage);
  if (app.stage === 'rejected' || from < 0) return { needsReason: true, why: 'Reopening a closed application needs a reason.', error: null };
  if (to < from) return { needsReason: true, why: 'Moving an application back needs a reason.', error: null };
  if (to - from > 1) return { needsReason: true, why: `This skips ${job.stages.slice(from + 1, to).map(stageLabel).join(', ')}. Skipping stages needs a reason.`, error: null };
  return { needsReason: false, why: null, error: null };
}

/**
 * Moves one application. Every change writes hiring_decisions + audit_logs, updates the
 * candidate's personal tracker row (if any) and notifies the candidate respectfully.
 */
export async function moveApplication(c: Ctx, job: Job, app: JobApp, input: StageMoveInput, opts: { bulk?: boolean } = {}) {
  const auth = requireAuth(c);
  const rules = moveRules(job, app, input.toStage);
  if (rules.error) throw conflict(rules.error);
  const reason = input.reason?.trim() ?? '';
  if (rules.needsReason && reason.length < 5) throw badRequest(rules.why ?? 'A reason is required.', { fields: { reason: 'Write a short reason (at least 5 characters).' } });
  const toStage = input.toStage;
  const status = toStage === 'rejected' ? 'rejected' : toStage === 'hired' ? 'hired' : 'active';
  const decisionReason = reason || `Moved to ${stageLabel(toStage)}`;
  const visible = !!input.visibleToCandidate && !!reason;

  const updated = await db.transaction(async (tx) => {
    const [u] = await tx
      .update(jobApplications)
      .set({ stage: toStage, status, updatedAt: new Date() })
      .where(and(eq(jobApplications.id, app.id), eq(jobApplications.stage, app.stage)))
      .returning();
    if (!u) throw conflict('This application changed in the meantime. Reload and try again.');
    await tx.insert(hiringDecisions).values({ applicationId: app.id, orgId: app.orgId, decidedBy: auth.user.id, fromStage: app.stage, toStage, reason: decisionReason, visibleToCandidate: visible });
    return u;
  });
  await audit(c, {
    action: 'hire.application.stage_changed',
    orgId: app.orgId,
    targetType: 'job_application',
    targetId: app.id,
    meta: { from: app.stage, to: toStage, reason: decisionReason, visibleToCandidate: visible, bulk: !!opts.bulk },
  });
  await syncPersonalTracker(app.id, app.candidateId, toStage, visible ? reason : null);
  await notifyCandidateOfMove(job, updated, visible ? reason : null);
  return updated;
}

export async function syncPersonalTracker(jobApplicationId: string, candidateId: string, stage: string, visibleReason: string | null, note?: string) {
  const [personal] = await db.select({ id: applications.id }).from(applications).where(and(eq(applications.jobApplicationId, jobApplicationId), eq(applications.userId, candidateId)));
  if (!personal) return;
  const to = personalStatusFor(stage);
  await setApplicationStatus(personal.id, candidateId, to, note ?? `Employer update: ${stageLabel(stage)}`, to === 'rejected' ? visibleReason : undefined);
}

async function orgNameOf(orgId: string) {
  const [o] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
  return o?.name ?? 'the employer';
}

async function notifyCandidateOfMove(job: Job, app: JobApp, visibleReason: string | null) {
  const company = await orgNameOf(job.orgId);
  const note = visibleReason ? ` Note from the hiring team: ${visibleReason.slice(0, 400)}` : '';
  const body =
    app.stage === 'rejected'
      ? `Thank you for your interest in ${job.title} at ${company}. After careful review, the team has decided not to move forward with your application at this time.${note}`
      : app.stage === 'hired'
        ? `Congratulations: ${company} has marked you as hired for ${job.title}.${note}`
        : `Your application for ${job.title} at ${company} moved to ${stageLabel(app.stage)}.${note}`;
  await notify(app.candidateId, {
    type: 'hire.application_updated',
    category: 'career',
    title: `Update on your application: ${job.title}`,
    body,
    link: `/app/jobs/applications/${app.id}`,
  });
}

// ---------- Recruiters & members ----------

export async function orgMembersWith(orgId: string, roles: readonly string[]): Promise<string[]> {
  const rows = await db.select({ userId: memberships.userId, roles: memberships.roles }).from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.status, 'active')));
  return rows.filter((r) => hasAny(r.roles, roles)).map((r) => r.userId);
}

export async function notifyRecruiters(orgId: string, n: { type: string; title: string; body?: string; link?: string }, exceptUserId?: string) {
  for (const uid of await orgMembersWith(orgId, ['recruiter', 'recruiter_admin'])) {
    if (uid === exceptUserId) continue;
    await notify(uid, { ...n, category: 'career', orgId });
  }
}

export async function userNames(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uniq));
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ---------- Candidate-safe payloads ----------

/** Keys that describe protected characteristics or unrelated personal attributes. Never returned. */
const PROTECTED_KEY = /^(dob|dateofbirth|birth.*|birthday|age|gender|sex|pronouns?|photo.*|avatar.*|picture|image|religion|caste|marital.*|nationality|ethnicity|race|disability|email|phone|mobile|address)$/i;

export function stripProtected<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripProtected(v)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PROTECTED_KEY.test(k)) continue;
      out[k] = stripProtected(v);
    }
    return out as T;
  }
  return value;
}

// ---------- Offers ----------

/** Extended offers past their expiry become expired (lazy; idempotent). */
export async function expireOffers(where?: ReturnType<typeof eq>) {
  await db
    .update(offers)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(and(eq(offers.status, 'extended'), lt(offers.expiresAt, new Date()), where));
}

// ---------- Messages ----------

export const threadKeyFor = (jobApplicationId: string) => `app:${jobApplicationId}`;

export async function threadMessages(jobApplicationId: string, viewerId: string) {
  const key = threadKeyFor(jobApplicationId);
  const rows = await db.select().from(messages).where(eq(messages.threadKey, key)).orderBy(messages.createdAt).limit(500);
  const names = await userNames(rows.map((r) => r.senderId));
  // Mark as read for the viewer.
  await db
    .update(messages)
    .set({ readBy: sql`array_append(${messages.readBy}, ${viewerId}::uuid)` })
    .where(and(eq(messages.threadKey, key), sql`NOT (${viewerId}::uuid = ANY(${messages.readBy}))`, sql`${messages.senderId} <> ${viewerId}::uuid`));
  return rows.map((m) => ({ id: m.id, senderId: m.senderId, senderName: names.get(m.senderId) ?? 'Former member', body: m.body, createdAt: m.createdAt, mine: m.senderId === viewerId }));
}

export async function unreadCounts(jobApplicationIds: string[], viewerId: string): Promise<Map<string, number>> {
  if (!jobApplicationIds.length) return new Map();
  const rows = await db
    .select({ threadKey: messages.threadKey, n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(inArray(messages.threadKey, jobApplicationIds.map(threadKeyFor)), sql`${messages.senderId} <> ${viewerId}::uuid`, sql`NOT (${viewerId}::uuid = ANY(${messages.readBy}))`))
    .groupBy(messages.threadKey);
  return new Map(rows.map((r) => [r.threadKey.slice(4), Number(r.n)]));
}

// ---------- Meetings ----------

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function jitsiUrl() {
  const bytes = randomBytes(16);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `https://meet.jit.si/LearnSphere-${s}`;
}
export const JITSI_NOTE = 'Free Jitsi Meet link. The first participant may need to sign in to start the meeting.';

// ---------- CSV ----------

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Neutralize spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function isAuthForOrg(auth: AuthContext, orgId: string) {
  return hasAny(rolesIn(auth, orgId), VIEW_ROLES);
}
