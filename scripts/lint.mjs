#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CHECK_EXTENSIONS = new Set([".js", ".mjs", ".json", ".md", ".toml", ".txt"]);
const IGNORE_DIRS = new Set([".git", ".wrangler", "build", "node_modules", "src"]);

const failures = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath);
    } else if (CHECK_EXTENSIONS.has(path.extname(entry.name))) {
      lintFile(entryPath);
    }
  }
}

function lintFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const relative = path.relative(ROOT, filePath);

  if (!text.endsWith("\n")) {
    failures.push(`${relative}: missing trailing newline`);
  }

  const lines = text.split(/\n/);
  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line)) {
      failures.push(`${relative}:${index + 1}: trailing whitespace`);
    }
  });

  if (path.extname(filePath) === ".json") {
    try {
      JSON.parse(text);
    } catch (error) {
      failures.push(`${relative}: invalid JSON (${error.message})`);
    }
  }
}

function lintWrangler() {
  const wranglerPath = path.join(ROOT, "wrangler.toml");
  const text = fs.readFileSync(wranglerPath, "utf8");
  const required = [
    "workers_dev = false",
    "preview_urls = false",
    "binding = 'ASSETS'",
    "custom_domain = true",
    "[observability]"
  ];

  for (const snippet of required) {
    if (!text.includes(snippet)) {
      failures.push(`wrangler.toml: missing ${snippet}`);
    }
  }
}

walk(ROOT);
lintWrangler();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("lint ok");
