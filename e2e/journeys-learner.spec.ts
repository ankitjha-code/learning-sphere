import { test, expect } from '@playwright/test';
import { api, demo, login, setEditor, uniqueEmail } from './helpers';

const SUM_JS = `const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split('\\n').map(Number);\nconsole.log(a + b);\n`;
const TWO_SUM_WRONG = `console.log('0 0');\n`;
const TWO_SUM_JS = `const d = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);
const n = d[0]; const nums = d.slice(1, 1 + n); const target = d[1 + n];
const seen = new Map();
for (let j = 0; j < n; j++) {
  const need = target - nums[j];
  if (seen.has(need)) { console.log(seen.get(need) + ' ' + j); break; }
  if (!seen.has(nums[j])) seen.set(nums[j], j);
}
`;

test.describe('Journey 1: from a goal to job-ready', () => {
  test('signs up, onboards, learns, practices with real execution, builds, publishes evidence and applies', async ({ page }) => {
    const email = uniqueEmail('j1');

    // Sign up through the UI.
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Journey One');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('journey-pass-2026');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/onboarding/);

    // Onboarding: goal, background, style, plan.
    await page.getByRole('button', { name: /Switching careers/ }).click();
    await page.getByRole('button', { name: 'Backend Developer' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radio', { name: 'Some practice' }).first().click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Pick your first roadmaps')).toBeVisible();
    await page.getByRole('button', { name: 'Create my plan' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText('Your next steps')).toBeVisible();
    await expect(page.getByText('Why:').first()).toBeVisible();

    // Make sure the Python path is part of the plan, then study a topic and pass its quiz.
    await api(page.request, 'post', '/api/learning/tracks/programming-foundations-python/enroll', { mode: 'guided' });
    await page.goto('/app/learn/programming-foundations-python/how-programs-run');
    await expect(page.getByRole('heading', { name: 'How programs run' })).toBeVisible();
    await page.getByLabel('Always a string').check();
    await page.getByLabel('True', { exact: true }).check();
    await page.getByLabel('Blank 1').fill('int');
    await page.getByLabel('45', { exact: true }).check();
    await page.getByRole('button', { name: 'Submit answers' }).click();
    await expect(page.getByText(/100% · Passed/)).toBeVisible();
    await expect(page.getByText(/Next review scheduled/)).toBeVisible();

    // Solve a problem in CodeLab: real execution in the QuickJS sandbox.
    await page.goto('/app/practice/sum-two-numbers');
    await page.getByLabel('Language').selectOption('javascript');
    await setEditor(page, SUM_JS);
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByText('Accepted').first()).toBeVisible();
    await expect(page.getByText('Verified evidence added to Skill DNA')).toBeVisible();

    // The skill is now verified in Skill DNA, labelled with its source.
    await page.goto('/app/skills/programming-basics');
    await expect(page.getByText('CodeLab (tested)').first()).toBeVisible();
    await expect(page.getByText('Verified').first()).toBeVisible();

    // Build: start a project from a template.
    const start = await api(page.request, 'post', '/api/projects/templates/library-rest-api/start', { mode: 'guided' });
    expect(start.status).toBeLessThan(300);
    const projectId = start.body.project?.id ?? start.body.id;
    await page.goto(`/app/projects/${projectId}`);
    await expect(page.getByText(/Library|REST API/i).first()).toBeVisible();

    // Publish portfolio evidence and view it signed out.
    const pub = await api(page.request, 'post', '/api/portfolio/publish', { visibility: 'public' });
    expect(pub.status).toBe(200);
    const portfolio = await api(page.request, 'get', '/api/portfolio');
    const slug = portfolio.body.portfolio?.slug ?? portfolio.body.slug;
    const anon = await page.context().browser()!.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`http://127.0.0.1:4417/p/${slug}`);
    await expect(anonPage.getByText('Journey One')).toBeVisible();
    await anon.close();

    // Prepare for a job: analyze a target and apply to a published posting.
    await page.goto('/app/jobs');
    await expect(page.getByText('Backend Engineer (Python)').first()).toBeVisible();
    const jobs = await api(page.request, 'get', '/api/jobs');
    const job = (jobs.body.items ?? jobs.body.jobs).find((j: { title: string }) => j.title === 'Backend Engineer (Python)');
    const resume = await api(page.request, 'post', '/api/career/resumes', { title: 'Main resume', data: { basics: { name: 'Journey One' }, experience: [], education: [], projects: [], skills: [], certifications: [], sectionOrder: [] } });
    expect(resume.status).toBeLessThan(300);
    const apply = await api(page.request, 'post', `/api/jobs/${job.id}/apply`, { resumeId: resume.body.resume.id, coverNote: 'Interested in backend work.', sharePortfolio: true });
    expect(apply.status).toBeLessThan(300);
    await page.goto('/app/career/applications');
    await expect(page.getByText('Backend Engineer (Python)').first()).toBeVisible();
  });
});

