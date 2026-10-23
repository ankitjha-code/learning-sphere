import type { Page } from '@playwright/test';
import { scenario, expect, login, person, api, setEditor, demo, BASE } from './recorder';

/* Walkthroughs for CodeLab, assessments and the AI Expert Council. */

const PRACTICE = 'Practice and assessments';
const AI = 'AI Expert Council';

// Code used in the walkthroughs. Correct versions match the library's reference solutions.
const TWO_SUM_HARDCODED = `// Print the answer from the example and hope for the best\nconsole.log('0 1');\n`;
const TWO_SUM_JS = `const data = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean);
const n = Number(data[0]);
const nums = data.slice(1, 1 + n).map(Number);
const target = Number(data[1 + n]);
const seen = new Map();
for (let j = 0; j < n; j++) {
  const need = target - nums[j];
  if (seen.has(need)) {
    console.log(seen.get(need) + ' ' + j);
    break;
  }
  if (!seen.has(nums[j])) seen.set(nums[j], j);
}
`;
const PARENS_COUNTING = `const s = require('fs').readFileSync(0, 'utf8').trim();
// Idea: the string is valid when there are as many openers as closers
let open = 0;
let close = 0;
for (const ch of s) {
  if (ch === '(' || ch === '[' || ch === '{') open++;
  else close++;
}
console.log(open === close ? 'true' : 'false');
`;
const EVEN_ODD_PY_BUG = `n = input()\nprint("even" if n % 2 == 0 else "odd")\n`;
const EVEN_ODD_PY = `n = int(input())\nprint("even" if n % 2 == 0 else "odd")\n`;
const SUM_JS = `const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split('\\n').map(Number);\nconsole.log(a + b);\n`;
const SQL_FIRST_TRY = `SELECT name, salary\nFROM employees\nORDER BY salary DESC\nLIMIT 4;`;
const SQL_CORRECT = `SELECT name, salary\nFROM employees\nORDER BY salary DESC, name ASC\nLIMIT 4;`;

const AI_WAIT = 90_000;

/** Moves the pointer out of the way so tooltips do not cover the screenshot. */
async function calm(page: Page) {
  await page.mouse.move(1435, 895);
}

async function openProblem(page: Page, slug: string) {
  await page.goto(`${BASE}/app/practice/${slug}`);
  await expect(page.locator('.cm-content').first()).toBeVisible();
}

async function click(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await calm(page);
}

/** Answers whatever question is currently on screen in an assessment, choosing the first option. */
async function answerCurrent(page: Page) {
  const main = page.locator('div.min-w-0.space-y-5').first();
  const radio = main.locator('input[type=radio]');
  if (await radio.count()) return radio.first().check();
  const box = main.locator('input[type=checkbox]');
  if (await box.count()) return box.first().check();
  const blanks = main.getByLabel(/^Blank \d+$/);
  if (await blanks.count()) {
    for (let i = 0; i < (await blanks.count()); i++) await blanks.nth(i).fill('int');
    return;
  }
  const matches = main.locator('select[aria-label^="Match for"]');
  if (await matches.count()) {
    for (let i = 0; i < (await matches.count()); i++) await matches.nth(i).selectOption({ index: 1 });
    return;
  }
  const text = main.getByLabel('Your answer');
  if (await text.count()) return text.fill('A loop repeats a block of code.');
}

/** Waits until an AI answer finishes in the chat, or an honest failure is shown. Returns which. */
async function waitForAnswer(page: Page): Promise<'answer' | 'failed'> {
  const answer = page.locator('article').getByText('AI generated', { exact: true }).last();
  const failed = page.getByText(/Your message was saved|No answer/).last();
  await expect(answer.or(failed)).toBeVisible({ timeout: AI_WAIT });
  return (await answer.isVisible()) ? 'answer' : 'failed';
}

// ---------------------------------------------------------------- CodeLab

