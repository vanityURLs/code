#!/usr/bin/env node

import fs from "node:fs";
import { checkTargetUrl, loadBlocklistPolicy } from "./blocklist-policy.mjs";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node scripts/validate-registry.mjs <registry.json>");
  process.exit(1);
}

const VALID_STATES = new Set(["permanent", "ephemeral", "expired", "disabled", "maintenance", "deactivated"]);
const TARGET_REDIRECT_STATES = new Set(["permanent", "ephemeral"]);
const VALID_DAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

const REQUIRED_ROUTES = ["permanent", "ephemeral", "expired", "disabled", "maintenance", "deactivated"];

function error(errors, message) {
  errors.push(message);
}

function isValidUrl(value) {
  if (/[\u0000-\u001F\u007F]/.test(String(value || ""))) return false;

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function main() {
  const errors = [];
  const blocklistPolicy = loadBlocklistPolicy();
  let registry;

  try {
    registry = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`::error::Cannot read or parse ${filePath}: ${err.message}`);
    process.exit(1);
  }

  if (registry.schema_version !== "2.2") {
    error(errors, "schema_version must be 2.2");
  }

  if (registry.default_state !== "permanent") {
    error(errors, "default_state must be permanent");
  }

  if (!registry.routing || typeof registry.routing !== "object") {
    error(errors, "routing must be an object");
  }

  if (!Array.isArray(registry.links)) {
    error(errors, "links must be an array");
  }

  for (const state of REQUIRED_ROUTES) {
    if (!registry.routing?.[state]) {
      error(errors, `routing.${state} is required`);
    }
  }

  const seen = new Set();

  for (const [index, link] of (registry.links || []).entries()) {
    const prefix = `links[${index}]`;

    if (!link.slug || typeof link.slug !== "string") {
      error(errors, `${prefix}.slug is required`);
      continue;
    }

    if (link.slug.startsWith("/") || link.slug.endsWith("/") || link.slug.includes("//")) {
      error(errors, `${prefix}.slug is invalid: ${link.slug}`);
    }

    const match = link.match || "exact";
    if (!["exact", "splat"].includes(match)) {
      error(errors, `${prefix}.match must be exact or splat`);
    }

    const key = `${match}:${link.slug}`;
    if (seen.has(key)) {
      error(errors, `duplicate slug: ${link.slug}`);
    }
    seen.add(key);

    const effectiveState = link.state || "permanent";

    if (!link.target || !isValidUrl(link.target)) {
      error(errors, `${prefix}.target must be a valid URL`);
    } else if (TARGET_REDIRECT_STATES.has(effectiveState)) {
      for (const violation of checkTargetUrl(link.target, blocklistPolicy)) {
        error(errors, `${prefix}.target is blocked: ${violation}`);
      }
    }

    if (link.state && !VALID_STATES.has(effectiveState)) {
      error(errors, `${prefix}.state is invalid: ${link.state}`);
    }

    if (match === "splat" && !link.target.includes(":splat")) {
      error(errors, `${prefix} splat target must include :splat`);
    }

    if (link.schedule) {
      if (match !== "exact") {
        error(errors, `${prefix}.schedule is only supported for exact links`);
      }

      if (!Array.isArray(link.schedule.rules) || !link.schedule.rules.length) {
        error(errors, `${prefix}.schedule.rules must be a non-empty array`);
      }

      for (const [ruleIndex, rule] of (link.schedule.rules || []).entries()) {
        const rulePrefix = `${prefix}.schedule.rules[${ruleIndex}]`;

        if (!rule || typeof rule !== "object") {
          error(errors, `${rulePrefix} must be an object`);
          continue;
        }

        if (!rule.label || typeof rule.label !== "string") {
          error(errors, `${rulePrefix}.label is required`);
        }

        if (!rule.timezone || typeof rule.timezone !== "string") {
          error(errors, `${rulePrefix}.timezone is required`);
        }

        if (!Array.isArray(rule.days) || !rule.days.length) {
          error(errors, `${rulePrefix}.days must be a non-empty array`);
        } else {
          for (const day of rule.days) {
            if (!VALID_DAYS.has(day)) {
              error(errors, `${rulePrefix}.days contains invalid day: ${day}`);
            }
          }
        }

        if (!isValidTime(rule.from)) {
          error(errors, `${rulePrefix}.from must use HH:MM`);
        }

        if (!isValidTime(rule.to)) {
          error(errors, `${rulePrefix}.to must use HH:MM`);
        }

        if (!rule.target || !isValidUrl(rule.target)) {
          error(errors, `${rulePrefix}.target must be a valid URL`);
        } else if (TARGET_REDIRECT_STATES.has(effectiveState)) {
          for (const violation of checkTargetUrl(rule.target, blocklistPolicy)) {
            error(errors, `${rulePrefix}.target is blocked: ${violation}`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    for (const message of errors) {
      console.error(`::error::${message}`);
    }
    console.error(`Validation failed: ${errors.length} error(s)`);
    process.exit(1);
  }

  console.log(`Valid registry: ${filePath}`);
  console.log(`Links checked: ${(registry.links || []).length}`);
}

main();
