// biome-ignore-all assist/source/organizeImports: B7 feature regions
import { session } from "../modules/auth/procedures";
import { notesRouter } from "../modules/notes/procedures";
// #if billing
import { billingRouter } from "../modules/billing/procedures";
// #endif

export const router = {
  session,
  notes: notesRouter,
  // #if billing
  billing: billingRouter,
  // #endif
};

export type Router = typeof router;
