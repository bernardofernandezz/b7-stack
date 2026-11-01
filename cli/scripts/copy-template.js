// Copies ../templates into ./template for npm pack. Same skip list as index.js.
import { cpSync, existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

const SKIP = new Set(["node_modules", "dist", ".tanstack", ".env", "test-results", "playwright-report"]);
const root = join(import.meta.dirname, "..");
const out = join(root, "template");

rmSync(out, { recursive: true, force: true });
cpSync(join(root, "..", "templates"), out, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
for (const template of readdirSync(out)) {
  const gitignore = join(out, template, ".gitignore");
  if (existsSync(gitignore)) renameSync(gitignore, join(out, template, "_gitignore"));
}
