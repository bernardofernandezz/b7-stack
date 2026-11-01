import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "../../db/client";
import * as schema from "../../db/schema";
import type { AppEnv } from "../../env";
import { sendEmail } from "../email/send";
import { resetPasswordEmail, verificationEmail } from "../email/templates";

type AuthDeps = {
  db: Db;
  env: AppEnv;
  /** Runs Better Auth's deferred work (e.g. sending the verification email) after the response. */
  waitUntil?: (promise: Promise<unknown>) => void;
};

/** Built per request because the database client is request-scoped. */
export function createAuth({ db, env, waitUntil }: AuthDeps) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: ({ user, url }) => sendEmail(env, resetPasswordEmail(user.email, user.name, url)),
      // A reset ends every existing session, so a stolen session does not survive the password change.
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: ({ user, url }) => sendEmail(env, verificationEmail(user.email, user.name, url)),
    },
    // Database storage, so limits hold across app replicas. Enabled explicitly so dev and tests exercise it.
    rateLimit: { enabled: true, storage: "database" },
    advanced: {
      // Better Auth skips the origin check when NODE_ENV=test; keep it on so tests exercise production behavior.
      disableOriginCheck: false,
      // Set by the Caddy reverse proxy, which replaces any client-supplied value (compose.yaml, Caddyfile).
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
      backgroundTasks: waitUntil && { handler: waitUntil },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
