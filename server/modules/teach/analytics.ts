/**
 * Faculty analytics for one cohort. Every metric states its definition and its sample size.
 * Missing data stays "no data" (null): nobody is flagged because a number is unknown, and
 * the numbers describe what happened; they do not claim why it happened.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  assessments,
  assignments,
  assignmentTeams,
  attendanceMarks,
  attendanceSessions,
  cohortMembers,
  courseCohorts,
  courses,
  skills,
  topicProgress,
  topics,
  tracks,
  users,
} from '../../db/schema';
import { attemptSummaries } from '../assessments/service';
import { currentEvaluations, latestSubmitted, round2, type Cohort } from './service';

export const AT_RISK_RULES = {
  missedLastTwo: 'No submission for the last 2 published assignments whose due date has passed.',
  lowAverage: 'Average score below 50% across graded assignments.',
  lowAttendance: 'Attendance below 75% in sessions where attendance was taken.',
};

export const DEFINITIONS = {
  completionRate:
    'Share of student-assignment pairs with a submission, counting only published assignments whose due date has passed. Team submissions count for every team member.',
  onTimeRate: 'Share of submissions made on or before the due time (late submissions are those after it).',
  averageScore: 'Mean of final scores (after late penalties) as a percentage of maximum points, over submissions that have a current evaluation. Unreleased evaluations are included so faculty see grading in progress.',
  gradingBacklog: 'Ungraded: latest submitted versions without any evaluation. Drafts: evaluations saved but not released, grouped by grader.',
  atRisk: `A student is flagged when at least one rule has data and is met: ${Object.values(AT_RISK_RULES).join(' ')} Rules without data are skipped; a student is never flagged because data is missing. A flag is a prompt to check in, not a diagnosis of the cause.`,
  conceptDifficulty:
    'Per rubric criterion: mean of (points awarded / highest level points). Per skill: mean final score ratio on assignments tagged with that skill. Lower means students found it harder. Small samples (n under 5) are noisy.',
  topicProgress: 'For roadmaps linked to this cohort’s courses: how many students completed each topic, and their mean mastery among students who started it (mastery comes from quiz and practice evidence only).',
  attendance: 'Present and late marks divided by marked sessions, excluding excused absences. Students with no marks show no data.',
  assessments: 'Best attempt per student on assessments linked to this cohort, as reported by the assessment engine.',
  causation: 'These metrics show patterns, not causes. For example, low attendance and low scores appearing together does not mean one caused the other.',
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Attendance per student in a set of sessions (null when a student has no marks). */
export async function attendanceByStudent(sessionIds: string[]) {
  const out = new Map<string, { present: number; late: number; absent: number; excused: number; marked: number; percent: number | null }>();
  if (!sessionIds.length) return out;
  const marks = await db.select().from(attendanceMarks).where(inArray(attendanceMarks.sessionId, sessionIds));
  for (const m of marks) {
    const r = out.get(m.userId) ?? { present: 0, late: 0, absent: 0, excused: 0, marked: 0, percent: null };
    if (m.status === 'present') r.present++;
    else if (m.status === 'late') r.late++;
    else if (m.status === 'absent') r.absent++;
    else if (m.status === 'excused') r.excused++;
    r.marked++;
    out.set(m.userId, r);
  }
  for (const r of out.values()) {
    const denom = r.marked - r.excused;
    r.percent = denom > 0 ? round2(((r.present + r.late) / denom) * 100) : null;
  }
  return out;
}

