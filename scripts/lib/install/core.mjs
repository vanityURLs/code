export const DEFAULT_DOMAIN = "v8s.link";
export const DEFAULT_LANGUAGE = "en";
export const DEFAULT_LANGUAGES = ["en", "de", "es", "fr", "it"];
export const DEFAULT_RANDOM_SLUG_LENGTH = 3;
export const DEFAULT_OPERATOR_TIMEZONE = "UTC";
export const MAX_RANDOM_SLUG_LENGTH = 64;
export const MAX_WORKER_NAME_LENGTH = 63;

export function parseArgs(argv) {
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

export function normalizeArgs(args, options = {}) {
  args.domain = normalizeDomain(args.domain);
  if (!args.operatorShortDomain) args.operatorShortDomain = args.domain;
  args.workerName = args.workerName ? slugifyWorker(args.workerName) : slugifyWorker(args.domain);
  args.analytics = normalizeAnalyticsProviders(args.analytics);
  args.owner = slugifyOwner(args.owner);
  args.randomSlugLength = normalizeRandomSlugLength(
    args.randomSlugLength || options.defaultRandomSlugLength || DEFAULT_RANDOM_SLUG_LENGTH
  );
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
  args.operator = normalizeOperator(args, {
    fallbackLastUpdated: options.fallbackLastUpdated
  });

  if (!args.domain) throw new Error("Domain cannot be empty.");
  if (!args.workerName) throw new Error("Worker name cannot be empty.");
  validateWorkerName(args.workerName);
  validateOperator(args.operator);
  if (args.configureBranding) {
    const split = normalizeWordmarkSplit(args);
    args.wordmarkBlack = split.black;
    args.wordmarkGreen = split.green;
  }

  return args;
}

export function brandingCustomMode(branding) {
  const configured = String(branding?.custom_mode || "")
    .trim()
    .toLowerCase();
  if (["default", "partial", "full"].includes(configured)) return configured;
  if (branding?.custom_public === true) return "full";
  return "default";
}

export function isFullCustomMode(branding) {
  return brandingCustomMode(branding) === "full";
}

export function configuredBrandingCustomMode(args) {
  if (args.customizePublic === true) return "full";
  if (
    hasConfiguredSlogan(args.brandingSlogans) ||
    String(args.wordmarkBlack || "").trim() ||
    String(args.wordmarkGreen || "").trim()
  ) {
    return "partial";
  }
  return "default";
}

export function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/g, "")
    .toLowerCase();
}

export function slugifyWorker(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_WORKER_NAME_LENGTH)
    .replace(/-+$/g, "");
}

export function validateWorkerName(value) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
    throw new Error(
      "Worker name must use lowercase letters, numbers, and hyphens; it must start and end with a letter or number."
    );
  }
}

export function slugifyOwner(value) {
  return (
    String(value || "owner")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "owner"
  );
}

export function normalizeAnalyticsProviders(value) {
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

export function normalizeRandomSlugLength(value) {
  const number = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(number) || number < 1 || number > MAX_RANDOM_SLUG_LENGTH) {
    throw new Error(`Random slug length must be an integer from 1 to ${MAX_RANDOM_SLUG_LENGTH}.`);
  }
  return number;
}

export function normalizeLanguages(value) {
  const languages = String(value || DEFAULT_LANGUAGES.join(","))
    .split(",")
    .map((language) => language.trim().toLowerCase().split("-")[0])
    .filter(Boolean);
  const unique = [...new Set(languages)];
  const ordered = unique.includes(DEFAULT_LANGUAGE) ? unique : [DEFAULT_LANGUAGE, ...unique];
  return [DEFAULT_LANGUAGE, ...ordered.filter((language) => language !== DEFAULT_LANGUAGE)];
}

export function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return false;
  return ["1", "true", "yes", "y", "on"].includes(String(value).trim().toLowerCase());
}

export function isAnalyticsDisabled(value) {
  const providers = String(value || "disabled")
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
  return !providers.length || providers.some((provider) => ["disabled", "none", "off"].includes(provider));
}

export function defaultContactEmail(localPart, domain) {
  const normalizedDomain = normalizeDomain(domain);
  return normalizedDomain ? `${localPart}@${normalizedDomain}` : "";
}

export function normalizeWordmarkSplit(args) {
  const suggested = suggestWordmarkSplit(args.domain);
  return {
    black: String(args.wordmarkBlack || suggested.black).trim(),
    green: String(args.wordmarkGreen || suggested.green).trim()
  };
}

