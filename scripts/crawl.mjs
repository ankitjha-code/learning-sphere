// Visual + error smoke crawl: node scripts/crawl.mjs <outDir> [roleFilter]
// Signs in as each demo role, visits their pages, records console errors, page errors and failed API calls.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const outDir = process.argv[2];
const only = process.argv[3];
const base = process.env.BASE_URL ?? 'http://127.0.0.1:4317';
const PW = 'Demo-pass-2026';
const D = (l) => `${l}@demo.learnsphere.test`;

const ROLES = {
  learner: {
    email: D('learner'),
    workspace: null,
    pages: ['/app', '/app/skills', '/app/skills/python', '/app/learn', '/app/learn/programming-foundations-python', '/app/learn/programming-foundations-python/variables-and-types', '/app/learn/revision', '/app/library', '/app/practice', '/app/practice/two-sum', '/app/practice/sql-top-four-salaries', '/app/practice/visualize', '/app/assessments', '/app/assignments', '/app/projects', '/app/projects/templates', '/app/portfolio', '/app/ai', '/app/mentors', '/app/community', '/app/goals', '/app/workspace', '/app/notifications', '/app/settings/profile', '/app/settings/preferences', '/app/settings/notifications', '/app/settings/security', '/app/settings/privacy', '/app/placements', '/app/career', '/app/career/targets', '/app/career/resumes', '/app/career/documents', '/app/career/applications', '/app/jobs', '/app/career/interview', '/app/career/offers', '/app/career/journal', '/app/career/discoverability'],
  },
  student: { email: D('student'), pages: ['/app', '/app/assignments', '/app/assessments', '/app/placements', '/app/placements/record', '/app/portfolio', '/app/projects'] },
  faculty: { email: D('faculty'), workspace: 'teach', pages: ['/app/teach', '/app/teach/courses', '/app/teach/cohorts', '/app/teach/assignments', '/app/teach/grading', '/app/teach/questions', '/app/teach/assessments', '/app/teach/rubrics', '/app/teach/attendance', '/app/teach/analytics'] },
  placement: { email: D('placement'), workspace: 'campus', pages: ['/app/campus', '/app/campus/structure', '/app/campus/students', '/app/campus/people', '/app/campus/employers', '/app/campus/drives', '/app/campus/reports', '/app/campus/assessments'] },
  recruiter: { email: D('recruiter'), workspace: 'hire', pages: ['/app/hire', '/app/hire/jobs', '/app/hire/candidates', '/app/hire/assessments', '/app/hire/interviews', '/app/hire/offers', '/app/hire/analytics', '/app/hire/company'] },
  interviewer: { email: D('interviewer'), workspace: 'hire', pages: ['/app/hire', '/app/hire/interviews', '/app/hire/candidates'] },
  mentor: { email: D('mentor'), workspace: 'mentor', pages: ['/app/mentor', '/app/mentor/mentees', '/app/mentor/sessions', '/app/mentor/profile'] },
  creator: { email: D('creator'), workspace: 'create', pages: ['/app/create', '/app/create/resources', '/app/create/paths', '/app/create/questions'] },
  admin: { email: D('admin'), workspace: 'admin', pages: ['/app/admin', '/app/admin/users', '/app/admin/orgs', '/app/admin/ai', '/app/admin/jobs', '/app/admin/moderation', '/app/admin/audit', '/app/admin/incidents', '/app/admin/health', '/app/admin/settings', '/app/practice/runtimes'] },
  public: { email: null, pages: ['/login', '/register', '/jobs/feed', '/p/rohan-iyer', '/verify/LSN-XXXX-XXXX-XXXX'] },
};

const browser = await chromium.launch();
const report = {};
for (const [role, cfg] of Object.entries(ROLES)) {
  if (only && role !== only) continue;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const issues = [];
  let current = '';
  page.on('pageerror', (e) => issues.push({ page: current, kind: 'pageerror', msg: e.message.slice(0, 300) }));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && issues.push({ page: current, kind: 'console', msg: m.text().slice(0, 300) }));
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/') && (r.status() >= 500 || [400, 404, 422].includes(r.status()))) issues.push({ page: current, kind: `api ${r.status()}`, msg: `${r.request().method()} ${u.replace(base, '')}` });
  });
  if (cfg.email) {
    const r = await page.request.post(`${base}/api/auth/login`, { data: { email: cfg.email, password: PW }, headers: { origin: base } });
    if (!r.ok()) { issues.push({ page: 'login', kind: 'login', msg: String(r.status()) }); }
    if (cfg.workspace) {
      const me = await (await page.request.get(`${base}/api/auth/me`)).json();
      const org = me.memberships?.find((m) => m.roles.length)?.orgId ?? null;
      await page.request.post(`${base}/api/auth/switch`, { data: { orgId: org, workspace: cfg.workspace }, headers: { origin: base } });
    }
  }
  for (const p of cfg.pages) {
    current = p;
    try {
      await page.goto(base + p, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(300);
      const crashed = await page.locator('text=Something went wrong').count();
      if (crashed) issues.push({ page: p, kind: 'error-screen', msg: 'Route error screen shown' });
      const notFound = await page.locator('h1:has-text("Page not found")').count();
      if (notFound) issues.push({ page: p, kind: 'not-found', msg: 'Page not found' });
      await page.screenshot({ path: `${outDir}/${role}${p.replace(/[^a-z0-9]+/gi, '_')}.png`, fullPage: false });
    } catch (e) {
      issues.push({ page: p, kind: 'nav', msg: String(e.message).slice(0, 200) });
    }
  }
  report[role] = issues;
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
for (const [role, issues] of Object.entries(report)) {
  console.log(`\n== ${role}: ${issues.length} issue(s)`);
  for (const i of issues) console.log(`  [${i.kind}] ${i.page} :: ${i.msg}`);
}
