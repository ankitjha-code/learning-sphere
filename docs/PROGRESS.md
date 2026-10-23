# Build Progress Log

## 2026-10-22

**Foundation (done, tested)**: schema (~110 tables), auth with hashed sessions, CSRF origin checks, permissions helpers, audit log, Postgres job queue with retries/idempotency/stale recovery, notifications with honest email statuses (Brevo / Resend / SMTP), org members and invites, global search.

**Learning slice (done, tested)**: onboarding with plan generation, Skill DNA (evidence-weighted mastery, confidence, verified vs self-reported), roadmaps with timelines and prerequisite graph, topics with deterministic quizzes, reflections for outline topics, SM-2 spaced revision, explained recommendations (revision, prerequisite gaps, next topic, practice at the right difficulty, project, job gap, diagnostic), goals, dashboard, streaks with rest days.

**Learning library (done, verified)**: 90 skills, 27 complete tracks (204 topics, 972 quiz questions), 62 problems (48 coding with Python + JS reference solutions executed against every test, 14 SQL verified on PostgreSQL), 20 project templates. `npx tsx scripts/verify-content.ts`.

**Free services research**: docs/FREE_SERVICES.md (GitHub Models retired, Piston public closed, Render blocks SMTP, Gemini free tier trains on prompts).

**Completed feature work**: code execution + CodeLab; universal assessment engine; AI layer + Expert Council; files/library/create/workspace/settings/privacy; ProjectForge + portfolio; mentorship/community/motivation; platform admin + plans + job recovery; Teach + assignments; Career studio + job board.

**Next**: Campus placement and Hire (TalentBridge) once the assessment engine lands; integration (single migration regeneration, demo seed ordering, route/nav checks), end-to-end journey tests (Playwright), accessibility pass, docs (setup, deployment, operations, role matrix).

## Ports

The API defaults to **4317** and the web dev server to **5317** (4000/5173 were already in use on the development machine).

## Integration (2026-10-22, evening)

- All thirteen feature areas built and merged: code execution + CodeLab, universal assessment engine, AI layer + Expert Council, files/library/create/workspace/settings/privacy, ProjectForge + portfolio, mentorship/community/motivation, platform admin + plans + job recovery, Teach + assignments, Career studio + job board, Campus placement, TalentBridge hire.
- Single regenerated migration (142 tables) with a drift test.
- Fixes found during integration: array parameters in the recommender SQL; cross-org linking of assessments to job postings/drives; portfolio-to-resume evidence shape; question-bank crash and seven more disabled-query render crashes in dialogs; queries no longer pause offline; misleading "AI generated" badge.
- Verification: 284 API tests, 10/10 browser journeys on the production build, axe WCAG 2.2 AA scans clean for all roles in both themes, smoke crawl of ~90 pages.
- Unverified external URLs reported by content authors: Cloudflare Learning Center pages (403 to scripted requests), MDN Learn path, two Tech Interview Handbook deep links, linuxjourney.com, two MIT OCW course slugs, AWS Well-Architected, several Hugging Face Learn and Google ML Crash Course subpages. Spot-check these in a browser.

## 2026-10-23

- **Content**: all 27 learning paths are complete (204 topics, 972 quiz questions; no outline paths remain). 10 advanced DSA problems added (62 total), each with hidden tests whose expected answers come from an independent method. `scripts/verify-content.ts` passes. Go, Rust and Java lesson code was reviewed by hand only (no compiler on the build machine); C and C++ examples were compiled and run with sanitizers.
- **New features**: peer assessment (teach), real payments (Razorpay Payment Links and Stripe Checkout, hosted, signed webhooks, renewals), calendar sync (private ICS link plus Google and Outlook over OAuth with PKCE), market insights from the free job feeds compared with Skill DNA. Payments and calendar providers are tested with mocks; they have not been run against live test-mode traffic yet.
- **Redesign**: new visual system (ink rail, cobalt accent, Bricolage Grotesque display type, one radius scale, Nexus band hero on workspace homes) documented in docs/DESIGN_SYSTEM.md; every page polished for alignment, spacing and balanced layouts in light, dark and 390 px.
- **Bugs fixed**: correlated count subqueries bound to the inner table (Drizzle drops the table name in single-table selects), so roadmap topic counts, assessment counts, campus structure counts, employer drive counts and creator counts were wrong; fixed with `ref()` in server/lib/sql.ts and a regression test. Confirm dialogs announced their title twice to screen readers instead of their description. Code editors were not keyboard-scrollable when read-only. Org detail always reported demonstration billing mode.
- **Verification**: 367 API tests, 24/24 browser journeys and axe scans (all roles, both themes), report walkthroughs regenerated in reports/test-report/index.html.
