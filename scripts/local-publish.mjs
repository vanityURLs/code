#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const DEFAULT_CONFIG_PATH = path.join(ROOT, "defaults", "v8s-local-config.json");
const CUSTOM_CONFIG_PATH = path.join(ROOT, "custom", "v8s-local-config.json");

function parseArgs(argv) {
  const args = {
    dryRun: false,
    message: "",
    paths: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--message" || arg === "-m") {
      args.message = readValue(argv, index, arg);
      index += 1;
    } else if (arg === "--path") {
      args.paths.push(readValue(argv, index, arg));
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run local-publish -- [options]

Run checks, then commit and push local vanityURLs changes.

Options:
  -m, --message TEXT  Override the configured commit message
  --path PATH         Stage this path; may be repeated
  --dry-run           Show the planned git operations without writing
  --help              Show this help
`);
}

function readValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadConfig() {
  const defaults = readJson(DEFAULT_CONFIG_PATH);
  const custom = readJson(CUSTOM_CONFIG_PATH);

  return {
    ...defaults,
    ...custom,
    local_publish: {
      ...(defaults.local_publish || {}),
      ...(custom.local_publish || {}),
      commit_messages: {
        ...(defaults.local_publish?.commit_messages || {}),
        ...(custom.local_publish?.commit_messages || {})
      }
    }
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? "pipe" : "inherit",
    shell: process.platform === "win32"
  });

  if (result.error) throw result.error;
  return result;
}

function assertCleanEnough(paths) {
  const status = run("git", ["status", "--porcelain", "--", ...paths], { capture: true });
  if (status.status !== 0) process.exit(status.status ?? 1);

  if (!status.stdout.trim()) {
    console.log(`No changes found in ${paths.join(", ")}`);
    return false;
  }

  return true;
}

function hasStagedChanges(paths) {
  const result = run("git", ["diff", "--cached", "--quiet", "--", ...paths], { capture: true });
  return result.status !== 0;
}

function stagedFiles(paths) {
  const result = run("git", ["diff", "--cached", "--name-only", "--", ...paths], { capture: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function selectCommitMessage(args, config, files) {
  if (args.message) return args.message;

  const messages = config.local_publish?.commit_messages || {};
  if (files.length === 1) {
    if (files[0] === "custom/v8s-links.txt") {
      return messages.links || "chore(links): update short links";
    }
    if (files[0] === "custom/v8s-policies.json" || files[0] === "custom/v8s-blocklist.json") {
      return messages.policies || "chore(policies): update local policies";
    }
    if (files[0] === "custom/v8s-site-config.json") {
      return messages.site_config || "chore(site): update instance configuration";
    }
  }

  return messages.mixed
    || config.local_publish?.commit_message
    || "chore: update local vanityURLs configuration";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const paths = args.paths.length
    ? args.paths
    : Array.isArray(config.local_publish?.paths) && config.local_publish.paths.length
      ? config.local_publish.paths
      : ["custom"];
  const fallbackMessage = config.local_publish?.commit_messages?.mixed
    || config.local_publish?.commit_message
    || "chore: update local vanityURLs configuration";

  if (!assertCleanEnough(paths)) return;

  if (args.dryRun) {
    console.log("[dry-run] would run npm run check");
    console.log(`[dry-run] would stage: ${paths.join(", ")}`);
    console.log(`[dry-run] would commit: ${args.message || fallbackMessage}`);
    console.log("[dry-run] would push");
    return;
  }

  run("npm", ["run", "check"]);
  run("git", ["add", ...paths]);

  if (!hasStagedChanges(paths)) {
    console.log("No staged changes to commit after git add.");
    return;
  }

  const message = selectCommitMessage(args, config, stagedFiles(paths));
  run("git", ["commit", "-m", message, "--", ...paths]);
  run("git", ["push"]);
}

try {
  main();
} catch (error) {
  console.error(`local-publish failed: ${error.message}`);
  process.exit(1);
}
