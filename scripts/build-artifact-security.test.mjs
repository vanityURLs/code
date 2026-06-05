#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const buildDir = path.join(root, "build");
const runtimeFilenames = new Set(["v8s.json", "v8s-blocklist.json", "v8s-site-config.json"]);

if (!fs.existsSync(buildDir)) {
  console.log("build artifact security tests skipped: build/ does not exist");
  process.exit(0);
}

const found = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(filePath);
      continue;
    }

    if (runtimeFilenames.has(entry.name)) {
      found.push(path.relative(buildDir, filePath).split(path.sep).join("/"));
    }
  }
}

walk(buildDir);

assert.deepEqual(
  found.sort(),
  ["v8s-blocklist.json", "v8s-site-config.json", "v8s.json"],
  "runtime JSON artifacts must only exist at the build root"
);

for (const publicPath of found) {
  assert(!publicPath.startsWith("lookup/"), `${publicPath} must not be copied under lookup`);
  assert(!/^[a-z]{2}\//.test(publicPath), `${publicPath} must not be copied under localized public pages`);
  assert(!publicPath.startsWith("_stats/"), `${publicPath} must not be copied under legacy stats assets`);
}

console.log("build artifact security tests ok");
