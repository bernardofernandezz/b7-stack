# B7 API

**Purpose:** standalone APIs, backend services and integrations. The backend language is a configuration choice: **TypeScript** or **Go**. B7 does not push either one on every project.

## Track A: TypeScript (default)

| Concern | Default | Options |
|---------|---------|---------|
| Router | Hono | — |
| Procedures | oRPC + Zod, mounted inside Hono | — |
| Public REST | oRPC `OpenAPIHandler` and generated OpenAPI spec | Plain Hono routes |
| Runtime | Bun | Cloudflare Workers |
| Data | none | PostgreSQL / D1 / SQLite with Drizzle |
| Auth | none | Better Auth (roles) |
| Testing | Vitest (`app.request()`) | — |
| Deploy | Docker | Workers |

**Hono + oRPC is the recommended combination.** oRPC is served through its Fetch adapter inside a Hono middleware, with no separate package ([oRPC Hono adapter](https://orpc.dev/docs/adapters/hono)):

```ts
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

export default app;
```

If earlier middleware reads the request body, oRPC fails with "body already used". Either do not consume the body before the oRPC middleware, or apply the proxy workaround from the oRPC docs.

## Track B: Go

| Concern | Default | Options |
|---------|---------|---------|
| Router | Standard library `net/http` (`ServeMux` method and path patterns) | — |
| Data | none | PostgreSQL with SQLC + pgx; SQLite with `database/sql` |
| Public REST | OpenAPI spec maintained alongside handlers | — |
| Logging | `log/slog` | — |
| Testing | `go test`, `httptest` | — |
| Deploy | Docker or a single binary | — |

Drizzle, oRPC and Better Auth are TypeScript-only and are not available in the Go track. For auth in Go, validate tokens issued by an identity provider or by a B7 Fullstack app. **Uncertain:** B7 does not yet curate a Go auth library.

## Compatibility

All valid combinations are in the [configuration model](../../docs/configuration-model.md#compatibility-rules). The main constraints: Go requires SQLC or `database/sql`, Cloudflare bindings require the Workers target, and the Workers target requires TypeScript.

## When to choose another profile

- You also need a React UI, auth and billing in one deployment: use **[B7 Fullstack](../fullstack/README.md)**.
- The program is a CLI or daemon, not an HTTP service: use **[B7 Systems](../systems/README.md)**.
