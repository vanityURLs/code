#!/usr/bin/env node

import { diagnoseCustomPublic, loadMaintenanceContext } from "./lib/custom-public-maintenance.mjs";

function parseArgs(argv) {
  const args = { json: false };
  for (const arg of argv) {
    if (arg === "--json") {
      args.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const context = loadMaintenanceContext();
  const issues = diagnoseCustomPublic(context);

  if (args.json) {
    console.log(JSON.stringify({ issues }, null, 2));
    return;
  }

  if (!issues.length) {
    console.log("[doctor] No custom public drift detected.");
    return;
  }

  console.log(`[doctor] Found ${issues.length} custom public issue${issues.length === 1 ? "" : "s"}:`);
  for (const issue of issues) {
    console.log(`- [${issue.severity}] ${issue.path}: ${issue.message}`);
    console.log(`  Fix: npm run reconcile -- --${issue.fix}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`[doctor] ${error.message}`);
  process.exitCode = 1;
}
