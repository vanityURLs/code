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
  }

  printRecommendedFixes(issues);
}

function printRecommendedFixes(issues) {
  const fixes = [...new Set(issues.map((issue) => issue.fix))].sort(compareFixes);
  const fixCounts = fixes.map((fix) => ({
    fix,
    count: issues.filter((issue) => issue.fix === fix).length
  }));

  console.log("");
  console.log("[doctor] Recommended fix:");
  console.log(`  ./scripts/v8s-fix ${fixes.map((fix) => `--${fix}`).join(" ")}`);

  console.log("");
  console.log("[doctor] Fix groups:");
  for (const { fix, count } of fixCounts) {
    console.log(`- --${fix}: ${count} issue${count === 1 ? "" : "s"}`);
  }
}

function compareFixes(left, right) {
  const order = ["product-pages", "head-assets", "assets", "branding", "languages", "public"];
  return order.indexOf(left) - order.indexOf(right);
}

try {
  main();
} catch (error) {
  console.error(`[doctor] ${error.message}`);
  process.exitCode = 1;
}
