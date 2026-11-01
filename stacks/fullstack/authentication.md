# Authentication, Authorization and Tenant Isolation (v0.2, proposed)

Better Auth is **CORE** in B7 Fullstack (`A5`): every Fullstack project has users and sessions. Organizations are **OPTIONAL**. Decision IDs and evidence are in [architecture-review.md](../../architecture-review.md).

## Mounting and runtime

| Item | Rule | Evidence |
|------|------|----------|
| Route | `src/routes/api/auth/$.ts`, with `GET` and `POST` handlers returning `context.auth.handler(request)` | [Better Auth installation, TanStack Start](https://www.better-auth.com/docs/installation) |
| Runtime flag | `compatibility_flags: ["nodejs_compat"]` (Better Auth uses `AsyncLocalStorage`) | [Better Auth installation](https://www.better-auth.com/docs/installation), [Better Auth + Hono](https://www.better-auth.com/docs/integrations/hono) |
| Cookies from server-side auth calls | Not needed, because B7 performs sign-in, sign-up and sign-out only through `/api/auth/*` from the browser. If a server-side flow must set auth cookies, add the `tanstackStartCookies` plugin as the **last** plugin | [Better Auth + TanStack](https://www.better-auth.com/docs/integrations/tanstack) |
| Database adapter | Drizzle adapter, `provider: "pg"`, with the request's Drizzle instance | [Better Auth Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle) |
| Schema | Generate the Better Auth tables with the Better Auth CLI (the `auth` package; `@better-auth/cli` is deprecated), commit them into the Drizzle schema, and migrate with Drizzle Kit | same |
| Background tasks | `advanced.backgroundTasks.handler` runs deferred work such as the verification email after the response and logs its failures | Better Auth `advanced.backgroundTasks` option |
| Base URL | Set `baseURL` explicitly (from `BETTER_AUTH_URL`) | [Better Auth options](https://better-auth.com/docs/reference/options) |

**Doc inconsistency (resolved).** The installation page imports the Drizzle adapter from `better-auth/adapters/drizzle`, while the adapter page imports it from `@better-auth/drizzle-adapter`. In `better-auth` 1.7 both resolve, and `better-auth/adapters/drizzle` re-exports the bundled adapter, so the reference implementation uses it and adds no dependency.

## Instance lifecycle

- `createAuth({ db, env })` builds **one** Better Auth instance per process, on the first request, next to the process-wide database pool (see [architecture](architecture.md#database-client-lifecycle)). The request middleware passes both in the request context.
- That example is not an explicit endorsement of per-request instances. **UNVERIFIED:** the CPU cost of construction (test `BA-T1`).
- Plugins and access-control statements are defined at module scope (they are pure configuration), and only the database and secrets are injected per request.

## Sessions and cookies

| Setting | B7 default | Reason |
|---------|-----------|--------|
| Session storage | Database (PostgreSQL) | Single source of truth, no extra service |
| `session.cookieCache` | **Disabled** (`A6`) | When enabled, revocation (sign-out, ban, removal) is not seen until the cache expires ([session management](https://www.better-auth.com/docs/concepts/session-management)). Enable it only as a measured optimization with `maxAge` ≤ 5 min, and document the window |
| `secondaryStorage` | **DEFERRED** | It would need KV, which is eventually consistent and offers no atomic increment |
| Expiry | Better Auth defaults (`expiresIn` 7 days, refreshed per `updateAge`) | Documented defaults |
| Cookie attributes | Better Auth defaults (`HttpOnly`, `Secure`) | See [security standard](../../docs/standards/security.md#sessions-and-authentication) |
| Fresh session | Better Auth `freshAge` (1 day) for sensitive actions | Documented default |

Cost: `GET /get-session` refreshes sessions with database writes, and without the cookie cache, every authenticated request reads the session from PostgreSQL ([session management](https://www.better-auth.com/docs/concepts/session-management)). That is accepted for correctness.

## Rate limiting

Configuration ([Better Auth rate limit](https://www.better-auth.com/docs/concepts/rate-limit)):

```ts
rateLimit: { enabled: true, storage: "database" },
advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
```

- The default memory storage is unsuitable for serverless, per Better Auth's docs.
- Rate limiting is disabled in development by default. Enable it in staging so it gets tested (test `BA-T2`).
- Rate limiting for **non-auth** endpoints is **DEFERRED**. Use Caddy rate limiting (a plugin) or an upstream WAF if it is needed before B7 defines an in-app mechanism.

## Sign-in methods

| Method | Status | Notes |
|--------|--------|-------|
| Email + password | CORE | Runs in a Node.js process, so the Workers CPU limit (`W-1`, `A12`) no longer applies |
| Email verification and password reset | DERIVED: enabled when `email = resend` | Without email, verification is off, and the CLI warns |
| OAuth providers | OPTIONAL (per provider) | `<PROVIDER>_CLIENT_ID` and `<PROVIDER>_CLIENT_SECRET` |
| Passkeys | **EXPERIMENTAL** (`A10`) | Not part of the first reference implementation |

## Authorization model

Authorization runs **only on the server, in oRPC middleware, before any service call**. Client-side checks are for UI only.

### Without organizations

There are user-level procedures only. `requireSession` loads the session through `context.auth.api.getSession({ headers })`. Global admin roles are **DEFERRED**.

### With organizations (OPTIONAL)

Uses the Better Auth `organization` plugin ([docs](https://www.better-auth.com/docs/plugins/organization)): organizations, members, invitations, and the default roles `owner`, `admin` and `member`. **Teams and dynamic roles are DEFERRED.**

Every org-scoped procedure runs this chain. Nothing in it trusts client-supplied organization IDs, roles or permissions:

1. **`requireSession`** loads the session. No session gives `UNAUTHORIZED`.
2. **`requireMembership`** reads `organizationId` from `session.activeOrganizationId`, **never from input**. If it is `null` (the default for new sessions), it fails with `NO_ACTIVE_ORGANIZATION`. It then loads the `member` row `WHERE organization_id = $org AND user_id = $user` from PostgreSQL (uncached binding). If there is no row, it fails with `FORBIDDEN`. **The active organization ID alone never proves membership.** A user removed from an org keeps a stale `activeOrganizationId` until it is changed.
3. **`requirePermission(statement)`** checks the **role from the freshly loaded member row** against B7's access-control statements (`createAccessControl` from `better-auth/plugins/access`), in `src/modules/organizations/`. B7 does not call `auth.api.hasPermission`, so test `M-T4` is not needed; using it later requires `M-T4` first.
4. The procedure receives `{ userId, organizationId, role }` from middleware context and passes `organizationId` explicitly to services.

Procedures that act on a specific resource load that resource **with** `organization_id = ctx.organizationId` in the `WHERE` clause. A resource ID belonging to another organization therefore produces `NOT_FOUND`, not a leak.

Initial active organization: creating an organization or accepting an invitation makes it active (Better Auth does this). A user with none sees "Create your organization". Step 2 still applies.

Invitations require the plugin's `sendInvitationEmail` callback, so **organizations ⇒ email** is a hard rule (see the [configuration model](../../docs/configuration-model.md#rules)).

## Tenant isolation

- Every tenant-owned table has `organization_id NOT NULL` and an index that leads with it.
- Service functions take `organizationId` as a parameter and include it in every `SELECT`, `UPDATE` and `DELETE`, and in every insert.
- There are no "global" queries over tenant tables outside explicitly named admin or maintenance code paths.
- R2 keys (if storage is selected) use the prefix `org/<organizationId>/`. Presigned URLs are short-lived.
- **Row-level security is OPTIONAL defense in depth, not the primary control.** With a shared pool, it requires every request's queries to run in a transaction that sets `set_config('app.org_id', $1, true)`, which holds a pooled connection for the whole request.

## Acceptance tests

`BA-T1`, `BA-T2`, `W-1`, `H-T1` (revocation is immediate), `H-T2` (removed member is rejected), `M-T1`–`M-T4`. Definitions are in [architecture-review.md](../../architecture-review.md#required-acceptance-tests).
