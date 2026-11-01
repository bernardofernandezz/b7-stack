import { ORPCError, os } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import type { Session } from "../auth/auth";
import { type Permission, roleCan } from "./access";
import { member } from "./schema";

/**
 * The caller's organization and role. The organization comes from the session, never from input, and the
 * member row is read on every call, so removing a member takes effect immediately.
 */
export async function requireMembership(db: Db, userId: string, session: Session["session"]) {
  const organizationId = session.activeOrganizationId;
  if (!organizationId) throw new ORPCError("NO_ACTIVE_ORGANIZATION", { status: 403 });
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  if (!row) throw new ORPCError("FORBIDDEN");
  return { organizationId, role: row.role };
}

/** Checks the role from the member row (see `scoped` in src/rpc/middleware.ts) against the access-control statements. */
export const requirePermission = (permission: Permission) =>
  os.$context<{ scope: { role: string } }>().middleware(({ context, next }) => {
    if (!roleCan(context.scope.role, permission)) throw new ORPCError("FORBIDDEN");
    return next();
  });
