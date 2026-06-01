#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RUNTIME_REGISTRY_SCHEMA_VERSION } from "./lib/constants.mjs";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "v8s-registry-"));
const linksPath = path.join(tmpDir, "v8s-links.txt");
const registryPath = path.join(tmpDir, "v8s.json");

fs.writeFileSync(
  linksPath,
  [
    "# slug|target|state|title|description|tags|owner|expires_at|notes",
    "docs|https://example.com/docs|permanent|Docs|Docs home|docs|team||",
    "office|https://example.com/closed|permanent|Office|Business hours|ops|team||",
    "  @schedule timezone=America/Toronto",
    "  @schedule rule=workdays days=mon,tue,wed,thu,fri from=09:00 to=17:00 target=https://example.com/open",
    "docs/api/*|https://example.com/api/:splat|permanent|API|API docs|docs|team||",
    ""
  ].join("\n")
);

execFileSync(process.execPath, ["scripts/build-redirect-targets.mjs", linksPath, registryPath], {
  stdio: "pipe"
});

execFileSync(process.execPath, ["scripts/validate-registry.mjs", registryPath], {
  stdio: "pipe"
});

execFileSync(process.execPath, ["scripts/validate-runtime-registry.mjs", registryPath], {
  stdio: "pipe"
});

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

assert.equal(registry.schema_version, RUNTIME_REGISTRY_SCHEMA_VERSION);
assert.equal(registry.default_state, "permanent");
assert.equal(registry.generated_timezone, "UTC");
assert.match(registry.generated_git.commit, /^$|^[0-9a-f]{40}$/);
if (registry.generated_git.commit_url) {
  assert(registry.generated_git.commit_url.includes(registry.generated_git.commit));
}
assert.ok(Array.isArray(registry.links), "links compatibility array");
assert.equal(registry.links.length, 3);
assert.equal(registry.tree.children.docs.link.slug, "docs");
assert.equal(registry.tree.children.docs.children.api.link.slug, "docs/api");
assert.equal(registry.tree.children.docs.children.api.link.match, "splat");
assert.deepEqual(registry.tree.children.office.link.schedule.rules, [
  {
    label: "workdays",
    timezone: "America/Toronto",
    days: ["mon", "tue", "wed", "thu", "fri"],
    from: "09:00",
    to: "17:00",
    target: "https://example.com/open"
  }
]);

console.log("registry tests ok");
