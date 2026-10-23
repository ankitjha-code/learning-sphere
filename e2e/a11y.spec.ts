import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { demo, login } from './helpers';

/**
 * Automated WCAG 2.2 A/AA checks (axe-core) on representative pages for every role,
 * in light and dark themes. Automated checks catch a subset of issues; keyboard and
 * screen-reader passes are still done by hand (see docs/ACCESSIBILITY.md).
 */
const PAGES: { role: string; email: string | null; workspace?: string; org?: string; paths: string[] }[] = [
  { role: 'public', email: null, paths: ['/login', '/register', '/jobs/feed', '/p/rohan-iyer'] },
  { role: 'learner', email: demo('learner'), paths: ['/app', '/app/skills', '/app/learn', '/app/learn/programming-foundations-python', '/app/learn/programming-foundations-python/how-programs-run', '/app/practice', '/app/practice/two-sum', '/app/assessments', '/app/projects', '/app/portfolio', '/app/ai', '/app/community', '/app/goals', '/app/workspace', '/app/settings/privacy', '/app/career', '/app/career/applications', '/app/jobs', '/app/library'] },
  { role: 'faculty', email: demo('faculty'), workspace: 'teach', org: 'Northbridge', paths: ['/app/teach', '/app/teach/assignments', '/app/teach/grading', '/app/teach/analytics'] },
  { role: 'placement', email: demo('placement'), workspace: 'campus', org: 'Northbridge', paths: ['/app/campus', '/app/campus/drives', '/app/campus/students'] },
  { role: 'recruiter', email: demo('recruiter'), workspace: 'hire', org: 'Helix', paths: ['/app/hire', '/app/hire/candidates', '/app/hire/jobs'] },
  { role: 'mentor', email: demo('mentor'), workspace: 'mentor', paths: ['/app/mentor', '/app/mentor/mentees'] },
  { role: 'admin', email: demo('admin'), workspace: 'admin', paths: ['/app/admin', '/app/admin/jobs', '/app/admin/ai'] },
];

for (const theme of ['light', 'dark'] as const) {
  for (const group of PAGES) {
    test(`a11y ${group.role} (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('ls-theme', t), theme);
      if (group.email) await login(page, group.email, { workspace: group.workspace, orgName: group.org });
      const failures: string[] = [];
      for (const path of group.paths) {
        await page.goto(path, { waitUntil: 'networkidle' });
        await page.waitForTimeout(250);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        for (const v of results.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
          failures.push(`${path} [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(' ')} ${v.nodes[0]?.failureSummary?.split('\n')[1] ?? ''}`);
        }
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });
  }
}
