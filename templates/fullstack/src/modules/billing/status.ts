import type { SubscriptionStatus } from "./domain";

const STRIPE: Record<string, SubscriptionStatus> = {
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  unpaid: "suspended",
  paused: "suspended",
  canceled: "canceled",
};

/** Unknown values are not entitled and are logged, so a new provider status never grants access. */
function unknownStatus(provider: string, status: string): SubscriptionStatus {
  console.warn(`[billing] unknown ${provider} subscription status "${status}", mapped to suspended`);
  return "suspended";
}

export function fromStripeStatus(status: string): SubscriptionStatus {
  return STRIPE[status] ?? unknownStatus("stripe", status);
}

/** EXPERIMENTAL. AbacatePay has no past_due/suspended states and no period-end field. */
export function fromAbacatePayStatus(status: string, trialEndsAt: Date | null, now: Date): SubscriptionStatus {
  switch (status) {
    case "PENDING":
      return "incomplete";
    case "ACTIVE":
      return trialEndsAt && trialEndsAt > now ? "trialing" : "active";
    case "CANCELLED":
      return "canceled";
    default:
      return unknownStatus("abacatepay", status);
  }
}
