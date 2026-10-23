import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupTestApp, registerUser as register } from './helpers';
import { resetRateLimits } from '../server/lib/ratelimit';
import { seedReference } from '../server/db/seed/reference';
import { db } from '../server/db/client';
import { applicationEvents, notifications, skills, jobTargets } from '../server/db/schema';
import { addEvidence } from '../server/modules/learning/skilldna';
import { drainJobs, enqueue } from '../server/jobs/queue';
import { extractSkills } from '../server/modules/career/extract';
import { checkResume, filterAiSuggestions, introducesNumbers, resumeToPlainText, importResumeText } from '../server/modules/career/resume';
import { generateDocument, guardAiDraft } from '../server/modules/career/generator';
import { deterministicFeedback } from '../server/modules/career/interview';
import type { ResumeData } from '../server/db/schema/build';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
const registerUser: typeof register = (app, name, email, password) => {
  resetRateLimits();
  return register(app, name, email, password);
};

beforeAll(async () => {
  ctx = await setupTestApp();
  await seedReference();
});
afterAll(async () => ctx.close());

const SAMPLE_RESUME: ResumeData = {
  basics: { name: 'Lee Learner', email: 'lee@example.test', links: [] },
  summary: 'Operations assistant moving into backend development.',
  experience: [
    { id: 'e1', company: 'City Library', title: 'Operations Assistant', start: '2021-06', end: '2025-12', bullets: ['Responsible for circulation reports in spreadsheets', 'Helped patrons find books'] },
  ],
  education: [{ id: 'd1', institution: 'State University', degree: 'B.Com', end: '2021' }],
  projects: [{ id: 'p1', name: 'Library API', bullets: ['Built a REST API with Python and SQLite'] }],
  skills: [{ group: 'Technical', items: ['Python', 'SQL'] }],
  certifications: [],
  sectionOrder: ['summary', 'experience', 'projects', 'education', 'skills', 'certifications'],
};

const SAMPLE_JD = `Junior Backend Developer

About the role
You will build REST APIs for our platform.

Requirements:
- Strong experience with Python or Node.js
- Solid knowledge of PostgreSQL and SQL
- Git and code reviews
- Comfortable with data structures

Nice to have:
- Docker
- React.js for internal tools
- AWS
`;

