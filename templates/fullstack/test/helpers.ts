// biome-ignore-all assist/source/organizeImports: B7 feature regions
// #if email
import { createEmailVerificationToken } from "better-auth/api";
// #endif
import type { Auth } from "../src/modules/auth/auth";

const cookieHeader = (headers: Headers) =>
  headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

/** Signs up (following the verification link as the email would) and returns headers carrying the session cookie. */
export async function signUpVerified(auth: Auth, password = "correct-horse-battery") {
  const email = `${crypto.randomUUID()}@example.com`;
  let { headers } = await auth.api.signUpEmail({ body: { name: "Test", email, password }, returnHeaders: true });
  // #if email
  // Verification is required, so sign-up started no session; the link in the email does.
  // Same secret as the app under test (vitest.config.ts sets it).
  const token = await createEmailVerificationToken(process.env.BETTER_AUTH_SECRET ?? "", email);
  ({ headers } = await auth.api.verifyEmail({ query: { token }, returnHeaders: true }));
  // #endif
  return { email, headers: new Headers({ cookie: cookieHeader(headers) }) };
}

/** A user ready for tenant procedures: with organizations, the owner of a new organization, made active. */
export async function signUpWithScope(auth: Auth, password?: string) {
  const user = await signUpVerified(auth, password);
  let organizationId = "";
  // #if organizations
  const org = await auth.api.createOrganization({
    body: { name: "Test org", slug: `org-${crypto.randomUUID()}` },
    headers: user.headers,
  });
  organizationId = org?.id ?? "";
  // #endif
  return { ...user, organizationId };
}
