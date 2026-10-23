// Screenshot helper for visual QA: node scripts/shot.mjs <outDir> <email|-> <theme> <width> <path...>
import { chromium } from '@playwright/test';

const [outDir, email, theme = 'light', width = '1440', ...paths] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://127.0.0.1:4317';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 }, colorScheme: theme === 'dark' ? 'dark' : 'light' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
if (email && email !== '-') {
  const r = await page.request.post(`${base}/api/auth/login`, { data: { email, password: process.env.PW ?? 'Demo-pass-2026' }, headers: { origin: base } });
  if (!r.ok()) throw new Error(`login failed ${r.status()} ${await r.text()}`);
}
await page.addInitScript((t) => localStorage.setItem('ls-theme', t), theme);
for (const p of paths) {
  await page.goto(base + p, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const name = `${p.replace(/[^a-z0-9]+/gi, '_') || 'root'}-${theme}-${width}.png`;
  await page.screenshot({ path: `${outDir}/${name}`, fullPage: true });
  console.log(`saved ${name}`);
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
