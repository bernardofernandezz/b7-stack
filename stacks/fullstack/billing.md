# Billing and Payments

Billing is **optional**: `billing = none | stripe | abacatepay`. Exactly one provider is installed, and the other provider's code, dependencies and env vars are never generated. Billing requires a database, auth and Hono (for webhooks). See the [compatibility rules](../../docs/configuration-model.md#compatibility-rules).

## Design

The goal is a small seam with one implementation per provider, not a generic payment framework.

```
src/modules/billing/
├── provider.ts        # BillingProvider interface (below)
├── stripe.ts          # only when billing = stripe
├── abacatepay.ts      # only when billing = abacatepay
├── schema.ts          # plans, subscriptions, billing_events
├── service.ts         # state transitions, entitlements
├── webhook.ts         # Hono route: verify → dedupe → process
└── procedures.ts      # oRPC: createCheckout, getSubscription, ...
```

```ts
type BillingProvider = {
  createCheckout(input: { customerRef: string; planId: string; successUrl: string; cancelUrl: string }):
    Promise<{ url: string }>;
  // Throws if the request is not authentic. Reads the raw body itself.
  verifyWebhook(request: Request): Promise<{ eventId: string; rawEvent: unknown }>;
  // Maps a provider event to zero or more internal events. Unknown types map to [].
  toInternalEvents(rawEvent: unknown): InternalBillingEvent[];
};

type InternalBillingEvent =
  | { type: "checkout.completed"; customerRef: string; providerSubscriptionId?: string; at: Date }
  | { type: "subscription.activated" | "subscription.renewed"; providerSubscriptionId: string; periodEnd?: Date; at: Date }
  | { type: "subscription.payment_failed"; providerSubscriptionId: string; at: Date }
  | { type: "subscription.canceled"; providerSubscriptionId: string; at: Date };
```

Everything after `toInternalEvents` (state transitions, entitlements) is provider-independent and lives in `service.ts`.

## Internal subscription states

| State | Meaning | Entitled? |
|-------|---------|-----------|
| `incomplete` | Checkout started, not paid | No |
| `trialing` | In trial (Stripe only, see capabilities) | Yes |
| `active` | Paid and current | Yes |
| `past_due` | A renewal failed, provider is retrying | Yes, during a grace period you define. Show a warning |
| `canceled` | Ended or canceled | No, after `currentPeriodEnd` |

Transitions are driven **only** by verified webhooks, never by redirects from the checkout success page. The success page shows "processing" until the webhook arrives.

## Schema (minimal)

- `plans`: `id`, `name`, provider price or product reference, `entitlements` (JSON: feature flags and limits).
- `subscriptions`: `id`, `customer_ref` (organization ID when organizations are enabled, otherwise user ID), `plan_id`, `status`, `provider`, `provider_subscription_id` (unique), `current_period_end`, `last_event_at`.
- `billing_events`: `provider`, `event_id`, `type`, `received_at`, `processed_at`, with **a unique constraint on (`provider`, `event_id`)**.

## Processing pipeline

```
POST /api/webhooks/<provider>
  1. verifyWebhook(request)                 → 400/401 on failure, no side effects
  2. INSERT billing_events ... ON CONFLICT DO NOTHING
       already processed?                   → 200, stop (duplicate)
  3. process: toInternalEvents → service.apply(event) inside a DB transaction,
     then set processed_at
       (with jobs.queues: enqueue {provider, eventId}, return 200; the consumer does step 3)
  4. 200
```

**Retry safety**

- `service.apply` is **idempotent**. It sets state, and never increments it. Applying the same event twice leaves the same result.
- **Out-of-order delivery.** Skip a state change when the event's `at` is older than `subscriptions.last_event_at`. When in doubt (Stripe), fetch the current subscription from the provider API and store that.
- If step 3 fails, leave `processed_at` NULL and return `5xx` (inline mode) so the provider retries, or let the Queue retry (queue mode). Step 2 only skips events that have `processed_at` set.
- Webhook routes are exempt from CSRF and session auth. Authenticity comes from verification alone.

