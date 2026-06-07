#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  cleanBuild as cleanBuildDir,
  copyPublic as copyPublicAssets,
  copyRuntimeSource as copyWorkerSource,
  mergeSiteConfig,
  patchRuntimeLanguages as patchWorkerLanguages,
  supportedLanguages,
  writeSiteConfig as writeRuntimeSiteConfig
} from "./lib/build-assets.mjs";
import { flattenRuntimeRegistry } from "./lib/runtime-registry.mjs";
import {
  encodePathSegment,
  escapeHtml,
  escapeHtmlAttribute,
  hasConfiguredSlogan,
  legalPageSlugs,
  legalPagesEnabled,
  localizedSlogan,
  localizedSloganLinkText,
  normalizeSecurityTxtValue,
  renderBrandingSlogan,
  renderConfiguredWordmark,
  siteManifestShortName,
  validateOperatorConfig,
  validateSecurityConfig,
  validateTrustConfig,
  withTheme
} from "./lib/build/site-core.mjs";
import { normalizeHtmlHead } from "./lib/build/html-core.mjs";

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
const LANGUAGE_METADATA_PATH = path.join(DEFAULTS_DIR, "v8s-language-metadata.json");
const LEGAL_CONTENT_PATH = path.join(DEFAULTS_DIR, "legal", "v8s-legal-content.json");

// Build order matters: product defaults are copied first, instance custom files overlay them,
// then runtime JSON and generated Worker source are written for Wrangler.
function log(message) {
  console.log(`[build] ${message}`);
}

function run(command) {
  execSync(command, {
    cwd: ROOT,
    stdio: "inherit"
  });
}

function loadSiteConfig() {
  const defaultConfig = readJsonFile(path.join(DEFAULTS_DIR, "v8s-site-config.json"));
  if (fs.existsSync(CUSTOM_SITE_CONFIG_PATH)) {
    return mergeSiteConfig(defaultConfig, readJsonFile(CUSTOM_SITE_CONFIG_PATH));
  }

  return defaultConfig;
}

const LANGUAGE_METADATA = readJsonFile(LANGUAGE_METADATA_PATH);
const LEGAL_DATA = readJsonFile(LEGAL_CONTENT_PATH);

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

  // Default legal pages ship as templates; configured instances get operator-specific copy
  // rendered into those templates without forcing owners to fork every public page.
  const languages = supportedLanguages(siteConfig);
  const legalPages = legalPageSlugs(siteConfig);

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
  const operatorConfigIssues = legalPagesEnabled(siteConfig)
    ? validateOperatorConfig(operator)
    : validateTrustConfig(operator);
  const requiresOperatorConfig = siteConfig?.branding?.custom_public === true;
  if (operatorConfigIssues.length && requiresOperatorConfig) {
    throw new Error(
      `custom/v8s-site-config.json operator fields are required for default legal pages: ${operatorConfigIssues.join(", ")}`
    );
  }

  for (const page of templatePages) {
    const content = legalPageContent(page.language, page.slug);
    const rendered = operatorConfigIssues.length
      ? renderLegalConfigurationNotice(page.language)
      : renderLegalPageContent(page.language, page.slug, operator);
    const current = fs.readFileSync(page.filePath, "utf8");
    const withContent = replaceLegalContent(
      current,
      rendered,
      operatorConfigIssues.length ? "" : renderOperatorPlainText(content.title || "", operator)
    );
    const normalized = normalizeLegalTemplateChrome(withContent, page, siteConfig);
    const finalHtml = operatorConfigIssues.length
      ? replaceBrandSubtitle(normalized, legalConfigurationSubtitle(page.language))
      : normalized;
    fs.writeFileSync(page.filePath, removeEmptyPageLinks(finalHtml));
  }
}

