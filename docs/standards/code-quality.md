# Code Quality

## All languages

- **Modules by domain, not by layer.** Use `src/modules/billing/`, not `src/controllers/` plus `src/services/` spread across the tree.
- **Validate at boundaries, trust inside.** Parse external input once, where it enters (HTTP, queue message, webhook, env), and pass typed values inward.
- **No speculative abstraction.** Add an interface when a second implementation actually exists. B7's billing provider interface is the reference example.
- **Errors are values or typed exceptions, never strings.** Map them to HTTP responses in one place per entry point.
- **Configuration from the environment, parsed once at startup or once per request.** No `process.env` reads scattered through code.
- **Small, reviewed changes.** CI must pass formatting, linting, type checking and tests before merge.

## TypeScript

- `strict: true`. No `any` without a comment that explains why.
- Format and lint with Biome, or ESLint + Prettier. Pick one per repository, not both.
- Zod schemas are the source of truth for request and response shapes. Infer types from them, and do not duplicate them by hand.
- Only Web-standard APIs in code that may run on Workers. Node built-ins only where `nodejs_compat` supports them ([Workers Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)).
- Use Bun for scripts and package management. Commit the lockfile.

## Go

- `gofmt`, `go vet` and `staticcheck` in CI.
- Use the standard library first: `net/http`, `log/slog`, `database/sql`, `context`.
- Pass `context.Context` as the first argument through every I/O path.
- Wrap errors with `%w`. Check them with `errors.Is` and `errors.As`.

## Python

- `ruff` for lint and format. Type hints with `mypy` or `pyright` on library and service code.
- Use `uv` (recommended) or pip-tools for locked environments.
- Notebooks are for exploration. Production code lives in modules with tests.
