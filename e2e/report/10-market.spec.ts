import { test } from '@playwright/test';
import { scenario, expect, login, api, demo, BASE } from './recorder';

const CAREER = 'Career and jobs';

test.beforeEach(() => test.setTimeout(180_000));
test.use({ actionTimeout: 20_000 });

/**
 * The report server runs with public job feeds turned off, so Market insights shows clearly
 * labelled sample postings (server/db/seed/demo/market.ts plus the sample Helix Labs jobs).
 * Every screen in these scenarios must say "Sample data".
 */

scenario(
  {
    id: 'market-01-insights-sample-data',
    area: CAREER,
    title: 'Market insights: skills in demand, with sources and sample data clearly labelled',
    summary:
      'The learner opens Market insights. With no real postings on this server, the page says it is showing sample data, states how many postings it is based on, ranks skills by the share of postings that mention them, and explains how to read the numbers.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await rec.step(
      'Market insights with provenance',
      'The header line says what the numbers are based on. Because public feeds are turned off here, a "Sample data" banner and tag make clear these are demonstration postings, not real vacancies.',
      async () => {
        await page.goto(`${BASE}/app/career/market`);
        await expect(page.getByRole('heading', { name: 'Market insights' })).toBeVisible();
        await expect(page.getByText('Sample data', { exact: true }).first()).toBeVisible();
        await expect(page.getByText(/Based on \d+ sample postings/)).toBeVisible();
      },
    );
    await rec.check('The API labels the data as sample and says what it is based on', async () => {
      const r = await api(page.request, 'get', '/api/market/overview?days=30');
      expect(r.status).toBe(200);
      expect(r.body.dataset).toBe('sample');
      expect(r.body.basedOn.postings).toBeGreaterThan(0);
      expect(r.body.basedOn.sources.every((s: { kind: string }) => s.kind === 'sample')).toBe(true);
      expect(r.body.caveats[0]).toMatch(/^Sample data/);
    });
    await rec.step(
      'Most requested skills, as a chart and a table',
      'Each row shows the skill, a bar, the share of postings that mention it and the count. Trends appear only when both periods have at least 30 postings and the change is large enough; otherwise the page says why they are not shown.',
      async () => {
        await expect(page.getByRole('table', { name: /Most requested skills/ })).toBeVisible();
        await page.getByRole('heading', { name: 'Most requested skills' }).scrollIntoViewIfNeeded();
      },
    );
    await rec.step(
      'Role mix, companies and weekly volume',
      'Roles are guessed from job titles with simple keyword rules. Weekly volume depends on how often postings are fetched, and the page says so.',
      async () => {
        await page.getByRole('heading', { name: 'Postings per week' }).scrollIntoViewIfNeeded();
        await expect(page.getByRole('table', { name: /Role mix/ })).toBeVisible();
      },
    );
    await rec.step(
      'How to read these numbers',
      'The caveats box spells out the limits: sample data is not real, and shares describe how often a skill is mentioned, not salaries or hiring outcomes.',
      async () => {
        const box = page.getByRole('region', { name: 'How to read these numbers' });
        await box.scrollIntoViewIfNeeded();
        await expect(box.getByText(/not salaries/)).toBeVisible();
      },
    );
  },
);

scenario(
  {
    id: 'market-02-skill-detail-and-you',
    area: CAREER,
    title: 'One skill in detail, and "You vs the market" from Skill DNA',
    summary:
      'The learner opens a skill to see its share over time, the roles that mention it and the skills mentioned alongside it, then compares the top skills with the evidence in her own Skill DNA, with links to roadmap topics and practice.',
    roles: ['Learner'],
  },
  async (rec, { page }) => {
    await login(page, demo('learner'));
    await page.goto(`${BASE}/app/career/market`);
    const table = page.getByRole('table', { name: /Most requested skills/ });
    await expect(table).toBeVisible();
    const first = table.getByRole('link').first();
    const skillName = (await first.textContent())?.trim() ?? '';
    await rec.step(
      `Open "${skillName}"`,
      'The skill page shows the share of postings that mention it, weekly share (weeks with too few postings are not charted), the roles where it appears and the skills often mentioned together, with a reminder that appearing together does not mean one causes the other.',
      async () => {
        await first.click();
        await expect(page.getByRole('heading', { name: skillName, level: 1 })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Often mentioned together' })).toBeVisible();
        await expect(page.getByText('Sample data', { exact: true }).first()).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('The skill detail response has provenance and the co-occurrence caveat', async () => {
      const slug = page.url().split('/skills/')[1].split('?')[0];
      const r = await api(page.request, 'get', `/api/market/skills/${slug}`);
      expect(r.status).toBe(200);
      expect(r.body.basedOn.postings).toBeGreaterThan(0);
      expect(r.body.caveats.join(' ')).toMatch(/does not mean one skill causes/);
    });
    await rec.step(
      'You vs the market',
      'Back on Market insights, the panel lists the top skills next to Asha\'s own evidence: Verified, Demonstrated, Learning, Self-rated only or No evidence yet. Skills she has not verified link to a roadmap topic or a practice problem.',
      async () => {
        await page.getByRole('main').getByRole('link', { name: 'Market insights' }).click();
        const panel = page.getByRole('heading', { name: 'You vs the market' });
        await panel.scrollIntoViewIfNeeded();
        await expect(page.getByRole('table', { name: /compared with your Skill DNA/ })).toBeVisible();
      },
    );
    await rec.check('"You vs the market" uses the learner\'s Skill DNA states', async () => {
      const r = await api(page.request, 'get', '/api/market/me');
      expect(r.status).toBe(200);
      expect(r.body.items.length).toBeGreaterThan(0);
      for (const i of r.body.items) expect(['verified', 'demonstrated', 'learning', 'self_reported', 'none']).toContain(i.status);
    });
  },
);

scenario(
  {
    id: 'market-03-admin-data-operations',
    area: CAREER,
    title: 'Platform admin: data operations and recomputing insights',
    summary:
      'A platform admin sees the data operations on Market insights and recomputes the insights, which adds only postings not counted before. Other users cannot call these actions.',
    roles: ['Platform admin', 'Learner'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('admin'));
    await rec.step(
      'Data operations for admins',
      'Only platform admins see this card. "Fetch latest postings now" calls the public job boards within their published rate limits; this walkthrough does not press it, so the report never depends on live third-party APIs. The sources list shows each board and when it was last fetched.',
      async () => {
        await page.goto(`${BASE}/app/career/market`);
        const ops = page.getByRole('heading', { name: 'Data operations' });
        await ops.scrollIntoViewIfNeeded();
        await expect(page.getByRole('button', { name: 'Fetch latest postings now' })).toBeVisible();
        await expect(page.getByText('Never fetched successfully').first()).toBeVisible();
      },
    );
    await rec.step(
      'Recompute insights',
      'Recomputing is idempotent: postings already counted are not counted again, so the figures do not change unless new postings arrived.',
      async () => {
        await page.getByRole('button', { name: 'Recompute insights' }).click();
        await expect(page.getByText(/Insights recomputed\. \d+ new postings counted\./)).toBeVisible();
      },
    );
    await rec.check('A learner cannot trigger fetches or recomputes', async () => {
      const ctx = await browser.newContext({ baseURL: BASE });
      const p = await ctx.newPage();
      await login(p, demo('learner'));
      expect((await api(p.request, 'post', '/api/market/admin/fetch')).status).toBe(403);
      expect((await api(p.request, 'post', '/api/market/admin/recompute')).status).toBe(403);
      await ctx.close();
    });
  },
);
