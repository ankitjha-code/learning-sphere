import { db } from '../../client';
import { marketSamplePostings } from '../../schema';
import { runSnapshot } from '../../../modules/market/service';
import type { DemoContext } from './context';

/**
 * Sample postings for the Market insights page on demo and report servers, where public job
 * feeds are turned off. Every row has source 'sample', every company and description says it is
 * sample data, and the insights computed from them are labelled "Sample data" in the API and UI.
 * They are never shown on the job board and are hidden as soon as any real posting exists.
 */
const COMPANIES = ['Northwind Sample Labs (sample)', 'Bluefin Demo Systems (sample)', 'Example Analytics Ltd (sample)', 'Placeholder Health (sample)', 'Demo Logistics Co (sample)', 'Fictional Fintech (sample)'];

const TEMPLATES: { title: string; lines: string[]; remote: boolean }[] = [
  { title: 'Junior Backend Developer', lines: ['Python', 'SQL and PostgreSQL', 'REST APIs', 'Git'], remote: true },
  { title: 'Backend Engineer (Node.js)', lines: ['Node.js', 'TypeScript', 'PostgreSQL', 'Docker'], remote: true },
  { title: 'Frontend Developer', lines: ['React', 'TypeScript', 'HTML and CSS', 'Accessibility (WCAG)'], remote: true },
  { title: 'Full Stack Engineer', lines: ['React', 'Node.js', 'SQL', 'Unit testing with Jest'], remote: false },
  { title: 'Data Analyst', lines: ['SQL', 'Python with pandas', 'Data visualization', 'Statistics'], remote: false },
  { title: 'Machine Learning Engineer', lines: ['Python', 'Machine learning with scikit-learn', 'PyTorch', 'Docker'], remote: true },
  { title: 'DevOps Engineer', lines: ['Docker', 'Kubernetes', 'CI/CD with GitHub Actions', 'Linux and Bash'], remote: true },
  { title: 'QA Automation Engineer', lines: ['Unit testing with pytest', 'Python', 'CI/CD', 'Debugging'], remote: false },
  { title: 'Software Engineering Intern', lines: ['Java or Python', 'Data structures and algorithms', 'Git'], remote: false },
  { title: 'Android Developer', lines: ['Kotlin', 'REST APIs', 'Git', 'Unit testing'], remote: false },
];

export function buildSamplePostings(now = Date.now()) {
  const rows: (typeof marketSamplePostings.$inferInsert)[] = [];
  // 72 postings spread over the last 60 days (about 36 per 30-day period), deterministic.
  for (let i = 0; i < 72; i++) {
    const t = TEMPLATES[(i * 7) % TEMPLATES.length];
    const ageDays = Math.floor((i * 59) / 71);
    const extras = i % 3 === 0 ? ['Docker'] : i % 4 === 0 ? ['Caching with Redis'] : [];
    rows.push({
      source: 'sample',
      externalId: `sample-market-${String(i + 1).padStart(3, '0')}`,
      title: t.title,
      company: COMPANIES[i % COMPANIES.length],
      location: t.remote ? 'Remote (sample)' : 'Pune (sample)',
      remote: t.remote,
      tags: [],
      description: ['SAMPLE POSTING (demo data, not a real vacancy)', '', 'Requirements:', ...[...t.lines, ...extras].map((l) => `- ${l}`)].join('\n'),
      postedAt: new Date(now - ageDays * 86400_000 - (i % 5) * 3600_000),
    });
  }
  return rows;
}

export async function seed(_ctx: DemoContext) {
  await db.insert(marketSamplePostings).values(buildSamplePostings()).onConflictDoNothing();
  await runSnapshot({ trigger: 'seed' });
}
