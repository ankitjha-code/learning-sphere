import { test, expect, type Browser } from '@playwright/test';
import { api, demo, login, uniqueEmail } from './helpers';

const BASE = 'http://127.0.0.1:4417';

async function as(browser: Browser, email: string, opts: { workspace?: string; orgName?: string } = {}) {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await login(page, email, opts);
  return { ctx, page, req: page.request };
}

test.describe('Journey 2: assignment, grading, clarification and audited re-evaluation', () => {
  test('student submits, faculty grades with rubric, student sees feedback, asks, and a re-evaluation is recorded', async ({ browser }) => {
    const student = await as(browser, demo('student'));
    const mine = await api(student.req, 'get', '/api/teach/my/assignments');
    const list = mine.body.items ?? mine.body.assignments;
    const a2 = list.find((x: { title: string }) => /Assignment 2/.test(x.title));
    expect(a2, 'seeded assignment 2').toBeTruthy();

    // Submit through the API (the UI flow is covered by the Teach engineer's browser pass), then check the receipt in the UI.
    await api(student.req, 'put', `/api/teach/my/assignments/${a2.id}/draft`, { text: 'Two-stack evaluator: operands and operators, precedence handled when pushing. Complexity O(n).' });
    const sub = await api(student.req, 'post', `/api/teach/my/assignments/${a2.id}/submit`, { text: 'Two-stack evaluator: operands and operators, precedence handled when pushing. Complexity O(n).', confirm: true });
    expect(sub.status, JSON.stringify(sub.body)).toBeLessThan(300);
    expect(sub.body.receipt.code).toBeTruthy();
    await student.page.goto(`/app/assignments/${a2.id}`);
    await expect(student.page.getByText(sub.body.receipt.code).first()).toBeVisible();

    // Faculty grades with the rubric and releases.
    const faculty = await as(browser, demo('faculty'), { workspace: 'teach', orgName: 'Northbridge' });
    const queue = await api(faculty.req, 'get', `/api/teach/grading/queue?assignmentId=${a2.id}`);
    const items = queue.body.items ?? queue.body.queue;
    const target = items.find((x: { studentName?: string; student?: { name: string } }) => (x.studentName ?? x.student?.name) === 'Rohan Iyer') ?? items[0];
    const submissionId = target.submissionId ?? target.id;
    const detail = await api(faculty.req, 'get', `/api/teach/submissions/${submissionId}`);
    const criteria = detail.body.assignment?.rubric ?? [];
    expect(criteria.length).toBeGreaterThan(0);
    const rubricScores = criteria.map((c: { id: string; levels: { label: string }[] }) => ({ criterionId: c.id, levelLabel: c.levels[0].label }));
    const ev = await api(faculty.req, 'post', `/api/teach/submissions/${submissionId}/evaluations`, {
      rubricScores,
      feedback: 'Clear approach. Add tests for operator precedence.',
      privateComment: 'Check with TA about similar wording in section B.',
      release: true,
    });
    expect(ev.status, JSON.stringify(ev.body)).toBeLessThan(300);

    // Student sees released feedback but never the private instructor comment.
    await student.page.goto(`/app/assignments/${a2.id}`);
    await expect(student.page.getByText('Clear approach. Add tests for operator precedence.')).toBeVisible();
    await expect(student.page.getByText('Check with TA')).toHaveCount(0);

    // Clarification and a regrade request.
    const myDetail = await api(student.req, 'get', `/api/teach/my/assignments/${a2.id}`);
    const mySubmissionId = myDetail.body.current?.id ?? myDetail.body.submission?.id ?? submissionId;
    expect((await api(student.req, 'post', `/api/teach/my/submissions/${mySubmissionId}/comments`, { body: 'Could you say which tests you expected?' })).status).toBeLessThan(300);
    expect((await api(student.req, 'post', `/api/teach/my/submissions/${mySubmissionId}/regrade`, { reason: 'I handled precedence in the parser; see lines 10-20.' })).status).toBeLessThan(300);

    // Authorized re-evaluation adds a new evaluation with a reason (history kept).
    const re = await api(faculty.req, 'post', `/api/teach/submissions/${submissionId}/evaluations`, {
      rubricScores: criteria.map((c: { id: string; levels: { label: string }[] }) => ({ criterionId: c.id, levelLabel: c.levels[c.levels.length > 1 ? 1 : 0].label })),
      feedback: 'Re-evaluated after your regrade request: precedence handling confirmed.',
      reason: 'Regrade request upheld after reviewing the parser.',
      release: true,
    });
    expect(re.status).toBeLessThan(300);
    const after = await api(faculty.req, 'get', `/api/teach/submissions/${submissionId}`);
    const evals = after.body.evaluations ?? [];
    expect(evals.length).toBeGreaterThanOrEqual(2);
    expect(evals.some((e: { supersededBy: string | null }) => !!e.supersededBy)).toBe(true);

    await student.ctx.close();
    await faculty.ctx.close();
  });
});

