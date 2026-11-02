# B7 Stack

**The open-source SaaS starter with organizations, Stripe and deploy that you can keep updating.**

B7 generates a production SaaS foundation (TanStack Start, oRPC, Better Auth, PostgreSQL + Drizzle, Docker Compose behind Caddy) with the parts paid boilerplates charge for: organizations with tenant isolation, Stripe billing with verified webhooks and reconciliation, and email flows, each backed by an acceptance test. It is **not** a framework: you own every line, and `b7.json` records what was generated so the project can keep receiving updates ([strategy](STRATEGY.md)).

```sh
npm create b7@preview my-app                                             # asks for the options
npm create b7@preview my-app -- --organizations --billing stripe         # B2B SaaS
```

> Status: **v0.2 preview.** `create-b7` generates the B7 Fullstack reference implementation ([templates/fullstack](templates/fullstack/README.md)), with the options `--email resend|none`, `--organizations` and `--billing stripe|none`. The generated project runs locally and as a Docker Compose stack (PostgreSQL, migrations, app, Caddy), but it is **not production-ready** until the [release checklist](RELEASE.md) reaches 1.0. Other profiles are documented, not yet generated. Pending maintainer decisions are listed in [architecture-review.md](architecture-review.md#decisions-requiring-maintainer-approval), and milestones are in [ROADMAP.md](ROADMAP.md).

## Principles

**Simplicity First · Performance Matters · Explicit Architecture · Developer Experience · Production Ready.**
See [philosophy](site/content/docs/philosophy.md) for why B7 exists and [principles](site/content/docs/principles.md) for the decision rules that follow from them.

## The seven pillars

Each pillar lists **defaults** (what B7 picks unless told otherwise), **optional** integrations (added only when selected) and **alternatives** (supported, not preferred). Rationale is in [technology decisions](site/content/docs/technology-decisions.md).

| # | Pillar | Default | Optional | Alternative |
|---|--------|---------|----------|-------------|
| 1 | Languages & Runtime | TypeScript, Node.js (LTS), pnpm | Go, Python | Bun runtime |
| 2 | Frontend | React, TanStack Start, TanStack Router | TanStack Query | — |
| 3 | Backend | TanStack Start server routes + oRPC (Fullstack), Hono + oRPC (API, TS), `net/http` (Go) | OpenAPI | — |
| 4 | Data | PostgreSQL, Drizzle + `pg` (TS), SQLC (Go), Hyperdrive on Workers | SQLite (Go) | D1 and Redis: deferred |
| 5 | UI & Design | Tailwind CSS, Base UI, Lucide | — | — |
| 6 | Infrastructure | Docker, Docker Compose, Caddy, GitHub Actions, Linux | Cloudflare Workers (Web, API), S3-compatible storage, job queue, scheduler, Turnstile, OpenTelemetry | KV, Durable Objects: deferred |
| 7 | Intelligence | Python, PyTorch, scikit-learn | ONNX Runtime, Hugging Face | — |

## Profiles

**B7 Fullstack** is the profile `create-b7` generates: SaaS products and startups. One TanStack Start + oRPC app with two targets, Docker Compose behind Caddy (the default) or serverless through Nitro presets with a managed PostgreSQL. Better Auth, PostgreSQL + Drizzle, TypeScript only ([stacks/fullstack](site/content/docs/stacks/fullstack/index.md)).

**Later.** The other profiles are documented, and their templates wait for Fullstack 1.0 ([strategy](STRATEGY.md#the-bet)):

| Profile | For | Core | Docs |
|---------|-----|------|------|
| **B7 Web** | React web apps, including SSR apps with integrated server logic | TanStack Start, Tailwind, Base UI, Node.js | [stacks/web](site/content/docs/stacks/web/index.md) |
| **B7 API** | Standalone APIs, services, integrations | TypeScript (Hono + oRPC + Zod) **or** Go (`net/http` + SQLC) | [stacks/api](site/content/docs/stacks/api/index.md) |
| **B7 Systems** | CLIs, networking, automation, dev tools | Go, SQLite when needed | [stacks/systems](site/content/docs/stacks/systems/index.md) |
| **B7 Intelligence** | ML, AI, data processing, scientific computing | Python, PyTorch, scikit-learn, ONNX Runtime | [stacks/intelligence](site/content/docs/stacks/intelligence/index.md) |

## How configuration works

A project is a **profile** plus a set of independent **choices**: language, backend strategy, database, auth, billing provider, email, storage, jobs, testing, observability and so on. Each choice:

- has a default per profile, or is off by default,
- installs **only** its own dependencies and configuration (choosing Stripe never installs AbacatePay, and choosing no auth never installs Better Auth),
- declares the environment variables and external services it needs,
- may require other choices (for example, organizations require email), and values that can be inferred are derived rather than chosen. B7 Fullstack never offers Go.

The full model, the allowed values per profile and example configurations are in [site/content/docs/configuration-model.md](site/content/docs/configuration-model.md).

## Documentation map

The documentation is also a website ([site/](site/README.md), built with Fumadocs): run `pnpm dev` in `site/`.

| Topic | Document |
|-------|----------|
| Where B7 is going and why | [STRATEGY.md](STRATEGY.md) |
| Why B7 exists | [site/content/docs/philosophy.md](site/content/docs/philosophy.md) |
| Decision rules | [site/content/docs/principles.md](site/content/docs/principles.md) |
| Ecosystem architecture and boundaries | [site/content/docs/architecture.md](site/content/docs/architecture.md) |
| Configuration model and compatibility | [site/content/docs/configuration-model.md](site/content/docs/configuration-model.md) |
| Why each technology was chosen | [site/content/docs/technology-decisions.md](site/content/docs/technology-decisions.md) |
| Engineering standards | [code quality](site/content/docs/standards/code-quality.md) · [security](site/content/docs/standards/security.md) · [testing](site/content/docs/standards/testing.md) · [observability](site/content/docs/standards/observability.md) |
| SaaS profile in depth | [stacks/fullstack/](site/content/docs/stacks/fullstack/index.md) |
| Fullstack reference implementation | [templates/fullstack/](templates/fullstack/README.md) |
| Architecture review, tests and blockers | [architecture-review.md](architecture-review.md) |
| Milestones | [ROADMAP.md](ROADMAP.md) |
| Release checklist and changelog | [RELEASE.md](RELEASE.md) · [CHANGELOG.md](CHANGELOG.md) |
| Generator (`create-b7`) | [cli/README.md](cli/README.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |

## License

[MIT](LICENSE)
