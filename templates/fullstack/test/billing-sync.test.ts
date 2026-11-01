// biome-ignore-all assist/source/organizeImports: B7 feature regions
import { createRouterClient, ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { createDb } from "../src/db/client";
import { parseEnv } from "../src/env";
import { createAuth } from "../src/modules/auth/auth";
import { stripeClient, stripeProvider } from "../src/modules/billing/adapters/stripe";
import { WebhookVerificationError } from "../src/modules/billing/domain";
import { FREE_NOTE_LIMIT, plans } from "../src/modules/billing/plans";
import { billingInbox, subscriptions } from "../src/modules/billing/schema";
import { processWebhook, reconcile } from "../src/modules/billing/sync";
import { router } from "../src/rpc/router";
// #if organizations
import { signUpVerified } from "./helpers";
// #endif
import { signUpWithScope } from "./helpers";

const env = {
  ...parseEnv(process.env),
  RESEND_API_KEY: undefined,
  STRIPE_SECRET_KEY: "sk_test_b7",
  STRIPE_WEBHOOK_SECRET: "whsec_test_b7",
  STRIPE_PRICE_PRO: "price_test_pro",
};
const { db, close } = createDb(env.DATABASE_URL);
const auth = createAuth({ db, env });
const provider = stripeProvider(env);
afterAll(close);

// Stripe, faked at the fetch boundary: subscriptions the API "has", and every request made.
const stripe = new Map<string, Record<string, unknown>>();
let fetch: MockInstance<typeof globalThis.fetch>;
const requests = () => fetch.mock.calls.map(([url, init]) => ({ url: String(url), body: String(init?.body ?? "") }));
beforeEach(() => {
  stripe.clear();
  fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const sub = url.pathname.match(/^\/v1\/subscriptions\/(.+)$/)?.[1];
    if (sub) {
      const found = stripe.get(sub);
      return found
        ? Response.json(found)
        : Response.json({ error: { message: "No such subscription" } }, { status: 404 });
    }
    if (url.pathname === "/v1/customers")
      return Response.json({ id: `cus_${crypto.randomUUID()}`, object: "customer" });
    if (url.pathname === "/v1/checkout/sessions")
      return Response.json({ id: "cs_1", object: "checkout.session", url: "https://checkout.stripe.test/cs_1" });
    throw new Error(`unexpected Stripe call ${init?.method} ${url}`);
  });
  return () => fetch.mockRestore();
});

/** A Stripe subscription as the API returns it. */
function stripeSubscription(id: string, status: string, customerRef: string | null, customer = "cus_1") {
  const sub = {
    id,
    object: "subscription",
    status,
    customer,
    metadata: customerRef ? { customer_ref: customerRef } : {},
    items: {
      object: "list",
      data: [{ id: `si_${id}`, current_period_end: 1893456000, price: { id: "price_test_pro" } }],
    },
  };
  stripe.set(id, sub);
  return sub;
}

/** A webhook event, signed like Stripe signs it, and verified through the adapter. */
async function signedEvent(
  type: string,
  object: Record<string, unknown>,
  options: { secret?: string; timestamp?: number } = {},
) {
  const payload = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, object: "event", type, data: { object } });
  const header = stripeClient(env).webhooks.generateTestHeaderString({
    payload,
    secret: options.secret ?? env.STRIPE_WEBHOOK_SECRET,
    timestamp: options.timestamp,
  });
  const request = new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": header },
  });
  return { request, payload };
}
const verified = async (type: string, object: Record<string, unknown>) => {
  const { request, payload } = await signedEvent(type, object);
  return provider.verifyWebhook(request, payload);
};

/** A user with a billing customer: the organization with organizations, else the user. */
async function customer() {
  const user = await signUpWithScope(auth);
  const session = await auth.api.getSession({ headers: user.headers });
  const client = createRouterClient(router, { context: { db, auth, env, headers: user.headers } });
  return { ...user, client, customerRef: user.organizationId || (session?.user.id as string) };
}

const rowFor = async (subscriptionId: string) =>
  (await db.select().from(subscriptions).where(eq(subscriptions.providerSubscriptionId, subscriptionId)))[0];

