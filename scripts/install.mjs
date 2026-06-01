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
const DEFAULT_LINKS_PATH = path.join(ROOT, "defaults", "v8s-links.txt");
const DEFAULT_PUBLIC_DIR = path.join(ROOT, "defaults", "public");
const DEFAULT_DOMAIN = "v8s.link";
const DEFAULT_LANGUAGE = "en";
const DEFAULT_LANGUAGES = ["en", "de", "es", "fr", "it"];
const DEFAULT_RANDOM_SLUG_LENGTH = 3;
const DEFAULT_OPERATOR_TIMEZONE = "UTC";
const MAX_RANDOM_SLUG_LENGTH = 64;
const MAX_WORKER_NAME_LENGTH = 63;
const PROJECT_SITE_URL = "https://www.vanityURLs.link";

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

  const customSiteConfig = readJson(CUSTOM_SITE_CONFIG_PATH);
  const siteConfig = loadSiteConfig();
  const wranglerConfig = loadWranglerConfig();
  const configuredLanguages = supportedLanguages(siteConfig).join(",");
  const configuredBrand = siteConfig.branding?.wordmark;
  const configuredDomain = siteConfig.branding?.domain || args.domain || wranglerConfig.routeDomain || DEFAULT_DOMAIN;
  const configuredWorkerName = args.workerName || wranglerConfig.name || slugifyWorker(configuredDomain);
  const configuredOwner = args.owner === "owner" ? inferOwnerFromLinks() || args.owner : args.owner;
  const configuredRandomSlugLength =
    args.randomSlugLength || siteConfig.links?.random_slug_length || DEFAULT_RANDOM_SLUG_LENGTH;
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
    args.randomSlugLength = await question(rl, "Random slug length", configuredRandomSlugLength);
    args.analytics = await question(rl, "Analytics provider", configuredAnalytics);
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
      "Configure jurisdiction, privacy, terms, and security pages now?",
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
      args.customizePublic = await confirm(
        rl,
        "Copy default web pages to custom/public with a split-color domain wordmark?",
        siteConfig.branding?.custom_public !== false
      );
      args.wordmarkBlack = await question(
        rl,
        "Black wordmark portion",
        args.wordmarkBlack || configuredBrand?.black || suggested.black
      );
      args.wordmarkGreen = await question(
        rl,
        "Green wordmark portion",
        args.wordmarkGreen || configuredBrand?.green || suggested.green
      );
    } else {
      args.customizePublic = args.customizePublic ?? siteConfig.branding?.custom_public === true;
      args.brandingSlogans = normalizeSloganMap(configuredBranding.slogan, args.languages, args);
    }
  } finally {
    rl.close();
  }

  return args;
}

function normalizeArgs(args) {
  args.domain = normalizeDomain(args.domain);
  if (!args.operatorShortDomain) args.operatorShortDomain = args.domain;
  args.workerName = args.workerName ? slugifyWorker(args.workerName) : slugifyWorker(args.domain);
  args.analytics = normalizeAnalyticsProviders(args.analytics);
  args.owner = slugifyOwner(args.owner);
  args.randomSlugLength = normalizeRandomSlugLength(args.randomSlugLength || DEFAULT_RANDOM_SLUG_LENGTH);
  args.languages = normalizeLanguages(args.languages);
  args.configureBranding =
    args.configureBranding ??
    (args.customizePublic != null ||
      args.brandingSlogan != null ||
      args.brandingSlogans != null ||
      args.wordmarkBlack != null ||
      args.wordmarkGreen != null);
  args.configureBranding = normalizeBoolean(args.configureBranding);
  args.customizePublic = normalizeBoolean(args.customizePublic);
  args.brandingSlogans = normalizeSloganMap(args.brandingSlogans ?? args.brandingSlogan, args.languages, args);
  args.operator = normalizeOperator(args);

  if (!args.domain) throw new Error("Domain cannot be empty.");
  if (!args.workerName) throw new Error("Worker name cannot be empty.");
  validateWorkerName(args.workerName);
  validateOperator(args.operator);
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
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_WORKER_NAME_LENGTH)
    .replace(/-+$/g, "");
}

