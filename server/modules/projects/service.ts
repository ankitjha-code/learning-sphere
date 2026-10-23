import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';
import { db } from '../../db/client';
import {
  projects,
  projectMembers,
  projectMilestones,
  projectTasks,
  projectReviews,
  projectTemplates,
  projectSettings,
  skills,
  users,
  type ProjectDocs,
} from '../../db/schema';
import { type AuthContext, rolesIn } from '../../lib/context';
import { notFound } from '../../lib/errors';
import { skillIdsBySlug } from '../learning/skilldna';

export type Project = typeof projects.$inferSelect;
export type Milestone = typeof projectMilestones.$inferSelect;
export type Task = typeof projectTasks.$inferSelect;
export type MemberRole = 'owner' | 'member' | 'mentor' | 'reviewer';

/** Org roles that supervise cohort capstones (see, review and approve projects with that orgId). */
export const ORG_STAFF_ROLES = ['faculty', 'faculty_admin', 'org_admin'] as const;

export const DOC_SECTIONS = ['architecture', 'dataModel', 'api', 'testPlan', 'deployment', 'retrospective', 'readme'] as const;
export type DocSection = (typeof DOC_SECTIONS)[number];

export const DOC_LABELS: Record<DocSection, string> = {
  architecture: 'Design & architecture',
  dataModel: 'Data model',
  api: 'API & interfaces',
  testPlan: 'Test plan',
  deployment: 'Deployment notes',
  retrospective: 'Retrospective',
  readme: 'README',
};

export type ProjectAccess = {
  project: Project;
  role: MemberRole | null;
  isOwner: boolean;
  orgStaff: boolean;
  /** Can change project content: requirements, tasks, milestones, docs. */
  canEdit: boolean;
  /** Can post reviews, rubric scores and approve completion. Never the owner. */
  canReview: boolean;
};

export function isOrgStaff(auth: AuthContext, orgId: string | null | undefined) {
  if (!orgId) return false;
  const held = rolesIn(auth, orgId);
  return ORG_STAFF_ROLES.some((r) => held.includes(r));
}

/**
 * Loads a project the caller may see. Owner, accepted members (any role), the
 * designated capstone reviewer, and staff of the project's own organization can see it.
 * Everyone else gets 404 so existence is not leaked.
 */
export async function loadProjectAccess(auth: AuthContext, projectId: string): Promise<ProjectAccess> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw notFound('Project');
  const uid = auth.user.id;
  let role: MemberRole | null = null;
  if (project.ownerId === uid) role = 'owner';
  else {
    const [m] = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, uid)));
    if (m) role = m.role as MemberRole;
  }
  const orgStaff = isOrgStaff(auth, project.orgId);
  const designatedReviewer = !!project.reviewerId && project.reviewerId === uid;
  if (!role && !orgStaff && !designatedReviewer) throw notFound('Project');
  const isOwner = role === 'owner';
  return {
    project,
    role: role ?? (designatedReviewer ? 'reviewer' : null),
    isOwner,
    orgStaff,
    canEdit: isOwner || role === 'member',
    canReview: !isOwner && (role === 'mentor' || role === 'reviewer' || designatedReviewer || orgStaff),
  };
}

// ---------- Progress ----------

export type ProgressBreakdown = {
  percent: number;
  formula: string;
  parts: { key: 'requirements' | 'milestones' | 'tasks'; label: string; done: number; total: number; weight: number }[];
};

/**
 * Progress = weighted share of finished work:
 *   40% required requirements marked done, 30% milestones completed, 30% tasks done
 *   (bugs and issues are excluded from the task share).
 * Parts with no items are left out and their weight is redistributed proportionally.
 * A completed project always reports 100%.
 */
