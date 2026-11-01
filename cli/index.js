#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import * as p from "@clack/prompts";

// Never copied from a working template checkout.
const SKIP = new Set(["node_modules", "dist", ".tanstack", ".env", "test-results", "playwright-report"]);

const here = import.meta.dirname;
// Published package ships ./template (see prepack); the repo checkout uses ../templates.
const templatesRoot = existsSync(join(here, "template")) ? join(here, "template") : join(here, "..", "templates");
// Each directory is a template; its b7.json is the configuration it implements.
const TEMPLATES = readdirSync(templatesRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    yes: { type: "boolean", short: "y" },
    template: { type: "string", short: "t" },
    install: { type: "boolean", default: true },
    git: { type: "boolean", default: true },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
  },
  allowNegative: true,
});

if (values.version) {
  console.log(JSON.parse(readFileSync(join(here, "package.json"), "utf8")).version);
  process.exit(0);
}
if (values.help) {
  console.log(`Usage: create-b7 [directory] [options]

Options:
  -t, --template <name>  Template to use (${TEMPLATES.join(", ")})
  -y, --yes              Accept defaults, no prompts
      --no-install       Skip pnpm install
      --no-git           Skip git init
  -v, --version          Print the version
  -h, --help             Print this help`);
  process.exit(0);
}

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
  p.cancel(`Invalid name "${name}": use lowercase letters, digits and dashes (it becomes the package and Compose project name).`);
  process.exit(1);
}
if (existsSync(target) && readdirSync(target).length > 0) {
  p.cancel(`${target} is not empty.`);
  process.exit(1);
}

const template =
  values.template ??
  (values.yes
    ? TEMPLATES[0]
    : cancelled(await p.select({ message: "Template", options: TEMPLATES.map((value) => ({ value })) })));
if (!TEMPLATES.includes(template)) {
  p.cancel(`Unknown template "${template}". Available: ${TEMPLATES.join(", ")}`);
  process.exit(1);
}

cpSync(join(templatesRoot, template), target, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
// npm strips .gitignore from published packages, so prepack ships it as _gitignore.
if (existsSync(join(target, "_gitignore"))) renameSync(join(target, "_gitignore"), join(target, ".gitignore"));

for (const file of ["package.json", "README.md"]) {
  const path = join(target, file);
  if (existsSync(path)) writeFileSync(path, readFileSync(path, "utf8").replaceAll(`b7-${template}`, name));
}
const example = join(target, ".env.example");
if (existsSync(example)) {
  // Hex: the password is embedded in DATABASE_URL, where base64's "+/=" would need escaping.
  const dbPassword = randomBytes(16).toString("hex");
  writeFileSync(
    join(target, ".env"),
    readFileSync(example, "utf8")
      .replace(/^BETTER_AUTH_SECRET=$/m, `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64")}`)
      .replace(/^POSTGRES_PASSWORD=postgres$/m, `POSTGRES_PASSWORD=${dbPassword}`)
      .replace("postgres://postgres:postgres@", `postgres://postgres:${dbPassword}@`),
  );
}
p.log.success(`Created ${name} (${template})`);

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
// Node.js 25+ no longer ships corepack, so pnpm may be missing even where Node is installed.
const hasPnpm = values.install && run("pnpm", ["--version"]);
if (values.install && !hasPnpm) p.log.warn("pnpm not found: install it with `npm install -g pnpm`, then run `pnpm install`");
if (hasPnpm) {
  const s = p.spinner();
  s.start("pnpm install");
  if (run("pnpm", ["install"])) s.stop("Dependencies installed");
  else s.stop("pnpm install failed: run `pnpm install` in the project to see why", 1);
}

p.note(
  [
    `cd ${dir}`,
    ...(hasPnpm ? [] : ["pnpm install"]),
    "pnpm run db:up && pnpm run db:migrate && pnpm run dev   # develop on :3000",
    "docker compose up -d --build                            # or run the whole stack",
  ].join("\n"),
  "Next steps",
);
p.outro("Preview release: see README.md › Verification status before deploying.");