function renderSecurityTxt(siteConfig) {
  if (!hasCustomSiteConfig()) return;

  const operator = effectiveOperator(siteConfig.operator || {});
  if (validateSecurityConfig(operator).length) {
    removeSecurityTxt();
    return;
  }

  const shortDomain = normalizeSecurityTxtValue(operator.short_domain);
  const securityContact = normalizeSecurityTxtValue(operator.security_contact);
  const content = [
    `Contact: mailto:${securityContact}`,
    `Policy: https://${shortDomain}/trust-safety`,
    `Canonical: https://${shortDomain}/.well-known/security.txt`,
    "Preferred-Languages: en",
    ""
  ].join("\n");

  for (const filePath of securityTxtWritePaths()) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
}

function removeDeferredLegalPages(siteConfig) {
  if (legalPagesEnabled(siteConfig)) return;

  for (const language of supportedLanguages(siteConfig)) {
    for (const slug of ["privacy", "terms", "security"]) {
      for (const filePath of legalPagePaths(language, slug)) {
        fs.rmSync(filePath, { force: true });
      }
    }
  }

  rewriteHtmlFiles(BUILD_DIR, (html) => {
    return removeEmptyPageLinks(
      html
        .replace(/\s*<a href="[^"]*(?:privacy|terms|security)(?:\.html)?">[^<]*<\/a>/gi, "")
        .replace(/\s*<li><a href="[^"]*(?:privacy|terms|security)(?:\.html)?">[^<]*<\/a><\/li>/gi, "")
    );
  });
}

function securityTxtWritePaths() {
  return [
    path.join(BUILD_DIR, ".well-known", "security.txt"),
    path.join(BUILD_DIR, ".Well-known", "security.txt"),
    path.join(BUILD_DIR, "security.txt")
  ];
}

function removeSecurityTxt() {
  for (const filePath of [...securityTxtWritePaths(), path.join(BUILD_DIR, "security.txt")]) {
    fs.rmSync(filePath, { force: true });
  }
}

function renderSiteWebManifests(siteConfig) {
  const shortName = siteManifestShortName(siteConfig);
  const name = `${shortName} short links`;

  for (const filePath of findFiles(BUILD_DIR, "site.webmanifest")) {
    const manifest = readJsonFile(filePath);
    manifest.name = name;
    manifest.short_name = shortName;
    fs.writeFileSync(filePath, `${JSON.stringify(manifest)}\n`);
  }
}

function legalPagePaths(language, slug) {
  return language === "en"
    ? [path.join(BUILD_DIR, `${slug}.html`), path.join(BUILD_DIR, "en", `${slug}.html`)]
    : [path.join(BUILD_DIR, language, `${slug}.html`)];
}

function rewriteHtmlFiles(directory, transform) {
  if (!fs.existsSync(directory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      rewriteHtmlFiles(entryPath, transform);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      fs.writeFileSync(entryPath, transform(fs.readFileSync(entryPath, "utf8"), entryPath));
    }
  }
}

function findFiles(directory, basename) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findFiles(entryPath, basename);
    return entry.isFile() && entry.name === basename ? [entryPath] : [];
  });
}

function normalizeHtmlHeadAssets() {
  rewriteHtmlFiles(BUILD_DIR, (html) => normalizeHtmlHead(html));
}

function isDefaultLegalTemplate(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const html = fs.readFileSync(filePath, "utf8");
  return (
    html.includes("Default template to adapt by the instance owner.") ||
    html.includes("Modèle par défaut à adapter par le propriétaire de l'instance.") ||
    html.includes('data-v8s-default-template="true"')
  );
}

function effectiveOperator(operator) {
  return {
    ...operator,
    short_domain: operator.short_domain || "",
    timezone: operator.timezone || "UTC",
    last_updated: operator.last_updated || gitLastUpdatedDate(),
    umami_geo_ip_mode: deriveUmamiGeoIpMode()
  };
}

