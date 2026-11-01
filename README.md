# B7 Stack

B7 is an opinionated, modular ecosystem for building modern software. It is a set of curated technology choices, architectural conventions and configurable project profiles. It is **not** a framework and not a mandatory bundle of dependencies.

B7 tries to make good architectural decisions easy, without hiding complexity behind new abstractions. It follows the spirit of [T3 Stack](https://create.t3.gg/) but covers more than one kind of project: web apps, APIs, system tools, machine learning and SaaS products.

```sh
npm create b7@latest my-app
```

> Status: **v0.2 preview.** `create-b7` generates the B7 Fullstack reference implementation ([templates/fullstack](templates/fullstack/README.md)). It runs locally and builds for Workers, but it is **not production-ready** until the [release blockers](architecture-review.md#release-blockers) pass on a deployed Worker. Other profiles are documented, not yet generated. Pending maintainer decisions are listed in [architecture-review.md](architecture-review.md#decisions-requiring-maintainer-approval), and milestones are in [ROADMAP.md](ROADMAP.md).

## Principles

**Simplicity First · Performance Matters · Explicit Architecture · Developer Experience · Production Ready.**
See [philosophy](docs/philosophy.md) for why B7 exists and [principles](docs/principles.md) for the decision rules that follow from them.

## The seven pillars

Each pillar lists **defaults** (what B7 picks unless told otherwise), **optional** integrations (added only when selected) and **alternatives** (supported, not preferred). Rationale is in [technology decisions](docs/technology-decisions.md).

| # | Pillar | Default | Optional | Alternative |
|---|--------|---------|----------|-------------|
| 1 | Languages & Runtime | TypeScript, Node.js (LTS), pnpm | Go, Python | Bun runtime |
| 2 | Frontend | React, TanStack Start, TanStack Router | TanStack Query | — |
| 3 | Backend | TanStack Start server routes + oRPC (Fullstack), Hono + oRPC (API, TS), `net/http` (Go) | OpenAPI | — |
| 4 | Data | PostgreSQL, Drizzle + `pg` (TS), SQLC (Go), Hyperdrive on Workers | SQLite (Go) | D1 and Redis: deferred |
| 5 | UI & Design | Tailwind CSS, Base UI, Lucide | — | — |
| 6 | Infrastructure | Cloudflare Workers, Docker, GitHub Actions, Linux | Docker Compose, R2, Queues, Cron, Turnstile, OpenTelemetry | KV, Durable Objects: deferred |
| 7 | Intelligence | Python, PyTorch, scikit-learn | ONNX Runtime, Hugging Face | — |

## The five profiles

A profile is a starting point with its own defaults and compatibility rules. It is not a fixed template.

| Profile | For | Core | Docs |
|---------|-----|------|------|
| **B7 Web** | React web apps, including SSR apps with integrated server logic | TanStack Start, Tailwind, Base UI, Node.js | [stacks/web](stacks/web/README.md) |
| **B7 API** | Standalone APIs, services, integrations | TypeScript (Hono + oRPC + Zod) **or** Go (`net/http` + SQLC) | [stacks/api](stacks/api/README.md) |
| **B7 Systems** | CLIs, networking, automation, dev tools | Go, SQLite when needed | [stacks/systems](stacks/systems/README.md) |
| **B7 Intelligence** | ML, AI, data processing, scientific computing | Python, PyTorch, scikit-learn, ONNX Runtime | [stacks/intelligence](stacks/intelligence/README.md) |
| **B7 Fullstack** | SaaS products and startups | TanStack Start + oRPC in one Cloudflare Worker, Better Auth, PostgreSQL + Drizzle + Hyperdrive. TypeScript only. | [stacks/fullstack](stacks/fullstack/README.md) |

## How configuration works

A project is a **profile** plus a set of independent **choices**: language, backend strategy, database, auth, billing provider, email, storage, jobs, testing, observability and so on. Each choice:

- has a default per profile, or is off by default,
- installs **only** its own dependencies and configuration (choosing Stripe never installs AbacatePay, and choosing no auth never installs Better Auth),
- declares the environment variables and external services it needs,
- may require other choices (for example, organizations require email), and values that can be inferred are derived rather than chosen. B7 Fullstack never offers Go.

The full model, the allowed values per profile and example configurations are in [docs/configuration-model.md](docs/configuration-model.md).

## Documentation map

| Topic | Document |
|-------|----------|
| Why B7 exists | [docs/philosophy.md](docs/philosophy.md) |
| Decision rules | [docs/principles.md](docs/principles.md) |
| Ecosystem architecture and boundaries | [docs/architecture.md](docs/architecture.md) |
| Configuration model and compatibility | [docs/configuration-model.md](docs/configuration-model.md) |
| Why each technology was chosen | [docs/technology-decisions.md](docs/technology-decisions.md) |
| Engineering standards | [code quality](docs/standards/code-quality.md) · [security](docs/standards/security.md) · [testing](docs/standards/testing.md) · [observability](docs/standards/observability.md) |
| SaaS profile in depth | [stacks/fullstack/](stacks/fullstack/README.md) |
| Fullstack reference implementation | [templates/fullstack/](templates/fullstack/README.md) |
| Architecture review, tests and blockers | [architecture-review.md](architecture-review.md) |
| Milestones | [ROADMAP.md](ROADMAP.md) |
| Generator (`create-b7`) | [cli/README.md](cli/README.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |

## License

[MIT](LICENSE)
# b7-stack
