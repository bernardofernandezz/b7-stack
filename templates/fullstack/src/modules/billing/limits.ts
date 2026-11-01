import { ORPCError } from "@orpc/server";
import type { Db } from "../../db/client";
import type { AppEnv } from "../../env";
import { ownerOf, type Scope } from "../../lib/scope";
import { countNotes } from "../notes/service";
import { FREE_NOTE_LIMIT } from "./plans";
import { entitlementsOf } from "./service";

/** The free plan keeps up to FREE_NOTE_LIMIT notes; `unlimited-notes` lifts it. Checked on the server, before the insert. */
export async function requireNoteCapacity(db: Db, env: AppEnv, scope: Scope) {
  if ((await entitlementsOf(db, env, ownerOf(scope))).includes("unlimited-notes")) return;
  if ((await countNotes(db, scope)) >= FREE_NOTE_LIMIT) {
    throw new ORPCError("PLAN_LIMIT", { status: 402, message: `The free plan keeps up to ${FREE_NOTE_LIMIT} notes` });
  }
}