export function computeProgress(project: Pick<Project, 'requirements' | 'status'>, milestones: Pick<Milestone, 'status'>[], tasks: Pick<Task, 'status' | 'kind'>[]): ProgressBreakdown {
  const reqs = project.requirements.filter((r) => !r.optional);
  const work = tasks.filter((t) => t.kind === 'task');
  const raw = [
    { key: 'requirements' as const, label: 'Required requirements done', done: reqs.filter((r) => r.done).length, total: reqs.length, base: 0.4 },
    { key: 'milestones' as const, label: 'Milestones completed', done: milestones.filter((m) => m.status === 'done').length, total: milestones.length, base: 0.3 },
    { key: 'tasks' as const, label: 'Tasks done (bugs and issues excluded)', done: work.filter((t) => t.status === 'done').length, total: work.length, base: 0.3 },
  ];
  const active = raw.filter((p) => p.total > 0);
  const baseSum = active.reduce((s, p) => s + p.base, 0);
  const parts = raw.map((p) => ({ key: p.key, label: p.label, done: p.done, total: p.total, weight: p.total > 0 && baseSum > 0 ? p.base / baseSum : 0 }));
  let percent = Math.round(parts.reduce((s, p) => s + (p.total ? (p.done / p.total) * p.weight : 0), 0) * 100);
  if (project.status === 'completed') percent = 100;
  return {
    percent,
    formula: '40% required requirements done + 30% milestones completed + 30% tasks done (bugs/issues excluded). Empty parts are skipped and their weight is shared by the others. Completed projects show 100%.',
    parts,
  };
}

export async function progressFor(projectIds: string[]) {
  const out = new Map<string, number>();
  if (!projectIds.length) return out;
  const [ps, ms, ts] = await Promise.all([
    db.select({ id: projects.id, requirements: projects.requirements, status: projects.status }).from(projects).where(inArray(projects.id, projectIds)),
    db.select({ projectId: projectMilestones.projectId, status: projectMilestones.status }).from(projectMilestones).where(inArray(projectMilestones.projectId, projectIds)),
    db.select({ projectId: projectTasks.projectId, status: projectTasks.status, kind: projectTasks.kind }).from(projectTasks).where(inArray(projectTasks.projectId, projectIds)),
  ]);
  for (const p of ps) {
    out.set(
      p.id,
      computeProgress(
        p,
        ms.filter((m) => m.projectId === p.id),
        ts.filter((t) => t.projectId === p.id),
      ).percent,
    );
  }
  return out;
}

// ---------- Helpers ----------

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60) || 'project'
  );
}

