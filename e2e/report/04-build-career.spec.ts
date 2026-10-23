import { test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { scenario, expect, login, person, api, demo, BASE } from './recorder';

const BUILD = 'Projects and portfolio';
const CAREER = 'Career and jobs';

// Several scenarios have many steps (and two wait for a live AI answer), so give each one room.
test.beforeEach(() => test.setTimeout(300_000));
// Fail a step after 20 s instead of waiting for the whole test timeout when something is missing.
test.use({ actionTimeout: 20_000 });

/** Finds one of the signed-in user's projects by title. */
async function projectId(req: APIRequestContext, title: string | RegExp): Promise<string> {
  const r = await api<{ items: { id: string; title: string }[] }>(req, 'get', '/api/projects?pageSize=100');
  const p = r.body.items.find((x) => (typeof title === 'string' ? x.title === title : title.test(x.title)));
  expect(p, `project ${title}`).toBeTruthy();
  return p!.id;
}

/** Local "YYYY-MM-DDTHH:mm" value for datetime-local inputs, `days` from now. */
function localInput(days: number, hour = 15) {
  const d = new Date(Date.now() + days * 86400_000);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const CAPSTONE_TITLE = 'Study platform capstone (Asha)';

/**
 * Makes sure Asha owns a reviewer-approved capstone, which issues a real platform completion record.
 * build-03 does this through the screens; this API fallback lets later scenarios also run on their own.
 */
async function ensureCapstoneCertificate(browser: Browser, learner: Page): Promise<string> {
  const certs = async () => (await api(learner.request, 'get', '/api/portfolio')).body.evidence.certificates as { verificationCode: string | null; kind: string }[];
  let found = (await certs()).find((c) => c.kind === 'platform_completion' && c.verificationCode);
  if (found) return found.verificationCode!;
  const start = await api(learner.request, 'post', '/api/projects/templates/capstone-ai-study-platform/start', { mode: 'guided', title: CAPSTONE_TITLE });
  expect(start.status).toBe(201);
  const pid = start.body.project.id as string;
  expect((await api(learner.request, 'post', `/api/projects/${pid}/members`, { email: demo('mentor'), role: 'reviewer' })).status).toBe(201);
  const lina = await person(browser, demo('mentor'));
  const inv = (await api(lina.page.request, 'get', '/api/projects/invites')).body.items.find((i: { projectId: string }) => i.projectId === pid);
  await api(lina.page.request, 'post', `/api/projects/invites/${inv.id}/accept`);
  const detail = await api(lina.page.request, 'get', `/api/projects/${pid}`);
  const ok = await api(lina.page.request, 'post', `/api/projects/${pid}/reviews`, {
    kind: 'approval',
    body: 'Walked through the deployed demo, the citation tests and the security notes together. Requirements are met.',
    confirmedSkillIds: detail.body.skills.map((s: { id: string }) => s.id),
  });
  expect(ok.status).toBe(201);
  await lina.ctx.close();
  found = (await certs()).find((c) => c.kind === 'platform_completion' && c.verificationCode);
  expect(found, 'platform completion record issued').toBeTruthy();
  return found!.verificationCode!;
}

const SAMPLE_JD = `SAMPLE JOB DESCRIPTION (written for this walkthrough, not a real vacancy)

Associate Backend Engineer, Orders team

You will build and maintain the REST APIs behind an order tracking service used by a small operations team.

Requirements:
- Python and basic programming fundamentals
- SQL basics and relational database design with PostgreSQL
- HTTP and REST API design
- Git and code reviews
- Clear written communication

Nice to have:
- Docker
- Unit testing with pytest
- Caching with Redis`;

// ---------------------------------------------------------------------------------------------
// Projects and portfolio
// ---------------------------------------------------------------------------------------------

scenario(
  {
    id: 'build-01-project-templates',
    area: BUILD,
    title: 'Find a project template and start it in guided mode',
    summary: 'A student browses real-world project briefs, sees which ones are recommended from their own skill record and why, filters by category and difficulty, reads one brief in full and starts it with step-by-step guidance.',
    roles: ['Student'],
  },
  async (rec, { page }) => {
    await login(page, demo('student'));
    await rec.step(
      'Open the project templates',
      'The templates page lists project briefs. At the top, "Recommended for you" picks briefs from the student\'s Skill DNA (their skill record) and says in plain words why each one was suggested.',
      async () => {
        await page.goto(`${BASE}/app/projects/templates`);
        await expect(page.getByRole('heading', { name: 'Project templates' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Recommended for you' })).toBeVisible();
      },
    );
    await rec.check('Each recommendation explains its reason (skills already shown or being learned)', async () => {
      await expect(page.getByText(/^Recommended: (builds on|practises) /).first()).toBeVisible();
    });
    await rec.step(
      'Filter by category and difficulty',
      'Choosing the "APIs" category and "Intermediate" difficulty narrows the list to two matching briefs. Each card shows the time estimate and how many requirements and milestones it has.',
      async () => {
        await page.getByLabel('Category').selectOption('api');
        await page.getByLabel('Difficulty').selectOption('intermediate');
        await expect(page.getByRole('link', { name: /URL shortener service/ })).toBeVisible();
        await expect(page.getByRole('link', { name: /Command-line to-do app/ })).toHaveCount(0);
      },
    );
    await rec.check('Filters hide briefs from other categories', async () => {
      await expect(page.getByRole('link', { name: /Library REST API with tests/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /Personal budget tracker/ })).toHaveCount(0);
    });
    await rec.step(
      'Read the full brief',
      'The brief explains the problem, who the users are, each requirement with its acceptance criteria (the checks that prove it works), the skills it shows and a week-by-week milestone plan.',
      async () => {
        await page.getByRole('link', { name: /URL shortener service/ }).click();
        await expect(page.getByRole('heading', { name: 'URL shortener service' })).toBeVisible();
        await expect(page.getByText('Requirements and acceptance criteria')).toBeVisible();
        await expect(page.getByText(/^Week 1: /).first()).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Choose how much guidance you want',
      '"Start this project" asks for a guidance level. Guided mode copies the acceptance criteria and gives a ready task board with checkpoints; the other modes leave more of the planning to the learner.',
      async () => {
        await page.getByRole('button', { name: 'Start this project' }).click();
        const dialog = page.getByRole('dialog', { name: 'Start a project' });
        await expect(dialog).toBeVisible();
        await dialog.getByRole('radio', { name: /^Guided/ }).check();
        await expect(dialog.getByRole('radio', { name: /^Guided/ })).toBeChecked();
      },
    );
    await rec.step(
      'The new project workspace',
      'After "Create project" the workspace opens. It is marked "Guided", shows the next checkpoint and a progress card that explains exactly how the percentage is calculated.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
        await expect(page).toHaveURL(/\/app\/projects\/[0-9a-f-]{36}/);
        await expect(page.getByText('Guided checkpoints')).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('The project was created in guided mode with the acceptance criteria copied in', async () => {
      const id = page.url().match(/projects\/([0-9a-f-]{36})/)![1];
      const d = await api(page.request, 'get', `/api/projects/${id}`);
      expect(d.body.project.mode).toBe('guided');
      expect(d.body.project.requirements[0].acceptance.length).toBeGreaterThan(0);
    });
  },
);

scenario(
  {
    id: 'build-02-project-workspace',
    area: BUILD,
    title: 'Work inside a project: requirements, board, milestones, docs, issues and sharing',
    summary: 'A tour of the project workspace for an in-progress "Library REST API" project: tick off a requirement, move a task with the keyboard, complete a milestone for XP, write an architecture note in Markdown, log a bug and create a share link.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    const id = await projectId(page.request, 'Library REST API with tests');
    await rec.step(
      'Project overview',
      'The overview shows the problem, users and objectives, the guided checkpoints and a progress card. The card lists each part (requirements, milestones, tasks), its weight, and the formula behind the percentage.',
      async () => {
        await page.goto(`${BASE}/app/projects/${id}`);
        await expect(page.getByRole('heading', { name: 'Library REST API with tests' })).toBeVisible();
        await expect(page.getByText(/40% required requirements done \+ 30% milestones completed \+ 30% tasks done/)).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Tick off a requirement',
      'On the Requirements tab each requirement lists its acceptance criteria. Ticking "Borrow and return books" moves the count from 1 to 2 of 6 required requirements. The page reminds you to tick only when every check holds.',
      async () => {
        await page.getByRole('tab', { name: /^Requirements/ }).click();
        await page.getByLabel('Mark R2 done').click();
        await expect(page.getByText(/2 of 6 required requirements done/)).toBeVisible();
      },
    );
    await rec.step(
      'Move a task on the board with the keyboard',
      'Every task card has "move left" and "move right" buttons, so the board works without drag and drop. Here the keyboard focuses the button for "Integration tests for CRUD" and presses Enter to move it from To do to Doing.',
      async () => {
        await page.getByRole('tab', { name: /^Board/ }).click();
        const moveBtn = page.getByRole('button', { name: 'Move "Integration tests for CRUD" to Doing' });
        await moveBtn.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByText('Moved to Doing')).toBeVisible();
        await expect(page.getByRole('region', { name: 'Doing' }).getByText('Integration tests for CRUD')).toBeVisible();
      },
    );
    await rec.check('The task now sits in the Doing column', async () => {
      const d = await api(page.request, 'get', `/api/projects/${id}`);
      expect(d.body.tasks.find((t: { title: string }) => t.title === 'Integration tests for CRUD').status).toBe('doing');
    });
    await rec.step(
      'Complete a milestone',
      'The Milestones tab is a timeline with deadlines and task progress. Marking "Core endpoints" complete awards XP (experience points) once per contributor, as the confirmation message shows.',
      async () => {
        await page.getByRole('tab', { name: /^Milestones/ }).click();
        await page.locator('li', { has: page.getByRole('heading', { name: 'Core endpoints' }) }).getByRole('button', { name: 'Mark complete' }).click();
        await expect(page.getByText(/Milestone completed\. \+40 XP/)).toBeVisible();
      },
    );
    await rec.step(
      'Write an architecture note and preview it',
      'The Docs tab has sections for design, data model, API, tests and deployment. The learner writes the design note in Markdown and switches to Preview to see the formatted result before saving.',
      async () => {
        await page.getByRole('tab', { name: 'Docs' }).click();
        await page.getByLabel('architecture markdown').fill(
          '## Architecture\n\n- **HTTP layer**: routes validate input and map errors to clear status codes\n- **Service layer**: loan rules (one active loan per copy, due in 14 days)\n- **Database**: PostgreSQL with a row lock when borrowing the last copy\n\n### Trade-off\nA transaction per loan keeps counts correct; it costs a little speed under load.',
        );
        await page.getByRole('radio', { name: 'Preview' }).click();
        await expect(page.getByRole('heading', { name: 'Trade-off' })).toBeVisible();
      },
    );
    await rec.step('Save the section', 'Saving stores the note on the project. A green dot next to the section name shows it has content.', async () => {
      await page.getByRole('button', { name: 'Save section' }).click();
      await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    });
    await rec.step(
      'Log a bug',
      'The Issues tab keeps bugs and open questions separate from the task board. The learner reports a bug with steps to reproduce and a high priority.',
      async () => {
        await page.getByRole('tab', { name: /^Issues/ }).click();
        await page.getByRole('button', { name: 'Report a bug or issue' }).first().click();
        const dialog = page.getByRole('dialog', { name: 'Report a bug or issue' });
        await dialog.getByLabel('Title', { exact: true }).fill('Returning a book twice creates two return records');
        await dialog.getByLabel('Description', { exact: false }).fill('Steps: borrow book 12, return it, return it again. Expected: 409 "already returned". Actual: 200 and a second record.');
        await dialog.getByLabel('Priority').selectOption('high');
        await dialog.getByRole('button', { name: 'Add' }).click();
        await expect(page.getByRole('button', { name: 'Returning a book twice creates two return records' })).toBeVisible();
      },
    );
    await rec.step(
      'Team roles',
      'The Team tab shows who is on the project. The owner can invite members (who build), mentors or reviewers (who give feedback and can approve completion but never edit the work).',
      async () => {
        await page.getByRole('tab', { name: /^Team/ }).click();
        await expect(page.getByText('Invite someone')).toBeVisible();
      },
    );
    await rec.step(
      'Create a private share link',
      'On "Share & publish" the owner picks who can see the project. "Unlisted" creates a secret link that can be replaced ("New link") or revoked at any time. Private notes and emails are never shown on shared pages.',
      async () => {
        await page.getByRole('tab', { name: 'Share & publish' }).click();
        await page.getByRole('radio', { name: /Unlisted/ }).click();
        await expect(page.getByRole('radio', { name: /Unlisted/ })).toBeChecked();
        await expect(page.getByText('Sharing updated')).toBeVisible();
        await expect(page.getByRole('button', { name: 'New link' })).toBeVisible();
      },
    );
    await rec.check('The share link carries a secret token', async () => {
      const s = await api(page.request, 'get', `/api/projects/${id}/share`);
      expect(s.body.visibility).toBe('unlisted');
      expect(s.body.sharePath).toMatch(/ptoken=/);
    });
  },
);

scenario(
  {
    id: 'build-03-review-and-verified-evidence',
    area: BUILD,
    title: 'Reviewer approval turns a project into verified skill evidence',
    summary: 'The learner invites a mentor as reviewer on a capstone project and requests a review. The mentor approves it in her own browser, which records the skills as "Reviewer confirmed" and verified. For contrast, a project the learner marks complete herself stays unverified.',
    roles: ['Learner', 'Mentor (reviewer)'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('learner'));
    const start = await api(page.request, 'post', '/api/projects/templates/capstone-ai-study-platform/start', { mode: 'guided', title: CAPSTONE_TITLE });
    expect(start.status).toBe(201);
    const pid = start.body.project.id as string;

    await rec.step(
      'Learner invites a reviewer',
      'Asha opens her capstone\'s Team tab and invites Lina Park, a mentor on the platform, with the "Reviewer" role. A reviewer can approve completion but cannot edit the project, so approval is always independent.',
      async () => {
        await page.goto(`${BASE}/app/projects/${pid}?tab=team`);
        const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Send invitation' }) });
        await form.getByLabel('Email', { exact: true }).fill(demo('mentor'));
        await form.getByLabel('Role', { exact: true }).selectOption('reviewer');
        await page.getByRole('button', { name: 'Send invitation' }).click();
        await expect(page.getByText('Pending invitations')).toBeVisible();
      },
    );
    const lina = await person(browser, demo('mentor'));
    await rec.step(
      'Mentor accepts the invitation (second browser)',
      'In Lina\'s own browser, her Projects page shows the invitation at the top. She accepts it and joins the project as reviewer.',
      async () => {
        await lina.page.goto(`${BASE}/app/projects`);
        await expect(lina.page.getByText(`Asha Verma invited you to "${CAPSTONE_TITLE}"`)).toBeVisible();
        await lina.page.getByRole('button', { name: 'Accept' }).click();
        await expect(lina.page.getByRole('link', { name: CAPSTONE_TITLE }).first()).toBeVisible();
      },
      { page: lina.page },
    );
    await rec.step(
      'Learner requests a review',
      'Back in Asha\'s browser, the Reviews tab has "Request review". She picks Lina and adds a note about what to look at.',
      async () => {
        await page.goto(`${BASE}/app/projects/${pid}?tab=reviews`);
        await page.getByRole('button', { name: 'Request review' }).click();
        const dialog = page.getByRole('dialog', { name: 'Request a review' });
        await dialog.getByLabel('Reviewer').selectOption({ label: 'Lina Park (reviewer)' });
        await dialog.getByLabel('Note').fill('The demo link and the citation tests are in the README. I am least sure about the prompt-injection checks.');
      },
    );
    await rec.step('Review request sent', 'Lina is notified. The project status changes to "In review" while she looks at it.', async () => {
      await page.getByRole('dialog').getByRole('button', { name: 'Send request' }).click();
      await expect(page.getByText('Review requested from 1 person')).toBeVisible();
    });
    await rec.step(
      'Mentor writes an approval',
      'Lina opens the Reviews tab in her browser, chooses "Approve completion", writes what she checked and ticks the skills she confirms Asha demonstrated. Each ticked skill will become verified evidence credited to her.',
      async () => {
        await lina.page.goto(`${BASE}/app/projects/${pid}?tab=reviews`);
        await lina.page.getByLabel('Type').selectOption('approval');
        await lina.page.getByLabel('Review', { exact: true }).fill('Walked through the deployed demo and the test suite together. Citations are checked by tests and Asha explained the retrieval design clearly.');
        await expect(lina.page.getByText('Skills you confirm the learner demonstrated')).toBeVisible();
      },
      { page: lina.page, fullPage: true },
    );
    await rec.step('Approval recorded', 'After "Approve completion" the page confirms how many verified evidence records were created.', async () => {
      await lina.page.getByRole('button', { name: 'Approve completion' }).click();
      await expect(lina.page.getByText(/Completion approved\. \d+ verified skill evidence records created\./)).toBeVisible();
    }, { page: lina.page });
    await lina.ctx.close();
    await rec.step(
      'Learner sees the approval',
      'Asha\'s project now shows a "Reviewer approved" badge and a green banner naming the reviewer and the date. The review itself is labelled "Reviewer confirmed".',
      async () => {
        await page.reload();
        await expect(page.getByText('Completion approved by a reviewer')).toBeVisible();
        await expect(page.getByText('Reviewer approved', { exact: true })).toBeVisible();
      },
    );
    await rec.check('The project is completed and approved by the mentor', async () => {
      const d = await api(page.request, 'get', `/api/projects/${pid}`);
      expect(d.body.project.status).toBe('completed');
      expect(d.body.approvedBy.name).toBe('Lina Park');
    });
    await rec.step(
      'Verified evidence in Skill DNA',
      'Opening one of the project\'s skills (LLM applications) in Skill DNA shows a new evidence entry from "Reviewer confirmed", marked Verified, with a note saying who approved which project.',
      async () => {
        await page.goto(`${BASE}/app/skills/llm-applications`);
        await expect(page.getByText('Reviewer confirmed').first()).toBeVisible();
        await expect(page.getByText(/approved by Lina Park/).first()).toBeVisible();
      },
    );
    await rec.check('The skill evidence from the review is verified', async () => {
      const s = await api(page.request, 'get', '/api/learning/skills/llm-applications');
      expect(s.body.evidence.some((e: { source: string; verified: boolean }) => e.source === 'review' && e.verified)).toBe(true);
    });

    const todo = await api(page.request, 'post', '/api/projects/templates/cli-todo-app/start', { mode: 'guided' });
    const todoId = todo.body.project.id as string;
    await rec.step(
      'For contrast: marking a project complete yourself',
      'Asha also has a small to-do app project with no reviewer. "Mark complete" opens a warning: self-completion records the skills as unverified project evidence.',
      async () => {
        await page.goto(`${BASE}/app/projects/${todoId}`);
        await page.getByRole('button', { name: 'Mark complete' }).first().click();
        await expect(page.getByRole('dialog', { name: 'Mark this project complete?' })).toBeVisible();
      },
    );
    await rec.step(
      'Self-completed evidence stays unverified',
      'After confirming, the "Command line" skill shows the new entry as "Project" with an "Unverified" tag and the note "Self-completed project (not reviewed)". Only reviewers and automatic grading can make evidence verified.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Mark complete' }).click();
        await expect(page.getByText(/Marked complete/)).toBeVisible();
        await page.goto(`${BASE}/app/skills/command-line`);
        await expect(page.getByText('Unverified').first()).toBeVisible();
        await expect(page.getByText(/Self-completed project/).first()).toBeVisible();
      },
    );
    await rec.check('Self-completion evidence is not verified', async () => {
      const s = await api(page.request, 'get', '/api/learning/skills/command-line');
      const ev = s.body.evidence.filter((e: { source: string }) => e.source === 'project');
      expect(ev.length).toBeGreaterThan(0);
      expect(ev.every((e: { verified: boolean }) => !e.verified)).toBe(true);
    });
  },
);

scenario(
  {
    id: 'build-04-ai-project-mentor',
    area: BUILD,
    title: 'AI project mentor and the non-AI README generator',
    summary: 'The learner asks the AI project mentor to review her requirements (live AI). Suggestions are labelled as AI and nothing is saved automatically. Then she drafts a README and a case study with the built-in generator, which uses only the project\'s own records and no AI.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    const id = await projectId(page.request, 'Library REST API with tests');
    const before = await api(page.request, 'get', `/api/projects/${id}`);
    await rec.step(
      'Open the AI assistant tab',
      'A banner sets expectations: the mentor only suggests, nothing it writes is saved to the project automatically, and AI output never counts as skill evidence.',
      async () => {
        await page.goto(`${BASE}/app/projects/${id}?tab=ai`);
        await expect(page.getByText('AI suggestions, review before using')).toBeVisible();
      },
    );
    await rec.step(
      'Ask for a requirements check (live AI)',
      '"Suggest improvements" sends the requirements to the AI provider. The answer appears in a box tagged "AI generated" with a copy button. If the provider is unavailable or out of quota, the page says so plainly instead.',
      async () => {
        await page.getByRole('button', { name: 'Suggest improvements' }).click();
        await expect(page.getByText('AI generated').or(page.getByText('AI assistance unavailable'))).toBeVisible({ timeout: 120_000 });
      },
      { fullPage: true },
    );
    await rec.check('The answer is labelled as AI, or the page honestly reports that AI is unavailable', async () => {
      await expect(page.getByText('AI generated').or(page.getByText('AI assistance unavailable'))).toBeVisible();
    });
    await rec.check('Nothing was saved to the project automatically', async () => {
      const after = await api(page.request, 'get', `/api/projects/${id}`);
      expect(after.body.project.requirements).toEqual(before.body.project.requirements);
      expect(after.body.project.docs).toEqual(before.body.project.docs);
    });
    await rec.step(
      'Open the README section in Docs',
      'In Docs, the README section offers "Draft README" and "Draft case study". These are built from the project\'s own requirements, milestones and docs without AI. Nothing is invented and nothing is saved until the learner chooses Save.',
      async () => {
        await page.getByRole('tab', { name: 'Docs' }).click();
        await page.getByRole('navigation', { name: 'Document sections' }).getByRole('button', { name: /README/ }).click();
        await expect(page.getByText(/Generate a starting draft from your requirements/)).toBeVisible();
      },
    );
    await rec.step('Draft a README', 'The draft is placed in the editor and marked "Unsaved changes", so the learner can check and edit every line first.', async () => {
      await page.getByRole('button', { name: 'Draft README' }).click();
      await expect(page.getByText('Draft inserted. Review it, then save.')).toBeVisible();
      await expect(page.getByText('Unsaved changes')).toBeVisible();
      await expect(page.getByLabel('readme markdown')).not.toHaveValue('');
    });
    await rec.step('Preview the draft', 'The Preview shows the README formatted. Finished requirements are listed as features, unfinished ones under "Not yet implemented", and empty sections say "Not documented yet" instead of making something up.', async () => {
      await page.getByRole('radio', { name: 'Preview' }).click();
      await expect(page.getByRole('heading').filter({ hasText: /Library REST API/ }).first()).toBeVisible();
    }, { fullPage: true });
    await rec.step('Draft a case study instead', '"Draft case study" replaces the draft with a portfolio-style write-up (problem, approach, what was built). It is still unsaved.', async () => {
      await page.getByRole('radio', { name: 'Write' }).click();
      await page.getByRole('button', { name: 'Draft case study' }).click();
      await expect(page.getByText('Draft inserted. Review it, then save.').first()).toBeVisible();
      await expect(page.getByText('Unsaved changes')).toBeVisible();
    });
    await rec.check('The generated drafts were not saved without the learner\'s say-so', async () => {
      const after = await api(page.request, 'get', `/api/projects/${id}`);
      expect(after.body.project.docs.readme ?? '').toBe('');
    });
  },
);

scenario(
  {
    id: 'build-05-portfolio',
    area: BUILD,
    title: 'Build, publish and verify a portfolio',
    summary: 'The learner edits her portfolio (headline, section order, featured project), shares it first with a secret link that she then replaces, publishes it publicly with version history, and a visitor who is not signed in views it with honest labels and verifies her certificate.',
    roles: ['Learner', 'Visitor (not signed in)'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('learner'));
    const code = await ensureCapstoneCertificate(browser, page);
    await rec.step(
      'Edit the profile and section order',
      'The Portfolio editor starts with the profile (address, headline, about) and the sections. Arrow buttons reorder sections and "Shown/Hidden" controls what visitors see. Asha adds a headline and moves "Skills & evidence" to the top.',
      async () => {
        await page.goto(`${BASE}/app/portfolio`);
        await page.getByLabel('Headline').fill('Career switcher building backend APIs with Python and SQL');
        await page.getByRole('button', { name: 'Save profile' }).click();
        await expect(page.getByText('Profile saved')).toBeVisible();
        await page.getByRole('button', { name: 'Move Skills & evidence up' }).click();
        await expect(page.getByRole('button', { name: 'Move Skills & evidence up' })).toBeDisabled();
      },
    );
    await rec.step(
      'Feature the approved project',
      'The Evidence tab lists projects, skills, assessment results and achievements with their honest labels. Asha features her reviewer-approved capstone so it appears on the portfolio.',
      async () => {
        await page.getByRole('tab', { name: 'Evidence' }).click();
        const row = page.locator('li').filter({ hasText: CAPSTONE_TITLE }).filter({ hasText: 'Verified by reviewer' }).first();
        await expect(row.getByText(/Verified by reviewer/)).toBeVisible();
        if (await row.getByRole('button', { name: 'Feature', exact: true }).isVisible()) await row.getByRole('button', { name: 'Feature', exact: true }).click();
        await expect(row.getByRole('button', { name: 'Featured' })).toBeVisible();
      },
    );
    await rec.step(
      'Platform completion record',
      'The Certificates tab shows the record issued when the reviewer approved the capstone. It is labelled "Platform completion record, not an accredited qualification" and has a verification code anyone can check.',
      async () => {
        await page.getByRole('tab', { name: /^Certificates/ }).click();
        await expect(page.getByText('Platform completion record', { exact: true })).toBeVisible();
        await expect(page.getByText(code)).toBeVisible();
      },
    );
    let firstLink = '';
    await rec.step(
      'Share with a secret link (unlisted)',
      'On "Sharing & history" the portfolio starts private. Publishing as "Unlisted" creates a secret link that only people Asha sends it to can open.',
      async () => {
        await page.getByRole('tab', { name: 'Sharing & history' }).click();
        await page.getByText('Anyone with the secret link').locator('xpath=../..').getByRole('button', { name: 'Publish' }).click();
        await expect(page.getByText('Published. A version snapshot was saved.')).toBeVisible();
        firstLink = (await page.locator('code').first().textContent()) ?? '';
        expect(firstLink).toContain('token=');
      },
    );
    await rec.step(
      'Replace the link',
      '"New link (revoke old)" creates a fresh secret link. Anyone holding the old link can no longer open the portfolio.',
      async () => {
        await page.getByRole('button', { name: 'New link (revoke old)' }).click();
        await expect(page.getByText('New link created. The old link no longer works.')).toBeVisible();
        await expect(page.locator('code').first()).not.toHaveText(firstLink);
      },
    );
    await rec.check('The old secret link stops working', async () => {
      const visitor = await person(browser, null);
      const token = new URL(firstLink).searchParams.get('token');
      const r = await api(visitor.page.request, 'get', `/api/portfolio/public/asha-verma?token=${token}`);
      await visitor.ctx.close();
      expect(r.status).toBe(404);
    });
    await rec.step(
      'Publish publicly and see the version history',
      'Publishing as "Public" makes the portfolio open to anyone with the address. Every publish saves a version in the history, and any version can be restored.',
      async () => {
        await page.getByText('Anyone with your address.').locator('xpath=../..').getByRole('button', { name: 'Publish' }).click();
        await expect(page.getByText('Anyone with your address.').locator('xpath=../..').getByText('Current')).toBeVisible();
        await expect(page.getByText(/^Version \d+$/)).toHaveCount(2);
      },
    );
    const visitor = await person(browser, null);
    await rec.step(
      'A visitor opens the public portfolio',
      'Someone who is not signed in opens the address. A legend explains the labels: "Verified by reviewer" (a person checked it), "Graded assessment" (scored by a grader) and "Self-reported" (stated by the person, not checked). The featured capstone carries "Verified by reviewer: Lina Park".',
      async () => {
        await visitor.page.goto(`${BASE}/p/asha-verma`);
        await expect(visitor.page.getByRole('heading', { name: 'Asha Verma' })).toBeVisible();
        await expect(visitor.page.getByText('How to read this page:')).toBeVisible();
      },
      { page: visitor.page, fullPage: true },
    );
    await rec.check('Provenance labels are shown: reviewer-verified, graded and self-reported', async () => {
      await expect(visitor.page.getByText('Verified by reviewer: Lina Park')).toBeVisible();
      await expect(visitor.page.getByText('Graded assessment').first()).toBeVisible();
      await expect(visitor.page.getByText('Self-reported').first()).toBeVisible();
    });
    await rec.step(
      'Verify the certificate',
      '"Verify record" next to the certificate opens a public verification page. It confirms the record is valid and shows only the certificate facts: title, holder, basis, date and issuer.',
      async () => {
        await visitor.page.getByRole('link', { name: 'Verify record' }).click();
        await expect(visitor.page).toHaveURL(new RegExp(`/verify/${code}`));
        await expect(visitor.page.getByText('Valid platform completion record')).toBeVisible();
      },
      { page: visitor.page },
    );
    await rec.step(
      'An invalid code',
      'A made-up code shows "No matching record" and explains that certificates from other organizations cannot be verified here.',
      async () => {
        await visitor.page.goto(`${BASE}/verify/LSN-ZZZZ-ZZZZ-ZZZZ`);
        await expect(visitor.page.getByText('No matching record')).toBeVisible();
      },
      { page: visitor.page },
    );
    await visitor.ctx.close();
  },
);

// ---------------------------------------------------------------------------------------------
// Career and jobs
// ---------------------------------------------------------------------------------------------

scenario(
  {
    id: 'career-06-resume-builder',
    area: CAREER,
    title: 'Edit a resume with live preview, checks, tailoring and export',
    summary: 'The learner edits her resume and watches the preview update as she types, runs the built-in checks (which ask for real results instead of inventing numbers), makes a tailored copy for a saved job target and opens the print view.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    const newBullet = 'Built a spreadsheet lookup that the front desk used to answer stock questions.';
    await rec.step('Resumes list', 'The Resumes page lists each resume with its template, version and whether it is the primary one. Resumes can be created from the profile or imported from pasted text.', async () => {
      await page.goto(`${BASE}/app/career/resumes`);
      await expect(page.getByRole('link', { name: 'Asha Verma resume (sample)' })).toBeVisible();
    });
    await rec.step(
      'Open the resume editor',
      'The editor has tabs for each section on the left and a live preview on the right. Below the form are the Checks (no AI) and an optional AI review.',
      async () => {
        await page.getByRole('link', { name: 'Asha Verma resume (sample)' }).click();
        await expect(page.getByText(/Live preview/)).toBeVisible();
      },
    );
    await rec.step(
      'Edit a section and watch the preview',
      'On the Experience tab Asha adds a second bullet to her library job. The preview on the right updates as she types, before anything is saved.',
      async () => {
        await page.getByRole('tab', { name: 'Experience' }).click();
        await page.getByLabel('Bullets').fill(`Ran circulation reports in spreadsheets.\n${newBullet}`);
        await expect(page.getByText(/Live preview/).locator('xpath=..').getByText(newBullet)).toBeVisible();
        await expect(page.getByText('Unsaved changes')).toBeVisible();
      },
    );
    await rec.step(
      'Save and read the checks',
      'After saving, the checks run again. They point out tasks without outcomes with "Add a real result if you have one" and the question "What changed because of this work? ... Only add a number you can back up." Nothing is ever filled in for her.',
      async () => {
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.getByText('Resume saved.')).toBeVisible();
        await expect(page.getByText(/Add a real result if you have one/).first()).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('The checks ask for real results and never invent numbers', async () => {
      await expect(page.getByText(/Only add a number you can back up/).first()).toBeVisible();
    });
    await rec.step(
      'Tailor a copy for a job target',
      'From the saved job target "Junior Backend Developer", "Tailor a resume" makes a copy that puts the most relevant existing content first. It adds nothing new; skills the job wants but the resume lacks are listed for her to decide.',
      async () => {
        await page.goto(`${BASE}/app/career/targets`);
        await page.getByRole('link', { name: 'Junior Backend Developer', exact: true }).click();
        await page.getByRole('button', { name: 'Tailor a resume' }).click();
        await expect(page.getByRole('dialog', { name: 'Tailor a resume for this role' })).toBeVisible();
      },
    );
    await rec.step(
      'The tailored copy',
      'The copy opens with a "Tailored copy" banner: content was reordered, nothing was added. The message at the bottom lists the job\'s skills that are missing from the resume, to add only if true.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Create tailored copy' }).click();
        await expect(page).toHaveURL(/tailored=1/);
        await expect(page.getByText('Tailored copy', { exact: true })).toBeVisible();
      },
    );
    await rec.check('A separate tailored version was created from the original', async () => {
      const list = await api(page.request, 'get', '/api/career/resumes');
      expect(list.body.items.some((r: { parentId: string | null }) => r.parentId)).toBe(true);
    });
    await rec.step('Export menu', 'The Export menu offers "Print or save as PDF", plain text and JSON downloads.', async () => {
      await page.getByRole('button', { name: 'Export' }).click();
      await expect(page.getByRole('menuitem', { name: 'Print or save as PDF' })).toBeVisible();
    });
    const [popup] = await Promise.all([page.context().waitForEvent('page'), page.getByRole('menuitem', { name: 'Print or save as PDF' }).click()]);
    await rec.step(
      'Print layout',
      '"Print or save as PDF" opens a clean, single-column print layout of the saved resume in a new tab, ready for the browser\'s Print or Save as PDF.',
      async () => {
        await popup.waitForLoadState();
        await expect(popup.getByText('Asha Verma').first()).toBeVisible();
      },
      { page: popup, fullPage: true },
    );
  },
);

scenario(
  {
    id: 'career-07-ai-resume-review',
    area: CAREER,
    title: 'AI resume review (live AI)',
    summary: 'The learner asks for an optional AI review of her resume. Suggestions are labelled as AI; anything that would add a fact is phrased as a question for her, and suggestions that add numbers are removed.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    const list = await api(page.request, 'get', '/api/career/resumes');
    const resume = list.body.items.find((r: { isPrimary: boolean }) => r.isPrimary);
    const before = await api(page.request, 'get', `/api/career/resumes/${resume.id}`);
    await rec.step(
      'The AI review card',
      'Below the checks, the "AI review" card explains the rules: it is an optional second opinion, suggestions that would add a fact are phrased as questions, and anything adding numbers is removed.',
      async () => {
        await page.goto(`${BASE}/app/career/resumes/${resume.id}`);
        await page.getByText('AI review', { exact: true }).scrollIntoViewIfNeeded();
        await expect(page.getByRole('button', { name: 'Get AI suggestions' })).toBeVisible();
      },
    );
    await rec.step(
      'Get AI suggestions (live AI)',
      'The suggestions appear under an "AI generated" tag. Each one is marked "Question for you" (a fact only Asha can supply), "Rephrase" or "Tip". If the AI provider is unavailable or out of quota, a plain message says so and the non-AI checks keep working.',
      async () => {
        await page.getByRole('button', { name: 'Get AI suggestions' }).click();
        await expect(page.getByText('AI suggestions: review every claim before using it.').or(page.getByText(/AI is unavailable right now|AI quota used up|AI is not set up/))).toBeVisible({ timeout: 120_000 });
      },
      { fullPage: true },
    );
    await rec.check('Suggestions are labelled as AI, or the page honestly reports AI is unavailable', async () => {
      await expect(page.getByText('AI generated').or(page.getByText(/AI is unavailable right now|AI quota used up|AI is not set up/)).first()).toBeVisible();
    });
    await rec.check('The AI review did not change the resume', async () => {
      const after = await api(page.request, 'get', `/api/career/resumes/${resume.id}`);
      expect(after.body.resume.data).toEqual(before.body.resume.data);
    });
  },
);

scenario(
  {
    id: 'career-08-job-target-analysis',
    area: CAREER,
    title: 'Analyze a job description against your skills',
    summary: 'The learner pastes a job description. Required and preferred skills are extracted without AI, compared with her Skill DNA in a gap table with evidence labels, and summarised as a readiness score with a visible formula, a checklist and a targeted plan.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step('Job targets', 'Saved job targets each show a readiness bar and checklist progress.', async () => {
      await page.goto(`${BASE}/app/career/targets`);
      await expect(page.getByRole('heading', { name: 'Job targets' })).toBeVisible();
    });
    await rec.step(
      'Paste a job description',
      '"Add job target" opens a form. As the description is pasted, a preview lists the skills found: required ones are highlighted and nice-to-haves are marked "(preferred)". This matching uses the platform\'s skill list, not AI.',
      async () => {
        await page.getByRole('button', { name: 'Add job target' }).click();
        const dialog = page.getByRole('dialog', { name: 'Analyze a job description' });
        await dialog.getByLabel('Job title', { exact: true }).fill('Associate Backend Engineer');
        await dialog.getByLabel('Company').fill('Orders team (sample)');
        await dialog.getByLabel('Job description', { exact: true }).fill(SAMPLE_JD);
        await expect(dialog.getByText(/Skills found \(\d+\)/)).toBeVisible();
        await expect(dialog.getByText('Docker (preferred)')).toBeVisible();
      },
    );
    await rec.step(
      'Skill gap report',
      'After "Save and analyze", each skill is listed as Required or Preferred, with Asha\'s evidence status from Skill DNA (Verified, Demonstrated, Learning, Self-reported or No evidence) and what that evidence is, plus a quote from the description showing where the skill was found.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Save and analyze' }).click();
        await expect(page.getByRole('heading', { name: 'Associate Backend Engineer' })).toBeVisible();
        await expect(page.getByText('Skill gap report')).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('Required and preferred skills are both extracted', async () => {
      await expect(page.getByRole('button', { name: /^Mark .* as preferred$/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /^Mark .* as required$/ }).first()).toBeVisible();
    });
    await rec.check('Evidence statuses come from Skill DNA (learning, self-reported, none)', async () => {
      const table = page.locator('table').first();
      await expect(table.getByText('Learning', { exact: true }).first()).toBeVisible();
      await expect(table.getByText('Self-reported', { exact: true }).first()).toBeVisible();
      await expect(table.getByText('No evidence', { exact: true }).first()).toBeVisible();
    });
    await rec.step(
      'How readiness is calculated',
      '"Show how this is calculated" opens the formula: points per evidence level, weighted more for required skills than preferred ones. There is no hidden score.',
      async () => {
        await page.getByRole('button', { name: 'Show how this is calculated' }).click();
        await expect(page.getByRole('button', { name: 'Hide how this is calculated' })).toBeVisible();
      },
    );
    await rec.step(
      'Checklist and targeted plan',
      'The readiness checklist links to the next actions (for example, tailoring a resume). The targeted plan suggests lessons to learn, problems to practise and projects to build for the gap skills.',
      async () => {
        await page.getByText('Targeted plan').scrollIntoViewIfNeeded();
        await expect(page.getByText('Readiness checklist')).toBeVisible();
      },
      { fullPage: true },
    );
  },
);

