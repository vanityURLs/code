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

  const indexHtml = fs.readFileSync(path.join(fixture, "custom", "public", "en", "index.html"), "utf8");
  assert.match(
    indexHtml,
    /<p class="instance-brand-subtitle">[\s\S]*?The official demo for <a href="https:\/\/example\.com">Example Inc\.<\/a> projects[\s\S]*?<\/p>/
  );

  const expandHtml = fs.readFileSync(path.join(fixture, "custom", "public", "en", "expand", "index.html"), "utf8");
  assert.match(
    expandHtml,
    /<p class="instance-brand-subtitle">[\s\S]*?The official demo for <a href="https:\/\/example\.com">Example Inc\.<\/a> projects[\s\S]*?<\/p>/
  );

  execFileSync(
    path.join(fixture, "node_modules", ".bin", process.platform === "win32" ? "prettier.cmd" : "prettier"),
    ["--check", "custom/public/en/privacy.html", "custom/public/en/index.html", "custom/public/en/expand/index.html"],
    {
      cwd: fixture,
      stdio: "pipe"
    }
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
  assert.equal(fs.existsSync(path.join(fixture, "custom", "public", "en", "index.html")), false);

  execFileSync(process.execPath, ["scripts/build.mjs"], {
    cwd: fixture,
    stdio: "pipe"
  });

  const builtIndex = fs.readFileSync(path.join(fixture, "build", "index.html"), "utf8");
  assert.match(builtIndex, /<span>v8s\.<\/span><span>link<\/span>/);
  assert.match(builtIndex, /The official demo for <a href="https:\/\/example\.com">Example Inc\.<\/a> projects/);
}

console.log("install tests ok");
