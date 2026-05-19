#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const POLICY_PATH = process.env.V8S_POLICY_FILE || process.env.BLOCKLIST_FILE || "custom/v8s-policies.json";
const CATEGORIES_PATH = "defaults/v8s-blocklist-categories.json";

function usage() {
  console.log(`LNK block policies - manage blocked and allowed destinations.

Usage:
  ./scripts/lnk block categories
  ./scripts/lnk block add DOMAIN --category CATEGORY --severity SEVERITY --reason TEXT
  ./scripts/lnk block keyword KEYWORD --category CATEGORY --severity SEVERITY --reason TEXT
  ./scripts/lnk block allow DOMAIN --reason TEXT

Options:
  --source SOURCE        Source label, defaults to local-policy
  --dry-run             Print the updated JSON without writing
  --help                Show this help

Environment:
  V8S_POLICY_FILE=FILE   Override the block policy file
  BLOCKLIST_FILE=FILE    Legacy alias for V8S_POLICY_FILE

Docs:
  https://www.VanityURLs.link/en/docs`);
}

function readJson(path, fallback) {
  if (!fs.existsSync(path)) return fallback;
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  fs.mkdirSync(pathModuleDirname(path), {
    recursive: true
  });
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
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

function validateCategory(category, severity) {
  const registry = readJson(CATEGORIES_PATH, { categories: {}, severities: {} });

  if (!registry.categories?.[category]) {
    throw new Error(`Unknown blocklist category: ${category}. Run ./scripts/lnk block categories.`);
  }

  if (!registry.severities?.[severity]) {
    throw new Error(`Unknown blocklist severity: ${severity}. Run ./scripts/lnk block categories.`);
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

function savePolicy(policy, dryRun) {
  if (dryRun) {
    console.log(JSON.stringify(policy, null, 2));
    return;
  }

  writeJson(POLICY_PATH, policy);
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
  savePolicy(policy, options.dryRun);

  if (!options.dryRun) {
    console.log(`Blocked ${domain} as ${category}/${severity}`);
  }
}

function normalizeKeyword(value) {
  return String(value || "").trim().toLowerCase();
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

  savePolicy(policy, options.dryRun);

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
    allowDomains.set(itemDomain, typeof item === "string" ? { domain: itemDomain, enabled: true } : { ...item, domain: itemDomain });
  }

  allowDomains.set(domain, {
    ...(allowDomains.get(domain) || {}),
    ...entry
  });

  policy.allow_domains = [...allowDomains.values()].sort((a, b) => a.domain.localeCompare(b.domain));
  policy.block_domains = policy.block_domains.filter((entry) => normalizeHostname(entry.domain) !== domain);

  savePolicy(policy, options.dryRun);

  if (!options.dryRun) {
    const suffix = options.reason ? ` (${options.reason})` : "";
    console.log(`Allowed ${domain}${suffix}`);
  }
}

function main() {
  const command = process.argv[2];
  const rest = process.argv.slice(3);

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
