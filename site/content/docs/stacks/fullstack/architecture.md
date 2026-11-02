---
title: "B7 Fullstack Architecture"
---

> **Status: approved (2026-11-01).** Decisions are tagged with decision IDs (`A1`–`A13`), which are listed in [architecture-review.md](https://github.com/bernardofernandezz/b7-stack/blob/main/architecture-review.md#decisions-requiring-maintainer-approval). The evidence behind each decision is also in that review.

## Summary

B7 Fullstack is **one TanStack Start application, running as a Node.js process in Docker behind Caddy, backed by one PostgreSQL database through one process-wide connection pool** ([ADR-013](/docs/technology-decisions#adr-013-docker-compose-replaces-cloudflare-workers-as-the-fullstack-target)). Each HTTP concern is owned by exactly one component, and each component is mounted the way its vendor documents for TanStack Start.

```
          Caddy (:80/:443, TLS, X-Forwarded-For)
               │     app container: Node.js + srvx serving Start's fetch handler and dist/client
               │     ┌──────────────────────────────────────────────────────────────────────────────┐
 request ──────┴───► │ TanStack Start                                                               │
                     │  src/start.ts  requestMiddleware: [requestScope]  →  context { db, auth }     │
                     │                                                                              │
                     │  /api/auth/$            server route → Better Auth   auth.handler(request)   │
                     │  /api/rpc/$             server route → oRPC RPCHandler      (app client)      │
                     │  /api/v1/$              server route → oRPC OpenAPIHandler  (optional)        │
                     │  /api/webhooks/stripe   server route → billing inbox        (optional)        │
                     │  everything else        SSR + routing; loaders call oRPC in-process           │
                     │                                                                              │
                     └───────────────┬──────────────────────────────────────────────────────────────┘
                                     │ one pg pool per process
                                     ▼
                                PostgreSQL  ◄── scheduler (billing reconciliation) · worker (queues)   (optional services)
```

## Responsibilities

Each responsibility has exactly one owner.

| Responsibility | Owner | Mount / location | Vendor documentation for this exact use |
|---------------|-------|------------------|----------------------------------------|
| SSR, page routing, layouts | TanStack Start | `src/routes/**` | Start |
| HTTP routing for `/api/*` | TanStack Start **server routes** | `src/routes/api/**` | [Start server routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes) |
| Shared dependencies (db, auth) in the request context | Start global **request middleware** | `src/start.ts` | [Start middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware) |
| Typed app RPC (browser ↔ server) | **oRPC** `RPCHandler` | `src/routes/api/rpc.$.ts` | [oRPC TanStack Start adapter](https://orpc.dev/docs/adapters/tanstack-start) |
| SSR data access | **oRPC** `createRouterClient` (in-process, no HTTP) | `src/lib/orpc.ts` | same |
| Public REST + OpenAPI (optional) | **oRPC** `OpenAPIHandler` | `src/routes/api/v1.$.ts` | same ("any supported oRPC handler") |
| Authentication endpoints | **Better Auth** | `src/routes/api/auth/$.ts` | [Better Auth installation (TanStack Start)](https://www.better-auth.com/docs/installation) |
| Webhooks | Start server route → billing module | `src/routes/api/webhooks/<provider>.ts` | Start server routes |
| CSRF for cookie-authenticated RPC | Start `createCsrfMiddleware()` on the RPC route | route `server.middleware` | [Start middleware: CSRF](https://tanstack.com/start/latest/docs/framework/react/guide/middleware) |
| Business logic | `src/modules/*/service.ts` | — | B7 convention |
| Validation | Zod schemas on oRPC procedures | `procedures.ts` | oRPC |
| Persistence | Drizzle + `pg` | `src/db/*` | [Drizzle node-postgres](https://orm.drizzle.team/docs/get-started-postgresql) |
| Scheduled jobs | The `scheduler` Compose service calls an internal route; the work runs in the app | `src/routes/api/internal/*` | B7 convention ([infrastructure](/docs/stacks/fullstack/infrastructure#compose-services)) |
| TLS, client IP | **Caddy** | `Caddyfile` | [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) |

**What is deliberately absent:**
- **No Hono** (`A1`). Start server routes own `/api/*` on both [targets](#targets).
- **Start server functions (`createServerFn`) are not used for business logic** (`A2`). oRPC is the only app transport, so there is one validation, error and middleware model.
- **No custom server entry.** srvx serves Start's own fetch handler. Background work runs in separate services, not in the HTTP process.

## Request flow

1. **Request middleware** (`src/start.ts`, global, runs for SSR, server routes and server functions) builds the request scope:
   ```ts
   // shape only, not final code
   services ??= { db: createDb(env.DATABASE_URL), auth: createAuth({ db, env }) }   // once per process
   context = services
   ```
   `env` is `parseEnv(process.env)`, validated on the first request. The pool and the Better Auth instance are process-wide; nothing **user**-specific is stored at module scope.
2. **Auth route** `/api/auth/*`: `context.auth.handler(request)`.
3. **RPC route** `/api/rpc/*`: CSRF middleware, then `RPCHandler.handle(request, { prefix: "/api/rpc", context: { db, auth, headers } })`. oRPC middleware resolves the session, and then the organization membership for org-scoped procedures (see [authentication](/docs/stacks/fullstack/authentication#authorization-model)).
4. **SSR loaders** call procedures through an isomorphic client. On the server, `createRouterClient(router, { context: () => buildContext() })` calls procedures **in-process**, with no HTTP round trip. In the browser, `RPCLink({ url: "/api/rpc" })` is used. oRPC warns that the server-side client is shared across requests, so the **context must be a function** that reads the current request scope, never a static object.
5. **Webhook routes**: billing reads the raw body and processes it through the inbox (see [billing](/docs/stacks/fullstack/billing#event-processing)).

Defining `src/start.ts` **disables Start's automatic CSRF protection for server functions**. B7 does not use server functions for app logic, but it still installs `createCsrfMiddleware({ filter: ctx => ctx.handlerType === "serverFn" })` globally, so that a server function added by mistake stays protected.

## Database client lifecycle

- **One pool per process** (`src/db/client.ts`), default 10 connections (`DATABASE_POOL_MAX`), created on the first request and shared by Better Auth, oRPC procedures, webhooks and SSR. Keep `replicas × DATABASE_POOL_MAX` below PostgreSQL's `max_connections`.
- **No query cache** (`A4` still holds in spirit): sessions, memberships and entitlements must never be stale. A cache is **DEFERRED** until a measured read path justifies it, and it must never serve auth, membership, billing or read-after-write queries.
- **Transactions** are short, because each holds a pooled connection. The one deliberate exception is billing's per-subscription lock (see [billing](/docs/stacks/fullstack/billing#concurrency-control)). Inside `db.transaction`, use `tx`.
- **Migrations**: Drizzle Kit against `DATABASE_URL`, run by the one-shot `migrate` Compose service before the new `app` starts. They are never run from the app process.

## Module layout (modular monolith)

```
src/
├── start.ts                  # createStart: request middleware (scope) + serverFn CSRF guard
├── routes/
│   ├── ...                   # UI routes
│   └── api/
│       ├── auth/$.ts         # Better Auth
│       ├── rpc.$.ts          # oRPC RPCHandler
│       ├── v1.$.ts           # oRPC OpenAPIHandler (publicApi only)
│       ├── webhooks/stripe.ts | abacatepay.ts   # billing only
│       └── internal/reconcile.ts                # billing only: called by the scheduler, not routed by Caddy
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
    ├── client.ts             # createDb(DATABASE_URL): one pool per process
    └── schema.ts             # re-exports all module schemas, including Better Auth tables
```

Module rules:
- Other modules import only a module's `service.ts` functions and its oRPC sub-router, never its tables.
- Every service function that touches tenant data takes `organizationId` as an explicit argument (see [authentication](/docs/stacks/fullstack/authentication#tenant-isolation)).
- Modules never call each other over HTTP inside the app.

## Targets

Both targets of [ADR-015](/docs/technology-decisions#adr-015-fullstack-offers-two-targets-from-one-tanstack-start-app) (proposed) use the layout this document describes. Only the build and the operations files differ:

| | `docker` (default, generated today) | `serverless` |
|---|---|---|
| Runtime | Node.js container (srvx) behind Caddy | A Nitro preset: Vercel, Netlify, Cloudflare |
| Database | PostgreSQL in Compose, one pool per process | Managed PostgreSQL (Neon, Supabase), pooled connection string, one client per invocation |
| Scheduled jobs | `scheduler` Compose service | Platform cron calling `/api/internal/*` |

Module boundaries, the authorization chain and tenant isolation are the same on both targets.

## Scaling without microservices

1. Start with one `app` container and one PostgreSQL database. Scale out with `docker compose up --scale app=N` behind Caddy: no per-user state lives in memory.
2. Fix slow queries with indexes and query shape before adding any cache.
3. Retryable or slow work moves to the `worker` service (the `queues` option).
4. If a cache is still needed, add it for **named, staleness-tolerant** queries only.
5. Scale the database vertically, then add read replicas.
6. Extract a service only when it needs another runtime (Python ML, a Go hot path) or an independent deploy. Build it as a [B7 API](/docs/stacks/api) project.

A shared in-memory cache (such as Redis) is **DEFERRED**. No core feature needs it, and auth, rate limits and billing must read PostgreSQL.

## Acceptance tests for this document

`T-T1` (SSR + RPC + auth + webhooks in one deployed app), `T-T4` (CSRF rejects a cross-site RPC call), `D-T2` (no connection growth under load), and the Compose stack E2E. Definitions are in [architecture-review.md](https://github.com/bernardofernandezz/b7-stack/blob/main/architecture-review.md#required-acceptance-tests).
