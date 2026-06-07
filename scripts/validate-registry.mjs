#!/usr/bin/env node

import fs from "node:fs";
import { checkTargetUrl, loadBlocklistPolicy } from "./blocklist-policy.mjs";
import { flattenRuntimeRegistry } from "./lib/runtime-registry.mjs";
import {
  DEFAULT_STATE,
  LINK_STATES,
  REDIRECT_STATES,
  RUNTIME_REGISTRY_SCHEMA_VERSION,
  VALID_DAYS
} from "./lib/constants.mjs";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node scripts/validate-registry.mjs <runtime-link-registry.json>");
  process.exit(1);
}

const VALID_STATES = new Set(LINK_STATES);
const TARGET_REDIRECT_STATES = new Set(REDIRECT_STATES);
const REQUIRED_ROUTES = LINK_STATES;
const allowedRouteTypes = new Set(["redirect", "error"]);

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

function isValidTimezone(value) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function isValidPathTarget(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

function isValidSlugSegment(segment) {
  return /^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(segment);
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validateRoute(route, path, errors) {
  if (!isObject(route)) {
    error(errors, `${path}: route must be an object`);
    return;
  }

  if (!allowedRouteTypes.has(route.type)) {
    error(errors, `${path}.type must be redirect or error`);
  }

  if (!Number.isInteger(route.status)) {
    error(errors, `${path}.status must be an integer`);
  }

  if (route.type === "redirect") {
    if (!route.target) {
      error(errors, `${path}.target is required`);
    } else if (route.target !== "link.target" && !isValidPathTarget(route.target) && !isValidUrl(route.target)) {
      error(errors, `${path}.target must be link.target, a root-relative path, or absolute http(s) URL`);
    }
  }
}

function validateLink(link, prefix, blocklistPolicy, errors, seen = null) {
  if (!isObject(link)) {
    error(errors, `${prefix} must be an object`);
    return;
  }

  if (!link.slug || typeof link.slug !== "string") {
    error(errors, `${prefix}.slug is required`);
    return;
  }

  if (link.slug.startsWith("/") || link.slug.endsWith("/") || link.slug.includes("//")) {
    error(errors, `${prefix}.slug is invalid: ${link.slug}`);
  }

  for (const segment of link.slug.split("/")) {
    if (!isValidSlugSegment(segment)) {
      error(
        errors,
        `${prefix}.slug contains invalid segment "${segment}"; use ASCII letters, digits, dot, underscore, tilde, or hyphen`
      );
    }
  }

  const match = link.match || "exact";
  if (!["exact", "splat"].includes(match)) {
    error(errors, `${prefix}.match must be exact or splat`);
  }

  if (seen) {
    const key = `${match}:${link.slug}`;
    if (seen.has(key)) {
      error(errors, `duplicate slug: ${link.slug}`);
    }
    seen.add(key);
  }

  const effectiveState = link.state || DEFAULT_STATE;

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

  validateSchedule(link, match, effectiveState, prefix, blocklistPolicy, errors);
}

function validateSchedule(link, match, effectiveState, prefix, blocklistPolicy, errors) {
  if (!link.schedule) return;

  if (match !== "exact") {
    error(errors, `${prefix}.schedule is only supported for exact links`);
  }

  if (!Array.isArray(link.schedule.rules) || !link.schedule.rules.length) {
    error(errors, `${prefix}.schedule.rules must be a non-empty array`);
  }

  for (const [ruleIndex, rule] of (link.schedule.rules || []).entries()) {
    const rulePrefix = `${prefix}.schedule.rules[${ruleIndex}]`;

    if (!isObject(rule)) {
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

function validateTree(node, path, errors) {
  if (!isObject(node)) {
    error(errors, `${path || "tree"}: node must be an object`);
    return;
  }

  if (node.link && node.link.match && node.link.match !== "exact") {
    error(errors, `${path || "tree"}.link must be an exact link`);
  }

  if (node.splat_link && node.splat_link.match !== "splat") {
    error(errors, `${path || "tree"}.splat_link must be a splat link`);
  }

  const children = node.children || {};
  if (!isObject(children)) {
    error(errors, `${path || "tree"}: children must be an object`);
    return;
  }

  for (const [segment, child] of Object.entries(children)) {
    if (segment.includes("/")) {
      error(errors, `${path}/${segment}: segment must not contain slash`);
    }
    validateTree(child, path ? `${path}/${segment}` : segment, errors);
  }
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

  if (registry.schema_version !== RUNTIME_REGISTRY_SCHEMA_VERSION) {
    error(errors, `schema_version must be ${RUNTIME_REGISTRY_SCHEMA_VERSION}`);
  }

  if (registry.default_state !== DEFAULT_STATE) {
    error(errors, `default_state must be ${DEFAULT_STATE}`);
  }

  if (registry.generated_timezone && !isValidTimezone(registry.generated_timezone)) {
    error(errors, "generated_timezone must be a valid IANA timezone");
  }

  if (!registry.routing || typeof registry.routing !== "object") {
    error(errors, "routing must be an object");
  }

  for (const state of REQUIRED_ROUTES) {
    if (!registry.routing?.[state]) {
      error(errors, `routing.${state} is required`);
    }
  }

  for (const [state, route] of Object.entries(registry.routing || {})) {
    validateRoute(route, `routing.${state}`, errors);
  }

  if (!isObject(registry.tree)) {
    error(errors, "tree must be an object");
  } else {
    validateTree(registry.tree, "", errors);
  }

  const seen = new Set();
  const links = flattenRuntimeRegistry(registry);

  for (const [index, link] of links.entries()) {
    const prefix = `tree link ${index}`;
    validateLink(link, prefix, blocklistPolicy, errors, seen);
  }

  if (errors.length > 0) {
    for (const message of errors) {
      console.error(`::error::${message}`);
    }
    console.error(`Validation failed: ${errors.length} error(s)`);
    process.exit(1);
  }

  console.log(`Valid runtime link registry: ${filePath}`);
  console.log(`Links checked: ${links.length}`);
}

main();
