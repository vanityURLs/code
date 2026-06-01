#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const ROOT = process.cwd();
const DEFAULT_REMOTE = "https://github.com/vanityurls/code.git";
const DEFAULT_REF = "main";
const DEFAULT_PATHS = ["defaults", "scripts", "package.json", "package-lock.json", "LICENSE"];
const PROTECTED_PATHS = ["custom", "wrangler.toml", ".dev.vars", "README.md"];

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
  --ref <ref>             Upstream ref to fetch. Default: ${DEFAULT_REF}
  --source <git-ref>      Use an already-available local git ref instead of fetching
  --paths <a,b>           Product-owned paths to replace. Default: ${DEFAULT_PATHS.join(",")}
  --path <path>           Add one product-owned path to replace
  --dry-run               Show what would happen without changing files
  --no-check              Skip npm run check after syncing
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
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : "";
    throw new Error(`${command} ${args.join(" ")} failed${stderr}`);
  }

  return result.stdout || "";
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
  if (args.source) return args.source;

  const remote = resolveRemote(args);
  if (args.dryRun) {
    console.log(`[dry-run] would fetch ${args.ref} from ${remote}`);
    return "HEAD";
  }

  git(["fetch", "--depth=1", remote, args.ref]);
  return "FETCH_HEAD";
}

function clean(args) {
  if (!args.clean) return;
  if (args.dryRun) {
    console.log("[dry-run] would run npm run clean");
    return;
  }

  execFileSync("npm", ["run", "clean"], {
    cwd: ROOT,
    stdio: "inherit"
  });
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

function syncPaths(args, source) {
  const { tempDir, extractDir } = extractSource(source, args.paths);
  const synced = [];
  const missing = [];

  try {
    for (const relativePath of args.paths) {
      const sourcePath = path.join(extractDir, relativePath);
      const targetPath = path.join(ROOT, relativePath);

      if (!fs.existsSync(sourcePath)) {
        missing.push(relativePath);
        continue;
      }

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
    console.log("[dry-run] would run npm run check");
    return;
  }

  execFileSync("npm", ["run", "check"], {
    cwd: ROOT,
    stdio: "inherit"
  });
}

function printSummary(args, source, result) {
  console.log("\nUpgrade summary");
  console.log(`Source: ${source}`);
  console.log(`Synced: ${result.synced.length ? result.synced.join(", ") : "none"}`);
  if (result.missing.length) console.log(`Missing upstream paths: ${result.missing.join(", ")}`);

  if (!args.dryRun) {
    const status = worktreeStatus();
    console.log("\nReview with:");
    console.log("  git status --short");
    console.log("  git diff");
    if (status) console.log("\nCommit after review and successful checks.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  ensureCleanWorktree(args);
  clean(args);
  ensureCleanWorktree(args);

  const source = resolveSource(args);
  const result = syncPaths(args, source);

  runCheck(args);
  printSummary(args, source, result);
}

main().catch((error) => {
  console.error(`upgrade failed: ${error.message}`);
  process.exit(1);
});
