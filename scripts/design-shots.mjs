// Quick visual check while working on the UI: screenshots a few pages as a demo user.
// Usage: BASE_URL=http://127.0.0.1:4317 OUT=/tmp/shots node scripts/design-shots.mjs learner:/app learner:/app/skills placement@campus:/app/campus
//   <account>[@workspace][!dark][~390]:<path>
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4317';
const out = path.resolve(process.env.OUT ?? 'reports/.data/design');
fs.mkdirSync(out, { recursive: true });
const full = process.env.FULL !== 'false';

const browser = await chromium.launch();
for (const [i, spec] of process.argv.slice(2).entries()) {
  const m = /^([a-z.]*)(?:@(\w+))?(!dark)?(?:~(\d+))?:(.+)$/.exec(spec);
  if (!m) continue;
  const [, account, workspace, dark, width, p] = m;
  const theme = dark ? 'dark' : 'light';
  const ctx = await browser.newContext({ baseURL: base, viewport: { width: Number(width ?? 1440), height: width ? 844 : 900 }, colorScheme: theme });
  const page = await ctx.newPage();
  await page.addInitScript((t) => localStorage.setItem('ls-theme', t), theme);
  if (account) {
    await page.request.post(`${base}/api/auth/login`, { data: { email: `${account}@demo.learnsphere.test`, password: 'Demo-pass-2026' }, headers: { origin: base } });
    if (workspace) {
      const me = await (await page.request.get(`${base}/api/auth/me`)).json();
      const org = me.memberships?.find((x) => x.roles.length)?.orgId ?? null;
      await page.request.post(`${base}/api/auth/switch`, { data: { orgId: org, workspace }, headers: { origin: base } });
    }
  }
  await page.goto(p, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.locator('h1').first().waitFor({ timeout: 25000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
  const file = path.join(out, `${String(i + 1).padStart(2, '0')}-${(account || 'public') + p.replace(/[^a-z0-9]+/gi, '-')}${dark ? '-dark' : ''}${width ? `-${width}` : ''}.png`);
  await page.screenshot({ path: file, fullPage: full && !width });
  console.log(file);
  await ctx.close();
}
await browser.close();
