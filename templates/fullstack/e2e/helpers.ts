import { createEmailVerificationToken } from "better-auth/api";

/** The path the verification email links to, signed with the app's BETTER_AUTH_SECRET (from .env or the environment). */
export async function verificationLink(email: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET must match the app under test");
  return `/api/auth/verify-email?token=${await createEmailVerificationToken(secret, email)}&callbackURL=/`;
}
