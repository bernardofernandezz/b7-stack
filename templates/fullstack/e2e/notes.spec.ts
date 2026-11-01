import { expect, test } from "@playwright/test";

test("sign up, keep a note across reloads, sign out", async ({ page }) => {
  // Wait for hydration: before it, buttons are inert SSR markup.
  await page.goto("/sign-in", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "No account? Sign up" }).click();
  await page.getByLabel("Name").fill("E2E");
  await page.getByLabel("Email").fill(`${crypto.randomUUID()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();

  const content = `note ${Date.now()}`;
  await page.getByLabel("New note").fill(content);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(content)).toBeVisible();

  await page.reload();
  await expect(page.getByText(content)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("to keep notes")).toBeVisible();
});