function deriveUmamiGeoIpMode() {
  const analyticsProvider = configVar("ANALYTICS_PROVIDER").toLowerCase();
  const providers = analyticsProvider
    .split(",")
    .map((provider) => provider.trim())
    .filter(Boolean);
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

function replaceLegalContent(html, rendered, title = "") {
  const pattern = /(<h2 class="legal-title">[\s\S]*?<\/h2>\n)([\s\S]*?)(\n\s*<nav class="page-links")/;
  return html.replace(
    pattern,
    (_match, heading, _body, nav) => `${toLegalPageHeading(heading, title)}${rendered}${nav}`
  );
}

function toLegalPageHeading(heading, title = "") {
  const promoted = heading.replace("<h2 ", "<h1 ").replace("</h2>", "</h1>");
  if (!title) return promoted;
  return promoted.replace(/(<h1 class="legal-title">)[\s\S]*?(<\/h1>)/, `$1${title}$2`);
}

function replaceBrandSubtitle(html, notice) {
  return html.replace(
    /<p class="instance-brand-subtitle">[\s\S]*?<\/p>/,
    `<p class="instance-brand-subtitle">${escapeHtml(notice)}</p>`
  );
}

function normalizeLegalTemplateChrome(html, page, siteConfig) {
  return removeEmptyPageLinks(
    removeLegalRedirectedBadge(removeCurrentLegalPageLink(applyLegalBranding(html, siteConfig, page.language), page))
  );
}

function applyLegalBranding(html, siteConfig, language = "en") {
  const wordmark = siteConfig?.branding?.wordmark;
  let brandedHtml = html;

  if (wordmark?.black || wordmark?.green) {
    const brandLabel = `${wordmark.black || ""}${wordmark.green || ""}`;
    const renderedWordmark = renderConfiguredWordmark(siteConfig);
    brandedHtml = brandedHtml
      .replace(
        /<header class="instance-brand" aria-label="[^"]*">/,
        `<header class="instance-brand" aria-label="${escapeHtmlAttribute(brandLabel)}">`
      )
      .replace(
        /<h1 class="instance-brand-title">\s*<a href="([^"]+)" aria-label="[^"]*">[\s\S]*?<\/a>\s*<\/h1>/,
        `<h1 class="instance-brand-title">\n            <a href="$1" aria-label="${escapeHtmlAttribute(brandLabel)}">${renderedWordmark}</a>\n          </h1>`
      );
  }

  const slogan = renderBrandingSlogan(
    localizedSlogan(siteConfig?.branding?.slogan, language),
    siteConfig?.operator,
    localizedSloganLinkText(siteConfig?.branding?.slogan_link_text, language)
  );
  return slogan
    ? brandedHtml.replace(
        /<p class="instance-brand-subtitle">[\s\S]*?<\/p>/,
        `<p class="instance-brand-subtitle">${slogan}</p>`
      )
    : brandedHtml;
}

