// biome-ignore-all assist/source/organizeImports: B7 feature regions
import { expect, test } from "@playwright/test";
// #if email
import { verificationLink } from "./helpers";

// #endif

test("sign up, keep a note across reloads, sign out", async ({ page }) => {
  // Wait for hydration: before it, buttons are inert SSR markup.
  await page.goto("/sign-in", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "No account? Sign up" }).click();
  await page.getByLabel("Name").fill("E2E");
  const email = `${crypto.randomUUID()}@example.com`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  // #if email
  await expect(page.getByText("Verify your email")).toBeVisible();
  // The emailed link signs the user in and redirects home.
  await page.goto(await verificationLink(email), { waitUntil: "networkidle" });
  // #endif
  await expect(page.getByText(email)).toBeVisible();
  // #if organizations
  await page.getByLabel("Organization name").fill("E2E Org");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("link", { name: "E2E Org" })).toBeVisible();
  // #endif

  const content = `note ${Date.now()}`;
  await page.getByLabel("New note").fill(content);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(content)).toBeVisible();

  await page.reload({ waitUntil: "networkidle" }); // hydrated, so the sign-out button works
  await expect(page.getByText(content)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("to keep notes")).toBeVisible();
});
