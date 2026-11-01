import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { note } from "./schema";

/** Who is asking, from the session (see `scoped` in src/rpc/middleware.ts), never from input. */
export type Scope = {
  userId: string;
  // #if organizations
  organizationId: string;
  // #endif
};

const columns = { id: note.id, content: note.content, createdAt: note.createdAt };

/** Every query is filtered by the scope: notes are shared within an organization, or private to a user without organizations. */
function inScope(scope: Scope) {
  let owner = eq(note.userId, scope.userId);
  // #if organizations
  owner = eq(note.organizationId, scope.organizationId);
  // #endif
  return owner;
}

export function listNotes(db: Db, scope: Scope) {
  return db.select(columns).from(note).where(inScope(scope)).orderBy(desc(note.createdAt)).limit(100);
}

export async function createNote(db: Db, scope: Scope, content: string) {
  const [created] = await db
    .insert(note)
    .values({
      userId: scope.userId,
      // #if organizations
      organizationId: scope.organizationId,
      // #endif
      content,
    })
    .returning(columns);
  if (!created) throw new Error("insert returned no row");
  return created;
}

/** Returns false when the note does not exist or is outside the caller's scope. */
export async function deleteNote(db: Db, scope: Scope, id: string) {
  const deleted = await db
    .delete(note)
    .where(and(eq(note.id, id), inScope(scope)))
    .returning({ id: note.id });
  return deleted.length > 0;
}
