import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { scenario, expect, login, person, api, uniqueEmail, demo, BASE } from './recorder';

/*
 * Teaching, assignments, assessments, content creation, mentorship and community.
 *
 * Scenarios build on each other where that reads naturally (the assignment created in
 * teach-02 is submitted in teach-03, graded in teach-04 and re-evaluated in teach-05), but
 * every scenario first makes sure what it needs exists, so each one can also run alone.
 */

const TEACH = 'Teaching and assignments';
const COMMUNITY = 'Mentorship and community';
const FACULTY = { workspace: 'teach', orgName: 'Northbridge' };
const COHORT_NAME = 'CSE 2027 · Section A';

const RUBRIC_TITLE = 'Stack lab rubric';
const LAB_TITLE = 'Lab 3: Queue built from two stacks';
const LAB_ANSWER =
  'I keep two stacks: an inbox for enqueue and an outbox for dequeue.\n\nEnqueue pushes onto the inbox. Dequeue pops from the outbox; when the outbox is empty I move every item from the inbox to the outbox first, which reverses their order so the oldest item is on top.\n\nEach item is moved at most once, so enqueue is O(1) and dequeue is amortised O(1). I tested an empty queue, a single item and interleaved enqueue/dequeue calls.';
const FEEDBACK = 'Clear two-stack design and a good explanation of why dequeue is amortised O(1). Next time add a test for dequeuing from an empty queue.';
const PRIVATE_NOTE = 'Check with the TA: the wording is close to last year’s sample answer.';

/** Local "YYYY-MM-DDTHH:mm" for datetime-local inputs. */
function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function inDays(days: number, hour = 17) {
  const d = new Date(Date.now() + days * 86400_000);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const LEVELS = [
  { label: 'Excellent', points: 4 },
  { label: 'Proficient', points: 3 },
  { label: 'Developing', points: 2 },
  { label: 'Beginning', points: 1 },
];

async function cohortId(fac: APIRequestContext) {
  const r = await api(fac, 'get', '/api/teach/cohorts');
  const c = r.body.items.find((x: { name: string }) => x.name === COHORT_NAME);
  expect(c, 'demo cohort').toBeTruthy();
  return c.id as string;
}

/** Finds the lab assignment (created through the UI in teach-02) or creates and publishes it through the API. */
async function ensureLab(fac: APIRequestContext): Promise<string> {
  const list = await api(fac, 'get', '/api/teach/assignments');
  const found = list.body.items.find((a: { title: string; status: string }) => a.title === LAB_TITLE);
  if (found && found.status === 'published') return found.id;
  if (found) {
    expect((await api(fac, 'post', `/api/teach/assignments/${found.id}/publish`, {})).status).toBeLessThan(300);
    return found.id;
  }
  const rubrics = await api(fac, 'get', '/api/teach/rubrics');
  let rubric = rubrics.body.items.find((r: { title: string }) => r.title === RUBRIC_TITLE);
  if (!rubric) {
    const r = await api(fac, 'post', '/api/teach/rubrics', {
      title: RUBRIC_TITLE,
      criteria: [
        { id: 'correct', title: 'Correctness', description: 'Both operations behave like a queue, including edge cases.', levels: LEVELS },
        { id: 'explain', title: 'Explanation', description: 'Explains the approach and its running time.', levels: LEVELS },
      ],
    });
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    rubric = r.body.rubric;
  }
  const created = await api(fac, 'post', '/api/teach/assignments', {
    cohortId: await cohortId(fac),
    courseId: null,
    title: LAB_TITLE,
    objectives: ['Implement a queue using only stack operations', 'Explain amortised running time'],
    instructions: '## Task\nImplement a FIFO queue using two stacks.\n\n## What to submit\n- Your code or pseudocode\n- The running time of enqueue and dequeue, with a reason',
    availableFrom: null,
    dueAt: inDays(5).toISOString(),
    maxPoints: 50,
    rubricId: rubric.id,
    submissionTypes: ['text'],
    acceptedFileTypes: [],
    collaboration: 'individual',
    latePolicy: { allowLate: true, penaltyPercentPerDay: 10, hardCutoffDays: 3 },
    allowResubmission: true,
    maxResubmissions: 1,
    skillIds: [],
    releasePolicy: 'manual',
  });
  expect(created.status, JSON.stringify(created.body)).toBeLessThan(300);
  const id = created.body.assignment.id;
  expect((await api(fac, 'post', `/api/teach/assignments/${id}/publish`, {})).status).toBeLessThan(300);
  return id;
}

/** Makes sure Rohan has submitted the lab. */
async function ensureSubmitted(student: APIRequestContext, assignmentId: string) {
  const mine = await api(student, 'get', `/api/teach/my/assignments/${assignmentId}`);
  if (mine.body.current) return;
  await api(student, 'put', `/api/teach/my/assignments/${assignmentId}/draft`, { text: LAB_ANSWER, links: [], fileIds: [] });
  const sub = await api(student, 'post', `/api/teach/my/assignments/${assignmentId}/submit`, { text: LAB_ANSWER, links: [], fileIds: [], confirm: true });
  expect(sub.status, JSON.stringify(sub.body)).toBeLessThan(300);
}

async function rohanSubmissionId(fac: APIRequestContext, assignmentId: string) {
  const q = await api(fac, 'get', `/api/teach/grading/queue?assignmentId=${assignmentId}&status=all`);
  const row = q.body.items.find((i: { student: { name: string } }) => i.student.name === 'Rohan Iyer');
  expect(row, 'Rohan in the grading queue').toBeTruthy();
  return row.submissionId as string;
}

/** Makes sure Rohan's lab has a released grade (done through the UI in teach-04). */
async function ensureReleased(fac: APIRequestContext, assignmentId: string) {
  const sid = await rohanSubmissionId(fac, assignmentId);
  const d = await api(fac, 'get', `/api/teach/submissions/${sid}`);
  if (d.body.current?.released) return sid;
  const criteria = d.body.assignment.rubric as { id: string; title: string }[];
  const ev = await api(fac, 'post', `/api/teach/submissions/${sid}/evaluations`, {
    rubricScores: criteria.map((c) => ({ criterionId: c.id, levelLabel: c.title === 'Correctness' ? 'Proficient' : 'Excellent' })),
    feedback: FEEDBACK,
    privateComment: PRIVATE_NOTE,
    release: true,
  });
  expect(ev.status, JSON.stringify(ev.body)).toBeLessThan(300);
  return sid;
}

const dialog = (p: Page) => p.getByRole('dialog');

/** Scrolls an element to the middle of the screen so the screenshot shows it with context. */
async function center(l: Locator) {
  await l.first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
}

// =====================================================================================
// Teaching and assignments
// =====================================================================================

scenario(
  {
    id: 'teach-01-overview',
    area: TEACH,
    title: 'Teaching overview: what needs attention today',
    summary: 'An instructor opens the Teach workspace and sees, on one page, how much work is waiting to be graded, which deadlines are coming up, and which students may need a check-in, each with the exact rule that flagged them.',
    roles: ['Faculty'],
  },
  async (rec, { page }) => {
    await login(page, demo('faculty'), FACULTY);
    const ov = (await api(page.request, 'get', '/api/teach/overview')).body;

    await rec.step(
      'Open the teaching overview',
      'Dr. Neha Kulkarni opens the Teach workspace. Four tiles summarise the grading backlog (work waiting, graded but not released, open regrade requests) and how many students may need a check-in. Below are upcoming deadlines, the "Check in with" list and her cohorts.',
      async () => {
        await page.goto(`${BASE}/app/teach`);
        await expect(page.getByRole('heading', { name: 'Teaching overview' })).toBeVisible();
        await expect(page.getByText('Waiting to be graded')).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('The "Waiting to be graded" tile shows the real number of ungraded submissions', async () => {
      const tile = page.locator('a[href="/app/teach/grading?status=ungraded"]');
      await expect(tile).toContainText(String(ov.backlog.ungraded));
    });

    await rec.check('Every flagged student shows the reason from the at-risk rules', async () => {
      expect(ov.atRisk.length).toBeGreaterThan(0);
      for (const s of ov.atRisk) for (const r of s.reasons) await expect(page.getByText(r.text).first()).toBeVisible();
    });

    await rec.step(
      'Open an upcoming deadline',
      'Clicking "Assignment 2" under Upcoming deadlines opens its Submissions tab: every student in the cohort with their status (not started, draft, submitted, late, graded), so she can see who still has work to hand in.',
      async () => {
        await page.getByRole('link', { name: 'Assignment 2: Stack-based expression evaluator' }).click();
        await page.getByRole('tab', { name: /Submissions/ }).click();
        await expect(page.getByText('Kabir Shah').first()).toBeVisible();
      },
    );

    await rec.step(
      'Jump straight into the grading backlog',
      'Clicking the "Waiting to be graded" tile opens the grading queue filtered to ungraded work. Late submissions carry a "Late" label so the instructor knows a penalty may apply.',
      async () => {
        await page.goto(`${BASE}/app/teach`);
        await page.locator('a[href="/app/teach/grading?status=ungraded"]').click();
        await expect(page.getByRole('heading', { name: 'Grading queue' })).toBeVisible();
        await expect(page.getByText('Late', { exact: true }).first()).toBeVisible();
      },
    );

    await rec.step(
      'All assignments with their status',
      'The assignments list shows every assignment for her cohorts with its status (draft, published, closed), due date and how many students have submitted.',
      async () => {
        await page.goto(`${BASE}/app/teach/assignments`);
        await expect(page.getByRole('heading', { name: 'Assignments', exact: true })).toBeVisible();
        await expect(page.getByText('Assignment 2: Stack-based expression evaluator').first()).toBeVisible();
      },
    );
  },
);

scenario(
  {
    id: 'teach-02-create-assignment',
    area: TEACH,
    title: 'Build a rubric and publish a new assignment',
    summary: 'The instructor creates a reusable grading rubric, then writes a new assignment with objectives, instructions (with a live preview), a due date, points, the rubric, a late policy explained in plain words and one allowed resubmission, and publishes it to her cohort after a checklist.',
    roles: ['Faculty'],
  },
  async (rec, { page }) => {
    await login(page, demo('faculty'), FACULTY);
    const cid = await cohortId(page.request);

    await rec.step(
      'Open the rubric library',
      'Rubrics are shared across the organization and versioned. The existing "Programming assignment rubric" shows its criteria count, total points and version.',
      async () => {
        await page.goto(`${BASE}/app/teach/rubrics`);
        await expect(page.getByRole('heading', { name: 'Rubrics' })).toBeVisible();
        await expect(page.getByText('Programming assignment rubric')).toBeVisible();
      },
    );

    await rec.step(
      'Describe a new rubric',
      'She names the rubric and edits the two starting criteria: "Correctness" and "Explanation", each with four levels from Excellent (4 points) to Beginning (1 point). The total updates as she types (8 points). Rubric points are later scaled to the assignment’s maximum points.',
      async () => {
        await page.getByRole('button', { name: 'New rubric' }).click();
        const d = dialog(page);
        await d.getByLabel('Title', { exact: true }).fill(RUBRIC_TITLE);
        await d.getByLabel('Description for criterion 1').fill('Both operations behave like a queue, including edge cases.');
        await d.getByLabel('Criterion 2', { exact: true }).fill('Explanation');
        await d.getByLabel('Description for criterion 2').fill('Explains the approach and its running time.');
        await expect(d.getByText('Total: 8 points')).toBeVisible();
      },
    );

    await rec.step(
      'Save the rubric',
      'The rubric is saved as version 1 and appears in the library, ready to attach to any assignment.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Create rubric' }).click();
        await expect(dialog(page)).toHaveCount(0);
        await expect(page.getByText(RUBRIC_TITLE, { exact: true }).first()).toBeVisible();
        await expect(page.getByText(/2 criteria · 8 points · version 1/).first()).toBeVisible();
      },
    );

    await rec.step(
      'Start a new assignment',
      'From Assignments she clicks "New assignment", picks the cohort and course, gives it a title and adds two learning objectives so students know what the work is for.',
      async () => {
        await page.goto(`${BASE}/app/teach/assignments`);
        await page.getByRole('link', { name: 'New assignment' }).click();
        await expect(page.getByRole('heading', { name: 'New assignment' })).toBeVisible();
        await page.getByLabel('Cohort', { exact: true }).selectOption(cid);
        await page.getByLabel(/^Course/).selectOption({ label: 'CS201 · CS201 Data Structures' });
        await page.getByLabel('Title', { exact: true }).fill(LAB_TITLE);
        await page.getByRole('button', { name: 'Add objective' }).click();
        await page.getByLabel('Objective 1', { exact: true }).fill('Implement a queue using only stack operations');
        await page.getByRole('button', { name: 'Add objective' }).click();
        await page.getByLabel('Objective 2', { exact: true }).fill('Explain amortised running time');
      },
    );

    await rec.step(
      'Write the instructions and preview them',
      'Instructions are written in simple formatting (headings and bullet lists). The "Preview" switch shows exactly what students will see.',
      async () => {
        await page.locator('#instructions').fill('## Task\nImplement a FIFO queue using **two stacks**.\n\n## What to submit\n- Your code or pseudocode\n- The running time of enqueue and dequeue, with a reason\n- The edge cases you tested');
        await page.getByRole('radio', { name: 'Preview' }).click();
        await expect(page.getByRole('heading', { name: 'What to submit' })).toBeVisible();
      },
    );

    await rec.step(
      'Set the due date, points and rubric',
      'The assignment is due in five days at 5 pm and is worth 50 points. Choosing the new rubric shows its criteria and levels right on the form.',
      async () => {
        await page.getByLabel('Due', { exact: true }).fill(localInput(inDays(5)));
        await page.getByLabel('Maximum points', { exact: true }).fill('50');
        await page.locator('select').filter({ has: page.locator('option', { hasText: 'No rubric' }) }).selectOption({ label: `${RUBRIC_TITLE} (v1)` });
        await expect(page.getByText('8 rubric points in total, scaled to the assignment\'s maximum points.')).toBeVisible();
      },
    );

    await rec.step(
      'Allow one resubmission and explain the late policy',
      'She allows one resubmission (every version is kept). Late work loses 10% per started day and closes 3 days after the deadline. The blue box shows the exact sentence students will read, with a worked example.',
      async () => {
        await page.getByRole('switch', { name: /Allow resubmission/ }).click();
        await page.getByLabel('Penalty per started day late (%)').fill('10');
        await page.getByLabel(/Close submissions this many days/).fill('3');
        await expect(page.getByText('What students will read')).toBeVisible();
        await expect(page.getByText(/Late work loses 10% of its score for each started day after the due time; submissions close 3 days after the due time\./)).toBeVisible();
        await center(page.getByText('What students will read'));
      },
    );

    await rec.step(
      'Save as a draft and review the publish checklist',
      'Saving creates a draft that students cannot see yet. The publish checklist on the right confirms the title, instructions, a future due date, students in the cohort, rubric points and objectives.',
      async () => {
        await page.getByRole('button', { name: 'Create draft' }).click();
        await expect(page).toHaveURL(/\/app\/teach\/assignments\/[0-9a-f-]{36}/);
        await expect(page.getByText('Publish checklist')).toBeVisible();
        await expect(page.getByText('Due date in the future')).toBeVisible();
      },
    );

    await rec.step(
      'Publish to the cohort',
      'Publishing asks for confirmation: every student in the cohort is notified, and the rubric, collaboration mode and maximum points lock so grades stay comparable.',
      async () => {
        await page.getByRole('button', { name: `Publish to ${COHORT_NAME}` }).click();
        await expect(dialog(page).getByRole('heading', { name: 'Publish this assignment?' })).toBeVisible();
      },
    );

    await rec.step(
      'The assignment is live',
      'The assignment is now published. A confirmation says how many students were notified, and the status panel shows the due date and the late policy.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Publish', exact: true }).click();
        await expect(page.getByText(/Published\. \d+ students notified\./)).toBeVisible();
        await expect(page.getByText('Status', { exact: true })).toBeVisible();
      },
    );

    await rec.check('The assignment is published with the rubric copied in and the late policy saved', async () => {
      const list = await api(page.request, 'get', '/api/teach/assignments');
      const a = list.body.items.find((x: { title: string }) => x.title === LAB_TITLE);
      expect(a.status).toBe('published');
      const d = await api(page.request, 'get', `/api/teach/assignments/${a.id}`);
      expect(d.body.rubric.criteria.map((c: { title: string }) => c.title)).toEqual(['Correctness', 'Explanation']);
      expect(d.body.assignment.latePolicy).toMatchObject({ allowLate: true, penaltyPercentPerDay: 10, hardCutoffDays: 3 });
      expect(d.body.assignment.allowResubmission).toBe(true);
    });
  },
);

