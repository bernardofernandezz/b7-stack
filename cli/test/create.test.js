import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const cli = join(import.meta.dirname, "..", "index.js");
const create = (dir, ...args) =>
  execFileSync("node", [cli, dir, "--yes", "--no-install", "--no-git", ...args], { encoding: "utf8" });

test("scaffolds the fullstack template", () => {
  const app = join(mkdtempSync(join(tmpdir(), "b7-")), "my-app");
  create(app, "--template", "fullstack");

  assert.equal(JSON.parse(readFileSync(join(app, "package.json"), "utf8")).name, "my-app");
  const wrangler = readFileSync(join(app, "wrangler.jsonc"), "utf8");
  assert.match(wrangler, /"name": "my-app"/);
  assert.doesNotMatch(wrangler, /b7-fullstack/);
  assert.deepEqual(JSON.parse(readFileSync(join(app, "b7.json"), "utf8")), {
    profile: "fullstack",
    options: { email: "resend" },
  });
  assert.match(readFileSync(join(app, ".dev.vars"), "utf8"), /^BETTER_AUTH_SECRET=[A-Za-z0-9+/]{43}=$/m);
  assert.ok(existsSync(join(app, ".gitignore")));
  for (const skipped of ["node_modules", "dist", ".wrangler", "test-results"]) assert.ok(!existsSync(join(app, skipped)));
});

test("rejects invalid names and unknown templates", () => {
  const base = mkdtempSync(join(tmpdir(), "b7-"));
  assert.throws(() => create(join(base, "My App")));
  assert.throws(() => create(join(base, "ok"), "-t", "nope"), (e) => e.stdout.includes("Available: fullstack"));
});
