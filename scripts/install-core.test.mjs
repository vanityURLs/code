#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  analyticsDisclosureDefault,
  defaultBrandingSlogan,
  defaultContactEmail,
  normalizeAccessTeamDomain,
  normalizeArgs,
  normalizeAnalyticsProviders,
  normalizeDomain,
  normalizeLanguages,
  normalizeRandomSlugLength,
  normalizeSloganMap,
  parseArgs,
  slugifyOwner,
  slugifyWorker,
  suggestWordmarkSplit
} from "./lib/install/core.mjs";

{
  assert.deepEqual(parseArgs(["--domain", "https://Go.Example/path", "--no-check", "--customize-public"]), {
    analytics: "disabled",
    check: false,
    customizePublic: true,
    dryRun: false,
    domain: "https://Go.Example/path",
    force: false,
    owner: "owner"
  });
  assert.throws(() => parseArgs(["--domain"]), /Missing value/);
  assert.throws(() => parseArgs(["unexpected"]), /Unknown argument/);
}

{
  assert.equal(normalizeDomain("https://Go.Example/path"), "go.example");
  assert.equal(slugifyWorker("Go Example!!!"), "go-example");
  assert.equal(slugifyOwner("Team Name!"), "team-name");
  assert.deepEqual(normalizeLanguages("fr-CA,en,fr,de"), ["en", "fr", "de"]);
  assert.equal(normalizeAnalyticsProviders("Umami, FATHOM"), "umami,fathom");
  assert.throws(() => normalizeAnalyticsProviders("plausible"), /Unsupported analytics provider/);
  assert.equal(normalizeRandomSlugLength("12"), 12);
  assert.throws(() => normalizeRandomSlugLength("0"), /Random slug length/);
}

{
  assert.equal(defaultContactEmail("security", "https://Example.com/path"), "security@example.com");
  assert.equal(normalizeAccessTeamDomain("https://team.cloudflareaccess.com/"), "team.cloudflareaccess.com");
  assert.deepEqual(suggestWordmarkSplit("go.example"), { black: "go.", green: "example" });
}

{
  assert.equal(analyticsDisclosureDefault("disabled"), "No analytics enabled.");
  assert.equal(
    analyticsDisclosureDefault("umami"),
    "Privacy-respecting analytics are configured for operations, security, and reliability."
  );
  assert.equal(
    defaultBrandingSlogan({ operatorLegalName: "Example Inc." }, "en"),
    "A short-link service for Example Inc.'s projects"
  );
  assert.deepEqual(normalizeSloganMap("Hello", ["en", "fr"], { operatorLegalName: "Example Inc." }), {
    en: "Hello",
    fr: "Un service de liens courts pour les projets de Example Inc."
  });
}

{
  const normalized = normalizeArgs(
    {
      analytics: "umami",
      domain: "https://Go.Example/path",
      owner: "Team Name",
      operatorAbuseContact: "abuse@example.com",
      operatorSecurityContact: "security@example.com",
      operatorTimezone: "America/Toronto",
      wordmarkBlack: "Go.",
      wordmarkGreen: "Example"
    },
    {
      defaultRandomSlugLength: 5,
      fallbackLastUpdated: "2026-06-05"
    }
  );

  assert.equal(normalized.domain, "go.example");
  assert.equal(normalized.workerName, "go-example");
  assert.equal(normalized.owner, "team-name");
  assert.equal(normalized.randomSlugLength, 5);
  assert.equal(normalized.operator.short_domain, "go.example");
  assert.equal(normalized.operator.last_updated, "2026-06-05");
  assert.equal(normalized.operator.analytics_retention, "180 days");
  assert.equal(normalized.configureBranding, true);
}

{
  assert.throws(
    () =>
      normalizeArgs(
        {
          domain: "go.example",
          operatorAbuseContact: "abuse@example.com",
          operatorSecurityContact: "security@example.com",
          operatorTimezone: "-4"
        },
        { fallbackLastUpdated: "2026-06-05" }
      ),
    /Operator timezone must be an IANA timezone name/
  );
}

console.log("install core tests ok");
