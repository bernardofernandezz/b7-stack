# B7 Fullstack Infrastructure (v0.2, proposed)

The smallest viable deployment is **one Worker, one PostgreSQL database, one Hyperdrive binding (caching disabled) and one migration workflow**. Every other Cloudflare service is added only by a selected feature (see the [configuration model](../../docs/configuration-model.md#fullstack-features-what-each-one-adds)). The Cloudflare lock-in trade-off is in [technology decisions](../../docs/technology-decisions.md#adr-007-cloudflare-workers-as-the-only-fullstack-target).

## Build and Wrangler config

TanStack Start builds for Workers with `@cloudflare/vite-plugin` (`viteEnvironment: { name: "ssr" }`), per the [Cloudflare guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/) and [Start hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting).

```jsonc
// wrangler.jsonc: shape only; sections appear only for selected features
{
  "name": "my-saas",
  "main": "@tanstack/react-start/server-entry",   // "src/server.ts" when cron or queues exist
  "compatibility_date": "<project creation date>",   // must not be newer than the installed workerd supports
  "compatibility_flags": ["nodejs_compat"],        // explicit, even where the date enables it by default
  "observability": { "enabled": true },
  "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<created with --caching-disabled>" }]
  // billing:  "triggers": { "crons": ["0 3 * * *"] }
  // storage:  "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "my-saas-uploads" }]
  // queues:   "queues": { "producers": [...], "consumers": [{ ..., "dead_letter_queue": "..." }] }
}
```

- Create the Hyperdrive configuration with `wrangler hyperdrive create … --caching-disabled` ([query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)).
- **Custom entry** (`src/server.ts`, only with cron or queues). This follows Cloudflare's documented shape and nothing else:
  ```ts
  import handler from "@tanstack/react-start/server-entry";
  export default { fetch: handler.fetch, scheduled, queue };
  ```
  There is no path dispatch here. All HTTP routing is Start's (see [architecture](architecture.md#responsibilities)).

## Plans and quotas (as of 2026-10-31)

| Service | Free plan | Source |
|---------|-----------|--------|
| Workers CPU | **10 ms** per request (Paid: 30 s default, 5 min max) | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Simultaneous outbound connections | 6 per invocation (both plans) | same |
| Cron / queue consumer duration | 15 min wall time | same |
| Hyperdrive | Included. 100,000 queries/day on Free | [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/) |
| Queues | Included. 10,000 operations/day on Free, 24 h retention | [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/) |

Whether the **Free plan's 10 ms CPU** fits Better Auth password hashing is **UNVERIFIED** (test `W-1`, decision `A12`). Until it is measured, B7 does not claim Fullstack runs on the Free plan.

## Workers runtime constraints

- There is no filesystem for application data. Node APIs are available only through `nodejs_compat` ([Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)).
- Nothing request-scoped (DB clients, auth instances, user data) lives at module scope.
- Bindings come from `import { env } from "cloudflare:workers"`.
- The Vitest Workers pool injects `nodejs_compat` automatically, so tests can pass while a deploy fails ([Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)). A **post-deploy smoke test is mandatory**.

## Local development

- `pnpm run dev` runs Vite with the Cloudflare plugin, which uses the Workers runtime locally.
- PostgreSQL runs in Docker Compose. Hyperdrive connects directly in local dev through `localConnectionString` on the binding (the reference implementation) or `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`, with no pooling or caching ([Hyperdrive local dev](https://developers.cloudflare.com/hyperdrive/configuration/local-development/)). Hyperdrive-specific behavior (pooling, transaction mode) is therefore tested **only against a deployed Worker**.
- Cron: `curl "http://localhost:<port>/cdn-cgi/local/scheduled?cron=0+3+*+*+*"`.
- Webhooks: `stripe listen --forward-to localhost:<port>/api/webhooks/stripe`. For AbacatePay, use dev mode plus a tunnel.

## Secrets

- Local: `.dev.vars` (gitignored), with `.dev.vars.example` committed.
- Production: `wrangler secret put`. CI: GitHub environment secrets.
- The variables for each feature are listed in the [configuration model](../../docs/configuration-model.md#fullstack-features-what-each-one-adds).

## Optional services

| Feature | Rule |
|---------|------|
| **Email (Resend)** | `modules/email/send.ts` is the only caller of the provider. It uses `html`/`text` (the `react` option is documented as Node-only). It checks both `data` and `error` ([Resend on Workers](https://resend.com/docs/send-with-cloudflare-workers)). When queues are enabled, send from a consumer |
| **R2** | Uploads go through an authorized route with size and type checks, or through short-lived presigned URLs. Keys use `org/<organizationId>/…` |
| **Queues** | Small JSON messages carrying IDs. Consumers re-read state and are idempotent. Configure `max_retries` and a dead-letter queue |
| **Turnstile** | Verify the token on the server for sign-up, password reset and public forms |

## Deployment workflow

```
PR:    pnpm install → typecheck → lint → vitest (workers pool) → build
main:  same → drizzle-kit migrate (DATABASE_URL) → wrangler deploy → Playwright smoke test against the deployed URL
```

- Migrations are expand-then-contract, because old and new Worker versions overlap briefly during a deploy.
- Use a staging Worker (Wrangler environment) with its own Hyperdrive, database and secrets.
- Roll back with `wrangler rollback`. Database changes are fixed forward.
