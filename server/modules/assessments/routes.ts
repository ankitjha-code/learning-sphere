import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  assessments,
  assessmentItems,
  assessmentInvites,
  attempts,
  attemptAnswers,
  questions,
  regradeRequests,
  cohorts,
  cohortMembers,
  organizations,
  users,
  skills,
  codeRuns,
} from '../../db/schema';
import { attemptState } from '../../db/schema/assessment-ext';
import { jobPostings, placementDrives } from '../../db/schema';
import { type AppEnv, type Ctx, requireAuth, requireActiveOrg, requirePlatformAdmin, isPlatformAdmin, rolesIn } from '../../lib/context';
import { body, query, idParam, emailSchema, patchSchema } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { rateLimit } from '../../lib/ratelimit';
import { OBJECTIVE_TYPES, publicQuestion } from '../../lib/grading';
import { runCode, runSql, type ExecLanguage } from '../../exec';
import { aiComplete } from '../../ai/service';
import { ROLE_LABELS } from '@shared/roles';
import { MANAGER_ROLES, VIEWER_ROLES, loadManaged, takeAccess, manageableModes, settingsOf, isPersonal, managementLevel, canEditQuestion } from './access';
import { ASSESSMENT_MODES, DEFAULT_SETTINGS, settingsInput, answerInput, type ExtSettings } from './schemas';
import {
  publishChecklist,
  publishAssessment,
  startAttempt,
  submitAttempt,
  expireIfDue,
  windowState,
  effectiveTimeLimitMinutes,
  resolveQuestions,
  releaseAttempt,
  releaseAll,
  shouldReleaseNow,
  applyManualScore,
  userNames,
  SAVE_GRACE_MS,
  scheduleAutosubmit,
  type Attempt,
} from './engine';
import { inviteToAssessment } from './service';
import { assessmentResults, resultsCsv } from './analytics';
import { authorQuestion, candidateAttemptView, candidateResultView } from './views';
import { questionRoutes } from './question-routes';
import { ref } from '../../lib/sql';

/** Mounted at /api/assessments. */
export const assessmentRoutes = new Hono<AppEnv>();

assessmentRoutes.route('/questions', questionRoutes);

