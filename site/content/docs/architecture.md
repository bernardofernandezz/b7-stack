---
title: "Architecture"
---

This document defines how B7 is structured as an ecosystem: the layers, the boundaries between them, and how profiles relate. The internal architecture of the SaaS profile is in [stacks/fullstack/architecture.md](/docs/stacks/fullstack/architecture).

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│ Profile        web · api · systems · intelligence · fullstack │  intent and defaults
├──────────────────────────────────────────────────────────────┤
│ Modules        auth · billing · email · storage · jobs · ...  │  optional, composable
├──────────────────────────────────────────────────────────────┤
│ Frameworks     TanStack Start · Hono · oRPC · net/http · ...  │  used directly, never wrapped
├──────────────────────────────────────────────────────────────┤
│ Services       PostgreSQL · Better Auth · Stripe · Resend ... │  external or embedded
├──────────────────────────────────────────────────────────────┤
│ Infrastructure Docker · Compose · Caddy · Workers · GH Actions │  where code runs
└──────────────────────────────────────────────────────────────┘
```

- **Profile.** Chooses defaults and limits the valid values of every configuration dimension. It does not add runtime code.
- **Modules.** A module is a configuration choice that brings its dependencies, environment variables, config files and application code (for example `src/modules/billing/`). Modules depend on each other only through rules listed in the [configuration model](/docs/configuration-model#rules).
- **Frameworks.** Application code calls frameworks directly. B7 conventions decide where that code lives, not how the framework is called.
- **Services.** Each external service sits behind the module that uses it. Only the billing module has a provider interface, because it has two real implementations. Email uses a single function seam so the provider can be replaced.
- **Infrastructure.** Each profile has one default deployment target. The deployment target is a configuration dimension, not an assumption baked into application code.

## Boundaries

| Boundary | Rule |
|----------|------|
| Client ↔ server | Typed procedures (oRPC) or server functions (TanStack Start). Validation always happens on the server, and client validation is only for UX. |
| Public HTTP ↔ application | One router per deployable: TanStack Start server routes in Fullstack, and Hono in B7 API (TS). OpenAPI describes public REST APIs. |
| Application ↔ database | One data-access layer per project: Drizzle (TS) or SQLC (Go). Tenant scoping is enforced in it. No raw SQL scattered across handlers. |
| Application ↔ external providers | Webhooks enter through verified endpoints. Outgoing calls go through the owning module only. |
| Request ↔ background work | Slow or retryable work moves to Cloudflare Queues (Workers) or a worker process (containers). It never runs on the request path. |
| Product ↔ ML | B7 Intelligence services expose HTTP or ONNX artifacts. Web profiles never import Python. |

## How profiles relate

Profiles are independent. They share standards and the configuration model, not code.

- **Web** and **Fullstack** both use TanStack Start. Fullstack adds oRPC, Better Auth, PostgreSQL and SaaS modules, and fixes the deployment target to Docker Compose ([ADR-013](/docs/technology-decisions#adr-013-docker-compose-replaces-cloudflare-workers-as-the-fullstack-target)). Hono is not used in Fullstack ([ADR-002](/docs/technology-decisions#adr-002-tanstack-start-owns-all-http-routing-and-hono-is-removed-from-fullstack-a1)).
- **API** is the profile for a backend that must stand alone, either because it is not tied to a B7 frontend or because it needs Go. A Fullstack product that later needs a separate service can add one built on the API profile.
- **Systems** and **Intelligence** do not depend on the web stack. Intelligence models can be exported to ONNX and run inside API or Systems services where ONNX Runtime supports the platform.

## Deployment shapes

| Shape | Profiles | Notes |
|-------|----------|-------|
| One Cloudflare Worker | Web, API (TS) | Static assets and server code are deployed together. Bindings give access to platform services. |
| Container (Docker) | API (TS or Go), Web (on Node.js), Intelligence | Runs on any Linux host. Docker Compose for local dependencies. |
| Single binary | Systems, API (Go) | Distribute through GitHub Releases. Docker is optional. |

## Scaling stance

Start as one deployable unit with clear internal modules. Extract a service only when a module needs a different runtime (Python ML, a Go hot path), scales independently, or belongs to a separate team. The extracted service uses the profile that fits it, usually [B7 API](/docs/stacks/api).
