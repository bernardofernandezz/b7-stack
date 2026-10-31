# B7 Stack v0.1: Architecture Review

**Date:** 2026-10-31
**Scope:** feasibility of the B7 Fullstack architecture before the first reference implementation, plus consistency of the configuration model.
**Method:** every claim in `docs/` and `stacks/` that touches an integration was checked against current official documentation (sources are listed per finding). Nothing was executed. Where only running code can settle a question, the finding is classified accordingly.
**Status of the docs:** unchanged. This review proposes corrections, and none have been applied. Corrections that change an architectural decision are marked **[decision]** and need explicit approval.

## Classification

| Label | Meaning |
|-------|---------|
| **Verified** | Official documentation confirms the B7 claim as written |
| **Requires executable validation** | Built only from documented pieces, but only running code can confirm it |
| **Incorrect** | B7 documentation contradicts official documentation, or the design is wrong |
| **Unsupported** | B7 depends on a capability the official docs do not provide |
| **Uncertain** | Official docs are silent or contradictory, so B7 cannot decide without more information |

## Summary

| ID | Area | Finding | Class | Blocker |
|----|------|---------|-------|---------|
| H-1 | Drizzle + Hyperdrive | Hyperdrive caches reads and **writes do not invalidate them**. Sessions, memberships, entitlements and webhook dedup reads can be stale | **Incorrect** | **Yes** |
| A-1 | AbacatePay | The HMAC key is a **public** key from the docs, so the signature proves integrity but not origin. Authenticity rests on the URL query secret | **Incorrect** (B7 overstates it) | **Yes** |
| B-1 | Billing | Stripe docs say **do not use `created` to order events**, yet B7's out-of-order guard compares event times | **Incorrect** | **Yes** |
| B-2 | Billing | AbacatePay payloads have **no timestamp**, so `InternalBillingEvent.at` cannot be filled | **Unsupported** | **Yes** |
| B-3 | Billing | The dedup → process pipeline has a race window that duplicates side effects | **Incorrect** | **Yes** |
| B-4 | Billing | The Stripe status set is incomplete (`unpaid`, `paused`, `incomplete_expired`) | **Incorrect** | **Yes** |
| W-1 | Workers + Better Auth | Password hashing on the Workers **Free plan (10 ms CPU)** may not fit, which may make a paid plan mandatory | **Requires executable validation** | **Yes** |
| T-1 | Start + Hono | Custom `src/server.ts` dispatching `/api/*` to Hono | **Requires executable validation** | **Yes** |
| A-2 | AbacatePay | `devMode` events are not rejected in production | **Incorrect** (omission) | **Yes** |
| BA-1 | Better Auth | Better Auth runs on Workers with `nodejs_compat` | **Verified** | — |
| BA-2 | Better Auth | The instance-per-request factory `getAuth(env)` | **Requires executable validation** | **Yes** |
| BA-3 | Better Auth | Rate-limit storage: memory is unsuitable on serverless, so use `database`. The IP header must be `cf-connecting-ip` | **Verified** (resolves an uncertainty) | — |
| BA-4 | Better Auth | Server-side auth calls from Start need the `tanstackStartCookies` plugin. B7 does not mention it | **Incorrect** (omission) | No |
| BA-5 | Better Auth | `getSession` writes to the database to refresh sessions. Cookie cache is opt-in | **Verified** (design note) | No |
| BA-6 | Better Auth | The `createAccessControl` import path is `better-auth/plugins/access` | **Verified** (resolves an uncertainty) | — |
| D-1 | Drizzle + Hyperdrive | Drizzle must use the `pg` driver, because Postgres.js + Drizzle over Hyperdrive is unsupported | **Verified** | — |
| D-2 | Drizzle + Hyperdrive | The 6-simultaneous-connection limit applies when auth and app create separate clients | **Requires executable validation** | No |
| D-3 | Drizzle + Hyperdrive | The client lifecycle (`connect`/`end`) is undocumented in B7 | **Requires executable validation** | No |
| S-1 | Stripe | `constructEventAsync` with `createSubtleCryptoProvider` on Workers | **Requires executable validation** (official source is a 2021 Cloudflare post) | **Yes** |
| S-2 | Stripe | Stripe recommends **thin** events for new integrations, and B7 assumes snapshot events | **Uncertain** **[decision]** | No |
| S-3 | Stripe | 5-minute timestamp tolerance, 3-day retries, possible duplicate Event objects | **Verified** | — |
| O-1 | oRPC + Hono | oRPC mounts through the Fetch adapter inside Hono middleware | **Verified** | — |
| M-1 | Tenancy | `activeOrganizationId` is `null` on new sessions | **Verified** (B7 handling is incomplete) | No |
| M-2 | Tenancy | Whether `hasPermission` scopes to the active org and checks membership is not documented | **Uncertain** | **Yes** |
| M-3 | Tenancy | B7 says RLS is "error-prone" with Hyperdrive, but Hyperdrive supports `SET` inside transactions | **Incorrect** (overstated) | No |
| C-1…C-8 | Config model | Redundant dimensions, missing rules, inconsistencies | **Incorrect** / simplification | C-3, C-4 |
| R-1 | Resend | Workers support. B7 uses `html`/`text`, not the Node-only `react` option | **Verified** | — |

