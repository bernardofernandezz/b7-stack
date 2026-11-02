import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * One pool per process (default 10 connections, `DATABASE_POOL_MAX` to change it).
 * Inside `db.transaction`, use the `tx` argument only.
 */
export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_MAX) || 10 });
  // Idle-client errors are emitted on the pool; without a listener they crash the process.
  pool.on("error", (error) => console.warn("[db] idle connection error:", error.message));
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

export type Db = ReturnType<typeof createDb>["db"];