const notPersonal = sql`coalesce((${assessments.settings}->>'personal')::boolean, false) = false`;
const like = (s: string) => `%${s.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

/** Link to the manager view of an assessment for its mode (workspace base path). */
function manageLink(a: { id: string; mode: string }) {
  const base = a.mode === 'recruitment' ? 'hire' : a.mode === 'placement' ? 'campus' : 'teach';
  return `/app/${base}/assessments/${a.id}`;
}

function itemCountOf(fixed: number, s: ExtSettings) {
  return fixed + (s.blueprint ?? []).reduce((n, r) => n + r.count, 0);
}

// =====================================================================
// Learner side: listing, practice generator, history
// =====================================================================

assessmentRoutes.get('/available', async (c) => {
  const auth = requireAuth(c);
  const uid = auth.user.id;
  const { mode } = query(c, z.object({ mode: z.enum(ASSESSMENT_MODES).optional() }));
  const myCohorts = db.select({ id: cohortMembers.cohortId }).from(cohortMembers).where(eq(cohortMembers.userId, uid));
  const invited = db
    .select({ id: assessmentInvites.assessmentId })
    .from(assessmentInvites)
    .where(and(eq(assessmentInvites.userId, uid), ne(assessmentInvites.status, 'revoked')));
  const rows = await db
    .select({
      a: assessments,
      orgName: organizations.name,
      fixedCount: sql<number>`(select count(*)::int from assessment_items i where i.assessment_id = ${ref(assessments.id)})`,
    })
    .from(assessments)
    .leftJoin(organizations, eq(organizations.id, assessments.orgId))
    .where(
      and(
        eq(assessments.status, 'published'),
        mode ? eq(assessments.mode, mode) : undefined,
        or(
          and(isNull(assessments.orgId), notPersonal, inArray(assessments.mode, ['practice', 'diagnostic'])),
          and(isNull(assessments.orgId), eq(assessments.ownerId, uid), sql`(${assessments.settings}->>'personal')::boolean = true`),
          inArray(assessments.id, invited),
          inArray(assessments.cohortId, myCohorts),
        ),
      ),
    )
    .orderBy(desc(assessments.publishedAt))
    .limit(200);
  const ids = rows.map((r) => r.a.id);
  const [mine, invites] = ids.length
    ? await Promise.all([
        db.select().from(attempts).where(and(eq(attempts.userId, uid), inArray(attempts.assessmentId, ids))).orderBy(desc(attempts.startedAt)),
        db.select().from(assessmentInvites).where(and(eq(assessmentInvites.userId, uid), inArray(assessmentInvites.assessmentId, ids))),
      ])
    : [[], []];
  const items = rows.map(({ a, orgName, fixedCount }) => {
    const s = settingsOf(a);
    const my = mine.filter((m) => m.assessmentId === a.id);
    const inv = invites.find((i) => i.assessmentId === a.id) ?? null;
    const best = my.filter((m) => m.status === 'released' && m.maxScore).sort((x, y) => y.score! / y.maxScore! - x.score! / x.maxScore!)[0];
    const w = windowState(a, inv);
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      mode: a.mode,
      orgName: orgName ?? null,
      source: inv ? 'invited' : isPersonal(a) ? 'personal' : !a.orgId ? 'library' : 'cohort',
      itemCount: itemCountOf(Number(fixedCount), s),
      timeLimitMinutes: effectiveTimeLimitMinutes(a, inv),
      maxAttempts: s.maxAttempts ?? null,
      attemptsUsed: my.length,
      closesAt: w.closesAt,
      open: w.open,
      inProgressAttemptId: my.find((m) => m.status === 'in_progress')?.id ?? null,
      lastAttempt: my[0] ? { id: my[0].id, status: my[0].status } : null,
      best: best ? { attemptId: best.id, percent: Math.round((best.score! / best.maxScore!) * 100) } : null,
      publishedAt: a.publishedAt,
    };
  });
  return c.json({ items });
});

assessmentRoutes.get('/my/attempts', async (c) => {
  const auth = requireAuth(c);
  const q = query(c, z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }));
  const where = eq(attempts.userId, auth.user.id);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ at: attempts, title: assessments.title, mode: assessments.mode })
      .from(attempts)
      .innerJoin(assessments, eq(assessments.id, attempts.assessmentId))
      .where(where)
      .orderBy(desc(attempts.startedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(attempts).where(where),
  ]);
  return c.json({
    items: rows.map(({ at, title, mode }) => ({
      id: at.id,
      assessmentId: at.assessmentId,
      title,
      mode,
      attemptNo: at.attemptNo,
      status: at.status,
      startedAt: at.startedAt,
      submittedAt: at.submittedAt,
      deadlineAt: at.deadlineAt,
      // Scores are only shown once released.
      score: at.status === 'released' ? at.score : null,
      maxScore: at.status === 'released' ? at.maxScore : null,
      percent: at.status === 'released' && at.maxScore ? Math.round(((at.score ?? 0) / at.maxScore) * 100) : null,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  });
});

const PRACTICE_TYPES = [...OBJECTIVE_TYPES] as string[];

assessmentRoutes.get('/practice/options', async (c) => {
  requireAuth(c);
  const topicsRes = await db.execute(sql`
    select t as topic, count(*)::int as n from questions, unnest(questions.topics) as t
    where questions.org_id is null and questions.visibility = 'public' and questions.status = 'active' and questions.type in ('single','multi','true_false','matching','fill_blank')
    group by t having count(*) >= 2 order by t asc limit 400`);
  const skillsRes = await db.execute(sql`
    select s.slug, s.name, count(*)::int as n from questions q join skills s on s.id = any(q.skill_ids)
    where q.org_id is null and q.visibility = 'public' and q.status = 'active' and q.type in ('single','multi','true_false','matching','fill_blank')
    group by s.slug, s.name having count(*) >= 2 order by s.name asc`);
  return c.json({
    topics: (topicsRes as unknown as { rows: { topic: string; n: number }[] }).rows.map((r) => ({ topic: r.topic, count: Number(r.n) })),
    skills: (skillsRes as unknown as { rows: { slug: string; name: string; n: number }[] }).rows.map((r) => ({ slug: r.slug, name: r.name, count: Number(r.n) })),
  });
});

/** Personal practice: a learner draws a quiz from the public bank for themselves. */
assessmentRoutes.post('/practice/generate', async (c) => {
  const auth = requireAuth(c);
  rateLimit(`practice-gen:${auth.user.id}`, 20, 60 * 60_000);
  const input = await body(
    c,
    z.object({
      topic: z.string().trim().max(80).optional(),
      skillSlug: z.string().trim().max(80).optional(),
      difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
      count: z.number().int().min(3).max(30).default(10),
      timeLimitMinutes: z.number().int().min(1).max(180).nullable().optional(),
    }),
  );
  let skill: { id: string; name: string } | undefined;
  if (input.skillSlug) {
    [skill] = await db.select({ id: skills.id, name: skills.name }).from(skills).where(eq(skills.slug, input.skillSlug));
    if (!skill) throw badRequest('Unknown skill.', { fields: { skillSlug: 'Choose a skill from the list.' } });
  }
  const pool = await db
    .select({ id: questions.id, version: questions.version, skillIds: questions.skillIds })
    .from(questions)
    .where(
      and(
        isNull(questions.orgId),
        eq(questions.visibility, 'public'),
        eq(questions.status, 'active'),
        inArray(questions.type, PRACTICE_TYPES),
        input.topic ? sql`${input.topic} = ANY(${questions.topics})` : undefined,
        skill ? sql`${skill.id} = ANY(${questions.skillIds})` : undefined,
        input.difficulty ? eq(questions.difficulty, input.difficulty) : undefined,
      ),
    );
  if (!pool.length) throw badRequest('No questions match these filters yet. Try a broader topic or another difficulty.');
  const { shuffle } = await import('../../lib/grading');
  const picked = shuffle(pool).slice(0, input.count);
  const label = input.topic ?? skill?.name ?? 'Mixed topics';
  const settings: ExtSettings = {
    ...DEFAULT_SETTINGS,
    personal: true,
    timeLimitMinutes: input.timeLimitMinutes ?? null,
    shuffleOptions: true,
    resultRelease: 'immediate',
    showAnswersAfterRelease: true,
  };
  const [a] = await db
    .insert(assessments)
    .values({
      orgId: null,
      ownerId: auth.user.id,
      title: `Practice: ${label}`,
      description: `${picked.length} questions${input.difficulty ? ` · ${input.difficulty}` : ''} drawn from the public library.`,
      mode: 'practice',
      settings,
      status: 'published',
      publishedAt: new Date(),
      skillIds: [...new Set(picked.flatMap((p) => p.skillIds))].slice(0, 20),
    })
    .returning();
  await db.insert(assessmentItems).values(picked.map((p, i) => ({ assessmentId: a.id, questionId: p.id, questionVersion: p.version, points: 1, sortOrder: i + 1 })));
  return c.json({ assessment: { id: a.id, title: a.title, itemCount: picked.length, requested: input.count } }, 201);
});

// =====================================================================
// Manager side: listing, cohorts picker, create
// =====================================================================

assessmentRoutes.get('/manage', async (c) => {
  const auth = requireAuth(c);
  const q = query(
    c,
    z.object({
      scope: z.enum(['org', 'public']).default('org'),
      mode: z.enum(ASSESSMENT_MODES).optional(),
      status: z.enum(['draft', 'published', 'closed', 'archived']).optional(),
      q: z.string().trim().max(200).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
  );
  let scope;
  if (q.scope === 'public') {
    requirePlatformAdmin(c);
    scope = and(isNull(assessments.orgId), notPersonal);
  } else {
    const { orgId, roles } = requireActiveOrg(c);
    const modes = [...new Set([...manageableModes(roles), ...Object.entries(VIEWER_ROLES).filter(([, rs]) => rs.some((r) => roles.includes(r))).map(([m]) => m)])];
    if (!modes.length) throw forbidden('Managing assessments needs a faculty, recruiter, placement or creator role in this organization.');
    scope = and(eq(assessments.orgId, orgId), inArray(assessments.mode, modes));
  }
  const where = and(scope, q.mode ? eq(assessments.mode, q.mode) : undefined, q.status ? eq(assessments.status, q.status) : q.scope === 'org' ? ne(assessments.status, 'archived') : undefined, q.q ? sql`${assessments.title} ilike ${like(q.q)}` : undefined);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        a: assessments,
        fixedCount: sql<number>`(select count(*)::int from assessment_items i where i.assessment_id = ${ref(assessments.id)})`,
        attemptCount: sql<number>`(select count(*)::int from attempts t where t.assessment_id = ${ref(assessments.id)})`,
        needsReview: sql<number>`(select count(*)::int from attempts t where t.assessment_id = ${ref(assessments.id)} and t.status = 'needs_review')`,
        awaitingRelease: sql<number>`(select count(*)::int from attempts t where t.assessment_id = ${ref(assessments.id)} and t.status = 'graded')`,
        inviteCount: sql<number>`(select count(*)::int from assessment_invites v where v.assessment_id = ${ref(assessments.id)} and v.status <> 'revoked')`,
        cohortName: cohorts.name,
      })
      .from(assessments)
      .leftJoin(cohorts, eq(cohorts.id, assessments.cohortId))
      .where(where)
      .orderBy(desc(assessments.updatedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(assessments).where(where),
  ]);
  return c.json({
    items: rows.map((r) => ({
      id: r.a.id,
      title: r.a.title,
      mode: r.a.mode,
      status: r.a.status,
      orgId: r.a.orgId,
      cohortId: r.a.cohortId,
      cohortName: r.cohortName,
      jobPostingId: r.a.jobPostingId,
      driveId: r.a.driveId,
      itemCount: itemCountOf(Number(r.fixedCount), settingsOf(r.a)),
      attemptCount: Number(r.attemptCount),
      needsReview: Number(r.needsReview),
      awaitingRelease: Number(r.awaitingRelease),
      inviteCount: Number(r.inviteCount),
      timeLimitMinutes: settingsOf(r.a).timeLimitMinutes ?? null,
      availableUntil: settingsOf(r.a).availableUntil ?? null,
      access: managementLevel(auth, r.a),
      updatedAt: r.a.updatedAt,
      publishedAt: r.a.publishedAt,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  });
});

/** Cohorts in the active org (for the classroom target picker). */
assessmentRoutes.get('/cohorts', async (c) => {
  const { orgId } = requireActiveOrg(c, [...new Set([...MANAGER_ROLES.classroom, ...MANAGER_ROLES.placement])]);
  const rows = await db
    .select({ id: cohorts.id, name: cohorts.name, kind: cohorts.kind, graduationYear: cohorts.graduationYear, members: sql<number>`(select count(*)::int from cohort_members m where m.cohort_id = ${ref(cohorts.id)} and m.role = 'student')` })
    .from(cohorts)
    .where(eq(cohorts.orgId, orgId))
    .orderBy(asc(cohorts.name));
  return c.json({ cohorts: rows.map((r) => ({ ...r, members: Number(r.members) })) });
});

const assessmentInput = z.object({
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  mode: z.enum(ASSESSMENT_MODES),
  settings: settingsInput.optional(),
  cohortId: z.string().uuid().nullable().optional(),
  jobPostingId: z.string().uuid().nullable().optional(),
  driveId: z.string().uuid().nullable().optional(),
  trackId: z.string().uuid().nullable().optional(),
  skillIds: z.array(z.string().uuid()).max(30).optional(),
  public: z.boolean().optional(),
});

async function assertCohortInOrg(cohortId: string | null | undefined, orgId: string | null) {
  if (!cohortId) return;
  if (!orgId) throw badRequest('Public assessments cannot target a cohort.', { fields: { cohortId: 'Not allowed here.' } });
  const [co] = await db.select({ id: cohorts.id }).from(cohorts).where(and(eq(cohorts.id, cohortId), eq(cohorts.orgId, orgId)));
  if (!co) throw badRequest('That cohort is not in this organization.', { fields: { cohortId: 'Choose a cohort from this organization.' } });
}

/** Job postings and placement drives linked to an assessment must belong to the same organization. */
async function assertLinksInOrg(input: { jobPostingId?: string | null; driveId?: string | null }, orgId: string | null) {
  if (input.jobPostingId) {
    if (!orgId) throw badRequest('Public assessments cannot be linked to a job.', { fields: { jobPostingId: 'Not allowed here.' } });
    const [jp] = await db.select({ id: jobPostings.id }).from(jobPostings).where(and(eq(jobPostings.id, input.jobPostingId), eq(jobPostings.orgId, orgId)));
    if (!jp) throw badRequest('That job posting is not in this organization.', { fields: { jobPostingId: 'Choose a job from this organization.' } });
  }
  if (input.driveId) {
    if (!orgId) throw badRequest('Public assessments cannot be linked to a placement drive.', { fields: { driveId: 'Not allowed here.' } });
    const [dr] = await db.select({ id: placementDrives.id }).from(placementDrives).where(and(eq(placementDrives.id, input.driveId), eq(placementDrives.orgId, orgId)));
    if (!dr) throw badRequest('That placement drive is not in this organization.', { fields: { driveId: 'Choose a drive from this organization.' } });
  }
}

assessmentRoutes.post('/', async (c) => {
  const auth = requireAuth(c);
  const input = await body(c, assessmentInput);
  let orgId: string | null = null;
  if (input.public) {
    requirePlatformAdmin(c);
    if (input.mode !== 'practice' && input.mode !== 'diagnostic') throw badRequest('Public library assessments are practice or diagnostic.', { fields: { mode: 'Choose practice or diagnostic.' } });
  } else {
    orgId = requireActiveOrg(c, MANAGER_ROLES[input.mode]).orgId;
  }
  await assertCohortInOrg(input.cohortId, orgId);
  await assertLinksInOrg(input, orgId);
  const settings: ExtSettings = { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) };
  const [row] = await db
    .insert(assessments)
    .values({
      orgId,
      ownerId: auth.user.id,
      title: input.title,
      description: input.description ?? null,
      mode: input.mode,
      settings,
      cohortId: input.cohortId ?? null,
      jobPostingId: input.jobPostingId ?? null,
      driveId: input.driveId ?? null,
      trackId: input.trackId ?? null,
      skillIds: input.skillIds ?? [],
    })
    .returning();
  await audit(c, { action: 'assessment.created', orgId, targetType: 'assessment', targetId: row.id, meta: { mode: row.mode } });
  return c.json({ assessment: row }, 201);
});

// =====================================================================
// Attempts (candidate). Registered before /:id routes.
// =====================================================================

async function ownAttempt(c: Ctx, id: string) {
  const auth = requireAuth(c);
  const [at] = await db.select().from(attempts).where(and(eq(attempts.id, id), eq(attempts.userId, auth.user.id)));
  if (!at) throw notFound('Attempt');
  return at;
}

async function inviteFor(assessmentId: string, userId: string) {
  const [inv] = await db.select().from(assessmentInvites).where(and(eq(assessmentInvites.assessmentId, assessmentId), eq(assessmentInvites.userId, userId)));
  return inv ?? null;
}

assessmentRoutes.get('/attempts/:attemptId', async (c) => {
  let at = await ownAttempt(c, idParam(c, 'attemptId'));
  at = await expireIfDue(at);
  const [a] = await db.select().from(assessments).where(eq(assessments.id, at.assessmentId));
  return c.json(await candidateAttemptView(at, a, await inviteFor(a.id, at.userId)));
});

function assertWritable(at: Attempt) {
  if (at.status !== 'in_progress') throw conflict('This attempt was already submitted. Your saved answers were kept.', { code: 'attempt_submitted' });
  if (at.deadlineAt && Date.now() > at.deadlineAt.getTime() + SAVE_GRACE_MS) throw conflict('Time is up. Answers saved before the deadline were submitted.', { code: 'deadline_passed' });
}

assessmentRoutes.put('/attempts/:attemptId/answers/:questionId', async (c) => {
  const at = await ownAttempt(c, idParam(c, 'attemptId'));
  const questionId = idParam(c, 'questionId');
  const input = await body(c, answerInput);
  try {
    assertWritable(at);
  } catch (e) {
    await expireIfDue(at);
    throw e;
  }
  const item = at.items.find((i) => i.questionId === questionId);
  if (!item) throw notFound('Question');
  const now = new Date();
  await db
    .insert(attemptAnswers)
    .values({ attemptId: at.id, questionId, answer: input.answer, savedAt: now, maxPoints: item.points })
    .onConflictDoUpdate({ target: [attemptAnswers.attemptId, attemptAnswers.questionId], set: { answer: input.answer, savedAt: now } });
  return c.json({ savedAt: now.toISOString(), serverTime: now.toISOString(), deadlineAt: at.deadlineAt });
});

assessmentRoutes.put('/attempts/:attemptId/state', async (c) => {
  const at = await ownAttempt(c, idParam(c, 'attemptId'));
  const input = await body(c, z.object({ flagged: z.array(z.string().uuid()).max(500).optional(), currentIndex: z.number().int().min(0).max(1000).optional(), meta: z.record(z.string(), z.unknown()).optional() }));
  if (at.status !== 'in_progress') return c.json({ ok: true });
  const flagged = (input.flagged ?? []).filter((id) => at.items.some((i) => i.questionId === id));
  const set = { ...(input.flagged ? { flagged } : {}), ...(input.currentIndex !== undefined ? { currentIndex: input.currentIndex } : {}), ...(input.meta ? { meta: input.meta } : {}), updatedAt: new Date() };
  await db.insert(attemptState).values({ attemptId: at.id, flagged, currentIndex: input.currentIndex ?? 0, meta: input.meta ?? {} }).onConflictDoUpdate({ target: attemptState.attemptId, set });
  return c.json({ ok: true });
});

/** Runs a coding answer against the visible tests only (or a SQL query, without revealing correctness). */
assessmentRoutes.post('/attempts/:attemptId/run/:questionId', async (c) => {
  const auth = requireAuth(c);
  const at = await ownAttempt(c, idParam(c, 'attemptId'));
  const questionId = idParam(c, 'questionId');
  assertWritable(at);
  rateLimit(`attempt-run:${auth.user.id}`, 30, 60_000);
  const item = at.items.find((i) => i.questionId === questionId);
  if (!item) throw notFound('Question');
  const q = (await resolveQuestions([item])).get(questionId);
  if (!q || (q.type !== 'coding' && q.type !== 'sql')) throw badRequest('Only coding and SQL questions can be run.');
  const input = await body(c, z.object({ language: z.string().max(20).optional(), code: z.string().max(100000).optional(), query: z.string().max(50000).optional() }));
  if (q.type === 'coding') {
    const langs = q.content.languages ?? [];
    const language = (input.language && langs.includes(input.language) ? input.language : langs[0]) as ExecLanguage;
    if (!input.code?.trim()) throw badRequest('Write some code first.', { fields: { code: 'Required.' } });
    const tests = (q.content.visibleTests ?? []).map((t) => ({ ...t, hidden: false }));
    const r = await runCode({ language, code: input.code, tests, timeLimitMs: q.content.timeLimitMs, memoryLimitMb: q.content.memoryLimitMb });
    await db.insert(codeRuns).values({ userId: auth.user.id, questionId, attemptId: at.id, kind: 'run', language, code: input.code, status: r.status, provider: r.provider, passed: r.passed, total: r.total, results: r.results as unknown as Record<string, unknown>[], durationMs: r.durationMs });
    return c.json({ run: { status: r.status, provider: r.provider, passed: r.passed, total: r.total, message: r.message, compileOutput: r.compileOutput, results: r.results, durationMs: r.durationMs } });
  }
  if (!input.query?.trim()) throw badRequest('Write a query first.', { fields: { query: 'Required.' } });
  const r = await runSql({ schemaSql: q.content.schemaSql ?? '', seedSql: q.answerKey.seedSql ?? '', query: input.query, solutionSql: q.answerKey.solutionSql ?? '', orderMatters: !!q.content.orderMatters });
  await db.insert(codeRuns).values({ userId: auth.user.id, questionId, attemptId: at.id, kind: 'run', language: 'sql', code: input.query, status: r.status, provider: r.provider, passed: 0, total: 0, results: [], durationMs: r.durationMs });
  // Correctness is withheld during an exam: report only whether it ran and what it returned.
  const ran = r.status === 'accepted' || r.status === 'wrong_answer';
  return c.json({ run: { status: ran ? 'ran' : r.status, provider: r.provider, message: ran ? 'Query ran. It is graded after you submit.' : r.message, columns: r.columns ?? [], rows: (r.rows ?? []).slice(0, 50), durationMs: r.durationMs } });
});

assessmentRoutes.post('/attempts/:attemptId/submit', async (c) => {
  const at = await ownAttempt(c, idParam(c, 'attemptId'));
  const input = await body(c, z.object({ submitKey: z.string().max(100).optional() }));
  const deadlinePassed = at.status === 'in_progress' && !!at.deadlineAt && Date.now() > at.deadlineAt.getTime() + SAVE_GRACE_MS;
  const r = await submitAttempt(at, { submitKey: input.submitKey, auto: deadlinePassed });
  return c.json({ attempt: { id: r.attempt.id, status: r.attempt.status, submittedAt: r.attempt.submittedAt, autoSubmitted: r.attempt.autoSubmitted }, alreadySubmitted: r.alreadySubmitted });
});

assessmentRoutes.get('/attempts/:attemptId/result', async (c) => {
  let at = await ownAttempt(c, idParam(c, 'attemptId'));
  at = await expireIfDue(at);
  const [a] = await db.select().from(assessments).where(eq(assessments.id, at.assessmentId));
  if (at.status === 'graded' && shouldReleaseNow(a)) {
    await releaseAttempt(at.id);
    [at] = await db.select().from(attempts).where(eq(attempts.id, at.id));
  }
  if (at.status !== 'released') {
    const msg: Record<string, string> = {
      in_progress: 'This attempt is still in progress.',
      submitted: 'Your answers are submitted and waiting to be graded.',
      grading: 'Your answers are being graded.',
      needs_review: 'Some answers need a reviewer. Results appear once grading is finished.',
      graded: settingsOf(a).resultRelease === 'after_close' ? 'Graded. Results are released when the assessment closes.' : 'Graded. Results are released by the organizer.',
    };
    return c.json({ released: false, status: at.status, message: msg[at.status] ?? 'Results are not available yet.', attempt: { id: at.id, status: at.status, submittedAt: at.submittedAt, autoSubmitted: at.autoSubmitted }, assessment: { id: a.id, title: a.title, mode: a.mode } });
  }
  return c.json(await candidateResultView(at, a));
});

// ---------- Manager views of a single attempt ----------

async function managedAttempt(c: Ctx, attemptId: string, need: 'view' | 'edit') {
  const [at] = await db.select().from(attempts).where(eq(attempts.id, attemptId));
  if (!at) throw notFound('Attempt');
  try {
    const a = await loadManaged(c, at.assessmentId, need);
    return { at, a };
  } catch (e) {
    // Do not reveal that an attempt exists to people outside the org.
    if ((e as { status?: number }).status === 404) throw notFound('Attempt');
    throw e;
  }
}

assessmentRoutes.get('/attempts/:attemptId/review', async (c) => {
  const auth = requireAuth(c);
  const { at, a } = await managedAttempt(c, idParam(c, 'attemptId'), 'view');
  const resolved = await resolveQuestions(at.items);
  const answers = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, at.id));
  const names = await userNames([at.userId]);
  const invite = await inviteFor(a.id, at.userId);
  const canEdit = managementLevel(auth, a) === 'edit';
  return c.json({
    attempt: { ...at, items: undefined },
    candidate: { userId: at.userId, ...names.get(at.userId) },
    accommodations: invite?.accommodations ?? {},
    assessment: { id: a.id, title: a.title, mode: a.mode },
    canEdit,
    items: at.items.map((it, index) => {
      const q = resolved.get(it.questionId);
      const ans = answers.find((x) => x.questionId === it.questionId) ?? null;
      return {
        index,
        points: it.points,
        question: q ? { ...authorQuestion(auth, q), content: q.content, version: q.versionUsed, answerKey: canEditQuestion(auth, q) ? q.answerKey : reviewerKey(q.answerKey) } : null,
        answer: ans,
      };
    }),
  });
});

assessmentRoutes.post('/attempts/:attemptId/release', async (c) => {
  const { at, a } = await managedAttempt(c, idParam(c, 'attemptId'), 'edit');
  if (at.status !== 'graded') throw conflict(at.status === 'released' ? 'Already released.' : 'Only fully graded attempts can be released.');
  await releaseAttempt(at.id);
  await audit(c, { action: 'assessment.results_released', orgId: a.orgId, targetType: 'attempt', targetId: at.id });
  return c.json({ released: 1 });
});

/** Reviewer-facing guidance from a key the reviewer may not edit (never hidden tests or solutions). */
function reviewerKey(k: { rubric?: unknown; modelAnswer?: string; explanation?: string }) {
  return { rubric: k.rubric, modelAnswer: k.modelAnswer, explanation: k.explanation };
}

// ---------- Answers: manual grading, AI proposals, regrades ----------

async function managedAnswer(c: Ctx, answerId: string) {
  const [ans] = await db.select().from(attemptAnswers).where(eq(attemptAnswers.id, answerId));
  if (!ans) throw notFound('Answer');
  const { at, a } = await managedAttempt(c, ans.attemptId, 'edit').catch((e) => {
    if ((e as { status?: number }).status === 404) throw notFound('Answer');
    throw e;
  });
  if (at.status === 'in_progress') throw conflict('This attempt is still in progress.');
  return { ans, at, a };
}

async function scoreAnswer(c: Ctx, p: { answerId: string; score: number; feedback?: string | null; reason?: string; aiAssisted?: boolean }) {
  const auth = requireAuth(c);
  const { ans, at, a } = await managedAnswer(c, p.answerId);
  const changing = ans.finalScore !== null && ans.finalScore !== p.score;
  if (changing && !p.reason?.trim()) throw badRequest('Give a reason when changing an existing score.', { fields: { reason: 'Required when overriding a score.' } });
  const r = await applyManualScore({ answer: ans, score: p.score, feedback: p.feedback, graderId: auth.user.id });
  if (p.aiAssisted) {
    await db
      .update(attemptAnswers)
      .set({ aiProposal: ans.aiProposal ? { ...ans.aiProposal, accepted: true } : null, gradingDetail: { ...(ans.gradingDetail ?? {}), aiAssisted: true } })
      .where(eq(attemptAnswers.id, ans.id));
  }
  await audit(c, {
    action: 'assessment.answer_scored',
    orgId: a.orgId,
    targetType: 'attempt_answer',
    targetId: ans.id,
    meta: { attemptId: at.id, previous: ans.finalScore, score: p.score, reason: p.reason ?? null, aiAssisted: !!p.aiAssisted, proposalScore: p.aiAssisted ? (ans.aiProposal?.score ?? null) : undefined },
  });
  if (at.status === 'released' && changing) {
    await notify(at.userId, { type: 'assessment.score_updated', category: 'assessments', title: `Score updated: ${a.title}`, body: p.reason ?? 'A reviewer updated one of your answers.', link: `/app/assessments/attempts/${at.id}/result`, orgId: a.orgId });
  }
  const [fresh] = await db.select().from(attemptAnswers).where(eq(attemptAnswers.id, ans.id));
  return { answer: fresh, attemptStatus: r.attemptStatus };
}

assessmentRoutes.patch('/answers/:answerId', async (c) => {
  const input = await body(c, z.object({ manualScore: z.number().min(0).max(1000), feedback: z.string().max(10000).nullable().optional(), reason: z.string().trim().max(2000).optional() }));
  return c.json(await scoreAnswer(c, { answerId: idParam(c, 'answerId'), score: input.manualScore, feedback: input.feedback, reason: input.reason }));
});

const proposalSchema = z.object({ score: z.number(), rationale: z.string().trim().min(1).max(4000) });

/** Asks the AI for a proposed score. Stores it separately; never changes any score. */
assessmentRoutes.post('/answers/:answerId/ai-proposal', async (c) => {
  const auth = requireAuth(c);
  const { ans, at, a } = await managedAnswer(c, idParam(c, 'answerId'));
  rateLimit(`ai-proposal:${auth.user.id}`, 60, 60 * 60_000);
  const item = at.items.find((i) => i.questionId === ans.questionId)!;
  const q = (await resolveQuestions([item])).get(ans.questionId);
  if (!q) throw notFound('Question');
  const rubric = (q.answerKey.rubric ?? []).map((r) => `- ${r.criterion} (${r.points} pts)${r.guidance ? `: ${r.guidance}` : ''}`).join('\n');
  const response = JSON.stringify(ans.answer ?? {}, null, 1).slice(0, 12000);
  const r = await aiComplete({
    userId: auth.user.id,
    orgId: a.orgId,
    assistant: a.mode === 'recruitment' || a.mode === 'placement' ? 'recruiter_assessment' : 'faculty_ta',
    feature: 'grading_proposal',
    json: true,
    temperature: 0.1,
    maxTokens: 600,
    messages: [
      {
        role: 'system',
        content:
          'You help a human reviewer grade one answer. Propose a score and a short rationale tied to the rubric. The reviewer decides; be calibrated and do not invent facts about the candidate. Reply only with JSON: {"score": number, "rationale": string}.',
      },
      {
        role: 'user',
        content: [
          `Question (${q.type}, max ${item.points} points):\n${q.content.prompt}`,
          rubric ? `Rubric:\n${rubric}` : 'Rubric: none provided; judge correctness and completeness.',
          q.answerKey.modelAnswer ? `Model answer:\n${q.answerKey.modelAnswer}` : '',
          `Candidate response (JSON):\n${response}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
  });
  if (!r.ok) return c.json({ proposal: null, ai: { ok: false, reason: r.reason, message: r.message } });
  let parsed: z.infer<typeof proposalSchema> | null = null;
  try {
    const raw = JSON.parse(r.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    const v = proposalSchema.safeParse(raw);
    if (v.success && v.data.score >= 0 && v.data.score <= item.points) parsed = v.data;
  } catch {
    parsed = null;
  }
  if (!parsed) return c.json({ proposal: null, ai: { ok: false, reason: 'invalid_output', message: 'The AI reply was not a usable proposal. Grade this answer manually or try again.' } });
  const proposal = { score: parsed.score, rationale: parsed.rationale, model: `${r.provider}/${r.model}`, createdAt: new Date().toISOString() };
  await db.update(attemptAnswers).set({ aiProposal: proposal }).where(eq(attemptAnswers.id, ans.id));
  return c.json({ proposal, ai: { ok: true } });
});