scenario(
  {
    id: 'teach-03-student-submits',
    area: TEACH,
    title: 'A student drafts and submits an assignment',
    summary: 'Rohan, a student in the cohort, opens the new assignment, writes his answer (drafts save automatically), confirms it is his own work and submits. He gets a receipt with a code and a fingerprint of exactly what he submitted.',
    roles: ['Student'],
  },
  async (rec, { page, browser }) => {
    const fac = await person(browser, demo('faculty'), FACULTY);
    const labId = await ensureLab(fac.page.request);
    await login(page, demo('student'));

    await rec.step(
      'See the new assignment in the list',
      'Rohan’s Assignments page lists upcoming work with due dates, plus a deadline calendar and course announcements on the side.',
      async () => {
        await page.goto(`${BASE}/app/assignments`);
        await expect(page.getByRole('heading', { name: 'Assignments', exact: true })).toBeVisible();
        await expect(page.getByText(LAB_TITLE).first()).toBeVisible();
      },
    );

    await rec.step(
      'Open the assignment',
      'The page shows the instructions, the learning objectives, how it will be graded (the rubric), the late policy and the rules. An optional AI guide can explain concepts but will not write the submission.',
      async () => {
        await page.getByText(LAB_TITLE).first().click();
        await expect(page.getByRole('heading', { name: LAB_TITLE })).toBeVisible();
        await expect(page.getByText('How it will be graded')).toBeVisible();
      },
      { fullPage: true },
    );

    await rec.step(
      'Write a draft: it saves automatically',
      'He types his answer. A moment after he stops typing, the indicator changes to "Draft saved". Drafts are private until he submits.',
      async () => {
        await page.getByLabel('Written answer', { exact: true }).fill(LAB_ANSWER);
        await expect(page.getByText(/Draft saved/)).toBeVisible({ timeout: 15_000 });
      },
    );

    await rec.step(
      'The draft survives a page reload',
      'Even after reloading the page, his text is still there, so nothing is lost if the browser closes.',
      async () => {
        await page.reload();
        await expect(page.getByLabel('Written answer', { exact: true })).toHaveValue(/inbox for enqueue/);
      },
    );

    await rec.step(
      'Review before submitting',
      '"Review and submit" opens a summary: the word count, whether it is on time, and a statement that this is his own work. The Submit button stays disabled until he ticks the statement.',
      async () => {
        await page.getByRole('button', { name: 'Review and submit' }).click();
        await expect(dialog(page).getByText('Submit your work?')).toBeVisible();
        await expect(dialog(page).getByText(/On time\. Due/)).toBeVisible();
        await expect(dialog(page).getByRole('button', { name: 'Submit', exact: true })).toBeDisabled();
      },
    );

    await rec.step(
      'Submit and get a receipt',
      'After confirming, the work is submitted and a receipt appears with a short code, the version, the time, "On time", and a fingerprint (a hash of exactly what was submitted) he can use as proof later.',
      async () => {
        await dialog(page).getByRole('checkbox').click();
        await dialog(page).getByRole('button', { name: 'Submit', exact: true }).click();
        await expect(page.getByText('Receipt code', { exact: true })).toBeVisible();
        await expect(page.getByText('Fingerprint', { exact: true })).toBeVisible();
      },
    );

    await rec.check('The receipt code on screen matches the stored submission', async () => {
      const mine = await api(page.request, 'get', `/api/teach/my/assignments/${labId}`);
      expect(mine.body.current.receiptCode).toBeTruthy();
      await expect(page.getByText(mine.body.current.receiptCode).first()).toBeVisible();
    });

    await rec.step(
      'Submitted work and version history',
      'The page now shows the submitted version with its receipt. Because one resubmission is allowed, he could still revise and resubmit; earlier versions are always kept.',
      async () => {
        await page.getByRole('button', { name: 'Hide receipt' }).click();
        await expect(page.getByText('Submitted work (version 1)')).toBeVisible();
      },
    );

    await rec.check('The submission is now waiting in the instructor’s grading queue', async () => {
      const q = await api(fac.page.request, 'get', `/api/teach/grading/queue?assignmentId=${labId}&status=ungraded`);
      expect(q.body.items.some((i: { student: { name: string } }) => i.student.name === 'Rohan Iyer')).toBe(true);
    });
    await fac.ctx.close();
  },
);

