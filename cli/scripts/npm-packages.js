// Writes the npm packages into npm-dist/ from goreleaser's dist/: create-b7-<os>-<arch> with each binary, and
// create-b7 (npm/create-b7), whose optionalDependencies pull the one for the user's platform.
import { chmodSync, copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const cli = join(import.meta.dirname, "..");
const out = join(cli, "npm-dist");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const OS = { linux: "linux", darwin: "darwin", windows: "win32" };
const ARCH = { amd64: "x64", arm64: "arm64" };
// Every platform goreleaser builds (.goreleaser.yaml); a snapshot build may contain only one of them.
const PLATFORMS = ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64", "win32-x64"];

const wrapper = readJson(join(cli, "npm/create-b7/package.json"));
const binaries = readJson(join(cli, "dist/artifacts.json")).filter((a) => a.type === "Binary");
if (!binaries.length) throw new Error("dist/artifacts.json lists no binaries: run goreleaser first");
rmSync(out, { recursive: true, force: true });

for (const a of binaries) {
  const platform = `${OS[a.goos]}-${ARCH[a.goarch]}`;
  if (!PLATFORMS.includes(platform)) throw new Error(`unexpected build ${a.goos}/${a.goarch}`);
  const dir = join(out, `create-b7-${platform}`);
  const bin = join(dir, "bin", `create-b7${a.goos === "windows" ? ".exe" : ""}`);
  mkdirSync(join(dir, "bin"), { recursive: true });
  copyFileSync(join(cli, a.path), bin);
  chmodSync(bin, 0o755);
  writeJson(join(dir, "package.json"), {
    name: `create-b7-${platform}`,
    version: wrapper.version,
    description: `The ${platform} binary of create-b7. Install create-b7 instead.`,
    license: wrapper.license,
    repository: wrapper.repository,
    os: [OS[a.goos]],
    cpu: [ARCH[a.goarch]],
    files: ["bin"],
  });
  copyFileSync(join(cli, "..", "LICENSE"), join(dir, "LICENSE"));
}

const dir = join(out, "create-b7");
cpSync(join(cli, "npm/create-b7"), dir, { recursive: true });
writeJson(join(dir, "package.json"), {
  ...wrapper,
  optionalDependencies: Object.fromEntries(PLATFORMS.map((p) => [`create-b7-${p}`, wrapper.version])),
});
copyFileSync(join(cli, "README.md"), join(dir, "README.md"));
copyFileSync(join(cli, "..", "LICENSE"), join(dir, "LICENSE"));
console.log(`npm-dist/: create-b7 and ${binaries.length} platform package(s) at ${wrapper.version}`);
