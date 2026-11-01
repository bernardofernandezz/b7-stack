# Billing (v0.2, proposed)

Billing is **OPTIONAL**: `billing = none | stripe | abacatepay`. Only the selected provider's code and env vars are generated. **Stripe is the reference integration. AbacatePay is EXPERIMENTAL** (`A7`) because of the limitations listed below. Decision IDs and evidence are in [architecture-review.md](../../architecture-review.md).

This is a small internal domain with one adapter per provider. It is **not** a payment framework.

## Domain

### Tables

| Table | Columns (minimum) | Notes |
|-------|-------------------|-------|
| `billing_customers` | `customer_ref` (org ID with organizations, else user ID), `provider`, `provider_customer_id` | Unique (`provider`, `customer_ref`) |
| `subscriptions` | `id`, `customer_ref`, `plan_id`, `status`, `provider`, `provider_subscription_id` (unique, nullable until known), `provider_checkout_id`, `current_period_end` (nullable), `synced_at` | One row per customer subscription |
| `billing_inbox` | `provider`, `event_id`, `event_type`, `received_at`, `processed_at` | **Primary key (`provider`, `event_id`)**. This is the durable inbox |
| `plans` | Defined **in code** (`plans.ts`): `id`, provider price/product ID, `entitlements` | Not a table, so changing a plan is a deploy |

### Internal subscription states

| State | Entitled | Meaning |
|-------|---------|---------|
| `incomplete` | No | Checkout started, first payment not confirmed |
| `trialing` | Yes | In trial |
| `active` | Yes | Paid and current |
| `past_due` | Yes | Renewal failed and the provider is still retrying. Show a warning |
| `suspended` | No | Not paid and not retrying, but recoverable (Stripe `unpaid`, `paused`) |
| `canceled` | No | Terminal |

**Rule for unknown values:** any provider status not in the mapping maps to `suspended` (not entitled) and logs a warning.

### Entitlements

Entitlements are **derived when read**, never stored: `entitlements(customer_ref) = plan(sub).entitlements if status ∈ {trialing, active, past_due} else FREE`. There is no "entitlement sync" step to get out of date. Procedures check them in oRPC middleware (`requireEntitlement("feature")`). The billing customer is the organization when organizations are enabled. Only roles with `billing: ["manage"]` can start a checkout or cancel.

**A browser redirect or checkout success page never changes state.** The success page shows "processing" and polls the subscription procedure until the webhook or a reconciliation pass has updated the row.

## Provider mapping

### Stripe (reference)

