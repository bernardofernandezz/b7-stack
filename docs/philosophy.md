# Philosophy

## Why B7 exists

Starting a project means making dozens of decisions before you write any product code: runtime, router, data layer, auth, deployment, observability. Most of these choices are not unique to the product, yet getting them wrong is expensive later. B7 makes these decisions once, explains them, and lets you override any of them.

## What B7 is

- **Curated choices.** A small set of technologies that work well together and that we have checked against official docs.
- **Conventions.** Where code lives, which layer owns which responsibility, how tenants are isolated, how webhooks are processed.
- **Profiles.** Five starting points for different kinds of software. See the [README](../README.md#the-five-profiles).
- **A configuration model.** Independent, composable choices with explicit dependencies. See the [configuration model](configuration-model.md).
- **Eventually, a generator.** `create-b7` will turn a configuration into a project. See [cli](../cli/README.md).

## What B7 is not

- **Not a framework.** B7 adds no runtime layer between you and React, Hono, Go or PyTorch. Generated code uses those libraries directly.
- **Not a dependency bundle.** Nothing is installed unless the configuration selects it.
- **Not a microservices starter.** The defaults are a single deployable unit per product and a modular monolith inside it.
- **Not vendor-neutral at any cost.** Some defaults, such as Cloudflare Workers for B7 Fullstack, create lock-in. We accept that where it pays off and document the cost in [technology decisions](technology-decisions.md).

## Relationship to T3 Stack

T3 showed that a small, opinionated, type-safe stack with a generator beats a blank page. B7 keeps that idea and changes three things:

1. **More than one profile.** It covers APIs in Go, systems tooling and ML in Python, not only TypeScript web apps.
2. **Different core technologies.** It uses TanStack Start, Hono, oRPC and Cloudflare Workers.
3. **SaaS building blocks.** It documents organizations, billing, webhooks and background jobs as optional modules.
