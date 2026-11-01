import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { parseEnv } from "../src/env";
import { createAuth } from "../src/modules/auth/auth";
import { signUpVerified } from "./helpers";

const env = parseEnv(process.env);
const { db, close } = createDb(env.DATABASE_URL);
const auth = createAuth({ db, env });
afterAll(close);

// A fresh address per test run (198.18.0.0/15 is reserved for benchmarking), so reruns don't share buckets.
const randomIp = () => `198.18.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;

const signIn = (ip: string) =>
  auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": ip },
      body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password" }),
    }),
  );

describe("Better Auth rate limiting (database storage, x-forwarded-for)", () => {
  it("limits sign-in attempts per client IP", async () => {
    const ip = randomIp();
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await signIn(ip)).status);
    expect(statuses).toEqual([401, 401, 401, 429]);
    expect((await signIn(randomIp())).status).toBe(401);
  });

  it("rejects auth requests from untrusted origins", async () => {
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
          cookie: "x=1",
          "x-forwarded-for": randomIp(),
        },
        body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password" }),
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe("email verification", () => {
  it("starts no session at sign-up and refuses sign-in until the address is verified", async () => {
    const email = `${crypto.randomUUID()}@example.com`;
    const password = "correct-horse-battery";
    const signUp = await auth.api.signUpEmail({ body: { name: "Test", email, password } });
    expect(signUp.token).toBeNull();
    await expect(auth.api.signInEmail({ body: { email, password } })).rejects.toSatisfy(
      (e: { body?: { code?: string } }) => e.body?.code === "EMAIL_NOT_VERIFIED",
    );
  });

  it("signs in through the verification link", async () => {
    const { headers } = await signUpVerified(auth, env.BETTER_AUTH_SECRET);
    expect((await auth.api.getSession({ headers }))?.user.emailVerified).toBe(true);
  });
});
