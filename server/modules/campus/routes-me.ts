import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  assessments,
  assessmentInvites,
  campusInterviewDetails,
  driveCandidates,
  driveStageEvents,
  interviews,
  memberships,
  organizations,
  placementDrives,
  programs,
  recordCorrections,
  studentRecords,
} from '../../db/schema';
import { type AppEnv, type Ctx, requireAuth, rolesIn } from '../../lib/context';
import { body, idParam } from '../../lib/validate';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { computeSkillDna, type SkillDnaEntry } from '../learning/skilldna';
import { getOrgPolicies } from '../admin/settings';
import {
  changeStage,
  evaluateEligibility,
  programNameMap,
  RECORD_FIELD_LABELS,
  recordGaps,
  snapshotOf,
  STAGE_LABELS,
  type CandidateStage,
  type DriveRow,
  type RecordRow,
} from './service';
import { CORRECTION_FIELDS, CORRECTION_LABELS } from './routes-students';

/** Student-facing placement endpoints: own record, corrections, eligible/invited drives, register/decline/withdraw. */
export const meRoutes = new Hono<AppEnv>();

function studentOrgIds(c: Ctx) {
  const auth = requireAuth(c);
  return auth.memberships.filter((m) => m.roles.includes('student')).map((m) => m.orgId);
}

function displayValue(r: RecordRow, field: string, programName: string | null) {
  switch (field) {
    case 'program':
      return programName;
    case 'rollNumber':
      return r.rollNumber;
    case 'graduationYear':
      return r.graduationYear === null ? null : String(r.graduationYear);
    case 'cgpa':
      return r.cgpa === null ? null : String(r.cgpa);
    case 'activeBacklogs':
      return r.activeBacklogs === null ? null : String(r.activeBacklogs);
    case 'attendancePercent':
      return r.attendancePercent === null ? null : `${r.attendancePercent}%`;
    default:
      return null;
  }
}

// ---------- Own record ----------

meRoutes.get('/me/record', async (c) => {
  const auth = requireAuth(c);
  const rows = await db
    .select({ r: studentRecords, orgName: organizations.name, programName: programs.name, programCode: programs.code })
    .from(studentRecords)
    .innerJoin(organizations, eq(organizations.id, studentRecords.orgId))
    .leftJoin(programs, eq(programs.id, studentRecords.programId))
    .where(eq(studentRecords.userId, auth.user.id));
  const corrections = rows.length
    ? await db.select().from(recordCorrections).where(and(inArray(recordCorrections.recordId, rows.map((r) => r.r.id)), eq(recordCorrections.requestedBy, auth.user.id))).orderBy(desc(recordCorrections.createdAt))
    : [];
  return c.json({
    records: rows.map(({ r, orgName, programName, programCode }) => ({
      id: r.id,
      orgId: r.orgId,
      orgName,
      rollNumber: r.rollNumber,
      programName,
      programCode,
      graduationYear: r.graduationYear,
      cgpa: r.cgpa,
      activeBacklogs: r.activeBacklogs,
      attendancePercent: r.attendancePercent,
      status: r.status,
      placementOptIn: r.placementOptIn,
      verified: !!r.verifiedAt,
      verifiedAt: r.verifiedAt,
      updatedAt: r.updatedAt,
      gaps: recordGaps(r),
      corrections: corrections.filter((x) => x.recordId === r.id).map((x) => ({ id: x.id, field: x.field, fieldLabel: CORRECTION_LABELS[x.field as keyof typeof CORRECTION_LABELS] ?? x.field, currentValue: x.currentValue, proposedValue: x.proposedValue, reason: x.reason, status: x.status, reviewNote: x.reviewNote, createdAt: x.createdAt, reviewedAt: x.reviewedAt })),
    })),
    correctionFields: CORRECTION_FIELDS.map((f) => ({ value: f, label: CORRECTION_LABELS[f] })),
    fieldLabels: RECORD_FIELD_LABELS,
    hasStudentMembership: studentOrgIds(c).length > 0,
  });
});

