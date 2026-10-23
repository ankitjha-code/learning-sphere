# Free Services Matrix (zero cost, no credit card)

Verified 2026-10-22 against official docs and pricing pages where possible. **[U]** = not verified on an official page; recheck before relying on it. Free tiers change often (Gemini and GitHub both changed in 2026), so every provider in LearnSphere Nexus sits behind an environment variable or an admin setting, and the app keeps working when any one of them disappears.

## How LearnSphere Nexus uses this matrix

| Capability | Wired in code | Default when nothing is configured |
|---|---|---|
| AI chat (all specialists) | Gemini, Groq, OpenRouter, Cloudflare Workers AI, Mistral, Azure OpenAI (student credit), Ollama (optional local). All via one OpenAI-compatible client with ordered failover. | AI panels show "AI not configured" with setup steps. Learning, practice, grading and career tools keep working. |
| Code execution | In-process WebAssembly sandboxes: QuickJS for JavaScript/TypeScript, PGlite for SQL. Docker sandbox for Python, C, C++, Java, Go and Rust (local machine or any VM). Judge0 CE (RapidAPI free key or self-hosted). | JS/TS and SQL always run. Other languages are labeled "execution unavailable" with setup steps. Nothing is faked. |
| Email | Brevo HTTP API, Resend HTTP API, any SMTP (Gmail app password, Mailjet, Brevo SMTP, local Mailpit). | In-app notifications always work. Email deliveries are recorded as `not_configured`, never as sent. |
| Database | Embedded PGlite (local dev/test, zero setup) or any Postgres `DATABASE_URL` (Neon, Azure Flexible, Supabase, Aiven, Prisma Postgres). | PGlite in `./data/pglite`. |
| File storage | Stored in Postgres (`bytea`, 10 MB cap per file). Portable and backed up with the DB. | Same. |
| Job feed | Jobicy, Himalayas and Remotive, synced server-side a few times a day, cached with source credit and link-out. | Only user-entered applications and employer postings made on the platform. No generated vacancies. |
| Meetings | Jitsi link-out (`meet.jit.si/<random room>` opened in a new tab). | Same; interviewers may also paste their own meeting link. |
| Calendar sync | Private ICS subscription feed (any calendar app). Direct push to Google Calendar API and Microsoft Graph via OAuth 2.0 + PKCE, plain fetch. | ICS link works everywhere with no keys. Google / Outlook panels show "Not configured on this server" with setup steps. |
| Payments (plans) | Razorpay Payment Links (India, INR) and Stripe Checkout (international), both on the provider's hosted page via plain REST calls. Test keys are free and need no card. | Demonstration mode: nothing can be bought, platform admins assign plans for free, and every screen says so. |

## Changes since 2025 that affect the plan

