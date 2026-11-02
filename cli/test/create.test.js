import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const cli = join(import.meta.dirname, "..", "index.js");
const create = (dir, ...args) =>
  execFileSync("node", [cli, dir, "--yes", "--no-install", "--no-git", ...args], { encoding: "utf8" });

test("scaffolds the fullstack template", () => {
  const app = join(mkdtempSync(join(tmpdir(), "b7-")), "my-app");
  create(app, "--template", "fullstack");

  assert.equal(JSON.parse(readFileSync(join(app, "package.json"), "utf8")).name, "my-app");
  assert.deepEqual(JSON.parse(readFileSync(join(app, "b7.json"), "utf8")), {
    profile: "fullstack",
    options: { email: "resend", organizations: false, billing: "none" },
    derived: { scheduler: false },
    version: JSON.parse(readFileSync(join(dirname(cli), "package.json"), "utf8")).version,
  });
  assert.ok(!existsSync(join(app, "b7.features.json")));
  assert.deepEqual(markersIn(app), []);
  const env = readFileSync(join(app, ".env"), "utf8");
  assert.match(env, /^BETTER_AUTH_SECRET=[A-Za-z0-9+/]{43}=$/m);
  const password = env.match(/^POSTGRES_PASSWORD=([0-9a-f]{32})$/m)?.[1];
  assert.ok(password, "random POSTGRES_PASSWORD");
  assert.match(env, new RegExp(`^DATABASE_URL=postgres://postgres:${password}@localhost:5432/b7$`, "m"));
  for (const file of ["Dockerfile", "compose.yaml", "Caddyfile", ".dockerignore"]) assert.ok(existsSync(join(app, file)));
  assert.ok(existsSync(join(app, ".gitignore")));
  for (const skipped of ["node_modules", "dist", "test-results"]) assert.ok(!existsSync(join(app, skipped)));
  assert.ok(!existsSync(join(app, "src/modules/organizations")));
  assert.doesNotMatch(readFileSync(join(app, "src/modules/notes/schema.ts"), "utf8"), /organizationId/);
  assert.ok(!existsSync(join(app, "src/modules/billing")));
  assert.doesNotMatch(readFileSync(join(app, "compose.yaml"), "utf8"), /scheduler|STRIPE/);
  assert.equal(JSON.parse(readFileSync(join(app, "package.json"), "utf8")).dependencies.stripe, undefined);
  assert.doesNotMatch(readFileSync(join(app, "src/rpc/router.ts"), "utf8"), /biome-ignore-all/);
});

test("--organizations keeps the organizations feature", () => {
  const app = join(mkdtempSync(join(tmpdir(), "b7-")), "orgs");
  create(app, "--organizations");
  assert.ok(existsSync(join(app, "src/modules/organizations/membership.ts")));
  assert.match(readFileSync(join(app, "src/modules/notes/schema.ts"), "utf8"), /organizationId/);
  assert.equal(JSON.parse(readFileSync(join(app, "b7.json"), "utf8")).options.organizations, true);
  assert.deepEqual(markersIn(app), []);
});

/** Files that still contain a region marker after generation. */
const markersIn = (dir) =>
  readdirSync(dir, { recursive: true }).filter((f) => {
    try {
      return /^\s*\S+\s*#(if|endif)\b/m.test(readFileSync(join(dir, f), "utf8"));
    } catch {
      return false; // a directory
    }
  });

test("--billing stripe keeps billing and derives the scheduler", () => {
  const app = join(mkdtempSync(join(tmpdir(), "b7-")), "billing");
  create(app, "--billing", "stripe");
  assert.ok(existsSync(join(app, "src/routes/api/webhooks/stripe.ts")));
  assert.match(readFileSync(join(app, "compose.yaml"), "utf8"), /scheduler:/);
  assert.match(readFileSync(join(app, ".env"), "utf8"), /^CRON_SECRET=.{44}$/m);
  assert.deepEqual(JSON.parse(readFileSync(join(app, "b7.json"), "utf8")).derived, { scheduler: true });
  assert.deepEqual(markersIn(app), []);
});

test("--email none drops the email feature", () => {
  const app = join(mkdtempSync(join(tmpdir(), "b7-")), "no-email");
  create(app, "--email", "none");

  const pkg = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  assert.equal(pkg.dependencies.resend, undefined);
  for (const gone of ["src/modules/email", "src/routes/forgot-password.tsx", "test/email.test.ts", "drizzle"])
    assert.ok(!existsSync(join(app, gone)), gone);
  const auth = readFileSync(join(app, "src/modules/auth/auth.ts"), "utf8");
  assert.doesNotMatch(auth, /sendEmail|requireEmailVerification/);
  assert.doesNotMatch(readFileSync(join(app, ".env.example"), "utf8"), /RESEND_API_KEY/);
  assert.equal(JSON.parse(readFileSync(join(app, "b7.json"), "utf8")).options.email, "none");
  assert.deepEqual(markersIn(app), []);
});

test("configuration rule violations exit with the rule number", () => {
  const base = mkdtempSync(join(tmpdir(), "b7-"));
  assert.throws(() => create(join(base, "a"), "--email", "smtp"), (e) => e.stdout.includes("Rule 1"));
  assert.throws(() => create(join(base, "b"), "--billing", "paypal"), (e) => e.stdout.includes("Rule 1"));
  assert.throws(() => create(join(base, "c"), "--organizations", "--email", "none"), (e) => e.stdout.includes("Rule 2"));
});

test("rejects invalid names and unknown templates", () => {
  const base = mkdtempSync(join(tmpdir(), "b7-"));
  assert.throws(() => create(join(base, "My App")));
  assert.throws(() => create(join(base, "ok"), "-t", "nope"), (e) => e.stdout.includes("Available: fullstack"));
});

test("--help lists flags and templates, --version prints the package version", () => {
  const help = execFileSync("node", [cli, "--help"], { encoding: "utf8" });
  for (const flag of ["--template", "--yes", "--no-install", "--no-git", "--version", "fullstack"]) assert.ok(help.includes(flag));
  const { version } = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"));
  assert.equal(execFileSync("node", [cli, "-v"], { encoding: "utf8" }).trim(), version);
});

// Skipped where pnpm sits next to node (npm install -g), since PATH can't then exclude it.
test("warns instead of failing when pnpm is missing", { skip: existsSync(join(dirname(process.execPath), "pnpm")) }, () => {
  const app = join(mkdtempSync(join(tmpdir(), "b7-")), "no-pnpm");
  // PATH without pnpm: only the directory of the running node binary.
  const out = execFileSync(process.execPath, [cli, app, "--yes", "--no-git"], {
    encoding: "utf8",
    env: { ...process.env, PATH: dirname(process.execPath) },
  });
  assert.match(out, /pnpm not found/);
  assert.ok(existsSync(join(app, "package.json")));
});
