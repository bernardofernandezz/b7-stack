# Changelog

All notable changes to B7 are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

**Rule:** every task completed from [RELEASE.md](RELEASE.md) adds one line under `[Unreleased]` in the same commit, with the task number, for example `- Password reset in the Fullstack template (3.1)`.

## [Unreleased]

### Added
- Release checklist (`RELEASE.md`) and this changelog.

### Changed

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