meRoutes.post('/me/record/corrections', async (c) => {
  const auth = requireAuth(c);
  const input = await body(
    c,
    z.object({
      recordId: z.string().uuid().optional(),
      field: z.enum(CORRECTION_FIELDS),
      proposedValue: z.string().trim().min(1, 'Enter the correct value.').max(200),
      reason: z.string().trim().min(10, 'Explain the correction (at least 10 characters), for example where the right value comes from.').max(1000),
    }),
  );
  // Only the caller's own records (others get 404).
  const mine = await db.select().from(studentRecords).where(and(eq(studentRecords.userId, auth.user.id), input.recordId ? eq(studentRecords.id, input.recordId) : undefined));
  if (!mine.length) throw notFound('Student record');
  if (mine.length > 1) throw badRequest('Choose which institution record to correct.', { fields: { recordId: 'Pick a record.' } });
  const rec = mine[0];
  const [open] = await db.select({ id: recordCorrections.id }).from(recordCorrections).where(and(eq(recordCorrections.recordId, rec.id), eq(recordCorrections.field, input.field), eq(recordCorrections.status, 'open')));
  if (open) throw conflict('You already have an open request for this field. Wait for the review first.');
  const programName = rec.programId ? ((await db.select({ name: programs.name }).from(programs).where(eq(programs.id, rec.programId)))[0]?.name ?? null) : null;
  const [row] = await db
    .insert(recordCorrections)
    .values({ orgId: rec.orgId, recordId: rec.id, requestedBy: auth.user.id, field: input.field, currentValue: displayValue(rec, input.field, programName), proposedValue: input.proposedValue, reason: input.reason })
    .returning();
  await audit(c, { action: 'campus.correction_requested', orgId: rec.orgId, targetType: 'student_record', targetId: rec.id, meta: { correctionId: row.id, field: input.field } });
  const officers = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, rec.orgId), eq(memberships.status, 'active'), sql`'placement_officer' = any(${memberships.roles})`));
  for (const o of officers) {
    await notify(o.userId, { type: 'campus.correction_requested', category: 'organization', orgId: rec.orgId, title: 'New record correction request', body: `${auth.user.name} asked to correct ${CORRECTION_LABELS[input.field]}.`, link: '/app/campus/students?tab=corrections', email: false });
  }
  return c.json({ correction: row }, 201);
});

meRoutes.post('/me/record/:id/opt-in', async (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  const { placementOptIn } = await body(c, z.object({ placementOptIn: z.boolean() }));
  const [row] = await db
    .update(studentRecords)
    .set({ placementOptIn, updatedAt: new Date() })
    .where(and(eq(studentRecords.id, id), eq(studentRecords.userId, auth.user.id)))
    .returning();
  if (!row) throw notFound('Student record');
  await audit(c, { action: 'campus.placement_opt_in_changed', orgId: row.orgId, targetType: 'student_record', targetId: row.id, meta: { placementOptIn } });
  return c.json({ placementOptIn: row.placementOptIn });
});

// ---------- Drives for me ----------

function publicDrive(d: DriveRow, orgName: string) {
  return {
    id: d.id,
    orgId: d.orgId,
    orgName,
    title: d.title,
    companyName: d.companyName,
    roleTitle: d.roleTitle,
    description: d.description,
    ctcText: d.ctcText,
    location: d.location,
    registrationDeadline: d.registrationDeadline,
    status: d.status,
    stages: d.stages,
    eligibility: d.eligibility,
  };
}

function deadlinePassed(d: DriveRow) {
  return !!d.registrationDeadline && d.registrationDeadline.getTime() < Date.now();
}

