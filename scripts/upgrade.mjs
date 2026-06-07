#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  LATEST_RELEASE_REF,
  formatUpgradeSource,
  isLatestReleaseRef,
  latestStableTagFromLsRemote
} from "./lib/upgrade-source.mjs";

const ROOT = process.cwd();
const DEFAULT_REMOTE = "https://github.com/vanityurls/code.git";
const DEFAULT_REF = LATEST_RELEASE_REF;
const DEFAULT_PATHS = [
  "defaults",
  "scripts",
  "package.json",
  "package-lock.json",
  "LICENSE",
  ".npmrc",
  ".prettierignore"
];
const PROTECTED_PATHS = ["custom", "wrangler.toml", ".dev.vars", "README.md"];
const GENERATED_PATHS = ["build", "functions", "src"];
const REQUIRED_CHECK_BINS = ["prettier"];
const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

function parseArgs(argv) {
  const args = {
    allowDirty: false,
    check: true,
    clean: true,
    dryRun: false,
    paths: [...DEFAULT_PATHS],
    ref: DEFAULT_REF,
    remote: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--allow-dirty") {
      args.allowDirty = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--no-check") {
      args.check = false;
    } else if (arg === "--no-clean") {
      args.clean = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--path") {
      args.paths.push(readValue(argv, ++index, arg));
    } else if (arg === "--paths") {
      args.paths = readValue(argv, ++index, arg)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (arg === "--ref") {
      args.ref = readValue(argv, ++index, arg);
    } else if (arg === "--remote") {
      args.remote = readValue(argv, ++index, arg);
    } else if (arg === "--source") {
      args.source = readValue(argv, ++index, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  args.paths = normalizePaths(args.paths);
  return args;
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
  return value;
}

function normalizePaths(paths) {
  const normalized = [];

  for (const entry of paths) {
    const value = String(entry || "")
      .trim()
      .replace(/^\/+|\/+$/g, "");
    if (!value || value.includes("..") || path.isAbsolute(value)) {
      throw new Error(`Refusing unsafe upgrade path: ${entry}`);
    }
    if (PROTECTED_PATHS.some((protectedPath) => value === protectedPath || value.startsWith(`${protectedPath}/`))) {
      throw new Error(`Refusing to upgrade protected local path: ${value}`);
    }
    if (!normalized.includes(value)) normalized.push(value);
  }

  return normalized;
}

function printHelp() {
  console.log(`Usage: npm run upgrade -- [options]

Safely refresh product-owned vanityURLs files from an upstream Git ref.

Options:
  --remote <name-or-url>  Remote to fetch from. Defaults to upstream, then ${DEFAULT_REMOTE}
  --ref <ref>             Upstream ref to fetch. Default: latest stable release tag.
                          Use --ref main only when intentionally testing unreleased code.
  --source <git-ref>      Use an already-available local git ref instead of fetching
  --paths <a,b>           Product-owned paths to replace. Default: ${DEFAULT_PATHS.join(",")}
  --path <path>           Add one product-owned path to replace
  --dry-run               Show what would happen without changing files
  --no-check              Skip upgrade verification after syncing
  --no-clean              Skip npm run clean before syncing
  --allow-dirty           Allow a dirty worktree before upgrade
`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      LC_ALL: "C"
    },
    stdio: options.capture ? "pipe" : "inherit"
  });

  if (result.status !== 0) {
    throw commandError(command, args, result);
  }

  return result.stdout || "";
}

function commandError(command, args, result) {
  const stdout = result.stdout ? `\nstdout:\n${result.stdout.trim()}` : "";
  const stderr = result.stderr ? `\nstderr:\n${result.stderr.trim()}` : "";
  return new Error(`${command} ${args.join(" ")} failed${stdout}${stderr}`);
}

function git(args, options) {
  return run("git", args, options);
}

function worktreeStatus() {
  return git(["status", "--porcelain"], { capture: true }).trim();
}

function ensureCleanWorktree(args) {
  if (args.allowDirty) return;
  const status = worktreeStatus();
  if (!status) return;
  throw new Error(
    [
      "Worktree is not clean. Commit or stash local changes before upgrading.",
      "Use --allow-dirty only when you are intentionally testing the upgrade script.",
      status
    ].join("\n")
  );
}

function dependencyIssue() {
  if (!fs.existsSync(path.join(ROOT, "node_modules"))) {
    return "node_modules/ is missing";
  }

  for (const binary of REQUIRED_CHECK_BINS) {
    const binaryName = process.platform === "win32" ? `${binary}.cmd` : binary;
    if (!fs.existsSync(path.join(ROOT, "node_modules", ".bin", binaryName))) {
      return `node_modules/.bin/${binaryName} is missing`;
    }
  }

  return "";
}

function npmInstall(args, reason) {
  if (args.dryRun) {
    console.log(`[dry-run] would run npm install (${reason})`);
    return;
  }

  console.log(`[deps] Running npm install (${reason})`);
  run("npm", ["install"]);
}

function ensureDependencies(args, phase) {
  if (!args.check || args.dryRun) return;

  const issue = dependencyIssue();
  if (!issue) return;

  if (phase === "before-sync") {
    console.log(`[deps] Upgrade verification needs installed npm dependencies, but ${issue}.`);
    npmInstall(args, "missing verification dependencies before upgrade");
    const nextIssue = dependencyIssue();
    if (!nextIssue) return;
    throw new Error(`Upgrade verification still needs installed npm dependencies, but ${nextIssue}.`);
  }

  throw new Error(
    [
      `Upgrade verification needs installed npm dependencies, but ${issue}.`,
      "Product files have already been synced.",
      "Run npm install, then run npm run check.",
      "Review with git status --short, then commit and push the upgrade changes."
    ].join("\n")
  );
}

function readJson(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function dependencySnapshot() {
  const packageJson = readJson("package.json");
  return Object.fromEntries(DEPENDENCY_SECTIONS.map((section) => [section, stableJson(packageJson[section] || {})]));
}

function stableJson(value) {
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = value[key];
  }
  return JSON.stringify(sorted);
}

function changedDependencySections(before, after) {
  return DEPENDENCY_SECTIONS.filter((section) => before[section] !== after[section]);
}

function ensureCurrentDependencies(args, changedSections) {
  if (!args.check || args.dryRun || !changedSections.length) return;

  console.log(`[deps] Package dependency definitions changed during this upgrade: ${changedSections.join(", ")}.`);
  npmInstall(args, "package dependency definitions changed during upgrade");
}

function resolveRemote(args) {
  if (args.remote) return args.remote;

  const remotes = git(["remote"], { capture: true })
    .split(/\r?\n/)
    .map((remote) => remote.trim())
    .filter(Boolean);

  if (remotes.includes("upstream")) return "upstream";
  return DEFAULT_REMOTE;
}

function resolveSource(args) {
  if (args.source) {
    args.resolvedRef = args.source;
    return args.source;
  }

  const remote = resolveRemote(args);
  if (args.dryRun) {
    args.resolvedRef = args.ref;
    console.log(`[dry-run] would fetch ${args.ref} from ${remote}`);
    return "HEAD";
  }

  const ref = resolveRef(args, remote);
  args.resolvedRef = ref;
  console.log(`[fetch] ${remoteLabel(remote)} ${ref}`);
  git(["fetch", "--depth=1", remote, ref], { capture: true });
  return "FETCH_HEAD";
}

function resolveRef(args, remote) {
  if (!isLatestReleaseRef(args.ref)) return args.ref;

  const tag = latestStableTagFromLsRemote(git(["ls-remote", "--tags", "--refs", remote, "v*"], { capture: true }));
  if (!tag) throw new Error(`No stable upstream release tag was found for ${remoteLabel(remote)}.`);
  return tag;
}

function clean(args) {
  if (!args.clean) return;
  if (args.dryRun) {
    console.log(`[dry-run] would remove ${GENERATED_PATHS.map((entry) => `${entry}/`).join(", ")}`);
    return;
  }

  for (const relativePath of GENERATED_PATHS) {
    fs.rmSync(path.join(ROOT, relativePath), {
      recursive: true,
      force: true
    });
  }
  console.log(`[clean] Removed ${GENERATED_PATHS.map((entry) => `${entry}/`).join(", ")}`);
}

function remoteLabel(remote) {
  const cleanRemote = String(remote || "").replace(/\.git$/i, "");
  const githubHttps = cleanRemote.match(/^https?:\/\/github\.com\/(.+)$/i);
  if (githubHttps) return `github.com/${githubHttps[1]}`;
  const githubSsh = cleanRemote.match(/^git@github\.com:(.+)$/i);
  if (githubSsh) return `github.com/${githubSsh[1]}`;
  return remote;
}

function runQuiet(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      LC_ALL: "C"
    },
    stdio: "pipe"
  });

  if (result.status !== 0) {
    throw commandError(command, args, result);
  }

  return result.stdout || "";
}

