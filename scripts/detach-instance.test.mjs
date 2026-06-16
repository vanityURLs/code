#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();

function makeFixture() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "v8s-detach-"));
  const sourceDir = path.join(tmpDir, "source");
  const fixtureDir = path.join(tmpDir, "fixture");

  fs.cpSync(ROOT, sourceDir, {
    recursive: true,
    filter: (sourcePath) => {
      const relative = path.relative(ROOT, sourcePath);
      const firstPart = relative.split(path.sep)[0];
      return ![".git", "build", "custom", "node_modules"].includes(firstPart);
    }
  });

  fs.mkdirSync(path.join(sourceDir, ".github", "workflows"), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "RELEASE.md"), "release notes\n");
  fs.writeFileSync(path.join(sourceDir, "scripts", "v8s.zsh"), "# legacy helper\n");

  git(["init"], sourceDir);
  git(["config", "user.email", "tests@example.com"], sourceDir);
  git(["config", "user.name", "vanityURLs tests"], sourceDir);
  git(["add", "."], sourceDir);
  git(["commit", "-m", "test fixture release"], sourceDir);
  git(["tag", "v9.9.9"], sourceDir);
  fs.writeFileSync(path.join(sourceDir, "CURRENT_ONLY.txt"), "current branch only\n");
  git(["add", "CURRENT_ONLY.txt"], sourceDir);
  git(["commit", "-m", "test fixture current branch"], sourceDir);

  execFileSync("git", ["clone", sourceDir, fixtureDir], {
    stdio: "pipe"
  });

  return fixtureDir;
}

function exists(fixture, relativePath) {
  return fs.existsSync(path.join(fixture, relativePath));
}

function git(args, cwd, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "pipe"
  }).trim();
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
  assert.equal(
    exists(fixture, "CURRENT_ONLY.txt"),
    false,
    "detach should switch to the latest stable release by default"
  );

  for (const relativePath of [
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
  assert.equal(exists(fixture, ".git"), true, "detach should initialize a fresh instance Git repository");
  assert.equal(git(["rev-parse", "--is-inside-work-tree"], fixture, { capture: true }), "true");
  assert.throws(() => git(["config", "--get", "remote.origin.url"], fixture, { capture: true }));
}

{
  const fixture = makeFixture();

  execFileSync(process.execPath, ["scripts/detach-instance.mjs", "--current-ref"], {
    cwd: fixture,
    stdio: "pipe"
  });

  assert.equal(exists(fixture, "CURRENT_ONLY.txt"), true, "--current-ref should detach the current checkout");
  assert.equal(exists(fixture, ".git"), true, "--current-ref should still initialize a fresh instance Git repository");
}

console.log("detach tests ok");