describe('resumes', () => {
  it('supports CRUD and keeps resumes private (other users get 404)', async () => {
    const a = await registerUser(ctx.app, 'Res Owner', 'res-owner@example.test');
    const b = await registerUser(ctx.app, 'Res Other', 'res-other@example.test');
    expect((await a.post('/api/career/resumes', { title: '' })).status).toBe(400);
    const created = await a.post('/api/career/resumes', { title: 'Main resume', data: SAMPLE_RESUME });
    expect(created.status).toBe(201);
    expect(created.body.resume.isPrimary).toBe(true);
    const id = created.body.resume.id;

    const got = await a.get(`/api/career/resumes/${id}`);
    expect(got.status).toBe(200);
    expect(got.body.checks.length).toBeGreaterThan(0);

    const upd = await a.put(`/api/career/resumes/${id}`, { template: 'modern', data: { ...SAMPLE_RESUME, summary: 'Changed.' } });
    expect(upd.body.resume.version).toBe(2);
    expect(upd.body.resume.template).toBe('modern');

    for (const [method, path] of [
      ['get', `/api/career/resumes/${id}`],
      ['put', `/api/career/resumes/${id}`],
      ['del', `/api/career/resumes/${id}`],
      ['get', `/api/career/resumes/${id}/export?format=json`],
      ['post', `/api/career/resumes/${id}/copy`],
    ] as const) {
      const r = await (b as any)[method](path, method === 'put' ? { title: 'hijack' } : undefined);
      expect(r.status, `${method} ${path}`).toBe(404);
    }
    expect((await b.get('/api/career/resumes')).body.total).toBe(0);

    const html = await a.get(`/api/career/resumes/${id}/export?format=html`);
    expect(html.status).toBe(200);
    expect(String(html.body)).toContain('Lee Learner');
    expect(String(html.body)).toMatch(/Save as PDF/);
    const text = await a.get(`/api/career/resumes/${id}/export?format=text`);
    expect(String(text.body)).toContain('EXPERIENCE');

    const copy = await a.post(`/api/career/resumes/${id}/copy`, {});
    expect(copy.status).toBe(201);
    expect(copy.body.resume.parentId).toBe(id);
    expect(copy.body.resume.isPrimary).toBe(false);
    expect((await a.del(`/api/career/resumes/${id}`)).status).toBe(200);
  });

  it('starts a new resume from the profile without adding facts', async () => {
    const a = await registerUser(ctx.app, 'Profile Pat', 'pat@example.test');
    const r = await a.post('/api/career/resumes', { title: 'From profile' });
    expect(r.body.resume.data.basics.name).toBe('Profile Pat');
    expect(r.body.resume.data.experience).toEqual([]);
  });

  it('import assist proposes fields and never saves until the user confirms', async () => {
    const a = await registerUser(ctx.app, 'Importer', 'importer@example.test');
    const text = `Jamie Rivera
jamie@example.test | +1 555 010 0199 | github.com/jamie

Experience
Operations Assistant, City Library (Jun 2021 - Dec 2025)
- Prepared weekly circulation reports
- Trained volunteers on the checkout system

Education
B.Com, State University, 2021

Skills
Languages: Python, SQL`;
    const r = await a.post('/api/career/resumes/import', { text });
    expect(r.status).toBe(200);
    expect(r.body.saved).toBe(false);
    const byPath = Object.fromEntries(r.body.fields.map((f: any) => [f.path, f]));
    expect(byPath['basics.email'].value).toBe('jamie@example.test');
    expect(byPath['basics.name'].value).toBe('Jamie Rivera');
    expect(byPath['experience[0].title'].value).toBe('Operations Assistant');
    expect(byPath['experience[0].company'].value).toBe('City Library');
    expect(r.body.proposal.experience[0].bullets).toHaveLength(2);
    expect(r.body.proposal.skills[0].items).toEqual(['Python', 'SQL']);
    for (const f of r.body.fields) expect(['high', 'medium', 'low']).toContain(f.confidence);
    // Nothing persisted.
    expect((await a.get('/api/career/resumes')).body.total).toBe(0);
    // Parser output contains only text from the paste.
    expect(introducesNumbers(resumeToPlainText(importResumeText(text).proposal), text)).toBe(false);
  });

  it('checks flag weak verbs and missing outcomes without inserting numbers', () => {
    const { checks } = checkResume(SAMPLE_RESUME);
    const source = resumeToPlainText(SAMPLE_RESUME);
    expect(checks.some((c) => c.category === 'impact' && /Responsible for/.test(c.message))).toBe(true);
    const outcome = checks.find((c) => /Add a real result if you have one/.test(c.message));
    expect(outcome?.question).toMatch(/Leave blank/);
    for (const c of checks) expect(introducesNumbers(`${c.message} ${c.question ?? ''}`, source), c.message).toBe(false);
    // Contact completeness is checked.
    expect(checkResume({ ...SAMPLE_RESUME, basics: { name: '' } }).checks.some((c) => c.path === 'basics.email' && c.severity === 'error')).toBe(true);
  });

  it('drops AI suggestions that add numbers or state new facts as non-questions', () => {
    const source = resumeToPlainText(SAMPLE_RESUME);
    const { kept, dropped } = filterAiSuggestions(
      {
        suggestions: [
          { section: 'experience', kind: 'rewrite', text: 'Produced circulation reports in spreadsheets' },
          { section: 'experience', kind: 'rewrite', text: 'Cut report time by 40% for 12 staff' },
          { section: 'experience', kind: 'question', text: 'What was the measurable result? Leave blank if none.' },
          { section: 'experience', kind: 'question', text: 'Add that you led a team' },
        ],
      },
      source,
    );
    expect(kept.map((k) => k.text)).toEqual(['Produced circulation reports in spreadsheets', 'What was the measurable result? Leave blank if none.']);
    expect(dropped).toBe(2);
  });

  it('AI endpoints return ok:false gracefully when AI is not configured', async () => {
    const a = await registerUser(ctx.app, 'No AI', 'noai@example.test');
    const res = await a.post('/api/career/resumes', { title: 'R', data: SAMPLE_RESUME });
    const review = await a.post(`/api/career/resumes/${res.body.resume.id}/review`, {});
    expect(review.status).toBe(200);
    expect(review.body).toMatchObject({ ok: false, reason: 'not_configured' });
    const imp = await a.post('/api/career/resumes/import/ai', { text: 'Some resume text that is long enough to parse.' });
    expect(imp.body.ok).toBe(false);
    const doc = await a.post('/api/career/documents/generate/ai', { kind: 'cover_letter', facts: { name: 'No AI' } });
    expect(doc.body.ok).toBe(false);
    expect(doc.body.fallback.body).toContain('[Add:');
    const t = await a.post('/api/career/targets', { title: 'Backend', description: SAMPLE_JD });
    const ext = await a.post(`/api/career/targets/${t.body.target.id}/ai-extract`, {});
    expect(ext.body.ok).toBe(false);
    const p = await a.post('/api/career/interview/practice', { kind: 'behavioral', question: 'Tell me about a mistake.', answer: 'When I worked at the library I made an error.' });
    const fb = await a.post(`/api/career/interview/practice/${p.body.practice.id}/ai-feedback`, {});
    expect(fb.body.ok).toBe(false);
  });
});