function extractSource(source, paths) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "v8s-upgrade-"));
  const archivePath = path.join(tempDir, "upstream.tar");
  const extractDir = path.join(tempDir, "extract");
  fs.mkdirSync(extractDir);

  try {
    git(["archive", "--format=tar", `--output=${archivePath}`, source, "--", ...paths]);
    run("tar", ["-xf", archivePath, "-C", extractDir]);
    return { tempDir, extractDir };
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function sourceAvailablePaths(source, paths) {
  const output = git(["ls-tree", "--name-only", source, "--", ...paths], { capture: true });
  return new Set(
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
}

function syncPaths(args, source) {
  const availablePaths = sourceAvailablePaths(source, args.paths);
  const paths = args.paths.filter((relativePath) => availablePaths.has(relativePath));
  const missing = args.paths.filter((relativePath) => !availablePaths.has(relativePath));
  const synced = [];

  if (!paths.length) return { synced, missing };

  const { tempDir, extractDir } = extractSource(source, paths);

  try {
    for (const relativePath of paths) {
      const sourcePath = path.join(extractDir, relativePath);
      const targetPath = path.join(ROOT, relativePath);

      if (args.dryRun) {
        console.log(`[dry-run] would replace ${relativePath}`);
      } else {
        fs.rmSync(targetPath, { recursive: true, force: true });
        fs.cpSync(sourcePath, targetPath, { recursive: true });
      }
      synced.push(relativePath);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return { synced, missing };
}

function runCheck(args) {
  if (!args.check) return;
  if (args.dryRun) {
    console.log("[dry-run] would run upgrade verification");
    return;
  }

  const buildOutput = runQuiet("npm", ["run", "build"], "build");
  const linkCount = buildOutput.match(/Wrote build\/v8s\.json with (\d+) links/)?.[1] || "unknown";
  console.log(`[build] Built v8s-blocklist.json and v8s.json with ${linkCount} links`);

  runQuiet(process.execPath, ["scripts/registry.test.mjs"], "registry tests");
  console.log("[test] registry contract ok (generated routing data is valid)");
  runQuiet(process.execPath, ["scripts/install.test.mjs"], "install tests");
  console.log("[test] setup compatibility ok (installer preserves instance config and custom files)");
  runQuiet(process.execPath, ["scripts/maintenance.test.mjs"], "maintenance tests");
  console.log("[test] maintenance tools ok (doctor and v8s-fix handle expected drift)");
}

function runDoctor(args) {
  if (args.dryRun) {
    console.log("[dry-run] would run doctor");
    return;
  }

  const result = run("npm", ["run", "doctor"], { capture: true });
  const output = result.trim();
  if (output) console.log(output);
}

function packageVersion() {
  return String(readJson("package.json").version || "").trim();
}

function printPostRunNote(args) {
  const source = formatUpgradeSource(args.resolvedRef);
  if (source) console.log(source);

  const version = packageVersion();
  if (version) console.log(`[version] vanityURLs ${version}`);

  if (!args.dryRun) {
    const status = worktreeStatus();
    if (status) console.log("Review with git status --short and git diff, then commit and push.");
  }
}

function formatSyncList(paths) {
  if (!paths.length) return "none";
  return paths.map(formatSyncPath).join(", ");
}

function formatSyncPath(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) return `${relativePath}/`;
  return relativePath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  ensureCleanWorktree(args);
  ensureDependencies(args, "before-sync");
  const dependenciesBefore = dependencySnapshot();
  clean(args);
  ensureCleanWorktree(args);

  const source = resolveSource(args);
  const result = syncPaths(args, source);
  if (!args.dryRun) {
    console.log(`[sync] ${formatSyncList(result.synced)}`);
    if (result.missing.length) console.log(`[sync] Missing upstream paths: ${formatSyncList(result.missing)}`);
  }

  ensureCurrentDependencies(args, changedDependencySections(dependenciesBefore, dependencySnapshot()));
  ensureDependencies(args, "after-sync");
  runCheck(args);
  runDoctor(args);
  printPostRunNote(args);
}

main().catch((error) => {
  console.error(`upgrade failed: ${error.message}`);
  process.exit(1);
});
