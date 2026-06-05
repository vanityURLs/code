#!/usr/bin/env node

import assert from "node:assert/strict";
import { checkUpstreamRelease, compareVersions, formatUpstreamReleaseNotice } from "./lib/upstream-release.mjs";

const releases = [
  release({
    tag_name: "v3.10.0",
    name: "v3.10.0",
    body: "Feature release"
  }),
  release({
    tag_name: "v3.2.1",
    name: "v3.2.1",
    body: "Security fix for GHSA-abcd-1234-wxyz"
  }),
  release({
    tag_name: "v3.2.0",
    name: "v3.2.0",
    body: "Feature release"
  }),
  release({
    tag_name: "v3.1.9",
    name: "v3.1.9",
    body: "Maintenance release"
  })
];

{
  assert(compareVersions("3.10.0", "3.2.1") > 0);
  assert(compareVersions("v3.2.1", "3.2.1") === 0);
  assert(compareVersions("3.2.1+build.7", "3.2.0") > 0);
  assert(compareVersions("3.1.9", "3.2.0") < 0);
}

{
  const result = await checkUpstreamRelease({
    currentVersion: "3.1.8",
    fetchImpl: jsonFetch(releases)
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "behind-security");
  assert.equal(result.latestVersion, "3.10.0");
  assert.equal(result.behindCount, 4);
  assert.equal(result.security, true);
  assert.equal(result.securityCount, 1);

  const notice = formatUpstreamReleaseNotice(result);
  assert.match(notice, /SECURITY UPDATE/);
  assert.match(notice, /3\.10\.0/);
}

{
  const result = await checkUpstreamRelease({
    currentVersion: "3.10.0",
    fetchImpl: jsonFetch([
      release({ tag_name: "v3.10.1", prerelease: true }),
      release({ tag_name: "v3.10.0" }),
      release({ tag_name: "v3.11.0", draft: true })
    ])
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "current");
  assert.equal(result.behind, false);
  assert.equal(result.latestVersion, "3.10.0");
}

{
  const result = await checkUpstreamRelease({
    currentVersion: "not-a-version",
    fetchImpl: jsonFetch(releases)
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "unknown-current-version");
}

{
  const result = await checkUpstreamRelease({
    currentVersion: "3.2.0",
    fetchImpl: jsonFetch([
      release({ tag_name: "v3.3.0", draft: true }),
      release({ tag_name: "v3.3.1", prerelease: true })
    ])
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "no-release");
}

{
  const result = await checkUpstreamRelease({
    currentVersion: "3.2.0",
    fetchImpl: async () => {
      throw new Error("offline");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "network-unavailable");
  assert.equal(result.message, "offline");
  assert.match(formatUpstreamReleaseNotice(result), /skipped: offline/);
}

console.log("upstream release tests ok");

function jsonFetch(body) {
  return async () => Response.json(body);
}

function release({ tag_name, name = tag_name, body = "", draft = false, prerelease = false }) {
  return {
    body,
    draft,
    html_url: `https://github.com/vanityURLs/code/releases/tag/${tag_name}`,
    name,
    prerelease,
    tag_name
  };
}