export async function uniqueProjectSlug(ownerId: string, title: string) {
  const base = slugify(title);
  const rows = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(and(eq(projects.ownerId, ownerId), sql`${projects.slug} like ${base.replace(/[%_]/g, '\\$&') + '%'}`));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now()}`;
}

export async function ensureSettings(projectId: string) {
  await db.insert(projectSettings).values({ projectId }).onConflictDoNothing();
  const [s] = await db.select().from(projectSettings).where(eq(projectSettings.projectId, projectId));
  return s;
}

export function tokenMatches(expected: string | null | undefined, given: string | null | undefined) {
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Team members who contribute work (owner + role member). They receive completion evidence and XP. */
export async function contributorIds(project: Project) {
  const rows = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.role, 'member')));
  return [...new Set([project.ownerId, ...rows.map((r) => r.userId)])];
}

/** Everyone on the team except `exceptUserId` (for notifications). */
export async function teamIds(project: Project, exceptUserId?: string) {
  const rows = await db.select({ userId: projectMembers.userId }).from(projectMembers).where(eq(projectMembers.projectId, project.id));
  return [...new Set([project.ownerId, ...rows.map((r) => r.userId)])].filter((u) => u !== exceptUserId);
}

export async function skillsByIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select({ id: skills.id, slug: skills.slug, name: skills.name }).from(skills).where(inArray(skills.id, ids));
}

// ---------- Deterministic README / case study ----------

type ReadmeInput = {
  project: Project;
  milestones: Milestone[];
  tasks: Task[];
  team: { name: string; role: string }[];
  skillNames: string[];
};

/**
 * Builds a README or case study strictly from what is recorded on the project.
 * Nothing is invented: sections with no data say so, so the learner knows what to write.
 */
export function generateReadme({ project, milestones, tasks, team, skillNames }: ReadmeInput, kind: 'readme' | 'case_study'): string {
  const docs = project.docs as ProjectDocs;
  const lines: string[] = [];
  const done = project.requirements.filter((r) => r.done);
  const open = project.requirements.filter((r) => !r.done);
  const missing = (what: string) => `_Not documented yet. Add ${what} in the project workspace._`;
  if (kind === 'readme') {
    lines.push(`# ${project.title}`, '');
    if (project.problem) lines.push(project.problem, '');
    if (project.demoUrl || project.repoUrl) {
      if (project.demoUrl) lines.push(`- Demo: ${project.demoUrl}`);
      if (project.repoUrl) lines.push(`- Repository: ${project.repoUrl}`);
      lines.push('');
    }
    lines.push('## Features', '');
    if (done.length) for (const r of done) lines.push(`- ${r.text}`);
    else lines.push('_No requirements are marked done yet._');
    if (open.length) {
      lines.push('', '### Not yet implemented', '');
      for (const r of open) lines.push(`- ${r.text}${r.optional ? ' (optional)' : ''}`);
    }
    if (skillNames.length) lines.push('', '## Tech and skills', '', skillNames.map((s) => `- ${s}`).join('\n'));
    lines.push('', '## Architecture', '', docs.architecture?.trim() || missing('architecture notes'));
    lines.push('', '## API', '', docs.api?.trim() || missing('API or interface documentation'));
    lines.push('', '## Testing', '', docs.testPlan?.trim() || missing('a test plan'));
    lines.push('', '## Deployment', '', docs.deployment?.trim() || missing('deployment notes'));
    if (team.length > 1) lines.push('', '## Team', '', team.map((t) => `- ${t.name} (${t.role})`).join('\n'));
    return lines.join('\n') + '\n';
  }
  // Case study
  lines.push(`# Case study: ${project.title}`, '');
  lines.push('## Problem', '', project.problem || missing('the problem statement'), '');
  lines.push('## Intended users', '', project.intendedUsers || missing('who the project is for'), '');
  if (project.objectives.length) lines.push('## What I set out to learn', '', project.objectives.map((o) => `- ${o}`).join('\n'), '');
  lines.push('## What was built', '');
  if (done.length) {
    for (const r of done) {
      lines.push(`- **${r.text}**`);
      for (const a of r.acceptance) lines.push(`  - Accepted when: ${a}`);
    }
  } else lines.push('_No requirements are marked done yet._');
  lines.push('');
  const doneMs = milestones.filter((m) => m.status === 'done');
  lines.push('## How it progressed', '');
  if (milestones.length) {
    for (const m of [...milestones].sort((a, b) => a.sortOrder - b.sortOrder))
      lines.push(`- ${m.status === 'done' ? '[x]' : '[ ]'} ${m.title}${m.completedAt ? ` (completed ${new Date(m.completedAt).toISOString().slice(0, 10)})` : ''}`);
  } else lines.push('_No milestones recorded._');
  const bugs = tasks.filter((t) => t.kind !== 'task');
  lines.push(
    '',
    `Recorded work: ${tasks.filter((t) => t.kind === 'task' && t.status === 'done').length} of ${tasks.filter((t) => t.kind === 'task').length} tasks done, ${doneMs.length} of ${milestones.length} milestones completed, ${bugs.filter((b) => b.status === 'done').length} of ${bugs.length} bugs/issues resolved.`,
    '',
  );
  lines.push('## Design decisions', '', docs.architecture?.trim() || missing('design and architecture notes'), '');
  if (docs.dataModel?.trim()) lines.push('## Data model', '', docs.dataModel.trim(), '');
  lines.push('## Testing approach', '', docs.testPlan?.trim() || missing('a test plan'), '');
  lines.push('## Retrospective', '', docs.retrospective?.trim() || missing('a retrospective (what went well, what you would change)'), '');
  if (skillNames.length) lines.push('## Skills practised', '', skillNames.map((s) => `- ${s}`).join('\n'), '');
  if (project.approvedAt) lines.push(`_Completion approved by a reviewer on ${new Date(project.approvedAt).toISOString().slice(0, 10)}._`, '');
  if (project.demoUrl) lines.push(`Demo: ${project.demoUrl}`);
  if (project.repoUrl) lines.push(`Repository: ${project.repoUrl}`);
  return lines.join('\n') + '\n';
}

