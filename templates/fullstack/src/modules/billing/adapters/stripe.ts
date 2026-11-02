import Stripe from "stripe";
import type { AppEnv } from "../../../env";
import {
  type BillingProvider,
  type ProviderSubscription,
  type WebhookEvent,
  WebhookVerificationError,
} from "../domain";
import { fromStripeStatus } from "../status";

/** Events that trigger a sync (site/content/docs/stacks/fullstack/billing.md › Stripe). Anything else is acknowledged and ignored. */
const SYNC_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

const clients = new Map<string, Stripe>();

/** One client per key, on the fetch HTTP client: web-standard I/O, and tests fake Stripe at the fetch boundary. */
export function stripeClient(env: AppEnv) {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Billing is not configured: set STRIPE_SECRET_KEY");
  let client = clients.get(key);
  if (!client) {
    // The SDK pins its API version (Stripe.API_VERSION); upgrading the package is the deliberate way to move it.
    // Resolve the global fetch on every call rather than once, so a replaced fetch (tests) is always the one used.
    const httpClient = Stripe.createFetchHttpClient((input, init) => fetch(input, init));
    client = new Stripe(key, { httpClient, maxNetworkRetries: 2 });
    clients.set(key, client);
  }
  return client;
}

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : (value?.id ?? null);

export function stripeProvider(env: AppEnv): BillingProvider {
  return {
    name: "stripe",

    async verifyWebhook(request, rawBody) {
      const signature = request.headers.get("stripe-signature");
      if (!signature) throw new WebhookVerificationError("missing Stripe-Signature", 400);
      if (!env.STRIPE_WEBHOOK_SECRET) throw new Error("Billing is not configured: set STRIPE_WEBHOOK_SECRET");
      try {
        // Default tolerance (5 minutes). Never 0, which would disable replay protection.
        const event = stripeClient(env).webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
        return { id: event.id, type: event.type, data: event.data.object };
      } catch {
        throw new WebhookVerificationError("invalid Stripe signature", 400);
      }
    },

    subscriptionIdFrom(event: WebhookEvent) {
      if (!SYNC_EVENTS.has(event.type)) return null;
      const object = event.data as Record<string, unknown>;
      if (event.type.startsWith("customer.subscription.")) return idOf(object.id as string);
      if (event.type === "checkout.session.completed") return idOf(object.subscription as string | null);
      // Invoices: current API objects carry it under parent.subscription_details; older ones at the top level.
      const parent = object.parent as { subscription_details?: { subscription?: string | { id: string } } } | null;
      return idOf(parent?.subscription_details?.subscription ?? (object.subscription as string | null));
    },

    async fetchSubscription(id): Promise<ProviderSubscription> {
      const sub = await stripeClient(env).subscriptions.retrieve(id);
      const item = sub.items.data[0];
      return {
        id: sub.id,
        status: fromStripeStatus(sub.status),
        currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
        priceId: item?.price.id ?? null,
        customerRef: sub.metadata.customer_ref || null,
        providerCustomerId: idOf(sub.customer),
      };
    },
  };
}
