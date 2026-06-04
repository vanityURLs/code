#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkTargetUrl } from "./blocklist-policy.mjs";
import { mergeSiteConfig } from "./lib/build-assets.mjs";
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

fs.writeFileSync(
  linksPath,
  [
    "# slug|target|state|title|description|tags|owner|expires_at|notes",
    "résumé|https://example.com/docs|permanent|Docs|Docs home|docs|team||",
    ""
  ].join("\n")
);

assert.throws(
  () =>
    execFileSync(process.execPath, ["scripts/build-redirect-targets.mjs", linksPath, registryPath], {
      encoding: "utf8",
      stdio: "pipe"
    }),
  (error) => String(error.stderr || "").includes("invalid slug segment")
);

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const baseSiteConfig = JSON.parse(fs.readFileSync("defaults/v8s-site-config.json", "utf8"));
const customSiteConfigPath = "custom/v8s-site-config.json";
const customSiteConfig = fs.existsSync(customSiteConfigPath)
  ? JSON.parse(fs.readFileSync(customSiteConfigPath, "utf8"))
  : {};
const expectedGeneratedTimezone = customSiteConfig.operator?.timezone || baseSiteConfig.operator?.timezone || "UTC";

assert.equal(registry.schema_version, RUNTIME_REGISTRY_SCHEMA_VERSION);
assert.equal(registry.default_state, "permanent");
assert.equal(registry.generated_timezone, expectedGeneratedTimezone);
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

assert.deepEqual(
  mergeSiteConfig(
    {
      links: {
        random_slug_length: 3,
        random_slug_alphabet: "abc",
        tag_random_slug_lengths: {
          training: 4,
          debug: 2
        }
      }
    },
    {
      links: {
        random_slug_alphabet: "xyz",
        tag_random_slug_lengths: {
          debug: 5
        }
      }
    }
  ).links,
  {
    random_slug_length: 3,
    random_slug_alphabet: "xyz",
    tag_random_slug_lengths: {
      training: 4,
      debug: 5
    }
  }
);

assert(
  checkTargetUrl("https://bit.ly/example").some((violation) => violation.includes("shortener-loop")),
  "default policy should block baseline public shorteners"
);
assert(
  checkTargetUrl("http://2130706433/").some((violation) => violation.includes("private or reserved")),
  "numeric IPv4 host forms should be blocked after URL canonicalization"
);
assert(
  checkTargetUrl("http://0x7f000001/").some((violation) => violation.includes("private or reserved")),
  "hex IPv4 host forms should be blocked after URL canonicalization"
);
assert(
  checkTargetUrl("http://[::ffff:127.0.0.1]/").some((violation) => violation.includes("private or reserved")),
  "IPv4-mapped IPv6 localhost should be blocked"
);
assert(
  checkTargetUrl("https://example.com/download.exe/").some((violation) => violation.includes("blocked file extension")),
  "blocked file extensions should not be bypassed with a trailing slash"
);

console.log("registry tests ok");