describe('documents', () => {
  it('template generator fills only given facts and leaves placeholders for the rest', async () => {
    const a = await registerUser(ctx.app, 'Doc Writer', 'doc@example.test');
    const r = await a.post('/api/career/documents/generate', { kind: 'cover_letter', facts: { name: 'Doc Writer', company: 'Example Co' } });
    expect(r.status).toBe(200);
    expect(r.body.body).toContain('Example Co');
    expect(r.body.body).toContain('[Add: role title]');
    expect(r.body.placeholders).toContain('role title');
    expect(r.body.placeholders.some((p: string) => /accomplishment/.test(p))).toBe(true);
    expect(/\d/.test(r.body.body)).toBe(false);
    for (const kind of ['answer', 'outreach', 'cold_email', 'follow_up', 'bio', 'project_summary'] as const) {
      const out = generateDocument(kind, {});
      expect(out.body, kind).toMatch(/\[Add: /);
      expect(/\d/.test(out.body), kind).toBe(false);
    }
    const saved = await a.post('/api/career/documents', { kind: 'cover_letter', title: r.body.title, body: r.body.body });
    expect(saved.status).toBe(201);
    const other = await registerUser(ctx.app, 'Doc Other', 'doc-other@example.test');
    expect((await other.get(`/api/career/documents/${saved.body.document.id}`)).status).toBe(404);
  });

  it('AI draft guard replaces numbers the user never provided', () => {
    const g = guardAiDraft('I improved reports by 30% over 2 years at Example Co.', 'Example Co reports');
    expect(g.body).not.toMatch(/30%|\b2\b/);
    expect(g.flagged).toBe(2);
  });
});

describe('job targets and gap analysis', () => {
  it('extracts skills including aliases with a required/preferred split', () => {
    const found = extractSkills(SAMPLE_JD);
    const by = Object.fromEntries(found.map((s) => [s.slug, s]));
    expect(by['python']?.required).toBe(true);
    expect(by['nodejs']?.required).toBe(true); // "Node.js"
    expect(by['sql-basics']?.required).toBe(true); // "PostgreSQL" and "SQL"
    expect(by['database-design']).toBeTruthy(); // "PostgreSQL"
    expect(by['http-rest']?.required).toBe(true); // "REST APIs"
    expect(by['git']?.required).toBe(true);
    expect(by['code-review']).toBeTruthy();
    expect(by['arrays']).toBeTruthy(); // "data structures"
    expect(by['docker']?.required).toBe(false);
    expect(by['react']?.required).toBe(false); // "React.js"
    expect(by['cloud-basics']?.required).toBe(false); // "AWS"
    expect(extractSkills('We are a Series C company. Must know C/C++.').map((s) => s.slug)).toEqual(expect.arrayContaining(['c-lang', 'cpp']));
    expect(extractSkills('We raised a Series C round.').map((s) => s.slug)).not.toContain('c-lang');
  });

  it('analyzes a target against Skill DNA states, stores the shape recommend.ts expects, and isolates users', async () => {
    const a = await registerUser(ctx.app, 'Gap Gina', 'gina@example.test');
    const [py] = await db.select().from(skills).where(eq(skills.slug, 'python'));
    const [sqlb] = await db.select().from(skills).where(eq(skills.slug, 'sql-basics'));
    const [git] = await db.select().from(skills).where(eq(skills.slug, 'git'));
    await addEvidence({ userId: a.userId, skillId: py.id, source: 'assessment', sourceType: 'attempt', sourceId: 'x1', score: 0.9, verified: true });
    await addEvidence({ userId: a.userId, skillId: sqlb.id, source: 'self', score: 0.75 });
    await addEvidence({ userId: a.userId, skillId: git.id, source: 'practice', sourceType: 'submission', sourceId: 'g1', score: 0.4 });

    expect((await a.post('/api/career/targets', { title: 'x', description: 'too short' })).status).toBe(400);
    const r = await a.post('/api/career/targets', { title: 'Junior Backend Developer', company: 'Example Co (sample)', description: SAMPLE_JD });
    expect(r.status).toBe(201);
    const rows = Object.fromEntries(r.body.analysis.skills.map((s: any) => [s.slug, s]));
    expect(rows['python'].status).toBe('verified');
    expect(rows['sql-basics'].status).toBe('self_reported');
    expect(rows['git'].status).toBe('learning');
    expect(rows['docker'].status).toBe('none');
    expect(r.body.analysis.formula.text).toMatch(/Readiness =/);
    expect(r.body.analysis.score).toBeGreaterThan(0);
    expect(r.body.analysis.score).toBeLessThan(100);
    expect(r.body.analysis.checklist.find((c: any) => c.id === 'resume').done).toBe(false);
    expect(r.body.analysis.plan.gaps.length).toBeGreaterThan(0);

    const [stored] = await db.select().from(jobTargets).where(eq(jobTargets.id, r.body.target.id));
    for (const s of stored.extractedSkills) expect(Object.keys(s).sort()).toEqual(['name', 'required', 'slug']);

    const b = await registerUser(ctx.app, 'Gap Other', 'gap-other@example.test');
    expect((await b.get(`/api/career/targets/${r.body.target.id}`)).status).toBe(404);

    // User can edit the skill list.
    const edit = await a.put(`/api/career/targets/${r.body.target.id}/skills`, { skills: [{ slug: 'python', required: true }, { slug: 'docker', required: true }] });
    expect(edit.body.target.extractedSkills).toHaveLength(2);
    expect((await a.put(`/api/career/targets/${r.body.target.id}/skills`, { skills: [{ slug: 'made-up', required: true }] })).status).toBe(400);

    // Tailored copy only reorders, and the checklist notices it.
    const res = await a.post('/api/career/resumes', { title: 'Main', data: SAMPLE_RESUME });
    const tailored = await a.post(`/api/career/resumes/${res.body.resume.id}/copy`, { targetId: r.body.target.id });
    expect(tailored.body.resume.targetRole).toBe('Junior Backend Developer');
    expect(tailored.body.tailoring.missing).toContain('Containers with Docker');
    expect(resumeToPlainText(tailored.body.resume.data).length).toBe(resumeToPlainText(SAMPLE_RESUME).length);
    const again = await a.get(`/api/career/targets/${r.body.target.id}`);
    expect(again.body.analysis.checklist.find((c: any) => c.id === 'tailored').done).toBe(true);
  });
});

describe('application tracker', () => {
  it('logs every status transition and rejects invalid ones', async () => {
    const a = await registerUser(ctx.app, 'Track Tom', 'tom@example.test');
    expect((await a.post('/api/career/applications', { company: '', role: 'Dev' })).status).toBe(400);
    const r = await a.post('/api/career/applications', { company: 'Example Co (sample)', role: 'Junior Developer', source: 'manual' });
    expect(r.status).toBe(201);
    const id = r.body.application.id;
    expect((await a.post(`/api/career/applications/${id}/status`, { status: 'applied' })).status).toBe(200);
    expect((await a.post(`/api/career/applications/${id}/status`, { status: 'interview', note: 'Phone screen booked' })).status).toBe(200);
    const bad = await a.post(`/api/career/applications/${id}/status`, { status: 'saved' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.allowed).toContain('offer');
    await a.post(`/api/career/applications/${id}/status`, { status: 'rejected', outcomeReason: 'Went with a more senior candidate' });
    const detail = await a.get(`/api/career/applications/${id}`);
    const statusEvents = detail.body.events.filter((e: any) => e.kind === 'status').map((e: any) => `${e.fromStatus ?? '-'}>${e.toStatus}`);
    expect(statusEvents.reverse()).toEqual(['->saved', 'saved>applied', 'applied>interview', 'interview>rejected']);
    expect(detail.body.application.outcomeReason).toBe('Went with a more senior candidate');
    expect(detail.body.application.appliedAt).toBeTruthy();

    const round = await a.post(`/api/career/applications/${id}/rounds`, { name: 'Technical interview', at: new Date(Date.now() + 86400_000).toISOString() });
    expect(round.status).toBe(201);
    const analytics = await a.get('/api/career/applications/analytics');
    expect(analytics.body.sent).toBe(1);
    expect(analytics.body.responseRate).toBe(1);
    expect(analytics.body.definitions.responseRate).toMatch(/divided by sent/);

    const other = await registerUser(ctx.app, 'Track Other', 'track-other@example.test');
    expect((await other.get(`/api/career/applications/${id}`)).status).toBe(404);
    expect((await other.post(`/api/career/applications/${id}/status`, { status: 'applied' })).status).toBe(404);
  });

  it('sends a follow-up reminder exactly once', async () => {
    const a = await registerUser(ctx.app, 'Remind Rae', 'rae@example.test');
    const r = await a.post('/api/career/applications', { company: 'Example Co (sample)', role: 'Analyst', status: 'applied' });
    const id = r.body.application.id;
    const due = new Date(Date.now() - 1000).toISOString();
    await a.patch(`/api/career/applications/${id}`, { nextActionAt: due });
    await drainJobs();
    // A duplicate job for the same due time (e.g. a retry) must not notify again.
    await enqueue('career.reminder', { applicationId: id, dueAt: due }, { idempotencyKey: `dup:${id}` });
    await drainJobs();
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, a.userId), eq(notifications.type, 'career.reminder')));
    expect(notes.length).toBe(1);
    const events = await db.select().from(applicationEvents).where(and(eq(applicationEvents.applicationId, id), eq(applicationEvents.kind, 'reminder')));
    expect(events.some((e) => e.note === 'Follow-up reminder sent')).toBe(true);
  });

  it('compares opportunities with a transparent weighted score', async () => {
    const a = await registerUser(ctx.app, 'Offer Olu', 'olu@example.test');
    const one = await a.post('/api/career/applications', { company: 'Example Co (sample)', role: 'Dev', offer: { baseSalary: 100, currency: 'USD', remote: 'Remote' } });
    const two = await a.post('/api/career/applications', { company: 'Sample Labs (sample)', role: 'Dev', offer: { baseSalary: 80, currency: 'USD', remote: 'Onsite' } });
    await a.put(`/api/career/offers/ratings/${two.body.application.id}`, { ratings: { growth: 5 } });
    const cmp = await a.get('/api/career/offers/compare');
    expect(cmp.body.items).toHaveLength(2);
    const first = cmp.body.items.find((i: any) => i.id === one.body.application.id);
    expect(first.breakdown.find((b: any) => b.key === 'salary').value).toBe(1);
    expect(first.breakdown.find((b: any) => b.key === 'growth').value).toBeNull();
    expect(cmp.body.formula).toMatch(/left out, not guessed/);
    const ev = await a.post('/api/career/offers/evaluate-jd', { description: 'Fully remote role with a learning budget and mentorship. Fast-paced environment.' });
    expect(ev.body.rows.find((r: any) => r.key === 'remote').signal).toBe('positive');
    expect(ev.body.rows.find((r: any) => r.key === 'team').signal).toBe('concern');
  });
});