---

## 1. TanStack Start + Hono on Cloudflare Workers

### T-1. Custom server entry that dispatches `/api/*` to Hono: Requires executable validation (blocker)

**B7 claim** ([fullstack/architecture.md](stacks/fullstack/architecture.md#server-entry)): `src/server.ts` exports `{ fetch(request, env, ctx), queue, scheduled }`. It forwards `/api/*` to `api.fetch(request, env, ctx)` and everything else to `handler.fetch(request)`.

**Evidence**
- Cloudflare documents a custom `src/server.ts` set as Wrangler `main`, exporting `fetch: handler.fetch` together with `queue`, `scheduled` and Durable Object classes ([Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)). **Verified.**
- TanStack Start documents `handler.fetch(request, opts)`, where `opts` is Start's request options and carries a `context` property. It does not document how Workers' `env` and `ctx` reach the handler ([Start server entry point](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point)). Note that Cloudflare's `fetch: handler.fetch` passes `env` as Start's `opts` argument. That is an undocumented coincidence of signatures.
- Start also says: "A cloned or rewritten `Request` starts a separate context", and such calls should be wrapped in `createServerEntry`. B7 passes the original request unmodified, so this does not apply. B7 must never rewrite a request before handing it to Start.
- Hono documents `export default { fetch: app.fetch, scheduled }` and `c.env` bindings ([Hono on Workers](https://hono.dev/docs/getting-started/cloudflare-workers)). **Verified.**
- Neither framework documents running both in one entry. Every piece used is documented, but the combination is not.

**Impact.** This is the core of the Fullstack profile. If Start depends on its `opts` (for example, for request context or Cloudflare-specific handling), calling `handler.fetch(request)` with no options could break SSR context or error conversion.

**Recommended correction**
1. Keep the design, and add the executable checks listed under [Required tests](#required-tests) (T-tests).
2. Document an officially closer alternative as a fallback, without switching to it. A Start **splat server route** `src/routes/api/$.ts` whose `GET`, `POST`, `PUT`, `PATCH` and `DELETE` handlers call `api.fetch(request, env)`, with `env` from `cloudflare:workers`. This is the exact pattern Better Auth documents for Start ([Better Auth + TanStack](https://www.better-auth.com/docs/integrations/tanstack)). Trade-offs: `/api` traffic passes through Start's router and middleware, there is no `ANY` method handler, so each method must be listed, and Hono's `c.executionCtx` is unavailable unless passed explicitly. **[decision]** Choose between them only after the T-tests.
3. In the snippet, wrap with `createServerEntry({ fetch })` if your Start version requires it for error conversion, and remove "Uncertain" once the tests confirm which form works.

### O-1. oRPC inside Hono: Verified

oRPC has no Hono-specific package. `RPCHandler` and `OpenAPIHandler` from `@orpc/server/fetch` run inside a Hono middleware ([oRPC Hono adapter](https://orpc.dev/docs/adapters/hono)). The documented "body already used" pitfall does not affect B7's planned middleware (Better Auth session lookup reads headers only, and Hono's `csrf()` checks headers). Any future body-reading middleware must be registered **after** the oRPC mount or must use the documented proxy workaround.

### T-2. CORS is unnecessary in the single-Worker design: simplification

**Evidence.** Better Auth's Hono guide adds CORS for cross-origin clients ([Better Auth + Hono](https://www.better-auth.com/docs/integrations/hono)). In B7 Fullstack, UI and API share one origin.
**Correction.** Generate CORS middleware only when an explicit cross-origin client is configured. Keep `trustedOrigins` set to the app origin.

---

## 2. Better Auth on Workers with PostgreSQL / Hyperdrive

### BA-1. Runtime compatibility: Verified

Better Auth requires `AsyncLocalStorage`, so it needs `nodejs_compat` or `nodejs_als` ([Better Auth + Hono](https://www.better-auth.com/docs/integrations/hono)). For compatibility dates on or after 2026-08-04, `nodejs_compat` is on by default, but B7 should still set it explicitly. Cloudflare warns that the Vitest pool **injects `nodejs_compat` automatically**, so tests can pass while a deploy fails ([Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)). That makes a post-deploy smoke test mandatory (test W-2).

### BA-2. `getAuth(env)` instance per request: Requires executable validation (blocker)

**Evidence.** No Better Auth page prescribes how to create an instance on Workers. Cloudflare's Hyperdrive guidance is to create the database client per request ([Hyperdrive + Drizzle](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/)), which forces either per-request auth instances or a module-scope instance whose database is resolved lazily.
**Impact.** It affects per-request CPU (plugin initialization) and correctness (any module-scope state inside Better Auth).
**Correction.** Keep the factory. Measure the CPU cost of creating the instance (test BA-T1). The factory must receive the **same** Drizzle instance the application uses for that request (see D-2).

### BA-3. Rate limiting: Verified, which resolves an earlier "Uncertain"

**Evidence** ([Better Auth rate limit](https://www.better-auth.com/docs/concepts/rate-limit)):
- The default memory storage "may not be suitable … particularly in serverless environments".
- Supported storage options: `"database"`, `"secondary-storage"`, or a `customStorage.consume` function that must be atomic.
- Rate limiting is **disabled in development** by default.
- The IP comes from `x-forwarded-for` by default. On Cloudflare, set `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]`.

**Correction** (in `docs/standards/security.md`): use `storage: "database"` with Hyperdrive caching disabled for that path (see H-1), set the `cf-connecting-ip` header, and enable rate limiting in one test environment. KV is **not** a fit, because it is eventually consistent and has no atomic consume.

### BA-4. `tanstackStartCookies` plugin: Incorrect (omission)

**Evidence.** Better Auth's TanStack Start integration requires the `tanstackStartCookies` plugin (from `better-auth/tanstack-start`, as the last plugin) when server-side calls such as `signInEmail` must set cookies through Start ([Better Auth + TanStack](https://www.better-auth.com/docs/integrations/tanstack)).
**Impact.** Sign-in done from a Start server function would silently set no cookie. Browser calls through `/api/auth` (Hono) are unaffected.
**Correction.** Document the rule in `authentication.md`: browser auth flows go through `/api/auth/*`. Start server functions may only *read* sessions (`getSession` with `getRequestHeaders()`). Any server-function flow that sets cookies needs `tanstackStartCookies`. Also document where auth is mounted for `backendStrategy = start-server`: a Start server route at `/api/auth/$`, as in the official guide. Today B7 documents only the Hono mount (see C-5).

### BA-5. Session reads and writes: Verified (design note)

**Evidence.** By default, `GET /get-session` "performs database writes to refresh the session". `session.cookieCache` is opt-in and skips the database while its `maxAge` lasts. `freshAge` defaults to 1 day ([session management](https://www.better-auth.com/docs/concepts/session-management)).
**Impact.** Every authenticated request costs one database round trip, plus periodic writes.
**Correction.** Recommend a short `cookieCache.maxAge` (for example, minutes) as an explicit trade-off: revoked sessions stay valid until the cookie cache expires. Do **not** rely on Hyperdrive caching for session reads (H-1).

### BA-6. `createAccessControl` import path: Verified

The import path is `better-auth/plugins/access`. `defaultStatements` and `adminAc` come from `better-auth/plugins/organization/access` ([organization plugin](https://www.better-auth.com/docs/plugins/organization)). The "Uncertain" note in `authentication.md` can be removed.

### W-1. CPU cost of password hashing on the Free plan: Requires executable validation (blocker)

**Evidence.** The Workers Free plan allows **10 ms CPU per request**. The Paid plan allows a 30 s default and up to 5 min ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)). Better Auth hashes passwords with a memory-hard KDF, and a pure-JS KDF can plausibly exceed 10 ms. The exact cost is not documented and must be measured.
**Impact.** If sign-up and sign-in exceed the Free limit, B7 Fullstack with email/password **requires the Workers Paid plan**. That contradicts the principle "no mandatory paid services" ([principles](docs/principles.md#5-production-ready)).
**Correction.** Measure it (test W-1). If it exceeds the limit, the options are **[decision]**: (a) document the Paid plan as a requirement for email/password, (b) make OAuth or passkeys the Free-plan default, or (c) configure a cheaper `password.hash`/`verify` and accept a lower security margin. B7 should not choose (c) silently.

---

## 3. AbacatePay webhook verification

### A-1. The signature is keyed with a public key: Incorrect (B7 overstates its security)

**Evidence** ([AbacatePay webhook security](https://docs.abacatepay.com/pages/webhooks/security)):
- The `X-Webhook-Signature` header holds base64 HMAC-SHA256 of the raw body. The official example keys it with `ABACATEPAY_PUBLIC_KEY`, a constant **printed in the documentation**.
- The docs do not say whether the key is per account. The example shows a single global constant.
- The second mechanism is the `webhookSecret` query parameter, a secret you choose when creating the webhook in the dashboard ([AbacatePay webhooks](https://docs.abacatepay.com/pages/webhooks)).
- No timestamp is signed, and the docs describe no replay window.

**Analysis.** An HMAC keyed with a published key can be computed by anyone. It proves the body was not altered **relative to a signature anyone could produce**, so it proves nothing about origin. Authentication of the sender therefore rests entirely on `webhookSecret`. That secret travels in the URL, so it can appear in access logs, Workers Observability request logs, proxies and error trackers.

**Impact.** Anyone who learns the webhook URL with its secret (for example, from a log) can forge `subscription.completed` and grant themselves entitlements. Replaying a valid captured request is blocked only by event-ID dedup.

**Correction**
1. `billing.md`: state plainly that the HMAC is an integrity check and the query secret is the authentication factor. Keep both checks.
2. Redact the `webhookSecret` query parameter from all logs and Sentry breadcrumbs, and add this to `docs/standards/observability.md`.
3. **[decision] Re-fetch before granting.** Before activating an entitlement from an AbacatePay event, fetch the referenced checkout or subscription from the AbacatePay API with the server API key, and use that response as the source of truth. This turns a forged webhook into a no-op. **Uncertain:** confirm that the v2 API exposes read endpoints for subscriptions and checkouts (not checked in this review).
4. Use a high-entropy `webhookSecret` (≥ 32 random bytes) and rotate it by re-creating the webhook.

### A-1b. The CLI signature-scheme discrepancy: Uncertain (downgraded)

The earlier search snippet described a CLI `verify` command using `whsec_` and `t=…,v1=…`. The current AbacatePay CLI utilities page lists only `upgrade` and `--version` ([CLI utils](https://docs.abacatepay.com/pages/cli/utils)), so the discrepancy **cannot be reproduced from current official docs**. B7 should follow the security page and drop the claim unless a current official source is found.

### A-2. `devMode` events: Incorrect (omission, blocker)

**Evidence.** Every v2 payload includes `devMode` ([AbacatePay webhooks](https://docs.abacatepay.com/pages/webhooks)).
**Impact.** A dev-mode event delivered to (or replayed against) a production endpoint could grant real entitlements.
**Correction.** Reject events whose `devMode` does not match the deployment environment, after verification and before dedup. Return `200` so the provider does not retry. Never return `410`, which disables the webhook.

### A-3. Verified mechanics

- Constant-time comparison is required. On Workers, use `crypto.subtle.timingSafeEqual`.
- The event `id` is stable across retries, so use it for dedup.
- Retries: 7 attempts over about 18 hours, on timeout (30 s), `5xx`, `408` or `429`. Other `4xx` codes are not retried, and **`410` disables the webhook**.
- B7's existing text matches all of these.

---

## 4. Stripe webhook verification on Workers

### S-1. `constructEventAsync` with `createSubtleCryptoProvider`: Requires executable validation (blocker)

**Evidence.**
- Cloudflare's official announcement shows `Stripe.createSubtleCryptoProvider()`, `stripe.webhooks.constructEventAsync(body, sig, secret, undefined, webCrypto)` and `httpClient: Stripe.createFetchHttpClient()` ([Cloudflare blog, 2021-11-19](https://blog.cloudflare.com/announcing-stripe-support-in-workers)).
- The current stripe-node README documents only the synchronous `constructEvent()` ([stripe-node README](https://github.com/stripe/stripe-node/blob/master/README.md)).
- The only official source is five years old.

**Correction.** Keep the approach. Pin the behavior with a test that signs a payload with `stripe.webhooks.generateTestHeaderString` (documented in the README) and verifies it inside the Workers runtime (test S-T1). Always pass `createFetchHttpClient()` explicitly instead of relying on `nodejs_compat` to make Node's `http` work.

### S-2. Thin versus snapshot events: Uncertain **[decision]**

**Evidence.** Stripe's webhook guide recommends **thin** events for most new integrations. Thin events are parsed with `parseEventNotification()` and the current object is fetched with `fetchRelatedObject()` ([Stripe webhooks](https://docs.stripe.com/webhooks)). B7's mapping table assumes **snapshot** event names (`customer.subscription.updated` and so on).
**Impact.** Thin events fit B7's "re-fetch the current state" model (see B-1), but their SDK helpers are newer, and Workers support for them was not checked.
**Correction.** Keep snapshot events for v0.x, because they are mature and their verification path is the one being tested. Re-evaluate thin events once a Workers test of `parseEventNotification` exists.

### S-3. Verified mechanics

- The `Stripe-Signature` header has the form `t=…,v1=…`. Ignore any scheme other than `v1`.
- The default timestamp tolerance is 5 minutes. **Never** set it to 0, which disables the check.
- Retries run for up to 3 days in live mode. A secret can be rolled with up to 24 hours of overlap.
- Two separate Event objects can describe the same change, so deduplicate on the event ID and also apply updates idempotently per `data.object.id`.
- Source for all of these: [Stripe webhooks](https://docs.stripe.com/webhooks).

---

## 5. Drizzle + Hyperdrive

### D-1. Driver choice: Verified

Cloudflare's Drizzle page says: "Pairing Drizzle ORM with the Postgres.js driver over Hyperdrive is not currently supported" ([Hyperdrive + Drizzle](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/)). `pg` is the recommended Hyperdrive driver, with a minimum version listed on the driver page ([Hyperdrive Postgres drivers](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)). Note that Postgres.js on its own *is* supported. Only the Drizzle + Postgres.js pairing is not. Named prepared statements work with `pg`.

### H-1. Hyperdrive query caching makes security-relevant reads stale: Incorrect (blocker)

**Evidence** ([Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/), [How Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/)):
- Caching is **on by default**: `max_age` is 60 s and `stale_while_revalidate` is 15 s.
- "Hyperdrive does not purge or invalidate cached read query results when your application writes to your database."
- Cloudflare recommends a **second, cache-disabled Hyperdrive configuration** (`--caching-disabled`) for reads that must be current: "authentication, permissions, billing, and reads right after a write."

**B7 claim** ([fullstack/architecture.md](stacks/fullstack/architecture.md#scaling-without-microservices)): "Hot reads: add Hyperdrive query caching (default on)". B7 documents no exceptions.

**Impact.** With a single cached binding, the following can be up to about 75 s stale:
- **Sign-out and session revocation.** A revoked session keeps working.
- **Membership removal and role change.** A removed member keeps access to the organization.
- **Entitlements after cancellation.**
- **Read-after-write** in any UI flow.
- **Any `SELECT`-based webhook dedup check.** `INSERT … ON CONFLICT` is a write and is not cached, which is one more reason for B-3's design.

This undermines tenant isolation and billing correctness.

**Correction [decision]:** generate **two** Hyperdrive bindings when PostgreSQL is selected:

| Binding | Caching | Used by |
|---------|---------|---------|
| `HYPERDRIVE` | **disabled** | Default client: Better Auth, authorization, billing, all writes, read-after-write |
| `HYPERDRIVE_CACHED` | enabled | Explicit opt-in for public or derived reads that tolerate about 60 s of staleness |

The safe default must be the *uncached* binding. Account for combined origin connections across both configurations. The simpler alternative is a single cache-disabled binding, with caching added only when it is measured to be needed. That fits "Simplicity First" better and is the recommended default. Add the cached binding later.

### D-2. Connection count per invocation: Requires executable validation

**Evidence.** Each Workers invocation can have **6 connections waiting for response headers** at once. Further connections queue ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)). Cloudflare's Postgres.js example caps `max: 5` for this reason ([Hyperdrive drivers](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)).
**Impact.** If Better Auth, the app and the billing module each create their own `pg` client, and then call Stripe, AbacatePay or Resend, a single request can hit the limit and serialize.
**Correction.** Use **one** `pg` client and Drizzle instance per request, created in Hono middleware (or the Start request context), and pass it to `getAuth(env, db)` and every service.

### D-3. Client lifecycle: Requires executable validation

The Cloudflare example creates and `connect()`s a `Client` per request. B7 does not say when the client is closed. **Correction:** close it after the response with `ctx.waitUntil(client.end())`, and verify there are no leaks under load (test D-T2).

### D-4. Migrations: Verified

Drizzle Kit uses the direct `DATABASE_URL`, not Hyperdrive. Local `wrangler dev` connects directly through `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>`, with no pooling or caching ([Hyperdrive local dev](https://developers.cloudflare.com/hyperdrive/configuration/local-development/)). **Consequence:** local development never shows H-1's staleness, so it must be tested against a deployed Hyperdrive (test H-T1).

---

## 6. Multi-tenant authorization and isolation

### M-1. `activeOrganizationId` is `null` on new sessions: Verified (B7 handling is incomplete)

**Evidence.** The active organization is `null` until it is set. It can be set at creation with `databaseHooks.session.create.before` ([organization plugin](https://www.better-auth.com/docs/plugins/organization)).
**Correction.** Specify `orgProcedure` behavior: a `null` active org returns a typed `NO_ACTIVE_ORGANIZATION` error, never a fallback to "first membership" on the server. Optionally set the user's last-used org in the session-creation hook.

### M-2. `hasPermission` scope and membership check: Uncertain (blocker)

**Evidence.** The server API is `auth.api.hasPermission({ headers, body: { permissions } })`. The docs do not say whether it uses the active organization, or whether it checks that the session user is **still** a member. `getActiveMember` returns the member record in the active org ([organization plugin](https://www.better-auth.com/docs/plugins/organization)).
**Impact.** B7's isolation model assumes the organization ID comes "from the session". A stale `activeOrganizationId` left on a session after the user is removed from the org must not grant access.
**Correction.** `orgProcedure` must **independently** load the membership row (`member` where `userId` and `organizationId` match) on every request, through the **uncached** binding (H-1), and must derive the role from that row. Use `hasPermission` only after membership is confirmed. Add tests M-T1 to M-T3.

### M-3. RLS with Hyperdrive: Incorrect (overstated)

**Evidence.** Hyperdrive supports `SET` inside a transaction or within the same query. Connections are `RESET` when returned to the pool ([How Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/)).
**Correction.** Reword in `architecture.md`: RLS is *feasible* by wrapping each request's queries in a transaction that runs `SELECT set_config('app.org_id', $1, true)`. Its costs are a transaction for every request and long-held pooled connections, which Cloudflare discourages for scaling. It remains optional defense in depth. Application-level scoping stays primary.

### M-4. Design checks that hold

- The organization ID is taken from the session and never from input. That rule is correct.
- `organization_id NOT NULL` with an index that leads with it. Correct.
- R2 keys prefixed `org/<id>/`, with authorization before every read. Correct, but presigned URLs bypass per-read checks, so keep their expiry short.
- The billing customer is the organization, gated by `billing: ["manage"]`. Correct.

---

## 7. Billing state transitions and idempotency

### B-1. Ordering by event time: Incorrect (blocker)

**Evidence.** Stripe: "Stripe does not guarantee delivery of events in the order in which they were generated… Do not use `created` to determine the order of events", because `created` has 1-second resolution and distinct events can share it ([Stripe webhooks](https://docs.stripe.com/webhooks)).
**B7 claim** ([billing.md](stacks/fullstack/billing.md#processing-pipeline)): skip a state change when the event's `at` is older than `last_event_at`.
**Impact.** The guard can drop a valid transition or apply a stale one. For example, `customer.subscription.updated` (active) and `customer.subscription.deleted` can arrive within the same second in either order.
**Correction [decision]:** replace event-time ordering with **state synchronization**:
- Stripe: on any subscription-affecting event, fetch the current Subscription from the API and write its status (`syncSubscription(providerSubscriptionId)`). Ordering stops mattering, and duplicates are harmless.
- AbacatePay: the same pattern if a read API exists (A-1, item 3). Otherwise, apply a monotonic state rule: `canceled` is terminal for a given `provider_subscription_id`, and `renewed` only extends `current_period_end` forward (`GREATEST`).
- Drop `at` and `last_event_at` from the model.

### B-2. AbacatePay events carry no timestamp: Unsupported (blocker)

**Evidence.** The v2 payload envelope is `{ id, event, apiVersion, devMode, data }`, with no timestamp. Subscription payload fields such as period end and status were not documented on the pages reviewed ([AbacatePay webhooks](https://docs.abacatepay.com/pages/webhooks)).
**Impact.** `InternalBillingEvent.at` (required) and `periodEnd` cannot be filled for AbacatePay.
**Correction.** This is resolved by B-1's correction. Also add an explicit **Uncertain** note: the AbacatePay subscription payload fields must be confirmed from the event reference ("Eventos") before the adapter is written.

### B-3. Race in the dedup → process pipeline: Incorrect (blocker)

**B7 design.** Step 2 inserts the `billing_events` row (`ON CONFLICT DO NOTHING`). Step 3 processes the event and sets `processed_at`. Failures leave `processed_at` NULL so the provider retries.
**Problem.** Two concurrent deliveries of the same event, which Stripe documents can happen, can both observe `processed_at IS NULL` and both run step 3. State is idempotent, but side effects such as emails, queue messages and provider calls run twice. In addition, a row stuck with `processed_at IS NULL` after a crash has no stated owner.
**Correction.** Pick **one** of these two:
- **Inline mode (simplest).** Run the `INSERT … ON CONFLICT DO NOTHING RETURNING` and the state change in the **same transaction**. No row returned means a duplicate, so respond `200`. If the transaction fails, the insert rolls back and the provider's retry starts clean. Enqueue side effects (email) only after commit, and key them by event ID so they are idempotent too.
- **Queue mode.** The webhook only verifies, inserts (in a transaction) and enqueues `{provider, eventId}`, then returns `200`. The consumer claims the row with `UPDATE … SET processing_started_at = now() WHERE processed_at IS NULL AND (processing_started_at IS NULL OR processing_started_at < now() - interval '5 minutes') RETURNING`. Exactly one consumer wins, and stuck rows can be reclaimed.

Both queries must use the **uncached** binding (H-1).

### B-4. Incomplete Stripe status mapping: Incorrect (blocker)

**Evidence.** Stripe subscription statuses include `incomplete`, `incomplete_expired`, `trialing`, `active`, `past_due`, `canceled`, `unpaid` and `paused`. This is Stripe API knowledge and was not re-fetched in this review, so confirm it against the Subscription object reference. B7 maps five states and only four internal event types.
**Impact.** `unpaid`, `paused` and `incomplete_expired` have no defined entitlement. Depending on code defaults, they could leave a customer entitled.
**Correction.** Use state synchronization (B-1) with an explicit, exhaustive mapping table: `trialing` and `active` → entitled; `past_due` → entitled during the grace period; everything else → not entitled. The default for an unknown status is **not entitled**, and it is logged as a warning.

### B-5. Webhooks as the only source of truth: Verified

Transitions driven only by verified webhooks or provider re-fetches, never by redirects to the success page, are correct and match Stripe's guidance. The nightly reconciliation cron is also sound, and it covers AbacatePay's undocumented failed-renewal behavior.

---

## 8. Configuration model consistency and unnecessary complexity

| ID | Issue | Class | Correction |
|----|-------|-------|-----------|
| C-1 | `runtime` duplicates `language` + `infrastructure.target` (`workers` ⇔ `cloudflare-workers`, `go` ⇔ go, `python` ⇔ python). Only `bun` versus `workers` for TS carries information | Simplification | Remove `runtime`. Derive it: TS + Workers target → Workers runtime, TS + Docker → Bun |
| C-2 | `backendFramework` is derivable: TS → `hono` when the strategy includes Hono, Go → `net-http` | Simplification | Remove it, or make it read-only and derived |
| C-3 | `backendStrategy = "standalone"` means nothing (API is always standalone). Intelligence uses it for "has an HTTP service" | **Incorrect** | Limit `backendStrategy` to Web and Fullstack. Intelligence gets its own `serving: none \| http` |
| C-4 | **Missing rule:** `database = sqlite` (TS) uses `bun:sqlite` and is invalid on the Workers target, yet Web and API allow it with Workers | **Incorrect** | Add a hard rule: `database = sqlite` ⇒ `target ≠ cloudflare-workers` (use D1 instead) |
| C-5 | `backendStrategy = start-server` with `auth = better-auth`: where auth is mounted is undocumented (only the Hono mount is documented) | **Incorrect** (gap) | Document the Start server route `/api/auth/$` per the official guide (BA-4) |
| C-6 | The rule "organizations without email" is only a warning, yet the plugin's invitations need `sendInvitationEmail` | Uncertain | Either make `email ≠ none` a hard requirement for organizations, or document invitations as disabled without email |
| C-7 | `apiCommunication` mixes transport (`rest`) with contract tools (`orpc`, `openapi`). `openapi` without `orpc` in TS has no generator | Simplification | TS: `orpc` (always with Hono) + `publicApi: boolean` (OpenAPIHandler at `/api/v1`). Go: `openapi: boolean` |
| C-8 | Hyperdrive bindings: the model has one `hyperdrive` service, which H-1's correction would change | Pending H-1 decision | Keep one binding with caching disabled by default. Add `hyperdrive-cached` later as an explicit opt-in |

Net effect if C-1, C-2, C-3 and C-7 are accepted: 18 dimensions become **15**, with no loss of expressiveness. **[decision]** for each one.

What is consistent: Go never appears as an allowed Fullstack value (rules 1, 2 and 4). Billing requires database, auth and Hono. D1 and Hyperdrive are mutually exclusive. Stripe and AbacatePay are single-valued.

---

## Required tests

These tests decide the "Requires executable validation" items. Each runs against a **deployed** Worker unless marked *local*, because of BA-1 (the Vitest pool injects `nodejs_compat`) and D-4 (local development skips Hyperdrive).

| ID | Test | Pass condition | Resolves |
|----|------|----------------|----------|
| T-T1 | SSR page, a Start server function, `/api/rpc/*` and `/api/v1/*` all served by one Worker using the B7 `src/server.ts` | All return correct responses. Start's error page renders for a thrown error in a loader | T-1 |
| T-T2 | The same Worker also exports `queue` and `scheduled`. Trigger each one | Handlers run, and `fetch` behavior is unchanged | T-1 |
| T-T3 | The fallback: Hono mounted in `src/routes/api/$.ts` | The same results as T-T1, to compare overhead | T-1 decision |
| BA-T1 | Measure the CPU time to create `getAuth(env, db)` | Reported in ms. Acceptable if well under the plan's limit | BA-2 |
| W-1 | Email sign-up and sign-in on the **Free** plan | Succeeds under 10 ms CPU, or the failure is recorded, which triggers the W-1 decision | W-1 |
| W-2 | Deploy without `nodejs_compat` in `wrangler.jsonc` | Fails visibly. This shows the smoke test catches what Vitest hides | BA-1 |
| BA-T2 | Rate limit with `storage: "database"` and `cf-connecting-ip` | Requests 101+ in 10 s from one IP get `429`. A different IP is unaffected | BA-3 |
| D-T1 | One request touching auth + app + billing | At most one `pg` connection per request | D-2 |
| D-T2 | Load test (sustained requests) | No connection leak or exhaustion at the origin | D-3 |
| H-T1 | Sign out, then reuse the old cookie within 60 s, against deployed Hyperdrive | Rejected (requires an uncached binding) | H-1 |
| H-T2 | Remove a member, then the member calls an org procedure within 60 s | `FORBIDDEN` | H-1, M-2 |
| S-T1 | Verify a payload signed with `generateTestHeaderString` using `constructEventAsync` + SubtleCrypto inside workerd (*local* Vitest pool, plus deployed) | Valid → event. Tampered body, wrong secret or old timestamp → error | S-1 |
| S-T2 | Deliver `subscription.updated` and `subscription.deleted` in reverse order | Final state `canceled` (state sync) | B-1 |
| A-T1 | AbacatePay: valid secret + valid HMAC; valid secret + bad HMAC; bad secret + valid HMAC | Accept / reject / reject (`401`) | A-1 |
| A-T2 | AbacatePay `devMode: true` event in production | Ignored with `200`, no state change | A-2 |
| B-T1 | Same event delivered twice concurrently | State changed once, side effect (email) sent once | B-3 |
| B-T2 | Processing throws mid-transaction, then the provider retries | The retry succeeds, and no orphan `billing_events` row | B-3 |
| B-T3 | Stripe subscription status `unpaid`, `paused`, `incomplete_expired` | Not entitled | B-4 |
| M-T1 | User in org A calls each tenant procedure with org B resource IDs | `NOT_FOUND`/`FORBIDDEN`, and no data returned | M-2 |
| M-T2 | Session with `activeOrganizationId = null` calls an org procedure | `NO_ACTIVE_ORGANIZATION` | M-1 |
| M-T3 | A `member` role calls a `billing: ["manage"]` procedure | `FORBIDDEN` | M-2 |

## Release blockers

B7 Fullstack must not ship a reference implementation or claim to be "production ready" until:

1. **H-1:** the Hyperdrive caching strategy is decided and documented, with the uncached binding as default. H-T1 and H-T2 pass.
2. **A-1, A-2:** AbacatePay docs state that the query secret is the authentication factor, secret redaction is in place, and `devMode` is rejected. The re-fetch-before-grant decision is made. A-T1 and A-T2 pass.
3. **B-1, B-2, B-3, B-4:** the billing pipeline is redesigned around state synchronization with a transactional dedup claim and an exhaustive status map. S-T2 and B-T1 to B-T3 pass.
4. **T-1:** the single-Worker composition is proven (T-T1, T-T2), or the fallback is adopted.
5. **S-1:** Stripe verification is proven inside workerd (S-T1).
6. **BA-2, W-1:** the cost of auth instances and password hashing is measured, and the plan requirement is documented honestly.
7. **M-2:** membership is checked independently on every org procedure (M-T1 to M-T3).
8. **C-3, C-4:** the configuration model has no invalid combination marked as valid.

## Production-feasibility verdict

| Component | Verdict |
|-----------|---------|
| TanStack Start on Workers (Cloudflare guide, Vite plugin, custom entry for queue/cron/DO) | **Feasible.** Officially documented |
| Hono + oRPC on Workers | **Feasible.** Officially documented |
| Start + Hono in one Worker | **Likely feasible, unproven.** Run T-T1 before relying on it |
| Better Auth on Workers + PostgreSQL via Hyperdrive | **Feasible with corrections**: uncached binding, database rate-limit storage, `cf-connecting-ip`, shared client. CPU cost on the Free plan is unproven |
| Organizations and tenant isolation | **Feasible** once membership is checked independently on every org procedure, through the uncached binding |
| Drizzle + `pg` + Hyperdrive | **Feasible.** The driver choice is verified. Lifecycle and connection count need tests |
| Stripe billing on Workers | **Feasible.** Verification needs a workerd test. The state model must move to sync-on-event |
| AbacatePay billing | **Feasible with a weaker trust model.** It needs re-fetch-before-grant (pending API confirmation) and log redaction |
| Configuration model | **Sound core.** It needs 2 rule fixes and 4 optional simplifications |

## Decisions requested (none applied)

1. H-1: one uncached Hyperdrive binding by default (recommended), or two bindings from the start.
2. A-1.3: re-fetch AbacatePay objects before granting entitlements.
3. B-1: replace event-time ordering with state synchronization.
4. B-3: inline transactional processing (recommended for v0.x) or queue mode.
5. T-1: keep the custom `server.ts` dispatch or move to a Start splat route. Decide after T-T1 and T-T3.
6. W-1: if the Free plan is exceeded, choose (a), (b) or (c).
7. S-2: snapshot events now, thin events later (recommended).
8. C-1, C-2, C-3, C-7: model simplifications. C-4 and C-5 are fixes and should be accepted.
