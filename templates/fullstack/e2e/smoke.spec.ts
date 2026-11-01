import { expect, test } from "@playwright/test";

// Read-only post-deploy check: SSR, assets, the RPC route and the auth route all answer from the deployed app.
test("deployed app serves SSR, RPC and auth", async ({ page, request }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "B7 Fullstack" })).toBeVisible();

  const rpc = await request.post("/api/rpc/session", { data: {}, headers: { "sec-fetch-site": "same-origin" } });
  expect(rpc.status()).toBe(200);
  expect(await rpc.json()).toEqual({ json: null });

  const auth = await request.get("/api/auth/get-session");
  expect(auth.status()).toBe(200);
});
