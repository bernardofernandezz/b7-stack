// Copies ../templates into ./template for npm pack. Same skip list as index.js.
import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

const SKIP = new Set(["node_modules", "dist", ".wrangler", ".tanstack", ".dev.vars", "test-results", "playwright-report"]);
const root = join(import.meta.dirname, "..");
const out = join(root, "template");

rmSync(out, { recursive: true, force: true });
cpSync(join(root, "..", "templates"), out, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
const gitignore = join(out, "fullstack", ".gitignore");
if (existsSync(gitignore)) renameSync(gitignore, join(out, "fullstack", "_gitignore"));
