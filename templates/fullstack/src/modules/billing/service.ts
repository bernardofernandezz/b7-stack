import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import type { AppEnv } from "../../env";
import { stripeClient } from "./adapters/stripe";
import { entitlementsFor } from "./domain";
import { FREE, plans } from "./plans";
import { billingCustomers, subscriptions } from "./schema";

/** The customer's newest subscription, or null. */
export async function currentSubscription(db: Db, customerRef: string) {
  const [row] = await db
    .select({
      planId: subscriptions.planId,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(eq(subscriptions.customerRef, customerRef))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return row ?? null;
}

/** Derived on read from the subscription status (billing.md › Entitlements); never stored. */
export async function entitlementsOf(db: Db, env: AppEnv, customerRef: string) {
  return entitlementsFor(await currentSubscription(db, customerRef), plans(env), FREE);
}

const savedCustomer = async (db: Db, customerRef: string) =>
  (
    await db
      .select({ id: billingCustomers.providerCustomerId })
      .from(billingCustomers)
      .where(and(eq(billingCustomers.provider, "stripe"), eq(billingCustomers.customerRef, customerRef)))
  )[0]?.id;

/** The Stripe customer for `customerRef`, created once and remembered, so every checkout reuses it. */
async function stripeCustomer(db: Db, env: AppEnv, customerRef: string, email: string): Promise<string> {
  const existing = await savedCustomer(db, customerRef);
  if (existing) return existing;
  const customer = await stripeClient(env).customers.create({ email, metadata: { customer_ref: customerRef } });
  // A concurrent checkout may have saved one first; keep that one (the extra Stripe customer stays unused).
  await db
    .insert(billingCustomers)
    .values({ provider: "stripe", customerRef, providerCustomerId: customer.id })
    .onConflictDoNothing();
  const saved = await savedCustomer(db, customerRef);
  if (!saved) throw new Error(`Stripe customer ${customer.id} is already linked to another customer_ref`);
  return saved;
}

/**
 * A Stripe Checkout URL for `planId`. The session links back through `customer` and the subscription's
 * `metadata.customer_ref` (S-T3). Returning from Checkout changes nothing: only the webhook or reconciliation does.
 */
export async function checkoutUrl(db: Db, env: AppEnv, customerRef: string, email: string, planId: string) {
  const plan = plans(env).find((p) => p.id === planId);
  if (!plan?.providerPriceId) throw new Error(`Billing is not configured for plan "${planId}"`);
  const session = await stripeClient(env).checkout.sessions.create({
    mode: "subscription",
    customer: await stripeCustomer(db, env, customerRef, email),
    line_items: [{ price: plan.providerPriceId, quantity: 1 }],
    subscription_data: { metadata: { customer_ref: customerRef } },
    success_url: `${env.BETTER_AUTH_URL}/billing?checkout=success`,
    cancel_url: `${env.BETTER_AUTH_URL}/billing`,
  });
  if (!session.url) throw new Error("Stripe returned no Checkout URL");
  return session.url;
}

/** The Stripe customer portal, where customers change payment methods or cancel. */
export async function portalUrl(db: Db, env: AppEnv, customerRef: string) {
  const customer = await savedCustomer(db, customerRef);
  if (!customer) return null;
  const session = await stripeClient(env).billingPortal.sessions.create({
    customer,
    return_url: `${env.BETTER_AUTH_URL}/billing`,
  });
  return session.url;
}
