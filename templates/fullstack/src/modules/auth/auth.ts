import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "../../db/client";
import * as schema from "../../db/schema";
import type { AppEnv } from "../../env";
import { sendEmail } from "../email/send";
import { verificationEmail } from "../email/templates";

type AuthDeps = {
  db: Db;
  env: AppEnv;
  /** Keeps Better Auth's deferred work (e.g. sending the verification email) alive after the response. */
  waitUntil?: (promise: Promise<unknown>) => void;
};

/** Built per request because the database client is request-scoped. */
export function createAuth({ db, env, waitUntil }: AuthDeps) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: ({ user, url }) => sendEmail(env, verificationEmail(user.email, user.name, url)),
    },
    // Database storage: memory storage is per-isolate on Workers. Enabled explicitly so dev and tests exercise it.
    rateLimit: { enabled: true, storage: "database" },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      backgroundTasks: waitUntil && { handler: waitUntil },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
