import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  projects,
  projectTemplates,
  projectMembers,
  projectMilestones,
  projectTasks,
  projectReviews,
  projectSettings,
  projectInvites,
  rubrics,
  memberships,
  skills,
  skillEvidence,
  users,
  achievements,
  files,
  type ProjectDocs,
} from '../../db/schema';
import { type AppEnv, type Ctx, requireAuth, requireActiveOrg, requireOrgRole } from '../../lib/context';
import { body, query, idParam, emailSchema, pageQuery } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { recordActivity, XP } from '../../lib/activity';
import { randomToken } from '../../lib/crypto';
import { aiComplete } from '../../ai/service';
import { registerFileAccess } from '../files/service';
import { addEvidence, skillIdsBySlug } from '../learning/skilldna';
import { issuePlatformCertificate, ensurePortfolio } from '../portfolio/service';
import {
  type Project,
  type ProjectAccess,
  DOC_SECTIONS,
  DOC_LABELS,
  ORG_STAFF_ROLES,
  loadProjectAccess,
  computeProgress,
  progressFor,
  uniqueProjectSlug,
  ensureSettings,
  contributorIds,
  teamIds,
  teamWithNames,
  skillsByIds,
  generateReadme,
  readmeInput,
  publicProjectView,
  createProjectFromTemplate,
  tokenMatches,
} from './service';

/** Mounted at /api/projects. ProjectForge: templates, project workspaces, reviews and sharing. */
export const projectRoutes = new Hono<AppEnv>();

// Team members (and org staff for capstones) may download screenshot files attached to projects they can see.
registerFileAccess('project', async (auth, file) => {
  const rows = await db.select({ id: projects.id }).from(projects).where(sql`${file.id}::uuid = ANY(${projects.screenshots})`);
  for (const r of rows) {
    try {
      await loadProjectAccess(auth, r.id);
      return true;
    } catch {
      /* not visible to this user */
    }
  }
  return false;
});

const CATEGORIES = ['beginner', 'fullstack', 'api', 'automation', 'data', 'ml', 'ai', 'mobile', 'devtools', 'open_source', 'enterprise'] as const;
const MODES = ['guided', 'partial', 'independent'] as const;
const TASK_STATUS = ['todo', 'doing', 'review', 'done'] as const;
const PRIORITIES = ['low', 'medium', 'high'] as const;
const TASK_KINDS = ['task', 'bug', 'issue'] as const;
const INVITE_ROLES = ['member', 'mentor', 'reviewer'] as const;
const MAX_SCREENSHOTS = 12;

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .url('Enter a full link starting with https://')
  .refine((u) => /^https?:\/\//i.test(u), 'Use an http(s) link.');

const requirementSchema = z.object({
  id: z.string().trim().min(1).max(20),
  text: z.string().trim().min(3, 'Describe the requirement.').max(1000),
  acceptance: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  done: z.boolean().default(false),
  optional: z.boolean().optional(),
});

const ok = { ok: true } as const;
const projectLink = (id: string) => `/app/projects/${id}`;

function requireEdit(a: ProjectAccess) {
  if (!a.canEdit) throw forbidden('Only the project owner and team members can change project content.');
}
function requireOwner(a: ProjectAccess) {
  if (!a.isOwner) throw forbidden('Only the project owner can do this.');
}

async function touch(projectId: string) {
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
}

async function notifyTeam(project: Project, actorId: string, n: { type: string; title: string; body?: string; link?: string }) {
  for (const uid of await teamIds(project, actorId)) {
    await notify(uid, { ...n, category: 'projects', orgId: project.orgId, link: n.link ?? projectLink(project.id) });
  }
}

// ---------- Templates ----------

projectRoutes.get('/templates', async (c) => {
  requireAuth(c);
  const q = query(
    c,
    z.object({
      category: z.string().max(40).optional(),
      difficulty: z.string().max(40).optional(),
      skill: z.string().max(80).optional(),
      track: z.string().max(80).optional(),
      capstone: z.enum(['true', 'false']).optional(),
      q: z.string().trim().max(200).optional(),
    }),
  );
  const like = q.q ? `%${q.q.replace(/[\\%_]/g, '\\$&')}%` : null;
  const rows = await db
    .select({
      id: projectTemplates.id,
      slug: projectTemplates.slug,
      title: projectTemplates.title,
      category: projectTemplates.category,
      difficulty: projectTemplates.difficulty,
      summary: projectTemplates.summary,
      skillSlugs: projectTemplates.skillSlugs,
      trackSlugs: projectTemplates.trackSlugs,
      estimatedHours: projectTemplates.estimatedHours,
      isCapstone: projectTemplates.isCapstone,
      milestoneCount: sql<number>`jsonb_array_length(${projectTemplates.milestones})`,
      requirementCount: sql<number>`jsonb_array_length(${projectTemplates.requirements})`,
    })
    .from(projectTemplates)
    .where(
      and(
        q.category ? eq(projectTemplates.category, q.category) : undefined,
        q.difficulty ? eq(projectTemplates.difficulty, q.difficulty) : undefined,
        q.skill ? sql`${q.skill} = ANY(${projectTemplates.skillSlugs})` : undefined,
        q.track ? sql`${q.track} = ANY(${projectTemplates.trackSlugs})` : undefined,
        q.capstone ? eq(projectTemplates.isCapstone, q.capstone === 'true') : undefined,
        like ? sql`(${projectTemplates.title} ilike ${like} or ${projectTemplates.summary} ilike ${like})` : undefined,
      ),
    )
    .orderBy(asc(projectTemplates.isCapstone), asc(projectTemplates.estimatedHours));
  return c.json({ items: rows, total: rows.length, categories: CATEGORIES });
});

projectRoutes.get('/templates/:slug', async (c) => {
  const auth = requireAuth(c);
  const [t] = await db.select().from(projectTemplates).where(eq(projectTemplates.slug, c.req.param('slug')));
  if (!t) throw notFound('Project template');
  const sk = await db.select({ slug: skills.slug, name: skills.name }).from(skills).where(t.skillSlugs.length ? inArray(skills.slug, t.skillSlugs) : sql`false`);
  const mine = await db
    .select({ id: projects.id, title: projects.title, status: projects.status })
    .from(projects)
    .where(and(eq(projects.ownerId, auth.user.id), eq(projects.templateId, t.id)));
  return c.json({ template: t, skills: sk, myProjects: mine });
});

projectRoutes.post('/templates/:slug/start', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, z.object({ mode: z.enum(MODES).default('guided'), title: z.string().trim().min(3).max(140).optional(), dueAt: z.string().datetime().nullable().optional() }));
  const [t] = await db.select().from(projectTemplates).where(eq(projectTemplates.slug, c.req.param('slug')));
  if (!t) throw notFound('Project template');
  const p = await createProjectFromTemplate(auth.user.id, t, input);
  return c.json({ project: p }, 201);
});

