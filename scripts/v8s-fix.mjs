#!/usr/bin/env node

import {
  diagnoseCustomPublic,
  loadMaintenanceContext,
  parseReconcileArgs,
  reconcileCustomPublic
} from "./lib/custom-public-maintenance.mjs";

function main() {
  const options = parseReconcileArgs(process.argv.slice(2));
  const selected =
    options.public ||
    options.languages ||
    options.assets ||
    options.branding ||
    options.headAssets ||
    options.productPages;
  if (!selected) {
    throw new Error(
      "Choose at least one fix: --head-assets, --assets, --product-pages, --languages, --branding, --public, or --all."
    );
  }

  const context = loadMaintenanceContext();

  if (options.dryRun) {
    const issues = diagnoseCustomPublic(context).filter((issue) =>
      options.public ? true : options[fixOptionName(issue.fix)]
    );
    if (!issues.length) {
      console.log("[v8s-fix] Dry run: no matching custom public drift detected.");
      return;
    }

    console.log(`[v8s-fix] Dry run: would address ${issues.length} issue${issues.length === 1 ? "" : "s"}:`);
    for (const issue of issues) {
      console.log(`- ${issue.path}: ${issue.message}`);
    }
    return;
  }

  const actions = reconcileCustomPublic(context, options);
  if (!actions.length) {
    console.log("[v8s-fix] No changes requested.");
    return;
  }

  for (const action of actions) {
    console.log(`[v8s-fix] ${action}`);
  }
}

function fixOptionName(fix) {
  if (fix === "head-assets") return "headAssets";
  return fix;
}

try {
  main();
} catch (error) {
  console.error(`[v8s-fix] ${error.message}`);
  process.exitCode = 1;
}