assessmentRoutes.post('/answers/:answerId/accept-proposal', async (c) => {
  const answerId = idParam(c, 'answerId');
  const input = await body(c, z.object({ score: z.number().min(0).max(1000).optional(), feedback: z.string().max(10000).nullable().optional(), reason: z.string().trim().max(2000).optional() }));
  const { ans } = await managedAnswer(c, answerId);
  if (!ans.aiProposal) throw conflict('There is no AI proposal to accept. Request one first or grade manually.');
  return c.json(await scoreAnswer(c, { answerId, score: input.score ?? ans.aiProposal.score, feedback: input.feedback, reason: input.reason ?? (ans.finalScore !== null ? 'Accepted AI-assisted proposal after review' : undefined), aiAssisted: true }));
});

/** Candidate appeal on a released answer. */
assessmentRoutes.post('/answers/:answerId/regrade', async (c) => {
  const auth = requireAuth(c);
  const answerId = idParam(c, 'answerId');
  const input = await body(c, z.object({ reason: z.string().trim().min(10, 'Explain in at least 10 characters.').max(2000) }));
  const [row] = await db
    .select({ ans: attemptAnswers, at: attempts })
    .from(attemptAnswers)
    .innerJoin(attempts, eq(attempts.id, attemptAnswers.attemptId))
    .where(and(eq(attemptAnswers.id, answerId), eq(attempts.userId, auth.user.id)));
  if (!row) throw notFound('Answer');
  const [a] = await db.select().from(assessments).where(eq(assessments.id, row.at.assessmentId));
  if (!settingsOf(a).allowRegradeRequests) throw forbidden('This assessment does not accept regrade requests.');
  if (row.at.status !== 'released') throw conflict('You can request a regrade once results are released.');
  const [open] = await db.select().from(regradeRequests).where(and(eq(regradeRequests.subjectType, 'attempt_answer'), eq(regradeRequests.subjectId, answerId), eq(regradeRequests.status, 'open')));
  if (open) throw conflict('You already have an open regrade request for this answer.');
  const [rg] = await db
    .insert(regradeRequests)
    .values({ orgId: a.orgId, subjectType: 'attempt_answer', subjectId: answerId, requesterId: auth.user.id, reason: input.reason, previousScore: row.ans.finalScore })
    .returning();
  await audit(c, { action: 'assessment.regrade_requested', orgId: a.orgId, targetType: 'regrade_request', targetId: rg.id, meta: { answerId } });
  await notify(a.ownerId, { type: 'assessment.regrade_requested', category: 'assessments', title: `Regrade request: ${a.title}`, body: `${auth.user.name}: ${input.reason.slice(0, 200)}`, link: `${manageLink(a)}?tab=regrades`, orgId: a.orgId });
  return c.json({ regrade: rg }, 201);
});