function validateWorkerName(value) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
    throw new Error(
      "Worker name must use lowercase letters, numbers, and hyphens; it must start and end with a letter or number."
    );
  }
}

function slugifyOwner(value) {
  return (
    String(value || "owner")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "owner"
  );
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

function normalizeRandomSlugLength(value) {
  const number = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(number) || number < 1 || number > MAX_RANDOM_SLUG_LENGTH) {
    throw new Error(`Random slug length must be an integer from 1 to ${MAX_RANDOM_SLUG_LENGTH}.`);
  }
  return number;
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

function normalizeLanguages(value) {
  const languages = String(value || DEFAULT_LANGUAGES.join(","))
    .split(",")
    .map((language) => language.trim().toLowerCase().split("-")[0])
    .filter(Boolean);
  const unique = [...new Set(languages)];
  const ordered = unique.includes(DEFAULT_LANGUAGE) ? unique : [DEFAULT_LANGUAGE, ...unique];
  return [DEFAULT_LANGUAGE, ...ordered.filter((language) => language !== DEFAULT_LANGUAGE)];
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return false;
  return ["1", "true", "yes", "y", "on"].includes(String(value).trim().toLowerCase());
}

function isAnalyticsDisabled(value) {
  const providers = String(value || "disabled")
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
  return !providers.length || providers.some((provider) => ["disabled", "none", "off"].includes(provider));
}

function defaultContactEmail(localPart, domain) {
  const normalizedDomain = normalizeDomain(domain);
  return normalizedDomain ? `${localPart}@${normalizedDomain}` : "";
}

function normalizeWordmarkSplit(args) {
  const suggested = suggestWordmarkSplit(args.domain);
  return {
    black: String(args.wordmarkBlack || suggested.black).trim(),
    green: String(args.wordmarkGreen || suggested.green).trim()
  };
}

function normalizeOperator(args) {
  const operatorDomain = normalizeDomain(args.operatorDomain || "");
  const emailDomain = operatorDomain || args.domain;
  const contactEmail = String(args.operatorContactEmail || defaultContactEmail("hello", emailDomain)).trim();
  const privacyContact = String(args.operatorPrivacyContact || defaultContactEmail("privacy", emailDomain)).trim();
  const abuseContact = String(args.operatorAbuseContact || defaultContactEmail("abuse", emailDomain)).trim();
  const securityContact = String(args.operatorSecurityContact || defaultContactEmail("security", emailDomain)).trim();

  return {
    legal_name: String(args.operatorLegalName || "").trim(),
    short_domain: normalizeDomain(args.operatorShortDomain || args.domain),
    operator_domain: operatorDomain,
    jurisdiction: String(args.operatorJurisdiction || "").trim(),
    governing_law: String(args.operatorGoverningLaw || args.operatorJurisdiction || "").trim(),
    contact_email: contactEmail,
    privacy_contact: privacyContact,
    abuse_contact: abuseContact,
    security_contact: securityContact,
    timezone: normalizeTimezone(args.operatorTimezone || DEFAULT_OPERATOR_TIMEZONE),
    last_updated: String(args.operatorLastUpdated || gitLastUpdatedDate() || todayIsoDate()).trim(),
    analytics_disclosure: String(args.operatorAnalyticsDisclosure || analyticsDisclosureDefault(args.analytics)).trim(),
    analytics_retention: String(args.operatorAnalyticsRetention || analyticsRetentionDefault(args.analytics)).trim(),
    abuse_response_window: String(args.operatorAbuseResponseWindow || "5 business days").trim(),
    legal_pages_enabled: args.configureLegalPages === true
  };
}

function hasConfiguredLegalPages(operator) {
  return Boolean(
    String(operator?.jurisdiction || "").trim() &&
    String(operator?.governing_law || "").trim() &&
    String(operator?.contact_email || "").trim() &&
    String(operator?.privacy_contact || "").trim()
  );
}

function hasConfiguredPublicContactEmails(operator) {
  return Boolean(
    String(operator?.operator_domain || "").trim() ||
    String(operator?.contact_email || "").trim() ||
    String(operator?.privacy_contact || "").trim() ||
    String(operator?.abuse_contact || "").trim() ||
    String(operator?.security_contact || "").trim()
  );
}

function hasContactArgs(args) {
  return Boolean(
    String(args.operatorDomain || "").trim() ||
    String(args.operatorContactEmail || "").trim() ||
    String(args.operatorPrivacyContact || "").trim() ||
    String(args.operatorAbuseContact || "").trim() ||
    String(args.operatorSecurityContact || "").trim()
  );
}

function validateOperator(operator) {
  const required =
    operator.legal_pages_enabled === true
      ? [
          "legal_name",
          "short_domain",
          "jurisdiction",
          "governing_law",
          "contact_email",
          "privacy_contact",
          "abuse_contact",
          "security_contact",
          "last_updated",
          "analytics_disclosure",
          "abuse_response_window"
        ]
      : ["short_domain", "abuse_contact", "security_contact", "last_updated", "abuse_response_window"];
  const missing = required.filter((field) => !String(operator[field] || "").trim());
  const emailFields =
    operator.legal_pages_enabled === true
      ? ["contact_email", "privacy_contact", "abuse_contact", "security_contact"]
      : ["abuse_contact", "security_contact"];
  const invalidEmails = emailFields.filter((field) => !isEmail(operator[field]));
  const invalidDate = /^\d{4}-\d{2}-\d{2}$/.test(String(operator.last_updated || "")) ? [] : ["last_updated"];
  const invalidTimezone = isValidTimezone(operator.timezone) ? [] : ["timezone"];
  const issues = [...new Set([...missing, ...invalidEmails, ...invalidDate, ...invalidTimezone])];

  if (issues.length) {
    throw new Error(`Operator configuration needs valid values for: ${issues.join(", ")}`);
  }
}

function isEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || ""));
}