Statuses, from the [Subscription object](https://docs.stripe.com/api/subscriptions/object):

| Stripe `status` | Internal |
|-----------------|----------|
| `incomplete` | `incomplete` |
| `incomplete_expired` | `canceled` (Stripe: terminal) |
| `trialing` | `trialing` |
| `active` | `active` |
| `past_due` | `past_due` |
| `unpaid` | `suspended` |
| `paused` | `suspended` |
| `canceled` | `canceled` |

- `current_period_end` is read from the subscription **items** (`items.data[].current_period_end` in the current API object). Pin the Stripe API version in the client.
- Events that trigger a sync: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`. The **event body is used only to find the subscription ID**. State always comes from `stripe.subscriptions.retrieve(id)`.
- Linking a checkout to a customer: create the Stripe Customer first (stored in `billing_customers`), then pass `customer` and `subscription_data.metadata.customer_ref` when creating the Checkout Session. **UNVERIFIED:** check these parameter names against the Checkout Session API before implementing (test `S-T3`).

### AbacatePay (EXPERIMENTAL)

Facts from the [subscription reference](https://docs.abacatepay.com/pages/subscriptions/reference), [get subscription](https://docs.abacatepay.com/pages/subscriptions/get), [create subscription](https://docs.abacatepay.com/pages/subscriptions/create) and [webhook reference](https://docs.abacatepay.com/pages/webhooks/reference) (API v2):

| AbacatePay | Internal |
|------------|----------|
| `PENDING` | `incomplete` |
| `ACTIVE` with `trialEndsAt` in the future | `trialing` |
| `ACTIVE` otherwise | `active` |
| `CANCELLED` | `canceled` |

**Limitations (visible to users of B7):**

| Limitation | Consequence in B7 |
|-----------|--------------------|
| Only `PENDING`, `ACTIVE` and `CANCELLED` exist. Failed renewals retry per `retryPolicy` and then cancel (`cancelledDueTo: "max_payment_retries_exceeded"`) | No `past_due`/`suspended` for AbacatePay. Users stay `active` during retries and become `canceled` afterwards |
| The subscription object has no current-period or next-charge field | `current_period_end` stays NULL, and the UI cannot show a renewal date |
| Subscriptions support `CARD` only (the subscriptions/create docs) | No PIX recurring billing |
| Webhook payload `data` fields for `subscription.*` are not documented | **UNVERIFIED** how to extract the subscription ID from an event (test `A-T3`). This **blocks** the adapter |
| Webhook HMAC is keyed with a public key published in the docs | Proves integrity only. Authentication relies on the URL secret. See [verification](#webhook-verification) |
| No event timestamps | Irrelevant, because B7 never orders by event time |
| Trials exist (`trialDays`, `trialEndsAt`, event `subscription.trial_started`) | Supported. **v0.1 wrongly said trials were undocumented** |

- **Linking:** `POST /v2/subscriptions/create` returns a checkout `id` (`bill_…`) and a `url`. B7 stores the checkout ID as `provider_checkout_id`. `GET /v2/subscriptions/get` returns `checkoutId`, which links the subscription back. Whether `externalId` comes back on webhooks or on GET is undocumented, so B7 does not rely on it.
- **State always comes from `GET /v2/subscriptions/get`.** Webhooks are only a trigger.

## Webhook verification

Both routes read the body **once as text** (`await request.text()`) **before** any parsing. The same string is verified and then parsed. Nothing in front of these routes may read the body.

**Stripe** ([webhooks](https://docs.stripe.com/webhooks)):
- Header `Stripe-Signature`, secret `STRIPE_WEBHOOK_SECRET` (`whsec_…`).
- On Workers: `stripe.webhooks.constructEventAsync(body, sig, secret, undefined, Stripe.createSubtleCryptoProvider())`, with the client created using `httpClient: Stripe.createFetchHttpClient()`. The only official source is the [Cloudflare announcement (2021-11-19)](https://blog.cloudflare.com/announcing-stripe-support-in-workers). **UNVERIFIED** on the current SDK (test `S-T1`, blocker).
- Default tolerance is 5 minutes. Never set it to 0.

**AbacatePay** ([webhook security](https://docs.abacatepay.com/pages/webhooks/security)):
1. Compare the `webhookSecret` query parameter with `ABACATEPAY_WEBHOOK_SECRET` in constant time. If it doesn't match, return `401`. **This is the authentication factor.**
2. Verify `X-Webhook-Signature`: base64 HMAC-SHA256 of the raw body, keyed with AbacatePay's published public key, using `crypto.subtle` and comparing with `crypto.subtle.timingSafeEqual`. **This is an integrity check only**, because the key is public.
3. Reject a `devMode` value that does not match the environment. Respond `200` without processing, so the provider does not retry.
4. Redact `webhookSecret` from every log, trace and error report (see the [observability standard](../../docs/standards/observability.md#baseline)).
5. Never respond `410`, because that disables the webhook.

The re-fetch in [event processing](#event-processing) is what turns a forged or replayed event into a no-op. A forged event can at most trigger a sync with the provider's real state.

## Event processing

B7 guarantees **at-least-once delivery with idempotent effects**. It does **not** promise exactly-once processing.

```
POST /api/webhooks/<provider>
 1. body = await request.text(); verify (above)           → 400/401, no side effects
 2. subId = adapter.subscriptionIdFrom(event)             → unknown event type: 200, ignore
 3. BEGIN
 4.   INSERT INTO billing_inbox (provider, event_id, …) ON CONFLICT DO NOTHING RETURNING 1
        no row → ROLLBACK, 200                             (duplicate: already processed)
 5.   ensure row: INSERT … ON CONFLICT (provider, provider_subscription_id) DO NOTHING
        (customer_ref resolved via provider_checkout_id / Stripe metadata)
      SELECT … FROM subscriptions WHERE provider_subscription_id = $subId FOR UPDATE
 6.   state = adapter.fetchSubscription(subId)            (provider API, current truth)
 7.   UPDATE subscriptions SET status = map(state), current_period_end = …, synced_at = now()
 8.   UPDATE billing_inbox SET processed_at = now()
 9. COMMIT → 200
    any error → ROLLBACK → 500 (the provider retries; the inbox row was rolled back too)
```

### Deduplication
Steps 4 and 8 run in the same transaction as the state change. A committed inbox row means the event was fully applied. A failed attempt leaves no row, so the provider's retry starts clean. This needs no lease or "stuck row" handling.

### Concurrency control
Two different events for the same subscription can arrive at once. In that case, the `FOR UPDATE` lock in step 5 serializes them, and each fetches provider state **after** it acquires the lock. Whichever commits last wrote the newest fetched state.
Trade-off: an outbound HTTP call (step 6) runs while a transaction and its pooled Hyperdrive connection are held. That is acceptable at webhook volumes. **UNVERIFIED** under Hyperdrive (test `B-T4`).

### Out-of-order events
Event order is irrelevant, because state is never derived from the event and always comes from a provider fetch. Stripe states explicitly that ordering is not guaranteed and that `created` must not be used for ordering ([webhooks](https://docs.stripe.com/webhooks)). B7 does not use event timestamps anywhere.

### Retry and failure recovery
- **Provider retries.** Stripe retries for up to 3 days ([webhooks](https://docs.stripe.com/webhooks)). AbacatePay retries 7 times over about 18 hours on timeout, `5xx`, `408` or `429` ([webhook security](https://docs.abacatepay.com/pages/webhooks/security)).
- **Reconciliation (DERIVED with billing).** A daily Cron Trigger re-fetches every subscription in `incomplete`, `trialing`, `active` or `past_due` whose `synced_at` is older than 24 h, using the same lock-fetch-update steps 5–7. This covers lost webhooks, and it is the **primary** safety net for AbacatePay, given its undocumented payloads and missing period fields.
- **Manual replay.** Re-running a sync for one subscription ID is the operator's recovery tool. Re-delivering events is never required.

### Transactional outbox: DEFERRED
In v0.2, billing has **no side effects outside PostgreSQL**, because entitlements are derived. An outbox (`outbox` table written in the same transaction, dispatched by cron or a Queue consumer, at-least-once, keyed by event ID) is introduced only when a billing side effect exists, such as receipt emails or provisioning calls. Until then it would be unused machinery.

## Configuration

| Item | Stripe | AbacatePay |
|------|--------|-----------|
| Env | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `ABACATEPAY_API_KEY`, `ABACATEPAY_WEBHOOK_SECRET` |
| Dependency | `stripe` | none (`fetch`) |
| Route | `src/routes/api/webhooks/stripe.ts` | `src/routes/api/webhooks/abacatepay.ts` |
| Cron | Required (reconciliation) | Required (reconciliation) |

## Acceptance tests

`S-T1`, `S-T2`, `S-T3`, `A-T1`–`A-T3`, `B-T1`–`B-T5`. Definitions are in [architecture-review.md](../../architecture-review.md#required-acceptance-tests).
