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
      abuse: "Abuse",
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
      abuse: "Abus",
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

function copyPublic() {
  log("Copying defaults/public/");
  copyDirectory(path.join(DEFAULTS_DIR, "public"), BUILD_DIR);

  const customPublic = path.join(CUSTOM_DIR, "public");
  if (hasCopyableFiles(customPublic)) {
    log("Overlaying custom/public/");
    copyDirectory(customPublic, BUILD_DIR);
  }
}

function loadSiteConfig() {
  const defaultConfig = readJsonFile(path.join(DEFAULTS_DIR, "v8s-site-config.json"));
  const customConfigPath = path.join(CUSTOM_DIR, "v8s-site-config.json");
  if (fs.existsSync(customConfigPath)) {
    return mergeSiteConfig(defaultConfig, readJsonFile(customConfigPath));
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

function writeSiteConfig(siteConfig) {
  fs.writeFileSync(RUNTIME_SITE_CONFIG_PATH, `${JSON.stringify(siteConfig, null, 2)}\n`);
}

function buildTestsPage(siteConfig) {
  const languages = supportedLanguages(siteConfig);
  const panels = languages.map((language) => renderTestsPanel(language)).join("\n\n");
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
      <h1 class="instance-brand-title"><span>Vanity</span><span>URLs</span></h1>
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
  const policyLinks = language === "en" || language === "fr"
    ? [
      ["privacy", metadata.links.privacy || "Privacy"],
      ["terms", metadata.links.terms || "Terms"],
      ["abuse", metadata.links.abuse || "Abuse"],
      ["security", metadata.links.security || "Security"]
    ]
    : [];
  const pageLinks = [
    `            <li><a href="${escapeHtml(indexHref)}">${escapeHtml(metadata.links.index)}</a></li>`,
    `            <li><a href="${escapeHtml(expandHref)}">${escapeHtml(metadata.links.expand)}</a></li>`,
    `            <li><a href="/_stats/">${escapeHtml(metadata.links.stats)}</a></li>`,
    ...policyLinks.map(([slug, label]) => `            <li><a href="${prefix}/${slug}${extension}">${escapeHtml(label)}</a></li>`)
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
  copyPublic();
  writeSiteConfig(siteConfig);
  buildTestsPage(siteConfig);
  copyRuntimeBlocklist();
  buildRedirectTargets();
  validateRuntimeRegistry();
  assertNestedSlugSupport();
  syncHomeRegistry();

  log("Build complete");
}

main();
