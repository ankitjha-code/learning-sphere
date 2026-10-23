# LearnSphere Nexus

One connected workspace to learn, build, prove skills and get hired.

LearnSphere Nexus takes a person from a goal to a job offer. Learners follow adaptive roadmaps, practice in a real code sandbox, build projects and earn evidence. Colleges teach and run placement drives. Recruiters hire against demonstrated skills. Everything feeds one evidence model, so nobody has to re-enter what they've already shown.

## What makes it different

1. **Skill DNA.** Every topic quiz, CodeLab submission, assessment, project review and mentor note adds evidence to a living map of 90 skills. Mastery is weighted by evidence strength and freshness. A skill is only marked *verified* when deterministic grading or an authorized human produced the evidence. Self-ratings and AI output never verify anything.
2. **The learn → build → hire loop.** A weak skill leads to targeted lessons and practice at the right difficulty. A demonstrated skill leads to a project. A completed project becomes portfolio evidence, and that evidence shapes job matches. Every recommendation says why it was made.
3. **One assessment engine.** The same engine runs personal practice, diagnostics, college exams, recruiter screening and placement tests. Each mode has its own permissions, release policy and grading rules. Objective and code answers are graded deterministically; written answers get human review, optionally assisted by AI proposals that never set a score.

## Highlights

- **Learning:** 27 roadmaps (179 topics) across programming, web, DSA, design, system design, databases, CS fundamentals, DevOps, AI/ML, math, quality, collaboration and careers. Prerequisite graphs, timelines, five learning modes, SM-2 spaced revision.
- **CodeLab:** 52 problems (38 coding, 14 SQL). Every reference solution is executed against every test. JavaScript, TypeScript and SQL run in built-in WebAssembly sandboxes; Python, C, C++, Java, Go and Rust run in locked-down Docker containers or Judge0. Algorithm visualizers are included.
- **AI Expert Council:** 21 specialist assistants with routing, retrieval with citations, quotas, evaluations and failover across free providers (Gemini, Groq, OpenRouter, Cloudflare, Mistral, Azure OpenAI, Ollama). Everything works with no AI configured.
- **Workspaces:** Learn, Career, Teach, Campus, Hire, Mentor, Create and Admin, with strict multi-tenant isolation.
- **Career Launch Studio:** resumes, honest document generation, job-description gap analysis, application tracker, interview practice and offer comparison. Platform job postings plus attributed public job feeds.
- **Trust:** audit log, privacy self-service (export, deletion with retention rules), safe background jobs with operator recovery, honest delivery statuses, and sample data always labeled.

## Quick start

```bash
pnpm install
pnpm dev          # web http://localhost:5317 · API http://localhost:4317
```

No database server, keys or accounts are needed. Sign in with a one-click demo account (password `Demo-pass-2026`). To enable AI, email or more languages, see [docs/SETUP.md](docs/SETUP.md).

```bash
pnpm test         # API tests
pnpm typecheck
pnpm build && pnpm start
pnpm e2e          # browser journeys (after pnpm build)
```

## Documentation

| Doc | What's in it |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Install, demo accounts, optional AI/email/execution, troubleshooting |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Zero-cost deployment (Azure for Students + Neon), Render alternative, backups, rollback |
| [docs/FREE_SERVICES.md](docs/FREE_SERVICES.md) | Verified free tiers and their limits (checked Oct 2026) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Structure, security model, honesty rules, conventions |
| [docs/ROLE_MATRIX.md](docs/ROLE_MATRIX.md) | Every role and what it can do |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Health, job recovery, email, AI, data protection, limits |
| [docs/FEATURE_INVENTORY.md](docs/FEATURE_INVENTORY.md) | Every requirement with its status, including what is partial or unavailable |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Build log |

## Tech

TypeScript end to end. Hono API, Drizzle ORM, PostgreSQL (embedded PGlite for development and tests), React 19, Vite, Tailwind CSS 4, Radix primitives, TanStack Query, CodeMirror, QuickJS and PGlite sandboxes, Vitest and Playwright. All open source; no paid services are required.