scenario(
  {
    id: 'teach-04-grading',
    area: TEACH,
    title: 'Grade with a rubric, private comment and optional AI suggestion',
    summary: 'The instructor grades Rohan’s submission: she picks a level for each rubric criterion and watches the total update, can ask the AI for a suggestion (clearly labelled as only a suggestion), writes feedback plus a private comment only instructors see, then saves and releases. A late submission shows how the late penalty is explained.',
    roles: ['Faculty'],
  },
  async (rec, { page, browser }) => {
    const stu = await person(browser, demo('student'));
    await login(page, demo('faculty'), FACULTY);
    const labId = await ensureLab(page.request);
    await ensureSubmitted(stu.page.request, labId);
    await stu.ctx.close();

    await rec.step(
      'Open the grading queue for the lab',
      'The queue lists the latest submitted version from each student, oldest first. Rohan’s lab is waiting with a "Grade" button.',
      async () => {
        await page.goto(`${BASE}/app/teach/grading?assignmentId=${labId}&status=ungraded`);
        await expect(page.getByRole('heading', { name: 'Grading queue' })).toBeVisible();
        await expect(page.getByRole('row', { name: /Rohan Iyer/ })).toBeVisible();
      },
    );

    await rec.step(
      'The grading screen',
      'On the left is Rohan’s submission (with on-time status and similarity check); on the right, the rubric with one row of levels per criterion, feedback boxes and the evaluation controls.',
      async () => {
        await page.getByRole('row', { name: /Rohan Iyer/ }).getByRole('link', { name: 'Grade' }).click();
        await expect(page.getByRole('heading', { name: 'Rohan Iyer' })).toBeVisible();
        await expect(page.getByText('Submitted on time: no late penalty.')).toBeVisible();
      },
    );

    await rec.step(
      'Score each rubric criterion: the total updates live',
      'She chooses "Proficient" for Correctness and "Excellent" for Explanation. The summary box instantly shows 7 of 8 rubric points, scaled to 43.75 out of 50, with no late penalty because it was on time.',
      async () => {
        await page.getByRole('radiogroup', { name: 'Correctness' }).getByRole('radio', { name: /Proficient/ }).check();
        await page.getByRole('radiogroup', { name: 'Explanation' }).getByRole('radio', { name: /Excellent/ }).check();
        await expect(page.getByText('7 / 8')).toBeVisible();
        await expect(page.getByText('43.75 / 50')).toBeVisible();
      },
    );

    await rec.step(
      'Optional: ask the AI for a suggestion',
      'The "AI suggestion" panel can propose rubric levels from the instructions, rubric and answer. It is clearly labelled as a suggestion: it never sets a score, and the instructor decides. (If the AI service is busy, the panel says so and grading works the same.)',
      async () => {
        const ask = page.getByRole('button', { name: 'Get AI suggestion' });
        await center(ask);
        if (await ask.isEnabled()) {
          await ask.click();
          const result = page.getByRole('button', { name: 'Copy into the form for review' }).or(page.getByText('No suggestion', { exact: true }));
          await expect(result).toBeVisible({ timeout: 90_000 });
          await center(page.getByRole('button', { name: 'Ask again' }).or(page.getByText('No suggestion', { exact: true })));
        } else {
          await expect(page.getByText('AI is not available')).toBeVisible();
        }
      },
    );

    await rec.step(
      'Write feedback and a private comment',
      'Feedback is what Rohan will read. The separate private comment, marked "Only instructors see this", is for colleagues and is never shown to the student.',
      async () => {
        await page.getByLabel('Feedback for the student', { exact: true }).fill(FEEDBACK);
        await page.locator('#private-comment').fill(PRIVATE_NOTE);
        await expect(page.locator('label[for="private-comment"]').getByText('Only instructors see this')).toBeVisible();
      },
    );

    await rec.step(
      'Save and release the grade',
      'She clicks "Save and release". Rohan is notified, and the evaluation history records the score, who graded it, and that it was released.',
      async () => {
        await page.getByRole('button', { name: 'Save and release' }).click();
        await expect(page.getByText('Saved and released. The student was notified.')).toBeVisible();
        await expect(page.getByText('Evaluation history')).toBeVisible();
        await center(page.getByText('Evaluation history'));
      },
    );

    await rec.check('A released evaluation of 43.75 / 50 is stored, with the private comment kept separately', async () => {
      const sid = await rohanSubmissionId(page.request, labId);
      const d = await api(page.request, 'get', `/api/teach/submissions/${sid}`);
      expect(d.body.current.released).toBe(true);
      expect(d.body.current.finalScore).toBe(43.75);
      expect(d.body.current.privateComment).toBe(PRIVATE_NOTE);
    });

    await rec.step(
      'A late submission explains its penalty',
      'For comparison she opens Arjun’s Assignment 1, which was submitted late. After picking levels (not saved here), the summary shows the deduction and explains it in words: how many started days late, what percentage is deducted, and the policy.',
      async () => {
        const q = await api(page.request, 'get', '/api/teach/grading/queue?status=ungraded');
        const late = q.body.items.find((i: { isLate: boolean; student: { name: string } }) => i.isLate && i.student.name === 'Arjun Rao') ?? q.body.items.find((i: { isLate: boolean }) => i.isLate);
        expect(late, 'a late submission waiting to be graded').toBeTruthy();
        await page.goto(`${BASE}/app/teach/grading/${late.submissionId}`);
        await expect(page.getByRole('radiogroup', { name: 'Correctness' })).toBeVisible();
        for (const group of await page.getByRole('radiogroup').all()) {
          const name = await group.getAttribute('aria-label');
          if (name && !/Left panel|Comment visibility/.test(name)) await group.getByRole('radio', { name: /Proficient/ }).check();
        }
        await expect(page.getByText(/Submitted \d+ started days? late, so \d+% of the raw score is deducted\./)).toBeVisible();
        await center(page.getByText('Late penalty', { exact: true }));
      },
    );
    await rec.check('The late penalty is shown as a deduction in the live total', async () => {
      await expect(page.getByText(/^-\d+(\.\d+)?$/).first()).toBeVisible();
    });
  },
);

scenario(
  {
    id: 'teach-05-feedback-and-regrade',
    area: TEACH,
    title: 'Student reads feedback, asks a question and requests a regrade',
    summary: 'Rohan sees his released grade and feedback (never the private instructor comment), asks for clarification and requests a regrade. The instructor answers, re-evaluates with a written reason, and the history keeps both evaluations: nothing is overwritten.',
    roles: ['Student', 'Faculty'],
  },
  async (rec, { page, browser }) => {
    const fac = await person(browser, demo('faculty'), FACULTY);
    const labId = await ensureLab(fac.page.request);
    await login(page, demo('student'));
    await ensureSubmitted(page.request, labId);
    const sid = await ensureReleased(fac.page.request, labId);

    await rec.step(
      'Rohan opens his graded lab',
      'The Feedback card shows his score (43.75 / 50), which level he got for each rubric criterion and the instructor’s written feedback.',
      async () => {
        await page.goto(`${BASE}/app/assignments/${labId}`);
        await expect(page.getByText(FEEDBACK)).toBeVisible();
        await expect(page.getByText('43.75')).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('The private instructor comment is not visible to the student', async () => {
      await expect(page.getByText(PRIVATE_NOTE)).toHaveCount(0);
      const raw = JSON.stringify((await api(page.request, 'get', `/api/teach/my/assignments/${labId}`)).body);
      expect(raw).not.toContain('last year');
    });

    await rec.step(
      'Ask a clarification question',
      'Under "Questions about feedback" he asks what an empty-queue test should check. Only he and his instructors can see this conversation.',
      async () => {
        await page.getByLabel('Your question', { exact: true }).fill('What should the empty-queue test check: an error, or returning nothing?');
        await page.getByRole('button', { name: 'Send question' }).click();
        await expect(page.getByText('Question sent to your instructor')).toBeVisible();
      },
    );

    await rec.step(
      'Request a regrade',
      'He believes Correctness deserves "Excellent" and explains why, referring to the rubric. The request goes to the instructor, who must answer it.',
      async () => {
        await page.getByRole('button', { name: 'Request a regrade' }).click();
        await dialog(page).getByLabel('Reason', { exact: true }).fill('My answer handles the empty queue and interleaved calls (last paragraph), so I believe Correctness meets the Excellent level.');
      },
    );

    await rec.step(
      'The request is pending',
      'After sending, the feedback card shows "Regrade pending". He will be notified of the decision.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Send request' }).click();
        await expect(page.getByText('Regrade pending')).toBeVisible();
      },
    );

    await rec.step(
      'The instructor sees the request in her queue',
      'On the "Regrades" tab of the grading queue, Rohan’s lab is marked "Regrade requested" with a "Review request" button.',
      async () => {
        await fac.page.goto(`${BASE}/app/teach/grading?assignmentId=${labId}&status=regrade`);
        await expect(fac.page.getByRole('row', { name: /Rohan Iyer/ }).getByRole('link', { name: 'Review request' })).toBeVisible();
      },
      { page: fac.page },
    );

    await rec.step(
      'She answers the question',
      'The grading screen shows the regrade reason and, under Comments, Rohan’s question. She replies with "Student can see" selected, so the answer goes to Rohan.',
      async () => {
        await fac.page.goto(`${BASE}/app/teach/grading/${sid}`);
        await expect(fac.page.getByText('Regrade requested')).toBeVisible();
        await fac.page.getByLabel('Comment', { exact: true }).fill('It should raise a clear error rather than return nothing. Your code does this; it just needs a test.');
        await fac.page.getByRole('button', { name: 'Send reply' }).click();
        await expect(fac.page.getByText('It should raise a clear error rather than return nothing.')).toBeVisible();
      },
      { page: fac.page },
    );

    await rec.step(
      'Re-evaluate with a reason',
      'She agrees, changes Correctness to "Excellent" and writes a decision note. "Adjust to 50" records a new evaluation using the note as the reason. The evaluation history now shows the new one as Current and the earlier one as Superseded: nothing is overwritten.',
      async () => {
        await fac.page.getByRole('radiogroup', { name: 'Correctness' }).getByRole('radio', { name: /Excellent/ }).check();
        await fac.page.getByLabel('Decision note for the student', { exact: true }).fill('Agreed: the empty-queue case is handled. Correctness raised to Excellent.');
        await fac.page.getByRole('button', { name: 'Adjust to 50' }).click();
        await expect(fac.page.getByText('Superseded').first()).toBeVisible();
        await center(fac.page.getByText('Evaluation history'));
      },
      { page: fac.page },
    );

    await rec.check('Both evaluations are kept: the first is superseded, the new one has the reason', async () => {
      const d = await api(fac.page.request, 'get', `/api/teach/submissions/${sid}`);
      expect(d.body.evaluations.length).toBeGreaterThanOrEqual(2);
      expect(d.body.evaluations.filter((e: { supersededBy: string | null }) => !!e.supersededBy).length).toBeGreaterThanOrEqual(1);
      expect(d.body.current.finalScore).toBe(50);
      expect(d.body.current.reason).toContain('Correctness raised to Excellent');
    });

    await rec.step(
      'Rohan sees the decision',
      'Rohan’s page now shows 50 / 50, the badge "Grade adjusted" with the instructor’s note, her reply to his question, and a grade history listing both released evaluations.',
      async () => {
        await page.reload();
        await expect(page.getByText('Grade adjusted')).toBeVisible();
        await expect(page.getByText('It should raise a clear error rather than return nothing.')).toBeVisible();
        await page.getByText(/Grade history \(2 released evaluations\)/).click();
      },
      { fullPage: true },
    );
    await rec.check('The student still never sees the private comment', async () => expect(page.getByText(PRIVATE_NOTE)).toHaveCount(0));
    await fac.ctx.close();
  },
);

