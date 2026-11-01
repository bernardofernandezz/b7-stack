import { createRouterClient, ORPCError } from "@orpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { parseEnv } from "../src/env";
import { createAuth } from "../src/modules/auth/auth";
import { requirePermission } from "../src/modules/organizations/membership";
import { scoped } from "../src/rpc/middleware";
import { router } from "../src/rpc/router";
import { signUpVerified, signUpWithScope } from "./helpers";

const env = { ...parseEnv(process.env), RESEND_API_KEY: undefined };
const { db, close } = createDb(env.DATABASE_URL);
const auth = createAuth({ db, env });
afterAll(close);

// A procedure guarded like the billing procedures (`billing: manage`), to test the permission check on its own.
const testRouter = {
  ...router,
  manageBilling: scoped.use(requirePermission({ billing: ["manage"] })).handler(() => "ok"),
};
const clientFor = (headers: Headers) => createRouterClient(testRouter, { context: { db, auth, headers } });
const rejectsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toSatisfy((e) => e instanceof ORPCError && e.code === code);

/** Adds a verified user to the organization with `role` and makes it their active one. */
async function joinAs(organizationId: string, role: "member" | "admin") {
  const user = await signUpVerified(auth);
  const session = await auth.api.getSession({ headers: user.headers });
  await auth.api.addMember({ body: { userId: session?.user.id as string, role, organizationId } });
  await auth.api.setActiveOrganization({ body: { organizationId }, headers: user.headers });
  return user;
}

describe("organizations", () => {
  it("shares notes between members of the same organization", async () => {
    const owner = await signUpWithScope(auth);
    const note = await clientFor(owner.headers).notes.create({ content: "team note" });
    const member = await joinAs(owner.organizationId, "member");
    expect(await clientFor(member.headers).notes.list()).toEqual([note]);
  });

  it("M-T1: another organization's note IDs give NOT_FOUND and no data", async () => {
    const a = await signUpWithScope(auth);
    const b = await signUpWithScope(auth);
    const noteB = await clientFor(b.headers).notes.create({ content: "org B only" });
    expect(await clientFor(a.headers).notes.list()).toEqual([]);
    await rejectsWith(clientFor(a.headers).notes.delete({ id: noteB.id }), "NOT_FOUND");
    expect(await clientFor(b.headers).notes.list()).toEqual([noteB]);
  });

  it("M-T2: a session without an active organization gets NO_ACTIVE_ORGANIZATION", async () => {
    const { headers } = await signUpVerified(auth);
    await rejectsWith(clientFor(headers).notes.list(), "NO_ACTIVE_ORGANIZATION");
  });

  it("M-T3: the member role cannot use a billing: manage procedure; owner and admin can", async () => {
    const owner = await signUpWithScope(auth);
    const member = await joinAs(owner.organizationId, "member");
    const admin = await joinAs(owner.organizationId, "admin");
    await rejectsWith(clientFor(member.headers).manageBilling(), "FORBIDDEN");
    expect(await clientFor(owner.headers).manageBilling()).toBe("ok");
    expect(await clientFor(admin.headers).manageBilling()).toBe("ok");
  });

  it("H-T2: a removed member is rejected on the next call, despite a stale active organization", async () => {
    const owner = await signUpWithScope(auth);
    const member = await joinAs(owner.organizationId, "member");
    await clientFor(member.headers).notes.list();
    await auth.api.removeMember({
      body: { memberIdOrEmail: member.email, organizationId: owner.organizationId },
      headers: owner.headers,
    });
    const session = await auth.api.getSession({ headers: member.headers });
    expect(session?.session.activeOrganizationId).toBe(owner.organizationId); // still set: membership is what counts
    await rejectsWith(clientFor(member.headers).notes.list(), "FORBIDDEN");
  });
});
