import { eq, inArray } from 'drizzle-orm';
import { db } from '../../client';
import {
  announcements,
  assignments,
  attendanceMarks,
  attendanceSessions,
  cohortMembers,
  cohorts,
  courseCohorts,
  courseInstructors,
  courses,
  evaluations,
  regradeRequests,
  rubrics,
  skills,
  submissionComments,
  submissions,
  teachPeerReviews,
  teachPeerSettings,
  teachRubricVersions,
  tracks,
  type RubricCriterion,
} from '../../schema';
import { sha256, shortCode } from '../../../lib/crypto';
import { addEvidence } from '../../../modules/learning/skilldna';
import { computeSimilarity } from '../../../modules/teach/similarity';
import { planInitialAllocation, scorePeerPicks } from '../../../modules/teach/peer';
import type { DemoContext } from './context';

const DAY = 86400_000;
const at = (days: number, hours = 0) => new Date(Date.now() + days * DAY + hours * 3600_000);
const dateOnly = (days: number) => at(days).toISOString().slice(0, 10);

const LEVELS = (what: string) => [
  { label: 'Excellent', points: 4, description: `${what} is complete and precise.` },
  { label: 'Proficient', points: 3, description: `${what} is mostly right with small gaps.` },
  { label: 'Developing', points: 2, description: `${what} has noticeable gaps.` },
  { label: 'Beginning', points: 1, description: `${what} is largely missing.` },
];

const PROGRAMMING_RUBRIC: RubricCriterion[] = [
  { id: 'correctness', title: 'Correctness', description: 'Produces the right output for normal and edge cases.', levels: LEVELS('Correctness') },
  { id: 'quality', title: 'Code quality', description: 'Readable names, small functions, no dead code.', levels: LEVELS('Code quality') },
  { id: 'complexity', title: 'Complexity analysis', description: 'States and justifies time and space complexity.', levels: LEVELS('The analysis') },
  { id: 'communication', title: 'Communication', description: 'Explains the approach clearly for a reader.', levels: LEVELS('The explanation') },
];

/** Varied, plausible answers so similarity indicators show a realistic spread. */
const ANSWERS = [
  'First I tried every pair, then switched to remembering seen values in a dictionary keyed by number. At each step I look for the complement. I did not finish testing because I ran out of time, but it worked on the sample input. I think it is linear time.',
  'I used a hash map from value to index. While scanning the array once, for each number I check whether target minus the number is already in the map; if it is, I return both indices. Otherwise I store the number. This runs in O(n) time and O(n) extra space. I tested duplicates, negative numbers and an array with no valid pair.',
  'My approach sorts a copy of the array with original indices and then moves two pointers inward from both ends, comparing the sum to the target. Sorting costs O(n log n) and the scan is O(n), so the total is O(n log n) with O(n) space for the index pairs. Edge cases: repeated values and the smallest possible array.',
  'Brute force first: two nested loops check every pair, which is O(n^2). Then I improved it with a dictionary that remembers numbers I have already seen, which brings it down to linear time. The dictionary uses linear memory. I explain both because the trade-off between time and memory matters for very large inputs.',
  'Walk the list once and keep a set of complements. For every element x, if x is in the complement set we found the pair; else add target - x. Complexity: linear time, linear space. I wrote unit tests for empty input, one element, a pair at the ends, and negative targets. Code is split into a helper that returns the indices.',
  'I used a hash map from value to index. While scanning the array once, for each number I check whether target minus the number is already in the map; if it is, I return both indices. Otherwise I store the number. Time is O(n) and space O(n). I also tested negative numbers and duplicates.',
  'Using a HashMap<Integer, Integer> in Java, I iterate through nums and look up target - nums[i]. If present I return the stored index and i. The single pass gives O(n) time; the map needs O(n) space in the worst case. I discuss why sorting would lose the original indices unless we store them.',
];

const FEEDBACK = [
  'Clear, correct solution with a good explanation of the trade-offs. Next step: mention what happens with very large inputs and integer overflow.',
  'The two-pointer idea works, but remember to keep the original indices. Your complexity analysis is accurate.',
  'Good that you showed the brute-force baseline. Tighten the code by extracting the lookup into a helper.',
  'Well tested and readable. Consider explaining why a set is enough here instead of a map.',
  'Correct and efficient. The write-up is brief; one more sentence on edge cases would help a reader.',
];

