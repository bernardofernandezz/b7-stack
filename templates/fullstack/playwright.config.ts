import { defineConfig } from "@playwright/test";

// Local: runs against `pnpm run dev`. CI smoke test: set BASE_URL to the deployed Worker.
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL },
  webServer: process.env.BASE_URL ? undefined : { command: "pnpm run dev", url: baseURL, reuseExistingServer: true },
});
