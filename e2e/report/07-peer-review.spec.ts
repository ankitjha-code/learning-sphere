import type { APIRequestContext, Page } from '@playwright/test';
import { scenario, expect, login, person, api, demo, BASE } from './recorder';

/*
 * Peer assessment. The demo data has an open peer review round on "Assignment 1: Two-sum with hashing":
 * reviews were allocated nine days ago, most classmates have submitted theirs (a few with flags), and
 * Rohan still has two reviews to write. Assignment 2 is used to show an instructor turning peer review on.
 */

const TEACH = 'Teaching and assignments';
const FACULTY = { workspace: 'teach', orgName: 'Northbridge' };
const A1 = 'Assignment 1: Two-sum with hashing';
const A2 = 'Assignment 2: Stack-based expression evaluator';
const CLASSMATES = ['Meera Nair', 'Kabir Shah', 'Ananya Gupta', 'Dev Malhotra', 'Sara Thomas', 'Arjun Rao'];
const REVIEW_TEXT =
  'Your single pass with a dictionary is correct and the complexity is explained well. One improvement: add a test for an array where no pair adds up to the target, and say what the function returns then.';

const dialog = (p: Page) => p.getByRole('dialog');

/** Local "YYYY-MM-DDTHH:mm" for datetime-local inputs. */
function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function assignmentId(fac: APIRequestContext, title: string) {
  const list = await api(fac, 'get', '/api/teach/assignments');
  const a = list.body.items.find((x: { title: string }) => x.title === title);
  expect(a, title).toBeTruthy();
  return a.id as string;
}

/** Text of the main content area (excludes the header, where the signed-in user's own name appears). */
async function mainText(page: Page) {
  return (await page.locator('main').first().innerText()).toString();
}

