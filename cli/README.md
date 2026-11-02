# create-b7 (preview)

```sh
npm create b7@preview my-app                                  # asks for the template and its options
npm create b7@preview my-app -- -t fullstack --email none     # or: pnpm create b7 my-app -t fullstack --email none
```

A single Go binary with the templates of [`templates/`](../templates) embedded. It copies one, including its `b7.json` (the configuration it implements), creates `.env` with a generated `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD`, runs `pnpm install` and `git init`, showing each step with its time. When a step fails, it prints the end of that step's output. When `pnpm` or Node.js 22.12+ is missing, it says how to install them (Node.js 25+ no longer ships corepack). Without a terminal (piped stdin), the prompts fall back to numbered questions.

Each directory in `templates/` is a template, so adding `templates/web` makes `-t web` available. A template named `<name>` uses `b7-<name>` as its placeholder project name in `package.json` and `README.md`. Today only `fullstack` exists.

| Flag | Effect |
|------|--------|
| `--template`, `-t <name>` | Template to use. Without it, the CLI asks (or takes the first with `--yes`) |
| `--email <resend\|none>` · `--[no-]organizations` · `--billing <stripe\|none>` | [Configuration options](../site/content/docs/configuration-model.md#b7-fullstack). A template offers only those in its `b7.features.json`; the rest are rejected with rule 1. Without a flag, the CLI asks (or uses the default with `--yes`) |
| `--yes`, `-y` | Accept defaults, no prompts |
| `--no-install` · `--no-git` | Skip `pnpm install` · `git init` |
| `--version`, `-v` · `--help`, `-h` | Print the version · usage |

**Preview.** The generated project is tested locally, not yet on a deployed Worker. Read its *Verification status* before deploying.

## Contract

`create-b7` turns a [`B7Config`](../site/content/docs/configuration-model.md#model) into a project:

1. **Collect.** Ask for the profile, then only the options that profile offers. Every prompt also has a flag (`--profile fullstack --billing stripe`).
2. **Validate.** Apply the [rules](../site/content/docs/configuration-model.md#rules). Reject violations with the rule number. Print the EXPERIMENTAL notice where rule 4 applies.
3. **Generate.** Write only the packages, files, Compose services and `.env.example` entries that the [feature table](../site/content/docs/configuration-model.md#fullstack-features-what-each-one-adds) lists for the selected options.
4. **Record.** Write `b7.json` with the resolved configuration, including derived values, for later `b7 add <option>` commands.

All four steps are implemented. Options compose by removing feature regions from the complete template ([ADR-014](../site/content/docs/technology-decisions.md#adr-014-options-compose-by-removing-feature-regions-from-a-complete-template)): a smaller configuration also gets a fresh `drizzle/` migration, a regenerated route tree and an updated lockfile (`pnpm install`, or `--lockfile-only` with `--no-install`). Other profiles and `b7 add` arrive as each gets a tested template ([ROADMAP.md](../docs/ROADMAP.md)).

Shared packages (`packages/`) are created only when two or more templates actually share code.

## Develop

Needs Go (the version in `go.mod`).

```sh
go generate ./...          # copies ../templates into internal/template/templates for go:embed (gitignored)
go test ./...              # rules, regions, and the built binary against every option
go run . my-app --yes      # or: go build && ./create-b7
```

| Path | Role |
|------|------|
| `main.go`, `ui.go` | Flags, prompts ([huh](https://github.com/charmbracelet/huh)), steps and the summary ([lipgloss](https://github.com/charmbracelet/lipgloss)) |
| `internal/config` | Configuration rules 1–4 |
| `internal/regions` | Feature regions (ADR-014) |
| `internal/generate` | Copy, regions, removed options, `b7.json`, `.env` |
| `testdata/` | Rule and region cases, also run by `site/test/b7.test.js` against the landing's JS copy (`site/src/lib/b7/`), so the two never drift |

## Release

npm installs a native binary through optional dependencies, the way esbuild does:

- `create-b7` ([`npm/create-b7`](npm/create-b7)) is a launcher of a few lines that runs the binary for the user's platform.
- `create-b7-<os>-<arch>` (linux-x64, linux-arm64, darwin-x64, darwin-arm64, win32-x64) each hold one binary. They are `optionalDependencies` of `create-b7`, so npm installs only the matching one.

The version lives in `npm/create-b7/package.json`. To release, bump it, commit, and push the tag `v<version>`. [`release.yml`](../.github/workflows/release.yml) checks that the tag matches, runs [GoReleaser](https://goreleaser.com) (`.goreleaser.yaml`: binaries and a GitHub release with checksums), writes the npm packages (`scripts/npm-packages.js`), and publishes them with npm trusted publishing. A prerelease version (`-preview.N`) goes to the `preview` dist-tag.

CI (`.github/workflows/cli.yml`) runs the tests, builds a snapshot, packs the launcher and the linux-x64 package, generates a project through `npm exec`, and runs that project's checks and Compose stack.
