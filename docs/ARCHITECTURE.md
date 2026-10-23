# LearnSphere Nexus Architecture

## Shape

One Node.js process serves the JSON API (`/api/*`) and the built React app. A Postgres-backed job queue runs inside the same process. Development and tests use embedded **PGlite** (Postgres compiled to WebAssembly, stored in `./data/pglite`), so a fresh clone needs no database server. Production points the same schema at any Postgres through `DATABASE_URL`.

```
web/ (React 19 + Vite + Tailwind 4 + Radix + TanStack Query)
  └─ fetch /api/* (same origin, session cookie)
server/ (Hono on Node, Drizzle ORM, Zod validation)
  ├─ modules/<feature>/routes.ts   HTTP routes, one folder per feature
  ├─ modules/<feature>/service.ts  logic shared with other modules (optional)
  ├─ modules/<feature>/jobs.ts     background job handlers (registerJob)
  ├─ lib/       auth context, errors, validation, audit, notify, email, activity, grading
  ├─ ai/        AI providers, assistants, usage accounting (service.ts is the contract)
  ├─ exec/      sandboxed code execution (QuickJS, PGlite, Docker, Judge0)
  ├─ jobs/      queue (Postgres, FOR UPDATE SKIP LOCKED) + handler registry
  └─ db/        schema/*.ts, migrations/, seed/ (content library + demo data)
shared/         code used by both sides (roles, workspaces)
tests/          Vitest API tests (in-memory PGlite per test file)
```

## Security model (non-negotiable)

- **Authentication**: scrypt password hashes; random 32-byte session tokens stored as SHA-256 in `sessions`; `ls_session` cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production. Sliding 14-day expiry; revocable per session or all others.
- **CSRF**: every non-GET API call must carry an `Origin` matching `APP_URL` or the request host.
- **Authorization happens on the server for every request.** Never trust the client's idea of org or role.
  - `requireAuth(c)` → signed-in user.
  - `requireActiveOrg(c, roles?)` → the org selected in the session, re-verified against current memberships.
  - `requireOrgRole(c, orgId, roles)` → when acting on a record, use **the record's own `orgId`**, not the active org.
  - `requirePlatformAdmin(c)` for platform-wide operations.
  - Records owned by a user (`userId` / `ownerId`) must filter by `auth.user.id` in the query itself (`and(eq(table.id, id), eq(table.userId, uid))`), so other users get **404**, not 403 (don't leak existence).
- **Tenant isolation**: every org-scoped table has `orgId`. List endpoints filter by the active org. Detail endpoints load the record, then check the caller's role in `record.orgId`.
- **Workspaces are UI lenses.** Switching workspace never grants permissions (`/api/auth/switch` recomputes allowed workspaces from memberships).
- **Secrets**: provider API keys entered in the UI are AES-256-GCM encrypted with `APP_SECRET`; API responses only ever return masked values.
- **Answer keys & hidden tests** (`questions.answerKey`) never leave the server for candidates. Use `publicQuestion()` from `server/lib/grading.ts`.
- **Audit**: call `audit(c, { action, orgId, targetType, targetId, meta })` for sensitive actions (role changes, grades, hiring decisions, releases, exports, deletions, admin actions).
- Errors: throw `badRequest / forbidden / notFound / conflict / tooMany / unavailable` from `server/lib/errors.ts`. Unknown errors become a generic 500 with a request id; internals are never sent to clients.

## Honesty rules baked into the code

- Skill evidence is `verified` only when produced by deterministic grading or an authorized human reviewer. AI output never verifies anything (`server/modules/learning/skilldna.ts`).
- AI grading produces **proposals** stored separately (`aiProposal`); a human accepts or edits before a score counts.
- Email deliveries are recorded as `queued → accepted | captured_locally | failed | not_configured`. "Accepted" means the provider accepted it, never "delivered".
- Code is reported as executed only when a sandbox actually ran it (`code_runs.provider`). Unsupported languages are labeled unavailable.
- Sample data lives only in sample orgs (`organizations.isSample`) and `@demo.learnsphere.test` accounts, and the UI labels it.
- XP is only granted for substantive, deduplicated activity (`recordActivity` with `dedupeKey`).

## Conventions for feature code

### Server
- Validate every input with Zod via `body(c, schema)`, `query(c, schema)`, `idParam(c)`.
- Use Drizzle's query builder; raw SQL only through `sql\`\`` template tags (parameterized). Escape `%`/`_` for ILIKE search input.
- Return JSON objects with named keys (`{ items, total }`, `{ assignment }`), never bare arrays.
- Pagination: `page`, `pageSize` (≤100), return `total`.
- Side effects: in-app notification via `notify(userId, {...})`; long or retryable work via `enqueue(type, payload, { idempotencyKey })` with an idempotent handler in the module's `jobs.ts`.
- Learning evidence: `addEvidence(...)` (skilldna.ts); activity/XP: `recordActivity(...)` (lib/activity.ts).
- New tables go in a new file `server/db/schema/<feature>.ts` exported from `schema/index.ts`. During parallel development **do not run `drizzle-kit generate`**; tests build the schema straight from TypeScript. Migrations are regenerated at integration.

### Web
- One folder per feature in `web/src/features/<feature>/` with a `routes.tsx` exporting `routes: RouteObject[]` (paths relative to `/app`) using `page(() => import('./X'))` for code splitting.
- Use the shared primitives from `@/components/ui` (Button, Field, Input, Select, Dialog, ConfirmDialog, Menu, Tabs, Badge, StatusBadge, ProvenanceTag, EmptyState, ErrorState, Banner, Skeleton, PageHeader, Card, Pagination, Markdown, CopyButton...). Never hand-roll a dialog, menu or tab.
- Every data view handles **loading (skeleton) / error (ErrorState with retry) / empty (EmptyState with icon + sentence + primary action)**.
- Every mutation shows pending state, a toast or inline confirmation on success, and the server's message on failure (`errorMessage(e)`); form field errors come from `ApiError.fields`.
- Disabled buttons explain why (`disabledReason`). Destructive actions use `ConfirmDialog` (type-to-confirm for irreversible ones).
- Icons only from `@phosphor-icons/react` using the `*Icon` names; run `node scripts/check-icons.mjs`.
- Colours only through tokens (`bg-surface`, `text-muted`, `bg-accent-soft`, `text-success`...). No raw hex in feature code.
- Label provenance: `<ProvenanceTag kind="ai" | "verified" | "self" | "sample" | "estimate" | "reviewer" />`.
- No emoji in UI copy. No em dashes in UI copy. Buttons are verbs.

### Tests
- `tests/<feature>.test.ts` with `setupTestApp()`, `registerUser()`, `client()` from `tests/helpers.ts`.
- Cover the happy path, validation failure, and **authorization failure** (another user / another org gets 404 or 403).

## Local commands

| Command | What it does |
|---|---|
| `pnpm dev` | API on :4317 (auto-reload) + web on :5317 (proxying /api) |
| `pnpm test` | All API tests (in-memory databases) |
| `pnpm typecheck` | TypeScript across server, web, tests |
| `pnpm build && pnpm start` | Production build served by one process on :4317 |
| `pnpm db:reset` | Delete the local PGlite database (recreated + seeded on next start) |
| `npx tsx scripts/verify-content.ts` | Validate the learning library and run every reference solution |
