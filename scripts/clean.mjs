#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GENERATED_PATHS = ["build", "functions", "src"];

for (const relativePath of GENERATED_PATHS) {
  const target = path.join(ROOT, relativePath);

  fs.rmSync(target, {
    recursive: true,
    force: true
  });

  console.log(`[clean] Removed ${relativePath}/`);
}