describe("Stripe webhooks", () => {
  it("S-T1: accepts a valid signature; rejects tampered bodies, wrong secrets and old timestamps", async () => {
    const valid = await signedEvent("customer.subscription.updated", { id: "sub_x" });
    expect((await provider.verifyWebhook(valid.request, valid.payload)).type).toBe("customer.subscription.updated");

    const rejects = (promise: Promise<unknown>) =>
      expect(promise).rejects.toSatisfy((e) => e instanceof WebhookVerificationError && e.status === 400);
    await rejects(provider.verifyWebhook(valid.request, valid.payload.replace("sub_x", "sub_y")));
    const wrong = await signedEvent("customer.subscription.updated", { id: "sub_x" }, { secret: "whsec_other" });
    await rejects(provider.verifyWebhook(wrong.request, wrong.payload));
    const old = await signedEvent(
      "customer.subscription.updated",
      { id: "sub_x" },
      { timestamp: Math.floor(Date.now() / 1000) - 600 },
    );
    await rejects(provider.verifyWebhook(old.request, old.payload));
    await rejects(provider.verifyWebhook(new Request("http://localhost", { method: "POST" }), valid.payload));
  });

  it("ignores event types that do not affect subscriptions, without calling Stripe", async () => {
    expect(await processWebhook(db, provider, plans(env), await verified("charge.succeeded", { id: "ch_1" }))).toBe(
      "ignored",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("S-T2: deleted and updated delivered in reverse order end canceled, because state comes from Stripe", async () => {
    const { customerRef } = await customer();
    const id = `sub_${crypto.randomUUID()}`;
    stripeSubscription(id, "canceled", customerRef);
    await processWebhook(db, provider, plans(env), await verified("customer.subscription.deleted", { id }));
    // The stale "updated" event says active; its payload is ignored.
    await processWebhook(
      db,
      provider,
      plans(env),
      await verified("customer.subscription.updated", { id, status: "active" }),
    );
    expect((await rowFor(id))?.status).toBe("canceled");
  });

  it("B-T1: the same event delivered twice concurrently is applied once", async () => {
    const { customerRef } = await customer();
    const id = `sub_${crypto.randomUUID()}`;
    stripeSubscription(id, "active", customerRef);
    const event = await verified("customer.subscription.created", { id });
    const results = await Promise.all([
      processWebhook(db, provider, plans(env), event),
      processWebhook(db, provider, plans(env), event),
    ]);
    expect(results.sort()).toEqual(["duplicate", "processed"]);
    expect(await db.$count(billingInbox, eq(billingInbox.eventId, event.id))).toBe(1);
    expect(await db.$count(subscriptions, eq(subscriptions.providerSubscriptionId, id))).toBe(1);
  });

  it("B-T2: a failure after the inbox insert rolls back, and the retry succeeds", async () => {
    const { customerRef } = await customer();
    const id = `sub_${crypto.randomUUID()}`;
    const event = await verified("customer.subscription.created", { id });
    await expect(processWebhook(db, provider, plans(env), event)).rejects.toThrow(); // Stripe: no such subscription
    expect(await db.$count(billingInbox, eq(billingInbox.eventId, event.id))).toBe(0);

    stripeSubscription(id, "active", customerRef);
    expect(await processWebhook(db, provider, plans(env), event)).toBe("processed");
    expect((await rowFor(id))?.status).toBe("active");
  });

  it("B-T3: unpaid, paused, incomplete_expired and unknown statuses are not entitled", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const status of ["unpaid", "paused", "incomplete_expired", "brand_new_status"]) {
      const { client, customerRef } = await customer();
      const id = `sub_${crypto.randomUUID()}`;
      stripeSubscription(id, status, customerRef);
      await processWebhook(db, provider, plans(env), await verified("customer.subscription.updated", { id }));
      expect((await client.billing.status()).entitlements).toEqual([]);
    }
  });

  it("B-T4: 50 concurrent webhooks for 50 subscriptions all apply", async () => {
    const { customerRef } = await customer();
    const ids = Array.from({ length: 50 }, () => `sub_${crypto.randomUUID()}`);
    for (const id of ids) stripeSubscription(id, "active", customerRef);
    const events = await Promise.all(ids.map((id) => verified("customer.subscription.updated", { id })));
    const results = await Promise.all(events.map((e) => processWebhook(db, provider, plans(env), e)));
    expect(results.every((r) => r === "processed")).toBe(true);
  });

  it("B-T5: a dropped webhook is corrected by the next reconciliation", async () => {
    const { client, customerRef } = await customer();
    const id = `sub_${crypto.randomUUID()}`;
    stripeSubscription(id, "active", customerRef);
    await processWebhook(db, provider, plans(env), await verified("customer.subscription.created", { id }));
    expect((await client.billing.status()).entitlements).toEqual(["unlimited-notes"]);

    stripeSubscription(id, "canceled", customerRef); // the cancellation webhook never arrives
    const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000);
    // Other tests' subscriptions are stale too and no longer exist in the fake; their failures are logged and skipped.
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await reconcile(db, provider, plans(env), tomorrow)).synced).toBeGreaterThan(0);
    expect((await rowFor(id))?.status).toBe("canceled");
    expect((await client.billing.status()).entitlements).toEqual([]);
  });
});

