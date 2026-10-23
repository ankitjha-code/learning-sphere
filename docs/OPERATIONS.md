# Operations Guide

For whoever runs a LearnSphere Nexus deployment.

## What runs where

| Component | Where | Notes |
|---|---|---|
| HTTP API + web app | single Node process, port 4317 | Stateless apart from the database; scale horizontally only after moving rate limits to a shared store (see Limits) |
| Background worker | same process (`WORKER_ENABLED`, default on) | Polls `background_jobs` every second using `FOR UPDATE SKIP LOCKED`, so several instances are safe |
| Database | Postgres (`DATABASE_URL`) or embedded PGlite | PGlite is single-process: development, tests and single-instance demos only |
| Files | Postgres `files.data` (bytea, 10 MB per file) | Backed up with the database |
| Code execution | in-process WASM (JS/TS, SQL); Docker on the host or Judge0 for others | Docker needs host access; not available on PaaS containers |

## Health and monitoring

- `GET /api/system/health` returns `200 {"status":"ok"}` or `503 {"status":"degraded"}` with database, worker and uptime. Point your platform's health check here.
- **Admin → System health** shows database latency, worker last tick, queue depth, email/AI/code-execution configuration and storage use.
- Every API response carries `x-request-id`; server error logs include it, and users see it on unexpected errors, so a user report can be matched to a log line.
- Prompt contents are never written to server logs.

## Background jobs (recovery runbook)

Job states: `queued → running → succeeded`, or `→ retrying` (exponential backoff 10 s, 20 s, 40 s... capped at 15 min) `→ failed` after `maxAttempts`.

1. **Admin → Background jobs**, filter by status `failed`.
2. Open the job: read `lastError` and the payload (secrets redacted).
3. Fix the cause (provider credentials, a bad record), then **Retry**. Handlers are idempotent: grading writes results keyed by the attempt, email sends keyed by the delivery row, exports keyed by the request, so a retry never duplicates results.
4. Jobs stuck in `running` after a crash are re-queued automatically after 5 minutes (or use **Recover stale jobs**).
5. **Cancel** a job that should not run (e.g. a reminder for a deleted assignment).

## Email

Delivery rows record `queued`, `accepted` (provider accepted it), `captured_locally` (dev mailbox), `failed` (with error, retried up to 4 times) or `not_configured`. "Accepted" is not "delivered"; inbox placement depends on the provider and your domain's SPF/DKIM.

## AI providers

- Configure in **Admin → AI providers** or environment variables. Order = failover priority. A provider that fails repeatedly or returns 429 is skipped for 60 seconds.
- Quotas: per-user daily and per-org monthly request limits (Admin → AI providers → Limits). Users see their remaining quota and an honest message when exhausted.
- During an outage the Council shows the reason, keeps the user's message, and nothing else in the product is affected (learning, CodeLab, assessments and career tools do not depend on AI).

## Data protection

- **Exports**: users request their data in Settings → Privacy; a job builds a JSON archive kept for 7 days (configurable).
- **Deletion**: 7-day grace period (configurable), then personal content is deleted and records that institutions must retain (grades, attempts, hiring decisions, audit entries) are anonymized. Each completed request stores a summary of what was deleted versus retained.
- **Retention sweep** (daily job): removes expired export files, old revoked sessions and audit entries older than the configured retention (never younger than 90 days).
- **Secrets**: `APP_SECRET` encrypts provider API keys stored in the database. Keep it in your platform's secret store. Rotating it requires re-entering stored keys.

## Limits to know

| Limit | Value | Where to change |
|---|---|---|
| Upload size | 10 MB per file | `server/modules/files` (and org policy `maxUploadMb`) |
| Login lockout | 8 failed attempts → 15 minutes per account | `server/modules/auth.ts` |
| Rate limits | in-memory per instance | Move to Postgres/Redis before running more than one instance |
| Session lifetime | 14 days sliding | `server/lib/context.ts` |
| Code run time | 2 s per test by default (problem-specific) | problem content / exec config |

## Backups

See `docs/DEPLOYMENT.md` → Backups and restore. Test a restore at least once per term.

## Incident handling

Record incidents in **Admin → Incidents** (severity, status, timeline). Open high/critical incidents show a banner to signed-in users. After resolution, add a timeline note with cause and follow-up.
