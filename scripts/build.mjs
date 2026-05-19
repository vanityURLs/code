#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const BUILD_DIR = path.join(ROOT, "build");
const GENERATED_BLOCKLIST_PATH = path.join(BUILD_DIR, "blocklist.generated.json");
const RUNTIME_BLOCKLIST_PATH = path.join(BUILD_DIR, "v8s-blocklist.json");
const RUNTIME_REGISTRY_PATH = path.join(BUILD_DIR, "v8s.json");
const DEFAULTS_DIR = path.join(ROOT, "defaults");
const CUSTOM_DIR = path.join(ROOT, "custom");
const LOCAL_CONFIG_PATH = path.join(CUSTOM_DIR, "v8s-local-config.json");
const WORKER_SOURCE_DIR = path.join(ROOT, "scripts", "src");
const RUNTIME_SOURCE_DIR = path.join(ROOT, "src");

function log(message) {
  console.log(`[build] ${message}`);
}

function run(command) {
  execSync(command, {
    cwd: ROOT,
    stdio: "inherit"
  });
}

function copyDirectory(source, target) {
  fs.cpSync(source, target, {
    recursive: true,
    filter: (sourcePath) => path.basename(sourcePath) !== ".gitkeep"
  });
}

function hasCopyableFiles(directory) {
  if (!fs.existsSync(directory)) return false;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".gitkeep") continue;

    const entryPath = path.join(directory, entry.name);
    if (entry.isFile()) return true;
    if (entry.isDirectory() && hasCopyableFiles(entryPath)) return true;
  }

  return false;
}

function cleanBuild() {
  log("Cleaning build/");
  const generatedBlocklist = fs.existsSync(GENERATED_BLOCKLIST_PATH)
    ? fs.readFileSync(GENERATED_BLOCKLIST_PATH)
    : null;

  fs.rmSync(BUILD_DIR, {
    recursive: true,
    force: true
  });

  fs.mkdirSync(BUILD_DIR, {
    recursive: true
  });

  if (generatedBlocklist) {
    fs.writeFileSync(GENERATED_BLOCKLIST_PATH, generatedBlocklist);
  }
}

function copyRuntimeSource() {
  log("Copying scripts/src/ to src/");

  fs.rmSync(RUNTIME_SOURCE_DIR, {
    recursive: true,
    force: true
  });

  fs.mkdirSync(RUNTIME_SOURCE_DIR, {
    recursive: true
  });

  copyDirectory(WORKER_SOURCE_DIR, RUNTIME_SOURCE_DIR);
}

function copyPublic() {
  log("Copying defaults/public/");
  copyDirectory(path.join(DEFAULTS_DIR, "public"), BUILD_DIR);

  const customPublic = path.join(CUSTOM_DIR, "public");
  if (hasCopyableFiles(customPublic)) {
    log("Overlaying custom/public/");
    copyDirectory(customPublic, BUILD_DIR);
  }
}

