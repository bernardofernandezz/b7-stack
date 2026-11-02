import { type Browser, expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { verificationLink } from "./helpers";

/** The pending invitation for an address, read from the database because the email is not delivered in tests. */
async function invitationId(email: string) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      "select id from invitation where email = $1 and status = 'pending' order by created_at desc limit 1",
      [email],
    );
    return rows[0]?.id;
  } finally {
    await client.end();
  }
}

/** A new browser session with a verified, signed-in user. */
async function signedIn(browser: Browser, baseURL: string, email: string): Promise<Page> {
  // Same client IP header as the configured context (playwright.config.ts), so reruns are not rate-limited.
  const { extraHTTPHeaders } = test.info().project.use;
  const page = await (await browser.newContext({ baseURL, extraHTTPHeaders })).newPage();
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    data: { name: email.split("@")[0], email, password: "correct-horse-battery" },
    headers: { origin: baseURL },
  });
  expect(signUp.ok()).toBe(true);
  await page.goto(await verificationLink(email), { waitUntil: "networkidle" });
  await expect(page.getByText(email)).toBeVisible();
  return page;
}

test("invite a member who then sees the organization's notes", async ({ browser, baseURL }) => {
  const ownerEmail = `${crypto.randomUUID()}@example.com`;
  const memberEmail = `${crypto.randomUUID()}@example.com`;

  const owner = await signedIn(browser, baseURL ?? "", ownerEmail);
  await owner.getByLabel("Organization name").fill("Acme");
  await owner.getByRole("button", { name: "Create organization" }).click();
  await owner.getByLabel("New note").fill("shared plan");
  await owner.getByRole("button", { name: "Add" }).click();
  await expect(owner.getByText("shared plan")).toBeVisible();

  await owner.getByRole("link", { name: "Acme" }).click();
  await owner.getByLabel("Invite email").fill(memberEmail);
  await owner.getByRole("button", { name: "Send invitation" }).click();
  await expect(owner.getByText("Invitation sent.")).toBeVisible();
  await expect(owner.getByRole("listitem").filter({ hasText: memberEmail })).toBeVisible();

  const member = await signedIn(browser, baseURL ?? "", memberEmail);
  await expect(member.getByText("Create your organization")).toBeVisible();
  await member.goto(`/accept-invitation/${await invitationId(memberEmail)}`, { waitUntil: "networkidle" });
  await member.getByRole("button", { name: "Accept invitation" }).click();
  await expect(member.getByRole("link", { name: "Acme" })).toBeVisible();
  await expect(member.getByText("shared plan")).toBeVisible();
});
