import fs from "node:fs";
import path from "node:path";

export function copyDirectory(source, target) {
  fs.cpSync(source, target, {
    recursive: true,
    filter: (sourcePath) => path.basename(sourcePath) !== ".gitkeep"
  });
}

export function hasCopyableFiles(directory) {
  if (!fs.existsSync(directory)) return false;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".gitkeep") continue;

    const entryPath = path.join(directory, entry.name);
    if (entry.isFile()) return true;
    if (entry.isDirectory() && hasCopyableFiles(entryPath)) return true;
  }

  return false;
}

export function supportedLanguages(siteConfig) {
  const configured = Array.isArray(siteConfig?.i18n?.supported_languages)
    ? siteConfig.i18n.supported_languages
    : ["en"];
  const languages = configured
    .map(
      (language) =>
        String(language || "")
          .trim()
          .toLowerCase()
          .split("-")[0]
    )
    .filter(Boolean);
  return [...new Set(languages)].includes("en") ? [...new Set(languages)] : ["en", ...new Set(languages)];
}

export function mergeSiteConfig(base, custom) {
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

export function cleanBuild({ buildDir, generatedBlocklistPath, log }) {
  log("Cleaning build/");
  const generatedBlocklist = fs.existsSync(generatedBlocklistPath) ? fs.readFileSync(generatedBlocklistPath) : null;

  fs.rmSync(buildDir, {
    recursive: true,
    force: true
  });

  fs.mkdirSync(buildDir, {
    recursive: true
  });

  if (generatedBlocklist) {
    fs.writeFileSync(generatedBlocklistPath, generatedBlocklist);
  }
}

export function copyRuntimeSource({ workerSourceDir, runtimeSourceDir, log }) {
  log("Copying scripts/workers/ to src/");

  fs.rmSync(runtimeSourceDir, {
    recursive: true,
    force: true
  });

  fs.mkdirSync(runtimeSourceDir, {
    recursive: true
  });

  copyDirectory(workerSourceDir, runtimeSourceDir);
}

export function patchRuntimeLanguages({ runtimeSourceDir, siteConfig }) {
  const workerPath = path.join(runtimeSourceDir, "worker.mjs");
  const localizedLanguages = supportedLanguages(siteConfig).filter((language) => language !== "en");
  const text = fs.readFileSync(workerPath, "utf8");
  const next = text.replace(
    /const LOCALIZED_HTML_LANGUAGES = \[[^\]]*\];[^\n]*/,
    `const LOCALIZED_HTML_LANGUAGES = ${JSON.stringify(localizedLanguages)}; // generated from v8s-site-config.json`
  );

  fs.writeFileSync(workerPath, next);
}

export function copyPublic({ defaultPublicDir, customPublicDir, buildDir, root, siteConfig, log }) {
  log("Copying defaults/public/");
  copyDirectory(defaultPublicDir, buildDir);
  copyEnglishPublicRoot({ publicSource: defaultPublicDir, buildDir, root, log });

  const usingCustomPublic = hasCopyableFiles(customPublicDir);
  if (usingCustomPublic) {
    log("Overlaying custom/public/");
    copyDirectory(customPublicDir, buildDir);
    copyEnglishPublicRoot({ publicSource: customPublicDir, buildDir, root, log });
  } else {
    copyLocalizedBadgeFallbacks({ buildDir, siteConfig });
  }

  const defaultsDir = path.dirname(defaultPublicDir);
  pruneUnsupportedLanguageDirs(
    buildDir,
    siteConfig,
    readJsonFile(path.join(defaultsDir, "v8s-language-metadata.json"))
  );
}

export function pruneUnsupportedLanguageDirs(publicDir, siteConfig, languageMetadata = {}) {
  const supported = new Set(supportedLanguages(siteConfig));
  for (const language of Object.keys(languageMetadata)) {
    if (language === "en" || supported.has(language)) continue;

    fs.rmSync(path.join(publicDir, language), {
      recursive: true,
      force: true
    });
  }
}

export function writeSiteConfig(siteConfig, runtimeSiteConfigPath) {
  fs.writeFileSync(runtimeSiteConfigPath, `${JSON.stringify(siteConfig, null, 2)}\n`);
}

function copyEnglishPublicRoot({ publicSource, buildDir, root, log }) {
  const englishPublic = path.join(publicSource, "en");
  if (!hasCopyableFiles(englishPublic)) return;

  log(`Copying ${path.relative(root, englishPublic)}/ to public root`);
  copyDirectory(englishPublic, buildDir);
}

function copyLocalizedBadgeFallbacks({ buildDir, siteConfig }) {
  const lightBadge = path.join(buildDir, "v8s-redirected.svg");
  const darkBadge = path.join(buildDir, "v8s-redirected-dark.svg");
  const badgeFiles = [
    ["v8s-redirected.svg", lightBadge],
    ["v8s-redirected-dark.svg", darkBadge]
  ];

  for (const language of supportedLanguages(siteConfig)) {
    if (language === "en") continue;

    const languageDir = path.join(buildDir, language);
    fs.mkdirSync(languageDir, { recursive: true });

    for (const [fileName, sourcePath] of badgeFiles) {
      const targetPath = path.join(languageDir, fileName);
      if (!fs.existsSync(targetPath) && fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
