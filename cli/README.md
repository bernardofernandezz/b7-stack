# create-b7 (planned)

**Not implemented in v0.1.** This page states what the future generator will do, so that the documentation and the configuration model stay implementable.

## Contract

`create-b7` turns a [`B7Config`](../docs/configuration-model.md#model) into a project:

1. **Collect.** Prompt for the profile, then for each dimension, showing only values allowed for that profile. Every prompt can be answered with flags (`--profile fullstack --billing stripe`) for non-interactive use.
2. **Validate.** Apply the [compatibility rules](../docs/configuration-model.md#compatibility-rules). Reject hard-rule violations with the rule number, and print warnings for recommendations.
3. **Generate.** For each selected feature, write only the files, dependencies, Wrangler sections and `.env.example` / `.dev.vars.example` entries listed in the [feature table](../docs/configuration-model.md#features). Unselected features leave no trace.
4. **Record.** Write `b7.json` with the resolved configuration, so later `b7 add <feature>` commands can apply the same rules.

## Roadmap

| Phase | Deliverable |
|-------|-------------|
| 0.1 | Documentation and configuration model (this repository) |
| 0.2 | Machine-readable config schema derived from the configuration model, plus a validator with tests for every rule |
| 0.3 | `templates/fullstack`: a working B7 Fullstack base (auth, roles, PostgreSQL + Hyperdrive) deployed to Workers, with the server-entry and auth uncertainties resolved |
| 0.4 | Fullstack feature modules: billing (Stripe, AbacatePay), organizations, email, R2, Queues/Cron |
| 0.5 | `create-b7` CLI for Fullstack, then the Web, API (TS/Go), Systems and Intelligence templates |

Shared packages (for example, a `packages/` directory with shared TS config) are added only when two or more templates actually share code.
