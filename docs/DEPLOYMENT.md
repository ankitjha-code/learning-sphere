# Deployment Guide (zero cost, no credit card)

LearnSphere Nexus is one container: API + web app + background worker on port 4317. It needs a Postgres database for anything beyond a demo. All recommendations below were verified on 2026-10-22 (see `docs/FREE_SERVICES.md` for limits and caveats). Free tiers change; recheck before launch.

## Recommended: Azure Container Apps + Neon (both free for you)

You have **Azure for Students** ($100 credit for 12 months, no card) and Neon's free plan needs no card.

### 1. Database: Neon Free
1. Create a project at https://neon.com (free: 1 GB storage, 100 compute-hours/month, scales to zero after 5 minutes).
2. Copy the **pooled** connection string (host contains `-pooler`). Use it as `DATABASE_URL`.
3. Migrations run automatically on start.

Alternative: Azure Database for PostgreSQL Flexible Server, B1MS, 32 GB (750 hours/month free for 12 months on Azure for Students). Use `?sslmode=require`.

### 2. Build and push the image
```bash
# Option A: build in Azure (no local Docker needed)
az login
az group create -n learnsphere -l centralindia
az acr create -n <uniqueRegistryName> -g learnsphere --sku Basic   # Basic registry is paid from credit (~$5/month); or use GitHub Container Registry (free for public images)
az acr build -r <uniqueRegistryName> -t learnsphere:latest .

# Option B: GitHub Container Registry (free)
docker build -t ghcr.io/<you>/learnsphere:latest .
docker push ghcr.io/<you>/learnsphere:latest
```

### 3. Create the Container App
```bash
az containerapp env create -n learnsphere-env -g learnsphere -l centralindia
az containerapp create -n learnsphere -g learnsphere --environment learnsphere-env \
  --image ghcr.io/<you>/learnsphere:latest --target-port 4317 --ingress external \
  --min-replicas 0 --max-replicas 1 --cpu 0.5 --memory 1.0Gi \
  --secrets app-secret=<long-random> db-url='<neon pooled url>' gemini-key=<optional> \
  --env-vars NODE_ENV=production APP_SECRET=secretref:app-secret DATABASE_URL=secretref:db-url \
             GEMINI_API_KEY=secretref:gemini-key APP_URL=https://<your-app>.azurecontainerapps.io TRUST_PROXY=true
```
- Free grant: 180,000 vCPU-seconds + 360,000 GiB-seconds + 2M requests per month. `--min-replicas 0` keeps you inside it; the first request after idle takes a few seconds (cold start).
- `--min-replicas 1` keeps background jobs (reminders, feed sync, retention sweeps) running continuously; that slightly exceeds the free grant and is paid from your student credit.
- Set `SEED_DEMO=true` once if you want demo accounts in a showcase deployment; never on a real pilot.

### 4. Optional services
| Need | Free option | Variables |
|---|---|---|
| AI | Gemini, Groq, OpenRouter, Cloudflare, Azure OpenAI (credit) | see `.env.example` |
| Email | Brevo HTTP API (300/day) | `BREVO_API_KEY`, `EMAIL_FROM` |
| Python/Java/C++ execution | Judge0 CE on RapidAPI (free plan) or self-hosted Judge0 on a small Azure VM from credit | `JUDGE0_*` |
| Error tracking | Sentry via GitHub Student Pack | (not wired by default) |

Containers cannot run Docker inside themselves, so on PaaS hosts only JavaScript, TypeScript and SQL run without Judge0. The editor labels the others as unavailable.

### 5. Payments (optional)

Without payment keys the app runs in **demonstration mode**: nothing can be bought and platform admins assign plans for free (Admin, Organizations). Configure one or both providers to let organization admins pay for a plan in **Plan & billing** (`/app/billing`). Payment happens on the provider's hosted page; no provider script runs in the app.

