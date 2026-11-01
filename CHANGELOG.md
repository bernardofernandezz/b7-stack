# Changelog

All notable changes to B7 are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

**Rule:** every task completed from [RELEASE.md](RELEASE.md) adds one line under `[Unreleased]` in the same commit, with the task number, for example `- Password reset in the Fullstack template (3.1)`.

## [Unreleased]

### Added
- Release checklist (`RELEASE.md`) and this changelog.
- Docker target for B7 Fullstack: a multi-target `Dockerfile` (`migrate`, `runtime`), `compose.yaml` (`postgres` → `migrate` → `app` → `caddy`) and a `Caddyfile` with automatic HTTPS for a public `APP_URL` (2.1).
- CI runs the generated project's Compose stack and E2E through Caddy (2.1).
- `create-b7 --help` and `--version`; a clear message when pnpm is missing (0.2).
- The `create-b7` package ships `LICENSE` and has `keywords`, `homepage` and `bugs` (0.3).
- Password reset in the Fullstack template: `/forgot-password`, `/reset-password`, a reset email, single-use tokens, and every session revoked on reset (3.1).
- Sign-in requires a verified email address; the verification link signs the user in, and an unverified sign-in re-sends it (3.2).
- The root route reads the session from the TanStack Query cache, so client navigation makes no session request; sign-in and sign-out clear the cache (3.3).
- Documented why Kysely's SQLite dialects stay in the build: they are lazy chunks that never load (3.5).
- ADR-014: options compose by removing feature regions from a complete template (4.1).
- `create-b7` validates configurations against rules 1–4 (errors name the rule) and applies feature regions; templates declare their options in `b7.features.json` (4.2).
- `create-b7 --email resend|none` (and prompts): a smaller configuration drops files, dependencies and regions, then gets a fresh migration, route tree, lockfile and formatting. The default email option is `resend` (4.3).
- CI generates each representative configuration and runs its checks and Compose E2E (4.4, partial).
- `create-b7 --organizations`: Better Auth organizations with owner/admin/member roles, invitations by email, `/organization` and `/accept-invitation/$id` pages, and notes scoped to the active organization; membership is read from the database on every call (5.1).
- `create-b7 --billing stripe`: Stripe Checkout and customer portal, a verified webhook route with an inbox, per-subscription row locks and state fetched from Stripe, derived entitlements (the free plan keeps 20 notes), and a `scheduler` service that runs reconciliation daily through `/api/internal/reconcile` (5.2).
- The CI matrix covers configuration 2 (organizations + email + Stripe) and each option on its own (4.4).

### Changed
- The template's migrations are squashed into one `0000_init` (nothing was deployed yet) (5.1).
- Through Caddy, CI runs only the smoke, notes and navigation E2E flows, because auth rate limits are real there; the full suite runs against the dev server (5.1).
- **Breaking:** B7 Fullstack runs on Node.js in Docker Compose instead of Cloudflare Workers (ADR-013). Hyperdrive, Wrangler and the Workers test pool are removed; the app keeps one `pg` pool and one Better Auth instance per process, and srvx serves the build (2.1).
- `create-b7` writes `.env` (with generated `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD`) instead of `.dev.vars` (2.1).
- Auth rate limiting reads the client IP from `X-Forwarded-For`, which only Caddy sets; the origin check is explicitly on, so tests exercise it (2.1).
- Architecture review: Workers-only tests marked obsolete, new Compose tests C-T1…C-T3, release blockers updated (2.1).

### Fixed

## [0.2.0-preview.0] - not yet published

### Added
- `create-b7` CLI preview: `npm create b7 my-app`, with `--template`/`-t`, `--yes`, `--no-install` and `--no-git`. It generates `.dev.vars` with a `BETTER_AUTH_SECRET`, runs `git init` and `pnpm install`.
- Templates are discovered from `templates/`, and each carries its own `b7.json`.
- `templates/fullstack`: B7 Fullstack reference implementation (TanStack Start, oRPC + Zod, Better Auth email + password, PostgreSQL + Drizzle + Hyperdrive, Tailwind + Base UI + Lucide, Workers, Resend), with a provider-neutral billing contract. Tested locally only.
- CI workflow that packs the CLI, generates a project and runs its typecheck, lint, tests, build and E2E.
- `ROADMAP.md` with risk-ordered milestones.

### Changed
- Architecture review v0.2: TanStack Start server routes own all HTTP (Hono removed from Fullstack), oRPC is the only app transport, PostgreSQL only, one cache-disabled Hyperdrive binding, Stripe is the billing reference and AbacatePay is EXPERIMENTAL, billing uses state sync with an inbox and row lock. These decisions are proposed, pending maintainer approval.
- Configuration model reduced to a profile plus profile-specific options.

## [0.1.0] - 2026-10-31

### Added
- Documentation-first release: philosophy, principles, architecture and technology decisions.
- Modular configuration model and compatibility rules.
- Engineering standards: code quality, security, testing and observability.
- Profiles: Web, API, Systems, Intelligence, and Fullstack (architecture, authentication, billing, infrastructure).
- v0.1 architecture review with findings and release blockers.
- MIT license and contributing guide.
