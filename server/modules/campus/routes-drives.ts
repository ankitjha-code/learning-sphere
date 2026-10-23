import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  assessments,
  assessmentInvites,
  campusInterviewDetails,
  driveCandidates,
  driveStageEvents,
  interviews,
  placementDrives,
  programs,
  studentRecords,
  users,
  type EligibilityRules,
} from '../../db/schema';
import { type AppEnv, type Ctx, requireAuth, requireOrgRole } from '../../lib/context';
import { body, idParam, query, patchSchema } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { enqueue } from '../../jobs/queue';
import { getOrgPolicies } from '../admin/settings';
import { checkLimit } from '../admin/plans';
import { inviteToAssessment, attemptSummaries, type AttemptSummary } from '../assessments/service';
import { DEFAULT_SETTINGS } from '../assessments/schemas';
import {
  assertCampusAccess,
  assertCompanyOrg,
  CANDIDATE_STAGES,
  changeStage,
  CLOSED_STAGES,
  csvResponse,
  driveFunnel,
  evaluateStudents,
  FUNNEL_DEFINITIONS,
  orgStudentIds,
  parseCleanNumber,
  PROGRESS_ORDER,
  readSnapshot,
  requireCampus,
  snapshotOf,
  STAGE_LABELS,
  toCsv,
  unknownSkillSlugs,
  type CandidateRow,
  type CandidateStage,
  type DriveRow,
  type RuleCheck,
} from './service';
import { DRIVE_STAGE_OPTIONS, eligibilityInput } from './schemas';

/** Placement drives: eligibility, candidates, assessment, interviews, outcomes and drive reports. */
export const driveRoutes = new Hono<AppEnv>();

const PLACEMENT_MANAGERS = ['placement_officer', 'org_admin'] as const;
const FINAL_SCORE = new Set(['graded', 'released']);

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date and time.')
  .transform((v) => new Date(v));

const driveInput = z.object({
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(200),
  companyName: z.string().trim().min(2).max(160),
  companyOrgId: z.string().uuid().nullable().optional(),
  roleTitle: z.string().trim().min(2).max(160),
  description: z.string().trim().max(10000).nullable().optional(),
  ctcText: z.string().trim().max(200).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  eligibility: eligibilityInput.optional(),
  registrationDeadline: isoDate.nullable().optional(),
  stages: z.array(z.enum(DRIVE_STAGE_OPTIONS)).min(1).optional(),
});

export async function loadDrive(c: Ctx, id: string): Promise<DriveRow> {
  const [d] = await db.select().from(placementDrives).where(eq(placementDrives.id, id));
  if (!d) throw notFound('Drive');
  assertCampusAccess(c, d.orgId, 'Drive');
  return d;
}

async function validateRules(orgId: string, rules: EligibilityRules | undefined) {
  if (!rules) return;
  if (rules.programIds?.length) {
    const found = await db.select({ id: programs.id }).from(programs).where(and(eq(programs.orgId, orgId), inArray(programs.id, rules.programIds)));
    if (found.length !== new Set(rules.programIds).size) throw badRequest('Choose programs from this institution.', { fields: { 'eligibility.programIds': 'Unknown program.' } });
  }
  const missing = await unknownSkillSlugs(rules.requiredSkillSlugs ?? []);
  if (missing.length) throw badRequest(`Unknown skills: ${missing.join(', ')}.`, { fields: { 'eligibility.requiredSkillSlugs': 'Choose skills from the Skill DNA catalog.' } });
}

// ---------- Drives CRUD ----------

driveRoutes.get('/drives', async (c) => {
  const { orgId } = requireCampus(c);
  const q = query(c, z.object({ status: z.enum(['draft', 'open', 'in_progress', 'completed', 'cancelled', 'active']).optional(), q: z.string().trim().max(200).optional() }));
  const rows = await db
    .select()
    .from(placementDrives)
    .where(
      and(
        eq(placementDrives.orgId, orgId),
        q.status === 'active' ? inArray(placementDrives.status, ['open', 'in_progress']) : q.status ? eq(placementDrives.status, q.status) : undefined,
        q.q ? sql`(${placementDrives.title} ilike ${'%' + q.q.replace(/[%_\\]/g, '\\$&') + '%'} or ${placementDrives.companyName} ilike ${'%' + q.q.replace(/[%_\\]/g, '\\$&') + '%'})` : undefined,
      ),
    )
    .orderBy(desc(placementDrives.createdAt));
  const counts = rows.length
    ? await db
        .select({ driveId: driveCandidates.driveId, stage: driveCandidates.stage, n: sql<number>`count(*)::int` })
        .from(driveCandidates)
        .where(inArray(driveCandidates.driveId, rows.map((r) => r.id)))
        .groupBy(driveCandidates.driveId, driveCandidates.stage)
    : [];
  return c.json({
    items: rows.map((d) => {
      const byStage = Object.fromEntries(counts.filter((x) => x.driveId === d.id).map((x) => [x.stage, Number(x.n)]));
      return { ...d, candidates: Object.values(byStage).reduce((a, b) => a + b, 0), byStage };
    }),
    total: rows.length,
  });
});

driveRoutes.post('/drives', async (c) => {
  const auth = requireAuth(c);
  const { orgId } = requireCampus(c);
  const input = await body(c, driveInput);
  await assertCompanyOrg(input.companyOrgId);
  await validateRules(orgId, input.eligibility);
  const [row] = await db
    .insert(placementDrives)
    .values({
      orgId,
      title: input.title,
      companyName: input.companyName,
      companyOrgId: input.companyOrgId ?? null,
      roleTitle: input.roleTitle,
      description: input.description ?? null,
      ctcText: input.ctcText ?? null,
      location: input.location ?? null,
      eligibility: input.eligibility ?? {},
      registrationDeadline: input.registrationDeadline ?? null,
      ...(input.stages ? { stages: input.stages } : {}),
      createdBy: auth.user.id,
    })
    .returning();
  await audit(c, { action: 'campus.drive_created', orgId, targetType: 'placement_drive', targetId: row.id, meta: { title: row.title } });
  return c.json({ drive: row }, 201);
});

