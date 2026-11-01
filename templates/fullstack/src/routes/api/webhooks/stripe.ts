import { createFileRoute } from "@tanstack/react-router";
import { stripeProvider } from "../../../modules/billing/adapters/stripe";
import { WebhookVerificationError } from "../../../modules/billing/domain";
import { plans } from "../../../modules/billing/plans";
import { processWebhook } from "../../../modules/billing/sync";

// Point a Stripe webhook endpoint at https://<APP_URL>/api/webhooks/stripe with the events in adapters/stripe.ts.
export const Route = createFileRoute("/api/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const provider = stripeProvider(context.env);
        // The body is read once, as text, and that exact string is verified and then parsed.
        const rawBody = await request.text();
        let event: Awaited<ReturnType<typeof provider.verifyWebhook>>;
        try {
          event = await provider.verifyWebhook(request, rawBody);
        } catch (error) {
          if (error instanceof WebhookVerificationError) return new Response(error.message, { status: error.status });
          throw error;
        }
        // Any error below is a 500: the transaction rolled back, and Stripe retries the event.
        return Response.json({ result: await processWebhook(context.db, provider, plans(context.env), event) });
      },
    },
  },
});
