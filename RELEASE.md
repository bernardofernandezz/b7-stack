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

### This week: what unblocks 1.0

The code is ahead of operations. These four HUMAN tasks are all that stand between the template and its deployed acceptance tests:

| Task | What it needs | Cost |
|------|---------------|------|
| [2.4](#phase-2-docker-target-and-preview-release) Publish the preview | npm trusted publishing for the six `create-b7` packages, then a `v0.2.0-preview.0` tag | Free |
| [2.2](#phase-2-docker-target-and-preview-release) A public host | A small VPS with Docker and a domain | About US$5/month plus a domain |
| [5.3](#phase-5-organizations-and-stripe-10) Stripe test mode | A Stripe account and a webhook endpoint on 2.2 | Free |
| [5.5](#phase-5-organizations-and-stripe-10) A real email | A Resend account and a verified domain | Free tier |

---

## Phase 0: Hygiene

- [x] **0.1 HUMAN: run CI for the first time.** PR #1: after two CI fixes (tarball glob, frozen lockfile under `CI=true`), all 10 jobs green on `d6a54d7`. Push branch `v0.2` and open a PR, so `.github/workflows/cli.yml` runs (checks and the Compose stack of a generated project).
  - *Done when:* the `create-b7` workflow is green. Any failure becomes a new task below this one.
- [x] **0.2 CLI `--help`, `--version` and a missing-pnpm message.** (2fd87a0)
  - *Spec:* [cli/README.md](cli/README.md)
  - *Files:* `cli/index.js`, `cli/test/create.test.js`, `cli/README.md`
  - *Done when:* `node cli/index.js --help` lists every flag and the available templates. `--version` prints `cli/package.json` `version`. When `pnpm` is not on `PATH`, the CLI says how to install it. `pnpm test` in `cli/` covers `--help` and `--version`.
- [x] **0.3 CLI package metadata.** (3401810)
  - *Files:* `cli/package.json`, `cli/scripts/copy-template.js`
  - *Done when:* `npm pack` in `cli/` contains `LICENSE` and `README.md`, and `package.json` has `keywords`, `homepage` and `bugs`.

## Phase 1: Decisions

- [x] **1.1 HUMAN: approve or reject A1–A11 and A13.** Approved by the maintainer, 2026-11-01.
  - *Spec:* [architecture-review.md › Decisions requiring maintainer approval](architecture-review.md#decisions-requiring-maintainer-approval)
  - *Done when:* each decision is marked approved or rejected in that table.
- [x] **1.2 Remove "proposed" from the approved decisions.** needs: 1.1. ADR-014, ADR-020 and ADR-026 stay Proposed: they were not part of the approval.
  - *Files:* every doc that `grep -rli proposed --include=*.md .` lists (README, configuration model, technology decisions, `stacks/fullstack/*`, `ROADMAP.md`, the review). For a rejected decision, restore the earlier text from git history.
  - *Done when:* the grep only matches decisions still pending (none, if all were decided), and M0 in `ROADMAP.md` is marked done.

## Phase 2: Docker target and preview release

- [x] **2.1 Replace Cloudflare Workers with Docker Compose** (maintainer request). (dcd2848)
  - *Spec:* [ADR-013](site/content/docs/technology-decisions.md#adr-013-docker-compose-replaces-cloudflare-workers-as-the-fullstack-target), [infrastructure.md](site/content/docs/stacks/fullstack/infrastructure.md), [review › Target change](architecture-review.md#target-change-docker-compose-replaces-cloudflare-workers-2026-11-01)
  - *Files:* `templates/fullstack/{Dockerfile,compose.yaml,Caddyfile,.dockerignore,.env.example}`, `src/start.ts`, `src/db/client.ts`, `src/env.ts`, `vite.config.ts`, `vitest.config.ts`, the CLI's `.env` generation, both CI workflows, the Fullstack docs.
  - *Done when:* C-T1 and C-T2 pass for the template and for a project generated from the packed CLI.
- [~] **2.2 HUMAN: a public host.** blocked: needs a server and a domain. A server with Docker, a domain pointing at it, ports 80 and 443 open. Copy a generated project there, set `APP_URL=https://<domain>` in `.env`, run `docker compose up -d --build`.
  - *Done when:* the site answers over HTTPS with a valid certificate.
- [~] **2.3 Run C-T3 against the public host.** blocked: waits for 2.2. needs: 2.2
  - *Done when:* `BASE_URL=https://<domain> pnpm exec playwright test smoke` is green, cookies carry `Secure`, and the result is a row in the template's [Verification status](templates/fullstack/README.md#verification-status).
- [~] **2.4 HUMAN: publish the preview.** Authorized 2026-11-01; blocked: npm trusted publishing is not set up yet. needs: 0.1, 0.2, 0.3, 2.1
  - create-b7 is now a Go binary in six npm packages ([cli/README.md › Release](cli/README.md#release)). On npmjs.com, add a trusted publisher (GitHub Actions, workflow `release.yml`) to `create-b7` and to each `create-b7-<os>-<arch>`. A package name that does not exist yet needs one first manual `npm publish` with a 2FA code before a trusted publisher can be added.
  - Then `git tag v0.2.0-preview.0 && git push origin v0.2.0-preview.0`; `release.yml` publishes with the `preview` dist-tag.
  - *Then the agent:* moves the `[Unreleased]` entries into `## [0.2.0-preview.0] - <date>` in `CHANGELOG.md`, and changes the root README install line to `npm create b7@preview`.

## Phase 3: Template improvements

*Spec for all:* [templates/fullstack/README.md › Known limitations](templates/fullstack/README.md#known-limitations). Each task removes its bullet from that list.

- [x] **3.1 Password reset.** (e77dde6)
  - *Spec:* [site/content/docs/stacks/fullstack/authentication.md › Sign-in methods](site/content/docs/stacks/fullstack/authentication.md#sign-in-methods)
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

- [x] **4.1 ADR: how options compose into a template.** (f2d65e2) Decided: [ADR-014](site/content/docs/technology-decisions.md#adr-014-options-compose-by-removing-feature-regions-from-a-complete-template), feature regions removed from a complete template (overlays rejected).
  - *Spec:* [site/content/docs/configuration-model.md › Fullstack features](site/content/docs/configuration-model.md#fullstack-features-what-each-one-adds), [cli/README.md › Contract](cli/README.md#contract)
  - *Default proposal:* overlay directories `templates/fullstack/+<option>/` copied over the base in a fixed order. `package.json` is deep-merged. `compose.yaml`, `.env.example` and `src/env.ts` are patched at marked insertion points. Overlays are excluded when the base is used as a template.
  - *Files:* `site/content/docs/technology-decisions.md`
  - *Done when:* the ADR states the mechanism, the rejected alternatives, and how one overlay is tested on its own.
- [x] **4.2 Configuration schema and rules.** (9731f1f) needs: 4.1. Plain JS validation in `cli/config.js` (no Zod dependency for six options), regions in `cli/regions.js`, options in `templates/fullstack/b7.features.json`.
  - *Spec:* [site/content/docs/configuration-model.md › Rules](site/content/docs/configuration-model.md#rules) (rules 1–4 for Fullstack)
  - *Files:* `cli/` (schema, validation), `cli/test/`
  - *Done when:* one test per rule, and a violation exits non-zero with the rule number in the message. The template `b7.json` validates.
- [x] **4.3 Option flags and prompts.** (4d26280) needs: 4.2. `--email` is offered now; `--organizations` and `--billing` are accepted by the CLI and rejected by rule 1 until the template supports them (5.1, 5.2).
  - *Files:* `cli/index.js`, `cli/README.md`, `cli/test/`
  - *Done when:* `--organizations`, `--billing <stripe|none>` and `--email <resend|none>` exist with matching prompts. Only options with a tested overlay are offered. The generated `b7.json` records the resolved configuration, including derived values.
- [x] **4.4 CI matrix over representative configurations.** (11f84ea) needs: 4.3. Verified locally 2026-11-01: all six configurations generate, typecheck, lint, test, run in Compose and pass E2E. The matrix runs configuration 1 (`--email none`), the default, each option alone, and configuration 2 (`--organizations --billing stripe`).
  - *Spec:* [site/content/docs/configuration-model.md › Representative configurations](site/content/docs/configuration-model.md#representative-configurations)
  - *Files:* `.github/workflows/cli.yml`
  - *Done when:* CI generates configurations 1 and 2 (once their overlays exist) and runs each project's checks.

## Phase 5: Organizations and Stripe (1.0)

- [x] **5.1 `organizations` overlay.** (d3c4472) needs: 4.1. Built as feature regions (ADR-014). M-T4 not needed: B7 never calls `hasPermission`.
  - *Spec:* [site/content/docs/stacks/fullstack/authentication.md › With organizations](site/content/docs/stacks/fullstack/authentication.md#with-organizations-optional), [Tenant isolation](site/content/docs/stacks/fullstack/authentication.md#tenant-isolation)
  - *Files:* `templates/fullstack/+organizations/` (plugin, `requireMembership` and `requirePermission` in `src/rpc/`, `organization_id` on notes, invitations via Resend, migration)
  - *Done when:* H-T2 and M-T1…M-T4 pass locally, and the generated project's checks pass.
- [x] **5.2 `billing: stripe` overlay.** (11f84ea) needs: 4.1. S-T1, S-T2, S-T3, B-T1…B-T6 pass locally with Stripe faked at `fetch`. The scheduler calls an internal endpoint instead of running a second build.
  - *Spec:* [site/content/docs/stacks/fullstack/billing.md](site/content/docs/stacks/fullstack/billing.md) (tables, Stripe mapping, webhook verification, event processing), decisions A8 and A9
  - *Files:* `templates/fullstack/+billing-stripe/` (adapter implementing `BillingProvider` in `src/modules/billing/`, tables and migration, `src/routes/api/webhooks/stripe.ts`, reconciliation in `src/jobs/`, a `scheduler` Compose service)
  - *Done when:* S-T1 and B-T1…B-T6 pass locally (Stripe faked at the HTTP boundary), and the generated project's checks pass.
- [~] **5.3 HUMAN: Stripe test-mode keys and a webhook endpoint** blocked: needs a Stripe account and 2.2. on the public host. needs: 2.2, 5.2
- [~] **5.4 Deployed billing and load tests.** blocked: waits for 5.3. needs: 5.3
  - *Spec:* S-T2, S-T3, B-T4 in [the acceptance tests](architecture-review.md#required-acceptance-tests)
  - *Done when:* each has a result against the public host in Verification status.
- [x] **5.4b Replica and load tests on the Compose stack (agent, local).** (2725df4) BA-T2 passed on 2 replicas; D-T2 passed (30,000 requests, connections flat at 3). Found and fixed: Caddy resolved `app` once and sent every request to one replica; it now uses Docker DNS upstreams with round-robin.
  - *Spec:* BA-T2 with `docker compose up --scale app=2`, and D-T2 (sustained load, for example 50 RPS for 10 min) in [the acceptance tests](architecture-review.md#required-acceptance-tests)
  - *Files:* a load script under `templates/fullstack/scripts/`, Verification status
  - *Done when:* rate limits hold across both replicas, and PostgreSQL connections (`pg_stat_activity`) stay flat under load.
- [~] **5.5 HUMAN: send a real email through Resend** blocked: needs a Resend key and a verified domain. from a verified domain (sign-up verification and an organization invitation).
- [~] **5.6 Declare production-ready.** blocked: waits for 1.1, 2.2, 5.3 and 5.5. needs: every task above
  - *Done when:* release blockers 1–5 and 7 are all met, the "Preview" notices in the root README, the template README and `cli/README.md` are replaced, and M1–M4 in `ROADMAP.md` are marked done.
- [~] **5.7 HUMAN: publish 1.0.0.** blocked: waits for 5.6. needs: 5.6
  - Bump `cli/npm/create-b7/package.json` to `1.0.0`, then push the tag `v1.0.0` (`release.yml` publishes). *Then the agent* closes the `## [1.0.0]` section in `CHANGELOG.md`.

---

## Phase 6: Adoption foundations

From [STRATEGY.md](STRATEGY.md). These tasks do not block 1.0 and can run in parallel with Phase 5.

- [ ] **6.1 Security policy.** needs: —
  - *Spec:* [STRATEGY.md › P0: trust and 1.0](STRATEGY.md#p0-trust-and-10)
  - *Files:* `SECURITY.md` (private disclosure channel, response time, supported-versions table), link from `README.md`
  - *Done when:* GitHub shows the policy under the repository's Security tab.
- [ ] **6.2 `AGENTS.md` in the Fullstack template.** needs: —
  - *Spec:* [STRATEGY.md › P1: agent-native](STRATEGY.md#p1-agent-native), [architecture](site/content/docs/stacks/fullstack/architecture.md), [authentication › Tenant isolation](site/content/docs/stacks/fullstack/authentication.md#tenant-isolation)
  - *Files:* `templates/fullstack/AGENTS.md` (module layout, the `requireSession` → `requireMembership` → `requirePermission` chain, tenant scoping, billing rules, commands), `CLAUDE.md` pointing to it; feature regions for the organizations and billing sections
  - *Done when:* every generated configuration in the CI matrix contains an `AGENTS.md` that mentions only the options it has.
- [ ] **6.3 ADR: `b7 update`.** needs: 4.1
  - *Spec:* [STRATEGY.md › P0: the upgrade path](STRATEGY.md#p0-the-upgrade-path), [ADR-014](site/content/docs/technology-decisions.md#adr-014-options-compose-by-removing-feature-regions-from-a-complete-template)
  - *Files:* `site/content/docs/technology-decisions.md` (new ADR, status Proposed): what `b7.json` records (template version, options), how the base, ours and theirs versions are produced, conflict handling
  - *Done when:* the ADR is written and listed under decisions awaiting the maintainer.
- [ ] **6.4 Serverless target spike.** needs: —
  - *Spec:* [ADR-015](site/content/docs/technology-decisions.md#adr-015-fullstack-offers-two-targets-from-one-tanstack-start-app), [infrastructure › Serverless deployment](site/content/docs/stacks/fullstack/infrastructure.md#serverless-deployment)
  - *Files:* a throwaway branch of the template with a Nitro `vercel` preset and managed PostgreSQL; findings in `architecture-review.md`
  - *Done when:* the findings list what works, what breaks (pool, rate-limit IP, cron) and the effort to support it. Deploying publicly needs a HUMAN task.
- [ ] **6.5 HUMAN: approve or reject ADR-015** (one app, two targets through Nitro presets). needs: —
  - *Done when:* its status in `technology-decisions.md` says Accepted or Rejected. It must be settled before 6.3 is implemented, because the file layout freezes when `b7 update` ships.
- [ ] **6.6 Google and GitHub sign-in, and magic links.** needs: —
  - *Spec:* [STRATEGY.md › P0: the first impression](STRATEGY.md#p0-the-first-impression), [authentication › Sign-in methods](site/content/docs/stacks/fullstack/authentication.md#sign-in-methods)
  - *Files:* `templates/fullstack/src/modules/auth/`, `src/env.ts`, `.env.example`, `test/auth.test.ts`, `e2e/`
  - *Done when:* each provider turns on only when its keys are set, Vitest covers account linking by verified email, and an E2E signs in through a faked OAuth provider.
- [ ] **6.7 Product screens.** needs: —
  - *Spec:* [STRATEGY.md › P0: the first impression](STRATEGY.md#p0-the-first-impression), [ADR-009](site/content/docs/technology-decisions.md#adr-009-tailwind-css-base-ui-and-lucide)
  - *Files:* `templates/fullstack/src/routes/`, `src/components/`, `src/modules/email/`; feature regions for the organization and billing screens
  - *Done when:* landing, pricing, dashboard, account settings, organization settings with members and invitations, and the billing page exist; every CI configuration passes its E2E, and each screen meets WCAG 2.1 AA contrast and keyboard checks.
- [ ] **6.8 Count projects by `b7.json`.** needs: —
  - *Spec:* [STRATEGY.md › The goal and how we measure it](STRATEGY.md#the-goal-and-how-we-measure-it)
  - *Files:* `scripts/count-projects.js` at the repository root (GitHub code search API, prints a count per `version`), a scheduled workflow that appends the result to a CSV
  - *Done when:* running the script with a `GITHUB_TOKEN` prints a count per version, and the workflow runs monthly.
- [ ] **6.9 Community channel.** needs: —
  - *Files:* `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/`
  - *Done when:* GitHub Discussions is on (HUMAN), `CONTRIBUTING.md` links it, and five open tasks from this file have `good first issue` issues.
- [ ] **6.10 B7 agent skill.** needs: 6.2
  - *Spec:* [STRATEGY.md › P0: agent-native](STRATEGY.md#p0-agent-native)
  - *Files:* `skills/b7/SKILL.md` (when to use B7, the `create-b7` flags and rules, and pointers to `AGENTS.md` and `llms.txt`)
  - *Done when:* an agent with only the skill installed generates configuration 2 with the right flags from "build me a B2B SaaS with Stripe". Publishing it to skill directories needs a HUMAN task.
- [ ] **6.11 B7 Bot v1: a GitHub Action.** needs: 6.16. The GitHub App comes later (6.18) and reuses the same command.
  - *Spec:* [STRATEGY.md › P0: the upgrade path](STRATEGY.md#p0-the-upgrade-path)
  - *Files:* `actions/update/action.yml` (composite: `npx create-b7@latest update --yes`, `pnpm db:generate`, then open or update the PR `b7/update-<version>` with `gh pr create`; the body carries the release's CHANGELOG section and the conflict list, and security releases get the `security` label), `templates/fullstack/.github/workflows/b7-update.yml` (daily cron plus `workflow_dispatch`; deleting it opts out, documented in `AGENTS.md` and the README), and `scripts/count-projects.js` (6.8) also counts repositories with `b7-update.yml`, meaning active bots
  - *Done when:* a test repository generated at release N gets a PR to N+1 with green checks. Creating the test repository needs a HUMAN task.
- [ ] **6.12 Public agent eval.** needs: 6.2, 6.10
  - *Spec:* [STRATEGY.md › P0: agent-native](STRATEGY.md#p0-agent-native)
  - *Files:* `evals/` (task prompt, a checker that runs the generated project's tests plus the isolation tests), a results table for the landing page
  - *Done when:* one command runs the task on at least two agents against B7 and one other starter and writes the results. Paid agent runs need a HUMAN task.
- [ ] **6.13 HUMAN: pick and ship a dogfood SaaS on B7.** needs: 5.6
  - *Spec:* [STRATEGY.md › P1: dogfooding](STRATEGY.md#p1-dogfooding)
  - *Done when:* it is live on a public host, linked from the landing page, with its code public.
- [ ] **6.14 SemVer promise for generated projects.** needs: 6.1
  - *Spec:* [STRATEGY.md › P0: trust and 1.0](STRATEGY.md#p0-trust-and-10)
  - *Files:* `site/content/docs/upgrading.md` (major = a release `b7 update` cannot apply without manual edits, or one that needs a data migration; minor and patch apply cleanly), linked from `SECURITY.md` and `README.md`
  - *Done when:* the page is in the docs site navigation, and `SECURITY.md` points to it for supported versions.
- [ ] **6.15 HUMAN: a second maintainer with merge rights.** needs: 6.9
  - *Files (agent, after the human picks one):* governance in `CONTRIBUTING.md`, `.github/CODEOWNERS`; branch protection on `main` is HUMAN
  - *Done when:* two people can merge, and `CONTRIBUTING.md` says how decisions are made.
- [ ] **6.16 `create-b7 update [dir]`.** needs: 6.3 approved, 6.5
  - *Spec:* the 6.3 ADR
  - *Files:* `cli/internal/update/`, `cli/main.go` (subcommand), its tests, `cli/README.md`. Base = `generate.Generate` over the template of the `v<b7.json version>` GitHub release archive; theirs = `generate.Generate` over the embedded template, same configuration; both formatted with the project's Biome before comparing. Per file: `git merge-file`, with adds and deletes resolved against base; `package.json` merged per dependency key, keeping `name`; then `pnpm install --lockfile-only`, `pnpm db:generate`, and the new `version` in `b7.json`
  - *Done when:* tests with two fixture templates cover a clean merge, a conflict (markers left, file listed, exit non-zero), a deleted file and a new dependency.
- [ ] **6.17 Upgrade log in CI.** needs: 6.16
  - *Spec:* [ROADMAP.md › M8](ROADMAP.md#m8-upgrade-path-strategy)
  - *Files:* `.github/workflows/cli.yml` (generate from the previous npm release, `update` to HEAD with no manual edits, then typecheck, test and E2E), an "Upgrade log" entry per release in `CHANGELOG.md` (template diff and CI run link)
  - *Done when:* the job is green on a pull request, and the release process in this file adds the log entry.
- [ ] **6.18 B7 Bot v2: a GitHub App.** needs: 6.11, 2.2. After launch.
  - *Files:* a small Octokit server that, on a `create-b7` release, sends `workflow_dispatch` to `b7-update.yml` in installed repositories (same day, no cron wait) and counts installations; runs on the 2.2 host. Creating the App and its key is HUMAN
  - *Done when:* a release triggers the update PR in the test repository within minutes.
- [ ] **6.19 Deploy button: Vercel + Neon.** needs: M7 (serverless target)
  - *Spec:* [STRATEGY.md › P1: first deploy](STRATEGY.md#p1-first-deploy-in-under-ten-minutes)
  - *Files:* CI publishes a template repository (configuration 2, `--target serverless`) per release; `vercel.com/new/clone` button with the Neon integration in `README.md` and the landing; migrations in the build; missing generated secrets created at build. Spike first, then an ADR: create the Stripe webhook endpoint through the API on first boot with an `sk_test_` key, and log emails until a Resend key exists, test mode only (changes the "organizations needs email" rule)
  - *Done when:* a timed HUMAN run goes from click to an organization and a test-mode subscription in under 5 minutes.
- [ ] **6.20 Public live demo.** needs: 2.2, 5.3, 5.5, 6.7
  - *Files:* configuration 2 on the Docker target, a banner with the `4242…` test card, a nightly database reset through the existing `scheduler` service
  - *Done when:* `e2e/billing.spec.ts` passes against the public URL.
- [ ] **6.21 Eval leaderboard on the landing.** needs: 6.12
  - *Files:* `site/` reads `evals/results.json`. The eval task (6.12) fixes an HTTP contract (for example `POST/GET /api/projects` scoped to the active organization), so one hidden isolation checker (two users, two organizations, cross access → 404, like M-T1) runs on B7, create-t3-app and Better-T-Stack
  - *Done when:* the landing shows the latest results with the date and agent versions.
- [ ] **6.22 Dogfood operations.** needs: 6.13, 6.11
  - *Files:* the dogfood repository: generated with `create-b7`, `b7-update.yml` enabled (the bot's first user), a public uptime page (UptimeRobot, HUMAN) and the monthly hosting cost in its README
  - *Done when:* the landing links the product, its code, its uptime and its cost.

---

## Post-1.0 backlog

Not scheduled. Each one needs a documented requirement before it becomes a task ([ROADMAP.md › Later](ROADMAP.md)).

- AbacatePay overlay (M5): capture real payloads first (A-T3), then A-T1…A-T3 and B-T1…B-T6.
- Templates for the Web and API profiles, then Systems and Intelligence.
- Options: `publicApi`, `storage: s3`, `queues`, `turnstile`, `sentry`, `passkeys` (EXPERIMENTAL).
- `b7 add <option>` and `b7 update` (after the 6.3 ADR is approved); a public upgrade log per release.
- A web configurator like better-t-stack.dev that outputs the `npm create b7` command.
- CLI tested on macOS and Windows in CI.
