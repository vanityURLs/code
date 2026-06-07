#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();

function makeFixture() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "v8s-install-"));

  fs.cpSync(ROOT, tmpDir, {
    recursive: true,
    filter: (sourcePath) => {
      const relative = path.relative(ROOT, sourcePath);
      const firstPart = relative.split(path.sep)[0];
      return ![".git", "build", "custom", "node_modules"].includes(firstPart);
    }
  });

  const sourceNodeModules = path.join(ROOT, "node_modules");
  if (fs.existsSync(sourceNodeModules)) {
    fs.symlinkSync(sourceNodeModules, path.join(tmpDir, "node_modules"), "dir");
  }

  return tmpDir;
}

function runSetup(cwd, extraArgs) {
  return execFileSync(process.execPath, ["scripts/setup.mjs", "--no-check", ...extraArgs], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, V8S_INTERNAL_SETUP: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function prettierBin(cwd) {
  const binPath = path.join(cwd, "node_modules", ".bin", process.platform === "win32" ? "prettier.cmd" : "prettier");
  return fs.existsSync(binPath) ? binPath : "";
}

function checkPrettier(cwd, files) {
  const binPath = prettierBin(cwd);
  if (!binPath) return;
  execFileSync(binPath, ["--check", ...files], {
    cwd,
    stdio: "pipe"
  });
}

function assertLinkedSlogan(html) {
  assert.match(
    html.replace(/\s+/g, " "),
    /The official demo for <a href="https:\/\/example\.com">Example Inc\.<\/a> projects/
  );
}

{
  const fixture = makeFixture();

  assert.throws(
    () =>
      runSetup(fixture, [
        "--domain",
        "v8s.link",
        "--operator-timezone",
        "-4",
        "--operator-abuse-contact",
        "abuse@example.com",
        "--operator-security-contact",
        "security@example.com"
      ]),
    /Operator timezone must be an IANA timezone name/
  );
}

{
  const fixture = makeFixture();

  runSetup(fixture, [
    "--domain",
    "v8s.link",
    "--worker-name",
    "v8s-link",
    "--owner",
    "team",
    "--languages",
    "de,en,es,fr,it",
    "--operator-timezone",
    "America/Toronto",
    "--operator-legal-name",
    "Example Inc.",
    "--operator-domain",
    "example.com",
    "--operator-abuse-contact",
    "abuse@example.com",
    "--operator-security-contact",
    "security@example.com",
    "--branding-slogan",
    "The official demo for Example Inc. projects",
    "--customize-public"
  ]);

  const siteConfig = JSON.parse(fs.readFileSync(path.join(fixture, "custom", "v8s-site-config.json"), "utf8"));
  assert.deepEqual(siteConfig.i18n.supported_languages, ["en", "de", "es", "fr", "it"]);
  assert.equal(siteConfig.operator.timezone, "America/Toronto");
  assert.equal(siteConfig.branding.slogan.en, "The official demo for Example Inc. projects");

  const privacyHtml = fs.readFileSync(path.join(fixture, "custom", "public", "en", "privacy.html"), "utf8");
  assertLinkedSlogan(privacyHtml);

  const indexHtml = fs.readFileSync(path.join(fixture, "custom", "public", "en", "index.html"), "utf8");
  assertLinkedSlogan(indexHtml);

  const lookupHtml = fs.readFileSync(path.join(fixture, "custom", "public", "en", "lookup", "index.html"), "utf8");
  assertLinkedSlogan(lookupHtml);

  checkPrettier(fixture, [
    "custom/public/en/privacy.html",
    "custom/public/en/index.html",
    "custom/public/en/lookup/index.html"
  ]);
}

{
  const fixture = makeFixture();

  runSetup(fixture, [
    "--domain",
    "v8s.link",
    "--worker-name",
    "v8s-link",
    "--owner",
    "team",
    "--languages",
    "en,fr",
    "--operator-timezone",
    "America/Toronto",
    "--operator-legal-name",
    "Example Inc.",
    "--operator-domain",
    "example.com",
    "--operator-abuse-contact",
    "abuse@example.com",
    "--operator-security-contact",
    "security@example.com",
    "--branding-slogan",
    "The official demo for Example Inc. projects",
    "--wordmark-black",
    "v8s.",
    "--wordmark-green",
    "link",
    "--no-customize-public"
  ]);

  const siteConfig = JSON.parse(fs.readFileSync(path.join(fixture, "custom", "v8s-site-config.json"), "utf8"));
  assert.equal(siteConfig.branding.custom_public, false);
  assert.equal(siteConfig.branding.wordmark.black, "v8s.");
  assert.equal(siteConfig.branding.wordmark.green, "link");
  assert.equal(fs.existsSync(path.join(fixture, "custom", "public")), false);
  assert.equal(fs.existsSync(path.join(fixture, "custom", "public", "en", "index.html")), false);

  execFileSync(process.execPath, ["scripts/build.mjs"], {
    cwd: fixture,
    stdio: "pipe"
  });

  const builtIndex = fs.readFileSync(path.join(fixture, "build", "index.html"), "utf8");
  assert.match(builtIndex, /<span>v8s\.<\/span><span>link<\/span>/);
  assertLinkedSlogan(builtIndex);

  const builtStats = fs.readFileSync(path.join(fixture, "build", "en", "_stats", "index.html"), "utf8");
  assert.match(builtStats, /<img src="\/logo\.svg" alt="VanityURLs" \/>/);
  assert.doesNotMatch(builtStats, /<a class="brand-mark brand-mark-wordmark"/);
  assert.equal(fs.existsSync(path.join(fixture, "build", "_stats", "index.html")), false);

  const manifest = JSON.parse(fs.readFileSync(path.join(fixture, "build", "site.webmanifest"), "utf8"));
  assert.equal(manifest.short_name, "v8s.link");
  assert.equal(manifest.name, "v8s.link short links");
}

{
  const fixture = makeFixture();
  fs.mkdirSync(path.join(fixture, "custom"), { recursive: true });
  fs.writeFileSync(
    path.join(fixture, "custom", "v8s-policies.json"),
    JSON.stringify(
      {
        schema_version: "1.0",
        defaults: {
          allowed_protocols: ["https:"]
        },
        block_domains: [
          {
            domain: "operator.example",
            category: "local-policy"
          }
        ]
      },
      null,
      2
    )
  );

  execFileSync(process.execPath, ["scripts/build.mjs"], {
    cwd: fixture,
    stdio: "pipe"
  });

  const policy = JSON.parse(fs.readFileSync(path.join(fixture, "build", "v8s-blocklist.json"), "utf8"));
  assert.deepEqual(
    policy.block_domains.map((entry) => entry.domain),
    ["operator.example"]
  );
  assert.deepEqual(policy.defaults.allowed_protocols, ["https:"]);
}

console.log("install tests ok");
