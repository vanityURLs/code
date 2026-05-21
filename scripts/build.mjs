#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const BUILD_DIR = path.join(ROOT, "build");
const GENERATED_BLOCKLIST_PATH = path.join(BUILD_DIR, "blocklist.generated.json");
const RUNTIME_BLOCKLIST_PATH = path.join(BUILD_DIR, "v8s-blocklist.json");
const RUNTIME_REGISTRY_PATH = path.join(BUILD_DIR, "v8s.json");
const RUNTIME_SITE_CONFIG_PATH = path.join(BUILD_DIR, "v8s-site-config.json");
const DEFAULTS_DIR = path.join(ROOT, "defaults");
const CUSTOM_DIR = path.join(ROOT, "custom");
const CUSTOM_SITE_CONFIG_PATH = path.join(CUSTOM_DIR, "v8s-site-config.json");
const LOCAL_CONFIG_PATH = path.join(CUSTOM_DIR, "v8s-local-config.json");
const WORKER_SOURCE_DIR = path.join(ROOT, "scripts", "workers");
const RUNTIME_SOURCE_DIR = path.join(ROOT, "src");
const LANGUAGE_METADATA = {
  en: {
    name: "English",
    pagesTitle: "Pages",
    statusTitle: "Status Pages",
    links: {
      index: "Index",
      expand: "Expand",
      stats: "Stats",
      privacy: "Privacy",
      terms: "Terms",
      abuse: "Trust & Safety",
      security: "Security",
      notFound: "404",
      expired: "Expired",
      disabled: "Disabled",
      maintenance: "Maintenance"
    }
  },
  fr: {
    name: "Français",
    pagesTitle: "Pages",
    statusTitle: "Pages d'état",
    links: {
      index: "Accueil",
      expand: "Développer",
      stats: "Stats",
      privacy: "Confidentialité",
      terms: "Conditions",
      abuse: "Confiance et sécurité",
      security: "Sécurité",
      notFound: "404",
      expired: "Expiré",
      disabled: "Désactivé",
      maintenance: "Maintenance"
    }
  },
  es: {
    name: "Español",
    pagesTitle: "Páginas",
    statusTitle: "Páginas de estado",
    links: {
      index: "Inicio",
      expand: "Expandir",
      stats: "Stats",
      privacy: "Privacidad",
      terms: "Términos",
      abuse: "Confianza y seguridad",
      notFound: "404",
      expired: "Caducado",
      disabled: "Desactivado",
      maintenance: "Mantenimiento"
    }
  },
  it: {
    name: "Italiano",
    pagesTitle: "Pagine",
    statusTitle: "Pagine di stato",
    links: {
      index: "Home",
      expand: "Espandi",
      stats: "Stats",
      privacy: "Privacy",
      terms: "Condizioni",
      abuse: "Fiducia e sicurezza",
      notFound: "404",
      expired: "Scaduto",
      disabled: "Disattivato",
      maintenance: "Manutenzione"
    }
  },
  de: {
    name: "Deutsch",
    pagesTitle: "Seiten",
    statusTitle: "Statusseiten",
    links: {
      index: "Start",
      expand: "Erweitern",
      stats: "Stats",
      privacy: "Datenschutz",
      terms: "Bedingungen",
      abuse: "Vertrauen und Sicherheit",
      notFound: "404",
      expired: "Abgelaufen",
      disabled: "Deaktiviert",
      maintenance: "Wartung"
    }
  }
};

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
  log("Copying scripts/workers/ to src/");

  fs.rmSync(RUNTIME_SOURCE_DIR, {
    recursive: true,
    force: true
  });

  fs.mkdirSync(RUNTIME_SOURCE_DIR, {
    recursive: true
  });

  copyDirectory(WORKER_SOURCE_DIR, RUNTIME_SOURCE_DIR);
}

function patchRuntimeLanguages(siteConfig) {
  const workerPath = path.join(RUNTIME_SOURCE_DIR, "worker.mjs");
  const localizedLanguages = supportedLanguages(siteConfig).filter((language) => language !== "en");
  const text = fs.readFileSync(workerPath, "utf8");
  const next = text.replace(
    /const LOCALIZED_HTML_LANGUAGES = \[[^\]]*\];[^\n]*/,
    `const LOCALIZED_HTML_LANGUAGES = ${JSON.stringify(localizedLanguages)}; // generated from v8s-site-config.json`
  );

  fs.writeFileSync(workerPath, next);
}

function copyEnglishPublicRoot() {
  const englishPublic = path.join(DEFAULTS_DIR, "public", "en");
  if (!hasCopyableFiles(englishPublic)) return;

  log("Copying defaults/public/en/ to public root");
  copyDirectory(englishPublic, BUILD_DIR);
}

