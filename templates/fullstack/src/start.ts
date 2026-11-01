import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { createDb } from "./db/client";
import { parseEnv } from "./env";
import { createAuth } from "./modules/auth/auth";

/** One pool and one Better Auth instance per process, built on the first request so a build never needs env. */
let services: ReturnType<typeof createServices> | undefined;

function createServices() {
  const env = parseEnv(process.env);
  const { db } = createDb(env.DATABASE_URL);
  // Better Auth's deferred work (e.g. sending the verification email) outlives the response; log its failures.
  const background = (task: Promise<unknown>) => void task.catch((error) => console.error("[background]", error));
  return { db, auth: createAuth({ db, env, waitUntil: background }) };
}

/** Exposes the shared services to SSR, Better Auth and oRPC through the request context. */
const requestScope = createMiddleware().server(({ next }) => {
  services ??= createServices();
  return next({ context: services });
});

export const startInstance = createStart(() => ({
  // Defining start.ts removes Start's default server-function CSRF guard, so it is re-added here.
  requestMiddleware: [requestScope, createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" })],
}));
