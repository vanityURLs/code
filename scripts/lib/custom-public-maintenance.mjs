import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { copyDirectory, hasCopyableFiles, mergeSiteConfig, supportedLanguages } from "./build-assets.mjs";
import { isFullCustomMode } from "./install/core.mjs";

const PROJECT_SITE_URL = "https://www.vanityURLs.link";
const PUBLIC_ASSET_VERSION = "20260601";

export function loadMaintenanceContext(root = process.cwd()) {
  const defaultsDir = path.join(root, "defaults");
  const customDir = path.join(root, "custom");
  const defaultConfigPath = path.join(defaultsDir, "v8s-site-config.json");
  const customConfigPath = path.join(customDir, "v8s-site-config.json");
  const maintenanceConfigPath = path.join(customDir, "v8s-custom-overrides.json");
  const languageMetadataPath = path.join(defaultsDir, "v8s-language-metadata.json");
  const defaultPublicDir = path.join(defaultsDir, "public");
  const customPublicDir = path.join(customDir, "public");
  const defaultConfig = readJson(defaultConfigPath);
  const customConfig = readJson(customConfigPath);
  const maintenanceConfig = readJson(maintenanceConfigPath);
  const siteConfig = mergeSiteConfig(defaultConfig, customConfig);
  const languageMetadata = readJson(languageMetadataPath);

  return {
    root,
    defaultsDir,
    customDir,
    defaultPublicDir,
    customPublicDir,
    siteConfig,
    languageMetadata,
    maintenanceConfig,
    languages: supportedLanguages(siteConfig)
  };
}

export function diagnoseCustomPublic(context) {
  const issues = [];
  const { customPublicDir, languageMetadata, languages, siteConfig } = context;
  const hasCustomPublic = hasCopyableFiles(customPublicDir);
  const customPublicEnabled = isFullCustomMode(siteConfig.branding);

  if (!hasCustomPublic) {
    if (customPublicEnabled) {
      issues.push({
        code: "custom-public-missing",
        severity: "warn",
        fix: "public",
        path: "custom/public",
        message: "branding.custom_mode is full, but custom/public has no copied pages."
      });
    }
    return applyDoctorIgnores(context, issues);
  }

  issues.push(...diagnoseHtmlHeadAssets(context));
  issues.push(...diagnoseSharedAssets(context));
  issues.push(...diagnoseProductPages(context));
  issues.push(...diagnoseBranding(context));

  const supported = new Set(languages);
  for (const language of languages) {
    if (language === "en") continue;
    const languageDir = path.join(customPublicDir, language);
    if (customPublicEnabled && !hasCopyableFiles(languageDir)) {
      issues.push({
        code: "supported-language-missing",
        severity: "warn",
        fix: "public",
        path: relativePath(context, languageDir),
        message: `Supported language "${language}" is missing from custom/public.`
      });
    }
  }

  for (const language of Object.keys(languageMetadata)) {
    if (language === "en" || supported.has(language)) continue;
    const languageDir = path.join(customPublicDir, language);
    if (hasCopyableFiles(languageDir)) {
      issues.push({
        code: "unsupported-language-present",
        severity: "warn",
        fix: "languages",
        path: relativePath(context, languageDir),
        message: `Unsupported language "${language}" is still present in custom/public.`
      });
    }
  }

  return applyDoctorIgnores(context, issues);
}

export function reconcileCustomPublic(context, options = {}) {
  const actions = [];
  const { customPublicDir, defaultPublicDir, languages } = context;

  if (options.public) {
    fs.rmSync(customPublicDir, { recursive: true, force: true });
    copyDirectory(defaultPublicDir, customPublicDir);
    pruneUnsupportedLanguageDirs(context);
    rewriteHtmlFiles(customPublicDir, (html, filePath) => {
      if (isProductPublicFile(context, filePath)) return html;
      return normalizeHtmlHead(applyBranding(html, context, languageForPublicFile(context, filePath)));
    });
    actions.push("recreated custom/public from defaults");
  } else {
    if (options.languages) {
      pruneUnsupportedLanguageDirs(context);
      actions.push(`pruned custom/public to supported languages: ${languages.join(",")}`);
    }

    if (options.assets) {
      syncSharedAssets(context);
      actions.push("synced shared CSS, script, logo, icon, font, and badge assets from defaults");
    }

    if (options.productPages) {
      syncProductPages(context);
      actions.push("synced product dashboard and QA pages from defaults");
    }

    if (options.branding) {
      rewriteHtmlFiles(customPublicDir, (html, filePath) => {
        if (isProductPublicFile(context, filePath)) return html;
        return applyBranding(html, context, languageForPublicFile(context, filePath));
      });
      actions.push("refreshed branding in custom/public HTML");
    }

    if (options.headAssets) {
      rewriteHtmlFiles(customPublicDir, (html, filePath) => {
        if (isProductPublicFile(context, filePath)) return html;
        return normalizeHtmlHead(html);
      });
      actions.push("normalized favicon and theme head assets in custom/public HTML");
    }
  }

  if (actions.length) formatFiles(context, customPublicDir, [".html"]);
  return actions;
}

