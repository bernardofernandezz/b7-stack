import { createEmailVerificationToken } from "better-auth/api";
import type { Auth } from "../src/modules/auth/auth";

const cookieHeader = (headers: Headers) =>
  headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

/** Signs up, follows the verification link as the email would, and returns headers carrying the session cookie. */
export async function signUpVerified(auth: Auth, secret: string, password = "correct-horse-battery") {
  const email = `${crypto.randomUUID()}@example.com`;
  await auth.api.signUpEmail({ body: { name: "Test", email, password } });
  const token = await createEmailVerificationToken(secret, email);
  const { headers } = await auth.api.verifyEmail({ query: { token }, returnHeaders: true });
  return { email, headers: new Headers({ cookie: cookieHeader(headers) }) };
}
