// #if organizations
import { organizationClient } from "better-auth/client/plugins";
// #endif
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // #if organizations
  plugins: [organizationClient()],
  // #endif
});
