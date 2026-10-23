# Setup Guide

This gets LearnSphere Nexus running on a fresh machine with **no accounts, no keys and no database server**. Every external service is optional and can be added later.

## 1. Requirements

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20.11 or newer (tested on 22 and 26) | https://nodejs.org |
| pnpm | 9 or newer | `corepack enable` then `corepack prepare pnpm@latest --activate` |
| Docker Desktop | optional | Only for running Python, C, C++, Java, Go and Rust code in CodeLab locally, or for optional local Postgres/Mailpit |
| Python 3 | optional | Only used by `scripts/verify-content.ts` to check reference solutions |

## 2. Install and run

```bash
git clone <your fork> learning-sphere
cd learning-sphere
pnpm install
pnpm dev
```

- Web app: http://localhost:5317
- API: http://localhost:4317 (the web dev server proxies `/api` to it)

On first start the server creates an embedded PostgreSQL database in `./data/pglite`, applies migrations, loads the learning library (skills, roadmaps, problems, project templates) and, in development, creates **sample organizations and demo accounts**.

## 3. Demo accounts

The sign-in page lists one-click demo accounts while demo data is enabled. All use the password `Demo-pass-2026`. They are sample data (`@demo.learnsphere.test` addresses, organizations marked "Sample"). See `docs/ROLE_MATRIX.md` for what each role can do.

| Email | Role |
|---|---|
| learner@demo.learnsphere.test | Independent learner (career switcher) |
| student@demo.learnsphere.test | Northbridge college student |
| faculty@demo.learnsphere.test | Northbridge faculty |
| placement@demo.learnsphere.test | Northbridge placement officer |
| orgadmin@demo.learnsphere.test | Northbridge organization admin |
| recruiter@demo.learnsphere.test | Helix Labs recruiter admin |
| interviewer@demo.learnsphere.test | Helix Labs interviewer |
| mentor@demo.learnsphere.test | Mentor |
| creator@demo.learnsphere.test | Content creator |
| admin@demo.learnsphere.test | Platform admin |
| faculty.riverside@demo.learnsphere.test | Faculty at a second college (tenant isolation demos) |
| recruiter.orbit@demo.learnsphere.test | Recruiter at a second company (tenant isolation demos) |

Turn demo data off with `SEED_DEMO=false` (it is off by default in production).

## 4. Optional capabilities

Copy `.env.example` to `.env` and uncomment what you need. Restart `pnpm dev` after changes.

### AI (free tiers)
Add any one of these and the AI Council turns on. Add several for automatic failover. Details and limits: `docs/FREE_SERVICES.md`.

| Provider | Variable(s) | Get a key |
|---|---|---|
| Google Gemini (recommended) | `GEMINI_API_KEY` | https://aistudio.google.com/apikey (no card) |
| Groq | `GROQ_API_KEY` | https://console.groq.com/keys |
| OpenRouter free models | `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| Cloudflare Workers AI | `CF_ACCOUNT_ID`, `CF_API_TOKEN` | Cloudflare dashboard → AI |
| Mistral | `MISTRAL_API_KEY` | https://console.mistral.ai |
| Azure OpenAI (Azure for Students credit) | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` | Azure AI Foundry → deploy a model |
| Ollama (local, optional) | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | https://ollama.com |

Platform admins can also add providers in **Admin → AI providers** (keys are encrypted at rest).

> Free-tier caution: Google's free tier may use prompts for training, and Google's terms require paid tiers for apps serving EEA users. Use Groq or Azure for those cases.

### Email
In-app notifications always work. To also send email, configure one of: `BREVO_API_KEY` + `EMAIL_FROM` (300/day free), `RESEND_API_KEY` + `EMAIL_FROM` (needs a verified domain), or SMTP. For local testing, run `docker compose up -d mailpit`, set `SMTP_HOST=localhost`, `SMTP_PORT=1026`, and open http://localhost:8025. Locally captured mail is labeled "Captured by local dev mailbox", never "delivered".

### Code execution
JavaScript, TypeScript and SQL run in built-in WebAssembly sandboxes everywhere. With Docker running, an admin can pull language images (Admin → System health, or CodeLab runtimes) to enable Python, C, C++, Java, Go and Rust. Without Docker, set `JUDGE0_URL` (self-hosted) or `JUDGE0_RAPIDAPI_HOST` + `JUDGE0_KEY` (RapidAPI free plan). Unavailable languages are labeled in the editor.

