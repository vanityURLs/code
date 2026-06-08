#!/usr/bin/env node

import fs from "node:fs";
import { checkTargetUrl, classifyTargetUrl, loadBlocklistPolicy } from "./blocklist-policy.mjs";
import { mergeSiteConfig } from "./lib/build-assets.mjs";
import { flattenRuntimeRegistry } from "./lib/runtime-registry.mjs";
import { normalizeReplacementUrl } from "./lib/target-normalizers.mjs";

const args = parseArgs(process.argv.slice(2));
const registryPath = args.registryPath;
const timeoutMs = args.timeoutMs;
const concurrency = args.concurrency;
const policy = loadBlocklistPolicy();
const siteConfig = loadSiteConfig();
const redirectableStates = new Set(["permanent", "ephemeral"]);
const longUrlCategories = new Set(["shortener-loop", "platform-share"]);
const userAgent = "Mozilla/5.0 (compatible; VanityURLs-LinkChecker/1.0; +https://vanityURLs.link)";

function usage() {
  console.error(
    "Usage: node scripts/check-targets.mjs [build/v8s.json] [--fix] [--fix-broken-404] [--links-file=custom/v8s-links.txt] [--timeout-ms=8000] [--concurrency=8] [--max-runtime-ms=0]"
  );
  console.error("Checks targets from the generated runtime link registry.");
}

function parseArgs(argv) {
  const parsed = {
    concurrency: positiveInteger(process.env.V8S_TARGET_CONCURRENCY, 8),
    fixBroken404: false,
    fixLongUrls: false,
    linksPath: "custom/v8s-links.txt",
    maxRuntimeMs: nonNegativeInteger(process.env.V8S_TARGET_MAX_RUNTIME_MS, 0),
    timeoutMs: positiveInteger(process.env.V8S_TARGET_TIMEOUT_MS, 8000),
    registryPath: "build/v8s.json"
  };

  for (const arg of argv) {
    if (arg === "--fix" || arg === "--fix-long-urls") {
      parsed.fixLongUrls = true;
    } else if (arg === "--fix-broken-404") {
      parsed.fixBroken404 = true;
    } else if (arg.startsWith("--links-file=")) {
      parsed.linksPath = arg.slice("--links-file=".length);
    } else if (arg.startsWith("--timeout-ms=")) {
      parsed.timeoutMs = positiveInteger(arg.slice("--timeout-ms=".length), parsed.timeoutMs);
    } else if (arg.startsWith("--concurrency=")) {
      parsed.concurrency = positiveInteger(arg.slice("--concurrency=".length), parsed.concurrency);
    } else if (arg.startsWith("--max-runtime-ms=")) {
      parsed.maxRuntimeMs = nonNegativeInteger(arg.slice("--max-runtime-ms=".length), parsed.maxRuntimeMs);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      parsed.registryPath = arg;
    }
  }

  return parsed;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.floor(number);
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

function loadSiteConfig() {
  return mergeSiteConfig(readJsonFile("defaults/v8s-site-config.json"), readJsonFile("custom/v8s-site-config.json"));
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isWebUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function normalizeComparableUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return String(value || "");
  }
}

function uniqueTargets(links) {
  const targets = new Map();

  function addTarget(target, link) {
    if (!isWebUrl(target)) return;
    if (isDynamicTarget(link, target)) return;
    if (!targets.has(target)) targets.set(target, []);
    targets.get(target).push(link);
  }

  for (const link of links) {
    const state = link.state || "permanent";
    if (!redirectableStates.has(state)) continue;

    addTarget(link.target, link);

    for (const rule of link.schedule?.rules || []) {
      addTarget(rule.target, {
        ...link,
        slug: `${link.slug} (${rule.label || "scheduled"})`,
        target: rule.target,
        scheduled: true
      });
    }
  }

  return [...targets.entries()].map(([target, links]) => ({ target, links }));
}

function isDynamicTarget(link, target) {
  return link.match === "splat" || link.scheduled === true || String(target || "").includes(":splat");
}

