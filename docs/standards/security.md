# Security

These are baseline requirements for every profile. Profile-specific details link back here.

## Secrets

- Never commit secrets. Use `.dev.vars` (Workers) or `.env` locally, list them in `.gitignore`, and commit an `.env.example` with names only.
- Production: on Workers, use `wrangler secret put`. On containers, use the platform's secret store. On GitHub Actions, use repository or environment secrets.
- Server secrets never reach client bundles. Only explicitly public values (such as `TURNSTILE_SITE_KEY`) may be exposed.
- Rotate on suspicion of exposure. Payment webhook secrets in particular support rolling (Stripe) or re-creation (AbacatePay).

## Sessions and authentication

- Use Better Auth's session cookies: `HttpOnly`, `Secure`, `SameSite=Lax` or stricter. Do not store session tokens in `localStorage`.
- Set `trustedOrigins` explicitly. With credentialed CORS, never use a `*` origin.
- Require re-authentication or a fresh session for sensitive actions such as changing email or password, deleting an organization, or changing billing.
- Rate-limit sign-in, sign-up, password reset and invitation endpoints. Better Auth includes rate limiting, so configure its storage for Workers. **Uncertain:** confirm the right storage backend (database or KV) against current Better Auth docs.

## CSRF

- Cookie-authenticated, state-changing endpoints must reject cross-site requests. Better Auth checks `Origin` against `trustedOrigins` for its own routes. For your own Hono routes, use Hono's `csrf()` middleware or an equivalent Origin check.
- Webhook endpoints are **exempt** from CSRF because they are not cookie-authenticated. They rely on signature verification instead.

## Input validation

- Every procedure and route validates input with Zod (TS) or explicit decoding (Go) before any side effect.
- Bound sizes: request bodies, uploads (R2), array lengths and string lengths.
- Use parameterized queries only (Drizzle, SQLC). Never build SQL by string concatenation.

## Authorization and tenant isolation

- Run authorization checks on the server for every request. A hidden UI element is not access control.
- Scope every tenant-owned query by `organizationId`, taken from the **session**, never from client input alone. See [fullstack architecture](../../stacks/fullstack/architecture.md#tenant-isolation).

## Webhooks

1. Read the **raw body** before parsing.
2. Verify the signature or secret exactly as the provider documents it, with a constant-time comparison.
3. Reject when verification fails. Respond `400` or `401`, and do no processing.
4. Deduplicate by provider event ID before side effects.
5. Return `2xx` quickly. Move slow work to a queue.

Provider-specific details are in [billing](../../stacks/fullstack/billing.md#webhook-verification).

## Bot protection

Use Cloudflare Turnstile on public forms (sign-up, contact, password reset) and verify its token on the server.

## Dependencies

- Keep the dependency count low. Every dependency is attack surface.
- Enable Dependabot or Renovate, and review updates to auth, crypto and payment packages first.