projectRoutes.post('/', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({
      title: z.string().trim().min(3, 'Give the project a name of at least 3 characters.').max(140),
      category: z.enum(CATEGORIES).default('beginner'),
      mode: z.enum(MODES).default('independent'),
      problem: z.string().trim().max(5000).default(''),
      intendedUsers: z.string().trim().max(2000).default(''),
      objectives: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
      skillSlugs: z.array(z.string().max(80)).max(30).default([]),
      dueAt: z.string().datetime().nullable().optional(),
    }),
  );
  const skillMap = await skillIdsBySlug(input.skillSlugs);
  const [p] = await db
    .insert(projects)
    .values({
      ownerId: auth.user.id,
      title: input.title,
      slug: await uniqueProjectSlug(auth.user.id, input.title),
      category: input.category,
      mode: input.mode,
      problem: input.problem,
      intendedUsers: input.intendedUsers,
      objectives: input.objectives,
      skillIds: [...skillMap.values()],
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
    })
    .returning();
  await db.insert(projectMembers).values({ projectId: p.id, userId: auth.user.id, role: 'owner' }).onConflictDoNothing();
  await db.insert(projectSettings).values({ projectId: p.id }).onConflictDoNothing();
  return c.json({ project: p }, 201);
});

// ---------- Lists ----------

projectRoutes.get('/', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, pageQuery.extend({ status: z.string().max(20).optional(), role: z.enum(['owner', 'team', 'reviewing']).optional() }));
  const uid = auth.user.id;
  const memberRows = await db.select({ projectId: projectMembers.projectId, role: projectMembers.role }).from(projectMembers).where(eq(projectMembers.userId, uid));
  const roleOf = new Map(memberRows.map((m) => [m.projectId, m.role]));
  const visible = or(eq(projects.ownerId, uid), eq(projects.reviewerId, uid), memberRows.length ? inArray(projects.id, memberRows.map((m) => m.projectId)) : sql`false`);
  const where = and(visible, q.status ? eq(projects.status, q.status) : q.role ? undefined : sql`${projects.status} <> 'archived'`);
  const all = await db
    .select({
      id: projects.id,
      title: projects.title,
      category: projects.category,
      status: projects.status,
      mode: projects.mode,
      visibility: projects.visibility,
      ownerId: projects.ownerId,
      orgId: projects.orgId,
      reviewerId: projects.reviewerId,
      dueAt: projects.dueAt,
      approvedAt: projects.approvedAt,
      completedAt: projects.completedAt,
      updatedAt: projects.updatedAt,
      ownerName: users.name,
    })
    .from(projects)
    .innerJoin(users, eq(users.id, projects.ownerId))
    .where(where)
    .orderBy(desc(projects.updatedAt));
  const withRole = all.map((p) => ({ ...p, role: p.ownerId === uid ? 'owner' : (roleOf.get(p.id) ?? (p.reviewerId === uid ? 'reviewer' : 'member')) }));
  const filtered = q.role
    ? withRole.filter((p) => (q.role === 'owner' ? p.role === 'owner' : q.role === 'team' ? p.role === 'member' : p.role === 'mentor' || p.role === 'reviewer'))
    : withRole;
  const pageItems = filtered.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
  const progress = await progressFor(pageItems.map((p) => p.id));
  const counts = withRole.reduce<Record<string, number>>((acc, p) => ((acc[p.status] = (acc[p.status] ?? 0) + 1), acc), {});
  return c.json({ items: pageItems.map((p) => ({ ...p, progress: progress.get(p.id) ?? 0 })), total: filtered.length, counts });
});

projectRoutes.get('/invites', async (c) => {
  const auth = requireAuth(c);
  const rows = await db
    .select({ id: projectInvites.id, role: projectInvites.role, createdAt: projectInvites.createdAt, projectId: projects.id, projectTitle: projects.title, invitedByName: users.name })
    .from(projectInvites)
    .innerJoin(projects, eq(projects.id, projectInvites.projectId))
    .innerJoin(users, eq(users.id, projectInvites.invitedBy))
    .where(and(eq(projectInvites.userId, auth.user.id), eq(projectInvites.status, 'pending')))
    .orderBy(desc(projectInvites.createdAt));
  return c.json({ items: rows, total: rows.length });
});

async function respondInvite(c: Ctx, accept: boolean) {
  const auth = requireAuth(c);
  const id = idParam(c);
  const [inv] = await db.select().from(projectInvites).where(and(eq(projectInvites.id, id), eq(projectInvites.userId, auth.user.id), eq(projectInvites.status, 'pending')));
  if (!inv) throw notFound('Invitation');
  await db.update(projectInvites).set({ status: accept ? 'accepted' : 'declined', respondedAt: new Date() }).where(eq(projectInvites.id, id));
  const [p] = await db.select().from(projects).where(eq(projects.id, inv.projectId));
  if (accept) {
    await db.insert(projectMembers).values({ projectId: inv.projectId, userId: auth.user.id, role: inv.role }).onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role: inv.role } });
  }
  if (p) await notify(p.ownerId, { type: accept ? 'project.invite_accepted' : 'project.invite_declined', category: 'projects', title: `${auth.user.name} ${accept ? 'joined' : 'declined to join'} ${p.title}`, link: projectLink(p.id) });
  return c.json({ ok: true, projectId: inv.projectId });
}
projectRoutes.post('/invites/:id/accept', (c) => respondInvite(c, true));
projectRoutes.post('/invites/:id/decline', (c) => respondInvite(c, false));

// ---------- Cohort capstones (faculty) ----------

projectRoutes.get('/capstones', async (c) => {
  const { orgId } = requireActiveOrg(c, ORG_STAFF_ROLES);
  const rows = await db
    .select({ id: projects.id, title: projects.title, status: projects.status, dueAt: projects.dueAt, approvedAt: projects.approvedAt, ownerName: users.name, ownerId: projects.ownerId, reviewerId: projects.reviewerId, reviewRubricId: projects.reviewRubricId, updatedAt: projects.updatedAt })
    .from(projects)
    .innerJoin(users, eq(users.id, projects.ownerId))
    .where(eq(projects.orgId, orgId))
    .orderBy(desc(projects.updatedAt))
    .limit(500);
  const progress = await progressFor(rows.map((r) => r.id));
  return c.json({ items: rows.map((r) => ({ ...r, progress: progress.get(r.id) ?? 0 })), total: rows.length });
});

projectRoutes.get('/capstones/options', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = requireActiveOrg(c, ORG_STAFF_ROLES);
  const rubricRows = await db
    .select({ id: rubrics.id, title: rubrics.title, orgId: rubrics.orgId })
    .from(rubrics)
    .where(or(eq(rubrics.orgId, orgId), and(sql`${rubrics.orgId} is null`, eq(rubrics.ownerId, auth.user.id))));
  const people = await db
    .select({ userId: users.id, name: users.name, roles: memberships.roles })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, 'active')))
    .orderBy(asc(users.name));
  return c.json({
    rubrics: rubricRows,
    students: people.filter((p) => p.roles.includes('student')),
    reviewers: people.filter((p) => p.roles.some((r) => (ORG_STAFF_ROLES as readonly string[]).includes(r) || r === 'mentor')),
  });
});

