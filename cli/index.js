#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import * as p from "@clack/prompts";
import { resolveConfig } from "./config.js";
import { applyRegions, holds } from "./regions.js";

// Never copied from a working template checkout. b7.features.json describes the template, not the project.
const SKIP = new Set(["node_modules", "dist", ".tanstack", ".env", "test-results", "playwright-report", "b7.features.json"]);
// Configuration options (docs/configuration-model.md). Each template's b7.features.json says which it supports.
const OPTION_FLAGS = { email: { type: "string" }, organizations: { type: "boolean" }, billing: { type: "string" } };

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
    ...OPTION_FLAGS,
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
      --email <resend|none>          Email provider (fullstack)
      --[no-]organizations           Organizations and members (fullstack, needs email)
      --billing <stripe|none>        Billing provider (fullstack)
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

const templateDir = join(templatesRoot, template);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = existsSync(join(templateDir, "b7.features.json"))
  ? readJson(join(templateDir, "b7.features.json"))
  : { options: {}, features: {} };
const { profile } = readJson(join(templateDir, "b7.json"));

// Flags first; prompts for the rest unless --yes. Options this template does not support are rejected by rule 1.
const requested = Object.fromEntries(Object.keys(OPTION_FLAGS).flatMap((k) => (values[k] === undefined ? [] : [[k, values[k]]])));
for (const [option, spec] of Object.entries(manifest.options)) {
  if (option in requested || values.yes) continue;
  requested[option] =
    typeof spec.default === "boolean"
      ? cancelled(await p.confirm({ message: `Add ${option}?`, initialValue: spec.default }))
      : cancelled(await p.select({ message: option, initialValue: spec.default, options: spec.choices.map((value) => ({ value })) }));
}
let resolved;
try {
  resolved = resolveConfig(profile, manifest, requested);
} catch (error) {
  p.cancel(error.message);
  process.exit(1);
}
const { config, notices } = resolved;
for (const notice of notices) p.log.warn(notice);

cpSync(templateDir, target, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
// npm strips .gitignore from published packages, so prepack ships it as _gitignore.
if (existsSync(join(target, "_gitignore"))) renameSync(join(target, "_gitignore"), join(target, ".gitignore"));

// Disabled features lose their files and dependencies; every text file keeps or drops its regions (ADR-014).
const disabled = Object.entries(manifest.features ?? {}).filter(([feature]) => !holds(feature, config.options));
const pkgPath = join(target, "package.json");
const pkg = readJson(pkgPath);
for (const [, feature] of disabled) {
  for (const file of feature.files ?? []) rmSync(join(target, file), { recursive: true, force: true });
  for (const dep of feature.dependencies ?? []) {
    delete pkg.dependencies?.[dep];
    delete pkg.devDependencies?.[dep];
  }
}
pkg.name = name;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
// The template's migrations include tables of every feature, so a smaller configuration gets a fresh one.
if (disabled.length) rmSync(join(target, "drizzle"), { recursive: true, force: true });

for (const file of readdirSync(target, { recursive: true })) {
  const path = join(target, file);
  if (file.split(/[\\/]/).includes(".git") || !statSync(path).isFile()) continue;
  const text = readFileSync(path, "utf8");
  if (!text.includes("#if") || text.includes("\0")) continue;
  writeFileSync(path, applyRegions(text, config.options, file));
}

const readme = join(target, "README.md");
if (existsSync(readme)) writeFileSync(readme, readFileSync(readme, "utf8").replaceAll(`b7-${template}`, name));
writeFileSync(join(target, "b7.json"), `${JSON.stringify(config, null, 2)}\n`);
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
p.log.success(`Created ${name} (${template}: ${JSON.stringify(config.options)})`);

const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: target, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
// Node.js 25+ no longer ships corepack, so pnpm may be missing even where Node is installed.
const hasPnpm = run("pnpm", ["--version"]);
if (!hasPnpm) p.log.warn("pnpm not found: install it with `npm install -g pnpm`, then run `pnpm install`");
// Steps a smaller configuration needs before it builds: a fresh migration and the route tree. Formatting
// tidies the blank lines that removed regions leave behind.
const finalize = [...(disabled.length ? ["pnpm run db:generate init", "pnpm run build"] : []), "pnpm run format"];
let installed = false;
if (hasPnpm && values.install) {
  const s = p.spinner();
  s.start("pnpm install");
  installed = run("pnpm", ["install"]) && finalize.every((step) => run("pnpm", step.split(" ").slice(1)));
  if (installed) s.stop(disabled.length ? "Dependencies installed, migration and route tree generated" : "Dependencies installed");
  else s.stop(`Setup failed: run \`${["pnpm install", ...finalize].join(" && ")}\` in the project to see why`, 1);
} else if (hasPnpm && disabled.length && !run("pnpm", ["install", "--lockfile-only"])) {
  p.log.warn("Could not update pnpm-lock.yaml: run `pnpm install` before building the Docker image");
}

if (values.git) {
  if (!(run("git", ["init", "-q"]) && run("git", ["add", "-A"]) && run("git", ["commit", "-qm", "chore: create-b7"])))
    p.log.warn("git init skipped (git missing or not configured)");
}

p.note(
  [
    `cd ${dir}`,
    ...(installed ? [] : ["pnpm install", ...finalize]),
    "pnpm run db:up && pnpm run db:migrate && pnpm run dev   # develop on :3000",
    "docker compose up -d --build                            # or run the whole stack",
  ].join("\n"),
  "Next steps",
);
p.outro("Preview release: see README.md › Verification status before deploying.");
