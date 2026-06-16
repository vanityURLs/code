#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { copyDirectory, hasCopyableFiles, mergeSiteConfig, supportedLanguages } from "./lib/build-assets.mjs";
import {
  analyticsDisclosureDefault,
  analyticsRetentionDefault,
  configuredBrandingCustomMode,
  configuredTimezone,
  DEFAULT_DOMAIN,
  DEFAULT_LANGUAGE,
  DEFAULT_LANGUAGES,
  defaultBrandingSlogan,
  defaultContactEmail,
  escapeRegExp,
  hasConfiguredBranding,
  hasConfiguredLegalPages,
  hasConfiguredPublicContactEmails,
  hasConfiguredSlogan,
  hasContactArgs,
  isAnalyticsDisabled,
  isFullCustomMode,
  normalizeAccessTeamDomain,
  normalizeArgs,
  normalizeDomain,
  normalizeLanguages,
  normalizeSloganMap,
  parseArgs,
  slugifyWorker,
  suggestWordmarkSplit
} from "./lib/install/core.mjs";

const ROOT = process.cwd();
const WRANGLER_PATH = path.join(ROOT, "wrangler.toml");
const CUSTOM_DIR = path.join(ROOT, "custom");
const CUSTOM_PUBLIC_DIR = path.join(CUSTOM_DIR, "public");
const CUSTOM_LINKS_PATH = path.join(CUSTOM_DIR, "v8s-links.txt");
const CUSTOM_SITE_CONFIG_PATH = path.join(CUSTOM_DIR, "v8s-site-config.json");
const DEFAULT_SITE_CONFIG_PATH = path.join(ROOT, "defaults", "v8s-site-config.json");
const DEFAULT_LINKS_PATH = path.join(ROOT, "defaults", "v8s-links.txt");
const DEFAULT_PUBLIC_DIR = path.join(ROOT, "defaults", "public");
const PROJECT_SITE_URL = "https://www.vanityURLs.link";
const PUBLIC_ASSET_VERSION = "20260601";

