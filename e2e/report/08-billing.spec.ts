import { scenario, expect, login, api, demo, BASE } from './recorder';

// The report server has no payment provider configured, so billing runs in demonstration mode.
// These scenarios show that state honestly; nothing here talks to Razorpay or Stripe.

const CAMPUS = { workspace: 'campus', orgName: 'Northbridge' };
const ADMIN = { workspace: 'admin' };

scenario(
  {
    id: 'billing-01-plan-usage-demo-mode',
    area: 'Administration',
    title: 'Plan & billing for an organization admin (no payment provider configured)',
    summary:
      'The organization admin opens Plan & billing from the account menu: the current plan, usage against each limit and the available plans. Because no payment provider is configured on this server, the page says so plainly and nothing can be bought; the server refuses checkouts too.',
    roles: ['Organization admin'],
  },
  async (rec, { page }) => {
    await login(page, demo('orgadmin'), CAMPUS);
    await page.goto(`${BASE}/app`);
    await rec.step(
      'Account menu: Plan & billing',
      'Vikram, the Northbridge organization admin, opens the account menu. "Plan & billing" sits next to Settings.',
      async () => {
        await page.getByRole('button', { name: 'Account menu' }).click();
        await expect(page.getByRole('menuitem', { name: 'Plan & billing' })).toBeVisible();
      },
    );
    await rec.step(
      'Current plan, usage and the honest mode banner',
      'The page opens with a banner: "Demonstration mode: no payment provider configured". Nothing can be bought on this server and no card details are collected. Below are Northbridge’s current plan and its usage against each limit, counted from stored records.',
      async () => {
        await page.getByRole('menuitem', { name: 'Plan & billing' }).click();
        await expect(page.getByRole('heading', { name: 'Plan & billing' })).toBeVisible();
        await expect(page.getByText('Demonstration mode: no payment provider configured')).toBeVisible();
        await expect(page.getByText('Usage and limits')).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Plans to compare',
      'Free, Campus and Company are listed with their limits and included features. The upgrade buttons are disabled and say why: payments are not available in demonstration mode.',
      async () => {
        await page.getByRole('heading', { name: 'Plans', exact: true }).scrollIntoViewIfNeeded();
        await expect(page.getByRole('button', { name: 'Not available in demonstration mode' }).first()).toBeVisible();
      },
    );
    await rec.check('The server reports demonstration mode with real usage numbers', async () => {
      const ov = await api(page.request, 'get', '/api/billing/overview');
      expect(ov.status).toBe(200);
      expect(ov.body.mode).toBe('demonstration');
      expect(ov.body.canManage).toBe(true);
      expect(ov.body.usage.length).toBeGreaterThan(0);
    });
    await rec.check('A checkout cannot be started without a payment provider', async () => {
      const r = await api(page.request, 'post', '/api/billing/checkouts', { planId: 'campus' });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('billing_not_configured');
    });
    await rec.check('No payment records exist', async () => {
      const h = await api(page.request, 'get', '/api/billing/history');
      expect(h.status).toBe(200);
      expect(h.body.records).toHaveLength(0);
    });
  },
);

scenario(
  {
    id: 'billing-02-admin-prices-providers',
    area: 'Administration',
    title: 'Payment providers and plan prices for the platform admin',
    summary:
      'In Platform settings, Plans and limits, the platform admin sees which payment providers are set up (none on this server), the webhook paths to register, and edits the monthly plan prices per currency. Prices are used exactly as set when a checkout is created on the server. The payments list is empty and explains that refunds happen in the provider dashboard.',
    roles: ['Platform admin'],
  },
  async (rec, { page }) => {
    await login(page, demo('admin'), ADMIN);
    await rec.step(
      'Providers: not configured',
      'Priya opens Platform settings, Plans and limits. The Payments card says demonstration mode is on and lists Razorpay and Stripe as "Not configured", with the environment variables to set and the webhook path for each.',
      async () => {
        await page.goto(`${BASE}/app/admin/settings?tab=plans`);
        await expect(page.getByText('Plan prices')).toBeVisible();
        await expect(page.getByRole('table', { name: 'Payment providers' }).getByText('Not configured').first()).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Edit a monthly price',
      'Prices are monthly and per currency; defaults are marked "Review before going live". Priya changes the Campus price in INR to 5,499.00 and saves. Existing payments are never changed by a new price.',
      async () => {
        await page.getByLabel('Campus price in INR').fill('5499.00');
        await page.getByRole('button', { name: 'Save prices' }).first().click();
        await expect(page.getByText('Campus prices saved', { exact: false })).toBeVisible();
      },
    );
    await rec.check('The server stores the new price in minor units (paise)', async () => {
      const st = await api(page.request, 'get', '/api/billing/admin/status');
      expect(st.body.mode).toBe('demonstration');
      expect(st.body.prices.campus.INR.amountMinor).toBe(549_900);
    });
    await rec.step(
      'Back to the default prices',
      '"Use default prices" restores the built-in defaults (Campus ₹4,999 and Company ₹9,999 per month in INR).',
      async () => {
        await page.getByRole('button', { name: 'Use default prices' }).first().click();
        await expect(page.getByText('Campus prices reset to defaults')).toBeVisible();
      },
    );
    await rec.check('The default price is back', async () => {
      const st = await api(page.request, 'get', '/api/billing/admin/status');
      expect(st.body.prices.campus.INR).toEqual({ amountMinor: 499_900, isDefault: true });
    });
    await rec.step(
      'Payments and subscriptions',
      'The payments list covers every organization. It is empty here, and it notes that refunds are made in the provider dashboard (there is no manual "mark as refunded").',
      async () => {
        await page.getByRole('link', { name: /Payments and subscriptions/ }).click();
        await expect(page.getByRole('heading', { name: 'Payments and subscriptions' })).toBeVisible();
        await expect(page.getByText('No payments', { exact: true })).toBeVisible();
      },
      { fullPage: true },
    );
  },
);