async function validateCapstoneRefs(c: Ctx, orgId: string, rubricId?: string | null, reviewerId?: string | null) {
  const auth = requireAuth(c);
  if (rubricId) {
    const [r] = await db.select().from(rubrics).where(eq(rubrics.id, rubricId));
    if (!r || !(r.orgId === orgId || (r.orgId === null && r.ownerId === auth.user.id))) throw badRequest('Choose a rubric from this organization.', { fields: { rubricId: 'Unknown rubric.' } });
  }
  if (reviewerId) {
    const [m] = await db.select({ roles: memberships.roles }).from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, reviewerId), eq(memberships.status, 'active')));
    if (!m || !m.roles.some((r) => (ORG_STAFF_ROLES as readonly string[]).includes(r) || r === 'mentor'))
      throw badRequest('The reviewer must be faculty or a mentor in this organization.', { fields: { reviewerId: 'Not a reviewer in this organization.' } });
  }
}

/** Faculty assign a capstone to students: one project per student, owned by the student, tied to the org. */
projectRoutes.post('/capstones', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = requireActiveOrg(c, ORG_STAFF_ROLES);
  const input = await body(
    c,
    z.object({
      templateSlug: z.string().max(80),
      studentIds: z.array(z.string().uuid()).min(1).max(300),
      mode: z.enum(MODES).default('partial'),
      dueAt: z.string().datetime().nullable().optional(),
      rubricId: z.string().uuid().nullable().optional(),
      reviewerId: z.string().uuid().nullable().optional(),
    }),
  );
  const [t] = await db.select().from(projectTemplates).where(eq(projectTemplates.slug, input.templateSlug));
  if (!t) throw badRequest('Choose a project template.', { fields: { templateSlug: 'Unknown template.' } });
  await validateCapstoneRefs(c, orgId, input.rubricId, input.reviewerId);
  const studentRows = await db
    .select({ userId: memberships.userId, roles: memberships.roles })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, 'active'), inArray(memberships.userId, input.studentIds)));
  const valid = studentRows.filter((s) => s.roles.includes('student')).map((s) => s.userId);
  if (valid.length !== new Set(input.studentIds).size) throw badRequest('Every selected person must be a student in this organization.');
  const created: string[] = [];
  for (const sid of valid) {
    const p = await createProjectFromTemplate(sid, t, { mode: input.mode, dueAt: input.dueAt, orgId, rubricId: input.rubricId, reviewerId: input.reviewerId });
    created.push(p.id);
    await notify(sid, { type: 'project.capstone_assigned', category: 'projects', orgId, title: `Capstone assigned: ${t.title}`, body: `${auth.user.name} assigned you a capstone project.`, link: projectLink(p.id) });
  }
  await audit(c, { action: 'project.capstone_assigned', orgId, targetType: 'project_template', targetId: t.id, meta: { count: created.length, rubricId: input.rubricId, reviewerId: input.reviewerId } });
  return c.json({ projectIds: created }, 201);
});

// ---------- Public project page ----------

projectRoutes.get('/public/:id', async (c) => {
  const id = idParam(c);
  const view = await publicProjectView(id, c.req.query('token') ?? undefined);
  if (!view) throw notFound('Project');
  return c.json(view);
});

/** Screenshot bytes for a shared project page (anonymous viewers cannot use /api/files). */
projectRoutes.get('/public/:id/files/:fileId', async (c) => {
  const id = idParam(c);
  const fileId = idParam(c, 'fileId');
  const [project] = await db.select({ visibility: projects.visibility, screenshots: projects.screenshots }).from(projects).where(eq(projects.id, id));
  if (!project || project.visibility === 'private' || !project.screenshots.includes(fileId)) throw notFound('File');
  if (project.visibility === 'unlisted') {
    const s = await ensureSettings(id);
    if (!tokenMatches(s.shareToken, c.req.query('token'))) throw notFound('File');
  }
  const [f] = await db.select({ mime: files.mime, data: files.data }).from(files).where(and(eq(files.id, fileId), eq(files.status, 'ready'), eq(files.purpose, 'project')));
  if (!f?.data || !f.mime.startsWith('image/')) throw notFound('File');
  c.header('Content-Type', f.mime);
  c.header('Content-Length', String(f.data.length));
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'private, max-age=300');
  c.header('Content-Security-Policy', "default-src 'none'; sandbox");
  return c.body(new Uint8Array(f.data));
});

// ---------- Project detail ----------

projectRoutes.get('/:id', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  const p = a.project;
  const [milestones, tasks, team, settings, reviews, sk, template] = await Promise.all([
    db.select().from(projectMilestones).where(eq(projectMilestones.projectId, p.id)).orderBy(asc(projectMilestones.sortOrder)),
    db.select().from(projectTasks).where(eq(projectTasks.projectId, p.id)).orderBy(asc(projectTasks.sortOrder), asc(projectTasks.createdAt)),
    teamWithNames(p),
    ensureSettings(p.id),
    db
      .select({ r: projectReviews, reviewerName: users.name })
      .from(projectReviews)
      .innerJoin(users, eq(users.id, projectReviews.reviewerId))
      .where(eq(projectReviews.projectId, p.id))
      .orderBy(desc(projectReviews.createdAt)),
    skillsByIds(p.skillIds),
    p.templateId ? db.select().from(projectTemplates).where(eq(projectTemplates.id, p.templateId)).then((r) => r[0] ?? null) : Promise.resolve(null),
  ]);
  const invites = a.isOwner
    ? await db
        .select({ id: projectInvites.id, role: projectInvites.role, status: projectInvites.status, name: users.name, email: users.email, createdAt: projectInvites.createdAt })
        .from(projectInvites)
        .innerJoin(users, eq(users.id, projectInvites.userId))
        .where(and(eq(projectInvites.projectId, p.id), eq(projectInvites.status, 'pending')))
    : [];
  const [rubric] = p.reviewRubricId ? await db.select({ id: rubrics.id, title: rubrics.title, criteria: rubrics.criteria }).from(rubrics).where(eq(rubrics.id, p.reviewRubricId)) : [];
  const [reviewer] = p.reviewerId ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, p.reviewerId)) : [];
  const [approver] = p.approvedBy ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, p.approvedBy)) : [];

  // Guidance depends on the mode: guided shows checkpoints, partial offers template hints on request, independent shows none.
  let guide: { mode: string; checkpoints?: { title: string; done: boolean; tasks: string[] }[]; next?: string | null; hints?: { milestone: string; tasks: string[] }[] } | null = null;
  if (template && p.mode === 'guided') {
    guide = {
      mode: 'guided',
      checkpoints: milestones.map((m, i) => ({ title: m.title, done: m.status === 'done', tasks: template.milestones[i]?.tasks ?? [] })),
      next: milestones.find((m) => m.status !== 'done')?.title ?? null,
    };
  } else if (template && p.mode === 'partial') {
    guide = { mode: 'partial', hints: template.milestones.map((m) => ({ milestone: m.title, tasks: m.tasks })) };
  }

  const isMemberLike = a.canEdit || a.canReview;
  return c.json({
    project: { ...p, privateNotes: a.canEdit ? settings.privateNotes : undefined },
    access: { role: a.role, isOwner: a.isOwner, canEdit: a.canEdit, canReview: a.canReview, orgStaff: a.orgStaff },
    settings: { showTasksPublic: settings.showTasksPublic, screenshotLinks: settings.screenshotLinks, shareToken: a.isOwner ? settings.shareToken : null },
    template: template ? { slug: template.slug, title: template.title, isCapstone: template.isCapstone } : null,
    milestones,
    tasks: isMemberLike ? tasks : [],
    team,
    invites,
    reviews: reviews.map((r) => ({ ...r.r, reviewerName: r.reviewerName })),
    skills: sk,
    rubric: rubric ?? null,
    reviewer: reviewer ?? null,
    approvedBy: approver ?? null,
    progress: computeProgress(p, milestones, tasks),
    guide,
    docSections: DOC_SECTIONS.map((k) => ({ key: k, label: DOC_LABELS[k] })),
  });
});