scenario(
  {
    id: 'teach-06-similarity-and-integrity',
    area: TEACH,
    title: 'Similarity indicator and an academic integrity report',
    summary: 'Two students handed in very similar answers to Assignment 1. The instructor sees a similarity indicator that is explicitly worded as "not proof", compares the texts side by side, files an integrity report and records a decision. The student is only told the outcome.',
    roles: ['Faculty', 'Student'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('faculty'), FACULTY);
    const a1 = (await api(page.request, 'get', '/api/teach/assignments')).body.items.find((a: { title: string }) => /Assignment 1/.test(a.title));
    const q = await api(page.request, 'get', `/api/teach/grading/queue?assignmentId=${a1.id}&status=all`);
    const dev = q.body.items.find((i: { student: { name: string } }) => i.student.name === 'Dev Malhotra');

    await rec.step(
      'Similarity shows up in the queue',
      'In the grading queue for Assignment 1, two submissions carry a "Similarity 49%" label. Hovering explains: "Similarity indicator. Not proof of plagiarism."',
      async () => {
        await page.goto(`${BASE}/app/teach/grading?assignmentId=${a1.id}&status=all`);
        await expect(page.getByText(/Similarity \d+%/).first()).toBeVisible();
      },
    );

    await rec.step(
      'Open the similarity panel',
      'On Dev Malhotra’s submission, the Similarity panel lists the closest match (Rohan Iyer, 49%) and states clearly that this is an indicator, not proof.',
      async () => {
        await page.goto(`${BASE}/app/teach/grading/${dev.submissionId}`);
        await expect(page.getByText('Similarity indicator. Not proof of plagiarism; review the texts side by side.').first()).toBeVisible();
        await page.getByText('How this is calculated').click();
        await center(page.getByText('How this is calculated'));
      },
    );
    await rec.check('The similarity wording says it is not proof', async () => {
      const d = await api(page.request, 'get', `/api/teach/submissions/${dev.submissionId}`);
      expect(d.body.similarity.wording).toMatch(/Not proof/);
      expect(d.body.similarity.maxScore).toBeGreaterThan(0.4);
    });

    await rec.step(
      'Compare the two answers side by side',
      '"Compare" opens both texts next to each other with the shared five-word sequences listed below, so the instructor judges the actual wording rather than a number.',
      async () => {
        await page.getByRole('button', { name: 'Compare' }).first().click();
        await expect(dialog(page).getByText(/Shared five-word sequences/)).toBeVisible();
      },
    );

    await rec.step(
      'File an integrity report',
      'She closes the comparison and files a report describing what she observed. The form reminds her that a similarity score alone is not evidence. Students are not notified while a report is open.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Close' }).click();
        await page.getByRole('button', { name: 'File a report' }).click();
        await dialog(page).getByLabel('Report note', { exact: true }).fill('Two paragraphs match Rohan Iyer’s answer almost word for word. Asking both students how they worked before deciding.');
      },
    );

    await rec.step(
      'The report is open',
      'The Academic integrity panel now lists the open report with "Clear" and "Confirm concern" buttons. Nothing has been shown to the student yet.',
      async () => {
        await dialog(page).getByRole('button', { name: 'File report' }).click();
        await expect(page.getByText('Open', { exact: true }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: 'Confirm concern' })).toBeVisible();
      },
    );

    await rec.step(
      'Record the decision',
      'After talking to both students she clears the report and writes the outcome. The student is notified of the outcome and can read this note.',
      async () => {
        await page.getByRole('button', { name: 'Clear', exact: true }).click();
        await dialog(page).getByLabel('Outcome note', { exact: true }).fill('Both students showed their own earlier drafts; they studied from the same lecture notes. No concern.');
        await dialog(page).getByRole('button', { name: 'Record decision' }).click();
        await expect(page.getByText('Cleared', { exact: true })).toBeVisible();
      },
    );

    const devPage = await person(browser, demo('student5'));
    await rec.step(
      'The student sees only the outcome',
      'When Dev opens Assignment 1, a green banner says the academic integrity review closed with no concern found, with the instructor’s note. He never saw the open report.',
      async () => {
        await devPage.page.goto(`${BASE}/app/assignments/${a1.id}`);
        await expect(devPage.page.getByText('Academic integrity review closed: no concern found')).toBeVisible();
      },
      { page: devPage.page },
    );
    await rec.check('The report is stored as cleared with the outcome note', async () => {
      const d = await api(page.request, 'get', `/api/teach/submissions/${dev.submissionId}`);
      expect(d.body.integrityReports[0].status).toBe('cleared');
    });
    await devPage.ctx.close();
  },
);

const Q_SINGLE = 'Stack order';
const Q_SHORT = 'Why a stack for postfix';
const QUIZ_TITLE = 'Quiz 2: Stacks and queues';

/** Makes sure the stacks quiz exists and is published (built through the UI in teach-07). */
async function ensureQuiz(fac: APIRequestContext): Promise<string> {
  const list = await api(fac, 'get', '/api/assessments/manage');
  const items = list.body.items ?? list.body.assessments ?? [];
  const found = items.find((a: { title: string }) => a.title === QUIZ_TITLE);
  if (found?.status === 'published') return found.id;
  const q1 = await api(fac, 'post', '/api/assessments/questions', {
    type: 'single', title: Q_SINGLE, difficulty: 'easy', points: 1, topics: ['stacks'], skillIds: [],
    content: { prompt: 'In which order does a stack return items?', options: [{ id: 'a', text: 'First in, first out' }, { id: 'b', text: 'Last in, first out' }, { id: 'c', text: 'Smallest first' }] },
    answerKey: { correct: ['b'] },
  });
  const q2 = await api(fac, 'post', '/api/assessments/questions', {
    type: 'short_text', title: Q_SHORT, difficulty: 'medium', points: 4, topics: ['stacks'], skillIds: [],
    content: { prompt: 'In one or two sentences, explain why a stack suits evaluating postfix expressions.' },
    answerKey: { modelAnswer: 'Operands are pushed and the two most recent are popped for each operator (last in, first out).', rubric: [{ criterion: 'Mentions last in, first out', points: 2 }, { criterion: 'Links it to operators using the latest operands', points: 2 }] },
  });
  const id = found?.id ?? (await api(fac, 'post', '/api/assessments', { title: QUIZ_TITLE, mode: 'classroom', cohortId: await cohortId(fac), settings: { resultRelease: 'immediate', showAnswersAfterRelease: false, maxAttempts: 1 } })).body.assessment.id;
  await api(fac, 'put', `/api/assessments/${id}/items`, { items: [{ questionId: q1.body.question.id }, { questionId: q2.body.question.id }] });
  expect((await api(fac, 'post', `/api/assessments/${id}/publish`, {})).status).toBeLessThan(300);
  return id;
}

scenario(
  {
    id: 'teach-07-question-bank-and-assessment',
    area: TEACH,
    title: 'Question bank and a classroom quiz',
    summary: 'The instructor writes two reusable questions (a single-choice question and a short written answer with a grading guide), builds a classroom quiz from them, checks the publish checklist and publishes it to her cohort.',
    roles: ['Faculty'],
  },
  async (rec, { page }) => {
    await login(page, demo('faculty'), FACULTY);
    const cid = await cohortId(page.request);

    await rec.step(
      'Open the question bank',
      'The question bank holds reusable questions for exams, quizzes and screenings. Editing a question creates a new version; published quizzes keep the version they were published with.',
      async () => {
        await page.goto(`${BASE}/app/teach/questions`);
        await expect(page.getByRole('heading', { name: 'Question bank' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'New question' }).first()).toBeVisible();
      },
    );

    await rec.step(
      'Write a single-choice question',
      'She writes the question and three options and marks the correct one. The "Candidate preview" on the right shows exactly what students will see; the answer key is never shown to them.',
      async () => {
        await page.getByRole('button', { name: 'New question' }).first().click();
        const d = dialog(page);
        await d.getByLabel('Title', { exact: true }).fill(Q_SINGLE);
        await d.getByLabel('Question', { exact: true }).fill('In which order does a stack return items?');
        await d.getByLabel('Option 1', { exact: true }).fill('First in, first out');
        await d.getByLabel('Option 2', { exact: true }).fill('Last in, first out');
        await d.getByLabel('Option 3', { exact: true }).fill('Smallest first');
        await d.getByLabel('Option 2 is correct').check();
        await expect(d.getByText('Candidate preview')).toBeVisible();
      },
    );

    await rec.step(
      'Write a short-answer question with a grading guide',
      'After saving the first question, she adds a short written-answer question. Written answers are graded by a person, so she adds a model answer and two rubric rows that graders will see.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Create question' }).click();
        await expect(page.getByText('Question created.')).toBeVisible();
        await page.getByRole('button', { name: 'New question' }).first().click();
        const d = dialog(page);
        await d.getByLabel('Type', { exact: true }).selectOption({ label: 'Short answer' });
        await d.getByLabel('Title', { exact: true }).fill(Q_SHORT);
        await d.getByLabel('Question', { exact: true }).fill('In one or two sentences, explain why a stack suits evaluating postfix expressions.');
        await d.getByLabel('Default points', { exact: true }).fill('4');
        await d.getByLabel(/^Model answer/).fill('Operands are pushed and the two most recent are popped for each operator (last in, first out).');
        await d.getByRole('button', { name: 'Add criterion' }).click();
        await d.getByLabel('Criterion', { exact: true }).last().fill('Mentions last in, first out');
        await d.getByLabel('Points', { exact: true }).last().fill('2');
        await d.getByRole('button', { name: 'Add criterion' }).click();
        await d.getByLabel('Criterion', { exact: true }).last().fill('Links it to operators using the latest operands');
        await d.getByLabel('Points', { exact: true }).last().fill('2');
      },
    );

    await rec.step(
      'Both questions are in the bank',
      'The bank now lists both questions with their type, difficulty and points, ready to reuse in any quiz.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Create question' }).click();
        await expect(page.getByText('Question created.').first()).toBeVisible();
        await expect(page.getByText(Q_SHORT).first()).toBeVisible();
        await expect(page.getByText(Q_SINGLE).first()).toBeVisible();
      },
    );

    await rec.step(
      'Create a classroom quiz for the cohort',
      'On the Assessments page she clicks "New assessment", names the quiz, keeps the kind "Classroom exam" and chooses her cohort, so every student in it can take the quiz once published.',
      async () => {
        await page.goto(`${BASE}/app/teach/assessments`);
        await page.getByRole('button', { name: 'New assessment' }).click();
        const d = dialog(page);
        await d.getByLabel('Title', { exact: true }).fill(QUIZ_TITLE);
        await d.getByLabel('Kind', { exact: true }).selectOption({ label: 'Classroom exam' });
        await d.getByLabel(/^Cohort/).selectOption(cid);
        await d.getByLabel(/^Description/).fill('Two questions, about 10 minutes. Closed book.');
      },
    );

    await rec.step(
      'Add the questions from the bank',
      'The draft opens. On the Questions tab, "Add from bank" lists the organization’s questions; she ticks both new ones and adds them.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Create draft' }).click();
        await expect(page.getByText('Draft: only managers can see it.')).toBeVisible();
        await page.getByRole('tab', { name: /Questions/ }).click();
        await page.getByRole('button', { name: 'Add from bank' }).click();
        const d = dialog(page);
        await d.getByLabel(`Select ${Q_SINGLE}`).first().check();
        await d.getByLabel(`Select ${Q_SHORT}`).first().check();
      },
    );

    await rec.step(
      'Save the questions and check the publish checklist',
      'After saving, the quiz has 2 questions worth 5 points (1 for the single-choice question, 4 for the written answer). The publish checklist on the right shows no blocking problems, only a note that written answers need a reviewer, so those results are released after grading.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Add 2 questions' }).click();
        await page.getByRole('button', { name: 'Save questions' }).click();
        await expect(page.getByText('Questions saved.')).toBeVisible();
        await expect(page.getByText(/Written, file and oral answers need a reviewer/)).toBeVisible();
      },
    );

    await rec.step(
      'Publish the quiz',
      'Publishing asks for confirmation and explains that question versions are frozen and cohort members can start it during its window.',
      async () => {
        await page.getByRole('button', { name: 'Publish', exact: true }).click();
        await expect(dialog(page).getByRole('heading', { name: 'Publish this assessment?' })).toBeVisible();
      },
    );

    await rec.step(
      'The quiz is published to the cohort',
      'The quiz is live. On the People tab a banner confirms it is assigned to the whole cohort; individual students can also be invited, with personal due dates or extra time as accommodations.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Publish', exact: true }).click();
        await expect(page.getByText(/^Published /).first()).toBeVisible();
        await page.getByRole('tab', { name: 'People' }).click();
        await expect(page.getByText(`Assigned to cohort ${COHORT_NAME}`)).toBeVisible();
      },
    );

    await rec.check('The quiz is published with both questions and assigned to the cohort', async () => {
      const id = page.url().match(/assessments\/([0-9a-f-]{36})/)![1];
      const d = await api(page.request, 'get', `/api/assessments/${id}`);
      expect(d.body.assessment.status).toBe('published');
      expect(d.body.checklist.itemCount).toBe(2);
      expect(d.body.cohort?.name ?? d.body.assessment.cohortId).toBeTruthy();
    });
  },
);

