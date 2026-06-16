#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { latestStableTagFromLsRemote } from "./lib/upgrade-source.mjs";

const ROOT = process.cwd();
const DEFAULT_REMOTE = "https://github.com/vanityURLs/code.git";
const INSTANCE_README_PATH = path.join(ROOT, "docs", "README.md");
const ROOT_README_PATH = path.join(ROOT, "README.md");
const DETACH_PATHS = [
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
];
const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const parsed = {
    currentRef: false,
    help: false
  };

  for (const arg of argv) {
    if (arg === "--current-ref") {
      parsed.currentRef = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
      continue;
    }
    console.error(`[detach] Unknown option: ${arg}`);
    process.exit(1);
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: npm run detach -- [options]

Detach a vanityURLs product checkout into a standalone instance.

Options:
  --current-ref   Detach the currently checked-out files instead of first switching
                  to the latest stable vanityURLs release.
  -h, --help      Show this help.`);
}

function git(gitArgs, options = {}) {
  return execFileSync("git", gitArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "pipe"
  }).trim();
}

function gitQuiet(gitArgs) {
  execFileSync("git", gitArgs, {
    cwd: ROOT,
    stdio: "ignore"
  });
}

function isGitCheckout() {
  try {
    git(["rev-parse", "--is-inside-work-tree"], { capture: true });
    return true;
  } catch {
    return false;
  }
}

function remoteURL() {
  try {
    return git(["config", "--get", "remote.origin.url"], { capture: true }) || DEFAULT_REMOTE;
  } catch {
    return DEFAULT_REMOTE;
  }
}

function worktreeStatus() {
  try {
    return git(["status", "--porcelain"], { capture: true });
  } catch {
    return "";
  }
}

function checkoutLatestRelease() {
  if (args.currentRef) {
    console.log("[detach] Keeping the currently checked-out files.");
    return;
  }

  if (!isGitCheckout()) {
    console.error("[detach] Refusing to switch releases: this directory is not a Git checkout.");
    console.error("[detach] Retry from a normal git clone, or run npm run detach -- --current-ref.");
    process.exit(1);
  }

  const status = worktreeStatus();
  if (status) {
    console.error("[detach] Refusing to switch releases because the working tree is not clean.");
    console.error("[detach] Commit, stash, or discard local changes, or run npm run detach -- --current-ref.");
    process.exit(1);
  }

  const remote = remoteURL();
  let tag = "";
  try {
    tag = latestStableTagFromLsRemote(git(["ls-remote", "--tags", "--refs", remote, "v*"], { capture: true }));
  } catch (error) {
    console.error(`[detach] Could not query vanityURLs releases: ${error.message}`);
    console.error("[detach] Retry when the network is available, or run npm run detach -- --current-ref.");
    process.exit(1);
  }

  if (!tag) {
    console.error(`[detach] No stable vanityURLs release tag was found for ${remote}.`);
    console.error("[detach] Retry later, or run npm run detach -- --current-ref.");
    process.exit(1);
  }

  gitQuiet(["fetch", "--depth", "1", remote, `refs/tags/${tag}:refs/tags/${tag}`]);
  gitQuiet(["checkout", "--detach", tag]);
  console.log(`[detach] Checked out vanityURLs release ${tag}.`);
}

function initInstanceRepository() {
  gitQuiet(["init"]);
  console.log("[detach] Initialized a fresh Git repository for this instance.");
}

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

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!hasExpectedPackage()) {
  console.error("[detach] Refusing to run: this directory does not look like a vanityURLs code checkout.");
  process.exit(1);
}

checkoutLatestRelease();

if (fs.existsSync(INSTANCE_README_PATH)) {
  fs.copyFileSync(INSTANCE_README_PATH, ROOT_README_PATH);
  console.log("[detach] Replaced README.md with the instance README.");
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

initInstanceRepository();
console.log("[detach] Ready for your first instance commit.");
