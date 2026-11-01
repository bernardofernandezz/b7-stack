# B7 Fullstack Architecture (v0.2, proposed)

> **Status: proposed, pending maintainer approval.** The v0.2 changes are tagged with decision IDs (`A1`–`A12`), which are listed in [architecture-review.md](../../architecture-review.md#decisions-requiring-maintainer-approval). The evidence behind each decision is also in that review. v0.1 is in git history.

## Summary

B7 Fullstack is **one TanStack Start application, deployed as one Cloudflare Worker, backed by one PostgreSQL database reached through one cache-disabled Hyperdrive binding.** Each HTTP concern is owned by exactly one component, and each component is mounted the way its vendor documents for TanStack Start.

```
                     Cloudflare Worker  (wrangler main: Start's server entry, or src/server.ts when cron/queues exist)
                     ┌──────────────────────────────────────────────────────────────────────────────┐
 request ──────────► │ TanStack Start                                                               │
                     │  src/start.ts  requestMiddleware: [requestScope]  →  context { env, db, auth }│
                     │                                                                              │
                     │  /api/auth/$            server route → Better Auth   auth.handler(request)   │
                     │  /api/rpc/$             server route → oRPC RPCHandler      (app client)      │
                     │  /api/v1/$              server route → oRPC OpenAPIHandler  (optional)        │
                     │  /api/webhooks/stripe   server route → billing inbox        (optional)        │
                     │  everything else        SSR + routing; loaders call oRPC in-process           │
                     │                                                                              │
                     │  scheduled()            billing reconciliation                (with billing)  │
                     │  queue()                consumers                             (optional)      │
                     └───────────────┬──────────────────────────────────────────────────────────────┘
                                     │ env.HYPERDRIVE (caching disabled)  ·  env.BUCKET (optional) · env.JOBS (optional)
                                     ▼
                                PostgreSQL
```

## Responsibilities

Each responsibility has exactly one owner.

| Responsibility | Owner | Mount / location | Vendor documentation for this exact use |
|---------------|-------|------------------|----------------------------------------|
| SSR, page routing, layouts | TanStack Start | `src/routes/**` | Start |
| HTTP routing for `/api/*` | TanStack Start **server routes** | `src/routes/api/**` | [Start server routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes) |
| Request-scoped dependencies (db, auth, env) | Start global **request middleware** | `src/start.ts` | [Start middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware) |
| Typed app RPC (browser ↔ server) | **oRPC** `RPCHandler` | `src/routes/api/rpc.$.ts` | [oRPC TanStack Start adapter](https://orpc.dev/docs/adapters/tanstack-start) |
| SSR data access | **oRPC** `createRouterClient` (in-process, no HTTP) | `src/lib/orpc.ts` | same |
| Public REST + OpenAPI (optional) | **oRPC** `OpenAPIHandler` | `src/routes/api/v1.$.ts` | same ("any supported oRPC handler") |
| Authentication endpoints | **Better Auth** | `src/routes/api/auth/$.ts` | [Better Auth installation (TanStack Start)](https://www.better-auth.com/docs/installation) |
| Webhooks | Start server route → billing module | `src/routes/api/webhooks/<provider>.ts` | Start server routes |
| CSRF for cookie-authenticated RPC | Start `createCsrfMiddleware()` on the RPC route | route `server.middleware` | [Start middleware: CSRF](https://tanstack.com/start/latest/docs/framework/react/guide/middleware) |
| Business logic | `src/modules/*/service.ts` | — | B7 convention |
| Validation | Zod schemas on oRPC procedures | `procedures.ts` | oRPC |
| Persistence | Drizzle + `pg` over Hyperdrive | `src/db/*` | [Hyperdrive + Drizzle](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/) |
| Cron and queue handlers | Worker module exports | `src/server.ts` | [Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/) |

**What is deliberately absent:**
- **Hono is not part of B7 Fullstack** (`A1`). It stays the router of [B7 API](../api/README.md).
- **Start server functions (`createServerFn`) are not used for business logic** (`A2`). oRPC is the only app transport, so there is one validation, error and middleware model.
- **No custom `/api` dispatcher in `src/server.ts`.** `src/server.ts` exists only to add `scheduled` or `queue` exports, as Cloudflare documents.

## Request flow

1. **Request middleware** (`src/start.ts`, global, runs for SSR, server routes and server functions) builds the request scope:
   ```ts
   // shape only, not final code
   context = { env, db: createDb(env.HYPERDRIVE), auth: createAuth({ db, env }) }
   ```
   `env` comes from `import { env } from "cloudflare:workers"`. Nothing request-scoped is stored at module scope.
2. **Auth route** `/api/auth/*`: `context.auth.handler(request)`.
3. **RPC route** `/api/rpc/*`: CSRF middleware, then `RPCHandler.handle(request, { prefix: "/api/rpc", context: { db, auth, headers } })`. oRPC middleware resolves the session, and then the organization membership for org-scoped procedures (see [authentication](authentication.md#authorization-model)).
4. **SSR loaders** call procedures through an isomorphic client. On the server, `createRouterClient(router, { context: () => buildContext() })` calls procedures **in-process**, with no HTTP round trip. In the browser, `RPCLink({ url: "/api/rpc" })` is used. oRPC warns that the server-side client is shared across requests, so the **context must be a function** that reads the current request scope, never a static object.
5. **Webhook routes**: billing reads the raw body and processes it through the inbox (see [billing](billing.md#event-processing)).

Defining `src/start.ts` **disables Start's automatic CSRF protection for server functions**. B7 does not use server functions for app logic, but it still installs `createCsrfMiddleware({ filter: ctx => ctx.handlerType === "serverFn" })` globally, so that a server function added by mistake stays protected.

## Database client lifecycle

- **One connection per request**, a `pg` `Pool` with `max: 1` (implemented in `src/db/client.ts`), created in the request middleware from `env.HYPERDRIVE.connectionString`, wrapped by Drizzle, and shared by Better Auth, oRPC procedures and webhooks. Workers allow only 6 connections per invocation to wait for headers at once ([limits](https://developers.cloudflare.com/workers/platform/limits/)), so a second client per request is a bug.
- **Lazy connect.** A single-connection `Pool` connects on first query, so static and SSR-only requests that never query open no connection. Inside `db.transaction`, code must use `tx`, because other queries would wait for the one connection. **UNVERIFIED under Hyperdrive:** test `D-T1`.
- **Closing.** Cloudflare's `pg` example creates and connects a client per request but does not close it ([node-postgres + Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/)). B7 calls `waitUntil(pool.end())` after the response, once Better Auth background tasks have settled. `pg-cloudflare` reports "socket has been closed" on each deliberate end, which `src/db/client.ts` handles so it is not an unhandled rejection. **UNVERIFIED:** test `D-T2` decides whether to keep closing.
- **Hyperdrive caching is disabled** on the only binding (`A4`). Hyperdrive does not invalidate cached reads on writes ([query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)), and sessions, memberships and entitlements must never be stale. A second, cache-enabled binding is **DEFERRED** until a measured read path justifies it. Even then, it must never serve auth, membership, billing or read-after-write queries.
- **Transactions** are short. Hyperdrive pools connections in transaction mode, so a long transaction holds a pooled connection ([how Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/)). The one deliberate exception is billing's per-subscription lock (see [billing](billing.md#concurrency-control)).
- **Migrations**: Drizzle Kit against the direct `DATABASE_URL`, run from CI before deploy. They are never run from the Worker.

## Module layout (modular monolith)

```
src/
├── start.ts                  # createStart: request middleware (scope) + serverFn CSRF guard
├── server.ts                 # only with billing (cron) or queues: { fetch: handler.fetch, scheduled, queue }
├── routes/
│   ├── ...                   # UI routes
│   └── api/
│       ├── auth/$.ts         # Better Auth
│       ├── rpc.$.ts          # oRPC RPCHandler
│       ├── v1.$.ts           # oRPC OpenAPIHandler (publicApi only)
│       └── webhooks/stripe.ts | abacatepay.ts   # billing only
├── lib/orpc.ts               # isomorphic client (RPCLink / createRouterClient)
├── rpc/
│   ├── router.ts             # root router composed from module routers
│   └── middleware.ts         # requireSession, requireMembership, requirePermission
├── modules/
│   ├── auth/                 # createAuth({ db, env }), access-control statements
│   ├── billing/              # billing only
│   ├── email/                # email only: sendEmail()
│   └── <domain>/             # schema.ts · service.ts · procedures.ts
└── db/
    ├── client.ts             # createDb(hyperdrive)
    └── schema.ts             # re-exports all module schemas, including Better Auth tables
```

Module rules:
- Other modules import only a module's `service.ts` functions and its oRPC sub-router, never its tables.
- Every service function that touches tenant data takes `organizationId` as an explicit argument (see [authentication](authentication.md#tenant-isolation)).
- Modules never call each other over HTTP inside the Worker.

## Scaling without microservices

1. Start with one Worker and one PostgreSQL database. The Worker scales per request.
2. Fix slow queries with indexes and query shape before adding any cache.
3. Retryable or slow work moves to Cloudflare Queues (optional feature).
4. If a cache is still needed, add a second cache-enabled Hyperdrive binding for **named, staleness-tolerant** queries only.
5. Scale the database vertically, then add read replicas.
6. Extract a service only when it needs another runtime (Python ML, a Go hot path) or an independent deploy. Build it as a [B7 API](../api/README.md) project.

Durable Objects and KV are **DEFERRED** in Fullstack v0.2. No core feature needs them, and KV's eventual consistency makes it unsafe for auth, rate limits or billing.

## Acceptance tests for this document

`T-T1` (SSR + RPC + auth + webhooks in one deployed Worker), `T-T2` (cron export coexists with Start's handler), `T-T4` (CSRF rejects a cross-site RPC call), `D-T1`, `D-T2`. Definitions are in [architecture-review.md](../../architecture-review.md#required-acceptance-tests).
