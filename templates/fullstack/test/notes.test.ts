import { createRouterClient, ORPCError } from "@orpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { parseEnv } from "../src/env";
import { createAuth } from "../src/modules/auth/auth";
import { router } from "../src/rpc/router";
import { signUpVerified } from "./helpers";

const env = parseEnv(process.env);
const { db, close } = createDb(env.DATABASE_URL);
const auth = createAuth({ db, env });
afterAll(close);

const clientFor = (headers: Headers) => createRouterClient(router, { context: { db, auth, headers } });

const signUp = async () => (await signUpVerified(auth, env.BETTER_AUTH_SECRET)).headers;

const rejectsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toSatisfy((e) => e instanceof ORPCError && e.code === code);

describe("notes procedures", () => {
  it("rejects anonymous callers", async () => {
    await rejectsWith(clientFor(new Headers()).notes.list(), "UNAUTHORIZED");
    await rejectsWith(clientFor(new Headers()).notes.create({ content: "x" }), "UNAUTHORIZED");
  });

  it("persists and lists the caller's notes", async () => {
    const client = clientFor(await signUp());
    const created = await client.notes.create({ content: "  hello  " });
    expect(created.content).toBe("hello");
    expect(await client.notes.list()).toEqual([created]);
  });

  it("validates input before any side effect", async () => {
    const client = clientFor(await signUp());
    await rejectsWith(client.notes.create({ content: " " }), "BAD_REQUEST");
    await rejectsWith(client.notes.create({ content: "x".repeat(501) }), "BAD_REQUEST");
    await rejectsWith(client.notes.delete({ id: "not-a-uuid" }), "BAD_REQUEST");
    expect(await client.notes.list()).toEqual([]);
  });

  it("isolates users from each other's notes", async () => {
    const alice = clientFor(await signUp());
    const bob = clientFor(await signUp());
    const note = await alice.notes.create({ content: "alice only" });

    expect(await bob.notes.list()).toEqual([]);
    await rejectsWith(bob.notes.delete({ id: note.id }), "NOT_FOUND");
    expect(await alice.notes.list()).toEqual([note]);

    await alice.notes.delete({ id: note.id });
    expect(await alice.notes.list()).toEqual([]);
  });

  it("revokes access immediately after sign-out", async () => {
    const headers = await signUp();
    await clientFor(headers).notes.list();
    await auth.api.signOut({ headers });
    await rejectsWith(clientFor(headers).notes.list(), "UNAUTHORIZED");
  });

  it("returns the session from the public session procedure", async () => {
    expect(await clientFor(new Headers()).session()).toBeNull();
    const session = await clientFor(await signUp()).session();
    expect(session?.user.emailVerified).toBe(true); // sign-in requires a verified address
  });
});