function copyLocalizedBadgeFallbacks(siteConfig) {
  const lightBadge = path.join(BUILD_DIR, "v8s-redirected.svg");
  const darkBadge = path.join(BUILD_DIR, "v8s-redirected-dark.svg");
  const badgeFiles = [
    ["v8s-redirected.svg", lightBadge],
    ["v8s-redirected-dark.svg", darkBadge]
  ];

  for (const language of supportedLanguages(siteConfig)) {
    if (language === "en") continue;

    const languageDir = path.join(BUILD_DIR, language);
    fs.mkdirSync(languageDir, { recursive: true });

    for (const [fileName, sourcePath] of badgeFiles) {
      const targetPath = path.join(languageDir, fileName);
      if (!fs.existsSync(targetPath) && fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }
}

function copyPublic(siteConfig) {
  log("Copying defaults/public/");
  copyDirectory(path.join(DEFAULTS_DIR, "public"), BUILD_DIR);
  copyEnglishPublicRoot();

  const customPublic = path.join(CUSTOM_DIR, "public");
  const usingCustomPublic = hasCopyableFiles(customPublic);
  if (usingCustomPublic) {
    log("Overlaying custom/public/");
    copyDirectory(customPublic, BUILD_DIR);
  } else {
    copyLocalizedBadgeFallbacks(siteConfig);
  }

  pruneUnsupportedLanguageDirs(BUILD_DIR, siteConfig);
}

function loadSiteConfig() {
  const defaultConfig = readJsonFile(path.join(DEFAULTS_DIR, "v8s-site-config.json"));
  if (fs.existsSync(CUSTOM_SITE_CONFIG_PATH)) {
    return mergeSiteConfig(defaultConfig, readJsonFile(CUSTOM_SITE_CONFIG_PATH));
  }

  return defaultConfig;
}

function mergeSiteConfig(base, custom) {
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
    branding: {
      ...(base.branding || {}),
      ...(custom.branding || {}),
      wordmark: {
        ...(base.branding?.wordmark || {}),
        ...(custom.branding?.wordmark || {})
      }
    }
  };
}

function supportedLanguages(siteConfig) {
  const configured = Array.isArray(siteConfig?.i18n?.supported_languages)
    ? siteConfig.i18n.supported_languages
    : ["en"];
  const languages = configured
    .map((language) => String(language || "").trim().toLowerCase().split("-")[0])
    .filter(Boolean);
  return [...new Set(languages)].includes("en") ? [...new Set(languages)] : ["en", ...new Set(languages)];
}

function pruneUnsupportedLanguageDirs(publicDir, siteConfig) {
  const supported = new Set(supportedLanguages(siteConfig));
  for (const language of Object.keys(LANGUAGE_METADATA)) {
    if (language === "en" || supported.has(language)) continue;

    fs.rmSync(path.join(publicDir, language), {
      recursive: true,
      force: true
    });
  }
}

function writeSiteConfig(siteConfig) {
  fs.writeFileSync(RUNTIME_SITE_CONFIG_PATH, `${JSON.stringify(siteConfig, null, 2)}\n`);
}

function runtimeSiteConfig(siteConfig) {
  return {
    ...siteConfig,
    operator: effectiveOperator(siteConfig.operator || {})
  };
}

function hasCustomSiteConfig() {
  return fs.existsSync(CUSTOM_SITE_CONFIG_PATH);
}

function renderLegalPages(siteConfig) {
  if (!hasCustomSiteConfig()) return;

  const languages = supportedLanguages(siteConfig);
  const legalPages = ["privacy", "terms", "abuse", "security"];

  if (!languages.length) return;

  const templatePages = [];
  for (const language of languages) {
    for (const slug of legalPages) {
      for (const filePath of legalPagePaths(language, slug)) {
        if (isDefaultLegalTemplate(filePath)) templatePages.push({ language, slug, filePath });
      }
    }
  }

  if (!templatePages.length) return;

  const operator = effectiveOperator(siteConfig.operator || {});
  const operatorConfigIssues = validateOperatorConfig(operator);
  const requiresOperatorConfig = siteConfig?.branding?.custom_public === true;
  if (operatorConfigIssues.length && requiresOperatorConfig) {
    throw new Error(`custom/v8s-site-config.json operator fields are required for default legal pages: ${operatorConfigIssues.join(", ")}`);
  }

  for (const page of templatePages) {
    const rendered = operatorConfigIssues.length
      ? renderLegalConfigurationNotice(page.language)
      : renderLegalPageContent(page.language, page.slug, operator);
    const current = fs.readFileSync(page.filePath, "utf8");
    const withContent = replaceLegalContent(current, rendered);
    fs.writeFileSync(page.filePath, operatorConfigIssues.length
      ? replaceBrandSubtitle(withContent, legalConfigurationSubtitle(page.language))
      : withContent);
  }
}

function renderSecurityTxt(siteConfig) {
  if (!hasCustomSiteConfig()) return;

  const operator = effectiveOperator(siteConfig.operator || {});
  if (validateOperatorConfig(operator).length) {
    removeSecurityTxt();
    return;
  }

  const shortDomain = normalizeSecurityTxtValue(operator.short_domain);
  const securityContact = normalizeSecurityTxtValue(operator.security_contact);
  const preferredLanguages = supportedLanguages(siteConfig).join(", ");
  const expires = securityTxtExpires(operator.last_updated);
  const content = [
    `Contact: mailto:${securityContact}`,
    `Policy: https://${shortDomain}/trust-safety`,
    `Canonical: https://${shortDomain}/.well-known/security.txt`,
    `Preferred-Languages: ${preferredLanguages}`,
    `Expires: ${expires}`,
    ""
  ].join("\n");

  for (const filePath of securityTxtPaths()) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
}

function securityTxtPaths() {
  return [
    path.join(BUILD_DIR, "security.txt"),
    path.join(BUILD_DIR, ".well-known", "security.txt")
  ];
}

function removeSecurityTxt() {
  for (const filePath of securityTxtPaths()) {
    fs.rmSync(filePath, { force: true });
  }
}

function normalizeSecurityTxtValue(value) {
  return String(value || "").trim().replace(/[\r\n]/g, "");
}

function securityTxtExpires(lastUpdated) {
  const date = new Date(`${lastUpdated}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().replace(".000Z", "Z");
}

function legalPagePaths(language, slug) {
  return language === "en"
    ? [path.join(BUILD_DIR, `${slug}.html`), path.join(BUILD_DIR, "en", `${slug}.html`)]
    : [path.join(BUILD_DIR, language, `${slug}.html`)];
}

function isDefaultLegalTemplate(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const html = fs.readFileSync(filePath, "utf8");
  return html.includes("Default template to adapt by the instance owner.")
    || html.includes("Modèle par défaut à adapter par le propriétaire de l'instance.")
    || html.includes('data-v8s-default-template="true"');
}

function validateOperatorConfig(operator) {
  const required = [
    "legal_name",
    "short_domain",
    "jurisdiction",
    "governing_law",
    "contact_email",
    "privacy_contact",
    "abuse_contact",
    "security_contact",
    "last_updated",
    "umami_geo_ip_mode",
    "analytics_disclosure",
    "abuse_response_window"
  ];
  const issues = required.filter((field) => isPlaceholderValue(operator[field]));

  for (const field of ["contact_email", "privacy_contact", "abuse_contact", "security_contact"]) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(operator[field]))) {
      issues.push(field);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(operator.last_updated))) {
    issues.push("last_updated");
  }

  return [...new Set(issues)];
}

function effectiveOperator(operator) {
  return {
    ...operator,
    short_domain: operator.short_domain || "",
    last_updated: operator.last_updated || gitLastUpdatedDate(),
    umami_geo_ip_mode: deriveUmamiGeoIpMode()
  };
}

function deriveUmamiGeoIpMode() {
  const analyticsProvider = configVar("ANALYTICS_PROVIDER").toLowerCase();
  const providers = analyticsProvider.split(",").map((provider) => provider.trim()).filter(Boolean);
  if (!providers.includes("umami")) {
    return "not applicable — Umami is not enabled on this instance";
  }

  const mode = configVar("UMAMI_GEO_IP_MODE").toLowerCase() || "truncated";
  return ["full", "truncated", "none"].includes(mode) ? mode : "truncated";
}

function configVar(name) {
  return process.env[name] || readWranglerVar(name);
}

function readWranglerVar(name) {
  const wranglerPath = path.join(ROOT, "wrangler.toml");
  if (!fs.existsSync(wranglerPath)) return "";

  const toml = fs.readFileSync(wranglerPath, "utf8");
  const sectionMatch = toml.match(/\[vars\]([\s\S]*?)(?=\n\[|$)/);
  if (!sectionMatch) return "";

  const match = sectionMatch[1].match(new RegExp(`^\\s*${name}\\s*=\\s*['"]?([^'"\\n#]+)['"]?\\s*$`, "m"));
  return match?.[1]?.trim() || "";
}

function gitLastUpdatedDate() {
  try {
    return execSync("git log -1 --format=%cs", {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

function isPlaceholderValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized
    || ["todo", "tbd", "to be defined", "changeme", "change-me", "default", "owner", "example", "example.com"].includes(normalized)
    || normalized.includes("example.")
    || normalized.includes("your-");
}

function replaceLegalContent(html, rendered) {
  const pattern = /(<h2 class="legal-title">[\s\S]*?<\/h2>\n)([\s\S]*?)(\n\s*<nav class="page-links")/;
  return html.replace(pattern, (_match, heading, _body, nav) => `${heading}${rendered}${nav}`);
}

function replaceBrandSubtitle(html, notice) {
  return html.replace(
    /<p class="instance-brand-subtitle">[\s\S]*?<\/p>/,
    `<p class="instance-brand-subtitle">${escapeHtml(notice)}</p>`
  );
}

function renderLegalPageContent(language, slug, operator) {
  const content = LEGAL_CONTENT[language]?.[slug] || LEGAL_CONTENT.en[slug];
  const paragraphs = content.sections.filter(([, text]) => {
    return !text.includes("{{analytics_retention}}") || Boolean(String(operator.analytics_retention || "").trim());
  }).map(([heading, text]) => {
    return `      <h3>${escapeHtml(heading)}</h3>\n      <p>${renderOperatorText(text, operator)}</p>`;
  }).join("\n\n");

  return `      <p class="legal-note">${renderOperatorText(content.note, operator)}</p>\n      <p class="legal-note">${escapeHtml(content.lastUpdated)} ${escapeHtml(operator.last_updated || "")}</p>\n\n${paragraphs}\n`;
}

function renderLegalConfigurationNotice(language) {
  const notice = LEGAL_CONFIGURATION_NOTICE[language] || LEGAL_CONFIGURATION_NOTICE.en;
  const paragraphs = notice.sections.map(([heading, text]) => {
    return `      <h3>${escapeHtml(heading)}</h3>\n      <p>${escapeHtml(text)}</p>`;
  }).join("\n\n");

  return `      <p class="legal-note">${escapeHtml(notice.note)}</p>\n\n${paragraphs}\n`;
}

function legalConfigurationSubtitle(language) {
  return (LEGAL_CONFIGURATION_NOTICE[language] || LEGAL_CONFIGURATION_NOTICE.en).subtitle;
}

function renderOperatorText(text, operator) {
  const emailFields = new Set(["contact_email", "privacy_contact", "abuse_contact", "security_contact"]);
  return escapeHtml(text).replace(/\{\{(?:operator\.)?([a-z_]+)\}\}/g, (_match, field) => {
    const value = escapeHtml(operator[field] || "");
    return emailFields.has(field) ? `<a href="mailto:${value}">${value}</a>` : value;
  });
}

const LEGAL_CONFIGURATION_NOTICE = {
  en: {
    subtitle: "Default legal pages are shown until this instance configures its legal and trust contacts.",
    note: "Configuration notice: this instance is using default legal and trust content.",
    sections: [
      ["Operator information required", "The instance owner should configure operator legal name, short domain, jurisdiction, governing law, contact email, privacy contact, trust and safety contact, security contact, analytics disclosure, response window, and last-updated date in custom/v8s-site-config.json."],
      ["Before launch", "Do not treat this page as a final legal notice until the operator has reviewed and configured the instance-specific content."]
    ]
  },
  fr: {
    subtitle: "Les pages légales par défaut sont affichées tant que cette instance n'a pas configuré ses contacts légaux et de confiance.",
    note: "Avis de configuration : cette instance utilise le contenu légal et de confiance par défaut.",
    sections: [
      ["Renseignements requis", "Le propriétaire de l'instance devrait configurer le nom légal de l'opérateur, le domaine court, la juridiction, le droit applicable, le courriel de contact, le contact de confidentialité, le contact confiance et sécurité, le contact de sécurité, la divulgation analytique, le délai de réponse et la date de dernière mise à jour dans custom/v8s-site-config.json."],
      ["Avant le lancement", "Ne considérez pas cette page comme un avis légal final tant que l'opérateur n'a pas révisé et configuré le contenu propre à l'instance."]
    ]
  }
};

const LEGAL_CONTENT = {
  en: {
    privacy: {
      note: "Privacy statement for {{operator.legal_name}}, operated in {{operator.jurisdiction}}.",
      lastUpdated: "Last updated:",
      sections: [
        ["Overview", "This short-link service at {{operator.short_domain}} is operated by {{operator.legal_name}} in {{operator.jurisdiction}}. It is a single instance of the open-source vanityURLs project, deployed and customized by the operator and provided at no cost."],
        ["Purpose of processing", "Information is processed to deliver redirects, enforce the acceptable-use policy set out in the Terms, detect and block abusive traffic, and diagnose operational issues. Where applicable law requires a legal basis, the operator relies on legitimate interests in operating a functional and safe redirect service."],
        ["No visitor accounts or cookies", "This redirector does not host visitor accounts, set cookies, or accept visitor-submitted links at runtime. No identifiers are stored client-side."],
        ["Privacy contact", "For privacy enquiries, contact {{operator.privacy_contact}}, who acts as the person responsible for personal information for this instance."],
        ["What this service does", "The service receives a short URL request, looks up a destination in a file bundled into a serverless instance at deploy time, and returns an HTTP redirect. The lookup happens entirely in memory, with no database read at request time and no call out to GitHub or any other system."],
        ["Information processed at request time", "To deliver each redirect, the Cloudflare edge derives and provides the requested path, visitor IP address from the cf-connecting-ip header, country code from request.cf.country, first Accept-Language tag truncated to 35 characters, User-Agent, Referer, request timestamp, and a per-request correlation identifier generated by the Worker for the duration of the request."],
        ["Analytics pipeline", "When server-side analytics is enabled, the Worker forwards one event per redirect and one event per use of the /expand preview pages to the configured provider. No event is forwarded when analytics is not configured."],
        ["Umami analytics", "Umami receives the requested path and query string, hostname, first language tag from Accept-Language, Referer, User-Agent or bot fallback string, and the visitor IP address governed by UMAMI_GEO_IP_MODE. Non-pageview events additionally include the slug, destination host, country code, Cloudflare data-centre code, correlation identifier, event type, and HTTP status."],
        ["Umami IP mode", "This instance's Umami IP mode is set to: {{operator.umami_geo_ip_mode}}."],
        ["Fathom analytics", "Fathom is called server-side by the Worker. As a consequence, Fathom does not receive the visitor's IP address; it sees only the Cloudflare Worker's egress IP. The Worker forwards the request origin and path, an allowlist of campaign and common content query parameters, the Referer header, and the visitor's User-Agent as the outgoing HTTP request header. A fresh random number is generated per event in place of a stable visitor identifier."],
        ["/expand preview pages", "A visitor can use localized /expand preview pages to see a short-link destination without being redirected. Preview requests post a small JSON body to /_analytics/expand containing the slug, effective-state label, result classification, and resolved target hostname. No personal information beyond what is already described above is added by this path."],
        ["Retention", "The vanityURLs Worker is stateless and writes no persistent data of its own. Cloudflare Workers Logs are retained by Cloudflare for approximately 3 days on the Workers Free plan and 7 days on the Workers Paid plan. Cloudflare HTTP request logs are not retained by default unless the operator enables Enterprise Logpull or Logpush to operator-controlled storage."],
        ["Cloudflare DNS and audit data", "Cloudflare authoritative DNS analytics retain aggregate query metadata for up to 31 days through the standard offering. Cloudflare audit logs record operator administrative changes and are retained for 18 months under standard plans. These logs concern operator activity, not visitor traffic."],
        ["Optional analytics provider retention", "{{operator.analytics_disclosure}}"],
        ["Analytics retention", "{{operator.analytics_retention}}"],
        ["Sub-processors", "Runtime sub-processors may include Cloudflare, Inc. for DNS, Workers, Static Assets, and edge protection; Conva Ventures Inc. where Fathom Analytics is enabled; and Umami Software, Inc. where hosted Umami Cloud is enabled. GitHub, Inc. is part of the build-time supply chain and does not receive visitor traffic, IP addresses, or analytics events."],
        ["International transfers", "Because this service is delivered through Cloudflare's global edge network, request data may be processed in countries other than the visitor's own. Cloudflare relies on safeguards described in its Data Processing Addendum, including the European Commission's Standard Contractual Clauses for EU/EEA transfers."],
        ["Your rights and architectural limits", "This service is designed to process visitor data ephemerally. The operator does not maintain visitor accounts, identifiers, profiles, or any persistent store of personal information. There is no visitor record to retrieve, correct, or delete. Data held by Cloudflare and any configured analytics provider expires on their systems according to the retention schedules above."],
        ["Operator-controlled requests", "The operator can act on requests that target operator-controlled configuration rather than visitor data, such as a request to remove a specific short link from the redirect registry. Privacy enquiries can be sent to {{operator.privacy_contact}}."],
        ["Children", "This service is not directed at children under 13, or the equivalent minimum age in the visitor's jurisdiction, and does not knowingly collect information from them."],
        ["Changes", "This page may be updated to reflect operational changes. The last updated date at the top indicates the current revision."]
      ]
    },
    terms: {
      note: "Terms and conditions for {{legal_name}}, operated under {{jurisdiction}}.",
      lastUpdated: "Last updated:",
      sections: [
        ["The service", "The short-link service at {{operator.short_domain}} (\"the Service\") is operated by {{operator.legal_name}} (\"the Operator\"). The Service redirects short URLs to destinations chosen by the Operator. It is provided to visitors free of charge and without registration."],
        ["Acceptable use", "Visitors may follow published short links. Visitors must not attempt to probe, scan, overload, reverse-engineer, or interfere with the Service, or use it to facilitate unlawful activity. The Operator does not accept visitor-submitted links; any short link on this domain has been published by the Operator and may be added, modified, or removed at any time."],
        ["Operator's right to disable links", "The Operator may disable, replace, or remove any short link at its sole discretion, with or without notice, for any reason including operational, legal, safety, or reputational concerns. Disabled links may return an HTTP error or a notice page."],
        ["Third-party destinations and no endorsement", "A short link may redirect to a website operated by a third party. The Operator does not control, monitor, or endorse the content, availability, accuracy, or privacy practices of third-party destinations. Publishing a short link does not constitute endorsement of the destination or its operator."],
        ["Intellectual property", "The vanityURLs software is open source and released under the license stated in the project repository at https://github.com/vanityURLs/code. The short domain name, branding, and link configuration are the property of the Operator."],
        ["No warranty", "THE SERVICE IS PROVIDED \"AS IS\" AND \"AS AVAILABLE\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, OR UNINTERRUPTED OR ERROR-FREE OPERATION. THE OPERATOR DOES NOT WARRANT THAT ANY SHORT LINK WILL BE AVAILABLE AT ANY GIVEN TIME, THAT DESTINATIONS WILL REMAIN REACHABLE, OR THAT THE SERVICE WILL BE FREE FROM DEFECTS OR SECURITY VULNERABILITIES."],
        ["Limitation of liability", "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE OPERATOR, ITS CONTRIBUTORS, OR ITS SUPPLIERS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES INCLUDING WITHOUT LIMITATION DAMAGES FOR LOST PROFITS, LOST DATA, BUSINESS INTERRUPTION, OR LOSS OF GOODWILL ARISING OUT OF OR RELATED TO USE OF, INABILITY TO USE, OR RELIANCE ON THE SERVICE OR ANY DESTINATION REACHED THROUGH IT, EVEN IF THE OPERATOR HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES; IN THOSE JURISDICTIONS THE OPERATOR'S LIABILITY IS LIMITED TO THE GREATEST EXTENT PERMITTED BY LAW."],
        ["Reporting", "Reports of abusive links and security vulnerability disclosures are handled through the Trust & Safety page."],
        ["Governing law", "These Terms are governed by {{operator.governing_law}}, without regard to its conflict-of-law rules. Any dispute arising from these Terms or use of the Service shall be brought exclusively before the courts of {{operator.jurisdiction}}, except where applicable law grants a non-waivable right to bring proceedings elsewhere."],
        ["Changes", "These Terms may be updated to reflect operational, legal, or technical changes. Continued use of the Service after a change constitutes acceptance of the updated Terms. The last updated date above indicates the current revision."],
        ["Contact", "Questions about these Terms may be sent to {{operator.contact_email}}."]
      ]
    },
    abuse: {
      note: "Trust and safety information for {{legal_name}}.",
      lastUpdated: "Last updated:",
      sections: [
        ["Overview", "This page is the single contact point for reporting abusive short links and for disclosing security vulnerabilities affecting {{operator.short_domain}}. It complements the machine-readable contact published at /.well-known/security.txt in accordance with RFC 9116."],
        ["Report an abusive link", "Report any short link on this domain that appears to be used for phishing, malware distribution, credential theft, spam, harassment, impersonation, copyright or trademark infringement, defamation, or another harmful purpose."],
        ["Where to send reports", "Send reports to {{operator.abuse_contact}}. A structured report template is available at /abuse-report.md; copy it, fill in the fields, and paste the result into the body of your email."],
        ["Response", "The Operator will acknowledge well-formed reports on a best-effort basis, typically within {{operator.abuse_response_window}}, and may disable affected links, update the block-keyword policy in the open-source configuration, or take other action consistent with the Terms. No service-level agreement is offered; this is a best-effort response."],
        ["Child sexual abuse material and imminent harm", "If you believe a short link points to child sexual abuse material, report it directly to the appropriate authority in addition to contacting the Operator. Canada: Cybertip.ca. United States: NCMEC CyberTipline. European Union and worldwide: INHOPE network hotlines. For any other situation involving imminent physical danger, contact your local emergency services first."],
        ["Security vulnerability disclosure", "If you discover a security vulnerability in this instance, report it privately to {{operator.security_contact}}. The same contact is published in /.well-known/security.txt."],
        ["In scope", "The {{operator.short_domain}} domain and the Cloudflare Worker code deployed at that domain are in scope, along with misconfiguration of redirect rules, block policies, or access controls specific to this instance."],
        ["Out of scope", "Vulnerabilities in Cloudflare infrastructure should be reported directly to Cloudflare's HackerOne program. Vulnerabilities in GitHub should be reported through GitHub's HackerOne program. Vulnerabilities in the upstream vanityURLs open-source software should be reported through the project's GitHub Security Advisories, not through a public GitHub issue. Findings that require credentials, social engineering of the Operator, denial of service, or physical access are out of scope."],
        ["Safe harbour", "Good-faith security research conducted within the scope above, that respects visitor privacy, avoids service disruption, does not access or modify data beyond what is necessary to demonstrate the issue, and follows coordinated disclosure, will not be subject to legal action by the Operator. This safe harbour does not bind third parties and does not authorize activity that violates applicable law."],
        ["Coordinated disclosure", "Please allow a reasonable remediation window before public disclosure. Ninety days is the default expectation, shorter where a fix is trivial, longer where coordination with upstream maintainers is required. The Operator will keep reporters informed of progress and credit researchers who wish to be acknowledged."],
        ["What we cannot do", "The Operator does not act as a general content moderator for the open internet. Reports about destination websites are most effective when also sent to the destination's hosting provider, domain registrar, or the relevant regulator. The Operator's authority is limited to the short links it publishes on {{operator.short_domain}}."],
        ["Reference material", "Source code: https://github.com/vanityURLs/code. Documentation: /en/docs/. Machine-readable security contact: /.well-known/security.txt. Block-keyword policy: https://github.com/vanityURLs/code/blob/main/defaults/v8s-policies.json."]
      ]
    },
    security: {
      note: "Security contact information for {{legal_name}}.",
      lastUpdated: "Last updated:",
      sections: [
        ["Security model", "This instance is a static-asset and Cloudflare Worker based redirect service. It should not expose a public write API, visitor accounts, cookies, or client-side analytics by default."],
        ["Infrastructure", "{{legal_name}} should use Cloudflare security controls, access protection for operational paths, safe redirect-target validation, and abuse block policies appropriate for this deployment."],
        ["Vulnerability reports", "If you discover a security issue affecting {{short_domain}}, report it privately to {{security_contact}}. This address must match the Contact line in security.txt. Do not publish exploit details before the operator has had time to respond."],
        ["Project security", "Security issues in the vanityURLs software itself can be reported through the project's GitHub security advisory process."]
      ]
    }
  },
  fr: {
    privacy: {
      note: "Déclaration de confidentialité pour {{operator.legal_name}}, exploité sous {{operator.jurisdiction}}.",
      lastUpdated: "Dernière mise à jour :",
      sections: [
        ["Vue d'ensemble", "Ce service de liens courts situé à {{operator.short_domain}} est exploité par {{operator.legal_name}} dans {{operator.jurisdiction}}. Il s'agit d'une instance du projet open source vanityURLs, déployée et personnalisée par l'opérateur et fournie gratuitement."],
        ["Finalité du traitement", "Les renseignements sont traités pour livrer les redirections, appliquer la politique d'utilisation acceptable décrite dans les Conditions, détecter et bloquer le trafic abusif et diagnostiquer les problèmes opérationnels. Lorsque la loi applicable exige une base juridique, l'opérateur s'appuie sur ses intérêts légitimes à exploiter un service de redirection fonctionnel et sûr."],
        ["Aucun compte visiteur ni témoin", "Ce redirecteur n'héberge pas de comptes visiteurs, ne définit pas de témoins et n'accepte pas de liens soumis par les visiteurs à l'exécution. Aucun identifiant n'est stocké côté client."],
        ["Contact de confidentialité", "Pour les questions de confidentialité, contactez {{operator.privacy_contact}}, qui agit comme personne responsable des renseignements personnels pour cette instance."],
        ["Fonctionnement du service", "Le service reçoit une requête d'URL courte, cherche une destination dans un fichier intégré à une instance serverless au moment du déploiement et retourne une redirection HTTP. La recherche se fait entièrement en mémoire, sans lecture de base de données à l'exécution et sans appel vers GitHub ou un autre système."],
        ["Renseignements traités à la requête", "Pour livrer chaque redirection, l'edge Cloudflare fournit le chemin demandé, l'adresse IP du visiteur depuis l'en-tête cf-connecting-ip, le code pays de request.cf.country, le premier tag Accept-Language tronqué à 35 caractères, User-Agent, Referer, l'horodatage de la requête et un identifiant de corrélation généré par le Worker pour la durée de la requête."],
        ["Pipeline analytique", "Lorsque l'analytique côté serveur est activée, le Worker transmet un événement par redirection et un événement par utilisation des pages de prévisualisation /expand au fournisseur configuré. Aucun événement n'est transmis lorsque l'analytique n'est pas configurée."],
        ["Analytique Umami", "Umami reçoit le chemin et la chaîne de requête demandés, l'hôte, le premier tag Accept-Language, Referer, User-Agent ou une chaîne de remplacement pour les robots, et l'adresse IP du visiteur selon UMAMI_GEO_IP_MODE. Les événements non-pageview incluent aussi le slug, l'hôte de destination, le code pays, le code de centre de données Cloudflare, l'identifiant de corrélation, le type d'événement et le statut HTTP."],
        ["Mode IP Umami", "Le mode IP Umami de cette instance est : {{operator.umami_geo_ip_mode}}."],
        ["Analytique Fathom", "Fathom est appelé côté serveur par le Worker. Par conséquent, Fathom ne reçoit pas l'adresse IP du visiteur; il voit seulement l'adresse IP de sortie du Worker Cloudflare. Le Worker transmet l'origine et le chemin de la requête, une liste autorisée de paramètres de campagne et de contenu courants, Referer et User-Agent comme en-tête HTTP sortant. Un nombre aléatoire frais est généré par événement à la place d'un identifiant visiteur stable."],
        ["Pages de prévisualisation /expand", "Un visiteur peut utiliser les pages /expand localisées pour voir la destination d'un lien court sans être redirigé. Les demandes de prévisualisation publient un petit corps JSON vers /_analytics/expand contenant le slug, l'état effectif, la classification du résultat et l'hôte cible résolu. Aucun renseignement personnel au-delà de ce qui est déjà décrit n'est ajouté par ce chemin."],
        ["Conservation", "Le Worker vanityURLs est sans état et n'écrit aucune donnée persistante de son propre chef. Les Workers Logs de Cloudflare sont conservés environ 3 jours sur le plan Workers Free et 7 jours sur le plan Workers Paid. Les journaux de requêtes HTTP Cloudflare ne sont pas conservés par défaut sauf si l'opérateur active Logpull Enterprise ou Logpush vers un stockage contrôlé par l'opérateur."],
        ["DNS et audit Cloudflare", "Les analyses DNS autoritatives de Cloudflare conservent des métadonnées agrégées de requêtes pendant jusqu'à 31 jours dans l'offre standard. Les journaux d'audit Cloudflare enregistrent les changements administratifs de l'opérateur et sont conservés 18 mois sous les plans standards. Ces journaux concernent l'activité de l'opérateur, pas le trafic des visiteurs."],
        ["Conservation du fournisseur analytique optionnel", "{{operator.analytics_disclosure}}"],
        ["Conservation analytique", "{{operator.analytics_retention}}"],
        ["Sous-traitants", "Les sous-traitants d'exécution peuvent inclure Cloudflare, Inc. pour DNS, Workers, Static Assets et protection edge; Conva Ventures Inc. lorsque Fathom Analytics est activé; et Umami Software, Inc. lorsque Umami Cloud hébergé est activé. GitHub, Inc. fait partie de la chaîne d'approvisionnement de build et ne reçoit pas le trafic visiteur, les adresses IP ou les événements analytiques."],
        ["Transferts internationaux", "Comme ce service est livré par le réseau edge mondial de Cloudflare, les données de requête peuvent être traitées dans des pays autres que celui du visiteur. Cloudflare s'appuie sur les garanties décrites dans son addenda de traitement des données, y compris les clauses contractuelles types de la Commission européenne pour les transferts depuis l'UE/EEE."],
        ["Vos droits et les limites de l'architecture", "Ce service est conçu pour traiter les données visiteur de façon éphémère. L'opérateur ne maintient pas de comptes visiteurs, d'identifiants, de profils ou de magasin persistant de renseignements personnels. Il n'existe aucun dossier visiteur à consulter, corriger ou supprimer. Les données détenues par Cloudflare et tout fournisseur analytique configuré expirent sur leurs systèmes selon les calendriers de conservation décrits ci-dessus."],
        ["Demandes contrôlées par l'opérateur", "L'opérateur peut agir sur les demandes visant la configuration qu'il contrôle plutôt que les données visiteur, par exemple une demande de retrait d'un lien court précis du registre de redirection. Les questions de confidentialité peuvent être envoyées à {{operator.privacy_contact}}."],
        ["Enfants", "Ce service ne s'adresse pas aux enfants de moins de 13 ans, ou l'âge minimum équivalent dans la juridiction du visiteur, et ne collecte pas sciemment de renseignements à leur sujet."],
        ["Modifications", "Cette page peut être mise à jour pour refléter des changements opérationnels. La date de dernière mise à jour en haut indique la version actuelle."]
      ]
    },
    terms: {
      note: "Conditions d'utilisation pour {{legal_name}}, exploité sous {{jurisdiction}}.",
      lastUpdated: "Dernière mise à jour :",
      sections: [
        ["Le service", "Le service de liens courts situé à {{operator.short_domain}} (le « Service ») est exploité par {{operator.legal_name}} (l'« Opérateur »). Le Service redirige des URL courtes vers des destinations choisies par l'Opérateur. Il est fourni gratuitement aux visiteurs et sans inscription."],
        ["Utilisation acceptable", "Les visiteurs peuvent suivre les liens courts publiés. Les visiteurs ne doivent pas tenter de sonder, analyser, surcharger, rétroconcevoir ou perturber le Service, ni l'utiliser pour faciliter une activité illégale. L'Opérateur n'accepte pas les liens soumis par les visiteurs; tout lien court sur ce domaine a été publié par l'Opérateur et peut être ajouté, modifié ou retiré à tout moment."],
        ["Droit de l'Opérateur de désactiver les liens", "L'Opérateur peut désactiver, remplacer ou retirer tout lien court à sa seule discrétion, avec ou sans préavis, pour quelque raison que ce soit, notamment pour des motifs opérationnels, légaux, de sécurité ou de réputation. Les liens désactivés peuvent retourner une erreur HTTP ou une page d'avis."],
        ["Destinations tierces et absence d'approbation", "Un lien court peut rediriger vers un site Web exploité par un tiers. L'Opérateur ne contrôle, ne surveille et n'approuve pas le contenu, la disponibilité, l'exactitude ou les pratiques de confidentialité des destinations tierces. La publication d'un lien court ne constitue pas une approbation de la destination ou de son exploitant."],
        ["Propriété intellectuelle", "Le logiciel vanityURLs est open source et publié sous la licence indiquée dans le dépôt du projet à l'adresse https://github.com/vanityURLs/code. Le nom de domaine court, l'image de marque et la configuration des liens sont la propriété de l'Opérateur."],
        ["Aucune garantie", "LE SERVICE EST FOURNI « TEL QUEL » ET « SELON SA DISPONIBILITÉ », SANS GARANTIE D'AUCUNE SORTE, EXPRESSE OU IMPLICITE, Y COMPRIS, SANS S'Y LIMITER, LES GARANTIES IMPLICITES DE QUALITÉ MARCHANDE, D'ADAPTATION À UN USAGE PARTICULIER, D'ABSENCE DE CONTREFAÇON, D'EXACTITUDE OU DE FONCTIONNEMENT ININTERROMPU OU SANS ERREUR. L'OPÉRATEUR NE GARANTIT PAS QU'UN LIEN COURT SERA DISPONIBLE À UN MOMENT DONNÉ, QUE LES DESTINATIONS RESTERONT ACCESSIBLES OU QUE LE SERVICE SERA EXEMPT DE DÉFAUTS OU DE VULNÉRABILITÉS DE SÉCURITÉ."],
        ["Limitation de responsabilité", "DANS LA MESURE MAXIMALE PERMISE PAR LA LOI APPLICABLE, L'OPÉRATEUR, SES CONTRIBUTEURS OU SES FOURNISSEURS NE SERONT EN AUCUN CAS RESPONSABLES DE DOMMAGES DIRECTS, INDIRECTS, ACCESSOIRES, SPÉCIAUX, CONSÉCUTIFS, PUNITIFS OU EXEMPLAIRES, Y COMPRIS, SANS S'Y LIMITER, LES PERTES DE PROFITS, DE DONNÉES, D'ACTIVITÉ OU D'ACHALANDAGE, DÉCOULANT DE L'UTILISATION, DE L'IMPOSSIBILITÉ D'UTILISER OU DE LA CONFIANCE ACCORDÉE AU SERVICE OU À TOUTE DESTINATION ATTEINTE PAR CELUI-CI, MÊME SI L'OPÉRATEUR A ÉTÉ AVISÉ DE LA POSSIBILITÉ DE TELS DOMMAGES. CERTAINES JURIDICTIONS N'AUTORISENT PAS L'EXCLUSION OU LA LIMITATION DE CERTAINS DOMMAGES; DANS CES JURIDICTIONS, LA RESPONSABILITÉ DE L'OPÉRATEUR EST LIMITÉE DANS LA PLUS GRANDE MESURE PERMISE PAR LA LOI."],
        ["Signalements", "Les signalements de liens abusifs et les divulgations de vulnérabilités de sécurité sont traités par la page Confiance et sécurité."],
        ["Droit applicable", "Ces Conditions sont régies par {{operator.governing_law}}, sans égard aux règles de conflit de lois. Tout différend découlant de ces Conditions ou de l'utilisation du Service doit être porté exclusivement devant les tribunaux de {{operator.jurisdiction}}, sauf lorsqu'une loi applicable accorde un droit impératif d'intenter une procédure ailleurs."],
        ["Modifications", "Ces Conditions peuvent être mises à jour pour refléter des changements opérationnels, légaux ou techniques. L'utilisation continue du Service après une modification constitue une acceptation des Conditions mises à jour. La date de dernière mise à jour ci-dessus indique la version actuelle."],
        ["Contact", "Les questions relatives à ces Conditions peuvent être envoyées à {{operator.contact_email}}."]
      ]
    },
    abuse: {
      note: "Information de confiance et de sécurité pour {{legal_name}}.",
      lastUpdated: "Dernière mise à jour :",
      sections: [
        ["Vue d'ensemble", "Cette page est le point de contact unique pour signaler des liens courts abusifs et divulguer des vulnérabilités de sécurité touchant {{operator.short_domain}}. Elle complète le contact lisible par machine publié à /.well-known/security.txt conformément à la RFC 9116."],
        ["Signaler un lien abusif", "Signalez tout lien court de ce domaine qui semble utilisé pour l'hameçonnage, la distribution de logiciels malveillants, le vol d'identifiants, le pourriel, le harcèlement, l'usurpation d'identité, l'atteinte au droit d'auteur ou à une marque, la diffamation ou tout autre usage nuisible."],
        ["Où envoyer les signalements", "Envoyez les signalements à {{operator.abuse_contact}}. Un modèle de signalement structuré est disponible à /abuse-report.md; copiez-le, remplissez les champs et collez le résultat dans le corps de votre courriel."],
        ["Réponse", "L'Opérateur accusera réception des signalements bien formés dans la mesure du possible, généralement dans un délai de {{operator.abuse_response_window}}, et peut désactiver les liens concernés, mettre à jour la politique de mots-clés bloqués dans la configuration open source ou prendre toute autre mesure compatible avec les Conditions. Aucun accord de niveau de service n'est offert; la réponse est fournie au mieux des capacités."],
        ["Matériel d'abus sexuel d'enfants et danger imminent", "Si vous croyez qu'un lien court pointe vers du matériel d'abus sexuel d'enfants, signalez-le directement à l'autorité appropriée en plus de contacter l'Opérateur. Canada : Cybertip.ca. États-Unis : NCMEC CyberTipline. Union européenne et monde : lignes d'assistance du réseau INHOPE. Pour toute autre situation impliquant un danger physique imminent, contactez d'abord les services d'urgence locaux."],
        ["Divulgation de vulnérabilités de sécurité", "Si vous découvrez une vulnérabilité de sécurité dans cette instance, signalez-la en privé à {{operator.security_contact}}. Le même contact est publié dans /.well-known/security.txt."],
        ["Dans le périmètre", "Le domaine {{operator.short_domain}} et le code Cloudflare Worker déployé sur ce domaine sont dans le périmètre, tout comme les erreurs de configuration des règles de redirection, des politiques de blocage ou des contrôles d'accès propres à cette instance."],
        ["Hors périmètre", "Les vulnérabilités de l'infrastructure Cloudflare doivent être signalées directement au programme HackerOne de Cloudflare. Les vulnérabilités de GitHub doivent être signalées via le programme HackerOne de GitHub. Les vulnérabilités du logiciel open source vanityURLs en amont doivent être signalées via les avis de sécurité GitHub du projet, et non dans une issue GitHub publique. Les constats nécessitant des identifiants, de l'ingénierie sociale de l'Opérateur, un déni de service ou un accès physique sont hors périmètre."],
        ["Sphère de sécurité", "La recherche de sécurité menée de bonne foi dans le périmètre ci-dessus, qui respecte la vie privée des visiteurs, évite toute interruption du service, n'accède pas aux données ou ne les modifie pas au-delà de ce qui est nécessaire pour démontrer le problème et suit une divulgation coordonnée, ne fera pas l'objet d'une action juridique de la part de l'Opérateur. Cette sphère de sécurité ne lie pas les tiers et n'autorise pas les activités qui violent la loi applicable."],
        ["Divulgation coordonnée", "Veuillez prévoir une période raisonnable de correction avant toute divulgation publique. Quatre-vingt-dix jours est l'attente par défaut, plus courte lorsqu'un correctif est trivial, plus longue lorsqu'une coordination avec les mainteneurs en amont est nécessaire. L'Opérateur tiendra les chercheurs informés de l'avancement et créditera ceux qui souhaitent être reconnus."],
        ["Ce que nous ne pouvons pas faire", "L'Opérateur n'agit pas comme modérateur général du contenu sur l'internet ouvert. Les signalements concernant des sites de destination sont plus efficaces lorsqu'ils sont également envoyés à l'hébergeur, au registraire du domaine ou au régulateur pertinent. L'autorité de l'Opérateur se limite aux liens courts qu'il publie sur {{operator.short_domain}}."],
        ["Références", "Code source : https://github.com/vanityURLs/code. Documentation : /en/docs/. Contact de sécurité lisible par machine : /.well-known/security.txt. Politique de mots-clés bloqués : https://github.com/vanityURLs/code/blob/main/defaults/v8s-policies.json."]
      ]
    },
    security: {
      note: "Information de sécurité pour {{legal_name}}.",
      lastUpdated: "Dernière mise à jour :",
      sections: [
        ["Modèle de sécurité", "Cette instance est un service de redirection basé sur des actifs statiques et un Cloudflare Worker. Par défaut, elle ne devrait pas exposer d'API publique d'écriture, de comptes visiteurs, de témoins ou d'analytique côté client."],
        ["Infrastructure", "{{legal_name}} devrait utiliser les contrôles de sécurité Cloudflare, la protection d'accès pour les chemins opérationnels, la validation sécuritaire des cibles de redirection et des politiques de blocage adaptées à ce déploiement."],
        ["Signalement de vulnérabilités", "Si vous découvrez un problème de sécurité touchant {{short_domain}}, signalez-le en privé à {{security_contact}}. Cette adresse doit correspondre à la ligne Contact de security.txt. Ne publiez pas les détails d'exploitation avant que l'opérateur ait eu le temps de répondre."],
        ["Sécurité du projet", "Les problèmes de sécurité dans le logiciel vanityURLs lui-même peuvent être signalés via le processus d'avis de sécurité GitHub du projet."]
      ]
    }
  },
  es: {
    privacy: {
      note: "Declaración de privacidad de {{operator.legal_name}}, operado en {{operator.jurisdiction}}.",
      lastUpdated: "Última actualización:",
      sections: [
        ["Resumen", "Este servicio de enlaces cortos en {{operator.short_domain}} es operado por {{operator.legal_name}} en {{operator.jurisdiction}}. Es una instancia del proyecto open source vanityURLs, desplegada y personalizada por el operador y ofrecida sin costo."],
        ["Finalidad del tratamiento", "La información se procesa para entregar redirecciones, aplicar la política de uso aceptable de los Términos, detectar y bloquear tráfico abusivo y diagnosticar problemas operativos. Cuando la ley aplicable exige una base jurídica, el operador se basa en intereses legítimos para operar un servicio de redirección funcional y seguro."],
        ["Sin cuentas ni cookies", "Este redirector no aloja cuentas de visitantes, no establece cookies y no acepta enlaces enviados por visitantes en tiempo de ejecución. No se almacenan identificadores del lado del cliente."],
        ["Contacto de privacidad", "Para consultas de privacidad, contacte a {{operator.privacy_contact}}, responsable de la información personal de esta instancia."],
        ["Cómo funciona el servicio", "El servicio recibe una solicitud de URL corta, busca un destino en un archivo incluido en una instancia serverless al desplegarse y devuelve una redirección HTTP. La búsqueda ocurre completamente en memoria, sin lectura de base de datos en tiempo de solicitud y sin llamada a GitHub u otro sistema."],
        ["Información procesada al solicitar", "Para entregar cada redirección, Cloudflare edge proporciona la ruta solicitada, dirección IP del visitante desde cf-connecting-ip, código de país de request.cf.country, primer idioma de Accept-Language truncado a 35 caracteres, User-Agent, Referer, marca de tiempo y un identificador de correlación por solicitud."],
        ["Analítica", "Cuando la analítica del lado servidor está habilitada, el Worker envía un evento por redirección y un evento por uso de las páginas /expand al proveedor configurado. No se envía ningún evento cuando la analítica no está configurada."],
        ["Umami", "Umami recibe la ruta y query string solicitados, hostname, primer idioma de Accept-Language, Referer, User-Agent o cadena alternativa para bots, y la dirección IP del visitante según UMAMI_GEO_IP_MODE. Los eventos que no son pageview incluyen además slug, host de destino, país, centro de datos Cloudflare, identificador de correlación, tipo de evento y estado HTTP."],
        ["Modo IP de Umami", "El modo IP de Umami de esta instancia es: {{operator.umami_geo_ip_mode}}."],
        ["Fathom", "Fathom es llamado del lado servidor por el Worker. Por ello, Fathom no recibe la IP del visitante; ve la IP de salida del Worker de Cloudflare. El Worker reenvía origen y ruta, una lista permitida de parámetros de campaña y contenido, Referer y User-Agent. Se genera un número aleatorio nuevo por evento en lugar de un identificador estable."],
        ["Páginas /expand", "Las páginas /expand localizadas permiten ver el destino de un enlace corto sin redirección. Las solicitudes de vista previa envían a /_analytics/expand un cuerpo JSON pequeño con slug, estado efectivo, clasificación del resultado y hostname de destino resuelto."],
        ["Retención", "El Worker vanityURLs no tiene estado y no escribe datos persistentes propios. Cloudflare Workers Logs se conserva aproximadamente 3 días en el plan Free y 7 días en el plan Paid. Los logs HTTP de Cloudflare no se retienen por defecto salvo que el operador active Logpull Enterprise o Logpush."],
        ["DNS y auditoría de Cloudflare", "Las analíticas DNS autoritativas de Cloudflare conservan metadatos agregados hasta 31 días. Los registros de auditoría de Cloudflare registran cambios administrativos del operador y se conservan 18 meses en planes estándar."],
        ["Retención del proveedor analítico", "{{operator.analytics_disclosure}}"],
        ["Retención analítica", "{{operator.analytics_retention}}"],
        ["Subprocesadores", "Los subprocesadores de ejecución pueden incluir Cloudflare, Inc.; Conva Ventures Inc. cuando Fathom está habilitado; y Umami Software, Inc. cuando Umami Cloud alojado está habilitado. GitHub, Inc. forma parte de la cadena de suministro de compilación y no recibe tráfico de visitantes, IPs ni eventos analíticos."],
        ["Transferencias internacionales", "Como este servicio se entrega mediante la red edge global de Cloudflare, los datos de solicitud pueden procesarse en países distintos al del visitante. Cloudflare se basa en las salvaguardas descritas en su Data Processing Addendum."],
        ["Derechos y límites", "Este servicio está diseñado para procesar datos de visitantes de forma efímera. El operador no mantiene cuentas, identificadores, perfiles ni almacén persistente de información personal; no existe registro de visitante que consultar, corregir o eliminar."],
        ["Solicitudes controladas por el operador", "El operador puede actuar sobre solicitudes dirigidas a la configuración que controla, como retirar un enlace corto específico del registro. Las consultas de privacidad pueden enviarse a {{operator.privacy_contact}}."],
        ["Niños", "Este servicio no está dirigido a menores de 13 años, o la edad mínima equivalente en la jurisdicción del visitante, y no recopila información de ellos conscientemente."],
        ["Cambios", "Esta página puede actualizarse para reflejar cambios operativos. La fecha de última actualización indica la revisión vigente."]
      ]
    },
    terms: {
      note: "Términos y condiciones de {{operator.legal_name}}, operado bajo {{operator.jurisdiction}}.",
      lastUpdated: "Última actualización:",
      sections: [
        ["El servicio", "El servicio de enlaces cortos en {{operator.short_domain}} (el «Servicio») es operado por {{operator.legal_name}} (el «Operador»). El Servicio redirige URL cortas a destinos elegidos por el Operador. Se ofrece a los visitantes sin cargo y sin registro."],
        ["Uso aceptable", "Los visitantes pueden seguir los enlaces cortos publicados. Los visitantes no deben intentar sondear, escanear, sobrecargar, aplicar ingeniería inversa o interferir con el Servicio, ni usarlo para facilitar actividades ilícitas. El Operador no acepta enlaces enviados por visitantes; cualquier enlace corto en este dominio ha sido publicado por el Operador y puede agregarse, modificarse o eliminarse en cualquier momento."],
        ["Derecho del Operador a desactivar enlaces", "El Operador puede desactivar, reemplazar o eliminar cualquier enlace corto a su sola discreción, con o sin aviso, por cualquier motivo, incluidos motivos operativos, legales, de seguridad o reputación. Los enlaces desactivados pueden devolver un error HTTP o una página de aviso."],
        ["Destinos de terceros y ausencia de respaldo", "Un enlace corto puede redirigir a un sitio web operado por un tercero. El Operador no controla, supervisa ni respalda el contenido, la disponibilidad, la exactitud ni las prácticas de privacidad de los destinos de terceros. Publicar un enlace corto no constituye respaldo del destino ni de su operador."],
        ["Propiedad intelectual", "El software vanityURLs es de código abierto y se publica bajo la licencia indicada en el repositorio del proyecto en https://github.com/vanityURLs/code. El nombre del dominio corto, la marca y la configuración de enlaces son propiedad del Operador."],
        ["Sin garantía", "EL SERVICIO SE PROPORCIONA «TAL CUAL» Y «SEGÚN DISPONIBILIDAD», SIN GARANTÍA DE NINGÚN TIPO, EXPRESA O IMPLÍCITA, INCLUIDAS, ENTRE OTRAS, LAS GARANTÍAS IMPLÍCITAS DE COMERCIABILIDAD, IDONEIDAD PARA UN FIN PARTICULAR, NO INFRACCIÓN, EXACTITUD O FUNCIONAMIENTO ININTERRUMPIDO O LIBRE DE ERRORES. EL OPERADOR NO GARANTIZA QUE CUALQUIER ENLACE CORTO ESTÉ DISPONIBLE EN UN MOMENTO DETERMINADO, QUE LOS DESTINOS SIGAN SIENDO ACCESIBLES O QUE EL SERVICIO ESTÉ LIBRE DE DEFECTOS O VULNERABILIDADES DE SEGURIDAD."],
        ["Limitación de responsabilidad", "EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY APLICABLE, EN NINGÚN CASO EL OPERADOR, SUS COLABORADORES O SUS PROVEEDORES SERÁN RESPONSABLES DE DAÑOS DIRECTOS, INDIRECTOS, INCIDENTALES, ESPECIALES, CONSECUENTES, PUNITIVOS O EJEMPLARES, INCLUIDOS, SIN LIMITACIÓN, DAÑOS POR PÉRDIDA DE BENEFICIOS, DATOS, INTERRUPCIÓN DEL NEGOCIO O PÉRDIDA DE FONDO DE COMERCIO, QUE SURJAN DE O ESTÉN RELACIONADOS CON EL USO, LA IMPOSIBILIDAD DE USO O LA CONFIANZA EN EL SERVICIO O EN CUALQUIER DESTINO ALCANZADO A TRAVÉS DE ÉL, INCLUSO SI EL OPERADOR HA SIDO ADVERTIDO DE LA POSIBILIDAD DE TALES DAÑOS. ALGUNAS JURISDICCIONES NO PERMITEN LA EXCLUSIÓN O LIMITACIÓN DE CIERTOS DAÑOS; EN ESAS JURISDICCIONES, LA RESPONSABILIDAD DEL OPERADOR SE LIMITA EN LA MAYOR MEDIDA PERMITIDA POR LA LEY."],
        ["Reportes", "Los reportes de enlaces abusivos y las divulgaciones de vulnerabilidades de seguridad se gestionan mediante la página de Confianza y seguridad."],
        ["Ley aplicable", "Estos Términos se rigen por {{operator.governing_law}}, sin tener en cuenta sus reglas de conflicto de leyes. Cualquier disputa derivada de estos Términos o del uso del Servicio deberá presentarse exclusivamente ante los tribunales de {{operator.jurisdiction}}, salvo cuando la ley aplicable otorgue un derecho irrenunciable a iniciar procedimientos en otro lugar."],
        ["Cambios", "Estos Términos pueden actualizarse para reflejar cambios operativos, legales o técnicos. El uso continuado del Servicio después de un cambio constituye la aceptación de los Términos actualizados. La fecha de última actualización anterior indica la revisión vigente."],
        ["Contacto", "Las preguntas sobre estos Términos pueden enviarse a {{operator.contact_email}}."]
      ]
    },
    abuse: {
      note: "Información de confianza y seguridad de {{operator.legal_name}}.",
      lastUpdated: "Última actualización:",
      sections: [
        ["Resumen", "Esta página es el punto único de contacto para reportar enlaces cortos abusivos y divulgar vulnerabilidades de seguridad que afecten a {{operator.short_domain}}. Complementa el contacto legible por máquina publicado en /.well-known/security.txt de conformidad con RFC 9116."],
        ["Reportar un enlace abusivo", "Reporte cualquier enlace corto de este dominio que parezca usarse para phishing, distribución de malware, robo de credenciales, spam, acoso, suplantación, infracción de derechos de autor o marcas, difamación u otro propósito dañino."],
        ["Dónde enviar reportes", "Envíe los reportes a {{operator.abuse_contact}}. Hay una plantilla estructurada disponible en /abuse-report.md; cópiela, complete los campos y pegue el resultado en el cuerpo del correo."],
        ["Respuesta", "El Operador acusará recibo de reportes bien formados según su mejor esfuerzo, normalmente dentro de {{operator.abuse_response_window}}, y puede desactivar enlaces afectados, actualizar la política de palabras clave bloqueadas en la configuración open source o tomar otra medida coherente con los Términos. No se ofrece acuerdo de nivel de servicio; es una respuesta de mejor esfuerzo."],
        ["Material de abuso sexual infantil y daño inminente", "Si cree que un enlace corto apunta a material de abuso sexual infantil, repórtelo directamente a la autoridad apropiada además de contactar al Operador. Canadá: Cybertip.ca. Estados Unidos: NCMEC CyberTipline. Unión Europea y mundial: líneas directas de la red INHOPE. Para cualquier otra situación con peligro físico inminente, contacte primero a los servicios de emergencia locales."],
        ["Divulgación de vulnerabilidades de seguridad", "Si descubre una vulnerabilidad de seguridad en esta instancia, repórtela de forma privada a {{operator.security_contact}}. El mismo contacto se publica en /.well-known/security.txt."],
        ["Dentro del alcance", "El dominio {{operator.short_domain}} y el código de Cloudflare Worker desplegado en ese dominio están dentro del alcance, junto con errores de configuración de reglas de redirección, políticas de bloqueo o controles de acceso específicos de esta instancia."],
        ["Fuera del alcance", "Las vulnerabilidades en infraestructura de Cloudflare deben reportarse directamente al programa HackerOne de Cloudflare. Las vulnerabilidades en GitHub deben reportarse mediante el programa HackerOne de GitHub. Las vulnerabilidades del software open source vanityURLs upstream deben reportarse mediante los avisos de seguridad de GitHub del proyecto, no en una issue pública. Los hallazgos que requieran credenciales, ingeniería social del Operador, denegación de servicio o acceso físico están fuera del alcance."],
        ["Puerto seguro", "La investigación de seguridad de buena fe realizada dentro del alcance anterior, que respete la privacidad de los visitantes, evite interrupciones del servicio, no acceda ni modifique datos más allá de lo necesario para demostrar el problema y siga una divulgación coordinada, no será objeto de acción legal por parte del Operador. Este puerto seguro no vincula a terceros ni autoriza actividades que violen la ley aplicable."],
        ["Divulgación coordinada", "Permita una ventana razonable de remediación antes de la divulgación pública. Noventa días es la expectativa predeterminada, menos cuando la corrección sea trivial y más cuando se requiera coordinación con mantenedores upstream. El Operador mantendrá informados a los investigadores y dará crédito a quienes deseen ser reconocidos."],
        ["Lo que no podemos hacer", "El Operador no actúa como moderador general de contenido para internet abierto. Los reportes sobre sitios de destino suelen ser más efectivos cuando también se envían al proveedor de alojamiento, registrador de dominio o regulador correspondiente. La autoridad del Operador se limita a los enlaces cortos que publica en {{operator.short_domain}}."],
        ["Material de referencia", "Código fuente: https://github.com/vanityURLs/code. Documentación: /en/docs/. Contacto de seguridad legible por máquina: /.well-known/security.txt. Política de palabras clave bloqueadas: https://github.com/vanityURLs/code/blob/main/defaults/v8s-policies.json."]
      ]
    }
  },
  it: {
    privacy: {
      note: "Informativa privacy per {{operator.legal_name}}, gestita in {{operator.jurisdiction}}.",
      lastUpdated: "Ultimo aggiornamento:",
      sections: [
        ["Panoramica", "Questo servizio di link brevi presso {{operator.short_domain}} è gestito da {{operator.legal_name}} in {{operator.jurisdiction}}. È un'istanza del progetto open source vanityURLs, distribuita e personalizzata dall'operatore e fornita gratuitamente."],
        ["Finalità del trattamento", "Le informazioni sono trattate per fornire reindirizzamenti, applicare la policy di uso accettabile indicata nei Termini, rilevare e bloccare traffico abusivo e diagnosticare problemi operativi. Dove la legge richiede una base giuridica, l'operatore si basa sui legittimi interessi nel gestire un servizio di reindirizzamento funzionale e sicuro."],
        ["Nessun account o cookie", "Questo redirector non ospita account visitatore, non imposta cookie e non accetta link inviati dai visitatori a runtime. Nessun identificatore viene archiviato lato client."],
        ["Contatto privacy", "Per richieste privacy, contatta {{operator.privacy_contact}}, responsabile delle informazioni personali per questa istanza."],
        ["Funzionamento del servizio", "Il servizio riceve una richiesta di URL breve, cerca una destinazione in un file incluso in un'istanza serverless al momento del deploy e restituisce un reindirizzamento HTTP. La ricerca avviene interamente in memoria, senza letture database a runtime e senza chiamate a GitHub o altri sistemi."],
        ["Informazioni trattate alla richiesta", "Per ogni reindirizzamento, Cloudflare edge fornisce percorso richiesto, indirizzo IP del visitatore dall'header cf-connecting-ip, codice paese da request.cf.country, primo tag Accept-Language troncato a 35 caratteri, User-Agent, Referer, timestamp e identificatore di correlazione per richiesta."],
        ["Pipeline analytics", "Quando l'analytics server-side è abilitata, il Worker invia un evento per reindirizzamento e un evento per uso delle pagine /expand al provider configurato. Nessun evento è inviato quando l'analytics non è configurata."],
        ["Umami", "Umami riceve percorso e query string richiesti, hostname, primo tag Accept-Language, Referer, User-Agent o stringa alternativa per bot e indirizzo IP del visitatore secondo UMAMI_GEO_IP_MODE. Gli eventi non pageview includono anche slug, host di destinazione, paese, data center Cloudflare, identificatore di correlazione, tipo evento e stato HTTP."],
        ["Modalità IP Umami", "La modalità IP Umami di questa istanza è: {{operator.umami_geo_ip_mode}}."],
        ["Fathom", "Fathom è chiamato server-side dal Worker. Di conseguenza, Fathom non riceve l'IP del visitatore; vede solo l'IP di uscita del Worker Cloudflare. Il Worker inoltra origine e percorso, una allowlist di parametri campagna e contenuto, Referer e User-Agent. Un numero casuale nuovo viene generato per evento al posto di un identificatore stabile."],
        ["Pagine /expand", "Le pagine /expand localizzate permettono di vedere la destinazione di un link breve senza reindirizzamento. Le richieste di anteprima inviano a /_analytics/expand un piccolo corpo JSON con slug, stato effettivo, classificazione del risultato e hostname di destinazione risolto."],
        ["Conservazione", "Il Worker vanityURLs è stateless e non scrive dati persistenti propri. Cloudflare Workers Logs è conservato circa 3 giorni nel piano Free e 7 giorni nel piano Paid. I log HTTP Cloudflare non sono conservati di default salvo Logpull Enterprise o Logpush configurati dall'operatore."],
        ["DNS e audit Cloudflare", "Le analytics DNS autoritative Cloudflare conservano metadati aggregati fino a 31 giorni. Gli audit log Cloudflare registrano modifiche amministrative dell'operatore e sono conservati 18 mesi nei piani standard."],
        ["Conservazione del provider analytics", "{{operator.analytics_disclosure}}"],
        ["Conservazione analytics", "{{operator.analytics_retention}}"],
        ["Sub-responsabili", "I sub-responsabili runtime possono includere Cloudflare, Inc.; Conva Ventures Inc. quando Fathom è abilitato; e Umami Software, Inc. quando Umami Cloud ospitato è abilitato. GitHub, Inc. fa parte della supply chain di build e non riceve traffico visitatore, IP o eventi analytics."],
        ["Trasferimenti internazionali", "Poiché il servizio è fornito tramite la rete edge globale Cloudflare, i dati delle richieste possono essere trattati in paesi diversi da quello del visitatore. Cloudflare si basa sulle garanzie descritte nel suo Data Processing Addendum."],
        ["Diritti e limiti", "Il servizio è progettato per trattare dati dei visitatori in modo effimero. L'operatore non mantiene account, identificatori, profili o archivi persistenti di informazioni personali; non esiste un record visitatore da consultare, correggere o eliminare."],
        ["Richieste controllate dall'operatore", "L'operatore può agire su richieste che riguardano la configurazione controllata dall'operatore, come rimuovere uno specifico link breve dal registro. Le richieste privacy possono essere inviate a {{operator.privacy_contact}}."],
        ["Minori", "Questo servizio non è rivolto a minori di 13 anni, o all'età minima equivalente nella giurisdizione del visitatore, e non raccoglie consapevolmente informazioni da loro."],
        ["Modifiche", "Questa pagina può essere aggiornata per riflettere modifiche operative. La data di ultimo aggiornamento indica la revisione corrente."]
      ]
    },
    terms: {
      note: "Termini e condizioni per {{operator.legal_name}}, gestito sotto {{operator.jurisdiction}}.",
      lastUpdated: "Ultimo aggiornamento:",
      sections: [
        ["Il servizio", "Il servizio di link brevi presso {{operator.short_domain}} (il «Servizio») è gestito da {{operator.legal_name}} (l'«Operatore»). Il Servizio reindirizza URL brevi verso destinazioni scelte dall'Operatore. È fornito ai visitatori gratuitamente e senza registrazione."],
        ["Uso consentito", "I visitatori possono seguire i link brevi pubblicati. I visitatori non devono tentare di sondare, scansionare, sovraccaricare, decodificare o interferire con il Servizio, né usarlo per facilitare attività illecite. L'Operatore non accetta link inviati dai visitatori; ogni link breve su questo dominio è stato pubblicato dall'Operatore e può essere aggiunto, modificato o rimosso in qualsiasi momento."],
        ["Diritto dell'Operatore di disattivare link", "L'Operatore può disattivare, sostituire o rimuovere qualsiasi link breve a propria esclusiva discrezione, con o senza preavviso, per qualsiasi motivo, inclusi motivi operativi, legali, di sicurezza o reputazionali. I link disattivati possono restituire un errore HTTP o una pagina di avviso."],
        ["Destinazioni di terzi e assenza di approvazione", "Un link breve può reindirizzare a un sito web gestito da terzi. L'Operatore non controlla, monitora né approva il contenuto, la disponibilità, l'accuratezza o le pratiche sulla privacy delle destinazioni di terzi. La pubblicazione di un link breve non costituisce approvazione della destinazione o del suo operatore."],
        ["Proprietà intellettuale", "Il software vanityURLs è open source ed è rilasciato con la licenza indicata nel repository del progetto all'indirizzo https://github.com/vanityURLs/code. Il nome del dominio breve, il marchio e la configurazione dei link sono proprietà dell'Operatore."],
        ["Nessuna garanzia", "IL SERVIZIO È FORNITO «COSÌ COM'È» E «SECONDO DISPONIBILITÀ», SENZA GARANZIE DI ALCUN TIPO, ESPRESSE O IMPLICITE, INCLUSE, A TITOLO ESEMPLIFICATIVO, GARANZIE IMPLICITE DI COMMERCIABILITÀ, IDONEITÀ A UNO SCOPO PARTICOLARE, NON VIOLAZIONE, ACCURATEZZA O FUNZIONAMENTO ININTERROTTO O PRIVO DI ERRORI. L'OPERATORE NON GARANTISCE CHE UN LINK BREVE SIA DISPONIBILE IN UN DATO MOMENTO, CHE LE DESTINAZIONI RESTINO RAGGIUNGIBILI O CHE IL SERVIZIO SIA PRIVO DI DIFETTI O VULNERABILITÀ DI SICUREZZA."],
        ["Limitazione di responsabilità", "NELLA MISURA MASSIMA CONSENTITA DALLA LEGGE APPLICABILE, IN NESSUN CASO L'OPERATORE, I SUOI CONTRIBUTORI O I SUOI FORNITORI SARANNO RESPONSABILI PER DANNI DIRETTI, INDIRETTI, INCIDENTALI, SPECIALI, CONSEQUENZIALI, PUNITIVI O ESEMPLARI, INCLUSI, SENZA LIMITAZIONE, DANNI PER PERDITA DI PROFITTI, DATI, INTERRUZIONE DELL'ATTIVITÀ O PERDITA DI AVVIAMENTO, DERIVANTI DA O RELATIVI ALL'USO, ALL'IMPOSSIBILITÀ DI USARE O ALL'AFFIDAMENTO SUL SERVIZIO O SU QUALSIASI DESTINAZIONE RAGGIUNTA TRAMITE ESSO, ANCHE SE L'OPERATORE È STATO INFORMATO DELLA POSSIBILITÀ DI TALI DANNI. ALCUNE GIURISDIZIONI NON CONSENTONO L'ESCLUSIONE O LA LIMITAZIONE DI DETERMINATI DANNI; IN TALI GIURISDIZIONI LA RESPONSABILITÀ DELL'OPERATORE È LIMITATA NELLA MISURA MASSIMA CONSENTITA DALLA LEGGE."],
        ["Segnalazioni", "Le segnalazioni di link abusivi e le divulgazioni di vulnerabilità di sicurezza sono gestite tramite la pagina Fiducia e sicurezza."],
        ["Legge applicabile", "I presenti Termini sono disciplinati da {{operator.governing_law}}, senza riguardo alle norme sui conflitti di legge. Qualsiasi controversia derivante dai presenti Termini o dall'uso del Servizio dovrà essere proposta esclusivamente davanti ai tribunali di {{operator.jurisdiction}}, salvo quando la legge applicabile conceda un diritto inderogabile di avviare procedimenti altrove."],
        ["Modifiche", "I presenti Termini possono essere aggiornati per riflettere cambiamenti operativi, legali o tecnici. L'uso continuato del Servizio dopo una modifica costituisce accettazione dei Termini aggiornati. La data di ultimo aggiornamento sopra indicata identifica la revisione corrente."],
        ["Contatto", "Le domande su questi Termini possono essere inviate a {{operator.contact_email}}."]
      ]
    },
    abuse: {
      note: "Informazioni su fiducia e sicurezza per {{operator.legal_name}}.",
      lastUpdated: "Ultimo aggiornamento:",
      sections: [
        ["Panoramica", "Questa pagina è il punto di contatto unico per segnalare link brevi abusivi e divulgare vulnerabilità di sicurezza che riguardano {{operator.short_domain}}. Integra il contatto leggibile automaticamente pubblicato in /.well-known/security.txt in conformità con RFC 9116."],
        ["Segnalare un link abusivo", "Segnala qualsiasi link breve su questo dominio che sembri usato per phishing, distribuzione di malware, furto di credenziali, spam, molestie, impersonificazione, violazione di copyright o marchi, diffamazione o altro scopo dannoso."],
        ["Dove inviare le segnalazioni", "Invia le segnalazioni a {{operator.abuse_contact}}. Un modello strutturato è disponibile in /abuse-report.md; copialo, compila i campi e incolla il risultato nel corpo dell'email."],
        ["Risposta", "L'Operatore confermerà le segnalazioni ben formate secondo il massimo impegno, in genere entro {{operator.abuse_response_window}}, e può disattivare i link interessati, aggiornare la policy delle parole chiave bloccate nella configurazione open source o adottare altre misure coerenti con i Termini. Non viene offerto alcun accordo sul livello di servizio; la risposta è best effort."],
        ["Materiale di abuso sessuale su minori e pericolo imminente", "Se ritieni che un link breve punti a materiale di abuso sessuale su minori, segnalalo direttamente all'autorità competente oltre a contattare l'Operatore. Canada: Cybertip.ca. Stati Uniti: NCMEC CyberTipline. Unione Europea e mondo: hotline della rete INHOPE. Per qualsiasi altra situazione con pericolo fisico imminente, contatta prima i servizi di emergenza locali."],
        ["Divulgazione di vulnerabilità di sicurezza", "Se scopri una vulnerabilità di sicurezza in questa istanza, segnalala privatamente a {{operator.security_contact}}. Lo stesso contatto è pubblicato in /.well-known/security.txt."],
        ["Nel perimetro", "Il dominio {{operator.short_domain}} e il codice Cloudflare Worker distribuito su quel dominio sono nel perimetro, insieme a errori di configurazione di regole di reindirizzamento, policy di blocco o controlli di accesso specifici di questa istanza."],
        ["Fuori perimetro", "Le vulnerabilità nell'infrastruttura Cloudflare devono essere segnalate direttamente al programma HackerOne di Cloudflare. Le vulnerabilità in GitHub devono essere segnalate tramite il programma HackerOne di GitHub. Le vulnerabilità nel software open source vanityURLs upstream devono essere segnalate tramite gli avvisi di sicurezza GitHub del progetto, non in una issue pubblica. I risultati che richiedono credenziali, social engineering dell'Operatore, denial of service o accesso fisico sono fuori perimetro."],
        ["Safe harbour", "La ricerca di sicurezza in buona fede condotta nel perimetro indicato, che rispetta la privacy dei visitatori, evita interruzioni del servizio, non accede né modifica dati oltre quanto necessario per dimostrare il problema e segue la divulgazione coordinata, non sarà oggetto di azione legale da parte dell'Operatore. Questo safe harbour non vincola terzi e non autorizza attività che violano la legge applicabile."],
        ["Divulgazione coordinata", "Concedi una finestra ragionevole di correzione prima della divulgazione pubblica. Novanta giorni è l'aspettativa predefinita, più breve quando la correzione è banale, più lunga quando è necessario coordinarsi con i manutentori upstream. L'Operatore terrà informati i ricercatori e accrediterà chi desidera essere riconosciuto."],
        ["Cosa non possiamo fare", "L'Operatore non agisce come moderatore generale dei contenuti dell'internet aperta. Le segnalazioni sui siti di destinazione sono più efficaci se inviate anche al provider di hosting, al registrar del dominio o al regolatore pertinente. L'autorità dell'Operatore è limitata ai link brevi che pubblica su {{operator.short_domain}}."],
        ["Materiale di riferimento", "Codice sorgente: https://github.com/vanityURLs/code. Documentazione: /en/docs/. Contatto di sicurezza leggibile automaticamente: /.well-known/security.txt. Policy delle parole chiave bloccate: https://github.com/vanityURLs/code/blob/main/defaults/v8s-policies.json."]
      ]
    }
  },
  de: {
    privacy: {
      note: "Datenschutzerklärung für {{operator.legal_name}}, betrieben in {{operator.jurisdiction}}.",
      lastUpdated: "Zuletzt aktualisiert:",
      sections: [
        ["Überblick", "Dieser Kurzlink-Dienst unter {{operator.short_domain}} wird von {{operator.legal_name}} in {{operator.jurisdiction}} betrieben. Er ist eine Instanz des Open-Source-Projekts vanityURLs, vom Betreiber bereitgestellt und angepasst und kostenlos verfügbar."],
        ["Zweck der Verarbeitung", "Informationen werden verarbeitet, um Weiterleitungen auszuführen, die in den Bedingungen festgelegte Acceptable-Use-Policy durchzusetzen, missbräuchlichen Traffic zu erkennen und zu blockieren sowie Betriebsprobleme zu diagnostizieren. Soweit anwendbares Recht eine Rechtsgrundlage verlangt, stützt sich der Betreiber auf berechtigte Interessen am Betrieb eines funktionsfähigen und sicheren Weiterleitungsdienstes."],
        ["Keine Besucher-Konten oder Cookies", "Dieser Redirector hostet keine Besucher-Konten, setzt keine Cookies und akzeptiert zur Laufzeit keine von Besuchern eingereichten Links. Es werden keine Kennungen clientseitig gespeichert."],
        ["Datenschutzkontakt", "Für Datenschutzanfragen kontaktiere {{operator.privacy_contact}}, die verantwortliche Kontaktstelle für personenbezogene Informationen dieser Instanz."],
        ["Funktionsweise", "Der Dienst empfängt eine Kurz-URL-Anfrage, sucht ein Ziel in einer Datei, die beim Deployment in eine serverlose Instanz gebündelt wurde, und gibt eine HTTP-Weiterleitung zurück. Die Suche erfolgt vollständig im Speicher, ohne Datenbanklesung zur Anfragezeit und ohne Aufruf von GitHub oder anderen Systemen."],
        ["Bei Anfragen verarbeitete Informationen", "Für jede Weiterleitung stellt Cloudflare edge den angefragten Pfad, die Besucher-IP aus cf-connecting-ip, den Ländercode aus request.cf.country, den ersten Accept-Language-Tag auf 35 Zeichen gekürzt, User-Agent, Referer, Zeitstempel und eine pro Anfrage erzeugte Korrelationskennung bereit."],
        ["Analytics-Pipeline", "Wenn serverseitige Analytics aktiviert ist, sendet der Worker ein Ereignis pro Weiterleitung und ein Ereignis pro Nutzung der /expand-Vorschauseiten an den konfigurierten Anbieter. Ohne konfigurierte Analytics wird kein Ereignis gesendet."],
        ["Umami", "Umami erhält angefragten Pfad und Query String, Hostname, ersten Accept-Language-Tag, Referer, User-Agent oder Bot-Fallback-String sowie die Besucher-IP gemäß UMAMI_GEO_IP_MODE. Nicht-Pageview-Ereignisse enthalten zusätzlich Slug, Zielhost, Land, Cloudflare-Rechenzentrum, Korrelationskennung, Ereignistyp und HTTP-Status."],
        ["Umami-IP-Modus", "Der Umami-IP-Modus dieser Instanz ist: {{operator.umami_geo_ip_mode}}."],
        ["Fathom", "Fathom wird serverseitig vom Worker aufgerufen. Daher erhält Fathom nicht die IP-Adresse des Besuchers, sondern nur die Egress-IP des Cloudflare Workers. Der Worker leitet Ursprung und Pfad, eine Allowlist von Kampagnen- und Inhaltsparametern, Referer und User-Agent weiter. Pro Ereignis wird eine neue Zufallszahl statt einer stabilen Besucherkennung erzeugt."],
        ["/expand-Vorschauseiten", "Lokalisierte /expand-Seiten ermöglichen es, das Ziel eines Kurzlinks ohne Weiterleitung zu sehen. Vorschauanfragen senden einen kleinen JSON-Body an /_analytics/expand mit Slug, effektivem Status, Ergebnis-Klassifizierung und aufgelöstem Ziel-Hostname."],
        ["Aufbewahrung", "Der vanityURLs Worker ist zustandslos und schreibt keine eigenen persistenten Daten. Cloudflare Workers Logs werden etwa 3 Tage im Free-Plan und 7 Tage im Paid-Plan aufbewahrt. Cloudflare HTTP-Request-Logs werden standardmäßig nicht gespeichert, außer der Betreiber aktiviert Enterprise Logpull oder Logpush."],
        ["Cloudflare DNS und Audit", "Cloudflare authoritative DNS analytics speichern aggregierte Metadaten bis zu 31 Tage. Cloudflare Audit Logs erfassen administrative Änderungen des Betreibers und werden unter Standardplänen 18 Monate aufbewahrt."],
        ["Aufbewahrung beim Analytics-Anbieter", "{{operator.analytics_disclosure}}"],
        ["Analytics-Aufbewahrung", "{{operator.analytics_retention}}"],
        ["Subprozessoren", "Runtime-Subprozessoren können Cloudflare, Inc.; Conva Ventures Inc. bei aktiviertem Fathom; und Umami Software, Inc. bei gehostetem Umami Cloud umfassen. GitHub, Inc. ist Teil der Build-Lieferkette und erhält keinen Besucher-Traffic, keine IP-Adressen und keine Analytics-Ereignisse."],
        ["Internationale Übermittlungen", "Da dieser Dienst über Cloudflares globales Edge-Netzwerk bereitgestellt wird, können Anfragedaten in anderen Ländern als dem des Besuchers verarbeitet werden. Cloudflare stützt sich auf die in seinem Data Processing Addendum beschriebenen Garantien."],
        ["Rechte und Grenzen", "Dieser Dienst ist so gestaltet, dass Besucherdaten flüchtig verarbeitet werden. Der Betreiber führt keine Besucher-Konten, Kennungen, Profile oder persistenten Speicher personenbezogener Informationen; es gibt keinen Besucher-Datensatz, der abgerufen, korrigiert oder gelöscht werden könnte."],
        ["Betreiberkontrollierte Anfragen", "Der Betreiber kann Anfragen bearbeiten, die die von ihm kontrollierte Konfiguration betreffen, etwa das Entfernen eines bestimmten Kurzlinks aus dem Weiterleitungsregister. Datenschutzanfragen können an {{operator.privacy_contact}} gesendet werden."],
        ["Kinder", "Dieser Dienst richtet sich nicht an Kinder unter 13 Jahren oder das entsprechende Mindestalter in der Jurisdiktion des Besuchers und sammelt wissentlich keine Informationen von ihnen."],
        ["Änderungen", "Diese Seite kann aktualisiert werden, um betriebliche Änderungen widerzuspiegeln. Das Datum der letzten Aktualisierung gibt die aktuelle Fassung an."]
      ]
    },
    terms: {
      note: "Nutzungsbedingungen für {{operator.legal_name}}, betrieben unter {{operator.jurisdiction}}.",
      lastUpdated: "Zuletzt aktualisiert:",
      sections: [
        ["Der Dienst", "Der Kurzlink-Dienst unter {{operator.short_domain}} (der «Dienst») wird von {{operator.legal_name}} (dem «Betreiber») betrieben. Der Dienst leitet kurze URLs an vom Betreiber ausgewählte Ziele weiter. Er wird Besuchern kostenlos und ohne Registrierung bereitgestellt."],
        ["Zulässige Nutzung", "Besucher dürfen veröffentlichte Kurzlinks aufrufen. Besucher dürfen nicht versuchen, den Dienst zu sondieren, zu scannen, zu überlasten, zurückzuentwickeln oder zu stören, und ihn nicht zur Ermöglichung rechtswidriger Aktivitäten verwenden. Der Betreiber akzeptiert keine von Besuchern eingereichten Links; jeder Kurzlink auf dieser Domain wurde vom Betreiber veröffentlicht und kann jederzeit hinzugefügt, geändert oder entfernt werden."],
        ["Recht des Betreibers zur Deaktivierung von Links", "Der Betreiber kann jeden Kurzlink nach eigenem Ermessen mit oder ohne Ankündigung aus beliebigem Grund deaktivieren, ersetzen oder entfernen, einschließlich aus betrieblichen, rechtlichen, sicherheitsbezogenen oder reputationsbezogenen Gründen. Deaktivierte Links können einen HTTP-Fehler oder eine Hinweisseite zurückgeben."],
        ["Ziele Dritter und keine Billigung", "Ein Kurzlink kann auf eine von Dritten betriebene Website weiterleiten. Der Betreiber kontrolliert, überwacht oder billigt Inhalt, Verfügbarkeit, Richtigkeit oder Datenschutzpraktiken von Zielen Dritter nicht. Die Veröffentlichung eines Kurzlinks stellt keine Billigung des Ziels oder seines Betreibers dar."],
        ["Geistiges Eigentum", "Die vanityURLs-Software ist Open Source und wird unter der im Projekt-Repository unter https://github.com/vanityURLs/code angegebenen Lizenz veröffentlicht. Der Kurzdomainname, das Branding und die Linkkonfiguration sind Eigentum des Betreibers."],
        ["Keine Gewährleistung", "DER DIENST WIRD «WIE BESEHEN» UND «WIE VERFÜGBAR» OHNE GEWÄHRLEISTUNG JEGLICHER ART, AUSDRÜCKLICH ODER STILLSCHWEIGEND, BEREITGESTELLT, EINSCHLIESSLICH, ABER NICHT BESCHRÄNKT AUF STILLSCHWEIGENDE GEWÄHRLEISTUNGEN DER MARKTGÄNGIGKEIT, EIGNUNG FÜR EINEN BESTIMMTEN ZWECK, NICHTVERLETZUNG, RICHTIGKEIT ODER UNUNTERBROCHENEN ODER FEHLERFREIEN BETRIEB. DER BETREIBER GEWÄHRLEISTET NICHT, DASS EIN KURZLINK ZU EINEM BESTIMMTEN ZEITPUNKT VERFÜGBAR IST, DASS ZIELE ERREICHBAR BLEIBEN ODER DASS DER DIENST FREI VON MÄNGELN ODER SICHERHEITSSCHWACHSTELLEN IST."],
        ["Haftungsbeschränkung", "SOWEIT NACH ANWENDBAREM RECHT ZULÄSSIG, HAFTEN DER BETREIBER, SEINE MITWIRKENDEN ODER SEINE LIEFERANTEN IN KEINEM FALL FÜR DIREKTE, INDIREKTE, ZUFÄLLIGE, BESONDERE, FOLGE-, STRAF- ODER EXEMPLARISCHE SCHÄDEN, EINSCHLIESSLICH, OHNE EINSCHRÄNKUNG, SCHÄDEN AUS ENTGANGENEM GEWINN, DATENVERLUST, BETRIEBSUNTERBRECHUNG ODER VERLUST VON GOODWILL, DIE AUS DER NUTZUNG, DER UNMÖGLICHKEIT DER NUTZUNG ODER DEM VERTRAUEN AUF DEN DIENST ODER EIN DARÜBER ERREICHTES ZIEL ENTSTEHEN ODER DAMIT ZUSAMMENHÄNGEN, SELBST WENN DER BETREIBER AUF DIE MÖGLICHKEIT SOLCHER SCHÄDEN HINGEWIESEN WURDE. EINIGE RECHTSORDNUNGEN ERLAUBEN DEN AUSSCHLUSS ODER DIE BESCHRÄNKUNG BESTIMMTER SCHÄDEN NICHT; IN DIESEN RECHTSORDNUNGEN IST DIE HAFTUNG DES BETREIBERS AUF DAS GESETZLICH ZULÄSSIGE HÖCHSTMASS BESCHRÄNKT."],
        ["Meldungen", "Meldungen missbräuchlicher Links und Offenlegungen von Sicherheitslücken werden über die Seite Vertrauen und Sicherheit behandelt."],
        ["Anwendbares Recht", "Diese Bedingungen unterliegen {{operator.governing_law}}, ohne Berücksichtigung kollisionsrechtlicher Regeln. Jede Streitigkeit aus diesen Bedingungen oder der Nutzung des Dienstes ist ausschließlich vor den Gerichten von {{operator.jurisdiction}} zu bringen, es sei denn, anwendbares Recht gewährt ein unabdingbares Recht, Verfahren anderswo einzuleiten."],
        ["Änderungen", "Diese Bedingungen können aktualisiert werden, um betriebliche, rechtliche oder technische Änderungen widerzuspiegeln. Die fortgesetzte Nutzung des Dienstes nach einer Änderung gilt als Annahme der aktualisierten Bedingungen. Das oben angegebene Datum der letzten Aktualisierung kennzeichnet die aktuelle Fassung."],
        ["Kontakt", "Fragen zu diesen Bedingungen können an {{operator.contact_email}} gesendet werden."]
      ]
    },
    abuse: {
      note: "Informationen zu Vertrauen und Sicherheit für {{operator.legal_name}}.",
      lastUpdated: "Zuletzt aktualisiert:",
      sections: [
        ["Überblick", "Diese Seite ist die zentrale Kontaktstelle zum Melden missbräuchlicher Kurzlinks und zur Offenlegung von Sicherheitslücken, die {{operator.short_domain}} betreffen. Sie ergänzt den maschinenlesbaren Kontakt unter /.well-known/security.txt gemäß RFC 9116."],
        ["Missbräuchlichen Link melden", "Melde jeden Kurzlink auf dieser Domain, der für Phishing, Malware-Verbreitung, Zugangsdaten-Diebstahl, Spam, Belästigung, Identitätsmissbrauch, Urheberrechts- oder Markenverletzung, Verleumdung oder einen anderen schädlichen Zweck genutzt zu werden scheint."],
        ["Wohin Meldungen gesendet werden", "Sende Meldungen an {{operator.abuse_contact}}. Eine strukturierte Vorlage ist unter /abuse-report.md verfügbar; kopiere sie, fülle die Felder aus und füge das Ergebnis in den Text deiner E-Mail ein."],
        ["Antwort", "Der Betreiber bestätigt gut strukturierte Meldungen nach bestem Aufwand, typischerweise innerhalb von {{operator.abuse_response_window}}, und kann betroffene Links deaktivieren, die Block-Keyword-Policy in der Open-Source-Konfiguration aktualisieren oder andere mit den Bedingungen vereinbare Maßnahmen ergreifen. Es wird keine Service-Level-Vereinbarung angeboten; die Antwort erfolgt nach bestem Aufwand."],
        ["Material sexuellen Kindesmissbrauchs und unmittelbare Gefahr", "Wenn du glaubst, dass ein Kurzlink auf Material sexuellen Kindesmissbrauchs verweist, melde dies zusätzlich zur Kontaktaufnahme mit dem Betreiber direkt der zuständigen Stelle. Kanada: Cybertip.ca. Vereinigte Staaten: NCMEC CyberTipline. Europäische Union und weltweit: Hotlines des INHOPE-Netzwerks. Bei jeder anderen Situation mit unmittelbarer körperlicher Gefahr kontaktiere zuerst die örtlichen Notdienste."],
        ["Offenlegung von Sicherheitslücken", "Wenn du eine Sicherheitslücke in dieser Instanz entdeckst, melde sie vertraulich an {{operator.security_contact}}. Derselbe Kontakt ist in /.well-known/security.txt veröffentlicht."],
        ["Im Geltungsbereich", "Die Domain {{operator.short_domain}} und der auf dieser Domain bereitgestellte Cloudflare-Worker-Code liegen im Geltungsbereich, ebenso Fehlkonfigurationen von Weiterleitungsregeln, Block-Policies oder Zugriffskontrollen, die spezifisch für diese Instanz sind."],
        ["Außerhalb des Geltungsbereichs", "Schwachstellen in der Cloudflare-Infrastruktur sollten direkt an Cloudflares HackerOne-Programm gemeldet werden. Schwachstellen in GitHub sollten über GitHubs HackerOne-Programm gemeldet werden. Schwachstellen in der upstream Open-Source-Software vanityURLs sollten über die GitHub Security Advisories des Projekts gemeldet werden, nicht über ein öffentliches GitHub-Issue. Befunde, die Zugangsdaten, Social Engineering des Betreibers, Denial of Service oder physischen Zugriff erfordern, liegen außerhalb des Geltungsbereichs."],
        ["Safe Harbour", "Sicherheitsforschung in gutem Glauben innerhalb des oben genannten Geltungsbereichs, die die Privatsphäre der Besucher respektiert, Dienstunterbrechungen vermeidet, nicht über das zur Demonstration des Problems Notwendige hinaus auf Daten zugreift oder diese verändert und koordinierte Offenlegung befolgt, wird vom Betreiber nicht rechtlich verfolgt. Dieser Safe Harbour bindet keine Dritten und autorisiert keine Aktivitäten, die gegen geltendes Recht verstoßen."],
        ["Koordinierte Offenlegung", "Bitte gewähre vor einer öffentlichen Offenlegung ein angemessenes Zeitfenster zur Behebung. Neunzig Tage sind die Standarderwartung, kürzer bei trivialen Korrekturen, länger wenn Koordination mit upstream Maintainern erforderlich ist. Der Betreiber informiert Forschende über den Fortschritt und nennt diejenigen, die anerkannt werden möchten."],
        ["Was wir nicht tun können", "Der Betreiber handelt nicht als allgemeiner Inhaltsmoderator für das offene Internet. Meldungen zu Zielwebsites sind am wirksamsten, wenn sie auch an den Hosting-Anbieter, Domain-Registrar oder die zuständige Aufsichtsbehörde gesendet werden. Die Befugnis des Betreibers ist auf die Kurzlinks beschränkt, die er auf {{operator.short_domain}} veröffentlicht."],
        ["Referenzmaterial", "Quellcode: https://github.com/vanityURLs/code. Dokumentation: /en/docs/. Maschinenlesbarer Sicherheitskontakt: /.well-known/security.txt. Block-Keyword-Policy: https://github.com/vanityURLs/code/blob/main/defaults/v8s-policies.json."]
      ]
    }
  }
};

function buildTestsPage(siteConfig) {
  const languages = supportedLanguages(siteConfig);
  const panels = languages.map((language) => renderTestsPanel(language)).join("\n\n");
  const wordmark = renderConfiguredWordmark(siteConfig);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>VanityURLs QA Tests</title>
  <link rel="stylesheet" href="/style.css?v=20260504">
</head>
<body>
  <main class="home-shell qa-shell">
    <header class="home-card qa-header">
      <h1 class="instance-brand-title">${wordmark}</h1>
      <p class="lede">Instance pages and localized variants for quick checks after custom template changes</p>
    </header>

    <section class="qa-grid" aria-label="Page test links">
${panels}
    </section>
  </main>
</body>
</html>
`;

  const testsPath = path.join(BUILD_DIR, "_tests", "index.html");
  fs.mkdirSync(path.dirname(testsPath), { recursive: true });
  fs.writeFileSync(testsPath, html);
}

function renderConfiguredWordmark(siteConfig) {
  const wordmark = siteConfig?.branding?.wordmark;
  if (!wordmark?.black && !wordmark?.green) {
    return "<span>Vanity</span><span>URLs</span>";
  }

  return `<span>${escapeHtml(wordmark.black || "")}</span><span>${escapeHtml(wordmark.green || "")}</span>`;
}

function renderTestsPanel(language) {
  const metadata = LANGUAGE_METADATA[language] || {
    name: language,
    pagesTitle: "Pages",
    statusTitle: "Status Pages",
    links: LANGUAGE_METADATA.en.links
  };
  const prefix = language === "en" ? "" : `/${language}`;
  const extension = language === "en" ? "" : ".html";
  const indexHref = language === "en" ? "/index" : `${prefix}/index.html`;
  const expandHref = language === "en" ? "/expand" : `${prefix}/expand/index.html`;
  const legalContent = LEGAL_CONTENT[language] || {};
  const policyLinks = [
    ["privacy", metadata.links.privacy || "Privacy"],
    ["terms", metadata.links.terms || "Terms"],
    ["abuse", metadata.links.abuse || "Trust & Safety"],
    ["security", metadata.links.security || "Security"]
  ].filter(([slug]) => Boolean(legalContent[slug]));
  const pageLinks = [
    `            <li><a href="${escapeHtml(indexHref)}">${escapeHtml(metadata.links.index)}</a></li>`,
    `            <li><a href="${escapeHtml(expandHref)}">${escapeHtml(metadata.links.expand)}</a></li>`,
    `            <li><a href="/_stats/">${escapeHtml(metadata.links.stats)}</a></li>`,
    ...policyLinks.map(([slug, label]) => {
      const hrefSlug = language === "en" && slug === "abuse" ? "trust-safety" : slug;
      return `            <li><a href="${prefix}/${hrefSlug}${extension}">${escapeHtml(label)}</a></li>`;
    })
  ].join("\n");

  return `      <article class="qa-panel"${language === "en" ? "" : ` lang="${escapeHtml(language)}"`}>
        <h2>${escapeHtml(metadata.name)}</h2>
        <section class="qa-section">
          <h3>${escapeHtml(metadata.pagesTitle)}</h3>
          <ul class="qa-links">
${pageLinks}
          </ul>
        </section>
        <section class="qa-section">
          <h3>${escapeHtml(metadata.statusTitle)}</h3>
          <ul class="qa-links">
            <li><a href="${prefix}/404${extension}">${escapeHtml(metadata.links.notFound)}</a></li>
            <li><a href="${prefix}/expired${extension}">${escapeHtml(metadata.links.expired)}</a></li>
            <li><a href="${prefix}/disabled${extension}">${escapeHtml(metadata.links.disabled)}</a></li>
            <li><a href="${prefix}/maintenance${extension}">${escapeHtml(metadata.links.maintenance)}</a></li>
          </ul>
        </section>
      </article>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
  const policyPath = fs.existsSync(customPath) ? customPath : defaultPath;
  const policy = readJsonFile(policyPath);

  fs.writeFileSync(RUNTIME_BLOCKLIST_PATH, `${JSON.stringify(policy, null, 2)}\n`);
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function firstExistingPath(...paths) {
  return paths.find((filePath) => fs.existsSync(filePath)) || paths[0];
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
  const siteConfig = loadSiteConfig();
  copyRuntimeSource();
  patchRuntimeLanguages(siteConfig);
  cleanBuild();
  copyPublic(siteConfig);
  renderLegalPages(siteConfig);
  renderSecurityTxt(siteConfig);
  writeSiteConfig(runtimeSiteConfig(siteConfig));
  buildTestsPage(siteConfig);
  copyRuntimeBlocklist();
  buildRedirectTargets();
  validateRuntimeRegistry();
  assertNestedSlugSupport();
  syncHomeRegistry();

  log("Build complete");
}

main();