| Variable | Meaning |
|---|---|
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay API key pair. `rzp_test_...` = test mode, `rzp_live_...` = live. |
| `RAZORPAY_WEBHOOK_SECRET` | The secret you typed when creating the Razorpay webhook. |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...` / `sk_live_...`, or a restricted `rk_` key). Never the publishable `pk_` key. |
| `STRIPE_WEBHOOK_SECRET` | The endpoint signing secret (`whsec_...`). |
| `BILLING_CURRENCY` | Optional. Overrides the currency for both providers (defaults: INR for Razorpay, USD for Stripe). A price must exist for it. |

`APP_URL` must be the public URL people use: it builds the return links (`/app/billing/return?checkout=...`). Monthly prices per plan and currency are edited by a platform admin in Admin, Platform settings, Plans and limits (defaults: Campus ₹4,999 and Company ₹9,999 per month; USD defaults $59 and $119; review before going live).

**Razorpay test keys (free, no card)**
1. Sign up at dashboard.razorpay.com and stay in **Test Mode** (toggle at the top of the dashboard).
2. Account & Settings, **API Keys**, Generate Test Key. Copy the Key Id (`rzp_test_...`) and Key Secret (shown once).
3. Account & Settings, **Webhooks**, Add New Webhook (in Test Mode): URL `https://<your-host>/api/billing/webhooks/razorpay`, a secret of your choice (put it in `RAZORPAY_WEBHOOK_SECRET`), events `payment_link.paid`, `payment_link.cancelled`, `payment_link.expired`, `payment.failed`, `refund.processed`.
4. Local development: Razorpay cannot reach `localhost`, so expose the API with a free tunnel, e.g. `cloudflared tunnel --url http://localhost:4317` (no account needed) or ngrok, and use the tunnel URL in the webhook. Without a webhook, payments are still confirmed when the payer returns (signed callback plus an API status check), but not if they close the tab.
5. Pay with Razorpay's documented test cards or the test UPI ID `success@razorpay` [U: check Razorpay's "test card details" page].

**Stripe test keys (free, no card)**
1. Sign up at dashboard.stripe.com; new accounts start in test mode.
2. Developers, **API keys**: copy the Secret key (`sk_test_...`).
3. Local webhooks with the Stripe CLI: `stripe login`, then `stripe listen --forward-to localhost:4317/api/billing/webhooks/stripe`. It prints a `whsec_...` signing secret: put it in `STRIPE_WEBHOOK_SECRET` and restart the server.
4. Deployed: Developers, **Webhooks**, Add endpoint `https://<your-host>/api/billing/webhooks/stripe` with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.payment_failed`, `charge.refunded`; copy its signing secret.
5. Pay with card `4242 4242 4242 4242`, any future expiry, any CVC.

How it behaves: a checkout is marked paid only after a signature-verified webhook (Stripe events older than 5 minutes are rejected), a signature-verified Razorpay callback, or a server-side status fetch. Duplicate events and returns never activate twice. Each payment buys one month; admins get a reminder 5 days before the end, then a 7-day grace period, then the organization moves to Free (job `billing.renewals`, every 6 hours). Cancelling keeps the plan until the end of the paid period. Refunds are made in the provider dashboard; refund webhooks are recorded on the payment record. The webhook paths are exempt from the CSRF origin check because they are authenticated by signature.

## Alternative: Render Free (simplest, with trade-offs)
1. New Web Service → connect the repo → Docker runtime, port 4317.
2. Env vars as above (`DATABASE_URL` from Neon; Render's own free Postgres expires after 30 days, avoid it).
3. Trade-offs: sleeps after 15 minutes idle (~1 minute wake), no free background workers (the in-process worker runs only while awake), **outbound SMTP ports blocked** (use Brevo or Resend HTTP APIs, not SMTP), ephemeral disk (fine: files are stored in Postgres).

## Demo-only: GitHub Codespaces
Free 120 core-hours/month (more with the Student Pack). Run `pnpm install && pnpm dev`, then forward port 5317 publicly. Good for showing the app live; not for hosting.

## Production checklist
- [ ] `NODE_ENV=production`, strong `APP_SECRET` (rotating it invalidates stored provider keys; re-enter them)
- [ ] `APP_URL` set to the public HTTPS URL (used for CSRF origin checks, invite and reset links)
- [ ] `TRUST_PROXY=true` behind the platform's load balancer
- [ ] `DATABASE_URL` points at a managed Postgres with backups (Neon keeps point-in-time history on the free plan for a limited window; also run the backup script below)
- [ ] `SEED_DEMO=false` for real organizations
- [ ] Create the first platform admin (see below)
- [ ] Configure email if you need password reset by email (otherwise admins generate reset links)
- [ ] Review Admin → Platform settings (retention, signup open/closed, feature flags)
- [ ] Payments (only if selling plans): live keys set, webhooks registered with their secrets, prices reviewed in Platform settings, one real low-value payment tested end to end

### First platform admin
```bash
DATABASE_URL=... npx tsx scripts/create-admin.ts admin@yourdomain.example "Your Name"
```
It prints a one-time password-reset link to set the password.

### Backups and restore
```bash
# Backup (any Postgres): plain SQL dump
pg_dump "$DATABASE_URL" --no-owner --format=custom -f learnsphere-$(date +%F).dump
# Restore into an empty database
pg_restore --no-owner -d "$NEW_DATABASE_URL" learnsphere-YYYY-MM-DD.dump
```
Verify a restore at least once: point a staging deployment at the restored database and check `/api/system/health` and a few sign-ins.

### Rollback
Deploy the previous image tag. Migrations are additive in normal releases; if a release includes a destructive migration it is called out in the release notes with a manual rollback step.