scenario(
  {
    id: 'teach-08-assessment-results',
    area: TEACH,
    title: 'Students take the quiz; the instructor grades and reads the results',
    summary: 'Rohan takes the quiz in the browser. Two classmates also submit. The single-choice question is marked automatically; the written answers wait in the grading queue, where the instructor scores them. The Results tab then shows completion, score distribution and per-question statistics.',
    roles: ['Student', 'Faculty'],
  },
  async (rec, { page, browser }) => {
    const fac = await person(browser, demo('faculty'), FACULTY);
    const quizId = await ensureQuiz(fac.page.request);
    await login(page, demo('student'));

    await rec.step(
      'Rohan opens the quiz',
      'Before starting, the overview lists the number of questions and points, attempts allowed, when results are released and the organizer’s rules.',
      async () => {
        await page.goto(`${BASE}/app/assessments/${quizId}`);
        await expect(page.getByRole('heading', { name: QUIZ_TITLE })).toBeVisible();
        await expect(page.getByText('Before you start')).toBeVisible();
      },
    );

    await rec.step(
      'Answer the questions',
      'He starts the attempt, picks "Last in, first out" and moves to the second question to write his short answer. Answers save as he goes, and the navigator on the right shows which questions are answered.',
      async () => {
        await page.getByRole('button', { name: /Start assessment/ }).click();
        await dialog(page).getByRole('button', { name: 'Start' }).click();
        await expect(page).toHaveURL(/assessments\/attempts\//);
        await page.getByRole('radio', { name: 'Last in, first out' }).check();
        await page.getByRole('button', { name: /Next/ }).click();
        await page.locator('main textarea').first().fill('Each operator uses the two most recently pushed operands, which is exactly last in, first out.');
      },
    );

    await rec.step(
      'Submit the answers',
      'After confirming, the quiz is submitted. The single-choice question is marked automatically, but the written answer needs the instructor, so the result page says the answers are submitted and waiting to be graded.',
      async () => {
        await page.getByRole('button', { name: 'Review and submit' }).click();
        await dialog(page).getByRole('button', { name: 'Submit answers' }).click();
        await expect(page).toHaveURL(/\/result/, { timeout: 30_000 });
      },
    );

    // Two classmates submit too (behind the scenes), so the results have a distribution.
    for (const [who, choice, text] of [
      ['student2', 'b', 'Because the last operands pushed are the first ones popped (LIFO).'],
      ['student3', 'a', 'A stack keeps things in order.'],
    ] as const) {
      const s = await person(browser, demo(who));
      const at = await api(s.page.request, 'post', `/api/assessments/${quizId}/attempts`, {});
      if (at.body?.attempt?.status === 'in_progress') {
        const view = await api(s.page.request, 'get', `/api/assessments/attempts/${at.body.attempt.id}`);
        for (const it of view.body.items) {
          const answer = it.question.type === 'single' ? { choice } : { text };
          await api(s.page.request, 'put', `/api/assessments/attempts/${at.body.attempt.id}/answers/${it.question.id}`, { answer });
        }
        await api(s.page.request, 'post', `/api/assessments/attempts/${at.body.attempt.id}/submit`, {});
      }
      await s.ctx.close();
    }

    await expect
      .poll(async () => (await api(fac.page.request, 'get', `/api/assessments/${quizId}/grading-queue`)).body.items?.length ?? 0, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(3);

    await rec.step(
      'Written answers wait in the grading queue',
      'On the instructor’s Grading tab, each written answer is listed by student. She sees the question, the student’s answer, the model answer and rubric, and an optional AI suggestion labelled "review before accepting".',
      async () => {
        await fac.page.goto(`${BASE}/app/teach/assessments/${quizId}?tab=grading`);
        await expect(fac.page.getByRole('list', { name: 'Answers to grade' })).toBeVisible();
        await fac.page.getByRole('list', { name: 'Answers to grade' }).getByRole('button', { name: /Rohan Iyer/ }).click();
        await expect(fac.page.getByText('Each operator uses the two most recently pushed operands').first()).toBeVisible();
      },
      { page: fac.page },
    );

    await rec.step(
      'Score the answers',
      'She gives Rohan 4 of 4 with a short comment and saves. She scores the other two answers the same way. When every answer in an attempt is scored, that result is released automatically (this quiz releases results immediately).',
      async () => {
        await fac.page.getByLabel(/Score \(0 to 4\)/).fill('4');
        await fac.page.getByLabel(/^Feedback for the candidate/).fill('Exactly right: you linked LIFO to how operators consume operands.');
        await fac.page.getByRole('button', { name: 'Save score' }).click();
        await expect(fac.page.getByText(/Saved\. All answers graded and results released\.|Saved\. Attempt fully graded/)).toBeVisible();
        for (const [name, score] of [['Meera Nair', '4'], ['Kabir Shah', '1']] as const) {
          const item = fac.page.getByRole('list', { name: 'Answers to grade' }).getByRole('button', { name: new RegExp(name) });
          if (await item.count()) {
            await item.click();
            await fac.page.getByLabel(/Score \(0 to 4\)/).fill(score);
            await fac.page.getByRole('button', { name: 'Save score' }).click();
            await expect(fac.page.getByText(/Saved\./).first()).toBeVisible();
          }
        }
      },
      { page: fac.page },
    );

    await rec.step(
      'Results: completion and score distribution',
      'The Results tab summarises how many students submitted, the completion rate and the mean and median score (no pass mark was set for this quiz), with a chart of how scores are spread.',
      async () => {
        await fac.page.getByRole('tab', { name: 'Results' }).click();
        await expect(fac.page.getByText('Completion rate')).toBeVisible();
        await expect(fac.page.getByText('Score distribution (best attempt per candidate)')).toBeVisible();
      },
      { page: fac.page, fullPage: true },
    );

    await rec.step(
      'Per-question statistics',
      'The Questions view shows, for each question, the average score and how well it separates stronger from weaker students, which helps improve the question bank over time.',
      async () => {
        await fac.page.getByRole('tab', { name: /^Questions/ }).last().click();
        await expect(fac.page.getByText(Q_SINGLE).last()).toBeVisible();
      },
      { page: fac.page },
    );

    await rec.check('All three attempts are graded and the results show three submissions', async () => {
      const r = await api(fac.page.request, 'get', `/api/assessments/${quizId}/results`);
      expect(r.body.summary.submitted).toBeGreaterThanOrEqual(3);
      expect(r.body.summary.needsReview).toBe(0);
    });
    await rec.check('Rohan can now see his released result', async () => {
      const mine = await api(page.request, 'get', '/api/assessments/my/attempts');
      const raw = JSON.stringify(mine.body);
      expect(raw).toContain(QUIZ_TITLE);
      expect(raw).toContain('released');
    });
    await fac.ctx.close();
  },
);

scenario(
  {
    id: 'teach-09-cohorts-attendance-analytics',
    area: TEACH,
    title: 'Cohort roster, quick attendance and at-risk analytics',
    summary: 'The instructor checks her cohort’s roster and progress, takes attendance for today’s class in a few clicks, reviews per-student attendance, then opens analytics to see which students may need support and why, and sends one of them a supportive message that is logged as an intervention.',
    roles: ['Faculty'],
  },
  async (rec, { page }) => {
    await login(page, demo('faculty'), FACULTY);
    const cid = await cohortId(page.request);
    const before = (await api(page.request, 'get', `/api/teach/attendance/sessions?cohortId=${cid}`)).body.items.length;

    await rec.step(
      'Open the cohort',
      'The cohort page shows the number of students, completion of past-due work, the average score and how many students meet a check-in rule, followed by the roster with each student’s progress.',
      async () => {
        await page.goto(`${BASE}/app/teach/cohorts`);
        await page.getByText(COHORT_NAME).first().click();
        await expect(page.getByRole('heading', { name: COHORT_NAME })).toBeVisible();
        await expect(page.getByText('Rohan Iyer').first()).toBeVisible();
      },
      { fullPage: true },
    );

    await rec.step(
      'Attendance history',
      'The Attendance page lists earlier class sessions for the cohort with the topic and how many students were present.',
      async () => {
        await page.goto(`${BASE}/app/teach/attendance`);
        await expect(page.getByRole('heading', { name: 'Attendance' })).toBeVisible();
        await expect(page.getByText('Expression evaluation').first()).toBeVisible();
      },
    );

    await rec.step(
      'Take attendance in a few clicks',
      'For today’s class she types the topic, clicks "Mark everyone else present", then marks Arjun absent and Meera late. Keyboard shortcuts (P, A, L, E) also work for fast marking.',
      async () => {
        await page.getByRole('button', { name: 'Take attendance' }).first().click();
        await page.getByLabel(/^Topic/).fill('Queues from two stacks');
        await page.getByRole('button', { name: 'Mark everyone else present' }).click();
        await page.getByRole('radiogroup', { name: 'Status for Arjun Rao' }).getByRole('radio', { name: 'Absent' }).click();
        await page.getByRole('row', { name: /^Meera Nair/ }).focus();
        await page.keyboard.press('l');
        await expect(page.getByRole('radiogroup', { name: 'Status for Meera Nair' }).getByRole('radio', { name: 'Late' })).toHaveAttribute('aria-checked', 'true');
      },
    );

    await rec.step(
      'Save the session',
      'After saving, the new session appears at the top of the history.',
      async () => {
        await page.getByRole('button', { name: 'Save attendance' }).click();
        await expect(page.getByText(/Attendance saved/)).toBeVisible();
        await expect(page.getByText('Queues from two stacks').first()).toBeVisible();
      },
    );
    await rec.check('A new attendance session was recorded', async () => {
      const after = (await api(page.request, 'get', `/api/teach/attendance/sessions?cohortId=${cid}`)).body.items.length;
      expect(after).toBe(before + 1);
    });

    await rec.step(
      'Attendance per student',
      'The "Per student" tab shows each student’s attendance percentage. Present and late count as attended; excused absences are left out of the calculation.',
      async () => {
        await page.getByRole('tab', { name: 'Per student' }).click();
        await expect(page.getByText('Arjun Rao').first()).toBeVisible();
      },
    );

    await rec.step(
      'Analytics: who needs support, and why',
      'Cohort analytics shows completion, on-time rate and average score, each with a definition. The Students table lists who to check in with and the exact reason, such as low attendance or a low average.',
      async () => {
        await page.goto(`${BASE}/app/teach/analytics`);
        await expect(page.getByRole('heading', { name: 'Cohort analytics' })).toBeVisible();
        await expect(page.getByText(/Attendance \d+% in marked sessions/).first()).toBeVisible();
        await center(page.getByText('Why flagged'));
      },
    );

    await rec.step(
      'Plan an intervention',
      'She selects Arjun and clicks "Plan intervention". She chooses a supportive message, which he will receive as a notification. Every intervention is logged so she can follow up.',
      async () => {
        await page.getByRole('checkbox', { name: 'Select Arjun Rao' }).click();
        await page.getByRole('button', { name: 'Plan intervention' }).click();
        await dialog(page).getByLabel('Message to the student', { exact: true }).fill('I noticed you missed the last few classes. Is anything getting in the way? Office hours are Thursday 3 to 5, and I can share the notes.');
      },
    );

    await rec.step(
      'The intervention is logged',
      'After sending, the Interventions list shows the message, who it was for and when, with a "Mark done" button for follow-up.',
      async () => {
        await dialog(page).getByRole('button', { name: /Send|Log/ }).click();
        await expect(page.getByText(/Sent to 1 student and logged/)).toBeVisible();
        await center(page.getByText('Interventions', { exact: true }));
      },
    );
    await rec.check('The intervention for Arjun is stored', async () => {
      const r = await api(page.request, 'get', `/api/teach/interventions?cohortId=${cid}`);
      expect(JSON.stringify(r.body)).toContain('Office hours are Thursday');
    });
  },
);

scenario(
  {
    id: 'teach-10-creator-studio',
    area: TEACH,
    title: 'Publish a library resource with version history, and draft a learning path',
    summary: 'Omar, a content creator, writes a study note in the Creator studio, publishes it to his organization’s library, edits it (the old version is kept in the history), and starts a new learning path with its first topic as a draft.',
    roles: ['Content creator'],
  },
  async (rec, { page }) => {
    await login(page, demo('creator'), { workspace: 'create', orgName: 'LearnSphere Community' });
    const title = 'Queues in practice: buffers, schedulers and BFS';

    await rec.step(
      'Open the Creator studio',
      'The studio overview shows how Omar’s resources are used (views, ratings, completions, bookmarks), his drafts, items waiting for review and his learning paths.',
      async () => {
        await page.goto(`${BASE}/app/create`);
        await expect(page.getByRole('heading').first()).toBeVisible();
      },
    );

    await rec.step(
      'Write a new resource',
      'He creates a new article for his organization’s library: type, difficulty, a title, a short summary for library cards, and the body written in simple formatting.',
      async () => {
        await page.goto(`${BASE}/app/create/resources/new`);
        await expect(page.getByRole('heading', { name: 'New resource' })).toBeVisible();
        await page.getByLabel('Title', { exact: true }).fill(title);
        await page.getByLabel(/^Summary/).fill('Where queues show up in real systems, with three short examples.');
        await page.getByLabel('Body', { exact: true }).fill('# Queues in practice\n\n- **Buffers**: keyboards and network cards queue input until it is read.\n- **Schedulers**: print jobs and background tasks run in arrival order.\n- **Breadth-first search**: visits nodes level by level using a queue.\n');
      },
      { fullPage: true },
    );

    await rec.step(
      'Save the draft',
      'Saving creates a draft (version 1). The Publishing panel on the right shows its status and a Publish button; organization resources can be published directly.',
      async () => {
        await page.getByRole('button', { name: 'Save draft' }).first().click();
        await expect(page).toHaveURL(/create\/resources\/[0-9a-f-]{36}/);
        await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();
      },
    );

    await rec.step(
      'Publish to the organization library',
      'After publishing, the status changes to Published and a "View in library" link appears. Only members of his organization can see it.',
      async () => {
        await page.getByRole('button', { name: 'Publish' }).click();
        await expect(page.getByRole('link', { name: /View in library/ })).toBeVisible();
      },
    );

    await rec.step(
      'Edit it: a new version is created',
      'He adds a line about message queues and a change note, then saves. The resource becomes version 2; the earlier content is kept.',
      async () => {
        await page.getByLabel('Body', { exact: true }).fill('# Queues in practice\n\n- **Buffers**: keyboards and network cards queue input until it is read.\n- **Schedulers**: print jobs and background tasks run in arrival order.\n- **Breadth-first search**: visits nodes level by level using a queue.\n- **Message queues**: services hand work to each other without waiting.\n');
        await page.getByLabel(/^Change note/).fill('Added message queues.');
        await page.getByRole('button', { name: 'Save changes' }).first().click();
        await expect(page.getByText('Saved as version 2')).toBeVisible();
      },
    );

    await rec.step(
      'Version history',
      'The "Version history" tab lists the earlier snapshot (v1) with the date. Each one can be opened read-only.',
      async () => {
        await page.getByRole('tab', { name: /Version history/ }).click();
        await expect(page.getByText(`v1 · ${title}`)).toBeVisible();
      },
    );
    await rec.check('The resource is published as version 2 with version 1 kept', async () => {
      const id = page.url().match(/resources\/([0-9a-f-]{36})/)![1];
      const d = await api(page.request, 'get', `/api/create/resources/${id}`);
      expect(d.body.resource.status).toBe('published');
      expect(d.body.resource.version).toBe(2);
      expect(d.body.versions.length).toBeGreaterThanOrEqual(1);
    });

    await rec.step(
      'Start a learning path',
      'Under Learning paths he clicks "New path", gives it a title and a one-sentence summary. It starts as a draft that only editors can see.',
      async () => {
        await page.goto(`${BASE}/app/create/paths`);
        await page.getByRole('button', { name: 'New path' }).click();
        await dialog(page).getByLabel('Title', { exact: true }).fill('Queues and scheduling basics');
        await dialog(page).getByLabel(/^Summary/).fill('For beginners who know stacks and want to understand queues and where they are used.');
      },
    );

    await rec.step(
      'Add the first topic',
      'In the new path he adds a topic with a module name, an estimated time and short notes. Topics are the ordered steps learners follow.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Create path' }).click();
        await expect(page.getByText('No topics yet')).toBeVisible();
        await page.getByRole('button', { name: 'Add topic' }).first().click();
        const d = dialog(page);
        await d.getByLabel('Title', { exact: true }).fill('What a queue is');
        await d.getByLabel('Module', { exact: true }).fill('Foundations');
        await d.getByLabel('Minutes', { exact: true }).fill('20');
        await d.getByLabel(/^Notes/).fill('A queue serves items in arrival order: first in, first out.');
      },
    );

    await rec.step(
      'The path draft with its first topic',
      'The topic is saved and listed in the path. The path stays a draft until he publishes it.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Add topic' }).click();
        await expect(dialog(page).getByText('Topic saved')).toBeVisible();
        await dialog(page).getByRole('button', { name: 'Close', exact: true }).last().click();
        await expect(page.getByText('What a queue is')).toBeVisible();
      },
    );
    await rec.check('The learning path is a draft with one topic', async () => {
      const id = page.url().match(/paths\/([0-9a-f-]{36})/)![1];
      const d = await api(page.request, 'get', `/api/create/paths/${id}`);
      expect(d.body.path.status).toBe('draft');
      expect(d.body.topics.length).toBe(1);
    });
  },
);