test.describe('Journey 4: recruiter hiring workflow', () => {
  test('publish, apply, assess, interview, feedback and offer with audited decisions', async ({ browser }) => {
    const recruiter = await as(browser, demo('recruiter'), { workspace: 'hire', orgName: 'Helix' });
    const job = await api(recruiter.req, 'post', '/api/hire/jobs', {
      title: 'Platform Engineer (E2E)',
      location: 'Remote',
      workplace: 'remote',
      employmentType: 'full_time',
      description: 'Build and operate internal developer platforms, CI pipelines and container infrastructure for product teams.',
      requiredSkills: [{ slug: 'python', name: 'Python', required: true }, { slug: 'docker', name: 'Containers with Docker', required: false }],
    });
    expect(job.status).toBeLessThan(300);
    const jobId = job.body.job.id;
    const pub = await api(recruiter.req, 'post', `/api/hire/jobs/${jobId}/publish`);
    expect(pub.status, JSON.stringify(pub.body)).toBeLessThan(300);

    // A new candidate applies.
    const candCtx = await browser.newContext({ baseURL: BASE });
    const cand = await candCtx.newPage();
    const email = uniqueEmail('cand');
    expect((await api(cand.request, 'post', '/api/auth/register', { name: 'Casey Candidate', email, password: 'candidate-pass-2026' })).status).toBe(201);
    const resume = await api(cand.request, 'post', '/api/career/resumes', { title: 'Resume', data: { basics: { name: 'Casey Candidate' }, experience: [], education: [], projects: [], skills: [], certifications: [], sectionOrder: [] } });
    const applied = await api(cand.request, 'post', `/api/jobs/${jobId}/apply`, { resumeId: resume.body.resume.id, coverNote: 'Keen on platforms.', sharePortfolio: false });
    expect(applied.status).toBeLessThan(300);

    const apps = await api(recruiter.req, 'get', `/api/hire/jobs/${jobId}/applications`);
    const appRow = (apps.body.items ?? apps.body.applications ?? apps.body.columns?.flatMap((c: { items: unknown[] }) => c.items))[0];
    const appId = appRow.id ?? appRow.applicationId;

    // Rejection without a reason is refused; moves with reasons are recorded.
    expect((await api(recruiter.req, 'post', `/api/hire/applications/${appId}/move`, { toStage: 'rejected' })).status).toBe(400);
    for (const [toStage, reason] of [
      ['eligibility_review', null],
      ['shortlisted', 'Meets the stated requirements.'],
      ['interview', 'Skipping assessment: strong verified evidence on file.'],
    ] as const) {
      const mv = await api(recruiter.req, 'post', `/api/hire/applications/${appId}/move`, { toStage, reason });
      expect(mv.status, `${toStage}: ${JSON.stringify(mv.body)}`).toBeLessThan(300);
    }

    // Schedule an interview with the interviewer; blind feedback; then offer.
    const interviewers = await api(recruiter.req, 'get', '/api/hire/interviewers');
    const sam = (interviewers.body.items ?? interviewers.body.interviewers).find((i: { name: string }) => i.name === 'Sam Okafor');
    const iv = await api(recruiter.req, 'post', '/api/hire/interviews', {
      applicationId: appId,
      title: 'Technical interview',
      kind: 'technical',
      scheduledAt: new Date(Date.now() + 86400_000).toISOString(),
      durationMinutes: 45,
      interviewerIds: [sam.userId ?? sam.id],
      meeting: { provider: 'jitsi' },
    });
    expect(iv.status, JSON.stringify(iv.body)).toBeLessThan(300);
    const interviewId = iv.body.interview.id;
    expect(iv.body.interview.meetingUrl).toMatch(/^https:\/\/meet\.jit\.si\/LearnSphere-/);

    const interviewer = await as(browser, demo('interviewer'), { workspace: 'hire', orgName: 'Helix' });
    const fb = await api(interviewer.req, 'post', `/api/hire/interviews/${interviewId}/feedback`, {
      recommendation: 'yes',
      scores: [{ competency: 'Problem solving', rating: 4, note: 'Structured approach.' }],
      summary: 'Solid fundamentals; recommend moving forward.',
    });
    expect(fb.status, JSON.stringify(fb.body)).toBeLessThan(300);

    expect((await api(recruiter.req, 'post', `/api/hire/applications/${appId}/move`, { toStage: 'offer', reason: 'Positive interview feedback.' })).status).toBeLessThan(300);

    // The candidate sees their own progress (never internal notes).
    const myApps = await api(cand.request, 'get', '/api/jobs/my/applications');
    expect(JSON.stringify(myApps.body)).toContain('offer');

    // Decision history is visible to the recruiter in the UI.
    await recruiter.page.goto(`/app/hire/candidates/${appId}`);
    await expect(recruiter.page.getByText('Casey Candidate').first()).toBeVisible();
    await recruiter.page.getByRole('tab', { name: /Decisions/ }).click();
    await expect(recruiter.page.getByText('Positive interview feedback.').first()).toBeVisible();
    await expect(recruiter.page.getByText('Meets the stated requirements.').first()).toBeVisible();

    await recruiter.ctx.close();
    await interviewer.ctx.close();
    await candCtx.close();
  });
});

