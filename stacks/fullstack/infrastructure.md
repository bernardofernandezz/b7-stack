# B7 Fullstack Infrastructure (v0.2, proposed)

The smallest viable deployment is **one host with Docker, running one Compose project**: PostgreSQL, a one-shot migration job, the app and Caddy. Every other service is added only by a selected feature (see the [configuration model](../../docs/configuration-model.md#fullstack-features-what-each-one-adds)). Why Docker replaced Cloudflare Workers is in [ADR-013](../../docs/technology-decisions.md#adr-013-docker-compose-replaces-cloudflare-workers-as-the-fullstack-target).

## Build and images

TanStack Start's `vite build` produces a fetch handler (`dist/server/server.js`) and static assets (`dist/client`). [srvx](https://srvx.h3.dev/) serves both on Node.js. There is no platform plugin in `vite.config.ts`.

One `Dockerfile`, several targets:

| Target | Contents | Used by |
|--------|----------|---------|
| `deps` | pnpm and all dependencies (pnpm store in a BuildKit cache mount) | `build` |
| `prod-deps` | Production dependencies only | `runtime` |
| `build` | Source and `dist/` | `migrate`, `runtime` |
| `migrate` | `build` plus `CMD pnpm run db:migrate` | the `migrate` service |
| `runtime` | `node:26-alpine`, production `node_modules`, `dist/`, non-root `node` user, `HEALTHCHECK` | the `app` service |

## Compose services

```yaml
# compose.yaml: shape only; services marked † appear only for selected features
postgres:   postgres:17-alpine, named volume, published on 127.0.0.1:5432 for local dev only
migrate:    target migrate, runs once; app waits for service_completed_successfully
app:        target runtime, :3000 on the Compose network only, health-checked, init: true
caddy:      caddy:2-alpine on :80/:443, reverse_proxy app:3000, waits for app to be healthy
scheduler†: alpine; POSTs to app:3000/api/internal/reconcile daily with CRON_SECRET (A9)
worker†:    app image, consumes the job queue (queues)
minio†:     S3-compatible storage for local development (storage: s3)
```

- Values come from `.env` on the host (never baked into an image: `.dockerignore` excludes it). `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` are required, and Compose refuses to start without them.
- `APP_URL` is the public URL. Caddy uses it as its site address: `http://localhost` serves plain HTTP, `https://app.example.com` gets a Let's Encrypt certificate automatically.
- **Only Caddy is published.** Caddy ignores `X-Forwarded-For` from clients and sets it to the connecting IP, so Better Auth's rate limiter can trust it. Publishing `app` directly would let clients forge it.

## Runtime model

- One Node.js process per `app` container, with **one `pg` pool** (`DATABASE_POOL_MAX`, default 10) and **one Better Auth instance**, built on the first request (see [architecture](architecture.md#database-client-lifecycle)).
- Size the pool so that `app replicas × DATABASE_POOL_MAX` stays below PostgreSQL's `max_connections` (100 by default).
- The process holds no per-user state in memory: sessions and rate-limit counters live in PostgreSQL, so `docker compose up --scale app=N` works behind Caddy.

## Local development

- `pnpm run db:up` starts only `postgres`. `pnpm run dev` runs Vite on :3000 and reads `.env`.
- `docker compose up -d --build` runs the production stack locally at `http://localhost`.
- Webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`. For AbacatePay, use dev mode plus a tunnel.

## Secrets

- `.env` (gitignored), with `.env.example` committed. `create-b7` generates `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD`.
- Production: `.env` on the host with mode `600`, or the secret store of the platform running the containers. CI: GitHub secrets.
- The variables for each feature are listed in the [configuration model](../../docs/configuration-model.md#fullstack-features-what-each-one-adds).

## Optional services

| Feature | Rule |
|---------|------|
| **Email (Resend)** | `modules/email/send.ts` is the only caller of the provider. It uses `html`/`text`, and it checks both `data` and `error`. When queues are enabled, send from the worker |
| **Storage (S3)** | Uploads go through an authorized route with size and type checks, or through short-lived presigned URLs. Keys use `org/<organizationId>/…` |
| **Queues** | Small JSON messages carrying IDs. Consumers re-read state and are idempotent, with bounded retries and a dead-letter path |
| **Turnstile** | Verify the token on the server for sign-up, password reset and public forms |

## Deployment workflow

```
PR/main: pnpm install → typecheck → lint → migrate → vitest → build → Playwright (dev server)
         docker compose up --build --wait → Playwright against Caddy (http://localhost)
deploy:  on the host: git pull → docker compose up -d --build   (migrate runs before the new app starts)
```

- Migrations are expand-then-contract, because the old `app` container keeps serving while `migrate` runs.
- Back up the `pgdata` volume (`docker compose exec postgres pg_dump -U postgres b7`) before deploys that migrate.
- Roll back by checking out the previous commit and running `docker compose up -d --build`. Database changes are fixed forward.
- Pushing images to a registry (to avoid building on the host) is optional and left to the chosen platform.
