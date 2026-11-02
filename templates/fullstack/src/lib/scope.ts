/** Who is asking, built from the session by `scoped` (src/rpc/middleware.ts), never from input. */
export type Scope = {
  userId: string;
  // #if organizations
  organizationId: string;
  role: string;
  // #endif
};

/** The owner of tenant data and the billing customer: the organization when organizations are enabled, else the user. */
export function ownerOf(scope: Scope) {
  let owner = scope.userId;
  // #if organizations
  owner = scope.organizationId;
  // #endif
  return owner;
}