export async function cohortAnalytics(cohort: Cohort, now = new Date()) {
  const studentRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.role, 'student')))
    .orderBy(asc(users.name));
  const studentIds = studentRows.map((s) => s.id);

  const asg = (
    await db
      .select()
      .from(assignments)
      .where(and(eq(assignments.cohortId, cohort.id), eq(assignments.orgId, cohort.orgId), inArray(assignments.status, ['published', 'closed'])))
      .orderBy(asc(assignments.dueAt))
  ).filter((a) => !a.availableFrom || new Date(a.availableFrom).getTime() <= now.getTime());
  const asgIds = asg.map((a) => a.id);
  const subs = await latestSubmitted(asgIds, cohort.orgId);
  const evals = await currentEvaluations(subs.map((s) => s.id));
  const teams = asgIds.length ? await db.select().from(assignmentTeams).where(inArray(assignmentTeams.assignmentId, asgIds)) : [];

  /** The submission that covers a student for an assignment (their own, or their team's). */
  const subFor = (aId: string, uid: string) => {
    const team = teams.find((t) => t.assignmentId === aId && t.memberIds.includes(uid));
    return subs.find((s) => s.assignmentId === aId && (team ? s.teamId === team.id : s.userId === uid && !s.teamId)) ?? null;
  };

  // ---- Per assignment ----
  const perAssignment = asg.map((a) => {
    const covered = studentIds.map((uid) => subFor(a.id, uid)).filter(Boolean);
    const aSubs = subs.filter((s) => s.assignmentId === a.id);
    const graded = aSubs.map((s) => evals.get(s.id)).filter(Boolean);
    const ratios = graded.map((e) => (a.maxPoints > 0 ? e!.finalScore / a.maxPoints : 0));
    const avg = mean(ratios);
    return {
      id: a.id,
      title: a.title,
      dueAt: a.dueAt,
      pastDue: new Date(a.dueAt).getTime() < now.getTime(),
      maxPoints: a.maxPoints,
      students: studentIds.length,
      submittedStudents: covered.length,
      completionRate: studentIds.length ? round2(covered.length / studentIds.length) : null,
      submissions: aSubs.length,
      onTimeRate: aSubs.length ? round2(aSubs.filter((s) => !s.isLate).length / aSubs.length) : null,
      graded: graded.length,
      ungraded: aSubs.length - graded.length,
      averagePercent: avg === null ? null : round2(avg * 100),
    };
  });

  const pastDue = asg.filter((a) => new Date(a.dueAt).getTime() < now.getTime());
  let pairs = 0;
  let done = 0;
  for (const a of pastDue)
    for (const uid of studentIds) {
      pairs++;
      if (subFor(a.id, uid)) done++;
    }
  const allSubs = subs;
  const completionRate = pairs ? round2(done / pairs) : null;
  const onTimeRate = allSubs.length ? round2(allSubs.filter((s) => !s.isLate).length / allSubs.length) : null;

  // ---- Grading backlog ----
  const ungraded = allSubs.filter((s) => !evals.get(s.id));
  const byGraderMap = new Map<string, { drafts: number; released: number }>();
  for (const e of evals.values()) {
    const r = byGraderMap.get(e.graderId) ?? { drafts: 0, released: 0 };
    if (e.released) r.released++;
    else r.drafts++;
    byGraderMap.set(e.graderId, r);
  }
  const graderNames = byGraderMap.size ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...byGraderMap.keys()])) : [];
  const backlog = {
    ungraded: ungraded.length,
    ungradedLate: ungraded.filter((s) => s.isLate).length,
    byGrader: [...byGraderMap.entries()].map(([graderId, r]) => ({ graderId, name: graderNames.find((g) => g.id === graderId)?.name ?? 'Unknown', ...r })),
  };

  // ---- Attendance ----
  const sessions = await db
    .select({ id: attendanceSessions.id })
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.cohortId, cohort.id), eq(attendanceSessions.orgId, cohort.orgId)));
  const attendance = await attendanceByStudent(sessions.map((s) => s.id));

  // ---- Students and at-risk ----
  const lastTwo = [...pastDue].sort((x, y) => new Date(y.dueAt).getTime() - new Date(x.dueAt).getTime()).slice(0, 2);
  const students = studentRows.map((st) => {
    const ratios: number[] = [];
    let submitted = 0;
    let late = 0;
    for (const a of asg) {
      const s = subFor(a.id, st.id);
      if (!s) continue;
      submitted++;
      if (s.isLate) late++;
      const e = evals.get(s.id);
      if (e && a.maxPoints > 0) ratios.push(e.finalScore / a.maxPoints);
    }
    const avg = mean(ratios);
    const att = attendance.get(st.id)?.percent ?? null;
    const reasons: { code: 'missed_last_two' | 'low_average' | 'low_attendance'; text: string }[] = [];
    if (lastTwo.length === 2 && lastTwo.every((a) => !subFor(a.id, st.id))) reasons.push({ code: 'missed_last_two', text: `No submission for "${lastTwo[1].title}" or "${lastTwo[0].title}".` });
    if (avg !== null && avg < 0.5) reasons.push({ code: 'low_average', text: `Average score ${Math.round(avg * 100)}% across ${ratios.length} graded assignment${ratios.length === 1 ? '' : 's'}.` });
    if (att !== null && att < 75) reasons.push({ code: 'low_attendance', text: `Attendance ${Math.round(att)}% in marked sessions.` });
    return {
      userId: st.id,
      name: st.name,
      email: st.email,
      submitted,
      late,
      assignments: asg.length,
      averagePercent: avg === null ? null : round2(avg * 100),
      gradedCount: ratios.length,
      attendancePercent: att,
      reasons,
      atRisk: reasons.length > 0,
    };
  });

  // ---- Concept difficulty ----
  const criteria = new Map<string, { title: string; ratios: number[]; assignments: Set<string> }>();
  const skillRatios = new Map<string, number[]>();
  for (const a of asg) {
    const aSubs = allSubs.filter((s) => s.assignmentId === a.id);
    for (const s of aSubs) {
      const e = evals.get(s.id);
      if (!e) continue;
      for (const rs of e.rubricScores) {
        const crit = a.rubricSnapshot?.find((c) => c.id === rs.criterionId);
        if (!crit) continue;
        const top = Math.max(0, ...crit.levels.map((l) => l.points));
        if (top <= 0) continue;
        const key = crit.title.trim().toLowerCase();
        const r = criteria.get(key) ?? { title: crit.title, ratios: [], assignments: new Set<string>() };
        r.ratios.push(rs.points / top);
        r.assignments.add(a.title);
        criteria.set(key, r);
      }
      if (a.maxPoints > 0) for (const sk of a.skillIds) (skillRatios.get(sk) ?? skillRatios.set(sk, []).get(sk)!).push(e.finalScore / a.maxPoints);
    }
  }
  const skillRows = skillRatios.size ? await db.select({ id: skills.id, name: skills.name, slug: skills.slug }).from(skills).where(inArray(skills.id, [...skillRatios.keys()])) : [];
  const conceptDifficulty = {
    criteria: [...criteria.values()]
      .map((c) => ({ title: c.title, averageRatio: round2(mean(c.ratios)!), n: c.ratios.length, assignments: [...c.assignments] }))
      .sort((x, y) => x.averageRatio - y.averageRatio),
    skills: [...skillRatios.entries()]
      .map(([id, rs]) => ({ skillId: id, name: skillRows.find((s) => s.id === id)?.name ?? 'Skill', slug: skillRows.find((s) => s.id === id)?.slug ?? '', averageRatio: round2(mean(rs)!), n: rs.length }))
      .sort((x, y) => x.averageRatio - y.averageRatio),
  };

  // ---- Topic progress for linked roadmaps ----
  const linked = await db
    .select({ courseId: courses.id, code: courses.code, trackId: courses.trackId })
    .from(courseCohorts)
    .innerJoin(courses, eq(courses.id, courseCohorts.courseId))
    .where(and(eq(courseCohorts.cohortId, cohort.id), eq(courses.orgId, cohort.orgId)));
  const trackIds = [...new Set(linked.map((l) => l.trackId).filter(Boolean) as string[])];
  const topicProgressOut: { trackId: string; trackTitle: string; trackSlug: string; topics: { id: string; title: string; completed: number; started: number; averageMastery: number | null }[] }[] = [];
  for (const tid of trackIds) {
    const [track] = await db.select({ id: tracks.id, title: tracks.title, slug: tracks.slug }).from(tracks).where(eq(tracks.id, tid));
    if (!track) continue;
    const tps = await db.select({ id: topics.id, title: topics.title }).from(topics).where(eq(topics.trackId, tid)).orderBy(asc(topics.sortOrder));
    const prog = studentIds.length && tps.length ? await db.select().from(topicProgress).where(and(inArray(topicProgress.userId, studentIds), inArray(topicProgress.topicId, tps.map((t) => t.id)))) : [];
    topicProgressOut.push({
      trackId: track.id,
      trackTitle: track.title,
      trackSlug: track.slug,
      topics: tps.map((t) => {
        const rows = prog.filter((p) => p.topicId === t.id && p.status !== 'not_started');
        const m = mean(rows.map((r) => r.mastery));
        return { id: t.id, title: t.title, completed: rows.filter((r) => r.status === 'completed').length, started: rows.length, averageMastery: m === null ? null : round2(m) };
      }),
    });
  }

  // ---- Assessments (engine may not be available yet) ----
  const linkedAssessments = await db
    .select({ id: assessments.id, title: assessments.title, status: assessments.status })
    .from(assessments)
    .where(and(eq(assessments.cohortId, cohort.id), eq(assessments.orgId, cohort.orgId)));
  const assessmentResults: { id: string; title: string; available: boolean; message?: string; attempts?: number; averagePercent?: number | null }[] = [];
  for (const as of linkedAssessments) {
    try {
      const sums = await attemptSummaries(as.id, studentIds);
      const ps = sums.map((s) => s.percent).filter((p): p is number => typeof p === 'number');
      const m = mean(ps);
      assessmentResults.push({ id: as.id, title: as.title, available: true, attempts: sums.length, averagePercent: m === null ? null : round2(m) });
    } catch {
      assessmentResults.push({ id: as.id, title: as.title, available: false, message: 'Assessment results are not available right now.' });
    }
  }

  return {
    cohort: { id: cohort.id, name: cohort.name },
    generatedAt: now.toISOString(),
    totals: {
      students: studentIds.length,
      assignments: asg.length,
      pastDueAssignments: pastDue.length,
      completionRate,
      completionSample: pairs,
      onTimeRate,
      submissions: allSubs.length,
      averagePercent: (() => {
        const xs = perAssignment.map((a) => a.averagePercent).filter((x): x is number => x !== null);
        const m = mean(xs);
        return m === null ? null : round2(m);
      })(),
      atRisk: students.filter((s) => s.atRisk).length,
      attendanceSessions: sessions.length,
    },
    assignments: perAssignment,
    backlog,
    students,
    conceptDifficulty,
    topicProgress: topicProgressOut,
    assessments: assessmentResults,
    rules: AT_RISK_RULES,
    definitions: DEFINITIONS,
  };
}
