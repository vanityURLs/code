#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.env.V8S_REPO || process.cwd();
process.chdir(ROOT);

const POLICY_PATH = process.env.V8S_POLICY_FILE || "custom/v8s-policies.json";
const DEFAULT_POLICY_PATH = "defaults/v8s-policies.json";
const CATEGORIES_PATH = "defaults/v8s-blocklist-categories.json";
const VERSION = readPackageVersion();

function usage() {
  console.log(`v8s-lnk block policies - manage blocked and allowed destinations.
Version: ${VERSION}

Usage:
  ./scripts/v8s-lnk block list policy
  ./scripts/v8s-lnk block list categories
  ./scripts/v8s-lnk block list domain [block|allow]
  ./scripts/v8s-lnk block list keyword
  ./scripts/v8s-lnk block categories
  ./scripts/v8s-lnk block add DOMAIN --category CATEGORY --severity SEVERITY --reason TEXT
  ./scripts/v8s-lnk block keyword KEYWORD --category CATEGORY --severity SEVERITY --reason TEXT
  ./scripts/v8s-lnk block allow DOMAIN --reason TEXT

Options:
  --format FORMAT       table | json for list output
  --source SOURCE        Source label, defaults to local-policy
  --dry-run             Print the updated JSON without writing
  --help                Show this help

Environment:
  V8S_REPO=PATH          Local vanityURLs/code repository path
  V8S_POLICY_FILE=FILE   Override the block policy file

Docs:
  https://www.VanityURLs.link/en/docs`);
}

function readPackageVersion() {
  try {
    return JSON.parse(fs.readFileSync("package.json", "utf8")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function readJson(path, fallback) {
  if (!fs.existsSync(path)) return fallback;
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function readEffectivePolicy() {
  if (fs.existsSync(POLICY_PATH)) return readJson(POLICY_PATH, {});
  return readJson(DEFAULT_POLICY_PATH, {});
}

function writeJson(path, value) {
  fs.mkdirSync(pathModuleDirname(path), {
    recursive: true
  });
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function pathModuleDirname(filePath) {
  const dir = path.dirname(filePath);
  return dir === "." ? process.cwd() : dir;
}

function normalizeHostname(value) {
  const raw = String(value || "").trim();
  let hostname = raw;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    hostname = new URL(raw).hostname;
  }

  if (hostname.includes("/") || hostname.includes("?") || hostname.includes("#")) {
    throw new Error(`Expected a domain or URL, got: ${value}`);
  }

  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
}

function parseOptions(args) {
  const options = {};
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      options[key] = value;
      index += 1;
    } else {
      positionals.push(arg);
    }
  }

  return { options, positionals };
}

function listCategories() {
  const registry = readJson(CATEGORIES_PATH, { categories: {}, severities: {} });

  console.log("Categories:");
  for (const [name, category] of Object.entries(registry.categories || {})) {
    console.log(`  ${name.padEnd(20)} ${category.description}`);
  }

  console.log("");
  console.log("Severities:");
  for (const [name, severity] of Object.entries(registry.severities || {})) {
    console.log(`  ${name.padEnd(20)} ${severity.description}`);
  }
}

function handleList(positionals, options) {
  const target = positionals[0] || "policy";
  const filter = positionals[1] || "";
  const format = options.format || "table";

  if (target === "policy" || target === "policies") {
    listPolicy(format);
    return;
  }

  if (target === "categories") {
    listCategoriesFormatted(format);
    return;
  }

  if (target === "domain" || target === "domains") {
    listDomains(format, filter);
    return;
  }

  if (target === "keyword" || target === "keywords") {
    listKeywords(format);
    return;
  }

  throw new Error(`Unknown list target: ${target}`);
}

function listPolicy(format) {
  const policy = readEffectivePolicy();

  if (format === "json") {
    console.log(JSON.stringify(policy, null, 2));
    return;
  }

  assertTableFormat(format);
  printTable(
    [
      ["Policy file", fs.existsSync(POLICY_PATH) ? POLICY_PATH : DEFAULT_POLICY_PATH],
      ["Schema", policy.schema_version || ""],
      ["Updated", policy.updated_at || ""],
      ["Blocked domains", String((policy.block_domains || []).length)],
      ["Allowed domains", String((policy.allow_domains || []).length)],
      ["Blocked keywords", String((policy.blocked_keywords || []).length)]
    ],
    ["Field", "Value"]
  );
}

function listCategoriesFormatted(format) {
  const registry = readJson(CATEGORIES_PATH, { categories: {}, severities: {} });

  if (format === "json") {
    console.log(JSON.stringify(registry, null, 2));
    return;
  }

  assertTableFormat(format);
  console.log("Categories");
  printTable(
    Object.entries(registry.categories || {}).map(([name, category]) => {
      return [name, category.description || ""];
    }),
    ["Category", "Description"]
  );

  console.log("");
  console.log("Severities");
  printTable(
    Object.entries(registry.severities || {}).map(([name, severity]) => {
      return [name, severity.description || ""];
    }),
    ["Severity", "Description"]
  );
}

function listDomains(format, filter) {
  const policy = readEffectivePolicy();
  const rows = [];

  if (!filter || filter === "block" || filter === "blocked") {
    for (const entry of policy.block_domains || []) rows.push(domainRow("block", entry));
  }

  if (!filter || filter === "allow" || filter === "allowed") {
    for (const entry of policy.allow_domains || []) rows.push(domainRow("allow", entry));
  }

  if (filter && !["block", "blocked", "allow", "allowed"].includes(filter)) {
    throw new Error("Domain list filter must be block or allow");
  }

  rows.sort((a, b) => a.domain.localeCompare(b.domain) || a.type.localeCompare(b.type));

  if (format === "json") {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  assertTableFormat(format);
  if (!rows.length) {
    console.log("No policy domains configured");
    return;
  }

  printTable(
    rows.map((row) => {
      return [row.type, row.domain, row.category || "", row.severity || "", row.reason || ""];
    }),
    ["Type", "Domain", "Category", "Severity", "Reason"]
  );
}

function domainRow(type, entry) {
  if (typeof entry === "string") {
    return {
      type,
      domain: normalizeHostname(entry),
      category: "",
      severity: "",
      reason: ""
    };
  }

  return {
    type,
    domain: normalizeHostname(entry.domain || ""),
    category: entry.category || "",
    severity: entry.severity || "",
    reason: entry.reason || ""
  };
}

function listKeywords(format) {
  const policy = readEffectivePolicy();
  const rows = (policy.blocked_keywords || [])
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          keyword: normalizeKeyword(entry),
          category: "",
          severity: "",
          reason: ""
        };
      }

      return {
        keyword: normalizeKeyword(entry.keyword || ""),
        category: entry.category || "",
        severity: entry.severity || "",
        reason: entry.reason || ""
      };
    })
    .sort((a, b) => a.keyword.localeCompare(b.keyword));

  if (format === "json") {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  assertTableFormat(format);
  if (!rows.length) {
    console.log("No blocked keywords configured");
    return;
  }

  printTable(
    rows.map((row) => {
      return [row.keyword, row.category, row.severity, row.reason];
    }),
    ["Keyword", "Category", "Severity", "Reason"]
  );
}

