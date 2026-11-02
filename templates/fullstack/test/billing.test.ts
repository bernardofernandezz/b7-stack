import { afterEach, describe, expect, it, vi } from "vitest";
import { entitlementsFor, type Plan } from "../src/modules/billing/domain";
import { fromAbacatePayStatus, fromStripeStatus } from "../src/modules/billing/status";

const plans: Plan<"export" | "sso">[] = [{ id: "pro", providerPriceId: "price_pro", entitlements: ["export", "sso"] }];

afterEach(() => vi.restoreAllMocks());

describe("billing domain", () => {
  it.each([
    ["trialing", ["export", "sso"]],
    ["active", ["export", "sso"]],
    ["past_due", ["export", "sso"]],
    ["incomplete", []],
    ["suspended", []],
    ["canceled", []],
  ] as const)("derives entitlements for %s", (status, expected) => {
    expect(entitlementsFor({ status, planId: "pro" }, plans, [])).toEqual(expected);
  });

  it("falls back to free without a subscription or with an unknown plan", () => {
    expect(entitlementsFor(null, plans, ["export"])).toEqual(["export"]);
    expect(entitlementsFor({ status: "active", planId: "gone" }, plans, [])).toEqual([]);
  });

  it("maps every documented Stripe status; unpaid, paused and incomplete_expired are not entitled", () => {
    expect(fromStripeStatus("unpaid")).toBe("suspended");
    expect(fromStripeStatus("paused")).toBe("suspended");
    expect(fromStripeStatus("incomplete_expired")).toBe("canceled");
    expect(fromStripeStatus("past_due")).toBe("past_due");
  });

  it("maps unknown provider statuses to suspended and logs them", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(fromStripeStatus("something_new")).toBe("suspended");
    expect(fromAbacatePayStatus("EXPIRED", null, new Date())).toBe("suspended");
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("maps AbacatePay ACTIVE to trialing only while the trial has not ended", () => {
    const now = new Date("2026-10-31T00:00:00Z");
    expect(fromAbacatePayStatus("ACTIVE", new Date("2026-11-07T00:00:00Z"), now)).toBe("trialing");
    expect(fromAbacatePayStatus("ACTIVE", new Date("2026-10-01T00:00:00Z"), now)).toBe("active");
    expect(fromAbacatePayStatus("PENDING", null, now)).toBe("incomplete");
    expect(fromAbacatePayStatus("CANCELLED", null, now)).toBe("canceled");
  });
});