function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_OPERATOR_TIMEZONE;
}

function configuredTimezone(value, isStoredValue = false) {
  const timezone = String(value || "").trim();
  if (isStoredValue) return timezone || DEFAULT_OPERATOR_TIMEZONE;
  if (!timezone || timezone === DEFAULT_OPERATOR_TIMEZONE) return localTimezone();
  return timezone;
}

function normalizeTimezone(value) {
  const timezone = String(value || "").trim() || DEFAULT_OPERATOR_TIMEZONE;
  if (isValidTimezone(timezone)) return timezone;
  throw new Error(
    `Operator timezone must be an IANA timezone name such as America/Toronto, not an offset such as ${timezone}. IANA timezones handle daylight saving time automatically.`
  );
}

function isValidTimezone(value) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
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

function analyticsDisclosureDefault(providers) {
  const normalized = String(providers || "disabled").toLowerCase();
  return normalized === "disabled" || normalized.includes("none") || normalized.includes("off")
    ? "No analytics enabled."
    : "Privacy-respecting analytics are configured for operations, security, and reliability.";
}

function analyticsRetentionDefault(providers) {
  const normalized = String(providers || "disabled").toLowerCase();
  return normalized === "disabled" || normalized.includes("none") || normalized.includes("off") ? "" : "180 days";
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

function hasConfiguredBranding(branding) {
  return Boolean(
    branding?.custom_public === true ||
    hasConfiguredSlogan(branding?.slogan) ||
    String(branding?.wordmark?.black || "").trim() ||
    String(branding?.wordmark?.green || "").trim()
  );
}

function hasConfiguredSlogan(slogan) {
  if (slogan && typeof slogan === "object" && !Array.isArray(slogan)) {
    return Object.values(slogan).some((value) => String(value || "").trim());
  }
  return Boolean(String(slogan || "").trim());
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

function normalizeSloganMap(value, languages, args) {
  const normalized = {};
  const supported = Array.isArray(languages) && languages.length ? languages : DEFAULT_LANGUAGES;

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const language of supported) {
      const slogan = String(value[language] || value.en || "").trim();
      if (slogan) normalized[language] = slogan;
    }
    return normalized;
  }

  const slogan = String(value || "").trim();
  if (!slogan) return normalized;
  for (const language of supported) {
    normalized[language] = language === "en" ? slogan : defaultBrandingSlogan(args, language);
  }
  return normalized;
}

