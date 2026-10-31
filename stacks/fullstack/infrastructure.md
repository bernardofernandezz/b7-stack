# B7 Fullstack Infrastructure

The deployment target is fixed to **Cloudflare Workers**. Everything else on this page is optional and generated only when selected. The lock-in trade-off is documented in [technology decisions](../../docs/technology-decisions.md#cloudflare-workers).

## Build and config

TanStack Start builds for Workers through `@cloudflare/vite-plugin` ([Cloudflare guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)):

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: "ssr" } }), tanstackStart(), react()],
});
```

```jsonc
// wrangler.jsonc: only the selected sections are generated
{
  "name": "my-saas",
  "main": "src/server.ts",                  // custom entry, see architecture.md
  "compatibility_date": "<date of project creation>",
  "compatibility_flags": ["nodejs_compat"], // Better Auth (AsyncLocalStorage), pg driver
  "observability": { "enabled": true },

  "hyperdrive":      [{ "binding": "HYPERDRIVE", "id": "<id>" }],
  "r2_buckets":      [{ "binding": "BUCKET", "bucket_name": "my-saas-uploads" }],
  "queues": {
    "producers": [{ "binding": "JOBS", "queue": "my-saas-jobs" }],
    "consumers": [{ "queue": "my-saas-jobs", "dead_letter_queue": "my-saas-jobs-dlq" }]
  },
  "triggers":        { "crons": ["0 3 * * *"] },
  "kv_namespaces":   [{ "binding": "KV", "id": "<id>" }]
}
```

Run `wrangler types` to generate the `Env` type from this file. Keep the import path of the TanStack Start Vite plugin aligned with your installed version.

## Bindings

| Binding | Use for | Avoid for |
|---------|---------|-----------|
| **Hyperdrive** | Pooled, cached connections to PostgreSQL from Workers. Use the `pg` driver | — |
| **D1** | Small, SQLite-shaped data, per-tenant databases, prototypes | Large or write-heavy relational workloads |
| **R2** | User uploads, exports, generated files. Serve through signed or authorized routes | Data you need to query |
| **Queues** | Emails, webhook follow-ups, exports, anything retryable | Work the user is waiting on |
| **Cron Triggers** | Nightly billing reconciliation, cleanup, digests | Sub-minute scheduling |
| **KV** | Read-heavy, eventually consistent caches and config | Counters, anything that needs strong consistency |
| **Durable Objects** | Realtime rooms, per-tenant coordination, strongly consistent counters | General storage (only when justified) |
| **Turnstile** | Bot protection on sign-up, sign-in and public forms. Verify the token on the server | — |

## Workers runtime constraints

- **No filesystem** for application data. Use R2, D1 or PostgreSQL.
- **Node APIs only through `nodejs_compat`**, and only the subset Cloudflare supports ([Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)). Check every new dependency, and prefer libraries built on Web standards.
- **Limits** on CPU time, memory and bundle size per request and plan. Check the current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) for your plan, and move heavy work to Queues.
- **No shared state between requests.** Isolates are reused unpredictably. Do not cache DB clients or per-user data in module scope.
- **Bindings are request-scoped.** Read them from `env` (Hono `c.env`, or `import { env } from "cloudflare:workers"` in Start code).

## Local development

- Start everything with `bun run dev` (Vite with the Cloudflare plugin). It runs the Workers runtime locally with local emulation of D1, R2, KV, Queues and Durable Objects.
- **PostgreSQL:** run it with Docker Compose. Hyperdrive connects directly in local mode through `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` (preferred), or through `localConnectionString` in Wrangler config. Pooling and caching are off locally ([Hyperdrive local dev](https://developers.cloudflare.com/hyperdrive/configuration/local-development/)).
- **Cron:** trigger it locally with `curl "http://localhost:<port>/cdn-cgi/local/scheduled?cron=0+3+*+*+*"`.
- **Webhooks:** use `stripe listen --forward-to` for Stripe. For AbacatePay, use a tunnel (for example `cloudflared tunnel`) to a dev webhook.

## Secrets

- Local: `.dev.vars` (gitignored). Commit `.dev.vars.example` with names only.
- Production: `wrangler secret put <NAME>`. Secrets are bindings on `env`, like any other.
- CI: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub environment secrets.
- The full list of variables per feature is in the [configuration model](../../docs/configuration-model.md#features).

## Email

`src/modules/email/send.ts` exports `sendEmail({ to, subject, html, text })`, the only place that calls the provider. With Resend, it uses `RESEND_API_KEY` and `EMAIL_FROM` from a verified domain, and checks both `data` and `error` in the response. Resend documents Workers support ([Resend on Workers](https://resend.com/docs/send-with-cloudflare-workers)). To change provider, replace this one file.

Send email from a Queue consumer when queues are enabled, so provider outages do not fail user requests.

## R2 storage

- Uploads go through an authorized API route (size and type checked), or through presigned URLs when uploads are large.
- Object keys are tenant-prefixed: `org/<organizationId>/...`. The authorization check runs before every read.

## Queues and cron

- Messages are small JSON with a `type` and IDs. Load the current state from the database inside the consumer.
- Consumers are idempotent, just like webhooks. Configure `max_retries` and a dead-letter queue.
- `queue` and `scheduled` handlers are exported from the same `src/server.ts` as `fetch`. See [architecture](architecture.md#server-entry).

## Deployment

```
GitHub Actions
  on PR:   bun install → typecheck → lint → vitest → build
  on main: same → drizzle-kit migrate (DATABASE_URL secret) → wrangler deploy → Playwright smoke test against the deployed URL
```

- Run migrations **before** deploy, and keep them backward-compatible (expand, then contract), because the old and new Worker versions briefly serve traffic at the same time.
- Use Wrangler environments (`--env staging`) for a staging Worker with its own bindings and secrets.
- Roll back with `wrangler rollback` for code. Database rollbacks are forward fixes.
