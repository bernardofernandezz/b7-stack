# Configuration Model

This document is the **single source of truth** for what a B7 project can contain. Profile documents describe intent and recommendations, and this document defines what is valid. The future [`create-b7`](../cli/README.md) CLI implements these rules as written.

## Model

A configuration is a profile plus one value per dimension. Every dimension has a profile default, and `"none"` (or an empty list) means nothing for that dimension is installed.

```ts
type B7Config = {
  profile: "web" | "api" | "systems" | "intelligence" | "fullstack";
  language: "typescript" | "go" | "python";
  runtime: "bun" | "workers" | "go" | "python";
  frontend: "tanstack-start" | "none";
  backendStrategy: "start-server" | "hono-orpc" | "hono-orpc-with-start" | "standalone" | "none";
  backendFramework: "hono" | "net-http" | "none";
  apiCommunication: ("orpc" | "openapi" | "rest")[];
  database: "postgresql" | "d1" | "sqlite" | "none";
  dataAccess: "drizzle" | "sqlc" | "database-sql" | "none";
  auth: "better-auth" | "none";
  authorization: "roles" | "organizations" | "none"; // "organizations" includes roles per org
  billing: "stripe" | "abacatepay" | "none";
  email: "resend" | "none";
  storage: "r2" | "none";
  jobs: { queues: boolean; cron: boolean };
  infrastructure: {
    target: "cloudflare-workers" | "docker" | "binary";
    services: ("hyperdrive" | "kv" | "durable-objects" | "turnstile")[];
    ci: "github-actions" | "none";
  };
  testing: ("vitest" | "playwright" | "go-test" | "pytest")[];
  observability: ("workers-observability" | "opentelemetry" | "sentry")[];
};
```

