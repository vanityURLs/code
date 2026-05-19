#!/usr/bin/env node

import fs from "node:fs";
import { checkTargetUrl, loadBlocklistPolicy } from "./blocklist-policy.mjs";

const inputPath = process.argv[2] || "defaults/v8s-links.txt";
const outputPath = process.argv[3] || "build/v8s.json";

const VALID_STATES = new Set([
  "permanent",
  "ephemeral",
  "expired",
  "disabled",
  "maintenance",
  "deactivated"
]);
const TARGET_REDIRECT_STATES = new Set(["permanent", "ephemeral"]);
const VALID_DAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const SCHEDULE_SHORTCUTS = {
  "9to5": {
    days: ["mon", "tue", "wed", "thu", "fri"],
    from: "09:00",
    to: "17:00"
  }
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");
}

function parseSlug(value) {
  const rawSlug = String(value || "").trim();
  const isSplat = rawSlug.endsWith("/*");
  const slug = normalizeSlug(isSplat ? rawSlug.slice(0, -2) : rawSlug);

  return {
    slug,
    match: isSplat ? "splat" : "exact",
    displaySlug: isSplat ? `${slug}/*` : slug
  };
}

function parseTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeTarget(value) {
  const target = String(value || "").trim();
  if (target.startsWith("//")) return target;
  if (/^https?:\/\//i.test(target)) return target;
  return `https://${target}`;
}

function isSafeRedirectUrl(value) {
  if (/[\u0000-\u001F\u007F]/.test(String(value || ""))) return false;

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password;
  } catch {
    return false;
  }
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadScheduleEntries() {
  const entries = new Map();

  for (const [slug, config] of Object.entries(readJsonFile("defaults/v8s-schedules.json"))) {
    entries.set(slug, {
      config,
      source: "defaults"
    });
  }

  for (const [slug, config] of Object.entries(readJsonFile("custom/v8s-schedules.json"))) {
    entries.set(slug, {
      config,
      source: "custom"
    });
  }

  return entries;
}

function normalizeDay(value) {
  return String(value || "").trim().slice(0, 3).toLowerCase();
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function normalizeScheduleRule(slug, rawRule, fallbackTimezone, index, errors) {
  const rule = rawRule && typeof rawRule === "object" ? rawRule : {};
  const label = String(rule.label || `rule-${index + 1}`).trim();
  const timezone = String(rule.timezone || fallbackTimezone || "UTC").trim();
  const from = String(rule.from || "").trim();
  const to = String(rule.to || "").trim();
  const days = Array.isArray(rule.days)
    ? rule.days.map(normalizeDay).filter(Boolean)
    : [];
  const target = normalizeTarget(rule.target);
  const prefix = `Schedule for "${slug}" rule "${label}"`;

  if (!label) errors.push(`${prefix}: label is required`);
  if (!timezone) errors.push(`${prefix}: timezone is required`);
  if (!days.length) errors.push(`${prefix}: days must contain at least one weekday`);
  for (const day of days) {
    if (!VALID_DAYS.has(day)) {
      errors.push(`${prefix}: invalid day "${day}"`);
    }
  }
  if (!isValidTime(from)) errors.push(`${prefix}: from must use HH:MM`);
  if (!isValidTime(to)) errors.push(`${prefix}: to must use HH:MM`);
  if (!isSafeRedirectUrl(target)) errors.push(`${prefix}: target must be a safe http(s) URL`);

  return {
    label,
    timezone,
    days,
    from,
    to,
    target
  };
}

function scheduleRulesFromConfig(slug, config, errors) {
  if (!config || typeof config !== "object") return [];

  const timezone = String(config.timezone || "UTC").trim();
  const rules = [];

  if (Array.isArray(config.rules)) {
    rules.push(...config.rules.map((rule, index) => {
      return normalizeScheduleRule(slug, rule, timezone, index, errors);
    }));
  }

  for (const [key, shortcut] of Object.entries(SCHEDULE_SHORTCUTS)) {
    if (typeof config[key] === "string") {
      rules.push(normalizeScheduleRule(slug, {
        label: key,
        timezone,
        ...shortcut,
        target: config[key]
      }, timezone, rules.length, errors));
    }
  }

  return rules;
}

function applyScheduleConfig(links, blocklistPolicy, errors) {
  const scheduleEntries = loadScheduleEntries();
  const linksBySlug = new Map(links.map((link) => [link.slug, link]));

  for (const [rawSlug, { config, source }] of scheduleEntries) {
    const slug = normalizeSlug(rawSlug);
    const link = linksBySlug.get(slug);

    if (!link) {
      if (source === "custom") {
        errors.push(`Schedule configured for unknown slug "${rawSlug}"`);
      }
      continue;
    }

    if (link.match !== "exact") {
      errors.push(`Schedule configured for "${slug}" but schedules only support exact aliases`);
      continue;
    }

    const rules = scheduleRulesFromConfig(slug, config, errors);

    if (!rules.length) {
      errors.push(`Schedule configured for "${slug}" but no rules were found`);
      continue;
    }

    if (config && typeof config === "object" && typeof config.default === "string" && config.default.trim()) {
      link.target = normalizeTarget(config.default);
      if (!isSafeRedirectUrl(link.target)) {
        errors.push(`Schedule default target for "${slug}" must be a safe http(s) URL`);
      } else if (TARGET_REDIRECT_STATES.has(link.state || "permanent")) {
        for (const violation of checkTargetUrl(link.target, blocklistPolicy)) {
          errors.push(`Schedule default target for "${slug}" is blocked: ${violation}`);
        }
      }
    }

    if (TARGET_REDIRECT_STATES.has(link.state || "permanent")) {
      for (const rule of rules) {
        for (const violation of checkTargetUrl(rule.target, blocklistPolicy)) {
          errors.push(`Schedule target for "${slug}" is blocked: ${violation}`);
        }
      }
    }

    link.schedule = { rules };
  }
}

function parseLine(line, lineNumber, blocklistPolicy, errors) {
  const parts = line.split("|").map((part) => part.trim());

  const [
    rawSlug,
    rawTarget,
    state,
    title,
    description,
    tags,
    owner,
    expiresAt,
    notes
  ] = parts;

  const { slug, match, displaySlug } = parseSlug(rawSlug);

  if (!slug) {
    errors.push(`Line ${lineNumber}: slug is required`);
    return null;
  }

  if (!rawTarget) {
    errors.push(`Line ${lineNumber}: target is required for "${displaySlug}"`);
    return null;
  }

  const target = normalizeTarget(rawTarget);

  if (!isSafeRedirectUrl(target)) {
    errors.push(`Line ${lineNumber}: invalid target URL for "${displaySlug}"`);
    return null;
  }

  if (state && !VALID_STATES.has(state)) {
    errors.push(`Line ${lineNumber}: invalid state "${state}" for "${displaySlug}"`);
  }

  const effectiveState = state || "permanent";
  if (TARGET_REDIRECT_STATES.has(effectiveState)) {
    const blocklistViolations = checkTargetUrl(target, blocklistPolicy);
    if (blocklistViolations.length) {
      errors.push(`Line ${lineNumber}: blocked target for "${displaySlug}": ${blocklistViolations.join("; ")}`);
    }
  }

  if (slug.startsWith("/") || slug.endsWith("/") || slug.includes("//")) {
    errors.push(`Line ${lineNumber}: invalid slug "${displaySlug}"`);
  }

  if (match === "splat" && !target.includes(":splat")) {
    errors.push(`Line ${lineNumber}: splat target for "${displaySlug}" must include :splat`);
  }

  if (match === "exact" && target.includes(":splat")) {
    errors.push(`Line ${lineNumber}: exact target for "${displaySlug}" cannot include :splat`);
  }

  return {
    slug,
    match,
    target,
    state: state || "permanent",
    title: title || displaySlug,
    description: description || "",
    tags: parseTags(tags),
    owner: owner || "",
    created_at: today(),
    updated_at: today(),
    expires_at: expiresAt || null,
    notes: notes || ""
  };
}

function main() {
  const raw = fs.readFileSync(inputPath, "utf8");
  const blocklistPolicy = loadBlocklistPolicy();
  const errors = [];

  const links = raw
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line && !line.startsWith("#"))
    .map(({ line, lineNumber }) => parseLine(line, lineNumber, blocklistPolicy, errors))
    .filter(Boolean);

  applyScheduleConfig(links, blocklistPolicy, errors);

  const seen = new Set();

  for (const link of links) {
    const key = `${link.match}:${link.slug}`;
    if (seen.has(key)) {
      errors.push(`Duplicate link slug: ${link.slug}`);
    }
    seen.add(key);
  }

  if (errors.length) {
    for (const message of errors) {
      console.error(`::error::${message}`);
    }

    console.error(`Build failed: ${errors.length} error(s). ${outputPath} was not written.`);
    process.exit(1);
  }

  const registry = {
    schema_version: "2.2",
    generated_at: new Date().toISOString(),
    default_state: "permanent",
    routing: {
      permanent: {
        type: "redirect",
        status: 301,
        target: "link.target"
      },
      ephemeral: {
        type: "redirect",
        status: 302,
        target: "link.target"
      },
      expired: {
        type: "redirect",
        status: 302,
        target: "/expired"
      },
      disabled: {
        type: "redirect",
        status: 302,
        target: "/disabled"
      },
      maintenance: {
        type: "redirect",
        status: 302,
        target: "/maintenance"
      },
      deactivated: {
        type: "error",
        status: 404
      }
    },
    links
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath} with ${links.length} links`);
}

main();