test.describe('Journey 3: AI-assisted coding improvement with real execution', () => {
  test('wrong attempt, progressive hint, then an accepted solution recorded as verified evidence', async ({ page }) => {
    await login(page, demo('learner'));
    await page.goto('/app/practice/two-sum');
    await page.getByLabel('Language').selectOption('javascript');

    await setEditor(page, TWO_SUM_WRONG);
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByText('Wrong answer').first()).toBeVisible();

    await page.getByRole('tab', { name: /Hints/ }).click();
    await page.getByRole('button', { name: /Show hint 1 of/ }).click();
    await expect(page.getByText('Hint 1')).toBeVisible();

    // AI nudge is optional: with no provider configured it says so honestly.
    const aiHint = await api(page.request, 'post', '/api/practice/problems/two-sum/ai-hint', { code: TWO_SUM_WRONG, language: 'javascript' });
    expect(aiHint.body.ok).toBe(false);

    await setEditor(page, TWO_SUM_JS);
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByText('Accepted').first()).toBeVisible();

    const history = await api(page.request, 'get', '/api/practice/problems/two-sum');
    expect(history.status).toBe(200);
    const dna = await api(page.request, 'get', '/api/learning/skills/hashing');
    expect(dna.body.evidence.some((e: { source: string; verified: boolean }) => e.source === 'practice' && e.verified)).toBe(true);
  });
});

test.describe('Journey 8: AI provider outage', () => {
  test('the platform reports the outage honestly, keeps the user message, avoids duplicates and keeps learning working', async ({ page, browser }) => {
    // Admin configures a provider that cannot be reached (simulated outage).
    const adminCtx = await browser.newContext({ baseURL: 'http://127.0.0.1:4417' });
    const admin = await adminCtx.newPage();
    await login(admin, demo('admin'));
    const prov = await api(admin.request, 'post', '/api/ai/admin/providers', { preset: 'custom', label: 'Unreachable (outage test)', baseUrl: 'http://127.0.0.1:9/v1', model: 'test-model', apiKey: 'none', timeoutMs: 2000 });
    expect(prov.status).toBeLessThan(300);

    await login(page, demo('learner'));
    const conv = await api(page.request, 'post', '/api/ai/conversations', { assistant: 'tutor', title: 'Outage test' });
    const convId = conv.body.conversation?.id ?? conv.body.id;
    const send = () => api(page.request, 'post', `/api/ai/conversations/${convId}/messages?stream=0`, { content: 'Explain recursion simply.', clientMessageId: 'outage-test-1' });
    const first = await send();
    expect(JSON.stringify(first.body)).toMatch(/unavailable|error|timeout/i);
    const again = await send();
    expect(again.status).toBeLessThan(500);
    const msgs = await api(page.request, 'get', `/api/ai/conversations/${convId}/messages`);
    const list = msgs.body.messages ?? msgs.body.items;
    expect(list.filter((m: { role: string }) => m.role === 'user')).toHaveLength(1);

    await page.goto(`/app/ai/c/${convId}`);
    await expect(page.getByText('Explain recursion simply.')).toBeVisible();

    // Learning and practice still work during the outage.
    await page.goto('/app/learn');
    await expect(page.getByRole('heading', { name: 'Roadmaps', level: 1 })).toBeVisible();

    await api(admin.request, 'delete', `/api/ai/admin/providers/${prov.body.provider?.id ?? prov.body.id}`);
    await adminCtx.close();
  });
});
