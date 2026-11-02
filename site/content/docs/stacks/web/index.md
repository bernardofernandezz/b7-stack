---
title: "B7 Web"
---

**Purpose:** React web applications, from content sites to apps with integrated server logic. No separate API service is required.

## Defaults

| Concern | Default |
|---------|---------|
| Language / tooling | TypeScript, Node.js (LTS), pnpm |
| Framework | React, TanStack Start, TanStack Router |
| Server logic | TanStack Start server functions and server routes |
| Server state | TanStack Query, when route loaders are not enough |
| UI | Tailwind CSS, Base UI, Lucide |
| Testing | Vitest |
| Deployment | Docker on Node.js. Cloudflare Workers is optional |

## Options

Deployment target (Docker or Workers) and database (PostgreSQL + Drizzle + `pg`, through a cache-disabled Hyperdrive binding on Workers). Authentication is deferred in Web, so use B7 Fullstack when you need users. Valid values are in the [configuration model](/docs/configuration-model#other-profiles).

## Server logic without an API service

TanStack Start server functions run on the server and can be called from components and loaders with full types. Use them for data loading and mutations owned by this app. Server routes cover the occasional plain HTTP endpoint.

## When to choose another profile

- You need users, a public API, third-party webhooks, organizations or billing: use **[B7 Fullstack](/docs/stacks/fullstack)**.
- The backend must be deployed or versioned independently, or written in Go: add a **[B7 API](/docs/stacks/api)** project.