scenario(
  {
    id: 'practice-01-codelab-problem-list',
    area: PRACTICE,
    title: 'Browse CodeLab problems: search, filters, collections and progress markers',
    summary: 'A learner opens CodeLab, the coding and SQL practice area. The problem list can be searched, filtered by difficulty, type and status, and narrowed to themed collections. Icons show which problems are solved or only attempted.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step(
      'Open CodeLab',
      'The top of the page counts solved and attempted problems. Below are themed collections (for example "Interview essentials" or "SQL basics") with a solved/total count, then the full problem list with difficulty labels.',
      async () => {
        await page.goto(`${BASE}/app/practice`);
        await expect(page.getByRole('heading', { name: 'CodeLab', level: 1 })).toBeVisible();
        await expect(page.getByText('Solved').first()).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step('Search for a problem', 'Typing "sum" narrows the list to matching problems. The green tick next to "Sum of two numbers" means this learner already solved it; empty circles mean not started yet.', async () => {
      await page.getByLabel('Search problems').fill('sum');
      await expect(page).toHaveURL(/q=sum/);
      await expect(page.getByRole('link', { name: 'Two sum' })).toBeVisible();
    });
    await rec.check('A solved problem is marked as solved in the list', async () => {
      await expect(page.locator('li', { hasText: 'Sum of two numbers' }).getByLabel('Solved')).toBeVisible();
    });
    await rec.step('Filter by difficulty and type', 'The search is cleared, then the filters are set to "Medium" difficulty and "SQL" problems only. Every row now carries the blue SQL label and the orange Medium label.', async () => {
      await page.getByLabel('Search problems').fill('');
      await expect(page).not.toHaveURL(/q=sum/);
      await page.getByLabel('Difficulty').selectOption('medium');
      await page.getByLabel('Problem type').selectOption('sql');
      await expect(page).toHaveURL(/difficulty=medium/);
      await expect(page).toHaveURL(/type=sql/);
      await expect(page.getByRole('link', { name: 'Big spenders' })).toBeVisible();
    });
    await rec.step('Show only problems that were attempted', 'With the status filter set to "Attempted", only problems the learner tried but has not passed yet are listed. The half-filled orange circle is the "attempted" marker; hovering over it shows the best share of tests passed so far.', async () => {
      await page.getByLabel('Difficulty').selectOption('');
      await page.getByLabel('Problem type').selectOption('');
      await page.getByLabel('Status').selectOption('attempted');
      await expect(page.getByRole('link', { name: 'Four highest salaries' })).toBeVisible();
    });
    await rec.check('An attempted but unsolved problem shows the "Attempted" marker', async () => {
      await expect(page.locator('li', { hasText: 'Four highest salaries' }).getByLabel('Attempted')).toBeVisible();
    });
    await rec.step('Open a themed collection', 'Clicking the "Graphs" collection chip shows only grid, BFS and shortest-path problems. The chip shows how many of them are solved. Clicking it again removes the filter.', async () => {
      await page.getByLabel('Status').selectOption('');
      await page.getByRole('region', { name: 'Collections' }).getByRole('button', { name: /^Graphs/ }).click();
      await calm(page);
      await expect(page).toHaveURL(/collection=graphs/);
      await expect(page.getByRole('link', { name: 'Number of islands' })).toBeVisible();
    });
    await rec.check('The collection filter only lists graph problems', async () => {
      await expect(page.getByRole('link', { name: 'Two sum' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Shortest path in a grid' })).toBeVisible();
    });
  },
);

scenario(
  {
    id: 'practice-02-solve-two-sum-javascript',
    area: PRACTICE,
    title: 'Solve a coding problem in JavaScript: wrong answer, hint, then accepted',
    summary: 'The learner works on "Two sum". A shortcut that only copies the example passes the visible test but fails the hidden ones. After reading a stored hint, a real solution is accepted and recorded as verified evidence in the Skill DNA.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step('Read the problem', 'The left panel explains the task, the input format and an example. The editor is on the right and the sample tests are below it. Code runs for real in a sandbox; nothing is simulated.', async () => {
      await openProblem(page, 'two-sum');
      await page.getByLabel('Language').selectOption('javascript');
      await expect(page.getByText('Runs in browser-safe sandbox (QuickJS)')).toBeVisible();
      await expect(page.getByText('Pair not at the start')).toBeVisible();
    });
    await rec.step('Try a shortcut and run the sample tests', 'The learner prints the example answer "0 1" instead of solving the problem. "Run" checks only the two sample tests: one passes, the other fails, and the failing test shows its input, the expected output and what the program printed.', async () => {
      await setEditor(page, TWO_SUM_HARDCODED);
      await click(page, 'Run');
      await expect(page.getByText('1 of 2 tests passed')).toBeVisible();
    });
    await rec.step('Submit the shortcut', '"Submit" runs every test, including hidden ones. The result is "Wrong answer". Hidden tests only say passed or failed, never their input or expected output, so answers cannot be hard-coded.', async () => {
      await click(page, 'Submit');
      await expect(page.getByText(/Hidden tests: \d+ of 5 passed/)).toBeVisible();
      await page.getByText(/Hidden tests: \d+ of 5 passed/).scrollIntoViewIfNeeded();
    });
    await rec.check('The submission is judged "Wrong answer" and hidden tests show only pass/fail', async () => {
      await expect(page.getByText('Wrong answer').first()).toBeVisible();
      await expect(page.getByText('Hidden test inputs and expected outputs are not shown')).toBeVisible();
    });
    await rec.step('Reveal a stored hint', 'In the Hints tab, hints open one at a time. Each gives away a little more, so the learner can stop as soon as they have an idea. Below them is an optional AI nudge (shown in another walkthrough).', async () => {
      await page.getByRole('tab', { name: /Hints/ }).click();
      await page.getByRole('button', { name: /Show hint 1 of 3/ }).click();
      await calm(page);
      await expect(page.getByText('Hint 1', { exact: true })).toBeVisible();
    });
    await rec.step('Submit a real solution', 'Using a lookup table as the hint suggests, the new code passes all sample and hidden tests. The result is "Accepted", and a green banner confirms that verified evidence was added to the learner\'s Skill DNA for the linked skills.', async () => {
      await setEditor(page, TWO_SUM_JS);
      await click(page, 'Submit');
      await expect(page.getByText('Verified evidence added to Skill DNA')).toBeVisible();
    });
    await rec.check('The correct solution is accepted and creates verified evidence', async () => {
      await expect(page.getByText('Accepted').first()).toBeVisible();
      await expect(page.getByText(/Hidden tests: 5 of 5 passed/)).toBeVisible();
    });
    await rec.step('Look at the submission history', 'The Submissions tab lists every submission with its result, language, tests passed and time. Clicking one opens the exact code that was judged, together with its test results.', async () => {
      await page.getByRole('tab', { name: 'Submissions' }).click();
      await expect(page.getByText('Your history')).toBeVisible();
      await page.locator('ul li button', { hasText: 'Accepted' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Submission details' })).toBeVisible();
    });
    await rec.step('See the evidence on the skill page', 'On the "Hash maps and sets" skill page, the evidence timeline now has a "CodeLab (tested)" entry marked Verified. Evidence like this counts more than a self-rating because the code actually passed every test.', async () => {
      await page.keyboard.press('Escape');
      await page.goto(`${BASE}/app/skills/hashing`);
      await expect(page.getByText('CodeLab (tested)').first()).toBeVisible();
    });
    await rec.check('The skill page lists "CodeLab (tested)" evidence as Verified', async () => {
      const dna = await api(page.request, 'get', '/api/learning/skills/hashing');
      expect(dna.body.evidence.some((e: { source: string; verified: boolean }) => e.source === 'practice' && e.verified)).toBe(true);
      await expect(page.getByText('Verified').first()).toBeVisible();
    });
  },
);

scenario(
  {
    id: 'practice-03-python-docker-sandbox',
    area: PRACTICE,
    title: 'Run Python code in the Docker sandbox',
    summary: 'Languages other than JavaScript, TypeScript and SQL run inside an isolated Docker container. The learner solves "Even or odd" in Python: a first try crashes with a real Python error, the fix is accepted.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    const runtimes = await api(page.request, 'get', '/api/practice/runtimes');
    const py = runtimes.body.runtimes.find((r: { language: string }) => r.language === 'python');
    await openProblem(page, 'even-or-odd');
    if (!py?.available) {
      await rec.step('Python is not available on this server', `Docker is not running here, so the language picker labels Python as unavailable and says why ("${py?.reason ?? 'no sandbox'}"). Nothing is faked: Run and Submit are disabled for Python, and JavaScript still works.`, async () => {
        await page.getByLabel('Language').selectOption('python');
        await expect(page.getByText(/Unavailable on this server/)).toBeVisible();
      });
      await rec.check('The unavailable state is shown honestly', async () => expect(page.getByText(/Unavailable on this server/)).toBeVisible());
      return;
    }
    await rec.step('Choose Python', 'The language picker is set to Python. The label next to it says "Docker sandbox": the code will run in a locked-down container with no network access and strict time and memory limits.', async () => {
      await page.getByLabel('Language').selectOption('python');
      await expect(page.getByText('Docker sandbox', { exact: true })).toBeVisible();
    });
    await rec.check('Python runs in the Docker sandbox', async () => expect(page.getByText('Docker sandbox', { exact: true })).toBeVisible());
    await rec.step('First try: forget to convert the input', 'The learner forgets that input() returns text. Running the sample tests gives a "Runtime error", and the real Python error message from the container is shown under "Errors (stderr)".', async () => {
      await setEditor(page, EVEN_ODD_PY_BUG);
      await click(page, 'Run');
      await expect(page.getByText('Errors (stderr)').first()).toBeVisible({ timeout: 60_000 });
    });
    await rec.step('Fix the bug and run again', 'With int(...) around the input, both sample tests pass. The result line says how long the run took and that it ran in the Docker sandbox.', async () => {
      await setEditor(page, EVEN_ODD_PY);
      await click(page, 'Run');
      await expect(page.getByText('2 of 2 tests passed')).toBeVisible({ timeout: 60_000 });
    });
    await rec.step('Submit for judging', 'Submitting runs the hidden tests too (zero and negative numbers). All pass, the problem is marked "Solved", and verified evidence is added to the Skill DNA.', async () => {
      await click(page, 'Submit');
      await expect(page.getByText('Verified evidence added to Skill DNA')).toBeVisible({ timeout: 60_000 });
    });
    await rec.check('The Python submission is accepted', async () => {
      await expect(page.getByText(/Hidden tests: 3 of 3 passed/)).toBeVisible();
      await expect(page.getByText('Submission · Docker sandbox', { exact: false })).toBeVisible();
    });
  },
);

scenario(
  {
    id: 'practice-04-sql-problem',
    area: PRACTICE,
    title: 'Solve a SQL problem on a real PostgreSQL sandbox',
    summary: 'The learner returns to "Four highest salaries", a SQL problem they got wrong earlier. They read the table schema, run a query to see its rows, submit a version that breaks ties the wrong way, then fix it.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step('Read the problem and the schema', 'SQL problems show the table definitions (the schema) next to the task. The sample data itself stays hidden; every query runs on a fresh copy of the database. This problem says row order matters.', async () => {
      await openProblem(page, 'sql-top-four-salaries');
      await expect(page.getByText('Schema (PostgreSQL)')).toBeVisible();
      await expect(page.getByText('Row order matters for this problem.')).toBeVisible();
    });
    await rec.step('Run a first query', 'The learner sorts by salary and keeps four rows. "Run" shows the returned rows in a table and the column names the answer should have; the expected rows are never shown. The note already says "Row 4 does not match": Chen and Divya both earn 95000, and without a tie-break the database put Divya fourth.', async () => {
      await setEditor(page, SQL_FIRST_TRY);
      await click(page, 'Run');
      await expect(page.getByText('Your result')).toBeVisible();
      await expect(page.getByText('Expected columns:')).toBeVisible();
      await page.getByText('Expected columns:').scrollIntoViewIfNeeded();
    });
    await rec.check('The query result is shown as a table of rows', async () => {
      await expect(page.locator('table thead th', { hasText: 'salary' })).toBeVisible();
      await expect(page.locator('table tbody tr')).toHaveCount(4);
    });
    await rec.step('Submit it anyway', 'Submitting the same query records it as a judged submission: "Wrong answer", with the reason in plain words. The task says that on equal salaries the name that comes first alphabetically wins, and this query does not say that.', async () => {
      await click(page, 'Submit');
      await expect(page.getByText('Submission · Runs on a fresh PostgreSQL sandbox (PGlite)', { exact: false })).toBeVisible();
      await expect(page.getByText('Wrong answer').first()).toBeVisible();
    });
    await rec.step('Add the tie-break and submit again', 'Adding "name ASC" as a second sort key settles the tie. The submission is "Accepted" and SQL evidence is added to the Skill DNA.', async () => {
      await setEditor(page, SQL_CORRECT);
      await click(page, 'Submit');
      await expect(page.getByText('Verified evidence added to Skill DNA')).toBeVisible();
    });
    await rec.check('The correct query is accepted', async () => {
      await expect(page.getByText('Accepted').first()).toBeVisible();
      await expect(page.getByText('Runs on a fresh PostgreSQL sandbox (PGlite)').first()).toBeVisible();
    });
  },
);

scenario(
  {
    id: 'practice-05-give-up-view-solution',
    area: PRACTICE,
    title: 'Give up and view the solution',
    summary: 'Reference solutions are locked until a problem is solved. A stuck learner can choose to see the solution early; the app asks first and notes it on any later evidence, so the Skill DNA stays honest.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step('Open the Solution tab before solving', 'On "Climbing stairs", the Solution tab explains that the reference solution unlocks after an accepted submission. It suggests using the hints first, and offers a "Give up and view solution" button.', async () => {
      await openProblem(page, 'climbing-stairs');
      await page.getByRole('tab', { name: 'Solution' }).click();
      await expect(page.getByText('The solution unlocks when you solve the problem')).toBeVisible();
    });
    await rec.step('Ask to see the solution', 'A confirmation explains the trade-off: the learner can still solve the problem later and it will count, but the evidence will note that the solution was viewed first.', async () => {
      await page.getByRole('button', { name: 'Give up and view solution' }).click();
      await expect(page.getByRole('dialog', { name: 'View the solution now?' })).toBeVisible();
    });
    await rec.step('Read the reference solution', 'After confirming, the explanation, the complexity stated by the author (clearly marked "not measured") and reference code in each language are shown. A blue note reminds the learner that they chose to view it.', async () => {
      await page.getByRole('button', { name: 'Show solution' }).click();
      await calm(page);
      await expect(page.getByText('You chose to view the solution.')).toBeVisible();
    });
    await rec.check('The solution is unlocked and marked as viewed early', async () => {
      await expect(page.getByText(/Reference solution in (Python|JavaScript)/).first()).toBeVisible();
      await expect(page.getByText('Complexity stated by the author (not measured)')).toBeVisible();
    });
  },
);