// =====================================================================================
// Mentorship and community
// =====================================================================================

let menteeEmail: string | null = null;
const MENTEE_PASSWORD = 'mentee-pass-2026';

async function registerMentee(page: Page, name: string) {
  const email = uniqueEmail('mentee');
  expect((await api(page.request, 'post', '/api/auth/register', { name, email, password: MENTEE_PASSWORD })).status).toBe(201);
  await api(page.request, 'post', '/api/me/onboarding', {
    stage: 'career_switcher',
    targetRoles: ['Backend Developer'],
    selfRatedSkills: [
      { slug: 'sql-basics', level: 2 },
      { slug: 'http-rest', level: 2 },
      { slug: 'git', level: 3 },
    ],
  });
  return email;
}

async function linaId(req: APIRequestContext) {
  const r = await api(req, 'get', '/api/mentorship/mentors?q=Lina');
  return r.body.items.find((m: { name: string }) => m.name === 'Lina Park').userId as string;
}

scenario(
  {
    id: 'community-01-find-a-mentor',
    area: COMMUNITY,
    title: 'Find a mentor and request mentorship with clear data sharing',
    summary: 'A new learner searches for a mentor with filters, reads a mentor’s profile and sends a request. The request form explains, switch by switch, exactly what the mentor will be able to see; she shares her Skill DNA but keeps projects, assessment results and job applications private.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    const email = await registerMentee(page, 'Tara Mehta');
    menteeEmail = email;

    await rec.step(
      'Open Mentors',
      'The Mentors page explains that mentors only see the progress the learner chooses to share. Each card shows expertise, available days and whether the mentor is accepting requests.',
      async () => {
        await page.goto(`${BASE}/app/mentors`);
        await expect(page.getByRole('heading', { name: 'Mentors' })).toBeVisible();
      },
    );

    await rec.step(
      'Filter by expertise and availability',
      'Tara filters for "backend" expertise, mentors available on Tuesdays, and only those accepting requests. Lina Park matches.',
      async () => {
        await page.getByLabel('Expertise', { exact: true }).selectOption('backend');
        await page.getByLabel('Available on', { exact: true }).selectOption('2');
        await page.getByRole('checkbox', { name: 'Accepting requests' }).click();
        await expect(page.getByText('Lina Park')).toBeVisible();
      },
    );

    await rec.step(
      'Read the mentor profile',
      'Lina’s profile shows her background, expertise, rating and weekly availability in her local time.',
      async () => {
        await page.getByText('Lina Park').click();
        await expect(page.getByRole('button', { name: 'Request mentorship' })).toBeVisible();
        await expect(page.getByText('Availability')).toBeVisible();
      },
    );

    await rec.step(
      'Write the request and choose what to share',
      'The request form asks for a short message and goals. Under "What your mentor can see", each switch explains what it shares. Private messages, notes, journal and AI chats are never shared, and access ends when the mentorship ends.',
      async () => {
        await page.getByRole('button', { name: 'Request mentorship' }).click();
        const d = dialog(page);
        await d.getByLabel('Message', { exact: true }).fill('I am switching from data entry into backend development. I would love help choosing a first API project and preparing for interviews.');
        await d.getByLabel(/^Goals for the mentorship/).fill('Ship one API project and be interview-ready in 4 months.');
        await expect(d.getByText('What your mentor can see')).toBeVisible();
      },
    );

    await rec.step(
      'Keep projects private',
      'Skill DNA and Projects start switched on. She switches Projects off so Lina will only see her Skill DNA. Assessment results and job applications stay off.',
      async () => {
        const d = dialog(page);
        await d.getByRole('switch', { name: /^Projects/ }).click();
        await expect(d.getByRole('switch', { name: /^Projects/ })).toHaveAttribute('aria-checked', 'false');
        await expect(d.getByRole('switch', { name: /^Skill DNA/ })).toHaveAttribute('aria-checked', 'true');
      },
    );

    await rec.step(
      'Send the request',
      'After sending, the request appears under "My mentorships" as waiting for the mentor’s answer.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Send request' }).click();
        await expect(page.getByText('Request sent to Lina Park')).toBeVisible();
        await page.getByRole('tab', { name: /My mentorships/ }).click();
        await expect(page.getByText('Lina Park').first()).toBeVisible();
      },
    );
    await rec.check('The request is stored with only Skill DNA shared', async () => {
      const mine = await api(page.request, 'get', '/api/mentorship/mine');
      const m = mine.body.asMentee[0];
      expect(m.status).toBe('requested');
      expect(m.sharing ?? (await api(page.request, 'get', `/api/mentorship/${m.id}`)).body.mentorship.sharing).toMatchObject({ skillDna: true, projects: false, assessments: false, applications: false });
    });
  },
);

