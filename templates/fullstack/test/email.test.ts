import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/env";
import { sendEmail } from "../src/modules/email/send";
import { verificationEmail } from "../src/modules/email/templates";

const env: AppEnv = {
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  EMAIL_FROM: "B7 <noreply@example.com>",
  RESEND_API_KEY: "re_test_key",
};
const email = verificationEmail("ada@example.com", "Ada <script>", "https://app.example/verify?token=a&b");

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("sendEmail (Resend faked at the HTTP boundary)", () => {
  it("sends through the Resend API with the configured key and sender", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ id: "email_1" }));
    await sendEmail(env, email);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.resend.com/emails");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_test_key");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      from: env.EMAIL_FROM,
      to: "ada@example.com",
      subject: "Verify your email address",
    });
  });

  it("throws when Resend returns an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ name: "validation_error", message: "Invalid `from` field" }, { status: 422 }),
    );
    await expect(sendEmail(env, email)).rejects.toThrow(/validation_error/);
  });

  it("refuses to drop email silently outside development", async () => {
    vi.stubEnv("DEV", false);
    await expect(sendEmail({ ...env, RESEND_API_KEY: undefined }, email)).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("escapes user-controlled values in HTML", () => {
    expect(email.html).toContain("Ada &lt;script&gt;");
    expect(email.html).toContain("token=a&amp;b");
    expect(email.html).not.toContain("<script>");
  });
});
