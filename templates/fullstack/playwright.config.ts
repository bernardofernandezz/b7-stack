import { defineConfig } from "@playwright/test";

// Local: runs against `pnpm run dev`. Against a running stack: BASE_URL=http://localhost (docker compose) or the production URL.
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL },
  webServer: process.env.BASE_URL ? undefined : { command: "pnpm run dev", url: baseURL, reuseExistingServer: true },
});
