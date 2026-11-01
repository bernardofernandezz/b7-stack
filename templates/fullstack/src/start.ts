import { env, waitUntil } from "cloudflare:workers";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { createDb } from "./db/client";
import { parseEnv } from "./env";
import { createAuth } from "./modules/auth/auth";

/** Builds the per-request scope shared by SSR, Better Auth and oRPC. Nothing request-scoped lives at module scope. */
const requestScope = createMiddleware().server(async ({ next }) => {
  const { db, close } = createDb(env.HYPERDRIVE.connectionString);
  const tasks: Promise<unknown>[] = [];
  const background = (task: Promise<unknown>) => {
    tasks.push(task);
    waitUntil(task);
  };
  try {
    return await next({ context: { db, auth: createAuth({ db, env: parseEnv(env), waitUntil: background }) } });
  } finally {
    // Close only after background tasks that may still query the database.
    waitUntil(Promise.allSettled(tasks).then(close));
  }
});

export const startInstance = createStart(() => ({
  // Defining start.ts removes Start's default server-function CSRF guard, so it is re-added here.
  requestMiddleware: [requestScope, createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" })],
}));
