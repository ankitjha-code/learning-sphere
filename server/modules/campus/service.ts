/**
 * Campus (college & placement) domain logic shared by the HTTP routes, jobs and seed.
 *
 * Honesty rules implemented here:
 *  - Eligibility is three-valued. A rule whose data is missing yields 'unknown' ("Needs data"),
 *    never ineligible. Only known data can make a student ineligible.
 *  - Unverified records count as unknown when the drive or the institution's policy requires
 *    verification ("Record not yet verified").
 *  - Required skills are judged from Skill DNA states: verified / demonstrated count as met;
 *    no evidence or only self-reported evidence is unknown; evidence below the demonstrated
 *    threshold (learning / needs revision) is not met.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  organizations,
  memberships,
  studentRecords,
  programs,
  skills,
  placementDrives,
  driveCandidates,
  driveStageEvents,
  interviews,
  type EligibilityRules,
} from '../../db/schema';
import { type Ctx, requireAuth, requireActiveOrg, requireOrgRole, rolesIn } from '../../lib/context';
import { badRequest, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { computeSkillDna, type SkillDnaEntry, type SkillState } from '../learning/skilldna';
import { attemptSummaries, type AttemptSummary } from '../assessments/service';
import type { OrgRole } from '@shared/roles';

// ---------- Roles & access ----------

/** Roles that manage campus data (structure, records, employers, drives) in a college. */
export const CAMPUS_ROLES: OrgRole[] = ['placement_officer', 'org_admin', 'faculty_admin'];

export function requireCampus(c: Ctx) {
  return requireActiveOrg(c, CAMPUS_ROLES);
}

/**
 * For records loaded by id: people with no membership in the record's org get 404
 * (existence is not leaked); members without a campus role get 403.
 */
export function assertCampusAccess(c: Ctx, orgId: string, what: string) {
  const auth = requireAuth(c);
  if (!rolesIn(auth, orgId).length) throw notFound(what);
  requireOrgRole(c, orgId, CAMPUS_ROLES);
}

// ---------- Settings ----------

export type CampusSettings = { placementOptInDefault: boolean; eligibilityDefaults: EligibilityRules };
export const CAMPUS_SETTINGS_DEFAULTS: CampusSettings = { placementOptInDefault: true, eligibilityDefaults: { requireVerifiedRecord: false } };

export function readCampusSettings(settings: Record<string, unknown> | null | undefined): CampusSettings {
  const raw = (settings?.campus ?? {}) as Partial<CampusSettings>;
  return {
    placementOptInDefault: typeof raw.placementOptInDefault === 'boolean' ? raw.placementOptInDefault : CAMPUS_SETTINGS_DEFAULTS.placementOptInDefault,
    eligibilityDefaults: raw.eligibilityDefaults && typeof raw.eligibilityDefaults === 'object' ? raw.eligibilityDefaults : CAMPUS_SETTINGS_DEFAULTS.eligibilityDefaults,
  };
}

export async function getCampusSettings(orgId: string): Promise<CampusSettings> {
  const [o] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId));
  return readCampusSettings(o?.settings);
}

// ---------- Records: data gaps ----------

export type RecordRow = typeof studentRecords.$inferSelect;

export const RECORD_FIELD_LABELS: Record<string, string> = {
  rollNumber: 'Roll number',
  programId: 'Program',
  graduationYear: 'Graduation year',
  cgpa: 'CGPA',
  activeBacklogs: 'Active backlogs',
  attendancePercent: 'Attendance',
};

/**
 * Core placement fields with no value. These show as "Needs data", never as zero.
 * Attendance is recorded by Teach and is not counted as a gap (many programs do not track it).
 */
export function recordGaps(r: Pick<RecordRow, 'programId' | 'graduationYear' | 'cgpa' | 'activeBacklogs'>): string[] {
  const gaps: string[] = [];
  if (!r.programId) gaps.push('programId');
  if (r.graduationYear === null || r.graduationYear === undefined) gaps.push('graduationYear');
  if (r.cgpa === null || r.cgpa === undefined) gaps.push('cgpa');
  if (r.activeBacklogs === null || r.activeBacklogs === undefined) gaps.push('activeBacklogs');
  return gaps;
}

/** SQL condition: the record has at least one core gap. */
export const GAPS_SQL = sql`(${studentRecords.programId} is null or ${studentRecords.graduationYear} is null or ${studentRecords.cgpa} is null or ${studentRecords.activeBacklogs} is null)`;

// ---------- Eligibility ----------

