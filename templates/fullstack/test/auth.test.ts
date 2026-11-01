import { env } from "cloudflare:workers";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { parseEnv } from "../src/env";
import { createAuth } from "../src/modules/auth/auth";

const { db, close } = createDb(env.HYPERDRIVE.connectionString);
const auth = createAuth({ db, env: parseEnv(env) });
afterAll(close);

// A fresh address per test run (198.18.0.0/15 is reserved for benchmarking), so reruns don't share buckets.
const randomIp = () => `198.18.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;

const signIn = (ip: string) =>
  auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", "cf-connecting-ip": ip },
      body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password" }),
    }),
  );

describe("Better Auth rate limiting (database storage, cf-connecting-ip)", () => {
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
          "cf-connecting-ip": randomIp(),
        },
        body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password" }),
      }),
    );
    expect(response.status).toBe(403);
  });
});