async function fetchWithTimeout(target, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(target, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": userAgent,
        ...options.headers
      },
      ...options
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkTarget(entry) {
  const { target, links } = entry;

  try {
    let response = await fetchWithTimeout(target, { method: "HEAD" });

    if ([403, 405, 406].includes(response.status)) {
      response = await fetchWithTimeout(target, {
        method: "GET",
        headers: {
          range: "bytes=0-0"
        }
      });
    }

    return {
      target,
      links,
      status: response.status,
      ok: response.status >= 200 && response.status < 400,
      finalUrl: response.url,
      longUrlSuggestion: longUrlSuggestion(target, response.url)
    };
  } catch (error) {
    return {
      target,
      links,
      status: "error",
      ok: false,
      error: error.name === "AbortError" ? `timeout after ${timeoutMs}ms` : error.message
    };
  }
}

function longUrlSuggestion(target, finalUrl) {
  if (!isWebUrl(target) || !isWebUrl(finalUrl)) return null;
  if (normalizeComparableUrl(target) === normalizeComparableUrl(finalUrl)) return null;

  const targetClass = classifyTargetUrl(target, policy);
  if (!longUrlCategories.has(targetClass.category)) return null;

  const finalClass = classifyTargetUrl(finalUrl, policy);
  const finalViolations = checkTargetUrl(finalUrl, policy);
  if (longUrlCategories.has(finalClass.category) || finalViolations.length) {
    return {
      category: targetClass.category,
      kind: "avoid",
      matchedDomain: targetClass.reviewDomain?.domain || targetClass.blockedDomain?.domain || targetClass.hostname,
      reason: longUrlCategories.has(finalClass.category)
        ? "replacement-is-still-short-url"
        : "replacement-violates-policy",
      url: finalUrl
    };
  }

  const replacement = normalizeReplacementUrl(target, finalUrl, siteConfig);

  return {
    category: targetClass.category,
    kind: replacement.kind,
    matchedDomain: targetClass.reviewDomain?.domain || targetClass.blockedDomain?.domain || targetClass.hostname,
    reason: replacement.reason,
    url: replacement.url
  };
}

async function runPool(entries, onResult) {
  const results = [];
  let index = 0;
  let timedOut = false;
  const deadlineAt = args.maxRuntimeMs > 0 ? Date.now() + args.maxRuntimeMs : 0;

  function hasRunTimedOut() {
    return deadlineAt > 0 && Date.now() >= deadlineAt;
  }

  async function worker() {
    while (index < entries.length) {
      if (hasRunTimedOut()) {
        timedOut = true;
        return;
      }

      const entry = entries[index];
      index += 1;
      const result = await checkTarget(entry);
      results.push(result);
      onResult?.(result);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()));

  return {
    results,
    timedOut,
    unchecked: Math.max(entries.length - index, 0)
  };
}

function createLinksEditor(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      applyBroken404() {
        return { changed: false, reason: "links-file-missing" };
      },
      applyLongUrlMigration() {
        return { changed: false, reason: "links-file-missing" };
      },
      changed: false,
      writeIfChanged() {}
    };
  }

  const editor = {
    backupWritten: false,
    changed: false,
    filePath,
    lines: fs.readFileSync(filePath, "utf8").split(/\r?\n/),
    applyBroken404(result) {
      const link = firstFixableLink(result);
      if (!link) return { changed: false, reason: "dynamic-or-missing-link" };

      const row = findSourceRow(this.lines, link.slug, result.target);
      if (!row) return { changed: false, reason: "source-row-not-found" };
      if (row.hasSchedule) return { changed: false, reason: "scheduled-row-skipped" };
      if (activeReplacementExists(this.lines, link.slug, result.target, "disabled")) {
        return { changed: false, reason: "already-disabled" };
      }

      const fields = normalizedFields(row.line);
      fields[2] = "disabled";
      fields[5] = addTags(fields[5], ["broken-404", "review"]);
      fields[8] = appendNote(fields[8], `disabled after HTTP 404 check on ${today()}`);

      this.commentAndAppend(row.index, fields.join("|"));
      return { changed: true };
    },
    applyLongUrlMigration(result) {
      const suggestion = result.longUrlSuggestion;
      if (!suggestion || suggestion.kind !== "good")
        return { changed: false, reason: suggestion?.reason || "not-good" };

      const link = firstFixableLink(result);
      if (!link) return { changed: false, reason: "dynamic-or-missing-link" };

      const row = findSourceRow(this.lines, link.slug, result.target);
      if (!row) return { changed: false, reason: "source-row-not-found" };
      if (row.hasSchedule) return { changed: false, reason: "scheduled-row-skipped" };
      if (activeReplacementExists(this.lines, link.slug, suggestion.url)) {
        return { changed: false, reason: "already-migrated" };
      }

      const fields = normalizedFields(row.line);
      fields[1] = suggestion.url;
      fields[5] = addTags(fields[5], ["migrated"]);
      fields[8] = appendNote(fields[8], `migrated from ${result.target} on ${today()}`);

      this.commentAndAppend(row.index, fields.join("|"));
      return { changed: true };
    },
    commentAndAppend(index, replacementLine) {
      this.writeBackup();
      if (!this.lines[index].trimStart().startsWith("#")) {
        this.lines[index] = `# ${this.lines[index]}`;
      }
      this.lines.push(replacementLine);
      this.changed = true;
      this.writeIfChanged();
    },
    writeBackup() {
      if (this.backupWritten) return;
      fs.copyFileSync(this.filePath, backupPath(this.filePath));
      this.backupWritten = true;
    },
    writeIfChanged() {
      if (!this.changed) return;
      fs.writeFileSync(this.filePath, `${this.lines.join("\n").replace(/\n*$/, "")}\n`);
    }
  };

  return editor;
}

