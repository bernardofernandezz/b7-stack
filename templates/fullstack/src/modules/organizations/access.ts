import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, memberAc, ownerAc } from "better-auth/plugins/organization/access";

/** Better Auth's organization statements plus the app's own. `billing: manage` guards the billing procedures. */
export const statements = { ...defaultStatements, billing: ["manage"] } as const;

export const ac = createAccessControl(statements);

export const roles = {
  owner: ac.newRole({ ...ownerAc.statements, billing: ["manage"] }),
  admin: ac.newRole({ ...adminAc.statements, billing: ["manage"] }),
  member: ac.newRole({ ...memberAc.statements }),
};

export type Permission = { [K in keyof typeof statements]?: (typeof statements)[K][number][] };

/** Whether `role` (from the member row, never from input) grants every action in `permission`. */
export function roleCan(role: string, permission: Permission) {
  const granted = roles[role as keyof typeof roles];
  return granted?.authorize(permission).success === true;
}
