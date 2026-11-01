# Testing

## What to test

Test behavior at module boundaries, not implementation details. Priorities:

1. **Money and access.** Billing state transitions, webhook handling (valid, invalid signature, duplicate, out-of-order), entitlement checks, authorization and tenant isolation.
2. **Contracts.** oRPC procedures and REST endpoints: input validation, error shapes, status codes.
3. **Critical user flows.** Sign-up, sign-in, creating and switching organizations, checkout, as E2E tests.
4. **Everything else.** Test in proportion to risk.

## Tools per profile

| Profile | Unit / integration | E2E |
|---------|-------------------|-----|
| Web, Fullstack | Vitest. On Workers, use `@cloudflare/vitest-plugin` (formerly `@cloudflare/vitest-pool-workers`, now deprecated) so tests run in the Workers runtime with real bindings ([docs](https://developers.cloudflare.com/workers/testing/vitest-integration/)). The pool injects `nodejs_compat`, so a post-deploy smoke test is mandatory | Playwright (Fullstack) |
| API (TS) | Vitest. Call `app.request()` on the Hono app directly | — |
| API (Go), Systems | `go test`, `net/http/httptest` | — |
| Intelligence | pytest. Use fixed seeds and small fixture datasets | — |

## Rules

- **The database in tests is real.** Run PostgreSQL in Docker Compose or in the CI service container. Hyperdrive-specific behavior is tested only against a deployed Worker. Do not mock the ORM.
- **External providers are faked at the HTTP boundary.** Do not call live Stripe, AbacatePay or Resend in CI. Webhook tests use recorded payloads signed with a test secret.
- **Tenant isolation has explicit tests.** User A of org X cannot read or write org Y's resources through any procedure.
- **Tests are deterministic.** No sleeps, and fixed clocks for time-dependent billing logic.
- **CI runs** formatting, linting, type checks, unit and integration tests on every PR, and E2E tests on main or on pre-deploy.
