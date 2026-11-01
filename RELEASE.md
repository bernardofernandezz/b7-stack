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

**Never, without a HUMAN task marked `[x]` that authorizes it:** `git push`, `wrangler deploy`, `npm publish`, creating paid or external resources, writing real secrets into the repository, or removing the "proposed" label from a decision.

**On failure:** if *Done when* fails twice after a fix attempt, mark the task `[!] failed: <one-line reason>`, leave the work uncommitted or on a branch, and stop.

Status markers: `[ ]` to do · `[x]` done · `[~]` blocked on a human · `[!]` failed, needs attention.

## Release gates

| Release | Means | Requires |
|---------|-------|----------|
| **0.2.0-preview** | `npm create b7` generates the Fullstack template. Explicitly not production-ready | Phases 0–2 |
| **1.0.0** | Production-ready Fullstack with `organizations` and `billing: stripe` as CLI options | Phases 0–5: [release blockers](architecture-review.md#release-blockers) 1–5 and 7 |

AbacatePay, other profiles and the remaining options come after 1.0 ([backlog](#post-10-backlog)).

---

## Phase 0: Hygiene

- [ ] **0.1 HUMAN: run CI for the first time.** Push branch `v0.2` and open a PR, so `.github/workflows/cli.yml` runs.
  - *Done when:* the `create-b7` workflow is green. Any failure becomes a new task below this one.
- [ ] **0.2 CLI `--help`, `--version` and a missing-pnpm message.**
  - *Spec:* [cli/README.md](cli/README.md)
  - *Files:* `cli/index.js`, `cli/test/create.test.js`, `cli/README.md`
  - *Done when:* `node cli/index.js --help` lists every flag and the available templates. `--version` prints `cli/package.json` `version`. When `pnpm` is not on `PATH`, the CLI says to run `corepack enable`. `pnpm test` in `cli/` covers `--help` and `--version`.
- [ ] **0.3 CLI package metadata.**
  - *Files:* `cli/package.json`, `cli/scripts/copy-template.js`
  - *Done when:* `npm pack` in `cli/` contains `LICENSE` and `README.md`, and `package.json` has `keywords`, `homepage` and `bugs`.

## Phase 1: Decisions

- [ ] **1.1 HUMAN: approve or reject A1–A11.**
  - *Spec:* [architecture-review.md › Decisions requiring maintainer approval](architecture-review.md#decisions-requiring-maintainer-approval)
  - *Done when:* each decision is marked approved or rejected in that table.
- [ ] **1.2 Remove "proposed" from the approved decisions.** needs: 1.1
  - *Files:* every doc that `grep -rli proposed --include=*.md .` lists (README, configuration model, technology decisions, `stacks/fullstack/*`, `ROADMAP.md`, the review). For a rejected decision, restore the v0.1 text from git history (`9816a4d`).
  - *Done when:* the grep only matches decisions still pending (none, if all were decided), and M0 in `ROADMAP.md` is marked done.

## Phase 2: Deployed proof and preview release

- [ ] **2.1 HUMAN: infrastructure.**
  - *Spec:* [templates/fullstack/README.md › Deploy](templates/fullstack/README.md#deploy)
  - A Cloudflare account, a hosted PostgreSQL (Neon or Supabase), `wrangler hyperdrive create … --caching-disabled` with its ID in `wrangler.jsonc`, `wrangler secret put` for `BETTER_AUTH_SECRET` and `RESEND_API_KEY`, and GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL` plus the variable `PRODUCTION_URL`.
  - *Done when:* `DATABASE_URL=… pnpm run db:migrate` works against the hosted database.
- [ ] **2.2 Custom `src/server.ts` with `scheduled`.**
  - *Spec:* [architecture-review.md › Confirmed facts](architecture-review.md#confirmed-facts-vendor-docs) (TanStack Start), assumption S1, test T-T2
  - *Files:* `templates/fullstack/src/server.ts`, `templates/fullstack/wrangler.jsonc` (`main`), `templates/fullstack/README.md`
  - *Done when:* `typecheck`, `lint`, `test`, `build` and `test:e2e` pass, and `wrangler dev --test-scheduled` plus `curl /__scheduled` runs the empty handler.
- [ ] **2.3 HUMAN: first deploy.** needs: 2.1, 2.2
  - *Done when:* `pnpm run deploy` succeeds and `PRODUCTION_URL` serves the app.
- [ ] **2.4 Deployed acceptance tests (M1).** needs: 2.3
  - *Spec:* [architecture-review.md › Required acceptance tests](architecture-review.md#required-acceptance-tests): T-T1, T-T2, T-T4, T-T5, D-T1, H-T1, BA-T1, W-1, W-2
  - *Files:* `templates/fullstack/e2e/` (automate what can be automated against `BASE_URL`), `templates/fullstack/README.md › Verification status`
  - *Done when:* each test has a row in [Verification status](templates/fullstack/README.md#verification-status) with its deployed result, and `BASE_URL=$PRODUCTION_URL pnpm exec playwright test smoke` is green. W-2 needs a temporary deploy without `nodejs_compat`, which is a HUMAN step.
- [ ] **2.5 HUMAN: decide A12** (Free vs Paid plan, OAuth default, or hashing tuning) from the W-1 result. needs: 2.4
  - *Then the agent:* writes the decision as a new ADR in [docs/technology-decisions.md](docs/technology-decisions.md) and states the plan requirement in the template README.
- [ ] **2.6 HUMAN: publish the preview.** needs: 0.1, 0.2, 0.3, 2.4, 2.5
  - `cd cli && npm publish --tag preview` at version `0.2.0-preview.0`, then `git tag v0.2.0-preview.0`.
  - *Then the agent:* moves the `[Unreleased]` entries into `## [0.2.0-preview.0] - <date>` in `CHANGELOG.md`, and changes the root README install line to `npm create b7@preview`.

## Phase 3: Template improvements

*Spec for all:* [templates/fullstack/README.md › Known limitations](templates/fullstack/README.md#known-limitations). Each task removes its bullet from that list.

- [ ] **3.1 Password reset.**
  - *Spec:* [stacks/fullstack/authentication.md › Sign-in methods](stacks/fullstack/authentication.md#sign-in-methods)
  - *Files:* `templates/fullstack/src/modules/auth/`, a reset route under `src/routes/`, `test/auth.test.ts`, `e2e/`
  - *Done when:* Vitest covers token issue and use (email faked as in `test/email.test.ts`), and an E2E resets a password and signs in with it.
- [ ] **3.2 Require email verification when email is configured.**
  - *Files:* `templates/fullstack/src/modules/auth/`, `test/auth.test.ts`, `e2e/`
  - *Done when:* an unverified user cannot sign in (test), and the E2E flow verifies through the logged email link in dev.
- [ ] **3.3 No session RPC on every client navigation.**
  - *Files:* `templates/fullstack/src/routes/__root.tsx`, `src/lib/orpc.ts`
  - *Done when:* the session is read through TanStack Query with a cache, and an E2E asserts that navigating between two pages makes no `/api/rpc` session request after the first.
- [ ] **3.4 Fail clearly on a query after the per-request pool closes.**
  - *Files:* `templates/fullstack/src/start.ts`, `src/db/`
  - *Done when:* a query after the response throws an error that names the cause (streamed loader), and a test proves it.
- [ ] **3.5 Drop Kysely's unused SQLite dialects from the bundle.**
  - *Files:* `templates/fullstack/vite.config.ts`
  - *Done when:* `wrangler deploy --dry-run` reports a smaller gzip size than 734 KiB, and all checks stay green. If no safe alias exists, mark `[x]` with the reason and leave the limitation.

## Phase 4: Configurable CLI

- [ ] **4.1 ADR: how options compose into a template.**
  - *Spec:* [docs/configuration-model.md › Fullstack features](docs/configuration-model.md#fullstack-features-what-each-one-adds), [cli/README.md › Contract](cli/README.md#contract)
  - *Default proposal:* overlay directories `templates/fullstack/+<option>/` copied over the base in a fixed order. `package.json` is deep-merged. `wrangler.jsonc`, `.dev.vars.example` and `src/env.ts` are patched at marked insertion points. Overlays are excluded when the base is used as a template.
  - *Files:* `docs/technology-decisions.md`
  - *Done when:* the ADR states the mechanism, the rejected alternatives, and how one overlay is tested on its own.
- [ ] **4.2 Configuration schema and rules.** needs: 4.1
  - *Spec:* [docs/configuration-model.md › Rules](docs/configuration-model.md#rules) (rules 1–4 for Fullstack)
  - *Files:* `cli/` (schema, validation), `cli/test/`
  - *Done when:* one test per rule, and a violation exits non-zero with the rule number in the message. The template `b7.json` validates.
- [ ] **4.3 Option flags and prompts.** needs: 4.2
  - *Files:* `cli/index.js`, `cli/README.md`, `cli/test/`
  - *Done when:* `--organizations`, `--billing <stripe|none>` and `--email <resend|none>` exist with matching prompts. Only options with a tested overlay are offered. The generated `b7.json` records the resolved configuration, including derived values.
- [ ] **4.4 CI matrix over representative configurations.** needs: 4.3
  - *Spec:* [docs/configuration-model.md › Representative configurations](docs/configuration-model.md#representative-configurations)
  - *Files:* `.github/workflows/cli.yml`
  - *Done when:* CI generates configurations 1 and 2 (once their overlays exist) and runs each project's checks.

## Phase 5: Organizations and Stripe (1.0)

- [ ] **5.1 `organizations` overlay.** needs: 4.1
  - *Spec:* [stacks/fullstack/authentication.md › With organizations](stacks/fullstack/authentication.md#with-organizations-optional), [Tenant isolation](stacks/fullstack/authentication.md#tenant-isolation)
  - *Files:* `templates/fullstack/+organizations/` (plugin, `requireMembership` and `requirePermission` in `src/rpc/`, `organization_id` on notes, invitations via Resend, migration)
  - *Done when:* H-T2 and M-T1…M-T4 pass locally, and the generated project's checks pass.
- [ ] **5.2 `billing: stripe` overlay.** needs: 4.1, 2.2
  - *Spec:* [stacks/fullstack/billing.md](stacks/fullstack/billing.md) (tables, Stripe mapping, webhook verification, event processing), decisions A8 and A9
  - *Files:* `templates/fullstack/+billing-stripe/` (adapter implementing `BillingProvider` in `src/modules/billing/`, tables and migration, `src/routes/api/webhooks/stripe.ts`, reconciliation in `scheduled`, cron trigger)
  - *Done when:* S-T1 and B-T1…B-T6 pass locally (Stripe faked at the HTTP boundary), and the generated project's checks pass.
- [ ] **5.3 HUMAN: Stripe test-mode keys and a webhook endpoint** on the deployed Worker. needs: 2.3, 5.2
- [ ] **5.4 Deployed billing and load tests.** needs: 5.3
  - *Spec:* S-T2, S-T3, B-T4, BA-T2 (several isolates), D-T2 in [the acceptance tests](architecture-review.md#required-acceptance-tests)
  - *Done when:* each has a deployed result in Verification status.
- [ ] **5.5 HUMAN: send a real email through Resend** from a verified domain (sign-up verification and an organization invitation).
- [ ] **5.6 Declare production-ready.** needs: every task above
  - *Done when:* release blockers 1–5 and 7 are all met, the "Not production-ready" notices in the root README, the template README and `cli/README.md` are replaced, and M1–M4 in `ROADMAP.md` are marked done.
- [ ] **5.7 HUMAN: publish 1.0.0.** needs: 5.6
  - Bump `cli/package.json` to `1.0.0`, `npm publish`, `git tag v1.0.0`. *Then the agent* closes the `## [1.0.0]` section in `CHANGELOG.md`.

---

## Post-1.0 backlog

Not scheduled. Each one needs a documented requirement before it becomes a task ([ROADMAP.md › Later](ROADMAP.md)).

- AbacatePay overlay (M5): capture real payloads first (A-T3), then A-T1…A-T3 and B-T1…B-T6.
- Templates for the Web and API profiles, then Systems and Intelligence.
- Options: `oauthProviders`, `publicApi`, `storage: r2`, `queues`, `turnstile`, `sentry`, `passkeys` (EXPERIMENTAL).
- `b7 add <option>` for existing projects, reading `b7.json`.
- A web configurator like better-t-stack.dev that outputs the `npm create b7` command.
- CLI tested on macOS and Windows in CI.
