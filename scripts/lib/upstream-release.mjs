import fs from "node:fs";
import path from "node:path";

const DEFAULT_REPOSITORY = "vanityURLs/code";
const DEFAULT_TIMEOUT_MS = 8000;

export function currentPackageVersion(root = process.cwd()) {
  const packagePath = path.join(root, "package.json");
  if (!fs.existsSync(packagePath)) return "";

  try {
    return JSON.parse(fs.readFileSync(packagePath, "utf8")).version || "";
  } catch {
    return "";
  }
}

export async function checkUpstreamRelease({
  currentVersion = currentPackageVersion(),
  repository = DEFAULT_REPOSITORY,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch
} = {}) {
  const normalizedCurrent = normalizeVersion(currentVersion);
  if (!normalizedCurrent) {
    return {
      ok: false,
      currentVersion,
      repository,
      status: "unknown-current-version",
      message: "Current vanityURLs version is unknown."
    };
  }

  try {
    const releases = await fetchReleases({ repository, timeoutMs, fetchImpl });
    const stableReleases = releases.filter(
      (release) => !release.draft && !release.prerelease && normalizeVersion(release.tag_name)
    );
    stableReleases.sort((left, right) =>
      compareVersions(normalizeVersion(right.tag_name), normalizeVersion(left.tag_name))
    );

    const latest = stableReleases[0];
    if (!latest) {
      return {
        ok: false,
        currentVersion,
        repository,
        status: "no-release",
        message: `No stable upstream release was found for ${repository}.`
      };
    }

    const latestVersion = normalizeVersion(latest.tag_name);
    const behindReleases = stableReleases.filter(
      (release) => compareVersions(normalizeVersion(release.tag_name), normalizedCurrent) > 0
    );
    const securityReleases = behindReleases.filter(isSecurityRelease);
    const behind = compareVersions(latestVersion, normalizedCurrent) > 0;

    return {
      ok: true,
      currentVersion: normalizedCurrent,
      latestVersion,
      latestTag: latest.tag_name,
      latestName: latest.name || latest.tag_name,
      latestUrl: latest.html_url || `https://github.com/${repository}/releases/tag/${latest.tag_name}`,
      repository,
      status: behind ? (securityReleases.length ? "behind-security" : "behind") : "current",
      behind,
      behindCount: behindReleases.length,
      security: securityReleases.length > 0,
      securityCount: securityReleases.length,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      currentVersion: normalizedCurrent,
      repository,
      status: "network-unavailable",
      message: error.message
    };
  }
}

async function fetchReleases({ repository, timeoutMs, fetchImpl }) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/releases?per_page=30`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "VanityURLs-UpstreamReleaseChecker/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`GitHub releases API returned HTTP ${response.status}`);

    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error("GitHub releases API response was not an array");
    return releases;
  } finally {
    clearTimeout(timeout);
  }
}

export function formatUpstreamReleaseNotice(result) {
  if (!result.ok) {
    return `[doctor] Upstream release check skipped: ${result.message || result.status}`;
  }

  if (!result.behind) {
    return `[doctor] vanityURLs is current (${result.currentVersion}).`;
  }

  const severity = result.security ? "SECURITY UPDATE" : "Update";
  const releaseWord = result.behindCount === 1 ? "release" : "releases";
  return [
    `[doctor] ${severity}: vanityURLs ${result.latestVersion} is available; this instance is on ${result.currentVersion}.`,
    `[doctor] Behind by ${result.behindCount} ${releaseWord}. ${result.latestUrl}`,
    result.security
      ? `[doctor] The gap includes ${result.securityCount} release${result.securityCount === 1 ? "" : "s"} marked as security-related.`
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function compareVersions(left, right) {
  const leftParts = normalizeVersion(left)
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  const rightParts = normalizeVersion(right)
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function normalizeVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[+-].*)?$/.exec(String(value || "").trim());
  return match ? `${match[1]}.${match[2]}.${match[3]}` : "";
}

function isSecurityRelease(release) {
  const haystack = [release.name, release.tag_name, release.body]
    .map((value) => String(value || "").toLowerCase())
    .join("\n");
  return /\b(security|cve-\d{4}-\d+|ghsa-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})\b/.test(haystack);
}
