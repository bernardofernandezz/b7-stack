# Release checklist

The executable to-do list for B7 releases. [ROADMAP.md](ROADMAP.md) says *why* and in what order. The specs live in the linked documents, and this file does not repeat them. Every finished task is recorded in [CHANGELOG.md](CHANGELOG.md).

## How to run this file

Written for an agent working through it as a goal, and for humans reviewing progress.

1. **Pick** the first task marked `[ ]` whose dependencies (`needs:`) are all `[x]` and that is not tagged **HUMAN**.
2. **Read** its *Spec* links before writing code.
3. **Implement** it, touching the listed *Files* (and whatever callers, tests and docs the change breaks).
4. **Verify** with its *Done when*. Every task leaves a test or a command that proves it.
5. **Record** in the same commit: change `[ ]` to `[x]` and append the short commit hash after merging the change (`[x] … (abc1234)`, a follow-up amend is fine), and add one line under `## [Unreleased]` in `CHANGELOG.md`.
6. **Commit** with Conventional Commits, one commit per task.

**HUMAN tasks** need an account, a secret, money, an approval or a publication. The agent does not do them. It marks them `[~] blocked: <what is needed>` and moves on to the next independent task. When a human finishes one, they mark it `[x]`.

**Never, without a HUMAN task marked `[x]` that authorizes it:** `git push`, deploying to a public host, `npm publish`, creating paid or external resources, writing real secrets into the repository, or removing the "proposed" label from a decision.

**On failure:** if *Done when* fails twice after a fix attempt, mark the task `[!] failed: <one-line reason>`, leave the work uncommitted or on a branch, and stop.

Status markers: `[ ]` to do · `[x]` done · `[~]` blocked on a human · `[!]` failed, needs attention.

## Release gates

