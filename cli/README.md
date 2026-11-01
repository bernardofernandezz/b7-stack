# create-b7 (preview)

```sh
npm create b7@latest my-app        # or: pnpm create b7 my-app
```

Generates the [B7 Fullstack reference implementation](../templates/fullstack/README.md) for `{ "profile": "fullstack", "options": { "email": "resend" } }`, writes `b7.json`, creates `.dev.vars` with a generated `BETTER_AUTH_SECRET`, runs `git init` and `pnpm install`.

| Flag | Effect |
|------|--------|
| `--yes`, `-y` | Accept defaults, no prompts |
| `--profile <name>` | Only `fullstack` is available |
| `--no-install` · `--no-git` | Skip `pnpm install` · `git init` |

**Preview.** The generated project is tested locally, not yet on a deployed Worker. Read its *Verification status* before deploying.

## Contract

`create-b7` turns a [`B7Config`](../docs/configuration-model.md#model) into a project:

1. **Collect.** Ask for the profile, then only the options that profile offers. Every prompt also has a flag (`--profile fullstack --billing stripe`).
2. **Validate.** Apply the [rules](../docs/configuration-model.md#rules). Reject violations with the rule number. Print the EXPERIMENTAL notice where rule 4 applies.
3. **Generate.** Write only the packages, files, Wrangler sections and `.dev.vars.example` entries that the [feature table](../docs/configuration-model.md#fullstack-features-what-each-one-adds) lists for the selected options.
4. **Record.** Write `b7.json` with the resolved configuration, including derived values, for later `b7 add <option>` commands.

The preview implements steps 1, 3 and 4 for the one tested configuration. Options, validation rules, other profiles and `b7 add` arrive as each gets a tested template ([ROADMAP.md](../ROADMAP.md)).

Shared packages (`packages/`) are created only when two or more templates actually share code.

## Develop

`pnpm install && pnpm test` runs the CLI against `../templates`. `npm pack` copies the templates into the package (`scripts/copy-template.js`). CI (`.github/workflows/cli.yml`) packs it, generates a project and runs that project's checks.
