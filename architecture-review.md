# B7 Stack v0.1 — Architecture Review

**Review date:** 2026-10-31  
**Repository reviewed:** [bernardofernandezz/b7-stack](https://github.com/bernardofernandezz/b7-stack), default branch `main`  
**Scope:** documentation-only review of B7 Fullstack and the configuration model. No application code was executed.  
**Decision policy:** this document does not silently change B7's architecture. Recommendations marked **[DECISION]** require maintainer approval.

## Classification

- **Verified** — directly supported by current official documentation.
- **Requires executable validation** — documented building blocks exist, but the exact B7 integration/runtime behavior has not been proven by running it.
- **Incorrect** — the current B7 documentation or proposed behavior conflicts with official documentation or has a correctness flaw.
- **Unsupported** — a required capability or provider contract is not documented sufficiently to implement safely.
- **Uncertain** — official documentation is incomplete, ambiguous, or contradictory.

## Executive summary

B7 Fullstack is **architecturally plausible**, but v0.1 is not yet a production-ready implementation specification. The core choices are mostly defensible: TanStack Start on Workers, Hono + oRPC, Better Auth, PostgreSQL + Drizzle + Hyperdrive using `pg`, and a modular monolith.

The most important corrections before implementation are:

1. **Hyperdrive caching must be disabled for auth, permissions, memberships, billing and read-after-write paths.** Writes do not invalidate cached reads.
2. **The AbacatePay HMAC example does not authenticate the sender.** Its HMAC key is published in the docs; the query-string secret is the actual authentication factor. Since the key is public, the HMAC also cannot protect against a malicious party who can recompute it.
3. **Billing event timestamps are not a safe ordering mechanism.** Stripe explicitly says not to use event `created` to order events.
4. **The current webhook deduplication flow has a concurrency race and no durable side-effect delivery guarantee.** A transactional inbox/outbox design is needed.
5. **AbacatePay's documented webhook contract is incomplete for a provider-independent subscription state machine.** The public event overview does not document a timestamp, a failed-renewal event, or enough subscription state fields to safely derive all transitions.
6. **The custom Start + Hono Worker composition is a B7 convention, not a documented framework integration.** It needs a deployed Worker proof.
7. **Better Auth's default scrypt password hashing makes the Workers Free-plan CPU limit a real risk.** Benchmark it; do not weaken password hashing just to fit a plan limit.

### Findings at a glance

| ID | Area | Classification | Release blocker |
|---|---|---|---|
| T-1 | TanStack Start + Hono in one Worker | Requires executable validation | Yes |
| T-2 | Start request context and default entry wrapping | Incorrect (one claim in previous review) / Requires validation | Yes if custom context is needed |
| BA-1 | Better Auth + Workers compatibility | Verified | No |
| BA-2 | Better Auth instance-per-request and shared DB lifecycle | Requires executable validation | Yes |
| BA-3 | Better Auth rate-limit storage and Cloudflare IP header | Verified | No |
| BA-4 | `tanstackStartCookies` requirement | Conditional; not a current blocker | No |
| BA-5 | Default password hashing vs Workers Free CPU | Requires executable validation | Yes |
| H-1 | Hyperdrive cached reads for security-sensitive data | Incorrect | Yes |
| D-1 | Drizzle + Hyperdrive driver | Verified | No |
| D-2 | Connection/client lifecycle under Start streaming | Requires executable validation | Yes |
| A-1 | AbacatePay HMAC/query-secret security model | Incorrect (security claim) | Yes |
| A-2 | AbacatePay `devMode` handling | Requires explicit environment guard | Yes |
| A-3 | AbacatePay subscription event contract | Unsupported / Uncertain | Yes for AbacatePay billing |
| S-1 | Stripe webhook verification on Workers | Requires executable validation | Yes |
| S-2 | Stripe snapshot vs thin event format | Uncertain / decision required | No for first proof; yes before claiming support |
| B-1 | Event-time ordering | Incorrect | Yes |
| B-2 | Deduplication race and side-effect delivery | Incorrect | Yes |
| B-3 | Stripe status mapping | Incorrect (incomplete) | Yes |
| M-1 | Active organization and membership validation | Requires explicit authorization checks | Yes |
| C-1…C-8 | Configuration model | Incorrect / simplification | C-3 and C-4 |

---

## 1. TanStack Start + Hono on Cloudflare Workers

### T-1. Single Worker with path dispatch — Requires executable validation (blocker)

**B7 design:** `src/server.ts` dispatches `/api/*` to Hono and sends all other requests to the TanStack Start handler. The same Worker exports `queue` and `scheduled`.

**Verified building blocks**
- Cloudflare documents TanStack Start on Workers and a custom `src/server.ts` entrypoint that exports the Start handler together with Queue and Cron handlers: [Cloudflare — TanStack Start](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/).
- TanStack Start documents a custom server entry and the `handler.fetch(request, opts)` interface: [TanStack Start — Server Entry Point](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point).
- Hono supports the Workers Fetch handler shape and receives bindings through its environment argument: [Hono — Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers).
- oRPC documents mounting its Fetch API handler as Hono middleware: [oRPC — Hono Adapter](https://orpc.dev/docs/adapters/hono).

**What is not verified:** neither Cloudflare, TanStack Start nor Hono documents this exact combination as a supported integration. B7's dispatcher is a composition of documented parts.

**Important correction to the earlier review:** the B7 code calls `handler.fetch(request)` from its own Worker dispatcher. It does **not** explicitly pass the Worker's `env` as TanStack's `opts`. The earlier claim that this exact B7 call necessarily passes `env` as Start request options was inaccurate. Cloudflare's own example assigns `fetch: handler.fetch` directly to the Worker export, but that is not identical to B7's path dispatcher.

**Impact:** this is the Fullstack profile's central integration. It must be proven for SSR, Start server functions, error conversion, cookies, Hono API routes, Queue and Cron exports. A type-check alone is not enough.

**Recommendation:** keep the architecture provisionally, but make the first reference implementation prove it in a deployed Worker. Do not claim the composition is officially supported until that test passes.

**Required test T-T1**
- One deployed Worker serves an SSR route, a Start server function, `/api/auth/*`, `/api/rpc/*`, `/api/v1/*` and a webhook route.
- Start server errors retain Start's expected error handling.
- Queue and Cron handlers are exported and execute without changing HTTP routing.
- Test the exact pinned TanStack Start, Vite plugin, Wrangler and Hono versions.

### T-2. Start request context and error wrapper — Requires executable validation

TanStack's current server-entry guide says the default export from `@tanstack/react-start/server-entry` is already wrapped for request context and uncaught error conversion. It also documents `createServerEntry({ fetch })` for custom handlers, and says additional typed request data must be passed through the second `opts` argument's `context` property.

B7's current architecture calls `handler.fetch(request)` without passing an explicit Start context. That is acceptable only if Start code obtains bindings through the documented Workers environment import and does not depend on a custom Start request context.

**Recommendation**
- Keep the same `Request` object when dispatching to Start; do not clone or rewrite it unless the new request is wrapped in its own Start entry.
- If B7 needs a per-request database handle or authenticated context inside Start middleware/server functions, define and pass a typed Start request context. Do not assume that Worker `env` is interchangeable with Start's `opts`.
- Verify error conversion and cookie helper behavior with the pinned Start version.

**Fallback [DECISION]:** a Start splat route that forwards API requests to Hono is a possible alternative, but it changes middleware and routing ownership. Do not adopt it without comparing the deployed behavior and complexity against the current dispatcher.

---

## 2. Better Auth on Workers and PostgreSQL / Hyperdrive

### BA-1. Runtime compatibility — Verified

Better Auth's Hono integration says it uses `AsyncLocalStorage` and requires `nodejs_compat` (or the narrower `nodejs_als` when only ALS is needed): [Better Auth — Hono Integration](https://better-auth.com/docs/integrations/hono). Cloudflare's Hyperdrive `pg` guidance also requires Node.js compatibility for the driver: [Cloudflare — PostgreSQL drivers](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/).

**Recommendation:** explicitly document the compatibility date and flags used by the template. Even where a newer Workers compatibility date enables Node compatibility by default, an explicit and tested runtime contract is easier to reason about.

Cloudflare also warns that the Workers Vitest plugin automatically injects `nodejs_compat`, so tests may pass when the deployed Wrangler config is missing it: [Workers Best Practices — Vitest](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).

### BA-2. Per-request Better Auth factory and shared database client — Requires executable validation (blocker)

B7 proposes `getAuth(env)` and says the factory creates the Drizzle client and Better Auth instance per request. The official Better Auth docs show instance configuration and integration patterns, but do not prescribe this Workers-specific lifecycle.

B7 also uses Better Auth from Hono and Start code. If each path independently creates a `pg.Client` / Drizzle instance / Better Auth instance, the same request can create duplicate database connections and duplicate plugin initialization.

**Recommendation**
- Establish one request-scoped dependency container for each HTTP request.
- Reuse the same Drizzle database handle for application services and Better Auth wherever the adapter contract permits it.
- Do not store a request-bound client or environment binding in module scope.
- Test the actual Better Auth adapter and factory behavior under concurrency and after request completion.

### BA-3. Rate limiting — Verified, with configuration requirements

Better Auth documents that in-memory rate-limit storage may be unsuitable for serverless environments, supports database or secondary storage, and allows configuring the client IP header. Cloudflare's trusted header is `cf-connecting-ip`: [Better Auth — Rate Limit](https://better-auth.com/docs/concepts/rate-limit).

**Recommendation:** for the PostgreSQL profile, use database-backed rate limiting through a cache-disabled Hyperdrive path. Do not use eventually consistent KV for security counters unless a deliberately non-atomic policy is acceptable. Add an integration test that proves rate limits are shared across separate Worker isolates.

### BA-4. `tanstackStartCookies` — Conditional, not a blanket blocker

Better Auth's TanStack Start integration requires the `tanstackStartCookies` plugin when server-side calls such as `signInEmail` or `signUpEmail` need to set cookies through Start: [Better Auth — TanStack Start](https://better-auth.com/docs/integrations/tanstack).

B7's documented primary flow mounts Better Auth under Hono and has browser auth calls use the Better Auth client. Its Start server functions read the session; they are not documented as calling server-side sign-in/sign-up operations.

**Correction:** the previous review overstated this as an unconditional omission. Add the plugin only if B7 supports server functions that perform Better Auth operations which write cookies. If that flow is added, test Set-Cookie propagation through Start.

### BA-5. Password hashing and Workers Free CPU — Requires executable validation (blocker)

Better Auth's security docs state that its default password hashing algorithm is **scrypt**, which is memory-hard and CPU-intensive: [Better Auth — Security](https://better-auth.com/docs/reference/security). Cloudflare currently documents a 10 ms CPU limit per HTTP request on the Workers Free plan, compared with a much higher configurable limit on Paid: [Cloudflare — Workers Limits](https://developers.cloudflare.com/workers/platform/limits/).

**Impact:** email/password sign-up and sign-in may exceed the Free-plan CPU budget. The documentation alone does not establish the exact runtime cost of Better Auth's implementation under workerd.

**Recommendation**
- Benchmark password hashing and verification in a deployed Worker on the Free plan.
- Include realistic cold and warm requests, not only a microbenchmark of the hash function.
- If the limit is exceeded, document the plan requirement or make the authentication method a deliberate product choice. Do not silently reduce scrypt cost or replace it with a weaker scheme to satisfy a free-tier constraint.

---

## 3. Drizzle + Hyperdrive

### D-1. Driver choice — Verified

Cloudflare's Drizzle + Hyperdrive example explicitly recommends node-postgres (`pg`) and says the Drizzle + Postgres.js pairing over Hyperdrive is not currently supported: [Cloudflare — Drizzle ORM + Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/).

The current PostgreSQL driver page lists a minimum supported `pg` version and compatibility requirements: [Cloudflare — Connect to PostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/).

**Recommendation:** keep `drizzle-orm/node-postgres` + `pg`; pin a supported `pg` version rather than documenting only the driver name. Run migrations with a direct database URL in CI, not through the Worker's Hyperdrive binding.

### H-1. Hyperdrive cached reads for auth and authorization — Incorrect (blocker)

Cloudflare documents that query caching is enabled by default for eligible read queries, with default `max_age = 60s` and `stale_while_revalidate = 15s`. Crucially, **writes do not invalidate cached read results**. Cloudflare explicitly recommends a cache-disabled Hyperdrive configuration for reads that must be fresh, including authentication, sessions, permissions, billing and read-after-write: [Cloudflare — Query Caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/).

B7 currently describes Hyperdrive caching as a scaling optimization without defining a separate consistency boundary.

**Impact:** stale reads can preserve access after session revocation, membership removal or role changes, and can expose stale entitlements after billing changes. The exact stale window depends on cache settings and revalidation behavior; it must not be treated as immediate consistency.

**Recommendation [DECISION]:**
- Safest v0.x default: create one Hyperdrive configuration with caching disabled and use it for all application/auth/billing database operations.
- Add a cache-enabled binding later only for explicitly selected, non-security-sensitive reads where bounded staleness is acceptable.
- If both bindings are generated, the default database/auth client must use the cache-disabled binding. Do not let the ORM or auth library choose a cached binding implicitly.

This is a production correctness issue, not merely a performance preference.

### D-2. Connection lifecycle and streaming — Requires executable validation (blocker)

Cloudflare's examples create the `pg.Client` inside the request handler. B7's architecture says clients are per-request but does not define cleanup or how the lifecycle interacts with streamed Start responses.

**Recommendation**
- Define a single owner for the client and a deterministic cleanup strategy.
- Do not blindly call `client.end()` immediately after Start returns a streaming `Response` if the stream can still perform database work.
- Test successful responses, thrown errors, aborted client connections, streamed SSR and sustained concurrency against a deployed Worker.
- Measure origin connections and verify no leaked clients.

The earlier review's suggestion to always call `client.end()` via `ctx.waitUntil()` should not be adopted without this test; the correct lifecycle depends on whether the response body still uses the database.

---

## 4. AbacatePay webhook verification

### A-1. HMAC key and query secret — Incorrect security claim (blocker)

The current AbacatePay security page states that:
- the `webhookSecret` query parameter is the value the receiver must validate;
- the HMAC-SHA256 signature is calculated over the raw body using AbacatePay's **public key**;
- the page's code example includes that key as a literal constant.

Sources: [AbacatePay — Webhook Security](https://docs.abacatepay.com/pages/webhooks/security) and [AbacatePay — Webhooks](https://docs.abacatepay.com/pages/webhooks).

**Security analysis:** a MAC whose key is publicly known cannot authenticate the sender against an attacker. Anyone who knows the public key can compute a matching HMAC for a modified payload. Therefore, the HMAC is not an adversarial integrity guarantee either. The query-string secret is the only documented authentication factor.

**Impact:** if the query secret leaks through request logs, proxy logs, observability traces, error reports or copied URLs, an attacker can construct a request with a valid HMAC and forge billing events. The documentation describes no signed timestamp or replay window.

**Recommendation**
1. Update B7's wording: the URL secret authenticates the webhook request; the published-key HMAC does not provide sender authentication and should not be treated as a second independent security boundary.
2. Use a high-entropy, per-endpoint secret. Keep it out of logs, traces, analytics, error breadcrumbs and support diagnostics. Redact the `webhookSecret` query parameter at the earliest logging layer.
3. Do not assume event-ID deduplication prevents a first-time forged event.
4. **[DECISION]** Before granting paid entitlements, retrieve the authoritative checkout/subscription/payment object from AbacatePay using the server API key, if the current API exposes the necessary read operation and stable identifiers. Confirm the exact v2 endpoint and response fields before adopting this design. If authoritative re-fetch is unavailable, document the residual trust limitation and do not claim strong webhook authenticity.

### A-2. `devMode` and environment separation — Requires explicit guard (blocker)

AbacatePay's documented v2 envelope contains `id`, `event`, `apiVersion`, `devMode` and `data`: [AbacatePay — Webhooks](https://docs.abacatepay.com/pages/webhooks).

**Recommendation**
- Use separate secrets and webhook endpoints for test and production environments.
- Check that the incoming event's `devMode` matches the configured environment before any billing mutation.
- A mismatch should be recorded and ignored without changing subscription state. Do not rely on `devMode` as authentication; it is a payload field.
- Test the provider's actual behavior for environment mismatch and response codes before release.

### A-3. Subscription payload contract — Unsupported / Uncertain (blocker for AbacatePay billing)

The public webhook overview documents `subscription.completed`, `subscription.cancelled` and `subscription.renewed`, and shows the common envelope. It does not show a timestamp in that envelope, and the overview does not document all fields required by B7's internal subscription state machine. The public event list reviewed does not include `subscription.payment_failed`: [AbacatePay — Webhooks](https://docs.abacatepay.com/pages/webhooks).

**Impact:** B7 cannot safely populate a required generic event timestamp or derive all provider-independent transitions from the overview alone. A missing failed-payment event also means the generic `past_due` state cannot be assumed to work for this provider.

**Recommendation**
- Before implementing the adapter, inspect the current detailed event reference for each subscription event and record exact JSON schemas, IDs, period fields, cancellation semantics and environment fields.
- Confirm whether the current API exposes read operations for subscription and checkout state.
- Treat `past_due` as unsupported for AbacatePay unless the provider exposes a documented failed-renewal signal or B7 deliberately derives it through reconciliation.
- Do not invent timestamps or period-end values from event receipt time.

### A-4. Delivery and duplicate behavior — Verified

AbacatePay documents retries, stable event IDs across automatic retries, and the fact that `410` disables the webhook. It also recommends responding `2xx` after processing: [AbacatePay — Webhooks](https://docs.abacatepay.com/pages/webhooks), [Webhook Security](https://docs.abacatepay.com/pages/webhooks/security).

**Important nuance:** manual re-sending from the dashboard may generate a new event ID, so event-ID deduplication alone does not prevent semantically duplicate business effects. State updates and side effects must also be idempotent by business object.

---

## 5. Stripe webhook verification and billing events

### S-1. Webhook signature verification on Workers — Requires executable validation (blocker)

Stripe requires verification against the exact raw request body and the `Stripe-Signature` header: [Stripe — Webhooks](https://docs.stripe.com/webhooks). The current `stripe-node` source exposes `constructEventAsync` and the async verification path: [stripe-node — Webhooks.ts](https://github.com/stripe/stripe-node/blob/master/src/Webhooks.ts).

Cloudflare has published a Workers example using Stripe's Web Crypto provider, but the example is older than the current runtime and SDK versions.

**Recommendation**
- Pin the Stripe SDK version.
- Test `constructEventAsync` inside workerd using the exact SDK version, Web Crypto provider and Fetch HTTP client.
- Verify valid payloads, wrong secrets, altered raw bodies, missing signature headers and stale timestamps.
- Never parse and re-serialize the request body before signature verification.

### S-2. Snapshot versus thin events — Uncertain / decision required

Stripe's current webhook guide recommends thin events for most new integrations and documents separate endpoints for thin and snapshot payloads. It also documents `fetchRelatedObject()` for retrieving the latest object associated with a thin event: [Stripe — Webhooks](https://docs.stripe.com/webhooks).

B7's mapping table is based on snapshot event types such as `customer.subscription.updated`. This is not inherently invalid, but it is a conscious choice against Stripe's current recommendation.

**Recommendation [DECISION]:**
- Decide and document whether v0.x deliberately supports snapshot events only or whether the first reference implementation will support thin events.
- Do not claim generic Stripe support while leaving the event destination payload format unspecified.
- Test the selected format in Workers before freezing the provider adapter.

### B-1. Event timestamps cannot order subscription state — Incorrect (blocker)

Stripe explicitly states that event delivery is not guaranteed to be ordered and that snapshot events have second-level `created` timestamps. It says not to use `created` to determine event order or whether an event was processed: [Stripe — Event ordering](https://docs.stripe.com/webhooks#event-ordering).

B7 currently proposes skipping an update when `event.at` is older than `subscriptions.last_event_at`. That is not a safe ordering strategy.

**Recommendation [DECISION]:**
- Treat webhook events as signals that a provider object may have changed.
- For Stripe, retrieve the current subscription state from Stripe and reconcile the local record from that authoritative object.
- Serialize reconciliation per provider subscription or use an optimistic concurrency/version strategy so two concurrent fetches cannot commit stale snapshots out of order.
- Remove generic timestamp-based event ordering. Keep receipt timestamps for audit/observability only.

For AbacatePay, use the same reconciliation approach only if the current API exposes a reliable read endpoint. Otherwise, define explicit monotonic transition rules from documented event semantics and mark the remaining limitations.

### B-2. Deduplication race and transactional outbox — Incorrect (blocker)

B7's current pipeline inserts a `billing_events` row, then processes it if `processed_at` is null. Two concurrent deliveries can both observe an unprocessed row and execute the same work. The design also does not guarantee that a side effect is delivered if the Worker crashes after the database commit but before the queue/email action.

**Recommendation [DECISION]:**
- Model webhook receipt as a durable **inbox** with a unique key `(provider, event_id)`.
- Claim work atomically using a conditional update/lease or a transaction that ensures only one worker owns the event at a time.
- Use a **transactional outbox** for side effects. Persist the intended email/queue/provider action in the same database transaction as the subscription update; dispatch it asynchronously and mark it delivered only after success.
- Make every consumer and external side effect idempotent. Where supported, pass an idempotency key to the external provider.
- Add a recovery process for inbox/outbox rows that remain pending after a crash.

An `INSERT ... ON CONFLICT DO NOTHING` alone is not a processing lock. "Exactly once" delivery across PostgreSQL, Cloudflare Queues and external providers should not be promised; design for at-least-once delivery plus idempotent effects.

**Provider response timing:** Stripe recommends quickly returning `2xx` before complex work that may time out. AbacatePay documents a 30-second timeout and recommends responding after processing. The adapter should persist the verified event durably before acknowledging it, and its synchronous/async policy must respect each provider's documented retry contract.

### B-3. Stripe subscription status mapping — Incorrect (blocker)

Stripe's Subscription object currently documents these statuses: `incomplete`, `incomplete_expired`, `trialing`, `active`, `past_due`, `canceled`, `unpaid` and `paused`: [Stripe — Subscription object](https://docs.stripe.com/api/subscriptions/object).

B7's internal state table does not define all of them.

**Recommendation**
- Map every provider status explicitly.
- Define entitlement behavior for each status. A conservative default is no entitlement for unknown/unmapped statuses.
- Treat `past_due` as entitled only during a clearly defined grace period.
- Distinguish `cancel_at_period_end` from an already-canceled subscription; Stripe may leave the status `active` until the period ends.
- Add tests for `unpaid`, `paused`, `incomplete_expired`, trial expiration, cancellation at period end, refunds and disputes.

---

## 6. Multi-tenant authorization and isolation

### M-1. Active organization is not proof of current membership — Requires explicit validation (blocker)

Better Auth documents that `activeOrganizationId` defaults to `null` and is stored in the session when selected: [Better Auth — Organization plugin](https://better-auth.com/docs/plugins/organization).

B7 correctly says organization IDs must come from the authenticated session, not client input. However, a session's active organization identifier should not be treated as proof that the user is still a member or still has the same role.

**Recommendation**
- `orgProcedure` must reject a null active organization with a typed error.
- Resolve the current membership for the authenticated user and active organization through the cache-disabled database path.
- Derive the effective role/permissions from current membership data, not solely from a client-side role or a potentially stale session field.
- Scope every tenant-owned query, insert, update and delete by the resolved organization ID.
- Use `NOT_FOUND` or `FORBIDDEN` consistently to avoid leaking cross-tenant resource existence.
- Test member removal, role changes, active-org switching, cross-tenant resource IDs and concurrent permission changes.

### M-2. RLS and Hyperdrive — Incorrect if described as impossible

Cloudflare documents Hyperdrive transaction pooling and supports `SET` for the duration of a transaction or query: [Cloudflare — How Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/).

Therefore, saying PostgreSQL RLS is categorically incompatible with Hyperdrive is too strong. RLS can be implemented with transaction-scoped settings, but the application must guarantee that every tenant query runs in the correct transaction and context.

**Recommendation:** keep application-level tenant scoping as the primary control. Describe RLS as optional defense in depth that requires dedicated tests and careful transaction management, not as an automatic feature of the template.

---

## 7. Configuration model consistency and complexity

The following findings are based on the current `docs/configuration-model.md` and the profile READMEs. They should be reflected in the machine-readable schema and validator before a CLI is implemented.

| ID | Issue | Classification | Recommendation |
|---|---|---|---|
| C-1 | `runtime` duplicates information already implied by language and deployment target in most profiles. | Simplification | Derive runtime where possible; keep a user-selectable runtime only where it genuinely changes the generated project. |
| C-2 | `backendFramework` is derivable from language/backend strategy in the documented profiles. | Simplification | Derive it or remove it from user-facing configuration. |
| C-3 | `backendStrategy = standalone` is semantically overloaded: it is redundant for API and used differently for Intelligence. | Incorrect | Restrict backend strategy to profiles where it has a meaningful choice; model Intelligence serving separately. |
| C-4 | SQLite selection appears valid in combinations where the implementation would rely on `bun:sqlite`, which is not the Workers database binding. | Incorrect | Add a hard compatibility rule: Workers uses D1 for SQLite-shaped storage; do not emit `bun:sqlite` for a Workers target. |
| C-5 | Better Auth mounting differs between Hono and Start-server-only strategies. | Incorrect (documentation gap) | Document the Start server route required when auth is enabled without Hono. |
| C-6 | Organizations and invitations depend on an email delivery callback, while email appears independently optional. | Uncertain | Make the invitation behavior explicit: require email for invitations or disable invitations when email is absent. |
| C-7 | `apiCommunication` mixes transport and contract-generation concerns. | Simplification | Separate RPC transport from whether a public OpenAPI surface is generated. |
| C-8 | Hyperdrive cache policy is not represented in the configuration model. | Incorrect (missing consistency choice) | Default to cache-disabled for v0.x; add cached reads only as an explicit opt-in with documented stale-data semantics. |

**Configuration model release blockers:** C-3 and C-4 must be corrected before the validator can claim that all accepted configurations are valid. C-5 must be documented before Fullstack supports `start-server` + Better Auth. The remaining items are simplifications or explicit feature-policy decisions.

---

## 8. Required executable tests

These tests are acceptance criteria for the first reference implementation. Use the exact versions recorded in the lockfile. Tests that depend on Hyperdrive, Workers compatibility flags or platform limits must include a deployed-Worker run; local Node tests are not sufficient.

| ID | Test | Pass condition | Resolves |
|---|---|---|---|
| T-T1 | Single Worker integration | SSR, Start server function, Hono auth, oRPC RPC, OpenAPI and webhook routes work through the documented dispatcher. | T-1 |
| T-T2 | Start context and error handling | Cookies, server context, thrown errors and streaming behave correctly with the exact Start entry. | T-2 |
| T-T3 | Queue/Cron exports | Queue and scheduled handlers run from the same Worker without affecting HTTP routes. | T-1 |
| BA-T1 | Auth instance lifecycle | Per-request factory initializes correctly under concurrency; one request's session/config never leaks into another. | BA-2 |
| BA-T2 | Shared database handle | Auth and app services reuse the intended request-scoped database dependency; connection count is measured. | BA-2, D-2 |
| BA-T3 | Rate limiting across isolates | Requests from one IP share a limit across separate isolates; another IP is independent. | BA-3 |
| W-T1 | Free-plan password auth | Sign-up and sign-in complete within the Free CPU budget, or B7 documents the Paid-plan requirement. | BA-5 |
| W-T2 | Runtime compatibility | Deployed Worker fails visibly when required compatibility is absent; production config includes the required flag/date. | BA-1 |
| H-T1 | Revoked session freshness | Reusing a revoked session is rejected immediately through the uncached binding. | H-1 |
| H-T2 | Membership and role freshness | Removed member or demoted role cannot access organization procedures after the change. | H-1, M-1 |
| D-T1 | Drizzle/pg integration | CRUD, transactions, prepared queries and migrations work on the pinned versions through Hyperdrive. | D-1 |
| D-T2 | Client lifecycle | No leaked connections during success, exception, abort, streaming and sustained load. | D-2 |
| S-T1 | Stripe signature verification | Valid signature succeeds; changed body, wrong secret, missing header and stale timestamp fail inside workerd. | S-1 |
| S-T2 | Stripe event format | The chosen snapshot or thin event destination parses and retrieves the expected subscription object. | S-2 |
| S-T3 | Out-of-order Stripe events | Reversed and concurrent events converge to the current provider subscription state. | B-1 |
| A-T1 | AbacatePay signature behavior | Valid query secret and documented HMAC behavior are tested; invalid secret is rejected. | A-1 |
| A-T2 | AbacatePay environment guard | Dev-mode payload cannot mutate production billing state. | A-2 |
| A-T3 | AbacatePay reconciliation | Subscription/checkout read endpoint and fields are proven against test-mode API responses before entitlements are granted. | A-3 |
| B-T1 | Concurrent duplicate delivery | Two simultaneous deliveries produce one state mutation and no duplicate side effect. | B-2 |
| B-T2 | Crash recovery | Crash between inbox persistence, state update, outbox dispatch and acknowledgment recovers without losing or duplicating business effects. | B-2 |
| B-T3 | Exhaustive Stripe status mapping | Every Stripe status maps to an explicit entitlement decision; unknown values default to no entitlement. | B-3 |
| M-T1 | Cross-tenant access | User in org A cannot read/update/delete org B resources by substituting IDs. | M-1 |
| M-T2 | Null active organization | Organization procedure returns a typed no-active-org error. | M-1 |
| M-T3 | Membership revocation | A removed member with an old session cannot access org procedures. | M-1 |
| M-T4 | Role change | A demoted member loses privileged operations without requiring a new login. | M-1 |

---

## 9. Release blockers

Do not ship the B7 Fullstack reference implementation or describe it as production-ready until:

1. **Hyperdrive consistency:** auth, membership, permissions and billing use a cache-disabled path by default; H-T1 and H-T2 pass.
2. **AbacatePay security:** the docs accurately describe the published-key HMAC limitation, URL secret redaction exists, environment separation is enforced, and A-T1/A-T2 pass.
3. **AbacatePay contract:** A-T3 proves authoritative subscription/checkout reconciliation, or AbacatePay billing is explicitly marked unsupported/limited in v0.x.
4. **Billing processing:** event-time ordering is removed, inbox claiming is concurrency-safe, outbox delivery is recoverable, and B-T1/B-T2 pass.
5. **Stripe correctness:** raw-body signature verification passes inside workerd and the event payload format is an explicit decision.
6. **Subscription entitlements:** every Stripe status has a defined mapping and unknown statuses fail closed.
7. **Tenant isolation:** membership is revalidated through an uncached read on every organization-scoped operation.
8. **Start + Hono composition:** T-T1 to T-T3 pass against a deployed Worker.
9. **Auth runtime cost:** password auth is benchmarked and the Free/Paid Workers requirement is documented honestly.
10. **Configuration validity:** C-3 and C-4 are fixed before a CLI or validator can advertise accepted configurations as valid.

## 10. Production-feasibility verdict

| Component | Verdict |
|---|---|
| TanStack Start on Cloudflare Workers | **Feasible.** Official deployment and custom entrypoint guidance exists. |
| Hono on Cloudflare Workers | **Feasible.** Official integration guidance exists. |
| oRPC inside Hono | **Feasible.** Official Fetch adapter integration exists. |
| TanStack Start + Hono path dispatcher in one Worker | **Plausible, unproven.** B7-specific deployed integration test required. |
| Better Auth on Workers | **Feasible with compatibility configuration.** Instance lifecycle and CPU cost require tests. |
| Better Auth + PostgreSQL via Hyperdrive | **Feasible with cache-disabled security-sensitive reads and a tested client lifecycle.** |
| Drizzle + `pg` + Hyperdrive | **Feasible.** Driver choice is explicitly supported by Cloudflare. |
| Multi-tenant authorization | **Feasible** with explicit membership checks, uncached reads and tenant-scoped queries. |
| Stripe billing | **Feasible** after webhook verification, event format and state reconciliation are proven. |
| AbacatePay billing | **Not yet production-qualified.** Documented webhook authentication is weaker than a conventional private signing secret, and the subscription API contract must be proven. |
| Configuration model | **Sound direction, needs corrections.** Avoid adding a CLI until accepted configurations are validated by tests. |

## 11. Decisions requiring maintainer approval

No architecture changes have been applied by this review. The following decisions remain open:

1. **Hyperdrive:** use one cache-disabled binding as the v0.x default (recommended), or generate both cached and uncached bindings from the start.
2. **AbacatePay:** require authoritative API re-fetch before granting entitlements; if the API cannot support it, decide whether to mark this provider as limited or defer it.
3. **Billing processing:** adopt a durable inbox + transactional outbox with asynchronous processing (recommended) or keep a strictly bounded synchronous path per provider.
4. **Stripe events:** snapshot-only for the first release or thin events from the start.
5. **Start + Hono:** keep the custom Worker dispatcher if T-T1 passes, otherwise compare it with the Start splat-route fallback.
6. **Workers Free plan:** document Paid as required for email/password if the scrypt flow exceeds the Free CPU budget; do not weaken hashing silently.
7. **Configuration model:** accept the simplifications in C-1, C-2 and C-7, and fix C-3/C-4 before implementing the validator.

**Final assessment:** proceed to a minimal executable reference implementation only after the release blockers are converted into explicit tests. The next milestone should not be a broad SaaS template; it should be a thin vertical proof of the Worker entrypoint, one shared database client, Better Auth, one tenant-scoped procedure and one provider webhook. That proof will validate the riskiest architectural assumptions before B7 expands its surface area.