projectRoutes.patch('/:id', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  const input = await body(
    c,
    z.object({
      title: z.string().trim().min(3).max(140).optional(),
      problem: z.string().trim().max(5000).optional(),
      intendedUsers: z.string().trim().max(2000).optional(),
      objectives: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
      repoUrl: httpUrl.nullable().optional(),
      demoUrl: httpUrl.nullable().optional(),
      category: z.enum(CATEGORIES).optional(),
      // owner-only fields
      mode: z.enum(MODES).optional(),
      status: z.enum(['planning', 'building', 'review', 'archived']).optional(),
      dueAt: z.string().datetime().nullable().optional(),
      skillIds: z.array(z.string().uuid()).max(30).optional(),
    }),
  );
  requireEdit(a);
  const ownerOnly = ['mode', 'status', 'dueAt', 'skillIds', 'category'] as const;
  if (!a.isOwner && ownerOnly.some((k) => input[k] !== undefined)) throw forbidden('Only the project owner can change mode, status, deadline, category or skills.');
  if (input.status && a.project.status === 'completed') throw conflict('This project is completed. Completed projects stay completed so their evidence stays honest.');
  if (input.skillIds?.length) {
    const found = await db.select({ id: skills.id }).from(skills).where(inArray(skills.id, input.skillIds));
    if (found.length !== new Set(input.skillIds).size) throw badRequest('Unknown skill selected.', { fields: { skillIds: 'Unknown skill.' } });
  }
  const { dueAt, ...rest } = input;
  const [row] = await db
    .update(projects)
    .set({ ...rest, ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}), updatedAt: new Date() })
    .where(eq(projects.id, a.project.id))
    .returning();
  return c.json({ project: row });
});

projectRoutes.delete('/:id', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireOwner(a);
  if (a.project.orgId) throw forbidden('Capstones assigned by your organization cannot be deleted. Archive it or ask your instructor.');
  await db.delete(projects).where(and(eq(projects.id, a.project.id), eq(projects.ownerId, auth.user.id)));
  // Unverified self-completion evidence goes with the project; reviewer-verified evidence is kept (it records a human's judgment).
  await db.delete(skillEvidence).where(and(eq(skillEvidence.sourceType, 'project'), eq(skillEvidence.sourceId, a.project.id), eq(skillEvidence.verified, false)));
  await audit(c, { action: 'project.deleted', targetType: 'project', targetId: a.project.id, meta: { title: a.project.title } });
  return c.json(ok);
});

// ---------- Requirements ----------

projectRoutes.put('/:id/requirements', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireEdit(a);
  const input = await body(c, z.object({ requirements: z.array(requirementSchema).max(100) }));
  const ids = input.requirements.map((r) => r.id);
  if (new Set(ids).size !== ids.length) throw badRequest('Requirement ids must be unique.');
  const [row] = await db.update(projects).set({ requirements: input.requirements, updatedAt: new Date() }).where(eq(projects.id, a.project.id)).returning();
  return c.json({ requirements: row.requirements });
});

projectRoutes.patch('/:id/requirements/:reqId', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireEdit(a);
  const reqId = c.req.param('reqId');
  const input = await body(c, z.object({ done: z.boolean().optional(), text: z.string().trim().min(3).max(1000).optional(), acceptance: z.array(z.string().trim().min(1).max(500)).max(20).optional() }));
  const list = a.project.requirements;
  const idx = list.findIndex((r) => r.id === reqId);
  if (idx < 0) throw notFound('Requirement');
  const next = [...list];
  next[idx] = { ...next[idx], ...input };
  const [row] = await db.update(projects).set({ requirements: next, updatedAt: new Date() }).where(eq(projects.id, a.project.id)).returning();
  return c.json({ requirement: row.requirements[idx] });
});

// ---------- Docs, notes, screenshots ----------

projectRoutes.patch('/:id/docs', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireEdit(a);
  const input = await body(c, z.object({ section: z.enum(DOC_SECTIONS), content: z.string().max(60_000) }));
  const docs: ProjectDocs = { ...(a.project.docs as ProjectDocs), [input.section]: input.content };
  await db.update(projects).set({ docs, updatedAt: new Date() }).where(eq(projects.id, a.project.id));
  return c.json({ docs });
});

projectRoutes.patch('/:id/notes', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireEdit(a);
  const input = await body(c, z.object({ privateNotes: z.string().max(20_000) }));
  await ensureSettings(a.project.id);
  await db.update(projectSettings).set({ privateNotes: input.privateNotes, updatedAt: new Date() }).where(eq(projectSettings.projectId, a.project.id));
  return c.json(ok);
});

/**
 * Replaces the ordered screenshot list (reorder, caption, remove). Entries are external
 * http(s) links or uploaded files already attached to this project.
 */
projectRoutes.put('/:id/screenshots', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireEdit(a);
  const input = await body(
    c,
    z.object({
      links: z
        .array(z.union([z.object({ fileId: z.string().uuid(), caption: z.string().trim().max(200).optional() }), z.object({ url: httpUrl, caption: z.string().trim().max(200).optional() })]))
        .max(MAX_SCREENSHOTS),
    }),
  );
  const attached = new Set(a.project.screenshots);
  const links: { url: string; caption?: string; fileId?: string }[] = [];
  for (const l of input.links) {
    if ('fileId' in l) {
      if (!attached.has(l.fileId)) throw badRequest('That screenshot file is not attached to this project.');
      links.push({ url: `/api/files/${l.fileId}`, fileId: l.fileId, ...(l.caption ? { caption: l.caption } : {}) });
    } else links.push({ url: l.url, ...(l.caption ? { caption: l.caption } : {}) });
  }
  const keepFiles = links.filter((l) => l.fileId).map((l) => l.fileId!);
  await ensureSettings(a.project.id);
  await db.update(projectSettings).set({ screenshotLinks: links, updatedAt: new Date() }).where(eq(projectSettings.projectId, a.project.id));
  await db.update(projects).set({ screenshots: keepFiles, updatedAt: new Date() }).where(eq(projects.id, a.project.id));
  return c.json({ screenshotLinks: links });
});

