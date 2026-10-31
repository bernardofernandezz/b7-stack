# Principles

Each principle comes with the decision rules it leads to. When two options are otherwise equal, these rules decide.

## 1. Simplicity First

- Use the platform or the standard library before adding a dependency. Examples: Go `net/http`, Web `fetch`, `Request` and `Response`, Web Crypto.
- Ship one deployable unit per product until there is a measured reason to split. Split only when you see independent scaling, a separate team, or a different runtime need.
- Add no B7-specific wrappers around libraries. The only exceptions are thin seams with two or more real implementations, such as the [billing provider interface](../stacks/fullstack/billing.md).
- Every module is optional unless the profile cannot work without it.

## 2. Performance Matters

- Run TypeScript on Bun or the Workers runtime, run systems code in Go, and serve Python models with ONNX Runtime where possible.
- Keep data close to compute. For example, Workers reach PostgreSQL through Hyperdrive for connection pooling and caching.
- Measure before you add caching. Redis or KV must have a documented reason.

## 3. Explicit Architecture

- Every layer has one written responsibility. See [architecture](architecture.md).
- Use one routing system per concern. B7 never runs two HTTP servers inside one process.
- Validate data at boundaries with schemas: Zod in TypeScript, explicit decoding in Go, Pydantic or typed parsing in Python.
- Tenant scoping is visible in every query. It is never implied by global state.

## 4. Developer Experience

- Types flow end to end: database (Drizzle or SQLC), then procedures (oRPC), then client.
- One command starts local development. Remote services can be emulated locally where the platform allows it, for example `wrangler dev` bindings.
- Error messages and docs come before conventions that have to be memorized.

## 5. Production Ready

- Security, testing and observability standards apply from the first commit. See the [security](standards/security.md), [testing](standards/testing.md) and [observability](standards/observability.md) standards.
- Secrets never go into source control or client bundles.
- Webhook processing is verified, idempotent and safe to retry.
- No paid service is mandatory. Paid integrations are opt-in, and their lock-in is documented in [technology decisions](technology-decisions.md).