function applyPublicBranding(siteConfig) {
  const slogans = siteConfig?.branding?.slogan;
  const wordmark = siteConfig?.branding?.wordmark;
  const hasWordmark = Boolean(wordmark?.black || wordmark?.green);
  const hasSlogan = hasConfiguredSlogan(slogans);
  if (!hasWordmark && !hasSlogan) return;

  rewriteHtmlFiles(BUILD_DIR, (html, filePath) => {
    if (isStatsDashboardFile(filePath)) return html;

    let brandedHtml = html;
    const brandLabel = hasWordmark ? `${wordmark.black || ""}${wordmark.green || ""}` : "";

    if (hasWordmark) {
      const renderedWordmark = renderConfiguredWordmark(siteConfig);
      const brandHref = `https://${escapeHtmlAttribute(siteConfig?.operator?.short_domain || brandLabel)}/`;
      brandedHtml = brandedHtml
        .replace(/<h1([^>]*)><span>Vanity<\/span><span>URLs<\/span><\/h1>/g, `<h1$1>${renderedWordmark}</h1>`)
        .replace(
          /<a class="brand-mark" href="[^"]+" target="_blank" rel="noreferrer" aria-label="[^"]+">\s*<img src="\/logo\.svg" alt="[^"]+" \/>\s*<\/a>/g,
          `<a class="brand-mark brand-mark-wordmark" href="${brandHref}" target="_blank" rel="noreferrer" aria-label="${escapeHtmlAttribute(brandLabel)}">${renderedWordmark}</a>`
        )
        .replace(
          /(<h1 class="instance-brand-title">\s*<a href="[^"]+" aria-label=")[^"]*("[^>]*>)[\s\S]*?(<\/a>\s*<\/h1>)/g,
          `$1${escapeHtmlAttribute(brandLabel)}$2${renderedWordmark}$3`
        )
        .replace(/<title>([^<]*?)VanityURLs([^<]*?)<\/title>/gi, `<title>$1${escapeHtml(brandLabel)}$2</title>`)
        .replace(/aria-label="VanityURLs"/g, `aria-label="${escapeHtmlAttribute(brandLabel)}"`)
        .replace(/(<a class="wordmark" href=)"https:\/\/vanityurls\.link\/"/gi, `$1"${brandHref}"`);
    }

    if (!hasSlogan) return brandedHtml;

    const language = languageForBuildHtmlFile(filePath);
    const slogan = renderBrandingSlogan(
      localizedSlogan(slogans, language),
      siteConfig?.operator,
      localizedSloganLinkText(siteConfig?.branding?.slogan_link_text, language)
    );
    if (!slogan) return brandedHtml;
    const subtitle = `<p class="instance-brand-subtitle">${slogan}</p>`;

    if (!brandedHtml.includes('class="instance-brand-subtitle"')) {
      return brandedHtml.replace(/(<a class="wordmark"[\s\S]*?<\/a>)/, `$1\n\n        ${subtitle}`);
    }

    return brandedHtml.replace(/<p class="instance-brand-subtitle">[\s\S]*?<\/p>/, subtitle);
  });
}

function isStatsDashboardFile(filePath) {
  return path.relative(BUILD_DIR, filePath).split(path.sep).join("/") === "_stats/index.html";
}

function languageForBuildHtmlFile(filePath) {
  const [firstSegment] = path.relative(BUILD_DIR, filePath).split(path.sep);
  return LANGUAGE_METADATA[firstSegment] ? firstSegment : "en";
}

function removeLegalRedirectedBadge(html) {
  return html.replace(/\n\s*<a class="redirected-badge"[\s\S]*?<\/a>\n(?=\s*<\/article>)/, "\n");
}

function removeEmptyPageLinks(html) {
  return html.replace(/\n\s*<nav class="page-links"[^>]*>[\s\n]*<\/nav>/g, "");
}

function removeCurrentLegalPageLink(html, page) {
  const hrefSlug = page.language === "en" && page.slug === "abuse" ? "trust-safety" : page.slug;
  const prefix = page.language === "en" ? "" : `/${page.language}`;
  const extension = page.language === "en" ? "" : ".html";
  const href = `${prefix}/${hrefSlug}${extension}`;
  const escapedHref = escapeRegExp(href);
  return html.replace(new RegExp(`\\n\\s*<a href="${escapedHref}">[^<]*<\\/a>`, "g"), "");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderLegalPageContent(language, slug, operator) {
  const content = legalPageContent(language, slug);
  const localizedOperator = localizeOperatorFields(operator, language);
  const paragraphs = content.sections
    .filter(([, text]) => {
      return (
        !legalBodyIncludes(text, "{{analytics_retention}}") ||
        Boolean(String(operator.analytics_retention || "").trim())
      );
    })
    .map(([heading, text], index) => {
      const headingLevel = legalSectionHeadingLevel(slug, index);
      const headingHtml = heading ? `      <${headingLevel}>${escapeHtml(heading)}</${headingLevel}>\n` : "";
      return `${headingHtml}${renderLegalSectionBody(text, localizedOperator)}`;
    })
    .join("\n\n");

  const notes = [
    content.note ? `      <p class="legal-note">${renderOperatorText(content.note, localizedOperator)}</p>` : "",
    `      <p class="legal-note">${escapeHtml(content.lastUpdated)} ${escapeHtml(localizedOperator.last_updated || "")}</p>`
  ]
    .filter(Boolean)
    .join("\n");

  return `${notes}\n\n${paragraphs}\n`;
}

function localizeOperatorFields(operator, language) {
  return {
    ...operator,
    abuse_response_window: localizedResponseWindow(operator.abuse_response_window, language)
  };
}

function localizedResponseWindow(value, language) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  const localized = LEGAL_DATA.response_window_localization?.[normalized];
  return localized?.[language] || localized?.en || value;
}

