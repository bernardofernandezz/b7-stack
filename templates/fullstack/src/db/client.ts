import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * One connection per request (Workers allow 6 concurrent outbound connections per invocation).
 * A single-connection Pool is used instead of a bare Client because it connects lazily, on the
 * first query, so requests that never touch the database open no connection.
 * Inside `db.transaction`, use the `tx` argument only: other queries would wait for the one connection.
 */
export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString, max: 1 });
  let ending = false;
  // Idle-client errors are emitted on the pool; without a listener they become unhandled rejections.
  // pg-cloudflare reports "socket has been closed" on every deliberate end(), so that case is expected.
  pool.on("error", (error) => {
    if (!ending) console.warn("[db] idle connection error:", error.message);
  });
  const close = () => {
    ending = true;
    return pool.end();
  };
  return { db: drizzle(pool, { schema }), close };
}

export type Db = ReturnType<typeof createDb>["db"];
