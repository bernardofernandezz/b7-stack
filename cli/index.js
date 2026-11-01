#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import * as p from "@clack/prompts";

const PROFILES = [
  { value: "fullstack", label: "Fullstack", hint: "TanStack Start, oRPC, Better Auth, PostgreSQL, Workers" },
  { value: "web", label: "Web", hint: "coming soon", disabled: true },
  { value: "api", label: "API", hint: "coming soon", disabled: true },
];
// Only configuration with a tested template. New options land here once their template exists.
const CONFIG = { profile: "fullstack", options: { email: "resend" } };
// Never copied from a working template checkout.
const SKIP = new Set(["node_modules", "dist", ".wrangler", ".tanstack", ".dev.vars", "test-results", "playwright-report"]);

const here = import.meta.dirname;
// Published package ships ./template (see prepack); the repo checkout uses ../templates.
const templateDir = (profile) =>
  existsSync(join(here, "template", profile)) ? join(here, "template", profile) : join(here, "..", "templates", profile);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    yes: { type: "boolean", short: "y" },
    profile: { type: "string" },
    install: { type: "boolean", default: true },
    git: { type: "boolean", default: true },
  },
  allowNegative: true,
});

const cancelled = (v) => {
  if (p.isCancel(v)) {
    p.cancel("Cancelled.");
    process.exit(1);
  }
  return v;
};

p.intro("create-b7");

let dir = positionals[0];
if (!dir) {
  dir = values.yes
    ? "my-b7-app"
    : cancelled(
        await p.text({
          message: "Project directory",
          placeholder: "my-b7-app",
          defaultValue: "my-b7-app",
        }),
      );
}
const target = resolve(dir);
const name = basename(target);
if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  p.cancel(`Invalid name "${name}": use lowercase letters, digits and dashes (it becomes the Worker name).`);
  process.exit(1);
}
if (existsSync(target) && readdirSync(target).length > 0) {
  p.cancel(`${target} is not empty.`);
  process.exit(1);
}

const profile =
  values.profile ?? (values.yes ? "fullstack" : cancelled(await p.select({ message: "Profile", options: PROFILES })));
if (!PROFILES.some((x) => x.value === profile && !x.disabled)) {
  p.cancel(`Profile "${profile}" is not available yet.`);
  process.exit(1);
}

cpSync(templateDir(profile), target, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
// npm strips .gitignore from published packages, so prepack ships it as _gitignore.
if (existsSync(join(target, "_gitignore"))) renameSync(join(target, "_gitignore"), join(target, ".gitignore"));

for (const file of ["package.json", "wrangler.jsonc", "README.md"]) {
  const path = join(target, file);
  writeFileSync(path, readFileSync(path, "utf8").replaceAll("b7-fullstack", name));
}
writeFileSync(
  join(target, ".dev.vars"),
  readFileSync(join(target, ".dev.vars.example"), "utf8").replace(
    /^BETTER_AUTH_SECRET=$/m,
    `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64")}`,
  ),
);
writeFileSync(join(target, "b7.json"), `${JSON.stringify({ ...CONFIG, profile }, null, 2)}\n`);
p.log.success(`Created ${name} (${profile})`);

const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: target, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
if (values.git) {
  if (!(run("git", ["init", "-q"]) && run("git", ["add", "-A"]) && run("git", ["commit", "-qm", "chore: create-b7"])))
    p.log.warn("git init skipped (git missing or not configured)");
}
if (values.install) {
  const s = p.spinner();
  s.start("pnpm install");
  if (run("pnpm", ["install"])) s.stop("Dependencies installed");
  else s.stop("pnpm install failed: run `corepack enable`, then `pnpm install`", 1);
}

p.note(
  [`cd ${dir}`, ...(values.install ? [] : ["pnpm install"]), "pnpm run db:up", "pnpm run db:migrate", "pnpm run dev"].join(
    "\n",
  ),
  "Next steps",
);
p.outro("Preview release: see README.md › Verification status before deploying.");