driveRoutes.get('/drives/:id', async (c) => {
  const d = await loadDrive(c, idParam(c));
  const [assessment] = d.assessmentId ? await db.select({ id: assessments.id, title: assessments.title, status: assessments.status }).from(assessments).where(eq(assessments.id, d.assessmentId)) : [];
  const { funnel } = await driveFunnel(d);
  const policies = await getOrgPolicies(d.orgId);
  return c.json({ drive: d, assessment: assessment ?? null, funnel, policy: { requireVerifiedRecordForPlacement: policies.requireVerifiedRecordForPlacement } });
});

driveRoutes.patch('/drives/:id', async (c) => {
  const d = await loadDrive(c, idParam(c));
  if (d.status === 'completed' || d.status === 'cancelled') throw conflict('Completed or cancelled drives cannot be edited.');
  const input = await body(c, patchSchema(driveInput));
  await assertCompanyOrg(input.companyOrgId);
  await validateRules(d.orgId, input.eligibility);
  const [row] = await db
    .update(placementDrives)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(placementDrives.id, d.id))
    .returning();
  await audit(c, { action: 'campus.drive_updated', orgId: d.orgId, targetType: 'placement_drive', targetId: d.id, meta: { fields: Object.keys(input), eligibilityChanged: input.eligibility !== undefined } });
  if (input.registrationDeadline !== undefined && row.status === 'open') await scheduleDeadlineReminder(row);
  return c.json({ drive: row });
});

const TRANSITIONS: Record<string, string[]> = {
  draft: ['open', 'cancelled'],
  open: ['in_progress', 'cancelled', 'draft'],
  in_progress: ['completed', 'cancelled', 'open'],
  completed: [],
  cancelled: [],
};

async function scheduleDeadlineReminder(d: DriveRow) {
  if (!d.registrationDeadline) return;
  const runAt = new Date(d.registrationDeadline.getTime() - 24 * 3600_000);
  if (runAt.getTime() <= Date.now()) return;
  await enqueue('campus.deadline_reminder', { driveId: d.id, deadline: d.registrationDeadline.toISOString() }, { idempotencyKey: `campus:deadline:${d.id}:${d.registrationDeadline.toISOString()}`, runAt, orgId: d.orgId });
}

driveRoutes.post('/drives/:id/status', async (c) => {
  const d = await loadDrive(c, idParam(c));
  const { status, reason } = await body(c, z.object({ status: z.enum(['draft', 'open', 'in_progress', 'completed', 'cancelled']), reason: z.string().trim().max(500).optional() }));
  if (!TRANSITIONS[d.status]?.includes(status)) throw conflict(`A ${d.status.replace('_', ' ')} drive cannot move to ${status.replace('_', ' ')}.`);
  if (status === 'draft') {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(driveCandidates).where(eq(driveCandidates.driveId, d.id));
    if (Number(n)) throw conflict('This drive already has candidates, so it cannot go back to draft.');
  }
  const [row] = await db.update(placementDrives).set({ status, updatedAt: new Date() }).where(eq(placementDrives.id, d.id)).returning();
  await audit(c, { action: 'campus.drive_status_changed', orgId: d.orgId, targetType: 'placement_drive', targetId: d.id, meta: { from: d.status, to: status, reason } });
  if (status === 'open') await scheduleDeadlineReminder(row);
  if (status === 'cancelled') {
    const active = await db.select({ userId: driveCandidates.userId }).from(driveCandidates).where(and(eq(driveCandidates.driveId, d.id), sql`${driveCandidates.stage} not in ('placed','rejected','withdrawn','declined')`));
    for (const a of active) await notify(a.userId, { type: 'campus.drive_cancelled', category: 'career', orgId: d.orgId, title: `${d.title} was cancelled`, body: reason ?? 'The placement office cancelled this drive.', link: '/app/placements' });
  }
  return c.json({ drive: row });
});

driveRoutes.delete('/drives/:id', async (c) => {
  const d = await loadDrive(c, idParam(c));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(driveCandidates).where(eq(driveCandidates.driveId, d.id));
  if (d.status !== 'draft' || Number(n)) throw conflict('Only draft drives without candidates can be deleted. Cancel the drive instead.');
  await db.delete(placementDrives).where(eq(placementDrives.id, d.id));
  await audit(c, { action: 'campus.drive_deleted', orgId: d.orgId, targetType: 'placement_drive', targetId: d.id, meta: { title: d.title } });
  return c.json({ ok: true });
});

// ---------- Eligibility ----------

type EvalItem = {
  userId: string;
  name: string;
  email: string;
  recordId: string | null;
  rollNumber: string | null;
  verified: boolean;
  eligible: true | false | 'unknown';
  reasons: string[];
  unknown: string[];
  checks: RuleCheck[];
  candidateStage: string | null;
};

