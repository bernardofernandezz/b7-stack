import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/env";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5432/b7",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "https://app.example",
  // #if email
  EMAIL_FROM: "B7 <a@b.c>",
  // #endif
};

describe("parseEnv", () => {
  // #if email
  it("treats an empty RESEND_API_KEY as not configured", () => {
    expect(parseEnv({ ...valid, RESEND_API_KEY: "" }).RESEND_API_KEY).toBeUndefined();
  });
  // #endif

  it("names every invalid variable", () => {
    expect(parseEnv(valid).BETTER_AUTH_URL).toBe("https://app.example");
    expect(() => parseEnv({ BETTER_AUTH_SECRET: "short", BETTER_AUTH_URL: "nope" })).toThrow(
      /DATABASE_URL[\s\S]*BETTER_AUTH_SECRET[\s\S]*BETTER_AUTH_URL/,
    );
  });
});
