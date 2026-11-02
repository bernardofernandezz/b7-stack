# Roadmap

Milestones are ordered by **risk reduction**, not by feature count. Each one ends when its acceptance tests (defined in [architecture-review.md](architecture-review.md#required-acceptance-tests)) pass against a deployed Compose stack on a public host. Later milestones do not start until the earlier ones are green. The executable task list is [RELEASE.md](RELEASE.md), and finished work is recorded in [CHANGELOG.md](CHANGELOG.md).

## M0: Architecture approval (done 2026-11-01)
- The maintainer approved A1–A11 and A13 ([list](architecture-review.md#decisions-requiring-maintainer-approval)).
- **Exit:** the docs no longer say "proposed".

**Current state (2026-11-01).** [templates/fullstack](templates/fullstack/README.md) implements the code of M1–M3 (Compose stack, email + password, organizations, Stripe billing) and M6's options, and every acceptance test that can run locally passes ([verification status](templates/fullstack/README.md#verification-status)). What blocks the exits is operational, not code: a public host, Stripe test-mode keys and a Resend domain ([RELEASE.md](RELEASE.md) 2.2, 5.3, 5.5). No milestone exits until its tests pass on that host.

## M1: Composition spike (highest risk)
A throwaway spike, not the reference implementation.
- TanStack Start on Node.js in Docker Compose, with `src/start.ts` request middleware, `/api/auth/$`, `/api/rpc/$` and Caddy in front ([ADR-013](site/content/docs/technology-decisions.md#adr-013-docker-compose-replaces-cloudflare-workers-as-the-fullstack-target)).
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
- Clean the M1–M3 code into the template for configuration 2 in the [configuration model](site/content/docs/configuration-model.md#representative-configurations): organizations, Resend and Stripe.
- CI: check, migrate, deploy, smoke test.
- **Exit:** all release blockers 1–5 and 7 are met. Only then may the template be called production-ready.

## M5: AbacatePay (leaves EXPERIMENTAL only on success)
- Capture real payloads (A-T3), build the adapter, and run A-T1…A-T3 plus B-T1…B-T6 against AbacatePay.

## M6: Configurable `create-b7`
- A schema for [the configuration model](site/content/docs/configuration-model.md) with one test per rule, then options and `b7 add` in the CLI from M1.5.

## M7: Fullstack targets ([ADR-015](site/content/docs/technology-decisions.md#adr-015-fullstack-offers-two-targets-from-one-tanstack-start-app), proposed)
- Approve ADR-015, then add `--target serverless` to the same app: a Nitro preset in `vite.config.ts`, managed PostgreSQL, platform cron, and no Compose files. The `docker` target stays the layout generated today.
- CI generates and checks both targets: the Compose E2E for `docker`, a Nitro build plus E2E against a preview deployment for `serverless`.
- Comes **before** M8: the file layout is frozen once projects can run `b7 update`.
- **Exit:** every Fullstack acceptance test passes on both targets.

## M8: Upgrade path ([strategy](STRATEGY.md#p0-the-upgrade-path))
- `b7 update`: three-way merge of template changes into a generated project, per file and feature region, driven by `b7.json`.
- `b7 add <option>` for existing projects. Codemods and an upgrade guide for each breaking change.
- B7 Bot v1: a GitHub Action that runs `b7 update` daily and opens the PR; the GitHub App follows after launch. A public upgrade log per release.
- **Exit:** in CI, a project generated at release N updates to N+1 with zero manual edits, and its checks and E2E pass.

## M9: First deploy in ten minutes
- Deploy buttons for both targets (Vercel + Neon first, free), a public live demo (organizations + Stripe test mode), and a `create-b7` that ends with the app running.
- **Exit:** a new user reaches a deployed app with organizations and Stripe test mode in under ten minutes.

## M10: Agent-native
- `AGENTS.md` and `CLAUDE.md` in generated projects, a B7 MCP server or skill, and an agent eval suite (tenant-scoped feature without breaking isolation).
- **Exit:** the evals pass on two agents in CI.

## M10.5: Product UI and social sign-in ([strategy](STRATEGY.md#p0-the-first-impression))
- Landing, pricing, dashboard, account and organization settings, members and invitations, and billing screens built on Base UI and Tailwind, plus finished email templates.
- Google and GitHub sign-in and magic links through Better Auth.
- **Exit:** the public demo shows every screen, and the E2E suite covers sign-in with a faked OAuth provider.

## M11: Public launch
- Gated on M4, M7, M8, M9, M10 and M10.5. Comparison pages, launch posts, in English first; pt-BR docs and AbacatePay are the second wave ([distribution](STRATEGY.md#distribution)).
- **Exit:** launched, and the north-star metric (projects on a supported version after 90 days) is tracked through the `b7.json` count ([strategy](STRATEGY.md#the-goal-and-how-we-measure-it)).

## Later (unscheduled; each needs a documented requirement)
Optional R2, Queues, Turnstile, Sentry and `publicApi` modules. Templates for the other profiles, **only after Fullstack 1.0** ([strategy](STRATEGY.md#the-bet)). Revisiting deferred items: passkeys, teams, Stripe thin events, and auth for Web and API.
