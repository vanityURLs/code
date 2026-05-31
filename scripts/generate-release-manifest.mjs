#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  POLICY_SCHEMA_VERSION,
  RUNTIME_REGISTRY_SCHEMA_VERSION,
  SITE_CONFIG_SCHEMA_VERSION
} from "./lib/constants.mjs";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "build", "v8s-release-manifest.json");

const hashInputs = [
  "package.json",
  "package-lock.json",
  "wrangler.toml",
  "defaults/v8s-site-config.json",
  "defaults/v8s-links.txt",
  "defaults/v8s-policies.json",
  "defaults/v8s-blocklist-categories.json",
  "defaults/v8s-language-metadata.json",
  "defaults/legal/v8s-legal-content.json",
  "custom/v8s-site-config.json",
  "custom/v8s-links.txt",
  "custom/v8s-schedules.json",
  "custom/v8s-policies.json"
];

const hashOutputs = [
  "build/v8s.json",
  "build/v8s-blocklist.json",
  "build/v8s-site-config.json",
  "src/worker.mjs",
  "src/lib/analytics-policy.mjs"
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, filePath), "utf8"));
}

function fileHash(filePath) {
  const absolutePath = path.join(ROOT, filePath);
  if (!fs.existsSync(absolutePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
}

function hashFiles(paths) {
  return Object.fromEntries(
    paths
      .map((filePath) => [filePath, fileHash(filePath)])
      .filter(([, hash]) => hash)
      .map(([filePath, sha256]) => [filePath, { sha256 }])
  );
}

function gitCommit() {
  const headPath = path.join(ROOT, ".git", "HEAD");
  if (!fs.existsSync(headPath)) return "";

  const head = fs.readFileSync(headPath, "utf8").trim();
  if (!head.startsWith("ref: ")) return head;

  const refPath = path.join(ROOT, ".git", head.slice(5));
  return fs.existsSync(refPath) ? fs.readFileSync(refPath, "utf8").trim() : "";
}

function wranglerCompatibilityDate() {
  const wrangler = fs.existsSync(path.join(ROOT, "wrangler.toml"))
    ? fs.readFileSync(path.join(ROOT, "wrangler.toml"), "utf8")
    : "";
  return wrangler.match(/^compatibility_date\s*=\s*['"]([^'"]+)['"]/m)?.[1] || "";
}

function main() {
  const packageJson = readJson("package.json");
  const manifest = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    package: {
      name: packageJson.name,
      version: packageJson.version
    },
    git: {
      commit: gitCommit()
    },
    cloudflare: {
      compatibility_date: wranglerCompatibilityDate()
    },
    schemas: {
      runtime_registry: RUNTIME_REGISTRY_SCHEMA_VERSION,
      site_config: SITE_CONFIG_SCHEMA_VERSION,
      policy: POLICY_SCHEMA_VERSION
    },
    inputs: hashFiles(hashInputs),
    outputs: hashFiles(hashOutputs)
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main();
