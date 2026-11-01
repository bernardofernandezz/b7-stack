import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Tests that read the database (e.g. password reset) use DATABASE_URL from .env or the environment.
if (existsSync(".env")) process.loadEnvFile();

// Local: runs against `pnpm run dev`. Against a running stack: BASE_URL=http://localhost (docker compose) or the production URL.
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL,
    // One client IP per run, so reruns are not throttled by auth rate limits (3 resets/min). Caddy replaces it.
    extraHTTPHeaders: {
      "x-forwarded-for": `198.18.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
    },
  },
  webServer: process.env.BASE_URL ? undefined : { command: "pnpm run dev", url: baseURL, reuseExistingServer: true },
});