function firstFixableLink(result) {
  return (result.links || []).find((link) => !isDynamicTarget(link, result.target));
}

function backupPath(filePath) {
  return /\.txt$/i.test(filePath) ? filePath.replace(/\.txt$/i, ".bak") : `${filePath}.bak`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizedFields(line) {
  const fields = line.split("|").map((field) => field.trim());
  while (fields.length < 9) fields.push("");
  return fields.slice(0, 9);
}

function normalizeSlug(value) {
  const raw = String(value || "").trim();
  const withoutSplat = raw.endsWith("/*") ? raw.slice(0, -2) : raw;
  return withoutSplat
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");
}

function findSourceRow(lines, slug, target) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("@schedule")) continue;

    const fields = normalizedFields(line);
    if (normalizeSlug(fields[0]) !== slug) continue;
    if (normalizeComparableUrl(fields[1]) !== normalizeComparableUrl(target)) continue;
    if (fields[0].trim().endsWith("/*") || fields[1].includes(":splat")) return null;

    return {
      hasSchedule: rowHasSchedule(lines, index),
      index,
      line
    };
  }

  return null;
}

function rowHasSchedule(lines, index) {
  for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
    const trimmed = lines[nextIndex].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("@schedule")) return true;
    return false;
  }
  return false;
}

function activeReplacementExists(lines, slug, target, state = "") {
  return lines.some((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("@schedule")) return false;

    const fields = normalizedFields(line);
    if (normalizeSlug(fields[0]) !== slug) return false;
    if (normalizeComparableUrl(fields[1]) !== normalizeComparableUrl(target)) return false;
    return !state || fields[2] === state;
  });
}

function addTags(value, tags) {
  const existing = String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const next = new Set(existing);
  for (const tag of tags) next.add(tag);
  return [...next].join(",");
}

function appendNote(value, note) {
  const existing = String(value || "").trim();
  return existing ? `${existing}; ${note}` : note;
}

function slugsForResult(result) {
  return (result.links || []).map((link) => link.slug).join(", ");
}

