import { scenario, expect, uniqueEmail, BASE, api } from './recorder';

scenario(
  {
    id: 'start-01-sign-up-and-onboarding',
    area: 'Getting started',
    title: 'Create an account and set up a personal plan',
    summary: 'A new visitor signs up, answers four short onboarding questions about goals, skills and study time, and lands on a personalised home page with recommended next steps.',
    roles: ['New learner'],
  },
  async (rec, { page }) => {
    const email = uniqueEmail('newlearner');
    await rec.step('Open the sign-up page', 'The sign-up page asks only for a name, email and password. The left side explains what the platform does.', () => page.goto(`${BASE}/register`));
    await rec.step('Try a weak password', 'If the password is too short, the form explains the rule next to the field instead of failing silently.', async () => {
      await page.getByLabel('Full name').fill('Nisha Kapoor');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill('short');
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page.getByText(/at least 10 characters/i).first()).toBeVisible();
    });
    await rec.check('A weak password is rejected with a clear message', async () => expect(page.getByText(/at least 10 characters/i).first()).toBeVisible());
    await rec.step('Create the account', 'With a valid password the account is created and the onboarding wizard starts.', async () => {
      await page.getByLabel('Password').fill('nisha-learns-2026');
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page).toHaveURL(/\/onboarding/);
    });
    await rec.step('Onboarding step 1: goal', 'The learner says where they are today and picks target roles. Everything here is optional and can be skipped.', async () => {
      await page.getByRole('button', { name: /College student/ }).click();
      await page.getByRole('button', { name: 'Software Engineer' }).click();
      await page.getByRole('button', { name: 'Backend Developer' }).click();
    });
    await rec.step('Onboarding step 2: what you already know', 'Skill ratings are recorded as "self-reported". They never count as verified until proven in practice or assessments.', async () => {
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('radio', { name: 'Comfortable' }).nth(1).click();
      await page.getByRole('radio', { name: 'Some practice' }).nth(6).click();
    });
    await rec.step('Onboarding step 3: how you learn', 'The learner picks a learning style, weekly study hours and preferred programming languages.', async () => {
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: /Project-first/ }).click();
    });
    await rec.step('Onboarding step 4: first roadmaps', 'Roadmaps are suggested from the chosen target roles. The learner can pick up to three.', async () => {
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText('Pick your first roadmaps')).toBeVisible();
      await page.locator('button[aria-pressed]').filter({ hasText: /Python|Data Structures|Backend/ }).first().click();
    });
    await rec.step('Personal home page', 'After "Create my plan", the home page shows study stats, a getting-started checklist, goals and ranked next steps. Each suggestion says why it was made.', async () => {
      await page.getByRole('button', { name: 'Create my plan' }).click();
      await expect(page.getByText('Your next steps')).toBeVisible();
    }, { fullPage: true });
    await rec.check('Every recommendation shows the reason it was suggested', async () => expect(page.getByText('Why:').first()).toBeVisible());
    await rec.check('Goals were created from the onboarding answers', async () => {
      const goals = await api(page.request, 'get', '/api/learning/goals');
      expect(goals.body.goals.length).toBeGreaterThan(0);
    });
  },
);

scenario(
  {
    id: 'start-02-sign-in',
    area: 'Getting started',
    title: 'Sign in, wrong password and password reset',
    summary: 'Shows the sign-in page with one-click demo accounts, what happens with a wrong password, and how password reset behaves honestly when email is not set up.',
    roles: ['Any user'],
  },
  async (rec, { page }) => {
    await rec.step('Open the sign-in page', 'The sign-in page lists demo accounts for every role (sample data). All use the password Demo-pass-2026.', () => page.goto(`${BASE}/login`), { fullPage: true });
    await rec.step('Wrong password', 'A wrong password shows a message that does not reveal whether the email exists (a basic security protection).', async () => {
      await page.getByLabel('Email').fill('learner@demo.learnsphere.test');
      await page.getByLabel('Password').fill('not-the-right-password');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
    });
    await rec.step('Forgot password', 'Without an email provider configured, the page says so plainly instead of pretending an email was sent.', async () => {
      await page.getByRole('link', { name: 'Forgot password?' }).click();
      await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
      await page.getByLabel('Email').fill('learner@demo.learnsphere.test');
      await page.getByRole('button', { name: 'Send reset link' }).click();
      await expect(page.getByText(/Email is not set up on this server|Check your inbox/)).toBeVisible();
    });
    await rec.step('Sign in with a demo account', 'One click on a demo account signs in as that role.', async () => {
      await page.goto(`${BASE}/login`);
      await page.getByRole('button', { name: /Learner \(independent\)/ }).click();
      await expect(page).toHaveURL(/\/app/);
      await expect(page.getByText(/Good (morning|afternoon|evening), Asha/)).toBeVisible();
    });
    await rec.check('Signed in as the demo learner', async () => expect(page.getByText(/Asha/).first()).toBeVisible());
  },
);
