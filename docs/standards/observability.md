# Observability

## Baseline

Every deployed service must answer three questions: *Is it up? Is it slow? What failed and for whom?*

- **Structured logs.** JSON with a request ID, route, status and duration. Add `userId` and `organizationId` when they are known. Never log secrets, tokens, full payment payloads or PII beyond IDs. Redact secrets carried in URLs, such as AbacatePay's `webhookSecret` query parameter, from request logs, traces and error reports.
- **Errors** are captured with stack traces and request context.
- **Traces** cover external calls: database, payment providers, email.

## Per deployment target

| Target | Default | Optional |
|--------|---------|----------|
| Cloudflare Workers | Workers Observability (`"observability": { "enabled": true }` in Wrangler) for logs and traces ([docs](https://developers.cloudflare.com/workers/observability/)) | Sentry (`@sentry/cloudflare`); export to an OTLP destination |
| Containers (Docker) | OpenTelemetry SDK, exporting to any OTLP backend. Go: `log/slog` JSON handler | Sentry |
| Systems (CLI) | Structured logs to stderr, `--verbose` flag | — |

## Business signals

For SaaS products, also emit log events (or metrics) for:

- webhook received / verified / duplicate / failed, per provider,
- subscription state transitions,
- queue message retries and dead-lettered messages,
- authentication failures and rate-limit hits.

These are what you will need first during an incident.

## Alerting

Alert on symptoms, not causes: error rate, latency percentiles, webhook failure rate, and queue backlog. Start with a few alerts that would actually wake someone up.
