// Roles and workspaces shared by server and web.
// A workspace is a UI lens. Permission always comes from an org membership role
// (or the platform role), checked on the server for every request.

export const ORG_KINDS = ['college', 'company', 'training', 'community'] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

export const ORG_ROLES = [
  'org_admin',
  'faculty',
  'faculty_admin',
  'placement_officer',
  'recruiter',
  'recruiter_admin',
  'interviewer',
  'mentor',
  'creator',
  'student',
] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const PLATFORM_ROLES = ['platform_admin', 'support'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const ROLE_LABELS: Record<OrgRole | PlatformRole, string> = {
  org_admin: 'Organization admin',
  faculty: 'Faculty',
  faculty_admin: 'Faculty admin',
  placement_officer: 'Placement officer',
  recruiter: 'Recruiter',
  recruiter_admin: 'Recruiter admin',
  interviewer: 'Interviewer',
  mentor: 'Mentor',
  creator: 'Content creator',
  student: 'Student',
  platform_admin: 'Platform admin',
  support: 'Support',
};

/** Which org roles are allowed in which kind of organization. */
export const ROLES_BY_ORG_KIND: Record<OrgKind, OrgRole[]> = {
  college: ['org_admin', 'faculty', 'faculty_admin', 'placement_officer', 'mentor', 'creator', 'student'],
  company: ['org_admin', 'recruiter', 'recruiter_admin', 'interviewer', 'mentor', 'creator'],
  training: ['org_admin', 'faculty', 'faculty_admin', 'mentor', 'creator', 'student'],
  community: ['org_admin', 'mentor', 'creator', 'student'],
};

export const WORKSPACES = [
  'learner',
  'career',
  'teach',
  'campus',
  'hire',
  'mentor',
  'create',
  'admin',
] as const;
export type Workspace = (typeof WORKSPACES)[number];

export const WORKSPACE_LABELS: Record<Workspace, { label: string; description: string }> = {
  learner: { label: 'Learn', description: 'Roadmaps, practice, projects and progress' },
  career: { label: 'Career', description: 'Resumes, applications and interview prep' },
  teach: { label: 'Teach', description: 'Courses, assignments, grading and cohorts' },
  campus: { label: 'Campus', description: 'Institution, students and placement drives' },
  hire: { label: 'Hire', description: 'Jobs, candidates, assessments and interviews' },
  mentor: { label: 'Mentor', description: 'Mentees, sessions and goals' },
  create: { label: 'Create', description: 'Publish resources, paths and quizzes' },
  admin: { label: 'Admin', description: 'Users, organizations, AI, jobs and audit' },
};

/** Org roles that unlock a workspace inside the active organization. */
export const WORKSPACE_ORG_ROLES: Record<Workspace, OrgRole[] | 'everyone' | 'platform'> = {
  learner: 'everyone',
  career: 'everyone',
  teach: ['faculty', 'faculty_admin', 'org_admin'],
  campus: ['placement_officer', 'org_admin', 'faculty_admin'],
  hire: ['recruiter', 'recruiter_admin', 'interviewer', 'org_admin'],
  mentor: ['mentor'],
  create: ['creator', 'faculty', 'faculty_admin', 'org_admin'],
  admin: 'platform',
};

export function workspacesFor(opts: {
  orgRoles: OrgRole[];
  platformRole: PlatformRole | null;
  isMentor: boolean;
}): Workspace[] {
  return WORKSPACES.filter((w) => {
    const rule = WORKSPACE_ORG_ROLES[w];
    if (rule === 'everyone') return true;
    if (rule === 'platform') return opts.platformRole === 'platform_admin' || opts.platformRole === 'support';
    if (w === 'mentor' && opts.isMentor) return true;
    // Org admins can also open the admin workspace scoped to their org (handled in UI as org settings).
    return rule.some((r) => opts.orgRoles.includes(r));
  });
}

export function hasAnyRole(roles: readonly string[], wanted: readonly OrgRole[]): boolean {
  return wanted.some((w) => roles.includes(w));
}
