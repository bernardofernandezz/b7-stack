# B7 Stack: Architecture Review (v0.2 refinement)

**Date:** 2026-10-31 (all sources accessed on this date)
**Supersedes:** the v0.1 review (in git history: commit `9816a4d`, refined in `bfc9355`).
**Scope:** narrow B7 Fullstack to the smallest production-feasible architecture, re-verify every critical claim, and define what blocks the first reference implementation.
**Nothing here is executable evidence.** Items marked VERIFIED are confirmed by vendor documentation only. **No part of B7 is production-ready until the acceptance tests below pass against a deployed Worker.**

## Target change: Docker Compose replaces Cloudflare Workers (2026-11-01)

At the maintainer's request, B7 Fullstack now runs as a Node.js process in Docker Compose behind Caddy ([ADR-013](site/content/docs/technology-decisions.md#adr-013-docker-compose-replaces-cloudflare-workers-as-the-fullstack-target)). Everything below that is about Workers, Hyperdrive or Wrangler is kept as history. Its effect on this review:

| Item | Status after the change |
|------|-------------------------|
| A4 (cache-disabled Hyperdrive), H-a, D-T1, BA-T1, S2 | **Obsolete.** There is no Hyperdrive and no per-request client or auth instance: one pool and one Better Auth instance per process |
| A9, T-T2, S1 | **Replaced.** Reconciliation runs in a `scheduler` Compose service, so no custom Worker entry exists |
| A12, W-1 | **Obsolete.** No Workers CPU limit. Password hashing runs in Node.js |
| W-2 | **Replaced** by C-T1 |
| S4, S-T1 | **Simplified.** Stripe's Node SDK verifies signatures natively. S-T1 still runs |
| BA-T2, D-T2 | **Passed** in Compose on 2 replicas (2026-11-01): see the template's Verification status |
| H-b | Exercised by B-T4 locally (50 concurrent webhooks); still to confirm against real Stripe latency |

New tests:

| ID | Test | Pass condition | Status (2026-11-01) |
|----|------|----------------|---------------------|
| C-T1 | `docker compose up --build --wait`, then Playwright smoke and notes E2E through Caddy | All services healthy, E2E green | **Passed** locally, for the template and for a project generated from the packed CLI |
| C-T2 | Sign-in attempts through Caddy, each with a different forged `X-Forwarded-For` | Rate limit still applies (429 after the limit) | **Passed** locally (401 401 401 429 429) |
| C-T3 | `APP_URL=https://<domain>` on a public host | Caddy obtains a certificate, smoke test green over HTTPS, cookies are `Secure` | Not run: needs a host and a domain |

## Evidence labels

| Label | Meaning |
|-------|---------|
| **VERIFIED (docs)** | Current official documentation states it directly |
| **UNVERIFIED** | Built only from documented pieces, or the docs are silent. A named test decides it |
| **INCORRECT (v0.1)** | B7 v0.1 contradicted official documentation |
| **UNSUPPORTED** | The vendor does not provide the capability |

Version notes: no vendor page reviewed states a library version except where noted (`pg` ≥ 8.16.3, Better Auth 1.5 release post dated 2026-02-28, Stripe Subscription API object as currently published, AbacatePay API v2, `@base-ui/react` 1.9.0 on npm). The reference implementation must record the exact versions it pins.

---

## Contradictions found in v0.1

