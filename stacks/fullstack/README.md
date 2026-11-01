# B7 Fullstack: the SaaS and startup profile (v0.2, proposed)

**Purpose:** a production-oriented foundation for SaaS products. This is the most opinionated B7 profile: **TypeScript only** (Go is never offered), **one Node.js app in Docker Compose**, **one PostgreSQL database**, and a modular monolith inside it.

> v0.2 narrows v0.1. Hono, D1, KV, Durable Objects and backend-strategy choices are removed from this profile. See [architecture-review.md](../../architecture-review.md#decisions-requiring-maintainer-approval) for the decisions awaiting approval.

## Core

| Layer | Technology | Owner of |
|-------|-----------|----------|
| App and HTTP | TanStack Start, TanStack Router | SSR, page routing, `/api/*` server routes, request middleware |
| App RPC | oRPC + Zod | Typed browser ↔ server calls, in-process SSR calls, optional OpenAPI |
| Auth | Better Auth | Users, sessions, rate-limited auth endpoints, optional organizations |
| Data | PostgreSQL, Drizzle, `pg` (one pool per process) | Persistence |
| UI | Tailwind CSS, Base UI, Lucide | Presentation |
| Runtime | Node.js, srvx, Docker Compose, Caddy (TLS, reverse proxy). pnpm locally | Deployment |
| Quality | Vitest, Playwright, container logs, GitHub Actions | Testing, monitoring, CI/CD |

## Options

`organizations`, `oauthProviders`, `billing` (Stripe, or AbacatePay *experimental*), `email` (Resend), `storage` (R2), `queues`, `publicApi`, `turnstile`, `sentry`, and `passkeys` *(experimental)*. Dependencies, env vars and rules for each are in the [configuration model](../../docs/configuration-model.md#b7-fullstack).

## Documents

| Document | Canonical for |
|----------|---------------|
| [architecture.md](architecture.md) | Component ownership, request flow, DB client lifecycle, module layout, scaling |
| [authentication.md](authentication.md) | Better Auth lifecycle, sessions, rate limiting, authorization chain, tenant isolation |
| [billing.md](billing.md) | Billing domain, provider mappings and limitations, webhook verification, event processing |
| [infrastructure.md](infrastructure.md) | Docker Compose services, local development, secrets, deployment |