function assertTableFormat(format) {
  if (format !== "table") throw new Error("--format must be table or json");
}

function printTable(rows, headers) {
  const widths = headers.map((header, index) => {
    return Math.min(48, Math.max(header.length, ...rows.map((row) => String(row[index] || "").length)));
  });

  console.log(headers.map((header, index) => padCell(header, widths[index])).join("  "));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));

  for (const row of rows) {
    console.log(row.map((cell, index) => padCell(truncateCell(cell, widths[index]), widths[index])).join("  "));
  }
}

function truncateCell(value, width) {
  const text = String(value || "");
  if (text.length <= width) return text;
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}

function padCell(value, width) {
  return String(value || "").padEnd(width, " ");
}

function validateCategory(category, severity) {
  const registry = readJson(CATEGORIES_PATH, { categories: {}, severities: {} });

  if (!registry.categories?.[category]) {
    throw new Error(`Unknown blocklist category: ${category}. Run ./scripts/v8s-lnk block categories.`);
  }

  if (!registry.severities?.[severity]) {
    throw new Error(`Unknown blocklist severity: ${severity}. Run ./scripts/v8s-lnk block categories.`);
  }
}

function ensurePolicyShape(policy) {
  policy.schema_version ||= "1.0";
  policy.updated_at = new Date().toISOString().slice(0, 10);
  policy.defaults ||= {};
  policy.allow_domains ||= [];
  policy.block_domains ||= [];
  return policy;
}

function savePolicy(policy, dryRun, message) {
  if (dryRun || process.env.DRY_RUN === "true") {
    console.log(JSON.stringify(policy, null, 2));
    return;
  }

  writeJson(POLICY_PATH, policy);
  run("npm", ["run", "check"]);
  run("git", ["add", POLICY_PATH]);
  run("git", ["commit", "-m", message]);
  run("git", ["push"]);
}

