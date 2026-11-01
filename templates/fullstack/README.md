# B7 Fullstack reference implementation

The runnable form of [B7 Fullstack](../../stacks/fullstack/README.md), for this configuration:

```json
{ "profile": "fullstack", "options": { "email": "resend" } }
```

Core (TanStack Start, oRPC + Zod, Better Auth email + password, PostgreSQL + Drizzle + Hyperdrive, Tailwind + Base UI + Lucide, Workers) plus Resend. The example domain is a per-user notes list: small, but it covers SSR, typed RPC, validation, persistence, sessions and authorization.

**Not production-ready.** It runs locally and builds for Workers. Nothing has been tested against a deployed Worker or a real Hyperdrive yet. See [verification status](#verification-status).

## Run locally

Requires Node.js (LTS), pnpm (the version in `package.json` `packageManager`; `corepack enable` installs it) and Docker.

```sh
pnpm install
cp .dev.vars.example .dev.vars        # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm run db:up                         # PostgreSQL 17 in Docker on :5432
pnpm run db:migrate
pnpm run dev                           # http://localhost:3000
```

Without `RESEND_API_KEY`, the dev server prints emails (such as the sign-up verification link) to its log instead of sending them. In a production build, a missing key is an error.

| Command | What it does |
|---------|--------------|
| `pnpm run typecheck` · `lint` · `format` | `tsc` (strict) · Biome check · Biome fix |
| `pnpm run test` | Vitest in workerd, against the Docker database through the `HYPERDRIVE` binding |
| `pnpm run test:e2e` | Playwright against `pnpm run dev`. `BASE_URL=… pnpm exec playwright test smoke` checks a deployed Worker |
| `pnpm run build` · `preview` | Workers build · run the built Worker locally in workerd |
| `pnpm run db:generate <name>` · `db:migrate` | Drizzle Kit migration from schema changes · apply with `DATABASE_URL` (default: local Docker) |
| `pnpm run auth:schema` | Regenerate `src/modules/auth/schema.ts` with the Better Auth CLI after changing auth plugins |
| `pnpm run cf-typegen` | Regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` |

## Deploy

1. `wrangler hyperdrive create b7-fullstack --connection-string="postgres://…" --caching-disabled`, and put the ID in `wrangler.jsonc`.
2. Set `BETTER_AUTH_URL` (and `EMAIL_FROM`, with a sender on a domain verified in Resend) in `wrangler.jsonc` `vars` to the production values. The committed values are for local dev only. `onboarding@resend.dev` delivers only to your own Resend account address.
3. `wrangler secret put BETTER_AUTH_SECRET` and `wrangler secret put RESEND_API_KEY`.
4. `DATABASE_URL=postgres://… pnpm run db:migrate`, then `pnpm run deploy`.

`.github/workflows/ci.yml` does steps 4 and the smoke test on `main`. It needs the `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `DATABASE_URL` secrets and the `PRODUCTION_URL` variable. It takes effect once this directory is a repository root, which is what `create-b7` will generate.

## How it is put together

Request flow and ownership follow [architecture.md](../../stacks/fullstack/architecture.md). In short:

| Path | Role |
|------|------|
| `src/start.ts` | Global request middleware: one DB pool (`max: 1`, lazy) and one Better Auth instance per request. Closes the pool after the response and Better Auth background tasks. Re-adds the server-function CSRF guard |
| `src/routes/api/auth/$.ts` | Better Auth handler |
| `src/routes/api/rpc.$.ts` | oRPC `RPCHandler` (`ANY`), behind `createCsrfMiddleware()` |
| `src/lib/orpc.ts` | Isomorphic client: in-process `createRouterClient` during SSR (reading the request scope via `getGlobalStartContext()`), `RPCLink` in the browser, TanStack Query utils |
| `src/rpc/` | Root router, `requireSession` / `authed` |
| `src/modules/<name>/` | `schema.ts` · `service.ts` · `procedures.ts`. `auth`, `email`, `notes`, and the unwired `billing` contract |
| `src/env.ts` | Zod schema for vars and secrets, parsed per request |
| `src/db/` | `createDb()` and the schema barrel that Drizzle Kit and Better Auth read |

Decisions taken while implementing:

- **No Hono** in this profile, per [ADR-002 / A1](../../docs/technology-decisions.md#adr-002-tanstack-start-owns-all-http-routing-and-hono-is-removed-from-fullstack-a1). Start server routes own `/api/*`. Hono remains the router of [B7 API](../../stacks/api/README.md).
- **`Pool({ max: 1 })` instead of a bare `Client`.** It still means one connection per request, but it connects lazily. Inside `db.transaction`, use `tx`.
- **Relative imports, no path alias.** The Better Auth CLI and Drizzle Kit load `src/db/schema.ts` outside Vite and do not resolve aliases.
- **`compatibility_date` is 2026-10-30**, the newest date the pinned workerd supports.
- **pnpm** for installs and scripts. `pnpm-workspace.yaml` allows build scripts only for `esbuild` and `workerd` (which downloads the Workers runtime). pnpm's default minimum release age stays on, so brand-new releases are not installed.
- **`@cloudflare/vitest-plugin`**: `@cloudflare/vitest-pool-workers` is deprecated. It requires Vitest 4, so Vitest is pinned to `^4.1` (not 5).

## Verification status

Measured on 2026-10-31 with the versions in `pnpm-lock.yaml`. *Local* means `vite dev`, `vite preview` (built Worker in workerd) or Vitest in workerd, all against Docker PostgreSQL. **Hyperdrive was bypassed in every case** (local dev connects directly).

| Capability | Status | Evidence |
|-----------|--------|----------|
| SSR, routing, hydration | Tested locally | Playwright `notes.spec.ts`, `smoke.spec.ts` against `vite preview` |
| oRPC over HTTP (browser) and in-process (SSR) | Tested locally | E2E plus curl. Signed-in SSR renders notes without a browser RPC call |
| `ANY` handler receives GET/POST/PUT (T-T3) | Tested locally | curl: each method reached oRPC |
| Zod input validation → `BAD_REQUEST` | Tested | `test/notes.test.ts` |
| Drizzle persistence, migrations | Tested | Vitest through the `HYPERDRIVE` binding, `drizzle-kit migrate` on a fresh DB |
| Better Auth sign-up/sign-in/sign-out, DB sessions | Tested | Vitest plus E2E |
| Protected procedures, per-user isolation | Tested | `UNAUTHORIZED` for anonymous callers, `NOT_FOUND` for another user's note |
| Revocation is immediate after sign-out (H-T1) | Tested locally | Vitest. Not tested under Hyperdrive |
| Auth rate limiting, database storage, `cf-connecting-ip` (BA-T2) | Tested locally, single isolate | `test/auth.test.ts`: 429 after 3 sign-ins / 10 s, other IP unaffected |
| Untrusted `Origin` rejected by Better Auth | Tested | `test/auth.test.ts` |
| Cross-site RPC rejected by CSRF middleware (T-T4) | Tested locally | curl with a foreign `Origin` and `Sec-Fetch-Site: cross-site` gives 403. Not automated |
| Resend `sendEmail()` | Tested with Resend faked at the HTTP boundary | `test/email.test.ts`. **Never sent through the live Resend API** (no key available) |
| Verification email on sign-up via `waitUntil` | Tested locally | Dev log shows the email. The production build logs the missing-key error from the background task |
| Workers production build | Tested | `vite build`, `wrangler deploy --dry-run` (734 KiB gzip), `vite preview` |
| Billing contract (states, entitlements, Stripe/AbacatePay status maps) | Implemented, unit-tested, **not wired** | `test/billing.test.ts`. No adapter, tables, webhook route or cron |
| CI workflow | Written, **never run** | `.github/workflows/ci.yml`. Its steps were run by hand on a clean copy |
| Deployed Worker, real Hyperdrive, Free-plan CPU (T-T1, T-T2, T-T5, D-T1, D-T2, BA-T1, W-1, W-2, H-T2) | **Not tested** | Needs a Cloudflare account and a hosted PostgreSQL |

## Adding optional modules

None of these are installed. Each adds only what the [feature table](../../docs/configuration-model.md#fullstack-features-what-each-one-adds) lists.

| Option | Where it plugs in | State |
|--------|-------------------|-------|
| `oauthProviders` | `socialProviders: { github: { clientId, clientSecret } }` in `createAuth`, the two env vars in `src/env.ts`, a button calling `authClient.signIn.social` | Prepared, not configured or tested |
| `organizations` (needs email) | Better Auth `organization` plugin, `requireMembership`/`requirePermission` in `src/rpc/middleware.ts`, `organization_id` on tenant tables ([chain](../../stacks/fullstack/authentication.md#with-organizations-optional)) | Not implemented (M2) |
| `billing` | One adapter implementing `BillingProvider` in `src/modules/billing/adapters/`, the tables from [billing.md](../../stacks/fullstack/billing.md#tables), `src/routes/api/webhooks/<provider>.ts`, and `src/server.ts` with `scheduled` plus a cron trigger | Contract only (M3/M5) |
| `storage` (R2), `queues` | `r2_buckets` / `queues` in `wrangler.jsonc`, `src/server.ts` for `queue` | Not implemented |
| `publicApi` | `@orpc/openapi`, `src/routes/api/v1.$.ts` with `OpenAPIHandler` over the same router | Not implemented |
| `turnstile`, `sentry`, `passkeys` | See [infrastructure.md](../../stacks/fullstack/infrastructure.md#optional-services) | Not implemented |
| KV, Durable Objects | Deferred in v0.2 ([A10](../../architecture-review.md#decisions-requiring-maintainer-approval)) | Not offered |

Workers Observability is core and enabled in `wrangler.jsonc`.

## Known limitations

- Password reset is not wired. Better Auth supports it once `sendResetPassword` and a reset page are added.
- Email verification is sent but not required for sign-in (`requireEmailVerification` is off).
- The root route's `beforeLoad` calls the `session` procedure on each client navigation (one RPC round trip).
- The per-request pool closes after the response. A query issued after that (for example from a deferred, streamed loader) fails with "Cannot use a pool after calling end". Don't stream loaders that query the database without revisiting `src/start.ts`.
- The build bundles Kysely's SQLite dialects pulled in by Better Auth. They are unused, but they count toward Worker size.