function actionsFor(d: DriveRow, stage: string | null, eligible: true | false | 'unknown') {
  const open = d.status === 'open';
  const past = deadlinePassed(d);
  let registerBlockedReason: string | null = null;
  if (!open) registerBlockedReason = 'Registration is closed for this drive.';
  else if (past) registerBlockedReason = 'The registration deadline has passed.';
  else if (!stage && eligible !== true) registerBlockedReason = eligible === 'unknown' ? 'Your record is missing data this drive needs.' : 'You do not meet the eligibility rules.';
  return {
    canRegister: !registerBlockedReason && (stage === null || stage === 'invited'),
    registerBlockedReason: stage && stage !== 'invited' ? null : registerBlockedReason,
    canDecline: (d.status === 'open' || d.status === 'in_progress') && (stage === 'invited' || stage === 'offer'),
    canWithdraw: (d.status === 'open' || d.status === 'in_progress') && (stage === 'registered' || stage === 'assessment' || stage === 'interview'),
  };
}

meRoutes.get('/me/drives', async (c) => {
  const auth = requireAuth(c);
  const orgIds = studentOrgIds(c);
  if (!orgIds.length) return c.json({ drives: [], needsDataCount: 0, hasStudentMembership: false });
  const [drives, myCands, records, orgs] = await Promise.all([
    db.select().from(placementDrives).where(and(inArray(placementDrives.orgId, orgIds), inArray(placementDrives.status, ['open', 'in_progress', 'completed', 'cancelled']))).orderBy(desc(placementDrives.createdAt)),
    db.select().from(driveCandidates).where(eq(driveCandidates.userId, auth.user.id)),
    db.select().from(studentRecords).where(and(eq(studentRecords.userId, auth.user.id), inArray(studentRecords.orgId, orgIds))),
    db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.id, orgIds)),
  ]);
  const candByDrive = new Map(myCands.map((x) => [x.driveId, x]));
  const recByOrg = new Map(records.map((r) => [r.orgId, r]));
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const needsSkills = drives.some((d) => (d.eligibility.requiredSkillSlugs ?? []).length);
  const dna = needsSkills ? new Map((await computeSkillDna(auth.user.id)).map((s) => [s.slug, s] as [string, SkillDnaEntry])) : new Map<string, SkillDnaEntry>();
  const policies = new Map<string, boolean>();
  const progNames = new Map<string, Map<string, string>>();
  for (const o of orgIds) {
    policies.set(o, (await getOrgPolicies(o)).requireVerifiedRecordForPlacement);
    progNames.set(o, await programNameMap(o));
  }

  let needsDataCount = 0;
  const visible: { d: DriveRow; cand: (typeof myCands)[number] | null; elig: ReturnType<typeof evaluateEligibility> }[] = [];
  for (const d of drives) {
    const cand = candByDrive.get(d.id) ?? null;
    const elig = evaluateEligibility({ record: recByOrg.get(d.orgId) ?? null, rules: d.eligibility, requireVerifiedByPolicy: policies.get(d.orgId) ?? false, programNames: progNames.get(d.orgId), skillsBySlug: dna });
    // Students see drives they are a candidate in, or open drives they are eligible for.
    if (cand) visible.push({ d, cand, elig });
    else if (d.status === 'open' && elig.eligible === true) visible.push({ d, cand: null, elig });
    else if (d.status === 'open' && elig.eligible === 'unknown') needsDataCount++;
  }

  const candIds = visible.filter((v) => v.cand).map((v) => v.cand!.id);
  const [events, ivs, invites] = await Promise.all([
    candIds.length ? db.select({ candidateId: driveStageEvents.candidateId, toStage: driveStageEvents.toStage, fromStage: driveStageEvents.fromStage, createdAt: driveStageEvents.createdAt }).from(driveStageEvents).where(inArray(driveStageEvents.candidateId, candIds)).orderBy(asc(driveStageEvents.createdAt)) : Promise.resolve([]),
    candIds.length
      ? db
          .select({ iv: interviews, interviewers: campusInterviewDetails.interviewers })
          .from(interviews)
          .leftJoin(campusInterviewDetails, eq(campusInterviewDetails.interviewId, interviews.id))
          .where(and(eq(interviews.candidateId, auth.user.id), inArray(interviews.driveCandidateId, candIds)))
          .orderBy(asc(interviews.scheduledAt))
      : Promise.resolve([]),
    db
      .select({ assessmentId: assessmentInvites.assessmentId, title: assessments.title, status: assessmentInvites.status, assessmentStatus: assessments.status, driveId: assessments.driveId })
      .from(assessmentInvites)
      .innerJoin(assessments, eq(assessments.id, assessmentInvites.assessmentId))
      .where(and(eq(assessmentInvites.userId, auth.user.id), eq(assessments.mode, 'placement'))),
  ]);

  return c.json({
    drives: visible.map(({ d, cand, elig }) => {
      const invite = d.assessmentId ? invites.find((i) => i.assessmentId === d.assessmentId && i.status !== 'revoked') : undefined;
      return {
        drive: publicDrive(d, orgName.get(d.orgId) ?? ''),
        eligibility: elig,
        candidate: cand
          ? {
              id: cand.id,
              stage: cand.stage,
              stageLabel: STAGE_LABELS[cand.stage as CandidateStage] ?? cand.stage,
              offerCtcText: cand.offerCtcText,
              updatedAt: cand.updatedAt,
              timeline: events.filter((e) => e.candidateId === cand.id).map((e) => ({ fromStage: e.fromStage, toStage: e.toStage, label: STAGE_LABELS[e.toStage as CandidateStage] ?? e.toStage, at: e.createdAt })),
              interviews: ivs
                .filter((i) => i.iv.driveCandidateId === cand.id && i.iv.status !== 'cancelled')
                .map((i) => ({ id: i.iv.id, title: i.iv.title, kind: i.iv.kind, scheduledAt: i.iv.scheduledAt, durationMinutes: i.iv.durationMinutes, meetingUrl: i.iv.meetingUrl, meetingProvider: i.iv.meetingProvider, status: i.iv.status, interviewers: (i.interviewers ?? []).map((p) => p.name) })),
            }
          : null,
        assessment: invite ? { id: invite.assessmentId, title: invite.title, inviteStatus: invite.status, published: invite.assessmentStatus === 'published' } : null,
        actions: actionsFor(d, cand?.stage ?? null, elig.eligible),
      };
    }),
    needsDataCount,
    hasStudentMembership: true,
  });
});