assessmentRoutes.patch('/regrades/:id', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const input = await body(
    c,
    z.object({ status: z.enum(['upheld', 'adjusted', 'rejected']), newScore: z.number().min(0).max(1000).optional(), note: z.string().trim().min(3, 'Add a short note for the candidate.').max(2000) }),
  );
  const [rg] = await db.select().from(regradeRequests).where(and(eq(regradeRequests.id, id), eq(regradeRequests.subjectType, 'attempt_answer')));
  if (!rg) throw notFound('Regrade request');
  const { ans, at, a } = await managedAnswer(c, rg.subjectId).catch((e) => {
    if ((e as { status?: number }).status === 404) throw notFound('Regrade request');
    throw e;
  });
  if (rg.status !== 'open') throw conflict('This request was already resolved.');
  let newScore = ans.finalScore;
  if (input.status === 'adjusted') {
    if (input.newScore === undefined) throw badRequest('Enter the adjusted score.', { fields: { newScore: 'Required for an adjustment.' } });
    await scoreAnswer(c, { answerId: ans.id, score: input.newScore, reason: `Regrade: ${input.note}` });
    newScore = input.newScore;
  }
  const [row] = await db
    .update(regradeRequests)
    .set({ status: input.status, newScore, resolvedBy: auth.user.id, resolutionNote: input.note, resolvedAt: new Date() })
    .where(eq(regradeRequests.id, rg.id))
    .returning();
  await audit(c, { action: 'assessment.regrade_resolved', orgId: a.orgId, targetType: 'regrade_request', targetId: rg.id, meta: { status: input.status, previous: rg.previousScore, newScore } });
  await notify(rg.requesterId, {
    type: 'assessment.regrade_resolved',
    category: 'assessments',
    title: `Regrade ${input.status}: ${a.title}`,
    body: input.note,
    link: `/app/assessments/attempts/${at.id}/result`,
    orgId: a.orgId,
  });
  return c.json({ regrade: row });
});

