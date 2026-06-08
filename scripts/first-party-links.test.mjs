#!/usr/bin/env node

import assert from "node:assert/strict";
import { validateFirstPartyRouteReferences } from "./lib/first-party-links.mjs";

const siteConfig = {
  operator: {
    short_domain: "f-l.ca"
  }
};

{
  const result = validateFirstPartyRouteReferences(
    [
      {
        slug: "pacman",
        match: "exact",
        target: "https://f-l.ca/b/pacman",
        state: "ephemeral"
      },
      {
        slug: "b",
        match: "splat",
        target: "https://bonjourarcade.com/b/:splat",
        state: "ephemeral"
      }
    ],
    siteConfig
  );

  assert.deepEqual(result, { errors: [], warnings: [] });
}

{
  const result = validateFirstPartyRouteReferences(
    [
      {
        slug: "one",
        match: "exact",
        target: "https://f-l.ca/two",
        state: "ephemeral"
      },
      {
        slug: "two",
        match: "exact",
        target: "https://example.com/final",
        state: "ephemeral"
      }
    ],
    siteConfig
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /first-party exact alias "one" targets "two"/);
}

{
  const result = validateFirstPartyRouteReferences(
    [
      {
        slug: "one",
        match: "exact",
        target: "https://f-l.ca/two",
        state: "ephemeral"
      },
      {
        slug: "two",
        match: "exact",
        target: "https://f-l.ca/one",
        state: "ephemeral"
      }
    ],
    siteConfig
  );

  assert.equal(result.warnings.length, 2);
  assert.deepEqual(result.errors, ["first-party alias loop detected: one -> two -> one"]);
}

{
  const result = validateFirstPartyRouteReferences(
    [
      {
        slug: "pacman",
        match: "exact",
        target: "https://a6z.link/b/pacman",
        state: "ephemeral"
      },
      {
        slug: "b",
        match: "splat",
        target: "https://bonjourarcade.com/b/:splat",
        state: "ephemeral"
      }
    ],
    {},
    ["a6z.link"]
  );

  assert.deepEqual(result, { errors: [], warnings: [] });
}

console.log("first-party link tests ok");
