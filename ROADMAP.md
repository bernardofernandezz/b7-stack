# Roadmap

Milestones are ordered by **risk reduction**, not by feature count. Each one ends when its acceptance tests (defined in [architecture-review.md](architecture-review.md#required-acceptance-tests)) pass against a deployed Worker. Later milestones do not start until the earlier ones are green. The executable task list is [RELEASE.md](RELEASE.md), and finished work is recorded in [CHANGELOG.md](CHANGELOG.md).

## M0: Architecture approval (done 2026-11-01)
- The maintainer approved A1–A11 and A13 ([list](architecture-review.md#decisions-requiring-maintainer-approval)).
- **Exit:** the docs no longer say "proposed".

**Current state (2026-10-31).** [templates/fullstack](templates/fullstack/README.md) implements M1's composition (without the webhook route and `src/server.ts`, which arrive with billing), M2's email + password and Resend parts (organizations not yet), the provider-neutral M3 billing contract (no adapter), and CI. Its [verification status](templates/fullstack/README.md#verification-status) lists what passed locally. No milestone exits until its tests pass on a deployed Worker.

## M1: Composition spike (highest risk)
A throwaway Worker, not the reference implementation.
- TanStack Start on Node.js in Docker Compose, with `src/start.ts` request middleware, `/api/auth/$`, `/api/rpc/$` and Caddy in front ([ADR-013](docs/technology-decisions.md#adr-013-docker-compose-replaces-cloudflare-workers-as-the-fullstack-target)).
- PostgreSQL with one process-wide `pg` pool. Done in Compose; a public host remains (see [RELEASE.md](RELEASE.md)).
- **Exit:** T-T1…T-T5, D-T1, D-T2, BA-T1, W-1, W-2. Decide A12.

## M1.5: `create-b7` preview
- A CLI that generates `templates/fullstack` (one configuration), writes `b7.json` and is checked in CI by generating a project and running its checks. Done: [cli/](cli/README.md).
- **Exit:** published to npm as a preview after M1's deployed smoke test passes.

## M2: Identity and tenancy
- Better Auth email + password with database sessions and database rate limiting.
- Organizations plugin, the `requireSession` → `requireMembership` → `requirePermission` chain, and one tenant-scoped domain module.
- Resend for verification and invitations.
- **Exit:** H-T1, H-T2, BA-T2, M-T1…M-T4.

## M3: Billing with Stripe
- Billing domain, the Stripe adapter, webhook route, inbox, row-lock sync, derived entitlements, and the reconciliation cron.
- **Exit:** S-T1…S-T3, B-T1…B-T6.

## M4: Reference implementation `templates/fullstack`
- Clean the M1–M3 code into the template for configuration 2 in the [configuration model](docs/configuration-model.md#representative-configurations): organizations, Resend and Stripe.
- CI: check, migrate, deploy, smoke test.
- **Exit:** all release blockers 1–5 and 7 are met. Only then may the template be called production-ready.

## M5: AbacatePay (leaves EXPERIMENTAL only on success)
- Capture real payloads (A-T3), build the adapter, and run A-T1…A-T3 plus B-T1…B-T6 against AbacatePay.

## M6: Configurable `create-b7`
- A schema for [the configuration model](docs/configuration-model.md) with one test per rule, then options and `b7 add` in the CLI from M1.5.

## Later (unscheduled; each needs a documented requirement)
Optional R2, Queues, Turnstile, Sentry and `publicApi` modules. Templates for the other profiles. Revisiting deferred items: passkeys, teams, Stripe thin events, and auth for Web and API.
