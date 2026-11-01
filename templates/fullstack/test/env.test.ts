import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/env";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5432/b7",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "https://app.example",
  EMAIL_FROM: "B7 <a@b.c>",
};

describe("parseEnv", () => {
  it("treats an empty RESEND_API_KEY as not configured", () => {
    expect(parseEnv({ ...valid, RESEND_API_KEY: "" }).RESEND_API_KEY).toBeUndefined();
  });

  it("names every invalid variable", () => {
    expect(() => parseEnv({ BETTER_AUTH_SECRET: "short", BETTER_AUTH_URL: "nope" })).toThrow(
      /BETTER_AUTH_SECRET[\s\S]*BETTER_AUTH_URL[\s\S]*EMAIL_FROM/,
    );
  });
});
