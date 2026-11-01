import { expect, test } from "@playwright/test";
import pg from "pg";

/** The reset token for an address, read from the database because the email itself is not delivered in tests. */
async function resetToken(email: string) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ identifier: string }>(
      `select v.identifier from verification v join "user" u on v.value = u.id
       where u.email = $1 and v.identifier like 'reset-password:%' order by v.created_at desc limit 1`,
      [email],
    );
    return rows[0]?.identifier.slice("reset-password:".length);
  } finally {
    await client.end();
  }
}

test("forgot password, reset it, sign in with the new one", async ({ page, request, baseURL }) => {
  const email = `${crypto.randomUUID()}@example.com`;
  const signUp = await request.post("/api/auth/sign-up/email", {
    data: { name: "E2E", email, password: "old-password-123" },
    headers: { origin: baseURL ?? "" },
  });
  expect(signUp.ok()).toBe(true);

  // Wait for hydration: before it, buttons are inert SSR markup.
  await page.goto("/forgot-password", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  const token = await resetToken(email);
  expect(token).toBeTruthy();
  // The emailed link goes through Better Auth, which redirects to /reset-password?token=…
  await page.goto(`/api/auth/reset-password/${token}?callbackURL=/reset-password`, { waitUntil: "networkidle" });
  await page.getByLabel("New password").fill("new-password-456");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByText("Password changed")).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("new-password-456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(email)).toBeVisible();
});

test("an invalid reset link explains itself", async ({ page }) => {
  await page.goto("/reset-password?error=INVALID_TOKEN");
  await expect(page.getByText("Link expired")).toBeVisible();
});