describe("billing procedures", () => {
  it("S-T3 and B-T6: checkout links the subscription to the customer, and nothing changes until a webhook", async () => {
    const { client, customerRef } = await customer();
    const { url } = await client.billing.checkout({ planId: "pro" });
    expect(url).toBe("https://checkout.stripe.test/cs_1");
    const session = new URLSearchParams(requests().find((r) => r.url.endsWith("/v1/checkout/sessions"))?.body);
    const stripeCustomer = session.get("customer") as string;
    expect(stripeCustomer).toMatch(/^cus_/);
    expect(session.get("subscription_data[metadata][customer_ref]")).toBe(customerRef);
    expect(session.get("line_items[0][price]")).toBe("price_test_pro");

    // B-T6: back from Checkout, before any webhook: still not entitled.
    expect(await client.billing.status()).toEqual({ subscription: null, entitlements: [] });

    // Even without metadata, the subscription resolves to the customer through billing_customers.
    const id = `sub_${crypto.randomUUID()}`;
    stripeSubscription(id, "active", null, stripeCustomer);
    await processWebhook(
      db,
      provider,
      plans(env),
      await verified("checkout.session.completed", { id: "cs_1", subscription: id }),
    );
    expect((await rowFor(id))?.customerRef).toBe(customerRef);
    expect((await client.billing.status()).entitlements).toEqual(["unlimited-notes"]);
  });

  it("the free plan keeps up to FREE_NOTE_LIMIT notes; Pro lifts the limit", async () => {
    const { client, customerRef } = await customer();
    for (let i = 0; i < FREE_NOTE_LIMIT; i++) await client.notes.create({ content: `note ${i}` });
    await expect(client.notes.create({ content: "one too many" })).rejects.toSatisfy(
      (e) => e instanceof ORPCError && e.code === "PLAN_LIMIT" && e.status === 402,
    );
    const id = `sub_${crypto.randomUUID()}`;
    stripeSubscription(id, "active", customerRef);
    await processWebhook(db, provider, plans(env), await verified("customer.subscription.created", { id }));
    await expect(client.notes.create({ content: "now allowed" })).resolves.toBeTruthy();
  });

  // #if organizations
  it("only owners and admins start a checkout", async () => {
    const owner = await customer();
    const member = await signUpVerified(auth);
    const memberId = (await auth.api.getSession({ headers: member.headers }))?.user.id as string;
    await auth.api.addMember({ body: { userId: memberId, role: "member", organizationId: owner.organizationId } });
    await auth.api.setActiveOrganization({ body: { organizationId: owner.organizationId }, headers: member.headers });
    const memberClient = createRouterClient(router, { context: { db, auth, env, headers: member.headers } });
    await expect(memberClient.billing.checkout({ planId: "pro" })).rejects.toSatisfy(
      (e) => e instanceof ORPCError && e.code === "FORBIDDEN",
    );
    expect(await memberClient.billing.status()).toEqual({ subscription: null, entitlements: [] });
  });
  // #endif
});
