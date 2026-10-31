# Authentication, Organizations and Authorization

B7 Fullstack uses [Better Auth](https://www.better-auth.com/). Auth data lives in your own PostgreSQL (or D1) database through the Drizzle adapter. With `auth = none`, nothing on this page is installed.

## Setup on Workers

- **Compatibility flag.** Better Auth uses `AsyncLocalStorage`, so `wrangler.jsonc` needs `"compatibility_flags": ["nodejs_compat"]`. Hyperdrive's `pg` driver needs the same flag ([Better Auth + Hono](https://www.better-auth.com/docs/integrations/hono)).
- **Mounting.** Better Auth handles Web-standard requests, so no adapter is needed. Inside the Hono app (base path `/api`):

  ```ts
  app.on(["GET", "POST"], "/auth/*", (c) => getAuth(c.env).handler(c.req.raw));
  ```

  The full path `/api/auth/*` matches Better Auth's default `basePath`.
- **Instance per request.** On Workers, the database client comes from request-scoped bindings (`env.HYPERDRIVE`), so B7 builds the auth instance with a factory, `getAuth(env)`, that creates the Drizzle client and returns `betterAuth({...})`.
  **Uncertain:** official Better Auth docs do not prescribe the instance-per-request pattern on Workers. Check its cost and behavior (for example, rate-limit storage and plugin init) against current docs before v1.
- **Schema.** Generate the Better Auth tables with its CLI into the Drizzle schema, and merge them with the application schema in `src/db/schema.ts`. Migrations run through Drizzle Kit.
- **Environment.** `BETTER_AUTH_SECRET` *(secret)*, `BETTER_AUTH_URL` (the public origin). Set `trustedOrigins` explicitly.
- **Session in API code.** A Hono middleware calls `auth.api.getSession({ headers: c.req.raw.headers })` and puts the result on the context. The oRPC context is built from it. See [architecture](architecture.md#tenant-isolation).
- **Session in Start code.** Server functions and loaders call the same `getSession` using the incoming request headers.

## Methods

### Email and password
Enabled by default. Email verification and password reset need `email = resend` (or another `sendEmail()` implementation). Without email, verification is disabled and the CLI warns.

### OAuth
Optional. Each provider adds `<PROVIDER>_CLIENT_ID` and `<PROVIDER>_CLIENT_SECRET` and a callback URL under `/api/auth/callback/<provider>`. Configure only the providers you use.

### Passkeys
Optional, through Better Auth's passkey plugin (WebAuthn). Offer them as an addition to another sign-in method, not as the only one, unless your users are known to have passkey-capable devices.

### Sessions
Better Auth manages sessions with database-backed records and cookies. Cookie attributes and CSRF rules are in [security](../../docs/standards/security.md#sessions-and-authentication).

## Authorization

`authorization = roles` (the default) uses Better Auth's access control: define resources and actions, then build roles from them.

```ts
import { createAccessControl } from "better-auth/plugins/access";

const statement = { project: ["create", "update", "delete"], billing: ["manage"] } as const;
export const ac = createAccessControl(statement);
export const member = ac.newRole({ project: ["create"] });
export const admin  = ac.newRole({ project: ["create", "update", "delete"], billing: ["manage"] });
```

**Uncertain:** confirm the `createAccessControl` import path against your Better Auth version. The docs show the API, and the import path has moved between versions.

Check permissions **on the server**, in oRPC middleware or the service layer, with `auth.api.hasPermission(...)`. The client-side checks are for UI only.

## Organizations and multi-tenancy

`authorization = organizations` adds Better Auth's `organization` plugin:

- **Organizations and memberships.** The default roles are `owner` (full control), `admin` (everything except deleting the org or transferring ownership) and `member` (read). Custom roles come from the same access-control statements as above.
- **Invitations.** The plugin requires a `sendInvitationEmail` callback. B7 implements it with `sendEmail()` from the email module.
- **Active organization.** The session stores `activeOrganizationId`. Clients switch organization with `organization.setActive`. Server code reads the active organization **only from the session**.
- **Teams.** Optional sub-groups (`teams.enabled`). Off by default.
- **Data isolation** is B7's responsibility, not the plugin's. Follow the [tenant isolation rules](architecture.md#tenant-isolation).

**Billing per organization.** When organizations are enabled, the billing customer is the **organization**, not the user. See [billing](billing.md#entitlements).

## Uncertainties to verify

- Better Auth organization plugin on **D1**: there is no documented production guidance yet. Test it before you recommend it.
- Rate-limit storage on Workers: memory storage is per-isolate, so use database or KV storage. Confirm the supported options in the current docs.
