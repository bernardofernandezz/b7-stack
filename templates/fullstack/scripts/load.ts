// D-T2 load check: `node scripts/load.ts [baseUrl] [rps] [seconds] [appReplicas]` against a running stack (default:
// Compose via Caddy, 50 RPS for 600 s, 1 replica). A signed-in user lists notes, so each request queries PostgreSQL.
// Passes when every response is 200 and connections never exceed replicas × DATABASE_POOL_MAX (+1 for this script).
import { existsSync } from "node:fs";
import { createEmailVerificationToken } from "better-auth/api";
import pg from "pg";

if (existsSync(".env")) process.loadEnvFile();
const [baseUrl = "http://localhost", rps = "50", seconds = "600", replicas = "1"] = process.argv.slice(2);
const limit = Number(replicas) * (Number(process.env.DATABASE_POOL_MAX) || 10) + 1;

// Sign up and sign in through the verification link (with email) or the sign-up response (without).
const email = `load-${crypto.randomUUID()}@example.com`;
const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: baseUrl },
  body: JSON.stringify({ name: "Load", email, password: "correct-horse-battery" }),
});
let setCookie = signUp.headers.getSetCookie();
if (!setCookie.length) {
  const token = await createEmailVerificationToken(process.env.BETTER_AUTH_SECRET ?? "", email);
  const verify = await fetch(`${baseUrl}/api/auth/verify-email?token=${token}&callbackURL=/`, { redirect: "manual" });
  setCookie = verify.headers.getSetCookie();
}
const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
// With organizations, notes need an active one; without, this endpoint does not exist and is ignored.
await fetch(`${baseUrl}/api/auth/organization/create`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: baseUrl, cookie },
  body: JSON.stringify({ name: "Load", slug: `load-${crypto.randomUUID()}` }),
});

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const connections = async () =>
  Number((await db.query("select count(*) from pg_stat_activity where datname = current_database()")).rows[0].count);

const call = () =>
  fetch(`${baseUrl}/api/rpc/notes/list`, {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", cookie },
    body: "{}",
  }).then((r) => r.status);

const statuses = new Map<number, number>();
const samples: number[] = [];
const end = Date.now() + Number(seconds) * 1000;
let next = Date.now();
let pending: Promise<void>[] = [];
while (Date.now() < end) {
  pending.push(
    call()
      .catch(() => 0)
      .then((status) => void statuses.set(status, (statuses.get(status) ?? 0) + 1)),
  );
  next += 1000 / Number(rps);
  if (pending.length >= Number(rps) * 10) {
    await Promise.all(pending);
    pending = [];
    samples.push(await connections());
    console.log(`connections=${samples.at(-1)} statuses=${JSON.stringify(Object.fromEntries(statuses))}`);
  }
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, next - Date.now())));
}
await Promise.all(pending);
await db.end();
const failed = [...statuses].filter(([status]) => status !== 200).reduce((n, [, count]) => n + count, 0);
console.log(`done: connections max ${Math.max(...samples)} (limit ${limit}), non-200 responses ${failed}`);
process.exit(failed === 0 && Math.max(...samples) <= limit ? 0 : 1);
