import { Hono } from 'hono';
import { and, asc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  assignments,
  campusInterviewDetails,
  cohortMembers,
  cohorts,
  courses,
  departments,
  driveCandidates,
  driveStageEvents,
  evaluations,
  interviews,
  memberships,
  placementDrives,
  programs,
  recordCorrections,
  skills,
  studentRecords,
  submissions,
  users,
} from '../../db/schema';
import type { AppEnv } from '../../lib/context';
import { audit } from '../../lib/audit';
import { computeSkillDna } from '../learning/skilldna';
import { csvResponse, driveFunnel, GAPS_SQL, parseCleanNumber, PROGRESS_ORDER, requireCampus, STAGE_LABELS, toCsv, type CandidateStage } from './service';

/** Campus overview, analytics and the placement report export. Every metric ships with its definition. */
export const reportRoutes = new Hono<AppEnv>();

const READINESS_STUDENT_CAP = 400;

/** Users who reached a progress stage at any time (from history plus current stage), per drive candidate. */
async function reachedOffer(driveIds: string[]) {
  if (!driveIds.length) return new Set<string>();
  const [cands, events] = await Promise.all([
    db.select({ id: driveCandidates.id, stage: driveCandidates.stage }).from(driveCandidates).where(inArray(driveCandidates.driveId, driveIds)),
    db.select({ candidateId: driveStageEvents.candidateId, toStage: driveStageEvents.toStage }).from(driveStageEvents).where(inArray(driveStageEvents.driveId, driveIds)),
  ]);
  const out = new Set<string>();
  for (const c of cands) if ((PROGRESS_ORDER[c.stage] ?? -1) >= PROGRESS_ORDER.offer) out.add(c.id);
  for (const e of events) if ((PROGRESS_ORDER[e.toStage] ?? -1) >= PROGRESS_ORDER.offer) out.add(e.candidateId);
  return out;
}

/** Most common required skills across the org's (non-cancelled) drives. */
async function commonRequiredSkills(orgId: string, limit: number) {
  const drives = await db.select({ eligibility: placementDrives.eligibility }).from(placementDrives).where(and(eq(placementDrives.orgId, orgId), ne(placementDrives.status, 'cancelled')));
  const freq = new Map<string, number>();
  for (const d of drives) for (const s of d.eligibility.requiredSkillSlugs ?? []) freq.set(s, (freq.get(s) ?? 0) + 1);
  const slugs = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([s]) => s);
  const rows = slugs.length ? await db.select({ slug: skills.slug, name: skills.name }).from(skills).where(inArray(skills.slug, slugs)) : [];
  return slugs.map((s) => ({ slug: s, name: rows.find((r) => r.slug === s)?.name ?? s, drives: freq.get(s) ?? 0 }));
}

