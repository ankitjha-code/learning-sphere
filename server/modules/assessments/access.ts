import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { assessments, assessmentInvites, cohortMembers, questions } from '../../db/schema';
import { type AuthContext, type Ctx, requireAuth, rolesIn, isPlatformAdmin } from '../../lib/context';
import { forbidden, notFound } from '../../lib/errors';
import { ROLE_LABELS, type OrgRole } from '@shared/roles';
import type { ExtSettings } from './schemas';

export type Assessment = typeof assessments.$inferSelect;
export type Question = typeof questions.$inferSelect;

/** Org roles that may create, edit, grade and view results, per assessment mode. */
export const MANAGER_ROLES: Record<string, OrgRole[]> = {
  practice: ['faculty', 'faculty_admin', 'org_admin', 'creator'],
  diagnostic: ['faculty', 'faculty_admin', 'org_admin', 'creator'],
  classroom: ['faculty', 'faculty_admin', 'org_admin', 'creator'],
  recruitment: ['recruiter', 'recruiter_admin', 'org_admin'],
  placement: ['placement_officer', 'org_admin'],
};

/** Roles that may only view results (never edit or grade). */
export const VIEWER_ROLES: Record<string, OrgRole[]> = {
  recruitment: ['interviewer'],
};

/** Anyone who may author org questions (union of all manager roles). */
export const AUTHOR_ROLES: OrgRole[] = [...new Set(Object.values(MANAGER_ROLES).flat())];

export function settingsOf(a: Pick<Assessment, 'settings'>): ExtSettings {
  return a.settings as ExtSettings;
}

export function isPersonal(a: Pick<Assessment, 'orgId' | 'settings'>) {
  return !a.orgId && !!settingsOf(a).personal;
}

export function isPublicLibrary(a: Pick<Assessment, 'orgId' | 'settings'>) {
  return !a.orgId && !settingsOf(a).personal;
}

/** Modes a user may manage in an org, given their roles there. */
export function manageableModes(roles: OrgRole[]): string[] {
  return Object.entries(MANAGER_ROLES)
    .filter(([, rs]) => rs.some((r) => roles.includes(r)))
    .map(([m]) => m);
}

export type AccessLevel = 'view' | 'edit';

/** Pure check used by both the HTTP layer and the service contract. */
export function managementLevel(auth: AuthContext, a: Pick<Assessment, 'orgId' | 'ownerId' | 'mode' | 'settings'>): AccessLevel | null {
  if (!a.orgId) {
    if (isPersonal(a)) return a.ownerId === auth.user.id ? 'edit' : null;
    return isPlatformAdmin(auth) ? 'edit' : null;
  }
  const held = rolesIn(auth, a.orgId);
  if (!held.length) return null;
  if ((MANAGER_ROLES[a.mode] ?? []).some((r) => held.includes(r))) return 'edit';
  // The owner keeps edit rights while still a staff member of the org.
  if (a.ownerId === auth.user.id && held.some((r) => r !== 'student')) return 'edit';
  if ((VIEWER_ROLES[a.mode] ?? []).some((r) => held.includes(r))) return 'view';
  return null;
}

/**
 * Loads an assessment the caller may manage. Callers with no relationship to the
 * record's org get 404 (existence is not leaked); members without a suitable
 * role get 403 naming the roles needed.
 */
export async function loadManaged(c: Ctx, id: string, need: AccessLevel = 'edit'): Promise<Assessment> {
  const auth = requireAuth(c);
  const [a] = await db.select().from(assessments).where(eq(assessments.id, id));
  if (!a) throw notFound('Assessment');
  const level = managementLevel(auth, a);
  if (level === 'edit' || (level === 'view' && need === 'view')) return a;
  if (!a.orgId || !rolesIn(auth, a.orgId).length) throw notFound('Assessment');
  const roles = need === 'view' ? [...(MANAGER_ROLES[a.mode] ?? []), ...(VIEWER_ROLES[a.mode] ?? [])] : (MANAGER_ROLES[a.mode] ?? []);
  throw forbidden(`Managing this assessment needs one of these roles: ${roles.map((r) => ROLE_LABELS[r]).join(', ')}.`, { requiredRoles: roles });
}

export type TakeAccess = { ok: true; invite: typeof assessmentInvites.$inferSelect | null } | { ok: false; reason: string };

/** Whether a user may take an assessment (independent of window and attempt limits). */
export async function takeAccess(userId: string, a: Assessment): Promise<TakeAccess> {
  const [invite] = await db
    .select()
    .from(assessmentInvites)
    .where(and(eq(assessmentInvites.assessmentId, a.id), eq(assessmentInvites.userId, userId)));
  if (invite && invite.status !== 'revoked') return { ok: true, invite };
  if (invite?.status === 'revoked') return { ok: false, reason: 'Your invitation to this assessment was withdrawn.' };
  if (isPersonal(a)) return a.ownerId === userId ? { ok: true, invite: null } : { ok: false, reason: 'not_found' };
  if (isPublicLibrary(a) && (a.mode === 'practice' || a.mode === 'diagnostic')) return { ok: true, invite: null };
  if (a.cohortId) {
    const [m] = await db
      .select()
      .from(cohortMembers)
      .where(and(eq(cohortMembers.cohortId, a.cohortId), eq(cohortMembers.userId, userId)));
    if (m) return { ok: true, invite: null };
  }
  return { ok: false, reason: 'not_found' };
}

/** Org questions are editable by authors in that org; public questions only by platform admins. */
export function canEditQuestion(auth: AuthContext, q: Pick<Question, 'orgId' | 'ownerId' | 'visibility'>) {
  if (!q.orgId) return isPlatformAdmin(auth);
  return AUTHOR_ROLES.some((r) => rolesIn(auth, q.orgId).includes(r));
}

/** May the caller see this question at all (content, without answer key)? */
export function canReadQuestion(auth: AuthContext, q: Pick<Question, 'orgId' | 'visibility' | 'status'>) {
  if (canEditQuestion(auth, q as Question)) return true;
  if (q.visibility === 'public' && q.status === 'active') {
    // Authors browse the public bank to build assessments.
    return isPlatformAdmin(auth) || auth.memberships.some((m) => m.roles.some((r) => AUTHOR_ROLES.includes(r)));
  }
  return false;
}
