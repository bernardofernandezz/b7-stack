# Technology Decisions

Each entry gives the reason for the choice, the alternatives considered, and the trade-off we accept. The status of each technology (default, optional or alternative) is set in the [README pillars table](../README.md#the-seven-pillars). Valid combinations are defined in the [configuration model](configuration-model.md).

## Languages & Runtime

### TypeScript
**Why:** types that run from database to UI in one language, and the largest ecosystem for web work.
**Trade-off:** types disappear at runtime, so every boundary still needs schema validation (Zod).

### Bun
**Why:** a fast package manager, test runner and runtime in one tool, with Web-standard APIs that match the Workers runtime.
**Alternatives:** Node.js with pnpm. Fully supported as a runtime when a dependency needs Node-specific behavior.
**Trade-off:** Bun's Node compatibility is broad but not complete. On Workers, Bun is only the local tool (install, scripts). Production runs the Workers runtime, not Bun.

### Go
**Why:** a single static binary, excellent concurrency, and a strong standard library (`net/http`, `database/sql`, `testing`). It is the default for Systems and an option for API.
**Trade-off:** types are not shared with a TypeScript frontend. Use OpenAPI to generate clients when that matters.

### Python
**Why:** the ML ecosystem (PyTorch, scikit-learn, Hugging Face) has no real substitute. Kept to the Intelligence profile.

## Frontend

### React + TanStack Start + TanStack Router
**Why:** type-safe file-based routing, SSR and streaming, and server functions without a separate API process. Start officially supports Cloudflare Workers through `@cloudflare/vite-plugin` ([Cloudflare guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)).
**Alternatives:** Next.js. It is mature and widely used, but its feature set is tied to its own server model and Vercel-optimized defaults, and B7 wants routing and data loading that stay framework-explicit and portable to Workers. React Router (framework mode) is a reasonable alternative that B7 does not curate.
**Trade-off:** Start is younger than Next.js. Expect API changes, and follow the official docs closely.

### TanStack Query
**Why:** handles server-state caching, retries and invalidation, and has first-class oRPC integration (`@orpc/tanstack-query`). Optional: route loaders are often enough.

## Backend

### Hono
**Why:** a small router built on Web standards (`Request`/`Response`) that runs unchanged on Workers, Bun and Node. Better Auth and oRPC both mount into it without adapters.
**Alternatives:** Elysia (Bun-centric, so a weaker fit for Workers), Express and Fastify (Node-centric).

### oRPC
**Why:** end-to-end type-safe procedures with Zod validation, typed errors and **built-in OpenAPI generation**. That gives one contract for both internal clients and public REST docs. It integrates with Hono through its Fetch adapter and has an official TanStack Start integration.
**Alternatives:** tRPC (no first-class OpenAPI), ts-rest (contract-first and more verbose).
**Trade-off:** a smaller community than tRPC.

### Go `net/http`
**Why:** routing in the standard library (method and path patterns) covers most APIs with zero dependencies.
**Alternatives:** chi or echo, when middleware ecosystems justify them.

### OpenAPI
**Why:** the lingua franca for public APIs and client generation. Used only for public REST surfaces, never as a requirement for internal calls.

## Data

### PostgreSQL
**Why:** a reliable relational default with strong constraints, transactions and JSON support, and many managed hosts (including free tiers). No vendor lock-in.

### Drizzle
**Why:** SQL-shaped, type-safe queries with no code generation step, and it runs on Workers. Supports PostgreSQL, D1 and SQLite.
**Constraint:** over Hyperdrive, use the `pg` (node-postgres) driver. Cloudflare documents that Postgres.js with Drizzle over Hyperdrive is not supported ([Hyperdrive + Drizzle](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/)).
**Alternatives:** Prisma, which is heavier and needs a generation step plus edge-specific setup. Kysely, a query builder without schema-as-code.

### SQLC
**Why:** for Go, you write SQL and get type-safe code. No ORM runtime.

### SQLite and Cloudflare D1
**Why:** SQLite for local, embedded and CLI persistence. D1 for Workers apps whose data fits a single SQLite database.
**Trade-off:** D1 is Cloudflare-only. Moving off it means migrating data and drivers.

### Redis
**Status:** not a configuration option. Add it only with a documented reason, such as rate limiting or pub/sub across container replicas. On Workers, Cloudflare KV, Durable Objects and Queues cover the usual Redis use cases.

## UI & Design

### Tailwind CSS
**Why:** utility-first styling with no runtime cost. Design tokens live in CSS.

### Base UI
**Why:** unstyled, accessible React primitives that pair with Tailwind without fighting a theme system.
**Alternatives:** Radix UI (similar scope), shadcn/ui (copy-paste components built on these primitives; compatible with the B7 UI choices).

### Lucide
**Why:** a consistent, tree-shakable icon set.

## Infrastructure

### Cloudflare Workers
**Why:** global deployment without servers to manage, a generous free tier, and integrated services (Hyperdrive, D1, R2, Queues, Cron, KV, Durable Objects, Turnstile) reached through bindings with no network credentials to manage.
**Trade-off (lock-in):** bindings, the server entry shape and Wrangler config are Cloudflare-specific. B7 limits this by keeping application logic on Web standards (Hono, `fetch`, Web Crypto) and keeping bindings in the infrastructure and module layers. A move to containers means swapping bindings for network clients (for example, R2 to S3, Queues to a broker, Hyperdrive to a direct pool). Workers also impose runtime limits; see [fullstack infrastructure](../stacks/fullstack/infrastructure.md#workers-runtime-constraints).

### Docker / Docker Compose
**Why:** the portable deployment unit for non-Workers profiles. Compose runs local dependencies such as PostgreSQL.

### GitHub Actions
**Why:** CI/CD next to the code, with official Wrangler deploy support.

### OpenTelemetry
**Why:** vendor-neutral traces and metrics for container deployments. On Workers, use Workers Observability first.

## Authentication & SaaS services

### Better Auth
**Why:** a self-hosted TypeScript auth library that stores data in your own database through Drizzle. It provides email/password, OAuth, passkeys, organizations, invitations and access control as plugins. It runs on Workers with `nodejs_compat`.
**Alternatives:** Clerk or Auth0 (hosted, paid at scale, user data off-platform), Lucia (deprecated as a library).
**Trade-off:** you operate auth tables and security updates yourself.

### Stripe
**Why:** the international default, with a mature subscription model (trials, proration, dunning, customer portal).
**Trade-off:** paid per transaction. The subscription model is rich, and B7 maps only what the billing module needs.

### AbacatePay
**Why:** Brazilian payments (PIX, cards) with a simple API and subscription webhooks (API v2).
**Trade-off:** a smaller feature surface than Stripe. Capability gaps are listed in [billing](../stacks/fullstack/billing.md#provider-capabilities).

### Resend
**Why:** a simple transactional email API that is Workers-compatible ([Resend on Workers](https://resend.com/docs/send-with-cloudflare-workers)).
**Replaceability:** all sending goes through one function, `sendEmail()`, so changing provider changes one file.

### Sentry
**Why:** optional error tracking with an official Cloudflare SDK. Not required, because Workers Observability covers logs and traces without it.

## Testing

### Vitest and Playwright
**Why:** Vitest shares Vite config with TanStack Start and runs inside the Workers runtime with `@cloudflare/vitest-pool-workers`. Playwright handles cross-browser E2E tests.

## Intelligence

### PyTorch, scikit-learn, ONNX Runtime, Hugging Face
**Why:** PyTorch for deep learning, scikit-learn for classical ML, Hugging Face for pretrained models and datasets, and ONNX Runtime to serve exported models fast and in other languages.
