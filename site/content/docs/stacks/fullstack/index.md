---
title: "B7 Fullstack: the SaaS and startup profile"
---

**Purpose:** a production-oriented foundation for SaaS products. This is the most opinionated B7 profile: **TypeScript only** (Go is never offered), **one PostgreSQL database**, and a modular monolith inside it, shipped in one of two ways (see [Targets](#targets)).


## Core

| Layer | Technology | Owner of |
|-------|-----------|----------|
| App and HTTP | TanStack Start, TanStack Router | SSR, page routing, `/api/*` server routes, request middleware |
| App RPC | oRPC + Zod | Typed browser ↔ server calls, in-process SSR calls, optional OpenAPI |
| Auth | Better Auth | Users, sessions, rate-limited auth endpoints, optional organizations |
| Data | PostgreSQL, Drizzle, `pg` (one pool per process) | Persistence |
| UI | Tailwind CSS, Base UI, Lucide | Presentation |
| Runtime | `docker` (default): Node.js, Docker Compose, Caddy. `serverless`: Nitro presets (Vercel, Netlify, Cloudflare). pnpm locally | Deployment |
| Quality | Vitest, Playwright, container logs, GitHub Actions | Testing, monitoring, CI/CD |

## Targets

| Target | What you get |
|--------|--------------|
| **`docker`** (default) | One TanStack Start app with oRPC, run with Docker Compose behind Caddy. Runs the same on a laptop, a VPS or any container platform |
| **`serverless`** | The same app, deployed through a Nitro preset to Vercel, Netlify or Cloudflare, with a managed PostgreSQL. No server to run |

Both are specified in [ADR-015](/docs/technology-decisions#adr-015-fullstack-offers-two-targets-from-one-tanstack-start-app) (proposed). Today `create-b7` generates the `docker` target described in [architecture](/docs/stacks/fullstack/architecture).

## Options

`organizations`, `oauthProviders`, `billing` (Stripe, or AbacatePay *experimental*), `email` (Resend), `storage` (R2), `queues`, `publicApi`, `turnstile`, `sentry`, and `passkeys` *(experimental)*. Dependencies, env vars and rules for each are in the [configuration model](/docs/configuration-model#b7-fullstack).

## Documents

| Document | Canonical for |
|----------|---------------|
| [architecture.md](/docs/stacks/fullstack/architecture) | Component ownership, request flow, DB client lifecycle, module layout, scaling |
| [authentication.md](/docs/stacks/fullstack/authentication) | Better Auth lifecycle, sessions, rate limiting, authorization chain, tenant isolation |
| [billing.md](/docs/stacks/fullstack/billing) | Billing domain, provider mappings and limitations, webhook verification, event processing |
| [infrastructure.md](/docs/stacks/fullstack/infrastructure) | Docker Compose services, local development, secrets, deployment |
