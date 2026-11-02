import { organization } from "better-auth/plugins/organization";
import type { AppEnv } from "../../env";
import { sendEmail } from "../email/send";
import { ac, roles } from "./access";
import { invitationEmail } from "./invitation-email";

/** Better Auth's organization plugin with B7's roles. Invitations are emailed (rule 2: organizations need email). */
export const organizationPlugin = (env: AppEnv) =>
  organization({
    ac,
    roles,
    sendInvitationEmail: ({ id, email, organization, inviter }) =>
      sendEmail(
        env,
        invitationEmail(email, organization.name, inviter.user.name, `${env.BETTER_AUTH_URL}/accept-invitation/${id}`),
      ),
  });