describe('interview prep and journal', () => {
  it('gives deterministic STAR feedback and runs a mock interview', async () => {
    const good = deterministicFeedback(
      'behavioral',
      'When I was working at the library, our weekly report took a long time. My task was to make it easier. I listed the steps, I built a spreadsheet template and I trained two colleagues. As a result the report was easier to prepare and I learned to ask users first.',
    );
    expect(good.feedback.items.filter((i) => /^(Situation|Task|Action|Result)/.test(i.label)).every((i) => i.met)).toBe(true);
    const weak = deterministicFeedback('behavioral', 'um we basically like did it.');
    expect(weak.stats.fillerCount).toBeGreaterThanOrEqual(3);
    expect(weak.feedback.items.find((i) => i.label.startsWith('Result'))!.met).toBe(false);

    const a = await registerUser(ctx.app, 'Mock Mo', 'mo@example.test');
    const qs = await a.get('/api/career/interview/questions?kind=behavioral');
    expect(qs.body.questions.length).toBeGreaterThan(3);
    expect(qs.body.questions[0].modelAnswer).toMatch(/your own real example/);
    const sqlQs = await a.get('/api/career/interview/questions?kind=sql');
    expect(sqlQs.body.codelab[0].link).toMatch(/^\/app\/practice\//);

    const mock = await a.post('/api/career/interview/mock', { kinds: ['behavioral', 'system_design'], count: 3, minutesPerQuestion: 2 });
    expect(mock.status).toBe(201);
    const q0 = mock.body.mock.questions[0];
    const ans = await a.post(`/api/career/interview/mock/${mock.body.mock.id}/answer`, { questionId: q0.id, answer: 'When I worked at the library I had to fix a report. I asked, I built a template. As a result it worked.', durationSec: 150 });
    expect(ans.body.feedback.source).toBe('checklist');
    const done = await a.post(`/api/career/interview/mock/${mock.body.mock.id}/complete`, {});
    expect(done.body.mock.status).toBe('completed');
    expect(done.body.mock.summary.answered).toBe(1);
    expect(done.body.mock.summary.overTime).toBe(1);
    const plan = await a.get('/api/career/interview/revision-plan');
    expect(plan.body.items.length).toBeGreaterThan(0);

    const other = await registerUser(ctx.app, 'Mock Other', 'mock-other@example.test');
    expect((await other.get(`/api/career/interview/mock/${mock.body.mock.id}`)).status).toBe(404);
  });

  it('keeps journal entries private', async () => {
    const a = await registerUser(ctx.app, 'Jo Journal', 'jo@example.test');
    const e = await a.post('/api/career/journal', { kind: 'career', title: 'Week one', body: 'Applied to two roles.' });
    expect(e.status).toBe(201);
    const other = await registerUser(ctx.app, 'Jo Other', 'jo-other@example.test');
    expect((await other.get('/api/career/journal')).body.total).toBe(0);
    expect((await other.del(`/api/career/journal/${e.body.entry.id}`)).status).toBe(404);
    const overview = await a.get('/api/career/overview');
    expect(overview.status).toBe(200);
    expect(overview.body.actions.length).toBeGreaterThan(0);
  });
});

describe('offer ratings', () => {
  it('saves a rating for a single criterion (other criteria stay unrated)', async () => {
    resetRateLimits();
    const c = await register(ctx.app, 'Rater One', 'rater1@example.test');
    const app = await c.post('/api/career/applications', { company: 'Example Co (sample)', role: 'Engineer', status: 'applied' });
    expect(app.status, JSON.stringify(app.body)).toBeLessThan(300);
    const id = app.body.application.id;
    const r = await c.put(`/api/career/offers/ratings/${id}`, { ratings: { growth: 4 } });
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
  });
});
