#!/usr/bin/env node

import { checkUpstreamRelease, currentPackageVersion, formatUpstreamReleaseNotice } from "./lib/upstream-release.mjs";

function parseArgs(argv) {
  const args = {
    currentVersion: "",
    json: false,
    repository: "vanityURLs/code"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--current-version") {
      args.currentVersion = readValue(argv, ++index, arg);
    } else if (arg === "--repo") {
      args.repository = readValue(argv, ++index, arg);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
  return value;
}

function printHelp() {
  console.log(`Usage: node scripts/check-upstream-release.mjs [options]

Options:
  --json                       Print machine-readable JSON
  --current-version <version>  Override the local package version
  --repo <owner/name>          Upstream repository (default: vanityURLs/code)
`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = await checkUpstreamRelease({
    currentVersion: args.currentVersion || currentPackageVersion(),
    repository: args.repository
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatUpstreamReleaseNotice(result));
  }
} catch (error) {
  console.error(`[release-check] ${error.message}`);
  process.exitCode = 1;
}