async function readiness(orgId: string, skillLimit: number) {
  const common = await commonRequiredSkills(orgId, skillLimit);
  const definition =
    'Share of students with an academic record (status enrolled) whose Skill DNA shows the skill as verified (deterministic grading or an authorized reviewer) or demonstrated (non-self evidence at 60% or more). Skills are the ones most often required by this institution\'s drives. Self-reported skills do not count.';
  if (!common.length) return { skills: [], programs: [], definition, note: 'No drive lists required skills yet, so there is nothing to measure readiness against.', truncated: false };
  const recs = await db
    .select({ userId: studentRecords.userId, programId: studentRecords.programId, programName: programs.name })
    .from(studentRecords)
    .leftJoin(programs, eq(programs.id, studentRecords.programId))
    .where(and(eq(studentRecords.orgId, orgId), eq(studentRecords.status, 'enrolled')))
    .limit(READINESS_STUDENT_CAP + 1);
  const truncated = recs.length > READINESS_STUDENT_CAP;
  const sample = recs.slice(0, READINESS_STUDENT_CAP);
  const wanted = new Set(common.map((s) => s.slug));
  const groups = new Map<string, { programName: string; students: number; skills: Map<string, { verified: number; demonstrated: number; selfOnly: number }> }>();
  for (const r of sample) {
    const key = r.programId ?? 'none';
    const g = groups.get(key) ?? { programName: r.programName ?? 'Program not recorded', students: 0, skills: new Map() };
    groups.set(key, g);
    g.students++;
    const dna = (await computeSkillDna(r.userId)).filter((s) => wanted.has(s.slug));
    for (const s of common) {
      const e = dna.find((d) => d.slug === s.slug);
      const cur = g.skills.get(s.slug) ?? { verified: 0, demonstrated: 0, selfOnly: 0 };
      if (e?.state === 'verified') cur.verified++;
      else if (e?.state === 'demonstrated') cur.demonstrated++;
      else if (e?.state === 'self_declared') cur.selfOnly++;
      g.skills.set(s.slug, cur);
    }
  }
  return {
    skills: common,
    programs: [...groups.entries()].map(([programId, g]) => ({
      programId: programId === 'none' ? null : programId,
      programName: g.programName,
      students: g.students,
      skills: common.map((s) => {
        const v = g.skills.get(s.slug) ?? { verified: 0, demonstrated: 0, selfOnly: 0 };
        return { slug: s.slug, name: s.name, verified: v.verified, demonstrated: v.demonstrated, selfReportedOnly: v.selfOnly, readyShare: g.students ? Math.round(((v.verified + v.demonstrated) / g.students) * 1000) / 10 : null };
      }),
    })),
    definition,
    note: truncated ? `Computed for the first ${READINESS_STUDENT_CAP} students.` : null,
    truncated,
  };
}

// ---------- Overview ----------

reportRoutes.get('/overview', async (c) => {
  const { orgId } = requireCampus(c);
  const active = await db.select().from(placementDrives).where(and(eq(placementDrives.orgId, orgId), inArray(placementDrives.status, ['open', 'in_progress']))).orderBy(asc(placementDrives.registrationDeadline));
  const drives = [];
  for (const d of active) drives.push({ id: d.id, title: d.title, companyName: d.companyName, status: d.status, registrationDeadline: d.registrationDeadline, funnel: (await driveFunnel(d)).funnel });
  const [[counts], [{ missing }], [{ openCorrections }]] = await Promise.all([
    db
      .select({
        records: sql<number>`count(*)::int`,
        unverified: sql<number>`count(*) filter (where ${studentRecords.verifiedAt} is null)::int`,
        withGaps: sql<number>`count(*) filter (where ${GAPS_SQL})::int`,
      })
      .from(studentRecords)
      .where(eq(studentRecords.orgId, orgId)),
    db
      .select({ missing: sql<number>`count(*)::int` })
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.status, 'active'), sql`'student' = any(${memberships.roles})`, sql`not exists (select 1 from student_records r where r.org_id = ${orgId} and r.user_id = ${memberships.userId})`)),
    db.select({ openCorrections: sql<number>`count(*)::int` }).from(recordCorrections).where(and(eq(recordCorrections.orgId, orgId), eq(recordCorrections.status, 'open'))),
  ]);
  const now = new Date();
  const upcoming = await db
    .select({ id: interviews.id, title: interviews.title, scheduledAt: interviews.scheduledAt, durationMinutes: interviews.durationMinutes, meetingUrl: interviews.meetingUrl, candidateName: users.name, driveId: campusInterviewDetails.driveId, driveTitle: placementDrives.title })
    .from(interviews)
    .innerJoin(campusInterviewDetails, eq(campusInterviewDetails.interviewId, interviews.id))
    .innerJoin(placementDrives, eq(placementDrives.id, campusInterviewDetails.driveId))
    .innerJoin(users, eq(users.id, interviews.candidateId))
    .where(and(eq(interviews.orgId, orgId), eq(interviews.status, 'scheduled'), gte(interviews.scheduledAt, new Date(now.getTime() - 3600_000)), lte(interviews.scheduledAt, new Date(now.getTime() + 14 * 86400_000))))
    .orderBy(asc(interviews.scheduledAt))
    .limit(10);
  return c.json({
    drives,
    counts: { records: Number(counts.records), unverified: Number(counts.unverified), withGaps: Number(counts.withGaps), studentsWithoutRecord: Number(missing), openCorrections: Number(openCorrections), activeDrives: active.length },
    upcomingInterviews: upcoming,
    readiness: await readiness(orgId, 3),
  });
});

