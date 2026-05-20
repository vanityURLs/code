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

  const languages = supportedLanguages(siteConfig).filter((language) => language === "en" || language === "fr");
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
  if (validateOperatorConfig(operator).length) return;

  const securityTxtPath = path.join(BUILD_DIR, "security.txt");
  const shortDomain = normalizeSecurityTxtValue(operator.short_domain);
  const securityContact = normalizeSecurityTxtValue(operator.security_contact);
  const preferredLanguages = supportedLanguages(siteConfig).join(", ");
  const expires = securityTxtExpires(operator.last_updated);
  const content = [
    `Contact: mailto:${securityContact}`,
    `Policy: https://${shortDomain}/security`,
    `Canonical: https://${shortDomain}/security.txt`,
    `Preferred-Languages: ${preferredLanguages}`,
    `Expires: ${expires}`,
    ""
  ].join("\n");

  fs.writeFileSync(securityTxtPath, content);
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
    || html.includes("Modèle par défaut à adapter par le propriétaire de l'instance.");
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
    last_updated: operator.last_updated || gitLastUpdatedDate()
  };
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
  return escapeHtml(text)
    .replaceAll("{{legal_name}}", escapeHtml(operator.legal_name || ""))
    .replaceAll("{{short_domain}}", escapeHtml(operator.short_domain || ""))
    .replaceAll("{{jurisdiction}}", escapeHtml(operator.jurisdiction || ""))
    .replaceAll("{{governing_law}}", escapeHtml(operator.governing_law || ""))
    .replaceAll("{{contact_email}}", `<a href="mailto:${escapeHtml(operator.contact_email || "")}">${escapeHtml(operator.contact_email || "")}</a>`)
    .replaceAll("{{privacy_contact}}", `<a href="mailto:${escapeHtml(operator.privacy_contact || "")}">${escapeHtml(operator.privacy_contact || "")}</a>`)
    .replaceAll("{{abuse_contact}}", `<a href="mailto:${escapeHtml(operator.abuse_contact || "")}">${escapeHtml(operator.abuse_contact || "")}</a>`)
    .replaceAll("{{security_contact}}", `<a href="mailto:${escapeHtml(operator.security_contact || "")}">${escapeHtml(operator.security_contact || "")}</a>`)
    .replaceAll("{{analytics_disclosure}}", escapeHtml(operator.analytics_disclosure || ""))
    .replaceAll("{{analytics_retention}}", escapeHtml(operator.analytics_retention || ""))
    .replaceAll("{{abuse_response_window}}", escapeHtml(operator.abuse_response_window || ""));
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
      note: "Privacy notice for {{legal_name}}, operated under {{jurisdiction}}.",
      lastUpdated: "Last updated:",
      sections: [
        ["Overview", "{{legal_name}} operates {{short_domain}} as a vanityURLs instance to redirect short links to destination pages."],
        ["Information processed", "When someone visits a short link, the hosting provider and Worker runtime may process standard request information such as requested path, timestamp, IP address, user agent, referrer, and security metadata. This information is used to deliver redirects, protect the service, diagnose reliability issues, and respond to abuse."],
        ["Analytics", "{{analytics_disclosure}}"],
        ["Analytics retention", "{{analytics_retention}}"],
        ["Destinations", "After a redirect, the destination website is controlled by its own operator and may have separate privacy practices."],
        ["Contact", "For privacy questions, contact {{privacy_contact}}."]
      ]
    },
    terms: {
      note: "Terms and conditions for {{legal_name}}, operated under {{jurisdiction}}.",
      lastUpdated: "Last updated:",
      sections: [
        ["Use of this service", "{{legal_name}} provides {{short_domain}} to redirect short links to destination pages."],
        ["Acceptable use", "Do not use this service for phishing, malware, credential theft, spam, harassment, impersonation, or other abusive activity. The operator may disable or remove links that appear unsafe, misleading, illegal, or inconsistent with its policies."],
        ["External destinations", "Short links may redirect to websites operated by third parties. {{legal_name}} is not responsible for the content, availability, or practices of external destinations."],
        ["No warranty", "This service is provided as configured by the operator. Availability, accuracy, and continued operation are not guaranteed."],
        ["Governing law", "These terms are governed by {{governing_law}}."],
        ["Contact", "Questions about these terms should be directed to {{contact_email}}."]
      ]
    },
    abuse: {
      note: "Trust and safety information for {{legal_name}}.",
      lastUpdated: "Last updated:",
      sections: [
        ["Report harmful or unsafe use", "If a short link appears to be used for phishing, malware, spam, impersonation, harassment, security concerns, or another harmful purpose, report it to {{abuse_contact}}."],
        ["What to include", "Include the short URL, the destination you reached, the reason it appears abusive, and any relevant screenshots or timestamps. Do not include sensitive personal information unless necessary for the report."],
        ["Response", "{{legal_name}} aims to review trust and safety reports within {{abuse_response_window}} and may disable unsafe links, update block policies, investigate security concerns, or take other action needed to protect visitors and the reputation of {{short_domain}}."],
        ["Jurisdiction", "This instance is operated under {{jurisdiction}}."]
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
      note: "Avis de confidentialité pour {{legal_name}}, exploité sous {{jurisdiction}}.",
      lastUpdated: "Dernière mise à jour :",
      sections: [
        ["Vue d’ensemble", "{{legal_name}} exploite {{short_domain}} comme instance vanityURLs pour rediriger des liens courts vers des pages de destination."],
        ["Renseignements traités", "Lorsqu'une personne visite un lien court, l'hébergeur et le Worker peuvent traiter des renseignements standards de requête comme le chemin demandé, l'horodatage, l'adresse IP, l'agent utilisateur, le référent et certaines métadonnées de sécurité. Ces renseignements servent à livrer les redirections, protéger le service, diagnostiquer les problèmes de fiabilité et répondre aux abus."],
        ["Analytique", "{{analytics_disclosure}}"],
        ["Conservation analytique", "{{analytics_retention}}"],
        ["Destinations", "Après une redirection, le site de destination est contrôlé par son propre exploitant et peut avoir ses propres pratiques de confidentialité."],
        ["Contact", "Pour les questions de confidentialité, contactez {{privacy_contact}}."]
      ]
    },
    terms: {
      note: "Conditions d'utilisation pour {{legal_name}}, exploité sous {{jurisdiction}}.",
      lastUpdated: "Dernière mise à jour :",
      sections: [
        ["Utilisation du service", "{{legal_name}} fournit {{short_domain}} pour rediriger des liens courts vers des pages de destination."],
        ["Utilisation acceptable", "N'utilisez pas ce service pour l'hameçonnage, les logiciels malveillants, le vol d'identifiants, le pourriel, le harcèlement, l'usurpation d'identité ou toute autre activité abusive. L'opérateur peut désactiver ou supprimer les liens qui semblent dangereux, trompeurs, illégaux ou incompatibles avec ses politiques."],
        ["Destinations externes", "Les liens courts peuvent rediriger vers des sites exploités par des tiers. {{legal_name}} n'est pas responsable du contenu, de la disponibilité ou des pratiques des destinations externes."],
        ["Aucune garantie", "Ce service est fourni selon la configuration de l'opérateur. La disponibilité, l'exactitude et le fonctionnement continu ne sont pas garantis."],
        ["Droit applicable", "Ces conditions sont régies par {{governing_law}}."],
        ["Contact", "Les questions relatives à ces conditions doivent être adressées à {{contact_email}}."]
      ]
    },
    abuse: {
      note: "Information de confiance et de sécurité pour {{legal_name}}.",
      lastUpdated: "Dernière mise à jour :",
      sections: [
        ["Signaler un usage nuisible ou dangereux", "Si un lien court semble utilisé pour l'hameçonnage, des logiciels malveillants, du pourriel, l'usurpation d'identité, le harcèlement, un enjeu de sécurité ou un autre usage nuisible, signalez-le à {{abuse_contact}}."],
        ["Quoi inclure", "Incluez l'URL courte, la destination atteinte, la raison pour laquelle elle semble abusive et toute capture d'écran ou tout horodatage pertinent. N'incluez pas de renseignements personnels sensibles sauf si c'est nécessaire au signalement."],
        ["Réponse", "{{legal_name}} vise à examiner les signalements de confiance et sécurité dans un délai de {{abuse_response_window}} et peut désactiver les liens dangereux, mettre à jour les politiques de blocage, enquêter sur les enjeux de sécurité ou prendre d'autres mesures nécessaires pour protéger les visiteurs et la réputation de {{short_domain}}."],
        ["Juridiction", "Cette instance est exploitée sous {{jurisdiction}}."]
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
  const policyLinks = language === "en" || language === "fr"
    ? [
      ["privacy", metadata.links.privacy || "Privacy"],
      ["terms", metadata.links.terms || "Terms"],
      ["abuse", metadata.links.abuse || "Trust & Safety"],
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
