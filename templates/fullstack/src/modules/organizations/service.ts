import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { member, organization } from "./schema";

/** The session's active organization, only if the user is still a member of it (else null). For display; procedures use `scoped`. */
export async function activeOrganization(db: Db, userId: string, organizationId: string | null | undefined) {
  if (!organizationId) return null;
  const [row] = await db
    .select({ id: organization.id, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  return row ?? null;
}