/** Attaches an image the caller uploaded via POST /api/files (purpose "project"). */
projectRoutes.post('/:id/screenshots/files', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireEdit(a);
  const input = await body(c, z.object({ fileId: z.string().uuid(), caption: z.string().trim().max(200).optional() }));
  const [f] = await db
    .select({ id: files.id, mime: files.mime })
    .from(files)
    .where(and(eq(files.id, input.fileId), eq(files.ownerId, auth.user.id), eq(files.purpose, 'project'), eq(files.status, 'ready')));
  if (!f) throw badRequest('Upload the image first (purpose "project"), then attach it.', { fields: { fileId: 'Unknown file.' } });
  if (!f.mime.startsWith('image/')) throw badRequest('Screenshots must be PNG, JPEG, WebP or GIF images.', { fields: { fileId: 'Not an image.' } });
  const s = await ensureSettings(a.project.id);
  if (s.screenshotLinks.length >= MAX_SCREENSHOTS) throw badRequest(`A project can show up to ${MAX_SCREENSHOTS} screenshots.`);
  if (a.project.screenshots.includes(f.id)) throw conflict('That image is already attached.');
  const links = [...s.screenshotLinks, { url: `/api/files/${f.id}`, fileId: f.id, ...(input.caption ? { caption: input.caption } : {}) }];
  await db.update(projectSettings).set({ screenshotLinks: links, updatedAt: new Date() }).where(eq(projectSettings.projectId, a.project.id));
  await db.update(projects).set({ screenshots: [...a.project.screenshots, f.id], updatedAt: new Date() }).where(eq(projects.id, a.project.id));
  return c.json({ screenshotLinks: links }, 201);
});

// ---------- Milestones ----------

projectRoutes.post('/:id/milestones', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireEdit(a);
  const input = await body(c, z.object({ title: z.string().trim().min(2).max(200), dueAt: z.string().datetime().nullable().optional() }));
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${projectMilestones.sortOrder}), -1)::int` }).from(projectMilestones).where(eq(projectMilestones.projectId, a.project.id));
  const [m] = await db
    .insert(projectMilestones)
    .values({ projectId: a.project.id, title: input.title, dueAt: input.dueAt ? new Date(input.dueAt) : null, sortOrder: max + 1 })
    .returning();
  await touch(a.project.id);
  return c.json({ milestone: m }, 201);
});

async function loadMilestone(projectId: string, mid: string) {
  const [m] = await db.select().from(projectMilestones).where(and(eq(projectMilestones.id, mid), eq(projectMilestones.projectId, projectId)));
  if (!m) throw notFound('Milestone');
  return m;
}

projectRoutes.patch('/:id/milestones/:mid', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireEdit(a);
  const m = await loadMilestone(a.project.id, idParam(c, 'mid'));
  const input = await body(c, z.object({ title: z.string().trim().min(2).max(200).optional(), dueAt: z.string().datetime().nullable().optional(), sortOrder: z.number().int().min(0).max(1000).optional() }));
  const [row] = await db
    .update(projectMilestones)
    .set({ ...(input.title ? { title: input.title } : {}), ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}), ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}) })
    .where(eq(projectMilestones.id, m.id))
    .returning();
  await touch(a.project.id);
  return c.json({ milestone: row });
});

projectRoutes.post('/:id/milestones/:mid/complete', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireEdit(a);
  const m = await loadMilestone(a.project.id, idParam(c, 'mid'));
  if (m.status === 'done') return c.json({ milestone: m, xpAwarded: false });
  const [row] = await db.update(projectMilestones).set({ status: 'done', completedAt: new Date() }).where(eq(projectMilestones.id, m.id)).returning();
  if (a.project.status === 'planning') await db.update(projects).set({ status: 'building' }).where(eq(projects.id, a.project.id));
  // XP once per milestone per contributor (dedupeKey), even if it is reopened and completed again.
  let xpAwarded = false;
  for (const uid of await contributorIds(a.project)) {
    const ev = await recordActivity(uid, {
      kind: 'project.milestone',
      label: `Completed milestone "${m.title}" in ${a.project.title}`,
      link: projectLink(a.project.id),
      xp: XP.projectMilestone,
      skillIds: a.project.skillIds,
      dedupeKey: `project.milestone:${m.id}`,
      orgId: a.project.orgId,
    });
    if (ev && uid === auth.user.id) xpAwarded = true;
  }
  await notifyTeam(a.project, auth.user.id, { type: 'project.milestone_completed', title: `Milestone completed: ${m.title}`, body: `${auth.user.name} completed a milestone in ${a.project.title}.` });
  await touch(a.project.id);
  return c.json({ milestone: row, xpAwarded });
});

projectRoutes.post('/:id/milestones/:mid/reopen', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireEdit(a);
  const m = await loadMilestone(a.project.id, idParam(c, 'mid'));
  const [row] = await db.update(projectMilestones).set({ status: 'open', completedAt: null }).where(eq(projectMilestones.id, m.id)).returning();
  await touch(a.project.id);
  return c.json({ milestone: row });
});

projectRoutes.delete('/:id/milestones/:mid', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireEdit(a);
  const m = await loadMilestone(a.project.id, idParam(c, 'mid'));
  await db.update(projectTasks).set({ milestoneId: null }).where(eq(projectTasks.milestoneId, m.id));
  await db.delete(projectMilestones).where(eq(projectMilestones.id, m.id));
  await touch(a.project.id);
  return c.json(ok);
});

// ---------- Tasks, bugs and issues ----------

async function assertAssignee(project: Project, assigneeId: string | null | undefined) {
  if (!assigneeId) return;
  const ids = await teamIds(project);
  if (!ids.includes(assigneeId)) throw badRequest('Assign tasks to someone on the project team.', { fields: { assigneeId: 'Not a team member.' } });
}

async function assertMilestone(projectId: string, milestoneId: string | null | undefined) {
  if (!milestoneId) return;
  await loadMilestone(projectId, milestoneId);
}

projectRoutes.post('/:id/tasks', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  const input = await body(
    c,
    z.object({
      title: z.string().trim().min(2, 'Give the task a short title.').max(300),
      description: z.string().trim().max(5000).nullable().optional(),
      kind: z.enum(TASK_KINDS).default('task'),
      status: z.enum(TASK_STATUS).default('todo'),
      priority: z.enum(PRIORITIES).default('medium'),
      assigneeId: z.string().uuid().nullable().optional(),
      milestoneId: z.string().uuid().nullable().optional(),
    }),
  );
  // Mentors and reviewers may file bugs and issues (code review), but only the team plans tasks.
  if (!a.canEdit && !(a.canReview && input.kind !== 'task')) throw forbidden('Only team members can add tasks. Reviewers can report bugs and issues.');
  await assertAssignee(a.project, input.assigneeId);
  await assertMilestone(a.project.id, input.milestoneId);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${projectTasks.sortOrder}), 0)::int` }).from(projectTasks).where(eq(projectTasks.projectId, a.project.id));
  const [t] = await db
    .insert(projectTasks)
    .values({ projectId: a.project.id, ...input, description: input.description ?? null, assigneeId: input.assigneeId ?? null, milestoneId: input.milestoneId ?? null, sortOrder: max + 1, createdBy: auth.user.id })
    .returning();
  if (t.assigneeId && t.assigneeId !== auth.user.id)
    await notify(t.assigneeId, { type: 'project.task_assigned', category: 'projects', orgId: a.project.orgId, title: `New ${t.kind} assigned: ${t.title}`, body: a.project.title, link: projectLink(a.project.id) });
  if (input.kind !== 'task' && !a.canEdit) await notifyTeam(a.project, auth.user.id, { type: 'project.issue_reported', title: `${auth.user.name} reported a ${input.kind}: ${t.title}` });
  await touch(a.project.id);
  return c.json({ task: t }, 201);
});