async function main() {
  if (!fs.existsSync(registryPath)) {
    usage();
    throw new Error(`Runtime link registry not found: ${registryPath}. Run npm run build first.`);
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const entries = uniqueTargets(flattenRuntimeRegistry(registry));
  const editor = createLinksEditor(args.linksPath);
  const fixSummary = {
    broken404: 0,
    longUrls: 0,
    skipped: new Map()
  };
  const pool = await runPool(entries, (result) => {
    if (args.fixLongUrls && result.ok && result.longUrlSuggestion?.kind === "good") {
      const applied = editor.applyLongUrlMigration(result);
      if (applied.changed) {
        fixSummary.longUrls += 1;
        console.log(`[fix] migrated ${slugsForResult(result)}: ${result.target} -> ${result.longUrlSuggestion.url}`);
      } else {
        incrementSkipped(fixSummary.skipped, applied.reason);
      }
    }

    if (args.fixBroken404 && result.status === 404) {
      const applied = editor.applyBroken404(result);
      if (applied.changed) {
        fixSummary.broken404 += 1;
        console.log(`[fix] disabled 404 ${slugsForResult(result)}: ${result.target}`);
      } else {
        incrementSkipped(fixSummary.skipped, applied.reason);
      }
    }
  });
  const results = pool.results;
  const broken = results.filter((result) => !result.ok).sort((a, b) => a.target.localeCompare(b.target));
  const suggestions = results
    .filter((result) => result.ok && result.longUrlSuggestion)
    .sort((a, b) => a.target.localeCompare(b.target));
  const goodSuggestions = suggestions.filter((result) => result.longUrlSuggestion.kind === "good");
  const avoidedSuggestions = suggestions.filter((result) => result.longUrlSuggestion.kind !== "good");
  const broken404 = broken.filter((result) => result.status === 404);

  console.log(`Checked ${results.length} unique active web target(s).`);
  if (pool.timedOut) {
    console.error(`Run timeout reached after ${args.maxRuntimeMs}ms. Unchecked targets: ${pool.unchecked}.`);
  }

  if (goodSuggestions.length) {
    console.log(`Good long URL suggestions: ${goodSuggestions.length}`);
    for (const result of goodSuggestions) {
      const suggestion = result.longUrlSuggestion;
      console.log(`- ${suggestion.category} (${suggestion.matchedDomain}): ${result.target}`);
      console.log(`  replace with: ${suggestion.url}`);
      console.log(`  reason: ${suggestion.reason}`);
      console.log(`  slugs: ${slugsForResult(result)}`);
    }
  } else {
    console.log("No good long URL suggestions found.");
  }

  if (avoidedSuggestions.length) {
    console.log(`Avoided long URL suggestions: ${avoidedSuggestions.length}`);
    for (const result of avoidedSuggestions) {
      const suggestion = result.longUrlSuggestion;
      console.log(`- ${suggestion.category} (${suggestion.matchedDomain}): ${result.target}`);
      console.log(`  avoided replacement: ${suggestion.url}`);
      console.log(`  reason: ${suggestion.reason}`);
      console.log(`  slugs: ${slugsForResult(result)}`);
    }
  }

  if (broken404.length) {
    console.log(`404 targets for review: ${broken404.length}`);
    for (const result of broken404) {
      console.log(`- ${result.target}`);
      console.log(`  slugs: ${slugsForResult(result)}`);
    }
  }

  if (args.fixLongUrls || args.fixBroken404) {
    console.log(
      `Fixes applied: ${fixSummary.longUrls} long URL migration(s), ${fixSummary.broken404} broken 404 disable(s).`
    );
    if (editor.backupWritten) console.log(`Backup written: ${backupPath(args.linksPath)}`);
    for (const [reason, count] of fixSummary.skipped) {
      console.log(`Skipped ${count} item(s): ${reason}`);
    }
  }

  if (!broken.length) {
    console.log("No broken targets found.");
    if (pool.timedOut) process.exitCode = 1;
    return;
  }

  console.error(`Broken or unreachable targets: ${broken.length}`);
  for (const result of broken) {
    const detail = result.error || `HTTP ${result.status}`;
    console.error(`- ${detail}: ${result.target}`);
    console.error(`  slugs: ${slugsForResult(result)}`);
  }

  process.exitCode = 1;
}

function incrementSkipped(skipped, reason) {
  const key = reason || "unknown";
  skipped.set(key, (skipped.get(key) || 0) + 1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