// =====================================================================
// Single assessment (manager + candidate overview). /:id routes last.
// =====================================================================

assessmentRoutes.get('/:id/overview', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const [a] = await db.select().from(assessments).where(eq(assessments.id, id));
  if (!a) throw notFound('Assessment');
  const access = await takeAccess(auth.user.id, a);
  const manager = managementLevel(auth, a);
  if (!access.ok && !manager) {
    if (access.reason === 'not_found') throw notFound('Assessment');
    throw forbidden(access.reason);
  }
  if (a.status === 'draft' && !manager) throw notFound('Assessment');
  const invite = access.ok ? access.invite : null;
  const s = settingsOf(a);
  let mine = await db.select().from(attempts).where(and(eq(attempts.assessmentId, a.id), eq(attempts.userId, auth.user.id))).orderBy(desc(attempts.startedAt));
  const inProgress = mine.find((m) => m.status === 'in_progress');
  if (inProgress && (await expireIfDue(inProgress)).status !== 'in_progress') mine = await db.select().from(attempts).where(and(eq(attempts.assessmentId, a.id), eq(attempts.userId, auth.user.id))).orderBy(desc(attempts.startedAt));
  const [{ fixed, points }] = await db.select({ fixed: sql<number>`count(*)::int`, points: sql<number>`coalesce(sum(${assessmentItems.points}), 0)::float` }).from(assessmentItems).where(eq(assessmentItems.assessmentId, a.id));
  const w = windowState(a, invite);
  const attemptsLeft = s.maxAttempts ? Math.max(0, s.maxAttempts - mine.length) : null;
  const current = mine.find((m) => m.status === 'in_progress') ?? null;
  let cannotStart: string | null = null;
  if (!access.ok) cannotStart = 'You are viewing this as an organizer. Candidates start it from their invitation.';
  else if (!current && !w.open) cannotStart = w.reason ?? 'Not open.';
  else if (!current && attemptsLeft === 0) cannotStart = 'You have used all your attempts.';
  const [org] = a.orgId ? await db.select({ name: organizations.name, isSample: organizations.isSample }).from(organizations).where(eq(organizations.id, a.orgId)) : [null];
  return c.json({
    assessment: {
      id: a.id,
      title: a.title,
      description: a.description,
      mode: a.mode,
      status: a.status,
      orgName: org?.name ?? null,
      isSample: org?.isSample ?? false,
      itemCount: itemCountOf(Number(fixed), s),
      totalPoints: (s.blueprint ?? []).some((r) => r.points === undefined) ? null : Number(points) + (s.blueprint ?? []).reduce((n, r) => n + (r.points ?? 0) * r.count, 0),
      timeLimitMinutes: s.timeLimitMinutes ?? null,
      effectiveTimeLimitMinutes: effectiveTimeLimitMinutes(a, invite),
      maxAttempts: s.maxAttempts ?? null,
      availableFrom: s.availableFrom ?? null,
      availableUntil: s.availableUntil ?? null,
      resultRelease: s.resultRelease,
      showAnswersAfterRelease: !!s.showAnswersAfterRelease,
      passingScore: s.passingScore ?? null,
      allowRegradeRequests: !!s.allowRegradeRequests,
      proctoringNote: s.proctoringNote ?? null,
      sections: s.sections ?? [],
      personal: isPersonal(a),
    },
    window: w,
    invite: invite ? { status: invite.status, dueAt: invite.dueAt, accommodations: invite.accommodations } : null,
    attemptsUsed: mine.length,
    attemptsLeft,
    inProgressAttemptId: current?.id ?? null,
    canStart: !cannotStart,
    cannotStartReason: cannotStart,
    isManager: !!manager,
    attempts: mine.map((m) => ({ id: m.id, attemptNo: m.attemptNo, status: m.status, startedAt: m.startedAt, submittedAt: m.submittedAt, percent: m.status === 'released' && m.maxScore ? Math.round(((m.score ?? 0) / m.maxScore) * 100) : null })),
  });
});