function addBlock(domainInput, options) {
  const domain = normalizeHostname(domainInput);
  const category = options.category || "custom";
  const severity = options.severity || "medium";
  const reason = options.reason;
  const source = options.source || "local-policy";

  if (!domain) throw new Error("Domain is required");
  if (!reason) throw new Error("--reason is required");

  validateCategory(category, severity);

  const policy = ensurePolicyShape(readJson(POLICY_PATH, {}));
  const entry = {
    domain,
    category,
    severity,
    reason,
    source,
    added_at: new Date().toISOString().slice(0, 10)
  };

  policy.allow_domains = policy.allow_domains.filter((allowed) => normalizeHostname(allowed) !== domain);

  const existingIndex = policy.block_domains.findIndex((item) => normalizeHostname(item.domain) === domain);
  if (existingIndex >= 0) {
    policy.block_domains[existingIndex] = {
      ...policy.block_domains[existingIndex],
      ...entry
    };
  } else {
    policy.block_domains.push(entry);
  }

  policy.block_domains.sort((a, b) => a.domain.localeCompare(b.domain));
  savePolicy(policy, options.dryRun, `feat(policies): block ${domain}`);

  if (!options.dryRun) {
    console.log(`Blocked ${domain} as ${category}/${severity}`);
  }
}

function normalizeKeyword(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function addKeyword(keywordInput, options) {
  const keyword = normalizeKeyword(keywordInput);
  const category = options.category || "custom";
  const severity = options.severity || "medium";
  const reason = options.reason;
  const source = options.source || "local-policy";

  if (!keyword) throw new Error("Keyword is required");
  if (!reason) throw new Error("--reason is required");

  validateCategory(category, severity);

  const policy = ensurePolicyShape(readJson(POLICY_PATH, {}));
  policy.blocked_keywords ||= [];

  const entry = {
    keyword,
    category,
    severity,
    reason,
    source,
    added_at: new Date().toISOString().slice(0, 10)
  };

  const existingIndex = policy.blocked_keywords.findIndex((item) => {
    return normalizeKeyword(typeof item === "string" ? item : item.keyword) === keyword;
  });

  if (existingIndex >= 0) {
    policy.blocked_keywords[existingIndex] = {
      ...policy.blocked_keywords[existingIndex],
      ...entry
    };
  } else {
    policy.blocked_keywords.push(entry);
  }

  policy.blocked_keywords.sort((a, b) => {
    const aKeyword = normalizeKeyword(typeof a === "string" ? a : a.keyword);
    const bKeyword = normalizeKeyword(typeof b === "string" ? b : b.keyword);
    return aKeyword.localeCompare(bKeyword);
  });

  savePolicy(policy, options.dryRun, `feat(policies): block keyword ${keyword}`);

  if (!options.dryRun) {
    console.log(`Blocked keyword ${keyword} as ${category}/${severity}`);
  }
}

function addAllow(domainInput, options) {
  const domain = normalizeHostname(domainInput);
  if (!domain) throw new Error("Domain is required");

  const policy = ensurePolicyShape(readJson(POLICY_PATH, {}));
  const entry = {
    domain,
    reason: options.reason || "Owner-controlled allowlist override",
    source: options.source || "local-policy",
    added_at: new Date().toISOString().slice(0, 10),
    enabled: true
  };

  const allowDomains = new Map();
  for (const item of policy.allow_domains || []) {
    const itemDomain = normalizeHostname(typeof item === "string" ? item : item.domain);
    if (!itemDomain) continue;
    allowDomains.set(
      itemDomain,
      typeof item === "string" ? { domain: itemDomain, enabled: true } : { ...item, domain: itemDomain }
    );
  }

  allowDomains.set(domain, {
    ...(allowDomains.get(domain) || {}),
    ...entry
  });

  policy.allow_domains = [...allowDomains.values()].sort((a, b) => a.domain.localeCompare(b.domain));
  policy.block_domains = policy.block_domains.filter((entry) => normalizeHostname(entry.domain) !== domain);

  savePolicy(policy, options.dryRun, `feat(policies): allow ${domain}`);

  if (!options.dryRun) {
    const suffix = options.reason ? ` (${options.reason})` : "";
    console.log(`Allowed ${domain}${suffix}`);
  }
}

function main() {
  const command = process.argv[2];
  const rest = process.argv.slice(3);

  if (command === "version" || command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }

  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }

  if (command === "categories") {
    listCategories();
    return;
  }

  const { options, positionals } = parseOptions(rest);
  if (options.help) {
    usage();
    return;
  }

  if (command === "list") {
    handleList(positionals, options);
    return;
  }

  if (command === "add") {
    addBlock(positionals[0], options);
    return;
  }

  if (command === "allow") {
    addAllow(positionals[0], options);
    return;
  }

  if (command === "keyword") {
    addKeyword(positionals[0], options);
    return;
  }

  throw new Error(`Unknown block command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