scenario(
  {
    id: 'peer-01-enable',
    area: TEACH,
    title: 'An instructor turns on anonymous peer review for an assignment',
    summary: 'Dr. Kulkarni adds peer review to an assignment: each student will anonymously review two classmates with the assignment rubric and a written comment, and she decides that the peer median may count for 20% of the grade.',
    roles: ['Faculty'],
  },
  async (rec, { page }) => {
    await login(page, demo('faculty'), FACULTY);
    const id = await assignmentId(page.request, A2);

    await rec.step(
      'Open the Peer review tab',
      'On the assignment editor there is a new "Peer review" tab. It explains how peer review works and shows the settings. Nothing is sent to students until the review window opens.',
      async () => {
        await page.goto(`${BASE}/app/teach/assignments/${id}?tab=peer`);
        await expect(page.getByRole('tab', { name: 'Peer review' })).toBeVisible();
        await expect(page.getByText('How peer review works')).toBeVisible();
      },
    );

    await rec.step(
      'Choose the settings',
      'She switches peer review on, keeps two reviews per submission, sets the window to close a week from now, and sets the peer component to 20%. The helper text shows the exact formula: her score counts 80% and the peer median 20%, and only when she chooses to apply it.',
      async () => {
        const toggle = page.getByRole('switch', { name: /Use peer review/ });
        if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
        await page.getByLabel('Reviews per submission').selectOption('2');
        await page.getByLabel('Review window closes').fill(localInput(new Date(Date.now() + 7 * 86400_000)));
        await page.getByLabel('Peer component of the grade (%)').fill('20');
        await expect(page.getByText(/your score x 0\.80 \+ peer median x 0\.20/)).toBeVisible();
      },
      { fullPage: true },
    );

    await rec.step(
      'Save the settings',
      'After saving, the Review window card shows when it opens and closes. The "Open review window" button is available; opening it allocates reviews in the background and notifies students. Students never see who they review or who reviewed them.',
      async () => {
        await page.getByRole('button', { name: 'Save settings' }).click();
        await expect(page.getByText('Peer review settings saved')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Open review window' })).toBeVisible();
      },
    );

    await rec.check('The settings are stored: enabled, 2 reviews per submission, 20% peer component', async () => {
      const r = await api(page.request, 'get', `/api/teach/assignments/${id}/peer`);
      expect(r.body.settings).toMatchObject({ enabled: true, reviewsPerSubmission: 2, peerWeightPercent: 20, state: 'not_open' });
    });
  },
);

scenario(
  {
    id: 'peer-02-student-reviews',
    area: TEACH,
    title: 'A student reviews a classmate’s work anonymously',
    summary: 'Rohan sees "Peer reviews to do" on his Assignments page, opens one, scores each rubric criterion, writes specific feedback and submits. He never sees whose work it is, and once submitted the review is locked.',
    roles: ['Student'],
  },
  async (rec, { page }) => {
    await login(page, demo('student'));
    const todo = await api(page.request, 'get', '/api/teach/my/peer-reviews');
    const open = todo.body.items.find((i: { status: string; canEdit: boolean }) => i.status !== 'submitted' && i.canEdit);
    expect(open, 'Rohan has a peer review to do').toBeTruthy();

    await rec.step(
      'See peer reviews to do',
      'His Assignments page now has a "Peer reviews to do" card with the assignment, an anonymous label ("Submission A") and when reviews close.',
      async () => {
        await page.goto(`${BASE}/app/assignments`);
        await expect(page.getByText('Peer reviews to do')).toBeVisible();
        await expect(page.getByRole('link', { name: `${A1}: ${open.label}` })).toBeVisible();
      },
    );

    await rec.step(
      'Open the review',
      'The review screen shows the classmate’s submission on the left and the rubric on the right. A banner explains that the review is anonymous in both directions; only the instructor sees names.',
      async () => {
        await page.getByRole('link', { name: `${A1}: ${open.label}` }).click();
        await expect(page.getByRole('heading', { name: `Peer review: ${open.label}` })).toBeVisible();
        await expect(page.getByText('Anonymous review')).toBeVisible();
      },
      { fullPage: true },
    );

    await rec.check('No classmate’s name appears anywhere on the review screen or in its data', async () => {
      const text = await mainText(page);
      for (const n of CLASSMATES) expect(text).not.toContain(n);
      const raw = JSON.stringify((await api(page.request, 'get', `/api/teach/my/peer-reviews/${open.id}`)).body);
      for (const n of CLASSMATES) expect(raw).not.toContain(n);
    });

    await rec.step(
      'Score the rubric and write feedback',
      'He picks a level for each criterion (the equivalent score updates live) and writes a comment. The Submit button explains what is missing until every criterion is scored and the comment is at least 80 characters.',
      async () => {
        for (const [crit, level] of [
          ['Correctness', 'Excellent'],
          ['Code quality', 'Proficient'],
          ['Complexity analysis', 'Excellent'],
          ['Communication', 'Proficient'],
        ] as const) {
          await page.getByRole('radiogroup', { name: crit }).getByRole('radio', { name: new RegExp(level) }).check();
        }
        await page.getByLabel('Written feedback').fill(REVIEW_TEXT);
        await expect(page.getByText('14 / 16')).toBeVisible();
      },
      { fullPage: true },
    );

    await rec.step(
      'Save a draft',
      'Saving a draft keeps his work without sending it. He can come back before the window closes.',
      async () => {
        await page.getByRole('button', { name: 'Save draft' }).click();
        await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
      },
    );

    await rec.step(
      'Submit the review',
      'Submitting asks for confirmation: submitted reviews are locked and only the instructor can reopen them. Afterwards the page shows his scores and comment read-only.',
      async () => {
        await page.getByRole('button', { name: 'Submit review' }).click();
        await expect(dialog(page).getByText('Submit this review?')).toBeVisible();
        await dialog(page).getByRole('button', { name: 'Submit review' }).click();
        await expect(page.getByText(/It is locked unless your instructor reopens it/)).toBeVisible();
      },
    );

    await rec.check('The review is stored as submitted with a score of 87.5 / 100', async () => {
      const r = await api(page.request, 'get', `/api/teach/my/peer-reviews/${open.id}`);
      expect(r.body.review.status).toBe('submitted');
      expect(r.body.review.score).toBe(87.5);
      expect(r.body.canEdit).toBe(false);
    });
  },
);

scenario(
  {
    id: 'peer-03-dashboard-release-apply',
    area: TEACH,
    title: 'The instructor checks flagged reviews, releases peer feedback and applies the peer component',
    summary: 'On the peer review dashboard Dr. Kulkarni sees completion per reviewer, peer medians per submission, and reviews flagged as outliers or low effort. She excludes an unfair review (the reason is audited), releases the feedback, and applies the 20% peer component, which records new evaluations without overwriting her own. Rohan then reads the anonymous feedback on his work.',
    roles: ['Faculty', 'Student'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('faculty'), FACULTY);
    const id = await assignmentId(page.request, A1);
    const before = (await api(page.request, 'get', `/api/teach/assignments/${id}/peer`)).body;
    const outlier = before.reviews.find((r: { flags: { kind: string }[]; excluded: unknown }) => r.flags.some((f) => f.kind === 'outlier') && !r.excluded);
    expect(outlier, 'an outlier review in the demo data').toBeTruthy();

    await rec.step(
      'Open the peer review dashboard',
      'The Peer review tab shows how many reviews are in, how many are flagged, and a table of every submission with the number of reviews received, the peer median for each rubric criterion, the overall peer median and her own grade.',
      async () => {
        await page.goto(`${BASE}/app/teach/assignments/${id}?tab=peer`);
        await expect(page.getByText('Reviews submitted')).toBeVisible();
        await expect(page.getByRole('columnheader', { name: 'Peer median' })).toBeVisible();
      },
      { fullPage: true },
    );

    await rec.step(
      'Completion per reviewer',
      'The Reviewers view lists each student with how many of their assigned reviews they have submitted, so she can nudge anyone who has not started.',
      async () => {
        await page.getByRole('radio', { name: 'Reviewers' }).click();
        await expect(page.getByText(/of 2 submitted/).first()).toBeVisible();
      },
    );

    await rec.step(
      'See flagged reviews',
      'The Reviews view shows every review with names (instructors see everything). Flags explain themselves: "Outlier score" when a score is far from the median of the other reviews of the same work, and "Low effort" when the comment is too short or copied.',
      async () => {
        await page.getByRole('radio', { name: /^Reviews/ }).click();
        await page.getByText(/Only flagged reviews/).click();
        await expect(page.getByText('Outlier score').first()).toBeVisible();
        await expect(page.getByText(/Low effort/).first()).toBeVisible();
      },
      { fullPage: true },
    );

    await rec.step(
      'Exclude an unfair review',
      `She excludes ${outlier.reviewer.name}'s outlier review of ${outlier.reviewee.name} and writes why. Excluded reviews stop counting toward medians and are hidden from the student who received them. The reason is kept in the audit log.`,
      async () => {
        await page.getByRole('button', { name: `Actions for ${outlier.reviewer.name}'s review of ${outlier.reviewee.name}` }).click();
        await page.getByRole('menuitem', { name: 'Exclude from medians' }).click();
        await dialog(page).getByLabel('Reason').fill('Scores do not match the work; the comment does not mention the solution.');
        await dialog(page).getByRole('button', { name: 'Exclude review' }).click();
        await expect(page.getByText('Review excluded from medians')).toBeVisible();
      },
    );

    await rec.check('The exclusion is recorded with its reason', async () => {
      const after = (await api(page.request, 'get', `/api/teach/assignments/${id}/peer`)).body;
      const r = after.reviews.find((x: { id: string }) => x.id === outlier.id);
      expect(r.excluded.reason).toMatch(/Scores do not match/);
    });

    await rec.step(
      'Release peer feedback',
      'She releases the feedback before the window closes. Students are notified and can now read the anonymous reviews of their work.',
      async () => {
        await page.getByRole('button', { name: 'Release peer feedback' }).click();
        await dialog(page).getByRole('button', { name: 'Release peer feedback' }).click();
        await expect(page.getByText(/Peer feedback released/).first()).toBeVisible();
      },
    );

    const graded = (await api(page.request, 'get', `/api/teach/assignments/${id}/peer`)).body.submissions.find(
      (s: { instructor: { finalScore: number; peerApplied: boolean } | null; medianScore: number | null }) => s.instructor && !s.instructor.peerApplied && s.medianScore !== null,
    );
    expect(graded, 'a graded submission with peer reviews').toBeTruthy();

    await rec.step(
      'Apply the peer component',
      '"Apply peer component" explains the formula before anything changes: final = her score x 0.80 + peer median x 0.20. Each affected submission gets a new evaluation; her original evaluation stays in the history.',
      async () => {
        await page.getByRole('radio', { name: 'Submissions' }).click();
        await page.getByRole('button', { name: 'Apply peer component' }).click();
        await expect(dialog(page).getByText(/final = your score x 0\.80 \+ peer median x 0\.20/)).toBeVisible();
        await dialog(page).getByRole('button', { name: 'Apply peer component' }).click();
        await expect(page.getByText(/Peer component applied to/)).toBeVisible();
        await expect(page.getByText('Includes peer component').first()).toBeVisible();
      },
      { fullPage: true },
    );

    await rec.check('A new evaluation is recorded with the right math and the instructor’s original is kept', async () => {
      const d = (await api(page.request, 'get', `/api/teach/submissions/${graded.submissionId}`)).body;
      const applied = d.evaluations.find((e: { reason: string | null }) => e.reason === 'Peer component applied');
      const original = d.evaluations.find((e: { id: string }) => e.id === graded.instructor.evaluationId);
      expect(applied).toBeTruthy();
      expect(original.finalScore).toBe(graded.instructor.finalScore);
      expect(original.supersededBy).toBe(applied.id);
      const expected = Math.round((original.rawScore * 0.8 + graded.medianScore * 0.2) * 100) / 100;
      expect(applied.rawScore).toBe(expected);
    });

    const stu = await person(browser, demo('student'));
    const mine = (await api(stu.page.request, 'get', '/api/teach/my/assignments')).body.items.find((i: { title: string }) => i.title === A1);

    await rec.step(
      'Rohan reads the anonymous feedback',
      'On his assignment page, the Peer reviews section now shows each review as "Reviewer 1", "Reviewer 2" with scores per criterion and comments, plus the peer median. He can rate how helpful each review was.',
      async () => {
        await stu.page.goto(`${BASE}/app/assignments/${mine.id}`);
        await expect(stu.page.getByText('Feedback on your work')).toBeVisible();
        await expect(stu.page.getByText('Reviewer 1', { exact: true })).toBeVisible();
        await stu.page.getByText('Reviewer 1', { exact: true }).evaluate((el) => el.scrollIntoView({ block: 'center' }));
      },
      { page: stu.page },
    );

    await rec.step(
      'Rate a review and flag one',
      'He gives the first review 4 out of 5 for helpfulness. If a review were rude or ignored his work, "Flag as inappropriate" would send it to the instructor without revealing anyone’s identity.',
      async () => {
        await stu.page.getByRole('group', { name: 'How helpful was this review?' }).first().getByRole('button', { name: '4 of 5' }).click();
        await expect(stu.page.getByText('Thanks for rating this review')).toBeVisible();
      },
      { page: stu.page },
    );

    await rec.check('The feedback Rohan sees contains no reviewer names or ids', async () => {
      const text = (await stu.page.locator('main').first().innerText()).toString();
      const section = text.slice(text.indexOf('Peer reviews'));
      for (const n of CLASSMATES) expect(section).not.toContain(n);
      const raw = JSON.stringify((await api(stu.page.request, 'get', `/api/teach/my/assignments/${mine.id}/peer`)).body);
      for (const n of CLASSMATES) expect(raw).not.toContain(n);
      for (const r of before.reviewers as { userId: string }[]) expect(raw).not.toContain(r.userId);
    });
    await stu.ctx.close();
  },
);