export function normalizeOperator(args, options = {}) {
  const operatorDomain = normalizeDomain(args.operatorDomain || "");
  const emailDomain = operatorDomain || args.domain;
  const contactEmail = String(args.operatorContactEmail || defaultContactEmail("hello", emailDomain)).trim();
  const privacyContact = String(args.operatorPrivacyContact || defaultContactEmail("privacy", emailDomain)).trim();
  const abuseContact = String(args.operatorAbuseContact || defaultContactEmail("abuse", emailDomain)).trim();
  const securityContact = String(args.operatorSecurityContact || defaultContactEmail("security", emailDomain)).trim();
  const fallbackLastUpdated = String(options.fallbackLastUpdated || "").trim();

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
    last_updated: String(args.operatorLastUpdated || fallbackLastUpdated).trim(),
    analytics_disclosure: String(args.operatorAnalyticsDisclosure || analyticsDisclosureDefault(args.analytics)).trim(),
    analytics_retention: String(args.operatorAnalyticsRetention || analyticsRetentionDefault(args.analytics)).trim(),
    abuse_response_window: String(args.operatorAbuseResponseWindow || "5 business days").trim(),
    legal_pages_enabled: args.configureLegalPages === true
  };
}

export function hasConfiguredLegalPages(operator) {
  return Boolean(
    String(operator?.jurisdiction || "").trim() &&
    String(operator?.governing_law || "").trim() &&
    String(operator?.contact_email || "").trim() &&
    String(operator?.privacy_contact || "").trim()
  );
}

export function hasConfiguredPublicContactEmails(operator) {
  return Boolean(
    String(operator?.operator_domain || "").trim() ||
    String(operator?.contact_email || "").trim() ||
    String(operator?.privacy_contact || "").trim() ||
    String(operator?.abuse_contact || "").trim() ||
    String(operator?.security_contact || "").trim()
  );
}

export function hasContactArgs(args) {
  return Boolean(
    String(args.operatorDomain || "").trim() ||
    String(args.operatorContactEmail || "").trim() ||
    String(args.operatorPrivacyContact || "").trim() ||
    String(args.operatorAbuseContact || "").trim() ||
    String(args.operatorSecurityContact || "").trim()
  );
}

export function validateOperator(operator) {
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

export function isEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || ""));
}

export function configuredTimezone(value, isStoredValue = false) {
  const timezone = String(value || "").trim();
  if (isStoredValue) return timezone || DEFAULT_OPERATOR_TIMEZONE;
  if (!timezone || timezone === DEFAULT_OPERATOR_TIMEZONE) return localTimezone();
  return timezone;
}

export function normalizeTimezone(value) {
  const timezone = String(value || "").trim() || DEFAULT_OPERATOR_TIMEZONE;
  if (isValidTimezone(timezone)) return timezone;
  throw new Error(
    `Operator timezone must be an IANA timezone name such as America/Toronto, not an offset such as ${timezone}. IANA timezones handle daylight saving time automatically.`
  );
}

export function isValidTimezone(value) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function analyticsDisclosureDefault(providers) {
  const normalized = String(providers || "disabled").toLowerCase();
  return normalized === "disabled" || normalized.includes("none") || normalized.includes("off")
    ? "No analytics enabled."
    : "Privacy-respecting analytics are configured for operations, security, and reliability.";
}

export function analyticsRetentionDefault(providers) {
  const normalized = String(providers || "disabled").toLowerCase();
  return normalized === "disabled" || normalized.includes("none") || normalized.includes("off") ? "" : "180 days";
}

export function suggestWordmarkSplit(domain) {
  const normalized = normalizeDomain(domain);
  const parts = normalized.split(".").filter(Boolean);
  if (parts.length < 2) return { black: normalized, green: "" };

  return {
    black: `${parts.slice(0, -1).join(".")}.`,
    green: parts.at(-1)
  };
}

export function hasConfiguredBranding(branding) {
  return Boolean(
    brandingCustomMode(branding) !== "default" ||
    hasConfiguredSlogan(branding?.slogan) ||
    String(branding?.wordmark?.black || "").trim() ||
    String(branding?.wordmark?.green || "").trim()
  );
}

export function hasConfiguredSlogan(slogan) {
  if (slogan && typeof slogan === "object" && !Array.isArray(slogan)) {
    return Object.values(slogan).some((value) => String(value || "").trim());
  }
  return Boolean(String(slogan || "").trim());
}

export function normalizeSloganMap(value, languages, args) {
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

export function defaultBrandingSlogan(args, language = "en") {
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

export function normalizeAccessTeamDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/g, "");
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_OPERATOR_TIMEZONE;
}
