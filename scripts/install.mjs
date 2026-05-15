#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ROOT = process.cwd();
const WRANGLER_PATH = path.join(ROOT, "wrangler.toml");
const CUSTOM_DIR = path.join(ROOT, "custom");
const CUSTOM_PUBLIC_DIR = path.join(CUSTOM_DIR, "public");
const CUSTOM_LINKS_PATH = path.join(CUSTOM_DIR, "v8s-links.txt");
const DEFAULT_DOMAIN = "v8s.link";

function parseArgs(argv) {
  const args = {
    analytics: "disabled",
    check: true,
    dryRun: false,
    force: false,
    owner: "owner"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--no-check") {
      args.check = false;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      args[key] = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

async function promptForMissing(args) {
  if (args.domain) return args;
  if (!process.stdin.isTTY) {
    throw new Error("Missing --domain. Run interactively or pass --domain example.com.");
  }

  const rl = readline.createInterface({ input, output });
  try {
    args.domain = await rl.question(`Short domain (${DEFAULT_DOMAIN}): `) || DEFAULT_DOMAIN;
    args.workerName = await rl.question(`Worker name (${slugifyWorker(args.domain)}): `) || slugifyWorker(args.domain);
    args.owner = await rl.question(`Owner label (${args.owner}): `) || args.owner;
    args.analytics = await rl.question("Analytics provider (disabled, umami, fathom, umami,fathom): ") || args.analytics;
    args.accessTeamDomain = await rl.question("Cloudflare Access team domain (optional): ") || "";
  } finally {
    rl.close();
  }

  return args;
}

function normalizeArgs(args) {
  args.domain = normalizeDomain(args.domain);
  args.workerName = args.workerName ? slugifyWorker(args.workerName) : slugifyWorker(args.domain);
  args.analytics = normalizeAnalyticsProviders(args.analytics);
  args.owner = slugifyOwner(args.owner);

  if (!args.domain) throw new Error("Domain cannot be empty.");
  if (!args.workerName) throw new Error("Worker name cannot be empty.");

  return args;
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/g, "")
    .toLowerCase();
}

function slugifyWorker(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugifyOwner(value) {
  return String(value || "owner")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "owner";
}

function normalizeAnalyticsProviders(value) {
  const providers = String(value || "disabled")
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);

  if (!providers.length) return "disabled";

  const allowed = new Set(["disabled", "none", "off", "umami", "fathom"]);
  for (const provider of providers) {
    if (!allowed.has(provider)) throw new Error(`Unsupported analytics provider: ${provider}`);
  }

  return providers.join(",");
}

function createCustomFiles(args) {
  fs.mkdirSync(CUSTOM_DIR, { recursive: true });
  fs.mkdirSync(CUSTOM_PUBLIC_DIR, { recursive: true });

  if (!fs.existsSync(CUSTOM_LINKS_PATH) || args.force) {
    const mainSite = `https://${args.domain}`;
    const content = [
      "# slug|target|state|title|description|tags|owner|expires_at|notes",
      `home|${mainSite}|permanent|Home|Primary website|core|${args.owner}||`,
      `status|https://status.${args.domain}|ephemeral|Status|Service status page|status|${args.owner}||`,
      `docs|https://vanityURLs.link/en/docs/|permanent|Docs|vanityURLs documentation|docs|${args.owner}||`,
      ""
    ].join("\n");

    writeFile(CUSTOM_LINKS_PATH, content, args);
  }
}

function updateWrangler(args) {
  let toml = fs.readFileSync(WRANGLER_PATH, "utf8");

  toml = setTopLevelString(toml, "name", args.workerName);
  toml = setTopLevelBoolean(toml, "workers_dev", false);
  toml = setTopLevelBoolean(toml, "preview_urls", false);
  toml = setRouteDomain(toml, args.domain);
  toml = setSectionString(toml, "vars", "ANALYTICS_PROVIDER", args.analytics);

  if (args.analytics.includes("umami")) {
    toml = setSectionString(toml, "vars", "UMAMI_GEO_IP_MODE", args.umamiGeoIpMode || "truncated");
    if (args.umamiEndpoint) toml = setSectionString(toml, "vars", "UMAMI_ENDPOINT", args.umamiEndpoint);
    if (args.umamiWebsiteId) toml = setSectionString(toml, "vars", "UMAMI_WEBSITE_ID", args.umamiWebsiteId);
  }

  if (args.analytics.includes("fathom")) {
    if (args.fathomSiteId) toml = setSectionString(toml, "vars", "FATHOM_SITE_ID", args.fathomSiteId);
    toml = setSectionString(toml, "vars", "FATHOM_ENDPOINT", args.fathomEndpoint || "https://cdn.usefathom.com/");
  }

  if (args.accessTeamDomain) {
    toml = setSectionString(toml, "vars", "CF_ACCESS_TEAM_DOMAIN", normalizeAccessTeamDomain(args.accessTeamDomain));
  }

  writeFile(WRANGLER_PATH, toml, args);
}

function setTopLevelString(toml, key, value) {
  const re = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*['"].*?['"]\\s*$`, "m");
  return toml.replace(re, `${key} = '${value}'`);
}

function setTopLevelBoolean(toml, key, value) {
  const re = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*(true|false)\\s*$`, "m");
  const line = `${key} = ${value ? "true" : "false"}`;
  return re.test(toml) ? toml.replace(re, line) : `${toml.trimEnd()}\n${line}\n`;
}

function setRouteDomain(toml, domain) {
  let next = toml.replace(/(\[\[routes\]\][\s\S]*?pattern\s*=\s*)['"].*?['"]/, `$1"${domain}"`);
  next = next.replace(/(\[\[routes\]\][\s\S]*?custom_domain\s*=\s*)(true|false)/, "$1true");
  return next;
}

function setSectionString(toml, section, key, value) {
  const header = `[${section}]`;
  const sectionStart = toml.indexOf(header);
  if (sectionStart < 0) {
    return `${toml.trimEnd()}\n\n${header}\n${key} = '${value}'\n`;
  }

  const nextSection = toml.slice(sectionStart + header.length).search(/\n\[/);
  const sectionEnd = nextSection < 0 ? toml.length : sectionStart + header.length + nextSection;
  const before = toml.slice(0, sectionStart);
  const body = toml.slice(sectionStart, sectionEnd);
  const after = toml.slice(sectionEnd);
  const re = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*['"].*?['"]\\s*$`, "m");
  const line = `${key} = '${value}'`;
  const nextBody = re.test(body) ? body.replace(re, line) : `${body.trimEnd()}\n${line}\n`;

  return `${before}${nextBody}${after}`;
}

function normalizeAccessTeamDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/g, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function writeFile(filePath, content, args) {
  if (args.dryRun) {
    console.log(`[dry-run] would write ${path.relative(ROOT, filePath)}`);
    return;
  }

  fs.writeFileSync(filePath, content);
}

function runCheck(args) {
  if (!args.check || args.dryRun) return;
  execFileSync("npm", ["run", "check"], {
    cwd: ROOT,
    stdio: "inherit"
  });
}

function printNextSteps(args) {
  console.log(`\nConfigured ${args.workerName} for ${args.domain}.`);
  console.log("\nRecommended Cloudflare settings:");
  console.log("- Add the Worker Custom Domain for the root hostname.");
  console.log("- Keep workers.dev and preview URLs disabled for production.");
  console.log("- Protect /_stats/* and /_tests/* with Cloudflare Access.");
  console.log("- Enable Workers Logs and keep Development Mode off.");

  const secretCommands = [];

  if (args.analytics.includes("umami") && !args.umamiWebsiteId) {
    secretCommands.push("npx wrangler secret put UMAMI_WEBSITE_ID --config wrangler.toml");
  }

  if (args.accessTeamDomain) {
    secretCommands.push("npx wrangler secret put CF_ACCESS_AUD --config wrangler.toml");
  }

  if (secretCommands.length) {
    console.log("\nAdd required secrets:");
    for (const command of secretCommands) console.log(`  ${command}`);
  }

  console.log("\nDeploy when ready:");
  console.log("  npm run deploy");
}

async function main() {
  const args = normalizeArgs(await promptForMissing(parseArgs(process.argv.slice(2))));

  createCustomFiles(args);
  updateWrangler(args);
  runCheck(args);
  printNextSteps(args);
}

main().catch((error) => {
  console.error(`install failed: ${error.message}`);
  process.exit(1);
});
