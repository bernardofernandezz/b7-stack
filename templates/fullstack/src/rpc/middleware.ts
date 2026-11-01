// biome-ignore-all assist/source/organizeImports: B7 feature regions
import { ORPCError, os } from "@orpc/server";
import type { Db } from "../db/client";
import type { AppEnv } from "../env";
import type { Scope } from "../lib/scope";
import type { Auth } from "../modules/auth/auth";
// #if organizations
import { requireMembership, requireRole } from "../modules/organizations/membership";
// #endif

export type RpcContext = { db: Db; auth: Auth; env: AppEnv; headers: Headers };

export const base = os.$context<RpcContext>();

export const requireSession = base.middleware(async ({ context, next }) => {
  const result = await context.auth.api.getSession({ headers: context.headers });
  if (!result) throw new ORPCError("UNAUTHORIZED");
  return next({ context: { user: result.user, session: result.session } });
});

export const authed = base.use(requireSession);

/** The data scope of tenant procedures: the caller's organization when organizations are enabled, the user otherwise. */
export const scoped = authed.use(async ({ context, next }) => {
  const scope: Scope = {
    userId: context.user.id,
    // #if organizations
    ...(await requireMembership(context.db, context.user.id, context.session)),
    // #endif
  };
  return next({ context: { scope } });
});

/**
 * Allows the call only if the caller may perform `permission` (e.g. `{ billing: ["manage"] }`). With organizations,
 * the role from the member row decides. Without them, users act only on their own data, so every user may.
 */
export const requirePermission = (permission: Record<string, string[]>) =>
  os.$context<{ scope: Scope }>().middleware((options) => {
    // #if organizations
    requireRole(options.context.scope.role, permission);
    // #endif
    void permission; // checked only with organizations
    return options.next();
  });
