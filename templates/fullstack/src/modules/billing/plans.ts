import type { AppEnv } from "../../env";
import type { Plan } from "./domain";

/** What a plan unlocks. Procedures check these through `entitlementsOf`, never the plan or status directly. */
export type Feature = "unlimited-notes";

/** Without an entitled subscription. */
export const FREE: readonly Feature[] = [];

/** Notes a customer may keep without `unlimited-notes`. */
export const FREE_NOTE_LIMIT = 20;

/** Plans are code, so changing one is a deploy. Provider price IDs differ between test and live mode, so they come from env. */
export function plans(env: AppEnv): Plan<Feature>[] {
  return [{ id: "pro", providerPriceId: env.STRIPE_PRICE_PRO ?? "", entitlements: ["unlimited-notes"] }];
}
