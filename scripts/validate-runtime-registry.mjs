#!/usr/bin/env node
import fs from "node:fs";

const file = process.argv[2] || "build/v8s.json";
const errors = [];
const warnings = [];

const requiredStates = ["permanent", "ephemeral", "expired", "disabled", "maintenance", "deactivated"];
const allowedRouteTypes = new Set(["redirect", "error"]);
const allowedMatches = new Set(["exact", "splat"]);

function fail(message) {
  errors.push(message);
}
function warn(message) {
  warnings.push(message);
}
function annotate(kind, message) {
  console.error(`::${kind}::${message}`);
}
function validUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
function validPathTarget(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}
function validDate(value) {
  if (value === null || value === undefined || value === "") return true;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function validateLink(link, path) {
  if (!link || typeof link !== "object" || Array.isArray(link)) {
    fail(`${path}: link must be an object`);
    return;
  }
  if (!allowedMatches.has(link.match)) fail(`${path}: match must be exact or splat`);
  if (!link.target || !validUrl(link.target)) fail(`${path}: target must be an absolute http(s) URL`);
  if (link.match === "splat" && !link.target.includes(":splat")) fail(`${path}: splat target must include :splat`);
  if (link.state && !requiredStates.includes(link.state)) fail(`${path}: invalid state '${link.state}'`);
  if (!validDate(link.created_at)) fail(`${path}: invalid created_at`);
  if (!validDate(link.updated_at)) fail(`${path}: invalid updated_at`);
  if (!validDate(link.expires_at)) fail(`${path}: invalid expires_at`);
}

function walk(node, prefix = "") {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    fail(`${prefix || "tree"}: node must be an object`);
    return;
  }

  if (node.link) {
    validateLink(node.link, prefix || "<root>");
  }

  const children = node.children || {};
  if (typeof children !== "object" || Array.isArray(children)) {
    fail(`${prefix || "tree"}: children must be an object`);
    return;
  }

  for (const [segment, child] of Object.entries(children)) {
    if (segment.includes("/")) fail(`${prefix}/${segment}: segment must not contain slash`);
    const childPath = prefix ? `${prefix}/${segment}` : segment;
    walk(child, childPath);
  }
}

let registry;
try {
  registry = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  annotate("error", `Cannot read or parse ${file}: ${error.message}`);
  process.exit(1);
}

if (registry.schema_version !== "3.0") fail("schema_version must be 3.0");
if (registry.default_state !== "permanent") fail("default_state must be permanent");
if (!registry.routing || typeof registry.routing !== "object" || Array.isArray(registry.routing))
  fail("routing must be an object");
for (const state of requiredStates) {
  if (!registry.routing?.[state]) fail(`routing.${state} is required`);
}
for (const [state, route] of Object.entries(registry.routing || {})) {
  if (!route || typeof route !== "object" || Array.isArray(route)) {
    fail(`routing.${state}: route must be an object`);
    continue;
  }
  if (!allowedRouteTypes.has(route.type)) fail(`routing.${state}: type must be redirect or error`);
  if (!Number.isInteger(route.status)) fail(`routing.${state}: status must be an integer`);
  if (route.type === "redirect") {
    if (!route.target) fail(`routing.${state}: target is required`);
    if (route.target !== "link.target" && !validPathTarget(route.target) && !validUrl(route.target)) {
      fail(`routing.${state}: target must be link.target, a root-relative path, or absolute http(s) URL`);
    }
  }
}
if (!registry.tree || typeof registry.tree !== "object" || Array.isArray(registry.tree)) fail("tree must be an object");
else walk(registry.tree);
if (!Array.isArray(registry.links)) warn("links compatibility array is missing; admin table may be less useful");

for (const message of warnings) annotate("warning", message);
if (errors.length) {
  for (const message of errors) annotate("error", message);
  console.error(`Validation failed: ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`Valid runtime registry: ${file}`);