// ---------- Reports ----------

reportRoutes.get('/reports/readiness', async (c) => {
  const { orgId } = requireCampus(c);
  return c.json(await readiness(orgId, 8));
});

reportRoutes.get('/reports', async (c) => {
  const { orgId } = requireCampus(c);
  const drives = await db.select().from(placementDrives).where(eq(placementDrives.orgId, orgId));
  const driveIds = drives.map((d) => d.id);
  const driveById = new Map(drives.map((d) => [d.id, d]));
  const [records, cands, offerSet] = await Promise.all([
    db.select().from(studentRecords).where(eq(studentRecords.orgId, orgId)),
    driveIds.length ? db.select({ x: driveCandidates, name: users.name }).from(driveCandidates).innerJoin(users, eq(users.id, driveCandidates.userId)).where(inArray(driveCandidates.driveId, driveIds)) : Promise.resolve([]),
    reachedOffer(driveIds),
  ]);
  const placedUsers = new Set(cands.filter((c) => c.x.stage === 'placed').map((c) => c.x.userId));

  // Placement rate per graduating batch (graduation year).
  const years = new Map<string, { optedIn: number; placed: number; notOptedIn: number; records: number }>();
  for (const r of records) {
    const key = r.graduationYear === null ? 'unknown' : String(r.graduationYear);
    const y = years.get(key) ?? { optedIn: 0, placed: 0, notOptedIn: 0, records: 0 };
    years.set(key, y);
    y.records++;
    if (r.placementOptIn && r.status !== 'withdrawn') {
      y.optedIn++;
      if (placedUsers.has(r.userId)) y.placed++;
    } else y.notOptedIn++;
  }
  const batches = [...years.entries()]
    .sort((a, b) => (a[0] === 'unknown' ? 1 : b[0] === 'unknown' ? -1 : Number(b[0]) - Number(a[0])))
    .map(([year, y]) => ({ graduationYear: year === 'unknown' ? null : Number(year), ...y, rate: y.optedIn ? Math.round((y.placed / y.optedIn) * 1000) / 10 : null }));

  // Offers by company (offer reached at any time).
  const companies = new Map<string, { companyName: string; drives: Set<string>; offers: number; placed: number }>();
  for (const d of drives) {
    const k = d.companyName.toLowerCase();
    const e = companies.get(k) ?? { companyName: d.companyName, drives: new Set(), offers: 0, placed: 0 };
    e.drives.add(d.id);
    companies.set(k, e);
  }
  for (const c of cands) {
    const d = driveById.get(c.x.driveId)!;
    const e = companies.get(d.companyName.toLowerCase())!;
    if (offerSet.has(c.x.id)) e.offers++;
    if (c.x.stage === 'placed') e.placed++;
  }
  const offersByCompany = [...companies.values()].map((e) => ({ companyName: e.companyName, drives: e.drives.size, offers: e.offers, placed: e.placed })).sort((a, b) => b.offers - a.offers || a.companyName.localeCompare(b.companyName));

  // CTC listing as entered (never fabricated or averaged from text).
  const ctc = cands
    .filter((c) => offerSet.has(c.x.id))
    .map((c) => {
      const d = driveById.get(c.x.driveId)!;
      const text = c.x.offerCtcText ?? d.ctcText;
      return { candidateName: c.name, companyName: d.companyName, roleTitle: d.roleTitle, driveTitle: d.title, stage: c.x.stage, ctcText: text, ctcSource: c.x.offerCtcText ? 'offer' : d.ctcText ? 'drive' : null, ctcNumber: parseCleanNumber(text) };
    });

  // Department comparison.
  const deps = await db.select().from(departments).where(eq(departments.orgId, orgId));
  const depRows = [...deps.map((d) => ({ id: d.id as string | null, name: d.name })), { id: null, name: 'Department not recorded' }].map((dep) => {
    const rs = records.filter((r) => (r.departmentId ?? null) === dep.id);
    const known = rs.filter((r) => r.cgpa !== null);
    const opted = rs.filter((r) => r.placementOptIn && r.status !== 'withdrawn');
    const placed = opted.filter((r) => placedUsers.has(r.userId)).length;
    return {
      departmentId: dep.id,
      name: dep.name,
      records: rs.length,
      verified: rs.filter((r) => r.verifiedAt).length,
      withGaps: rs.filter((r) => r.programId === null || r.graduationYear === null || r.cgpa === null || r.activeBacklogs === null).length,
      cgpaKnown: known.length,
      averageCgpa: known.length ? Math.round((known.reduce((a, r) => a + (r.cgpa ?? 0), 0) / known.length) * 100) / 100 : null,
      optedIn: opted.length,
      placed,
      placementRate: opted.length ? Math.round((placed / opted.length) * 1000) / 10 : null,
    };
  }).filter((d) => d.records > 0 || d.departmentId !== null);

  // Batch cohort comparison (cohorts of kind batch; membership comes from Teach).
  const batchCohorts = await db.select().from(cohorts).where(and(eq(cohorts.orgId, orgId), eq(cohorts.kind, 'batch')));
  const members = batchCohorts.length ? await db.select({ cohortId: cohortMembers.cohortId, userId: cohortMembers.userId }).from(cohortMembers).where(and(inArray(cohortMembers.cohortId, batchCohorts.map((b) => b.id)), eq(cohortMembers.role, 'student'))) : [];
  const recByUser = new Map(records.map((r) => [r.userId, r]));
  const cohortRows = batchCohorts.map((b) => {
    const ms = members.filter((m) => m.cohortId === b.id);
    const withRecord = ms.filter((m) => recByUser.has(m.userId));
    const opted = withRecord.filter((m) => recByUser.get(m.userId)!.placementOptIn);
    const placed = opted.filter((m) => placedUsers.has(m.userId)).length;
    return { cohortId: b.id, name: b.name, graduationYear: b.graduationYear, students: ms.length, withRecord: withRecord.length, optedIn: opted.length, placed, placementRate: opted.length ? Math.round((placed / opted.length) * 1000) / 10 : null };
  });

  // Faculty workload: ungraded submissions per assignment author (Teach tables).
  const workload = await db
    .select({
      userId: assignments.authorId,
      name: users.name,
      ungraded: sql<number>`count(*)::int`,
      oldest: sql<string | null>`to_char(min(${submissions.submittedAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
    })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(users, eq(users.id, assignments.authorId))
    .where(and(eq(assignments.orgId, orgId), eq(submissions.status, 'submitted')))
    .groupBy(assignments.authorId, users.name)
    .orderBy(sql`count(*) desc`);

  // Course outcomes (Teach tables): completion and released grades per course.
  const courseRows = await db
    .select({
      courseId: courses.id,
      code: courses.code,
      title: courses.title,
      assignments: sql<number>`count(distinct ${assignments.id})::int`,
      submissions: sql<number>`count(distinct (${submissions.assignmentId}::text || ${submissions.userId}::text)) filter (where ${submissions.status} in ('submitted', 'graded', 'returned'))::int`,
      released: sql<number>`count(${evaluations.id}) filter (where ${evaluations.released} and ${evaluations.supersededBy} is null)::int`,
      averageRatio: sql<number | null>`avg(${evaluations.finalScore} / nullif(${assignments.maxPoints}, 0)) filter (where ${evaluations.released} and ${evaluations.supersededBy} is null)`,
    })
    .from(courses)
    .leftJoin(assignments, and(eq(assignments.courseId, courses.id), ne(assignments.status, 'draft')))
    .leftJoin(submissions, eq(submissions.assignmentId, assignments.id))
    .leftJoin(evaluations, eq(evaluations.submissionId, submissions.id))
    .where(eq(courses.orgId, orgId))
    .groupBy(courses.id, courses.code, courses.title)
    .orderBy(asc(courses.code));

  return c.json({
    courseOutcomes: courseRows.map(({ averageRatio, ...r }) => ({ ...r, assignments: Number(r.assignments), submissions: Number(r.submissions), released: Number(r.released), averagePercent: averageRatio === null ? null : Math.round(Number(averageRatio) * 1000) / 10 })),
    batches,
    offersByCompany,
    ctc,
    departments: depRows,
    cohorts: cohortRows,
    workload: workload.map((w) => ({ ...w, ungraded: Number(w.ungraded) })),
    drives: drives.filter((d) => d.status !== 'draft').map((d) => ({ id: d.id, title: d.title, companyName: d.companyName, status: d.status })),
    definitions: {
      placementRate:
        'Placed students divided by students opted in for placement in that graduating batch. Opted in means the record has placement opt-in on and is not withdrawn. Placed means the student is in the placed stage in at least one of this institution\'s drives. Students not opted in are excluded from the denominator and shown separately.',
      unknownYear: 'Records without a graduation year are grouped as "Not recorded" rather than guessed.',
      offers: 'Candidates who reached the offer stage at any time in a drive, including offers later declined. One student can hold offers from several companies.',
      ctc: 'CTC is shown exactly as entered (offer CTC if recorded, otherwise the drive\'s CTC text). A number is extracted only when the text is a plain number; nothing is averaged or estimated.',
      departments: 'Average CGPA uses only records with a known CGPA (count shown). Comparisons describe differences; they do not show what caused them.',
      cohorts: 'Batch membership comes from Teach. Placement rate uses members who have a record and are opted in.',
      workload: 'Submitted assignment work not yet graded, attributed to the assignment author. Draft and returned submissions are excluded.',
      courseOutcomes: 'Per course, from Teach: published assignments, students who submitted each assignment (counted once per student per assignment), and the average of released, current grades as a share of each assignment\'s maximum points (n = released grades). Unreleased grades are not included.',
    },
  });
});

reportRoutes.get('/reports/placement.csv', async (c) => {
  const { orgId } = requireCampus(c);
  const records = await db
    .select({ r: studentRecords, name: users.name, email: users.email, programName: programs.name })
    .from(studentRecords)
    .innerJoin(users, eq(users.id, studentRecords.userId))
    .leftJoin(programs, eq(programs.id, studentRecords.programId))
    .where(eq(studentRecords.orgId, orgId))
    .orderBy(asc(users.name));
  const drives = await db.select().from(placementDrives).where(eq(placementDrives.orgId, orgId));
  const cands = drives.length ? await db.select().from(driveCandidates).where(inArray(driveCandidates.driveId, drives.map((d) => d.id))) : [];
  const offerSet = await reachedOffer(drives.map((d) => d.id));
  const driveById = new Map(drives.map((d) => [d.id, d]));
  const csv = toCsv(
    ['Student', 'Email', 'Roll number', 'Program', 'Graduation year', 'Record verified', 'Opted in', 'Drives', 'Offers (company: CTC as entered)', 'Placed at', 'Furthest stage'],
    records.map(({ r, name, email, programName }) => {
      const mine = cands.filter((x) => x.userId === r.userId);
      const offers = mine.filter((x) => offerSet.has(x.id)).map((x) => `${driveById.get(x.driveId)!.companyName}: ${x.offerCtcText ?? driveById.get(x.driveId)!.ctcText ?? 'CTC not recorded'}`);
      const placed = mine.filter((x) => x.stage === 'placed').map((x) => driveById.get(x.driveId)!.companyName);
      const furthest = mine.reduce<string | null>((best, x) => ((PROGRESS_ORDER[x.stage] ?? -1) > (best ? (PROGRESS_ORDER[best] ?? -1) : -1) ? x.stage : best), null);
      return [name, email, r.rollNumber, programName ?? 'Not recorded', r.graduationYear ?? 'Not recorded', r.verifiedAt ? 'Yes' : 'No', r.placementOptIn ? 'Yes' : 'No', mine.length, offers.join(' | '), placed.join(' | '), furthest ? STAGE_LABELS[furthest as CandidateStage] : ''];
    }),
    ['Placement report', 'Values shown as "Not recorded" are missing data, not zero.', `Exported ${new Date().toISOString()}`],
  );
  await audit(c, { action: 'campus.export', orgId, targetType: 'organization', targetId: orgId, meta: { report: 'placement_report', rows: records.length } });
  return csvResponse(c, 'placement-report.csv', csv);
});
