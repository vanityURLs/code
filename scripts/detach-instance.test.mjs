#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();

function makeFixture() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "v8s-detach-"));

  fs.cpSync(ROOT, tmpDir, {
    recursive: true,
    filter: (sourcePath) => {
      const relative = path.relative(ROOT, sourcePath);
      const firstPart = relative.split(path.sep)[0];
      return ![".git", "build", "custom", "node_modules"].includes(firstPart);
    }
  });

  fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, ".github", "workflows"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "RELEASE.md"), "release notes\n");
  fs.writeFileSync(path.join(tmpDir, "scripts", "v8s.zsh"), "# legacy helper\n");

  return tmpDir;
}

function exists(fixture, relativePath) {
  return fs.existsSync(path.join(fixture, relativePath));
}

{
  const fixture = makeFixture();
  const instanceReadmePath = path.join(fixture, "docs", "README.md");
  const instanceReadme = fs.existsSync(instanceReadmePath) ? fs.readFileSync(instanceReadmePath, "utf8") : "";
  const originalReadme = fs.readFileSync(path.join(fixture, "README.md"), "utf8");

  execFileSync(process.execPath, ["scripts/detach-instance.mjs"], {
    cwd: fixture,
    stdio: "pipe"
  });

  assert.equal(fs.readFileSync(path.join(fixture, "README.md"), "utf8"), instanceReadme || originalReadme);

  for (const relativePath of [
    ".git",
    ".github",
    ".all-contributorsrc",
    ".release-please-manifest.json",
    "AGENTS.md",
    "CHANGELOG.txt",
    "CHANGELOG.md",
    "RELEASE.md",
    "RELEASE_WORKFLOW.md",
    "package-lock.json",
    "release-please-config.json",
    "docs",
    "scripts/v8s.zsh"
  ]) {
    assert.equal(exists(fixture, relativePath), false, `${relativePath} should be removed during detach`);
  }

  assert.equal(exists(fixture, "package.json"), true);
  assert.equal(exists(fixture, "scripts/v8s.sh"), true);
  assert.equal(exists(fixture, "scripts/v8s-lnk"), true);
}

console.log("detach tests ok");
