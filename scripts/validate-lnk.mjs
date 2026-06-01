#!/usr/bin/env node
import fs from "node:fs";
import { checkTargetUrl, loadBlocklistPolicy } from "./blocklist-policy.mjs";

const file = process.argv[2] || "defaults/v8s-links.txt";
const errors = [];
const warnings = [];
const blocklistPolicy = loadBlocklistPolicy();

const allowedStates = new Set(["permanent", "ephemeral", "expired", "disabled", "maintenance", "deactivated"]);
const targetRedirectStates = new Set(["permanent", "ephemeral"]);
const reservedTopLevel = new Set([
  "_stats",
  "assets",
  "expand",
  "404",
  "404.html",
  "v8s.json",
  "v8s-blocklist.json",
  "v8s-site-config.json",
  "expired",
  "disabled",
  "maintenance",
  "deactivated"
]);

function fail(message) {
  errors.push(message);
}
function warn(message) {
  warnings.push(message);
}
function annotate(kind, message) {
  console.error(`::${kind}::${message}`);
}

function clean(value) {
  return String(value ?? "").trim();
}
function normalizePath(value) {
  return clean(value)
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");
}
function normalizeTarget(value) {
  const target = clean(value);
  if (/^https?:\/\//i.test(target)) return target;
  return `https://${target}`;
}
function validUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
function validSegment(segment) {
  return /^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(segment) || segment === "*";
}
function validDate(value) {
  if (!value) return true;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}
function hasPathBoundary(prefix, candidate) {
  return candidate === prefix || candidate.startsWith(`${prefix}/`);
}

if (!fs.existsSync(file)) {
  fail(`File not found: ${file}`);
} else {
  const rawLines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const exactPaths = new Map();
  const splatPaths = new Map();
  const allLinks = [];

  for (const [index, rawLine] of rawLines.entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const columns = line.split("|").map(clean);
    const [rawPath, rawTarget, state = "permanent", title, description, tags, owner, expiresAt] = columns;

    if (!rawPath || !rawTarget) {
      fail(`Line ${lineNumber}: path and target are required`);
      continue;
    }

    const target = normalizeTarget(rawTarget);
    const isSplat = rawPath.endsWith("/*");
    const path = normalizePath(isSplat ? rawPath.slice(0, -2) : rawPath);
    const displayPath = isSplat ? `${path}/*` : path;

    if (!path) fail(`Line ${lineNumber}: path is empty`);
    if (rawPath.startsWith("/") || (rawPath.endsWith("/") && !rawPath.endsWith("/*")))
      fail(`${displayPath}: no leading or trailing slash allowed`);
    if (rawPath.includes("//")) fail(`${displayPath}: double slash is not allowed`);
    if (path.includes("?") || path.includes("#"))
      fail(`${displayPath}: query strings and fragments are not allowed in paths`);

    const segments = path.split("/");
    for (const segment of segments) {
      if (!validSegment(segment)) {
        fail(
          `${displayPath}: invalid segment '${segment}'; use ASCII letters, digits, dot, underscore, tilde, or hyphen`
        );
      }
    }

    if (reservedTopLevel.has(segments[0])) fail(`${displayPath}: top-level path '${segments[0]}' is reserved`);
    const effectiveState = state || "permanent";

    if (!validUrl(target)) {
      fail(`${displayPath}: target must be an absolute http(s) URL`);
    } else if (targetRedirectStates.has(effectiveState)) {
      for (const violation of checkTargetUrl(target, blocklistPolicy)) {
        fail(`${displayPath}: blocked target: ${violation}`);
      }
    }
    if (!allowedStates.has(effectiveState)) fail(`${displayPath}: invalid state '${state}'`);
    if (!validDate(expiresAt)) fail(`${displayPath}: invalid expires_at '${expiresAt}'`);
    if (isSplat && !target.includes(":splat")) fail(`${displayPath}: splat target must include :splat`);

    const identity = isSplat ? `${path}/*` : path;
    const bucket = isSplat ? splatPaths : exactPaths;
    if (bucket.has(path)) fail(`${displayPath}: duplicate path (also line ${bucket.get(path)})`);
    bucket.set(path, lineNumber);

    if (!title) warn(`${displayPath}: missing title`);
    if (!owner) warn(`${displayPath}: missing owner`);
    if (!description) warn(`${displayPath}: missing description`);

    allLinks.push({ path, displayPath, isSplat, lineNumber });
  }

  for (const link of allLinks.filter((item) => !item.isSplat)) {
    for (const other of allLinks.filter((item) => !item.isSplat)) {
      if (link.path === other.path) continue;
      if (hasPathBoundary(link.path, other.path)) {
        fail(`${link.displayPath}: hierarchy conflict with '${other.displayPath}' — a link cannot also be a namespace`);
      }
    }
  }

  const splats = allLinks.filter((item) => item.isSplat);
  for (let i = 0; i < splats.length; i += 1) {
    for (let j = i + 1; j < splats.length; j += 1) {
      const a = splats[i];
      const b = splats[j];
      if (hasPathBoundary(a.path, b.path) || hasPathBoundary(b.path, a.path)) {
        fail(`${a.displayPath} and ${b.displayPath}: overlapping splat prefixes are not allowed`);
      }
    }
  }
}

for (const message of warnings) annotate("warning", message);
if (errors.length) {
  for (const message of errors) annotate("error", message);
  console.error(`Validation failed: ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`Valid v8s links source: ${file}`);
if (warnings.length) console.log(`Warnings: ${warnings.length}`);