| # | Contradiction | Resolution in v0.2 |
|---|---------------|--------------------|
| X-1 | README and Fullstack docs made Hono core, while every vendor integration B7 uses (Better Auth, oRPC) is documented against Start server routes, not Hono-in-Start | Hono removed from Fullstack [A1] |
| X-2 | `architecture.md` promoted Hyperdrive caching ("default on") for scaling, while Cloudflare says writes do not invalidate it and recommends disabling it for auth and billing | Caching disabled on the only binding [A4] |
| X-3 | `billing.md` said AbacatePay trials were undocumented, but AbacatePay documents `trialDays`, `trialEndsAt` and `subscription.trial_started` | Corrected in [billing](site/content/docs/stacks/fullstack/billing.md#abacatepay-experimental) |
| X-4 | `billing.md` ordered events by time (`last_event_at`), while Stripe says not to use `created` for ordering and AbacatePay payloads carry no timestamp | Replaced with state sync [A8] |
| X-5 | Principles say "no mandatory paid services", but email + password on the Workers Free plan (10 ms CPU) is unmeasured | Marked UNVERIFIED, blocker [A12] |
| X-6 | The configuration model allowed SQLite (via `bun:sqlite`) on the Workers target | Removed: SQLite (TS) and D1 deferred |
| X-7 | The configuration model made "organizations without email" a warning, while Better Auth invitations need `sendInvitationEmail` | Hard rule |
| X-8 | `security.md` referenced Hono's `csrf()` for Fullstack | Replaced by Start `createCsrfMiddleware` |
| X-9 | `cli/README.md` held a roadmap that duplicated scope decisions | Moved to [ROADMAP.md](ROADMAP.md) |
| X-10 | `backendStrategy = start-server` documented no auth mount at all | The strategy dimension is removed, and auth is always mounted at a Start server route |

---

## Decision matrix

Confidence is **High** (vendor docs state it), **Medium** (each piece is documented but the combination is not), or **Low** (depends on undocumented behavior).

| ID | Decision | Alternatives considered | Evidence | Trade-offs | Recommendation | Confidence | Required validation |
|----|----------|------------------------|----------|-----------|----------------|-----------|--------------------|
| A1 | **HTTP routing: TanStack Start server routes only. No Hono in Fullstack** | (a) Start + Hono dispatcher in `src/server.ts`; (b) Hono inside a Start splat route; (c) Start only | Better Auth: Start mount at `src/routes/api/auth/$.ts` ([installation](https://www.better-auth.com/docs/installation)). oRPC: Start mount at `src/routes/api/rpc.$.ts` ([adapter](https://orpc.dev/docs/adapters/tanstack-start)). Start: server routes, global request middleware, CSRF middleware ([middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware)). **No vendor documents Start + Hono in one Worker**, and the community examples found are unofficial | Lose Hono middleware. Depend on Start's younger server-route API | (c) | Medium–High | T-T1, T-T3, T-T4 |
| A2 | **oRPC is the only app transport. No server functions for business logic** | Server functions only; both | oRPC isomorphic client and in-process `createRouterClient` for SSR ([adapter](https://orpc.dev/docs/adapters/tanstack-start)) | One more dependency. Loaders call procedures | oRPC only | Medium | T-T1, T-T5 |
| A3 | **PostgreSQL only in Fullstack. D1 deferred** | Keep D1 as an alternative | Better Auth on D1 uses `batch()` rather than interactive transactions ([Better Auth 1.5](https://better-auth.com/blog/1-5)). Billing's design needs row locks | Excludes SQLite-only deployments | PostgreSQL only | High | — |
| A4 | **One Hyperdrive binding with caching disabled. A cached binding is deferred** | Cache on (default); two bindings | "Hyperdrive does not purge or invalidate cached read query results when your application writes", and use a cache-disabled config for "authentication, permissions, billing" ([query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)) | No query caching | One uncached binding | High | H-T1, H-T2 |
| A5 | **Better Auth is core in Fullstack** | Optional auth | A SaaS profile without users has no tenancy or billing customer | Removes a "no auth" Fullstack variant (use Web) | Core | High | — |
| A6 | **Cookie cache disabled by default** | Enabled with a short `maxAge` | When enabled, the session is validated from the cookie until it expires ([session management](https://www.better-auth.com/docs/concepts/session-management)) | One DB read per authenticated request | Disabled. Opt-in with ≤ 5 min | High | H-T1 |
| A7 | **Stripe is the reference. AbacatePay is EXPERIMENTAL** | Equal support | AbacatePay: no `past_due`, no period end, card-only subscriptions, undocumented payload fields, HMAC keyed with a published key ([subscriptions](https://docs.abacatepay.com/pages/subscriptions/reference), [security](https://docs.abacatepay.com/pages/webhooks/security)) | Brazilian users get weaker billing guarantees | As stated | High | A-T1…A-T3 |
| A8 | **Billing state sync**: webhook → inbox insert + row lock + provider fetch, in one transaction. Entitlements derived. Outbox deferred | Event-sourced state from payloads; queue-mode processing; outbox now | Stripe: no ordering guarantee, do not use `created` ([webhooks](https://docs.stripe.com/webhooks)). AbacatePay has `GET /v2/subscriptions/get` ([get](https://docs.abacatepay.com/pages/subscriptions/get)) | A transaction is held across an outbound HTTP call. One API call per event | As stated | Medium | B-T1…B-T5 |
| A9 | **Cron is derived from billing** (daily reconciliation) | Optional cron | AbacatePay has no period field and undocumented payloads, so reconciliation is the safety net | Billing always needs the custom `src/server.ts` | Derived | High | T-T2, B-T5 |
| A10 | **KV and Durable Objects deferred. Passkeys experimental. Teams and dynamic roles deferred** | Keep them as options | No core feature needs them | Fewer options | Defer | High | — |
| A11 | **Configuration model reduced to profile + profile-specific options**. Auth deferred in Web and API. SQLite (TS) deferred | Keep the 18 dimensions | v0.1 had redundant dimensions (`runtime`, `backendFramework`, `backendStrategy`) and two invalid combinations (X-6, X-10) | Less flexibility in v0.2 | Reduce | High | — |
| A12 | **Plan requirement for email + password** | Assume the Free plan works | Free plan: 10 ms CPU per request ([limits](https://developers.cloudflare.com/workers/platform/limits/)). Hashing cost is undocumented | — | Measure first, then choose: document the Paid plan, default to OAuth, or tune hashing (never silently) | Low | W-1 |

---

## Facts, assumptions and hypotheses

### Confirmed facts (vendor docs)

- **TanStack Start**
  - Builds for Workers with `@cloudflare/vite-plugin` (`viteEnvironment: { name: "ssr" }`).
  - Its default Wrangler `main` is `@tanstack/react-start/server-entry`.
  - A custom `src/server.ts` may export `fetch: handler.fetch` plus `scheduled` and `queue` ([Cloudflare guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/), [Start hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)).
- **Start middleware.** Global request middleware runs for SSR, server routes and server functions. Defining `src/start.ts` removes Start's automatic CSRF middleware for server functions. `createCsrfMiddleware()` can also be attached to any route ([middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware)).
- **oRPC.** Mounts in a Start server route with an `ANY` handler. Its server-side client is shared across requests, so per-request data must come through a function context ([adapter](https://orpc.dev/docs/adapters/tanstack-start)).
- **Better Auth.**
  - Mounts in Start at `/api/auth/$`, and needs `tanstackStartCookies` for server-side cookie setting.
  - Needs `AsyncLocalStorage` (`nodejs_compat`) ([installation](https://www.better-auth.com/docs/installation)).
  - Rate-limit memory storage is unsuitable for serverless. `storage: "database"` and `ipAddressHeaders` are supported ([rate limit](https://www.better-auth.com/docs/concepts/rate-limit)).
  - `activeOrganizationId` is `null` on new sessions, and `createAccessControl` is imported from `better-auth/plugins/access` ([organization](https://www.better-auth.com/docs/plugins/organization)).
- **Hyperdrive.**
  - Drizzle + Postgres.js is unsupported, and `pg` ≥ 8.16.3 is required ([Drizzle](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/), [node-postgres](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/)).
  - Caching defaults to 60 s plus 15 s stale-while-revalidate and is not invalidated by writes ([caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)).
  - Pooling is in transaction mode, and `SET` only persists within a transaction ([how it works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/)).
  - It is available on the Free plan with 100k queries/day ([pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/)).
- **Workers.**
  - 10 ms CPU on Free. 6 simultaneous connections waiting for headers. 15 min for cron and queue consumers ([limits](https://developers.cloudflare.com/workers/platform/limits/)).
  - The Vitest pool injects `nodejs_compat` ([best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)).
- **Stripe.**
  - Subscription statuses: `incomplete`, `incomplete_expired`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `paused`. `incomplete_expired` is terminal ([Subscription object](https://docs.stripe.com/api/subscriptions/object)).
  - No ordering guarantee, and `created` must not be used for ordering. Retries last up to 3 days. The default signature tolerance is 5 min, and 0 disables it ([webhooks](https://docs.stripe.com/webhooks)).
- **AbacatePay.**
  - Subscription statuses are `PENDING`, `ACTIVE` and `CANCELLED`. Failed retries end in automatic cancellation. Trials are supported. There is no period field, and subscriptions support `CARD` only ([reference](https://docs.abacatepay.com/pages/subscriptions/reference), [create](https://docs.abacatepay.com/pages/subscriptions/create), [get](https://docs.abacatepay.com/pages/subscriptions/get)).
  - Webhook envelope `{ id, event, apiVersion, devMode, data }`, with no timestamp ([webhooks](https://docs.abacatepay.com/pages/webhooks)).
  - Signature: HMAC-SHA256 keyed with a key published in the docs, plus a `webhookSecret` query parameter. Retried 7 times over about 18 hours, and `410` disables the webhook ([security](https://docs.abacatepay.com/pages/webhooks/security)).
- **Queues** are available on the Free plan with 10k operations/day ([pricing](https://developers.cloudflare.com/queues/platform/pricing/)).

### Assumptions (B7 relies on them, the docs don't state them)

- **S1.** Calling `handler.fetch` from a custom `src/server.ts` that also exports `scheduled` behaves exactly like the built-in entry. Cloudflare shows the shape. B7 assumes there are no side effects.
- **S2.** A Better Auth instance created per request has acceptable CPU cost. The 1.5 example constructs it inside `fetch` but doesn't discuss cost.
- **S3.** Start's `ANY` server-route handler key works. oRPC's docs use it, and Start's server-routes page does not list it. The fallback is to list each method explicitly.
- **S4.** Stripe's `constructEventAsync` and `createSubtleCryptoProvider` exist and work on the current SDK in workerd. The only official source is the 2021 Cloudflare post.
- **S5.** `subscription_data.metadata` and `customer` are the right Stripe Checkout Session parameters for linking a session to a customer. **Checked 2026-11-01** against the `stripe` SDK 23.1.0 types (API `2026-10-28`), and exercised by test S-T3 with Stripe faked.

### Implementation hypotheses (B7 design choices to validate)

- **H-a.** A lazily connected, per-request `pg` client closed with `ctx.waitUntil(client.end())` leaks nothing under Hyperdrive.
- **H-b.** Holding a transaction with `SELECT … FOR UPDATE` across a provider API call is acceptable under Hyperdrive transaction pooling at webhook volumes.
- **H-c.** Better Auth's database rate limiter is correct under concurrent requests from many isolates. Its storage contract requires atomicity, and its own database storage is assumed to satisfy it.
- **H-d.** Loading the `member` row on every org-scoped request is cheap enough without caching.

---

## v0.1 findings: corrected status

| v0.1 ID | v0.1 finding | v0.2 status |
|---------|-------------|-------------|
| T-1 | The Start + Hono dispatcher needed validation | **Superseded** by A1. The dispatcher is removed |
| T-2 | CORS unnecessary | **Resolved**: same origin, so no CORS middleware |
| H-1 | Hyperdrive caching makes reads stale | **Resolved in design** (A4). Still needs tests H-T1 and H-T2 |
| A-1 | AbacatePay HMAC uses a public key | **Confirmed** and documented. Mitigation: URL secret plus fetching state from the provider |
| A-1b | AbacatePay CLI scheme discrepancy | **Dropped**: it is not in current official docs |
| A-2 | `devMode` not rejected | **Resolved in design** |
| B-1 | Ordering by time | **Resolved in design** (A8) |
| B-2 | AbacatePay has no timestamps | **Resolved in design**. The payload ID field is still UNVERIFIED (A-T3) |
| B-3 | Dedup race | **Resolved in design**: inbox insert and state change share one transaction |
| B-4 | Incomplete Stripe statuses | **Resolved**: full mapping from the API reference |
| BA-2 | Instance per request | **Still UNVERIFIED** (BA-T1) |
| BA-3 | Rate-limit storage | **Resolved**: `database` with `cf-connecting-ip` |
| BA-4 | `tanstackStartCookies` | **Resolved**: auth flows only through `/api/auth/*` |
| D-2, D-3 | Connection count and lifecycle | **Designed**: one client per request. Still UNVERIFIED (D-T1, D-T2) |
| M-2 | `hasPermission` scope | **Avoided**: B7 checks membership and role from the member row. `hasPermission` is only allowed after M-T4 |
| M-3 | RLS overstated | **Corrected**: RLS is optional defense in depth |
| S-1 | Stripe on Workers | **Still UNVERIFIED** (S-T1) |
| S-2 | Thin vs snapshot events | **Unchanged**: snapshot events for v0.2, revisit later |
| W-1 | Free plan CPU | **Still UNVERIFIED**, blocker (A12) |
| C-1…C-8 | Config model issues | **Resolved** by A11 |

---

## Unresolved risks

| Risk | Impact | Owner of resolution |
|------|--------|---------------------|
| Password hashing exceeds Free-plan CPU (W-1) | The Paid plan becomes mandatory for email + password | Maintainer decision A12 after the measurement |
| AbacatePay webhook `data` fields are undocumented (A-T3) | The adapter cannot extract the subscription ID, which blocks AbacatePay | Test with a real dev-mode event, or ask AbacatePay support |
| AbacatePay authentication rests on a URL secret | Leaked logs could allow forged sync triggers. Impact is limited because state is fetched from the provider | Log redaction (observability standard) |
| A transaction held across a provider fetch (H-b) | Connection pressure during webhook bursts (for example, monthly renewals) | B-T4. Fall back to queue mode if it fails |
| TanStack Start API churn | Server-route and middleware APIs may change between versions | Pin versions, and rerun T-T1…T-T5 on upgrade |
| Better Auth Drizzle adapter import path differs between pages | Build failure only | Record the resolved path in the reference implementation |

---

## Required acceptance tests

All tests run against a **deployed** Worker with a real Hyperdrive binding, unless marked *local*. Local development bypasses Hyperdrive, and the Vitest pool injects `nodejs_compat`.

| ID | Test | Pass condition | Decides |
|----|------|----------------|---------|
| T-T1 | One Worker serves SSR, `/api/auth/*`, `/api/rpc/*`, and a webhook route | All respond correctly. A thrown loader error renders Start's error page | A1, A2 |
| T-T2 | The custom `src/server.ts` exporting `fetch: handler.fetch` and `scheduled`. Trigger cron | Cron runs, HTTP behavior is identical to the built-in entry | S1, A9 |
| T-T3 | `ANY` handler on `/api/rpc/$` receives `GET` and `POST` | Both reach oRPC. Otherwise switch to explicit methods | S3 |
| T-T4 | A cross-site `POST /api/rpc/*` (foreign `Origin` and `Sec-Fetch-Site: cross-site`) with a valid session cookie | Rejected by `createCsrfMiddleware` | A1 security |
| T-T5 | SSR loader using `createRouterClient` with function context, under two concurrent users | Each sees only their own data. No HTTP request to `/api/rpc` during SSR | A2 |
| D-T1 | One request touching auth, an org procedure and billing | Exactly one `pg` connection is opened. Pure SSR pages open none | H-a |
| D-T2 | Sustained load (for example, 50 RPS for 10 min) | No growth in origin connections, no errors | H-a |
| H-T1 | Sign out, then replay the old cookie immediately | `UNAUTHORIZED` | A4, A6 |
| H-T2 | Remove a member, who then immediately calls an org procedure | `FORBIDDEN` | A4, membership |
| BA-T1 | CPU time of `createAuth()` per request | Recorded. Must be a small fraction of the plan limit | S2 |
| BA-T2 | 101+ auth requests in 10 s from one IP (`cf-connecting-ip`), concurrently | `429` after the limit. A second IP is unaffected | H-c |
| W-1 | Sign-up and sign-in on the Workers **Free** plan | Under 10 ms CPU, or the failure is recorded, which triggers A12 | A12 |
| W-2 | Deploy with `nodejs_compat` removed | Deployed smoke test fails, proving the smoke test catches what Vitest misses | ADR-010 |
| M-T1 | Org A user calls every tenant procedure with org B resource IDs | `NOT_FOUND`, no data | Tenant isolation |
| M-T2 | Session with `activeOrganizationId = null` | `NO_ACTIVE_ORGANIZATION` | Membership |
| M-T3 | `member` role calls a `billing: ["manage"]` procedure | `FORBIDDEN` | Permissions |
| M-T4 | `auth.api.hasPermission` after membership removal, and with another org active | Documents its actual behavior. Allowed only if it rejects both. **Not needed:** B7 checks roles from the member row and never calls `hasPermission` | M-2 |
| S-T1 | `constructEventAsync` with SubtleCrypto verifies a `generateTestHeaderString` payload in workerd (*local* and deployed) | Valid accepted. Tampered body, wrong secret and expired timestamp rejected | S4 |
| S-T2 | `customer.subscription.updated` and `.deleted` delivered in reverse order | Final status `canceled` | A8 |
| S-T3 | Checkout Session creation links the subscription to `customer_ref` | The webhook sync finds the right customer | S5 |
| A-T1 | AbacatePay: (valid secret, valid HMAC), (valid, bad HMAC), (bad secret, valid HMAC) | 200 / 400 / 401 | Verification |
| A-T2 | AbacatePay `devMode: true` event in production | 200, no state change | Verification |
| A-T3 | Capture real dev-mode `subscription.completed`, `.renewed`, `.cancelled` and `.trial_started` payloads | The subscription ID location is documented in the adapter | A7, blocker |
| B-T1 | The same event delivered twice concurrently | One inbox row, one state change | Dedup |
| B-T2 | Failure after the inbox insert but before commit, then a retry | Retry succeeds, no orphan inbox row | Recovery |
| B-T3 | Stripe `unpaid`, `paused`, `incomplete_expired`, and an unknown status | Not entitled. Unknown values are logged | Mapping |
| B-T4 | 50 concurrent webhooks for 50 subscriptions (row lock plus provider fetch) | All succeed, no connection exhaustion | H-b |
| B-T5 | Webhook dropped on purpose, then the reconciliation cron runs | State corrected within one cron run | A9 |
| B-T6 | Browser lands on the checkout success URL before any webhook | Still `incomplete`, not entitled | Entitlement rule |

---

## Release blockers

Updated for the Docker target. The first reference implementation may be **built** now. It must not be called **production-ready** until all of these are met:

1. **T-T1, T-T3…T-T5, C-T1.** The Start composition works in the Compose stack (A1, A2).
2. **H-T1, H-T2, M-T1…M-T3.** Revocation and membership removal take effect immediately, and tenant isolation holds.
3. **C-T2, C-T3.** The proxy is the only source of the client IP, and HTTPS works on a public host.
4. **BA-T2, D-T2.** Rate limiting holds across replicas, and the pool does not grow under load.
5. **S-T1…S-T3, B-T1…B-T6.** Stripe billing is correct under duplicates, reordering, failure and reconciliation.
6. **A-T1…A-T3.** Required only for AbacatePay to leave EXPERIMENTAL. It does not block a Stripe-only release.
7. **C-T1 in CI.** The Compose stack E2E runs on every pull request.

---

## Decisions requiring maintainer approval

**Approved by the maintainer on 2026-11-01:** A1–A11 and A13. A12 is obsolete. Still pending: ADR-014 (how options compose), ADR-015 (one app, two targets through Nitro presets), and ADR-020/ADR-026 (Node.js instead of Bun for Web and API).

| ID | Decision | Changes from v0.1 |
|----|----------|-------------------|
| A1 | Start server routes own all HTTP. Hono removed from Fullstack | v0.1 made Hono own `/api/*` |
| A2 | oRPC is the only app transport. No business-logic server functions | v0.1 allowed both (`hono-orpc-with-start`) |
| A3 | PostgreSQL only. D1 deferred in Fullstack | v0.1 offered D1 |
| A4 | One cache-disabled Hyperdrive binding | v0.1 relied on default caching |
| A5 | Better Auth is core in Fullstack | v0.1 allowed `auth = none` |
| A6 | Cookie cache disabled by default | Not specified in v0.1 |
| A7 | Stripe is the reference, and AbacatePay is EXPERIMENTAL | v0.1 treated them as equals |
| A8 | Billing state sync with inbox and row lock. Entitlements derived. Outbox deferred | v0.1 used event-applied state and stored entitlements |
| A9 | Cron derived from billing | v0.1 made cron optional |
| A10 | KV and DO deferred, passkeys experimental, teams and dynamic roles deferred | v0.1 offered them |
| A11 | Reduced configuration model. Auth deferred in Web and API. SQLite (TS) deferred | v0.1 had 18 dimensions |
| A12 | Plan requirement decided after W-1 | Obsolete after A13 |
| A13 | Docker Compose (Node.js + Caddy) replaces Cloudflare Workers as the Fullstack target ([ADR-013](site/content/docs/technology-decisions.md#adr-013-docker-compose-replaces-cloudflare-workers-as-the-fullstack-target)) | v0.1 and v0.2 targeted Workers only |
