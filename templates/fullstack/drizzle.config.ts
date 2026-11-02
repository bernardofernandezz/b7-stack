import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Local runs read .env; in Docker the variable comes from compose.yaml. Existing variables win.
if (existsSync(".env")) process.loadEnvFile();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