assessmentRoutes.post('/:id/attempts', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const [a] = await db.select().from(assessments).where(eq(assessments.id, id));
  if (!a) throw notFound('Assessment');
  const access = await takeAccess(auth.user.id, a);
  if (!access.ok) {
    if (access.reason === 'not_found') throw notFound('Assessment');
    throw forbidden(access.reason);
  }
  if (a.status === 'draft') throw notFound('Assessment');
  const r = await startAttempt(auth.user.id, a, access.invite);
  return c.json({ attempt: { id: r.attempt.id, status: r.attempt.status, deadlineAt: r.attempt.deadlineAt, attemptNo: r.attempt.attemptNo }, created: r.created }, r.created ? 201 : 200);
});

assessmentRoutes.get('/:id', async (c) => {
  const auth = requireAuth(c);
  const a = await loadManaged(c, idParam(c), 'view');
  const rows = await db
    .select({ item: assessmentItems, q: questions })
    .from(assessmentItems)
    .innerJoin(questions, eq(questions.id, assessmentItems.questionId))
    .where(eq(assessmentItems.assessmentId, a.id))
    .orderBy(asc(assessmentItems.sortOrder));
  const resolved = await resolveQuestions(rows.map((r) => ({ questionId: r.q.id, questionVersion: r.item.questionVersion })));
  const [checklist, [cohort], [counts]] = await Promise.all([
    publishChecklist(a),
    a.cohortId ? db.select({ id: cohorts.id, name: cohorts.name }).from(cohorts).where(eq(cohorts.id, a.cohortId)) : Promise.resolve([null]),
    db
      .select({
        attempts: sql<number>`count(*)::int`,
        needsReview: sql<number>`count(*) filter (where ${attempts.status} = 'needs_review')::int`,
        awaitingRelease: sql<number>`count(*) filter (where ${attempts.status} = 'graded')::int`,
      })
      .from(attempts)
      .where(eq(attempts.assessmentId, a.id)),
  ]);
  const level = managementLevel(auth, a);
  return c.json({
    assessment: a,
    access: level,
    editable: level === 'edit',
    itemsLocked: a.status !== 'draft',
    cohort: cohort ?? null,
    counts,
    checklist,
    items: rows.map(({ item, q }) => {
      const r = resolved.get(q.id) ?? { ...q, versionUsed: q.version };
      return {
        id: item.id,
        points: item.points,
        sortOrder: item.sortOrder,
        section: item.section,
        questionVersion: item.questionVersion,
        latestVersion: q.version,
        question: level === 'edit' ? { ...authorQuestion(auth, q), content: r.content, answerKey: canEditQuestion(auth, q) ? r.answerKey : null } : publicQuestion(r),
      };
    }),
  });
});