export type Tri = true | false | 'unknown';
export type RuleStatus = 'met' | 'not_met' | 'unknown';
export type SkillEvidenceSummary = { slug: string; name: string; state: SkillState | 'unknown_skill'; verified: boolean; evidenceCount: number; lastEvidenceAt: string | null; sources: string[] };
export type RuleCheck = { key: string; label: string; status: RuleStatus; detail: string; skill?: SkillEvidenceSummary };
export type Eligibility = { eligible: Tri; reasons: string[]; unknown: string[]; checks: RuleCheck[] };

/** Stored on drive_candidates.eligibilitySnapshot (superset of the column's declared type). */
export type EligibilitySnapshot = {
  eligible: boolean; // true only when every rule was met with known data
  status: 'eligible' | 'not_eligible' | 'needs_data';
  reasons: string[];
  unknown: string[];
  evaluatedAt: string;
  manualInclusion?: { reason: string; by: string; at: string };
};

export function snapshotOf(e: Eligibility, manual?: EligibilitySnapshot['manualInclusion']) {
  const snap: EligibilitySnapshot = {
    eligible: e.eligible === true,
    status: e.eligible === true ? 'eligible' : e.eligible === false ? 'not_eligible' : 'needs_data',
    reasons: e.reasons,
    unknown: e.unknown,
    evaluatedAt: new Date().toISOString(),
    ...(manual ? { manualInclusion: manual } : {}),
  };
  return snap as unknown as { eligible: boolean; reasons: string[]; unknown: string[] };
}

export function readSnapshot(v: unknown): EligibilitySnapshot | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Partial<EligibilitySnapshot>;
  const status = s.status ?? (s.eligible ? 'eligible' : (s.unknown?.length ?? 0) > 0 ? 'needs_data' : 'not_eligible');
  return { eligible: !!s.eligible, status, reasons: s.reasons ?? [], unknown: s.unknown ?? [], evaluatedAt: s.evaluatedAt ?? '', manualInclusion: s.manualInclusion };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));

/**
 * Pure evaluation of one student against drive rules. `skillsBySlug` holds the student's Skill DNA
 * entries for the required skills (missing entry = skill unknown to the platform).
 */