async function promptForMissing(args) {
  if (!process.stdin.isTTY && process.env.V8S_INTERNAL_SETUP !== "1") {
    throw new Error("Run npm run setup in an interactive terminal.");
  }
  if (!process.stdin.isTTY) return args;

  const customSiteConfig = readJson(CUSTOM_SITE_CONFIG_PATH);
  const siteConfig = loadSiteConfig();
  const wranglerConfig = loadWranglerConfig();
  const configuredLanguages = supportedLanguages(siteConfig).join(",");
  const configuredBrand = siteConfig.branding?.wordmark;
  const configuredDomain = siteConfig.branding?.domain || args.domain || wranglerConfig.routeDomain || DEFAULT_DOMAIN;
  const configuredWorkerName = args.workerName || wranglerConfig.name || slugifyWorker(configuredDomain);
  const configuredOwner = args.owner === "owner" ? inferOwnerFromLinks() || args.owner : args.owner;
  const configuredAnalytics =
    args.analytics === "disabled" ? wranglerConfig.analyticsProvider || args.analytics : args.analytics;
  const configuredAccessTeamDomain = args.accessTeamDomain || wranglerConfig.accessTeamDomain || "";
  const configuredOperator = siteConfig.operator || {};
  const customOperatorTimezone = customSiteConfig.operator?.timezone;
  const configuredBranding = siteConfig.branding || {};
  const suggested = suggestWordmarkSplit(configuredDomain);

  const rl = readline.createInterface({ input, output });
  try {
    args.domain = args.domain || (await question(rl, "Short domain", configuredDomain));
    args.workerName = await question(rl, "Worker name", configuredWorkerName);
    args.owner = await question(rl, "Owner label", configuredOwner);
    const configureAnalytics = await confirm(rl, "Configure analytics now?", !isAnalyticsDisabled(configuredAnalytics));
    args.analytics = configureAnalytics
      ? await question(
          rl,
          "Analytics provider",
          isAnalyticsDisabled(configuredAnalytics) ? "umami" : configuredAnalytics
        )
      : "disabled";
    const analyticsEnabled = !isAnalyticsDisabled(args.analytics);
    args.accessTeamDomain = await question(rl, "Cloudflare Access team domain", configuredAccessTeamDomain);
    args.languages = normalizeLanguages(
      await question(rl, "Supported languages", args.languages || configuredLanguages)
    );
    args.operatorTimezone = await question(
      rl,
      "Operator timezone (IANA name, for example America/Toronto)",
      args.operatorTimezone || configuredTimezone(configuredOperator.timezone, customOperatorTimezone != null)
    );
    args.configureLegalPages = await confirm(
      rl,
      "Configure jurisdiction and related pages?",
      configuredOperator.legal_pages_enabled !== false && hasConfiguredLegalPages(configuredOperator)
    );
    args.operatorLegalName = await question(
      rl,
      "Operator legal name",
      args.operatorLegalName || configuredOperator.legal_name || ""
    );
    args.operatorShortDomain = args.operatorShortDomain || args.domain;
    const contactArgsProvided = hasContactArgs(args);
    const reviewPublicContactEmails = await confirm(
      rl,
      "Review public contact emails for generated pages?",
      contactArgsProvided || hasConfiguredPublicContactEmails(configuredOperator)
    );
    if (reviewPublicContactEmails) {
      args.operatorDomain = await question(
        rl,
        "Operator domain for contact emails",
        args.operatorDomain || configuredOperator.operator_domain || ""
      );
    } else {
      args.operatorDomain = args.operatorDomain || configuredOperator.operator_domain || "";
    }
    const operatorEmailDomain = args.operatorDomain || args.domain;
    if (args.configureLegalPages) {
      args.operatorJurisdiction = await question(
        rl,
        "Operator jurisdiction, for example Canada",
        args.operatorJurisdiction || configuredOperator.jurisdiction || ""
      );
      args.operatorGoverningLaw = await question(
        rl,
        "Governing law",
        args.operatorGoverningLaw || configuredOperator.governing_law || args.operatorJurisdiction || ""
      );
      if (reviewPublicContactEmails) {
        args.operatorContactEmail = await question(
          rl,
          "Operator contact email",
          args.operatorContactEmail ||
            configuredOperator.contact_email ||
            defaultContactEmail("hello", operatorEmailDomain)
        );
        args.operatorPrivacyContact = await question(
          rl,
          "Privacy contact",
          args.operatorPrivacyContact ||
            configuredOperator.privacy_contact ||
            defaultContactEmail("privacy", operatorEmailDomain)
        );
      } else {
        args.operatorContactEmail =
          args.operatorContactEmail ||
          configuredOperator.contact_email ||
          defaultContactEmail("hello", operatorEmailDomain);
        args.operatorPrivacyContact =
          args.operatorPrivacyContact ||
          configuredOperator.privacy_contact ||
          defaultContactEmail("privacy", operatorEmailDomain);
      }
    } else {
      args.operatorJurisdiction = args.operatorJurisdiction || configuredOperator.jurisdiction || "";
      args.operatorGoverningLaw =
        args.operatorGoverningLaw || configuredOperator.governing_law || args.operatorJurisdiction || "";
      args.operatorContactEmail = args.operatorContactEmail || configuredOperator.contact_email || "";
      args.operatorPrivacyContact = args.operatorPrivacyContact || configuredOperator.privacy_contact || "";
    }
    if (reviewPublicContactEmails) {
      args.operatorAbuseContact = await question(
        rl,
        "Trust & Safety contact",
        args.operatorAbuseContact ||
          configuredOperator.abuse_contact ||
          defaultContactEmail("abuse", operatorEmailDomain)
      );
    } else {
      args.operatorAbuseContact =
        args.operatorAbuseContact ||
        configuredOperator.abuse_contact ||
        defaultContactEmail("abuse", operatorEmailDomain);
    }
    if (args.configureLegalPages || configuredOperator.abuse_response_window) {
      args.operatorAbuseResponseWindow = await question(
        rl,
        "Trust & Safety response window",
        args.operatorAbuseResponseWindow || configuredOperator.abuse_response_window || "5 business days"
      );
    } else {
      args.operatorAbuseResponseWindow = args.operatorAbuseResponseWindow || "5 business days";
    }
    if (reviewPublicContactEmails) {
      args.operatorSecurityContact = await question(
        rl,
        "Security contact",
        args.operatorSecurityContact ||
          configuredOperator.security_contact ||
          defaultContactEmail("security", operatorEmailDomain)
      );
    } else {
      args.operatorSecurityContact =
        args.operatorSecurityContact ||
        configuredOperator.security_contact ||
        defaultContactEmail("security", operatorEmailDomain);
    }
    if (args.configureLegalPages) {
      args.operatorLastUpdated = await question(
        rl,
        "Legal pages last updated date",
        args.operatorLastUpdated || configuredOperator.last_updated || gitLastUpdatedDate() || todayIsoDate()
      );
    } else {
      args.operatorLastUpdated =
        args.operatorLastUpdated || configuredOperator.last_updated || gitLastUpdatedDate() || todayIsoDate();
    }
    if (analyticsEnabled) {
      args.operatorAnalyticsDisclosure = await question(
        rl,
        "Analytics disclosure",
        args.operatorAnalyticsDisclosure ||
          configuredOperator.analytics_disclosure ||
          analyticsDisclosureDefault(args.analytics)
      );
      args.operatorAnalyticsRetention = await question(
        rl,
        "Analytics retention",
        args.operatorAnalyticsRetention ||
          configuredOperator.analytics_retention ||
          analyticsRetentionDefault(args.analytics)
      );
    } else {
      args.operatorAnalyticsDisclosure = args.operatorAnalyticsDisclosure || analyticsDisclosureDefault(args.analytics);
      args.operatorAnalyticsRetention = args.operatorAnalyticsRetention || "";
    }
    args.configureBranding = await confirm(rl, "Configure branding now?", hasConfiguredBranding(configuredBranding));
    if (args.configureBranding) {
      args.brandingSloganEnabled = await confirm(
        rl,
        `Add a slogan line under the domain name on your pages, such as "${defaultBrandingSlogan(args, "en")}"?`,
        hasConfiguredSlogan(configuredBranding.slogan)
      );
      if (args.brandingSloganEnabled) {
        console.log("Enter the English slogan first; setup will then ask for each additional supported language.");
      }
      args.brandingSlogans = args.brandingSloganEnabled
        ? await promptForBrandingSlogans(rl, args, configuredBranding.slogan)
        : {};
      args.wordmarkBlack = await question(
        rl,
        "Text logo first-color portion",
        args.wordmarkBlack || configuredBrand?.black || suggested.black
      );
      args.wordmarkGreen = await question(
        rl,
        "Text logo accent-color portion",
        args.wordmarkGreen || configuredBrand?.green || suggested.green
      );
      args.customizePublic = await confirm(
        rl,
        "Advanced: copy all default pages into custom/public for manual HTML editing? This is not needed for the two-color text logo.",
        false
      );
    } else {
      args.customizePublic = args.customizePublic ?? isFullCustomMode(siteConfig.branding);
      args.brandingSlogans = normalizeSloganMap(configuredBranding.slogan, args.languages, args);
    }
  } finally {
    rl.close();
  }

  return args;
}