export async function seed(ctx: DemoContext) {
  const nb = ctx.orgs.northbridge;
  const fac = ctx.users.faculty;
  const roster = [ctx.users.student, ...ctx.users.students];
  const skillRows = await db.select({ id: skills.id, slug: skills.slug }).from(skills).where(inArray(skills.slug, ['hashing', 'arrays', 'complexity', 'stacks-queues']));
  const skill = (slug: string) => skillRows.find((s) => s.slug === slug)?.id;
  const [dsa] = await db.select({ id: tracks.id }).from(tracks).where(eq(tracks.slug, 'dsa-essentials'));

  // ---------- Cohort, course, rubric ----------
  const [cohort] = await db.insert(cohorts).values({ orgId: nb, name: 'CSE 2027 · Section A', kind: 'section', graduationYear: 2027, ownerId: fac }).returning();
  await db.insert(cohortMembers).values([{ cohortId: cohort.id, userId: fac, role: 'instructor' }, ...roster.map((u) => ({ cohortId: cohort.id, userId: u, role: 'student' }))]);

  const [course] = await db
    .insert(courses)
    .values({ orgId: nb, code: 'CS201', title: 'CS201 Data Structures', description: 'Arrays, hashing, stacks, queues, trees and graphs, with weekly programming assignments.', trackId: dsa?.id ?? null, ownerId: fac })
    .returning();
  await db.insert(courseCohorts).values({ courseId: course.id, cohortId: cohort.id });
  await db.insert(courseInstructors).values({ courseId: course.id, userId: fac, role: 'instructor' });
  await db.insert(announcements).values({
    orgId: nb,
    courseId: course.id,
    authorId: fac,
    title: 'Assignment 2 is open',
    body: 'The stack evaluator assignment is now open. Drafts save automatically. Office hours are Thursday 3 to 5 pm.',
    createdAt: at(-1),
  });

  const [rubric] = await db.insert(rubrics).values({ orgId: nb, ownerId: fac, title: 'Programming assignment rubric', criteria: PROGRAMMING_RUBRIC, version: 1 }).returning();
  await db.insert(teachRubricVersions).values({ rubricId: rubric.id, version: 1, title: rubric.title, criteria: rubric.criteria, editedBy: fac });

  // ---------- Assignment 1: graded and released for most students ----------
  const [a1] = await db
    .insert(assignments)
    .values({
      orgId: nb,
      courseId: course.id,
      cohortId: cohort.id,
      authorId: fac,
      title: 'Assignment 1: Two-sum with hashing',
      objectives: ['Use a hash map to trade memory for time', 'State time and space complexity', 'Test edge cases'],
      instructions:
        '## Task\nGiven an array of integers and a target, return the indices of two numbers that add up to the target.\n\n## What to submit\n- Your solution as text (any language)\n- A short explanation of your approach and its complexity\n- The edge cases you tested\n\nYou may discuss ideas with classmates, but write your own solution.',
      availableFrom: at(-24),
      dueAt: at(-10),
      maxPoints: 100,
      rubricId: rubric.id,
      rubricSnapshot: PROGRAMMING_RUBRIC,
      submissionTypes: ['text', 'link'],
      collaboration: 'discuss_only',
      latePolicy: { allowLate: true, penaltyPercentPerDay: 10, hardCutoffDays: 3 },
      allowResubmission: false,
      maxResubmissions: 0,
      skillIds: [skill('hashing'), skill('arrays'), skill('complexity')].filter(Boolean) as string[],
      status: 'published',
      releasePolicy: 'manual',
      createdAt: at(-25),
    })
    .returning();

  const picks = [
    ['Excellent', 'Excellent', 'Proficient', 'Excellent'],
    ['Proficient', 'Proficient', 'Excellent', 'Proficient'],
    ['Proficient', 'Developing', 'Proficient', 'Proficient'],
    ['Excellent', 'Proficient', 'Excellent', 'Excellent'],
    ['Excellent', 'Proficient', 'Proficient', 'Developing'],
    ['Developing', 'Developing', 'Beginning', 'Developing'],
  ];
  const a1Subs: { id: string; userId: string }[] = [];
  let studentSubmissionId: string | null = null;
  for (const [i, uid] of roster.entries()) {
    // The last student submitted late and is still waiting in the grading queue.
    const late = i === roster.length - 1;
    const submittedAt = late ? at(-8, -6) : at(-10, -(i + 2));
    // The late student's answer is first in the list; everyone else gets one of the others.
    const text = late ? ANSWERS[0] : ANSWERS[1 + (i % (ANSWERS.length - 1))];
    const links = i === 3 ? [{ label: 'Repository', url: 'https://example.com/meera/two-sum' }] : [];
    const [s] = await db
      .insert(submissions)
      .values({
        assignmentId: a1.id,
        orgId: nb,
        userId: uid,
        version: 1,
        status: late ? 'submitted' : 'graded',
        text,
        links,
        submittedAt,
        isLate: late,
        receiptCode: shortCode(10),
        contentHash: sha256(JSON.stringify({ text, links: links.map((l) => l.url), fileIds: [] })),
        savedAt: submittedAt,
        createdAt: at(-12),
      })
      .returning();
    a1Subs.push({ id: s.id, userId: uid });
    if (uid === ctx.users.student) studentSubmissionId = s.id;
    if (late) continue;
    const pick = picks[i % picks.length];
    const rubricScores = PROGRAMMING_RUBRIC.map((c, k) => ({ criterionId: c.id, levelLabel: pick[k], points: c.levels.find((l) => l.label === pick[k])!.points }));
    const points = rubricScores.reduce((sum, r) => sum + r.points, 0);
    const raw = Math.round((points / 16) * 100 * 100) / 100;
    const releasedAt = at(-6);
    const [e] = await db
      .insert(evaluations)
      .values({ submissionId: s.id, graderId: fac, rubricScores, rawScore: raw, latePenalty: 0, finalScore: raw, feedback: FEEDBACK[i % FEEDBACK.length], privateComment: i === 2 ? 'Check in about pacing; seemed rushed.' : null, released: true, releasedAt, createdAt: at(-7) })
      .returning();
    for (const sk of a1.skillIds) {
      await addEvidence({ userId: uid, skillId: sk, source: 'assessment', sourceType: 'assignment_submission', sourceId: s.id, score: e.finalScore / 100, verified: true, verifiedBy: fac, orgId: nb, note: `Graded assignment: ${a1.title}` });
    }
  }
  for (const s of a1Subs) await computeSimilarity(s.id);

  if (studentSubmissionId) {
    const [ev] = await db.select().from(evaluations).where(eq(evaluations.submissionId, studentSubmissionId));
    await db.insert(submissionComments).values({ submissionId: studentSubmissionId, authorId: ctx.users.student, body: 'Could you say more about what was missing in the complexity analysis?', visibility: 'shared', createdAt: at(-5) });
    await db.insert(regradeRequests).values({
      orgId: nb,
      subjectType: 'assignment_submission',
      subjectId: studentSubmissionId,
      requesterId: ctx.users.student,
      reason: 'I stated both time and space complexity and justified the space bound in the last paragraph, so I believe complexity analysis should be Excellent.',
      status: 'open',
      previousScore: ev?.finalScore ?? null,
      createdAt: at(-4),
    });
  }

  // ---------- Peer review round on Assignment 1: window open, some reviews in, a few flags ----------
  {
    const reviewees = roster.map((uid) => ({ ownerKey: uid, members: [uid] }));
    const pairs = planInitialAllocation(reviewees, roster, 2, a1.id);
    const [kabir, ananya, dev, sara, arjun] = [ctx.users.students[1], ctx.users.students[2], ctx.users.students[3], ctx.users.students[4], ctx.users.students[5]];
    await db.insert(teachPeerSettings).values({
      assignmentId: a1.id,
      orgId: nb,
      enabled: true,
      reviewsPerSubmission: 2,
      openMode: 'manual',
      closesAt: at(2),
      minCommentLength: 80,
      peerWeightPercent: 20,
      outlierThresholdPercent: 25,
      state: 'open',
      openedAt: at(-9),
      openedBy: fac,
      allocatedAt: at(-9),
      allocationSeed: a1.id,
      allocationNote: { submitters: roster.length, reviewers: roster.length, target: 2, shortfalls: [], message: null },
    });
    // Opening and suggestion lists of coprime lengths, so every seeded comment is different.
    const OPENINGS = [
      'The hash map approach is explained step by step and the complexity is justified.',
      'Clear structure and good variable names throughout the solution.',
      'I liked that you compared the brute force and the dictionary versions.',
      'Correct idea and readable code that follows the instructions.',
      'The write-up is short but every step of the algorithm is there.',
    ];
    const SUGGESTIONS = [
      'Adding a test where the pair uses the same value twice would make it stronger.',
      'It would help to show the actual output for the empty array case.',
      'You could mention what happens when there is no valid pair, since the instructions ask for it.',
    ];
    const DEV_COMMENT = 'Good solution overall and it seems correct to me. The explanation is fine and the complexity is stated. Nice work on this one.';
    const statusOf = (p: (typeof pairs)[number], n: number): 'assigned' | 'draft' | 'submitted' => {
      if (p.ownerKey === ctx.users.student && p.reviewerId !== ctx.users.student) return 'submitted';
      if (p.reviewerId === ctx.users.student || p.reviewerId === arjun) return 'assigned';
      if (p.reviewerId === sara && n === 0) return 'draft';
      return 'submitted';
    };
    // Planned statuses, so the demo outlier is a review whose submission has other submitted
    // reviews to compare against (an outlier is measured against the median of the others).
    const planned = (() => {
      const seen = new Map<string, number>();
      return pairs.map((p) => {
        const n = seen.get(p.reviewerId) ?? 0;
        seen.set(p.reviewerId, n + 1);
        return statusOf(p, n);
      });
    })();
    const submittedFor = (owner: string) => pairs.filter((x, k) => x.ownerKey === owner && planned[k] === 'submitted').length;
    const outlierCandidates = pairs
      .map((p, k) => ({ p, k }))
      .filter(({ p, k }) => planned[k] === 'submitted' && p.ownerKey !== ctx.users.student && p.reviewerId !== dev && p.reviewerId !== ananya && submittedFor(p.ownerKey) >= 2);
    const outlierIndex = (outlierCandidates.find(({ p }) => p.reviewerId === kabir) ?? outlierCandidates[0])?.k ?? -1;
    const counts = new Map<string, number>();
    for (const [i, p] of pairs.entries()) {
      const n = counts.get(p.reviewerId) ?? 0;
      counts.set(p.reviewerId, n + 1);
      const sub = a1Subs.find((x) => x.userId === p.ownerKey)!;
      const ownerIdx = roster.indexOf(p.ownerKey);
      const status = statusOf(p, n);
      // Realistic picks near the instructor's view of the work; one review is an outlier
      // (every criterion at the lowest level).
      const base = picks[ownerIdx % picks.length];
      const levels = i === outlierIndex ? ['Beginning', 'Beginning', 'Beginning', 'Beginning'] : base;
      const rubricPicks = PROGRAMMING_RUBRIC.map((c, k) => ({ criterionId: c.id, levelLabel: levels[k], ...(k === 2 && i % 3 === 0 ? { comment: 'The complexity section is easy to follow.' } : {}) }));
      const comment = p.reviewerId === dev ? DEV_COMMENT : p.reviewerId === ananya && n === 0 ? 'Looks fine to me, good job.' : `${OPENINGS[i % OPENINGS.length]} ${SUGGESTIONS[i % SUGGESTIONS.length]}`;
      const scored = scorePeerPicks(PROGRAMMING_RUBRIC, rubricPicks, 100, true);
      const submittedAt = at(-8, i);
      await db.insert(teachPeerReviews).values({
        orgId: nb,
        assignmentId: a1.id,
        submissionId: sub.id,
        ownerKey: p.ownerKey,
        reviewerId: p.reviewerId,
        status,
        rubricScores: status === 'assigned' ? [] : status === 'draft' ? scored.rubricScores.slice(0, 2) : scored.rubricScores,
        comment: status === 'assigned' ? null : status === 'draft' ? 'Started: the approach is clear so far.' : comment,
        score: status === 'submitted' ? scored.score : null,
        savedAt: status === 'assigned' ? null : submittedAt,
        submittedAt: status === 'submitted' ? submittedAt : null,
        createdAt: at(-9, i / 100),
      });
    }
  }

  // ---------- Assignment 2: open, due in 3 days, drafts and a submission ----------
  const [a2] = await db
    .insert(assignments)
    .values({
      orgId: nb,
      courseId: course.id,
      cohortId: cohort.id,
      authorId: fac,
      title: 'Assignment 2: Stack-based expression evaluator',
      objectives: ['Implement a stack', 'Evaluate postfix expressions', 'Handle invalid input gracefully'],
      instructions:
        '## Task\nWrite a function that evaluates an arithmetic expression in postfix notation (for example `3 4 + 2 *`).\n\n## Requirements\n1. Use an explicit stack.\n2. Report a clear error for malformed input.\n3. Explain the time complexity.\n\nSubmit your code as text, or a link to a repository, or attach a file.',
      availableFrom: at(-4),
      dueAt: at(3),
      maxPoints: 100,
      rubricId: rubric.id,
      rubricSnapshot: PROGRAMMING_RUBRIC,
      submissionTypes: ['text', 'file', 'link'],
      acceptedFileTypes: ['txt', 'md', 'zip', 'pdf'],
      collaboration: 'individual',
      latePolicy: { allowLate: true, penaltyPercentPerDay: 10, hardCutoffDays: 2 },
      allowResubmission: true,
      maxResubmissions: 1,
      skillIds: [skill('stacks-queues'), skill('complexity')].filter(Boolean) as string[],
      status: 'published',
      releasePolicy: 'manual',
      createdAt: at(-5),
    })
    .returning();
  const drafts = [ctx.users.student, ctx.users.students[0], ctx.users.students[2]];
  for (const [i, uid] of drafts.entries()) {
    await db.insert(submissions).values({
      assignmentId: a2.id,
      orgId: nb,
      userId: uid,
      version: 1,
      status: 'draft',
      text: i === 0 ? 'def evaluate(tokens):\n    stack = []\n    for t in tokens:\n        # TODO: handle operators\n        stack.append(int(t))\n' : 'Work in progress: pushing operands, popping two values for each operator.',
      savedAt: at(-1, -i),
      createdAt: at(-2),
    });
  }
  const early = ctx.users.students[1];
  const earlyText =
    'I tokenise the input on whitespace and push numbers onto a list used as a stack. For each operator I pop the right operand, then the left, apply the operation and push the result. If the stack has fewer than two values for an operator, or more than one value at the end, I raise ValueError with a message. Each token is processed once, so the time is O(n) and the stack uses O(n) space.';
  await db.insert(submissions).values({
    assignmentId: a2.id,
    orgId: nb,
    userId: early,
    version: 1,
    status: 'submitted',
    text: earlyText,
    submittedAt: at(-1, -3),
    isLate: false,
    receiptCode: shortCode(10),
    contentHash: sha256(JSON.stringify({ text: earlyText, links: [], fileIds: [] })),
    savedAt: at(-1, -3),
  });

  // ---------- Attendance: 4 sessions ----------
  const topics = ['Hash maps and collisions', 'Two-pointer technique', 'Stacks and queues', 'Expression evaluation'];
  for (const [i, topic] of topics.entries()) {
    const [s] = await db.insert(attendanceSessions).values({ orgId: nb, cohortId: cohort.id, courseId: course.id, heldOn: dateOnly(-14 + i * 4), topic, takenBy: fac }).returning();
    await db.insert(attendanceMarks).values(
      roster.map((uid, k) => ({
        sessionId: s.id,
        userId: uid,
        // The last student misses most sessions (shows an attendance-based at-risk flag with a reason).
        status: k === roster.length - 1 ? (i === 0 ? 'present' : 'absent') : k === 2 && i === 1 ? 'late' : k === 4 && i === 2 ? 'excused' : 'present',
      })),
    );
  }

  // ---------- Riverside: separate cohort/course/assignment (tenant isolation demo) ----------
  const rv = ctx.orgs.riverside;
  const rvFac = ctx.users.riversideFaculty;
  const [rvCohort] = await db.insert(cohorts).values({ orgId: rv, name: 'BSc CS 2026 · Group 1', kind: 'section', graduationYear: 2026, ownerId: rvFac }).returning();
  await db.insert(cohortMembers).values([
    { cohortId: rvCohort.id, userId: rvFac, role: 'instructor' },
    { cohortId: rvCohort.id, userId: ctx.users.riversideStudent, role: 'student' },
  ]);
  const [rvCourse] = await db.insert(courses).values({ orgId: rv, code: 'CS110', title: 'CS110 Programming Fundamentals', description: 'Variables, control flow and functions.', ownerId: rvFac }).returning();
  await db.insert(courseCohorts).values({ courseId: rvCourse.id, cohortId: rvCohort.id });
  await db.insert(courseInstructors).values({ courseId: rvCourse.id, userId: rvFac, role: 'instructor' });
  const [rvA] = await db
    .insert(assignments)
    .values({
      orgId: rv,
      courseId: rvCourse.id,
      cohortId: rvCohort.id,
      authorId: rvFac,
      title: 'Lab 1: FizzBuzz variations',
      objectives: ['Use loops and conditionals'],
      instructions: 'Write FizzBuzz, then a version where the divisors are parameters. Explain how you tested it.',
      availableFrom: at(-2),
      dueAt: at(5),
      maxPoints: 20,
      submissionTypes: ['text'],
      status: 'published',
    })
    .returning();
  const rvText = 'for i in range(1, 101): print("Fizz" * (i % 3 == 0) + "Buzz" * (i % 5 == 0) or i)';
  await db.insert(submissions).values({ assignmentId: rvA.id, orgId: rv, userId: ctx.users.riversideStudent, version: 1, status: 'submitted', text: rvText, submittedAt: at(-1), receiptCode: shortCode(10), contentHash: sha256(rvText), savedAt: at(-1) });

}
