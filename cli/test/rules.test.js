import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConfig } from "../config.js";
import { applyRegions, holds } from "../regions.js";

const manifest = {
  options: {
    email: { choices: ["resend", "none"], default: "resend" },
    organizations: { choices: [false, true], default: false },
    billing: { choices: ["none", "stripe", "abacatepay"], default: "none" },
  },
};
const resolve = (requested) => resolveConfig("fullstack", manifest, requested);

test("defaults come from the manifest", () => {
  assert.deepEqual(resolve({}).config, {
    profile: "fullstack",
    options: { email: "resend", organizations: false, billing: "none" },
    derived: { scheduler: false },
  });
});

test("rule 1: only the template's options and choices", () => {
  assert.throws(() => resolve({ storage: "s3" }), /^Error: Rule 1: "storage"/);
  assert.throws(() => resolve({ billing: "paypal" }), /^Error: Rule 1: billing must be one of/);
  assert.equal(resolve({ organizations: "true" }).config.options.organizations, true);
});

test("rule 2: organizations need email", () => {
  assert.throws(() => resolve({ organizations: true, email: "none" }), /^Error: Rule 2/);
  assert.doesNotThrow(() => resolve({ organizations: true, email: "resend" }));
});

test("rule 3: billing derives the scheduler", () => {
  assert.equal(resolve({ billing: "stripe" }).config.derived.scheduler, true);
  assert.equal(resolve({ billing: "none" }).config.derived.scheduler, false);
});

test("rule 4: experimental choices print a notice", () => {
  assert.match(resolve({ billing: "abacatepay" }).notices[0], /^Rule 4: billing = abacatepay is EXPERIMENTAL/);
  assert.deepEqual(resolve({ billing: "stripe" }).notices, []);
});

test("regions keep or drop lines by condition and remove markers", () => {
  const text = [
    "a",
    "// #if organizations",
    "org",
    "// #endif",
    "  {/* #if !organizations */}",
    "solo",
    "  {/* #endif */}",
    "# #if billing=stripe",
    "stripe",
    "# #endif",
    "-- #if email",
    "mail",
    "-- #endif",
    "<!-- #if !email -->",
    "no mail",
    "<!-- #endif -->",
    "z",
  ].join("\n");
  const features = { organizations: false, billing: "stripe", email: "none" };
  assert.equal(applyRegions(text, features), ["a", "solo", "stripe", "no mail", "z"].join("\n"));
  assert.equal(holds("email", { email: "resend" }), true);
  assert.equal(holds("email", { email: "none" }), false);
});

test("regions reject unbalanced and nested markers with the line", () => {
  assert.throws(() => applyRegions("// #if a\nx", {}, "f.ts"), /f\.ts:1: #if without #endif/);
  assert.throws(() => applyRegions("x\n// #endif", {}, "f.ts"), /f\.ts:2: #endif without #if/);
  assert.throws(() => applyRegions("// #if a\n// #if b\n// #endif\n// #endif", {}, "f.ts"), /f\.ts:2: nested/);
});

test("the fullstack template's b7.json is a valid, complete configuration", async () => {
  const { readFileSync } = await import("node:fs");
  const dir = new URL("../../templates/fullstack/", import.meta.url);
  const read = (f) => JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  const { profile, options } = read("b7.json");
  const { config } = resolveConfig(profile, read("b7.features.json"), options);
  assert.deepEqual(config.options, options);
});
