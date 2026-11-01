import { afterAll, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { createDb } from "../src/db/client";
import { parseEnv } from "../src/env";
import { createAuth } from "../src/modules/auth/auth";

// A Resend key makes emails go through fetch, which is faked so the test can read the emailed link.
const env = { ...parseEnv(process.env), RESEND_API_KEY: "re_test_key" };
const { db, close } = createDb(env.DATABASE_URL);
const auth = createAuth({ db, env });
afterAll(close);

let fetch: MockInstance<typeof globalThis.fetch>;
beforeEach(() => {
  fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ id: "email_1" }));
  return () => fetch.mockRestore();
});

const sentEmails = () => fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

async function signUp(password: string) {
  const email = `${crypto.randomUUID()}@example.com`;
  const { headers } = await auth.api.signUpEmail({ body: { name: "Test", email, password }, returnHeaders: true });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { email, headers: new Headers({ cookie }) };
}

/** Requests a reset and returns the token from the link in the email. */
async function resetToken(email: string) {
  await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
  const reset = sentEmails().find((e) => e.subject === "Reset your password" && e.to === email);
  return reset?.text.match(/\/reset-password\/([^?\s]+)/)?.[1] as string;
}

describe("password reset", () => {
  it("sets the new password and ends existing sessions", async () => {
    const { email, headers } = await signUp("old-password-123");
    const token = await resetToken(email);
    expect(token).toBeTruthy();

    await auth.api.resetPassword({ body: { token, newPassword: "new-password-456" } });

    expect(await auth.api.getSession({ headers })).toBeNull();
    await expect(auth.api.signInEmail({ body: { email, password: "old-password-123" } })).rejects.toThrow();
    await expect(auth.api.signInEmail({ body: { email, password: "new-password-456" } })).resolves.toBeTruthy();
  });

  it("accepts each token once", async () => {
    const { email } = await signUp("old-password-123");
    const token = await resetToken(email);
    await auth.api.resetPassword({ body: { token, newPassword: "new-password-456" } });
    await expect(auth.api.resetPassword({ body: { token, newPassword: "other-password-789" } })).rejects.toThrow();
  });

  it("answers the same for unknown addresses and sends nothing", async () => {
    const result = await auth.api.requestPasswordReset({ body: { email: `${crypto.randomUUID()}@example.com` } });
    expect(result.status).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