export function evaluateEligibility(p: {
  record: RecordRow | null;
  rules: EligibilityRules;
  requireVerifiedByPolicy: boolean;
  programNames?: Map<string, string>;
  skillsBySlug?: Map<string, SkillDnaEntry>;
}): Eligibility {
  const { record, rules } = p;
  const checks: RuleCheck[] = [];
  const add = (key: string, label: string, status: RuleStatus, detail: string, skill?: SkillEvidenceSummary) => checks.push({ key, label, status, detail, ...(skill ? { skill } : {}) });

  if (!record) {
    add('record', 'Student record', 'unknown', 'No academic record in this institution yet.');
  } else {
    if (!record.placementOptIn) add('optIn', 'Placement opt-in', 'not_met', 'Opted out of campus placements.');
    if (record.status === 'withdrawn') add('status', 'Enrollment status', 'not_met', 'Not currently enrolled (withdrawn).');

    if (rules.requireVerifiedRecord || p.requireVerifiedByPolicy) {
      const why = rules.requireVerifiedRecord ? 'This drive requires a verified record.' : 'Institution policy requires a verified record for placement.';
      add('verified', 'Verified record', record.verifiedAt ? 'met' : 'unknown', record.verifiedAt ? 'Record verified.' : `Record not yet verified. ${why}`);
    }

    if (rules.programIds?.length) {
      const names = rules.programIds.map((id) => p.programNames?.get(id) ?? 'program').join(', ');
      if (!record.programId) add('programId', 'Program', 'unknown', `Program not recorded (needs one of: ${names}).`);
      else if (rules.programIds.includes(record.programId)) add('programId', 'Program', 'met', `${p.programNames?.get(record.programId) ?? 'Program'} is allowed.`);
      else add('programId', 'Program', 'not_met', `${p.programNames?.get(record.programId) ?? 'This program'} is not one of: ${names}.`);
    }
    if (rules.graduationYears?.length) {
      const ys = rules.graduationYears.join(', ');
      if (record.graduationYear === null) add('graduationYear', 'Graduation year', 'unknown', `Graduation year not recorded (needs ${ys}).`);
      else if (rules.graduationYears.includes(record.graduationYear)) add('graduationYear', 'Graduation year', 'met', `Graduates in ${record.graduationYear}.`);
      else add('graduationYear', 'Graduation year', 'not_met', `Graduates in ${record.graduationYear}; drive is for ${ys}.`);
    }
    if (rules.minCgpa !== null && rules.minCgpa !== undefined) {
      if (record.cgpa === null) add('cgpa', 'CGPA', 'unknown', `CGPA not recorded (needs at least ${fmt(rules.minCgpa)}).`);
      else if (record.cgpa >= rules.minCgpa) add('cgpa', 'CGPA', 'met', `CGPA ${fmt(record.cgpa)} meets ${fmt(rules.minCgpa)}.`);
      else add('cgpa', 'CGPA', 'not_met', `CGPA ${fmt(record.cgpa)} is below ${fmt(rules.minCgpa)}.`);
    }
    if (rules.maxActiveBacklogs !== null && rules.maxActiveBacklogs !== undefined) {
      if (record.activeBacklogs === null) add('activeBacklogs', 'Active backlogs', 'unknown', `Active backlogs not recorded (allowed: ${rules.maxActiveBacklogs}).`);
      else if (record.activeBacklogs <= rules.maxActiveBacklogs) add('activeBacklogs', 'Active backlogs', 'met', `${record.activeBacklogs} active backlogs (allowed: ${rules.maxActiveBacklogs}).`);
      else add('activeBacklogs', 'Active backlogs', 'not_met', `${record.activeBacklogs} active backlogs; at most ${rules.maxActiveBacklogs} allowed.`);
    }
    if (rules.minAttendance !== null && rules.minAttendance !== undefined) {
      if (record.attendancePercent === null) add('attendancePercent', 'Attendance', 'unknown', `Attendance not recorded (needs ${fmt(rules.minAttendance)}%).`);
      else if (record.attendancePercent >= rules.minAttendance) add('attendancePercent', 'Attendance', 'met', `Attendance ${fmt(record.attendancePercent)}% meets ${fmt(rules.minAttendance)}%.`);
      else add('attendancePercent', 'Attendance', 'not_met', `Attendance ${fmt(record.attendancePercent)}% is below ${fmt(rules.minAttendance)}%.`);
    }
  }

  for (const slug of rules.requiredSkillSlugs ?? []) {
    const s = p.skillsBySlug?.get(slug);
    if (!s) {
      add(`skill:${slug}`, `Skill: ${slug}`, 'unknown', `No Skill DNA data for "${slug}".`, { slug, name: slug, state: 'unknown_skill', verified: false, evidenceCount: 0, lastEvidenceAt: null, sources: [] });
      continue;
    }
    const summary: SkillEvidenceSummary = { slug, name: s.name, state: s.state, verified: s.verified, evidenceCount: s.evidenceCount, lastEvidenceAt: s.lastEvidenceAt, sources: Object.keys(s.bySource) };
    const label = `Skill: ${s.name}`;
    if (s.state === 'verified') add(`skill:${slug}`, label, 'met', `${s.name} verified (${s.evidenceCount} evidence).`, summary);
    else if (s.state === 'demonstrated') add(`skill:${slug}`, label, 'met', `${s.name} demonstrated (${s.evidenceCount} evidence).`, summary);
    else if (s.state === 'not_started') add(`skill:${slug}`, label, 'unknown', `No evidence for ${s.name} yet.`, summary);
    else if (s.state === 'self_declared') add(`skill:${slug}`, label, 'unknown', `${s.name} is only self-reported so far.`, summary);
    else if (s.state === 'needs_revision') add(`skill:${slug}`, label, 'not_met', `${s.name} evidence is out of date (needs revision).`, summary);
    else add(`skill:${slug}`, label, 'not_met', `${s.name} is still being learned (not yet demonstrated).`, summary);
  }

  const reasons = checks.filter((c) => c.status === 'not_met').map((c) => c.detail);
  const unknown = checks.filter((c) => c.status === 'unknown').map((c) => c.label);
  const eligible: Tri = reasons.length ? false : unknown.length ? 'unknown' : true;
  return { eligible, reasons, unknown, checks };
}

/** Skill DNA entries for the given users restricted to some skills (computed with the Skill DNA engine). */
export async function skillStatesFor(userIds: string[], slugs: string[]): Promise<Map<string, Map<string, SkillDnaEntry>>> {
  const out = new Map<string, Map<string, SkillDnaEntry>>();
  if (!slugs.length || !userIds.length) return out;
  const wanted = new Set(slugs);
  for (const uid of [...new Set(userIds)]) {
    const dna = await computeSkillDna(uid);
    out.set(uid, new Map(dna.filter((d) => wanted.has(d.slug)).map((d) => [d.slug, d])));
  }
  return out;
}

