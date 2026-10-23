# Feature Inventory

Every requirement from the product brief, with its status as of 2026-10-22. Nothing is omitted silently: if something is partial or unavailable, it says so here and why.

**Status key**
- `done`: built, and covered by automated tests (API and/or browser).
- `partial`: usable, with the stated gap.
- `external`: built and labeled honestly, but going live needs a third-party key or service you configure (free options in `docs/FREE_SERVICES.md`).
- `not built`: not implemented; reason given.

**Verification at a glance**
- 284 API tests across 25 files (`pnpm test`).
- All ten required journeys pass in a real browser against the production build on a fresh database (`pnpm e2e`).
- Automated WCAG 2.2 A/AA scans (axe-core) pass with no serious/critical issues on representative pages for every role, in light and dark themes.
- Smoke crawl of ~90 pages across 10 roles: no console errors, crashes or failing API calls (`node scripts/crawl.mjs`).
- Learning library verified by executing every reference solution (`pnpm verify:content`).
- Migration drift test keeps the database migration identical to the TypeScript schema.

## Foundation, security and operations (§2, §23, §24, §28)

| Item | Status | Notes |
|---|---|---|
| Registration, login, logout, sessions (hashed tokens, HttpOnly cookies, 14-day sliding) | done | |
| Session list and revocation (one / all others); password change signs out others | done | Journey 10 E2E |
| Password reset by email; admin-generated single-use reset link when email is off | done / external | Self-service email needs a provider |
| Login lockout, per-IP rate limits | partial | In-memory: correct for one instance; move to Postgres/Redis before scaling out |
| CSRF origin checks, security headers, strict CSP (no inline scripts) | done | |
| Authorization on every protected resource; tenant isolation | done | Isolation tests in every module + Journey 7 E2E |
| Multi-role users; workspace switching never grants permissions | done | |
| Organization members, invitations (link shown when email is off), role management | done | |
| Audit log for sensitive actions, viewer, CSV export; org-admin view of own org | done | |
| Background job queue: retries with backoff, idempotency keys, stale-lock recovery, admin retry/cancel/bulk retry | done | Journey 9 E2E |
| Files stored in Postgres with type sniffing, size and quota limits, delegated access checks | done | 10 MB per file, 200 MB per user (configurable) |
| Error handling: request ids, no internals leaked | done | |
| Feature flags, platform settings (retention, signup open/closed, storage quota) | done | |
| Incidents with timeline and user-facing status banner | done | |
| System health page (DB latency, worker, queue, email, AI, code runtimes, storage) | done | |
| Backups and restore | partial | Documented `pg_dump`/`pg_restore` procedure; not automated (your Postgres host's backups apply) |
| Deployment: Dockerfile, Azure Container Apps + Neon guide, Render alternative, rollback | done | Not deployed from here; you deploy with your Azure for Students account |
| Error monitoring service (e.g. Sentry) | not built | Logs carry request ids; Sentry is available free via the Student Pack if wanted |

## Product identity and experience (§3, §21, §26)

| Item | Status | Notes |
|---|---|---|
| Role-aware dashboards per workspace | done | Learn, Career, Teach, Campus, Hire, Mentor, Create, Admin |
| Global search across authorized content + command palette (Ctrl/⌘K) | done | |
| Notification center (bell + full page, categories, per-category preferences, delivery status) | done | |
| Personal workspace: notes, tasks, calendar (tasks, deadlines, invites, interviews, sessions, milestones), saved links, bookmarks, files, import/export | done | |
| Light/dark/system themes, reduced motion, accessible typography | done | |
| Onboarding that learns goals, skills, education, style, time; skippable | done | Journey 1 E2E |
| Responsive layouts (desktop, tablet, phone) | done | Drawer navigation, tabbed CodeLab on phones |
| WCAG 2.2 AA | partial | Automated scans pass for all roles; a full manual screen-reader audit has not been done |
| Internationalization | partial | Locale and timezone stored and used for dates/streaks; UI text is English only |

## Onboarding and personal intelligence (§5)

| Item | Status | Notes |
|---|---|---|
| Plan generation: enrollments, career/milestone/weekly/daily goals | done | |
| Living profile: self-declared, assessed, project-demonstrated, reviewer-confirmed, learning, needs revision | done | Skill DNA states |
| Evidence, confidence and last verification per skill; AI/self never "verified" | done | |

## Adaptive learning and roadmaps (§6)

| Item | Status | Notes |
|---|---|---|
| All listed learning categories | done | 90-skill graph across 14 categories |
| Complete paths (lessons + quizzes) | done | All 27 paths complete: 204 topics, 972 quiz questions, worked lessons with common mistakes, free resources and CodeLab practice links. `scripts/verify-content.ts` checks every path. Go, Rust and Java lesson code was reviewed by hand only (no compiler on the build machine); C/C++ examples were compiled and run with sanitizers |
| Prerequisites, objectives, explanations, examples, practice, quizzes, projects, revision, milestones, completion criteria | done | |
| Learning modes: guided, independent, intensive, interview, project-first | done | |
| Gap detection, prerequisite diagnosis, difficulty adjustment, spaced revision, forgetting detection, acceleration, meaningful-only progress, overrides, explanations | done | Recommendation engine; every suggestion states why |
| Prerequisite graph, timeline, daily/weekly goals, milestones, effort, history | done | |
| Diagnostics (Python, DSA, SQL) | done | Public diagnostics in the assessment engine |
| Org-authored learning paths (versioned publish) | done | Create workspace |

## AI Expert Council (§7, §8)

| Item | Status | Notes |
|---|---|---|
| 21 specialist assistants, unified entry with transparent keyword routing | done | |
| Free providers: Gemini, Groq, OpenRouter, Cloudflare Workers AI, Mistral, Azure OpenAI (student credit), Ollama; ordered failover, circuit breaker, timeouts | external | Needs at least one key. GitHub Models is retired (July 2026) and not included. Not yet exercised against a live provider from this environment |
| Streaming chat, sources/citations from authorized retrieval, feedback and reporting | done (logic) / external (live) | |
| Per-user/per-org quotas, usage accounting (tokens estimated when providers don't report), quota warnings | done | |
| Evaluation datasets and repeatable runs | done | Run from Admin → AI providers → Evaluations |
| Prompt-injection defenses, redaction, no autonomous actions | partial | Best-effort filtering and fencing; documented that no complete defense exists |
| Fallback when unavailable; product fully usable without AI | done | Journey 8 E2E (simulated outage) |
| AI in features: hints, complexity estimates, grading proposals, README/requirements review, resume/document review, JD extraction | done (honest ok:false without a provider) | Proposals never set grades or verify skills |

## Knowledge hub (§9)

| Item | Status | Notes |
|---|---|---|
| Library: 74 curated resources (66 external with attribution, 8 original cheat sheets), filters, full-text search, bookmarks, collections, ratings, correction reports, history, related/prerequisite resources | done | 7 external URLs could not be re-verified at build time (listed in PROGRESS.md) |
| Org libraries; creator publishing with versions and moderation review | done | |
| Personal knowledge base from uploaded txt/md/pdf, used privately by the study assistant | done | |

## CodeLab (§10)

| Item | Status | Notes |
|---|---|---|
| Editor, language selector with real availability, problems, examples, constraints, visible/hidden tests, history, drafts | done | 38 coding + 14 SQL problems |
| Real execution: JavaScript/TypeScript (QuickJS WASM), SQL (PGlite) | done | Always available |
| Python, C, C++, Java, Go, Rust in locked-down Docker containers | partial | Python verified end to end; other language recipes written but untested here (images not pulled). Needs Docker on the host |
| Judge0 (self-hosted or RapidAPI free) | external | Adapter built; not tested against a live instance |
| Progressive hints, solution gating, complexity (author-stated + labeled AI estimate) | done | Journey 3 E2E |
| Algorithm visualizers (sorting, binary search, BFS) | done | |
| Debugging challenges, predict-the-output, API design, unit-testing, refactoring, Git exercises | partial | Debugging/predict-output can be authored as problems/questions; no dedicated exercise types or seeded sets yet. Git learning is a complete roadmap |
| Company-style tracks | not built | Deliberately: no lawful company question sets available. Topic and interview collections instead |

## Universal assessment engine (§11)

| Item | Status | Notes |
|---|---|---|
| Single, multi, true/false, matching, fill-blank, short/long text, coding, SQL | done | |
| File answers | partial | Submitted as a link field (labeled) |
| Oral / interview-based | partial | Typed key points graded manually |
| Peer assessment | done | Per-assignment peer rounds (individual or team), balanced allocation, anonymous rubric reviews, 24 h reminders, outlier/short/copied-comment flags, instructor exclude/reassign/reopen/release, optional audited peer component added as a new evaluation. Deadlines appear in the calendar |
| Banks, versioning, retire, blueprints/random draws, time limits, attempts, windows, autosave, recovery, submit confirmation, accommodations | done | |
| Hidden keys and tests never sent to candidates | done | Tested |
| Deterministic and execution grading, partial credit, manual grading, moderation with reasons, regrades/appeals, release policies, analytics, CSV export | done | |
| AI grading proposals requiring human acceptance | done | |
| Practice, diagnostic, classroom, recruitment and placement modes on one engine | done | |

## Assignments (§12)

| Item | Status | Notes |
|---|---|---|
| Full lifecycle, rubrics (versioned), late policies, drafts with autosave, receipts, evaluation queue, rubric feedback, private comments, clarifications, regrades, re-evaluation history, teams, resubmission versions, reports | done | Journey 2 E2E |
| Similarity indicators within the assignment's own submissions, worded as "not proof" | done | Text answers only; files and links are not compared |
| Academic integrity reports with decisions | done | |

## ProjectForge and portfolio (§13, §14)

| Item | Status | Notes |
|---|---|---|
| 20 templates across all categories including capstones; guided/partial/independent modes | done | |
| Requirements, milestones, kanban, team, docs (architecture, data model, API, tests, deployment, retro), issues, reviews, screenshots, sharing, README/case study generation (deterministic + optional AI) | done | |
| Reviewer approval creates verified evidence; self-completion is unverified | done | |
| Portfolio: public/unlisted/private, revocable share links, sections, versions, provenance labels, print/"Save as PDF" | done | No server-side PDF engine (stated in UI) |
| Platform completion certificates with public verification; no accreditation claims | done | |

## Career Launch Studio and job board (§15)

| Item | Status | Notes |
|---|---|---|
| Resume builder, versions, tailoring (reorders only), import with per-field confirmation, rule-based proofreading, export | done | No spell checker |
| Cover letters and other documents with placeholders for missing facts (never invented) | done | |
| JD analysis, skill-gap report vs Skill DNA, targeted plan, readiness checklist | done | |
| Application tracker, rounds, contacts, reminders, calendar, analytics, comparisons | done | |
| Interview prep with structured feedback, mock interviews, revision plan | done | |
| Offer comparison with weighted priorities; growth journal | done | |
| Platform job postings; apply with resume snapshot and consented portfolio sharing | done | |
| Public job feeds (Jobicy, Himalayas, Remotive) with attribution and rate limits | external | Built with mocked tests; live fetching not exercised here |

## TalentBridge (§16)

| Item | Status | Notes |
|---|---|---|
| Company profile, jobs lifecycle with publish checklist and plan limits, configurable stages | done | |
| Pipeline with audited decisions and reasons; candidate notified respectfully | done | Journey 4 E2E |
| Explainable matching on stated requirements; protected attributes stripped; never auto-reject | done | Tested |
| Consent-based candidate search (opt-in discoverability) | done | |
| Assessments, interviews (Jitsi link-out) with blind feedback, offers, messaging, analytics, CSV exports | done | |

## Campus (§17)

| Item | Status | Notes |
|---|---|---|
| Departments, programs, terms, batches, student records (CSV import never creates accounts), verification, corrections | done | |
| Eligibility that never treats missing data as ineligible | done | Journey 5 E2E |
| Employers, drives, invitations, placement assessments, interviews, outcomes, funnel and readiness reports, CSV exports | done | |
| Mentorship assignments from campus | not built | Mentorship exists separately |

## Mentorship, community, motivation (§18, §19)

| Item | Status | Notes |
|---|---|---|
| Mentor profiles (approval), discovery, requests with consent toggles, goals, activities, sessions with Jitsi links, shared vs private notes, messages, feedback | done | Journey 6 E2E |
| Spaces, Q&A with accepted answers and votes, private questions, study groups, team formation, events, showcases, reputation, reports, blocks, moderation, anti-spam | done | Shared notes are last-write-wins (no real-time co-editing) |
| Goals, streaks with rest days, XP for substantive work only, levels, achievements, challenges, opt-in leaderboards, accountability partners, journals, gentle reminders | done | |

## Analytics (§20)

| Item | Status | Notes |
|---|---|---|
| Learner, faculty, college, recruiter and admin analytics from real records, each metric defined, no causal claims | done | Computed on demand; fine at college/company scale, would need caching for very large orgs |
| External labor-market data | done | Market insights (`/app/career/market`): skill share, role mix, companies and weekly volume from the free public job feeds (Jobicy, Himalayas, Remotive) plus platform postings, daily snapshots, trends only when statistically meaningful, compared with your Skill DNA. Remote-only bias and keyword limits are stated on the page. Sample data is labeled and never mixed with real data |

## Communication (§22)

| Item | Status | Notes |
|---|---|---|
| In-app notifications for all workflow events, preferences, unsubscribe per category | done | |
| Email with honest delivery status and retries | external | Brevo/Resend/SMTP; `not_configured` until set |
| Calendar sync (Google/Outlook) | done / external | Private ICS subscription link (works with any calendar, no setup). Direct push to Google Calendar and Outlook over OAuth with PKCE once free OAuth clients are configured; tested against a fake provider, not yet against the live APIs |
| Video calls | external | Jitsi link-out (free); embedding not attempted |

## Billing and entitlements (§25)

| Item | Status | Notes |
|---|---|---|
| Plans, entitlements, usage counters and limits | done | Enforced for job postings, AI quotas, storage; other limits shown but not enforced everywhere yet |
| Payments | done / external | Razorpay Payment Links and Stripe Checkout (hosted pages, no card data on our server), signed webhooks, renewals with grace period, cancel at period end, refunds recorded. Free test-mode keys; without keys the labeled demonstration mode remains. Tested with mocked providers, not yet against live test-mode traffic |

## Journeys (§29)

| Journey | Status |
|---|---|
| 1 Student → job-ready developer | done (browser E2E) |
| 2 Assignment and grading with re-evaluation | done (browser E2E) |
| 3 AI-assisted coding improvement with real execution | done (browser E2E; AI hint shown as unavailable without a provider) |
| 4 Recruiter hiring workflow | done (browser E2E) |
| 5 College placement drive | done (browser E2E) |
| 6 Mentor-guided improvement | done (browser E2E) |
| 7 Enterprise tenant isolation | done (browser E2E + API tests in every module) |
| 8 AI provider outage | done (browser E2E with a simulated unreachable provider) |
| 9 Failed background task recovery | done (browser E2E) |
| 10 Privacy and account lifecycle | done (browser E2E + full deletion job in API tests) |
