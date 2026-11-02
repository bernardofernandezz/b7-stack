#!/usr/bin/env node
// Runs the create-b7 binary for this platform, installed as an optional dependency (create-b7-<os>-<arch>).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const pkg = `create-b7-${process.platform}-${process.arch}`;
let bin;
try {
  bin = createRequire(import.meta.url).resolve(`${pkg}/bin/create-b7${process.platform === "win32" ? ".exe" : ""}`);
} catch {
  console.error(
    `create-b7: no binary for ${process.platform}-${process.arch} (${pkg} is not installed).\n` +
      "Supported: linux-x64, linux-arm64, darwin-x64, darwin-arm64, win32-x64. If yours is one, reinstall without --no-optional.",
  );
  process.exit(1);
}
const { status, error } = spawnSync(bin, process.argv.slice(2), { stdio: "inherit" });
if (error) console.error(`create-b7: ${error.message}`);
process.exit(status ?? 1);