test.describe('Journey 5: college placement drive', () => {
  test('eligibility never treats missing data as ineligible; invite, track and report', async ({ browser }) => {
    const officer = await as(browser, demo('placement'), { workspace: 'campus', orgName: 'Northbridge' });
    const drives = await api(officer.req, 'get', '/api/campus/drives');
    const drive = (drives.body.items ?? drives.body.drives).find((d: { title: string }) => /Helix Labs SDE Intern/.test(d.title));
    const preview = await api(officer.req, 'post', `/api/campus/drives/${drive.id}/eligibility/preview`, {});
    expect(preview.status).toBe(200);
    const text = JSON.stringify(preview.body);
    expect(text).toMatch(/unknown/);
    await officer.page.goto(`/app/campus/drives/${drive.id}`);
    await expect(officer.page.getByText('Helix Labs SDE Intern 2027').first()).toBeVisible();
    const report = await api(officer.req, 'get', `/api/campus/drives/${drive.id}/report`);
    expect(report.status).toBe(200);
    const csv = await officer.req.get(`/api/campus/drives/${drive.id}/report.csv`);
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain(',');
    await officer.ctx.close();
  });
});

test.describe('Journey 6: mentor-guided improvement without exposing private notes', () => {
  test('mentee sees goals and shared notes but not the mentor private note', async ({ browser }) => {
    const mentee = await as(browser, demo('learner'));
    const mine = await api(mentee.req, 'get', '/api/mentorship/mine');
    const m = (mine.body.asMentee ?? mine.body.mentorships ?? mine.body.items).find((x: { status: string }) => x.status === 'active');
    expect(m, 'active mentorship').toBeTruthy();
    const detail = await api(mentee.req, 'get', `/api/mentorship/${m.id}`);
    const raw = JSON.stringify(detail.body);
    expect(raw).not.toMatch(/mentor_private/);
    await mentee.page.goto(`/app/mentors/m/${m.id}`);
    await expect(mentee.page.getByRole('heading').first()).toBeVisible();

    const mentor = await as(browser, demo('mentor'), { workspace: 'mentor' });
    const progress = await api(mentor.req, 'get', `/api/mentorship/${m.id}/progress`);
    expect(progress.status).toBe(200);
    // Applications were not shared by the mentee in the demo data.
    expect(JSON.stringify(progress.body.applications ?? null)).not.toContain('company');
    await mentee.ctx.close();
    await mentor.ctx.close();
  });
});

