#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();

function makeFixture() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "v8s-maintenance-"));

  fs.cpSync(ROOT, tmpDir, {
    recursive: true,
    filter: (sourcePath) => {
      const relative = path.relative(ROOT, sourcePath);
      const firstPart = relative.split(path.sep)[0];
      return ![".git", "build", "custom", "node_modules"].includes(firstPart);
    }
  });

  const sourceNodeModules = path.join(ROOT, "node_modules");
  if (fs.existsSync(sourceNodeModules)) {
    fs.symlinkSync(sourceNodeModules, path.join(tmpDir, "node_modules"), "dir");
  }

  return tmpDir;
}

function run(cwd, args) {
  return execFileSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, V8S_INTERNAL_SETUP: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function runCommand(cwd, args) {
  return execFileSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

{
  const fixture = makeFixture();
  fs.mkdirSync(path.join(fixture, "custom", "public"), { recursive: true });
  fs.writeFileSync(
    path.join(fixture, "custom", "v8s-site-config.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        branding: { custom_mode: "default" }
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(path.join(fixture, "custom", "public", "index.html"), "<!doctype html><title>Custom</title>\n");

  const missingAssetDoctorJson = JSON.parse(run(fixture, ["scripts/doctor.mjs", "--json"]));
  assert.equal(
    missingAssetDoctorJson.issues.some(
      (issue) => issue.code === "shared-asset-stale" && issue.path === "custom/public/logo.svg"
    ),
    false
  );

  fs.writeFileSync(path.join(fixture, "custom", "public", "logo.svg"), "<svg><title>custom logo</title></svg>\n");
  const staleAssetDoctorJson = JSON.parse(run(fixture, ["scripts/doctor.mjs", "--json"]));
  assert(
    staleAssetDoctorJson.issues.some(
      (issue) => issue.code === "shared-asset-stale" && issue.path === "custom/public/logo.svg"
    )
  );

  fs.writeFileSync(
    path.join(fixture, "custom", "v8s-custom-overrides.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        doctor: {
          ignore: [
            {
              path: "custom/public/logo.svg",
              codes: ["shared-asset-stale"],
              reason: "Instance-owned logo."
            }
          ]
        }
      },
      null,
      2
    )}\n`
  );
  const ignoredAssetDoctorJson = JSON.parse(run(fixture, ["scripts/doctor.mjs", "--json"]));
  assert.equal(
    ignoredAssetDoctorJson.issues.some(
      (issue) => issue.code === "shared-asset-stale" && issue.path === "custom/public/logo.svg"
    ),
    false
  );
}

{
  const fixture = makeFixture();
  run(fixture, [
    "scripts/setup.mjs",
    "--no-check",
    "--domain",
    "go.example",
    "--worker-name",
    "go-example",
    "--owner",
    "team",
    "--languages",
    "en,fr",
    "--operator-timezone",
    "America/Toronto",
    "--operator-legal-name",
    "Example Inc.",
    "--operator-domain",
    "example.com",
    "--operator-abuse-contact",
    "abuse@example.com",
    "--operator-security-contact",
    "security@example.com",
    "--branding-slogan",
    "A short-link service for Example Inc.'s projects",
    "--customize-public"
  ]);

  const indexPath = path.join(fixture, "custom", "public", "en", "index.html");
  let indexHtml = fs.readFileSync(indexPath, "utf8");
  indexHtml = indexHtml
    .replace(/\s*<link rel="icon"[^>]+>\n/, "\n")
    .replace(/\s*<link rel="apple-touch-icon"[^>]+>\n/, "\n")
    .replace(/\s*<script data-v8s-theme-override>[\s\S]*?<\/script>\n/, "\n");
  fs.writeFileSync(indexPath, indexHtml);

  const doctorJson = JSON.parse(run(fixture, ["scripts/doctor.mjs", "--json"]));
  assert(
    doctorJson.issues.some(
      (issue) => issue.code === "html-head-assets-stale" && issue.path === "custom/public/en/index.html"
    )
  );
  const doctorText = run(fixture, ["scripts/doctor.mjs"]);
  assert.match(doctorText, /Recommended fix:/);
  assert.match(doctorText, /\.\/scripts\/v8s-fix .*--head-assets/);
  assert.match(doctorText, /--head-assets: 1 issue/);

  runCommand(fixture, ["scripts/v8s-fix", "--head-assets"]);
  const fixedHtml = fs.readFileSync(indexPath, "utf8");
  assert.match(fixedHtml, /rel="icon"/);
  assert.match(fixedHtml, /rel="apple-touch-icon"/);
  assert.match(fixedHtml, /data-v8s-theme-override/);
}

{
  const fixture = makeFixture();
  run(fixture, [
    "scripts/setup.mjs",
    "--no-check",
    "--domain",
    "go.example",
    "--worker-name",
    "go-example",
    "--owner",
    "team",
    "--languages",
    "en,fr",
    "--operator-timezone",
    "America/Toronto",
    "--operator-legal-name",
    "Example Inc.",
    "--operator-domain",
    "example.com",
    "--operator-abuse-contact",
    "abuse@example.com",
    "--operator-security-contact",
    "security@example.com",
    "--branding-slogan",
    "A short-link service for Example Inc.'s projects",
    "--customize-public"
  ]);

  const logoPath = path.join(fixture, "custom", "public", "logo.svg");
  fs.writeFileSync(logoPath, "<svg><title>old logo</title></svg>\n");
  const llmsPath = path.join(fixture, "custom", "public", "llms.txt");
  fs.writeFileSync(llmsPath, "old llms context\n");

  const doctorJson = JSON.parse(run(fixture, ["scripts/doctor.mjs", "--json"]));
  assert(doctorJson.issues.some((issue) => issue.code === "shared-asset-stale" && issue.fix === "assets"));

  runCommand(fixture, ["scripts/v8s-fix", "--assets"]);
  assert.equal(
    fs.readFileSync(logoPath, "utf8"),
    fs.readFileSync(path.join(fixture, "defaults", "public", "logo.svg"), "utf8")
  );
  assert.equal(
    fs.readFileSync(llmsPath, "utf8"),
    fs.readFileSync(path.join(fixture, "defaults", "public", "llms.txt"), "utf8")
  );
}

{
  const fixture = makeFixture();
  run(fixture, [
    "scripts/setup.mjs",
    "--no-check",
    "--domain",
    "go.example",
    "--worker-name",
    "go-example",
    "--owner",
    "team",
    "--languages",
    "en,fr",
    "--operator-timezone",
    "America/Toronto",
    "--operator-legal-name",
    "Example Inc.",
    "--operator-domain",
    "example.com",
    "--operator-abuse-contact",
    "abuse@example.com",
    "--operator-security-contact",
    "security@example.com",
    "--branding-slogan",
    "A short-link service for Example Inc.'s projects",
    "--customize-public"
  ]);

  const configPath = path.join(fixture, "custom", "v8s-site-config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.i18n.supported_languages = ["en"];
  config.branding.slogan.en = "Updated links for Example Inc.'s projects";
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const doctorJson = JSON.parse(run(fixture, ["scripts/doctor.mjs", "--json"]));
  assert(doctorJson.issues.some((issue) => issue.code === "unsupported-language-present" && issue.fix === "languages"));
  assert(doctorJson.issues.some((issue) => issue.code === "branding-stale" && issue.fix === "branding"));

  runCommand(fixture, ["scripts/v8s-fix", "--languages", "--branding"]);
  assert.equal(fs.existsSync(path.join(fixture, "custom", "public", "fr")), false);
  assert.match(fs.readFileSync(path.join(fixture, "custom", "public", "en", "index.html"), "utf8"), /Updated links/);
  assert(
    !JSON.parse(run(fixture, ["scripts/doctor.mjs", "--json"])).issues.some((issue) => issue.code === "branding-stale")
  );
}

{
  const fixture = makeFixture();
  run(fixture, [
    "scripts/setup.mjs",
    "--no-check",
    "--domain",
    "go.example",
    "--worker-name",
    "go-example",
    "--owner",
    "team",
    "--languages",
    "en,fr",
    "--operator-timezone",
    "America/Toronto",
    "--operator-legal-name",
    "Example Inc.",
    "--operator-domain",
    "example.com",
    "--operator-abuse-contact",
    "abuse@example.com",
    "--operator-security-contact",
    "security@example.com",
    "--branding-slogan",
    "A short-link service for Example Inc.'s projects",
    "--customize-public"
  ]);

  const statsPath = path.join(fixture, "custom", "public", "_stats", "index.html");
  fs.writeFileSync(statsPath, "<!doctype html><title>Old dashboard</title>\n");

  const doctorJson = JSON.parse(run(fixture, ["scripts/doctor.mjs", "--json"]));
  assert(
    doctorJson.issues.some(
      (issue) =>
        issue.code === "product-page-stale" &&
        issue.fix === "product-pages" &&
        issue.path === "custom/public/_stats/index.html"
    )
  );

  runCommand(fixture, ["scripts/v8s-fix", "--product-pages"]);
  const fixedStatsHtml = fs.readFileSync(statsPath, "utf8");
  assert.doesNotMatch(fixedStatsHtml, /Old dashboard/);
  assert.match(fixedStatsHtml, /id="metrics"/);
  assert.match(fixedStatsHtml, /href="api\/v8s\.json"/);

  const fixedDoctorJson = JSON.parse(run(fixture, ["scripts/doctor.mjs", "--json"]));
  assert.equal(
    fixedDoctorJson.issues.some((issue) => issue.path === "custom/public/_stats/index.html"),
    false
  );
}

console.log("maintenance tests ok");
