import { createHash, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { stripeProvider } from "../../../modules/billing/adapters/stripe";
import { plans } from "../../../modules/billing/plans";
import { reconcile } from "../../../modules/billing/sync";

const digest = (value: string) => createHash("sha256").update(value).digest();

// Called daily by the scheduler service (compose.yaml). Caddy does not route /api/internal/* from outside.
export const Route = createFileRoute("/api/internal/reconcile")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const secret = context.env.CRON_SECRET;
        if (!secret) {
          console.error("[billing] CRON_SECRET is not set: daily reconciliation is disabled");
          return new Response("CRON_SECRET is not set", { status: 503 });
        }
        const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
        if (!timingSafeEqual(digest(given), digest(secret))) return new Response("Unauthorized", { status: 401 });
        return Response.json(await reconcile(context.db, stripeProvider(context.env), plans(context.env)));
      },
    },
  },
});