scenario(
  {
    id: 'career-09-cover-letter',
    area: CAREER,
    title: 'Generate a cover letter with placeholders for missing facts',
    summary: 'The learner fills in a few facts and generates a cover letter from a template. Anything she did not provide becomes a highlighted "[Add: ...]" placeholder rather than an invented claim.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step('Documents', 'The Documents page keeps cover letters, application answers, outreach messages, follow-ups and bios, with a badge counting placeholders still to fill.', async () => {
      await page.goto(`${BASE}/app/career/documents`);
      await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
    });
    await rec.step(
      'Give the facts you know',
      '"Write a document" opens the generator. Asha chooses a cover letter for her saved job target and writes her real reason for the company. She leaves "One real accomplishment" empty because she has nothing she can back up yet.',
      async () => {
        await page.getByRole('button', { name: 'Write a document' }).click();
        const dialog = page.getByRole('dialog', { name: 'Write a document' });
        await dialog.getByLabel('Document type').selectOption('cover_letter');
        await dialog.getByLabel('Job target').selectOption({ label: 'Junior Backend Developer' });
        await dialog.getByLabel('Your name').fill('Asha Verma');
        await dialog.getByLabel('Why this company (your reason)').fill('Your team builds tools for operations staff, which is the work I supported for four years at the library.');
      },
    );
    await rec.step(
      'Fill the template',
      '"Fill template" builds the letter without AI. The preview is labelled "Template draft (no AI)" and every missing fact is a highlighted "[Add: ...]" placeholder.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Fill template' }).click();
        await expect(page.getByText('Template draft (no AI)')).toBeVisible();
        await expect(page.locator('mark', { hasText: '[Add:' }).first()).toBeVisible();
      },
    );
    await rec.check('Missing facts become placeholders, not made-up claims', async () => {
      await expect(page.getByText(/\d+ missing fact\(s\) highlighted/)).toBeVisible();
    });
    await rec.step(
      'Save and finish later',
      'Saving opens the document editor, which counts the placeholders left and highlights them in the preview so nothing is sent with a gap.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Save draft' }).click();
        await expect(page).toHaveURL(/\/app\/career\/documents\/[0-9a-f-]{36}/);
        await expect(page.getByText(/placeholder\(s\) left/)).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('The saved letter keeps the [Add: ...] placeholders', async () => {
      const id = page.url().match(/documents\/([0-9a-f-]{36})/)![1];
      const d = await api(page.request, 'get', `/api/career/documents/${id}`);
      expect(d.body.document.body).toContain('[Add:');
    });
  },
);

