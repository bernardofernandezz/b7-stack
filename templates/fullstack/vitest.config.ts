import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run in workerd with the real Hyperdrive binding (localConnectionString → Docker Postgres).
// Run `pnpm run db:up && pnpm run db:migrate` first.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters" } },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
});
