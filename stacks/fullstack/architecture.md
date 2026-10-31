# B7 Fullstack Architecture

## One Worker, two routers, no overlap

A B7 Fullstack product is deployed as **one Cloudflare Worker**. A custom server entry dispatches on path prefix:

```
                       ┌────────────── Cloudflare Worker (src/server.ts) ──────────────┐
request ──► /api/*  ──►│ Hono app                                                      │
                       │   /api/auth/*          Better Auth handler                    │
                       │   /api/rpc/*           oRPC RPCHandler (app client)           │
                       │   /api/v1/*            oRPC OpenAPIHandler (public REST)       │
                       │   /api/webhooks/:p     Billing/provider webhooks              │
                       │                                                               │
        everything ───►│ TanStack Start handler: SSR, routing, server functions        │
        else           │                                                               │
                       │ queue()      Cloudflare Queues consumer                       │
                       │ scheduled()  Cron Triggers                                    │
                       └───────────────────────────────────────────────────────────────┘
                              │ bindings: HYPERDRIVE · BUCKET · JOBS · KV · ...
                              ▼
                      PostgreSQL (via Hyperdrive) · R2 · Queues · KV
```

There is exactly one HTTP entry point and one router per path space. Hono never renders pages, and Start never serves `/api/*`.

### Server entry

Cloudflare's TanStack Start guide documents a custom `src/server.ts` entry, set as `main` in `wrangler.jsonc`, for adding `queue` and `scheduled` handlers and Durable Object exports ([Cloudflare guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)). B7 adds the `/api` dispatch in that same entry:

```ts
// src/server.ts
import handler from "@tanstack/react-start/server-entry";
import { api } from "./api/app"; // new Hono<{ Bindings: Env }>().basePath("/api")
import { handleQueue } from "./modules/jobs/consumer";
import { handleScheduled } from "./modules/jobs/scheduled";

export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return api.fetch(request, env, ctx);
    }
    return handler.fetch(request);
  },
  queue: handleQueue,         // only when jobs.queues
  scheduled: handleScheduled, // only when jobs.cron
} satisfies ExportedHandler<Env>;
```

- **This is a B7 convention, not an official integration.** Neither TanStack Start nor Hono documents this composition. It relies only on documented pieces: Start's handler `fetch`, Hono's `app.fetch(request, env, ctx)` and the Workers module export shape.
- **Uncertain:** check the exact `handler.fetch` signature for your TanStack Start version. Start also documents `createServerEntry({ fetch })` for wrapping its handler with error conversion ([server entry point](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point)). Prefer it if your version requires it.
- Inside Start code (loaders, server functions), get bindings with `import { env } from "cloudflare:workers"`.

## Responsibilities

| Layer | Owns | Does not own |
|-------|------|--------------|
| **TanStack Start** | SSR, file-based routing, layouts, route loaders, server functions for page-level reads and form mutations, frontend integration | Public HTTP API, webhooks, auth endpoints |
| **Hono** | Everything under `/api`: mounting Better Auth, oRPC and webhook endpoints; API middleware (CORS, CSRF Origin checks, rate limiting, request IDs) | Rendering, page routing |
| **oRPC** | Typed procedures (Zod input/output, typed errors), shared contracts and inferred client types, OpenAPI generation for `/api/v1` | Transport concerns (Hono handles them) |

**Rule of thumb.** Logic that a non-browser client, a webhook, or another team could call is an **oRPC procedure** or **Hono route**. Logic that exists only to render one page may be a **Start server function**. Both call the same functions in `src/modules/*`, so business logic is never duplicated.

**SSR calling procedures.** Start loaders call module functions directly on the server, without an HTTP round trip. The browser uses the oRPC client against `/api/rpc`. When client code must also run during SSR, the oRPC docs recommend forwarding request headers (cookies) through the client's `headers` option ([oRPC TanStack Start](https://orpc.dev/docs/adapters/tanstack-start)).

With `backendStrategy = start-server`, there is no Hono and no `/api` dispatch. `main` stays `@tanstack/react-start/server-entry` unless queues or cron need a custom entry.

## Module layout (modular monolith)

```
src/
├── server.ts               # Worker entry (above)
├── routes/                 # TanStack Start routes (UI)
├── api/
│   ├── app.ts              # Hono app: middleware + mounts
│   └── router.ts           # oRPC root router, composed from module routers
├── modules/
│   ├── auth/               # Better Auth instance, session helpers, access control
│   ├── billing/            # only if billing ≠ none (see billing.md)
│   ├── email/              # only if email ≠ none: sendEmail()
│   ├── storage/            # only if storage = r2
│   ├── jobs/               # only if queues/cron
│   └── <domain>/           # product modules: projects, invoices, ...
│       ├── schema.ts       # Drizzle tables
│       ├── service.ts      # business logic (pure functions over db + ctx)
│       └── procedures.ts   # oRPC procedures exposing service.ts
├── db/
│   ├── client.ts           # per-request Drizzle client
│   └── schema.ts           # re-exports all module schemas (incl. Better Auth tables)
└── env.d.ts                # generated by `wrangler types`
```

**Module rules**

- A module exposes its `service.ts` functions and its oRPC sub-router. Other modules import only those, never its tables directly.
- Cross-module side effects (for example "subscription activated, so grant entitlements") are direct function calls when synchronous, or queue messages when they must be retried.
- No module talks to another over HTTP inside the same Worker.

## Tenant isolation

When organizations are enabled:

- Every tenant-owned table has `organization_id NOT NULL`, with an index that leads with it.
- The oRPC context is built per request from the Better Auth session: `{ db, user, session, organizationId: session.activeOrganizationId }`.
- Procedures that touch tenant data use an `orgProcedure` middleware. It rejects the request when there is no active organization or the user is not a member, and passes `organizationId` into the service.
- Service functions take `organizationId` as an explicit parameter and include it in **every** `where` clause, insert and update. Never accept it from client input without the membership check.
- Tests must assert that cross-tenant access fails. See [testing](../../docs/standards/testing.md#rules).

Row-level security in PostgreSQL is an optional extra layer. It is not the primary mechanism, because Hyperdrive pools connections, which makes per-session settings error-prone.

## Data access on Workers

- **PostgreSQL through Hyperdrive.** Create the `pg` client per request from `env.HYPERDRIVE.connectionString` and wrap it with Drizzle. Do not share clients across requests ([Hyperdrive + Drizzle](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/)).
- **D1.** Use `drizzle(env.DB)`. Best for small, single-region data. Mind D1's per-database size limits.
- **Migrations** run from CI or locally with Drizzle Kit against the direct `DATABASE_URL`, never from inside the Worker.

## Scaling without microservices

1. **Start:** one Worker and one PostgreSQL database. Workers already scale horizontally per request.
2. **Hot reads:** add Hyperdrive query caching (default on), then KV for explicit caches of derived data.
3. **Slow or bursty work:** move it to Queues (emails, webhook follow-ups, exports).
4. **Coordination or realtime:** Durable Objects for per-room or per-tenant state, and only for that feature.
5. **Database load:** add PostgreSQL read replicas or bigger instances before considering sharding.
6. **Split a service** only when a module needs a different runtime (Python ML, a Go hot path) or an independent deploy cadence. The split-off service is a [B7 API](../api/README.md) project called over HTTP or a Service Binding. The module's `service.ts` interface becomes its contract.