assessmentRoutes.patch('/:id', async (c) => {
  const a = await loadManaged(c, idParam(c), 'edit');
  if (isPersonal(a)) throw forbidden('Generated practice quizzes cannot be edited. Generate a new one instead.');
  const input = await body(c, patchSchema(assessmentInput.omit({ mode: true, public: true })));
  const prev = settingsOf(a);
  const next: ExtSettings | undefined = input.settings ? { ...prev, ...input.settings, personal: prev.personal, seedKey: prev.seedKey } : undefined;
  if (next && a.status !== 'draft' && JSON.stringify(next.blueprint ?? []) !== JSON.stringify(prev.blueprint ?? [])) {
    throw conflict('Questions are frozen once published. Duplicate the assessment to change the blueprint.');
  }
  if (input.cohortId !== undefined) await assertCohortInOrg(input.cohortId, a.orgId);
  await assertLinksInOrg({ jobPostingId: input.jobPostingId, driveId: input.driveId }, a.orgId);
  const [row] = await db
    .update(assessments)
    .set({
      ...(input.title ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(next ? { settings: next } : {}),
      ...(input.cohortId !== undefined ? { cohortId: input.cohortId } : {}),
      ...(input.jobPostingId !== undefined ? { jobPostingId: input.jobPostingId } : {}),
      ...(input.driveId !== undefined ? { driveId: input.driveId } : {}),
      ...(input.trackId !== undefined ? { trackId: input.trackId } : {}),
      ...(input.skillIds ? { skillIds: input.skillIds } : {}),
      updatedAt: new Date(),
    })
    .where(eq(assessments.id, a.id))
    .returning();
  await audit(c, { action: 'assessment.updated', orgId: a.orgId, targetType: 'assessment', targetId: a.id, meta: { fields: Object.keys(input) } });
  return c.json({ assessment: row });
});

assessmentRoutes.put('/:id/items', async (c) => {
  const a = await loadManaged(c, idParam(c), 'edit');
  if (a.status !== 'draft') throw conflict('Questions are frozen once published. Duplicate the assessment to change them.');
  const input = await body(
    c,
    z.object({
      items: z.array(z.object({ questionId: z.string().uuid(), points: z.number().min(0).max(1000).optional(), section: z.string().trim().max(80).nullable().optional() })).max(200),
    }),
  );
  const ids = [...new Set(input.items.map((i) => i.questionId))];
  if (ids.length !== input.items.length) throw badRequest('A question can only appear once.', { fields: { items: 'Remove the duplicate question.' } });
  const qs = ids.length ? await db.select().from(questions).where(inArray(questions.id, ids)) : [];
  for (const id of ids) {
    const q = qs.find((x) => x.id === id);
    const allowed = q && q.status !== 'retired' && ((a.orgId && q.orgId === a.orgId) || (!q.orgId && q.visibility === 'public' && q.status === 'active'));
    if (!allowed) throw badRequest('One of the questions is not available to this assessment.', { fields: { items: 'Use questions from this organization or the public bank.' } });
  }
  await db.delete(assessmentItems).where(eq(assessmentItems.assessmentId, a.id));
  if (input.items.length) {
    await db.insert(assessmentItems).values(
      input.items.map((it, i) => {
        const q = qs.find((x) => x.id === it.questionId)!;
        return { assessmentId: a.id, questionId: q.id, questionVersion: q.version, points: it.points ?? q.points, sortOrder: i + 1, section: it.section ?? null };
      }),
    );
  }
  await db.update(assessments).set({ updatedAt: new Date() }).where(eq(assessments.id, a.id));
  return c.json({ ok: true, count: input.items.length, checklist: await publishChecklist({ ...a }) });
});

assessmentRoutes.get('/:id/checklist', async (c) => {
  const a = await loadManaged(c, idParam(c), 'view');
  return c.json({ checklist: await publishChecklist(a) });
});

assessmentRoutes.post('/:id/publish', async (c) => {
  const a = await loadManaged(c, idParam(c), 'edit');
  if (a.status === 'published') throw conflict('Already published.');
  if (a.status === 'archived') throw conflict('Archived assessments cannot be published. Duplicate it instead.');
  const checklist = await publishChecklist(a);
  if (!checklist.ready) throw badRequest(`Fix these before publishing: ${checklist.problems.join(' ')}`, { problems: checklist.problems });
  const row = await publishAssessment(a);
  await audit(c, { action: 'assessment.published', orgId: a.orgId, targetType: 'assessment', targetId: a.id, meta: { version: row.version } });
  return c.json({ assessment: row, checklist });
});

assessmentRoutes.post('/:id/close', async (c) => {
  const a = await loadManaged(c, idParam(c), 'edit');
  if (a.status !== 'published') throw conflict('Only published assessments can be closed.');
  const [row] = await db.update(assessments).set({ status: 'closed', updatedAt: new Date() }).where(eq(assessments.id, a.id)).returning();
  // Submit anything still open; graded attempts release now if the policy says so.
  const open = await db.select().from(attempts).where(and(eq(attempts.assessmentId, a.id), eq(attempts.status, 'in_progress')));
  for (const at of open) await submitAttempt(at, { auto: true });
  const released = shouldReleaseNow(row) ? await releaseAll(a.id) : 0;
  await audit(c, { action: 'assessment.closed', orgId: a.orgId, targetType: 'assessment', targetId: a.id, meta: { autoSubmitted: open.length, released } });
  return c.json({ assessment: row, autoSubmitted: open.length, released });
});

assessmentRoutes.post('/:id/reopen', async (c) => {
  const a = await loadManaged(c, idParam(c), 'edit');
  if (a.status !== 'closed') throw conflict('Only closed assessments can be reopened.');
  const [row] = await db.update(assessments).set({ status: 'published', updatedAt: new Date() }).where(eq(assessments.id, a.id)).returning();
  await audit(c, { action: 'assessment.reopened', orgId: a.orgId, targetType: 'assessment', targetId: a.id });
  return c.json({ assessment: row });
});

assessmentRoutes.post('/:id/archive', async (c) => {
  const a = await loadManaged(c, idParam(c), 'edit');
  const [row] = await db.update(assessments).set({ status: 'archived', updatedAt: new Date() }).where(eq(assessments.id, a.id)).returning();
  await audit(c, { action: 'assessment.archived', orgId: a.orgId, targetType: 'assessment', targetId: a.id });
  return c.json({ assessment: row });
});

assessmentRoutes.post('/:id/duplicate', async (c) => {
  const auth = requireAuth(c);
  const a = await loadManaged(c, idParam(c), 'edit');
  const s = settingsOf(a);
  const { seedKey: _k, ...rest } = s;
  const [row] = await db
    .insert(assessments)
    .values({ orgId: a.orgId, ownerId: auth.user.id, title: `Copy of ${a.title}`.slice(0, 200), description: a.description, mode: a.mode, settings: rest, status: 'draft', skillIds: a.skillIds, trackId: a.trackId, cohortId: a.cohortId, jobPostingId: a.jobPostingId, driveId: a.driveId })
    .returning();
  const items = await db.select({ item: assessmentItems, version: questions.version, status: questions.status }).from(assessmentItems).innerJoin(questions, eq(questions.id, assessmentItems.questionId)).where(eq(assessmentItems.assessmentId, a.id));
  const keep = items.filter((i) => i.status !== 'retired');
  if (keep.length) await db.insert(assessmentItems).values(keep.map(({ item, version }) => ({ assessmentId: row.id, questionId: item.questionId, questionVersion: version, points: item.points, sortOrder: item.sortOrder, section: item.section })));
  await audit(c, { action: 'assessment.duplicated', orgId: a.orgId, targetType: 'assessment', targetId: row.id, meta: { from: a.id } });
  return c.json({ assessment: row, skippedRetired: items.length - keep.length }, 201);
});

assessmentRoutes.delete('/:id', async (c) => {
  const a = await loadManaged(c, idParam(c), 'edit');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(attempts).where(eq(attempts.assessmentId, a.id));
  if (a.status !== 'draft' || n > 0) throw conflict('Only unused drafts can be deleted. Archive this assessment instead.');
  await db.delete(assessments).where(eq(assessments.id, a.id));
  await audit(c, { action: 'assessment.deleted', orgId: a.orgId, targetType: 'assessment', targetId: a.id });
  return c.json({ deleted: true });
});

// ---------- Invites ----------

assessmentRoutes.get('/:id/invites', async (c) => {
  const a = await loadManaged(c, idParam(c), 'view');
  const rows = await db
    .select({ invite: assessmentInvites, name: users.name, email: users.email })
    .from(assessmentInvites)
    .innerJoin(users, eq(users.id, assessmentInvites.userId))
    .where(eq(assessmentInvites.assessmentId, a.id))
    .orderBy(asc(users.name));
  return c.json({ invites: rows.map((r) => ({ ...r.invite, name: r.name, email: r.email })) });
});

const accommodationsInput = z.object({ extraTimePercent: z.number().int().min(0).max(300).optional(), note: z.string().trim().max(500).optional() });

assessmentRoutes.post('/:id/invites', async (c) => {
  const auth = requireAuth(c);
  const a = await loadManaged(c, idParam(c), 'edit');
  if (isPersonal(a)) throw forbidden('Personal practice cannot be shared.');
  if (a.status === 'archived' || a.status === 'closed') throw conflict('Reopen the assessment before inviting more people.');
  const input = await body(
    c,
    z
      .object({
        userIds: z.array(z.string().uuid()).max(500).default([]),
        emails: z.array(emailSchema).max(500).default([]),
        dueAt: z.string().datetime({ offset: true }).nullable().optional(),
        accommodations: accommodationsInput.optional(),
      })
      .refine((v) => v.userIds.length + v.emails.length > 0, { message: 'Choose at least one person.', path: ['userIds'] }),
  );
  const byEmail = input.emails.length ? await db.select({ id: users.id, email: users.email }).from(users).where(and(inArray(users.email, input.emails), eq(users.status, 'active'))) : [];
  const known = input.userIds.length ? await db.select({ id: users.id }).from(users).where(and(inArray(users.id, input.userIds), eq(users.status, 'active'))) : [];
  const unknownEmails = input.emails.filter((e) => !byEmail.some((u) => u.email === e));
  const ids = [...known.map((u) => u.id), ...byEmail.map((u) => u.id)];
  const r = await inviteToAssessment({ assessmentId: a.id, userIds: ids, invitedBy: auth.user.id, dueAt: input.dueAt ? new Date(input.dueAt) : null, accommodations: input.accommodations });
  await audit(c, { action: 'assessment.invited', orgId: a.orgId, targetType: 'assessment', targetId: a.id, meta: { invited: r.invited, alreadyInvited: r.alreadyInvited, unknownEmails: unknownEmails.length } });
  return c.json({ ...r, unknownEmails });
});

assessmentRoutes.patch('/:id/invites/:inviteId', async (c) => {
  const a = await loadManaged(c, idParam(c), 'edit');
  const inviteId = idParam(c, 'inviteId');
  const input = await body(c, z.object({ accommodations: accommodationsInput.optional(), dueAt: z.string().datetime({ offset: true }).nullable().optional(), status: z.enum(['revoked', 'invited']).optional() }));
  const [inv] = await db.select().from(assessmentInvites).where(and(eq(assessmentInvites.id, inviteId), eq(assessmentInvites.assessmentId, a.id)));
  if (!inv) throw notFound('Invitation');
  const [row] = await db
    .update(assessmentInvites)
    .set({
      ...(input.accommodations ? { accommodations: input.accommodations } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
      ...(input.status ? { status: input.status } : {}),
    })
    .where(eq(assessmentInvites.id, inv.id))
    .returning();
  // Extra time granted mid-attempt extends the running deadline.
  if (input.accommodations && settingsOf(a).timeLimitMinutes) {
    const [open] = await db.select().from(attempts).where(and(eq(attempts.assessmentId, a.id), eq(attempts.userId, inv.userId), eq(attempts.status, 'in_progress')));
    if (open) {
      const limit = effectiveTimeLimitMinutes(a, row)!;
      let deadline = open.startedAt.getTime() + limit * 60_000;
      const w = windowState(a, row);
      if (w.closesAt) deadline = Math.min(deadline, new Date(w.closesAt).getTime());
      await db.update(attempts).set({ deadlineAt: new Date(deadline) }).where(eq(attempts.id, open.id));
      await scheduleAutosubmit(open.id, new Date(deadline), a.orgId);
    }
  }
  await audit(c, { action: 'assessment.invite_updated', orgId: a.orgId, targetType: 'assessment_invite', targetId: inv.id, meta: input });
  return c.json({ invite: row });
});

// ---------- Attempts, grading queue, results ----------

assessmentRoutes.get('/:id/attempts', async (c) => {
  const a = await loadManaged(c, idParam(c), 'view');
  const rows = await db
    .select({ at: attempts, name: users.name, email: users.email })
    .from(attempts)
    .innerJoin(users, eq(users.id, attempts.userId))
    .where(eq(attempts.assessmentId, a.id))
    .orderBy(desc(attempts.startedAt))
    .limit(1000);
  return c.json({
    items: rows.map(({ at, name, email }) => ({ id: at.id, userId: at.userId, name, email, attemptNo: at.attemptNo, status: at.status, score: at.score, maxScore: at.maxScore, startedAt: at.startedAt, submittedAt: at.submittedAt, autoSubmitted: at.autoSubmitted, releasedAt: at.releasedAt })),
  });
});

assessmentRoutes.get('/:id/grading-queue', async (c) => {
  const auth = requireAuth(c);
  const a = await loadManaged(c, idParam(c), 'edit');
  const { status } = query(c, z.object({ status: z.enum(['pending', 'all']).default('pending') }));
  const rows = await db
    .select({ ans: attemptAnswers, at: attempts, name: users.name, email: users.email })
    .from(attemptAnswers)
    .innerJoin(attempts, eq(attempts.id, attemptAnswers.attemptId))
    .innerJoin(users, eq(users.id, attempts.userId))
    .where(and(eq(attempts.assessmentId, a.id), inArray(attempts.status, ['needs_review', 'graded', 'released']), status === 'pending' ? isNull(attemptAnswers.finalScore) : undefined))
    .orderBy(asc(attempts.submittedAt))
    .limit(500);
  const refs = rows.map((r) => r.at.items.find((i) => i.questionId === r.ans.questionId)).filter(Boolean) as Attempt['items'];
  const resolved = await resolveQuestions(refs);
  return c.json({
    items: rows.map(({ ans, at, name, email }) => {
      const q = resolved.get(ans.questionId);
      const item = at.items.find((i) => i.questionId === ans.questionId);
      return {
        answerId: ans.id,
        attemptId: at.id,
        attemptStatus: at.status,
        candidate: { userId: at.userId, name, email },
        submittedAt: at.submittedAt,
        question: q ? { id: q.id, type: q.type, title: q.title, prompt: q.content.prompt, content: q.content, points: item?.points ?? ans.maxPoints, version: q.versionUsed, guidance: canEditQuestion(auth, q) ? q.answerKey : reviewerKey(q.answerKey) } : null,
        answer: ans.answer,
        maxPoints: ans.maxPoints,
        autoScore: ans.autoScore,
        manualScore: ans.manualScore,
        finalScore: ans.finalScore,
        gradingMethod: ans.gradingMethod,
        gradingDetail: ans.gradingDetail,
        feedback: ans.feedback,
        aiProposal: ans.aiProposal,
      };
    }),
  });
});

assessmentRoutes.get('/:id/results', async (c) => {
  const a = await loadManaged(c, idParam(c), 'view');
  return c.json({ assessment: { id: a.id, title: a.title, mode: a.mode, status: a.status, resultRelease: settingsOf(a).resultRelease }, ...(await assessmentResults(a)) });
});

assessmentRoutes.get('/:id/results.csv', async (c) => {
  const a = await loadManaged(c, idParam(c), 'view');
  const csv = resultsCsv(await assessmentResults(a));
  await audit(c, { action: 'assessment.results_exported', orgId: a.orgId, targetType: 'assessment', targetId: a.id });
  const name = a.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'assessment';
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}-results.csv"`, 'cache-control': 'no-store' } });
});

assessmentRoutes.post('/:id/release', async (c) => {
  const a = await loadManaged(c, idParam(c), 'edit');
  const input = await body(c, z.object({ attemptIds: z.array(z.string().uuid()).max(1000).optional() }));
  const released = await releaseAll(a.id, input.attemptIds);
  await audit(c, { action: 'assessment.results_released', orgId: a.orgId, targetType: 'assessment', targetId: a.id, meta: { released } });
  return c.json({ released });
});

assessmentRoutes.get('/:id/regrades', async (c) => {
  const a = await loadManaged(c, idParam(c), 'edit');
  const rows = await db
    .select({ rg: regradeRequests, ans: attemptAnswers, at: attempts, name: users.name, email: users.email, qTitle: questions.title })
    .from(regradeRequests)
    .innerJoin(attemptAnswers, eq(attemptAnswers.id, regradeRequests.subjectId))
    .innerJoin(attempts, eq(attempts.id, attemptAnswers.attemptId))
    .innerJoin(users, eq(users.id, regradeRequests.requesterId))
    .leftJoin(questions, eq(questions.id, attemptAnswers.questionId))
    .where(and(eq(regradeRequests.subjectType, 'attempt_answer'), eq(attempts.assessmentId, a.id)))
    .orderBy(desc(regradeRequests.createdAt));
  return c.json({
    items: rows.map(({ rg, ans, at, name, email, qTitle }) => ({
      ...rg,
      candidate: { userId: at.userId, name, email },
      attemptId: at.id,
      answerId: ans.id,
      questionTitle: qTitle,
      currentScore: ans.finalScore,
      maxPoints: ans.maxPoints,
      answer: ans.answer,
      feedback: ans.feedback,
    })),
  });
});

/** Role labels for UI hints (who may manage which mode). */
assessmentRoutes.get('/meta/roles', (c) => {
  requireAuth(c);
  return c.json({
    managerRoles: Object.fromEntries(Object.entries(MANAGER_ROLES).map(([m, rs]) => [m, rs.map((r) => ({ role: r, label: ROLE_LABELS[r] }))])),
    viewerRoles: VIEWER_ROLES,
    platformAdmin: isPlatformAdmin(requireAuth(c)),
    activeOrgRoles: rolesIn(requireAuth(c), requireAuth(c).session.activeOrgId),
  });
});
