// Provider-neutral billing contract (stacks/fullstack/billing.md). One adapter per provider implements BillingProvider.

export type SubscriptionStatus = "incomplete" | "trialing" | "active" | "past_due" | "suspended" | "canceled";

const ENTITLED: ReadonlySet<SubscriptionStatus> = new Set(["trialing", "active", "past_due"]);

export type Plan<TFeature extends string = string> = {
  id: string;
  /** The provider's price or product ID. */
  providerPriceId: string;
  entitlements: readonly TFeature[];
};

/** Entitlements are derived on read, never stored. Anything not entitled falls back to the free set. */
export function entitlementsFor<TFeature extends string>(
  subscription: { status: SubscriptionStatus; planId: string } | null,
  plans: readonly Plan<TFeature>[],
  free: readonly TFeature[],
): readonly TFeature[] {
  if (!subscription || !ENTITLED.has(subscription.status)) return free;
  return plans.find((plan) => plan.id === subscription.planId)?.entitlements ?? free;
}

export type WebhookEvent = { id: string; type: string; data: unknown };

/** Current provider state. Webhooks only trigger a fetch of this; state never comes from event payloads. */
export type ProviderSubscription = {
  id: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  /** The provider's price, mapped to a plan through `providerPriceId`. */
  priceId: string | null;
  /** Set at checkout (Stripe: subscription metadata). Null for subscriptions created outside the app. */
  customerRef: string | null;
  providerCustomerId: string | null;
};

/** Thrown when a webhook fails verification. `status` is the HTTP response (400 bad signature, 401 bad secret). */
export class WebhookVerificationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401,
  ) {
    super(message);
  }
}

/** One implementation per provider: `adapters/stripe.ts` or `adapters/abacatepay.ts`. */
export interface BillingProvider {
  readonly name: "stripe" | "abacatepay";
  /** Verifies the raw body exactly as received. Throws WebhookVerificationError. */
  verifyWebhook(request: Request, rawBody: string): Promise<WebhookEvent>;
  /** The subscription the event refers to, or null for event types that do not trigger a sync. */
  subscriptionIdFrom(event: WebhookEvent): string | null;
  fetchSubscription(providerSubscriptionId: string): Promise<ProviderSubscription>;
}
