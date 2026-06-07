export function legalPagesEnabled(siteConfig) {
  return siteConfig?.operator?.legal_pages_enabled !== false;
}

export function legalPageSlugs(siteConfig) {
  return legalPagesEnabled(siteConfig) ? ["privacy", "terms", "abuse", "security"] : ["abuse"];
}

export function siteManifestShortName(siteConfig) {
  const branding = siteConfig?.branding || {};
  const wordmark = branding.wordmark || {};
  const candidates = [
    branding.domain,
    siteConfig?.operator?.short_domain,
    `${wordmark.black || ""}${wordmark.green || ""}`,
    "VanityURLs"
  ];

  return candidates.map((value) => String(value || "").trim()).find(Boolean) || "VanityURLs";
}

export function normalizeSecurityTxtValue(value) {
  return String(value || "")
    .trim()
    .replace(/[\r\n]/g, "");
}

export function validateOperatorConfig(operator) {
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

export function validateTrustConfig(operator) {
  const required = ["short_domain", "abuse_contact", "security_contact", "last_updated", "abuse_response_window"];
  const issues = required.filter((field) => isPlaceholderValue(operator[field]));

  for (const field of ["abuse_contact", "security_contact"]) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(operator[field]))) {
      issues.push(field);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(operator.last_updated))) {
    issues.push("last_updated");
  }

  return [...new Set(issues)];
}

export function validateSecurityConfig(operator) {
  const required = ["short_domain", "security_contact", "last_updated"];
  const issues = required.filter((field) => isPlaceholderValue(operator[field]));

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(operator.security_contact))) {
    issues.push("security_contact");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(operator.last_updated))) {
    issues.push("last_updated");
  }

  return [...new Set(issues)];
}

export function hasConfiguredSlogan(slogan) {
  if (slogan && typeof slogan === "object" && !Array.isArray(slogan)) {
    return Object.values(slogan).some((value) => String(value || "").trim());
  }
  return Boolean(String(slogan || "").trim());
}

export function renderBrandingSlogan(slogan, operator = {}, linkText = "") {
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

export function localizedSlogan(slogans, language = "en") {
  if (slogans && typeof slogans === "object" && !Array.isArray(slogans)) {
    return slogans[language] || slogans.en || "";
  }
  return String(slogans || "");
}

export function localizedSloganLinkText(linkTexts, language = "en") {
  if (linkTexts && typeof linkTexts === "object" && !Array.isArray(linkTexts)) {
    return linkTexts[language] || linkTexts.en || "";
  }
  return String(linkTexts || "");
}

export function renderConfiguredWordmark(siteConfig) {
  const wordmark = siteConfig?.branding?.wordmark;
  if (!wordmark?.black && !wordmark?.green) {
    return "<span>Vanity</span><span>URLs</span>";
  }

  return `<span>${escapeHtml(wordmark.black || "")}</span><span>${escapeHtml(wordmark.green || "")}</span>`;
}

export function withTheme(href, theme) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}theme=${theme}`;
}

export function encodePathSegment(value) {
  return encodeURIComponent(String(value || "").trim()).replace(/%2F/gi, "/");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeHtmlAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/g, "")
    .toLowerCase();
}

function isPlaceholderValue(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return (
    !normalized ||
    ["todo", "tbd", "to be defined", "changeme", "change-me", "default", "owner", "example", "example.com"].includes(
      normalized
    ) ||
    normalized.includes("example.") ||
    normalized.includes("your-")
  );
}
