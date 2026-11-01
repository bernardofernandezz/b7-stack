import { session } from "../modules/auth/procedures";
import { notesRouter } from "../modules/notes/procedures";

export const router = { session, notes: notesRouter };

export type Router = typeof router;
