import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { scenario, expect, api, login, person, demo, uniqueEmail, BASE } from './recorder';

const AREA = 'Learning';
const FRESH_PASSWORD = 'learning-pass-2026';

/** Creates a brand-new account through the API and skips onboarding, for scenarios that need a clean slate. */
async function freshLearner(page: Page, name: string) {
  const email = uniqueEmail(name.split(' ')[0].toLowerCase());
  const r = await api(page.request, 'post', '/api/auth/register', { name, email, password: FRESH_PASSWORD });
  expect(r.status, 'register a fresh account').toBe(201);
  const o = await api(page.request, 'post', '/api/me/onboarding', { skip: true });
  expect(o.status, 'skip onboarding').toBe(200);
  return email;
}

/** Answers the four questions of "How programs run" (Programming Foundations with Python). */
async function answerHowProgramsRun(page: Page, correct: boolean) {
  if (correct) {
    await page.getByLabel('Always a string').check();
    await page.getByLabel('45', { exact: true }).check();
    await page.getByLabel('True', { exact: true }).check();
    await page.getByLabel('Blank 1').fill('int');
  } else {
    await page.getByLabel('A number if the user types digits').check();
    await page.getByLabel('9', { exact: true }).check();
    await page.getByLabel('False', { exact: true }).check();
    await page.getByLabel('Blank 1').fill('str');
  }
}

const PY_TOPIC = '/app/learn/programming-foundations-python/how-programs-run';

// ---------------------------------------------------------------------------------------------
scenario(
  {
    id: 'learn-01-home-dashboard',
    area: AREA,
    title: 'Home dashboard tour',
    summary: 'A tour of the personal home page of Asha, a career switcher: study stats, getting-started checklist, ranked next steps that each explain "why", goals, a Skill DNA summary and recent activity.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step(
      'Open the home page',
      'After signing in, Asha lands on her home page. It greets her by name and gathers everything she needs today on one screen.',
      async () => {
        await page.goto(`${BASE}/app`);
        await expect(page.getByText('Your next steps')).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.step(
      'Study stats at a glance',
      'Four tiles show her study streak (days in a row), total XP (experience points earned only from completed work), hours studied this week and how many revisions are due.',
      async () => {
        await expect(page.getByText('Study streak').first()).toBeVisible();
        await expect(page.getByText('Total XP')).toBeVisible();
      },
    );
    await rec.check('The four study stat tiles are shown', async () => {
      for (const t of ['Study streak', 'Total XP', 'This week', 'Revisions due']) await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    });
    await rec.step(
      'Ranked next steps, each with a reason',
      '"Your next steps" is a short to-do list ranked from her own evidence (quizzes, practice, goals). Every suggestion starts with "Why:" so she knows it is not random.',
      async () => {
        await page.getByRole('heading', { name: 'Your next steps' }).scrollIntoViewIfNeeded();
        await expect(page.getByText('Why:').first()).toBeVisible();
      },
    );
    await rec.check('Every next step explains why it was suggested', async () => {
      const items = page.locator('section[aria-labelledby="next-steps"] li');
      const n = await items.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) await expect(items.nth(i)).toContainText('Why:');
    });
    const firstRec = page.locator('section[aria-labelledby="next-steps"] li').first();
    const firstTitle = (await firstRec.locator('a').first().innerText()).trim();
    await rec.step(
      'Hide a suggestion that does not fit',
      `Each suggestion has a small "x" to hide it ("Not now"). Here Asha hides "${firstTitle}", and the list moves up. Hidden suggestions can be restored later.`,
      async () => {
        await page.getByRole('button', { name: `Dismiss suggestion: ${firstTitle}` }).click();
        await expect(page.locator('section[aria-labelledby="next-steps"]').getByRole('link', { name: firstTitle, exact: true })).toHaveCount(0);
      },
    );
    await rec.step(
      'Active roadmaps and the getting-started checklist',
      'Below the suggestions she sees her active roadmaps with a progress bar. On the right, a getting-started checklist ticks off the first milestones (set goals, enroll, finish a lesson, solve a problem, start a project).',
      async () => {
        await page.getByRole('heading', { name: 'Active roadmaps' }).scrollIntoViewIfNeeded();
        await expect(page.getByText('Programming Foundations with Python').first()).toBeVisible();
      },
    );
    await rec.step(
      'Goals and Skill DNA summary',
      'The right column lists her active goals with progress bars, and a Skill DNA summary counting skills by how well they are proven: Verified, Demonstrated, Learning, Needs revision and Self-reported.',
      async () => {
        await page.getByText('What your evidence shows').scrollIntoViewIfNeeded();
        await expect(page.getByText('Self-reported', { exact: true }).first()).toBeVisible();
      },
    );
    await rec.step(
      'Recent activity',
      'At the bottom, recent activity lists what she actually did, with the XP each item earned. "Full history" opens the complete activity log.',
      async () => {
        await page.getByText('Recent activity').scrollIntoViewIfNeeded();
        await expect(page.getByRole('link', { name: 'Full history' })).toBeVisible();
      },
    );
    await rec.check('The dashboard reports Asha enrolled in the Python roadmap', async () => {
      const d = await api(page.request, 'get', '/api/learning/dashboard');
      expect(d.body.enrollments.some((e: { track: { slug: string } }) => e.track.slug === 'programming-foundations-python')).toBe(true);
    });
  },
);

