import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client';
import { questions, questionVersions, assessmentItems } from '../../db/schema';
import { type AppEnv, requireAuth, requireActiveOrg, requirePlatformAdmin, isPlatformAdmin, rolesIn } from '../../lib/context';
import { body, query, idParam } from '../../lib/validate';
import { forbidden, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { AUTHOR_ROLES, canEditQuestion, canReadQuestion } from './access';
import { QUESTION_TYPES, questionInput, validateQuestion, type QuestionType } from './schemas';
import { authorQuestion } from './views';

/** Question bank: org questions (CRUD, versions, retire) and read access to the public bank. Mounted at /api/assessments/questions. */
export const questionRoutes = new Hono<AppEnv>();

const like = (s: string) => `%${s.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

async function loadQuestion(c: Parameters<typeof requireAuth>[0], id: string, need: 'read' | 'edit') {
  const auth = requireAuth(c);
  const [q] = await db.select().from(questions).where(eq(questions.id, id));
  if (!q) throw notFound('Question');
  if (need === 'edit' ? canEditQuestion(auth, q) : canReadQuestion(auth, q)) return q;
  // Members of the owning org without an author role see 403; everyone else 404.
  if (q.orgId && rolesIn(auth, q.orgId).length) throw forbidden('Editing questions needs an author role in this organization.', { requiredRoles: AUTHOR_ROLES });
  if (!q.orgId && need === 'edit' && canReadQuestion(auth, q)) throw forbidden('Only platform admins can edit public library questions.', { requiredRoles: ['platform_admin'] });
  throw notFound('Question');
}

questionRoutes.get('/', async (c) => {
  const auth = requireAuth(c);
  const q = query(
    c,
    z.object({
      scope: z.enum(['org', 'public']).default('org'),
      q: z.string().trim().max(200).optional(),
      type: z.enum(QUESTION_TYPES).optional(),
      difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
      topic: z.string().trim().max(80).optional(),
      status: z.enum(['active', 'retired', 'draft', 'all']).default('active'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }),
  );
  let scopeWhere: SQL | undefined;
  if (q.scope === 'org') {
    const { orgId } = requireActiveOrg(c, AUTHOR_ROLES);
    scopeWhere = eq(questions.orgId, orgId);
  } else {
    if (!isPlatformAdmin(auth) && !auth.memberships.some((m) => m.roles.some((r) => AUTHOR_ROLES.includes(r)))) throw forbidden('Browsing the question bank needs an author role.', { requiredRoles: AUTHOR_ROLES });
    scopeWhere = and(isNull(questions.orgId), eq(questions.visibility, 'public'));
  }
  const where = and(
    scopeWhere,
    q.status === 'all' ? undefined : eq(questions.status, q.scope === 'public' && !isPlatformAdmin(auth) ? 'active' : q.status),
    q.type ? eq(questions.type, q.type) : undefined,
    q.difficulty ? eq(questions.difficulty, q.difficulty) : undefined,
    q.topic ? sql`${q.topic} = ANY(${questions.topics})` : undefined,
    q.q ? or(sql`${questions.title} ilike ${like(q.q)}`, sql`${questions.content}->>'prompt' ilike ${like(q.q)}`, sql`array_to_string(${questions.topics}, ',') ilike ${like(q.q)}`) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(questions).where(where).orderBy(desc(questions.updatedAt), asc(questions.title)).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(questions).where(where),
  ]);
  return c.json({ items: rows.map((r) => authorQuestion(auth, r)), total, page: q.page, pageSize: q.pageSize });
});

/** Topics in use (for filters and blueprint rules): the active org's questions plus the public bank. */
questionRoutes.get('/topics', async (c) => {
  const auth = requireAuth(c);
  const orgId = auth.session.activeOrgId && rolesIn(auth, auth.session.activeOrgId).some((r) => AUTHOR_ROLES.includes(r)) ? auth.session.activeOrgId : null;
  const res = await db.execute(sql`
    select t as topic, count(*)::int as n from questions, unnest(questions.topics) as t
    where questions.status = 'active' and ((questions.org_id is null and questions.visibility = 'public') ${orgId ? sql`or questions.org_id = ${orgId}` : sql``})
    group by t order by n desc, t asc limit 300`);
  const rows = (res as unknown as { rows: { topic: string; n: number }[] }).rows;
  return c.json({ topics: rows.map((r) => ({ topic: r.topic, count: Number(r.n) })) });
});

questionRoutes.post('/', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, questionInput);
  let orgId: string | null = null;
  if (input.public) requirePlatformAdmin(c);
  else orgId = requireActiveOrg(c, AUTHOR_ROLES).orgId;
  const { content, answerKey } = validateQuestion(input.type, input.content, input.answerKey);
  const [row] = await db
    .insert(questions)
    .values({
      orgId,
      ownerId: auth.user.id,
      type: input.type,
      title: input.title,
      content,
      answerKey,
      difficulty: input.difficulty,
      topics: input.topics,
      skillIds: input.skillIds,
      points: input.points,
      visibility: orgId ? 'org' : 'public',
      status: 'active',
    })
    .returning();
  await audit(c, { action: 'question.created', orgId, targetType: 'question', targetId: row.id, meta: { type: row.type } });
  return c.json({ question: authorQuestion(auth, row) }, 201);
});

questionRoutes.get('/:id', async (c) => {
  const auth = requireAuth(c);
  const q = await loadQuestion(c, idParam(c), 'read');
  const [{ usedIn }] = await db.select({ usedIn: sql<number>`count(distinct ${assessmentItems.assessmentId})::int` }).from(assessmentItems).where(eq(assessmentItems.questionId, q.id));
  return c.json({ question: authorQuestion(auth, q), usedIn });
});

questionRoutes.get('/:id/versions', async (c) => {
  const auth = requireAuth(c);
  const q = await loadQuestion(c, idParam(c), 'read');
  const editable = canEditQuestion(auth, q);
  const rows = await db.select().from(questionVersions).where(eq(questionVersions.questionId, q.id)).orderBy(desc(questionVersions.version));
  return c.json({
    current: q.version,
    versions: rows.map((v) => ({ id: v.id, version: v.version, content: v.content, answerKey: editable ? v.answerKey : null, points: v.points, editedBy: v.editedBy, createdAt: v.createdAt })),
  });
});

/** Editing snapshots the previous version and bumps `version`; published assessments keep their frozen versions. */
questionRoutes.patch('/:id', async (c) => {
  const auth = requireAuth(c);
  const q = await loadQuestion(c, idParam(c), 'edit');
  const input = await body(
    c,
    z.object({
      title: z.string().trim().min(1).max(200).optional(),
      content: z.record(z.string(), z.unknown()).optional(),
      answerKey: z.record(z.string(), z.unknown()).optional(),
      difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
      topics: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
      skillIds: z.array(z.string().uuid()).max(20).optional(),
      points: z.number().min(0).max(1000).optional(),
    }),
  );
  const contentChanged = input.content !== undefined || input.answerKey !== undefined || (input.points !== undefined && input.points !== q.points);
  const next = contentChanged ? validateQuestion(q.type as QuestionType, input.content ?? q.content, input.answerKey ?? q.answerKey) : { content: q.content, answerKey: q.answerKey };
  if (contentChanged) {
    await db.insert(questionVersions).values({ questionId: q.id, version: q.version, content: q.content, answerKey: q.answerKey, points: q.points, editedBy: auth.user.id });
  }
  const [row] = await db
    .update(questions)
    .set({
      ...(input.title ? { title: input.title } : {}),
      ...(input.difficulty ? { difficulty: input.difficulty } : {}),
      ...(input.topics ? { topics: input.topics } : {}),
      ...(input.skillIds ? { skillIds: input.skillIds } : {}),
      ...(input.points !== undefined ? { points: input.points } : {}),
      content: next.content,
      answerKey: next.answerKey,
      version: contentChanged ? q.version + 1 : q.version,
      updatedAt: new Date(),
    })
    .where(eq(questions.id, q.id))
    .returning();
  await audit(c, { action: 'question.updated', orgId: q.orgId, targetType: 'question', targetId: q.id, meta: { version: row.version, contentChanged } });
  return c.json({ question: authorQuestion(auth, row) });
});

questionRoutes.post('/:id/retire', async (c) => {
  const auth = requireAuth(c);
  const q = await loadQuestion(c, idParam(c), 'edit');
  const [row] = await db.update(questions).set({ status: 'retired', updatedAt: new Date() }).where(eq(questions.id, q.id)).returning();
  await audit(c, { action: 'question.retired', orgId: q.orgId, targetType: 'question', targetId: q.id });
  return c.json({ question: authorQuestion(auth, row) });
});

questionRoutes.post('/:id/restore', async (c) => {
  const auth = requireAuth(c);
  const q = await loadQuestion(c, idParam(c), 'edit');
  const [row] = await db.update(questions).set({ status: 'active', updatedAt: new Date() }).where(eq(questions.id, q.id)).returning();
  return c.json({ question: authorQuestion(auth, row) });
});

/** Deletes an unused question; a question used by any assessment is retired instead (history stays intact). */
questionRoutes.delete('/:id', async (c) => {
  const q = await loadQuestion(c, idParam(c), 'edit');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(assessmentItems).where(eq(assessmentItems.questionId, q.id));
  const [{ m }] = await db.execute(sql`select count(*)::int as m from attempt_answers where question_id = ${q.id}`).then((r) => (r as unknown as { rows: { m: number }[] }).rows);
  if (n > 0 || Number(m) > 0) {
    await db.update(questions).set({ status: 'retired', updatedAt: new Date() }).where(eq(questions.id, q.id));
    await audit(c, { action: 'question.retired', orgId: q.orgId, targetType: 'question', targetId: q.id, meta: { reason: 'in use' } });
    return c.json({ deleted: false, retired: true, message: 'This question is used by an assessment, so it was retired instead of deleted.' });
  }
  await db.delete(questions).where(eq(questions.id, q.id));
  await audit(c, { action: 'question.deleted', orgId: q.orgId, targetType: 'question', targetId: q.id });
  return c.json({ deleted: true, retired: false });
});
