import { defineConfig } from "drizzle-kit";

// Migrations run against the direct database URL, never through Hyperdrive or the Worker.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/b7" },
});