// ---------------------------------------------------------------------------------------------
scenario(
  {
    id: 'learn-02-search-and-notifications',
    area: AREA,
    title: 'Search everything, notifications and activity history',
    summary: 'The keyboard shortcut Ctrl+K (Cmd+K on Mac) opens one search box for lessons, roadmaps, problems, library items and more. The bell shows recent notifications, and the notifications page keeps a full activity history.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await page.goto(`${BASE}/app`);
    await expect(page.getByText('Your next steps')).toBeVisible();
    await rec.step(
      'Open the command palette',
      'Pressing Ctrl+K (or clicking "Search or jump to…" at the top) opens the command palette: a search box plus quick actions and every page she can open.',
      async () => {
        await page.keyboard.press('ControlOrMeta+K');
        await expect(page.getByPlaceholder(/Search lessons, problems, jobs, notes/)).toBeVisible();
      },
    );
    await rec.step(
      'Search for "sql"',
      'Typing "sql" searches the whole platform. Results are grouped by type, such as Roadmaps, Lessons, CodeLab problems and Library, and only include things she is allowed to see.',
      async () => {
        await page.getByPlaceholder(/Search lessons, problems, jobs, notes/).fill('sql');
        await expect(page.getByRole('option', { name: /SQL and Database Design/ }).first()).toBeVisible();
      },
    );
    await rec.check('Search results are grouped (a "Roadmaps" group is shown)', async () => expect(page.locator('[cmdk-group-heading]', { hasText: 'Roadmaps' })).toBeVisible());
    await rec.step(
      'Open a result',
      'Choosing the "SQL and Database Design" roadmap closes the palette and opens that roadmap page directly.',
      async () => {
        await page.getByRole('option', { name: /SQL and Database Design/ }).first().click();
        await expect(page).toHaveURL(/\/app\/learn\/sql-database-design/);
        await expect(page.getByRole('heading', { name: 'SQL and Database Design', level: 1 })).toBeVisible();
      },
    );
    await rec.step(
      'Open the notifications bell',
      'The bell in the top bar shows a red count of unread notifications. Clicking it opens the latest ones: deadlines, results, replies and messages.',
      async () => {
        await page.getByRole('button', { name: /^Notifications/ }).click();
        await expect(page.getByRole('link', { name: 'View all activity' })).toBeVisible();
      },
    );
    await rec.step(
      'Full notifications page',
      '"View all activity" opens the notifications page with tabs for All, Unread and Activity history.',
      async () => {
        await page.getByRole('link', { name: 'View all activity' }).click();
        await expect(page).toHaveURL(/\/app\/notifications/);
        await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.step(
      'Activity history tab',
      'The Activity history tab is a diary of what she did, day by day, with totals for activities, XP earned and time recorded. XP only counts real work such as completed lessons and passed submissions.',
      async () => {
        await page.getByRole('tab', { name: 'Activity history' }).click();
        await expect(page.getByText('XP earned').first()).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.check('Activity history shows totals (Activities, XP earned, Time recorded)', async () => {
      await expect(page.getByText('Activities', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Time recorded').first()).toBeVisible();
    });
  },
);

// ---------------------------------------------------------------------------------------------
scenario(
  {
    id: 'learn-03-theme-and-mobile',
    area: AREA,
    title: 'Dark theme and phone-size screens',
    summary: 'Switches the app to the dark theme from the top bar, then shows the same pages on a phone-width screen (390 pixels wide), including the slide-out navigation menu.',
    roles: ['Learner'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('learner'));
    await page.goto(`${BASE}/app`);
    await expect(page.getByText('Your next steps')).toBeVisible();
    await rec.step('Home page in the light theme', 'This is the default light theme on a laptop-size screen.', async () => {});
    await rec.step(
      'Open the theme menu',
      'The sun icon in the top bar opens the theme menu: Light, Dark, or System (follow the device setting).',
      async () => {
        await page.getByRole('button', { name: /^Theme:/ }).click();
        await expect(page.getByRole('menuitem', { name: 'Dark' })).toBeVisible();
      },
    );
    await rec.step(
      'Switch to dark',
      'Choosing Dark changes the whole interface instantly. The choice is remembered on this device.',
      async () => {
        await page.getByRole('menuitem', { name: 'Dark' }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      },
    );
    await rec.check('The page is now in the dark theme', async () => expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'));
    await rec.step(
      'Roadmaps in dark',
      'Every page follows the theme. Here is the Roadmaps catalogue in dark mode.',
      async () => {
        await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Roadmaps' }).click();
        await expect(page.getByRole('heading', { name: 'Roadmaps', level: 1 })).toBeVisible();
      },
    );
    await rec.step(
      'A lesson in dark',
      'A lesson page in dark mode: text, code samples and cards stay readable.',
      async () => {
        await page.getByRole('link', { name: /Programming Foundations with Python/ }).first().click();
        await page.getByRole('link', { name: 'How programs run' }).click();
        await expect(page.getByRole('heading', { name: 'How programs run', level: 1 })).toBeVisible();
      },
    );
    await page.getByRole('button', { name: /^Theme:/ }).click();
    await page.getByRole('menuitem', { name: 'Light' }).click();

    const phone = await person(browser, demo('learner'), { width: 390 });
    try {
      await rec.step(
        'Home page on a phone',
        'The same home page on a phone-width screen. Cards stack in one column and the sidebar is replaced by a menu button at the top left. Known issue: the page is slightly wider than the phone and the right edge looks cut off (see the failed check at the end).',
        async () => {
          await phone.page.goto(`${BASE}/app`);
          await expect(phone.page.getByText('Your next steps')).toBeVisible();
          await phone.page.evaluate(() => window.scrollTo(0, 0));
        },
        { page: phone.page, fullPage: true },
      );
      await rec.step(
        'Open the navigation menu',
        'Tapping the menu button slides out the full navigation, with the same sections as the desktop sidebar.',
        async () => {
          await phone.page.getByRole('button', { name: 'Open navigation' }).click();
          await expect(phone.page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
        },
        { page: phone.page },
      );
      await rec.step(
        'Go to Roadmaps from the menu',
        'Choosing Roadmaps closes the menu and opens the catalogue, laid out for a narrow screen.',
        async () => {
          await phone.page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Roadmaps' }).click();
          await expect(phone.page.getByRole('heading', { name: 'Roadmaps', level: 1 })).toBeVisible();
          await expect(phone.page.getByRole('dialog', { name: 'Navigation' })).toHaveCount(0);
        },
        { page: phone.page },
      );
      await rec.step(
        'A lesson on a phone, in dark mode',
        'Finally the lesson page on a phone with the dark theme, the way many learners study in the evening.',
        async () => {
          await phone.page.getByRole('button', { name: /^Theme:/ }).click();
          await phone.page.getByRole('menuitem', { name: 'Dark' }).click();
          await phone.page.getByRole('link', { name: /Programming Foundations with Python/ }).first().click();
          await phone.page.getByRole('link', { name: 'How programs run' }).click();
          await expect(phone.page.getByRole('heading', { name: 'How programs run', level: 1 })).toBeVisible();
          await expect(phone.page.locator('html')).toHaveAttribute('data-theme', 'dark');
          await phone.page.evaluate(() => window.scrollTo(0, 0));
        },
        { page: phone.page, fullPage: true },
      );
      await rec.check('No sideways scrolling on the phone-width home page (390 pixels)', async () => {
        await phone.page.goto(`${BASE}/app`);
        await expect(phone.page.getByText('Why:').first()).toBeVisible();
        await phone.page.waitForLoadState('networkidle');
        const w = await phone.page.evaluate(() => document.documentElement.scrollWidth);
        expect(w, 'page width in pixels on a 390-pixel screen').toBeLessThanOrEqual(390);
      });
    } finally {
      await phone.ctx.close();
      // The theme choice is also saved to the account; put it back so later scenarios start in light mode.
      await api(page.request, 'patch', '/api/me/preferences', { theme: 'light' });
    }
  },
);

// ---------------------------------------------------------------------------------------------
scenario(
  {
    id: 'learn-04-browse-roadmaps',
    area: AREA,
    title: 'Browse roadmaps with search and filters',
    summary: 'The roadmap catalogue can be searched and filtered by category and level. All 27 roadmaps are complete, with full lessons and quizzes, so none carries an "Outline" badge.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step(
      'Open the roadmap catalogue',
      'Roadmaps are structured learning paths. Asha\'s own roadmaps come first with a progress bar; the rest of the catalogue follows. Each card shows category, level, number of topics and estimated hours.',
      async () => {
        await page.goto(`${BASE}/app/learn`);
        await expect(page.getByRole('heading', { name: 'Your roadmaps' })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.step(
      'Search by topic',
      'Typing "sql" in the search box narrows the list instantly to roadmaps that mention SQL in their title, summary or target roles.',
      async () => {
        await page.getByLabel('Search roadmaps').fill('sql');
        await expect(page.getByRole('link', { name: /SQL and Database Design/ })).toBeVisible();
      },
    );
    await rec.step(
      'Filter by category and level',
      'Clearing the search and choosing the category "Data structures & algorithms" with level "Advanced" leaves the advanced DSA roadmap: trees, heaps, graphs, shortest paths, greedy choices, backtracking and dynamic programming, each with a lesson, a quiz and tested CodeLab problems.',
      async () => {
        await page.getByLabel('Search roadmaps').fill('');
        await page.getByLabel('Category').selectOption('dsa');
        await page.getByLabel('Level').selectOption('advanced');
        await expect(page.getByRole('link', { name: /Advanced Data Structures and Algorithms/ })).toBeVisible();
      },
    );
    await rec.check('The advanced DSA roadmap is complete (no Outline badge)', async () =>
      expect(page.getByRole('link', { name: /Advanced Data Structures and Algorithms/ }).getByText('Outline', { exact: true })).toHaveCount(0),
    );
    await rec.step(
      'Switch the level',
      'Switching the level to "Intermediate" shows the main DSA roadmap, "Data Structures and Algorithms Essentials", the usual starting point before the advanced one.',
      async () => {
        await page.getByLabel('Level').selectOption('intermediate');
        await expect(page.getByRole('link', { name: /Data Structures and Algorithms Essentials/ })).toBeVisible();
      },
    );
    await rec.check('The DSA Essentials roadmap is complete (no Outline badge)', async () =>
      expect(page.getByRole('link', { name: /Data Structures and Algorithms Essentials/ }).getByText('Outline', { exact: true })).toHaveCount(0),
    );
    await rec.step(
      'Nothing matches',
      'A search that matches nothing explains that and offers a one-click "Clear filters" button instead of an empty page.',
      async () => {
        await page.getByLabel('Search roadmaps').fill('underwater basket weaving');
        await expect(page.getByText('No roadmaps match')).toBeVisible();
      },
    );
    await rec.step(
      'Clear filters',
      'One click restores the full catalogue.',
      async () => {
        await page.getByRole('button', { name: 'Clear filters' }).click();
        await expect(page.getByRole('heading', { name: 'Your roadmaps' })).toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------------------------
scenario(
  {
    id: 'learn-05-enroll-in-roadmap',
    area: AREA,
    title: 'Enroll in a roadmap and plan the pace',
    summary: 'A new learner opens the Data Structures and Algorithms roadmap, enrolls with a learning mode, weekly hours and a target date, gets a timeline with projected milestone dates, views the prerequisites graph and skips a topic she already knows.',
    roles: ['New learner'],
  },
  async (rec, { page }) => {
    await freshLearner(page, 'Tara Menon');
    await rec.step(
      'Open a roadmap',
      'The roadmap page lists every topic grouped into modules, with time estimates and milestone flags. On the right, "Plan your pace" invites her to enroll.',
      async () => {
        await page.goto(`${BASE}/app/learn/dsa-essentials`);
        await expect(page.getByRole('heading', { name: 'Data Structures and Algorithms Essentials', level: 1 })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    const target = new Date(Date.now() + 120 * 86400_000).toISOString().slice(0, 10);
    await rec.step(
      'Start this roadmap',
      '"Start this roadmap" opens a short form: how she wants to learn (Guided, Independent, Intensive revision, Interview prep or Project-first), how many hours per week she has, and an optional target date.',
      async () => {
        await page.getByRole('button', { name: 'Start this roadmap' }).first().click();
        const dlg = page.getByRole('dialog', { name: 'Start this roadmap' });
        await expect(dlg).toBeVisible();
        await dlg.getByLabel('Learning mode').selectOption('interview');
        await dlg.getByLabel('Hours per week for this roadmap').fill('6');
        await dlg.getByLabel('Target date').fill(target);
      },
    );
    await rec.step(
      'Enrolled: personal timeline',
      'After "Enroll", the Timeline card shows the projected finish date, whether she is on track for her target date, and when each milestone should be reached at 6 hours a week.',
      async () => {
        await page.getByRole('dialog', { name: 'Start this roadmap' }).getByRole('button', { name: 'Enroll' }).click();
        await expect(page.getByText('Projected finish')).toBeVisible();
        await expect(page.getByText(/^around /).first()).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.check('The timeline shows projected milestone dates', async () => expect(page.getByText(/^around /).first()).toBeVisible());
    await rec.step(
      'Prerequisites graph',
      'Switching the view from "List" to "Prerequisites" draws the topics as a map. Arrows point from a topic to the topics that build on it, so the order of learning is visible. Outlined boxes are milestones.',
      async () => {
        await page.getByRole('radio', { name: /Prerequisites/ }).click();
        await expect(page.getByRole('img', { name: 'Prerequisite graph of topics in this roadmap' })).toBeVisible();
      },
    );
    const plan = await api(page.request, 'get', '/api/learning/tracks/dsa-essentials');
    const skipTopic = plan.body.topics[0] as { id: string; title: string };
    await rec.step(
      'Skip a topic she already knows',
      `Back in the list view, each topic has a skip button. Tara skips "${skipTopic.title}" because she already knows it. Skipping records no evidence; it only removes the topic from her plan and shortens the timeline.`,
      async () => {
        await page.getByRole('radio', { name: /List/ }).click();
        await page.getByRole('button', { name: `Skip ${skipTopic.title}` }).click();
        await expect(page.getByRole('button', { name: `Unskip ${skipTopic.title}` })).toBeVisible();
      },
    );
    await rec.check('The skipped topic is saved in her plan', async () => {
      const t = await api(page.request, 'get', '/api/learning/tracks/dsa-essentials');
      expect(t.body.enrollment.skippedTopicIds).toContain(skipTopic.id);
    });
    await rec.check('Her chosen learning mode (Interview prep) is kept after skipping a topic', async () => {
      const t = await api(page.request, 'get', '/api/learning/tracks/dsa-essentials');
      expect(t.body.enrollment.mode, 'learning mode after skipping a topic').toBe('interview');
    });
  },
);

// ---------------------------------------------------------------------------------------------
scenario(
  {
    id: 'learn-06-topic-quiz',
    area: AREA,
    title: 'Study a topic and pass its quiz',
    summary: 'A new learner reads the lesson "How programs run", fails the quiz on purpose to show the explanations, then retakes it and passes. Passing schedules the topic for a future review.',
    roles: ['New learner'],
  },
  async (rec, { page }) => {
    await freshLearner(page, 'Imran Qureshi');
    await rec.step(
      'Open the lesson',
      'A lesson page starts with "By the end you will" learning objectives, then the notes, with the skill it builds and a time estimate at the top.',
      async () => {
        await page.goto(`${BASE}${PY_TOPIC}`);
        await expect(page.getByRole('heading', { name: 'How programs run', level: 1 })).toBeVisible();
      },
    );
    await rec.step(
      'Practice and resources',
      'Below the notes: practice exercises (doing beats re-reading) and curated free resources from trusted sites, plus buttons to ask the AI tutor or take a note.',
      async () => {
        await page.getByRole('heading', { name: 'Check your understanding' }).scrollIntoViewIfNeeded();
        await page.getByText('Doing beats re-reading').scrollIntoViewIfNeeded();
      },
    );
    await rec.step(
      'Answer the quiz (wrong on purpose)',
      'The quiz at the end of the lesson has four questions: multiple choice, true/false and a fill-in-the-blank. Here every answer is deliberately wrong, to show what happens.',
      async () => {
        await page.getByRole('heading', { name: 'Check your understanding' }).scrollIntoViewIfNeeded();
        await answerHowProgramsRun(page, false);
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.step(
      'Not yet: 70% needed',
      'After "Submit answers" each question is marked right or wrong, with an explanation of the correct answer. The summary says "Not yet: 70% needed" and suggests revisiting the notes. Nothing is lost by failing.',
      async () => {
        await page.getByRole('button', { name: 'Submit answers' }).click();
        await expect(page.getByText(/Not yet: 70% needed/)).toBeVisible();
        await expect(page.getByText('Explanation:').first()).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.check('A failed attempt shows "Not yet: 70% needed" and explanations', async () => {
      await expect(page.getByText(/0% · Not yet: 70% needed/)).toBeVisible();
      expect(await page.getByText('Explanation:').count()).toBeGreaterThanOrEqual(4);
    });
    await rec.step(
      'Retake with the right answers',
      '"Retake" clears the answers. This time he answers: "Always a string", "45", "True" and fills the blank with "int".',
      async () => {
        await page.getByRole('button', { name: 'Retake' }).click();
        await answerHowProgramsRun(page, true);
      },
    );
    await rec.step(
      'Passed, with the next review scheduled',
      'The result now reads "100% · Passed" and shows when the topic will come back for review (spaced revision: just before he would forget it). A "Next topic" button continues the roadmap.',
      async () => {
        await page.getByRole('button', { name: 'Submit answers' }).click();
        await expect(page.getByText(/100% · Passed/)).toBeVisible();
        await page.getByText(/Next review scheduled/).scrollIntoViewIfNeeded();
      },
    );
    await rec.check('The quiz is passed and a next review date is set', async () => {
      await expect(page.getByText(/Next review scheduled for/)).toBeVisible();
      const t = await api(page.request, 'get', '/api/learning/tracks/programming-foundations-python/topics/how-programs-run');
      expect(t.body.progress.status).toBe('completed');
      expect(t.body.progress.nextReviewAt).toBeTruthy();
    });
    await rec.step(
      'The topic is marked completed',
      'Back at the top, the lesson now carries a green "Completed" badge.',
      async () => {
        await page.reload();
        await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------------------------
scenario(
  {
    id: 'learn-07-complete-language-track',
    area: AREA,
    title: 'A complete language roadmap: TypeScript Essentials',
    summary: 'Every roadmap is now complete. A TypeScript topic has objectives, a worked lesson with a "Common mistakes" section, a graded quiz and curated free resources.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step(
      'Open the TypeScript roadmap',
      'TypeScript Essentials lists its topics in order, with modules, milestones and estimated hours. There is no "Outline" banner: every topic has a full lesson and a quiz.',
      async () => {
        await page.goto(`${BASE}/app/learn/typescript-essentials`);
        await expect(page.getByRole('heading', { name: 'TypeScript Essentials', level: 1 })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.check('The roadmap is not labeled as an outline', async () => expect(page.getByText('Outline roadmap')).toHaveCount(0));
    await rec.step(
      'Open the first topic',
      'The topic page starts with objectives, then a worked lesson with real code that matches how CodeLab runs TypeScript.',
      async () => {
        await page.getByRole('link', { name: /Why TypeScript, and project setup/ }).first().click();
        await expect(page.getByRole('heading', { name: 'Why TypeScript, and project setup', level: 1 })).toBeVisible();
      },
    );
    await rec.step(
      'Common mistakes',
      'Each lesson ends with the mistakes learners most often make, so they can be avoided before the quiz.',
      async () => {
        const h = page.getByRole('heading', { name: /Common mistakes/ }).first();
        await h.scrollIntoViewIfNeeded();
        await expect(h).toBeVisible();
      },
    );
    await rec.step(
      'A graded quiz and free resources',
      '"Check your understanding" is a quiz graded on the server; passing it adds evidence to Skill DNA and schedules spaced revision. Curated free resources sit beside the lesson.',
      async () => {
        const q = page.getByRole('heading', { name: 'Check your understanding' });
        await q.scrollIntoViewIfNeeded();
        await expect(q).toBeVisible();
        await expect(page.getByText('Resources', { exact: true }).first()).toBeVisible();
      },
    );
    await rec.check('The topic serves a quiz without revealing the answers', async () => {
      const t = await api(page.request, 'get', '/api/learning/tracks/typescript-essentials/topics/why-typescript-and-setup');
      expect(t.body.quiz.length).toBeGreaterThanOrEqual(4);
      expect(JSON.stringify(t.body.quiz)).not.toContain('correct');
    });
  },
);

// ---------------------------------------------------------------------------------------------
scenario(
  {
    id: 'learn-08-revision-queue',
    area: AREA,
    title: 'Spaced revision: a forgotten topic comes back',
    summary: 'Rohan passes a quiz, then fails it on a later attempt. The topic goes into his revision queue ("Below 60% last time"). He reviews it in revision mode, passes, and it moves to "Coming up" with a later date.',
    roles: ['Student'],
  },
  async (rec, { page }) => {
    await login(page, demo('student'));
    await rec.step(
      'Pass the quiz',
      'Rohan, a college student, takes the "How programs run" quiz and passes it.',
      async () => {
        await page.goto(`${BASE}${PY_TOPIC}`);
        await page.getByRole('heading', { name: /Check your understanding|Revision quiz/ }).scrollIntoViewIfNeeded();
        await answerHowProgramsRun(page, true);
        await page.getByRole('button', { name: 'Submit answers' }).click();
        await expect(page.getByText(/100% · Passed/)).toBeVisible();
      },
    );
    await rec.step(
      'Later, he fails the same quiz',
      'On a later attempt he gets everything wrong. Failing a quiz he had already passed is real evidence of forgetting, so the topic is sent back for revision.',
      async () => {
        await page.getByRole('button', { name: 'Retake' }).click();
        await answerHowProgramsRun(page, false);
        await page.getByRole('button', { name: 'Submit answers' }).click();
        await expect(page.getByText(/Not yet: 70% needed/)).toBeVisible();
      },
    );
    await rec.step(
      'Open the revision queue',
      'The revision queue (Roadmaps → Revision queue) lists topics due now. This one is flagged "Below 60% last time", with the roadmap name and a score that blends his attempts (100% then 0% shows as 50%).',
      async () => {
        await page.goto(`${BASE}/app/learn/revision`);
        await expect(page.getByRole('heading', { name: 'Revision queue', level: 1 })).toBeVisible();
        await expect(page.getByText('Below 60% last time').first()).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.check('The failed topic is due in the revision queue', async () => {
      const r = await api(page.request, 'get', '/api/learning/revision');
      expect(r.body.due.some((x: { slug: string }) => x.slug === 'how-programs-run')).toBe(true);
    });
    await rec.step(
      'Review in revision mode',
      '"Review" reopens the lesson in revision mode: a banner suggests skimming the notes, and the quiz is titled "Revision quiz". His score decides when the topic returns next.',
      async () => {
        await page.locator('li', { hasText: 'How programs run' }).getByRole('link', { name: 'Review' }).click();
        await expect(page.getByText('Revision mode')).toBeVisible();
      },
    );
    await rec.step(
      'Pass the revision quiz',
      'He answers correctly this time and passes. The new review date is shown.',
      async () => {
        await page.getByRole('heading', { name: 'Revision quiz' }).scrollIntoViewIfNeeded();
        await answerHowProgramsRun(page, true);
        await page.getByRole('button', { name: 'Submit answers' }).click();
        await expect(page.getByText(/100% · Passed/)).toBeVisible();
      },
    );
    await rec.step(
      'The queue is updated',
      'Back in the revision queue, the topic has left "Due now" and appears under "Coming up" with its next review date.',
      async () => {
        await page.goto(`${BASE}/app/learn/revision`);
        await expect(page.getByRole('heading', { name: 'Coming up' })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.check('After reviewing, the topic is no longer due', async () => {
      const r = await api(page.request, 'get', '/api/learning/revision');
      expect(r.body.due.some((x: { slug: string }) => x.slug === 'how-programs-run')).toBe(false);
      expect(r.body.upcoming.some((x: { slug: string }) => x.slug === 'how-programs-run')).toBe(true);
    });
  },
);

// ---------------------------------------------------------------------------------------------
scenario(
  {
    id: 'learn-09-skill-dna',
    area: AREA,
    title: 'Skill DNA: a living map of what you can do',
    summary: 'Skill DNA shows every skill coloured by how well it is proven. The map can be filtered by state and category, switched to a list, and each skill opens a page with its evidence timeline. Self-ratings are always labeled "Self-reported".',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step(
      'Open the Skill DNA map',
      'Each box is a skill, grouped in columns by category, with lines linking prerequisites. Colours show the state: green Verified, teal Demonstrated, blue Learning, amber Needs revision, dashed grey Self-reported.',
      async () => {
        await page.goto(`${BASE}/app/skills`);
        await expect(page.getByRole('group', { name: /Skill DNA map/ })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.step(
      'Filter by state with the legend',
      'The legend chips double as filters. Clicking "Self-reported" fades out every skill that is not only self-rated, so the unproven claims stand out.',
      async () => {
        await page.getByRole('button', { name: /^Self-reported \d+$/ }).click();
        await expect(page.getByRole('button', { name: /^Self-reported \d+$/ })).toHaveAttribute('aria-pressed', 'true');
      },
    );
    await rec.step(
      'Filter by category',
      'The category menu narrows the map to one area. Here: Databases.',
      async () => {
        await page.getByRole('button', { name: /^All \d+$/ }).click();
        await page.locator('select[aria-label="Category"]').selectOption('databases');
        await expect(page.getByRole('link', { name: /^SQL basics\b/ })).toBeVisible();
      },
    );
    await rec.step(
      'List view',
      'The List view shows the same skills as a table with state, mastery percentage, confidence, number of evidence items and when the last evidence came in.',
      async () => {
        await page.locator('select[aria-label="Category"]').selectOption('all');
        await page.getByRole('radio', { name: /List/ }).click();
        await expect(page.getByRole('columnheader', { name: 'Mastery' })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.step(
      'Open a skill',
      'Opening "Programming basics" shows the mastery estimate, how confident the system is, the evidence timeline (each item labeled with where it came from, such as Verified or Self-reported) and lessons and problems to improve it.',
      async () => {
        await page.getByRole('link', { name: 'Programming basics', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Programming basics', level: 1 })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Evidence' })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.check('The evidence timeline labels where each item came from', async () => {
      const ev = page.locator('main ol li');
      expect(await ev.count()).toBeGreaterThan(0);
      await expect(page.locator('main ol').getByText(/^(Self-reported|Verified|Unverified|Reviewer confirmed)$/).first()).toBeVisible();
    });
    await rec.step(
      'A skill with no evidence yet',
      'Asha opens "SQL joins". There is no evidence yet, so the page suggests a practice problem to earn some.',
      async () => {
        await page.goto(`${BASE}/app/skills/sql-joins`);
        await expect(page.getByRole('heading', { name: 'SQL joins', level: 1 })).toBeVisible();
      },
    );
    await rec.step(
      'Set a self-rating',
      'She rates herself "Some practice". A self-rating counts for little in the mastery estimate and appears in the evidence timeline labeled "Self-reported", never as verified.',
      async () => {
        await page.getByRole('radio', { name: 'Some practice' }).click();
        await expect(page.getByRole('radio', { name: 'Some practice' })).toHaveAttribute('aria-checked', 'true');
        await expect(page.locator('main ol').getByText('Self-reported', { exact: true })).toBeVisible();
      },
    );
    await rec.check('The self-rating is stored as unverified, self-reported evidence', async () => {
      const s = await api(page.request, 'get', '/api/learning/skills/sql-joins');
      const self = s.body.evidence.filter((e: { source: string }) => e.source === 'self');
      expect(self.length).toBeGreaterThan(0);
      expect(self.every((e: { verified: boolean }) => !e.verified)).toBe(true);
    });
  },
);

// ---------------------------------------------------------------------------------------------
scenario(
  {
    id: 'learn-10-library',
    area: AREA,
    title: 'Library and personal knowledge base',
    summary: 'The library holds curated free resources and original cheat sheets. Asha searches and filters it, opens an external link (with attribution) and an original cheat sheet, rates it, saves it to a collection, reports a correction, and uploads her own notes to a private knowledge base.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step(
      'Open the library',
      'The library lists articles, docs, videos, courses and cheat sheets. Filters on the left narrow by type, difficulty, topic, skill, language and role.',
      async () => {
        await page.goto(`${BASE}/app/library`);
        await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
        await expect(page.getByText(/\d+ resources/)).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.step(
      'Search and filter',
      'She searches for "sql" and sets Type to "Cheat sheet". The result count updates as she types.',
      async () => {
        await page.getByLabel('Search the library').fill('sql');
        await page.getByLabel('Type', { exact: true }).selectOption('cheatsheet');
        await expect(page.getByRole('link', { name: 'SQL joins and aggregation cheat sheet' })).toBeVisible();
      },
    );
    await rec.step(
      'An external resource',
      'Opening "SQLBolt" (a free external site) shows a summary and an "Open on SQLBolt" button. A note credits the original site and explains the platform only links to it and does not host a copy.',
      async () => {
        await page.getByLabel('Type', { exact: true }).selectOption('');
        await page.getByRole('link', { name: 'SQLBolt', exact: true }).click();
        await expect(page.getByRole('link', { name: /Open on SQLBolt/ })).toBeVisible();
        await expect(page.getByText(/does not host a copy/)).toBeVisible();
      },
    );
    await rec.step(
      'An original cheat sheet',
      'The "SQL joins and aggregation cheat sheet" was written for the platform, so it is shown in full on the page with its source and license in the "About this resource" box.',
      async () => {
        await page.goto(`${BASE}/app/library?q=sql&kind=cheatsheet`);
        await page.getByRole('link', { name: 'SQL joins and aggregation cheat sheet' }).click();
        await expect(page.getByRole('heading', { name: 'SQL joins and aggregation cheat sheet', level: 1 }).first()).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.step(
      'Rate it',
      'She gives it 5 stars. A message confirms the new average rating.',
      async () => {
        await page.getByRole('heading', { name: 'Rate this resource' }).scrollIntoViewIfNeeded();
        await page.getByRole('radio', { name: '5 stars' }).click();
        await expect(page.getByText(/Thanks\. Average is now/)).toBeVisible();
      },
    );
    await rec.step(
      'Save it to a new collection',
      '"Bookmark" opens a small menu to save the resource into a collection. She creates a new collection called "SQL revision".',
      async () => {
        await page.getByRole('button', { name: /^(Bookmark|Bookmarked|Saved in)/ }).first().click();
        await page.getByLabel('New collection name').fill('SQL revision');
      },
    );
    await rec.step(
      'Saved',
      'The button now reads "Saved in SQL revision". Collections are listed under Library → Collections.',
      async () => {
        await page.getByRole('button', { name: 'Create collection and save' }).click();
        await expect(page.getByRole('button', { name: 'Saved in SQL revision' })).toBeVisible();
      },
    );
    await rec.step(
      'Report a correction',
      'If something looks wrong, "Report a correction" lets her pick a reason and describe the fix. Reports go to moderators for review.',
      async () => {
        await page.getByRole('button', { name: 'Report a correction' }).click();
        const dlg = page.getByRole('dialog', { name: 'Report a correction' });
        await dlg.getByLabel('Reason').selectOption('outdated');
        await dlg.getByLabel('Details').fill('The HAVING example could mention that it runs after GROUP BY.');
      },
    );
    await rec.step(
      'Report sent',
      'After "Send report" a confirmation thanks her and says the maintainers will review it.',
      async () => {
        await page.getByRole('dialog', { name: 'Report a correction' }).getByRole('button', { name: 'Send report' }).click();
        await expect(page.getByText('Thanks. The maintainers will review your report.')).toBeVisible();
      },
    );
    await rec.check('The cheat sheet is bookmarked in the "SQL revision" collection', async () => {
      const c = await api(page.request, 'get', '/api/library/collections');
      expect(JSON.stringify(c.body)).toContain('SQL revision');
    });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-kb-'));
    const file = path.join(dir, 'http-status-codes.txt');
    fs.writeFileSync(file, 'HTTP status codes\n\n200 OK: the request worked.\n201 Created: a new resource was created.\n404 Not Found: nothing at this address.\n500 Internal Server Error: the server failed.\n');
    await rec.step(
      'Personal knowledge base',
      '"My knowledge base" holds private study material. A banner explains that the AI study assistant can cite these documents when she asks questions, and nobody else can see them.',
      async () => {
        await page.goto(`${BASE}/app/library/knowledge`);
        await expect(page.getByRole('heading', { name: 'My knowledge base', level: 1 })).toBeVisible();
      },
    );
    await rec.step(
      'Upload a text file',
      'She picks a small text file of her notes on HTTP status codes and gives it a title.',
      async () => {
        await page.locator('input[type="file"]').setInputFiles(file);
        await page.getByLabel('Title').fill('HTTP status codes (my notes)');
      },
    );
    await rec.step(
      'Uploaded',
      'After "Upload", the document appears under "Your documents" with its size, character count, a short preview and a "Private" label.',
      async () => {
        await page.getByRole('button', { name: 'Upload' }).click();
        await expect(page.getByText('HTTP status codes (my notes)', { exact: true })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.check('The uploaded document is stored in her knowledge base', async () => {
      const k = await api(page.request, 'get', '/api/library/knowledge');
      expect(k.body.items.some((d: { title: string }) => d.title === 'HTTP status codes (my notes)')).toBe(true);
    });
  },
);

// ---------------------------------------------------------------------------------------------
scenario(
  {
    id: 'learn-11-workspace',
    area: AREA,
    title: 'My workspace: notes, tasks, calendar, links and export',
    summary: 'The personal workspace keeps notes (linked to the lesson they came from), tasks with due dates, a calendar of deadlines, saved links, and a one-click export of everything.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step(
      'Take a note from a lesson',
      'On the lesson "How programs run", Asha clicks "Take a note".',
      async () => {
        await page.goto(`${BASE}${PY_TOPIC}`);
        await page.getByRole('link', { name: 'Take a note' }).scrollIntoViewIfNeeded();
      },
    );
    await rec.step(
      'The note is linked to the lesson',
      'Her workspace opens a new note that is already linked to the lesson ("Linked to Topic: How programs run"), so she can find her notes from the lesson later.',
      async () => {
        await page.getByRole('link', { name: 'Take a note' }).click();
        await expect(page).toHaveURL(/\/app\/workspace/);
        await expect(page.getByText('Topic: How programs run')).toBeVisible();
        await page.getByPlaceholder('What is this note about?').fill('input() always returns text');
        await page.locator('#note-body').fill('- `input()` returns a string\n- Use `int(input())` before doing maths\n- `"4" + "5"` is `"45"`, not 9');
      },
    );
    await rec.step(
      'Note saved',
      'After "Create note" it appears in her notes list with the link to the lesson shown underneath.',
      async () => {
        await page.getByRole('button', { name: 'Create note' }).click();
        await expect(page.getByText('Note created')).toBeVisible();
      },
    );
    await rec.check('The note is saved and linked to the topic', async () => {
      const n = await api(page.request, 'get', '/api/workspace/notes?q=input');
      const list = n.body.items ?? n.body.notes;
      const note = list.find((x: { title: string }) => x.title === 'input() always returns text');
      expect(note).toBeTruthy();
      expect(note.linkType).toBe('topic');
    });
    const due = new Date(Date.now() + 2 * 86400_000);
    due.setHours(18, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dueLocal = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T18:00`;
    await rec.step(
      'Add a task with a due date',
      'In the Tasks tab she adds "Revise string conversion" due in two days at 6 pm, with high priority.',
      async () => {
        await page.getByRole('tab', { name: 'Tasks' }).click();
        await page.locator('#quick-task-title').fill('Revise string conversion');
        await page.locator('#quick-task-due').fill(dueLocal);
        await page.getByLabel('Priority').selectOption('high');
      },
    );
    await rec.step(
      'Task added',
      'The task joins her to-do list with its due date. Ticking the checkbox completes it.',
      async () => {
        await page.getByRole('button', { name: 'Add task' }).click();
        await expect(page.getByText('Revise string conversion')).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.step(
      'Calendar',
      'The Calendar tab shows the month with her task deadlines, plus deadlines and sessions from courses, assessments, interviews and projects, colour-coded by type.',
      async () => {
        await page.getByRole('tab', { name: 'Calendar' }).click();
        if (due.getMonth() !== new Date().getMonth()) await page.getByRole('button', { name: 'Next month' }).click();
        await expect(page.getByLabel(/Revise string conversion/).first()).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.step(
      'Saved links',
      'The Links tab keeps useful web pages with a note on why they matter. She saves the official Python documentation on input().',
      async () => {
        await page.getByRole('tab', { name: 'Links' }).click();
        await page.getByPlaceholder('MDN guide to flexbox').fill('Python input() reference');
        await page.getByPlaceholder('https://').fill('https://docs.python.org/3/library/functions.html#input');
        await page.getByPlaceholder('Why this link is useful').fill('Official docs for input()');
        await page.getByRole('button', { name: 'Save link' }).click();
        await expect(page.getByText('Link saved')).toBeVisible();
      },
    );
    await rec.step(
      'Export everything',
      'The "Import and export" tab downloads a copy of the whole workspace at any time: one JSON file, or all notes as Markdown files in a ZIP.',
      async () => {
        await page.getByRole('tab', { name: 'Import and export' }).click();
        await expect(page.getByRole('link', { name: 'Download JSON export' })).toBeVisible();
      },
    );
    await rec.check('The JSON export downloads and contains the new note', async () => {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download JSON export' }).click()]);
      const p = await dl.path();
      const text = fs.readFileSync(p!, 'utf8');
      expect(text).toContain('input() always returns text');
    });
  },
);

// ---------------------------------------------------------------------------------------------
scenario(
  {
    id: 'learn-12-goals-and-streaks',
    area: AREA,
    title: 'Goals, achievements, leaderboard, challenges and journal',
    summary: 'Asha sets a weekly goal, looks at her streak calendar and achievements (earned and locked), opts in to the weekly leaderboard, joins a challenge and writes a journal entry.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step(
      'Open Goals and streaks',
      'The page shows her streak, XP this week and level, her goals, a study calendar (rest days never count against her) and achievements.',
      async () => {
        await page.goto(`${BASE}/app/goals`);
        await expect(page.getByRole('heading', { name: 'Goals and progress', level: 1 })).toBeVisible();
        await expect(page.getByText('Study calendar')).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.step(
      'Create a weekly goal',
      '"New goal" opens a form. She enters "Solve 3 problems this week", type Weekly, measured by Problems solved, target 3. Progress is then counted automatically from completed work.',
      async () => {
        await page.getByRole('button', { name: 'New goal' }).click();
        const dlg = page.getByRole('dialog', { name: 'New goal' });
        await dlg.getByLabel('Goal', { exact: true }).fill('Solve 3 problems this week');
        await dlg.getByLabel('Type').selectOption('weekly');
        await dlg.getByLabel('Measure').selectOption('problems');
        await dlg.getByLabel('Target', { exact: true }).fill('3');
      },
    );
    await rec.step(
      'Goal added',
      'The goal appears in the list with a progress bar.',
      async () => {
        await page.getByRole('dialog', { name: 'New goal' }).getByRole('button', { name: 'Add goal' }).click();
        await expect(page.getByText('Solve 3 problems this week')).toBeVisible();
      },
    );
    await rec.check('The weekly goal is saved', async () => {
      const g = await api(page.request, 'get', '/api/learning/goals');
      expect(g.body.goals.some((x: { title: string; kind: string }) => x.title === 'Solve 3 problems this week' && x.kind === 'weekly')).toBe(true);
    });
    await rec.step(
      'Achievements',
      'Achievements are earned only from real, completed work. Earned ones show a medal and date; locked ones are dashed with a lock and say how to earn them.',
      async () => {
        await page.getByText(/of \d+ earned/).scrollIntoViewIfNeeded();
        await expect(page.getByText('(locked)').first()).toBeAttached();
      },
    );
    await rec.step(
      'Weekly leaderboard',
      'The Leaderboard tab ranks people by XP earned this week. Only people who opt in are shown. Asha is off by default.',
      async () => {
        await page.getByRole('tab', { name: 'Leaderboard' }).click();
        await expect(page.getByRole('switch', { name: /Show me on leaderboards/ })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.step(
      'Opt in to the leaderboard',
      'She turns on "Show me on leaderboards". She now appears in the ranking, highlighted as "(you)", and her name and weekly XP are visible to others. (Demo accounts carry a "Sample data" tag.)',
      async () => {
        await page.getByRole('switch', { name: /Show me on leaderboards/ }).click();
        await expect(page.getByRole('switch', { name: /Show me on leaderboards/ })).toHaveAttribute('aria-checked', 'true');
      },
    );
    await rec.check('The leaderboard opt-in is saved', async () => {
      const me = await api(page.request, 'get', '/api/auth/me');
      expect(JSON.stringify(me.body)).toContain('"showOnLeaderboard":true');
    });
    await rec.step(
      'Join a challenge',
      'The Challenges tab lists optional challenges such as this month\'s problem-solving sprint. She clicks "Join" and a progress bar appears.',
      async () => {
        await page.getByRole('tab', { name: 'Challenges' }).click();
        const card = page.locator('div', { hasText: /problem-solving sprint/ }).filter({ has: page.getByRole('button', { name: 'Join' }) }).last();
        await card.getByRole('button', { name: 'Join' }).click();
        await expect(page.getByText('You joined the challenge')).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
    await rec.step(
      'Write a journal entry',
      'The Journal is a private place for reflections. She writes a short weekly review and picks a mood.',
      async () => {
        await page.getByRole('tab', { name: 'Journal' }).click();
        await page.getByLabel('Type').selectOption('weekly_review');
        await page.getByLabel('Entry').fill('Passed the Python input quiz on the second try. Next week: loops and two CodeLab problems.');
        await page.getByRole('radio', { name: 'Good' }).click();
      },
    );
    await rec.step(
      'Entry saved',
      'After "Save entry" it appears at the top of her journal with the date and mood.',
      async () => {
        await page.getByRole('button', { name: 'Save entry' }).click();
        await expect(page.getByText('Entry saved')).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      },
      { fullPage: true },
    );
  },
);
