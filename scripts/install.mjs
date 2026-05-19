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
const CUSTOM_SITE_CONFIG_PATH = path.join(CUSTOM_DIR, "v8s-site-config.json");
const DEFAULT_SITE_CONFIG_PATH = path.join(ROOT, "defaults", "v8s-site-config.json");
const DEFAULT_PUBLIC_DIR = path.join(ROOT, "defaults", "public");
const DEFAULT_DOMAIN = "v8s.link";
const DEFAULT_LANGUAGES = ["en", "fr", "es", "it", "de"];

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
    } else if (arg === "--customize-public") {
      args.customizePublic = true;
    } else if (arg === "--no-customize-public") {
      args.customizePublic = false;
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
  if (!process.stdin.isTTY && !args.domain) {
    throw new Error("Missing --domain. Run interactively or pass --domain example.com.");
  }
  if (!process.stdin.isTTY) return args;

  const siteConfig = loadSiteConfig();
  const configuredLanguages = supportedLanguages(siteConfig).join(",");
  const configuredBrand = siteConfig.branding?.wordmark;
  const configuredDomain = siteConfig.branding?.domain || args.domain || DEFAULT_DOMAIN;
  const suggested = suggestWordmarkSplit(configuredDomain);

  const rl = readline.createInterface({ input, output });
  try {
    args.domain = args.domain || await question(rl, "Short domain", configuredDomain);
    args.workerName = await rl.question(`Worker name (${slugifyWorker(args.domain)}): `) || slugifyWorker(args.domain);
    args.owner = await rl.question(`Owner label (${args.owner}): `) || args.owner;
    args.analytics = await rl.question("Analytics provider (disabled, umami, fathom, umami,fathom): ") || args.analytics;
    args.accessTeamDomain = await rl.question("Cloudflare Access team domain (optional): ") || "";
    args.languages = await question(rl, "Supported languages", args.languages || configuredLanguages);
    args.customizePublic = await confirm(rl, "Copy default web pages to custom/public with a split-color domain wordmark?", siteConfig.branding?.custom_public !== false);

    if (args.customizePublic) {
      args.wordmarkBlack = await question(rl, "Black wordmark portion", args.wordmarkBlack || configuredBrand?.black || suggested.black);
      args.wordmarkGreen = await question(rl, "Green wordmark portion", args.wordmarkGreen || configuredBrand?.green || suggested.green);
    }
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
  args.languages = normalizeLanguages(args.languages);
  args.customizePublic = normalizeBoolean(args.customizePublic);

  if (!args.domain) throw new Error("Domain cannot be empty.");
  if (!args.workerName) throw new Error("Worker name cannot be empty.");
  if (args.customizePublic) {
    const split = normalizeWordmarkSplit(args);
    args.wordmarkBlack = split.black;
    args.wordmarkGreen = split.green;
  }

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

function normalizeLanguages(value) {
  const languages = String(value || DEFAULT_LANGUAGES.join(","))
    .split(",")
    .map((language) => language.trim().toLowerCase().split("-")[0])
    .filter(Boolean);
  const unique = [...new Set(languages)];
  return unique.includes("en") ? unique : ["en", ...unique];
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return false;
  return ["1", "true", "yes", "y", "on"].includes(String(value).trim().toLowerCase());
}

function normalizeWordmarkSplit(args) {
  const suggested = suggestWordmarkSplit(args.domain);
  return {
    black: String(args.wordmarkBlack || suggested.black).trim(),
    green: String(args.wordmarkGreen || suggested.green).trim()
  };
}

function suggestWordmarkSplit(domain) {
  const normalized = normalizeDomain(domain);
  const parts = normalized.split(".").filter(Boolean);
  if (parts.length < 2) return { black: normalized, green: "" };

  return {
    black: `${parts.slice(0, -1).join(".")}.`,
    green: parts.at(-1)
  };
}

async function confirm(rl, label, defaultValue) {
  const suffix = defaultValue ? "Y/n" : "y/N";
  const answer = (await rl.question(`${label} (${suffix}): `)).trim().toLowerCase();
  if (!answer) return defaultValue;
  return ["y", "yes", "true", "1"].includes(answer);
}

async function question(rl, label, defaultValue) {
  const answer = await rl.question(`${label} (${defaultValue}): `);
  return answer.trim() || defaultValue;
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

function updateSiteConfig(args) {
  const siteConfig = mergeSiteConfig(loadSiteConfig(), {
    i18n: {
      default_language: args.languages[0] || "en",
      supported_languages: args.languages
    },
    branding: {
      domain: args.domain,
      custom_public: args.customizePublic === true,
      wordmark: args.customizePublic
        ? {
          black: args.wordmarkBlack,
          green: args.wordmarkGreen
        }
        : undefined
    }
  });

  writeJson(CUSTOM_SITE_CONFIG_PATH, siteConfig, args);
}

function customizePublicPages(args) {
  if (!args.customizePublic) return;
  const currentSiteConfig = args.previousSiteConfig || loadSiteConfig();
  const isInstallerManaged = currentSiteConfig.branding?.custom_public === true;

  if (hasCopyableFiles(CUSTOM_PUBLIC_DIR) && !isInstallerManaged && !args.force) {
    throw new Error("custom/public already contains files. Rerun with --force to replace them with branded defaults.");
  }

  if (args.dryRun) {
    console.log("[dry-run] would copy defaults/public/ to custom/public/ and apply the configured wordmark");
    return;
  }

  fs.rmSync(CUSTOM_PUBLIC_DIR, { recursive: true, force: true });
  copyDirectory(DEFAULT_PUBLIC_DIR, CUSTOM_PUBLIC_DIR);
  pruneUnsupportedLanguageDirs(CUSTOM_PUBLIC_DIR, args.languages);
  rewriteHtmlFiles(CUSTOM_PUBLIC_DIR, (html) => applyBranding(html, args));
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

function pruneUnsupportedLanguageDirs(publicDir, languages) {
  const supported = new Set(languages);
  for (const language of DEFAULT_LANGUAGES) {
    if (language === "en" || supported.has(language)) continue;

    fs.rmSync(path.join(publicDir, language), {
      recursive: true,
      force: true
    });
  }
}

function rewriteHtmlFiles(directory, transform) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      rewriteHtmlFiles(entryPath, transform);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      fs.writeFileSync(entryPath, transform(fs.readFileSync(entryPath, "utf8")));
    }
  }
}

function applyBranding(html, args) {
  const brandLabel = `${args.wordmarkBlack}${args.wordmarkGreen}`;
  const wordmark = `<h1$1><span>${escapeHtml(args.wordmarkBlack)}</span><span>${escapeHtml(args.wordmarkGreen)}</span></h1>`;

  return html
    .replace(/<h1([^>]*)><span>Vanity<\/span><span>URLs<\/span><\/h1>/g, (_match, attributes) => wordmark.replace("$1", attributes))
    .replace(/aria-label="VanityURLs"/g, `aria-label="${escapeHtmlAttribute(brandLabel)}"`)
    .replace(/href="https:\/\/vanityurls\.link\/"/gi, `href="https://${escapeHtmlAttribute(args.domain)}/"`)
    .replace(/href="https:\/\/vanityURLs\.link"/g, `href="https://${escapeHtmlAttribute(args.domain)}"`);
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value, args) {
  if (args.dryRun) {
    console.log(`[dry-run] would write ${path.relative(ROOT, filePath)}`);
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(removeUndefined(value), null, 2)}\n`);
}

function loadSiteConfig() {
  const defaultConfig = readJson(DEFAULT_SITE_CONFIG_PATH);
  const customConfig = readJson(CUSTOM_SITE_CONFIG_PATH);
  return mergeSiteConfig(defaultConfig, customConfig);
}

function mergeSiteConfig(base, custom) {
  const baseBranding = base.branding || {};
  const customBranding = custom.branding || {};
  const branding = {
    ...baseBranding,
    ...customBranding
  };
  if (baseBranding.wordmark || customBranding.wordmark) {
    branding.wordmark = {
      ...(baseBranding.wordmark || {}),
      ...(customBranding.wordmark || {})
    };
  }

  return {
    ...base,
    ...custom,
    i18n: {
      ...(base.i18n || {}),
      ...(custom.i18n || {})
    },
    branding
  };
}

function supportedLanguages(siteConfig) {
  return normalizeLanguages(siteConfig?.i18n?.supported_languages?.join(","));
}

function removeUndefined(value) {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, removeUndefined(entryValue)])
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value);
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
  args.previousSiteConfig = loadSiteConfig();

  createCustomFiles(args);
  customizePublicPages(args);
  updateSiteConfig(args);
  updateWrangler(args);
  runCheck(args);
  printNextSteps(args);
}

main().catch((error) => {
  console.error(`install failed: ${error.message}`);
  process.exit(1);
});
