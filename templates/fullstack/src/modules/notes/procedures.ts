// biome-ignore-all assist/source/organizeImports: B7 feature regions
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { scoped } from "../../rpc/middleware";
// #if billing
import { requireNoteCapacity } from "../billing/limits";
// #endif
import { createNote, deleteNote, listNotes } from "./service";

export const notesRouter = {
  list: scoped.handler(({ context }) => listNotes(context.db, context.scope)),

  create: scoped.input(z.object({ content: z.string().trim().min(1).max(500) })).handler(async ({ context, input }) => {
    // #if billing
    await requireNoteCapacity(context.db, context.env, context.scope);
    // #endif
    return createNote(context.db, context.scope, input.content);
  }),

  delete: scoped.input(z.object({ id: z.uuid() })).handler(async ({ context, input }) => {
    if (!(await deleteNote(context.db, context.scope, input.id))) throw new ORPCError("NOT_FOUND");
  }),
};