function defaultBrandingSlogan(args, language = "en") {
  const operatorName = String(args.operatorLegalName || "").trim();
  if (!operatorName) {
    return (
      {
        en: "A short-link service powered by vanityURLs",
        fr: "Un service de liens courts propulsé par vanityURLs",
        es: "Un servicio de enlaces cortos impulsado por vanityURLs",
        it: "Un servizio di link brevi alimentato da vanityURLs",
        de: "Ein Kurzlink-Dienst, betrieben mit vanityURLs"
      }[language] || "A short-link service powered by vanityURLs"
    );
  }

  return (
    {
      en: `A short-link service for ${operatorName}'s projects`,
      fr: `Un service de liens courts pour les projets de ${operatorName}`,
      es: `Un servicio de enlaces cortos para los proyectos de ${operatorName}`,
      it: `Un servizio di link brevi per i progetti di ${operatorName}`,
      de: `Ein Kurzlink-Dienst fuer die Projekte von ${operatorName}`
    }[language] || `A short-link service for ${operatorName}'s projects`
  );
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
  fs.mkdirSync(CUSTOM_PUBLIC_DIR, { recursive: true });

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
          custom_public: args.customizePublic === true,
          wordmark: args.customizePublic
            ? {
                black: args.wordmarkBlack,
                green: args.wordmarkGreen
              }
            : undefined
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
  rewriteHtmlFiles(CUSTOM_PUBLIC_DIR, (html, filePath) =>
    normalizeHtmlHead(applyBranding(html, args, languageForPublicFile(filePath)))
  );
  formatFiles(CUSTOM_PUBLIC_DIR, [".html"]);
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
      fs.writeFileSync(entryPath, transform(fs.readFileSync(entryPath, "utf8"), entryPath));
    }
  }
}

function normalizeHtmlHead(html) {
  let normalized = html;

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

  if (!normalized.includes("data-v8s-theme-override")) {
    normalized = insertBeforeFirstStylesheet(normalized, `${THEME_OVERRIDE_SCRIPT}\n`);
  }

  return normalized;
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

const THEME_OVERRIDE_SCRIPT = `    <script data-v8s-theme-override>
      (() => {
        const theme = new URLSearchParams(window.location.search).get("theme");
        if (theme !== "light" && theme !== "dark") return;

        document.documentElement.dataset.theme = theme;

        const applyThemeImages = () => {
          document.querySelectorAll('picture source[media*="prefers-color-scheme"][srcset]').forEach((source) => {
            const image = source.parentElement?.querySelector("img");
            const candidate =
              theme === "dark"
                ? source.getAttribute("srcset")?.split(",")[0]?.trim()?.split(/\\s+/)[0]
                : image?.getAttribute("src");
            if (image && candidate) image.src = candidate;
          });
        };

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", applyThemeImages, { once: true });
        } else {
          applyThemeImages();
        }
      })();
    </script>`;

function languageForPublicFile(filePath) {
  const [language] = path.relative(CUSTOM_PUBLIC_DIR, filePath).split(path.sep);
  return DEFAULT_LANGUAGES.includes(language) ? language : "en";
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
    operator: {
      ...(base.operator || {}),
      ...(custom.operator || {})
    },
    links: {
      ...(base.links || {}),
      ...(custom.links || {}),
      tag_random_slug_lengths: {
        ...(base.links?.tag_random_slug_lengths || {}),
        ...(custom.links?.tag_random_slug_lengths || {})
      }
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
  console.log("- Review the starter link list with ./scripts/lnk list");
  console.log("- Continue Quickstart: https://www.vanityurls.link/en/docs/setup/quickstart/#install-local-helpers");
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
