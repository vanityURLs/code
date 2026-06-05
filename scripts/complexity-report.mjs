#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "build", "eslint-complexity-report.json");
const TOP_FILE_LIMIT = 8;

const eslint = new ESLint();
const results = await eslint.lintFiles(["."]);

const messages = results.flatMap((result) =>
  result.messages.map((message) => ({
    column: message.column,
    filePath: path.relative(ROOT, result.filePath),
    line: message.line,
    message: message.message,
    ruleId: message.ruleId || "unknown",
    severity: message.severity
  }))
);

const errors = messages.filter((message) => message.severity === 2);
const warnings = messages.filter((message) => message.severity === 1);
const warningFiles = groupBy(warnings, (message) => message.filePath);

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(
  REPORT_PATH,
  `${JSON.stringify(
    {
      checked_at: new Date().toISOString(),
      errors: errors.length,
      warnings: warnings.length,
      messages
    },
    null,
    2
  )}\n`
);

if (!messages.length) {
  console.log("[complexity] No ESLint complexity warnings.");
} else {
  console.log(
    `[complexity] ${warnings.length} warning${warnings.length === 1 ? "" : "s"}, ${errors.length} error${
      errors.length === 1 ? "" : "s"
    } across ${warningFiles.size} file${warningFiles.size === 1 ? "" : "s"}.`
  );
  console.log(`[complexity] Detailed report: ${path.relative(ROOT, REPORT_PATH)}`);

  for (const [filePath, fileWarnings] of topEntries(warningFiles, TOP_FILE_LIMIT)) {
    const topRules = [...groupBy(fileWarnings, (message) => message.ruleId).entries()]
      .sort((left, right) => right[1].length - left[1].length)
      .slice(0, 3)
      .map(([ruleId, ruleWarnings]) => `${ruleId}=${ruleWarnings.length}`)
      .join(", ");
    console.log(
      `[complexity] - ${filePath}: ${fileWarnings.length} warning${fileWarnings.length === 1 ? "" : "s"} (${topRules})`
    );
  }
}

if (errors.length) {
  process.exitCode = 1;
}

function groupBy(items, keyForItem) {
  const groups = new Map();
  for (const item of items) {
    const key = keyForItem(item);
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return groups;
}

function topEntries(groups, limit) {
  return [...groups.entries()].sort((left, right) => right[1].length - left[1].length).slice(0, limit);
}
