#!/usr/bin/env node

import assert from "node:assert/strict";
import { normalizeReplacementUrl } from "./lib/target-normalizers.mjs";

{
  const result = normalizeReplacementUrl(
    "https://youtu.be/ia6Di_ytiSE?si=share&t=3112",
    "https://www.youtube.com/watch?si=share&t=3112&v=ia6Di_ytiSE&feature=youtu.be"
  );

  assert.equal(result.kind, "good");
  assert.equal(result.url, "https://www.youtube.com/watch?v=ia6Di_ytiSE&t=3112");
}

{
  const result = normalizeReplacementUrl(
    "https://amzn.to/example",
    "https://www.amazon.ca/dp/B01AIVT6NM/ref=cm_sw_r?linkCode=ml1&tag=felleg-20",
    {
      targets: {
        normalizers: {
          amazon: {
            preserve_affiliate_tag: true,
            allowed_tags: ["felleg-20"]
          }
        }
      }
    }
  );

  assert.equal(result.kind, "good");
  assert.equal(result.url, "https://www.amazon.ca/dp/B01AIVT6NM?tag=felleg-20");
}

{
  const result = normalizeReplacementUrl(
    "https://amzn.to/example",
    "https://www.amazon.ca/dp/B01AIVT6NM/ref=cm_sw_r?linkCode=ml1&tag=other"
  );

  assert.equal(result.kind, "good");
  assert.equal(result.url, "https://www.amazon.ca/dp/B01AIVT6NM");
}

{
  const result = normalizeReplacementUrl(
    "https://spotify.link/M06oHWX6CXb",
    "https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6"
  );

  assert.equal(result.kind, "avoid");
}

console.log("target normalizer tests ok");