async function loadTask(projectId: string, tid: string) {
  const [t] = await db.select().from(projectTasks).where(and(eq(projectTasks.id, tid), eq(projectTasks.projectId, projectId)));
  if (!t) throw notFound('Task');
  return t;
}

projectRoutes.patch('/:id/tasks/:tid', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  const t = await loadTask(a.project.id, idParam(c, 'tid'));
  const isAuthorReviewer = a.canReview && t.createdBy === auth.user.id;
  if (!a.canEdit && !isAuthorReviewer) throw forbidden('Only team members can update tasks.');
  const input = await body(
    c,
    z.object({
      title: z.string().trim().min(2).max(300).optional(),
      description: z.string().trim().max(5000).nullable().optional(),
      kind: z.enum(TASK_KINDS).optional(),
      status: z.enum(TASK_STATUS).optional(),
      priority: z.enum(PRIORITIES).optional(),
      assigneeId: z.string().uuid().nullable().optional(),
      milestoneId: z.string().uuid().nullable().optional(),
      sortOrder: z.number().int().min(0).max(100000).optional(),
    }),
  );
  await assertAssignee(a.project, input.assigneeId);
  await assertMilestone(a.project.id, input.milestoneId);
  const [row] = await db.update(projectTasks).set({ ...input, updatedAt: new Date() }).where(eq(projectTasks.id, t.id)).returning();
  if (input.assigneeId && input.assigneeId !== t.assigneeId && input.assigneeId !== auth.user.id)
    await notify(input.assigneeId, { type: 'project.task_assigned', category: 'projects', orgId: a.project.orgId, title: `Assigned to you: ${row.title}`, body: a.project.title, link: projectLink(a.project.id) });
  if (input.status === 'doing' && a.project.status === 'planning') await db.update(projects).set({ status: 'building' }).where(eq(projects.id, a.project.id));
  await touch(a.project.id);
  return c.json({ task: row });
});

projectRoutes.delete('/:id/tasks/:tid', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireEdit(a);
  const t = await loadTask(a.project.id, idParam(c, 'tid'));
  await db.delete(projectTasks).where(eq(projectTasks.id, t.id));
  await touch(a.project.id);
  return c.json(ok);
});

// ---------- Team ----------

projectRoutes.post('/:id/members', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireOwner(a);
  const input = await body(c, z.object({ email: emailSchema, role: z.enum(INVITE_ROLES).default('member') }));
  const [u] = await db.select({ id: users.id, name: users.name, status: users.status }).from(users).where(sql`lower(${users.email}) = ${input.email}`);
  if (!u || u.status !== 'active') throw badRequest('No active LearnSphere Nexus account uses that email. Ask them to sign up first.', { fields: { email: 'No account with this email.' } });
  if (u.id === auth.user.id) throw badRequest('You are already the owner.', { fields: { email: 'That is you.' } });
  const [existing] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, a.project.id), eq(projectMembers.userId, u.id)));
  if (existing) throw conflict(`${u.name} is already on this project.`);
  const [inv] = await db
    .insert(projectInvites)
    .values({ projectId: a.project.id, userId: u.id, role: input.role, invitedBy: auth.user.id })
    .onConflictDoUpdate({ target: [projectInvites.projectId, projectInvites.userId], set: { role: input.role, status: 'pending', invitedBy: auth.user.id, createdAt: new Date(), respondedAt: null } })
    .returning();
  await notify(u.id, {
    type: 'project.invite',
    category: 'projects',
    title: `${auth.user.name} invited you to ${a.project.title}`,
    body: `Role: ${input.role}. Accept or decline from your projects page.`,
    link: '/app/projects?invites=1',
  });
  return c.json({ invite: { id: inv.id, role: inv.role, status: inv.status, name: u.name, email: input.email } }, 201);
});

projectRoutes.delete('/:id/invites/:inviteId', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireOwner(a);
  const res = await db
    .update(projectInvites)
    .set({ status: 'revoked', respondedAt: new Date() })
    .where(and(eq(projectInvites.id, idParam(c, 'inviteId')), eq(projectInvites.projectId, a.project.id), eq(projectInvites.status, 'pending')))
    .returning({ id: projectInvites.id });
  if (!res.length) throw notFound('Invitation');
  return c.json(ok);
});

projectRoutes.patch('/:id/members/:userId', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireOwner(a);
  const userId = idParam(c, 'userId');
  if (userId === a.project.ownerId) throw badRequest('The owner role cannot be changed.');
  const input = await body(c, z.object({ role: z.enum(INVITE_ROLES) }));
  const res = await db.update(projectMembers).set({ role: input.role }).where(and(eq(projectMembers.projectId, a.project.id), eq(projectMembers.userId, userId))).returning();
  if (!res.length) throw notFound('Member');
  return c.json({ member: res[0] });
});

projectRoutes.delete('/:id/members/:userId', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  const userId = idParam(c, 'userId');
  if (userId !== auth.user.id) requireOwner(a); // anyone may leave; only the owner removes others
  if (userId === a.project.ownerId) throw badRequest('The owner cannot leave their own project.');
  const res = await db.delete(projectMembers).where(and(eq(projectMembers.projectId, a.project.id), eq(projectMembers.userId, userId))).returning();
  if (!res.length) throw notFound('Member');
  await db.update(projectTasks).set({ assigneeId: null }).where(and(eq(projectTasks.projectId, a.project.id), eq(projectTasks.assigneeId, userId)));
  return c.json(ok);
});

// ---------- Capstone settings (faculty of the project's own org) ----------

projectRoutes.patch('/:id/capstone', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  if (!a.project.orgId) throw badRequest('Only organization capstones have a rubric and assigned reviewer.');
  requireOrgRole(c, a.project.orgId, ORG_STAFF_ROLES);
  const input = await body(c, z.object({ rubricId: z.string().uuid().nullable().optional(), reviewerId: z.string().uuid().nullable().optional() }));
  await validateCapstoneRefs(c, a.project.orgId, input.rubricId, input.reviewerId);
  const [row] = await db
    .update(projects)
    .set({ ...(input.rubricId !== undefined ? { reviewRubricId: input.rubricId } : {}), ...(input.reviewerId !== undefined ? { reviewerId: input.reviewerId } : {}), updatedAt: new Date() })
    .where(eq(projects.id, a.project.id))
    .returning();
  await audit(c, { action: 'project.capstone_updated', orgId: a.project.orgId, targetType: 'project', targetId: a.project.id, meta: input });
  if (input.reviewerId) await notify(input.reviewerId, { type: 'project.reviewer_assigned', category: 'projects', orgId: a.project.orgId, title: `You are the reviewer for ${a.project.title}`, link: projectLink(a.project.id) });
  return c.json({ project: row });
});

