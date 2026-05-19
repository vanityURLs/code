#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const OUTPUT_PATH = process.argv[2] || "build/blocklist.generated.json";
const POLICY_PATH = "defaults/v8s-policies.json";
const LEGACY_POLICY_PATH = "defaults/v8s-blocklist.json";
const CUSTOM_POLICY_PATH = "custom/v8s-policies.json";
const LEGACY_CUSTOM_POLICY_PATH = "custom/v8s-blocklist.json";
const CATEGORIES_PATH = "defaults/v8s-blocklist-categories.json";
const CUSTOM_CATEGORIES_PATH = "custom/v8s-blocklist-categories.json";
const MAX_DOMAINS = 50000;
const MAX_FORCE_NOTICES = 25;

function normalizeHostname(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
}

function parseDomainLines(text) {
  const domains = new Set();

  for (const line of text.split(/\r?\n/)) {
    const cleaned = line.trim();
    if (!cleaned || cleaned.startsWith("#")) continue;

    const parts = cleaned.split(/\s+/);
    const host = normalizeHostname(parts[1] || parts[0]);

    if (!host || host === "localhost") continue;
    domains.add(host);

    if (domains.size >= MAX_DOMAINS) break;
  }

  return [...domains].sort();
}

function loadGeneratedSources() {
  const policy = loadPolicy();
  const categories = loadCategories();
  const configuredSources = policy.generated_sources || {};
  const categorySources = categories.sources || {};
  const mergedSources = {};

  for (const name of new Set([...Object.keys(categorySources), ...Object.keys(configuredSources)])) {
    mergedSources[name] = {
      ...(categorySources[name] || {}),
      ...(configuredSources[name] || {})
    };
  }

  return mergedSources;
}

function loadPolicy() {
  const basePolicy = readJsonFile(resolvePath(POLICY_PATH, LEGACY_POLICY_PATH));
  const customPolicy = readJsonFile(resolvePath(CUSTOM_POLICY_PATH, LEGACY_CUSTOM_POLICY_PATH));

  return mergePolicy(customPolicy, basePolicy);
}

