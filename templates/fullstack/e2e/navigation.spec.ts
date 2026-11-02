import { expect, test } from "@playwright/test";

test("client navigation reuses the cached session", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const sessionRequests: string[] = [];
  page.on("request", (r) => r.url().includes("/api/rpc/session") && sessionRequests.push(r.url()));

  await page.getByRole("link", { name: "Sign in" }).first().click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByRole("link", { name: "B7 Fullstack" }).click();
  await expect(page.getByText("to keep notes")).toBeVisible();

  expect(sessionRequests).toEqual([]);
});