function loadWranglerConfig() {
  if (!fs.existsSync(WRANGLER_PATH)) return {};

  const toml = fs.readFileSync(WRANGLER_PATH, "utf8");
  return {
    name: readTomlString(toml, "name"),
    routeDomain: readRouteDomain(toml),
    analyticsProvider: readTomlSectionString(toml, "vars", "ANALYTICS_PROVIDER"),
    accessTeamDomain: readTomlSectionString(toml, "vars", "CF_ACCESS_TEAM_DOMAIN")
  };
}

function readTomlString(toml, key) {
  const match = toml.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*['"]([^'"]*)['"]\\s*$`, "m"));
  return match?.[1] || "";
}

function readRouteDomain(toml) {
  const routeSection = toml.match(/\[\[routes\]\][\s\S]*?(?=\n\[|$)/);
  if (!routeSection) return "";
  return readTomlString(routeSection[0], "pattern");
}

function readTomlSectionString(toml, section, key) {
  const sectionMatch = toml.match(new RegExp(`\\[${escapeRegExp(section)}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
  if (!sectionMatch) return "";
  return readTomlString(sectionMatch[1], key);
}

function inferOwnerFromLinks() {
  if (!fs.existsSync(CUSTOM_LINKS_PATH)) return "";

  const counts = new Map();
  for (const rawLine of fs.readFileSync(CUSTOM_LINKS_PATH, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const owner = (line.split("|")[6] || "").trim();
    if (!owner) continue;
    counts.set(owner, (counts.get(owner) || 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function gitLastUpdatedDate() {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cs"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

async function promptForBrandingSlogans(rl, args, configuredSlogan) {
  const slogans = {};
  const configured = normalizeSloganMap(configuredSlogan, args.languages, args);
  for (const language of args.languages) {
    slogans[language] = await question(
      rl,
      `Brand slogan [${language}]`,
      configured[language] || defaultBrandingSlogan(args, language)
    );
  }
  return slogans;
}

async function confirm(rl, label, defaultValue) {
  const suffix = defaultValue ? "Y/n" : "y/N";
  const answer = (await rl.question(`${label} (${suffix}): `)).trim().toLowerCase();
  if (!answer) return defaultValue;
  return ["y", "yes", "true", "1"].includes(answer);
}

async function question(rl, label, defaultValue) {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = await rl.question(`${label}${suffix}: `);
  return answer.trim() || defaultValue;
}

function createCustomFiles(args) {
  fs.mkdirSync(CUSTOM_DIR, { recursive: true });

  if (!fs.existsSync(CUSTOM_LINKS_PATH) || args.force) {
    writeFile(CUSTOM_LINKS_PATH, starterLinks(args), args);
  }
}

function starterLinks(args) {
  const content = fs.readFileSync(DEFAULT_LINKS_PATH, "utf8");
  const lines = content.split(/\r?\n/).map((line) => {
    if (!line.trim() || line.startsWith("#")) return line;

    const fields = line.split("|");
    const slug = fields[0] || "";
    if (slug === "home") fields[1] = `https://${args.domain}`;
    if (fields.length > 6) fields[6] = args.owner;
    return fields.join("|");
  });

  return `${lines.join("\n").replace(/\n*$/u, "")}\n`;
}

function updateSiteConfig(args) {
  const existingSiteConfig = loadSiteConfig();
  const siteConfig = mergeSiteConfig(loadSiteConfig(), {
    i18n: {
      default_language: DEFAULT_LANGUAGE,
      supported_languages: args.languages
    },
    operator: args.operator,
    links: {
      ...(existingSiteConfig.links || {}),
      random_slug_length: args.randomSlugLength
    },
    branding: args.configureBranding
      ? {
          domain: args.domain,
          slogan: args.brandingSlogans,
          slogan_link_text: existingSiteConfig.branding?.slogan_link_text || {},
          custom_mode: configuredBrandingCustomMode(args),
          wordmark: {
            black: args.wordmarkBlack,
            green: args.wordmarkGreen
          }
        }
      : {
          ...(existingSiteConfig.branding || {}),
          domain: args.domain
        }
  });

  writeJson(CUSTOM_SITE_CONFIG_PATH, siteConfig, args);
}

function customizePublicPages(args) {
  if (!args.customizePublic) return;
  const currentSiteConfig = args.previousSiteConfig || loadSiteConfig();
  const isInstallerManaged = isFullCustomMode(currentSiteConfig.branding);

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
  rewriteHtmlFiles(CUSTOM_PUBLIC_DIR, (html, filePath) => {
    if (isProductPublicFile(filePath)) return html;
    return normalizeHtmlHead(applyBranding(html, args, languageForPublicFile(filePath)));
  });
  formatFiles(CUSTOM_PUBLIC_DIR, [".html"]);
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
      fs.writeFileSync(entryPath, transform(fs.readFileSync(entryPath, "utf8"), entryPath));
    }
  }
}

function normalizeHtmlHead(html) {
  let normalized = html;
  normalized = normalizePublicAssetVersions(normalized);

  if (!normalized.includes('rel="icon"')) {
    normalized = insertBeforeHeadClose(
      normalized,
      '    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />\n'
    );
  }

  if (!normalized.includes('rel="apple-touch-icon"')) {
    normalized = insertBeforeHeadClose(
      normalized,
      '    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />\n'
    );
  }

  normalized = replaceInlineThemeOverride(normalized);

  if (!normalized.includes("/v8s-theme.js")) {
    normalized = insertBeforeFirstStylesheet(normalized, `${THEME_OVERRIDE_SCRIPT}\n`);
  }

  return normalized;
}

function normalizePublicAssetVersions(html) {
  return html.replace(/(href=["']\/v8s-style\.css)(?:\?v=\d+)?(["'])/g, `$1?v=${PUBLIC_ASSET_VERSION}$2`);
}

function insertBeforeHeadClose(html, insertion) {
  return html.replace(/<\/head>/i, `${insertion}</head>`);
}

function insertBeforeFirstStylesheet(html, insertion) {
  if (/<link\s+[^>]*rel=["']stylesheet["'][^>]*>/i.test(html)) {
    return html.replace(/(<link\s+[^>]*rel=["']stylesheet["'][^>]*>)/i, `${insertion}$1`);
  }

  return insertBeforeHeadClose(html, insertion);
}

const THEME_OVERRIDE_SCRIPT = `    <script src="/v8s-theme.js?v=${PUBLIC_ASSET_VERSION}"></script>`;

function replaceInlineThemeOverride(html) {
  return html.replace(/\s*<script data-v8s-theme-override>[\s\S]*?<\/script>\n?/, `\n${THEME_OVERRIDE_SCRIPT}\n`);
}

function languageForPublicFile(filePath) {
  const [language] = path.relative(CUSTOM_PUBLIC_DIR, filePath).split(path.sep);
  return DEFAULT_LANGUAGES.includes(language) ? language : "en";
}

function isProductPublicFile(filePath) {
  const relative = path.relative(CUSTOM_PUBLIC_DIR, filePath).split(path.sep).join("/");
  return relative === "_stats/index.html" || relative === "_tests/index.html";
}

function applyBranding(html, args, language = "en") {
  const brandLabel = `${args.wordmarkBlack}${args.wordmarkGreen}`;
  const wordmarkSpans = `<span>${escapeHtml(args.wordmarkBlack)}</span><span>${escapeHtml(args.wordmarkGreen)}</span>`;
  const wordmark = `<h1$1>${wordmarkSpans}</h1>`;
  const slogan = renderBrandingSlogan(
    localizedSlogan(args.brandingSlogans, language),
    args.operator,
    localizedSloganLinkText(args.previousSiteConfig?.branding?.slogan_link_text, language)
  );
  const subtitle = slogan
    ? `<p class="instance-brand-subtitle">\n            ${slogan}\n          </p>`
    : `<p class="instance-brand-subtitle"></p>`;

  let brandedHtml = html
    .replace(/<h1([^>]*)><span>Vanity<\/span><span>URLs<\/span><\/h1>/g, (_match, attributes) =>
      wordmark.replace("$1", attributes)
    )
    .replace(
      /(<h1 class="instance-brand-title">\s*<a href="[^"]+" aria-label=")[^"]*("[^>]*>)[\s\S]*?(<\/a>\s*<\/h1>)/g,
      `$1${escapeHtmlAttribute(brandLabel)}$2${wordmarkSpans}$3`
    )
    .replace(/<title>([^<]*?)VanityURLs([^<]*?)<\/title>/gi, `<title>$1${escapeHtml(brandLabel)}$2</title>`)
    .replace(/aria-label="VanityURLs"/g, `aria-label="${escapeHtmlAttribute(brandLabel)}"`)
    .replace(
      /(<a class="wordmark" href=)"https:\/\/vanityurls\.link\/"/gi,
      `$1"https://${escapeHtmlAttribute(args.domain)}/"`
    )
    .replace(/(<a class="redirected-badge" href=)"https:\/\/vanityURLs\.link"/g, `$1"${PROJECT_SITE_URL}"`)
    .replace(/(<a class="redirected-badge" href=)"https:\/\/vanityurls\.link\/?"/gi, `$1"${PROJECT_SITE_URL}"`)
    .replace(/(<a class="redirected-badge"[^>]*aria-label=)"[^"]*"/g, '$1"VanityURLs"')
    .replace(/<p class="instance-brand-subtitle">[\s\S]*?<\/p>/g, subtitle);

  if (!brandedHtml.includes('class="instance-brand-subtitle"')) {
    brandedHtml = brandedHtml.replace(/(<a class="wordmark"[\s\S]*?<\/a>)/, `$1\n\n        ${subtitle}`);
  }

  return brandedHtml;
}

function renderBrandingSlogan(slogan, operator = {}, linkText = "") {
  const rendered = escapeHtml(slogan || "");
  const legalName = String(operator.legal_name || "").trim();
  const operatorDomain = normalizeDomain(operator.operator_domain || "");
  if (!rendered || !legalName || !operatorDomain) return rendered;

  const linkCandidates = [String(linkText || "").trim(), legalName].filter(Boolean);

  for (const candidate of linkCandidates) {
    const escapedText = escapeHtml(candidate);
    if (rendered.includes(escapedText)) {
      return rendered.replace(
        escapedText,
        `<a href="https://${escapeHtmlAttribute(operatorDomain)}">${escapedText}</a>`
      );
    }
  }

  return rendered;
}

function localizedSlogan(slogans, language = "en") {
  if (slogans && typeof slogans === "object" && !Array.isArray(slogans)) {
    return slogans[language] || slogans.en || "";
  }
  return String(slogans || "");
}

function localizedSloganLinkText(linkTexts, language = "en") {
  if (linkTexts && typeof linkTexts === "object" && !Array.isArray(linkTexts)) {
    return linkTexts[language] || linkTexts.en || "";
  }
  return String(linkTexts || "");
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
  fs.writeFileSync(filePath, formatJson(`${JSON.stringify(removeUndefined(value), null, 2)}\n`));
}

function formatFiles(directory, extensions) {
  const prettierBin = path.join(
    ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prettier.cmd" : "prettier"
  );
  if (!fs.existsSync(prettierBin)) return;

  const files = listFiles(directory).filter((filePath) => extensions.includes(path.extname(filePath)));
  if (!files.length) return;

  try {
    execFileSync(prettierBin, ["--write", ...files], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    // Let the final verification step show the actionable formatting error.
  }
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    return entry.isFile() ? [entryPath] : [];
  });
}

function formatJson(text) {
  const prettierBin = path.join(
    ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prettier.cmd" : "prettier"
  );
  if (!fs.existsSync(prettierBin)) return text;

  try {
    return execFileSync(prettierBin, ["--parser", "json"], {
      cwd: ROOT,
      input: text,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"]
    });
  } catch {
    return text;
  }
}

function loadSiteConfig() {
  const defaultConfig = readJson(DEFAULT_SITE_CONFIG_PATH);
  const customConfig = readJson(CUSTOM_SITE_CONFIG_PATH);
  return mergeSiteConfig(defaultConfig, customConfig);
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

  writeFile(WRANGLER_PATH, `${toml.trimEnd()}\n`, args);
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
  let next = toml.replace(/^(\s*pattern\s*=\s*)['"].*?['"]\s*$/m, `$1"${domain}"`);
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

function writeFile(filePath, content, args) {
  if (args.dryRun) {
    console.log(`[dry-run] would write ${path.relative(ROOT, filePath)}`);
    return;
  }

  fs.writeFileSync(filePath, content);
}

function runCheck(args) {
  if (!args.check || args.dryRun) return;

  if (
    !fs.existsSync(path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "prettier.cmd" : "prettier"))
  ) {
    console.log("\nSkipped verification because dependencies are not installed yet.");
    console.log("Run npm install, then run npm run setup again.");
    return;
  }

  try {
    execFileSync("npm", ["run", "check"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    console.log("\nVerified local build, formatting, lint, and tests.");
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean)
      .join("\n\n");
    if (output) console.error(output);
    throw new Error("Verification failed. Fix the issue above, then rerun npm run setup.");
  }
}

function printNextSteps(args) {
  console.log(`\nSetup complete for ${args.domain}.`);
  console.log("\nNext steps:");
  console.log("- Review the starter link list with ./scripts/v8s-lnk list");
  console.log("- Continue Quickstart: https://www.vanityurls.link/en/docs/setup/quickstart/#install-local-helpers");
}

async function main() {
  const args = normalizeArgs(await promptForMissing(parseArgs(process.argv.slice(2))), {
    defaultRandomSlugLength: loadSiteConfig().links?.random_slug_length,
    fallbackLastUpdated: gitLastUpdatedDate() || todayIsoDate()
  });
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
