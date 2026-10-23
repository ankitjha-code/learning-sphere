/**
 * Hire module side effects registered at startup.
 *
 * Privacy lifecycle (registerPrivacyHandler). The privacy module itself already handles the
 * core recruiting tables:
 *  - job_applications: anonymized (resume snapshot + cover note removed); stage/status kept as an
 *    employment record linked to "Deleted user".
 *  - hiring_decisions, interviews, interview_feedback, offers: retained as employer records
 *    (feedback is written by interviewers about the interview, not authored by the candidate).
 *  - messages: messages the deleting person SENT are deleted; the other party's messages remain
 *    in their thread so their own record stays intact.
 * This handler covers the tables the hire module owns.
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { hireApplyInvitations, hireCandidatePreferences, jobApplications, jobPostings, messages, organizations } from '../../db/schema';
import { registerPrivacyHandler } from '../privacy/registry';

registerPrivacyHandler({
  key: 'hire',
  label: 'Recruiter visibility and job invitations',
  tables: ['hire_candidate_preferences', 'hire_apply_invitations', 'hire_company_profiles'],
  retention:
    'Discoverability settings and invitations to apply are deleted with your account. Employer hiring records (application stages, decisions, interview feedback and offers) are kept by the employer and linked to "Deleted user"; your resume snapshot and cover note are removed.',
  export: async (userId) => {
    const [prefs] = await db.select().from(hireCandidatePreferences).where(eq(hireCandidatePreferences.userId, userId));
    const invitations = await db
      .select({ postingTitle: jobPostings.title, company: organizations.name, message: hireApplyInvitations.message, createdAt: hireApplyInvitations.createdAt })
      .from(hireApplyInvitations)
      .innerJoin(jobPostings, eq(jobPostings.id, hireApplyInvitations.postingId))
      .innerJoin(organizations, eq(organizations.id, hireApplyInvitations.orgId))
      .where(eq(hireApplyInvitations.candidateId, userId));
    const appIds = (await db.select({ id: jobApplications.id }).from(jobApplications).where(eq(jobApplications.candidateId, userId))).map((r) => r.id);
    const threads = appIds.length
      ? await db
          .select({ threadKey: messages.threadKey, fromMe: messages.senderId, body: messages.body, createdAt: messages.createdAt })
          .from(messages)
          .where(inArray(messages.threadKey, appIds.map((id) => `app:${id}`)))
      : [];
    return {
      discoverableByRecruiters: prefs?.discoverableByRecruiters ?? false,
      invitationsToApply: invitations,
      applicationMessages: threads.map((m) => ({ thread: m.threadKey, direction: m.fromMe === userId ? 'sent' : 'received', body: m.body, at: m.createdAt })),
    };
  },
  count: async (userId) => (await db.select({ id: hireApplyInvitations.id }).from(hireApplyInvitations).where(eq(hireApplyInvitations.candidateId, userId))).length,
  erase: async (userId) => {
    const a = await db.delete(hireCandidatePreferences).where(eq(hireCandidatePreferences.userId, userId)).returning({ id: hireCandidatePreferences.userId });
    const b = await db.delete(hireApplyInvitations).where(eq(hireApplyInvitations.candidateId, userId)).returning({ id: hireApplyInvitations.id });
    return { action: 'deleted', count: a.length + b.length };
  },
});
