import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) process.loadEnvFile();

// Tests run in Node against the database in DATABASE_URL (.env or CI). Run `pnpm run db:up && pnpm run db:migrate` first.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    env: { BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters" },
  },
});
