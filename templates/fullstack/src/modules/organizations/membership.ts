import { ORPCError } from "@orpc/server";
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

/** Throws FORBIDDEN unless the role from the member row (see `scoped`) grants every action in `permission`. */
export function requireRole(role: string, permission: Permission) {
  if (!roleCan(role, permission)) throw new ORPCError("FORBIDDEN");
}
