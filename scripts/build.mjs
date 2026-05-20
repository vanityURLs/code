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
      terms: "Términos",
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
      terms: "Condizioni",
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
      terms: "Bedingungen",
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
  },
  es: {
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
    }
  },
  it: {
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
    }
  },
  de: {
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
