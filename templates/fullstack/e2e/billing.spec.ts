// biome-ignore-all assist/source/organizeImports: B7 feature regions
import { expect, test } from "@playwright/test";
// #if email
import { verificationLink } from "./helpers";
// #endif

test("the billing page shows the free plan and offers an upgrade", async ({ page, baseURL }) => {
  const email = `${crypto.randomUUID()}@example.com`;
  // page.request shares the page's cookies, so a session set here is the page's session.
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    data: { name: "Billing", email, password: "correct-horse-battery" },
    headers: { origin: baseURL ?? "" },
  });
  expect(signUp.ok()).toBe(true);
  // #if email
  await page.goto(await verificationLink(email), { waitUntil: "networkidle" });
  // #endif
  // #if organizations
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByLabel("Organization name").fill("Billing Org");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("link", { name: "Billing Org" })).toBeVisible();
  // #endif

  await page.goto("/billing", { waitUntil: "networkidle" });
  await expect(page.getByText("Plan: Free")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toBeVisible();
});

test("webhooks need a Stripe signature, and internal endpoints are not public", async ({ request }) => {
  expect((await request.post("/api/webhooks/stripe", { data: "{}" })).status()).toBe(400);
  const reconcile = await request.post("/api/internal/reconcile");
  // Through Caddy (BASE_URL), /api/internal/* does not exist; on the dev server it needs CRON_SECRET.
  if (process.env.BASE_URL) expect(reconcile.status()).toBe(404);
  else expect([401, 503]).toContain(reconcile.status());
});