scenario(
  {
    id: 'practice-06-algorithm-visualizer',
    area: PRACTICE,
    title: 'Step through algorithms in the visualizer',
    summary: 'The algorithm visualizer animates classic algorithms on the learner\'s own input: sorting, binary search and breadth-first search on a grid. Each step comes with a one-line explanation.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step('Open the visualizer', 'From CodeLab, "Open visualizer" leads here. The Sorting tab shows the array as bars. Play, step forward and back, and speed controls are below, with an explanation of the current step.', async () => {
      await page.goto(`${BASE}/app/practice`);
      await page.getByRole('link', { name: 'Open visualizer' }).click();
      await expect(page.getByRole('heading', { name: 'Algorithm visualizer' })).toBeVisible();
    });
    await rec.step('Step through bubble sort', 'After a few "Next step" clicks, two bars are highlighted as they are compared or swapped. The note explains the step in words, for example "Compare 29 and 10", and the counter shows the step number.', async () => {
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next step' }).click();
      await calm(page);
      await expect(page.getByText(/Step 4 of \d+/)).toBeVisible();
    });
    await rec.check('Stepping moves forward one step at a time with an explanation', async () => {
      await expect(page.getByText(/Step 4 of \d+/)).toBeVisible();
      await expect(page.getByText(/Compare \d+ and \d+|swap them/).first()).toBeVisible();
    });
    await rec.step('Switch to merge sort', 'Choosing "Merge sort" restarts on the same numbers. The legend changes to show which part of the array is being merged and which value was just written.', async () => {
      await page.getByLabel('Algorithm').selectOption('merge');
      for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next step' }).click();
      await calm(page);
      await expect(page.getByText('Outside the current merge')).toBeVisible();
    });
    await rec.step('Binary search', 'The Binary search tab looks for 47 in a sorted list. Each step checks the middle value and rules out half of the list (greyed out). At the end the target is found and highlighted.', async () => {
      await page.getByRole('tab', { name: 'Binary search' }).click();
      await page.getByLabel('Target').fill('47');
      const region = page.getByRole('group', { name: /Binary search visualization/ });
      await region.focus();
      await page.keyboard.press('End');
      await expect(page.getByText(/47 equals 47\. Found at index \d+/)).toBeVisible();
    });
    await rec.step('Breadth-first search on a grid', 'On "BFS on a grid", the learner adds an extra wall by clicking a cell, then jumps to the last step. BFS explores outward from the start (S) and the shortest route to the goal (G) is shown in green.', async () => {
      await page.getByRole('tab', { name: 'BFS on a grid' }).click();
      await page.locator('[role=application] > div').nth(5 * 12 + 5).dispatchEvent('mousedown');
      const region = page.getByRole('group', { name: /Breadth-first search visualization/ });
      await region.focus();
      await page.keyboard.press('End');
      await expect(page.getByText(/Reached the goal\. The shortest path has \d+ steps\./)).toBeVisible();
    });
    await rec.check('BFS finds a shortest path to the goal', async () => expect(page.getByText(/Reached the goal\. The shortest path has \d+ steps\./)).toBeVisible());
  },
);

