import type { Browser, Page } from '@playwright/test';
import { scenario, expect, login, person, api, uniqueEmail, demo, BASE } from './recorder';

// ---------- Shared helpers (setup only; every visible action happens in rec.step) ----------

const CAMPUS = { workspace: 'campus', orgName: 'Northbridge' };
const HIRE = { workspace: 'hire', orgName: 'Helix' };
const ADMIN = { workspace: 'admin' };

/** "YYYY-MM-DDTHH:mm" in the browser's local time, for datetime-local inputs. */
function localInput(daysAhead: number, hour: number, minute = 0) {
  const d = new Date(Date.now() + daysAhead * 86400_000);
  d.setHours(hour, minute, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function helixJobId(page: Page, title: string) {
  const jobs = await api(page.request, 'get', '/api/hire/jobs');
  const job = (jobs.body.items as { id: string; title: string }[]).find((j) => j.title === title);
  expect(job, `Helix job "${title}"`).toBeTruthy();
  return job!.id;
}

async function heliveDriveId(page: Page) {
  const drives = await api(page.request, 'get', '/api/campus/drives');
  const drive = ((drives.body.items ?? drives.body.drives) as { id: string; title: string }[]).find((d) => /Helix Labs SDE Intern 2027/.test(d.title));
  expect(drive, 'seeded Helix drive').toBeTruthy();
  return drive!.id;
}

/** Registers a brand-new person, skips onboarding and (optionally) self-rates skills. */
async function newUser(browser: Browser, name: string, opts: { selfRate?: { slug: string; level: number }[] } = {}) {
  const { ctx, page } = await person(browser, null);
  const email = uniqueEmail(name.split(' ')[0].toLowerCase());
  const password = 'walkthrough-pass-2026';
  const reg = await api(page.request, 'post', '/api/auth/register', { name, email, password });
  expect(reg.status, JSON.stringify(reg.body)).toBe(201);
  await api(page.request, 'post', '/api/me/onboarding', { skip: true });
  for (const s of opts.selfRate ?? []) expect((await api(page.request, 'post', '/api/learning/skills/self-rate', s)).status).toBeLessThan(300);
  return { ctx, page, email, password, name };
}

/** A new candidate applies to a Helix job with a simple resume. Returns the application id. */
async function applyAs(cand: { page: Page; name: string }, jobId: string, coverNote = 'I enjoy building reliable backend services and would love to grow on a platform team.') {
  const resume = await api(cand.page.request, 'post', '/api/career/resumes', {
    title: 'Resume',
    data: { basics: { name: cand.name }, experience: [], education: [], projects: [], skills: [], certifications: [], sectionOrder: [] },
  });
  expect(resume.status, JSON.stringify(resume.body)).toBeLessThan(300);
  const applied = await api(cand.page.request, 'post', `/api/jobs/${jobId}/apply`, { resumeId: resume.body.resume.id, coverNote, sharePortfolio: false });
  expect(applied.status, JSON.stringify(applied.body)).toBeLessThan(300);
  return (applied.body.application?.jobApplicationId ?? applied.body.jobApplicationId ?? applied.body.application?.id) as string | undefined;
}

async function findApplication(recruiter: Page, jobId: string, candidateName: string) {
  const apps = await api(recruiter.request, 'get', `/api/hire/jobs/${jobId}/applications`);
  const row = (apps.body.items as { id: string; candidate: { name: string } }[]).find((a) => a.candidate.name === candidateName);
  expect(row, `application from ${candidateName}`).toBeTruthy();
  return row!.id;
}

async function moveTo(recruiter: Page, appId: string, path: [string, string | null][]) {
  for (const [toStage, reason] of path) {
    const mv = await api(recruiter.request, 'post', `/api/hire/applications/${appId}/move`, { toStage, reason });
    expect(mv.status, `${toStage}: ${JSON.stringify(mv.body)}`).toBeLessThan(300);
  }
}

const TO_INTERVIEW: [string, string | null][] = [
  ['eligibility_review', null],
  ['shortlisted', 'Meets the stated requirements for the role.'],
  ['interview', 'Skipping the screen: the resume and practice evidence cover the core skills.'],
];

// =====================================================================================
// Campus placements
// =====================================================================================

scenario(
  {
    id: 'campus-01-overview-and-records',
    area: 'Campus placements',
    title: 'Campus overview, student records with data gaps, and verifying a record',
    summary:
      'The placement officer sees active drives and records that need attention, filters student records to find missing data and unverified records, and verifies one record after checking it. Missing values are shown as "Needs data", never as zero.',
    roles: ['Placement officer'],
  },
  async (rec, { page }) => {
    await login(page, demo('placement'), CAMPUS);
    await rec.step(
      'Campus overview',
      'Farah, the placement officer at Northbridge, opens the Campus workspace. Four tiles summarise what needs attention: active drives, records to verify, records with data gaps and open correction requests. Below are the active drives with their funnels, upcoming interviews and a skills readiness snapshot.',
      () => page.goto(`${BASE}/app/campus`),
      { fullPage: true },
    );
    await rec.check('The overview shows the "Records with data gaps" and "Records to verify" tiles', async () => {
      await expect(page.getByText('Records with data gaps')).toBeVisible();
      await expect(page.getByText('Records to verify')).toBeVisible();
    });
    await rec.step(
      'Records with data gaps',
      'Clicking the "Records with data gaps" tile opens the student list filtered to incomplete records. Ananya Gupta has no CGPA on file, so her CGPA shows "Needs data" and a "1 gap" badge. This never counts against her in eligibility checks.',
      async () => {
        await page.getByText('Records with data gaps').click();
        await expect(page).toHaveURL(/gaps=yes/);
        await expect(page.getByRole('link', { name: 'Ananya Gupta' })).toBeVisible();
      },
    );
    await rec.check('A missing CGPA is shown as "Needs data", not as a number', async () => {
      const row = page.locator('tr', { has: page.getByRole('link', { name: 'Ananya Gupta' }) });
      await expect(row.getByText('Needs data')).toBeVisible();
    });
    await rec.step(
      'Records that are not yet verified',
      'Switching the filters to "Not verified" lists the records the office still has to check against official academic records. Sara Thomas has complete data but nobody has verified it yet.',
      async () => {
        await page.goto(`${BASE}/app/campus/students?verified=no`);
        await expect(page.getByRole('link', { name: 'Sara Thomas' })).toBeVisible();
      },
    );
    await rec.step(
      "Open Sara's record",
      'The record page shows the academic values, the Skill DNA evidence that drives use, the drives Sara is part of and any correction requests. The "Not verified" badge sits next to her name.',
      async () => {
        await page.getByRole('link', { name: 'Sara Thomas' }).click();
        await expect(page.getByRole('heading', { name: 'Sara Thomas' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Verify record' })).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Confirm the verification',
      'Before verifying, a dialog reminds the officer to check the values against official records. Verification is written to the audit log with her name.',
      () => page.getByRole('button', { name: 'Verify record' }).click(),
    );
    await rec.step(
      'Record verified',
      'After confirming, the badge changes to "Verified" with today\'s date and the "Verify record" button disappears.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Verify', exact: true }).click();
        await expect(page.getByText(/^Verified /).first()).toBeVisible();
      },
    );
    await rec.check("Sara's record is now verified", async () => {
      await expect(page.getByRole('button', { name: 'Verify record' })).toHaveCount(0);
      await expect(page.getByText(/^Verified /).first()).toBeVisible();
    });
  },
);

scenario(
  {
    id: 'campus-02-correction-request',
    area: 'Campus placements',
    title: 'A student requests a record correction and the officer approves it',
    summary:
      'Students cannot edit their academic record themselves. Rohan spots a wrong attendance figure and sends a correction request with evidence; the placement officer reviews and approves it, and Rohan sees the updated value.',
    roles: ['Student', 'Placement officer'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('student'));
    await rec.step(
      'Rohan opens his academic record',
      'From Placements, Rohan opens "My academic record". It shows the values his college uses for placement eligibility. Each line has a "Correct" button; nothing can be changed directly by the student.',
      async () => {
        await page.goto(`${BASE}/app/placements/record`);
        await expect(page.getByRole('heading', { name: 'My academic record' })).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Fill in a correction request',
      'Rohan clicks "Correct" next to Attendance, enters the right value (91) and explains where it can be checked. The request cannot be sent without a reason of at least 10 characters.',
      async () => {
        await page.getByRole('button', { name: 'Request a correction to Attendance' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Correct value', { exact: true }).fill('91');
        await dialog.getByLabel('Why, and where can it be checked?').fill('The attendance register for semester 5 signed by the class advisor shows 91%.');
      },
    );
    await rec.step(
      'Request sent',
      'After "Send request", the request appears under "Correction requests" as pending. The record itself is unchanged until the placement office approves.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Send request' }).click();
        await expect(page.getByText(/waiting for review/)).toBeVisible();
      },
      { fullPage: true },
    );

    const officer = await person(browser, demo('placement'), CAMPUS);
    try {
      await rec.step(
        'The officer sees the request',
        'Farah opens Student records, then "Correction requests". Each request shows the current value, the proposed value, the student\'s reason and when it was sent.',
        async () => {
          await officer.page.goto(`${BASE}/app/campus/students?tab=corrections`);
          await expect(officer.page.locator('li', { hasText: 'Rohan Iyer' }).filter({ hasText: 'Attendance' }).first()).toBeVisible();
        },
        { page: officer.page, fullPage: true },
      );
      await rec.step(
        'Approve the correction',
        'Clicking "Approve" opens a dialog. The officer can apply the proposed value as is or type a different one, and add a note for the student. The change is recorded in the audit log.',
        async () => {
          await officer.page.locator('li', { hasText: 'Rohan Iyer' }).filter({ hasText: 'Attendance' }).first().getByRole('button', { name: 'Approve' }).click();
          await officer.page.getByRole('dialog').getByLabel('Note to the student').fill('Checked against the semester 5 register. Thanks for flagging it.');
        },
        { page: officer.page },
      );
      await rec.step(
        'Correction applied',
        'After "Apply correction", the record is updated right away, the request leaves the open queue and Rohan gets a notification.',
        async () => {
          await officer.page.getByRole('dialog').getByRole('button', { name: 'Apply correction' }).click();
          await expect(officer.page.getByText('Correction applied and the student was notified')).toBeVisible();
        },
        { page: officer.page },
      );
      await rec.step(
        'Rohan sees the updated record',
        'Back on his record page, Attendance now shows 91% and his request is marked approved, with the placement office\'s note.',
        async () => {
          await page.reload();
          await expect(page.getByText('Placement office: Checked against the semester 5 register.').first()).toBeVisible();
        },
        { fullPage: true },
      );
      await rec.check('The approved value is now on the student record', async () => {
        const r = await api(page.request, 'get', '/api/campus/me/record');
        expect(Math.round(r.body.records[0].attendancePercent)).toBe(91);
      });
    } finally {
      await officer.ctx.close();
    }
  },
);

scenario(
  {
    id: 'campus-03-drive-eligibility-and-invite',
    area: 'Campus placements',
    title: 'Placement drive: eligibility rules, live preview and inviting students',
    summary:
      'The officer opens the Helix Labs internship drive, reviews its eligibility rules and the live three-column preview (eligible, not eligible, needs data) with a reason for every student, invites the eligible students, and a student registers from their Placements page.',
    roles: ['Placement officer', 'Student'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('placement'), CAMPUS);
    const driveId = await heliveDriveId(page);
    await rec.step(
      'Open the drive',
      'The "Helix Labs SDE Intern 2027" drive is open for registration. Tabs cover the details, eligibility, candidates, the screening assessment, interviews, outcomes and the report.',
      async () => {
        await page.goto(`${BASE}/app/campus/drives/${driveId}`);
        await expect(page.getByRole('heading', { name: 'Helix Labs SDE Intern 2027' })).toBeVisible();
      },
    );
    await rec.step(
      'Eligibility rules and live preview',
      'On the Eligibility tab, the rules (program, graduation year 2027, minimum CGPA 7, no active backlogs, Arrays and Python skills) are on the left. On the right, every student lands in one of three columns: Eligible, Not eligible, or Needs data.',
      async () => {
        await page.getByRole('tab', { name: 'Eligibility' }).click();
        await expect(page.getByText('Meet every rule with known data.')).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('The preview has three columns: Eligible, Not eligible and Needs data', async () => {
      await expect(page.getByText('Meet every rule with known data.')).toBeVisible();
      await expect(page.getByText('Known data fails at least one rule. Reasons shown.')).toBeVisible();
      await expect(page.getByText(/A rule could not be checked\. This is not a judgement/)).toBeVisible();
    });
    await rec.step(
      'Why someone is not eligible',
      'Dev Malhotra is in "Not eligible" because his record shows 2 active backlogs. Expanding his row lists every rule with a tick or a cross, so the decision is explainable.',
      async () => {
        const dev = page.locator('li', { hasText: 'Dev Malhotra' }).first();
        await dev.getByRole('button', { name: 'Show rule details' }).click();
        await expect(dev.getByLabel('Not met').first()).toBeVisible();
      },
    );
    await rec.step(
      'Missing data is never "not eligible"',
      'Ananya Gupta has no CGPA on file, so she is in "Needs data", not "Not eligible". Her row says exactly what is missing. The officer can fix the record or include her manually with a written reason.',
      async () => {
        const ananya = page.locator('li', { hasText: 'Ananya Gupta' }).first();
        await expect(ananya.getByText(/Missing:/)).toBeVisible();
        await ananya.getByRole('button', { name: 'Show rule details' }).click();
        await expect(ananya.getByLabel('Needs data').first()).toBeVisible();
      },
    );
    await rec.check('Ananya (missing CGPA) is under "Needs data", not under "Not eligible"', async () => {
      const preview = await api(page.request, 'post', `/api/campus/drives/${driveId}/eligibility/preview`, {});
      const names = (k: string) => (preview.body[k] as { name: string }[]).map((s) => s.name);
      expect(names('needsData')).toContain('Ananya Gupta');
      expect(names('notEligible')).not.toContain('Ananya Gupta');
      expect(names('notEligible')).toContain('Dev Malhotra');
    });
    await rec.step(
      'Try a stricter rule: the preview updates live',
      'Raising the minimum CGPA to 8.5 moves students between columns within a second, before anything is saved. The reasons update too. Nothing is sent to students until the rules are saved and invitations confirmed.',
      async () => {
        await page.getByLabel('Minimum CGPA').fill('8.5');
        await expect(page.getByRole('button', { name: 'Save rules' })).toBeEnabled();
        await expect(page.locator('li', { hasText: 'Kabir Shah' }).first().getByText(/CGPA/)).toBeVisible();
      },
      { settleMs: 1500 },
    );
    await rec.step(
      'Discard the experiment',
      '"Discard changes" puts the saved rules back. The "Invite eligible" button stays disabled while there are unsaved changes, so invitations always use the saved rules.',
      async () => {
        await page.getByRole('button', { name: 'Discard changes' }).click();
        await expect(page.getByRole('button', { name: /Invite \d+ eligible/ })).toBeEnabled();
      },
      { settleMs: 1200 },
    );
    await rec.step(
      'Invite the eligible students',
      'Students already in the drive are skipped. One eligible student (Kabir Shah) has not been invited yet. The confirmation explains that each student is notified and that eligibility is checked again on the server.',
      () => page.getByRole('button', { name: /Invite \d+ eligible/ }).click(),
    );
    await rec.step(
      'Invitations sent',
      'After "Send invitations", Kabir now carries an "Invited" badge in the Eligible column and the Candidates tab count goes up.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Send invitations' }).click();
        await expect(page.getByText(/student(s)? invited and notified/)).toBeVisible();
      },
    );

    const kabir = await person(browser, demo('student3'));
    try {
      await rec.step(
        "The student's Placements page",
        'Kabir signs in and opens Placements. The Helix drive shows his stage ("Invited"), the stipend and the registration deadline. "Show eligibility details" lists each rule he meets, so he knows why he was invited.',
        async () => {
          await kabir.page.goto(`${BASE}/app/placements`);
          await kabir.page.getByRole('button', { name: 'Show eligibility details' }).first().click();
          await expect(kabir.page.getByText('Helix Labs SDE Intern 2027')).toBeVisible();
        },
        { page: kabir.page, fullPage: true },
      );
      await rec.step(
        'Kabir registers',
        'One click on "Register" confirms his interest. The stage tracker moves to "Registered" and the placement office sees it immediately.',
        async () => {
          await kabir.page.getByRole('button', { name: 'Register', exact: true }).click();
          await expect(kabir.page.getByText('You are registered.', { exact: false })).toBeVisible();
        },
        { page: kabir.page },
      );
      await rec.check('Kabir is a registered candidate in the drive', async () => {
        const list = await api(page.request, 'get', `/api/campus/drives/${driveId}/candidates`);
        const c = (list.body.items as { stage: string; student: { name: string } }[]).find((x) => x.student.name === 'Kabir Shah');
        expect(c?.stage).toBe('registered');
      });
    } finally {
      await kabir.ctx.close();
    }
  },
);

scenario(
  {
    id: 'campus-04-drive-interviews-and-report',
    area: 'Campus placements',
    title: 'Placement drive: candidates board, interviews with a Jitsi link, outcomes and report',
    summary:
      'The officer reviews the candidates board, schedules a campus interview with a free Jitsi Meet link, the student sees it on their Placements page, the officer records the outcome, and the drive report shows the funnel with a CSV download.',
    roles: ['Placement officer', 'Student'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('placement'), CAMPUS);
    const driveId = await heliveDriveId(page);
    // Make sure there is a registered candidate to interview (Kabir registers in campus-03; fall back to Arjun from the demo data).
    const list = await api(page.request, 'get', `/api/campus/drives/${driveId}/candidates`);
    const registered = (list.body.items as { stage: string; student: { name: string } }[]).filter((c) => c.stage === 'registered').map((c) => c.student.name);
    const who = registered.includes('Kabir Shah') ? 'Kabir Shah' : 'Arjun Rao';
    const whoEmail = who === 'Kabir Shah' ? demo('student3') : demo('student7');

    await rec.step(
      'Candidates board',
      'The Candidates tab lists everyone in the drive with their current stage, the eligibility snapshot taken at invitation, assessment status and next interview. Stages can be filtered and several candidates moved together.',
      async () => {
        await page.goto(`${BASE}/app/campus/drives/${driveId}?tab=candidates`);
        await expect(page.getByRole('cell', { name: /Meera Nair/ }).first()).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Schedule an interview',
      `On the Interviews tab, "Schedule interview" opens a form. The officer picks ${who} (registered), a time three days ahead, keeps "Generate Jitsi link" selected and adds the company interviewer by name. Interviewers do not need an account.`,
      async () => {
        await page.getByRole('tab', { name: /Interviews/ }).click();
        await page.getByRole('button', { name: 'Schedule interview' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Candidate', { exact: true }).selectOption({ label: `${who} (registered)` });
        await dialog.getByLabel('Date and time', { exact: true }).fill(localInput(3, 11, 30));
        await dialog.getByLabel('Interviewer 1 name').fill('Priya Raman (Helix Labs)');
        await dialog.getByLabel('Interviewer 1 email').fill('priya.raman@helix.example');
      },
    );
    await rec.step(
      'Interview scheduled with a meeting link',
      'After "Schedule", the interview appears in the list with a meet.jit.si link that can be copied. The student is notified.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Schedule', exact: true }).click();
        await expect(page.locator('li', { hasText: who }).getByRole('link', { name: /meet\.jit\.si/ })).toBeVisible();
      },
    );
    await rec.check('The scheduled interview has a free Jitsi Meet link', async () => {
      const ivs = await api(page.request, 'get', `/api/campus/drives/${driveId}/interviews`);
      const iv = (ivs.body.items as { meetingUrl: string | null; candidate: { name: string } }[]).find((x) => x.candidate.name === who);
      expect(iv?.meetingUrl).toMatch(/^https:\/\/meet\.jit\.si\//);
    });

    const student = await person(browser, whoEmail);
    try {
      await rec.step(
        'The student sees the interview',
        `${who} opens Placements. The interview card shows the time in their own time zone, the interviewer's name and a "Join meeting" link that opens Jitsi Meet in the browser without an account.`,
        async () => {
          await student.page.goto(`${BASE}/app/placements`);
          await expect(student.page.getByRole('link', { name: 'Join meeting' }).first()).toBeVisible();
        },
        { page: student.page, fullPage: true },
      );
    } finally {
      await student.ctx.close();
    }

    await rec.step(
      'Record the interview outcome',
      'After the interview, "Record outcome" lets the officer note the result (Advance, On hold or Not selected) and an internal summary. This does not change the candidate\'s stage by itself; stage changes are a separate, deliberate step.',
      async () => {
        await page.locator('li', { hasText: who }).filter({ hasText: 'Priya Raman' }).getByRole('button', { name: 'Record outcome' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Result').selectOption('advance');
        await dialog.getByLabel('Feedback summary').fill('Clear problem solving on arrays; good communication. Recommend moving to the HR conversation.');
      },
    );
    await rec.step(
      'Outcome saved',
      'The interview is now marked completed with an "Advance" badge and the internal summary under it.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Save outcome' }).click();
        await expect(page.getByText('Interview outcome recorded.', { exact: false })).toBeVisible();
      },
    );
    await rec.step(
      'Drive report',
      'The Report tab shows the placement funnel (invited, registered, assessed, interviewed, offers, placed) with conversion from each step, the current stage counts and offers with CTC exactly as entered.',
      async () => {
        await page.getByRole('tab', { name: 'Report' }).click();
        await expect(page.getByText('Placement funnel')).toBeVisible();
      },
      { fullPage: true },
    );
    let csvName = '';
    let csvText = '';
    await rec.step(
      'Download the outcomes CSV',
      '"Export outcomes CSV" downloads a spreadsheet of every candidate and stage. A confirmation says the export was recorded in the audit log.',
      async () => {
        const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export outcomes CSV' }).click()]);
        csvName = download.suggestedFilename();
        const path = await download.path();
        csvText = path ? (await import('node:fs')).readFileSync(path, 'utf8') : '';
        await expect(page.getByText('Export downloaded.', { exact: false })).toBeVisible();
      },
    );
    await rec.check('The CSV file downloaded and contains candidate rows', async () => {
      expect(csvName).toMatch(/\.csv$/);
      expect(csvText.split('\n').length).toBeGreaterThan(2);
      expect(csvText).toContain('Meera Nair');
    });
  },
);

scenario(
  {
    id: 'campus-05-people-and-invites',
    area: 'Campus placements',
    title: 'Invite a member to the college, with a shareable link when email is off',
    summary:
      'The organization admin invites a new student. Because email is not configured on this server, the app says so plainly and gives a one-click link to share instead of pretending an email was sent. The link opens a join page for the invited person.',
    roles: ['Organization admin', 'Invited person'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('orgadmin'), CAMPUS);
    const email = uniqueEmail('new.student');
    let inviteLink = '';
    await rec.step(
      'People & roles',
      'Vikram, the Northbridge organization admin, opens People & roles. It lists every member with their roles and last activity, plus pending invitations.',
      async () => {
        await page.goto(`${BASE}/app/campus/people`);
        await expect(page.getByRole('heading', { name: 'People & roles' })).toBeVisible();
      },
    );
    await rec.step(
      'Invite a student',
      'He clicks "Invite people", pastes one email address and keeps the Student role ticked. Several addresses can be pasted at once.',
      async () => {
        await page.getByRole('button', { name: 'Invite people' }).click();
        await page.getByRole('dialog').getByLabel('Email addresses').fill(email);
      },
    );
    await rec.step(
      'Email is off, so a link is offered',
      'After sending, a warning says email is not configured on this server and no emails were sent. A "Copy link" button next to the address lets Vikram share the invitation directly, for example in a chat message.',
      async () => {
        const [resp] = await Promise.all([
          page.waitForResponse((r) => r.url().endsWith('/api/org/invites') && r.request().method() === 'POST'),
          page.getByRole('dialog').getByRole('button', { name: /Send 1 invitation/ }).click(),
        ]);
        const body = await resp.json();
        inviteLink = body.results?.[0]?.inviteLink ?? '';
        await expect(page.getByText('Email is not configured on this server')).toBeVisible();
      },
    );
    await rec.check('The invitation came back with a shareable link because email is not configured', async () => {
      expect(inviteLink).toMatch(/\/invite\//);
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Copy link' })).toBeVisible();
    });
    await rec.step(
      'Pending invitation listed',
      'After "Done", the invitation shows under "Pending invitations" with its role and expiry date (14 days). It can be revoked at any time.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
        await expect(page.getByText(email)).toBeVisible();
      },
    );
    const guest = await person(browser, null);
    try {
      await rec.step(
        'What the invited person sees',
        'Opening the shared link in a fresh browser shows the invitation to join Northbridge Institute of Technology, with the role offered, and lets the person create an account or sign in to accept.',
        async () => {
          await guest.page.goto(inviteLink.startsWith('http') ? inviteLink : `${BASE}${inviteLink}`);
          await expect(guest.page.getByText(/Northbridge/).first()).toBeVisible();
        },
        { page: guest.page },
      );
    } finally {
      await guest.ctx.close();
    }
  },
);

// =====================================================================================
// Hiring (TalentBridge)
// =====================================================================================

scenario(
  {
    id: 'hire-01-create-and-publish-job',
    area: 'Hiring (TalentBridge)',
    title: 'Create a job, see what the publish checklist needs, then publish',
    summary:
      'A recruiter drafts a job posting. The publish checklist explains exactly what is missing (a longer description and at least one required skill). After adding skills from the shared skill list and adjusting the pipeline stages, the job is published.',
    roles: ['Recruiter'],
  },
  async (rec, { page }) => {
    await login(page, demo('recruiter'), HIRE);
    const title = `Site Reliability Engineer ${Date.now().toString().slice(-5)}`;
    await rec.step(
      'Hiring overview',
      'Jordan, a recruiter at Helix Labs, starts on the Hiring overview: open jobs with stage bars, candidates waiting for review, today\'s interviews and feedback still owed.',
      () => page.goto(`${BASE}/app/hire`),
      { fullPage: true },
    );
    await rec.step(
      'Start a new job',
      '"New job" opens the job form. Jordan enters only a title, a location and a one-line description for now. The job is saved as a private draft.',
      async () => {
        await page.getByRole('link', { name: 'New job' }).first().click();
        await page.getByLabel('Job title').fill(title);
        await page.getByLabel('Location', { exact: true }).fill('Remote (India)');
        await page.getByLabel('About the role').fill('Keep our services healthy.');
      },
    );
    await rec.step(
      'The publish checklist explains what is missing',
      'After "Create draft", the job page opens on Details. The publish checklist on the right marks two items with a warning and says why: the description is too short for candidates to judge fit, and matching needs at least one required skill. The Publish button stays disabled.',
      async () => {
        await page.getByRole('button', { name: 'Create draft' }).click();
        await expect(page.getByText('Publish checklist', { exact: true })).toBeVisible();
        await expect(page.getByText('Describe the role so candidates can judge fit.')).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('Publishing is blocked while the checklist has open items', async () => {
      await expect(page.getByText('Matching uses only the skills you list. Mark at least one as required.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled();
    });
    await rec.step(
      'Add required skills from the skill picker',
      'Typing in "Search skills to add" suggests skills from the shared skill list. Jordan adds Python (required, minimum level 2) and Containers with Docker as "Preferred". Candidates are matched only on these skills and the evidence behind them.',
      async () => {
        await page.getByLabel('About the role').fill('Run and improve the production platform: monitoring, incident response, CI pipelines and container infrastructure for product teams.');
        await page.getByLabel('Search skills to add').fill('Python');
        await page.getByRole('button', { name: /^Python/ }).first().click();
        await page.getByLabel('Minimum level for Python').selectOption('2');
        await page.getByLabel('Search skills to add').fill('Docker');
        await page.getByRole('button', { name: /Docker/ }).first().click();
        await page.getByRole('radiogroup', { name: /Is .*Docker.* required\?/ }).getByRole('radio', { name: 'Preferred' }).click();
      },
      { fullPage: true },
    );
    await rec.step(
      'Adjust the pipeline stages',
      'The pipeline section shows the board columns. Jordan removes "Shortlisted" and adds a custom "Take-home" stage. Applied is always first and Hired always last; Rejected and Withdrawn are added automatically.',
      async () => {
        await page.getByRole('button', { name: 'Remove Shortlisted' }).click();
        await page.getByLabel('Custom stage name').fill('Take-home');
        await page.getByRole('button', { name: 'Add stage' }).click();
        await expect(page.getByText('Take home').first()).toBeVisible();
      },
    );
    await rec.step(
      'Save: the checklist is complete',
      'After "Save changes", every checklist item has a green tick and the checklist says "Ready to publish."',
      async () => {
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByText('Ready to publish.')).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Publish',
      'One click on "Publish" makes the job visible on the job board. The status badge changes to Published and candidates can apply.',
      async () => {
        await page.getByRole('button', { name: 'Publish' }).click();
        await expect(page.getByText('Job published. Candidates can now apply.')).toBeVisible();
      },
    );
    await rec.check('The job is published with the chosen skills and stages', async () => {
      const id = page.url().match(/jobs\/([0-9a-f-]{36})/)![1];
      const job = await api(page.request, 'get', `/api/hire/jobs/${id}`);
      expect(job.body.job.status).toBe('published');
      expect(job.body.job.requiredSkills.map((s: { slug: string }) => s.slug)).toContain('python');
      expect(job.body.job.stages).not.toContain('shortlisted');
      expect(job.body.job.stages).toContain('take_home');
    });
  },
);

scenario(
  {
    id: 'hire-02-pipeline-and-decisions',
    area: 'Hiring (TalentBridge)',
    title: 'Candidate pipeline: explainable match, reasons for every move, and the decision log',
    summary:
      'The recruiter reviews the pipeline board and candidate profiles. The match against the job lists each required skill with its evidence (Verified, Self-reported or No evidence) and a fairness note. Skipping a stage or rejecting someone needs a written reason, and every decision lands in an audit trail.',
    roles: ['Recruiter', 'Candidate'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('recruiter'), HIRE);
    const jobId = await helixJobId(page, 'Backend Engineer (Python)');
    const cand = await newUser(browser, 'Leah Fernandes', { selfRate: [{ slug: 'python', level: 2 }] });
    try {
      await applyAs(cand, jobId);
      const appId = await findApplication(page, jobId, 'Leah Fernandes');
      const meeraId = await findApplication(page, jobId, 'Meera Nair');

      await rec.step(
        'Pipeline board',
        'The "Backend Engineer (Python)" job shows a board with one column per stage. Each card shows the candidate, their match score and how long ago they were updated. Leah Fernandes has just applied.',
        async () => {
          await page.goto(`${BASE}/app/hire/jobs/${jobId}`);
          await expect(page.getByRole('region', { name: 'Applied column' }).getByText('Leah Fernandes')).toBeVisible();
        },
        { fullPage: true },
      );
      await rec.step(
        'A candidate with verified evidence',
        'Meera Nair\'s profile opens on "Profile and match". Python and Arrays are marked "Verified" because she passed a graded assessment. SQL and HTTP show "No evidence". The score covers only the job\'s listed skills.',
        async () => {
          await page.goto(`${BASE}/app/hire/candidates/${meeraId}`);
          await expect(page.getByText('Match against this job')).toBeVisible();
          await expect(page.getByRole('cell', { name: 'Verified' }).first()).toBeVisible();
        },
        { fullPage: true },
      );
      await rec.step(
        'A candidate with self-reported skills',
        'Leah rated her own Python skill, so it shows as "Self-reported" and counts only partly. The other skills show "No evidence". The fairness note underneath says ranking uses only stated requirements and demonstrated skills, and that people make the decisions.',
        async () => {
          await page.goto(`${BASE}/app/hire/candidates/${appId}`);
          await expect(page.getByRole('cell', { name: 'Self-reported' })).toBeVisible();
        },
        { fullPage: true },
      );
      await rec.check('The match shows evidence labels and the fairness note', async () => {
        await expect(page.getByRole('cell', { name: 'Self-reported' })).toBeVisible();
        await expect(page.getByRole('cell', { name: 'No evidence' }).first()).toBeVisible();
        await expect(page.getByText('Ranking uses only stated job requirements and demonstrated skills. Decisions are made by people.')).toBeVisible();
      });
      await rec.step(
        'Skipping a stage needs a reason',
        'Jordan opens the move dialog and picks "Shortlisted", skipping Eligibility review. A note explains that skipping stages needs a reason, and the Move button stays disabled until one is written.',
        async () => {
          await page.getByRole('button', { name: /Move to Eligibility review/ }).click();
          await page.getByRole('dialog').getByLabel('New stage').selectOption('shortlisted');
          await expect(page.getByRole('dialog').getByText('Skipping stages needs a reason.', { exact: false })).toBeVisible();
          await expect(page.getByRole('dialog').getByRole('button', { name: 'Move to Shortlisted' })).toBeDisabled();
        },
      );
      await rec.step(
        'Move with a reason',
        'With a reason based on the job requirements, the move goes through. The reason is kept in the decision log.',
        async () => {
          await page.getByRole('dialog').getByLabel('Reason', { exact: true }).fill('Cover note and self-rated Python fit the core requirements; eligibility already confirmed by phone.');
          await page.getByRole('dialog').getByRole('button', { name: 'Move to Shortlisted' }).click();
          await expect(page.getByText('Stage updated and recorded.')).toBeVisible();
        },
      );
      await rec.step(
        'A rejection without a reason is refused',
        'Clicking "Reject" opens the same dialog in red. It states that rejections need a reason for the decision record, and the Reject button cannot be clicked while the reason is empty. The server refuses a reason-less rejection too.',
        async () => {
          await page.getByRole('button', { name: 'Reject', exact: true }).click();
          await expect(page.getByRole('dialog').getByText('Rejections need a reason for the decision record.')).toBeVisible();
        },
      );
      await rec.check('Rejecting without a reason is blocked in the screen and refused by the server', async () => {
        await expect(page.getByRole('dialog').getByRole('button', { name: 'Reject', exact: true })).toBeDisabled();
        const r = await api(page.request, 'post', `/api/hire/applications/${appId}/move`, { toStage: 'rejected' });
        expect(r.status).toBe(400);
      });
      await rec.step(
        'Reject with a respectful, shared reason',
        'Jordan writes a reason and ticks "Share this reason with the candidate", so Leah will see it on her application page. The candidate is moved to Rejected.',
        async () => {
          const dialog = page.getByRole('dialog');
          await dialog.getByLabel('Reason', { exact: true }).fill('The role needs production SQL experience. Please apply again after building SQL evidence.');
          await dialog.getByRole('checkbox', { name: /Share this reason with the candidate/ }).click();
          await dialog.getByRole('button', { name: 'Reject', exact: true }).click();
          await expect(page.getByText('Stage updated and recorded.')).toBeVisible();
        },
      );
      await rec.step(
        'Decision log',
        'The Decisions tab lists every stage change with who made it, when, and why. Reasons shared with the candidate are labelled. The same entries are written to the organization audit log.',
        async () => {
          await page.getByRole('tab', { name: /Decisions/ }).click();
          await expect(page.getByText('Cover note and self-rated Python fit', { exact: false })).toBeVisible();
        },
        { fullPage: true },
      );
      await rec.check('Both decisions and their reasons are in the decision log', async () => {
        await expect(page.getByText('The role needs production SQL experience.', { exact: false }).first()).toBeVisible();
        await expect(page.getByText('Shared with candidate').first()).toBeVisible();
      });
      await rec.step(
        'What the candidate sees',
        'Leah opens her application. It shows a kind explanation and only the note the recruiter chose to share; internal notes are never shown.',
        async () => {
          await cand.page.goto(`${BASE}/app/jobs/applications/${appId}`);
          await expect(cand.page.getByText('The role needs production SQL experience.', { exact: false }).first()).toBeVisible();
        },
        { page: cand.page, fullPage: true },
      );
    } finally {
      await cand.ctx.close();
    }
  },
);

scenario(
  {
    id: 'hire-03-interviews-blind-feedback',
    area: 'Hiring (TalentBridge)',
    title: 'Interviews: schedule with a Jitsi link, blind interviewer feedback, recruiter sees all',
    summary:
      'The recruiter schedules a technical interview with two interviewers and a generated Jitsi link. Each interviewer submits structured feedback independently: colleagues\' feedback stays hidden until they submit their own. The recruiter then sees all feedback.',
    roles: ['Recruiter', 'Interviewer'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('recruiter'), HIRE);
    const jobId = await helixJobId(page, 'Backend Engineer (Python)');
    const cand = await newUser(browser, 'Tomas Silva', { selfRate: [{ slug: 'python', level: 3 }] });
    await applyAs(cand, jobId);
    await cand.ctx.close();
    const appId = await findApplication(page, jobId, 'Tomas Silva');
    await moveTo(page, appId, TO_INTERVIEW);
    let interviewId = '';

    await rec.step(
      'Candidate at the Interview stage',
      'Tomas Silva has reached the Interview stage. The Interviews tab is empty and offers "Schedule interview".',
      async () => {
        await page.goto(`${BASE}/app/hire/candidates/${appId}?tab=interviews`);
        await expect(page.getByText('No interviews yet')).toBeVisible();
      },
    );
    await rec.step(
      'Schedule with two interviewers and a Jitsi link',
      'Jordan picks a technical interview tomorrow, selects Sam Okafor (Senior Engineer) and himself as interviewers, and keeps "Generate a free Jitsi Meet link". The first participant may need to sign in to Jitsi to start the meeting; the form says so.',
      async () => {
        await page.getByRole('button', { name: 'Schedule interview' }).first().click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('checkbox', { name: /Sam Okafor/ }).click();
        await dialog.getByRole('checkbox', { name: /Jordan Lee/ }).click();
        await expect(dialog.getByLabel('Meeting link')).toHaveValue('jitsi');
      },
    );
    await rec.step(
      'Interview scheduled',
      'After "Schedule interview", the candidate and both interviewers are notified. The interview card lists the time, duration and interviewers.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Schedule interview' }).click();
        await expect(page.getByText('Interview scheduled. The candidate and interviewers were notified.')).toBeVisible();
        const d = await api(page.request, 'get', `/api/hire/applications/${appId}`);
        interviewId = d.body.interviews[0].id;
      },
    );
    await rec.check('The interview has a generated meet.jit.si link', async () => {
      const iv = await api(page.request, 'get', `/api/hire/interviews/${interviewId}`);
      expect(iv.body.interview.meetingUrl).toMatch(/^https:\/\/meet\.jit\.si\/LearnSphere-/);
    });
    await rec.step(
      'Jordan submits his feedback first',
      'On the interview page, Jordan rates the competencies on a 1 to 4 rubric with evidence notes, writes a summary and picks a recommendation, then submits.',
      async () => {
        await page.goto(`${BASE}/app/hire/interviews/${interviewId}`);
        await page.getByLabel(/^Rating for /).first().selectOption('3');
        await page.getByLabel(/^Evidence note for /).first().fill('Talked through a retry strategy for flaky jobs clearly.');
        await page.getByLabel('Summary', { exact: true }).fill('Good fundamentals and a calm, structured approach. Some gaps in SQL indexing.');
        await page.getByRole('radio', { name: 'Yes', exact: true }).click();
        await page.getByRole('button', { name: 'Submit feedback' }).click();
        await expect(page.getByText('Feedback submitted.', { exact: false })).toBeVisible();
      },
      { fullPage: true },
    );

    const sam = await person(browser, demo('interviewer'), HIRE);
    try {
      await rec.step(
        "Sam cannot see a colleague's feedback yet",
        'Sam Okafor opens the same interview. His own feedback form is at the top. Below it, a lock notice says one colleague\'s feedback is hidden until he submits his own, so first impressions stay independent.',
        async () => {
          await sam.page.goto(`${BASE}/app/hire/interviews/${interviewId}`);
          await expect(sam.page.getByText('1 colleague feedback hidden until you submit yours.', { exact: false })).toBeVisible();
        },
        { page: sam.page, fullPage: true },
      );
      await rec.check("Before submitting, the interviewer cannot see Jordan's feedback (screen and server)", async () => {
        await expect(sam.page.getByText('Good fundamentals and a calm, structured approach.')).toHaveCount(0);
        const iv = await api(sam.page.request, 'get', `/api/hire/interviews/${interviewId}`);
        expect(JSON.stringify(iv.body.feedback)).not.toContain('Good fundamentals');
      });
      await rec.step(
        'Sam fills in his feedback',
        'Sam rates two competencies, adds evidence notes and a summary, and chooses "Strong yes". A short guidance note reminds interviewers to judge only job-related evidence.',
        async () => {
          const ratings = sam.page.getByLabel(/^Rating for /);
          await ratings.nth(0).selectOption('4');
          await ratings.nth(1).selectOption('3');
          await sam.page.getByLabel(/^Evidence note for /).first().fill('Designed an idempotent job handler without hints.');
          await sam.page.getByLabel('Summary', { exact: true }).fill('Strong problem solving, explained trade-offs well, wrote tests first. Recommend an offer.');
          await sam.page.getByRole('radio', { name: 'Strong yes' }).click();
        },
        { page: sam.page, fullPage: true },
      );
      await rec.step(
        "After submitting, colleagues' feedback appears",
        'Once Sam submits, the lock notice disappears and he can read Jordan\'s feedback next to his own.',
        async () => {
          await sam.page.getByRole('button', { name: 'Submit feedback' }).click();
          await expect(sam.page.getByText('Good fundamentals and a calm, structured approach.', { exact: false })).toBeVisible();
        },
        { page: sam.page, fullPage: true },
      );
    } finally {
      await sam.ctx.close();
    }
    await rec.step(
      'The recruiter sees all feedback',
      'Back on the candidate\'s Interviews tab, Jordan sees both feedback cards with ratings, notes and recommendations, ready for a decision.',
      async () => {
        await page.goto(`${BASE}/app/hire/candidates/${appId}?tab=interviews`);
        await expect(page.getByText('Strong problem solving, explained trade-offs well', { exact: false })).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('Both interviewers\' feedback is visible to the recruiter', async () => {
      await expect(page.getByText('Good fundamentals and a calm, structured approach.', { exact: false })).toBeVisible();
      await expect(page.getByText('Strong problem solving', { exact: false })).toBeVisible();
    });
  },
);

scenario(
  {
    id: 'hire-04-offer-accepted',
    area: 'Hiring (TalentBridge)',
    title: 'Draft and extend an offer; the candidate accepts and is marked hired',
    summary:
      'The recruiter drafts an offer (private to the team), extends it, and the candidate accepts it from their application page. The application status becomes Hired on both sides.',
    roles: ['Recruiter', 'Candidate'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('recruiter'), HIRE);
    const jobId = await helixJobId(page, 'Backend Engineer (Python)');
    const cand = await newUser(browser, 'Priya Menon', { selfRate: [{ slug: 'python', level: 3 }] });
    try {
      await applyAs(cand, jobId);
      const appId = await findApplication(page, jobId, 'Priya Menon');
      await moveTo(page, appId, [...TO_INTERVIEW, ['offer', 'Both interviewers recommended an offer.']]);

      await rec.step(
        'Candidate at the Offer stage',
        'Priya Menon has passed the interviews and is at the Offer stage. The Offers tab is empty and offers "Draft offer".',
        async () => {
          await page.goto(`${BASE}/app/hire/candidates/${appId}?tab=offers`);
          await expect(page.getByText('No offers')).toBeVisible();
        },
      );
      await rec.step(
        'Draft the offer',
        'The offer form asks for the role title, compensation (shown to the candidate exactly as written), a start date and a respond-by date. Drafts are private to the hiring team.',
        async () => {
          await page.getByRole('button', { name: 'Draft offer' }).first().click();
          const dialog = page.getByRole('dialog');
          await dialog.getByLabel('Compensation', { exact: true }).fill('INR 15 LPA base, 10% annual bonus, health insurance and a learning budget (sample offer).');
          await dialog.getByLabel('Start date').fill(localInput(45, 9).slice(0, 10));
        },
      );
      await rec.step(
        'Draft saved',
        'After "Save draft", the offer appears with a Draft badge. The candidate cannot see it yet. Jordan can still edit, extend or rescind it.',
        async () => {
          await page.getByRole('dialog').getByRole('button', { name: 'Save draft' }).click();
          await expect(page.getByRole('button', { name: 'Extend offer' })).toBeVisible();
        },
      );
      await rec.step(
        'Extend the offer',
        'Extending asks for confirmation: Priya will be notified and can accept or decline from her application page, and the terms cannot be edited after this.',
        () => page.getByRole('button', { name: 'Extend offer' }).click(),
      );
      await rec.step(
        'Offer extended',
        'After confirming, the badge changes to Extended and the candidate is notified.',
        async () => {
          await page.getByRole('dialog').getByRole('button', { name: 'Extend offer' }).click();
          await expect(page.getByText('Offer sent to Priya Menon.')).toBeVisible();
        },
      );
      await rec.step(
        'The candidate sees the offer',
        'Priya opens her application. The offer card shows the compensation exactly as written, the start date and the respond-by date, with "Accept offer" and "Decline".',
        async () => {
          await cand.page.goto(`${BASE}/app/jobs/applications/${appId}`);
          await expect(cand.page.getByRole('button', { name: 'Accept offer' })).toBeVisible();
        },
        { page: cand.page, fullPage: true },
      );
      await rec.step(
        'Accept, with an optional note',
        'Accepting asks for confirmation and lets Priya add a note to the employer.',
        async () => {
          await cand.page.getByRole('button', { name: 'Accept offer' }).click();
          await cand.page.getByRole('dialog').getByLabel('Note to the employer').fill('Thank you! I am excited to join the platform team.');
        },
        { page: cand.page },
      );
      await rec.step(
        'Offer accepted',
        'After confirming, the application is marked as hired and the offer shows Accepted. Helix Labs is notified.',
        async () => {
          await cand.page.getByRole('dialog').getByRole('button', { name: 'Accept offer' }).click();
          await expect(cand.page.getByText('You accepted the offer from Helix Labs.')).toBeVisible();
        },
        { page: cand.page, fullPage: true },
      );
      await rec.check('The application status is now hired', async () => {
        const d = await api(page.request, 'get', `/api/hire/applications/${appId}`);
        expect(d.body.application.status).toBe('hired');
        expect(d.body.offers[0].status).toBe('accepted');
      });
      await rec.step(
        "The recruiter's view",
        'On Jordan\'s side the candidate now shows the Hired badge and the offer is marked Accepted.',
        async () => {
          await page.reload();
          await expect(page.getByText('Accepted').first()).toBeVisible();
        },
      );
    } finally {
      await cand.ctx.close();
    }
  },
);

scenario(
  {
    id: 'hire-05-analytics-team-and-search',
    area: 'Hiring (TalentBridge)',
    title: 'Hiring analytics with definitions, company & team, and consent-based candidate search',
    summary:
      'Recruiters see funnel analytics with a written definition for every number (no demographic analytics). The company page holds the hiring profile and team. Candidate search only covers people who opted in, applied, or were invited through a campus drive.',
    roles: ['Recruiter'],
  },
  async (rec, { page, browser }) => {
    // A learner with SQL evidence who has NOT opted in to recruiter search and has not applied.
    const hidden = await newUser(browser, 'Noor Private', { selfRate: [{ slug: 'sql-basics', level: 4 }] });
    await hidden.ctx.close();
    await login(page, demo('recruiter'), HIRE);
    await rec.step(
      'Recruitment analytics',
      'The analytics page shows applications, conversion, assessment completion and offer acceptance, then a stage funnel, average days in each stage, interview throughput and a per-job table. It states that no demographic analytics are computed.',
      async () => {
        await page.goto(`${BASE}/app/hire/analytics`);
        await expect(page.getByText('Stage funnel')).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Every number has a definition',
      'At the bottom, a Definitions card explains exactly how each figure is calculated, so nobody has to guess what "conversion" means.',
      async () => {
        await page.getByText('Definitions', { exact: true }).scrollIntoViewIfNeeded();
      },
    );
    await rec.check('The analytics page includes written definitions', async () => {
      await expect(page.getByText('Definitions', { exact: true })).toBeVisible();
      await expect(page.getByText('No demographic analytics are computed.', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('Fairness', { exact: true })).toBeVisible();
    });
    await rec.step(
      'Company and team',
      'The Company and team page holds the profile candidates see next to postings (about, values, benefits, hiring process) and the hiring team with their roles. Recruiter admins can invite recruiters and interviewers.',
      async () => {
        await page.goto(`${BASE}/app/hire/company`);
        await expect(page.getByText('Hiring team')).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Consent-based candidate search',
      'Candidates, Search explains its scope: only people who opted in to recruiter search, people who applied to Helix jobs, and students invited to campus drives for Helix postings. Contact details are never shown.',
      async () => {
        await page.goto(`${BASE}/app/hire/candidates?tab=search`);
        await expect(page.getByText('Search covers only people who opted in to recruiter search', { exact: false })).toBeVisible();
      },
    );
    await rec.step(
      'Search for SQL, any evidence',
      'Searching "sql-basics" with "Any evidence" returns candidates with badges that say why the recruiter may see them: "Open to recruiters" (Asha opted in), "Applied to your jobs" or "Campus drive". A learner who never opted in or applied is not found, however strong their evidence. Cards show skill evidence only, never personal attributes.',
      async () => {
        await page.getByLabel('Skills', { exact: true }).fill('sql-basics');
        await page.getByLabel('Evidence', { exact: true }).selectOption('any');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await expect(page.getByText('Open to recruiters').first()).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.check('Only authorized candidates appear: the opted-in learner is found, a non-consenting learner is not', async () => {
      await expect(page.getByText('Asha Verma').first()).toBeVisible();
      await expect(page.getByText('Noor Private')).toHaveCount(0);
      const r = await api(page.request, 'get', '/api/hire/candidates/search?skills=sql-basics&minEvidence=any&pageSize=50');
      expect(r.status).toBe(200);
      expect(JSON.stringify(r.body.items)).toContain('Asha Verma');
      expect(JSON.stringify(r.body.items)).not.toContain('Noor Private');
    });
  },
);

// =====================================================================================
// Administration
// =====================================================================================

scenario(
  {
    id: 'admin-01-overview-health-settings',
    area: 'Administration',
    title: 'Platform overview, system health and platform settings',
    summary:
      'The platform admin sees live metrics with a definition on every tile, an honest notice that email is not configured, the failed background job and open incidents. System health shows which optional services are set up, and Platform settings hold feature flags, plans and retention rules.',
    roles: ['Platform admin'],
  },
  async (rec, { page }) => {
    await login(page, demo('admin'), ADMIN);
    await rec.step(
      'Platform overview',
      'Priya, the platform admin, opens Admin. Tiles show live counts from stored records. Below are an email notice, failed background work, open incidents, sign-ups per week, organizations, storage, AI usage and feature adoption.',
      async () => {
        await page.goto(`${BASE}/app/admin`);
        await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Each metric explains how it is counted',
      'Hovering the info icon on a tile shows its exact definition, so numbers are never ambiguous.',
      async () => {
        await page.getByRole('button', { name: /^How ".*" is counted:/ }).first().hover();
        await expect(page.getByRole('tooltip').first()).toBeVisible();
      },
    );
    await rec.check('Every metric tile carries a definition', async () => {
      expect(await page.getByRole('button', { name: /^How ".*" is counted:/ }).count()).toBeGreaterThan(3);
    });
    await rec.step(
      'Email not configured, failed job and incidents',
      'A warning says email is not configured and that password resets need an admin-generated link. The "Failed background work" card lists the demo.failing_example job with its error, and "Open incidents" lists the job feed delay.',
      async () => {
        await expect(page.getByText('Email is not configured')).toBeVisible();
        await page.getByText('Failed background work').scrollIntoViewIfNeeded();
      },
    );
    await rec.check('The overview shows the email notice, the failed demo job and an open incident', async () => {
      await expect(page.getByText('Email is not configured')).toBeVisible();
      await expect(page.getByText('demo.failing_example').first()).toBeVisible();
      await expect(page.getByText('Job feed sync delayed').first()).toBeVisible();
    });
    await rec.step(
      'System health',
      'System health is checked live on this server: database, background worker, email, storage, code runtimes and AI providers. Optional services that are not set up show "Not configured", and the features that need them say so instead of failing.',
      async () => {
        await page.goto(`${BASE}/app/admin/health`);
        await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Platform settings: feature flags',
      'Platform settings start with feature flags. Turning a feature off hides it for everyone with an explanation, and existing data is kept.',
      async () => {
        await page.goto(`${BASE}/app/admin/settings`);
        await expect(page.getByText('Feature flags')).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Plans and limits',
      'The "Plans and limits" tab lists the Free, Campus and Company plans with their limits and included features. Billing runs in demonstration mode: no payment is ever taken.',
      async () => {
        await page.getByRole('tab', { name: 'Plans and limits' }).click();
        await expect(page.getByText('Campus', { exact: true }).first()).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Retention rules',
      'The "Retention and storage" tab sets the account deletion grace period, how long audit logs and data exports are kept, and storage quotas. A daily sweep applies them.',
      async () => {
        await page.getByRole('tab', { name: 'Retention and storage' }).click();
        await expect(page.getByLabel('Account deletion grace period (days)')).toBeVisible();
      },
      { fullPage: true },
    );
  },
);

scenario(
  {
    id: 'admin-02-users-and-organizations',
    area: 'Administration',
    title: 'Users (reset link, suspend and restore) and organizations (plans and policies)',
    summary:
      'The admin finds a user, creates a one-time password reset link that is shown only once, suspends the account (which blocks sign-in) and restores it. Then the admin reviews an organization: its plan in demonstration mode, usage and policies.',
    roles: ['Platform admin'],
  },
  async (rec, { page, browser }) => {
    const user = await newUser(browser, 'Ravi Support Case');
    await user.ctx.close();
    await login(page, demo('admin'), ADMIN);
    let resetLink = '';
    await rec.step(
      'Users list',
      'The Users page lists every account with platform role, status, organizations and last activity. Filters cover role, status and sample accounts.',
      () => page.goto(`${BASE}/app/admin/users`),
      { fullPage: true },
    );
    await rec.step(
      'Search for a user',
      'Typing part of a name narrows the list as you type.',
      async () => {
        await page.getByLabel('Search').fill('Ravi Support');
        await expect(page.getByRole('link', { name: 'Ravi Support Case' })).toBeVisible();
      },
    );
    await rec.step(
      'Open the user',
      'The user page shows account details, organization memberships (read-only, and there is no impersonation), data requests and recent admin actions, with action buttons at the top.',
      async () => {
        await page.getByRole('link', { name: 'Ravi Support Case' }).click();
        await expect(page.getByRole('button', { name: 'Create reset link' })).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Create a one-time reset link',
      'Because email is not configured, the admin can create a password reset link instead. The confirmation explains it works once, expires in 1 hour and is shown only once.',
      () => page.getByRole('button', { name: 'Create reset link' }).click(),
    );
    await rec.step(
      'The link is shown once',
      'The link appears with a "Copy link" button and a warning to treat it like a password and verify the person\'s identity before sharing it. After "I have copied it", it cannot be displayed again.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Create link' }).click();
        const code = page.getByRole('dialog').locator('code');
        await expect(code).toContainText('reset-password');
        resetLink = (await code.innerText()).trim();
      },
    );
    await rec.check('A one-time reset link was generated', async () => {
      expect(resetLink).toMatch(/reset-password\?token=/);
    });
    await rec.step(
      'Suspend the account',
      'After closing the link dialog, "Suspend" asks for a reason that is kept in the audit log (not shown to the person) and warns that all sessions end immediately.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'I have copied it' }).click();
        await page.getByRole('button', { name: 'Suspend', exact: true }).click();
        await page.getByRole('dialog').getByLabel('Reason').fill('Reported account sharing; suspended while support verifies identity.');
      },
    );
    await rec.step(
      'Account suspended',
      'After confirming, a banner says the account is suspended: the person cannot sign in and their data is kept. The button changes to "Restore account".',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Suspend account' }).click();
        await expect(page.getByText('This account is suspended')).toBeVisible();
      },
    );
    await rec.check('A suspended user cannot sign in', async () => {
      const probe = await person(browser, null);
      const r = await api(probe.page.request, 'post', '/api/auth/login', { email: user.email, password: user.password });
      await probe.ctx.close();
      expect(r.status).toBeGreaterThanOrEqual(400);
    });
    await rec.step(
      'Restore the account',
      '"Restore account" asks for confirmation and then lets the person sign in again with their existing password.',
      async () => {
        await page.getByRole('button', { name: 'Restore account' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Restore account' }).click();
        await expect(page.getByText('Account restored.', { exact: false })).toBeVisible();
      },
    );
    await rec.check('After restoring, the user can sign in again', async () => {
      const probe = await person(browser, null);
      const r = await api(probe.page.request, 'post', '/api/auth/login', { email: user.email, password: user.password });
      await probe.ctx.close();
      expect(r.status).toBe(200);
    });
    await rec.step(
      'Organizations',
      'The Organizations page lists every tenant (colleges, companies) with kind, plan, status and member count.',
      () => page.goto(`${BASE}/app/admin/orgs`),
      { fullPage: true },
    );
    await rec.step(
      'Organization plan and policies',
      'Opening Northbridge shows its plan and usage against each limit, with a notice that billing is in demonstration mode, plus policies such as "Require verified records for placement" and AI assistants. Members are read-only here.',
      async () => {
        await page.getByRole('link', { name: /Northbridge Institute of Technology/ }).first().click();
        await expect(page.getByText('Plan and usage')).toBeVisible();
        await expect(page.getByText('Require verified records for placement')).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Changing a plan takes no payment',
      'Choosing another plan and clicking "Change plan" shows a confirmation that no payment is processed and no invoice is created. The admin cancels here, so nothing changes.',
      async () => {
        await page.getByLabel('Plan', { exact: true }).selectOption('company');
        await page.getByRole('button', { name: 'Change plan' }).click();
        await expect(page.getByRole('dialog').getByText('Demonstration mode: no payment is processed', { exact: false })).toBeVisible();
      },
    );
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  },
);

scenario(
  {
    id: 'admin-03-jobs-and-audit',
    area: 'Administration',
    title: 'Background jobs: retry a failed job; audit log filters and CSV export',
    summary:
      'The admin opens the failed "demo.failing_example" job, reads its error, retries it and sees it succeed exactly once. The audit log records the retry, can be filtered by action and exported as CSV.',
    roles: ['Platform admin'],
  },
  async (rec, { page }) => {
    await login(page, demo('admin'), ADMIN);
    await rec.step(
      'Failed background jobs',
      'Background jobs lists grading, email, exports and other work that runs outside a request. Filtering to Failed shows the demo.failing_example job that used all 3 attempts, with its last error.',
      async () => {
        await page.goto(`${BASE}/app/admin/jobs?status=failed`);
        await expect(page.getByRole('button', { name: 'demo.failing_example' }).first()).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Job details and error',
      'The details panel explains that the job stopped after using all its attempts, shows attempts, timestamps, the idempotency key, the full error ("the upstream service timed out after 30 s") and the payload with secrets redacted.',
      async () => {
        await page.locator('tr', { hasText: 'demo.failing_example' }).first().getByRole('button', { name: 'Details' }).click();
        await expect(page.getByRole('dialog').getByText('This job stopped after using all its attempts')).toBeVisible();
      },
    );
    await rec.step(
      'Retry the job',
      'Handlers are idempotent, so retrying is safe. "Retry job" queues one more attempt and the worker picks it up within seconds.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Retry job' }).click();
        await expect(page.getByText('Job queued for retry.', { exact: false })).toBeVisible();
      },
    );
    await rec.check('The retried job succeeds', async () => {
      await expect
        .poll(async () => {
          const jobs = await api(page.request, 'get', '/api/admin/jobs?type=demo.failing_example');
          return (jobs.body.items ?? jobs.body.jobs)[0]?.status;
        }, { timeout: 30_000 })
        .toBe('succeeded');
    });
    await rec.step(
      'The job now shows Succeeded',
      'Reopening the list for this job type shows it as Succeeded. It ran once more and did not create duplicate results.',
      async () => {
        await page.goto(`${BASE}/app/admin/jobs?type=demo.failing_example`);
        await expect(page.locator('tr', { hasText: 'demo.failing_example' }).first().getByText(/Succeeded/i)).toBeVisible();
      },
    );
    await rec.step(
      'Audit log',
      'The audit log records every sensitive action with time, actor and target. IP addresses are not shown.',
      async () => {
        await page.goto(`${BASE}/app/admin/audit`);
        await expect(page.getByRole('table', { name: 'Audit log' })).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Filter by action',
      'Choosing the action "Admin: background jobs" narrows the log to job actions. The retry Priya just made is at the top with her name.',
      async () => {
        await page.getByLabel('Action').selectOption({ label: 'Admin: background jobs' });
        await expect(page.getByRole('table', { name: 'Audit log' }).getByText(/Priya/).first()).toBeVisible();
      },
    );
    let csv = '';
    await rec.step(
      'Export the filtered log as CSV',
      '"Export CSV" downloads the filtered entries as a spreadsheet. The export itself is also recorded.',
      async () => {
        const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Export CSV' }).click()]);
        const p = await download.path();
        csv = p ? (await import('node:fs')).readFileSync(p, 'utf8') : '';
      },
    );
    await rec.check('The CSV contains the job retry entry', async () => {
      expect(csv.split('\n').length).toBeGreaterThan(1);
      expect(csv.toLowerCase()).toMatch(/retr(y|ied)/);
    });
  },
);

scenario(
  {
    id: 'admin-04-moderation-and-incidents',
    area: 'Administration',
    title: 'Moderation queue and a site-wide incident banner',
    summary:
      'The admin resolves a reported item from the moderation queue. Then they record a high-severity incident: every signed-in user immediately sees a status banner with its title. Resolving the incident removes the banner.',
    roles: ['Platform admin', 'Learner'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('admin'), ADMIN);
    const title = `Video interviews failing to start (${Date.now().toString().slice(-4)})`;
    await rec.step(
      'Moderation queue',
      'Moderation lists reports people made about threads, replies, resources and more, with the reason, the reporter and when it was reported.',
      async () => {
        await page.goto(`${BASE}/app/admin/moderation`);
        await expect(page.getByRole('table', { name: 'Reports' })).toBeVisible();
      },
      { fullPage: true },
    );
    await rec.step(
      'Review a report',
      'Opening a report shows a plain-text preview of the reported item, other reports on it and the decision options: "Take action" or "No violation". The moderator writes a resolution note.',
      async () => {
        await page.getByRole('table', { name: 'Reports' }).locator('tbody tr').first().getByRole('button').first().click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('radio', { name: 'No violation' }).click();
        await dialog.getByLabel('Resolution note').fill('Reviewed: on-topic and accurate. No violation of community guidelines.');
      },
    );
    await rec.step(
      'Report resolved',
      'After "Dismiss report", the reporter is told the outcome in general terms and the report leaves the open queue.',
      async () => {
        await page.getByRole('dialog').getByRole('button', { name: 'Dismiss report' }).click();
        await expect(page.getByText(/report\(s\) resolved/)).toBeVisible();
      },
    );
    let incidentId = '';
    try {
      await rec.step(
        'Record a high-severity incident',
        'On Incidents, "Record incident" opens a form. Choosing High severity shows a warning that every signed-in user will see the title and status in a banner until it is resolved.',
        async () => {
          await page.goto(`${BASE}/app/admin/incidents`);
          await page.getByRole('button', { name: 'Record incident' }).click();
          const dialog = page.getByRole('dialog');
          await dialog.getByLabel('Title').fill(title);
          await dialog.getByLabel('Severity').selectOption('high');
          await dialog.getByLabel('First timeline entry').fill('Some candidates report the meeting link does not open. Investigating.');
          await expect(dialog.getByText('Every signed-in user will see this title and status in a banner', { exact: false })).toBeVisible();
        },
      );
      await rec.step(
        'Incident page with timeline',
        'After "Record incident", the incident page opens with its details, a timeline and a note that signed-in users currently see a banner.',
        async () => {
          await page.getByRole('dialog').getByRole('button', { name: 'Record incident' }).click();
          await expect(page.getByText("Signed-in users currently see a banner with this incident's title and status.")).toBeVisible();
          incidentId = page.url().split('/').pop() ?? '';
        },
        { fullPage: true },
      );
      const learner = await person(browser, demo('learner'));
      try {
        await rec.step(
          'Another user sees the status banner',
          'Asha, an ordinary learner, opens the app and sees a warning banner at the top with the incident title and "The team is investigating". Internal details are never shown.',
          async () => {
            await learner.page.goto(`${BASE}/app`);
            await expect(learner.page.getByText(title)).toBeVisible();
          },
          { page: learner.page },
        );
        await rec.step(
          'Resolve the incident',
          'Priya sets the status to Resolved and saves. The change is added to the timeline automatically.',
          async () => {
            await page.getByLabel('Status').selectOption('resolved');
            await page.getByRole('button', { name: 'Save changes' }).click();
            await expect(page.getByText('Incident updated')).toBeVisible();
          },
          { fullPage: true },
        );
        await rec.step(
          'The banner is gone',
          "When Asha reloads, the banner no longer appears.",
          async () => {
            await expect
              .poll(async () => {
                await learner.page.reload();
                await learner.page.waitForLoadState('networkidle');
                return learner.page.getByText(title).count();
              }, { timeout: 30_000, intervals: [1000, 2000, 3000] })
              .toBe(0);
          },
          { page: learner.page },
        );
        await rec.check('Resolved incidents no longer appear in the site-wide banner', async () => {
          const r = await api(learner.page.request, 'get', '/api/admin/status-banner');
          expect(JSON.stringify(r.body)).not.toContain(title);
        });
      } finally {
        await learner.ctx.close();
      }
    } finally {
      // Never leave a high-severity banner behind for other scenarios.
      if (incidentId) await api(page.request, 'patch', `/api/admin/incidents/${incidentId}`, { status: 'resolved' }).catch(() => {});
    }
  },
);

// =====================================================================================
// Security and privacy
// =====================================================================================

scenario(
  {
    id: 'security-01-permission-boundaries',
    area: 'Security and privacy',
    title: 'Permission boundaries and tenant isolation',
    summary:
      'People only see what their role and organization allow. A student opening staff pages gets an access message instead of data; a teacher at another college and a recruiter at another company get "not found" for records that belong to someone else; an organization admin sees only their own organization\'s audit log.',
    roles: ['Student', 'Faculty (second college)', 'Recruiter (second company)', 'Organization admin'],
  },
  async (rec, { page, browser }) => {
    await login(page, demo('student'));
    await rec.step(
      'A student opens the Teach workspace',
      'Rohan types the address of the teaching area. The page frame loads, but instead of data it shows "You don\'t have access to this" and names the roles that are needed. The server refused the request.',
      async () => {
        await page.goto(`${BASE}/app/teach`);
        await expect(page.getByText("You don't have access to this")).toBeVisible();
      },
    );
    await rec.step(
      'A student opens the Admin area',
      'The same happens for the platform admin area: an access message, no counts, no user list.',
      async () => {
        await page.goto(`${BASE}/app/admin`);
        await expect(page.getByText("You don't have access to this")).toBeVisible();
      },
    );
    await rec.check('The server refuses staff data to a student (403)', async () => {
      expect((await api(page.request, 'get', '/api/admin/overview')).status).toBe(403);
      expect((await api(page.request, 'get', '/api/admin/users')).status).toBe(403);
    });

    const nb = await person(browser, demo('faculty'), { workspace: 'teach', orgName: 'Northbridge' });
    const list = await api(nb.page.request, 'get', '/api/teach/assignments');
    const nbAssignment = (list.body.items ?? list.body.assignments)[0] as { id: string; title: string };
    await nb.ctx.close();
    const rv = await person(browser, demo('faculty.riverside'), { workspace: 'teach', orgName: 'Riverside' });
    try {
      await rec.step(
        'Another college cannot open a Northbridge assignment',
        `Prof. Mensah teaches at Riverside College. Opening the exact address of a Northbridge assignment ("${nbAssignment.title}") shows "Assignment not found". The page does not even confirm that it exists.`,
        async () => {
          await rv.page.goto(`${BASE}/app/teach/assignments/${nbAssignment.id}`);
          await expect(rv.page.getByText('Assignment not found.')).toBeVisible();
        },
        { page: rv.page },
      );
      await rec.check('Cross-college request returns 404 and no Northbridge data', async () => {
        expect((await api(rv.page.request, 'get', `/api/teach/assignments/${nbAssignment.id}`)).status).toBe(404);
        await expect(rv.page.getByText(nbAssignment.title)).toHaveCount(0);
      });
    } finally {
      await rv.ctx.close();
    }

    const helixJob = await (async () => {
      const h = await person(browser, demo('recruiter'), HIRE);
      const jobs = await api(h.page.request, 'get', '/api/hire/jobs');
      await h.ctx.close();
      return (jobs.body.items as { id: string; title: string }[]).find((j) => j.title === 'Backend Engineer (Python)')!;
    })();
    const orbit = await person(browser, demo('recruiter.orbit'), { workspace: 'hire', orgName: 'Orbit' });
    try {
      await rec.step(
        'Another company cannot open a Helix job',
        'Mia Chen recruits for Orbit Systems. Opening a Helix Labs job address shows "Job not found". She cannot see Helix postings, candidates or decisions.',
        async () => {
          await orbit.page.goto(`${BASE}/app/hire/jobs/${helixJob.id}`);
          await expect(orbit.page.getByText('Job not found.')).toBeVisible();
        },
        { page: orbit.page },
      );
      await rec.check('Cross-company request returns 404', async () => {
        expect((await api(orbit.page.request, 'get', `/api/hire/jobs/${helixJob.id}`)).status).toBe(404);
      });
    } finally {
      await orbit.ctx.close();
    }

    const oa = await person(browser, demo('orgadmin'), CAMPUS);
    try {
      await rec.step(
        "An org admin sees only their organization's audit log",
        'Vikram administers Northbridge. His audit log lists only actions recorded in Northbridge (invitations, verifications, corrections, exports). He cannot open the platform-wide log.',
        async () => {
          await oa.page.goto(`${BASE}/app/admin/org-audit`);
          await expect(oa.page.getByRole('heading', { name: 'Organization audit log' })).toBeVisible();
          await expect(oa.page.getByText('Sensitive actions recorded in Northbridge Institute of Technology', { exact: false })).toBeVisible();
        },
        { page: oa.page, fullPage: true },
      );
      await rec.check("The org admin's audit log contains only Northbridge entries, and the platform log is refused", async () => {
        const me = await api(oa.page.request, 'get', '/api/auth/me');
        const nbId = me.body.memberships.find((m: { orgName: string }) => m.orgName.includes('Northbridge')).orgId;
        const log = await api(oa.page.request, 'get', '/api/admin/org-audit?pageSize=100');
        expect(log.status).toBe(200);
        expect(log.body.items.length).toBeGreaterThan(0);
        for (const e of log.body.items as { orgId: string | null }[]) expect(e.orgId).toBe(nbId);
        expect((await api(oa.page.request, 'get', '/api/admin/audit')).status).toBe(403);
      });
    } finally {
      await oa.ctx.close();
    }
  },
);

scenario(
  {
    id: 'security-02-privacy-sessions-deletion',
    area: 'Security and privacy',
    title: 'Privacy: your data, export, signing out other sessions, and account deletion with a grace period',
    summary:
      'A user reviews what data is stored and the retention rules, downloads a data export, signs out another browser (and we prove it is signed out), then requests account deletion with a type-to-confirm dialog, sees the grace period and cancels.',
    roles: ['Learner'],
  },
  async (rec, { page, browser }) => {
    const email = uniqueEmail('pat.privacy');
    const password = 'privacy-pass-2026';
    const reg = await api(page.request, 'post', '/api/auth/register', { name: 'Pat Privacy', email, password });
    expect(reg.status).toBe(201);
    await api(page.request, 'post', '/api/me/onboarding', { skip: true });
    const other = await person(browser, email, { password });
    try {
      await rec.step(
        'Settings, Privacy: your data',
        'Pat opens Settings, Privacy. "Your data" lists every category of stored records with counts, plus storage used. Everything listed is included in an export.',
        async () => {
          await page.goto(`${BASE}/app/settings/privacy`);
          await expect(page.getByText('Your data', { exact: true })).toBeVisible();
        },
        { fullPage: true },
      );
      await rec.step(
        'Retention rules',
        'Further down, "What happens when you delete your account" lists the documented retention rules: what is deleted, what is anonymized and what organizations must keep (never with your name or email), plus the grace period.',
        async () => {
          await page.getByText('What happens when you delete your account').scrollIntoViewIfNeeded();
        },
      );
      await rec.check('Data categories and retention rules are shown', async () => {
        await expect(page.getByText('What happens when you delete your account')).toBeVisible();
        await expect(page.getByText(/The grace period is currently \d+ day/)).toBeVisible();
      });
      await rec.step(
        'Request a data export',
        '"Request data export" builds a JSON archive in the background. The page updates by itself and shows a Download button when it is ready (usually under a minute).',
        async () => {
          await page.getByRole('button', { name: 'Request data export' }).first().click();
          await expect(page.getByText(/Download \(/).first()).toBeVisible({ timeout: 60_000 });
        },
      );
      await rec.check('The export is ready to download', async () => {
        await expect(page.getByRole('link', { name: /Download data export from/ }).first()).toBeVisible();
      });
      await rec.step(
        'Settings, Security: where you are signed in',
        'The Security page lists every active session with browser, device and last activity. "This device" marks the current one. Pat is also signed in on a second browser.',
        async () => {
          await page.goto(`${BASE}/app/settings/security`);
          await expect(page.getByText('This device')).toBeVisible();
        },
        { fullPage: true },
      );
      await rec.step(
        'Sign out all other sessions',
        '"Sign out all other sessions" asks for confirmation: every other browser and device is signed out right away, and this one stays signed in.',
        () => page.getByRole('button', { name: 'Sign out all other sessions' }).click(),
      );
      await rec.step(
        'The other browser is signed out',
        'After confirming, the other browser is no longer signed in: reloading it lands on the sign-in page.',
        async () => {
          await page.getByRole('dialog').getByRole('button', { name: 'Sign out others' }).click();
          await page.waitForTimeout(800);
          await other.page.goto(`${BASE}/app/settings/security`);
          await expect(other.page).toHaveURL(/\/login/);
        },
        { page: other.page },
      );
      await rec.check('The other session is really revoked on the server', async () => {
        expect((await api(other.page.request, 'get', '/api/auth/me')).body.user).toBeNull();
      });
      await rec.step(
        'Request account deletion',
        'Back on Privacy, "Delete my account" opens a dialog that asks for the password and for a confirmation phrase to be typed. The button stays disabled until both are correct.',
        async () => {
          await page.goto(`${BASE}/app/settings/privacy`);
          await page.getByRole('button', { name: 'Delete my account' }).click();
          const dialog = page.getByRole('dialog');
          await dialog.getByLabel('Password', { exact: true }).fill(password);
          await expect(dialog.getByRole('button', { name: 'Schedule deletion' })).toBeDisabled();
          const phrase = (await dialog.locator('label span.font-mono').first().innerText()).trim();
          await dialog.getByRole('textbox', { name: /to confirm/ }).fill(phrase);
          await expect(dialog.getByRole('button', { name: 'Schedule deletion' })).toBeEnabled();
        },
      );
      await rec.step(
        'Grace period',
        'After "Schedule deletion", a banner says the account is scheduled for deletion, with the exact date and a countdown. Until then everything can be undone.',
        async () => {
          await page.getByRole('dialog').getByRole('button', { name: 'Schedule deletion' }).click();
          await expect(page.getByText('Your account is scheduled for deletion')).toBeVisible();
        },
        { fullPage: true },
      );
      await rec.step(
        'Cancel the deletion',
        '"Cancel deletion" stops it. The account stays active and nothing was deleted.',
        async () => {
          await page.getByRole('button', { name: 'Cancel deletion' }).click();
          await expect(page.getByText('Deletion cancelled.', { exact: false })).toBeVisible();
        },
      );
      await rec.check('The account is active again', async () => {
        const me = await api(page.request, 'get', '/api/auth/me');
        expect(me.body.user.status).toBe('active');
      });
    } finally {
      await other.ctx.close();
    }
  },
);
