#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

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
  if (path.basename(filePath) === "v8s-links.txt") {
    sortV8sLinksFile(filePath);
  }

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

  if ([".js", ".mjs"].includes(path.extname(filePath))) {
    try {
      execFileSync(process.execPath, ["--check", filePath], {
        cwd: ROOT,
        stdio: "pipe"
      });
    } catch (error) {
      const output = [error.stdout, error.stderr]
        .filter(Boolean)
        .map((buffer) => buffer.toString().trim())
        .filter(Boolean)
        .join("\n");
      failures.push(`${relative}: JavaScript syntax check failed${output ? `\n${output}` : ""}`);
    }
  }
}

function sortV8sLinksFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const sorted = sortedV8sLinksText(text);
  if (sorted !== text) {
    fs.writeFileSync(filePath, sorted);
  }
}

function sortedV8sLinksText(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();

  const header = [];
  const blocks = [];
  let current = null;
  let seenLink = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!seenLink && (!trimmed || trimmed.startsWith("#"))) {
      header.push(line);
      continue;
    }

    if (!trimmed) continue;

    if (/^\s+@schedule\b/.test(line) && current) {
      current.lines.push(line);
      continue;
    }

    const slug = trimmed.startsWith("#") ? `~${blocks.length}` : normalizeLinkSlug(line.split("|")[0]);
    current = {
      slug,
      lines: [line]
    };
    blocks.push(current);
    if (!trimmed.startsWith("#")) seenLink = true;
  }

  const sortedBlocks = blocks.sort((left, right) => left.slug.localeCompare(right.slug));
  const output = [...trimTrailingBlankLines(header)];
  if (output.length && sortedBlocks.length) output.push("");

  for (const block of sortedBlocks) {
    output.push(...block.lines);
  }

  return `${output.join("\n")}\n`;
}

function normalizeLinkSlug(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function trimTrailingBlankLines(lines) {
  const trimmed = [...lines];
  while (trimmed.length && !trimmed.at(-1).trim()) trimmed.pop();
  return trimmed;
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