// ---------- Reviews & completion ----------

projectRoutes.post('/:id/review-request', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireEdit(a);
  if (a.project.status === 'completed' && a.project.approvedBy) throw conflict('This project is already approved.');
  const input = await body(c, z.object({ reviewerUserId: z.string().uuid().optional(), note: z.string().trim().max(2000).optional() }));
  const memberRows = await db.select({ userId: projectMembers.userId, role: projectMembers.role }).from(projectMembers).where(eq(projectMembers.projectId, a.project.id));
  const reviewers = new Set(memberRows.filter((m) => m.role === 'mentor' || m.role === 'reviewer').map((m) => m.userId));
  if (a.project.reviewerId) reviewers.add(a.project.reviewerId);
  let targets = [...reviewers];
  if (input.reviewerUserId) {
    if (!reviewers.has(input.reviewerUserId)) throw badRequest('Request reviews from a mentor or reviewer on this project.', { fields: { reviewerUserId: 'Not a reviewer on this project.' } });
    targets = [input.reviewerUserId];
  }
  if (!targets.length) throw badRequest('Invite a mentor or reviewer to the team first (Team tab), then request a review.');
  if (a.project.status !== 'completed') await db.update(projects).set({ status: 'review', updatedAt: new Date() }).where(eq(projects.id, a.project.id));
  for (const uid of targets)
    await notify(uid, { type: 'project.review_requested', category: 'projects', orgId: a.project.orgId, title: `Review requested: ${a.project.title}`, body: input.note || `${auth.user.name} asked for your review.`, link: `${projectLink(a.project.id)}?tab=reviews` });
  return c.json({ ok: true, notified: targets.length });
});

/** Grants completion side effects exactly once (XP, achievement). */
async function recordCompletion(project: Project, userIds: string[]) {
  for (const uid of userIds) {
    await recordActivity(uid, {
      kind: 'project.completed',
      label: `Completed project ${project.title}`,
      link: projectLink(project.id),
      xp: XP.projectCompleted,
      skillIds: project.skillIds,
      dedupeKey: `project.completed:${project.id}`,
      orgId: project.orgId,
    });
    await db.insert(achievements).values({ userId: uid, key: 'project_completed', title: 'First project completed', description: `Completed ${project.title}` }).onConflictDoNothing();
  }
}

projectRoutes.post('/:id/reviews', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  if (!a.canReview) throw forbidden('Only mentors, reviewers or faculty of this capstone can review it. Owners cannot review their own project.');
  const input = await body(
    c,
    z.object({
      kind: z.enum(['feedback', 'code_review', 'changes_requested', 'approval']),
      body: z.string().trim().min(10, 'Write at least a sentence of feedback.').max(20_000),
      rubricScores: z
        .array(z.object({ criterion: z.string().trim().min(1).max(200), points: z.number().min(0).max(1000), max: z.number().positive().max(1000), comment: z.string().trim().max(2000).optional() }))
        .max(30)
        .optional(),
      confirmedSkillIds: z.array(z.string().uuid()).max(30).default([]),
    }),
  );
  const p = a.project;
  if (input.rubricScores?.some((r) => r.points > r.max)) throw badRequest('Rubric points cannot exceed the maximum.', { fields: { rubricScores: 'Points above maximum.' } });
  if (input.kind === 'approval') {
    if (p.approvedBy) throw conflict('This project was already approved.');
    const unknown = input.confirmedSkillIds.filter((s) => !p.skillIds.includes(s));
    if (unknown.length) throw badRequest('Confirm only skills listed on this project.', { fields: { confirmedSkillIds: 'Skill not on this project.' } });
  }
  const [review] = await db
    .insert(projectReviews)
    .values({ projectId: p.id, reviewerId: auth.user.id, kind: input.kind, body: input.body, rubricScores: input.rubricScores ?? null, confirmedSkillIds: input.kind === 'approval' ? input.confirmedSkillIds : [] })
    .returning();

  if (input.kind === 'changes_requested') {
    if (p.status !== 'completed') await db.update(projects).set({ status: 'building', updatedAt: new Date() }).where(eq(projects.id, p.id));
  }
  let evidenceCount = 0;
  if (input.kind === 'approval') {
    const now = new Date();
    await db.update(projects).set({ status: 'completed', approvedBy: auth.user.id, approvedAt: now, completedAt: p.completedAt ?? now, updatedAt: now }).where(eq(projects.id, p.id));
    const totals = (input.rubricScores ?? []).reduce((acc, r) => ({ pts: acc.pts + r.points, max: acc.max + r.max }), { pts: 0, max: 0 });
    const score = totals.max > 0 ? totals.pts / totals.max : 0.8;
    const contributors = await contributorIds(p);
    for (const uid of contributors) {
      // Reviewer evidence supersedes the builder's own unverified completion claim for the same project.
      await db.delete(skillEvidence).where(and(eq(skillEvidence.userId, uid), eq(skillEvidence.source, 'project'), eq(skillEvidence.sourceType, 'project'), eq(skillEvidence.sourceId, p.id)));
      for (const skillId of input.confirmedSkillIds) {
        await addEvidence({ userId: uid, skillId, source: 'review', sourceType: 'project', sourceId: p.id, score, verified: true, verifiedBy: auth.user.id, orgId: p.orgId, note: `Project "${p.title}" approved by ${auth.user.name}` });
        evidenceCount++;
      }
      await db.insert(achievements).values({ userId: uid, key: 'project_verified', title: 'First reviewer-approved project', description: `${p.title} approved by ${auth.user.name}` }).onConflictDoNothing();
    }
    await recordCompletion(p, contributors);
    if (p.templateId) {
      const [t] = await db.select({ isCapstone: projectTemplates.isCapstone }).from(projectTemplates).where(eq(projectTemplates.id, p.templateId));
      if (t?.isCapstone) for (const uid of contributors) await issuePlatformCertificate({ userId: uid, projectId: p.id, title: `Completed capstone: ${p.title}` });
    }
    await audit(c, { action: 'project.approved', orgId: p.orgId, targetType: 'project', targetId: p.id, meta: { score, confirmedSkillIds: input.confirmedSkillIds, contributors: contributors.length } });
  }
  const verb = { feedback: 'left feedback on', code_review: 'posted a code review on', changes_requested: 'requested changes on', approval: 'approved' }[input.kind];
  await notifyTeam(p, auth.user.id, { type: `project.review_${input.kind}`, title: `${auth.user.name} ${verb} ${p.title}`, body: input.body.slice(0, 200), link: `${projectLink(p.id)}?tab=reviews` });
  return c.json({ review, evidenceCount }, 201);
});

