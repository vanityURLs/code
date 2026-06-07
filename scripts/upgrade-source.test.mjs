#!/usr/bin/env node

import assert from "node:assert/strict";
import { formatUpgradeSource, isLatestReleaseRef, latestStableTagFromLsRemote } from "./lib/upgrade-source.mjs";

const output = [
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trefs/tags/v3.2.9",
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\trefs/tags/v3.10.0",
  "cccccccccccccccccccccccccccccccccccccccc\trefs/tags/v3.10.1-beta.1",
  "dddddddddddddddddddddddddddddddddddddddd\trefs/tags/not-a-release",
  "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\trefs/tags/v2.99.0"
].join("\n");

assert.equal(latestStableTagFromLsRemote(output), "v3.10.0");
assert.equal(latestStableTagFromLsRemote(""), "");
assert.equal(isLatestReleaseRef("latest-release"), true);
assert.equal(isLatestReleaseRef("main"), false);
assert.equal(formatUpgradeSource("latest-release"), "[source] vanityURLs latest stable release tag");
assert.equal(formatUpgradeSource("v3.3.1"), "[source] vanityURLs release v3.3.1");
assert.equal(formatUpgradeSource("main"), "[source] vanityURLs main (unreleased or mutable ref)");

console.log("upgrade source tests ok");