// ---------------------------------------------------------------- Assessments

scenario(
  {
    id: 'practice-07-diagnostic-assessment',
    area: PRACTICE,
    title: 'Take the Python foundations diagnostic',
    summary: 'A diagnostic shows what the learner already knows. The learner reads the rules, answers questions with autosave, flags one for review, uses the question navigator, submits with a warning about unanswered questions, then sees a scored result whose skill scores feed the Skill DNA.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step('Find the diagnostic', 'The Assessments hub groups what the learner can take: anything assigned by a college or employer, public diagnostics, and practice quizzes. Each card shows the number of questions and the time limit.', async () => {
      await page.goto(`${BASE}/app/assessments`);
      await expect(page.getByRole('link', { name: 'Python foundations diagnostic' })).toBeVisible();
    });
    await rec.step('Read the rules before starting', 'The overview lists the rules: 12 questions, a 30-minute timer that keeps running if you leave, unlimited attempts, and results shown right away with explanations. A blue note explains that diagnostics have no pass or fail and feed the Skill DNA.', async () => {
      await page.getByRole('link', { name: 'Python foundations diagnostic' }).click();
      await expect(page.getByText('Before you start')).toBeVisible();
      await expect(page.getByText('How diagnostics are used')).toBeVisible();
    }, { fullPage: true });
    await rec.check('The overview shows the time limit and attempts', async () => {
      await expect(page.getByText('30 minutes')).toBeVisible();
      await expect(page.getByText(/Unlimited \(0 used\)/)).toBeVisible();
    });
    await rec.step('Start the timer', 'Starting asks for confirmation because the timer begins straight away. The test page then shows one question at a time, the countdown at the top, and a question navigator on the right.', async () => {
      await page.getByRole('button', { name: 'Start assessment' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Start', exact: true }).click();
      await expect(page).toHaveURL(/\/assessments\/attempts\//);
      await expect(page.getByText('Question 1 of 12')).toBeVisible();
    });
    await rec.step('Answer questions; answers save automatically', 'The learner answers the first questions and moves on with "Next". After each answer the indicator at the top says "All answers saved", so nothing is lost if the browser closes. Answered questions turn blue in the navigator.', async () => {
      for (let i = 0; i < 4; i++) {
        await answerCurrent(page);
        await page.getByRole('button', { name: /^Next/ }).click();
      }
      await answerCurrent(page);
      await expect(page.getByText('All answers saved')).toBeVisible();
      await calm(page);
    });
    await rec.step('Flag a question for review', 'On question 5 the learner is unsure and presses "Flag for review". The navigator shows a small flag on that number and counts "1 flagged", so it is easy to come back to.', async () => {
      await page.getByRole('button', { name: 'Flag for review' }).click();
      await calm(page);
      await expect(page.getByText('1 flagged')).toBeVisible();
    });
    await rec.step('Jump around with the question navigator', 'Clicking number 11 in the navigator jumps straight to that question. The learner answers it, leaving questions 6 to 10 and 12 unanswered for now.', async () => {
      await page.getByRole('button', { name: /^Question 11,/ }).click();
      await expect(page.getByText('Question 11 of 12')).toBeVisible();
      await answerCurrent(page);
      await expect(page.getByText('All answers saved')).toBeVisible();
      await calm(page);
    });
    await rec.step('Submit: the app lists what is missing', 'Pressing Submit opens a confirmation that lists the unanswered questions and the flagged ones, and warns that answers cannot be changed after submitting.', async () => {
      await page.getByRole('button', { name: 'Submit', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Submit your answers?' })).toBeVisible();
    });
    await rec.check('The submit dialog lists unanswered and flagged questions', async () => {
      const dialog = page.getByRole('dialog', { name: 'Submit your answers?' });
      await expect(dialog.getByText(/Unanswered: Q6, Q7, Q8, Q9, Q10, Q12/)).toBeVisible();
      await expect(dialog.getByText(/Flagged for review: Q5/)).toBeVisible();
    });
    await rec.step('See the result with explanations', 'After submitting, the result page shows the score, a "Diagnostic" label instead of pass or fail, a per-skill breakdown under "Added to your Skill DNA", and every question with the correct answer and an explanation.', async () => {
      await page.getByRole('button', { name: 'Submit answers' }).click();
      await expect(page).toHaveURL(/\/result$/);
      for (let i = 0; i < 10 && !(await page.getByText('Question breakdown').isVisible()); i++) {
        await page.waitForTimeout(1500);
        await page.reload();
      }
      await expect(page.getByText('Question breakdown')).toBeVisible();
    });
    await rec.check('The result shows a score and explanations', async () => {
      await expect(page.getByText('Score', { exact: true })).toBeVisible();
      await expect(page.getByText('Explanation:').first()).toBeVisible();
    });
    await rec.step('The Skill DNA now has graded evidence', 'Opening one of the listed skills shows a new "Graded assessment" entry in its evidence timeline, marked Verified because the answers were graded automatically.', async () => {
      await page.locator('a[href^="/app/skills/"]').first().click();
      await expect(page.getByText('Graded assessment').first()).toBeVisible();
    });
    await rec.check('The skill page lists "Graded assessment" evidence', async () => expect(page.getByText('Graded assessment').first()).toBeVisible());
  },
);

scenario(
  {
    id: 'practice-08-personal-practice-quiz',
    area: PRACTICE,
    title: 'Generate a personal practice quiz',
    summary: 'Learners can build their own quiz from the public question bank by topic or skill, difficulty and length. Only they can see it, and answers with explanations appear after each attempt.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step('Open the quiz generator', 'On the Assessments hub, "Generate practice quiz" opens a short form: focus on a topic or a skill, choose a difficulty, the number of questions and an optional time limit.', async () => {
      await page.goto(`${BASE}/app/assessments`);
      await page.getByRole('button', { name: 'Generate practice quiz' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Generate a practice quiz' })).toBeVisible();
      await expect(page.getByRole('dialog').getByLabel('Topic')).toBeVisible();
    });
    await rec.step('Choose the settings', 'The learner keeps "Any topic" for a mixed quiz, picks "Easy" and asks for 5 questions. Each topic in the list shows how many questions the bank has for it.', async () => {
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Difficulty').selectOption('easy');
      await dialog.getByLabel('Questions').fill('5');
    });
    await rec.step('Generate the quiz', 'The quiz is created and its overview opens. The label "Only you can see this" confirms it is private. It is untimed and can be retaken any number of times. A blue "Organizer preview" note also appears, because technically the learner owns this quiz; it is harmless but the wording is a little confusing for a personal quiz.', async () => {
      await page.getByRole('button', { name: 'Generate quiz' }).click();
      await expect(page.getByText('Only you can see this')).toBeVisible();
    });
    await rec.check('A private practice quiz was created', async () => {
      await expect(page.getByText('Only you can see this')).toBeVisible();
      await expect(page.getByText('Untimed')).toBeVisible();
    });
    await rec.step('Take the quiz', 'The learner starts the quiz and answers the first two questions. Without a timer, the page simply shows the progress in the navigator and saves answers as they go.', async () => {
      await page.getByRole('button', { name: 'Start assessment' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Start', exact: true }).click();
      await expect(page.getByText(/Question 1 of \d+/)).toBeVisible();
      await answerCurrent(page);
      await page.getByRole('button', { name: /^Next/ }).click();
      await answerCurrent(page);
      await expect(page.getByText('All answers saved')).toBeVisible();
      await calm(page);
    });
    await rec.step('Submit and review the answers', 'After submitting, the result page shows the score and goes through every question, marking each answer correct or incorrect, with the right answer and an explanation.', async () => {
      await page.getByRole('button', { name: 'Submit', exact: true }).click();
      await page.getByRole('button', { name: 'Submit answers' }).click();
      await expect(page).toHaveURL(/\/result$/);
      for (let i = 0; i < 10 && !(await page.getByText('Question breakdown').isVisible()); i++) {
        await page.waitForTimeout(1500);
        await page.reload();
      }
      await expect(page.getByText('Question breakdown')).toBeVisible();
    });
    await rec.check('The practice result shows explanations', async () => expect(page.getByText('Explanation:').first()).toBeVisible());
  },
);

// ---------------------------------------------------------------- AI Expert Council (live AI)

scenario(
  {
    id: 'ai-01-coding-hint',
    area: AI,
    title: 'Ask the AI coach for a nudge on a coding problem',
    summary: 'Stuck on "Valid parentheses" with a flawed idea, the learner asks the AI coach for a nudge. The answer comes from a real AI model (Google Gemini free tier), is labeled "AI generated", and points to the next idea instead of handing over the solution.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step('Write an idea that does not work', 'The learner tries to count opening and closing brackets. Running the sample tests shows "Wrong answer": "(]" has one of each but is not valid, because the bracket types do not match.', async () => {
      await openProblem(page, 'valid-parentheses');
      await page.getByLabel('Language').selectOption('javascript');
      await setEditor(page, PARENS_COUNTING);
      await click(page, 'Run');
      await expect(page.getByText('1 of 2 tests passed')).toBeVisible();
    });
    await rec.step('Open the help options', 'The Hints tab has stored hints written by the problem author, and an "AI nudge" section. The text explains that the AI coach reads the problem, the sample tests and the current code, is told not to give the solution, and never sees hidden tests.', async () => {
      await page.getByRole('tab', { name: /Hints/ }).click();
      await expect(page.getByRole('button', { name: 'Ask for a nudge' })).toBeVisible();
    });
    await rec.step('Ask for a nudge', 'After a few seconds the AI coach answers (or, if the free AI quota is used up, an honest "unavailable" message explains why and stored hints keep working).', async () => {
      await page.getByRole('button', { name: 'Ask for a nudge' }).click();
      await calm(page);
      await expect(page.getByText(/^Model: /).or(page.getByText('AI nudge unavailable'))).toBeVisible({ timeout: AI_WAIT });
    });
    const ok = await page.getByText(/^Model: /).isVisible();
    if (!ok) {
      const why = (await page.getByText('AI nudge unavailable').locator('xpath=..').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
      await rec.step('The AI provider could not answer', `The AI request failed and the page says so plainly instead of showing a made-up answer: "${why}". Stored hints and code execution are unaffected.`);
      await rec.check('An AI nudge was shown and labeled AI generated', async () => expect(page.getByText(/^Model: /)).toBeVisible({ timeout: 1000 }));
      return;
    }
    await rec.step('Read the AI nudge', 'The answer card is labeled "AI generated" with the model name. It comments on the counting idea and asks guiding questions about what to try next (the exact wording varies, since it is written live by the AI), without writing the full program.', async () => {
      await page.getByText(/^Model: /).scrollIntoViewIfNeeded();
    });
    await rec.check('The nudge is labeled "AI generated" and shows which model wrote it', async () => expect(page.getByText(/^Model: \S+/)).toBeVisible());
    await rec.check('The nudge does not contain a full solution (no code block longer than a few lines)', async () => {
      const card = page.getByText(/^Model: /).locator('xpath=ancestor::div[contains(@class,"pt-3")][1]');
      const blocks = await card.locator('pre').allInnerTexts();
      for (const b of blocks) expect(b.trim().split('\n').length).toBeLessThanOrEqual(3);
    });
  },
);

scenario(
  {
    id: 'ai-02-council-ask-nexus',
    area: AI,
    title: 'Ask the AI Council: automatic routing to the right specialist',
    summary: 'The AI Council has 21 specialists. The learner types a SQL question, Nexus suggests the Database & SQL coach and explains why, and the answer streams in from the live AI model. The page is open about which provider is used and what that means for privacy.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step('Open the AI Council', 'The page starts with an "Ask Nexus" box and then a directory of specialists grouped by area (learning, coding, career, teaching, hiring). A notice under the box says AI can be wrong and shows the Gemini free-tier data notice.', async () => {
      await page.goto(`${BASE}/app/ai`);
      await expect(page.getByRole('heading', { name: 'AI Council' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Database & SQL coach' })).toBeVisible();
    }, { fullPage: true });
    await rec.check('The data notice about the Gemini free tier is shown', async () => expect(page.getByText(/Gemini free tier: Google may use prompts/).first()).toBeVisible());
    await rec.step('See what a specialist can and cannot do', 'Each card has "What it can and cannot do". For the SQL coach: it explains joins and reviews schemas, but cannot run queries against your database or see hidden test data.', async () => {
      const card = page.locator('li', { has: page.getByRole('heading', { name: 'Database & SQL coach' }) }).first();
      await card.getByRole('button', { name: 'What it can and cannot do' }).click();
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByText('Run queries against your database')).toBeVisible();
    });
    await rec.step('Type a question: Nexus suggests a specialist', 'As the learner types a question about LEFT JOIN and GROUP BY, the specialist picker switches to "Database & SQL coach" and a line explains why. Routing uses keywords only, so it is predictable, and the learner can still pick someone else.', async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByLabel('Your question').fill('Why does my LEFT JOIN with GROUP BY return duplicate rows? Please keep it short.');
      await expect(page.getByText(/Routed to Database & SQL coach because your question mentions/)).toBeVisible();
    });
    await rec.check('The question is routed to the SQL coach with an explanation', async () => {
      await expect(page.getByLabel('Specialist', { exact: true })).toHaveValue('sql_coach');
    });
    await rec.step('Send it and watch the answer stream in', 'Pressing "Ask" opens a private conversation with the SQL coach. The question appears on the right, the coach "is thinking", and then the answer streams in word by word from the live Gemini model.', async () => {
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
      await expect(page).toHaveURL(/\/app\/ai\/c\//);
      await waitForAnswer(page);
    });
    const outcome = (await page.locator('article').getByText('AI generated', { exact: true }).last().isVisible()) ? 'answer' : 'failed';
    if (outcome === 'failed') {
      await rec.step('The provider could not answer', 'The live AI provider returned an error (for example, the free daily quota is used up). The chat says so honestly, keeps the question, and offers a Retry button instead of inventing an answer.');
      await rec.check('A streamed answer from the SQL coach was shown', async () => expect(page.locator('article').getByText('AI generated', { exact: true })).toBeVisible({ timeout: 1000 }));
      return;
    }
    const cited = await page.getByText('Sources searched for this answer').isVisible();
    await rec.step(
      'Read the answer',
      `The finished answer is labeled "AI generated" with the provider and model.${cited ? ' Numbers like [4] point to the library pages listed under "Sources searched for this answer".' : ''} The bottom of the chat repeats that AI can be wrong and shows the Gemini free-tier data notice, so learners know not to share personal information.`,
      async () => {
        await calm(page);
      },
    );
    await rec.check('The answer is labeled AI generated, with the data notice visible', async () => {
      await expect(page.locator('article').getByText('AI generated', { exact: true }).first()).toBeVisible();
      await expect(page.getByText(/Gemini free tier: Google may use prompts/).first()).toBeVisible();
    });
    await rec.step('Rate the answer', 'Thumbs up marks the answer as helpful. Ratings go to the platform admin\'s feedback report so weak answers can be found and improved. A flag icon next to it reports a harmful or wrong answer.', async () => {
      await page.getByRole('button', { name: 'Helpful' }).first().click();
      await expect(page.getByRole('button', { name: 'Helpful' }).first()).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Helpful' }).first().hover();
    });
    await rec.check('The thumbs-up feedback is saved', async () => {
      const convId = page.url().split('/c/')[1];
      const msgs = await api(page.request, 'get', `/api/ai/conversations/${convId}/messages`);
      expect(msgs.body.items.some((m: { role: string; feedback: number | null }) => m.role === 'assistant' && m.feedback === 1)).toBe(true);
    });
  },
);

scenario(
  {
    id: 'ai-03-tutor-from-topic',
    area: AI,
    title: 'Ask the tutor about the topic you are studying',
    summary: 'From a lesson page the learner asks the programming tutor a question. The topic is attached as context, so the tutor answers with that lesson in mind and lists the library sources it searched.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step('Open a lesson', 'The learner is studying "Loops: for, while and range" in the Python foundations roadmap. Below the lesson is a button "Ask the tutor about this topic".', async () => {
      await page.goto(`${BASE}/app/learn/programming-foundations-python/loops`);
      await expect(page.getByRole('heading', { name: 'Loops: for, while and range' })).toBeVisible();
      await page.getByRole('link', { name: 'Ask the tutor about this topic' }).scrollIntoViewIfNeeded();
    });
    await rec.step('The tutor opens with the topic attached', 'The AI Council opens with the Programming tutor already chosen and a chip "About: Loops: for, while and range". The chip can be removed with × if the question is about something else.', async () => {
      await page.getByRole('link', { name: 'Ask the tutor about this topic' }).click();
      await expect(page.getByText(/You opened this from a page that suggests the Programming tutor/)).toBeVisible();
    });
    await rec.check('The topic is attached as context and the tutor is preselected', async () => {
      await expect(page.getByRole('button', { name: 'Remove context' })).toBeVisible();
      await expect(page.getByLabel('Specialist', { exact: true })).toHaveValue('tutor');
    });
    await rec.step('Ask a question about the topic', 'The learner asks when to use a while loop instead of a for loop and presses "Ask". The conversation header keeps the topic chip, so it is clear what the tutor was told about.', async () => {
      await page.getByLabel('Your question').fill('In two short paragraphs: when should I use a while loop instead of a for loop?');
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
      await expect(page).toHaveURL(/\/app\/ai\/c\//);
      await waitForAnswer(page);
    });
    const ok = await page.locator('article').getByText('AI generated', { exact: true }).last().isVisible();
    if (!ok) {
      await rec.step('The provider could not answer', 'The live AI provider returned an error (for example, the free daily quota is used up). The chat says so honestly and keeps the question so it can be retried later.');
      await rec.check('The tutor answered the topic question', async () => expect(page.locator('article').getByText('AI generated', { exact: true })).toBeVisible({ timeout: 1000 }));
      return;
    }
    const sources = await page.getByText('Sources searched for this answer').isVisible();
    await rec.step(
      'Read the answer',
      sources
        ? 'The tutor answers in the context of the lesson. Under the answer, "Sources searched for this answer" lists the library pages it looked at, with links, so the learner can check the material.'
        : 'The tutor answers in the context of the lesson. No library sources matched this question, so no source list is shown (sources only appear when something relevant was found).',
      async () => {
        await calm(page);
      },
    );
    await rec.check('The answer is labeled AI generated and the topic chip stays on the conversation', async () => {
      await expect(page.locator('article').getByText('AI generated', { exact: true }).first()).toBeVisible();
      await expect(page.locator('header').getByText('Loops: for, while and range')).toBeVisible();
    });
  },
);

scenario(
  {
    id: 'ai-04-provider-outage',
    area: AI,
    title: 'AI outage handled honestly, and everything else keeps working',
    summary: 'A platform admin manages AI providers. To show an outage, Gemini is switched off and replaced by a provider that cannot be reached. The learner gets a clear error, the message is kept and can be retried, and CodeLab still works. After Gemini is switched back on, the same message gets a real answer.',
    roles: ['Platform admin', 'Learner'],
  },
  async (rec, { page, browser }) => {
    const admin = await person(browser, demo('admin'));
    const a = admin.page;
    let geminiId: string | null = null;
    let fakeId: string | null = null;
    const restore = async () => {
      if (geminiId) await api(a.request, 'patch', `/api/ai/admin/providers/${geminiId}`, { enabled: true });
      if (fakeId) await api(a.request, 'delete', `/api/ai/admin/providers/${fakeId}`);
      fakeId = null;
    };
    try {
      await rec.step('Admin: the AI providers page', 'Admin → AI providers lists the configured providers in priority order. Gemini comes from the server settings ("From environment"), is Active, shows its model and a masked key, and repeats its data notice: on the free tier Google may use prompts to improve its products.', async () => {
        await a.goto(`${BASE}/app/admin/ai`);
        await expect(a.getByRole('heading', { name: 'AI providers' })).toBeVisible();
        await expect(a.getByText('From environment').first()).toBeVisible();
      }, { page: a });
      await rec.check('The Gemini provider is listed with its data notice', async () => {
        await expect(a.getByText(/Gemini free tier: Google may use prompts/).first()).toBeVisible();
      });
      await rec.step('Admin: usage so far', 'The Usage tab counts requests, failures, requests blocked by quota, tokens and response time, broken down by provider, specialist and feature. Only counts are stored, never the text of questions or answers.', async () => {
        await a.getByRole('tab', { name: 'Usage' }).click();
        await expect(a.getByText(/Successful requests|No AI requests in this period/).first()).toBeVisible();
      }, { page: a, fullPage: true });

      await rec.step('Admin: simulate an outage', 'For this test, Gemini is switched off and a provider pointing at an address where nothing is listening is added. The list now shows Gemini as "Disabled" and the unreachable provider as the only active one.', async () => {
        const list = await api(a.request, 'get', '/api/ai/admin/providers');
        geminiId = list.body.items.find((p: { preset: string }) => p.preset === 'gemini')?.id ?? null;
        expect(geminiId, 'Gemini provider is configured').toBeTruthy();
        const off = await api(a.request, 'patch', `/api/ai/admin/providers/${geminiId}`, { enabled: false });
        expect(off.status).toBe(200);
        const fake = await api(a.request, 'post', '/api/ai/admin/providers', { preset: 'custom', label: 'Unreachable provider (outage test)', baseUrl: 'http://127.0.0.1:9/v1', model: 'test-model', apiKey: 'none', timeoutMs: 2000 });
        expect(fake.status).toBe(201);
        fakeId = fake.body.provider.id;
        await a.getByRole('tab', { name: 'Providers' }).click();
        await a.reload();
        await expect(a.getByRole('heading', { name: 'Unreachable provider (outage test)' })).toBeVisible();
        await expect(a.getByText('Disabled', { exact: true }).first()).toBeVisible();
      }, { page: a });

      await login(page, demo('learner'));
      await rec.step('Learner: ask the tutor during the outage', 'The learner asks the Programming tutor a question. The request fails within seconds. The reply slot says "No answer" with the reason, and a red banner says "AI is unavailable right now" and "Your message was saved.", each with a Retry button. The question stays in the chat. (Showing the same reason twice is a small cosmetic quirk.)', async () => {
        await page.goto(`${BASE}/app/ai`);
        await page.getByLabel('Specialist', { exact: true }).selectOption('tutor');
        await page.getByLabel('Your question').fill('Explain recursion in three sentences.');
        await page.getByRole('button', { name: 'Ask', exact: true }).click();
        await expect(page).toHaveURL(/\/app\/ai\/c\//);
        await expect(page.getByText(/Your message was saved/)).toBeVisible({ timeout: 60_000 });
      });
      const convId = page.url().split('/c/')[1];
      await rec.check('The error is shown and the question is kept', async () => {
        await expect(page.getByText('Explain recursion in three sentences.').first()).toBeVisible();
        await expect(page.getByRole('button', { name: 'Retry' }).last()).toBeVisible();
      });
      await rec.step('Learner: retry while the outage continues', 'Pressing Retry tries again with the same message. It fails again, honestly. The retry reuses the same message instead of adding a duplicate.', async () => {
        await page.getByRole('button', { name: 'Retry' }).last().click();
        await calm(page);
        await expect(page.getByText(/Your message was saved/)).toBeVisible({ timeout: 60_000 });
      });
      await rec.check('Retrying did not duplicate the question', async () => {
        const msgs = await api(page.request, 'get', `/api/ai/conversations/${convId}/messages`);
        expect(msgs.body.items.filter((m: { role: string }) => m.role === 'user')).toHaveLength(1);
      });
      await rec.step('Learner: CodeLab still works', 'While AI is down, the learner runs code in CodeLab. Code execution does not depend on AI at all, so the sample tests run and pass as usual.', async () => {
        await openProblem(page, 'sum-two-numbers');
        await page.getByLabel('Language').selectOption('javascript');
        await setEditor(page, SUM_JS);
        await click(page, 'Run');
        await expect(page.getByText('2 of 2 tests passed')).toBeVisible();
      });
      await rec.step('Learner: lessons still work', 'Roadmaps and lessons are also unaffected. Only the AI features say they are unavailable.', async () => {
        await page.goto(`${BASE}/app/learn`);
        await expect(page.getByRole('heading', { name: 'Roadmaps', level: 1 })).toBeVisible();
      });

      await rec.step('Admin: end the outage', 'The admin switches Gemini back on and removes the unreachable provider. The providers list is back to its normal state.', async () => {
        await restore();
        await a.reload();
        await expect(a.getByRole('heading', { name: 'Unreachable provider (outage test)' })).toHaveCount(0);
        await expect(a.getByText('Active', { exact: true }).first()).toBeVisible();
      }, { page: a });
      await rec.step('Learner: retry the same question', 'Back in the conversation, the failed reply is shown as "No answer" with a Retry button. Retrying the same question now gets a real answer from Gemini, labeled "AI generated".', async () => {
        await page.goto(`${BASE}/app/ai/c/${convId}`);
        await page.getByRole('button', { name: 'Retry' }).last().click();
        await calm(page);
        await waitForAnswer(page);
      });
      const ok = await page.locator('article').getByText('AI generated', { exact: true }).last().isVisible();
      if (!ok) await rec.step('Gemini did not answer', 'Gemini itself returned an error this time (for example, the free daily quota is used up). The chat shows that honestly and keeps the question for a later retry.');
      await rec.check('After the outage, the same question gets a real answer', async () => {
        await expect(page.locator('article').getByText('AI generated', { exact: true }).last()).toBeVisible({ timeout: 1000 });
        const msgs = await api(page.request, 'get', `/api/ai/conversations/${convId}/messages`);
        expect(msgs.body.items.filter((m: { role: string }) => m.role === 'user')).toHaveLength(1);
      });
    } finally {
      await restore().catch(() => {});
      await admin.ctx.close();
    }
  },
);