/** Owner marks the project complete without a reviewer: completion counts, evidence stays unverified. */
projectRoutes.post('/:id/complete', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireOwner(a);
  const p = a.project;
  if (p.status === 'completed') return c.json({ project: p, alreadyCompleted: true });
  const now = new Date();
  const [row] = await db.update(projects).set({ status: 'completed', completedAt: now, updatedAt: now }).where(eq(projects.id, p.id)).returning();
  const contributors = await contributorIds(p);
  for (const uid of contributors)
    for (const skillId of p.skillIds)
      await addEvidence({ userId: uid, skillId, source: 'project', sourceType: 'project', sourceId: p.id, score: 0.6, verified: false, orgId: p.orgId, note: `Self-completed project "${p.title}" (not reviewed)` });
  await recordCompletion(p, contributors);
  await notifyTeam(p, auth.user.id, { type: 'project.completed', title: `${p.title} marked complete`, body: `${auth.user.name} marked the project complete.` });
  return c.json({ project: row, alreadyCompleted: false });
});

// ---------- Sharing ----------

projectRoutes.patch('/:id/sharing', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireOwner(a);
  const input = await body(c, z.object({ visibility: z.enum(['private', 'unlisted', 'public']).optional(), showTasksPublic: z.boolean().optional() }));
  const s = await ensureSettings(a.project.id);
  if (input.visibility) await db.update(projects).set({ visibility: input.visibility, updatedAt: new Date() }).where(eq(projects.id, a.project.id));
  const shareToken = input.visibility === 'unlisted' && !s.shareToken ? randomToken(18) : s.shareToken;
  await db
    .update(projectSettings)
    .set({ shareToken, ...(input.showTasksPublic !== undefined ? { showTasksPublic: input.showTasksPublic } : {}), updatedAt: new Date() })
    .where(eq(projectSettings.projectId, a.project.id));
  const pf = await ensurePortfolio(auth.user.id);
  const visibility = input.visibility ?? a.project.visibility;
  return c.json({ visibility, shareToken, sharePath: shareLink(pf.slug, a.project.id, visibility, shareToken) });
});

function shareLink(slug: string, projectId: string, visibility: string, token: string | null) {
  if (visibility === 'public') return `/p/${slug}?project=${projectId}`;
  if (visibility === 'unlisted' && token) return `/p/${slug}?project=${projectId}&ptoken=${token}`;
  return null;
}

projectRoutes.get('/:id/share', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireOwner(a);
  const s = await ensureSettings(a.project.id);
  const pf = await ensurePortfolio(auth.user.id);
  return c.json({
    visibility: a.project.visibility,
    shareToken: s.shareToken,
    showTasksPublic: s.showTasksPublic,
    sharePath: shareLink(pf.slug, a.project.id, a.project.visibility, s.shareToken),
    inPortfolio: pf.featuredProjectIds.includes(a.project.id),
  });
});

/** Rotating issues a new unlisted link; the old link stops working immediately. */
projectRoutes.post('/:id/share-token', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireOwner(a);
  await ensureSettings(a.project.id);
  const token = randomToken(18);
  await db.update(projectSettings).set({ shareToken: token, updatedAt: new Date() }).where(eq(projectSettings.projectId, a.project.id));
  const pf = await ensurePortfolio(auth.user.id);
  return c.json({ shareToken: token, sharePath: shareLink(pf.slug, a.project.id, a.project.visibility, token) });
});

projectRoutes.delete('/:id/share-token', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireOwner(a);
  await db.update(projectSettings).set({ shareToken: null, updatedAt: new Date() }).where(eq(projectSettings.projectId, a.project.id));
  return c.json({ shareToken: null });
});

// ---------- README / case study ----------

projectRoutes.get('/:id/generate', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  const { kind } = query(c, z.object({ kind: z.enum(['readme', 'case_study']).default('readme') }));
  const markdown = generateReadme(await readmeInput(a.project), kind);
  return c.json({ markdown, kind, source: 'template', note: 'Built only from what is recorded on this project. Edit before publishing.' });
});

// ---------- AI assistance (optional; never auto-saved, never verifies anything) ----------

function aiProjectContext(p: Project, extra?: string) {
  const docs = p.docs as ProjectDocs;
  return [
    `Title: ${p.title}`,
    `Problem: ${p.problem || '(not written)'}`,
    `Intended users: ${p.intendedUsers || '(not written)'}`,
    `Objectives: ${p.objectives.join('; ') || '(none)'}`,
    'Requirements:',
    ...p.requirements.map((r) => `- [${r.done ? 'x' : ' '}] ${r.id}: ${r.text}${r.acceptance.length ? ` | acceptance: ${r.acceptance.join(' / ')}` : ''}`),
    ...DOC_SECTIONS.filter((k) => docs[k]?.trim()).map((k) => `${DOC_LABELS[k]}:\n${docs[k]!.slice(0, 3000)}`),
    p.repoUrl ? `Repository: ${p.repoUrl}` : '',
    p.demoUrl ? `Demo: ${p.demoUrl}` : '',
    extra ?? '',
  ]
    .filter(Boolean)
    .join('\n');
}

projectRoutes.post('/:id/ai/review-requirements', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  if (!a.canEdit && !a.canReview) throw forbidden();
  const r = await aiComplete({
    userId: auth.user.id,
    orgId: a.project.orgId,
    assistant: 'project_mentor',
    feature: 'project_requirements_review',
    maxTokens: 900,
    messages: [
      {
        role: 'system',
        content:
          'You are a project mentor. Suggest missing requirements, edge cases and acceptance criteria for the learner to consider. Do not write code. Do not claim anything about the project beyond the data given. Keep it to a short markdown list grouped by "Missing requirements", "Edge cases", "Acceptance criteria to tighten". The learner decides what to adopt.',
      },
      { role: 'user', content: aiProjectContext(a.project) },
    ],
  });
  if (!r.ok) return c.json({ ok: false, reason: r.reason, message: r.message });
  return c.json({ ok: true, text: r.text, label: 'AI-generated suggestions. Review before using; nothing was changed in your project.', provider: r.provider, model: r.model });
});

projectRoutes.post('/:id/ai/readme', async (c) => {
  const auth = requireAuth(c);
  const a = await loadProjectAccess(auth, idParam(c));
  requireEdit(a);
  const { kind } = await body(c, z.object({ kind: z.enum(['readme', 'case_study']).default('readme') }));
  const input = await readmeInput(a.project);
  const facts = generateReadme(input, kind);
  const r = await aiComplete({
    userId: auth.user.id,
    orgId: a.project.orgId,
    assistant: 'project_mentor',
    feature: 'project_readme_draft',
    maxTokens: 1500,
    messages: [
      {
        role: 'system',
        content:
          'You polish a project README or case study. Use ONLY the facts provided. Never invent features, metrics, users, performance numbers or results. If a section has no data, keep the placeholder telling the author to fill it in. Output markdown only.',
      },
      { role: 'user', content: `Write a ${kind === 'readme' ? 'README' : 'case study'} from these recorded facts:\n\n${facts}` },
    ],
  });
  if (!r.ok) return c.json({ ok: false, reason: r.reason, message: r.message, fallback: facts });
  return c.json({ ok: true, text: r.text, label: 'AI-generated draft from your project data. Check every statement, then edit and save it yourself.', provider: r.provider, model: r.model });
});
