#!/usr/bin/env node

import assert from "node:assert/strict";
import { isLatestReleaseRef, latestStableTagFromLsRemote } from "./lib/upgrade-source.mjs";

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

console.log("upgrade source tests ok");