async function loadMyDrive(c: Ctx, id: string) {
  const auth = requireAuth(c);
  const [d] = await db.select().from(placementDrives).where(eq(placementDrives.id, id));
  if (!d || !rolesIn(auth, d.orgId).includes('student') || d.status === 'draft') throw notFound('Drive');
  const [cand] = await db.select().from(driveCandidates).where(and(eq(driveCandidates.driveId, d.id), eq(driveCandidates.userId, auth.user.id)));
  return { auth, d, cand: cand ?? null };
}

meRoutes.post('/me/drives/:id/register', async (c) => {
  const { auth, d, cand } = await loadMyDrive(c, idParam(c));
  if (d.status !== 'open') throw conflict('Registration is closed for this drive.');
  if (deadlinePassed(d)) throw conflict('The registration deadline has passed.');
  if (cand && cand.stage !== 'invited') throw conflict(`You are already ${STAGE_LABELS[cand.stage as CandidateStage]?.toLowerCase() ?? cand.stage} in this drive.`);
  if (cand) {
    const row = await changeStage(c, { drive: d, candidate: cand, toStage: 'registered', actorId: auth.user.id, actorKind: 'student' });
    await audit(c, { action: 'campus.candidate_registered', orgId: d.orgId, targetType: 'drive_candidate', targetId: cand.id, meta: { driveId: d.id } });
    return c.json({ candidate: { id: row.id, stage: row.stage } });
  }
  // Self-registration: only students the rules confirm as eligible (never on unknown data).
  const [rec] = await db.select().from(studentRecords).where(and(eq(studentRecords.orgId, d.orgId), eq(studentRecords.userId, auth.user.id)));
  const slugs = d.eligibility.requiredSkillSlugs ?? [];
  const dna = slugs.length ? new Map((await computeSkillDna(auth.user.id)).filter((s) => slugs.includes(s.slug)).map((s) => [s.slug, s] as [string, SkillDnaEntry])) : undefined;
  const elig = evaluateEligibility({ record: rec ?? null, rules: d.eligibility, requireVerifiedByPolicy: (await getOrgPolicies(d.orgId)).requireVerifiedRecordForPlacement, programNames: await programNameMap(d.orgId), skillsBySlug: dna });
  if (elig.eligible === 'unknown') throw conflict(`Your record is missing data this drive needs (${elig.unknown.join(', ')}). Request a correction from your Placements record page or contact the placement office.`);
  if (elig.eligible === false) throw conflict(`You do not meet this drive's rules: ${elig.reasons.join(' ')}`);
  const [row] = await db.insert(driveCandidates).values({ driveId: d.id, userId: auth.user.id, stage: 'registered', eligibilitySnapshot: snapshotOf(elig), updatedBy: auth.user.id }).onConflictDoNothing().returning();
  if (!row) throw conflict('You are already part of this drive.');
  await db.insert(driveStageEvents).values({ orgId: d.orgId, driveId: d.id, candidateId: row.id, userId: auth.user.id, fromStage: null, toStage: 'registered', note: 'Self-registered (eligible).', actorId: auth.user.id, actorKind: 'student' });
  await audit(c, { action: 'campus.candidate_registered', orgId: d.orgId, targetType: 'drive_candidate', targetId: row.id, meta: { driveId: d.id, selfRegistered: true } });
  return c.json({ candidate: { id: row.id, stage: row.stage } }, 201);
});

