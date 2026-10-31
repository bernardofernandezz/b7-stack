# B7 Fullstack: the SaaS and startup profile

**Purpose:** a plug-and-play foundation for building, launching and scaling SaaS products. It is the most opinionated B7 profile: **TypeScript only**, one Cloudflare Worker, and a modular monolith inside it.

Go is **not** offered in this profile. If a product later needs a Go service, it adds a separate [B7 API](../api/README.md) project. See the [scaling](architecture.md#scaling-without-microservices) section.

## Core stack

| Layer | Technology |
|-------|-----------|
| Application | React, TanStack Start, TanStack Router, TanStack Query |
| Backend | Hono, oRPC, Zod |
| Runtime and deployment | Cloudflare Workers, Wrangler. Bun for local tooling and packages |
| Authentication | Better Auth |
| Database | PostgreSQL + Drizzle (`pg` driver) through Cloudflare Hyperdrive. D1 is an alternative |
| UI | Tailwind CSS, Base UI, Lucide |
| Testing | Vitest (Workers pool), Playwright |
| Monitoring | Cloudflare Workers Observability. Sentry is optional |

## Backend strategies

Pick one. The default is `hono-orpc-with-start`. The full definitions are in the [configuration model](../../docs/configuration-model.md#fullstack-backend-strategies).

| Strategy | Use when |
|----------|----------|
| `start-server` | Internal app with no public API, webhooks or billing |
| `hono-orpc` | All server logic behind typed procedures and REST |
| `hono-orpc-with-start` (default) | Procedures and REST in Hono, plus Start server functions for page-level loading |

## Features: default versus optional

| Capability | Status | Technology | Doc |
|-----------|--------|-----------|-----|
| Authentication | Default (can be disabled) | Better Auth: email/password, sessions | [authentication](authentication.md) |
| OAuth providers | Optional | Better Auth social providers | [authentication](authentication.md#oauth) |
| Passkeys | Optional | Better Auth passkey plugin | [authentication](authentication.md#passkeys) |
| Roles and permissions | Default | Better Auth access control | [authentication](authentication.md#authorization) |
| Organizations, memberships, invitations | Optional | Better Auth organization plugin | [authentication](authentication.md#organizations-and-multi-tenancy) |
| Billing and payments | Optional (pick **one**) | Stripe **or** AbacatePay | [billing](billing.md) |
| Transactional email | Optional | Resend, replaceable | [infrastructure](infrastructure.md#email) |
| File storage | Optional | Cloudflare R2 | [infrastructure](infrastructure.md#r2-storage) |
| Background jobs | Optional | Cloudflare Queues | [infrastructure](infrastructure.md#queues-and-cron) |
| Scheduled tasks | Optional | Cron Triggers | [infrastructure](infrastructure.md#queues-and-cron) |
| Caching / KV | Optional | Cloudflare KV | [infrastructure](infrastructure.md#bindings) |
| Realtime / coordination | Optional, only when justified | Durable Objects | [infrastructure](infrastructure.md#bindings) |
| Bot protection | Optional | Turnstile | [infrastructure](infrastructure.md#bindings) |
| Public API docs | Optional | oRPC OpenAPI | [architecture](architecture.md#responsibilities) |
| Error tracking | Optional | Sentry | [observability](../../docs/standards/observability.md) |

A simple SaaS uses auth, roles, PostgreSQL and nothing else. Every other row adds its own dependencies only when selected.

## Documents in this profile

- [architecture.md](architecture.md): request flow, responsibilities, module layout, tenant isolation, scaling.
- [authentication.md](authentication.md): Better Auth, organizations, authorization.
- [billing.md](billing.md): provider abstraction, webhooks, entitlements.
- [infrastructure.md](infrastructure.md): Workers, bindings, local development, secrets, deployment.