export async function readmeInput(project: Project): Promise<ReadmeInput> {
  const [milestones, tasks, team, sk] = await Promise.all([
    db.select().from(projectMilestones).where(eq(projectMilestones.projectId, project.id)).orderBy(asc(projectMilestones.sortOrder)),
    db.select().from(projectTasks).where(eq(projectTasks.projectId, project.id)),
    teamWithNames(project),
    skillsByIds(project.skillIds),
  ]);
  return { project, milestones, tasks, team: team.map((t) => ({ name: t.name, role: t.role })), skillNames: sk.map((s) => s.name) };
}

export async function teamWithNames(project: Project) {
  const rows = await db
    .select({ userId: projectMembers.userId, role: projectMembers.role, name: users.name, avatarColor: users.avatarColor, email: users.email, addedAt: projectMembers.addedAt })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, project.id));
  if (!rows.some((r) => r.userId === project.ownerId)) {
    const [o] = await db.select({ name: users.name, avatarColor: users.avatarColor, email: users.email }).from(users).where(eq(users.id, project.ownerId));
    if (o) rows.unshift({ userId: project.ownerId, role: 'owner', name: o.name, avatarColor: o.avatarColor, email: o.email, addedAt: project.startedAt });
  }
  return rows;
}

// ---------- Public project view ----------

/**
 * What anyone with the link may see. Never includes private notes, member emails,
 * review drafts or (unless the owner opted in) the task board.
 */
export async function publicProjectView(projectId: string, token: string | undefined) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project || project.visibility === 'private') return null;
  const settings = await ensureSettings(project.id);
  if (project.visibility === 'unlisted' && !tokenMatches(settings.shareToken, token)) return null;
  const input = await readmeInput(project);
  const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, project.ownerId));
  const [template] = project.templateId
    ? await db.select({ title: projectTemplates.title, isCapstone: projectTemplates.isCapstone }).from(projectTemplates).where(eq(projectTemplates.id, project.templateId))
    : [];
  let approval: { reviewerName: string; at: string; body: string } | null = null;
  if (project.approvedBy && project.approvedAt) {
    const [r] = await db
      .select({ body: projectReviews.body, name: users.name })
      .from(projectReviews)
      .innerJoin(users, eq(users.id, projectReviews.reviewerId))
      .where(and(eq(projectReviews.projectId, project.id), eq(projectReviews.kind, 'approval')))
      .orderBy(sql`${projectReviews.createdAt} desc`)
      .limit(1);
    approval = { reviewerName: r?.name ?? 'Reviewer', at: project.approvedAt.toISOString(), body: r?.body ?? '' };
  }
  const docs = project.docs as ProjectDocs;
  return {
    project: {
      id: project.id,
      title: project.title,
      category: project.category,
      status: project.status,
      problem: project.problem,
      intendedUsers: project.intendedUsers,
      objectives: project.objectives,
      requirements: project.requirements.map((r) => ({ id: r.id, text: r.text, acceptance: r.acceptance, done: r.done, optional: !!r.optional })),
      docs: Object.fromEntries(DOC_SECTIONS.filter((k) => docs[k]?.trim()).map((k) => [k, docs[k]])),
      repoUrl: project.repoUrl,
      demoUrl: project.demoUrl,
      // Uploaded files are served through the public project endpoint (anonymous viewers cannot use /api/files).
      screenshots: settings.screenshotLinks.map((l) => ({
        url: l.fileId ? `/api/projects/public/${project.id}/files/${l.fileId}${project.visibility === 'unlisted' && token ? `?token=${encodeURIComponent(token)}` : ''}` : l.url,
        caption: l.caption,
        isFile: !!l.fileId,
      })),
      startedAt: project.startedAt,
      completedAt: project.completedAt,
      templateTitle: template?.title ?? null,
      isCapstone: !!template?.isCapstone,
    },
    ownerName: owner?.name ?? 'Unknown',
    team: input.team,
    skills: input.skillNames,
    milestones: input.milestones.map((m) => ({ title: m.title, status: m.status, completedAt: m.completedAt })),
    tasks: settings.showTasksPublic ? input.tasks.map((t) => ({ title: t.title, kind: t.kind, status: t.status, priority: t.priority })) : null,
    progress: computeProgress(project, input.milestones, input.tasks),
    verification: approval
      ? { kind: 'verified_by_reviewer' as const, label: 'Completion approved by a reviewer', ...approval }
      : project.status === 'completed'
        ? { kind: 'self_completed' as const, label: 'Marked complete by the builder (not independently reviewed)' }
        : null,
  };
}