meRoutes.post('/me/drives/:id/decline', async (c) => {
  const { auth, d, cand } = await loadMyDrive(c, idParam(c));
  if (!cand) throw notFound('Invitation');
  if (cand.stage !== 'invited' && cand.stage !== 'offer') throw conflict('You can decline an invitation or an offer only.');
  if (d.status !== 'open' && d.status !== 'in_progress') throw conflict('This drive is closed.');
  const { reason } = await body(c, z.object({ reason: z.string().trim().max(500).optional() }));
  const row = await changeStage(c, { drive: d, candidate: cand, toStage: 'declined', note: reason ? `Student: ${reason}` : null, actorId: auth.user.id, actorKind: 'student' });
  await audit(c, { action: 'campus.candidate_declined', orgId: d.orgId, targetType: 'drive_candidate', targetId: cand.id, meta: { driveId: d.id, from: cand.stage } });
  return c.json({ candidate: { id: row.id, stage: row.stage } });
});

meRoutes.post('/me/drives/:id/withdraw', async (c) => {
  const { auth, d, cand } = await loadMyDrive(c, idParam(c));
  if (!cand) throw notFound('Registration');
  if (!['registered', 'assessment', 'interview'].includes(cand.stage)) throw conflict('You can withdraw only while your application is in progress.');
  if (d.status !== 'open' && d.status !== 'in_progress') throw conflict('This drive is closed.');
  const { reason } = await body(c, z.object({ reason: z.string().trim().max(500).optional() }));
  const row = await changeStage(c, { drive: d, candidate: cand, toStage: 'withdrawn', note: reason ? `Student: ${reason}` : null, actorId: auth.user.id, actorKind: 'student' });
  await audit(c, { action: 'campus.candidate_withdrew', orgId: d.orgId, targetType: 'drive_candidate', targetId: cand.id, meta: { driveId: d.id, from: cand.stage } });
  return c.json({ candidate: { id: row.id, stage: row.stage } });
});
