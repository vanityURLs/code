import { compareVersions, normalizeVersion } from "./upstream-release.mjs";

export const LATEST_RELEASE_REF = "latest-release";

export function isLatestReleaseRef(ref) {
  return String(ref || "").trim() === LATEST_RELEASE_REF;
}

export function latestStableTagFromLsRemote(output) {
  const tags = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim().match(/\srefs\/tags\/(v\d+\.\d+\.\d+)$/)?.[1] || "")
    .filter((tag) => normalizeVersion(tag));

  tags.sort((left, right) => compareVersions(right, left));
  return tags[0] || "";
}

export function formatUpgradeSource(ref) {
  const value = String(ref || "").trim();
  if (!value) return "";
  if (isLatestReleaseRef(value)) return "[source] vanityURLs latest stable release tag";
  if (normalizeVersion(value)) return `[source] vanityURLs release ${value}`;
  return `[source] vanityURLs ${value} (unreleased or mutable ref)`;
}