async function evaluateDrive(d: DriveRow, rules: EligibilityRules, onlyUserIds?: string[]) {
  const policies = await getOrgPolicies(d.orgId);
  const studentIds = await orgStudentIds(d.orgId);
  const ids = onlyUserIds ? studentIds.filter((u) => onlyUserIds.includes(u)) : studentIds;
  const results = await evaluateStudents(d.orgId, rules, ids, policies.requireVerifiedRecordForPlacement);
  const people = ids.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids)) : [];
  const cands = await db.select({ userId: driveCandidates.userId, stage: driveCandidates.stage }).from(driveCandidates).where(eq(driveCandidates.driveId, d.id));
  const stageOf = new Map(cands.map((x) => [x.userId, x.stage]));
  const items: EvalItem[] = people
    .map((p) => {
      const r = results.get(p.id)!;
      return {
        userId: p.id,
        name: p.name,
        email: p.email,
        recordId: r.record?.id ?? null,
        rollNumber: r.record?.rollNumber ?? null,
        verified: !!r.record?.verifiedAt,
        eligible: r.result.eligible,
        reasons: r.result.reasons,
        unknown: r.result.unknown,
        checks: r.result.checks,
        candidateStage: stageOf.get(p.id) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { items, results, policy: { requireVerifiedRecordForPlacement: policies.requireVerifiedRecordForPlacement } };
}

driveRoutes.post('/drives/:id/eligibility/preview', async (c) => {
  const d = await loadDrive(c, idParam(c));
  const input = await body(c, z.object({ rules: eligibilityInput.optional() }));
  if (input.rules) await validateRules(d.orgId, input.rules);
  const { items, policy } = await evaluateDrive(d, input.rules ?? d.eligibility);
  const eligible = items.filter((i) => i.eligible === true);
  const notEligible = items.filter((i) => i.eligible === false);
  const needsData = items.filter((i) => i.eligible === 'unknown');
  return c.json({
    counts: { total: items.length, eligible: eligible.length, notEligible: notEligible.length, needsData: needsData.length, alreadyCandidates: items.filter((i) => i.candidateStage).length },
    eligible,
    notEligible,
    needsData,
    policy,
    explanation:
      'Students are evaluated against each rule using their academic record and Skill DNA. Missing data is shown as "Needs data" and never counts against a student. Only rules with known data can make a student not eligible.',
  });
});

driveRoutes.post('/drives/:id/invite', async (c) => {
  const auth = requireAuth(c);
  const d = await loadDrive(c, idParam(c));
  if (d.status !== 'open' && d.status !== 'in_progress') throw conflict('Open the drive before inviting students.');
  const input = await body(c, z.object({ userIds: z.array(z.string().uuid()).max(2000).optional() }));
  const { items, results } = await evaluateDrive(d, d.eligibility, input.userIds);
  let invited = 0;
  const skipped = { alreadyCandidates: 0, notEligible: 0, needsData: 0, notStudents: input.userIds ? input.userIds.filter((u) => !items.some((i) => i.userId === u)).length : 0 };
  for (const it of items) {
    if (it.candidateStage) {
      skipped.alreadyCandidates++;
      continue;
    }
    if (it.eligible === false) {
      skipped.notEligible++;
      continue;
    }
    if (it.eligible === 'unknown') {
      skipped.needsData++;
      continue;
    }
    const [cand] = await db
      .insert(driveCandidates)
      .values({ driveId: d.id, userId: it.userId, stage: 'invited', eligibilitySnapshot: snapshotOf(results.get(it.userId)!.result), updatedBy: auth.user.id })
      .onConflictDoNothing()
      .returning();
    if (!cand) {
      skipped.alreadyCandidates++;
      continue;
    }
    await db.insert(driveStageEvents).values({ orgId: d.orgId, driveId: d.id, candidateId: cand.id, userId: it.userId, fromStage: null, toStage: 'invited', actorId: auth.user.id, actorKind: 'officer' });
    await notify(it.userId, {
      type: 'campus.drive_invited',
      category: 'career',
      orgId: d.orgId,
      title: `You're invited: ${d.title}`,
      body: `${d.companyName} · ${d.roleTitle}.${d.registrationDeadline ? ` Register by ${d.registrationDeadline.toUTCString()}.` : ''}`,
      link: '/app/placements',
    });
    invited++;
  }
  await audit(c, { action: 'campus.drive_invited', orgId: d.orgId, targetType: 'placement_drive', targetId: d.id, meta: { invited, skipped } });
  return c.json({ invited, skipped });
});

/** Manually include a student whose eligibility is unknown (needs data). Requires a reason; audited. */
driveRoutes.post('/drives/:id/include', async (c) => {
  const auth = requireAuth(c);
  const d = await loadDrive(c, idParam(c));
  if (d.status !== 'open' && d.status !== 'in_progress') throw conflict('Open the drive before inviting students.');
  const input = await body(c, z.object({ userId: z.string().uuid(), reason: z.string().trim().min(10, 'Explain why this student is included (at least 10 characters).').max(1000) }));
  const { items, results } = await evaluateDrive(d, d.eligibility, [input.userId]);
  const it = items[0];
  if (!it) throw notFound('Student');
  if (it.candidateStage) throw conflict('This student is already a candidate in this drive.');
  if (it.eligible === true) throw conflict('This student is eligible. Use Invite instead.');
  if (it.eligible === false) throw conflict(`This student is not eligible: ${it.reasons.join(' ')} Correct the record first if it is wrong.`);
  const manual = { reason: input.reason, by: auth.user.id, at: new Date().toISOString() };
  const [cand] = await db
    .insert(driveCandidates)
    .values({ driveId: d.id, userId: it.userId, stage: 'invited', eligibilitySnapshot: snapshotOf(results.get(it.userId)!.result, manual), notes: `Manually included: ${input.reason}`, updatedBy: auth.user.id })
    .returning();
  await db.insert(driveStageEvents).values({ orgId: d.orgId, driveId: d.id, candidateId: cand.id, userId: it.userId, fromStage: null, toStage: 'invited', note: `Manually included (needs data: ${it.unknown.join(', ')}). ${input.reason}`, actorId: auth.user.id, actorKind: 'officer' });
  await audit(c, { action: 'campus.drive_manual_include', orgId: d.orgId, targetType: 'drive_candidate', targetId: cand.id, meta: { driveId: d.id, userId: it.userId, unknown: it.unknown, reason: input.reason } });
  await notify(it.userId, { type: 'campus.drive_invited', category: 'career', orgId: d.orgId, title: `You're invited: ${d.title}`, body: `${d.companyName} · ${d.roleTitle}. Some of your record is incomplete; please check it.`, link: '/app/placements' });
  return c.json({ candidate: cand }, 201);
});

// ---------- Candidates ----------

async function assessmentByUser(d: DriveRow, userIds: string[]) {
  if (!d.assessmentId || !userIds.length) return { summaries: new Map<string, AttemptSummary>(), invited: new Set<string>() };
  const [sums, invs] = await Promise.all([
    attemptSummaries(d.assessmentId, userIds),
    db.select({ userId: assessmentInvites.userId, status: assessmentInvites.status }).from(assessmentInvites).where(and(eq(assessmentInvites.assessmentId, d.assessmentId), inArray(assessmentInvites.userId, userIds))),
  ]);
  return { summaries: new Map(sums.map((s) => [s.userId, s])), invited: new Set(invs.filter((i) => i.status !== 'revoked').map((i) => i.userId)) };
}

function assessmentView(s: AttemptSummary | undefined, invited: boolean) {
  if (!s) return { status: invited ? 'invited' : 'not_invited', percent: null, score: null, maxScore: null, final: false };
  const final = FINAL_SCORE.has(s.status);
  return { status: s.status, percent: final ? s.percent : null, score: final ? s.score : null, maxScore: s.maxScore, final, submittedAt: s.submittedAt };
}

driveRoutes.get('/drives/:id/candidates', async (c) => {
  const d = await loadDrive(c, idParam(c));
  const q = query(c, z.object({ stage: z.enum(CANDIDATE_STAGES).optional(), q: z.string().trim().max(200).optional() }));
  const rows = await db
    .select({ x: driveCandidates, name: users.name, email: users.email, rollNumber: studentRecords.rollNumber, recordId: studentRecords.id, programName: programs.name })
    .from(driveCandidates)
    .innerJoin(users, eq(users.id, driveCandidates.userId))
    .leftJoin(studentRecords, and(eq(studentRecords.userId, driveCandidates.userId), eq(studentRecords.orgId, d.orgId)))
    .leftJoin(programs, eq(programs.id, studentRecords.programId))
    .where(
      and(
        eq(driveCandidates.driveId, d.id),
        q.stage ? eq(driveCandidates.stage, q.stage) : undefined,
        q.q ? sql`(${users.name} ilike ${'%' + q.q.replace(/[%_\\]/g, '\\$&') + '%'} or ${users.email} ilike ${'%' + q.q.replace(/[%_\\]/g, '\\$&') + '%'} or ${studentRecords.rollNumber} ilike ${'%' + q.q.replace(/[%_\\]/g, '\\$&') + '%'})` : undefined,
      ),
    )
    .orderBy(asc(users.name));
  const { summaries, invited } = await assessmentByUser(d, rows.map((r) => r.x.userId));
  const ivs = rows.length
    ? await db
        .select({ id: interviews.id, driveCandidateId: interviews.driveCandidateId, scheduledAt: interviews.scheduledAt, status: interviews.status })
        .from(interviews)
        .where(and(eq(interviews.orgId, d.orgId), inArray(interviews.driveCandidateId, rows.map((r) => r.x.id))))
        .orderBy(asc(interviews.scheduledAt))
    : [];
  const stageCounts = await db.select({ stage: driveCandidates.stage, n: sql<number>`count(*)::int` }).from(driveCandidates).where(eq(driveCandidates.driveId, d.id)).groupBy(driveCandidates.stage);
  return c.json({
    items: rows.map((r) => ({
      ...r.x,
      eligibilitySnapshot: readSnapshot(r.x.eligibilitySnapshot),
      student: { name: r.name, email: r.email, rollNumber: r.rollNumber, recordId: r.recordId, programName: r.programName },
      assessment: d.assessmentId ? assessmentView(summaries.get(r.x.userId), invited.has(r.x.userId)) : null,
      interviews: ivs.filter((i) => i.driveCandidateId === r.x.id),
    })),
    total: rows.length,
    stageCounts: Object.fromEntries(stageCounts.map((s) => [s.stage, Number(s.n)])),
    stageLabels: STAGE_LABELS,
  });
});

async function loadCandidate(d: DriveRow, candidateId: string): Promise<CandidateRow> {
  const [x] = await db.select().from(driveCandidates).where(and(eq(driveCandidates.id, candidateId), eq(driveCandidates.driveId, d.id)));
  if (!x) throw notFound('Candidate');
  return x;
}

driveRoutes.get('/drives/:id/candidates/:candidateId/history', async (c) => {
  const d = await loadDrive(c, idParam(c));
  const x = await loadCandidate(d, idParam(c, 'candidateId'));
  const events = await db
    .select({ e: driveStageEvents, actorName: users.name })
    .from(driveStageEvents)
    .leftJoin(users, eq(users.id, driveStageEvents.actorId))
    .where(eq(driveStageEvents.candidateId, x.id))
    .orderBy(asc(driveStageEvents.createdAt));
  return c.json({ events: events.map((e) => ({ ...e.e, actorName: e.actorName })) });
});

const candidateUpdate = z.object({
  stage: z.enum(CANDIDATE_STAGES).optional(),
  note: z.string().trim().max(2000).optional(),
  offerCtcText: z.string().trim().max(200).nullable().optional(),
});

driveRoutes.patch('/drives/:id/candidates/:candidateId', async (c) => {
  const auth = requireAuth(c);
  const d = await loadDrive(c, idParam(c));
  const x = await loadCandidate(d, idParam(c, 'candidateId'));
  const input = await body(c, candidateUpdate);
  if (input.stage === 'invited' && x.stage !== 'invited') throw badRequest('Candidates cannot be moved back to invited.', { fields: { stage: 'Choose another stage.' } });
  const toStage = (input.stage ?? x.stage) as CandidateStage;
  const row = await changeStage(c, { drive: d, candidate: x, toStage, note: input.note || null, actorId: auth.user.id, actorKind: 'officer', offerCtcText: input.offerCtcText });
  if (input.note) await db.update(driveCandidates).set({ notes: input.note }).where(eq(driveCandidates.id, x.id));
  if (input.offerCtcText !== undefined && toStage === x.stage) await audit(c, { action: 'campus.candidate_offer_updated', orgId: d.orgId, targetType: 'drive_candidate', targetId: x.id, meta: { offerCtcText: input.offerCtcText } });
  return c.json({ candidate: { ...row, notes: input.note ?? row.notes } });
});

driveRoutes.post('/drives/:id/candidates/bulk-stage', async (c) => {
  const auth = requireAuth(c);
  const d = await loadDrive(c, idParam(c));
  const input = await body(
    c,
    z.object({ candidateIds: z.array(z.string().uuid()).min(1).max(1000), stage: z.enum(CANDIDATE_STAGES).refine((s) => s !== 'invited', 'Candidates cannot be moved back to invited.'), note: z.string().trim().max(2000).optional(), confirm: z.literal(true, { message: 'Confirm the bulk move.' }) }),
  );
  const rows = await db.select().from(driveCandidates).where(and(eq(driveCandidates.driveId, d.id), inArray(driveCandidates.id, input.candidateIds)));
  if (rows.length !== new Set(input.candidateIds).size) throw notFound('Candidate');
  let moved = 0;
  for (const x of rows) {
    if (x.stage === input.stage) continue;
    await changeStage(c, { drive: d, candidate: x, toStage: input.stage, note: input.note ?? null, actorId: auth.user.id, actorKind: 'officer' });
    moved++;
  }
  await audit(c, { action: 'campus.candidates_bulk_moved', orgId: d.orgId, targetType: 'placement_drive', targetId: d.id, meta: { stage: input.stage, moved, requested: rows.length } });
  return c.json({ moved, unchanged: rows.length - moved });
});

// ---------- Placement assessment ----------

driveRoutes.get('/drives/:id/assessment', async (c) => {
  const auth = requireAuth(c);
  const d = await loadDrive(c, idParam(c));
  const roles = auth.memberships.find((m) => m.orgId === d.orgId)?.roles ?? [];
  const [current] = d.assessmentId ? await db.select().from(assessments).where(eq(assessments.id, d.assessmentId)) : [];
  const options = await db
    .select({ id: assessments.id, title: assessments.title, status: assessments.status, driveId: assessments.driveId, createdAt: assessments.createdAt })
    .from(assessments)
    .where(and(eq(assessments.orgId, d.orgId), eq(assessments.mode, 'placement'), sql`(${assessments.driveId} is null or ${assessments.driveId} = ${d.id})`, sql`${assessments.status} <> 'archived'`))
    .orderBy(desc(assessments.createdAt));
  let stats = null;
  if (current) {
    const cands = await db.select({ userId: driveCandidates.userId, stage: driveCandidates.stage }).from(driveCandidates).where(eq(driveCandidates.driveId, d.id));
    const { summaries, invited } = await assessmentByUser(d, cands.map((x) => x.userId));
    const sums = [...summaries.values()];
    stats = {
      invited: invited.size,
      started: sums.length,
      submitted: sums.filter((s) => s.status !== 'in_progress').length,
      finalScores: sums.filter((s) => FINAL_SCORE.has(s.status)).length,
      registeredNotInvited: cands.filter((x) => x.stage === 'registered' && !invited.has(x.userId)).length,
    };
  }
  return c.json({
    assessment: current ? { id: current.id, title: current.title, status: current.status, mode: current.mode, settings: current.settings, publishedAt: current.publishedAt } : null,
    stats,
    options,
    canManage: PLACEMENT_MANAGERS.some((r) => roles.includes(r)),
  });
});

driveRoutes.post('/drives/:id/assessment', async (c) => {
  const auth = requireAuth(c);
  const d = await loadDrive(c, idParam(c));
  requireOrgRole(c, d.orgId, [...PLACEMENT_MANAGERS]);
  const input = await body(c, z.union([z.object({ assessmentId: z.string().uuid() }), z.object({ title: z.string().trim().min(3, 'Use at least 3 characters.').max(200), description: z.string().trim().max(5000).optional() })]));
  let assessmentId: string;
  if ('assessmentId' in input) {
    const [a] = await db.select().from(assessments).where(eq(assessments.id, input.assessmentId));
    if (!a || a.orgId !== d.orgId) throw notFound('Assessment');
    if (a.mode !== 'placement') throw badRequest('Only placement assessments can be linked to a drive.', { fields: { assessmentId: 'Choose a placement assessment.' } });
    if (a.driveId && a.driveId !== d.id) throw conflict('That assessment is already linked to another drive.');
    if (!a.driveId) await db.update(assessments).set({ driveId: d.id, updatedAt: new Date() }).where(eq(assessments.id, a.id));
    assessmentId = a.id;
  } else {
    const limit = await checkLimit('org', d.orgId, 'assessments.month');
    if (!limit.allowed) throw forbidden(`Your plan's monthly assessment limit is reached. ${limit.explanation}`);
    const [a] = await db
      .insert(assessments)
      .values({ orgId: d.orgId, ownerId: auth.user.id, title: input.title, description: input.description ?? null, mode: 'placement', settings: { ...DEFAULT_SETTINGS, resultRelease: 'manual' }, driveId: d.id })
      .returning();
    await audit(c, { action: 'assessment.created', orgId: d.orgId, targetType: 'assessment', targetId: a.id, meta: { mode: 'placement', driveId: d.id } });
    assessmentId = a.id;
  }
  if (d.assessmentId && d.assessmentId !== assessmentId) await db.update(assessments).set({ driveId: null }).where(and(eq(assessments.id, d.assessmentId), eq(assessments.driveId, d.id)));
  await db.update(placementDrives).set({ assessmentId, updatedAt: new Date() }).where(eq(placementDrives.id, d.id));
  await audit(c, { action: 'campus.drive_assessment_linked', orgId: d.orgId, targetType: 'placement_drive', targetId: d.id, meta: { assessmentId } });
  return c.json({ assessmentId }, 201);
});

driveRoutes.delete('/drives/:id/assessment', async (c) => {
  const d = await loadDrive(c, idParam(c));
  requireOrgRole(c, d.orgId, [...PLACEMENT_MANAGERS]);
  if (!d.assessmentId) throw notFound('Linked assessment');
  await db.update(assessments).set({ driveId: null }).where(and(eq(assessments.id, d.assessmentId), eq(assessments.driveId, d.id)));
  await db.update(placementDrives).set({ assessmentId: null, updatedAt: new Date() }).where(eq(placementDrives.id, d.id));
  await audit(c, { action: 'campus.drive_assessment_unlinked', orgId: d.orgId, targetType: 'placement_drive', targetId: d.id, meta: { assessmentId: d.assessmentId } });
  return c.json({ ok: true });
});

driveRoutes.post('/drives/:id/assessment/invite', async (c) => {
  const auth = requireAuth(c);
  const d = await loadDrive(c, idParam(c));
  requireOrgRole(c, d.orgId, [...PLACEMENT_MANAGERS]);
  if (!d.assessmentId) throw conflict('Link a placement assessment first.');
  const input = await body(c, z.object({ candidateIds: z.array(z.string().uuid()).max(2000).optional(), dueAt: isoDate.nullable().optional() }));
  const cands = await db
    .select()
    .from(driveCandidates)
    .where(and(eq(driveCandidates.driveId, d.id), input.candidateIds ? inArray(driveCandidates.id, input.candidateIds) : eq(driveCandidates.stage, 'registered')));
  const eligible = cands.filter((x) => x.stage === 'registered' || x.stage === 'assessment');
  if (!eligible.length) throw conflict('No registered candidates to invite. Candidates must register first.');
  const res = await inviteToAssessment({ assessmentId: d.assessmentId, userIds: eligible.map((x) => x.userId), invitedBy: auth.user.id, dueAt: input.dueAt ?? null });
  let moved = 0;
  for (const x of eligible.filter((e) => e.stage === 'registered')) {
    // inviteToAssessment already notified the candidate.
    await changeStage(c, { drive: d, candidate: x, toStage: 'assessment', note: 'Invited to the placement assessment.', actorId: auth.user.id, actorKind: 'officer', notifyCandidate: false });
    moved++;
  }
  const [a] = await db.select({ status: assessments.status }).from(assessments).where(eq(assessments.id, d.assessmentId));
  await audit(c, { action: 'campus.drive_assessment_invited', orgId: d.orgId, targetType: 'placement_drive', targetId: d.id, meta: { ...res, moved } });
  return c.json({ ...res, moved, skipped: cands.length - eligible.length, warning: a?.status !== 'published' ? 'The assessment is not published yet. Candidates can start it once you publish it.' : null });
});

/** Explicit, human-triggered shortlist by final assessment score. Never rejects anyone. */
driveRoutes.post('/drives/:id/shortlist', async (c) => {
  const auth = requireAuth(c);
  const d = await loadDrive(c, idParam(c));
  if (!d.assessmentId) throw conflict('Link a placement assessment first.');
  const input = await body(c, z.object({ threshold: z.number().min(0).max(100), apply: z.boolean().default(false), toStage: z.enum(['interview', 'offer']).default('interview') }));
  const cands = await db
    .select({ x: driveCandidates, name: users.name, email: users.email })
    .from(driveCandidates)
    .innerJoin(users, eq(users.id, driveCandidates.userId))
    .where(and(eq(driveCandidates.driveId, d.id), eq(driveCandidates.stage, 'assessment')));
  const { summaries } = await assessmentByUser(d, cands.map((r) => r.x.userId));
  const wouldMove: { candidateId: string; name: string; email: string; percent: number }[] = [];
  const below: typeof wouldMove = [];
  const noFinalScore: { candidateId: string; name: string; email: string; status: string }[] = [];
  for (const r of cands) {
    const s = summaries.get(r.x.userId);
    if (!s || !FINAL_SCORE.has(s.status) || s.percent === null) {
      noFinalScore.push({ candidateId: r.x.id, name: r.name, email: r.email, status: s?.status ?? 'not_started' });
      continue;
    }
    (s.percent >= input.threshold ? wouldMove : below).push({ candidateId: r.x.id, name: r.name, email: r.email, percent: s.percent });
  }
  if (input.apply) {
    for (const w of wouldMove) {
      const r = cands.find((x) => x.x.id === w.candidateId)!;
      await changeStage(c, { drive: d, candidate: r.x, toStage: input.toStage, note: `Shortlisted: assessment score ${w.percent}% meets the ${input.threshold}% threshold.`, actorId: auth.user.id, actorKind: 'officer' });
    }
    await audit(c, { action: 'campus.drive_shortlisted', orgId: d.orgId, targetType: 'placement_drive', targetId: d.id, meta: { threshold: input.threshold, toStage: input.toStage, moved: wouldMove.length, below: below.length, noFinalScore: noFinalScore.length } });
  }
  return c.json({
    applied: input.apply,
    threshold: input.threshold,
    toStage: input.toStage,
    wouldMove,
    below,
    noFinalScore,
    note: 'Only candidates in the assessment stage with a final (graded or released) score are considered. Candidates below the threshold or without a final score stay where they are; nobody is rejected automatically.',
  });
});

// ---------- Interviews ----------

function jitsiLink() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return `https://meet.jit.si/LearnSphere-${s}`;
}

const interviewerList = z.array(z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().toLowerCase().email().max(254).nullable().optional().or(z.literal('').transform(() => null)) })).max(10);
const meetingInput = z.discriminatedUnion('provider', [z.object({ provider: z.literal('jitsi') }), z.object({ provider: z.literal('custom'), url: z.string().trim().url('Enter a full meeting link (https://...).').max(500).refine((u) => /^https?:\/\//i.test(u), 'Use an http(s) link.') })]);

driveRoutes.get('/drives/:id/interviews', async (c) => {
  const d = await loadDrive(c, idParam(c));
  const rows = await db
    .select({ iv: interviews, det: campusInterviewDetails, name: users.name, email: users.email, stage: driveCandidates.stage })
    .from(interviews)
    .innerJoin(driveCandidates, eq(driveCandidates.id, interviews.driveCandidateId))
    .innerJoin(users, eq(users.id, interviews.candidateId))
    .leftJoin(campusInterviewDetails, eq(campusInterviewDetails.interviewId, interviews.id))
    .where(and(eq(interviews.orgId, d.orgId), eq(driveCandidates.driveId, d.id)))
    .orderBy(asc(interviews.scheduledAt));
  return c.json({
    items: rows.map((r) => ({ ...r.iv, interviewers: r.det?.interviewers ?? [], notes: r.det?.notes ?? null, outcome: r.det?.outcome ?? null, outcomeNote: r.det?.outcomeNote ?? null, candidate: { id: r.iv.driveCandidateId, name: r.name, email: r.email, stage: r.stage } })),
    total: rows.length,
    jitsiNote: 'Jitsi links work in the browser with no account. On meet.jit.si the first participant may be asked to sign in as moderator to start the meeting.',
  });
});

driveRoutes.post('/drives/:id/interviews', async (c) => {
  const auth = requireAuth(c);
  const d = await loadDrive(c, idParam(c));
  const input = await body(
    c,
    z.object({
      candidateId: z.string().uuid(),
      title: z.string().trim().min(2).max(200).optional(),
      kind: z.enum(['technical', 'behavioral', 'system_design', 'hr', 'panel']).default('technical'),
      scheduledAt: isoDate,
      durationMinutes: z.number().int().min(10).max(480).default(45),
      meeting: meetingInput,
      interviewers: interviewerList.default([]),
      notes: z.string().trim().max(2000).optional(),
    }),
  );
  const x = await loadCandidate(d, input.candidateId);
  if (CLOSED_STAGES.includes(x.stage)) throw conflict(`This candidate is ${STAGE_LABELS[x.stage as CandidateStage].toLowerCase()} and cannot be scheduled.`);
  if (x.stage === 'invited') throw conflict('The candidate has not registered for this drive yet.');
  if (input.scheduledAt.getTime() < Date.now() - 5 * 60_000) throw badRequest('Choose a time in the future.', { fields: { scheduledAt: 'This time has passed.' } });
  const meetingUrl = input.meeting.provider === 'jitsi' ? jitsiLink() : input.meeting.url;
  const [iv] = await db
    .insert(interviews)
    .values({
      orgId: d.orgId,
      driveCandidateId: x.id,
      candidateId: x.userId,
      title: input.title ?? `${d.companyName} ${input.kind.replace('_', ' ')} interview`,
      kind: input.kind,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      meetingUrl,
      meetingProvider: input.meeting.provider,
      createdBy: auth.user.id,
    })
    .returning();
  await db.insert(campusInterviewDetails).values({ interviewId: iv.id, orgId: d.orgId, driveId: d.id, interviewers: input.interviewers.map((i) => ({ name: i.name, email: i.email ?? null })), notes: input.notes ?? null });
  await db.update(driveCandidates).set({ interviewAt: input.scheduledAt }).where(eq(driveCandidates.id, x.id));
  if ((PROGRESS_ORDER[x.stage] ?? 0) < PROGRESS_ORDER.interview) {
    await changeStage(c, { drive: d, candidate: x, toStage: 'interview', note: 'Interview scheduled.', actorId: auth.user.id, actorKind: 'officer', notifyCandidate: false });
  }
  await notify(x.userId, {
    type: 'campus.interview_scheduled',
    category: 'career',
    orgId: d.orgId,
    title: `Interview scheduled: ${d.title}`,
    body: `${iv.title} on ${input.scheduledAt.toUTCString()} (${input.durationMinutes} min). The meeting link is on your Placements page.`,
    link: '/app/placements',
  });
  await audit(c, { action: 'campus.interview_scheduled', orgId: d.orgId, targetType: 'interview', targetId: iv.id, meta: { driveId: d.id, candidateId: x.id, provider: input.meeting.provider } });
  return c.json({ interview: iv }, 201);
});

driveRoutes.patch('/interviews/:id', async (c) => {
  const id = idParam(c);
  const [iv] = await db.select().from(interviews).where(eq(interviews.id, id));
  const [det] = iv ? await db.select().from(campusInterviewDetails).where(eq(campusInterviewDetails.interviewId, id)) : [];
  if (!iv || !det || !iv.driveCandidateId) throw notFound('Interview');
  assertCampusAccess(c, iv.orgId, 'Interview');
  const input = await body(
    c,
    z.object({
      scheduledAt: isoDate.optional(),
      durationMinutes: z.number().int().min(10).max(480).optional(),
      status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
      meeting: meetingInput.optional(),
      interviewers: interviewerList.optional(),
      notes: z.string().trim().max(2000).nullable().optional(),
      outcome: z.enum(['advance', 'hold', 'not_selected']).nullable().optional(),
      outcomeNote: z.string().trim().max(2000).nullable().optional(),
    }),
  );
  const meetingUrl = input.meeting ? (input.meeting.provider === 'jitsi' ? jitsiLink() : input.meeting.url) : undefined;
  const [row] = await db
    .update(interviews)
    .set({
      ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
      ...(input.durationMinutes ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(meetingUrl ? { meetingUrl, meetingProvider: input.meeting!.provider } : {}),
    })
    .where(eq(interviews.id, id))
    .returning();
  await db
    .update(campusInterviewDetails)
    .set({
      ...(input.interviewers ? { interviewers: input.interviewers.map((i) => ({ name: i.name, email: i.email ?? null })) } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
      ...(input.outcomeNote !== undefined ? { outcomeNote: input.outcomeNote } : {}),
      updatedAt: new Date(),
    })
    .where(eq(campusInterviewDetails.interviewId, id));
  if (input.scheduledAt) await db.update(driveCandidates).set({ interviewAt: input.scheduledAt }).where(eq(driveCandidates.id, iv.driveCandidateId));
  const [drive] = await db.select({ title: placementDrives.title }).from(placementDrives).where(eq(placementDrives.id, det.driveId));
  if (input.scheduledAt || input.status === 'cancelled' || meetingUrl) {
    await notify(iv.candidateId, {
      type: 'campus.interview_updated',
      category: 'career',
      orgId: iv.orgId,
      title: input.status === 'cancelled' ? `Interview cancelled: ${drive?.title ?? 'placement drive'}` : `Interview updated: ${drive?.title ?? 'placement drive'}`,
      body: input.status === 'cancelled' ? 'Your placement office will share next steps.' : `Now on ${row.scheduledAt.toUTCString()}. Check your Placements page for the link.`,
      link: '/app/placements',
    });
  }
  await audit(c, { action: 'campus.interview_updated', orgId: iv.orgId, targetType: 'interview', targetId: id, meta: { status: input.status, rescheduled: !!input.scheduledAt, outcome: input.outcome } });
  return c.json({ interview: row });
});

// ---------- Drive report & exports ----------

driveRoutes.get('/drives/:id/report', async (c) => {
  const d = await loadDrive(c, idParam(c));
  const cands = await db.select().from(driveCandidates).where(eq(driveCandidates.driveId, d.id));
  const { funnel } = await driveFunnel(d, cands);
  const steps = (['invited', 'registered', 'assessed', 'interviewed', 'offers', 'placed'] as const).map((k, i, arr) => ({
    key: k,
    count: funnel[k],
    definition: FUNNEL_DEFINITIONS[k],
    fromPrevious: i === 0 || !funnel[arr[i - 1]] ? null : Math.round((funnel[k] / funnel[arr[i - 1]]) * 1000) / 10,
  }));
  const offers = await db
    .select({ name: users.name, stage: driveCandidates.stage, offerCtcText: driveCandidates.offerCtcText })
    .from(driveCandidates)
    .innerJoin(users, eq(users.id, driveCandidates.userId))
    .where(and(eq(driveCandidates.driveId, d.id), inArray(driveCandidates.stage, ['offer', 'placed', 'declined'])));
  return c.json({
    funnel: steps,
    stageCounts: Object.fromEntries(CANDIDATE_STAGES.map((s) => [s, cands.filter((x) => x.stage === s).length])),
    offers: offers.filter((o) => o.stage !== 'declined' || o.offerCtcText).map((o) => ({ ...o, ctcText: o.offerCtcText ?? d.ctcText, ctcNumber: parseCleanNumber(o.offerCtcText ?? d.ctcText) })),
    note: 'Step percentages compare each step with the one before it. They describe this drive only and do not explain why candidates progressed.',
  });
});

driveRoutes.get('/drives/:id/report.csv', async (c) => {
  const d = await loadDrive(c, idParam(c));
  const rows = await db
    .select({ x: driveCandidates, name: users.name, email: users.email, rollNumber: studentRecords.rollNumber })
    .from(driveCandidates)
    .innerJoin(users, eq(users.id, driveCandidates.userId))
    .leftJoin(studentRecords, and(eq(studentRecords.userId, driveCandidates.userId), eq(studentRecords.orgId, d.orgId)))
    .where(eq(driveCandidates.driveId, d.id))
    .orderBy(asc(users.name));
  const { summaries } = await assessmentByUser(d, rows.map((r) => r.x.userId));
  const ivs = rows.length ? await db.select({ cid: interviews.driveCandidateId, status: interviews.status }).from(interviews).where(and(eq(interviews.orgId, d.orgId), inArray(interviews.driveCandidateId, rows.map((r) => r.x.id)))) : [];
  const csv = toCsv(
    ['Student', 'Email', 'Roll number', 'Stage', 'Eligibility at invite', 'Manually included', 'Assessment status', 'Assessment %', 'Interviews', 'Offer CTC (as entered)', 'Last updated (UTC)'],
    rows.map((r) => {
      const snap = readSnapshot(r.x.eligibilitySnapshot);
      const s = summaries.get(r.x.userId);
      return [
        r.name,
        r.email,
        r.rollNumber ?? 'Not recorded',
        STAGE_LABELS[r.x.stage as CandidateStage] ?? r.x.stage,
        snap ? snap.status.replace('_', ' ') : '',
        snap?.manualInclusion ? `Yes: ${snap.manualInclusion.reason}` : 'No',
        s?.status ?? (d.assessmentId ? 'not started' : 'no assessment'),
        s && FINAL_SCORE.has(s.status) ? s.percent : '',
        ivs.filter((i) => i.cid === r.x.id && i.status !== 'cancelled').length,
        r.x.offerCtcText ?? '',
        r.x.updatedAt,
      ];
    }),
    [`Drive outcomes: ${d.title} (${d.companyName})`, `Exported ${new Date().toISOString()}`],
  );
  await audit(c, { action: 'campus.export', orgId: d.orgId, targetType: 'placement_drive', targetId: d.id, meta: { report: 'drive_outcomes', rows: rows.length } });
  return csvResponse(c, `drive-outcomes-${d.title}.csv`, csv);
});

driveRoutes.get('/drives/:id/eligible.csv', async (c) => {
  const d = await loadDrive(c, idParam(c));
  const { items } = await evaluateDrive(d, d.eligibility);
  const csv = toCsv(
    ['Student', 'Email', 'Roll number', 'Record verified', 'Eligibility', 'Reasons (not eligible)', 'Needs data', 'Candidate stage'],
    items.map((i) => [i.name, i.email, i.rollNumber ?? 'No record', i.verified ? 'Yes' : 'No', i.eligible === true ? 'Eligible' : i.eligible === false ? 'Not eligible' : 'Needs data', i.reasons.join(' | '), i.unknown.join(' | '), i.candidateStage ?? '']),
    [`Eligibility list: ${d.title}`, 'Needs data means a rule could not be checked because the data is missing; it is not a judgement.', `Exported ${new Date().toISOString()}`],
  );
  await audit(c, { action: 'campus.export', orgId: d.orgId, targetType: 'placement_drive', targetId: d.id, meta: { report: 'eligible_list', rows: items.length } });
  return csvResponse(c, `eligibility-${d.title}.csv`, csv);
});