function copyRuntimeBlocklist() {
  log("Building v8s-blocklist.json");

  const defaultPath = firstExistingPath(
    path.join(DEFAULTS_DIR, "v8s-policies.json"),
    path.join(DEFAULTS_DIR, "v8s-blocklist.json")
  );
  const customPath = firstExistingPath(
    path.join(CUSTOM_DIR, "v8s-policies.json"),
    path.join(CUSTOM_DIR, "v8s-blocklist.json")
  );
  const base = readJsonFile(defaultPath);
  const custom = readJsonFile(customPath);
  const merged = mergeRuntimeBlocklist(base, custom);

  fs.writeFileSync(RUNTIME_BLOCKLIST_PATH, `${JSON.stringify(merged, null, 2)}\n`);
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function firstExistingPath(...paths) {
  return paths.find((filePath) => fs.existsSync(filePath)) || paths[0];
}

function mergeRuntimeBlocklist(base, custom) {
  return {
    ...base,
    ...custom,
    defaults: {
      ...(base.defaults || {}),
      ...(custom.defaults || {}),
      allowed_protocols: mergeArray(
        base.defaults?.allowed_protocols,
        custom.defaults?.allowed_protocols
      ),
      blocked_file_extensions: mergeArray(
        base.defaults?.blocked_file_extensions,
        custom.defaults?.blocked_file_extensions
      )
    },
    generated_sources: {
      ...(base.generated_sources || {}),
      ...(custom.generated_sources || {})
    },
    allow_domains: mergeEntries(base.allow_domains, custom.allow_domains, "domain"),
    blocked_keywords: mergeEntries(base.blocked_keywords, custom.blocked_keywords, "keyword"),
    block_domains: mergeEntries(base.block_domains, custom.block_domains, "domain")
  };
}

function mergeArray(first = [], second = []) {
  return [...new Set([...asArray(first), ...asArray(second)])];
}

function mergeEntries(first = [], second = [], key) {
  const merged = new Map();

  for (const entry of [...asArray(first), ...asArray(second)]) {
    if (!entry || typeof entry !== "object") continue;
    const value = String(entry[key] || "").trim().toLowerCase();
    if (!value) continue;

    merged.set(value, {
      ...entry,
      [key]: value
    });
  }

  return [...merged.values()];
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildRedirectTargets() {
  log("Building v8s.json");

  const linksSource = fs.existsSync(path.join(CUSTOM_DIR, "v8s-links.txt"))
    ? "custom/v8s-links.txt"
    : "defaults/v8s-links.txt";
  log(`Using ${linksSource}`);
  run(`node scripts/build-redirect-targets.mjs ${linksSource} build/v8s.json`);
}

function validateRuntimeRegistry() {
  log("Validating v8s.json");

  run("node scripts/validate-registry.mjs build/v8s.json");
}

function assertNestedSlugSupport() {
  log("Checking nested alias support");

  const registryPath = path.join(BUILD_DIR, "v8s.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

  if (!Array.isArray(registry.links)) {
    throw new Error("Runtime registry must contain links[]");
  }

  const hasNested = registry.links.some((link) => {
    return typeof link.slug === "string" && link.slug.includes("/");
  });

  if (!hasNested) {
    console.warn("[build] No nested aliases detected. This is allowed.");
  }

  log("Nested alias check complete");
}

function shouldSyncHomeRegistry() {
  const localConfig = loadLocalConfig();
  if (localConfig) {
    return localConfig.shell_helper?.enabled === true;
  }

  if (process.env.V8S_SYNC_HOME === "0" || process.env.V8S_SYNC_HOME === "false") {
    return false;
  }

  if (process.env.V8S_SYNC_HOME === "1" || process.env.V8S_SYNC_HOME === "true") {
    return true;
  }

  return false;
}

function syncHomeRegistry() {
  const localConfig = loadLocalConfig();
  if (!shouldSyncHomeRegistry()) {
    log("Skipping workstation registry sync");
    return;
  }

  const homeRegistryPath = expandLocalPath(localConfig?.registry?.local_path || "~/.v8s.json");

  try {
    fs.mkdirSync(path.dirname(homeRegistryPath), { recursive: true });
    fs.copyFileSync(RUNTIME_REGISTRY_PATH, homeRegistryPath);
    log(`Copied v8s.json to ${homeRegistryPath}`);
  } catch (error) {
    if (process.env.V8S_SYNC_HOME_REQUIRED === "1" || process.env.V8S_SYNC_HOME_REQUIRED === "true") {
      throw new Error(`Unable to copy v8s.json to ${homeRegistryPath}: ${error.message}`);
    }

    console.warn(`[build] Unable to copy v8s.json to ${homeRegistryPath}: ${error.message}`);
  }
}

function loadLocalConfig() {
  if (!fs.existsSync(LOCAL_CONFIG_PATH)) return null;
  return readJsonFile(LOCAL_CONFIG_PATH);
}

function expandLocalPath(value) {
  const fallbackXdgConfig = path.join(process.env.HOME || "", ".config");
  return String(value || "")
    .replace(/^~(?=$|\/)/, process.env.HOME || "")
    .replaceAll("$HOME", process.env.HOME || "")
    .replaceAll("${HOME}", process.env.HOME || "")
    .replaceAll("$XDG_CONFIG_HOME", process.env.XDG_CONFIG_HOME || fallbackXdgConfig)
    .replaceAll("${XDG_CONFIG_HOME}", process.env.XDG_CONFIG_HOME || fallbackXdgConfig);
}

function main() {
  copyRuntimeSource();
  cleanBuild();
  copyPublic();
  copyRuntimeBlocklist();
  buildRedirectTargets();
  validateRuntimeRegistry();
  assertNestedSlugSupport();
  syncHomeRegistry();

  log("Build complete");
}

main();
