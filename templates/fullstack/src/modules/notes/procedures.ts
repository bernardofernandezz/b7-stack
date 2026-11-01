import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { authed } from "../../rpc/middleware";
import { createNote, deleteNote, listNotes } from "./service";

export const notesRouter = {
  list: authed.handler(({ context }) => listNotes(context.db, context.user.id)),

  create: authed
    .input(z.object({ content: z.string().trim().min(1).max(500) }))
    .handler(({ context, input }) => createNote(context.db, context.user.id, input.content)),

  delete: authed.input(z.object({ id: z.uuid() })).handler(async ({ context, input }) => {
    if (!(await deleteNote(context.db, context.user.id, input.id))) throw new ORPCError("NOT_FOUND");
  }),
};
