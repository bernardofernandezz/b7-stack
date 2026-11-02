// The organization plugin's tables live in the generated auth schema; this module is how other modules import them.
export { invitation, member, organization } from "../auth/schema";
