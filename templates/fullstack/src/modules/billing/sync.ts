import { and, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "../../db/client";
import type { BillingProvider, Plan, ProviderSubscription, WebhookEvent } from "./domain";
import { billingCustomers, billingInbox, subscriptions } from "./schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const planIdFor = (state: ProviderSubscription, plans: readonly Plan[]) => {
  const plan = plans.find((p) => p.providerPriceId === state.priceId);
  if (!plan) console.warn(`[billing] subscription ${state.id} has unknown price ${state.priceId}; not entitled`);
  return plan?.id ?? `unknown:${state.priceId}`;
};

async function customerRefFor(tx: Tx, provider: string, state: ProviderSubscription) {
  if (state.customerRef) return state.customerRef;
  if (!state.providerCustomerId) return null;
  const [row] = await tx
    .select({ customerRef: billingCustomers.customerRef })
    .from(billingCustomers)
    .where(
      and(eq(billingCustomers.provider, provider), eq(billingCustomers.providerCustomerId, state.providerCustomerId)),
    );
  return row?.customerRef ?? null;
}

/**
 * Brings one subscription row up to the provider's current state, inside the caller's transaction (billing.md › Event
 * processing, steps 5–7). The row is locked before the state is fetched, so concurrent syncs serialize and the last
 * commit holds the newest state. Event payloads never contribute state.
 */
export async function syncSubscription(
  tx: Tx,
  provider: BillingProvider,
  plans: readonly Plan[],
  subscriptionId: string,
) {
  const locked = () =>
    tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.provider, provider.name), eq(subscriptions.providerSubscriptionId, subscriptionId)))
      .for("update");

  const [row] = await locked();
  const state = await provider.fetchSubscription(subscriptionId);
  if (!row) {
    const customerRef = await customerRefFor(tx, provider.name, state);
    if (!customerRef) {
      console.warn(`[billing] subscription ${subscriptionId} has no customer_ref and an unknown customer; ignored`);
      return;
    }
    const inserted = await tx
      .insert(subscriptions)
      .values({
        customerRef,
        provider: provider.name,
        providerSubscriptionId: state.id,
        planId: planIdFor(state, plans),
        status: state.status,
        currentPeriodEnd: state.currentPeriodEnd,
        syncedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: subscriptions.id });
    if (inserted.length) return;
    // A concurrent sync created the row first (this insert waited for it to commit): lock it and fetch again.
    return syncSubscription(tx, provider, plans, subscriptionId);
  }
  await tx
    .update(subscriptions)
    .set({
      status: state.status,
      planId: planIdFor(state, plans),
      currentPeriodEnd: state.currentPeriodEnd,
      syncedAt: new Date(),
    })
    .where(eq(subscriptions.id, row.id));
}

/**
 * Applies a verified webhook at least once with idempotent effects: the inbox row and the state change commit together,
 * so a duplicate is skipped and a failed attempt leaves nothing behind for the provider's retry.
 */
export async function processWebhook(db: Db, provider: BillingProvider, plans: readonly Plan[], event: WebhookEvent) {
  const subscriptionId = provider.subscriptionIdFrom(event);
  if (!subscriptionId) return "ignored" as const;
  return db.transaction(async (tx) => {
    const fresh = await tx
      .insert(billingInbox)
      .values({ provider: provider.name, eventId: event.id, eventType: event.type })
      .onConflictDoNothing()
      .returning({ eventId: billingInbox.eventId });
    if (!fresh.length) return "duplicate" as const;
    await syncSubscription(tx, provider, plans, subscriptionId);
    await tx
      .update(billingInbox)
      .set({ processedAt: new Date() })
      .where(and(eq(billingInbox.provider, provider.name), eq(billingInbox.eventId, event.id)));
    return "processed" as const;
  });
}

/** The daily safety net for lost webhooks: re-syncs live subscriptions not synced in the last 24 hours. */
export async function reconcile(db: Db, provider: BillingProvider, plans: readonly Plan[], now = new Date()) {
  const stale = await db
    .select({ id: subscriptions.providerSubscriptionId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.provider, provider.name),
        inArray(subscriptions.status, ["incomplete", "trialing", "active", "past_due"]),
        lt(subscriptions.syncedAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
      ),
    );
  let failed = 0;
  for (const { id } of stale) {
    try {
      await db.transaction((tx) => syncSubscription(tx, provider, plans, id));
    } catch (error) {
      failed++;
      console.error(`[billing] reconcile ${id} failed:`, error);
    }
  }
  return { synced: stale.length - failed, failed };
}