export async function unknownSkillSlugs(slugs: string[]): Promise<string[]> {
  if (!slugs.length) return [];
  const rows = await db.select({ slug: skills.slug }).from(skills).where(inArray(skills.slug, slugs));
  const found = new Set(rows.map((r) => r.slug));
  return slugs.filter((s) => !found.has(s));
}

export async function assertCompanyOrg(companyOrgId: string | null | undefined) {
  if (!companyOrgId) return;
  const [o] = await db.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, companyOrgId), eq(organizations.kind, 'company'), eq(organizations.status, 'active')));
  if (!o) throw badRequest('That company is not on the platform.', { fields: { companyOrgId: 'Pick a company from the search results.' } });
}

export async function programNameMap(orgId: string) {
  const rows = await db.select({ id: programs.id, name: programs.name }).from(programs).where(eq(programs.orgId, orgId));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Student user ids of an organization (active members holding the student role). */
export async function orgStudentIds(orgId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, 'active'), sql`'student' = any(${memberships.roles})`));
  return rows.map((r) => r.userId);
}

/** Evaluates many students of an org against a drive's rules. */
export async function evaluateStudents(orgId: string, rules: EligibilityRules, userIds: string[], requireVerifiedByPolicy: boolean) {
  const [records, names, skillMap] = await Promise.all([
    userIds.length ? db.select().from(studentRecords).where(and(eq(studentRecords.orgId, orgId), inArray(studentRecords.userId, userIds))) : Promise.resolve([] as RecordRow[]),
    programNameMap(orgId),
    skillStatesFor(userIds, rules.requiredSkillSlugs ?? []),
  ]);
  const byUser = new Map(records.map((r) => [r.userId, r]));
  return new Map(
    userIds.map((uid) => [uid, { record: byUser.get(uid) ?? null, result: evaluateEligibility({ record: byUser.get(uid) ?? null, rules, requireVerifiedByPolicy, programNames: names, skillsBySlug: skillMap.get(uid) }) }]),
  );
}

// ---------- Candidate stages ----------

export const CANDIDATE_STAGES = ['invited', 'registered', 'assessment', 'interview', 'offer', 'placed', 'rejected', 'withdrawn', 'declined'] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];
export const PROGRESS_ORDER: Record<string, number> = { invited: 0, registered: 1, assessment: 2, interview: 3, offer: 4, placed: 5 };
export const CLOSED_STAGES = ['placed', 'rejected', 'withdrawn', 'declined'];
export const STAGE_LABELS: Record<CandidateStage, string> = {
  invited: 'Invited',
  registered: 'Registered',
  assessment: 'Assessment',
  interview: 'Interview',
  offer: 'Offer',
  placed: 'Placed',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
  declined: 'Declined',
};

export type DriveRow = typeof placementDrives.$inferSelect;
export type CandidateRow = typeof driveCandidates.$inferSelect;

const STUDENT_MESSAGES: Partial<Record<CandidateStage, string>> = {
  invited: 'You are invited to register. Check the eligibility details and register before the deadline.',
  registered: 'You are registered for this drive.',
  assessment: 'You moved to the assessment stage.',
  interview: 'You moved to the interview stage.',
  offer: 'You received an offer. Your placement office will share the next steps.',
  placed: 'Your placement is recorded. Congratulations.',
  rejected: 'You were not selected to continue in this drive.',
  withdrawn: 'You are withdrawn from this drive.',
  declined: 'Your decision to decline is recorded.',
};

/**
 * Moves one candidate to a stage: updates the row, appends history, audits (officer actions)
 * and notifies the candidate (unless they made the change themselves).
 */
export async function changeStage(
  c: Ctx | null,
  p: { drive: DriveRow; candidate: CandidateRow; toStage: CandidateStage; note?: string | null; actorId: string | null; actorKind: 'officer' | 'student' | 'system'; offerCtcText?: string | null; notifyCandidate?: boolean },
) {
  const fromStage = p.candidate.stage;
  const [row] = await db
    .update(driveCandidates)
    .set({
      stage: p.toStage,
      updatedBy: p.actorId,
      updatedAt: new Date(),
      ...(p.offerCtcText !== undefined ? { offerCtcText: p.offerCtcText } : {}),
    })
    .where(eq(driveCandidates.id, p.candidate.id))
    .returning();
  if (fromStage !== p.toStage || p.note) {
    await db.insert(driveStageEvents).values({
      orgId: p.drive.orgId,
      driveId: p.drive.id,
      candidateId: p.candidate.id,
      userId: p.candidate.userId,
      fromStage,
      toStage: p.toStage,
      note: p.note ?? null,
      actorId: p.actorId,
      actorKind: p.actorKind,
    });
  }
  if (c && p.actorKind === 'officer' && fromStage !== p.toStage) {
    await audit(c, { action: 'campus.candidate_stage_changed', orgId: p.drive.orgId, targetType: 'drive_candidate', targetId: p.candidate.id, meta: { driveId: p.drive.id, userId: p.candidate.userId, from: fromStage, to: p.toStage } });
  }
  if (p.notifyCandidate !== false && p.actorKind !== 'student' && fromStage !== p.toStage) {
    await notify(p.candidate.userId, {
      type: 'campus.drive_stage',
      category: 'career',
      orgId: p.drive.orgId,
      title: `${p.drive.title}: ${STAGE_LABELS[p.toStage]}`,
      body: STUDENT_MESSAGES[p.toStage],
      link: '/app/placements',
    });
  }
  return row;
}