Field names are deliberately simple. Intelligence-specific choices (ML libraries) are listed in [stacks/intelligence](../stacks/intelligence/README.md#configuration) and are not part of the shared model.

## Allowed values per profile

**Bold** marks the default. `—` means the dimension is fixed to `none` or does not apply.

| Dimension | Web | API | Systems | Intelligence | Fullstack |
|-----------|-----|-----|---------|--------------|-----------|
| language | **typescript** | **typescript**, go | **go** | **python** | **typescript** (only) |
| runtime | **bun**, workers | **bun**, workers (TS), **go** (Go) | **go** | **python** | **workers** (only) |
| frontend | **tanstack-start** | — | — | — | **tanstack-start** |
| backendStrategy | **start-server** | **standalone** | — | none, standalone | start-server, hono-orpc, **hono-orpc-with-start** |
| backendFramework | — | **hono** (TS), **net-http** (Go) | — | — | **hono** (when the strategy includes Hono) |
| apiCommunication | — | **orpc** (TS), openapi, rest; **rest** (Go), openapi | — | rest | **orpc**, openapi, rest |
| database | **none**, postgresql, d1, sqlite | **none**, postgresql, sqlite, d1 (TS on Workers) | **none**, sqlite | **none**, postgresql, sqlite | **postgresql**, d1, none |
| dataAccess | drizzle | drizzle (TS), sqlc (Go + PostgreSQL), database-sql (Go + SQLite) | database-sql | (see Intelligence) | **drizzle** |
| auth | **none**, better-auth | **none**, better-auth (TS) | — | — | **better-auth**, none |
| authorization | none, roles | none, roles (TS) | — | — | none, **roles**, organizations |
| billing | — | — | — | — | **none**, stripe, abacatepay |
| email | none, resend | none, resend | — | — | **none**, resend |
| storage | none, r2 (workers) | none, r2 (workers) | — | — | **none**, r2 |
| jobs | — | queues, cron (workers) | — | — | **none**; queues, cron |
| infrastructure.target | **docker**, cloudflare-workers | **docker**, cloudflare-workers (TS), binary (Go) | **binary**, docker | **docker** | **cloudflare-workers** (only) |
| infrastructure.services | kv, turnstile (workers) | hyperdrive, kv, durable-objects (workers) | — | — | hyperdrive (default with postgresql), kv, durable-objects, turnstile |
| testing | **vitest**, playwright | **vitest** (TS), **go-test** (Go) | **go-test** | **pytest** | **vitest**, **playwright** |
| observability | opentelemetry, sentry, workers-observability (workers) | **opentelemetry**, sentry, workers-observability (workers) | none | none | **workers-observability**, sentry, opentelemetry |

B7 Fullstack has a single language: **Go is never offered in B7 Fullstack.** A product that needs a Go service adds a separate [B7 API](../stacks/api/README.md) project.

### Fullstack backend strategies

| Value | Meaning |
|-------|---------|
| `start-server` | TanStack Start server functions and server routes only. No Hono and no oRPC. Use it for products with no public API and no webhooks. |
| `hono-orpc` | Hono owns all `/api/*` traffic, oRPC is mounted inside Hono, and Start handles rendering and routing only. |
| `hono-orpc-with-start` (**default**) | The same as `hono-orpc`, and Start server functions are also allowed for page-level data loading and mutations that do not need a public contract. See [fullstack architecture](../stacks/fullstack/architecture.md#responsibilities). |

## Features

Each feature installs only what is listed. Environment variables marked *(secret)* must be set with `wrangler secret put` (Workers) or the platform's secret store, and never in committed files.

| Feature | Installs (packages / config) | Env vars and bindings | External service | Requires |
|---------|------------------------------|-----------------------|------------------|----------|
| tanstack-start | `@tanstack/react-start`, `@tanstack/react-router`, `react`, `react-dom`, Vite; `@cloudflare/vite-plugin` on Workers | — | — | language = typescript |
| tanstack-query | `@tanstack/react-query` (plus `@orpc/tanstack-query` with oRPC) | — | — | frontend |
| hono | `hono` | — | — | typescript |
| orpc | `@orpc/server`, `@orpc/client`, `zod`; `@orpc/openapi` if openapi | — | — | typescript; hono or tanstack-start |
| net-http | Go standard library | `PORT` | — | go |
| postgresql + drizzle | `drizzle-orm`, `drizzle-kit`, `pg` | `DATABASE_URL` *(secret; direct connection, used by migrations and non-Workers runtimes)* | A PostgreSQL host | typescript |
| hyperdrive | `hyperdrive` binding in `wrangler.jsonc`; `nodejs_compat` flag | `HYPERDRIVE` binding; `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` for local dev | Cloudflare Hyperdrive | postgresql, target = cloudflare-workers |
| d1 + drizzle | `drizzle-orm`, `drizzle-kit`; `d1_databases` binding | `DB` binding | Cloudflare D1 | target = cloudflare-workers |
| sqlite (TS) | `drizzle-orm` with Bun's built-in `bun:sqlite` driver | `DATABASE_PATH` | — | runtime = bun |
| sqlc | `sqlc.yaml`, `sqlc` CLI (dev tool), `pgx` | `DATABASE_URL` *(secret)* | A PostgreSQL host | go, postgresql |
| sqlite (Go) | `database/sql` + a SQLite driver | `DATABASE_PATH` | — | go |
| better-auth | `better-auth`; auth tables in the Drizzle schema | `BETTER_AUTH_SECRET` *(secret)*, `BETTER_AUTH_URL` | — | typescript, database ≠ none |
| auth: OAuth provider (each) | provider config in the auth module | `<PROVIDER>_CLIENT_ID`, `<PROVIDER>_CLIENT_SECRET` *(secret)* | The OAuth provider | better-auth |
| auth: passkeys | the Better Auth passkey plugin | — | — | better-auth |
| authorization: roles | Better Auth access control (`createAccessControl`) | — | — | better-auth |
| authorization: organizations | the Better Auth `organization` plugin, with invitations | — | — | better-auth; email ≠ none recommended (invitations) |
| billing: stripe | `stripe`; `src/modules/billing` with the Stripe adapter | `STRIPE_SECRET_KEY` *(secret)*, `STRIPE_WEBHOOK_SECRET` *(secret)* | Stripe account | database ≠ none, auth ≠ none, backendFramework = hono |
| billing: abacatepay | `src/modules/billing` with the AbacatePay adapter (plain `fetch`, no SDK required) | `ABACATEPAY_API_KEY` *(secret)*, `ABACATEPAY_WEBHOOK_SECRET` *(secret)* | AbacatePay account | database ≠ none, auth ≠ none, backendFramework = hono |
| email: resend | `resend`; `src/modules/email/send.ts` | `RESEND_API_KEY` *(secret)*, `EMAIL_FROM` | Resend account and a verified domain | — |
| storage: r2 | `r2_buckets` binding | `BUCKET` binding | Cloudflare R2 | target = cloudflare-workers |
| jobs: queues | `queues.producers` / `queues.consumers` in Wrangler; a `queue` handler in the server entry | `JOBS` binding | Cloudflare Queues | target = cloudflare-workers |
| jobs: cron | `triggers.crons` in Wrangler; a `scheduled` handler in the server entry | — | — | target = cloudflare-workers |
| kv | `kv_namespaces` binding | `KV` binding | Cloudflare KV | target = cloudflare-workers |
| durable-objects | `durable_objects` binding and migration; the class exported from the server entry | binding per class | — | target = cloudflare-workers |
| turnstile | client widget, plus server verification in the auth/form handlers | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` *(secret)* | Cloudflare Turnstile | target = cloudflare-workers or any HTTPS host |
| workers-observability | `observability.enabled: true` in Wrangler | — | — | target = cloudflare-workers |
| sentry | the Sentry SDK for the runtime (`@sentry/cloudflare` on Workers) | `SENTRY_DSN` | Sentry (paid tiers optional) | — |
| opentelemetry | the OTel SDK for the runtime | `OTEL_EXPORTER_OTLP_ENDPOINT` | An OTLP-compatible backend | — |
| vitest | `vitest`; `@cloudflare/vitest-pool-workers` on Workers | — | — | typescript |
| playwright | `@playwright/test` | `BASE_URL` | — | frontend |
| github-actions | `.github/workflows/ci.yml`; `deploy.yml` for Workers | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (repository secrets) | GitHub | — |

## Compatibility rules

**Hard rules.** The CLI rejects any configuration that breaks one of these.

1. `profile = fullstack` ⇒ `language = typescript`, `runtime = workers`, `infrastructure.target = cloudflare-workers`, `frontend = tanstack-start`.
2. `profile = fullstack` ⇒ `backendStrategy ∈ {start-server, hono-orpc, hono-orpc-with-start}`.
3. `backendStrategy = start-server` ⇒ `backendFramework = none`, and `billing = none`. Billing webhooks require Hono (see rule 8). This keeps a single HTTP layer.
4. `language = go` ⇒ `profile ∈ {api, systems}`, and `dataAccess ∈ {sqlc, database-sql}`. Drizzle, oRPC and Better Auth are TypeScript-only.
5. `dataAccess = sqlc` ⇒ `database = postgresql`.
6. `database = d1`, or `infrastructure.services` containing `hyperdrive`, `kv` or `durable-objects`, or `storage = r2`, or `jobs.queues`/`jobs.cron` set to true ⇒ `infrastructure.target = cloudflare-workers`. Turnstile works on any HTTPS host.
7. `services` includes `hyperdrive` ⇒ `database = postgresql`. Hyperdrive and D1 are mutually exclusive as the primary database.
8. `billing ≠ none` ⇒ `database ≠ none`, `auth ≠ none`, `backendFramework = hono`.
9. `auth = better-auth` ⇒ `language = typescript`, `database ≠ none`.
10. `authorization ≠ none` ⇒ `auth ≠ none`.
11. `billing = stripe` and `billing = abacatepay` are exclusive. The model holds a single value, and the unselected provider is never installed.
12. `playwright` ⇒ `frontend ≠ none`.
13. `profile = intelligence` ⇒ `frontend = none`. It never depends on the web stack.

**Recommendations.** The CLI warns but does not reject.

- `authorization = organizations` without `email = resend`: invitations need some way to send email.
- `billing ≠ none` without `jobs.queues`: entitlement sync after webhooks should be retried through a queue. See [billing](../stacks/fullstack/billing.md#processing-pipeline).
- `database = d1` with `authorization = organizations`: **Uncertain:** test Better Auth's organization plugin on D1 before you rely on it. Production use of this combination is not documented.
- Redis is not a configuration value. On Workers, use KV or Durable Objects. On containers, add Redis by hand only when there is a documented reason (see [technology decisions](technology-decisions.md#redis)).

## Representative configurations

**1. Minimal SaaS (Fullstack defaults, no billing)**
```json
{ "profile": "fullstack", "language": "typescript", "runtime": "workers",
  "frontend": "tanstack-start", "backendStrategy": "hono-orpc-with-start", "backendFramework": "hono",
  "apiCommunication": ["orpc"], "database": "postgresql", "dataAccess": "drizzle",
  "auth": "better-auth", "authorization": "roles", "billing": "none", "email": "none", "storage": "none",
  "jobs": { "queues": false, "cron": false },
  "infrastructure": { "target": "cloudflare-workers", "services": ["hyperdrive"], "ci": "github-actions" },
  "testing": ["vitest", "playwright"], "observability": ["workers-observability"] }
```

**2. B2B SaaS, Brazil**: organizations, AbacatePay, email, queues, storage.
```json
{ "profile": "fullstack", "backendStrategy": "hono-orpc-with-start",
  "apiCommunication": ["orpc", "openapi"], "database": "postgresql",
  "auth": "better-auth", "authorization": "organizations", "billing": "abacatepay",
  "email": "resend", "storage": "r2", "jobs": { "queues": true, "cron": true },
  "infrastructure": { "target": "cloudflare-workers", "services": ["hyperdrive", "turnstile"], "ci": "github-actions" },
  "observability": ["workers-observability", "sentry"] }
```
Unlisted fields take the Fullstack defaults.

**3. International SaaS**: the same as 2, with `"billing": "stripe"`.

**4. Content site with server logic (Web)**
```json
{ "profile": "web", "runtime": "bun", "frontend": "tanstack-start", "backendStrategy": "start-server",
  "database": "none", "auth": "none", "infrastructure": { "target": "docker", "services": [], "ci": "github-actions" },
  "testing": ["vitest"] }
```

**5. Go service with PostgreSQL (API)**
```json
{ "profile": "api", "language": "go", "runtime": "go", "backendStrategy": "standalone",
  "backendFramework": "net-http", "apiCommunication": ["rest", "openapi"],
  "database": "postgresql", "dataAccess": "sqlc",
  "infrastructure": { "target": "docker", "services": [], "ci": "github-actions" },
  "testing": ["go-test"], "observability": ["opentelemetry"] }
```

**6. Edge API in TypeScript (API)**
```json
{ "profile": "api", "language": "typescript", "runtime": "workers", "backendFramework": "hono",
  "apiCommunication": ["orpc", "openapi"], "database": "d1", "dataAccess": "drizzle",
  "infrastructure": { "target": "cloudflare-workers", "services": [], "ci": "github-actions" },
  "testing": ["vitest"], "observability": ["workers-observability"] }
```

**Invalid examples**
- `{ "profile": "fullstack", "language": "go" }` breaks rule 1.
- `{ "profile": "fullstack", "backendStrategy": "start-server", "billing": "stripe" }` breaks rule 3.
- `{ "profile": "api", "language": "go", "dataAccess": "drizzle" }` breaks rule 4.
- `{ "profile": "api", "infrastructure": { "target": "docker" }, "storage": "r2" }` breaks rule 6.
