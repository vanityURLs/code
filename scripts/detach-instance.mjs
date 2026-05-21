#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DETACH_PATHS = [
  ".git",
  ".github",
  "CHANGELOG.txt",
  "package-lock.json",
  "release-please-config.json"
];

function hasExpectedPackage() {
  const packagePath = path.join(ROOT, "package.json");
  if (!fs.existsSync(packagePath)) return false;

  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    return packageJson.name === "vanityURLs";
  } catch {
    return false;
  }
}

if (!hasExpectedPackage()) {
  console.error("[detach] Refusing to run: this directory does not look like a vanityURLs code checkout.");
  process.exit(1);
}

for (const relativePath of DETACH_PATHS) {
  const target = path.join(ROOT, relativePath);
  if (!fs.existsSync(target)) {
    console.log(`[detach] Skipped ${relativePath}; not present`);
    continue;
  }

  fs.rmSync(target, {
    recursive: true,
    force: true
  });
  console.log(`[detach] Removed ${relativePath}`);
}

console.log("[detach] Ready for git init in your own repository.");
