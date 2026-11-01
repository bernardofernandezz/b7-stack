# Technology Decisions (v0.2, proposed)

These are concise, ADR-style decisions. **Status** is `Accepted` (unchanged since v0.1), `Proposed` (changed in v0.2 and pending approval, decision ID in brackets), or `Rejected`. Detailed evidence and the verification status of every claim are in [architecture-review.md](../architecture-review.md). Allowed combinations are defined in [configuration-model.md](configuration-model.md).

## B7 Fullstack

### ADR-001: TypeScript only, with pnpm as local tooling
**Status:** Accepted.
**Decision:** Fullstack uses TypeScript exclusively. pnpm is used for installs and scripts (Node.js runs the tooling), and production runs on the Workers runtime.
**Why:** one language from schema to UI. pnpm's strict `node_modules`, its build-script allowlist and its minimum release age reduce supply-chain risk, and it is the package manager with the widest CI and tooling support.
**Rejected:** Go in Fullstack, because it would mean two languages in one deployable unit. Go services belong in B7 API.

### ADR-002: TanStack Start owns all HTTP routing, and Hono is removed from Fullstack [A1]
**Status:** Proposed.
**Decision:** use TanStack Start server routes for `/api/*` (auth, RPC, OpenAPI, webhooks) and Start request middleware for request scope. Do not run Hono inside the Fullstack Worker.
**Why:** every integration B7 needs is documented **against Start directly**: Better Auth mounts at `src/routes/api/auth/$.ts` ([Better Auth installation](https://www.better-auth.com/docs/installation)), oRPC mounts at `src/routes/api/rpc.$.ts` ([oRPC adapter](https://orpc.dev/docs/adapters/tanstack-start)), and Start provides server routes, global request middleware and `createCsrfMiddleware` ([Start middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware)). No vendor documents a Start + Hono single-Worker composition, which would add a second router, a custom dispatcher and an undocumented `handler.fetch` call path.
**Trade-off:** Hono's middleware ecosystem is lost in Fullstack, and B7 writes a few small middlewares itself (request scope, membership). Start is younger than Hono, so its server-route APIs may change.
**Rejected:** (a) a Start + Hono dispatcher in `src/server.ts`, because it is undocumented as a composition and has two routers. (b) Hono mounted in a Start splat route, because Hono becomes a router inside a router with no capability B7 needs.

### ADR-003: oRPC is the only application transport [A2]
**Status:** Proposed.
**Decision:** all browser ↔ server calls are oRPC procedures. SSR calls them in-process through `createRouterClient`. Start server functions are not used for business logic.
**Why:** one validation, error and middleware model. An optional public REST API comes from the same router (`OpenAPIHandler`) without a second transport. oRPC documents the isomorphic client and in-process SSR client for Start ([oRPC adapter](https://orpc.dev/docs/adapters/tanstack-start)).
**Trade-off:** one dependency more than server functions alone, and loaders call procedures instead of plain functions.
**Rejected:** Start server functions only, because adding a public API later would introduce a second transport. tRPC, because it has no first-class OpenAPI.

### ADR-004: Better Auth is core, with database sessions and no cookie cache [A5, A6]
**Status:** Proposed.
**Decision:** every Fullstack project includes Better Auth (email + password). Organizations are optional. Sessions live in PostgreSQL, and the cookie cache is disabled by default.
**Why:** self-hosted, with data in your own database and documented TanStack Start and Workers usage. A disabled cookie cache makes revocation immediate ([session management](https://www.better-auth.com/docs/concepts/session-management)).
**Trade-off:** one database read per authenticated request. You maintain the auth tables and keep up with security updates yourself.
**Rejected:** Clerk and Auth0 (hosted, paid at scale, user data off-platform). A secondary-storage session store on KV (eventually consistent).

### ADR-005: PostgreSQL, Drizzle and `pg`, through one cache-disabled Hyperdrive binding [A3, A4]
**Status:** Proposed. The driver choice is Accepted.
**Decision:** PostgreSQL is the only Fullstack database. Use Drizzle with node-postgres `pg` ≥ 8.16.3, and one `pg` client per request. The single Hyperdrive binding is created with caching disabled.
**Why:** Cloudflare documents that Drizzle + Postgres.js over Hyperdrive is not supported ([Hyperdrive + Drizzle](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/)), and it lists `pg` 8.16.3 as the minimum ([node-postgres](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/)). Hyperdrive's cache is on by default and **not invalidated by writes**. Cloudflare itself recommends a cache-disabled configuration for authentication, permissions and billing reads ([query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)).
**Trade-off:** no free query caching. A second cache-enabled binding is deferred until it is measured to be needed.
**Rejected:** D1 in Fullstack, because a second database model doubles the testing matrix. Prisma (heavier, with a generation step). Postgres.js with Drizzle on Hyperdrive (unsupported).

### ADR-006: Billing uses Stripe as the reference, AbacatePay as experimental, and state sync instead of event replay [A7, A8]
**Status:** Proposed.
**Decision:** a small billing domain with one adapter per provider. Webhooks only trigger a sync: state always comes from a provider API fetch, under a per-subscription row lock, with a transactional inbox for dedup. Entitlements are derived on read. The outbox is deferred.
**Why:** Stripe does not guarantee event order and says not to order by `created` ([Stripe webhooks](https://docs.stripe.com/webhooks)). AbacatePay events have no timestamps, its subscription status is only `PENDING`/`ACTIVE`/`CANCELLED`, it has no period-end field, and its payload fields are undocumented ([AbacatePay subscriptions](https://docs.abacatepay.com/pages/subscriptions/reference), [webhooks](https://docs.abacatepay.com/pages/webhooks)). See [billing](../stacks/fullstack/billing.md).
**Trade-off:** one provider API call per webhook, and a transaction held across that call.
**Rejected:** a generic payment framework. The Better Auth Stripe plugin (it would put two billing paths in one product). Event-sourced state from webhook payloads.

### ADR-007: Cloudflare Workers as the only Fullstack target
**Status:** Accepted.
**Decision:** one Worker, deployed with Wrangler from GitHub Actions.
**Why:** no servers to manage, bindings for Hyperdrive, R2, Queues and Cron, and a Free plan that covers Hyperdrive and Queues ([Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/), [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/)).
**Trade-off (lock-in):** bindings, Wrangler config and the module export shape are Cloudflare-specific. Application code stays on Web standards (`Request`, `fetch`, Web Crypto), so moving to containers means swapping bindings for network clients. The Free plan's 10 ms CPU limit may not fit password hashing ([limits](https://developers.cloudflare.com/workers/platform/limits/)). That is unverified [A12].

### ADR-008: Optional Cloudflare services only when a feature needs them, with KV and Durable Objects deferred [A9, A10]
**Status:** Proposed.
**Decision:** R2 (storage), Queues (queues) and Turnstile are opt-in. Cron is derived from billing. KV and Durable Objects are not offered in v0.2.
**Why:** no core feature needs KV or DOs, and KV's eventual consistency makes it unsafe for auth, rate limits and billing.

### ADR-009: Tailwind CSS, Base UI and Lucide
**Status:** Accepted. Utility CSS with no runtime, unstyled accessible primitives, and tree-shakable icons. Base UI publishes as `@base-ui/react` (the earlier package name is deprecated on npm).
**Rejected:** component libraries with their own theme runtime.

### ADR-010: Vitest (Workers pool), Playwright, and a mandatory post-deploy smoke test
**Status:** Accepted, with an amendment: the smoke test is mandatory because the Vitest Workers pool injects `nodejs_compat` ([Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)).

### ADR-011: Resend for email behind a single `sendEmail()`
**Status:** Accepted. Resend documents Workers support. B7 uses `html`/`text`, not the Node-only `react` option ([Resend on Workers](https://resend.com/docs/send-with-cloudflare-workers)).

### ADR-012: Observability with Workers Observability by default and Sentry optional
**Status:** Accepted. OpenTelemetry export is deferred in Fullstack.

## Other profiles

| ADR | Profile | Decision | Status |
|-----|---------|----------|--------|
| ADR-020 | API (TS) | Hono + oRPC (Fetch adapter, [docs](https://orpc.dev/docs/adapters/hono)) + Zod on Node.js or Workers | Proposed: runtime changed from Bun (ADR-026) |
| ADR-021 | API (Go) | `net/http` + SQLC + pgx, `log/slog` | Accepted |
| ADR-022 | API | Auth deferred until B7 defines a token model [A11] | Proposed |
| ADR-023 | Web | TanStack Start with server functions and server routes. Auth deferred (use Fullstack) [A11] | Proposed |
| ADR-024 | Systems | Go, single binary, optional SQLite through `database/sql` | Accepted |
| ADR-025 | Intelligence | Python, PyTorch, scikit-learn, Hugging Face, ONNX Runtime for serving | Accepted |
| ADR-026 | Web, API (TS) | Node.js (current LTS) is the server runtime outside Workers, and pnpm is the package manager (ADR-001). **Why:** the longest production track record, full npm compatibility, and first-class support from hosts, OpenTelemetry and Sentry. **Trade-off:** slower startup and installs than Bun. **Alternative:** Bun, supported but not the default | Proposed |

## Rejected alternatives (all profiles)

| Alternative | Reason |
|-------------|--------|
| Next.js | Its server model and defaults are tied to its own platform assumptions. B7 prefers TanStack Start's explicit routing and documented Workers deployment |
| Redis | Not offered. Use PostgreSQL first. On containers, add it by hand only with a documented reason |
| Elysia, Express, Fastify | Bun-centric or Node-centric. Hono covers B7 API on every target |
| SQLite (TS) and D1 | Deferred everywhere in v0.2 to keep one data model per language |
