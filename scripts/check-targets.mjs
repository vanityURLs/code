#!/usr/bin/env node

import fs from "node:fs";

const registryPath = process.argv[2] || "build/v8s.json";
const timeoutMs = Number(process.env.V8S_TARGET_TIMEOUT_MS || 8000);
const concurrency = Number(process.env.V8S_TARGET_CONCURRENCY || 8);
const redirectableStates = new Set(["permanent", "ephemeral"]);
const userAgent = "Mozilla/5.0 (compatible; VanityURLs-LinkChecker/1.0; +https://vanityURLs.link)";

function usage() {
  console.error("Usage: node scripts/check-targets.mjs [build/v8s.json]");
}

function isWebUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function uniqueTargets(links) {
  const targets = new Map();

  function addTarget(target, slug) {
    if (!isWebUrl(target)) return;
    if (!targets.has(target)) targets.set(target, []);
    targets.get(target).push(slug);
  }

  for (const link of links) {
    const state = link.state || "permanent";
    if (!redirectableStates.has(state)) continue;

    addTarget(link.target, link.slug);

    for (const rule of link.schedule?.rules || []) {
      addTarget(rule.target, `${link.slug} (${rule.label || "scheduled"})`);
    }
  }

  return [...targets.entries()].map(([target, slugs]) => ({ target, slugs }));
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
  const { target, slugs } = entry;

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
      slugs,
      status: response.status,
      ok: response.status >= 200 && response.status < 400,
      finalUrl: response.url
    };
  } catch (error) {
    return {
      target,
      slugs,
      status: "error",
      ok: false,
      error: error.name === "AbortError" ? `timeout after ${timeoutMs}ms` : error.message
    };
  }
}

async function runPool(entries) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < entries.length) {
      const entry = entries[index];
      index += 1;
      results.push(await checkTarget(entry));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()));

  return results;
}

async function main() {
  if (!fs.existsSync(registryPath)) {
    usage();
    throw new Error(`Registry not found: ${registryPath}. Run npm run build first.`);
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (!Array.isArray(registry.links)) {
    throw new Error("Registry must contain links[]");
  }

  const entries = uniqueTargets(registry.links);
  const results = await runPool(entries);
  const broken = results.filter((result) => !result.ok).sort((a, b) => a.target.localeCompare(b.target));

  console.log(`Checked ${results.length} unique active web target(s).`);

  if (!broken.length) {
    console.log("No broken targets found.");
    return;
  }

  console.error(`Broken or unreachable targets: ${broken.length}`);
  for (const result of broken) {
    const detail = result.error || `HTTP ${result.status}`;
    console.error(`- ${detail}: ${result.target}`);
    console.error(`  slugs: ${result.slugs.join(", ")}`);
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
