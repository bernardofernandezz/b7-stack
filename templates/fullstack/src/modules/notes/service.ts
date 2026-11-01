import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { note } from "./schema";

// Every query is scoped by the owning user, taken from the session, never from input.
const columns = { id: note.id, content: note.content, createdAt: note.createdAt };

export function listNotes(db: Db, userId: string) {
  return db.select(columns).from(note).where(eq(note.userId, userId)).orderBy(desc(note.createdAt)).limit(100);
}

export async function createNote(db: Db, userId: string, content: string) {
  const [created] = await db.insert(note).values({ userId, content }).returning(columns);
  if (!created) throw new Error("insert returned no row");
  return created;
}

/** Returns false when the note does not exist or belongs to someone else. */
export async function deleteNote(db: Db, userId: string, id: string) {
  const deleted = await db
    .delete(note)
    .where(and(eq(note.id, id), eq(note.userId, userId)))
    .returning({ id: note.id });
  return deleted.length > 0;
}
