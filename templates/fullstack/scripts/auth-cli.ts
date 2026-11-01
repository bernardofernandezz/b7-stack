// Entry point for the Better Auth CLI (`pnpm run auth:schema`). Never imported by the app.
import { createDb } from "../src/db/client";
import { createAuth } from "../src/modules/auth/auth";

export const auth = createAuth({
  db: createDb("postgres://localhost/unused").db,
  env: {
    DATABASE_URL: "postgres://localhost/unused",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3000",
    EMAIL_FROM: "unused",
    RESEND_API_KEY: undefined,
  },
});
