// biome-ignore-all assist/source/organizeImports: B7 feature regions
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "../auth/schema";
// #if organizations
import { organization } from "../organizations/schema";
// #endif

export const note = pgTable(
  "note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The author. Without organizations, also the owner.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // #if organizations
    // The tenant: every query filters by it (site/content/docs/stacks/fullstack/authentication.md › Tenant isolation).
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // #endif
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("note_user_id_created_at_idx").on(table.userId, table.createdAt),
    // #if organizations
    index("note_organization_id_created_at_idx").on(table.organizationId, table.createdAt),
    // #endif
  ],
);