// ---------- Creation ----------

/** Copies a template into a new project. Guided mode also pre-creates the task board. */
export async function createProjectFromTemplate(
  ownerId: string,
  t: typeof projectTemplates.$inferSelect,
  opts: { mode: 'guided' | 'partial' | 'independent'; title?: string; dueAt?: string | null; orgId?: string | null; rubricId?: string | null; reviewerId?: string | null },
) {
  const skillMap = await skillIdsBySlug(t.skillSlugs);
  const title = opts.title?.trim() || t.title;
  const now = Date.now();
  const lastWeek = Math.max(0, ...t.milestones.map((m) => m.weekOffset));
  const [p] = await db
    .insert(projects)
    .values({
      ownerId,
      orgId: opts.orgId ?? null,
      templateId: t.id,
      title,
      slug: await uniqueProjectSlug(ownerId, title),
      category: t.category,
      mode: opts.mode,
      problem: t.problem,
      intendedUsers: t.intendedUsers,
      objectives: t.objectives,
      // Independent mode keeps the requirement statements but leaves acceptance criteria for the learner to write.
      requirements: t.requirements.map((r) => ({ id: r.id, text: r.text, acceptance: opts.mode === 'independent' ? [] : r.acceptance, done: false, optional: r.optional })),
      skillIds: [...skillMap.values()],
      status: 'planning',
      dueAt: opts.dueAt ? new Date(opts.dueAt) : new Date(now + (lastWeek + 1) * 7 * 86400_000),
      reviewRubricId: opts.rubricId ?? null,
      reviewerId: opts.reviewerId ?? null,
    })
    .returning();
  await db.insert(projectMembers).values({ projectId: p.id, userId: ownerId, role: 'owner' }).onConflictDoNothing();
  await db.insert(projectSettings).values({ projectId: p.id }).onConflictDoNothing();
  for (const [i, m] of t.milestones.entries()) {
    const [ms] = await db
      .insert(projectMilestones)
      .values({ projectId: p.id, title: m.title, sortOrder: i, dueAt: new Date(now + (m.weekOffset + 1) * 7 * 86400_000) })
      .returning();
    // Guided mode pre-creates the task board; partial and independent learners plan their own tasks.
    if (opts.mode === 'guided' && m.tasks.length) {
      await db.insert(projectTasks).values(m.tasks.map((title, j) => ({ projectId: p.id, milestoneId: ms.id, title, sortOrder: i * 100 + j, createdBy: ownerId })));
    }
  }
  return p;
}