scenario(
  {
    id: 'community-02-mentor-workspace',
    area: COMMUNITY,
    title: 'Mentor accepts, reviews shared progress, sets a goal and schedules a session',
    summary: 'Lina accepts Tara’s request. The progress review shows only what Tara shared ("Not shared" for the rest). Lina sets a goal, schedules a session with a free Jitsi video link, and writes shared notes plus a private note marked "Only you can see this". Tara sees the goal and shared notes, but never the private note.',
    roles: ['Mentor', 'Learner'],
  },
  async (rec, { page, browser }) => {
    // The mentee from community-01, or a fresh one with a new request if that scenario did not run.
    const mentee = await person(browser, null);
    if (menteeEmail) {
      await login(mentee.page, menteeEmail, { password: MENTEE_PASSWORD });
    } else {
      menteeEmail = await registerMentee(mentee.page, 'Tara Mehta');
      const req = await api(mentee.page.request, 'post', '/api/mentorship/requests', {
        mentorId: await linaId(mentee.page.request),
        message: 'I am switching from data entry into backend development. I would love help choosing a first API project and preparing for interviews.',
        goalsSummary: 'Ship one API project and be interview-ready in 4 months.',
        sharing: { skillDna: true, projects: false, assessments: false, applications: false },
      });
      expect(req.status, JSON.stringify(req.body)).toBeLessThan(300);
    }
    await login(page, demo('mentor'), { workspace: 'mentor' });
    const privateNote = 'Very motivated; nervous about interviews. Start mock questions gently after the first project.';
    const sharedNote = 'First project: a REST API for a recipe box. Focus this week: SQL joins and HTTP status codes.';

    await rec.step(
      'Open the mentor workspace',
      'Lina’s workspace shows pending requests, active mentees against her capacity, upcoming sessions and open follow-ups. Each request shows the message, goals and badges for what the learner shares.',
      async () => {
        await page.goto(`${BASE}/app/mentor`);
        await expect(page.getByRole('heading', { name: 'Mentor workspace' })).toBeVisible();
        await expect(page.getByText('Tara Mehta').first()).toBeVisible();
      },
    );

    await rec.step(
      'Accept the request',
      'She clicks "Accept" on Tara’s request. Tara moves into Active mentees and is notified.',
      async () => {
        await page.locator('li', { hasText: 'Tara Mehta' }).getByRole('button', { name: 'Accept' }).click();
        await expect(page.getByText('Request accepted')).toBeVisible();
      },
    );

    const mine = await api(mentee.page.request, 'get', '/api/mentorship/mine');
    const mid = mine.body.asMentee.find((m: { status: string }) => m.status === 'active').id;

    await rec.step(
      'Progress review shows only shared data',
      'On Tara’s page, the "Progress review" tab is computed live from her records. Skill DNA is marked "Shared by mentee"; Projects, Assessment results and Job applications each say "Not shared".',
      async () => {
        await page.goto(`${BASE}/app/mentor/mentees/${mid}`);
        await page.getByRole('tab', { name: 'Progress review' }).click();
        await expect(page.getByText('Shared by mentee').first()).toBeVisible();
        await expect(page.getByText(/Not shared\. Your mentee has chosen not to share their projects/)).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('The mentor’s progress data contains no projects, assessments or applications', async () => {
      const p = await api(page.request, 'get', `/api/mentorship/${mid}/progress`);
      expect(p.body.skillDna.shared).toBe(true);
      expect(p.body.projects).toEqual({ shared: false });
      expect(p.body.assessments).toEqual({ shared: false });
      expect(p.body.applications).toEqual({ shared: false });
    });

    await rec.step(
      'Set a goal',
      'On "Plan and sessions", she adds a goal. It goes straight into Tara’s Goals page, labelled as set by her mentor.',
      async () => {
        await page.getByRole('tab', { name: 'Plan and sessions' }).click();
        await page.getByRole('button', { name: 'Add goal' }).click();
        await dialog(page).getByLabel('Goal', { exact: true }).fill('Ship the recipe box API with tests');
        await dialog(page).getByRole('button', { name: /Add goal|Save/ }).click();
        await expect(page.getByText('Goal added. Your mentee was notified.')).toBeVisible();
      },
    );

    await rec.step(
      'Schedule a session with a free video link',
      'She schedules a 45-minute session for later this week. "Jitsi (free)" creates a meeting link automatically, with no account needed.',
      async () => {
        await page.getByRole('button', { name: 'Schedule', exact: true }).click();
        const d = dialog(page);
        await d.getByLabel('Date and time', { exact: true }).fill(localInput(inDays(3, 18)));
        await d.getByLabel('Length', { exact: true }).selectOption('45');
        await d.getByLabel(/^Agenda/).fill('Pick the project scope and set up the repository');
        await expect(d.getByRole('radio', { name: 'Jitsi (free)' })).toHaveAttribute('aria-checked', 'true');
        await d.getByRole('button', { name: 'Schedule', exact: true }).click();
        await expect(page.getByText('Session scheduled')).toBeVisible();
        await expect(page.getByRole('link', { name: /Join meeting/ }).first()).toBeVisible();
      },
    );

    await rec.step(
      'Shared notes and a private note',
      'On "Notes and messages" she adds a shared note (both can see it) and a private note in the yellow box, labelled "Only you can see this. Never shared with your mentee."',
      async () => {
        await page.getByRole('tab', { name: 'Notes and messages' }).click();
        await page.getByLabel('New shared note').fill(sharedNote);
        await page.getByRole('button', { name: 'Add note' }).click();
        await expect(page.getByText(sharedNote)).toBeVisible();
        await page.getByLabel('New private note').fill(privateNote);
        await page.getByRole('button', { name: 'Save private note' }).click();
        await expect(page.getByText(privateNote)).toBeVisible();
        await expect(page.getByText('Only you can see this. Never shared with your mentee.')).toBeVisible();
      },
    );

    await rec.step(
      'Tara’s view of the mentorship',
      'Tara sees the goal from her mentor, the scheduled session with its Jitsi link, and the shared note. Her "What your mentor can see" switches let her change sharing at any time.',
      async () => {
        await mentee.page.goto(`${BASE}/app/mentors/m/${mid}`);
        await expect(mentee.page.getByText('Ship the recipe box API with tests')).toBeVisible();
        await expect(mentee.page.getByText(sharedNote)).toBeVisible();
      },
      { page: mentee.page, fullPage: true },
    );
    await rec.check('The mentee never sees the mentor’s private note (page and data)', async () => {
      await expect(mentee.page.getByText(privateNote)).toHaveCount(0);
      const raw = JSON.stringify((await api(mentee.page.request, 'get', `/api/mentorship/${mid}`)).body);
      expect(raw).not.toContain('nervous about interviews');
    });
    await rec.check('The session has a Jitsi meeting link', async () => {
      const d = await api(mentee.page.request, 'get', `/api/mentorship/${mid}`);
      expect(d.body.sessions.some((s: { meetingUrl: string | null }) => /^https:\/\/meet\.jit\.si\//.test(s.meetingUrl ?? ''))).toBe(true);
    });
    await mentee.ctx.close();
  },
);

scenario(
  {
    id: 'community-03-questions-and-moderation',
    area: COMMUNITY,
    title: 'Ask, answer, vote, accept, report, block and moderate',
    summary: 'Asha asks a Python question in the community. Rohan answers; Asha upvotes and accepts his answer. A spam reply appears: Asha reports it and blocks its author. The space moderator then reviews the report in the moderation queue and hides the content.',
    roles: ['Learner', 'Student', 'Moderator'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('learner'));
    const title = 'How do I read a file line by line without loading it all?';

    await rec.step(
      'Browse the community',
      'The Community page shows recent threads, with tabs for trending, unanswered, events, project showcases and team formation. On the side are "My spaces" and spaces to explore.',
      async () => {
        await page.goto(`${BASE}/app/community`);
        await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
        await expect(page.getByText('Python help').first()).toBeVisible();
      },
    );

    await rec.step(
      'Open the Python help space',
      'A space groups related threads. It can be searched, filtered by type and tag, and sorted by recent, top or unanswered.',
      async () => {
        await page.getByRole('link', { name: /Python help/ }).first().click();
        await expect(page.getByRole('heading', { name: 'Python help' })).toBeVisible();
      },
    );

    await rec.step(
      'Ask a question',
      'Asha clicks "New post", keeps the type "Question", writes a specific title and details, and adds tags. (Sensitive questions can be asked privately.)',
      async () => {
        await page.getByRole('button', { name: 'New post' }).click();
        const d = dialog(page);
        await d.getByLabel('Title', { exact: true }).fill(title);
        await d.getByLabel(/^Details/).fill('My log file is 3 GB and `f.read()` runs out of memory. What is the right way to process it one line at a time?');
        await d.getByLabel(/^Tags/).fill('python, files');
      },
    );

    await rec.step(
      'The question is posted',
      'The thread opens with her question. Others can now reply.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Post', exact: true }).click();
        await expect(page.getByRole('heading', { name: title })).toBeVisible();
      },
    );
    const threadUrl = page.url();
    const threadId = threadUrl.match(/community\/t\/([0-9a-f-]{36})/)![1];

    const rohan = await person(browser, demo('student'));
    await rec.step(
      'Rohan answers',
      'Rohan opens the thread and posts a reply with a short code example.',
      async () => {
        await rohan.page.goto(threadUrl);
        await rohan.page.getByLabel('Your reply', { exact: true }).fill('Iterate over the file object: `for line in f:` reads one line at a time, so memory stays small even for huge files. Use `with open(path) as f:` so it closes automatically.');
        await rohan.page.getByRole('button', { name: 'Post reply' }).click();
        await expect(rohan.page.getByText('Reply posted')).toBeVisible();
      },
      { page: rohan.page },
    );
    await rohan.ctx.close();

    await rec.step(
      'Upvote and accept the answer',
      'Back on her question, Asha upvotes Rohan’s reply as helpful and clicks "Accept answer". The reply moves to the top with an "Accepted answer" badge and the thread is marked Answered.',
      async () => {
        await page.reload();
        const reply = page.locator('[id^="post-"]', { hasText: 'for line in f:' });
        await reply.getByRole('button', { name: 'Upvote (helpful)' }).click();
        await expect(reply.getByRole('button', { name: 'Upvote (helpful)' })).toHaveAttribute('aria-pressed', 'true');
        await reply.getByRole('button', { name: 'Accept answer' }).click();
        await expect(page.getByText('Accepted answer').first()).toBeVisible();
        await expect(page.getByText('Answered', { exact: true })).toBeVisible();
      },
    );
    await rec.check('The thread has Rohan’s reply as the accepted answer, with one upvote', async () => {
      const d = await api(page.request, 'get', `/api/community/threads/${threadId}`);
      const accepted = d.body.posts.find((p: { accepted: boolean }) => p.accepted);
      expect(accepted.author.name).toBe('Rohan Iyer');
      expect(accepted.score).toBe(1);
    });

    // A spammer replies (a fresh account, posting through the API).
    const spam = await person(browser, null);
    const spamEmail = uniqueEmail('spammer');
    await api(spam.page.request, 'post', '/api/auth/register', { name: 'Quick Prizes', email: spamEmail, password: 'spammer-pass-2026' });
    await api(spam.page.request, 'post', '/api/me/onboarding', { skip: true });
    const spamPost = await api(spam.page.request, 'post', `/api/community/threads/${threadId}/posts`, { body: 'Win a free laptop today!!! Visit my profile for the giveaway link.' });
    expect(spamPost.status, JSON.stringify(spamPost.body)).toBeLessThan(300);
    await spam.ctx.close();

    await rec.step(
      'Report a spam reply',
      'A spam reply appears. From the reply’s menu Asha chooses "Report reply", picks "Spam or advertising" and adds a note. The person reported is not told who reported them.',
      async () => {
        await page.reload();
        const reply = page.locator('[id^="post-"]', { hasText: 'Win a free laptop' });
        await reply.getByRole('button', { name: 'Reply actions' }).click();
        await page.getByRole('menuitem', { name: 'Report reply' }).click();
        await dialog(page).getByLabel('Reason', { exact: true }).selectOption('spam');
        await dialog(page).getByLabel(/^Details/).fill('Giveaway spam, unrelated to the question.');
      },
    );

    await rec.step(
      'Report sent, then block the spammer',
      'After sending the report she also blocks the account from the same menu. Their posts are hidden for her and they cannot reply to her threads.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Send report' }).click();
        await expect(page.getByText('Thanks. Moderators will review your report.')).toBeVisible();
        const reply = page.locator('[id^="post-"]', { hasText: 'Win a free laptop' });
        await reply.getByRole('button', { name: 'Reply actions' }).click();
        await page.getByRole('menuitem', { name: 'Block Quick Prizes' }).click();
        await expect(page.getByText(/^Blocked\./)).toBeVisible();
      },
    );
    await rec.check('The spam reply is hidden for Asha after blocking', async () => {
      await page.reload();
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      await expect(page.getByText('Win a free laptop')).toHaveCount(0);
    });

    const mod = await person(browser, demo('creator'));
    await rec.step(
      'The moderator reviews the report',
      'Omar moderates the Python help space. His moderation queue lists the open report with the reason, the reported text, its author and the reporter’s note.',
      async () => {
        await mod.page.goto(`${BASE}/app/community/moderation`);
        await expect(mod.page.getByRole('heading', { name: 'Moderation queue' })).toBeVisible();
        await expect(mod.page.getByText(/Win a free laptop/).first()).toBeVisible();
      },
      { page: mod.page },
    );

    await rec.step(
      'Take action and hide the content',
      'He writes a resolution note, keeps "Hide the content when taking action" ticked and clicks "Take action". The decision is recorded in the audit log; the reporter is told the report was reviewed.',
      async () => {
        const card = mod.page.locator('li', { hasText: 'Win a free laptop' }).filter({ has: mod.page.getByRole('button', { name: 'Resolve' }) }).first();
        await card.getByRole('button', { name: 'Resolve' }).click();
        await dialog(mod.page).getByLabel('Resolution note', { exact: true }).fill('Spam giveaway. Hidden.');
        const hide = dialog(mod.page).getByRole('checkbox', { name: /Hide the content/ });
        if ((await hide.getAttribute('aria-checked')) !== 'true') await hide.click();
        await dialog(mod.page).getByRole('button', { name: 'Take action' }).click();
        await expect(mod.page.getByText('Report resolved. The action is recorded in the audit log.')).toBeVisible();
      },
      { page: mod.page },
    );
    await rec.check('The spam reply is now hidden by a moderator', async () => {
      const d = await api(mod.page.request, 'get', `/api/community/threads/${threadId}`);
      const p = d.body.posts.find((x: { body: string }) => x.body.includes('Win a free laptop'));
      expect(p.status).toBe('hidden');
    });
    await mod.ctx.close();
  },
);