## Webhook verification

### Stripe
- Header: `Stripe-Signature` (`t=…,v1=…`), secret `STRIPE_WEBHOOK_SECRET` (`whsec_…`). Verify against the **exact raw body** ([Stripe docs](https://docs.stripe.com/webhooks/signature)).
- On Workers, use the async verifier with the Web Crypto provider (`stripe.webhooks.constructEventAsync`). The synchronous variant depends on Node crypto. **Uncertain:** confirm the method names and HTTP-client setup for Workers in the current `stripe` SDK.
- Stripe retries for up to three days, and may send the same change as two separate events. Deduplicate on the event ID, and also treat updates as idempotent per `data.object.id`.

### AbacatePay
From the [webhook security docs](https://docs.abacatepay.com/pages/webhooks/security):
1. Check that the `webhookSecret` **query parameter** matches `ABACATEPAY_WEBHOOK_SECRET`. Reject with `401` before any processing.
2. Verify `X-Webhook-Signature`: base64 HMAC-SHA256 of the **raw body**, keyed with AbacatePay's published public key, compared in constant time. On Workers, compute the HMAC with `crypto.subtle.sign` and compare with `crypto.subtle.timingSafeEqual`, a Workers extension to Web Crypto.
3. Deduplicate on the event `id`. Retries reuse it.

Delivery: up to 7 retries over about 18 hours on timeout (30 s), `5xx`, `408` or `429`. Other `4xx` codes are not retried, and **`410` disables the webhook**, so never return `410`.

**Uncertain:** the AbacatePay CLI's `verify` command describes a different scheme (`whsec_` secret, `t=…,v1=…` header, a 5-minute timestamp tolerance). B7 follows the security page until the discrepancy is resolved. Re-check before implementing.

## Provider capabilities

These providers are not equivalent. B7 maps only what each one documents.

| Capability | Stripe | AbacatePay (API v2) |
|-----------|--------|--------------------|
| Hosted checkout | Checkout Sessions | Checkout (`checkout.completed`) |
| Payment methods | Cards, wallets, many local methods | PIX, cards |
| Subscriptions | Yes | Yes (`subscription.completed`, `subscription.renewed`, `subscription.cancelled`) |
| Renewal event | `invoice.paid` | `subscription.renewed` |
| Failed renewal event | `invoice.payment_failed` → `past_due` | **Not documented** as a subscription event. `past_due` is unused, or you derive it from a missing renewal through a cron check |
| Trials | Yes → `trialing` | **Not documented**. Model trials app-side (a time-bounded `active` without a provider subscription) if needed |
| Refunds / disputes | Yes | `checkout.refunded`, `checkout.disputed` |
| Customer portal | Yes | **Not documented**. Build cancel/update flows in-app |
| Official TS SDK | `stripe` | Not required. Use plain `fetch` |

Event mapping:

| Internal | Stripe | AbacatePay |
|----------|--------|-----------|
| `checkout.completed` | `checkout.session.completed` | `checkout.completed` |
| `subscription.activated` | `customer.subscription.created` / `.updated` (status active or trialing) | `subscription.completed` |
| `subscription.renewed` | `invoice.paid` | `subscription.renewed` |
| `subscription.payment_failed` | `invoice.payment_failed` | — |
| `subscription.canceled` | `customer.subscription.deleted` | `subscription.cancelled` |

## Entitlements

- Entitlements come from the **plan** (`plans.entitlements`), not from the provider. Changing a feature limit is a database change, not a provider change.
- `getEntitlements(customerRef)` returns the plan's entitlements when the subscription status is entitled (see the states table), and a free or empty set otherwise.
- Check entitlements on the server in procedures (for example, a `requireFeature("exports")` middleware), never only in the UI.
- The customer is the **organization** when organizations are enabled, so all members share the plan. Only roles with `billing: ["manage"]` can start a checkout or cancel. See [authentication](authentication.md#authorization).
- Cron (optional) reconciles nightly. It finds subscriptions with `current_period_end` in the past that are still `active` and re-fetches their status from the provider.