scenario(
  {
    id: 'career-10-applications-tracker',
    area: CAREER,
    title: 'Track applications: board, interview rounds, reminders and analytics',
    summary: 'The learner moves an application on the board with the keyboard-friendly Move menu, opens another to add an interview round and a follow-up reminder, moves it to Interview, and reads the analytics with their definitions.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step(
      'The applications board',
      'Every application sits in a status column: Saved, Applied, Assessment, Interview, Offer and so on. Cards show the source (for example "Referral" or "Applied on platform") and any follow-up date.',
      async () => {
        await page.goto(`${BASE}/app/career/applications`);
        await expect(page.getByRole('region', { name: 'Saved column' })).toBeVisible();
      },
    );
    await rec.step(
      'Move a card with the Move menu',
      'Each card has a "Move" button that opens a menu of allowed next steps, so cards can be moved with the keyboard as well as the mouse. "Junior Backend Developer" goes from Saved to Applied.',
      async () => {
        await page.getByRole('button', { name: 'Move Junior Backend Developer at Example Co (sample) to another status' }).click();
        await page.getByRole('menuitem', { name: 'Move to Applied' }).click();
        await expect(page.getByText('Moved to Applied.')).toBeVisible();
        await expect(page.getByRole('region', { name: 'Applied column' }).getByText('Junior Backend Developer')).toBeVisible();
      },
    );
    await rec.step(
      'Add an interview round',
      'Opening "Data Operations Associate" shows its details in tabs. On Rounds, Asha adds an "HR screen" with its date and time. Feedback for each round can be written after it happens.',
      async () => {
        await page.getByRole('region', { name: 'Applied column' }).getByRole('button', { name: /^Data Operations Associate/ }).click();
        const dialog = page.getByRole('dialog', { name: 'Data Operations Associate at Sample Analytics Ltd (sample)' });
        await dialog.getByRole('tab', { name: /^Rounds/ }).click();
        await dialog.getByLabel('Round name').fill('HR screen');
        await dialog.getByLabel('When').fill(localInput(4, 11));
        await dialog.getByRole('button', { name: 'Add round' }).click();
        await expect(page.getByText('Round added.')).toBeVisible();
        await expect(dialog.getByText('HR screen', { exact: true })).toBeVisible();
      },
    );
    await rec.step(
      'Set a follow-up reminder',
      'On Overview, "Follow-up reminder" sets a date and time; Asha gets one notification then. "Save details" stores it.',
      async () => {
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('tab', { name: 'Overview' }).click();
        await dialog.getByLabel('Follow-up reminder').fill(localInput(6, 10));
        await dialog.getByRole('button', { name: 'Save details' }).click();
        await expect(page.getByText('Saved.')).toBeVisible();
      },
    );
    await rec.step(
      'Move the status to Interview',
      '"Move to" offers only the allowed next steps. Choosing Interview and "Update status" records the change in the timeline.',
      async () => {
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Move to').selectOption('interview');
        await dialog.getByRole('button', { name: 'Update status' }).click();
        await expect(page.getByText('Moved to Interview.')).toBeVisible();
        await dialog.getByRole('tab', { name: /^Timeline/ }).click();
        await expect(dialog.getByText(/Applied →/).first()).toBeVisible();
      },
    );
    await rec.check('The application has the new round, a reminder and Interview status', async () => {
      const list = await api(page.request, 'get', '/api/career/applications');
      const a = list.body.items.find((x: { role: string }) => x.role === 'Data Operations Associate');
      expect(a.status).toBe('interview');
      expect(a.rounds.some((r: { name: string }) => r.name === 'HR screen')).toBe(true);
      expect(a.nextActionAt).toBeTruthy();
    });
    await rec.step(
      'Analytics with definitions',
      'The Analytics view counts tracked and sent applications, responses and the response rate, time spent in each status and conversion by source. A Definitions box spells out exactly how each number is calculated.',
      async () => {
        await page.keyboard.press('Escape');
        await page.getByRole('radio', { name: 'Analytics' }).click();
        await expect(page.getByText('Definitions', { exact: true })).toBeVisible();
        await expect(page.getByText('Response rate').first()).toBeVisible();
      },
      { fullPage: true },
    );
  },
);