export function parseReconcileArgs(argv) {
  const options = {
    assets: false,
    branding: false,
    dryRun: false,
    headAssets: false,
    languages: false,
    productPages: false,
    public: false
  };

  for (const arg of argv) {
    if (arg === "--all") {
      options.assets = true;
      options.branding = true;
      options.headAssets = true;
      options.languages = true;
      options.productPages = true;
    } else if (arg === "--assets") {
      options.assets = true;
    } else if (arg === "--branding") {
      options.branding = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--head-assets") {
      options.headAssets = true;
    } else if (arg === "--languages") {
      options.languages = true;
    } else if (arg === "--product-pages") {
      options.productPages = true;
    } else if (arg === "--public") {
      options.public = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function diagnoseHtmlHeadAssets(context) {
  return listHtmlFiles(context.customPublicDir)
    .filter((filePath) => !isProductPublicFile(context, filePath))
    .filter((filePath) => normalizeHtmlHead(fs.readFileSync(filePath, "utf8")) !== fs.readFileSync(filePath, "utf8"))
    .map((filePath) => ({
      code: "html-head-assets-stale",
      severity: "warn",
      fix: "head-assets",
      path: relativePath(context, filePath),
      message: "HTML is missing the shared favicon/apple-touch-icon/theme head assets."
    }));
}

function diagnoseSharedAssets(context) {
  const customPublicEnabled = isFullCustomMode(context.siteConfig.branding);

  return listSharedDefaultAssets(context)
    .filter((defaultPath) => {
      const customPath = path.join(context.customPublicDir, path.relative(context.defaultPublicDir, defaultPath));
      if (!fs.existsSync(customPath)) return customPublicEnabled;
      return !sameFile(defaultPath, customPath);
    })
    .map((defaultPath) => {
      const customPath = path.join(context.customPublicDir, path.relative(context.defaultPublicDir, defaultPath));
      return {
        code: "shared-asset-stale",
        severity: "warn",
        fix: "assets",
        path: relativePath(context, customPath),
        message: "Shared public asset is missing or differs from defaults."
      };
    });
}

function applyDoctorIgnores(context, issues) {
  const ignoreRules = Array.isArray(context.maintenanceConfig?.doctor?.ignore)
    ? context.maintenanceConfig.doctor.ignore
    : [];
  if (!ignoreRules.length) return issues;

  return issues.filter((issue) => !ignoreRules.some((rule) => matchesDoctorIgnoreRule(issue, rule)));
}

function matchesDoctorIgnoreRule(issue, rule) {
  const paths = normalizeRuleList(rule.path || rule.paths);
  if (paths.length && !paths.some((pattern) => matchesPathPattern(issue.path, pattern))) return false;

  const codes = normalizeRuleList(rule.code || rule.codes);
  if (codes.length && !codes.includes(issue.code)) return false;

  const fixes = normalizeRuleList(rule.fix || rule.fixes);
  if (fixes.length && !fixes.includes(issue.fix)) return false;

  return true;
}

function normalizeRuleList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  const single = String(value || "").trim();
  return single ? [single] : [];
}

function matchesPathPattern(pathname, pattern) {
  const normalizedPath = String(pathname || "").replaceAll("\\", "/");
  const normalizedPattern = String(pattern || "").replaceAll("\\", "/");
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  return normalizedPath === normalizedPattern;
}

function diagnoseProductPages(context) {
  return listProductDefaultPages(context)
    .filter((defaultPath) => {
      const customPath = path.join(context.customPublicDir, path.relative(context.defaultPublicDir, defaultPath));
      return fs.existsSync(customPath) && !sameProductPage(context, defaultPath, customPath);
    })
    .map((defaultPath) => {
      const customPath = path.join(context.customPublicDir, path.relative(context.defaultPublicDir, defaultPath));
      return {
        code: "product-page-stale",
        severity: "warn",
        fix: "product-pages",
        path: relativePath(context, customPath),
        message: "Product-managed dashboard or QA page differs from defaults."
      };
    });
}

function sameProductPage(context, defaultPath, customPath) {
  if (!fs.existsSync(defaultPath) || !fs.existsSync(customPath)) return false;
  return (
    formatHtmlText(context, fs.readFileSync(defaultPath, "utf8")) ===
    formatHtmlText(context, fs.readFileSync(customPath, "utf8"))
  );
}

function diagnoseBranding(context) {
  if (!hasBrandingConfig(context.siteConfig)) return [];

  return listHtmlFiles(context.customPublicDir)
    .filter((filePath) => !isProductPublicFile(context, filePath))
    .filter((filePath) => {
      const html = fs.readFileSync(filePath, "utf8");
      const brandedHtml = applyBranding(html, context, languageForPublicFile(context, filePath));
      return formatHtmlText(context, brandedHtml) !== formatHtmlText(context, html);
    })
    .map((filePath) => ({
      code: "branding-stale",
      severity: "warn",
      fix: "branding",
      path: relativePath(context, filePath),
      message: "HTML branding does not match custom/v8s-site-config.json."
    }));
}

function hasBrandingConfig(siteConfig) {
  const branding = siteConfig.branding || {};
  return Boolean(
    String(branding.domain || "").trim() ||
    String(branding.wordmark?.black || "").trim() ||
    String(branding.wordmark?.green || "").trim() ||
    localizedSlogan(branding.slogan, "en")
  );
}

function pruneUnsupportedLanguageDirs(context) {
  const supported = new Set(context.languages);
  for (const language of Object.keys(context.languageMetadata)) {
    if (language === "en" || supported.has(language)) continue;

    fs.rmSync(path.join(context.customPublicDir, language), {
      recursive: true,
      force: true
    });
  }
}

function syncSharedAssets(context) {
  for (const defaultPath of listSharedDefaultAssets(context)) {
    const relative = path.relative(context.defaultPublicDir, defaultPath);
    const customPath = path.join(context.customPublicDir, relative);
    fs.mkdirSync(path.dirname(customPath), { recursive: true });
    fs.copyFileSync(defaultPath, customPath);
  }
}

function syncProductPages(context) {
  for (const defaultPath of listProductDefaultPages(context)) {
    const relative = path.relative(context.defaultPublicDir, defaultPath);
    const customPath = path.join(context.customPublicDir, relative);
    if (!fs.existsSync(customPath)) continue;
    fs.mkdirSync(path.dirname(customPath), { recursive: true });
    fs.copyFileSync(defaultPath, customPath);
  }
}

function listProductDefaultPages(context) {
  return [
    path.join(context.defaultPublicDir, "_stats", "index.html"),
    path.join(context.defaultPublicDir, "_tests", "index.html")
  ].filter((filePath) => fs.existsSync(filePath));
}

function isProductPublicFile(context, filePath) {
  const relative = path.relative(context.customPublicDir, filePath).split(path.sep).join("/");
  return relative === "_stats/index.html" || relative === "_tests/index.html";
}

function listSharedDefaultAssets(context) {
  const supported = new Set(context.languages);
  return listFiles(context.defaultPublicDir).filter((filePath) => {
    const relative = path.relative(context.defaultPublicDir, filePath);
    const parts = relative.split(path.sep);
    const extension = path.extname(filePath).toLowerCase();

    if (![".css", ".js", ".png", ".svg", ".txt", ".webmanifest", ".woff2"].includes(extension)) return false;
    if (parts[0] === "fonts") return true;
    if (extension === ".txt" && parts.length > 1) return false;
    if (!Object.hasOwn(context.languageMetadata, parts[0])) return true;
    return parts[0] === "en" || supported.has(parts[0]);
  });
}

function sameFile(leftPath, rightPath) {
  if (!fs.existsSync(leftPath) || !fs.existsSync(rightPath)) return false;
  const left = fs.readFileSync(leftPath);
  const right = fs.readFileSync(rightPath);
  return left.length === right.length && left.equals(right);
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

function applyBranding(html, context, language = "en") {
  const siteConfig = context.siteConfig || {};
  const branding = siteConfig.branding || {};
  const wordmark = branding.wordmark || {};
  const wordmarkBlack = String(wordmark.black || "").trim();
  const wordmarkGreen = String(wordmark.green || "").trim();
  const brandLabel = `${wordmarkBlack}${wordmarkGreen}` || branding.domain || "VanityURLs";
  const wordmarkSpans =
    wordmarkBlack || wordmarkGreen
      ? `<span>${escapeHtml(wordmarkBlack)}</span><span>${escapeHtml(wordmarkGreen)}</span>`
      : `<span>${escapeHtml(brandLabel)}</span>`;
  const domain = normalizeDomain(branding.domain || siteConfig.operator?.short_domain || "");
  const slogan = renderBrandingSlogan(
    localizedSlogan(branding.slogan, language),
    siteConfig.operator,
    localizedSlogan(branding.slogan_link_text, language)
  );
  const subtitle = slogan
    ? `<p class="instance-brand-subtitle">\n            ${slogan}\n          </p>`
    : `<p class="instance-brand-subtitle"></p>`;

  let brandedHtml = html
    .replace(
      /<h1([^>]*)><span>Vanity<\/span><span>URLs<\/span><\/h1>/g,
      (_match, attributes) => `<h1${attributes}>${wordmarkSpans}</h1>`
    )
    .replace(
      /(<h1 class="instance-brand-title">\s*<a href="[^"]+" aria-label=")[^"]*("[^>]*>)[\s\S]*?(<\/a>\s*<\/h1>)/g,
      `$1${escapeHtmlAttribute(brandLabel)}$2${wordmarkSpans}$3`
    )
    .replace(/<title>([^<]*?)VanityURLs([^<]*?)<\/title>/gi, `<title>$1${escapeHtml(brandLabel)}$2</title>`)
    .replace(/aria-label="VanityURLs"/g, `aria-label="${escapeHtmlAttribute(brandLabel)}"`)
    .replace(/(<a class="redirected-badge" href=)"https:\/\/vanityURLs\.link"/g, `$1"${PROJECT_SITE_URL}"`)
    .replace(/(<a class="redirected-badge" href=)"https:\/\/vanityurls\.link\/?"/gi, `$1"${PROJECT_SITE_URL}"`)
    .replace(/(<a class="redirected-badge"[^>]*aria-label=)"[^"]*"/g, '$1"VanityURLs"')
    .replace(/<p class="instance-brand-subtitle">[\s\S]*?<\/p>/g, subtitle);

  if (domain) {
    brandedHtml = brandedHtml.replace(
      /(<a class="wordmark" href=)"https:\/\/vanityurls\.link\/"/gi,
      `$1"https://${escapeHtmlAttribute(domain)}/"`
    );
  }

  if (!brandedHtml.includes('class="instance-brand-subtitle"')) {
    brandedHtml = brandedHtml.replace(/(<a class="wordmark"[\s\S]*?<\/a>)/, `$1\n\n        ${subtitle}`);
  }

  return brandedHtml;
}

function languageForPublicFile(context, filePath) {
  const [language] = path.relative(context.customPublicDir, filePath).split(path.sep);
  return Object.hasOwn(context.languageMetadata, language) ? language : "en";
}

function renderBrandingSlogan(slogan, operator = {}, linkText = "") {
  const rendered = escapeHtml(slogan || "");
  const legalName = String(operator?.legal_name || "").trim();
  const operatorDomain = normalizeDomain(operator?.operator_domain || "");
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

function localizedSlogan(value, language = "en") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value[language] || value.en || "";
  }
  return String(value || "");
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

function listHtmlFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listHtmlFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".html") ? [entryPath] : [];
  });
}

function formatFiles(context, directory, extensions) {
  const prettierBin = path.join(
    context.root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prettier.cmd" : "prettier"
  );
  if (!fs.existsSync(prettierBin)) return;

  const files = listFiles(directory).filter((filePath) => extensions.includes(path.extname(filePath)));
  if (!files.length) return;

  execFileSync(prettierBin, ["--write", ...files], {
    cwd: context.root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
}

function formatHtmlText(context, html) {
  const prettierBin = path.join(
    context.root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prettier.cmd" : "prettier"
  );
  if (!fs.existsSync(prettierBin)) return html;

  try {
    return execFileSync(prettierBin, ["--parser", "html"], {
      cwd: context.root,
      input: html,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"]
    });
  } catch {
    return html;
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

function relativePath(context, filePath) {
  return path.relative(context.root, filePath).replaceAll(path.sep, "/");
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
