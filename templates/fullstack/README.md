# B7 Fullstack reference implementation

The runnable form of [B7 Fullstack](../../stacks/fullstack/README.md). `b7.json` records this project's configuration. `create-b7` generates smaller configurations by removing options from this template ([ADR-014](../../docs/technology-decisions.md#adr-014-options-compose-by-removing-feature-regions-from-a-complete-template)).

Core: TanStack Start, oRPC + Zod, Better Auth email + password, PostgreSQL + Drizzle, Tailwind + Base UI + Lucide, Node.js in Docker.
<!-- #if email -->
Email: Resend, for email verification (required to sign in) and password reset.
<!-- #endif -->
<!-- #if organizations -->
Organizations: Better Auth's organization plugin. Notes belong to the active organization and are shared by its members; owners and admins invite members by email at `/organization`.
<!-- #endif -->
<!-- #if billing -->
Billing: Stripe Checkout and customer portal at `/billing`, a verified webhook at `/api/webhooks/stripe`, derived entitlements (the free plan keeps 20 notes; Pro is unlimited), and a `scheduler` service that reconciles subscriptions daily. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_PRICE_PRO` in `.env`; locally, `stripe listen --forward-to localhost:3000/api/webhooks/stripe` prints the webhook secret.
<!-- #endif -->

The example domain is a per-user notes list: small, but it covers SSR, typed RPC, validation, persistence, sessions and authorization.

**Preview.** The whole stack runs and passes its tests in Docker Compose. It has not yet run on a public host with a real domain and real email. See [verification status](#verification-status).

## Run locally

Requires Node.js 24+, pnpm (the version in `package.json` `packageManager`; `npm i -g pnpm@<version>`) and Docker. `create-b7` does the first two steps for you.

```sh
pnpm install
cp .env.example .env                   # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm run db:up                         # PostgreSQL 17 in Docker on 127.0.0.1:5432
pnpm run db:migrate
pnpm run dev                           # http://localhost:3000
```

<!-- #if email -->
Without `RESEND_API_KEY`, the dev server prints emails to its log instead of sending them. Sign-in requires a verified address, so open the verification link from that log after signing up. In a production build, a missing key is an error.
<!-- #endif -->

| Command | What it does |
|---------|--------------|
| `pnpm run typecheck` · `lint` · `format` | `tsc` (strict) · Biome check · Biome fix |
| `pnpm run test` | Vitest in Node against the database in `DATABASE_URL` |
| `pnpm run test:e2e` | Playwright against `pnpm run dev`. `BASE_URL=… pnpm exec playwright test smoke` checks a running deployment |
| `pnpm run build` · `start` · `preview` | Production build · serve it with srvx on :3000 · both |
| `pnpm run db:generate <name>` · `db:migrate` | Drizzle Kit migration from schema changes · apply to `DATABASE_URL` |
| `pnpm run auth:schema` | Regenerate `src/modules/auth/schema.ts` with the Better Auth CLI after changing auth plugins |

## Run in Docker (production)

```sh
docker compose up -d --build           # postgres → migrate → app → caddy
```

| Service | Role |
|---------|------|
| `postgres` | PostgreSQL 17 with a named volume. Published only on `127.0.0.1:5432` |
| `migrate` | `Dockerfile` target `migrate`: runs `drizzle-kit migrate`, then exits. `app` starts only after it succeeds |
| `app` | `Dockerfile` target `runtime`: Node.js, production dependencies and the build, served by srvx on :3000 (not published). Health-checked |
| `caddy` | Reverse proxy on :80/:443. Sets `X-Forwarded-For` to the real client IP, which auth rate limiting uses. Finds `app` replicas through Docker DNS and round-robins between them (`docker compose up -d --scale app=2`) |

Configuration comes from `.env`:

1. `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` are required (`create-b7` generates both).
2. `APP_URL` is the public URL. `http://localhost` (the default) serves plain HTTP. `https://app.example.com` makes Caddy obtain a Let's Encrypt certificate: point the domain's DNS at the host and open ports 80 and 443.
<!-- #if email -->
3. `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain verified in Resend) for real email. `onboarding@resend.dev` delivers only to your own Resend account address.
<!-- #endif -->

To deploy, copy the project to any host with Docker (or `git pull` there) and run the command above. To update, pull and run it again: `migrate` applies new migrations before the new `app` starts. Back up the `pgdata` volume, for example with `docker compose exec postgres pg_dump -U postgres b7`.

The app container must not be published directly: rate limiting trusts `X-Forwarded-For`, which only Caddy may set.

`.github/workflows/ci.yml` runs the checks and the full Compose stack with the E2E tests. It takes effect once this directory is a repository root, which is what `create-b7` generates. Pushing images to a registry is left to the deployment you choose.

## How it is put together

Request flow and ownership follow [architecture.md](../../stacks/fullstack/architecture.md). In short:

| Path | Role |
|------|------|
| `src/start.ts` | Global request middleware: builds one `pg` pool and one Better Auth instance per process on the first request and passes them in the request context. Re-adds the server-function CSRF guard |
| `src/routes/api/auth/$.ts` | Better Auth handler |
| `src/routes/api/rpc.$.ts` | oRPC `RPCHandler` (`ANY`), behind `createCsrfMiddleware()` |
| `src/lib/orpc.ts` | Isomorphic client: in-process `createRouterClient` during SSR (reading the request context via `getGlobalStartContext()`), `RPCLink` in the browser, TanStack Query utils |
| `src/rpc/` | Root router, `requireSession` / `authed` |
| `src/modules/<name>/` | `schema.ts` · `service.ts` · `procedures.ts`. `auth`, `notes`, `email` (when configured) and the unwired `billing` contract |
| `src/env.ts` | Zod schema for the environment, parsed once at startup |
| `src/db/` | `createDb()` and the schema barrel that Drizzle Kit and Better Auth read |
| `Dockerfile`, `compose.yaml`, `Caddyfile` | Images and the production stack |

Decisions taken while implementing:

- **No Hono** in this profile, per [ADR-002 / A1](../../docs/technology-decisions.md#adr-002-tanstack-start-owns-all-http-routing-and-hono-is-removed-from-fullstack-a1). Start server routes own `/api/*`. Hono remains the router of [B7 API](../../stacks/api/README.md).
- **Docker instead of Cloudflare Workers**, per [ADR-013](../../docs/technology-decisions.md#adr-013-docker-compose-replaces-cloudflare-workers-as-the-fullstack-target). A long-lived process keeps one connection pool, so there is no Hyperdrive.
- **srvx** serves the build. It is the server TanStack Start's own preview uses, and it is stable, while Nitro's Node preset is still a release candidate.
- **Relative imports, no path alias.** The Better Auth CLI and Drizzle Kit load `src/db/schema.ts` outside Vite and do not resolve aliases.
- **`disableOriginCheck: false` is explicit.** Better Auth skips the origin check when `NODE_ENV=test`, so without it the tests would not exercise production behavior.
- **pnpm** for installs and scripts. `pnpm-workspace.yaml` allows build scripts only for `esbuild`. pnpm's default minimum release age stays on, so brand-new releases are not installed.

## Verification status

Measured on 2026-11-01 with the versions in `pnpm-lock.yaml`. *Local* means `vite dev` or Vitest in Node against Docker PostgreSQL. *Compose* means `docker compose up --build` on one machine, reached through Caddy at `http://localhost`.

| Capability | Status | Evidence |
|-----------|--------|----------|
| SSR, routing, hydration | Tested locally and in Compose | Playwright `notes.spec.ts`, `smoke.spec.ts` |
| oRPC over HTTP (browser) and in-process (SSR) | Tested locally and in Compose | E2E plus curl. Signed-in SSR renders notes without a browser RPC call |
| `ANY` handler receives GET/POST/PUT (T-T3) | Tested locally | curl: each method reached oRPC |
| Zod input validation → `BAD_REQUEST` | Tested | `test/notes.test.ts` |
| Drizzle persistence, migrations | Tested | Vitest, and the `migrate` service on a fresh volume |
| Better Auth sign-up/sign-in/sign-out, DB sessions | Tested | Vitest plus E2E |
| Protected procedures, per-user isolation | Tested | `UNAUTHORIZED` for anonymous callers, `NOT_FOUND` for another user's note |
| Revocation is immediate after sign-out (H-T1) | Tested | Vitest |
| Auth rate limiting, database storage (BA-T2) | Tested locally and in Compose | `test/auth.test.ts`: 429 after 3 sign-ins / 10 s, other IP unaffected. Through Caddy, a forged `X-Forwarded-For` does not bypass the limit (curl: 401 401 401 429 429) |
| Untrusted `Origin` rejected by Better Auth | Tested | `test/auth.test.ts` |
<!-- #if email -->
| Email verification required: no session at sign-up, unverified sign-in refused (and the link re-sent), the link signs in | Tested locally and in Compose | `test/auth.test.ts`, `e2e/notes.spec.ts` (signs the link with `BETTER_AUTH_SECRET`) |
<!-- #endif -->
| Session read once: SSR fills the query cache, client navigation makes no session request, sign-in and sign-out clear the cache | Tested locally and in Compose | `e2e/navigation.spec.ts` (fails with 4 requests on the previous code) |
<!-- #if email -->
| Password reset: email link, single-use token, all sessions revoked, same answer for unknown addresses | Tested locally and in Compose | `test/password-reset.test.ts`, `e2e/password-reset.spec.ts` (reads the token from the database) |
<!-- #endif -->
<!-- #if organizations -->
| Organizations: create, invite by email, accept, notes shared within the organization | Tested locally and in Compose | `e2e/organizations.spec.ts` (reads the invitation ID from the database) |
| Tenant isolation (M-T1), no active organization (M-T2), roles from the member row (M-T3), removed member rejected immediately (H-T2) | Tested | `test/organizations.test.ts` |
<!-- #endif -->
<!-- #if billing -->
| Stripe webhooks: signature (S-T1), reverse order (S-T2), duplicates (B-T1), failure and retry (B-T2), statuses (B-T3), 50 concurrent (B-T4), reconciliation (B-T5) | Tested with Stripe faked at `fetch` | `test/billing-sync.test.ts` |
| Checkout links the customer (S-T3); no state change before a webhook (B-T6); free-plan note limit | Tested with Stripe faked at `fetch` | `test/billing-sync.test.ts`, `e2e/billing.spec.ts` |
| Scheduler calls reconciliation; Caddy hides `/api/internal/*` | Tested in Compose | App log `POST /api/internal/reconcile [200]`; `e2e/billing.spec.ts` (404 through Caddy) |
| Real Stripe test-mode checkout and webhooks | **Not tested** | Needs Stripe keys |
<!-- #endif -->
| Cross-site RPC rejected by CSRF middleware (T-T4) | Tested in a production build | curl with a foreign `Origin` and `Sec-Fetch-Site: cross-site` gives 403. Not automated |
<!-- #if email -->
| Resend `sendEmail()` | Tested with Resend faked at the HTTP boundary | `test/email.test.ts`. **Never sent through the live Resend API** (no key available) |
<!-- #endif -->
| Production build and images | Tested | `vite build`, `docker compose up --build --wait` (all services healthy), runtime image 529 MB |
| CI workflow | Written, **never run** | `.github/workflows/ci.yml`. Its steps were run by hand |
| Replicas: `--scale app=2` behind Caddy, round-robin, auth rate limit shared across replicas (BA-T2) | Tested in Compose | curl through Caddy: requests split 10/10; sign-in attempts on both replicas give 401 401 401 429 429 |
| Sustained load (D-T2): 50 RPS for 10 min of signed-in `notes.list` on 2 replicas through Caddy | Tested in Compose | `node scripts/load.ts http://localhost 50 600 2`: 30,000 requests, all 200, PostgreSQL connections flat at 3 in all 60 samples |
| Public host with a domain and HTTPS, real email | **Not tested** | Needs a server and a domain (and a Resend key for email) |

## Adding optional modules

None of these are installed. Each adds only what the [feature table](../../docs/configuration-model.md#fullstack-features-what-each-one-adds) lists.

| Option | Where it plugs in | State |
|--------|-------------------|-------|
| `oauthProviders` | `socialProviders: { github: { clientId, clientSecret } }` in `createAuth`, the two env vars in `src/env.ts`, a button calling `authClient.signIn.social` | Prepared, not configured or tested |
| `organizations` (needs email) | Better Auth `organization` plugin, `scoped` in `src/rpc/middleware.ts` with `requireMembership`/`requirePermission` from `src/modules/organizations/`, `organization_id` on tenant tables ([chain](../../stacks/fullstack/authentication.md#with-organizations-optional)) | `create-b7 --organizations` |
| `billing` | `src/modules/billing/` (Stripe adapter, inbox sync, plans), `src/routes/api/webhooks/stripe.ts`, `src/routes/api/internal/reconcile.ts` and the `scheduler` service | `create-b7 --billing stripe`; AbacatePay not implemented (M5) |
| `publicApi` | `@orpc/openapi`, `src/routes/api/v1.$.ts` with `OpenAPIHandler` over the same router | Not implemented |
| `turnstile`, `sentry`, `passkeys` | See [infrastructure.md](../../stacks/fullstack/infrastructure.md#optional-services) | Not implemented |

## Known limitations

- The build contains Kysely's SQLite dialects pulled in by Better Auth. They are lazy `import()` chunks that never load with the Drizzle adapter, and cost about 0.3 MB of disk in the image.