scenario(
  {
    id: 'community-04-study-group',
    area: COMMUNITY,
    title: 'A study group with shared notes and a task board',
    summary: 'Asha starts a small study group. A classmate joins, and the members share notes and a task list that only members can see.',
    roles: ['Learner', 'Student'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('learner'));
    const name = 'SQL joins weekend circle';

    await rec.step(
      'Browse study groups',
      'Study groups are small peer groups. Each card shows the goal, the owner and how many places are left.',
      async () => {
        await page.goto(`${BASE}/app/community/groups`);
        await expect(page.getByRole('heading', { name: 'Study groups' })).toBeVisible();
      },
    );

    await rec.step(
      'Start a group',
      'Asha names the group, describes the goal and how often they will meet, and sets a maximum of 6 members.',
      async () => {
        await page.getByRole('button', { name: 'Start a group' }).first().click();
        const d = dialog(page);
        await d.getByLabel('Name', { exact: true }).fill(name);
        await d.getByLabel('Goal', { exact: true }).fill('Practise SQL joins every Saturday morning and review each other’s queries.');
        await d.getByLabel('Maximum members', { exact: true }).fill('6');
      },
    );

    await rec.step(
      'Write shared notes',
      'The group page has shared notes that every member can edit. She switches to Edit, writes a plan and saves.',
      async () => {
        await dialog(page).getByRole('button', { name: 'Create group' }).click();
        await expect(page.getByRole('heading', { name })).toBeVisible();
        await page.getByRole('radio', { name: 'Edit' }).click();
        await page.getByLabel('Shared notes', { exact: true }).fill('## Plan\n- Week 1: inner vs left joins\n- Week 2: joins with GROUP BY\n\nBring one query you found confusing.');
        await page.getByRole('button', { name: 'Save notes' }).click();
        await expect(page.getByText('Notes saved')).toBeVisible();
      },
    );

    await rec.step(
      'Add tasks to the board',
      'She adds two tasks. The board shows how many are done.',
      async () => {
        for (const t of ['Pick five practice queries', 'Share a joins cheat sheet']) {
          await page.getByLabel('New task', { exact: true }).fill(t);
          await page.getByRole('button', { name: 'Add', exact: true }).click();
          await expect(page.getByText(t)).toBeVisible();
        }
      },
    );

    const gid = page.url().match(/groups\/([0-9a-f-]{36})/)![1];
    const rohan = await person(browser, demo('student'));
    await rec.step(
      'A classmate joins and ticks off a task',
      'Rohan finds the group, joins it, sees the notes and marks "Pick five practice queries" as done. Before joining, notes and tasks are hidden from him.',
      async () => {
        await rohan.page.goto(`${BASE}/app/community/groups/${gid}`);
        await expect(rohan.page.getByText('Notes and tasks are for members')).toBeVisible();
        await rohan.page.getByRole('button', { name: /Join/ }).click();
        await expect(rohan.page.getByText('Joined the group')).toBeVisible();
        await rohan.page.getByLabel('Done: Pick five practice queries').click();
        await expect(rohan.page.getByText('1 of 2 done')).toBeVisible();
      },
      { page: rohan.page },
    );
    await rohan.ctx.close();

    await rec.step(
      'Asha sees the update',
      'On Asha’s page the task board now shows 1 of 2 done, and the member list includes Rohan.',
      async () => {
        await page.reload();
        await expect(page.getByText('1 of 2 done')).toBeVisible();
        await expect(page.getByText('Rohan Iyer').first()).toBeVisible();
      },
    );
    await rec.check('The group has two members, the shared notes and one finished task', async () => {
      const d = await api(page.request, 'get', `/api/community/groups/${gid}`);
      expect(d.body.members.length).toBe(2);
      expect(JSON.stringify(d.body)).toContain('inner vs left joins');
      const tasks = d.body.group.sharedTasks ?? d.body.tasks;
      expect(tasks.filter((t: { done: boolean }) => t.done).length).toBe(1);
    });
  },
);