function loadCategories() {
  const base = readJsonFile(CATEGORIES_PATH);
  const custom = readJsonFile(CUSTOM_CATEGORIES_PATH);

  return {
    ...base,
    ...custom,
    categories: mergeObject(base.categories, custom.categories),
    severities: mergeObject(base.severities, custom.severities),
    sources: mergeObject(base.sources, custom.sources)
  };
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolvePath(primary, legacy) {
  if (fs.existsSync(primary)) return primary;
  if (legacy && fs.existsSync(legacy)) return legacy;
  return primary;
}

function mergePolicy(localPolicy, basePolicy) {
  const localDefaults = localPolicy.defaults || {};
  const baseDefaults = basePolicy.defaults || {};

  return {
    ...basePolicy,
    ...localPolicy,
    defaults: {
      ...baseDefaults,
      ...localDefaults,
      allowed_protocols: mergeArray(baseDefaults.allowed_protocols, localDefaults.allowed_protocols),
      blocked_file_extensions: mergeArray(baseDefaults.blocked_file_extensions, localDefaults.blocked_file_extensions)
    },
    generated_sources: mergeObject(basePolicy.generated_sources, localPolicy.generated_sources),
    allow_domains: mergeArray(basePolicy.allow_domains, localPolicy.allow_domains),
    blocked_keywords: mergeArray(basePolicy.blocked_keywords, localPolicy.blocked_keywords),
    block_domains: mergeArray(basePolicy.block_domains, localPolicy.block_domains)
  };
}

function mergeObject(first = {}, second = {}) {
  return {
    ...(first || {}),
    ...(second || {})
  };
}

function mergeArray(first = [], second = []) {
  return [...asArray(first), ...asArray(second)];
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAllowDomainEntry(entry) {
  if (typeof entry === "string") {
    return {
      domain: normalizeHostname(entry),
      enabled: true
    };
  }

  if (!entry || typeof entry !== "object") {
    return {
      domain: "",
      enabled: false
    };
  }

  return {
    ...entry,
    domain: normalizeHostname(entry.domain),
    enabled: entry.enabled !== false
  };
}

function loadEnabledAllowDomains() {
  const policy = loadPolicy();
  const entries = Array.isArray(policy.allow_domains) ? policy.allow_domains : [];

  return entries
    .map((entry) => normalizeAllowDomainEntry(entry))
    .filter((entry) => entry.domain && entry.enabled !== false);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "VanityURLs blocklist generator"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  return response.text();
}

function buildPolicy(generatedEntries, sourceSummaries) {
  const today = new Date().toISOString().slice(0, 10);
  const uniqueEntries = new Map();

  for (const entry of generatedEntries) {
    if (!uniqueEntries.has(entry.domain)) {
      uniqueEntries.set(entry.domain, entry);
    }
  }

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    sources: sourceSummaries,
    defaults: {},
    allow_domains: [],
    block_domains: [...uniqueEntries.values()].map((entry) => ({
      ...entry,
      added_at: today
    }))
  };
}

function domainMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function findForcedAllowlistOverrides(generatedEntries, allowDomains) {
  const forced = new Map();

  for (const entry of generatedEntries) {
    const allowed = allowDomains.find((allowEntry) => domainMatches(entry.domain, allowEntry.domain));
    if (!allowed) continue;

    const key = `${entry.domain}:${entry.source}`;
    forced.set(key, {
      domain: entry.domain,
      generated_source: entry.source,
      category: entry.category,
      severity: entry.severity,
      allowed_domain: allowed.domain,
      reason: allowed.reason || "No reason provided"
    });
  }

  return [...forced.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}

function notifyForcedAllowlistOverrides(forcedOverrides) {
  if (!forcedOverrides.length) return;

  console.warn(`::warning::${forcedOverrides.length} generated blocklist item(s) are force-allowed by custom/default allow_domains`);

  for (const override of forcedOverrides.slice(0, MAX_FORCE_NOTICES)) {
    console.warn(
      `Forced allowlist override: ${override.domain} ` +
      `from ${override.generated_source} (${override.category}/${override.severity}) ` +
      `allowed by ${override.allowed_domain}: ${override.reason}`
    );
  }

  if (forcedOverrides.length > MAX_FORCE_NOTICES) {
    console.warn(`Forced allowlist override notices truncated after ${MAX_FORCE_NOTICES} item(s)`);
  }
}

async function main() {
  const sources = loadGeneratedSources();
  const allowDomains = loadEnabledAllowDomains();
  const generatedEntries = [];
  const sourceSummaries = [];

  for (const [sourceName, source] of Object.entries(sources)) {
    if (source.enabled === false) continue;
    if (!source.url) {
      throw new Error(`Generated source '${sourceName}' is missing a url`);
    }

    const text = await fetchText(source.url);
    const domains = parseDomainLines(text);

    sourceSummaries.push({
      name: sourceName,
      url: source.url,
      category: source.category,
      severity: source.severity,
      domains: domains.length
    });

    for (const domain of domains) {
      generatedEntries.push({
        domain,
        category: source.category || "custom",
        severity: source.severity || "medium",
        reason: source.reason || `Listed by ${sourceName} generated blocklist source`,
        source: sourceName
      });
    }
  }

  const forcedOverrides = findForcedAllowlistOverrides(generatedEntries, allowDomains);
  notifyForcedAllowlistOverrides(forcedOverrides);

  const policy = buildPolicy(generatedEntries, sourceSummaries);
  const outputPath = path.resolve(OUTPUT_PATH);

  fs.mkdirSync(path.dirname(outputPath), {
    recursive: true
  });
  fs.writeFileSync(outputPath, `${JSON.stringify(policy, null, 2)}\n`);
  console.log(`Generated ${OUTPUT_PATH} with ${policy.block_domains.length} blocked domains from ${sourceSummaries.length} source(s)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
