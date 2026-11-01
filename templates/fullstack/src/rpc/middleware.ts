import { ORPCError, os } from "@orpc/server";
import type { Db } from "../db/client";
import type { Auth } from "../modules/auth/auth";
// #if organizations
import { requireMembership } from "../modules/organizations/membership";
// #endif

export type RpcContext = { db: Db; auth: Auth; headers: Headers };

export const base = os.$context<RpcContext>();

export const requireSession = base.middleware(async ({ context, next }) => {
  const result = await context.auth.api.getSession({ headers: context.headers });
  if (!result) throw new ORPCError("UNAUTHORIZED");
  return next({ context: { user: result.user, session: result.session } });
});

export const authed = base.use(requireSession);

/** The data scope of tenant procedures: the caller's organization when organizations are enabled, the user otherwise. */
export const scoped = authed.use(async ({ context, next }) => {
  const scope = {
    userId: context.user.id,
    // #if organizations
    ...(await requireMembership(context.db, context.user.id, context.session)),
    // #endif
  };
  return next({ context: { scope } });
});