| Release | Means | Requires |
|---------|-------|----------|
| **0.2.0-preview** | `npm create b7` generates the Fullstack template, which runs with `docker compose up`. Explicitly not production-ready | Phases 0–2 |
| **1.0.0** | Production-ready Fullstack with `organizations` and `billing: stripe` as CLI options | Phases 0–5: [release blockers](architecture-review.md#release-blockers) 1–5 and 7 |

AbacatePay, other profiles and the remaining options come after 1.0 ([backlog](#post-10-backlog)).

---

## Phase 0: Hygiene

- [~] **0.1 HUMAN: run CI for the first time.** blocked: needs `git push` and a PR. Push branch `v0.2` and open a PR, so `.github/workflows/cli.yml` runs (checks and the Compose stack of a generated project).
  - *Done when:* the `create-b7` workflow is green. Any failure becomes a new task below this one.
- [x] **0.2 CLI `--help`, `--version` and a missing-pnpm message.** (2fd87a0)
  - *Spec:* [cli/README.md](cli/README.md)
  - *Files:* `cli/index.js`, `cli/test/create.test.js`, `cli/README.md`
  - *Done when:* `node cli/index.js --help` lists every flag and the available templates. `--version` prints `cli/package.json` `version`. When `pnpm` is not on `PATH`, the CLI says how to install it. `pnpm test` in `cli/` covers `--help` and `--version`.
- [x] **0.3 CLI package metadata.** (3401810)
  - *Files:* `cli/package.json`, `cli/scripts/copy-template.js`
  - *Done when:* `npm pack` in `cli/` contains `LICENSE` and `README.md`, and `package.json` has `keywords`, `homepage` and `bugs`.

## Phase 1: Decisions

- [~] **1.1 HUMAN: approve or reject A1–A11 and A13.** blocked: maintainer decision.
  - *Spec:* [architecture-review.md › Decisions requiring maintainer approval](architecture-review.md#decisions-requiring-maintainer-approval)
  - *Done when:* each decision is marked approved or rejected in that table.
- [ ] **1.2 Remove "proposed" from the approved decisions.** needs: 1.1
  - *Files:* every doc that `grep -rli proposed --include=*.md .` lists (README, configuration model, technology decisions, `stacks/fullstack/*`, `ROADMAP.md`, the review). For a rejected decision, restore the earlier text from git history.
  - *Done when:* the grep only matches decisions still pending (none, if all were decided), and M0 in `ROADMAP.md` is marked done.

## Phase 2: Docker target and preview release

- [x] **2.1 Replace Cloudflare Workers with Docker Compose** (maintainer request). (dcd2848)
  - *Spec:* [ADR-013](docs/technology-decisions.md#adr-013-docker-compose-replaces-cloudflare-workers-as-the-fullstack-target), [infrastructure.md](stacks/fullstack/infrastructure.md), [review › Target change](architecture-review.md#target-change-docker-compose-replaces-cloudflare-workers-2026-11-01)
  - *Files:* `templates/fullstack/{Dockerfile,compose.yaml,Caddyfile,.dockerignore,.env.example}`, `src/start.ts`, `src/db/client.ts`, `src/env.ts`, `vite.config.ts`, `vitest.config.ts`, the CLI's `.env` generation, both CI workflows, the Fullstack docs.
  - *Done when:* C-T1 and C-T2 pass for the template and for a project generated from the packed CLI.
- [~] **2.2 HUMAN: a public host.** blocked: needs a server and a domain. A server with Docker, a domain pointing at it, ports 80 and 443 open. Copy a generated project there, set `APP_URL=https://<domain>` in `.env`, run `docker compose up -d --build`.
  - *Done when:* the site answers over HTTPS with a valid certificate.
- [ ] **2.3 Run C-T3 against the public host.** needs: 2.2
  - *Done when:* `BASE_URL=https://<domain> pnpm exec playwright test smoke` is green, cookies carry `Secure`, and the result is a row in the template's [Verification status](templates/fullstack/README.md#verification-status).
- [~] **2.4 HUMAN: publish the preview.** blocked: needs npm credentials and 0.1. needs: 0.1, 0.2, 0.3, 2.1
  - `cd cli && npm publish --tag preview` at version `0.2.0-preview.0`, then `git tag v0.2.0-preview.0`.
  - *Then the agent:* moves the `[Unreleased]` entries into `## [0.2.0-preview.0] - <date>` in `CHANGELOG.md`, and changes the root README install line to `npm create b7@preview`.

## Phase 3: Template improvements

*Spec for all:* [templates/fullstack/README.md › Known limitations](templates/fullstack/README.md#known-limitations). Each task removes its bullet from that list.

- [x] **3.1 Password reset.** (e77dde6)
  - *Spec:* [stacks/fullstack/authentication.md › Sign-in methods](stacks/fullstack/authentication.md#sign-in-methods)
  - *Files:* `templates/fullstack/src/modules/auth/`, a reset route under `src/routes/`, `test/auth.test.ts`, `e2e/`
  - *Done when:* Vitest covers token issue and use (email faked as in `test/email.test.ts`), and an E2E resets a password and signs in with it.
- [x] **3.2 Require email verification when email is configured.** (cce01e6)
  - *Files:* `templates/fullstack/src/modules/auth/`, `test/auth.test.ts`, `e2e/`
  - *Done when:* an unverified user cannot sign in (test), and the E2E flow verifies through the logged email link in dev.
- [x] **3.3 No session RPC on every client navigation.** (c3e9c7a)
  - *Files:* `templates/fullstack/src/routes/__root.tsx`, `src/lib/orpc.ts`
  - *Done when:* the session is read through TanStack Query with a cache, and an E2E asserts that navigating between two pages makes no `/api/rpc` session request after the first.
- [x] **3.4 Fail clearly on a query after the per-request pool closes.** (dcd2848) Obsolete with 2.1: the pool now lives for the whole process, so the limitation no longer exists.
- [x] **3.5 Drop Kysely's unused SQLite dialects from the bundle.** (96d915c) Closed without a code change: on Node.js the dialects are lazy `import()` chunks that never load (about 0.3 MB of a 529 MB image), and aliasing them away could break on Better Auth upgrades.
  - *Files:* `templates/fullstack/vite.config.ts`
  - *Done when:* `dist/server` is smaller than before (1.8 MB uncompressed on 2026-11-01), and all checks stay green. If no safe alias exists, mark `[x]` with the reason and leave the limitation.

## Phase 4: Configurable CLI

- [x] **4.1 ADR: how options compose into a template.** (f2d65e2) Decided: [ADR-014](docs/technology-decisions.md#adr-014-options-compose-by-removing-feature-regions-from-a-complete-template), feature regions removed from a complete template (overlays rejected).
  - *Spec:* [docs/configuration-model.md › Fullstack features](docs/configuration-model.md#fullstack-features-what-each-one-adds), [cli/README.md › Contract](cli/README.md#contract)
  - *Default proposal:* overlay directories `templates/fullstack/+<option>/` copied over the base in a fixed order. `package.json` is deep-merged. `compose.yaml`, `.env.example` and `src/env.ts` are patched at marked insertion points. Overlays are excluded when the base is used as a template.
  - *Files:* `docs/technology-decisions.md`
  - *Done when:* the ADR states the mechanism, the rejected alternatives, and how one overlay is tested on its own.
- [x] **4.2 Configuration schema and rules.** (9731f1f) needs: 4.1. Plain JS validation in `cli/config.js` (no Zod dependency for six options), regions in `cli/regions.js`, options in `templates/fullstack/b7.features.json`.
  - *Spec:* [docs/configuration-model.md › Rules](docs/configuration-model.md#rules) (rules 1–4 for Fullstack)
  - *Files:* `cli/` (schema, validation), `cli/test/`
  - *Done when:* one test per rule, and a violation exits non-zero with the rule number in the message. The template `b7.json` validates.
- [x] **4.3 Option flags and prompts.** (4d26280) needs: 4.2. `--email` is offered now; `--organizations` and `--billing` are accepted by the CLI and rejected by rule 1 until the template supports them (5.1, 5.2).
  - *Files:* `cli/index.js`, `cli/README.md`, `cli/test/`
  - *Done when:* `--organizations`, `--billing <stripe|none>` and `--email <resend|none>` exist with matching prompts. Only options with a tested overlay are offered. The generated `b7.json` records the resolved configuration, including derived values.
- [x] **4.4 CI matrix over representative configurations.** needs: 4.3. The matrix runs configuration 1 (`--email none`), the default, each option alone, and configuration 2 (`--organizations --billing stripe`).
  - *Spec:* [docs/configuration-model.md › Representative configurations](docs/configuration-model.md#representative-configurations)
  - *Files:* `.github/workflows/cli.yml`
  - *Done when:* CI generates configurations 1 and 2 (once their overlays exist) and runs each project's checks.

## Phase 5: Organizations and Stripe (1.0)

- [x] **5.1 `organizations` overlay.** (d3c4472) needs: 4.1. Built as feature regions (ADR-014). M-T4 not needed: B7 never calls `hasPermission`.
  - *Spec:* [stacks/fullstack/authentication.md › With organizations](stacks/fullstack/authentication.md#with-organizations-optional), [Tenant isolation](stacks/fullstack/authentication.md#tenant-isolation)
  - *Files:* `templates/fullstack/+organizations/` (plugin, `requireMembership` and `requirePermission` in `src/rpc/`, `organization_id` on notes, invitations via Resend, migration)
  - *Done when:* H-T2 and M-T1…M-T4 pass locally, and the generated project's checks pass.
- [x] **5.2 `billing: stripe` overlay.** needs: 4.1. S-T1, S-T2, S-T3, B-T1…B-T6 pass locally with Stripe faked at `fetch`. The scheduler calls an internal endpoint instead of running a second build.
  - *Spec:* [stacks/fullstack/billing.md](stacks/fullstack/billing.md) (tables, Stripe mapping, webhook verification, event processing), decisions A8 and A9
  - *Files:* `templates/fullstack/+billing-stripe/` (adapter implementing `BillingProvider` in `src/modules/billing/`, tables and migration, `src/routes/api/webhooks/stripe.ts`, reconciliation in `src/jobs/`, a `scheduler` Compose service)
  - *Done when:* S-T1 and B-T1…B-T6 pass locally (Stripe faked at the HTTP boundary), and the generated project's checks pass.
- [~] **5.3 HUMAN: Stripe test-mode keys and a webhook endpoint** blocked: needs a Stripe account and 2.2. on the public host. needs: 2.2, 5.2
- [ ] **5.4 Deployed billing and load tests.** needs: 5.3
  - *Spec:* S-T2, S-T3, B-T4 in [the acceptance tests](architecture-review.md#required-acceptance-tests)
  - *Done when:* each has a result against the public host in Verification status.
- [ ] **5.4b Replica and load tests on the Compose stack (agent, local).**
  - *Spec:* BA-T2 with `docker compose up --scale app=2`, and D-T2 (sustained load, for example 50 RPS for 10 min) in [the acceptance tests](architecture-review.md#required-acceptance-tests)
  - *Files:* a load script under `templates/fullstack/scripts/`, Verification status
  - *Done when:* rate limits hold across both replicas, and PostgreSQL connections (`pg_stat_activity`) stay flat under load.
- [~] **5.5 HUMAN: send a real email through Resend** blocked: needs a Resend key and a verified domain. from a verified domain (sign-up verification and an organization invitation).
- [ ] **5.6 Declare production-ready.** needs: every task above
  - *Done when:* release blockers 1–5 and 7 are all met, the "Preview" notices in the root README, the template README and `cli/README.md` are replaced, and M1–M4 in `ROADMAP.md` are marked done.
- [ ] **5.7 HUMAN: publish 1.0.0.** needs: 5.6
  - Bump `cli/package.json` to `1.0.0`, `npm publish`, `git tag v1.0.0`. *Then the agent* closes the `## [1.0.0]` section in `CHANGELOG.md`.

---

## Post-1.0 backlog

Not scheduled. Each one needs a documented requirement before it becomes a task ([ROADMAP.md › Later](ROADMAP.md)).

- AbacatePay overlay (M5): capture real payloads first (A-T3), then A-T1…A-T3 and B-T1…B-T6.
- Templates for the Web and API profiles, then Systems and Intelligence.
- Options: `oauthProviders`, `publicApi`, `storage: s3`, `queues`, `turnstile`, `sentry`, `passkeys` (EXPERIMENTAL).
- `b7 add <option>` for existing projects, reading `b7.json`.
- A web configurator like better-t-stack.dev that outputs the `npm create b7` command.
- CLI tested on macOS and Windows in CI.
