# B7 API

**Purpose:** standalone APIs, backend services and integrations. The backend language is a configuration choice: **TypeScript** or **Go**. B7 does not push either one on every project.

## Track A: TypeScript (default)

| Concern | Default | Options |
|---------|---------|---------|
| Router | Hono | — |
| Procedures | oRPC + Zod, mounted inside Hono | — |
| Public REST | oRPC `OpenAPIHandler` and generated OpenAPI spec | Plain Hono routes |
| Runtime | Node.js (LTS), via `@hono/node-server` | Cloudflare Workers; Bun (alternative) |
| Data | none | PostgreSQL with Drizzle + `pg` (Hyperdrive, caching disabled, on Workers) |
| Auth | Deferred in v0.2 | — |
| Testing | Vitest (`app.request()`) | — |
| Deploy | Docker | Workers |

**Hono + oRPC is the recommended combination.** oRPC is served through its Fetch adapter inside a Hono middleware, with no separate package ([oRPC Hono adapter](https://orpc.dev/docs/adapters/hono)):

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { RPCHandler } from "@orpc/server/fetch";
import { router } from "./router";

const rpc = new RPCHandler(router);
const app = new Hono();

app.use("/rpc/*", async (c, next) => {
  const { matched, response } = await rpc.handle(c.req.raw, { prefix: "/rpc", context: {} });
  if (matched) return c.newResponse(response.body, response);
  await next();
});

serve(app); // Node.js. On Workers, `export default app` instead.
```

`@hono/node-server` is the only Node-specific piece. It is not used on the Workers target ([Hono on Node.js](https://hono.dev/docs/getting-started/nodejs)).

If earlier middleware reads the request body, oRPC fails with "body already used". Either do not consume the body before the oRPC middleware, or apply the proxy workaround from the oRPC docs.

## Track B: Go

| Concern | Default | Options |
|---------|---------|---------|
| Router | Standard library `net/http` (`ServeMux` method and path patterns) | — |
| Data | none | PostgreSQL with SQLC + pgx |
| Public REST | OpenAPI spec maintained alongside handlers | — |
| Logging | `log/slog` | — |
| Testing | `go test`, `httptest` | — |
| Deploy | Docker or a single binary | — |

Drizzle and oRPC are TypeScript-only and are not available in the Go track. Auth is **deferred** in both API tracks until B7 defines a token model ([ADR-022](../../docs/technology-decisions.md#other-profiles)).

## Compatibility

Valid options are in the [configuration model](../../docs/configuration-model.md#other-profiles). Go uses SQLC for PostgreSQL. The Workers target is TypeScript-only.

## When to choose another profile

- You also need a React UI, auth and billing in one deployment: use **[B7 Fullstack](../fullstack/README.md)**.
- The program is a CLI or daemon, not an HTTP service: use **[B7 Systems](../systems/README.md)**.
