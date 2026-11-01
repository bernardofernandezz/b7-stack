import { base } from "../../rpc/middleware";
// #if organizations
import { activeOrganization } from "../organizations/service";
// #endif

/** The current session, or null. Used by the root route to render signed-in state during SSR. */
export const session = base.handler(async ({ context }) => {
  const result = await context.auth.api.getSession({ headers: context.headers });
  if (!result) return null;
  return {
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      emailVerified: result.user.emailVerified,
    },
    // #if organizations
    organization: await activeOrganization(context.db, result.user.id, result.session.activeOrganizationId),
    // #endif
  };
});
