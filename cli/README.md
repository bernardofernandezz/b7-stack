# create-b7 (preview)

```sh
npm create b7@preview my-app                                  # asks for the template and its options
npm create b7@preview my-app -- -t fullstack --email none     # or: pnpm create b7 my-app -t fullstack --email none
```

Copies a template from [`templates/`](../templates), including its `b7.json` (the configuration it implements), creates `.env` with a generated `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD`, runs `git init` and `pnpm install` (when pnpm is missing it says how to install it, since Node.js 25+ no longer ships corepack).

Each directory in `templates/` is a template, so adding `templates/web` makes `-t web` available. A template named `<name>` uses `b7-<name>` as its placeholder project name in `package.json` and `README.md`. Today only `fullstack` exists.

| Flag | Effect |
|------|--------|
| `--template`, `-t <name>` | Template to use. Without it, the CLI asks (or takes the first with `--yes`) |
| `--email <resend\|none>` · `--[no-]organizations` · `--billing <stripe\|none>` | [Configuration options](../docs/configuration-model.md#b7-fullstack). A template offers only those in its `b7.features.json`; the rest are rejected with rule 1. Without a flag, the CLI asks (or uses the default with `--yes`) |
| `--yes`, `-y` | Accept defaults, no prompts |
| `--no-install` · `--no-git` | Skip `pnpm install` · `git init` |
| `--version`, `-v` · `--help`, `-h` | Print the version · usage |

**Preview.** The generated project is tested locally, not yet on a deployed Worker. Read its *Verification status* before deploying.

## Contract

`create-b7` turns a [`B7Config`](../docs/configuration-model.md#model) into a project:

1. **Collect.** Ask for the profile, then only the options that profile offers. Every prompt also has a flag (`--profile fullstack --billing stripe`).
2. **Validate.** Apply the [rules](../docs/configuration-model.md#rules). Reject violations with the rule number. Print the EXPERIMENTAL notice where rule 4 applies.
3. **Generate.** Write only the packages, files, Compose services and `.env.example` entries that the [feature table](../docs/configuration-model.md#fullstack-features-what-each-one-adds) lists for the selected options.
4. **Record.** Write `b7.json` with the resolved configuration, including derived values, for later `b7 add <option>` commands.

All four steps are implemented. Options compose by removing feature regions from the complete template ([ADR-014](../docs/technology-decisions.md#adr-014-options-compose-by-removing-feature-regions-from-a-complete-template)): a smaller configuration also gets a fresh `drizzle/` migration, a regenerated route tree and an updated lockfile (`pnpm install`, or `--lockfile-only` with `--no-install`). Other profiles and `b7 add` arrive as each gets a tested template ([ROADMAP.md](../ROADMAP.md)).

Shared packages (`packages/`) are created only when two or more templates actually share code.

## Develop

`pnpm install && pnpm test` runs the CLI against `../templates`. `npm pack` copies the templates into the package (`scripts/copy-template.js`). CI (`.github/workflows/cli.yml`) packs it, generates a project and runs that project's checks.