function renderLegalConfigurationNotice(language) {
  const notice = LEGAL_DATA.configuration_notice?.[language] || LEGAL_DATA.configuration_notice?.en;
  const paragraphs = notice.sections
    .map(([heading, text]) => {
      return `      <h3>${escapeHtml(heading)}</h3>\n      <p>${escapeHtml(text)}</p>`;
    })
    .join("\n\n");

  return `      <p class="legal-note">${escapeHtml(notice.note)}</p>\n\n${paragraphs}\n`;
}

function legalConfigurationSubtitle(language) {
  return (LEGAL_DATA.configuration_notice?.[language] || LEGAL_DATA.configuration_notice?.en).subtitle;
}

function renderOperatorText(text, operator) {
  const emailFields = new Set(["contact_email", "privacy_contact", "abuse_contact", "security_contact"]);
  const rendered = escapeHtml(text)
    .replace(/\{\{(?:operator\.)?([a-z_]+)\}\}/g, (_match, field) => {
      const value = escapeHtml(operator[field] || "");
      return emailFields.has(field) ? `<a href="mailto:${value}">${value}</a>` : value;
    })
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|\/[^)]+)\)/g, (_match, label, href) => {
      return `<a href="${escapeHtmlAttribute(href)}">${label}</a>`;
    });
  return linkifyHtmlText(rendered);
}

function renderOperatorPlainText(text, operator) {
  return escapeHtml(
    String(text || "").replace(/\{\{(?:operator\.)?([a-z_]+)\}\}/g, (_match, field) => {
      return operator[field] || "";
    })
  );
}

function legalPageContent(language, slug) {
  return LEGAL_DATA.content?.[language]?.[slug] || LEGAL_DATA.content?.en?.[slug];
}

function renderLegalSectionBody(text, operator) {
  if (Array.isArray(text)) {
    return text.map((paragraph) => `      <p>${renderOperatorText(paragraph, operator)}</p>`).join("\n");
  }
  if (text && typeof text === "object" && Array.isArray(text.list)) {
    const items = text.list.map((item) => `        <li>${renderOperatorText(item, operator)}</li>`).join("\n");
    return `      <ul>\n${items}\n      </ul>`;
  }
  return `      <p>${renderOperatorText(text, operator)}</p>`;
}

function legalBodyIncludes(text, needle) {
  if (Array.isArray(text)) return text.some((item) => legalBodyIncludes(item, needle));
  if (text && typeof text === "object" && Array.isArray(text.list)) {
    return text.list.some((item) => legalBodyIncludes(item, needle));
  }
  return String(text || "").includes(needle);
}

function legalSectionHeadingLevel(slug, index) {
  if (slug !== "abuse") return "h3";
  return index > 5 ? "h3" : "h2";
}

function linkifyHtmlText(html) {
  return String(html)
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (part.startsWith("<")) return part;

      return part.replace(/(^|[\s(])(https?:\/\/[^\s<]+|\/[A-Za-z0-9._~/-]+)/g, (match, prefix, value) => {
        const cleanValue = value.replace(/[.)\],;:]+$/g, "");
        const suffix = value.slice(cleanValue.length);
        return `${prefix}<a href="${escapeHtmlAttribute(cleanValue)}">${cleanValue}</a>${suffix}`;
      });
    })
    .join("");
}