scenario(
  {
    id: 'career-11-interview-practice',
    area: CAREER,
    title: 'Practise interview answers with checklist feedback and a timed mock',
    summary: 'The learner answers a behavioral question and gets instant STAR checklist feedback without AI, runs a short timed mock interview and reads the revision plan built from her practice.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    const answer =
      'In my last role at the city library, the weekly circulation report moved to a new spreadsheet layout. I was responsible for keeping the report going during the change. First I read the new layout guide, then I rebuilt the report on a small sample, and I asked a colleague to check my numbers. As a result the report went out on time every week, and I learned to test a new process on a small sample first.';
    await rec.step('Pick a question', 'Interview prep has a question bank by kind (behavioral, project, system design, SQL, coding and more). Asha picks a behavioral question.', async () => {
      await page.goto(`${BASE}/app/career/interview`);
      await page.getByRole('button', { name: 'Tell me about a time you had to learn something new quickly.' }).click();
      await expect(page.getByLabel('Your answer')).toBeVisible();
    });
    await rec.step(
      'Write the answer and watch the live check',
      'While she types, a live checklist shows which parts of the STAR structure (Situation, Task, Action, Result) are present, plus word count, speaking time and filler words.',
      async () => {
        await page.getByLabel('Your answer').fill(answer);
        await expect(page.getByText('Live check while you type')).toBeVisible();
      },
    );
    await rec.step(
      'Save and get feedback',
      'Saving records the answer with "Checklist feedback (no AI)": each STAR item is ticked or comes with a short hint on what is missing. A model answer is available for study, with a reminder to use her own real experience.',
      async () => {
        await page.getByRole('button', { name: 'Save and get feedback' }).click();
        await expect(page.getByText('Answer saved with checklist feedback.')).toBeVisible();
        await expect(page.getByText('Checklist feedback (no AI)').first()).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('The STAR checklist is scored without AI', async () => {
      await expect(page.getByText('Situation: sets the context').first()).toBeVisible();
      await expect(page.getByText('Result: explains the outcome').first()).toBeVisible();
    });
    await rec.step(
      'Start a short mock interview',
      'The Mock interview tab runs a sequence of questions with a timer for each. Asha chooses two questions with one minute each.',
      async () => {
        await page.getByRole('tab', { name: 'Mock interview' }).click();
        await page.getByLabel('Questions', { exact: true }).selectOption('2');
        await page.getByLabel('Minutes per question').selectOption('1');
        await page.getByRole('button', { name: 'Start mock interview' }).click();
        await expect(page.getByText('Question 1 of 2')).toBeVisible();
      },
    );
    await rec.step('Answer against the clock', 'The timer counts down but never cuts her off; it only records the time taken.', async () => {
      await page.getByLabel('Your answer').fill('At the library I noticed overdue notices went out late. I owned the fix: I listed the steps, automated the date check in the spreadsheet and tested it for a week. As a result notices went out on the right day.');
      await page.getByRole('button', { name: 'Submit and next' }).click();
      await expect(page.getByText('Question 2 of 2')).toBeVisible();
    });
    await rec.step(
      'Mock interview summary',
      'After the last answer the summary shows how many questions were answered, the average checklist score, any answers that ran over time and the checklist items missed most often.',
      async () => {
        await page.getByLabel('Your answer').fill('I would start by clarifying the requirement, then I would break the work into small steps, check each step with a test and explain the trade-offs to the team.');
        await page.getByRole('button', { name: 'Submit and finish' }).click();
        await expect(page.getByText('Mock interview summary')).toBeVisible();
      },
    );
    await rec.step('Revision plan', 'The Revision plan turns practice results and weak skills into a few days of concrete next steps, each with the reason it was chosen.', async () => {
      await page.getByRole('tab', { name: 'Revision plan' }).click();
      await expect(page.getByText('Your revision plan')).toBeVisible();
    }, { fullPage: true });
  },
);

scenario(
  {
    id: 'career-12-offers-and-journal',
    area: CAREER,
    title: 'Compare offers by your own priorities and keep a growth journal',
    summary: 'The learner sets how much each factor matters to her with sliders, compares two recorded offers with a transparent per-criterion breakdown, checks a job description against her priorities and writes a private journal entry.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    // Sample offers recorded on two tracked applications (fictional companies).
    const apps = (await api(page.request, 'get', '/api/career/applications')).body.items as { id: string; role: string }[];
    const py = apps.find((a) => a.role === 'Junior Python Developer')!;
    const ops = apps.find((a) => a.role === 'Data Operations Associate')!;
    await api(page.request, 'patch', `/api/career/applications/${py.id}`, { offer: { baseSalary: 600000, currency: 'INR', remote: 'Hybrid', location: 'Pune' } });
    await api(page.request, 'patch', `/api/career/applications/${ops.id}`, { offer: { baseSalary: 520000, currency: 'INR', remote: 'Remote', location: 'Pune' } });

    await rec.step(
      'Set your priorities',
      'On "Offers and decisions", sliders from 0 (ignore) to 5 (critical) say how much each factor matters. Asha raises "Career growth" to 5 and saves.',
      async () => {
        await page.goto(`${BASE}/app/career/offers`);
        await page.getByLabel('Career growth', { exact: true }).fill('5');
        await page.getByRole('button', { name: 'Save priorities' }).click();
        await expect(page.getByText('Priorities saved.')).toBeVisible();
      },
    );
    await rec.step(
      'Transparent comparison',
      'The comparison shows every criterion with its weight, each offer\'s value and the basis for it (for example "Offer says Hybrid" or salary relative to the highest offer). Criteria she has not rated are left out, not guessed, and the formula is written underneath.',
      async () => {
        await expect(page.getByText('Weighted score')).toBeVisible();
        await expect(page.getByText(/Unrated criteria are left out, not guessed/)).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Check a job description against priorities',
      'Choosing a saved job target and "Check against priorities" quotes what the description says about each priority and flags what it does not mention, so she knows what to ask in the interview.',
      async () => {
        await page.getByLabel('Saved job target').selectOption({ label: 'Junior Backend Developer' });
        await page.getByRole('button', { name: 'Check against priorities' }).click();
        await expect(page.getByText(/of your top \d+ priorities are addressed in this description/)).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Growth journal',
      'The growth journal is private ("Only you can see this"). Asha writes a short entry about her week; entries help her see progress and prepare honest interview stories.',
      async () => {
        await page.goto(`${BASE}/app/career/journal`);
        await page.getByRole('textbox', { name: 'Title (optional)' }).fill('First mock interview');
        await page.getByLabel('Entry', { exact: true }).fill('Did my first timed mock today. My answers were clear but the second one ran short on the result. Next week: practise two project questions.');
        await page.getByRole('button', { name: 'Save entry' }).click();
        await expect(page.getByText('Entry saved.')).toBeVisible();
        await expect(page.getByText('First mock interview')).toBeVisible();
      },
    );
    await rec.step(
      'Rate a criterion yourself',
      'Back on Offers, Asha rates career growth at Fictional Systems as 4 of 5 in the comparison table. The weighted score and the "criteria rated" count should update straight away.',
      async () => {
        await page.goto(`${BASE}/app/career/offers`);
        await page.getByLabel('Your rating for Career growth at Fictional Systems (sample)').selectOption('4');
        // Short wait so a failure screenshot still shows the error message, if any.
        await expect(page.getByText(/3 of 7 weighted criteria rated/).first()).toBeVisible({ timeout: 3_000 });
      },
    );
    await rec.check('The score is computed only from entered offer details and her own ratings', async () => {
      const c = await api(page.request, 'get', '/api/career/offers/compare');
      const item = c.body.items.find((i: { id: string }) => i.id === py.id);
      expect(item.breakdown.find((b: { key: string }) => b.key === 'growth').basis).toMatch(/Your rating 4\/5/);
      expect(item.breakdown.find((b: { key: string }) => b.key === 'team').value).toBeNull();
    });
  },
);

scenario(
  {
    id: 'career-13-job-board-apply',
    area: CAREER,
    title: 'Find a platform job, apply with consent and follow the application',
    summary: 'A student browses jobs posted by employers on the platform, sees why each one matches his skill evidence, applies to "Backend Engineer (Python)" with a resume and explicit consent to share his portfolio, and follows the application on its own page.',
    roles: ['Student'],
  },
  async (rec, { page }) => {
    await login(page, demo('student'));
    const existing = await api(page.request, 'get', '/api/career/resumes');
    if (!existing.body.items.length)
      await api(page.request, 'post', '/api/career/resumes', {
        title: 'Rohan Iyer resume',
        data: { basics: { name: 'Rohan Iyer', email: demo('student') }, experience: [], education: [], projects: [], skills: [{ group: 'Technical', items: ['Python', 'SQL', 'React'] }], certifications: [], sectionOrder: [] },
      });
    await rec.step(
      'Platform jobs with match explanations',
      'The job board lists jobs from verified employers. Each card shows an "Evidence match" and chips for each listed skill, ticked where Rohan has evidence in Skill DNA. The match is advisory and never uses personal characteristics.',
      async () => {
        await page.goto(`${BASE}/app/jobs`);
        await expect(page.getByRole('link', { name: 'Backend Engineer (Python)' })).toBeVisible();
        await expect(page.getByText(/^Evidence match \d+%$/).first()).toBeVisible();
      },
    );
    await rec.step(
      'Open the job',
      'The job page has the description, responsibilities and eligibility as stated by the employer, and an evidence panel explaining each skill match in words.',
      async () => {
        await page.getByRole('link', { name: 'Backend Engineer (Python)' }).click();
        await expect(page.getByRole('heading', { name: 'Backend Engineer (Python)' })).toBeVisible();
        await expect(page.getByText(/^Evidence match/).first()).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Apply with a resume and portfolio consent',
      '"Apply" asks which resume version to send (a snapshot, so later edits do not change it), an optional note, and a separate tick box to share the portfolio and skill evidence with this employer. Nothing is shared without that tick.',
      async () => {
        await page.getByRole('button', { name: 'Apply' }).click();
        const dialog = page.getByRole('dialog', { name: 'Apply: Backend Engineer (Python)' });
        await dialog.getByLabel('Resume version').selectOption({ index: 1 });
        await dialog.getByLabel('Note to the employer').fill('I built and tested a habit tracker API with session auth and would like to work on backend services.');
        await dialog.getByLabel('Share my portfolio and Skill DNA evidence with this employer').check();
        await expect(dialog.getByLabel('Share my portfolio and Skill DNA evidence with this employer')).toBeChecked();
      },
    );
    await rec.step('Application sent', 'The job page now confirms the application, its current stage and that the portfolio was shared. It is also added to his application tracker automatically.', async () => {
      await page.getByRole('dialog').getByRole('button', { name: 'Send application' }).click();
      await expect(page.getByText('Application sent. It is also in your application tracker.')).toBeVisible();
      await expect(page.getByText(/Portfolio shared\./)).toBeVisible();
    });
    const mine = await api(page.request, 'get', '/api/jobs/my/applications');
    const appId = mine.body.items.find((a: { title: string }) => a.title === 'Backend Engineer (Python)').id as string;
    await rec.check('The application was sent with the resume snapshot and portfolio consent', async () => {
      const a = mine.body.items.find((x: { id: string }) => x.id === appId);
      expect(a.portfolioShared).toBe(true);
      expect(a.stage).toBe('applied');
    });
    await rec.step(
      'The candidate\'s application page',
      'Each application has its own page showing where it is in the hiring stages, interviews, offers, notes the hiring team chose to share, and a private message thread with the employer.',
      async () => {
        await page.goto(`${BASE}/app/jobs/applications/${appId}`);
        await expect(page.getByText('Where your application is')).toBeVisible();
        await expect(page.getByText('Messages with Helix Labs')).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step('Message the hiring team', 'Rohan asks a question in the thread. Only he and the employer\'s hiring team can read it.', async () => {
      await page.getByLabel('Message', { exact: true }).fill('Hello, is the role open to someone graduating next summer?');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(page.getByText('Hello, is the role open to someone graduating next summer?')).toBeVisible();
    });
  },
);

scenario(
  {
    id: 'career-14-feeds-and-recruiter-visibility',
    area: CAREER,
    title: 'Application progress, public job feeds and recruiter visibility',
    summary: 'The learner checks an application that has reached the interview stage, looks at remote jobs from public feeds (with honest sync status, since syncing is switched off on this test server), opens the public job feed page signed out, and controls whether recruiters can find her.',
    roles: ['Learner', 'Visitor (not signed in)'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('learner'));
    const mine = await api(page.request, 'get', '/api/jobs/my/applications');
    const appId = mine.body.items.find((a: { title: string }) => a.title === 'Backend Engineer (Python)').id as string;
    await rec.step(
      'An application at the interview stage',
      'Asha\'s application to Helix Labs shows the stages it has passed, the scheduled technical interview with a join link, the note the hiring team chose to share and her messages with the recruiter.',
      async () => {
        await page.goto(`${BASE}/app/jobs/applications/${appId}`);
        await expect(page.getByText('Where your application is')).toBeVisible();
        await expect(page.getByText(/Your technical interview is tomorrow/)).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('The page shows the current stage (Interview) and the recruiter thread', async () => {
      await expect(page.locator('[aria-current="step"]')).toContainText(/Interview/i);
    });
    await rec.step(
      'Remote jobs from public feeds',
      'The second tab lists remote jobs fetched from public job APIs (Jobicy, Himalayas, Remotive) with credit to each source. On this test server automatic syncing is switched off, so each source says so plainly ("automatic sync is turned off on this server") and the list is empty: no listings are made up.',
      async () => {
        await page.goto(`${BASE}/app/jobs?tab=remote`);
        await expect(page.getByText(/automatic sync is turned off on this server/).first()).toBeVisible();
        await expect(page.getByText('No remote jobs cached yet')).toBeVisible();
      },
    );
    await rec.check('No external listings are shown while syncing is off', async () => {
      const ext = await api(page.request, 'get', '/api/jobs/external');
      expect(ext.body.total).toBe(0);
      expect(ext.body.sources.every((s: { backgroundSync?: boolean }) => s.backgroundSync === false)).toBe(true);
    });
    const visitor = await person(browser, null);
    await rec.step(
      'The public job feed (signed out)',
      'The same feed has a public page that anyone can browse without an account. It names the sources, shows their status and explains that every listing links to the original posting.',
      async () => {
        await visitor.page.goto(`${BASE}/jobs/feed`);
        await expect(visitor.page.getByRole('heading', { name: 'Remote software jobs' })).toBeVisible();
        await expect(visitor.page.getByText('No account is needed to browse.', { exact: false })).toBeVisible();
      },
      { page: visitor.page },
    );
    await visitor.ctx.close();
    await rec.step(
      'Recruiter visibility',
      'The "Recruiter visibility" page controls whether employers can find Asha in candidate search. She opted in earlier, so it is on. The page lists what that means: ranking uses skills and evidence only, never personal characteristics.',
      async () => {
        await page.goto(`${BASE}/app/career/discoverability`);
        await expect(page.getByRole('heading', { name: 'Recruiter visibility' })).toBeVisible();
        await expect(page.getByText('On: you can appear in recruiter search results.')).toBeVisible();
      },
    );
    await rec.step('Turn it off', 'Switching it off takes effect immediately: only employers she applies to can see her application.', async () => {
      await page.getByLabel('Let recruiters find me').click();
      await expect(page.getByText('You are hidden from recruiter search.')).toBeVisible();
      await expect(page.getByText('Off: only employers you apply to can see your application.')).toBeVisible();
    });
    await rec.check('The preference is saved as off', async () => {
      const p = await api(page.request, 'get', '/api/hire/candidate-preferences');
      expect(p.body.discoverableByRecruiters).toBe(false);
    });
    await rec.step('Turn it back on', 'Turning it on again restores her opt-in, with the time of the last change shown.', async () => {
      await page.getByLabel('Let recruiters find me').click();
      await expect(page.getByText('Recruiters can now find you in search.')).toBeVisible();
      await expect(page.getByText(/Last changed/)).toBeVisible();
    });
  },
);