1. **GitHub Models is retired** (2026-07-30) for every customer: playground, catalog, `models.github.ai` inference API, BYOK. Not wired. ([changelog](https://github.blog/changelog/2026-07-30-github-models-is-now-retired/))
2. **Gemini free tier has no published RPM/RPD numbers**; limits are shown per project in AI Studio. 2.5 models only for accounts that already used them; new projects use `gemini-3.5-flash-lite` / `gemini-3.8-flash`. **Free-tier prompts are used for training and may be read by human reviewers; the Gemini terms say apps serving EEA users must use paid services.** The admin AI settings page shows this warning.
3. **Piston public API (emkc.org) closed 2026-02-15**: token only, for non-commercial educational projects. Not wired.
4. **SendGrid free plan ended May 2025** (60-day trial only).
5. **Cerebras requires a payment method.** Excluded.
6. **Hugging Face free accounts get no monthly Inference credits.** Excluded.
7. **No card-free hosting:** Fly.io, Koyeb, Cloud Run, Railway (trial only).
8. **DigitalOcean $200 is no longer on the Student Pack page** [U end date]. Heroku student credit requires a card.
9. **Render Free blocks outbound ports 465 and 587**: use HTTP email APIs (Brevo/Resend) there, not SMTP.

## 1. LLM APIs

| Service | Free / limits | Card? | Gotchas | Verified URL |
|---|---|---|---|---|
| **Google Gemini (AI Studio)** | Free: `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3-flash-preview`, 2.5 (existing users only), `gemini-embedding-001`, Gemma 4. No official RPM/RPD table; forum reports 3.8-flash about 20 RPD, Flash-Lite about 500 RPD [U]. Per project, reset at midnight Pacific. | No | Training use + human review on free tier; EEA apps must use paid. | ai.google.dev/gemini-api/docs/pricing, /rate-limits, /models, /openai |
| GitHub Models | **Retired 2026-07-30** | – | – | github.blog changelog |
| **Azure OpenAI / Foundry (Azure for Students)** | Not free: pay-per-token from the **$100 credit** (12 months, renewable while a student). Tier 0 quotas: `gpt-4.1-mini` 200 RPM / 200K TPM, `gpt-5-mini` 500 RPM / 500K TPM. Student subs often get low/zero TPM on some models [U]. | No | Credit, not a free tier; subscription disables when credit ends (no surprise bill). | azure.microsoft.com/en-us/free/students, learn.microsoft.com/azure/foundry/openai/quotas-limits |
| **Groq** | `openai/gpt-oss-120b`, `openai/gpt-oss-20b`: 30 RPM / 1K RPD / 8K TPM / 200K TPD. `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` listed, limits not shown [U]. | No [U] | Per org limits; preview models can vanish. | console.groq.com/docs/rate-limits |
| **OpenRouter `:free`** | 20 RPM; 50 req/day (1,000/day only after buying 10+ credits). | No | Free model list changes; some providers log prompts. | openrouter.ai/docs/api-reference/limits |
| **Cloudflare Workers AI** | 10,000 Neurons/day, resets 00:00 UTC; fails after, no charge. | Workers Free: commonly no [U] | Small models only. | developers.cloudflare.com/workers-ai/platform/pricing |
| **Mistral "Experiment"** | Free API plan; about 1 req/s [U]. | No [U] | Phone verification; may train on requests (opt-out available). | docs.mistral.ai |
| Cerebras | $5 trial | **Yes** | Excluded | inference-docs.cerebras.ai |
| Hugging Face Inference | No free credits | Must buy | Excluded | huggingface.co/docs/inference-providers/pricing |

Embeddings: `gemini-embedding-001` (`output_dimensionality: 768`), backup Cloudflare `@cf/baai/bge-base-en-v1.5` (768). LearnSphere uses Postgres full-text search for retrieval by default, so embeddings are optional.

```
gemini     https://generativelanguage.googleapis.com/v1beta/openai/   Bearer GEMINI_API_KEY      gemini-3.5-flash-lite, gemini-3.8-flash
groq       https://api.groq.com/openai/v1                             Bearer GROQ_API_KEY        openai/gpt-oss-120b, llama-3.3-70b-versatile
openrouter https://openrouter.ai/api/v1                               Bearer OPENROUTER_API_KEY  openrouter/free, google/gemma-4-31b-it:free
cloudflare https://api.cloudflare.com/client/v4/accounts/<id>/ai/v1   Bearer CF_API_TOKEN        @cf/meta/llama-3.1-8b-instruct
mistral    https://api.mistral.ai/v1                                  Bearer MISTRAL_API_KEY     mistral-small-latest [U]
azure      https://<resource>.openai.azure.com/openai/v1/             api-key AZURE_OPENAI_API_KEY  <deployment name>
ollama     http://localhost:11434/v1                                  (none)                     llama3.2, qwen2.5-coder (optional local)
```

## 2. Postgres hosting

| Service | Free limits | Card? | Gotchas |
|---|---|---|---|
| **Neon Free** | 1 GB/project, 100 CU-hours/project/month, 5 GB egress. Permanent. | No | Scale-to-zero after 5 min (cold start). Use `-pooler` host for app, direct host for migrations. |
| **Azure PostgreSQL Flexible (Students)** | 750 h/month B1MS, 32 GB storage, 12 months | No | Only B1MS, no HA. Disabled when credit/12 months end. |
| Supabase Free | 500 MB, 2 projects | [U] | Paused after 1 week inactivity; direct host IPv6-only, use pooler. |
| Prisma Postgres Free | 200K ops/month, 2 GB | No | Polling worker can burn the ops quota. No backups. |
| Aiven Free | 1 GB disk, 20 connections | No | May power off when inactive. |
| Render Free PG | 1 GB | No | **Expires after 30 days.** Avoid. |

## 3. App hosting (long-running Node server with in-process worker)

| Service | Free | Card? | Gotchas |
|---|---|---|---|
| **Azure Container Apps (Students)** | 180K vCPU-s, 360K GiB-s, 2M requests/month | No | Best fit. Always-on replica exceeds grant slightly (paid from credit) [U estimate]. |
| Azure App Service F1 | 60 CPU-min/day, 1 GB RAM | No | No Always On; demo only. |
| **Render Free** | 750 h/month | No | Sleeps after 15 min idle (~1 min wake). No free background workers. Ephemeral disk. SMTP ports blocked. |
| GitHub Codespaces | 120 core-hours (Pro via Student Pack: 180 [U]) | No | 30-min idle timeout; live demos only. |
| Koyeb, Fly.io, Railway, Cloud Run | – | Yes / trial | Excluded |

## 4. Code execution

| Service | Status | Card? | Notes |
|---|---|---|---|
| **Built-in QuickJS (WASM)** | Always on | – | JavaScript/TypeScript; memory + time limits; no host access. |
| **Built-in PGlite (WASM)** | Always on | – | SQL practice; fresh database per run in a worker thread. |
| **Docker sandbox** | Local machine or any VM with Docker | – | `--network none`, read-only FS, memory/CPU/pids limits, non-root, dropped capabilities. |
| **Judge0 CE on RapidAPI (Basic)** | Free plan exists; quota about 50/day reported [U] | Usually none [U] | `X-RapidAPI-Key`, host `judge0-ce.p.rapidapi.com`. |
| Judge0 self-hosted | Free (GPLv3) | – | Needs cgroup v1 VM (e.g. small Azure VM from credit). |
| Piston public | **Closed 2026-02-15** | – | Not usable. |

## 5. Email

| Service | Free | Card? | Notes |
|---|---|---|---|
| **Brevo** | 300 emails/day | No per marketing pages; conflicting summary [U] | HTTP `POST https://api.brevo.com/v3/smtp/email`, header `api-key`. Verified sender. |
| **Mailjet** | 6,000/month, 200/day | No | SMTP `in-v3.mailjet.com:587` or HTTP. |
| **Resend** | 3,000/month, 100/day | Not stated | Needs a verified domain (free domain via Student Pack). |
| Gmail SMTP | ~500/day | No | App Password; not for bulk; blocked on Render Free. |
| SendGrid | No free plan | – | Excluded |
| Azure Communication Services | From credit | No | Managed domain capped at 10/hour. |

## 6. Object storage (optional; default is Postgres)

Backblaze B2 (10 GB, no card), Supabase Storage (1 GB), Azure Blob (credit). Cloudflare R2 effectively needs a payment method [U].

## 7. Job APIs

| API | Endpoint | Terms |
|---|---|---|
| **Jobicy** | `GET https://jobicy.com/api/jobs?count=50&tag=python` | Commercial use, caching allowed. Credit Jobicy, link Apply to Jobicy. Sync at most hourly. |
| **Himalayas** | `GET https://himalayas.app/jobs/api?limit=20` | Visible link to Himalayas; don't alter apply link; remove expired jobs; backend only. |
| **Remotive** | `GET https://remotive.com/api/remote-jobs?category=software-dev&limit=50` | **Max 4 fetches/day**; credit + link Remotive; listings must not be behind signup. |
| Arbeitnow, RemoteOK, The Muse | public | Link back required. |
| Adzuna | free key | Commercial use limited to 14-day trial. Avoid. |

Because Remotive forbids putting listings behind signup, the public job board page (`/jobs/feed`) is viewable without an account.

### Market insights method (`/app/career/market`, `server/modules/market`)

- **Sources**: postings already cached from the feeds above (`external_jobs`, each with source and fetch time) and jobs published on this platform (`job_postings`, labelled "On this platform"; postings of sample orgs count as sample). No other labor-market source is used. Adzuna is excluded (commercial use limited to a trial).
- **No extra API calls**: insights never call a provider. "Fetch latest postings now" (platform admins) runs the existing `syncFeed`, so every provider's rate limit still applies (Remotive at most 4 per day).
- **Daily snapshots** (`market.snapshot` job, idempotent per day; also recomputed on read when a feed run finished after the last snapshot): each posting is counted once, on its publish date (or first fetch when the date is missing), per source: posting count, remote count, role bucket from the title, company, and skills mentioned. Rows keep only short hashes of posting ids for de-duplication, never posting text or links, so history survives after a feed drops expired postings.
- **Skills** are detected with the deterministic career extractor (`career/extract.ts`) over title, tags and description. Vague single words ("security", "cloud", "testing", "collaborate"...) do not count on their own.
- **Shares** are postings mentioning a skill divided by postings in the period. **Trends** are shown only when both periods have at least 30 postings, and are called up or down only when a two-proportion test passes (|z| >= 1.96) and the change is at least 2 points; otherwise "No clear change" or "not enough data to show a trend".
- **Provenance**: every response carries `basedOn` (sources, posting count, publish and fetch date range, generated time) and plain-English `caveats`. When no successful fetch happened in the last 36 hours the figures are labelled historical. Nothing is estimated. With no postings the API returns an empty state, not zeros.
- **Sample data** (`market_sample_postings`, source `sample`) is used only when no real postings exist in the period, never mixed with real data, and labelled "Sample data" everywhere.

## 8. Video meetings

meet.jit.si link-out (embedding limited to 5 minutes; moderator may need to log in [U]). LiveKit Cloud Build (5,000 min/month, no card) is the embeddable option if needed later.

## 8a. Calendar sync

| Service | Free / limits | Card? | Gotchas |
|---|---|---|---|
| **ICS subscription (RFC 5545)** | No provider account needed | No | Google refreshes subscribed URLs only every few hours (up to about a day) [U exact interval]; Outlook similar. The feed URL must be publicly reachable for Google/Outlook. |
| **Google Calendar API** | Free; default quota about 1,000,000 queries/day per project and per-user per-minute limits [U current numbers] | No (no billing account needed) | OAuth consent screen in **Testing** mode: only listed test users (up to 100) can connect, and refresh tokens expire after 7 days. Scope `calendar.app.created` limits access to calendars the app created. |
| **Microsoft Graph (Outlook calendar)** | Free with an Entra app registration; throttling returns 429 with Retry-After (honoured) | No | Needs a Microsoft Entra tenant to register the app (a free Azure account or Azure for Students includes one) [U for personal-account-only users]. `Calendars.ReadWrite` is the narrowest write permission. |

Env vars: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `MS_OAUTH_CLIENT_ID`, `MS_OAUTH_CLIENT_SECRET`, `MS_OAUTH_TENANT` (default `common`). Redirect URIs: `<APP_URL>/api/calendar/oauth/google/callback` and `<APP_URL>/api/calendar/oauth/microsoft/callback`. Step-by-step setup: `docs/SETUP.md`, Calendar sync.

## 9. GitHub Student Developer Pack (relevant)

Azure for Students ($100/12 months, no card): main credit. Free domains (Name.com, .TECH, Namecheap .me): unlock Resend. Sentry (50K errors/1 year) for error monitoring. Codespaces Pro for demos. Heroku requires a card; DigitalOcean credit no longer listed.

## 10. Payments (optional; free test mode)

Plans can be paid for real when a provider is configured (see `docs/DEPLOYMENT.md`, Payments). Nothing about payments is required to run the project.

| Provider | Free to start | Card needed to sign up | What we use | Notes |
|---|---|---|---|---|
| **Razorpay** (India) | Test mode is free and available right after sign-up; live mode needs business KYC/activation. No monthly fee; a per-transaction fee applies only to live payments [U]. | No | Payment Links REST API (hosted page), webhooks, signed callback | Charges in INR by default. `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. |
| **Stripe** (international) | Test mode is free and available right after sign-up; live mode needs account activation. No monthly fee; per-transaction fees on live payments only [U]. | No | Checkout Sessions REST API (hosted page), webhooks | Charges in USD by default. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. New India-based businesses may not be able to activate live Stripe [U]; use Razorpay there. |

Rules the code follows: amounts come from the server-side plan price only; a payment counts only after a signature-verified webhook, a signature-verified Razorpay callback or a server-side status fetch; we keep a "Payment record" with the provider reference and link to the provider's receipt, but never generate invoices; test keys (`rzp_test_`, `sk_test_`) show "Test mode: no real money moves" everywhere; refunds are made in the provider dashboard and recorded from webhooks. No provider script is loaded in the app, so the strict CSP stays unchanged and card data never touches our server.

## Recommended default stack

| Layer | Primary | Backups |
|---|---|---|
| AI chat | Gemini `gemini-3.5-flash-lite` (volume), `gemini-3.8-flash` (quality) | Groq `openai/gpt-oss-120b` → OpenRouter `openrouter/free` → Cloudflare Workers AI → Azure OpenAI from student credit |
| Database | Neon Free | Azure PG Flexible B1MS (Students), Aiven, Supabase |
| Hosting | Azure Container Apps (Students) | Render Free (accept sleep), Codespaces for demos |
| Email | Brevo HTTP API | Mailjet, Resend (with domain), Gmail SMTP for local dev |
| Code execution | Built-in QuickJS + PGlite, Docker sandbox on host/VM | Judge0 CE RapidAPI Basic, self-hosted Judge0 on an Azure VM |
| Jobs feed | Jobicy + Himalayas | Remotive (4/day) |
| Meetings | Jitsi link-out | LiveKit Cloud Build |

## Still unverified (recheck before launch)

Gemini per-model RPM/RPD; whether EEA rule covers UK/CH; Groq free limits per model and card requirement; Mistral limits; Cloudflare Workers Free card requirement; Azure for Students OpenAI quota per region; Supabase card requirement; Judge0 RapidAPI daily quota; Brevo card requirement; R2 card requirement; Jitsi moderator-login rule; Codespaces Pro via the pack.