### Calendar sync (Google Calendar, Outlook, Apple Calendar)
Settings, Calendar offers two ways to get LearnSphere deadlines, interviews and sessions into a personal calendar:

1. **Subscription link (ICS): works with no setup.** Each user creates a private link (`<APP_URL>/api/calendar/ics/<token>.ics`) and pastes it into Google Calendar (Other calendars, From URL), Outlook (Add calendar, Subscribe from web) or Apple Calendar (File, New Calendar Subscription). Google and Outlook fetch it from their own servers, so `APP_URL` must be a public address for them; on `localhost` only Apple Calendar on the same machine can subscribe. Google refreshes subscribed calendars only every few hours.
2. **Direct sync (push, updates within about 15 minutes):** needs a free OAuth client per provider. Without one, the page shows "Not configured on this server" with these steps.

**Google (free, no billing):**
1. https://console.cloud.google.com: create a project, then APIs and services, Library: enable **Google Calendar API**.
2. Google Auth Platform (OAuth consent screen): user type **External**, app name and support email. Keep the publishing status **Testing** and add your own Google account under **Test users** (only test users can connect while testing).
3. Data access: add the scope `https://www.googleapis.com/auth/calendar.app.created` (create and manage only calendars made by this app; it cannot see other calendars). `openid` and `email` are requested too, to show which account is connected.
4. Clients, Create client, **Web application**. Authorized redirect URI: `<APP_URL>/api/calendar/oauth/google/callback` (for `pnpm dev`: `http://localhost:5317/api/calendar/oauth/google/callback`).
5. Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in `.env` and restart.

> In Testing mode Google expires refresh tokens after 7 days, so the connection shows "Reconnect needed" weekly. Publishing the app removes that limit but may require Google's verification for this scope.

**Microsoft Outlook / Microsoft 365 (free app registration):**
1. https://entra.microsoft.com, App registrations, New registration. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (matches the default tenant `common`).
2. Redirect URI, platform **Web**: `<APP_URL>/api/calendar/oauth/microsoft/callback`.
3. API permissions, Add a permission, Microsoft Graph, **Delegated**: `Calendars.ReadWrite` and `offline_access` (Graph has no narrower write permission; LearnSphere only writes to the calendar it creates).
4. Certificates and secrets, New client secret: copy the **Value**.
5. Set `MS_OAUTH_CLIENT_ID` (Application (client) ID), `MS_OAUTH_CLIENT_SECRET`, and optionally `MS_OAUTH_TENANT` (`common` default, or `consumers`, `organizations`, or a tenant ID). Restart.

How direct sync behaves: on first sync it creates a calendar named "LearnSphere Nexus" and writes only there (one-way; it never reads or changes other calendars). Events are keyed by a stable item id, so re-runs update instead of duplicating; removed or cancelled items are deleted. A background job checks every 15 minutes (no provider calls when nothing changed) and re-pushes everything every 6 hours; "Sync now" runs it immediately. Refresh tokens are encrypted with `APP_SECRET` and never returned by the API or included in data exports. If access is revoked, the connection is marked "Reconnect needed" and the user is notified. Disconnecting deletes the tokens and can also delete the "LearnSphere Nexus" calendar.

### Real Postgres locally
```bash
docker compose up -d postgres
DATABASE_URL=postgresql://learnsphere:learnsphere@localhost:5434/learnsphere pnpm dev
```

## 5. Everyday commands

| Command | Purpose |
|---|---|
| `pnpm test` | API tests (each file gets its own in-memory database) |
| `pnpm typecheck` | TypeScript for server, web and tests |
| `pnpm build && pnpm start` | Production build on one port (4317) |
| `pnpm db:reset` | Delete the local PGlite database; next start recreates and reseeds it |
| `pnpm db:seed` | Refresh the learning library (safe to rerun) |
| `npx tsx scripts/verify-content.ts` | Validate library content and execute all reference solutions |

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `Port 5317 is already in use` | Another dev server is running. Stop it, or run `pnpm dev:web -- --port 5400` and set `APP_URL=http://localhost:5400` |
| API requests fail with "Request blocked: unexpected origin" | `APP_URL` must match the address in your browser |
| AI Council says "not configured" | Add a provider key (section 4) and restart |
| Python/Java problems say "Unavailable on this server" | Start Docker and pull the language image, or configure Judge0 |
| Want a clean slate | `pnpm db:reset` then `pnpm dev` |
| Emails never arrive | Check Admin → System health → Email; delivery statuses are shown per notification |
