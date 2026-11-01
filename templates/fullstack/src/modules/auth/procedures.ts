import { base } from "../../rpc/middleware";

/** The current session, or null. Used by the root route to render signed-in state during SSR. */
export const session = base.handler(async ({ context }) => {
  const result = await context.auth.api.getSession({ headers: context.headers });
  return (
    result && {
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        emailVerified: result.user.emailVerified,
      },
    }
  );
});
