# Strategy

How B7 becomes the most used way to start a SaaS, instead of one more starter that fades. This document explains the bet, what is missing and what we will not do. Milestones are in [ROADMAP.md](ROADMAP.md); tasks are in [RELEASE.md](RELEASE.md).

## The goal and how we measure it

**Goal:** B7 Fullstack is the default foundation people reach for when they start a SaaS, ahead of free starters and paid boilerplates.

**North-star metric: generated projects still on a supported B7 version 90 days after creation.** Stars and downloads measure curiosity. Retention measures whether B7 is actually the foundation of real products, which is what keeps a project alive.

**How we measure it without telemetry:** every generated project carries a `b7.json` with the `version` of the `create-b7` release that wrote it. A monthly GitHub code search for `b7.json` files with `"profile": "fullstack"` counts public projects and the version each one is on. Private projects are invisible, so the count is a floor, which is fine for a trend.

Supporting metrics:
- Weekly `create-b7` downloads on npm.
- Projects deployed (deploy-button clicks, opt-in only).
- Products publicly "built with B7".
- Contributors who land a second pull request.

**Honest baseline (2026-11):** `create-b7` is a preview on npm. No public deployment exists yet, there is one maintainer, and the template is not production-ready ([release gates](RELEASE.md#release-gates)).

## The market

| Project | Owns | Where it stops |
|---------|------|----------------|
| [create-t3-app](https://github.com/t3-oss/create-t3-app) (about 25k stars) | "Typesafe Next.js starter", a large community | Next.js only. No organizations, billing or deploy. Generated code never gets updates |
| [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack) (about 5.6k stars) | Breadth: many frameworks, ORMs and APIs, including **TanStack Start + Hono + oRPC + Drizzle + Better Auth** | A starting skeleton. No production layer: tenancy, billing, deploy and acceptance tests are left to you |
| Epic Stack | An opinionated, well-tested Remix app | No organizations or billing. One target |
| Paid boilerplates (Makerkit, Supastarter, ShipFast) | Exactly the SaaS features buyers need | Closed code, a one-time drop, no upgrade path, $200–$300 per license |
| Wasp, RedwoodJS | Full frameworks with their own DSL or conventions | Lock-in to the framework itself |

**What this means for B7:** the technology choice alone does not make B7 different. Better-T-Stack already generates B7's own default stack. B7's advantage is the part nobody gives away for free and nobody keeps updated: the production layer B7 has already built and tested. That layer includes organizations with tenant isolation, Stripe billing with verified webhooks and reconciliation, email flows, a Docker Compose deploy behind Caddy, and acceptance tests on replicas ([RELEASE.md](RELEASE.md) 3.x, 5.1, 5.2, 5.4b).

## The bet

**"The SaaS foundation you would otherwise pay for: open, tested and upgradable."**

B7 wins by keeping three promises better than anyone:

1. **The production layer is included.** Auth, organizations and tenancy, billing, email, deployment and observability come with the template. Each one is backed by an acceptance test, not a blog post.
2. **Projects stay upgradable.** A project generated today keeps receiving security fixes and improvements. Boilerplates die because their code is a snapshot. B7's feature regions ([ADR-014](site/content/docs/technology-decisions.md#adr-014-options-compose-by-removing-feature-regions-from-a-complete-template)) and `b7.json` make a real update path possible.
3. **AI agents get it right.** In 2026 most new code is written with an agent. The stack an agent produces correct code for on the first try becomes the default. B7's explicit layers and written rules are an advantage here, but only if we ship them in the form agents read.

**Win one category before the market.** "Most used" is a consequence, not a plan: B7 first becomes the default for B2B SaaS in TypeScript, then expands. Features alone never make B7 unique, because they can be copied. What competitors structurally cannot copy is a project that keeps receiving updates after it is generated.

Focus follows from the bet. **B7 Fullstack is the only profile we invest in until it reaches 1.0 and the milestones below.** Web, API, Systems and Intelligence stay documented, and their templates wait. The public pitch is one sentence, not five profiles: *the open-source SaaS starter with organizations, Stripe and deploy that you can keep updating.*

## What is missing, ranked by what blocks adoption

### P0: trust and 1.0
Nobody builds a company on a preview.
- A deployed smoke test on a public host (M1 exit, still open), then the remaining [release blockers](architecture-review.md#release-blockers).
- The two Fullstack targets of [ADR-015](site/content/docs/technology-decisions.md#adr-015-fullstack-offers-two-targets-from-one-tanstack-start-app), from **one** TanStack Start app: Docker as today, and serverless through Nitro presets. The file layout must be final before `b7 update` ships, because every restructure after that breaks the upgrade path for existing projects.
- `SECURITY.md` with a private disclosure channel, a supported-versions table and a SemVer promise for generated projects.
- Calling the template production-ready only after M4 ([ROADMAP.md](ROADMAP.md)).

### P0: the first impression
People judge a starter by its live demo, not by its tests. Paid boilerplates sell screens.
- Product screens in the template: a landing page, pricing (reading the billing plans), dashboard, account and organization settings, members and invitations, the billing page, and email templates that look finished.
- Sign-in with Google and GitHub (Better Auth social providers) and magic links. Every SaaS needs them on day one, so they are 1.0 features, not post-1.0 options.

### P0: the upgrade path
This is what turns a starter into a platform.
- **B7 Bot**, the concrete form of this promise: a Dependabot for your boilerplate. Version 1 is a GitHub Action in each generated project, so no server is needed; version 2 is a GitHub App that triggers it on release day and counts installations. It reads `b7.json` and opens a pull request with each template release, merged by the same engine as `b7 update`. A security fix in auth or webhooks reaches every installed project the same day, and active installations measure the north star directly.
- `b7 update`: reads `b7.json`, computes the template diff between the project's version and the latest, and applies it as a three-way merge per file and feature region. Conflicts are left for the user, the way `git merge` does.
- `b7 add <option>`: turns on an option (organizations, billing, storage) in an existing project.
- Codemods and an upgrade guide for every breaking change.
- A public upgrade log: for each release, the template diff and the CI run that updated a project from the previous release with zero manual edits. This is the proof paid boilerplates cannot show.

### P0: agent-native
In 2026 the first stack many people see is the one their agent produces. The cheap parts ship before launch.
- Every generated project ships an `AGENTS.md` (and `CLAUDE.md`) with the module boundaries, the authorization chain, tenant-scoping rules and billing rules.
- The docs site already serves `llms.txt` and `llms-full.txt`. Keep them complete.
- A B7 agent skill (and later an MCP server) that knows the configuration model and can run `create-b7`, published in the public skill and MCP directories.
- A public agent eval with a leaderboard on the landing page: the same task ("add a tenant-scoped feature without breaking isolation") run by several agents on B7, create-t3-app and Better-T-Stack. If B7 wins it is the strongest pitch of 2026; if it loses, it shows what to fix.
- After launch: an agent eval suite: "add a tenant-scoped feature without breaking isolation", run against at least two agents in CI.

### P1: dogfooding
- A real SaaS built on B7 by the maintainer, small but live, with public code, uptime and hosting cost. A product with customers convinces more than any landing page.

### P1: first deploy in under ten minutes
- Deploy buttons: Vercel for the serverless target; Railway, Render or Coolify for the Docker target.
- `create-b7` ends by starting the stack and opening the browser.
- A public live demo with organizations and Stripe in test mode.

### P1: the features buyers expect
These are the features paid boilerplates list on their pricing pages. B7 needs them to replace them: an admin panel, user impersonation, an audit log, file uploads (`storage: s3`), i18n, feature flags, and the AbacatePay adapter (M5).

### P2: ecosystem
- Official recipes ("add Sentry", "add a background job") that are tested like options.
- Community feature packs built as feature regions.
- A showcase of products built with B7.
- Docs in Portuguese and Spanish.

### P2: sustainability
- GitHub Sponsors first.
- Later, an optional paid tier (support, a pro UI kit) that never gates the core.
- Governance in [CONTRIBUTING.md](CONTRIBUTING.md) and a second maintainer with merge rights.
- A community channel (GitHub Discussions first) and `good first issue` labels on tasks taken from [RELEASE.md](RELEASE.md).

## Distribution

**Launch once, when P0 is green.** A broken first impression on Hacker News is permanent.

- Launch posts on Show HN, Product Hunt, r/webdev and X, with one claim we can prove live: "a SaaS with organizations and Stripe, deployed in ten minutes, free and upgradable".
- Video walkthroughs of that claim.
- Honest comparison pages: B7 vs create-t3-app, vs Better-T-Stack, vs Makerkit. Each one says what the other does better.
- **Global first, LATAM second.** The launch that sets B7's reputation is in English, with Stripe. The second wave is Brazilian Portuguese docs, AbacatePay and Pix, a market where no starter competes.

## What we will not do

- **Add choices for the sake of choice.** No Prisma or tRPC toggles. Breadth is Better-T-Stack's game, and every option doubles a test matrix.
- **Gate the core behind payment.** Everything needed to run a production SaaS stays MIT.
- **Start new profile templates before Fullstack 1.0.**
- **Collect telemetry without opt-in.**

## Risks

| Risk | Mitigation |
|------|-----------|
| One maintainer (bus factor) | Written decisions (ADRs), an agent-runnable [RELEASE.md](RELEASE.md), a second maintainer as a goal |
| Young dependencies: TanStack Start, Nitro in beta | Pin versions, test generated projects in CI, keep each integration behind its vendor-documented mount |
| Two Fullstack targets grow CI | One source tree for both, one acceptance suite run against both targets |
| Restructuring the template after projects use `b7 update` | Settle the layout (one app, Nitro presets) before 1.0; any later move ships with a codemod |
| A competitor adds billing and organizations | The upgrade path and the tests are the moat, not the features themselves |
