import { test, type Page } from '@playwright/test';
import { scenario, expect, api, uniqueEmail, BASE } from './recorder';

const AREA = 'Learning';
const PASSWORD = 'calendar-pass-2026';

test.beforeEach(() => test.setTimeout(180_000));
test.use({ actionTimeout: 20_000 });

/**
 * Calendar sync. These scenarios use a brand-new account so they do not change demo data other
 * scenarios rely on. The report server runs on 127.0.0.1, so the page also shows the honest
 * warning that Google and Outlook cannot reach a local address (Apple Calendar on the same
 * machine can).
 */
async function freshAccount(page: Page, name: string) {
  const email = uniqueEmail(name.split(' ')[0].toLowerCase());
  const r = await api(page.request, 'post', '/api/auth/register', { name, email, password: PASSWORD });
  expect(r.status, 'register a fresh account').toBe(201);
  const o = await api(page.request, 'post', '/api/me/onboarding', { skip: true });
  expect(o.status, 'skip onboarding').toBe(200);
  return email;
}

const feedUrlInput = (page: Page) => page.getByLabel('Your private calendar link');

scenario(
  {
    id: 'calendar-01-subscription-feed',
    area: AREA,
    title: 'Calendar subscription link: copy it, choose what is included, preview the file, replace the link',
    summary:
      'A learner creates a private calendar link (ICS) that Google Calendar, Outlook and Apple Calendar can subscribe to, copies it, reads the step-by-step instructions, filters which event types are included, opens the link to show it is a real calendar file, and replaces the link so the old one stops working.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await freshAccount(page, 'Kiran Calendar');
    const due = new Date(Date.now() + 2 * 86400_000);
    due.setUTCHours(15, 0, 0, 0);
    const task = await api(page.request, 'post', '/api/workspace/tasks', { title: 'Revise binary search, then try 3 problems', dueAt: due.toISOString(), priority: 'high' });
    expect(task.status, 'create a task with a due date').toBe(201);

    await rec.step(
      'From the workspace calendar to calendar sync',
      'The workspace Calendar tab gathers deadlines and sessions from across LearnSphere. A "Sync to your calendar" button leads to the calendar settings.',
      async () => {
        await page.goto(`${BASE}/app/workspace?tab=calendar`);
        await expect(page.getByRole('link', { name: 'Sync to your calendar' })).toBeVisible();
      },
    );
    await rec.step(
      'Calendar settings',
      'Settings, Calendar has three parts: which event types to include, a subscription link that needs no account connection, and direct sync with Google or Outlook.',
      async () => {
        await page.getByRole('link', { name: 'Sync to your calendar' }).click();
        await expect(page).toHaveURL(/\/app\/settings\/calendar$/);
        await expect(page.getByRole('heading', { name: 'What to include' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Subscription link' })).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Create the private link',
      'One click creates a private link. It is shown with a Copy button and a warning to treat it like a password. Because this test server runs on a local address, a banner explains that Google and Outlook cannot fetch it from their servers.',
      async () => {
        await page.getByRole('button', { name: 'Create subscription link' }).click();
        await expect(feedUrlInput(page)).toHaveValue(/\/api\/calendar\/ics\/[A-Za-z0-9_-]+\.ics$/);
      },
    );
    const firstUrl = await feedUrlInput(page).inputValue();

    await rec.step(
      'Copy the link',
      'Copy puts the link on the clipboard, ready to paste into a calendar app.',
      async () => {
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
        await page.getByRole('button', { name: 'Copy link' }).click();
        await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      },
    );
    await rec.check('The clipboard holds the subscription link', async () => {
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      expect(clip).toBe(firstUrl);
    });

    await rec.step(
      'Instructions for Google Calendar',
      'Step-by-step instructions for each app. The Google tab notes that Google refreshes subscribed calendars only every few hours, which is Google\'s behavior, and points to direct sync for faster updates.',
      async () => {
        await page.getByRole('heading', { name: 'Add it to your calendar' }).scrollIntoViewIfNeeded();
        await expect(page.getByText('From URL', { exact: true })).toBeVisible();
        await expect(page.getByText(/usually every few hours/).first()).toBeVisible();
      },
    );
    await rec.step('Instructions for Outlook', 'Outlook on the web: Add calendar, then Subscribe from web.', async () => {
      await page.getByRole('tab', { name: 'Outlook' }).click();
      await expect(page.getByText('Subscribe from web', { exact: true })).toBeVisible();
    });
    await rec.step('Instructions for Apple Calendar', 'Apple Calendar on Mac, iPhone and iPad, plus a button that opens the link directly in Apple Calendar (webcal).', async () => {
      await page.getByRole('tab', { name: 'Apple Calendar' }).click();
      await expect(page.getByText(/New Calendar Subscription/).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open in Apple Calendar' })).toHaveAttribute('href', /^webcal:\/\//);
    });

    await rec.step(
      'Open the link: a real calendar file',
      'Opening the link (here in plain-text preview so the browser shows it instead of downloading it) shows a standard iCalendar file: a VCALENDAR named "LearnSphere Nexus" with one VEVENT per item, times in UTC and a link back to LearnSphere.',
      async () => {
        await page.goto(`${firstUrl}?view=text`);
        await expect(page.getByText(/BEGIN:VCALENDAR/).first()).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('The feed is served as text/calendar and contains the task with a stable UID', async () => {
      const r = await page.request.get(firstUrl);
      expect(r.status()).toBe(200);
      expect(r.headers()['content-type']).toMatch(/^text\/calendar/);
      const body = (await r.text()).replace(/\r\n /g, '');
      for (const p of ['VERSION:2.0', 'PRODID:', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:LearnSphere Nexus']) expect(body).toContain(p);
      expect(body).toContain(`UID:task-${task.body.task.id}@learnsphere`);
      expect(body).toContain('SUMMARY:Revise binary search\\, then try 3 problems');
      expect(body).toMatch(/DTSTART:\d{8}T150000Z/);
    });

    await rec.step(
      'Choose which event types are included',
      'Unticking "Task" and saving removes personal tasks from the subscription link and from any connected calendar. The other types (assignments, assessments, interviews, mentor sessions, milestones) stay.',
      async () => {
        await page.goto(`${BASE}/app/settings/calendar`);
        await page.getByRole('checkbox', { name: 'Task', exact: true }).click();
        await page.getByRole('button', { name: 'Save event types' }).click();
        await expect(page.getByText(/now use these event types/)).toBeVisible();
      },
    );
    await rec.check('The feed no longer includes the task', async () => {
      const body = await (await page.request.get(firstUrl)).text();
      expect(body).toContain('BEGIN:VCALENDAR');
      expect(body).not.toContain(`task-${task.body.task.id}`);
    });

    await rec.step(
      'Replace the link',
      'If the link leaks, "Create a new link" issues a different one after a confirmation. The old link stops working immediately.',
      async () => {
        await page.getByRole('button', { name: 'Create a new link' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.getByRole('dialog').getByRole('button', { name: 'Create new link' }).click();
        await expect(page.getByText('New link created. The old link no longer works.')).toBeVisible();
        await expect(feedUrlInput(page)).not.toHaveValue(firstUrl);
      },
    );
    await rec.check('The old link returns 404 and the new one works', async () => {
      expect((await page.request.get(firstUrl)).status()).toBe(404);
      const newUrl = await feedUrlInput(page).inputValue();
      expect((await page.request.get(newUrl)).status()).toBe(200);
    });
  },
);

scenario(
  {
    id: 'calendar-02-direct-sync-setup',
    area: AREA,
    title: 'Direct sync with Google Calendar and Outlook: honest "not configured" state with setup steps',
    summary:
      'Direct sync pushes items into a dedicated "LearnSphere Nexus" calendar in Google or Outlook using OAuth. On a server without OAuth credentials, each provider says "Not configured on this server" and shows the exact, free setup steps for an administrator, including the redirect URI to register.',
    roles: ['Learner', 'Administrator'],
  },
  async (rec, { page }) => {
    await freshAccount(page, 'Noor Sync');
    const overview = await api(page.request, 'get', '/api/calendar');
    expect(overview.status).toBe(200);
    const google = overview.body.providers.find((p: { id: string }) => p.id === 'google');
    const microsoft = overview.body.providers.find((p: { id: string }) => p.id === 'microsoft');

    await rec.step(
      'Direct sync section',
      'Below the subscription link, Google Calendar and Microsoft Outlook each have a panel. Direct sync creates its own calendar and never reads or changes the user\'s other calendars.',
      async () => {
        await page.goto(`${BASE}/app/settings/calendar`);
        await page.getByRole('heading', { name: 'Direct sync with Google or Outlook' }).scrollIntoViewIfNeeded();
        await expect(page.getByRole('heading', { name: 'Google Calendar', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Microsoft Outlook', exact: true })).toBeVisible();
      },
    );

    if (!google.configured) {
      await rec.step(
        'Google: not configured, with setup steps',
        'Without GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, the panel says so plainly. The setup steps cover a free Google Cloud project, the consent screen in Testing mode with your own account as a test user, the narrow calendar.app.created scope and the redirect URI to register (with a Copy button).',
        async () => {
          const panel = page.locator('section[aria-labelledby="provider-google"]');
          await expect(panel.getByText('Not configured on this server', { exact: true })).toBeVisible();
          await panel.getByText(/Setup steps for an administrator/).click();
          await expect(panel.getByText('GOOGLE_OAUTH_CLIENT_ID', { exact: true }).first()).toBeVisible();
          await expect(panel.getByText(google.redirectUri, { exact: true }).first()).toBeVisible();
          await panel.scrollIntoViewIfNeeded();
        },
      );
      await rec.check('Starting a Google connection is refused with "not configured"', async () => {
        const r = await api(page.request, 'post', '/api/calendar/oauth/google/start');
        expect(r.status).toBe(503);
        expect(r.body.error.code).toBe('not_configured');
      });
    } else {
      await rec.step('Google: ready to connect', 'This server has Google OAuth configured, so the panel offers a Connect button.', async () => {
        await expect(page.getByRole('button', { name: 'Connect Google Calendar' })).toBeVisible();
      });
    }

    if (!microsoft.configured) {
      await rec.step(
        'Outlook: not configured, with setup steps',
        'The Microsoft steps cover a free Microsoft Entra app registration, the Web redirect URI, the delegated Graph permissions Calendars.ReadWrite and offline_access, a client secret, and the MS_OAUTH_* settings.',
        async () => {
          const panel = page.locator('section[aria-labelledby="provider-microsoft"]');
          await expect(panel.getByText('Not configured on this server', { exact: true })).toBeVisible();
          await panel.getByText(/Setup steps for an administrator/).click();
          await expect(panel.getByText('Calendars.ReadWrite', { exact: true }).first()).toBeVisible();
          await expect(panel.getByText(microsoft.redirectUri, { exact: true }).first()).toBeVisible();
          await panel.scrollIntoViewIfNeeded();
        },
      );
      await rec.check('The redirect URIs point back to this server', async () => {
        expect(google.redirectUri).toBe(`${BASE}/api/calendar/oauth/google/callback`);
        expect(microsoft.redirectUri).toBe(`${BASE}/api/calendar/oauth/microsoft/callback`);
      });
    } else {
      await rec.step('Outlook: ready to connect', 'This server has Microsoft OAuth configured, so the panel offers a Connect button.', async () => {
        await expect(page.getByRole('button', { name: 'Connect Microsoft Outlook' })).toBeVisible();
      });
    }

    await rec.check('The API never exposes tokens or the connection of another user', async () => {
      const dump = JSON.stringify(overview.body);
      expect(dump).not.toMatch(/refresh_?token|access_?token/i);
      expect(overview.body.providers.every((p: { connection: unknown }) => p.connection === null)).toBe(true);
    });
  },
);
