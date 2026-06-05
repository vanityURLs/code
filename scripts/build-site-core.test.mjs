#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  encodePathSegment,
  escapeHtml,
  escapeHtmlAttribute,
  hasConfiguredSlogan,
  legalPageSlugs,
  legalPagesEnabled,
  localizedSlogan,
  normalizeSecurityTxtValue,
  renderBrandingSlogan,
  renderConfiguredWordmark,
  siteManifestShortName,
  validateOperatorConfig,
  validateSecurityConfig,
  validateTrustConfig,
  withTheme
} from "./lib/build/site-core.mjs";

{
  assert.equal(legalPagesEnabled({}), true);
  assert.equal(legalPagesEnabled({ operator: { legal_pages_enabled: false } }), false);
  assert.deepEqual(legalPageSlugs({}), ["privacy", "terms", "abuse", "security"]);
  assert.deepEqual(legalPageSlugs({ operator: { legal_pages_enabled: false } }), ["abuse"]);
}

{
  assert.equal(
    siteManifestShortName({
      branding: { wordmark: { black: "Vanity", green: "URLs" } },
      operator: { short_domain: "go.example" }
    }),
    "go.example"
  );
  assert.equal(siteManifestShortName({ branding: { wordmark: { black: "go", green: ".ex" } } }), "go.ex");
}

{
  assert.equal(normalizeSecurityTxtValue(" security@example.com\r\nIgnored"), "security@example.comIgnored");
  assert.equal(escapeHtml('<a&b>"'), "&lt;a&amp;b&gt;&quot;");
  assert.equal(escapeHtmlAttribute("Benoit's"), "Benoit&#39;s");
  assert.equal(encodePathSegment("lookup/nested value"), "lookup/nested%20value");
  assert.equal(withTheme("/lookup?x=1", "dark"), "/lookup?x=1&theme=dark");
}

{
  const operator = {
    legal_name: "Dicaire",
    operator_domain: "https://dicaire.com/about"
  };
  assert.equal(
    renderBrandingSlogan("A Dicaire service", operator),
    'A <a href="https://dicaire.com">Dicaire</a> service'
  );
  assert.equal(localizedSlogan({ en: "Hello", fr: "Bonjour" }, "fr"), "Bonjour");
  assert.equal(hasConfiguredSlogan({ en: "" }), false);
  assert.equal(hasConfiguredSlogan({ en: "Hello" }), true);
  assert.equal(
    renderConfiguredWordmark({ branding: { wordmark: { black: "Vanity", green: "URLs" } } }),
    "<span>Vanity</span><span>URLs</span>"
  );
}

{
  const validOperator = {
    abuse_contact: "abuse@dicaire.com",
    abuse_response_window: "48 hours",
    analytics_disclosure: "Analytics disclosed",
    contact_email: "hello@dicaire.com",
    governing_law: "Quebec",
    jurisdiction: "Canada",
    last_updated: "2026-06-04",
    legal_name: "Example Inc.",
    privacy_contact: "privacy@dicaire.com",
    security_contact: "security@dicaire.com",
    short_domain: "go.example",
    umami_geo_ip_mode: "truncated"
  };

  assert.deepEqual(validateOperatorConfig(validOperator), []);
  assert.deepEqual(validateTrustConfig(validOperator), []);
  assert.deepEqual(validateSecurityConfig(validOperator), []);
  assert.deepEqual(validateSecurityConfig({ ...validOperator, security_contact: "todo" }), ["security_contact"]);
  assert(validateOperatorConfig({ ...validOperator, legal_name: "TODO" }).includes("legal_name"));
}

console.log("build site core tests ok");
