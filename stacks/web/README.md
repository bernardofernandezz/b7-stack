# B7 Web

**Purpose:** React web applications, from content sites to apps with integrated server logic. No separate API service is required.

## Defaults

| Concern | Default |
|---------|---------|
| Language / tooling | TypeScript, Bun |
| Framework | React, TanStack Start, TanStack Router |
| Server logic | TanStack Start server functions and server routes |
| Server state | TanStack Query, when route loaders are not enough |
| UI | Tailwind CSS, Base UI, Lucide |
| Testing | Vitest |
| Deployment | Docker on Bun. Cloudflare Workers is optional |

## Options

Database (PostgreSQL, D1, SQLite with Drizzle), Better Auth with roles, Resend, Playwright, Workers deployment with KV, R2 and Turnstile, Sentry and OpenTelemetry. Valid values and their dependencies are in the [configuration model](../../docs/configuration-model.md#allowed-values-per-profile).

## Server logic without an API service

TanStack Start server functions run on the server and can be called from components and loaders with full types. Use them for data loading and mutations owned by this app. Server routes cover the occasional plain HTTP endpoint.

## When to choose another profile

- You need a public API, third-party webhooks, organizations or billing: use **[B7 Fullstack](../fullstack/README.md)**.
- The backend must be deployed or versioned independently, or written in Go: add a **[B7 API](../api/README.md)** project.