function buildTestsPage(siteConfig) {
  const languages = supportedLanguages(siteConfig);
  const panels = languages.map((language) => renderTestsPanel(language, siteConfig)).join("\n\n");
  const wordmark = renderConfiguredWordmark(siteConfig);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>VanityURLs QA Tests</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="stylesheet" href="/style.css?v=20260601">
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

function buildLocalizedStatsPages(siteConfig) {
  const sourcePath = path.join(BUILD_DIR, "_stats", "index.html");
  if (!fs.existsSync(sourcePath)) return;

  const html = fs.readFileSync(sourcePath, "utf8");
  for (const language of supportedLanguages(siteConfig)) {
    const targetPath = path.join(BUILD_DIR, language, "_stats", "index.html");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, html.replace(/<html lang="[^"]*">/, `<html lang="${escapeHtmlAttribute(language)}">`));
  }

  fs.rmSync(path.join(BUILD_DIR, "_stats"), { recursive: true, force: true });
}

function renderTestsPanel(language, siteConfig) {
  const metadata = LANGUAGE_METADATA[language] || {
    name: language,
    pagesTitle: "Pages",
    statusTitle: "Status Pages",
    lookupSlug: "lookup",
    links: LANGUAGE_METADATA.en.links
  };
  const prefix = language === "en" ? "" : `/${language}`;
  const extension = language === "en" ? "" : ".html";
  const indexHref = language === "en" ? "/" : `${prefix}/index.html`;
  const lookupHref = language === "en" ? "/lookup" : `${prefix}/${encodePathSegment(metadata.lookupSlug || "lookup")}`;
  const statsHref = `${prefix || "/en"}/_stats/`;
  const legalContent = LEGAL_DATA.content?.[language] || {};
  const enabledPolicySlugs = new Set(legalPageSlugs(siteConfig));
  const policyLinks = [
    ["privacy", metadata.links.privacy || "Privacy"],
    ["terms", metadata.links.terms || "Terms"],
    ["abuse", metadata.links.abuse || "Trust & Safety"],
    ["security", metadata.links.security || "Security"]
  ].filter(([slug]) => enabledPolicySlugs.has(slug) && Boolean(legalContent[slug]));
  const pageLinks = [
    renderTestsLink(indexHref, metadata.links.index, { themeControls: true }),
    renderTestsLink(lookupHref, metadata.links.lookup, { themeControls: true }),
    renderTestsLink(statsHref, metadata.links.stats, { themeControls: true }),
    ...policyLinks.map(([slug, label]) => {
      const hrefSlug = language === "en" && slug === "abuse" ? "trust-safety" : slug;
      return renderTestsLink(`${prefix}/${hrefSlug}${extension}`, label, { themeControls: true });
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
${language === "en" ? renderMachineReadableTestsSection() : ""}
        <section class="qa-section">
          <h3>${escapeHtml(metadata.statusTitle)}</h3>
          <ul class="qa-links">
${renderTestsLink(`${prefix}/404${extension}`, metadata.links.notFound, { themeControls: true })}
${renderTestsLink(`${prefix}/expired${extension}`, metadata.links.expired, { themeControls: true })}
${renderTestsLink(`${prefix}/disabled${extension}`, metadata.links.disabled, { themeControls: true })}
${renderTestsLink(`${prefix}/maintenance${extension}`, metadata.links.maintenance, { themeControls: true })}
          </ul>
        </section>
      </article>`;
}

function renderTestsLink(href, label, options = {}) {
  const themeControls = options.themeControls ? renderTestsThemeControls(href, label) : "";
  return `            <li class="qa-link-item">
              <a class="qa-link-main" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>${themeControls}
            </li>`;
}

function renderTestsThemeControls(href, label) {
  return `<span class="qa-theme-controls" aria-label="${escapeHtmlAttribute(`${label} theme previews`)}">
                <a class="qa-theme-link" href="${escapeHtml(withTheme(href, "light"))}" target="_blank" rel="noreferrer" aria-label="${escapeHtmlAttribute(`${label} light preview`)}" title="Light preview">☼</a>
                <a class="qa-theme-link" href="${escapeHtml(withTheme(href, "dark"))}" target="_blank" rel="noreferrer" aria-label="${escapeHtmlAttribute(`${label} dark preview`)}" title="Dark preview">◑</a>
              </span>`;
}

function renderMachineReadableTestsSection() {
  const links = [
    ["/.well-known/security.txt", ".well-known/security.txt"],
    ["/security.txt", "security.txt redirect"],
    ["/robots.txt", "robots.txt"],
    ["/llms.txt", "llms.txt"],
    ["/llms-full.txt", "llms-full.txt"],
    ["/site.webmanifest", "site.webmanifest"]
  ]
    .map(([href, label]) => renderTestsLink(href, label))
    .join("\n");

  return `        <section class="qa-section">
          <h3>Machine-readable files</h3>
          <ul class="qa-links">
${links}
          </ul>
        </section>`;
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
  const policy = fs.existsSync(customPath) ? readJsonFile(customPath) : readJsonFile(defaultPath);

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
  log("Building runtime link registry build/v8s.json");

  const linksSource = fs.existsSync(path.join(CUSTOM_DIR, "v8s-links.txt"))
    ? "custom/v8s-links.txt"
    : "defaults/v8s-links.txt";
  log(`Using ${linksSource}`);
  run(`node scripts/build-redirect-targets.mjs ${linksSource} build/v8s.json`);
}

function validateRuntimeRegistry() {
  log("Validating runtime link registry build/v8s.json");

  run("node scripts/validate-registry.mjs build/v8s.json");
}

function assertNestedSlugSupport() {
  log("Checking nested alias support");

  const registryPath = path.join(BUILD_DIR, "v8s.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

  const links = flattenRuntimeRegistry(registry);
  const hasNested = links.some((link) => {
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
    log("Skipping workstation runtime link registry sync");
    return;
  }

  const homeRegistryPath = resolveLocalPath(localConfig?.registry?.local_path || "~/.v8s.json");

  try {
    fs.mkdirSync(path.dirname(homeRegistryPath), { recursive: true });
    fs.copyFileSync(RUNTIME_REGISTRY_PATH, homeRegistryPath);
    log(`Copied runtime link registry v8s.json to ${homeRegistryPath}`);
  } catch (error) {
    if (process.env.V8S_SYNC_HOME_REQUIRED === "1" || process.env.V8S_SYNC_HOME_REQUIRED === "true") {
      throw new Error(`Unable to copy v8s.json to ${homeRegistryPath}: ${error.message}`);
    }

    console.warn(`[build] Unable to copy v8s.json to ${homeRegistryPath}: ${error.message}`);
  }
}

function buildReleaseManifest() {
  log("Building release manifest");
  run("node scripts/generate-release-manifest.mjs");
}

function loadLocalConfig() {
  if (!fs.existsSync(LOCAL_CONFIG_PATH)) return null;
  return readJsonFile(LOCAL_CONFIG_PATH);
}

function resolveLocalPath(value) {
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
  copyWorkerSource({ workerSourceDir: WORKER_SOURCE_DIR, runtimeSourceDir: RUNTIME_SOURCE_DIR, log });
  patchWorkerLanguages({ runtimeSourceDir: RUNTIME_SOURCE_DIR, siteConfig });
  cleanBuildDir({ buildDir: BUILD_DIR, generatedBlocklistPath: GENERATED_BLOCKLIST_PATH, log });
  copyPublicAssets({
    defaultPublicDir: path.join(DEFAULTS_DIR, "public"),
    customPublicDir: path.join(CUSTOM_DIR, "public"),
    buildDir: BUILD_DIR,
    root: ROOT,
    siteConfig,
    log
  });
  applyPublicBranding(siteConfig);
  renderLegalPages(siteConfig);
  renderSecurityTxt(siteConfig);
  renderSiteWebManifests(siteConfig);
  writeRuntimeSiteConfig(runtimeSiteConfig(siteConfig), RUNTIME_SITE_CONFIG_PATH);
  removeDeferredLegalPages(siteConfig);
  buildTestsPage(siteConfig);
  buildLocalizedStatsPages(siteConfig);
  normalizeHtmlHeadAssets();
  copyRuntimeBlocklist();
  buildRedirectTargets();
  validateRuntimeRegistry();
  assertNestedSlugSupport();
  syncHomeRegistry();
  buildReleaseManifest();

  log("Build complete");
}

main();
