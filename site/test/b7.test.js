// Runs create-b7's shared fixtures (cli/testdata) against the landing's JS copy of the rules and regions,
// the same cases the Go tests in cli/ run.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolveConfig } from "../src/lib/b7/config.js";
import { applyRegions, holds } from "../src/lib/b7/regions.js";

const fixture = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../../cli/testdata/${name}`, import.meta.url),
      "utf8",
    ),
  );

test("configuration rules", () => {
  const { manifest, cases } = fixture("rules.json");
  for (const c of cases) {
    if (c.error) {
      assert.throws(
        () => resolveConfig("fullstack", manifest, c.requested),
        (e) => e.message.startsWith(c.error),
        c.name,
      );
      continue;
    }
    const { config, notices } = resolveConfig(
      "fullstack",
      manifest,
      c.requested,
    );
    if (c.options) assert.deepEqual(config.options, c.options, c.name);
    if (c.derived) assert.deepEqual(config.derived, c.derived, c.name);
    if (c.notices) assert.deepEqual(notices, c.notices, c.name);
  }
});

test("feature regions", () => {
  const fx = fixture("regions.json");
  for (const h of fx.holds)
    assert.equal(holds(h.cond, h.features), h.want, h.cond);
  for (const c of fx.apply) {
    if (c.error)
      assert.throws(
        () => applyRegions(c.text, c.features, "f.ts"),
        (e) => e.message.startsWith(c.error),
        c.name,
      );
    else assert.equal(applyRegions(c.text, c.features, "f.ts"), c.out, c.name);
  }
});
