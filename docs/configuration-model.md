# Configuration Model (v0.2)

This document is the **single source of truth** for what a B7 project may contain. The [`create-b7`](../cli/README.md) CLI will implement exactly these rules. Decision IDs (`A…`) are explained in [architecture-review.md](../architecture-review.md#decisions-requiring-maintainer-approval).

v0.2 reduces the model from 18 free dimensions to **one profile choice plus a few profile-specific options** (`A11`). Anything that can be inferred is **DERIVED** and cannot be set.

## Status vocabulary

| Status | Meaning |
|--------|---------|
| **CORE** | Always included in the profile. Not a choice |
| **OPTIONAL** | A meaningful user choice. Off unless selected (or set to its listed default) |
| **DERIVED** | Inferred from other selections. Not user-settable |
| **EXPERIMENTAL** | Selectable, but with documented limitations. Not covered by the reference implementation |
| **DEFERRED** | Not available in v0.2 |

## Model

```ts
type B7Config =
  | { profile: "fullstack"; options: FullstackOptions }
  | { profile: "web";       options: WebOptions }
  | { profile: "api";       options: ApiTsOptions | ApiGoOptions }
  | { profile: "systems";   options: { sqlite: boolean } }
  | { profile: "intelligence"; options: { serving: "none" | "http" } };

type FullstackOptions = {
  organizations: boolean;                      // default false
  oauthProviders: string[];                    // default []
  billing: "none" | "stripe" | "abacatepay";   // default "none"; abacatepay is EXPERIMENTAL
  email: "none" | "resend";                    // default "resend" (the CLI default; required by organizations)
  storage: "none" | "s3";                      // default "none"; any S3-compatible service (MinIO, R2, S3)
  queues: boolean;                             // default false; a `worker` Compose service
  publicApi: boolean;                          // default false: oRPC OpenAPIHandler at /api/v1
  turnstile: boolean;                          // default false
  sentry: boolean;                             // default false
  passkeys: boolean;                           // default false; EXPERIMENTAL
};

type WebOptions = {
  target: "docker" | "cloudflare-workers";     // default "docker"
  database: "none" | "postgresql";             // default "none"
};

type ApiTsOptions = {
  language: "typescript";
  target: "docker" | "cloudflare-workers";     // default "docker"
  database: "none" | "postgresql";             // default "none"
  publicApi: boolean;                          // default true: OpenAPI
};

type ApiGoOptions = {
  language: "go";
  database: "none" | "postgresql";             // default "none"
  openapi: boolean;                            // default true: spec maintained with the handlers
};
```

## B7 Fullstack

| Dimension | Status | Value / rule |
|-----------|--------|--------------|
| Language | CORE | TypeScript. **Go is never offered** |
| Runtime / target | CORE | Node.js in Docker, served by srvx. Docker Compose runs `postgres`, `migrate`, `app` and `caddy` ([ADR-013](technology-decisions.md#adr-013-docker-compose-replaces-cloudflare-workers-as-the-fullstack-target)). pnpm for local tooling |
| Frontend | CORE | React, TanStack Start, TanStack Router, Tailwind CSS, Base UI, Lucide |
| HTTP routing | CORE | TanStack Start server routes (`A1`) |
| App RPC | CORE | oRPC + Zod, with an in-process client for SSR (`A2`) |
| Public REST / OpenAPI | OPTIONAL | `publicApi` |
| Hono | **DEFERRED** in Fullstack (`A1`) | CORE in B7 API (TypeScript) |
| Server functions for business logic | **DEFERRED** (`A2`) | — |
| Database | CORE | PostgreSQL |
| Data access | CORE | Drizzle + `pg` |
| Connection pool | CORE | One `pg` pool per process (`DATABASE_POOL_MAX`, default 10) |
| Reverse proxy | CORE | Caddy: TLS (automatic for a public `APP_URL`) and the only source of `X-Forwarded-For` |
| Query cache | **DEFERRED** | Requires a measured, named, staleness-tolerant read path |
| D1 | **DEFERRED** in Fullstack (`A3`) | — |
| Authentication | CORE | Better Auth, email + password, database sessions (`A5`) |
| Organizations | OPTIONAL | `organizations` |
| OAuth providers | OPTIONAL | `oauthProviders` |
| Passkeys | EXPERIMENTAL | `passkeys` |
| Teams, dynamic roles | **DEFERRED** | — |
| Billing | OPTIONAL | `billing`. Stripe is the reference, and AbacatePay is EXPERIMENTAL (`A7`) |
| Scheduler service | DERIVED | A `scheduler` Compose service that calls the app's internal reconcile endpoint daily, enabled when `billing ≠ none` (`A9`) |
| Email | OPTIONAL | `email` |
| Storage | OPTIONAL | `storage` (S3-compatible) |
| Queues | OPTIONAL | `queues` |
| Transactional outbox | **DEFERRED** | Until a billing or domain side effect needs it ([billing](../stacks/fullstack/billing.md#transactional-outbox-deferred)) |
| Turnstile | OPTIONAL | `turnstile` |
| Observability | CORE | Logs to stdout (`docker compose logs`) |
| Sentry | OPTIONAL | `sentry` |
| OpenTelemetry export | **DEFERRED** in Fullstack | — |
| Testing | CORE | Vitest (Node) + Playwright, including E2E against the Compose stack |
| CI/CD | CORE | GitHub Actions: check, migrate, test, build images, E2E against the Compose stack |

### Fullstack features: what each one adds

| Feature | Packages / config | Env vars and bindings *(secret)* | External service |
|---------|-------------------|-------------------------------|------------------|
| core | `@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/react-query`, `@tanstack/react-router-ssr-query`, `react`, `react-dom`, `srvx`, `@orpc/server`, `@orpc/client`, `@orpc/tanstack-query`, `zod`, `better-auth`, `drizzle-orm`, `drizzle-kit`, `pg`, `tailwindcss`, `@base-ui/react`, `lucide-react`, `vitest`, `@playwright/test`, `@biomejs/biome`. `Dockerfile` (`migrate`, `runtime`), `compose.yaml`, `Caddyfile` | `DATABASE_URL`, `POSTGRES_PASSWORD` *(secret)*, `BETTER_AUTH_SECRET` *(secret)*, `BETTER_AUTH_URL`, `APP_URL` | A host with Docker |
| `organizations` | Better Auth `organization` plugin, `requireMembership` and `requirePermission` middleware | — | — |
| `oauthProviders[p]` | provider config | `<P>_CLIENT_ID`, `<P>_CLIENT_SECRET` *(secret)* | The OAuth provider |
| `passkeys` | Better Auth passkey plugin | — | — |
| `billing: stripe` | `stripe`, `modules/billing` (Stripe adapter), webhook route, internal reconcile route, `scheduler` service | `STRIPE_SECRET_KEY` *(secret)*, `STRIPE_WEBHOOK_SECRET` *(secret)*, `STRIPE_PRICE_PRO`, `CRON_SECRET` *(secret)* | Stripe |
| `billing: abacatepay` | `modules/billing` (AbacatePay adapter, `fetch`), webhook route, `scheduler` service | `ABACATEPAY_API_KEY` *(secret)*, `ABACATEPAY_WEBHOOK_SECRET` *(secret)* | AbacatePay |
| `email: resend` | `resend`, `modules/email/send.ts` | `RESEND_API_KEY` *(secret; optional in local dev, where emails are logged instead)*, `EMAIL_FROM` | Resend + a verified domain |
| `storage: s3` | S3 client, `modules/storage` | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` *(secret)* | Any S3-compatible service |
| `queues` | Job producer, a `worker` Compose service consuming it, a dead-letter path | — | — |
| `publicApi` | `@orpc/openapi`, route `api/v1.$.ts` | — | — |
| `turnstile` | widget + server verification | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` *(secret)* | Cloudflare Turnstile |
| `sentry` | `@sentry/node` | `SENTRY_DSN` | Sentry |
| CI | `.github/workflows/ci.yml` (checks, then the Compose stack with E2E) | — | GitHub |

Package names are listed so the dependency surface is visible. Exact versions are pinned by the reference implementation, not by this document.

## Other profiles

| Profile | CORE | OPTIONAL | DERIVED | DEFERRED |
|---------|------|----------|---------|----------|
| **Web** | TS, React, TanStack Start (server functions + server routes), Tailwind, Base UI, Lucide, Node.js, Vitest | `target`; `database` (PostgreSQL + Drizzle + `pg`) | Hyperdrive (cache disabled) when `target = workers` and `database = postgresql` | Auth (use Fullstack), SQLite, D1, Playwright as a default |
| **API (TS)** | Hono (`@hono/node-server` on Node.js), oRPC + Zod, Node.js, Vitest | `target`; `database` (PostgreSQL + Drizzle + `pg`); `publicApi` | Hyperdrive (cache disabled) on Workers | Auth (`A11`), D1, SQLite |
| **API (Go)** | `net/http`, `log/slog`, `go test`, Docker or binary | `database` (PostgreSQL + **SQLC** + pgx); `openapi` | — | Auth, SQLite |
| **Systems** | Go, `flag`, `log/slog`, `go test`, single binary | `sqlite` (`database/sql`) | — | — |
| **Intelligence** | Python, `uv`, PyTorch, scikit-learn, Hugging Face, pytest, Docker | `serving` (`http` adds an HTTP service; ONNX Runtime for exported models) | — | Workers as a target |

## Rules

The CLI **rejects** any configuration that breaks a rule. Because derived values cannot be set, most v0.1 rules disappear.

1. `profile = fullstack` admits only `FullstackOptions`. In particular, there is no `language`, `target`, `database` or backend choice.
2. `organizations = true` ⇒ `email ≠ none`. Better Auth invitations need `sendInvitationEmail`.
3. `billing ≠ none` ⇒ the `scheduler` Compose service is generated (derived).
4. `passkeys = true` or `billing = abacatepay` ⇒ the CLI prints an EXPERIMENTAL notice that links to the limitations.
5. `profile = api, language = go` admits only `ApiGoOptions`. SQLC is the data access when `database = postgresql`.
6. `profile = intelligence` never includes a web frontend.

**Removed from v0.1.** These are now impossible by construction: Go in Fullstack, a missing database for auth, D1 with Hyperdrive, SQLite on Workers, a billing provider without webhooks, `backendStrategy`, `runtime`, `backendFramework` and `apiCommunication`.

## Representative configurations

```jsonc
// 1. Minimal SaaS: users, sessions, PostgreSQL. One Worker, one binding.
{ "profile": "fullstack", "options": {} }

// 2. B2B SaaS, international (reference implementation scope)
{ "profile": "fullstack", "options": { "organizations": true, "email": "resend", "billing": "stripe" } }

// 3. B2B SaaS, Brazil (experimental billing)
{ "profile": "fullstack", "options": { "organizations": true, "email": "resend", "billing": "abacatepay", "storage": "s3", "queues": true } }

// 4. Go service with PostgreSQL
{ "profile": "api", "options": { "language": "go", "database": "postgresql", "openapi": true } }

// 5. TypeScript edge API
{ "profile": "api", "options": { "language": "typescript", "target": "cloudflare-workers", "database": "postgresql" } }
```

**Rejected examples**
- `{ "profile": "fullstack", "options": { "language": "go" } }`: no such option (rule 1).
- `{ "profile": "fullstack", "options": { "organizations": true } }`: rule 2 (email required).
- `{ "profile": "api", "options": { "language": "go", "publicApi": true } }`: not a Go option (rule 5).
