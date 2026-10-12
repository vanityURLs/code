#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  DEFAULT_RANDOM_SLUG_ALPHABET,
  MAX_RANDOM_SLUG_LENGTH,
  normalizeRandomSlugAlphabet,
  normalizeRandomSlugLength,
  randomSlug
} from "./slug.mjs";

{
  assert.equal(normalizeRandomSlugLength("5"), 5);
  assert.equal(normalizeRandomSlugLength(MAX_RANDOM_SLUG_LENGTH), MAX_RANDOM_SLUG_LENGTH);
  assert.throws(() => normalizeRandomSlugLength(undefined), /random slug length must be an integer/);
  assert.throws(() => normalizeRandomSlugLength("0"), /random slug length must be an integer/);
  assert.throws(
    () => normalizeRandomSlugLength(String(MAX_RANDOM_SLUG_LENGTH + 1)),
    /random slug length must be an integer/
  );
  assert.throws(() => normalizeRandomSlugLength("abc"), /random slug length must be an integer/);
}

{
  assert.equal(normalizeRandomSlugAlphabet(undefined), DEFAULT_RANDOM_SLUG_ALPHABET);
  assert.equal(normalizeRandomSlugAlphabet(""), DEFAULT_RANDOM_SLUG_ALPHABET);
  assert.equal(normalizeRandomSlugAlphabet("abc"), "abc");
  assert.throws(() => normalizeRandomSlugAlphabet("   "), /cannot be empty/);
  assert.throws(() => normalizeRandomSlugAlphabet("aab"), /duplicate characters/);
  assert.throws(() => normalizeRandomSlugAlphabet("ab|"), /Invalid random_slug_alphabet character/);
}

{
  const alphabet = "ab";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slug = randomSlug(4, alphabet);
    assert.equal(slug.length, 4);
    assert.match(slug, /^[ab]{4}$/);
  }
}

{
  const slug = randomSlug(3, DEFAULT_RANDOM_SLUG_ALPHABET);
  assert.equal(slug.length, 3);
  for (const character of slug) {
    assert.ok(DEFAULT_RANDOM_SLUG_ALPHABET.includes(character), `${character} should be in the default alphabet`);
  }
}

console.log("slug tests ok");
