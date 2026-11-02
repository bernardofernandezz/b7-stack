---
title: "B7 Systems"
---

**Purpose:** CLIs, networking tools, automation, developer tools and system utilities.

## Defaults

| Concern | Default | Options |
|---------|---------|---------|
| Language | Go | — |
| Persistence | none | SQLite through `database/sql`, when state must survive between runs |
| CLI parsing | standard library `flag` | A CLI library when subcommands grow complex |
| Logging | `log/slog` to stderr | — |
| Testing | `go test` | — |
| Distribution | Single static binary through GitHub Releases, built with GitHub Actions | Docker image, when the tool runs as a service |

## Conventions

- `cmd/<name>/main.go` for each binary. Shared code goes in `internal/`.
- Exit codes are meaningful: `0` ok, `1` error, `2` usage error.
- Machine-readable output (`--json`) for anything that scripts might consume.
- Configuration precedence: flags, then environment, then config file.

## When to choose another profile

- It serves HTTP to other systems as its main job: use **[B7 API](/docs/stacks/api)** with the Go track.
