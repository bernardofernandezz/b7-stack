import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { ownerOf } from "../../lib/scope";
import { requirePermission, scoped } from "../../rpc/middleware";
import { checkoutUrl, currentSubscription, entitlementsOf, portalUrl } from "./service";

/** Starting a checkout or opening the portal needs `billing: manage` (with organizations: owners and admins). */
const manager = scoped.use(requirePermission({ billing: ["manage"] }));

export const billingRouter = {
  status: scoped.handler(async ({ context }) => {
    const customerRef = ownerOf(context.scope);
    return {
      subscription: await currentSubscription(context.db, customerRef),
      entitlements: await entitlementsOf(context.db, context.env, customerRef),
    };
  }),

  checkout: manager.input(z.object({ planId: z.string().min(1) })).handler(async ({ context, input }) => ({
    url: await checkoutUrl(context.db, context.env, ownerOf(context.scope), context.user.email, input.planId),
  })),

  portal: manager.handler(async ({ context }) => {
    const url = await portalUrl(context.db, context.env, ownerOf(context.scope));
    if (!url) throw new ORPCError("NOT_FOUND", { message: "No billing account yet" });
    return { url };
  }),
};
