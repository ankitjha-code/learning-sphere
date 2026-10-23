import { db } from '../../client';
import { resumes, jobTargets, applications, applicationEvents, interviewPractice, careerDocuments } from '../../schema';
import type { ResumeData } from '../../schema/build';
import { extractSkills, toStoredSkills } from '../../../modules/career/extract';
import { deterministicFeedback } from '../../../modules/career/interview';
import { generateDocument } from '../../../modules/career/generator';
import { demoEmail, type DemoContext } from './context';

const DAY = 86400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);

/** A clearly labelled sample job description (not a real vacancy). */
export const SAMPLE_JD = `SAMPLE JOB DESCRIPTION (demo data, not a real vacancy)

Junior Backend Developer

About the role
You will help build and maintain REST APIs for an internal operations tool.

Requirements:
- Working knowledge of Python or Node.js
- SQL and a relational database such as PostgreSQL
- Git and a willingness to take part in code reviews
- Clear written communication

Nice to have:
- Docker
- Unit testing (pytest or Jest)
- Some familiarity with caching`;

/**
 * Sample career data for the independent learner (Asha Verma). Everything here matches the
 * profile created in core.ts: a library operations background and a commerce degree.
 * No metrics, achievements or certifications are invented; companies are fictional and labelled.
 */
export async function seed(ctx: DemoContext) {
  const uid = ctx.users.learner;

  const data: ResumeData = {
    basics: { name: 'Asha Verma', email: demoEmail('learner'), location: 'Pune, India', headline: 'Career switcher learning backend development', links: [] },
    summary: 'Operations assistant moving into backend development. Comfortable working with structured data and spreadsheets; currently learning Python, JavaScript, APIs and databases.',
    experience: [
      {
        id: 'exp-library',
        company: 'City Library',
        title: 'Operations Assistant',
        start: '2021-06',
        end: '2025-12',
        bullets: ['Ran circulation reports in spreadsheets.'],
      },
    ],
    education: [{ id: 'edu-1', institution: 'State University', degree: 'B.Com', field: 'Commerce', end: '2021' }],
    projects: [],
    skills: [
      { group: 'Learning', items: ['Python', 'JavaScript', 'SQL'] },
      { group: 'Tools', items: ['Spreadsheets'] },
    ],
    certifications: [],
    sectionOrder: ['summary', 'experience', 'projects', 'education', 'skills', 'certifications'],
  };
  const [resume] = await db.insert(resumes).values({ userId: uid, title: 'Asha Verma resume (sample)', template: 'clean', targetRole: null, data, isPrimary: true }).returning();

  const [target] = await db
    .insert(jobTargets)
    .values({ userId: uid, title: 'Junior Backend Developer', company: 'Example Co (sample)', description: SAMPLE_JD, extractedSkills: toStoredSkills(extractSkills(SAMPLE_JD)) })
    .returning();

  const cover = generateDocument('cover_letter', { name: 'Asha Verma', role: target.title, company: 'Example Co (sample)', currentRole: 'an operations assistant learning backend development' });
  const [doc] = await db.insert(careerDocuments).values({ userId: uid, kind: 'cover_letter', title: cover.title, body: cover.body }).returning();

  const apps = await db
    .insert(applications)
    .values([
      { userId: uid, company: 'Example Co (sample)', role: 'Junior Backend Developer', source: 'manual', status: 'saved', location: 'Remote', deadline: daysAhead(10), notes: 'Sample record. Tailor the resume before applying.', coverLetterId: doc.id },
      { userId: uid, company: 'Sample Analytics Ltd (sample)', role: 'Data Operations Associate', source: 'referral', status: 'applied', appliedAt: daysAgo(12), resumeId: resume.id, location: 'Pune', nextActionAt: daysAhead(2), contacts: [{ name: 'Sample Recruiter', role: 'Recruiter (fictional)' }] },
      {
        userId: uid,
        company: 'Fictional Systems (sample)',
        role: 'Junior Python Developer',
        source: 'manual',
        status: 'interview',
        appliedAt: daysAgo(20),
        resumeId: resume.id,
        location: 'Hybrid, Pune',
        rounds: [
          { id: 'r1', name: 'Phone screen', at: daysAgo(8).toISOString(), status: 'done', feedback: 'Sample note: asked about the spreadsheet reporting work.' },
          { id: 'r2', name: 'Technical interview', at: daysAhead(4).toISOString(), status: 'scheduled' },
        ],
      },
      { userId: uid, company: 'Demo Retail Tech (sample)', role: 'Backend Intern', source: 'manual', status: 'rejected', appliedAt: daysAgo(30), outcomeReason: 'Sample record: position filled.' },
    ])
    .returning();

  const history: Record<string, string[]> = { saved: ['saved'], applied: ['saved', 'applied'], interview: ['saved', 'applied', 'interview'], rejected: ['saved', 'applied', 'rejected'] };
  for (const a of apps) {
    const steps = history[a.status];
    for (const [i, st] of steps.entries()) {
      await db.insert(applicationEvents).values({ applicationId: a.id, kind: 'status', fromStatus: i ? steps[i - 1] : null, toStatus: st, note: i ? null : 'Added to tracker', createdAt: daysAgo(30 - i * 6) });
    }
  }

  const question = 'Tell me about a time you had to learn something new quickly.';
  const answer =
    'When I was working at the library, we moved our circulation reports to a new spreadsheet layout. My task was to keep the weekly report going during the change. I read the documentation, I rebuilt the report in the new layout and I asked a colleague to check it. As a result the weekly report kept going out, and I learned to test a new process on a small sample first.';
  await db.insert(interviewPractice).values({ userId: uid, kind: 'behavioral', question, answer, selfRating: 3, feedback: deterministicFeedback('behavioral', answer).feedback });
}
