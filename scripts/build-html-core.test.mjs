#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  insertBeforeFirstStylesheet,
  insertBeforeHeadClose,
  normalizeHtmlHead,
  normalizePublicAssetVersions,
  THEME_OVERRIDE_SCRIPT
} from "./lib/build-core/html-core.mjs";

{
  assert.equal(
    normalizePublicAssetVersions('<link rel="stylesheet" href="/style.css">', "123"),
    '<link rel="stylesheet" href="/style.css?v=123">'
  );
  assert.equal(
    normalizePublicAssetVersions('<link rel="stylesheet" href="/style.css?v=1">', "123"),
    '<link rel="stylesheet" href="/style.css?v=123">'
  );
}

{
  assert.equal(insertBeforeHeadClose("<html><head></head></html>", "X"), "<html><head>X</head></html>");
  assert.equal(
    insertBeforeFirstStylesheet('<head><link rel="stylesheet" href="/style.css"></head>', "X"),
    '<head>X<link rel="stylesheet" href="/style.css"></head>'
  );
  assert.equal(insertBeforeFirstStylesheet("<head></head>", "X"), "<head>X</head>");
}

{
  const normalized = normalizeHtmlHead(
    '<html><head><link rel="stylesheet" href="/style.css"></head><body></body></html>',
    { assetVersion: "123" }
  );

  assert(normalized.includes('href="/style.css?v=123"'));
  assert(normalized.includes('rel="icon"'));
  assert(normalized.includes('rel="apple-touch-icon"'));
  assert(normalized.includes("data-v8s-theme-override"));
  assert(normalized.indexOf("data-v8s-theme-override") < normalized.indexOf('rel="stylesheet"'));
}

{
  const original =
    '<head><script data-v8s-theme-override></script><link rel="icon" href="/custom.svg"><link rel="apple-touch-icon" href="/custom.png"><link rel="stylesheet" href="/style.css"></head>';
  const normalized = normalizeHtmlHead(original, { assetVersion: "123" });

  assert.equal((normalized.match(/data-v8s-theme-override/g) || []).length, 1);
  assert.equal((normalized.match(/rel="icon"/g) || []).length, 1);
  assert.equal((normalized.match(/rel="apple-touch-icon"/g) || []).length, 1);
}

assert(THEME_OVERRIDE_SCRIPT.includes("applyThemeImages"));

console.log("build html core tests ok");
