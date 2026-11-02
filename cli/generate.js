// Writes a configuration of a template into a directory.
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { applyRegions, holds } from "./regions.js";

// Never copied from a working template checkout. b7.features.json describes the template, not the project.
const SKIP = new Set(["node_modules", "dist", ".tanstack", ".env", "test-results", "playwright-report", "b7.features.json"]);

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export const readManifest = (templateDir) =>
  existsSync(join(templateDir, "b7.features.json"))
    ? readJson(join(templateDir, "b7.features.json"))
    : { options: {}, features: {} };

/** Copies `templateDir` into `target` for `config`, as create-b7 does. Returns the disabled features. */
export function generate({ templateDir, target, name, template, config, version }) {
  const manifest = readManifest(templateDir);
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
  // `version` is the create-b7 release that wrote the project, the merge base for a future `b7 update`.
  writeFileSync(join(target, "b7.json"), `${JSON.stringify({ ...config, version }, null, 2)}\n`);
  return disabled;
}

/** Fills the secrets an .env.example leaves empty. `existing` keys are kept as they are. */
export function fillEnv(example, existing = "") {
  const have = new Set(existing.match(/^[A-Z0-9_]+(?==)/gm) ?? []);
  // Hex: the password is embedded in DATABASE_URL, where base64's "+/=" would need escaping.
  const dbPassword = randomBytes(16).toString("hex");
  const filled = example
    .replace(/^BETTER_AUTH_SECRET=$/m, `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64")}`)
    .replace(/^CRON_SECRET=$/m, `CRON_SECRET=${randomBytes(32).toString("base64")}`)
    .replace(/^POSTGRES_PASSWORD=postgres$/m, `POSTGRES_PASSWORD=${dbPassword}`)
    .replace("postgres://postgres:postgres@", `postgres://postgres:${dbPassword}@`);
  if (!existing) return filled;
  const missing = filled.split("\n").filter((line) => /^[A-Z0-9_]+=/.test(line) && !have.has(line.split("=")[0]));
  return missing.length ? `${existing.replace(/\n*$/, "\n")}${missing.join("\n")}\n` : existing;
}
