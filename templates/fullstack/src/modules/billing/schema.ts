import { index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { SubscriptionStatus } from "./domain";

// Tables from site/content/docs/stacks/fullstack/billing.md › Tables. `customer_ref` is the organization ID with organizations, else the user ID.

export const billingCustomers = pgTable(
  "billing_customers",
  {
    provider: text("provider").notNull(),
    customerRef: text("customer_ref").notNull(),
    providerCustomerId: text("provider_customer_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.customerRef] }),
    uniqueIndex("billing_customers_provider_customer_idx").on(table.provider, table.providerCustomerId),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerRef: text("customer_ref").notNull(),
    planId: text("plan_id").notNull(),
    status: text("status").$type<SubscriptionStatus>().notNull(),
    provider: text("provider").notNull(),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    currentPeriodEnd: timestamp("current_period_end"),
    syncedAt: timestamp("synced_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("subscriptions_provider_subscription_idx").on(table.provider, table.providerSubscriptionId),
    index("subscriptions_customer_ref_idx").on(table.customerRef, table.createdAt),
  ],
);

/** The durable webhook inbox: a committed row means the event was fully applied (dedup). */
export const billingInbox = pgTable(
  "billing_inbox",
  {
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
  },
  (table) => [primaryKey({ columns: [table.provider, table.eventId] })],
);
