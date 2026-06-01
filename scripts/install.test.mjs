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
  return execFileSync(process.execPath, ["scripts/install.mjs", "--no-check", ...extraArgs], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
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
  assert.match(privacyHtml, /The official demo for <a href="https:\/\/example\.com">Example Inc\.<\/a> projects/);

  execFileSync(
    path.join(fixture, "node_modules", ".bin", process.platform === "win32" ? "prettier.cmd" : "prettier"),
    ["--check", "custom/public/en/privacy.html"],
    {
      cwd: fixture,
      stdio: "pipe"
    }
  );
}

console.log("install tests ok");