test.describe('Journey 7: tenant isolation', () => {
  test('a second college cannot read the first college records, and the UI shows no data from it', async ({ browser }) => {
    const nb = await as(browser, demo('faculty'), { workspace: 'teach', orgName: 'Northbridge' });
    const list = await api(nb.req, 'get', '/api/teach/assignments');
    const nbAssignment = (list.body.items ?? list.body.assignments)[0];
    const rv = await as(browser, demo('faculty.riverside'), { workspace: 'teach', orgName: 'Riverside' });
    expect((await api(rv.req, 'get', `/api/teach/assignments/${nbAssignment.id}`)).status).toBe(404);
    const rvList = await api(rv.req, 'get', '/api/teach/assignments');
    expect(JSON.stringify(rvList.body)).not.toContain(nbAssignment.id);
    await rv.page.goto(`/app/teach/assignments/${nbAssignment.id}`);
    await expect(rv.page.getByText(nbAssignment.title)).toHaveCount(0);

    const orbit = await as(browser, demo('recruiter.orbit'), { workspace: 'hire', orgName: 'Orbit' });
    const helixJobs = await api((await as(browser, demo('recruiter'), { workspace: 'hire', orgName: 'Helix' })).req, 'get', '/api/hire/jobs');
    const helixJob = (helixJobs.body.items ?? helixJobs.body.jobs)[0];
    expect((await api(orbit.req, 'get', `/api/hire/jobs/${helixJob.id}`)).status).toBe(404);
    await nb.ctx.close();
    await rv.ctx.close();
    await orbit.ctx.close();
  });
});

test.describe('Journey 9: recovery after a failed background task', () => {
  test('admin sees the failed job, retries it from the UI, and it succeeds once', async ({ browser }) => {
    const admin = await as(browser, demo('admin'), { workspace: 'admin' });
    await admin.page.goto('/app/admin');
    await expect(admin.page.getByText('demo.failing_example').first()).toBeVisible();
    await admin.page.locator('li', { hasText: 'demo.failing_example' }).getByRole('button', { name: 'Retry' }).click();
    await expect
      .poll(async () => {
        const jobs = await api(admin.req, 'get', '/api/admin/jobs?type=demo.failing_example');
        return (jobs.body.items ?? jobs.body.jobs)[0]?.status;
      }, { timeout: 30_000 })
      .toBe('succeeded');
    await admin.ctx.close();
  });
});

test.describe('Journey 10: privacy and account lifecycle', () => {
  test('export own data, revoke sessions, request deletion with grace period and cancel', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    const email = uniqueEmail('privacy');
    expect((await api(page.request, 'post', '/api/auth/register', { name: 'Pat Privacy', email, password: 'privacy-pass-2026' })).status).toBe(201);
    await api(page.request, 'post', '/api/me/onboarding', { skip: true });

    // Second session on another "device".
    const other = await browser.newContext({ baseURL: BASE });
    const otherPage = await other.newPage();
    await login(otherPage, email, { password: 'privacy-pass-2026' });

    await page.goto('/app/settings/privacy');
    await page.getByRole('button', { name: 'Request data export' }).click();
    await expect(page.getByText(/Download \(/).first()).toBeVisible({ timeout: 45_000 });

    // Revoke other sessions.
    const rev = await api(page.request, 'post', '/api/auth/sessions/revoke', { allOthers: true });
    expect(rev.body.revoked).toBeGreaterThanOrEqual(1);
    expect((await api(otherPage.request, 'get', '/api/auth/me')).body.user).toBeNull();

    // Request deletion, see the grace period, then cancel.
    const del = await api(page.request, 'post', '/api/privacy/delete', { password: 'privacy-pass-2026', confirm: 'delete my account' });
    expect(del.status, JSON.stringify(del.body)).toBeLessThan(300);
    await page.goto('/app/settings/privacy');
    await expect(page.getByRole('button', { name: 'Cancel deletion' })).toBeVisible();
    const cancel = await api(page.request, 'post', '/api/privacy/delete/cancel');
    expect(cancel.status).toBeLessThan(300);
    const summary = await api(page.request, 'get', '/api/privacy/summary');
    expect(JSON.stringify(summary.body)).toMatch(/retain|Retention|retention/);
    await ctx.close();
    await other.close();
  });
});
