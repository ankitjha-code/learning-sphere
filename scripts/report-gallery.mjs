// Captures every main screen for every role into reports/.data/gallery (used by the HTML report).
// Usage: BASE_URL=http://127.0.0.1:4429 node scripts/report-gallery.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4429';
const OUT = path.resolve('reports/.data/gallery');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const D = (l) => `${l}@demo.learnsphere.test`;

const GROUPS = [
  { group: 'Public pages (no account needed)', email: null, pages: ['/login', '/register', '/forgot-password', '/jobs/feed', '/p/rohan-iyer'] },
  {
    group: 'Learner: Asha (career switcher)',
    email: D('learner'),
    pages: ['/app', '/app/skills', '/app/skills/python', '/app/learn', '/app/learn/sql-database-design', '/app/learn/programming-foundations-python/variables-and-types', '/app/learn/revision', '/app/library', '/app/practice', '/app/practice/two-sum', '/app/practice/sql-top-four-salaries', '/app/practice/visualize', '/app/assessments', '/app/projects', '/app/projects/templates', '/app/portfolio', '/app/ai', '/app/mentors', '/app/community', '/app/goals', '/app/workspace', '/app/notifications', '/app/settings/profile', '/app/settings/preferences', '/app/settings/notifications', '/app/settings/security', '/app/settings/privacy', '/app/settings/calendar'],
  },
  { group: 'Job seeker: Asha in the Career workspace', email: D('learner'), workspace: 'career', pages: ['/app/career', '/app/career/targets', '/app/career/resumes', '/app/career/documents', '/app/career/applications', '/app/jobs', '/app/career/interview', '/app/career/offers', '/app/career/journal', '/app/career/discoverability', '/app/career/market'] },
  { group: 'College student: Rohan', email: D('student'), pages: ['/app', '/app/assignments', '/app/assessments', '/app/placements', '/app/placements/record', '/app/portfolio'] },
  { group: 'Organization admin: Plan and billing', email: D('orgadmin'), pages: ['/app/billing', '/app/billing/history'] },
  { group: 'Faculty: Dr. Neha Kulkarni (Teach workspace)', email: D('faculty'), workspace: 'teach', pages: ['/app/teach', '/app/teach/courses', '/app/teach/cohorts', '/app/teach/assignments', '/app/teach/grading', '/app/teach/rubrics', '/app/teach/questions', '/app/teach/assessments', '/app/teach/attendance', '/app/teach/analytics'] },
  { group: 'Placement officer: Farah (Campus workspace)', email: D('placement'), workspace: 'campus', pages: ['/app/campus', '/app/campus/structure', '/app/campus/students', '/app/campus/people', '/app/campus/employers', '/app/campus/drives', '/app/campus/assessments', '/app/campus/reports'] },
  { group: 'Recruiter: Jordan at Helix Labs (Hire workspace)', email: D('recruiter'), workspace: 'hire', pages: ['/app/hire', '/app/hire/jobs', '/app/hire/candidates', '/app/hire/assessments', '/app/hire/interviews', '/app/hire/offers', '/app/hire/analytics', '/app/hire/company'] },
  { group: 'Mentor: Lina (Mentor workspace)', email: D('mentor'), workspace: 'mentor', pages: ['/app/mentor', '/app/mentor/mentees', '/app/mentor/sessions', '/app/mentor/profile'] },
  { group: 'Content creator: Omar (Create workspace)', email: D('creator'), workspace: 'create', pages: ['/app/create', '/app/create/resources', '/app/create/paths', '/app/create/questions'] },
  { group: 'Platform admin: Priya (Admin workspace)', email: D('admin'), workspace: 'admin', pages: ['/app/admin', '/app/admin/users', '/app/admin/orgs', '/app/admin/ai', '/app/admin/jobs', '/app/admin/moderation', '/app/admin/audit', '/app/admin/incidents', '/app/admin/health', '/app/admin/settings', '/app/billing/admin', '/app/practice/runtimes'] },
  { group: 'Dark theme', email: D('learner'), theme: 'dark', pages: ['/app', '/app/skills', '/app/practice/two-sum', '/app/learn/programming-foundations-python'] },
  { group: 'Phone screen (390 px wide)', email: D('learner'), width: 390, pages: ['/app', '/app/learn', '/app/practice/two-sum', '/app/skills'] },
];

const manifest = [];
const browser = await chromium.launch();
let n = 0;
for (const g of GROUPS) {
  const ctx = await browser.newContext({ baseURL: base, viewport: { width: g.width ?? 1440, height: g.width ? 844 : 900 }, colorScheme: g.theme ?? 'light' });
  const page = await ctx.newPage();
  await page.addInitScript((t) => localStorage.setItem('ls-theme', t), g.theme ?? 'light');
  if (g.email) {
    await page.request.post(`${base}/api/auth/login`, { data: { email: g.email, password: 'Demo-pass-2026' }, headers: { origin: base } });
    if (g.workspace) {
      const me = await (await page.request.get(`${base}/api/auth/me`)).json();
      const org = me.memberships?.find((m) => m.roles.length)?.orgId ?? null;
      await page.request.post(`${base}/api/auth/switch`, { data: { orgId: org, workspace: g.workspace }, headers: { origin: base } });
    }
  }
  for (const p of g.pages) {
    try {
      await page.goto(p, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(400);
      const h1 = (await page.locator('h1').first().textContent({ timeout: 2000 }).catch(() => null))?.trim();
      const file = `${String(++n).padStart(3, '0')}.jpg`;
      await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 70, fullPage: !g.width });
      manifest.push({ group: g.group, title: h1 || p, path: p, file });
    } catch (e) {
      manifest.push({ group: g.group, title: `${p} (could not capture: ${String(e.message).split('\n')[0]})`, path: p, file: null });
    }
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Gallery: ${manifest.filter((m) => m.file).length} screens captured`);