// ---------- Funnel ----------

export const FUNNEL_DEFINITIONS = {
  invited: 'Candidates added to the drive (invited by the placement office, self-registered eligible students, or manually included).',
  registered: 'Candidates who registered at any point (current or past stage history shows registered or later).',
  assessed: 'Candidates with a submitted attempt on the drive assessment (any grading status). Zero when no assessment is linked.',
  interviewed: 'Candidates with at least one interview that is scheduled or completed. Cancelled interviews and no-shows are excluded.',
  offers: 'Candidates who reached the offer stage at any point, including those who later declined.',
  placed: 'Candidates whose current stage is placed.',
} as const;

const SUBMITTED = new Set(['submitted', 'grading', 'needs_review', 'graded', 'released']);

export type Funnel = { invited: number; registered: number; assessed: number; interviewed: number; offers: number; placed: number };

export async function driveFunnel(drive: DriveRow, candidates?: CandidateRow[]): Promise<{ funnel: Funnel; summaries: AttemptSummary[] }> {
  const cands = candidates ?? (await db.select().from(driveCandidates).where(eq(driveCandidates.driveId, drive.id)));
  if (!cands.length) return { funnel: { invited: 0, registered: 0, assessed: 0, interviewed: 0, offers: 0, placed: 0 }, summaries: [] };
  const ids = cands.map((x) => x.id);
  const [events, ivs, summaries] = await Promise.all([
    db.select({ candidateId: driveStageEvents.candidateId, toStage: driveStageEvents.toStage }).from(driveStageEvents).where(eq(driveStageEvents.driveId, drive.id)),
    db.select({ driveCandidateId: interviews.driveCandidateId, status: interviews.status }).from(interviews).where(and(eq(interviews.orgId, drive.orgId), inArray(interviews.driveCandidateId, ids))),
    drive.assessmentId ? attemptSummaries(drive.assessmentId, cands.map((x) => x.userId)) : Promise.resolve([] as AttemptSummary[]),
  ]);
  const maxReached = new Map<string, number>();
  const bump = (id: string, stage: string) => {
    const o = PROGRESS_ORDER[stage];
    if (o !== undefined && o > (maxReached.get(id) ?? -1)) maxReached.set(id, o);
  };
  for (const cnd of cands) bump(cnd.id, cnd.stage);
  for (const e of events) bump(e.candidateId, e.toStage);
  const interviewed = new Set(ivs.filter((i) => i.status === 'scheduled' || i.status === 'completed').map((i) => i.driveCandidateId));
  const assessedUsers = new Set(summaries.filter((s) => SUBMITTED.has(s.status)).map((s) => s.userId));
  const reached = (n: number) => cands.filter((x) => (maxReached.get(x.id) ?? 0) >= n).length;
  return {
    funnel: {
      invited: cands.length,
      registered: reached(1),
      assessed: cands.filter((x) => assessedUsers.has(x.userId)).length,
      interviewed: cands.filter((x) => interviewed.has(x.id)).length,
      offers: reached(4),
      placed: cands.filter((x) => x.stage === 'placed').length,
    },
    summaries,
  };
}

/** Whether a CTC text is a clean number (only then is it treated as numeric). */
export function parseCleanNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.trim();
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

// ---------- CSV ----------

/** RFC 4180 CSV with spreadsheet formula-injection protection. */
export function toCsv(headers: string[], rows: unknown[][], preface: string[] = []): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [...preface.map((p) => `# ${p.replace(/[\r\n]+/g, ' ')}`), headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n') + '\r\n';
}

export function csvResponse(c: Ctx, filename: string, csv: string) {
  c.header('content-type', 'text/csv; charset=utf-8');
  c.header('content-disposition', `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
  return c.body(csv);
}

/** Minimal RFC 4180 parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}
